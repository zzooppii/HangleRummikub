import { createHash } from "node:crypto";
import * as v from "valibot";
import { GameRevisionSchema, RoomIdSchema, RoomRevisionSchema, SpaceCrewClientCommandSchema, SpaceCrewStartCommandSchema,
  type SpaceCrewClientCommand, type SpaceCrewStartCommand, type ErrorDto, type RoomId, type PlayerId, type RequestId, type ServerTime } from "@hangul-rummikub/shared";
import { GameStartSuccessDataSchema, type StartGameInput, type GameStartResult, type CurrentActorAuthorization } from "../../../application/game-start-service.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import type { RoomMutationSerialExecutor } from "../../../application/room-session-service.js";
import type { SpaceCrewRoomRecord } from "../../../model/persistence.js";
import type { RoomRepository } from "../../../ports/room-repository.js";
import type { RoomUnitOfWork } from "../../../ports/room-unit-of-work.js";
import type { IdempotencyRepository } from "../../../ports/idempotency-repository.js";
import type { RoomPresencePolicyReader } from "../../../ports/room-presence-policy.js";
import type { Clock, IdGenerator, RandomSource } from "../../../ports/system.js";
import { createSpaceCrewDeck, shuffleSpaceCrewCards } from "../domain/cards.js";
import { createSpaceCrewTaskDeck, shuffleSpaceCrewTaskDeck } from "../domain/missions.js";
import { applySpaceCrewMissionAction, createSpaceCrewMissionState, type SpaceCrewMissionState } from "../domain/mission.js";
import { advanceSpaceCrewCampaign, beginSpaceCrewCampaignAttempt, claimSpaceCrewCampaign, createSpaceCrewCampaign,
  finishSpaceCrewCampaignAttempt, projectSpaceCrewCampaign, recordSpaceCrewCampaignDistress,
  selectSpaceCrewPracticeMission, spaceCrewCampaignDistress,
  type SpaceCrewCampaignCheckpoint, type SpaceCrewCampaignError, type SpaceCrewCampaignTransition } from "../domain/campaign.js";
import type { SpaceCrewCampaignRepository, SpaceCrewCampaignOperation, SpaceCrewCampaignTransaction } from "../ports/campaign-repository.js";
import { campaignIdForRecoveryToken } from "../infrastructure/campaign-credentials.js";
import { SpaceCrewGameStateAdapter, spaceCrewGameIsFinished, type SpaceCrewGameState, type SpaceCrewStoredGame } from "../compatibility/adapter.js";
import { SpaceCrewCampaignFinalizer } from "./campaign-finalization.js";

export type SpaceCrewDependencies = Readonly<{
  roomRepository: RoomRepository; roomUnitOfWork: RoomUnitOfWork; idempotencyRepository: IdempotencyRepository;
  roomMutationExecutor: RoomMutationSerialExecutor; presence: RoomPresencePolicyReader; clock: Clock; ids: IdGenerator;
  random: RandomSource; campaigns: SpaceCrewCampaignRepository; processId: string;
}>;
type ActorInput = Readonly<{ roomId: RoomId; actorPlayerId: PlayerId; receivedAt: ServerTime; authorization: CurrentActorAuthorization }>;
type Result = { ok: true } | { ok: false; error: ErrorDto };
type Candidate = Omit<SpaceCrewRoomRecord, "storageRevision">;
const Receipt = v.strictObject({ outcome: v.literal("ACCEPTED") });
const failure = (code: ErrorDto["code"], message = "현재 단계와 연결 상태를 확인해주세요.") => ({ ok: false as const, error: { code, message, recoverable: true } });
const hash = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const scopeFor = (roomId: RoomId, actor: PlayerId) => `room-player:${roomId}:${actor}`;
const durableRequestId = (roomId: RoomId, actor: PlayerId, requestId: RequestId) => hash([roomId, actor, requestId]);
const campaignFailure = (reason: SpaceCrewCampaignError) => failure(reason === "IDEMPOTENCY_CONFLICT" ? "REQUEST_ID_REUSED"
  : reason === "STORAGE_UNAVAILABLE" || reason === "REVISION_EXHAUSTED" ? "INTERNAL_ERROR"
    : reason === "STALE_REVISION" ? "STALE_GAME_REVISION" : "RULE_VIOLATION", "캠페인의 현재 상태와 복구 정보를 확인해주세요.");

