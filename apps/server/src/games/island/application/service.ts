import { GameRevisionSchema, RoomRevisionSchema, ServerTimeSchema, TurnIdSchema, RequestIdSchema,
  IslandClientCommandSchema, type IslandClientCommand, type ErrorDto, type RoomId, type PlayerId, type ServerTime } from "@hangul-rummikub/shared";
import * as v from "valibot";
import { GameStartSuccessDataSchema, type StartGameInput, type GameStartResult } from "../../../application/game-start-service.js";
import type { RoomMutationSerialExecutor } from "../../../application/room-session-service.js";
import type { RoomRepository } from "../../../ports/room-repository.js";
import type { RoomUnitOfWork } from "../../../ports/room-unit-of-work.js";
import type { IdempotencyRepository } from "../../../ports/idempotency-repository.js";
import type { RoomPresencePolicyReader } from "../../../ports/room-presence-policy.js";
import type { Clock, IdGenerator, RandomSource, TurnScheduler, ScheduledTurnDeadline } from "../../../ports/system.js";
import type { IslandRoomRecord } from "../../../model/persistence.js";
import { createIslandGame, actIsland, timeoutIsland, type IslandState } from "../domain/game.js";

export type IslandDependencies = Readonly<{ roomRepository: RoomRepository; roomUnitOfWork: RoomUnitOfWork; idempotencyRepository: IdempotencyRepository;
  roomMutationExecutor: RoomMutationSerialExecutor; presence: RoomPresencePolicyReader; clock: Clock; ids: IdGenerator; random: RandomSource; turnScheduler: TurnScheduler }>;
