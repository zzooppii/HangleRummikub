import { CityActionIdSchema, GameIdSchema, GameRevisionSchema, PlayerIdSchema, RoomIdSchema, RoomRevisionSchema, TurnIdSchema,
  type CityActionId, type CityBuildingCardId, type CityRoleAbilityPayload, type CityRoleId, type ErrorDto, type GameId, type GameRevision, type PlayerId, type ProtocolErrorCode, type RequestId, type RoomId, type ServerTime } from "@hangul-rummikub/shared";
import * as v from "valibot";
import type { CurrentActorAuthorization } from "../../../application/game-start-service.js";
import type { RoomMutationSerialExecutor } from "../../../application/room-session-service.js";
import { scheduleCurrentTurnBestEffort, type TurnSchedulingFailureReporter } from "../../../application/turn-transition.js";
import { notifyGameFinishedBestEffort, type GameFinishedPostCommit } from "../../../application/game-finish-transition.js";
import type { CityRoleRoomRecord, RoomRecord } from "../../../model/persistence.js";
import type { IdempotencyRepository } from "../../../ports/idempotency-repository.js";
import type { RoomRepository } from "../../../ports/room-repository.js";
import type { RoomUnitOfWork } from "../../../ports/room-unit-of-work.js";
import type { Clock, IdGenerator, TurnScheduler } from "../../../ports/system.js";
import type { CityRoleStoredGame } from "../compatibility/city-role-game-state-adapter.js";
import type { PlayingCityGameState } from "../domain/game-state.js";
import { parseBuildingCardId, parseCityActionId, parseCityGameId, parseCityPlayerId } from "../domain/identity.js";
import { applyCityAction, CityRuleError, type CityAbility, type CityAction } from "../domain/rule-engine.js";
import { CityRoleEntropySource, cityDomainEntropy } from "./city-role-entropy.js";
import { transitionCityRoom } from "./city-role-transition.js";

export type CityActionInput = Readonly<{
  roomId: RoomId; actorPlayerId: PlayerId; requestId: RequestId; gameId: GameId;
  expectedGameRevision: GameRevision; actionId: CityActionId; receivedAt: ServerTime; authorization: CurrentActorAuthorization;
}>;
export type CitySelectRoleInput = CityActionInput & Readonly<{ roleId: CityRoleId }>;
export type CityCardInput = CityActionInput & Readonly<{ cardId: CityBuildingCardId }>;
export type CityAbilityInput = CityActionInput & Readonly<{ ability: CityRoleAbilityPayload }>;
const Identity = { roomId: RoomIdSchema, gameId: GameIdSchema, roomRevision: RoomRevisionSchema, gameRevision: GameRevisionSchema,
  previousActionId: CityActionIdSchema };