export function transitionSpaceCrew(room: SpaceCrewRoomRecord, state: SpaceCrewGameState, at: ServerTime): Candidate {
  if (!room.game) throw new Error("Missing Space Crew game.");
  const phase = spaceCrewGameIsFinished(state) ? "FINISHED" : "PLAYING";
  const game = new SpaceCrewGameStateAdapter().cloneAndValidate({ ...room.game, state,
    gameRevision: v.parse(GameRevisionSchema, state.revision), finishedAt: phase === "FINISHED" ? room.game.finishedAt ?? at : null });
  return { ...room, game, phase, updatedAt: at, roomRevision: phase === room.phase ? room.roomRevision : v.parse(RoomRevisionSchema, room.roomRevision + 1) };
}

type Pending = {
  actor: PlayerId; requestId: RequestId; fingerprint: string; game: SpaceCrewStoredGame;
  baseGameId: string | null; baseRevision: number | null; start: boolean;
  transaction: { request: SpaceCrewCampaignTransaction; checkpoint: SpaceCrewCampaignCheckpoint } | null;
};

export class SpaceCrewService {
  private readonly listeners = new Set<(roomId: RoomId) => void | Promise<void>>();
  // Retain exact candidates before durable I/O, including uncertain acknowledgements.
  // A restart intentionally discards hands; recovery interrupts the saved active attempt.
  private readonly pending = new Map<RoomId, Pending>();
  private readonly rollbackRevisions = new Map<string, { aliases: Set<number>; current: number }>();
  private readonly finalizer: SpaceCrewCampaignFinalizer;
  constructor(readonly deps: SpaceCrewDependencies) {
    this.finalizer = new SpaceCrewCampaignFinalizer({ ...deps, rolledBack: (roomId, before, after) => {
      const existing = this.rollbackRevisions.get(after.campaignId);
      const aliases = new Set(existing?.aliases ?? []); aliases.add(before.revision);
      this.rollbackRevisions.set(after.campaignId, { aliases, current: after.revision });
      const pending = this.pending.get(roomId);
      if (pending && pending.game.state.campaign.campaignId === after.campaignId) {
        pending.game = { ...pending.game, state: { ...pending.game.state, campaign: projectSpaceCrewCampaign(after) } };
      }
    } });
  }
  startMaintenance(): void { this.finalizer.start(); }
  stopMaintenance(): void { this.finalizer.stop(); }
  subscribe(listener: (roomId: RoomId) => void | Promise<void>) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  async notify(roomId: RoomId): Promise<void> { await Promise.allSettled([...this.listeners].map(listener => Promise.resolve().then(() => listener(roomId)))); }
  async start(_input: StartGameInput): Promise<GameStartResult> { return failure("RULE_VIOLATION", "캠페인 시작·복구 또는 연습 미션을 선택해주세요."); }

  private deal(checkpoint: SpaceCrewCampaignCheckpoint, room: SpaceCrewRoomRecord): SpaceCrewMissionState {
    const d = this.deps, attachment = projectSpaceCrewCampaign(checkpoint);
    return createSpaceCrewMissionState({ missionNumber: checkpoint.missionNumber, playerIds: room.players.map(player => player.playerId),
      deck: shuffleSpaceCrewCards(createSpaceCrewDeck(() => d.ids.generateTileId()), d.random),
      taskDeck: shuffleSpaceCrewTaskDeck(createSpaceCrewTaskDeck(() => d.ids.generateTileId()), d.random),
      attemptNumber: attachment.actualAttempts, previousDistress: spaceCrewCampaignDistress(checkpoint) });
  }

  private async room(input: ActorInput): Promise<SpaceCrewRoomRecord | null> {
    const room = await this.deps.roomRepository.findById(input.roomId);
    return room?.gameType === "SPACE_CREW" && !room.departedPlayerIds?.includes(input.actorPlayerId)
      && room.players.some(player => player.playerId === input.actorPlayerId) ? room : null;
  }

  private pendingMatches(roomId: RoomId, actor: PlayerId, requestId: RequestId, fingerprint: string): boolean {
    const pending = this.pending.get(roomId);
    return !pending || pending.actor === actor && pending.requestId === requestId && pending.fingerprint === fingerprint;
  }

