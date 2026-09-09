import { GameRevisionSchema, RoomRevisionSchema, ServerTimeSchema, TurnIdSchema, RequestIdSchema,
  type SneakyClientCommand, type ErrorDto, type RoomId, type PlayerId, type ServerTime } from "@hangul-rummikub/shared";
import * as v from "valibot";
import { GameStartSuccessDataSchema, type StartGameInput, type GameStartResult } from "../../../application/game-start-service.js";
import type { RoomMutationSerialExecutor } from "../../../application/room-session-service.js";
import type { RoomRepository } from "../../../ports/room-repository.js";
import type { RoomUnitOfWork } from "../../../ports/room-unit-of-work.js";
import type { IdempotencyRepository } from "../../../ports/idempotency-repository.js";
import type { RoomPresencePolicyReader } from "../../../ports/room-presence-policy.js";
import type { Clock, IdGenerator, RandomSource, TurnScheduler, ScheduledTurnDeadline } from "../../../ports/system.js";
import type { SneakyLunchRoomRecord } from "../../../model/persistence.js";
import { createSneakyLunch, eatLunch, nextTeacherState, planTeacher, transitionTeacher, type SneakyLunchState } from "../domain/game.js";

export type SneakyDependencies = Readonly<{ roomRepository: RoomRepository; roomUnitOfWork: RoomUnitOfWork; idempotencyRepository: IdempotencyRepository;
  roomMutationExecutor: RoomMutationSerialExecutor; presence: RoomPresencePolicyReader; clock: Clock; ids: IdGenerator; random: RandomSource; turnScheduler: TurnScheduler }>;