const failure = (code: ErrorDto["code"]) => ({ ok: false as const, error: { code, message: code === "STALE_GAME_REVISION" ? "보드가 갱신되었습니다. 현재 화면에서 다시 시도해주세요." : code === "NOT_YOUR_TURN" ? "이 행동은 현재 차례에만 할 수 있습니다." : "현재 단계, 자원과 선택한 위치를 확인해주세요.", recoverable: true } });
const Receipt = v.strictObject({ outcome: v.picklist(["ACCEPTED", "REMATCHED"]) });
const receiptResult = (value: unknown) => {
  const receipt = v.parse(Receipt, value);
  return { ok: true as const, outcome: receipt.outcome };
};
export function transitionIsland(room: IslandRoomRecord, state: IslandState, at: ServerTime): Omit<IslandRoomRecord, "storageRevision"> {
  if (!room.game) throw new Error("Missing ISLAND game.");
  const phase = state.phase === "FINISHED" ? "FINISHED" : "PLAYING";
  return { ...room, phase, game: { ...room.game, state, gameRevision: v.parse(GameRevisionSchema, state.revision), finishedAt: state.finishedAt === null ? null : v.parse(ServerTimeSchema, state.finishedAt) },
    roomRevision: phase === room.phase ? room.roomRevision : v.parse(RoomRevisionSchema, room.roomRevision + 1), updatedAt: at };
}
export class IslandService {
  private readonly listeners = new Set<(roomId: RoomId) => void | Promise<void>>();
  constructor(readonly deps: IslandDependencies) {}
  subscribe(listener: (roomId: RoomId) => void | Promise<void>) { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; }
  async notify(roomId: RoomId) { await Promise.allSettled([...this.listeners].map(fn => Promise.resolve().then(() => fn(roomId)))); }
  async schedule(roomId: RoomId) {
    try {
    const room = await this.deps.roomRepository.findById(roomId);
    if (room?.gameType !== "ISLAND_SETTLERS" || !room.game || room.phase !== "PLAYING" || room.game.state.deadlineAt === null) return;
    await this.deps.turnScheduler.scheduleTimeout({ roomId, gameId: room.game.gameId, expectedGameRevision: room.game.gameRevision,
      turnId: v.parse(TurnIdSchema, room.game.state.turnId), deadlineAt: v.parse(ServerTimeSchema, room.game.state.deadlineAt) });
    } catch { console.error("ISLAND scheduling failed; overdue recovery will retry."); }
  }
  private async cancelTimer(turnId: string) {
    try { await this.deps.turnScheduler.cancelTimeout(v.parse(TurnIdSchema, turnId)); }
    catch { console.error("ISLAND timer cancellation failed; stale callbacks are guarded."); }
  }
  async start(input: StartGameInput): Promise<GameStartResult> {
    const d = this.deps;
    try {
      const result = await d.roomMutationExecutor.run(input.roomId, async (): Promise<GameStartResult> => {
        if (!input.authorization.isCurrent()) return failure("UNAUTHENTICATED");
        const room = await d.roomRepository.findById(input.roomId);
        if (room?.gameType !== "ISLAND_SETTLERS" || room.departedPlayerIds?.includes(input.actorPlayerId) || !room.players.some(p => p.playerId === input.actorPlayerId)) return failure("INVALID_PHASE");
        const scopeKey = `room-player:${room.roomId}:${input.actorPlayerId}`, payloadFingerprint = JSON.stringify(["game:start", input.expectedRoomRevision]);
        const prior = await d.idempotencyRepository.classify(scopeKey, input.requestId, payloadFingerprint);
        if (prior.status === "CONFLICT") return failure("REQUEST_ID_REUSED");
        if (prior.status === "REPLAY") return { ok: true, data: v.parse(GameStartSuccessDataSchema, prior.record.terminalResult) };
        if (room.phase !== "LOBBY" || room.game !== null) return failure("INVALID_PHASE");
        if (room.hostPlayerId !== input.actorPlayerId) return failure("HOST_ONLY");
        if (room.roomRevision !== input.expectedRoomRevision) return failure("STALE_ROOM_REVISION");
        if (room.players.length < 3) return failure("NOT_ENOUGH_PLAYERS");
        if (room.players.length > 4) return failure("INVALID_PHASE");
        const lease = await d.presence.acquireRoomPresenceLease(room.roomId);
        if (!lease.isCurrent() || !room.players.every(p => lease.connectionStatusByPlayerId.get(p.playerId) === "CONNECTED")) return failure("PLAYERS_NOT_CONNECTED");
        const now = d.clock.now(), gameId = d.ids.generateGameId(), turnId = d.ids.generateTurnId();
        const state = createIslandGame({ gameId, playerIds: room.players.map(p => p.playerId), cardIds: Array.from({ length: 25 }, () => d.ids.generateTileId()), now, turnId, random: max => d.random.nextInt(max) });
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
  async command(input: Readonly<{ roomId: RoomId; actorPlayerId: PlayerId; command: IslandClientCommand; receivedAt: ServerTime; authorization: { isCurrent(): boolean } }>) {
    const parsed = v.safeParse(IslandClientCommandSchema, input.command);
    if (!parsed.success) return failure("INVALID_PAYLOAD");
    const d = this.deps, c = parsed.output;
    let changed = false;
    try {
      const result = await d.roomMutationExecutor.run(input.roomId, async () => {
        if (!input.authorization.isCurrent()) return failure("UNAUTHENTICATED");
        const room = await d.roomRepository.findById(input.roomId);
        if (room?.gameType !== "ISLAND_SETTLERS" || room.departedPlayerIds?.includes(input.actorPlayerId) || !room.players.some(p => p.playerId === input.actorPlayerId)) return failure("INVALID_PHASE");
        const scopeKey = `room-player:${room.roomId}:${input.actorPlayerId}`, payloadFingerprint = JSON.stringify(c);
        const prior = await d.idempotencyRepository.classify(scopeKey, c.requestId, payloadFingerprint);
        if (prior.status === "CONFLICT") return failure("REQUEST_ID_REUSED");
        if (prior.status === "REPLAY") return receiptResult(prior.record.terminalResult);
        const now = d.clock.now(); let candidate: Omit<IslandRoomRecord, "storageRevision"> = room;
        let outcome: v.InferOutput<typeof Receipt>["outcome"];
        if (!room.game || room.game.gameId !== c.gameId || room.game.gameRevision !== c.expectedGameRevision) return failure("STALE_GAME_REVISION");
        if (c.kind === "island:rematch") {
          if (room.phase !== "FINISHED") return failure("INVALID_PHASE");
          if (room.hostPlayerId !== input.actorPlayerId) return failure("HOST_ONLY");
          if (room.roomRevision !== c.expectedRoomRevision) return failure("STALE_ROOM_REVISION");
          candidate = { ...room, phase: "LOBBY", game: null, departedPlayerIds: [], players: room.players.filter(p => !room.departedPlayerIds?.includes(p.playerId)),
            roomRevision: v.parse(RoomRevisionSchema, room.roomRevision + 1), updatedAt: now }; outcome = "REMATCHED";
        } else {
          if (room.phase !== "PLAYING" || now >= room.game.state.deadlineAt) return failure("STALE_GAME_REVISION");
          if (c.turnId !== room.game.state.turnId) return failure("STALE_GAME_REVISION");
          const applied = actIsland(room.game.state, input.actorPlayerId, c.payload, {
            now, nextTurnId: d.ids.generateTurnId(), tradeId: d.ids.generateTileId(), seed: d.random.nextInt(0x7fffffff) + 1,
          });
          if (!applied.ok) return failure(applied.reason === "NOT_YOUR_TURN" ? "NOT_YOUR_TURN" : "INVALID_PAYLOAD");
          candidate = transitionIsland(room, applied.state, now); outcome = "ACCEPTED";
        }
        // The state and replay receipt commit atomically under the room lane.
        const committed = await d.roomUnitOfWork.commit({ roomMutation: { kind: "REPLACE", candidate,
          expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision }, sessionMutation: { kind: "NONE" },
          idempotency: { scopeKey, requestId: c.requestId, payloadFingerprint, terminalResult: { outcome }, createdAt: now } }, { isSatisfied: () => input.authorization.isCurrent() });
        if (committed.status !== "COMMITTED") return failure("STALE_GAME_REVISION");
        changed = candidate !== room;
        if (room.game) await this.cancelTimer(room.game.state.turnId);
        return receiptResult({ outcome });
      });
      if (changed) { await this.schedule(input.roomId); await this.notify(input.roomId); }
      return result;
    } catch { return failure("INTERNAL_ERROR"); }
  }
  async timeout(input: ScheduledTurnDeadline): Promise<{ status: "NO_OP" | "APPLIED" | "FAILED" }> {
    const d = this.deps;
    try {
      const applied = await d.roomMutationExecutor.run(input.roomId, async () => {
        const room = await d.roomRepository.findById(input.roomId), now = d.clock.now();
        if (room?.gameType !== "ISLAND_SETTLERS" || room.phase !== "PLAYING" || !room.game || room.game.gameId !== input.gameId ||
          room.game.state.turnId !== input.turnId || room.game.state.deadlineAt !== input.deadlineAt || now < input.deadlineAt) return false;
        const previous = room.game.state;
        const state = timeoutIsland(previous, { now, nextTurnId: d.ids.generateTurnId(), tradeId: d.ids.generateTileId(), seed: d.random.nextInt(0x7fffffff) + 1 });
        if (!state) return false;
        const committed = await d.roomUnitOfWork.commit({ roomMutation: { kind: "REPLACE", candidate: transitionIsland(room, state, now),
          expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision }, sessionMutation: { kind: "NONE" },
          idempotency: { scopeKey: `island-timer:${room.roomId}:${room.game.gameId}`, requestId: v.parse(RequestIdSchema, `phase:${input.turnId}`),
            payloadFingerprint: JSON.stringify([input.turnId, input.deadlineAt]), terminalResult: { transitioned: true }, createdAt: now } });
        return committed.status === "COMMITTED";
      });
      if (applied) { await this.cancelTimer(input.turnId); await this.schedule(input.roomId); await this.notify(input.roomId); }
      return { status: applied ? "APPLIED" : "NO_OP" };
    } catch { return { status: "FAILED" }; }
  }
}