  private async commit(room: SpaceCrewRoomRecord, candidate: Candidate, input: ActorInput, requestId: RequestId, fingerprint: string,
    start: boolean, isCurrent: () => boolean): Promise<Result> {
    const data = start ? this.startData(candidate) : { outcome: "ACCEPTED" };
    const result = await this.deps.roomUnitOfWork.commit({
      roomMutation: { kind: "REPLACE", candidate, expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision },
      sessionMutation: { kind: "NONE" }, idempotency: { scopeKey: scopeFor(room.roomId, input.actorPlayerId), requestId, payloadFingerprint: fingerprint, terminalResult: data, createdAt: this.deps.clock.now() },
    }, { isSatisfied: () => input.authorization.isCurrent() && isCurrent() });
    if (result.status !== "COMMITTED") return failure(input.authorization.isCurrent() ? "STALE_GAME_REVISION" : "UNAUTHENTICATED");
    this.pending.delete(room.roomId);
    return { ok: true };
  }

  private startData(candidate: Candidate) {
    if (!candidate.game) throw new Error("Missing Space Crew candidate.");
    return v.parse(GameStartSuccessDataSchema, { roomId: candidate.roomId, roomRevision: candidate.roomRevision,
      gameId: candidate.game.gameId, gameRevision: candidate.game.gameRevision, turnId: candidate.game.state.attemptId });
  }

  private async pendingCandidate(room: SpaceCrewRoomRecord): Promise<Candidate | null> {
    const pending = this.pending.get(room.roomId);
    if (!pending || (room.game?.gameId ?? null) !== pending.baseGameId || (room.game?.gameRevision ?? null) !== pending.baseRevision
      || room.players.length !== pending.game.state.mission.trick.players.length
      || room.players.some((player, index) => player.playerId !== pending.game.state.mission.trick.players[index]?.playerId)
      || room.departedPlayerIds?.length) return null;
    if (pending.transaction) {
      const transaction = pending.transaction;
      const saved = await this.deps.campaigns.transact(transaction.request, () => ({ ok: true, checkpoint: transaction.checkpoint }));
      if (!saved.ok) throw new Error("Space Crew durable candidate is pending.");
      pending.game = { ...pending.game, state: { ...pending.game.state, campaign: saved.attachment } };
      pending.transaction = null;
    }
    const checkpoint = await this.deps.campaigns.read(pending.game.state.campaign.campaignId);
    if (!checkpoint || checkpoint.lease.processId !== this.deps.processId || checkpoint.lease.roomId !== room.roomId
      || checkpoint.revision !== pending.game.state.campaign.revision) throw new Error("Space Crew durable candidate lost its lease.");
    const phase = spaceCrewGameIsFinished(pending.game.state) ? "FINISHED" : "PLAYING";
    return { ...room, game: pending.game, phase, updatedAt: this.deps.clock.now(),
      roomRevision: phase === room.phase ? room.roomRevision : v.parse(RoomRevisionSchema, room.roomRevision + 1) };
  }

  private remember(room: SpaceCrewRoomRecord, game: SpaceCrewStoredGame, actor: PlayerId, requestId: RequestId, fingerprint: string, start: boolean,
    transaction: Pending["transaction"] = null): void {
    this.pending.set(room.roomId, { actor, requestId, fingerprint, game, baseGameId: room.game?.gameId ?? null, baseRevision: room.game?.gameRevision ?? null, start, transaction });
  }

  private async campaignReserved(checkpoint: SpaceCrewCampaignCheckpoint): Promise<boolean> {
    if (checkpoint.lease.processId !== this.deps.processId) return false;
    const roomId = v.parse(RoomIdSchema, checkpoint.lease.roomId);
    const owner = await this.deps.roomRepository.findById(roomId);
    if (!owner) { this.pending.delete(roomId); return false; }
    if (checkpoint.pendingInterruption) return true;
    return this.pending.get(roomId)?.game.state.campaign.campaignId === checkpoint.campaignId;
  }

  private async takeoverAllowed(checkpoint: SpaceCrewCampaignCheckpoint): Promise<boolean> {
    if (checkpoint.lease.processId !== this.deps.processId) return true;
    if (await this.campaignReserved(checkpoint)) return false;
    const owner = await this.deps.roomRepository.findById(v.parse(RoomIdSchema, checkpoint.lease.roomId));
    if (checkpoint.pendingInterruption && owner) return false;
    return owner?.gameType !== "SPACE_CREW" || owner.phase !== "PLAYING" || owner.game?.state.campaign.campaignId !== checkpoint.campaignId;
  }