const failure = (code: ErrorDto["code"]) => ({ ok: false as const, error: { code, message: "현재 교실 상태와 연결을 확인해주세요.", recoverable: true } });
const Receipt = v.strictObject({ outcome: v.picklist(["ACCEPTED", "CAUGHT", "RATE_LIMITED", "STALE", "NOT_ACTIVE", "INVALID_PHASE", "CONFIGURED", "REMATCHED"]) });
const receiptResult = (value: unknown) => {
  const receipt = v.parse(Receipt, value);
  if (receipt.outcome === "STALE") return failure("STALE_GAME_REVISION");
  if (receipt.outcome === "NOT_ACTIVE" || receipt.outcome === "INVALID_PHASE") return failure("INVALID_PHASE");
  return { ok: true as const, outcome: receipt.outcome };
};
export function transitionSneaky(room: SneakyLunchRoomRecord, state: SneakyLunchState, at: ServerTime): Omit<SneakyLunchRoomRecord, "storageRevision"> {
  if (!room.game) throw new Error("Missing SNEAKY game.");
  const phase = state.phase === "FINISHED" ? "FINISHED" : "PLAYING";
  return { ...room, phase, game: { ...room.game, state, gameRevision: v.parse(GameRevisionSchema, state.revision), finishedAt: state.finishedAt === null ? null : v.parse(ServerTimeSchema, state.finishedAt) },
    roomRevision: phase === room.phase ? room.roomRevision : v.parse(RoomRevisionSchema, room.roomRevision + 1), updatedAt: at };
}
export class SneakyLunchService {
  private readonly listeners = new Set<(roomId: RoomId) => void | Promise<void>>();
  constructor(readonly deps: SneakyDependencies) {}
  subscribe(listener: (roomId: RoomId) => void | Promise<void>) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  async notify(roomId: RoomId) { await Promise.allSettled([...this.listeners].map(fn => Promise.resolve().then(() => fn(roomId)))); }
  async schedule(roomId: RoomId) {
    const room = await this.deps.roomRepository.findById(roomId);
    if (room?.gameType !== "SNEAKY_LUNCH" || !room.game || room.phase !== "PLAYING" || room.game.state.nextTransitionAt === null) return;
    await this.deps.turnScheduler.scheduleTimeout({ roomId, gameId: room.game.gameId, expectedGameRevision: room.game.gameRevision,
      turnId: v.parse(TurnIdSchema, room.game.state.transitionId), deadlineAt: v.parse(ServerTimeSchema, room.game.state.nextTransitionAt) });
  }
  async start(input: StartGameInput): Promise<GameStartResult> {
    const d = this.deps;
    try {
      const result = await d.roomMutationExecutor.run(input.roomId, async (): Promise<GameStartResult> => {
        if (!input.authorization.isCurrent()) return failure("UNAUTHENTICATED");
        const room = await d.roomRepository.findById(input.roomId);
        if (room?.gameType !== "SNEAKY_LUNCH") return failure("INVALID_PHASE");
        const scopeKey = `room-player:${room.roomId}:${input.actorPlayerId}`, payloadFingerprint = JSON.stringify(["game:start", input.expectedRoomRevision]);
        const prior = await d.idempotencyRepository.classify(scopeKey, input.requestId, payloadFingerprint);
        if (prior.status === "CONFLICT") return failure("REQUEST_ID_REUSED");
        if (prior.status === "REPLAY") return { ok: true, data: v.parse(GameStartSuccessDataSchema, prior.record.terminalResult) };
        if (room.phase !== "LOBBY" || room.game !== null) return failure("INVALID_PHASE");
        if (room.hostPlayerId !== input.actorPlayerId) return failure("HOST_ONLY");
        if (room.roomRevision !== input.expectedRoomRevision) return failure("STALE_ROOM_REVISION");
        if (room.players.length < 2) return failure("NOT_ENOUGH_PLAYERS");
        if (room.players.length > 8) return failure("INVALID_PHASE");
        const lease = await d.presence.acquireRoomPresenceLease(room.roomId);
        if (!lease.isCurrent() || !room.players.every(p => lease.connectionStatusByPlayerId.get(p.playerId) === "CONNECTED")) return failure("PLAYERS_NOT_CONNECTED");
        const now = d.clock.now(), gameId = d.ids.generateGameId(), turnId = d.ids.generateTurnId();
        const state = createSneakyLunch({ gameId, playerIds: [...room.players].sort((a, b) => a.joinOrder - b.joinOrder).map(p => p.playerId),
          settings: room.settings ?? { lunchboxCount: 3, difficulty: "NORMAL" }, now, transitionId: turnId });
        const roomRevision = v.parse(RoomRevisionSchema, room.roomRevision + 1), gameRevision = v.parse(GameRevisionSchema, 0);
        const data = v.parse(GameStartSuccessDataSchema, { roomId: room.roomId, roomRevision, gameId, gameRevision, turnId });
        const committed = await d.roomUnitOfWork.commit({ roomMutation: { kind: "REPLACE", candidate: { ...room, phase: "PLAYING", roomRevision, updatedAt: now,
          game: { gameId, gameRevision, startedAt: now, finishedAt: null, state } }, expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision },
          sessionMutation: { kind: "NONE" }, idempotency: { scopeKey, requestId: input.requestId, payloadFingerprint, terminalResult: data, createdAt: now } },
          { isSatisfied: () => input.authorization.isCurrent() && lease.isCurrent() });
        return committed.status === "COMMITTED" ? { ok: true, data } : failure("STALE_ROOM_REVISION");
      });
      if (result.ok) await this.schedule(input.roomId);
      return result;
    } catch { return failure("INTERNAL_ERROR"); }
  }
  async command(input: Readonly<{ roomId: RoomId; actorPlayerId: PlayerId; command: SneakyClientCommand; receivedAt: ServerTime; authorization: { isCurrent(): boolean } }>) {
    const d = this.deps, c = input.command;
    let changed = false;
    try {
      const result = await d.roomMutationExecutor.run(input.roomId, async () => {
        if (!input.authorization.isCurrent()) return failure("UNAUTHENTICATED");
        const room = await d.roomRepository.findById(input.roomId);
        if (room?.gameType !== "SNEAKY_LUNCH" || room.departedPlayerIds?.includes(input.actorPlayerId) || !room.players.some(p => p.playerId === input.actorPlayerId)) return failure("INVALID_PHASE");
        const scopeKey = `room-player:${room.roomId}:${input.actorPlayerId}`, payloadFingerprint = JSON.stringify(c);
        const prior = await d.idempotencyRepository.classify(scopeKey, c.requestId, payloadFingerprint);
        if (prior.status === "CONFLICT") return failure("REQUEST_ID_REUSED");
        if (prior.status === "REPLAY") return receiptResult(prior.record.terminalResult);
        const now = d.clock.now(); let candidate: Omit<SneakyLunchRoomRecord, "storageRevision"> = room;
        let outcome: v.InferOutput<typeof Receipt>["outcome"];
        if (c.kind === "sneaky:configure") {
          if (room.phase !== "LOBBY") return failure("INVALID_PHASE");
          if (room.hostPlayerId !== input.actorPlayerId) return failure("HOST_ONLY");
          if (room.roomRevision !== c.expectedRoomRevision) return failure("STALE_ROOM_REVISION");
          candidate = { ...room, settings: c.payload, roomRevision: v.parse(RoomRevisionSchema, room.roomRevision + 1), updatedAt: now }; outcome = "CONFIGURED";
        } else {
          if (!room.game || room.game.gameId !== c.gameId) return failure("STALE_GAME_REVISION");
          if (c.kind === "sneaky:rematch") {
            if (room.phase !== "FINISHED") return failure("INVALID_PHASE");
            if (room.hostPlayerId !== input.actorPlayerId) return failure("HOST_ONLY");
            if (room.roomRevision !== c.expectedRoomRevision || room.game.gameRevision !== c.expectedGameRevision) return failure("STALE_ROOM_REVISION");
            candidate = { ...room, phase: "LOBBY", game: null, departedPlayerIds: [], players: room.players.filter(p => !room.departedPlayerIds?.includes(p.playerId)),
              roomRevision: v.parse(RoomRevisionSchema, room.roomRevision + 1), updatedAt: now }; outcome = "REMATCHED";
          } else {
            const eat = eatLunch(room.game.state, input.actorPlayerId, c.teacherStateRevision, input.receivedAt);
            outcome = eat.outcome;
            if (eat.state.revision !== room.game.gameRevision) candidate = transitionSneaky(room, eat.state, now);
          }
        }
        // A receipt-only write preserves gameplay/room revisions, including rate-limited and stale retries.
        const committed = await d.roomUnitOfWork.commit({ roomMutation: { kind: "REPLACE", candidate,
          expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision }, sessionMutation: { kind: "NONE" },
          idempotency: { scopeKey, requestId: c.requestId, payloadFingerprint, terminalResult: { outcome }, createdAt: now } }, { isSatisfied: () => input.authorization.isCurrent() });
        if (committed.status !== "COMMITTED") return failure("STALE_GAME_REVISION");
        changed = candidate !== room;
        if (room.game && (candidate.phase === "FINISHED" || candidate.game === null)) await d.turnScheduler.cancelTimeout(v.parse(TurnIdSchema, room.game.state.transitionId));
        return receiptResult({ outcome });
      });
      if (changed) await this.notify(input.roomId);
      return result;
    } catch { return failure("INTERNAL_ERROR"); }
  }
  async timeout(input: ScheduledTurnDeadline): Promise<{ status: "NO_OP" | "APPLIED" | "FAILED" }> {
    const d = this.deps;
    try {
      const applied = await d.roomMutationExecutor.run(input.roomId, async () => {
        const room = await d.roomRepository.findById(input.roomId), now = d.clock.now();
        if (room?.gameType !== "SNEAKY_LUNCH" || room.phase !== "PLAYING" || !room.game || room.game.gameId !== input.gameId ||
          room.game.state.transitionId !== input.turnId || room.game.state.nextTransitionAt !== input.deadlineAt || now < input.deadlineAt) return false;
        const previous = room.game.state;
        const plan = planTeacher(previous.settings.difficulty, nextTeacherState(previous), previous.consecutiveFakes,
          { duration: d.random.nextInt(10000), band: d.random.nextInt(10000), outcome: d.random.nextInt(10000) });
        const state = transitionTeacher(previous, input.turnId, now, d.ids.generateTurnId(), plan);
        const committed = await d.roomUnitOfWork.commit({ roomMutation: { kind: "REPLACE", candidate: transitionSneaky(room, state, now),
          expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision }, sessionMutation: { kind: "NONE" },
          idempotency: { scopeKey: `sneaky-timer:${room.roomId}:${room.game.gameId}`, requestId: v.parse(RequestIdSchema, `teacher:${input.turnId}`),
            payloadFingerprint: JSON.stringify([input.turnId, input.deadlineAt]), terminalResult: { transitioned: true }, createdAt: now } });
        return committed.status === "COMMITTED";
      });
      if (applied) { await d.turnScheduler.cancelTimeout(input.turnId); await this.schedule(input.roomId); await this.notify(input.roomId); }
      return { status: applied ? "APPLIED" : "NO_OP" };
    } catch { return { status: "FAILED" }; }
  }
}
