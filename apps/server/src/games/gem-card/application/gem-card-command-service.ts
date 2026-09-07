import { GameIdSchema, GameRevisionSchema, GemFinishReasonSchema, PlayerIdSchema, RoomIdSchema, RoomRevisionSchema, TurnIdSchema, TurnNumberSchema, type ErrorDto, type GameRevision, type GemCollectSelectionDto, type GemMarketSourceDto, type GemPurchaseSourceDto, type PlayerId, type ProtocolErrorCode, type RequestId, type RoomId, type ServerTime, type TurnId } from "@hangul-rummikub/shared";
import * as v from "valibot";
import type { CurrentActorAuthorization } from "../../../application/game-start-service.js";
import type { RoomMutationSerialExecutor } from "../../../application/room-session-service.js";
import { scheduleCurrentTurnBestEffort, type TurnSchedulingFailureReporter } from "../../../application/turn-transition.js";
import { notifyGameFinishedBestEffort, type GameFinishedPostCommit } from "../../../application/game-finish-transition.js";
import type { GemCardRoomRecord, RoomRecord } from "../../../model/persistence.js";
import type { IdempotencyRepository } from "../../../ports/idempotency-repository.js";
import type { RoomRepository } from "../../../ports/room-repository.js";
import type { RoomUnitOfWork } from "../../../ports/room-unit-of-work.js";
import type { Clock, IdGenerator, TurnScheduler } from "../../../ports/system.js";
import { collectGemResources, purchaseGemCard, reserveGemMarketCard, type GemDomainFailureReason } from "../domain/actions.js";
import type { PlayingGemGameState } from "../domain/game-state.js";
import { replaceGemPlayer } from "../domain/player-state.js";
import { applyGemYield, evaluateGemFinishAfterConsumedTurn } from "../domain/progress.js";
import { isGemActionBeforeDeadline } from "../domain/turn.js";
import { transitionGemRoom } from "./gem-card-transition.js";
export type GemTurnInput = Readonly<{
  roomId: RoomId;
  actorPlayerId: PlayerId;
  requestId: RequestId;
  expectedGameRevision: GameRevision;
  turnId: TurnId;
  receivedAt: ServerTime;
  authorization: CurrentActorAuthorization;
}>;
export type GemCollectInput = GemTurnInput & Readonly<{
  selection: GemCollectSelectionDto;
}>;
export type GemPurchaseInput = GemTurnInput & Readonly<{
  source: GemPurchaseSourceDto;
}>;
export type GemReserveInput = GemTurnInput & Readonly<{
  source: GemMarketSourceDto;
}>;
export type GemYieldInput = GemTurnInput;
const Identity = { roomId: RoomIdSchema, gameId: GameIdSchema, roomRevision: RoomRevisionSchema, gameRevision: GameRevisionSchema };
export const GemMutationDataSchema = v.variant("outcome", [
  v.strictObject({ ...Identity, outcome: v.literal("ADVANCED"), nextTurnId: TurnIdSchema, nextTurnNumber: TurnNumberSchema }),
  v.strictObject({ ...Identity, outcome: v.literal("FINISHED"), finishReason: GemFinishReasonSchema, winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.minLength(1), v.maxLength(4)) }),
]);
export type GemMutationData = v.InferOutput<typeof GemMutationDataSchema>;
export type GemMutationResult = Readonly<{
  ok: true;
  data: GemMutationData;
}> | Readonly<{
  ok: false;
  error: ErrorDto;
}>;
export type GemCommandDependencies = Readonly<{
  roomRepository: RoomRepository;
  idempotencyRepository: IdempotencyRepository;
  roomUnitOfWork: RoomUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  clock: Clock;
  idGenerator: IdGenerator;
  turnScheduler?: TurnScheduler;
  onTurnSchedulingFailure?: TurnSchedulingFailureReporter;
  onGameFinished?: GameFinishedPostCommit;
}>;
export function gemFailure(code: ProtocolErrorCode): GemMutationResult {
  return { ok: false, error: { code, message: "The GEM command could not be applied.", recoverable: code !== "INTERNAL_ERROR" && code !== "REQUEST_ID_REUSED" } };
}
export function gemDomainFailure(reason: GemDomainFailureReason): GemMutationResult {
  if (reason === "INVALID_RESERVED_CARD_ACCESS")
    return gemFailure("CARD_NOT_AVAILABLE");
  if (reason === "INVALID_RESOURCE_SELECTION")
    return gemFailure("INVALID_PAYLOAD");
  if (reason === "PLAYER_FORFEITED")
    return gemFailure("NOT_YOUR_TURN");
  return gemFailure(reason);
}
export function parseGemReplay(value: unknown): GemMutationResult {
  const parsed = v.safeParse(GemMutationDataSchema, value);
  return parsed.success ? { ok: true, data: parsed.output } : gemFailure("INTERNAL_ERROR");
}
export function asGemPlayingRoom(room: RoomRecord): (GemCardRoomRecord & {
  game: PlayingGemGameState;
}) | null {
  if (room.gameType !== "GEM_CARD" || room.phase !== "PLAYING" || room.game === null || room.game.turn === null || room.game.result !== null)
    return null;
  return { ...room, game: room.game };
}
export function gemMutationData(room: GemCardRoomRecord): GemMutationData {
  const game = room.game;
  if (!game)
    throw new Error("GEM mutation requires game.");
  return v.parse(GemMutationDataSchema, { roomId: room.roomId, gameId: game.gameId, roomRevision: room.roomRevision, gameRevision: game.gameRevision,
    ...(game.turn !== null ? { outcome: "ADVANCED", nextTurnId: game.turn.turnId, nextTurnNumber: game.turn.turnNumber } : { outcome: "FINISHED", finishReason: game.result.reason, winnerPlayerIds: [...game.result.winnerPlayerIds] }) });
}
export async function notifyGemMutation(deps: Pick<GemCommandDependencies, "roomRepository" | "turnScheduler" | "onTurnSchedulingFailure" | "onGameFinished">, data: GemMutationData): Promise<void> {
  if (data.outcome === "FINISHED")
    await notifyGameFinishedBestEffort(deps.onGameFinished, { roomId: data.roomId, gameId: data.gameId });
  else
    await scheduleCurrentTurnBestEffort(deps.roomRepository, deps.turnScheduler, { roomId: data.roomId, gameId: data.gameId, gameRevision: data.gameRevision, turnId: data.nextTurnId }, deps.onTurnSchedulingFailure);
}
type GemAction = {
  kind: "gem:collect";
  selection: GemCollectSelectionDto;
} | {
  kind: "gem:purchase";
  source: GemPurchaseSourceDto;
} | {
  kind: "gem:reserve";
  source: GemMarketSourceDto;
} | {
  kind: "gem:yield";
};
/** Closed GEM-only application path, not a pluggable/generic command executor. */
export class GemCardCommandService {
  readonly #deps: GemCommandDependencies;
  constructor(deps: GemCommandDependencies) { this.#deps = deps; }
  collect(input: GemCollectInput) { return this.#execute(input, { kind: "gem:collect", selection: input.selection }); }
  purchase(input: GemPurchaseInput) { return this.#execute(input, { kind: "gem:purchase", source: input.source }); }
  reserve(input: GemReserveInput) { return this.#execute(input, { kind: "gem:reserve", source: input.source }); }
  yield(input: GemYieldInput) { return this.#execute(input, { kind: "gem:yield" }); }
  async #execute(input: GemTurnInput, action: GemAction): Promise<GemMutationResult> {
    let result: GemMutationResult;
    try {
      result = await this.#deps.roomMutationExecutor.run(input.roomId, () => this.#withinLane(input, action));
    }
    catch {
      return gemFailure("INTERNAL_ERROR");
    }
    if (result.ok)
      await notifyGemMutation(this.#deps, result.data);
    return result;
  }
  async #withinLane(input: GemTurnInput, action: GemAction): Promise<GemMutationResult> {
    // Resolve canonical type before idempotency replay; never route by a client claim.
    const located = await this.#deps.roomRepository.findById(input.roomId);
    if (!located)
      return gemFailure("ROOM_NOT_FOUND");
    if (located.gameType !== "GEM_CARD")
      return gemFailure("INTERNAL_ERROR");
    if (!input.authorization.isCurrent())
      return gemFailure("UNAUTHENTICATED");
    const scopeKey = `room-player:${input.roomId}:${input.actorPlayerId}`;
    const detail = action.kind === "gem:collect" ? action.selection.kind === "PRISM" ? ["PRISM"] : ["BASIC", [...action.selection.resources].sort()] : action.kind === "gem:purchase" ? action.source.kind === "RESERVED" ? ["RESERVED", action.source.cardId] : ["MARKET", action.source.tier, action.source.slotIndex] : action.kind === "gem:reserve" ? [action.source.tier, action.source.slotIndex] : [];
    const payloadFingerprint = JSON.stringify([action.kind, input.expectedGameRevision, input.turnId, detail]);
    const prior = await this.#deps.idempotencyRepository.classify(scopeKey, input.requestId, payloadFingerprint);
    if (prior.status === "REPLAY")
      return parseGemReplay(prior.record.terminalResult);
    if (prior.status === "CONFLICT")
      return gemFailure("REQUEST_ID_REUSED");
    const room = asGemPlayingRoom(located);
    if (!room)
      return gemFailure("INVALID_PHASE");
    const game = room.game;
    if (game.turn.activePlayerId !== input.actorPlayerId || game.turn.turnId !== input.turnId)
      return gemFailure("NOT_YOUR_TURN");
    if (!isGemActionBeforeDeadline(input.receivedAt, game.turn.deadlineAt))
      return gemFailure("TURN_EXPIRED");
    if (game.gameRevision !== input.expectedGameRevision)
      return gemFailure("STALE_GAME_REVISION");
    const player = game.players.find(p => p.playerId === input.actorPlayerId);
    if (!player)
      return gemFailure("UNAUTHENTICATED");
    let base: PlayingGemGameState;
    if (action.kind === "gem:collect") {
      const result = collectGemResources({ player, supply: game.supply, selection: action.selection });
      if (!result.ok)
        return gemDomainFailure(result.reason);
      base = { ...game, supply: result.value.supply, players: replaceGemPlayer(game.players, result.value.player), noProgressPlayerIds: result.value.noProgressPlayerIds };
    }
    else if (action.kind === "gem:purchase") {
      const result = purchaseGemCard({ player, supply: game.supply, market: game.market, cards: game.cards, source: action.source });
      if (!result.ok)
        return gemDomainFailure(result.reason);
      base = { ...game, supply: result.value.supply, market: result.value.market, players: replaceGemPlayer(game.players, result.value.player), noProgressPlayerIds: result.value.noProgressPlayerIds };
    }
    else if (action.kind === "gem:reserve") {
      const result = reserveGemMarketCard({ player, market: game.market, source: action.source });
      if (!result.ok)
        return gemDomainFailure(result.reason);
      base = { ...game, market: result.value.market, players: replaceGemPlayer(game.players, result.value.player), noProgressPlayerIds: result.value.noProgressPlayerIds };
    }
    else {
      const result = applyGemYield({ ...game, playerId: input.actorPlayerId });
      if (!result.ok)
        return gemDomainFailure(result.reason);
      base = { ...game, noProgressPlayerIds: result.value.noProgressPlayerIds };
    }
    const at = this.#deps.clock.now();
    const finish = evaluateGemFinishAfterConsumedTurn({ ...base, actorPlayerId: input.actorPlayerId, existingPendingFairRound: game.pendingFairRound });
    const candidate = transitionGemRoom(room, base, finish, at, this.#deps.idGenerator, true);
    const terminalResult = gemMutationData({ ...candidate, storageRevision: room.storageRevision });
    const committed = await this.#deps.roomUnitOfWork.commit({
      roomMutation: { kind: "REPLACE", candidate, expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision },
      sessionMutation: { kind: "NONE" }, idempotency: { scopeKey, requestId: input.requestId, payloadFingerprint, terminalResult, createdAt: at },
    }, { isSatisfied: () => input.authorization.isCurrent() });
    if (committed.status === "COMMITTED" || committed.status === "REPLAY")
      return parseGemReplay(committed.idempotency.terminalResult);
    if (committed.status === "IDEMPOTENCY_CONFLICT")
      return gemFailure("REQUEST_ID_REUSED");
    return gemFailure(committed.reason === "COMMIT_PRECONDITION_FAILED" ? "UNAUTHENTICATED" : committed.reason === "STALE_STORAGE_REVISION" || committed.reason === "STALE_ROOM_REVISION" || committed.reason === "ROOM_NOT_FOUND" ? "STALE_GAME_REVISION" : "INTERNAL_ERROR");
  }
}