  private checkpointMatches(checkpoint: SpaceCrewCampaignCheckpoint, state: SpaceCrewGameState): boolean {
    if (checkpoint.revision === state.campaign.revision) return true;
    const rolledBack = this.rollbackRevisions.get(checkpoint.campaignId);
    return rolledBack?.current === checkpoint.revision && rolledBack.aliases.has(state.campaign.revision)
      && hash({ ...projectSpaceCrewCampaign(checkpoint), revision: 0 }) === hash({ ...state.campaign, revision: 0 });
  }

  async startConfigured(input: ActorInput & Readonly<{ command: SpaceCrewStartCommand }>): Promise<GameStartResult> {
    const parsed = v.safeParse(SpaceCrewStartCommandSchema, input.command);
    if (!parsed.success) return failure("INVALID_PAYLOAD");
    const command = parsed.output, fingerprint = hash(command), d = this.deps;
    try {
      return await d.roomMutationExecutor.run(input.roomId, async (): Promise<GameStartResult> => {
        if (!input.authorization.isCurrent()) return failure("UNAUTHENTICATED");
        if (!await this.finalizer.flush(input.roomId)) return failure("INTERNAL_ERROR");
        const room = await this.room(input); if (!room) return failure("INVALID_PHASE");
        const prior = await d.idempotencyRepository.classify(scopeFor(room.roomId, input.actorPlayerId), command.requestId, fingerprint);
        if (prior.status === "CONFLICT") return failure("REQUEST_ID_REUSED");
        if (prior.status === "REPLAY") return { ok: true, data: v.parse(GameStartSuccessDataSchema, prior.record.terminalResult) };
        if (!this.pendingMatches(room.roomId, input.actorPlayerId, command.requestId, fingerprint)) return failure("RULE_VIOLATION", "저장 중인 이전 요청을 다시 확인해주세요.");
        if (room.phase !== "LOBBY" || room.game !== null) return failure("INVALID_PHASE");
        if (room.hostPlayerId !== input.actorPlayerId) return failure("HOST_ONLY");
        if (room.roomRevision !== command.expectedRoomRevision) return failure("STALE_ROOM_REVISION");
        if (room.players.length < 3 || room.players.length > 5) return failure("NOT_ENOUGH_PLAYERS", "스페이스 크루는 3–5명이 함께 플레이합니다.");
        const presence = await d.presence.acquireRoomPresenceLease(room.roomId);
        if (!presence.isCurrent() || !room.players.every(player => presence.connectionStatusByPlayerId.get(player.playerId) === "CONNECTED")) return failure("PLAYERS_NOT_CONNECTED");
        let candidate = await this.pendingCandidate(room);
        if (!candidate && this.pending.has(room.roomId)) return failure("STALE_GAME_REVISION");
        if (!candidate) {
          const payload = command.payload;
          const campaignId = payload.kind === "NEW" ? campaignIdForRecoveryToken(payload.recoveryToken) : payload.campaignId;
          const current = await d.campaigns.read(campaignId);
          if (current && await this.campaignReserved(current)) return failure("RULE_VIOLATION", "이 캠페인의 이전 저장 요청을 먼저 완료해주세요.");
          const now = d.clock.now(), gameId = d.ids.generateGameId(), attemptId = d.ids.generateTurnId();
          const takeover = current !== null && await this.takeoverAllowed(current);
          const transaction: SpaceCrewCampaignTransaction = { campaignId, expectedRevision: payload.kind === "NEW" ? null : current?.revision ?? null,
            requestId: durableRequestId(room.roomId, input.actorPlayerId, command.requestId), fingerprint,
            operation: payload.kind === "NEW" ? "CREATE" : "RESUME", authorization: { kind: payload.kind === "NEW" ? "CREATE" : "RECOVER", recoveryToken: payload.recoveryToken } };
          const saved = await d.campaigns.transact(transaction, checkpoint => {
            let prepared: SpaceCrewCampaignTransition;
            if (payload.kind === "NEW") {
              if (checkpoint !== null) return { ok: false, reason: "INVALID_PHASE" };
              prepared = { ok: true, checkpoint: createSpaceCrewCampaign({ campaignId, mode: payload.mode,
                ...(payload.mode === "PRACTICE" ? { missionNumber: payload.missionNumber } : {}), processId: d.processId, roomId: room.roomId }) };
            } else {
              if (!checkpoint) return { ok: false, reason: "INVALID_CAMPAIGN" };
              prepared = claimSpaceCrewCampaign(checkpoint, { processId: d.processId, roomId: room.roomId, now, takeover });
              if (prepared.ok && prepared.checkpoint.mode === "CAMPAIGN" && prepared.checkpoint.completedMissions.includes(prepared.checkpoint.missionNumber)) {
                prepared = advanceSpaceCrewCampaign(prepared.checkpoint);
              } else if (prepared.ok && prepared.checkpoint.mode === "PRACTICE" && prepared.checkpoint.status === "COMPLETED") {
                prepared = selectSpaceCrewPracticeMission(prepared.checkpoint, { missionNumber: prepared.checkpoint.missionNumber });
              }
            }
            if (!prepared.ok) return prepared;
            const begun = beginSpaceCrewCampaignAttempt(prepared.checkpoint, { attemptId, now });
            if (begun.ok) {
              const mission = this.deal(begun.checkpoint, room);
              const projected = { ...begun.checkpoint, revision: transaction.expectedRevision === null ? 0 : transaction.expectedRevision + 1 };
              const state: SpaceCrewGameState = { revision: 0, mode: begun.checkpoint.mode, attemptId, mission, cancelled: false, campaign: projectSpaceCrewCampaign(projected) };
              const game = new SpaceCrewGameStateAdapter().cloneAndValidate({ gameId, gameRevision: v.parse(GameRevisionSchema, 0), startedAt: now, finishedAt: null, state });
              // Keep the exact shuffled candidate even if rename succeeded but its acknowledgement failed.
              this.remember(room, game, input.actorPlayerId, command.requestId, fingerprint, true, { request: transaction, checkpoint: begun.checkpoint });
            }
            return begun;
          });
          if (!saved.ok) {
            if (saved.reason !== "STORAGE_UNAVAILABLE") this.pending.delete(room.roomId);
            return campaignFailure(saved.reason);
          }
          const pending = this.pending.get(room.roomId);
          if (!pending) return failure("RULE_VIOLATION", "저장된 캠페인을 복구하여 새 시도를 시작해주세요.");
          pending.game = { ...pending.game, state: { ...pending.game.state, campaign: saved.attachment } }; pending.transaction = null;
          candidate = await this.pendingCandidate(room);
        }
        if (!candidate) return failure("INTERNAL_ERROR");
        const committed = await this.commit(room, candidate, input, command.requestId, fingerprint, true, () => presence.isCurrent());
        return committed.ok ? { ok: true, data: this.startData(candidate) } : committed;
      });
    } catch { return failure("INTERNAL_ERROR"); }
  }