export const CityMutationDataSchema = v.variant("outcome", [
  v.strictObject({ ...Identity, outcome: v.literal("CONTINUED"), actionId: CityActionIdSchema }),
  v.strictObject({ ...Identity, outcome: v.literal("FINISHED"), finishReason: v.picklist(["CITY_COMPLETION_ROUND_END", "LAST_PLAYER_STANDING", "NO_ELIGIBLE_PLAYERS"]),
    winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(6)) }),
]);
export type CityMutationData = v.InferOutput<typeof CityMutationDataSchema>;
export type CityMutationResult = Readonly<{ ok: true; data: CityMutationData }> | Readonly<{ ok: false; error: ErrorDto }>;
export type CityCommandDependencies = Readonly<{
  roomRepository: RoomRepository; idempotencyRepository: IdempotencyRepository; roomUnitOfWork: RoomUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor; clock: Clock; idGenerator: IdGenerator;
  turnScheduler?: TurnScheduler; onTurnSchedulingFailure?: TurnSchedulingFailureReporter; onGameFinished?: GameFinishedPostCommit;
}>;
export function cityFailure(code: ProtocolErrorCode): Extract<CityMutationResult, { ok: false }> {
  return { ok: false, error: { code, message: "The CITY command could not be applied.", recoverable: code !== "INTERNAL_ERROR" && code !== "REQUEST_ID_REUSED" } };
}
export function cityDomainFailure(error: CityRuleError): CityMutationResult {
  if (error.code === "INVALID_CARD") return cityFailure("CARD_NOT_AVAILABLE");
  if (error.code === "INVALID_SETUP" || error.code === "INVALID_STATE" || error.code === "INVALID_ENTROPY") return cityFailure("INTERNAL_ERROR");
  if (error.code === "STALE_ACTION") return cityFailure("STALE_GAME_REVISION");
  if (error.code === "WRONG_ACTOR") return cityFailure("NOT_YOUR_TURN");
  if (error.code === "INVALID_PHASE" || error.code === "ALREADY_FINISHED") return cityFailure("INVALID_PHASE");
  return cityFailure("RULE_VIOLATION");
}
export function parseCityReplay(value: unknown): CityMutationResult {
  const parsed = v.safeParse(CityMutationDataSchema, value);
  return parsed.success ? { ok: true, data: parsed.output } : cityFailure("INTERNAL_ERROR");
}
export function asCityPlayingRoom(room: RoomRecord): (CityRoleRoomRecord & { game: CityRoleStoredGame & { state: PlayingCityGameState; deadlineAt: ServerTime } }) | null {
  if (room.gameType !== "CITY_ROLE" || room.phase !== "PLAYING" || room.game === null || room.game.state.window === null || room.game.deadlineAt === null) return null;
  return { ...room, game: { ...room.game, state: room.game.state, deadlineAt: room.game.deadlineAt } };
}
export function cityMutationData(room: CityRoleRoomRecord, previousActionId: string): CityMutationData {
  const game = room.game;
  if (!game) throw new Error("CITY mutation requires game.");
  return v.parse(CityMutationDataSchema, { roomId: room.roomId, gameId: game.gameId, roomRevision: room.roomRevision, gameRevision: game.gameRevision, previousActionId,
    ...(game.state.window !== null ? { outcome: "CONTINUED", actionId: game.state.window.actionId } : {
      outcome: "FINISHED", finishReason: game.state.result.reason, winnerPlayerIds: game.state.result.rankings.filter(row => row.winner).map(row => row.playerId),
    }) });
}
export async function notifyCityMutation(deps: Pick<CityCommandDependencies, "roomRepository" | "turnScheduler" | "onTurnSchedulingFailure" | "onGameFinished">, data: CityMutationData): Promise<void> {
  if (data.outcome === "FINISHED" || data.previousActionId !== data.actionId) {
    try { await deps.turnScheduler?.cancelTimeout(v.parse(TurnIdSchema, data.previousActionId)); }
    catch { /* The current descriptor/overdue recovery remains authoritative. */ }
  }
  if (data.outcome === "FINISHED") await notifyGameFinishedBestEffort(deps.onGameFinished, { roomId: data.roomId, gameId: data.gameId });
  else await scheduleCurrentTurnBestEffort(deps.roomRepository, deps.turnScheduler, { roomId: data.roomId, gameId: data.gameId,
    gameRevision: data.gameRevision, turnId: v.parse(TurnIdSchema, data.actionId) }, deps.onTurnSchedulingFailure);
}
function domainAbility(ability: CityRoleAbilityPayload): CityAbility {
  switch (ability.ability) {
    case "MARK_ROLE_DISABLED": case "MARK_ROLE_GOLD_TRANSFER": return { kind: ability.ability, targetRoleId: ability.targetRoleId };
    case "EXCHANGE_HANDS": return { kind: ability.ability, targetPlayerId: parseCityPlayerId(ability.targetPlayerId) };
    case "REPLACE_OWN_CARDS": return { kind: ability.ability, cardIds: ability.cardIds.map(parseBuildingCardId).sort() };
    case "DESTROY_BUILDING": return { kind: ability.ability, targetPlayerId: parseCityPlayerId(ability.targetPlayerId), cardId: parseBuildingCardId(ability.cardId) };
  }
}

