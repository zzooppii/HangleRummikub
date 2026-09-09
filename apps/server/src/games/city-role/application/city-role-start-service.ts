import { GameRevisionSchema, RoomRevisionSchema, ServerTimeSchema, TurnIdSchema } from "@hangul-rummikub/shared";
import { parse, safeParse } from "valibot";
import { GameStartSuccessDataSchema, type GameStartResult, type StartGameInput } from "../../../application/game-start-service.js";
import { scheduleCurrentTurnBestEffort } from "../../../application/turn-transition.js";
import { shuffleFrozen } from "../../../domain/frozen-fisher-yates.js";
import type { GameRegistrationReader } from "../../game-registry.js";
import type { RoomPresencePolicyReader } from "../../../ports/room-presence-policy.js";
import type { RandomSource } from "../../../ports/system.js";
import type { CityRoleStoredGame } from "../compatibility/city-role-game-state-adapter.js";
import { createCityCards } from "../domain/cardset-v1.js";
import { parseBuildingCardId, parseCityActionId, parseCityGameId, parseCityPlayerId } from "../domain/identity.js";
import { createInitialCityGameState } from "../domain/rule-engine.js";
import { CITY_ROLE_IDS, CITY_SELECTION_SECONDS } from "../domain/role.js";
import { CityRoleEntropySource, createCityEntropySeed } from "./city-role-entropy.js";
import { cityFailure, type CityCommandDependencies } from "./city-role-command-service.js";

export type CityRoleStartServiceDependencies = CityCommandDependencies & Readonly<{
  presenceLeaseReader: Pick<RoomPresencePolicyReader, "acquireRoomPresenceLease">;
  randomSource: RandomSource; gameRegistrationReader: GameRegistrationReader;
}>;
function replay(value: unknown): GameStartResult {
  const result = safeParse(GameStartSuccessDataSchema, value);
  return result.success ? { ok: true, data: result.output } : cityFailure("INTERNAL_ERROR");
}
export class CityRoleStartService {
  readonly #deps: CityRoleStartServiceDependencies;
  constructor(deps: CityRoleStartServiceDependencies) { this.#deps = deps; }
  async start(input: StartGameInput): Promise<GameStartResult> {
    let result: GameStartResult;
    try { result = await this.#deps.roomMutationExecutor.run(input.roomId, () => this.#withinLane(input)); }
    catch { return cityFailure("INTERNAL_ERROR"); }
    if (result.ok) await scheduleCurrentTurnBestEffort(this.#deps.roomRepository, this.#deps.turnScheduler,
      { roomId: result.data.roomId, gameId: result.data.gameId, gameRevision: result.data.gameRevision, turnId: result.data.turnId }, this.#deps.onTurnSchedulingFailure);
    return result;
  }
  async #withinLane(input: StartGameInput): Promise<GameStartResult> {
    const room = await this.#deps.roomRepository.findById(input.roomId);
    if (!room) return cityFailure("ROOM_NOT_FOUND");
    if (room.gameType !== "CITY_ROLE") return cityFailure("INTERNAL_ERROR");
    if (!input.authorization.isCurrent()) return cityFailure("UNAUTHENTICATED");
    const scopeKey = `room-player:${input.roomId}:${input.actorPlayerId}`;
    const payloadFingerprint = JSON.stringify(["game:start", input.expectedRoomRevision]);
    const prior = await this.#deps.idempotencyRepository.classify(scopeKey, input.requestId, payloadFingerprint);
    if (prior.status === "REPLAY") return replay(prior.record.terminalResult);
    if (prior.status === "CONFLICT") return cityFailure("REQUEST_ID_REUSED");
    this.#deps.gameRegistrationReader.getRequired(room.gameType);
    if (room.phase !== "LOBBY" || room.game !== null) return cityFailure("INVALID_PHASE");
    if (room.hostPlayerId !== input.actorPlayerId) return cityFailure("HOST_ONLY");
    if (room.players.length < 2) return cityFailure("NOT_ENOUGH_PLAYERS");
    if (room.players.length > 6) return cityFailure("INVALID_PHASE");
    if (room.roomRevision !== input.expectedRoomRevision) return cityFailure("STALE_ROOM_REVISION");
    const lease = await this.#deps.presenceLeaseReader.acquireRoomPresenceLease(room.roomId);
    if (!lease.isCurrent() || !room.players.every(player => lease.connectionStatusByPlayerId.get(player.playerId) === "CONNECTED")) return cityFailure("PLAYERS_NOT_CONNECTED");
    if (!input.authorization.isCurrent()) return cityFailure("UNAUTHENTICATED");
    const startedAt = this.#deps.clock.now();
    const random = new CityRoleEntropySource(createCityEntropySeed(this.#deps.randomSource), 0);
    const playerIds = room.players.map(player => parseCityPlayerId(player.playerId));
    const seatOrder = shuffleFrozen(playerIds, random);
    const cards = createCityCards(Array.from({ length: 60 }, () => parseBuildingCardId(this.#deps.idGenerator.generateTileId())));
    const shuffledCards = shuffleFrozen(cards.map(card => card.cardId), random);
    const gameId = this.#deps.idGenerator.generateGameId();
    const actionId = parseCityActionId(this.#deps.idGenerator.generateTurnId());
    const state = createInitialCityGameState({ rulesVersion: "city-rules-v2", gameId: parseCityGameId(gameId), playerIds, seatOrder, cards,
      initialHands: playerIds.map((playerId, index) => ({ playerId, cardIds: shuffledCards.slice(index * 4, index * 4 + 4) })),
      deck: shuffledCards.slice(playerIds.length * 4), actionId, roleOrder: shuffleFrozen(CITY_ROLE_IDS, random) });
    const game: CityRoleStoredGame = Object.freeze({ gameId, state, gameRevision: parse(GameRevisionSchema, 0),
      startedAt, windowStartedAt: startedAt, deadlineAt: parse(ServerTimeSchema, startedAt + CITY_SELECTION_SECONDS * 1000),
      finishedAt: null, entropySeed: random.seed, entropyCounter: random.counter });
    const roomRevision = parse(RoomRevisionSchema, room.roomRevision + 1);
    const terminalResult = parse(GameStartSuccessDataSchema, { roomId: room.roomId, gameId, roomRevision,
      gameRevision: game.gameRevision, turnId: parse(TurnIdSchema, actionId) });
    const committed = await this.#deps.roomUnitOfWork.commit({ roomMutation: { kind: "REPLACE",
      candidate: { ...room, phase: "PLAYING", game, roomRevision, updatedAt: startedAt },
      expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision },
      sessionMutation: { kind: "NONE" }, idempotency: { scopeKey, requestId: input.requestId, payloadFingerprint, terminalResult, createdAt: startedAt } },
    { isSatisfied: () => input.authorization.isCurrent() && lease.isCurrent() });
    if (committed.status === "COMMITTED" || committed.status === "REPLAY") return replay(committed.idempotency.terminalResult);
    if (committed.status === "IDEMPOTENCY_CONFLICT") return cityFailure("REQUEST_ID_REUSED");
    if (committed.reason === "COMMIT_PRECONDITION_FAILED") return cityFailure(!input.authorization.isCurrent() ? "UNAUTHENTICATED" : "PLAYERS_NOT_CONNECTED");
    return cityFailure(["ROOM_NOT_FOUND", "STALE_ROOM_REVISION", "STALE_STORAGE_REVISION"].includes(committed.reason) ? "STALE_ROOM_REVISION" : "INTERNAL_ERROR");
  }
}