  async command(input: ActorInput & Readonly<{ command: SpaceCrewClientCommand }>): Promise<Result> {
    const parsed = v.safeParse(SpaceCrewClientCommandSchema, input.command);
    if (!parsed.success) return failure("INVALID_PAYLOAD");
    const command = parsed.output, fingerprint = hash(command), d = this.deps; let changed = false;
    try {
      const result = await d.roomMutationExecutor.run(input.roomId, async (): Promise<Result> => {
        if (!input.authorization.isCurrent()) return failure("UNAUTHENTICATED");
        if (!await this.finalizer.flush(input.roomId)) return failure("INTERNAL_ERROR");
        const room = await this.room(input); if (!room) return failure("INVALID_PHASE");
        const prior = await d.idempotencyRepository.classify(scopeFor(room.roomId, input.actorPlayerId), command.requestId, fingerprint);
        if (prior.status === "CONFLICT") return failure("REQUEST_ID_REUSED");
        if (prior.status === "REPLAY") { v.parse(Receipt, prior.record.terminalResult); return { ok: true }; }
        if (!this.pendingMatches(room.roomId, input.actorPlayerId, command.requestId, fingerprint)) return failure("RULE_VIOLATION", "저장 중인 이전 요청을 다시 확인해주세요.");
        const game = room.game;
        if (!game || game.gameId !== command.gameId || game.gameRevision !== command.expectedGameRevision || game.state.attemptId !== command.attemptId) return failure("STALE_GAME_REVISION");
        if (game.state.revision === Number.MAX_SAFE_INTEGER) return failure("INTERNAL_ERROR");
        let presenceCurrent = () => true;
        if (command.kind !== "spaceCrew:act") {
          if (room.hostPlayerId !== input.actorPlayerId) return failure("HOST_ONLY");
          if (room.phase !== "FINISHED" || game.state.cancelled || room.departedPlayerIds?.length) return failure("INVALID_PHASE");
          if (room.players.length !== game.state.mission.trick.players.length || room.players.some((player, index) => player.playerId !== game.state.mission.trick.players[index]?.playerId)) return failure("INVALID_PHASE");
          const presence = await d.presence.acquireRoomPresenceLease(room.roomId);
          if (!presence.isCurrent() || !room.players.every(player => presence.connectionStatusByPlayerId.get(player.playerId) === "CONNECTED")) return failure("PLAYERS_NOT_CONNECTED");
          presenceCurrent = () => presence.isCurrent();
        } else if (room.phase !== "PLAYING") return failure("INVALID_PHASE");
        let candidate = await this.pendingCandidate(room);
        if (!candidate && this.pending.has(room.roomId)) return failure("STALE_GAME_REVISION");
        if (!candidate) {
          const now = d.clock.now(); let state: SpaceCrewGameState;
          const checkpoint = await d.campaigns.read(game.state.campaign.campaignId);
          if (!checkpoint || !this.checkpointMatches(checkpoint, game.state) || checkpoint.lease.processId !== d.processId || checkpoint.lease.roomId !== room.roomId) return failure("STALE_GAME_REVISION");
          let operation: SpaceCrewCampaignOperation | null = null;
          let prepare: ((current: SpaceCrewCampaignCheckpoint) => SpaceCrewCampaignTransition) | null = null;
          if (command.kind === "spaceCrew:act") {
            const applied = applySpaceCrewMissionAction(game.state.mission, input.actorPlayerId, { ...command.payload, expectedRevision: game.state.mission.revision }, d.random);
            if (!applied.ok) return failure(applied.reason === "INVALID_RANDOM" || applied.reason === "INVALID_STATE" ? "INTERNAL_ERROR"
              : applied.reason === "NOT_YOUR_TURN" ? "NOT_YOUR_TURN" : applied.reason === "INVALID_PHASE" ? "INVALID_PHASE" : "RULE_VIOLATION");
            state = { ...game.state, revision: game.state.revision + 1, mission: applied.state, campaign: projectSpaceCrewCampaign(checkpoint) };
            const helpChanged = JSON.stringify(applied.state.distress.history) !== JSON.stringify(game.state.mission.distress.history);
            if (helpChanged || spaceCrewGameIsFinished(state)) {
              operation = spaceCrewGameIsFinished(state) ? "RESULT" : "DISTRESS";
              const mission = applied.state;
              prepare = current => {
                const help = recordSpaceCrewCampaignDistress(current, { attemptId: game.state.attemptId, active: mission.distress.active, history: mission.distress.history });
                if (!help.ok || mission.status !== "SUCCESS" && mission.status !== "FAILURE") return help;
                return finishSpaceCrewCampaignAttempt(help.checkpoint, { attemptId: game.state.attemptId, now, outcome: mission.status,
                  reason: mission.failure === null ? "SUCCESS" : mission.failure.kind === "EXHAUSTED" ? "OBJECTIVE_NOT_MET" : mission.failure.reason,
                  completedTaskCount: mission.tasks.completedOrder.length, totalTaskCount: mission.tasks.tasks.length });
              };
            }
          } else {
            if (command.kind === "spaceCrew:retry" && game.state.mission.status !== "FAILURE"
              || command.kind === "spaceCrew:next" && (game.state.mode !== "CAMPAIGN" || game.state.mission.status !== "SUCCESS")
              || command.kind === "spaceCrew:practiceMission" && game.state.mode !== "PRACTICE") return failure("INVALID_PHASE");
            const attemptId = d.ids.generateTurnId();
            let prepared = claimSpaceCrewCampaign(checkpoint, { processId: d.processId, roomId: room.roomId, now });
            if (prepared.ok && command.kind === "spaceCrew:next") prepared = advanceSpaceCrewCampaign(prepared.checkpoint);
            if (prepared.ok && command.kind === "spaceCrew:practiceMission") prepared = selectSpaceCrewPracticeMission(prepared.checkpoint, { missionNumber: command.payload.missionNumber });
            if (prepared.ok) prepared = beginSpaceCrewCampaignAttempt(prepared.checkpoint, { attemptId, now });
            if (!prepared.ok) return campaignFailure(prepared.reason);
            state = { ...game.state, revision: game.state.revision + 1, attemptId, mission: this.deal(prepared.checkpoint, room), cancelled: false };
            operation = command.kind === "spaceCrew:retry" ? "BEGIN_ATTEMPT" : command.kind === "spaceCrew:practiceMission" ? "SELECT_PRACTICE" : "NEXT_MISSION";
            const next = prepared.checkpoint; prepare = () => ({ ok: true, checkpoint: next });
          }
          if (operation !== null && prepare !== null) {
            const transition = prepare;
            const transaction: SpaceCrewCampaignTransaction = { campaignId: checkpoint.campaignId, expectedRevision: checkpoint.revision,
              requestId: durableRequestId(room.roomId, input.actorPlayerId, command.requestId), fingerprint, operation,
              authorization: { kind: "LEASE", processId: d.processId, roomId: room.roomId, generation: checkpoint.lease.generation } };
            const prepared = transition(checkpoint);
            if (!prepared.ok) return campaignFailure(prepared.reason);
            state = { ...state, campaign: projectSpaceCrewCampaign({ ...prepared.checkpoint, revision: checkpoint.revision + 1 }) };
            const draft = transitionSpaceCrew(room, state, now);
            if (!draft.game) return failure("INTERNAL_ERROR");
            this.remember(room, draft.game, input.actorPlayerId, command.requestId, fingerprint, false, { request: transaction, checkpoint: prepared.checkpoint });
            const saved = await d.campaigns.transact(transaction, () => prepared);
            if (!saved.ok) {
            if (saved.reason !== "STORAGE_UNAVAILABLE") this.pending.delete(room.roomId);
            return campaignFailure(saved.reason);
          }
            state = { ...state, campaign: saved.attachment };
          }
          candidate = transitionSpaceCrew(room, state, now);
          if (candidate.game) this.remember(room, candidate.game, input.actorPlayerId, command.requestId, fingerprint, false);
        }
        const committed = await this.commit(room, candidate, input, command.requestId, fingerprint, false, presenceCurrent);
        changed = committed.ok; return committed;
      });
      if (changed) await this.notify(input.roomId);
      return result;
    } catch { return failure("INTERNAL_ERROR"); }
  }