/** A concrete CITY application; private choices are never stored in replay ACKs. */
export class CityRoleCommandService {
  readonly #deps: CityCommandDependencies;
  constructor(deps: CityCommandDependencies) { this.#deps = deps; }
  selectRole(input: CitySelectRoleInput) { return this.#execute(input, "city:selectRole", { kind: "SELECT_ROLE", roleId: input.roleId }); }
  takeIncome(input: CityActionInput) { return this.#execute(input, "city:takeIncome", { kind: "TAKE_INCOME" }); }
  drawBuildingCards(input: CityActionInput) { return this.#execute(input, "city:drawBuildingCards", { kind: "DRAW_BUILDING_CARDS" }); }
  chooseBuildingCard(input: CityCardInput) { return this.#execute(input, "city:chooseBuildingCard", { kind: "CHOOSE_BUILDING_CARD", cardId: parseBuildingCardId(input.cardId) }); }
  useRoleAbility(input: CityAbilityInput) { return this.#execute(input, "city:useRoleAbility", { kind: "USE_ROLE_ABILITY", ability: domainAbility(input.ability) }); }
  build(input: CityCardInput) { return this.#execute(input, "city:build", { kind: "BUILD", cardId: parseBuildingCardId(input.cardId) }); }
  endTurn(input: CityActionInput) { return this.#execute(input, "city:endTurn", { kind: "END_TURN" }); }
  async #execute(input: CityActionInput, kind: string, action: CityAction): Promise<CityMutationResult> {
    let result: CityMutationResult;
    try { result = await this.#deps.roomMutationExecutor.run(input.roomId, () => this.#withinLane(input, kind, action)); }
    catch { return cityFailure("INTERNAL_ERROR"); }
    if (result.ok) await notifyCityMutation(this.#deps, result.data);
    return result;
  }
  async #withinLane(input: CityActionInput, kind: string, action: CityAction): Promise<CityMutationResult> {
    const located = await this.#deps.roomRepository.findById(input.roomId);
    if (!located) return cityFailure("ROOM_NOT_FOUND");
    if (located.gameType !== "CITY_ROLE") return cityFailure("INTERNAL_ERROR");
    if (!input.authorization.isCurrent()) return cityFailure("UNAUTHENTICATED");
    const scopeKey = `room-player:${input.roomId}:${input.actorPlayerId}`;
    const fingerprintAction = action.kind === "USE_ROLE_ABILITY" && action.ability.kind === "REPLACE_OWN_CARDS"
      ? { ...action, ability: { ...action.ability, cardIds: [...action.ability.cardIds].sort() } } : action;
    const payloadFingerprint = JSON.stringify([kind, input.gameId, input.expectedGameRevision, input.actionId, fingerprintAction]);
    const prior = await this.#deps.idempotencyRepository.classify(scopeKey, input.requestId, payloadFingerprint);
    if (prior.status === "REPLAY") return parseCityReplay(prior.record.terminalResult);
    if (prior.status === "CONFLICT") return cityFailure("REQUEST_ID_REUSED");
    const room = asCityPlayingRoom(located);
    if (!room) return cityFailure("INVALID_PHASE");
    const game = room.game, window = game.state.window;
    if (game.gameId !== input.gameId) return cityFailure("STALE_GAME_REVISION");
    if (String(window.activePlayerId) !== input.actorPlayerId || String(window.actionId) !== input.actionId) return cityFailure("NOT_YOUR_TURN");
    if (input.receivedAt >= game.deadlineAt) return cityFailure("TURN_EXPIRED");
    if (game.gameRevision !== input.expectedGameRevision) return cityFailure("STALE_GAME_REVISION");
    const random = new CityRoleEntropySource(game.entropySeed, game.entropyCounter);
    // CR-03 discards these exact owned IDs before a possible reshuffle. Domain
    // validates ownership/duplicates/E03 before ever reading this entropy field.
    const discard = action.kind === "USE_ROLE_ABILITY" && action.ability.kind === "REPLACE_OWN_CARDS"
      ? [...game.state.discard, ...action.ability.cardIds] : game.state.discard;
    let state;
    try { state = applyCityAction(game.state, { gameId: parseCityGameId(input.gameId), actionId: parseCityActionId(input.actionId),
      playerId: parseCityPlayerId(input.actorPlayerId) }, action, cityDomainEntropy(this.#deps.idGenerator, random, discard)); }
    catch (error) { return error instanceof CityRuleError ? cityDomainFailure(error) : cityFailure("INTERNAL_ERROR"); }
    const at = this.#deps.clock.now();
    const candidate = transitionCityRoom(room, state, at, random.counter);
    const terminalResult = cityMutationData({ ...candidate, storageRevision: room.storageRevision }, window.actionId);
    const committed = await this.#deps.roomUnitOfWork.commit({ roomMutation: { kind: "REPLACE", candidate,
      expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision }, sessionMutation: { kind: "NONE" },
      idempotency: { scopeKey, requestId: input.requestId, payloadFingerprint, terminalResult, createdAt: at } },
    { isSatisfied: () => input.authorization.isCurrent() });
    if (committed.status === "COMMITTED" || committed.status === "REPLAY") return parseCityReplay(committed.idempotency.terminalResult);
    if (committed.status === "IDEMPOTENCY_CONFLICT") return cityFailure("REQUEST_ID_REUSED");
    return cityFailure(committed.reason === "COMMIT_PRECONDITION_FAILED" ? "UNAUTHENTICATED" :
      ["STALE_STORAGE_REVISION", "STALE_ROOM_REVISION", "ROOM_NOT_FOUND"].includes(committed.reason) ? "STALE_GAME_REVISION" : "INTERNAL_ERROR");
  }
}