  /** Called inside the existing room lane before RoomLeaveService commits its session/room changes. */
  async preparePlayingLeave(input: Readonly<{ room: SpaceCrewRoomRecord; actorPlayerId: PlayerId; occurredAt: ServerTime; requestId: RequestId; authorization: CurrentActorAuthorization }>): Promise<{ result: PlayingLeaveActionResult; finalize(committed: boolean): Promise<void> }> {
    const { room } = input, game = (await this.pendingCandidate(room))?.game ?? room.game;
    if (!game || !input.authorization.isCurrent()) throw new Error("Space Crew leave authorization is stale.");
    const source = { ...room, game, phase: spaceCrewGameIsFinished(game.state) ? "FINISHED" as const : room.phase };
    const prepared = await this.finalizer.prepare(source, durableRequestId(room.roomId, input.actorPlayerId, input.requestId), input.occurredAt);
    try {
      if (room.phase === "LOBBY") return { result: { candidate: room, advisory: "NONE", finishedGameId: null, nextTurnIdentity: null },
        finalize: async committed => { await prepared.finalize(committed); if (committed) this.pending.delete(room.roomId); } };
      const state: SpaceCrewGameState = { ...game.state, revision: game.state.revision + Number(source.phase === "PLAYING"),
        cancelled: game.state.cancelled || source.phase === "PLAYING", campaign: prepared.attachment ?? game.state.campaign };
      return { result: { candidate: transitionSpaceCrew({ ...room, game }, state, input.occurredAt), advisory: "NONE", finishedGameId: game.gameId, nextTurnIdentity: null },
        finalize: async committed => { await prepared.finalize(committed); if (committed) this.pending.delete(room.roomId); } };
    } catch (error) { await prepared.finalize(false); throw error; }
  }

  async prepareRoomCleanup(room: SpaceCrewRoomRecord): Promise<{ finalize(committed: boolean): Promise<void> }> {
    const pending = await this.pendingCandidate(room);
    const source: SpaceCrewRoomRecord = pending ? { ...room, ...pending, storageRevision: room.storageRevision } : room;
    const prepared = await this.finalizer.prepare(source, hash(["room:cleanup", room.roomId, room.storageRevision]), this.deps.clock.now());
    return { finalize: async committed => { await prepared.finalize(committed); if (committed) this.pending.delete(room.roomId); } };
  }
}
