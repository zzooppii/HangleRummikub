import { createNumberPlacementResult, numberActivePlayers, numberIneligiblePlayers } from "../domain/placement-ranking.js";
import {
  GameIdSchema,
  GameRevisionSchema,
  PlayerIdSchema,
  ServerTimeSchema,
  TileIdSchema,
  TurnIdSchema,
  type GameId,
  type GameRevision,
  type PlayerId,
  type ServerTime,
  type TileId,
  type TurnId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  NUMBER_TILE_RULES,
  NUMBER_TILE_RULES_VERSION,
  type NumberTileGameState,
  type NumberTileTurn,
} from "../domain/game-state.js";
import {
  createNumberTileLastPlayerStandingResult,
  createNumberTileRackEmptyResult,
  createNumberTileStalemateResult,
  type NumberTileGameResult,
  type NumberTilePlayerResultEntry,
  type NumberTileStalemateRankingEntry,
} from "../domain/result-engine.js";
import {
  evaluateNumberTileFinish,
  pruneNumberTileNoPlayTracker,
  createNumberTileReadonlyPlayerSet,
} from "../domain/stalemate.js";
import {
  cloneNumberTileTable,
  type NumberTileTable,
} from "../domain/table.js";
import {
  NUMBER_TILE_COLORS,
  NUMBER_TILE_NUMBERS,
  cloneNumberTile,
  type NumberTile,
} from "../domain/tile.js";
import { NUMBER_TILE_INVENTORY_TOTALS } from "../domain/tile-inventory.js";
import { normalizeNumberTileMeld } from "../domain/rule-engine.js";

export type NumberTileGameLifecycleInspection =
  | Readonly<{
      lifecycle: "RUNNING";
      gameId: GameId;
      gameRevision: GameRevision;
      activeTurn: Readonly<{
        turnId: TurnId;
        deadlineAt: ServerTime;
      }>;
    }>
  | Readonly<{
      lifecycle: "FINISHED";
      gameId: GameId;
      finishedAt: ServerTime;
    }>;

export interface NumberTileGameStateStorage {
  readonly gameType: "NUMBER_TILE";
  cloneAndValidate(state: NumberTileGameState): NumberTileGameState;
  inspectLifecycle(
    state: NumberTileGameState,
  ): NumberTileGameLifecycleInspection;
}

class NumberTileStorageReadonlyMap<TKey, TValue>
  implements ReadonlyMap<TKey, TValue>
{
  readonly #entries: Map<TKey, TValue>;

  constructor(entries: Iterable<readonly [TKey, TValue]>) {
    this.#entries = new Map(entries);
    Object.freeze(this);
  }

  get size(): number {
    return this.#entries.size;
  }

  get(key: TKey): TValue | undefined {
    return this.#entries.get(key);
  }

  has(key: TKey): boolean {
    return this.#entries.has(key);
  }

  entries(): MapIterator<[TKey, TValue]> {
    return this.#entries.entries();
  }

  keys(): MapIterator<TKey> {
    return this.#entries.keys();
  }

  values(): MapIterator<TValue> {
    return this.#entries.values();
  }

  forEach(
    callbackfn: (
      value: TValue,
      key: TKey,
      map: ReadonlyMap<TKey, TValue>,
    ) => void,
    thisArg?: unknown,
  ): void {
    this.#entries.forEach((value, key) =>
      callbackfn.call(thisArg, value, key, this),
    );
  }

  [Symbol.iterator](): MapIterator<[TKey, TValue]> {
    return this.#entries[Symbol.iterator]();
  }
}

function readonlyMap<TKey, TValue>(
  entries: Iterable<readonly [TKey, TValue]>,
): ReadonlyMap<TKey, TValue> {
  return new NumberTileStorageReadonlyMap(entries);
}

function requireNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function cloneTurn(turn: NumberTileTurn): NumberTileTurn {
  const startedAt = parse(ServerTimeSchema, turn.startedAt);
  const deadlineAt = parse(ServerTimeSchema, turn.deadlineAt);
  if (deadlineAt - startedAt !== NUMBER_TILE_RULES.turnDurationMs) {
    throw new Error("Number Tile Turn must use the canonical duration.");
  }
  if (!Number.isSafeInteger(turn.turnNumber) || turn.turnNumber < 1) {
    throw new RangeError("Number Tile turnNumber must be positive.");
  }

  return Object.freeze({
    turnId: parse(TurnIdSchema, turn.turnId),
    turnNumber: turn.turnNumber,
    activePlayerId: parse(PlayerIdSchema, turn.activePlayerId),
    startedAt,
    deadlineAt,
  });
}

function cloneTiles(
  tilesById: ReadonlyMap<TileId, NumberTile>,
): ReadonlyMap<TileId, NumberTile> {
  const entries = [...tilesById].map(([key, tile]) => {
    const tileId = parse(TileIdSchema, key);
    const cloned = cloneNumberTile(tile);
    if (cloned.tileId !== tileId) {
      throw new Error("Number Tile lookup key must match its tileId.");
    }
    return [tileId, cloned] as const;
  });
  if (entries.length !== NUMBER_TILE_INVENTORY_TOTALS.total) {
    throw new Error("Number Tile state must contain the canonical inventory.");
  }

  let jokerCount = 0;
  const faceCounts = new Map<string, number>();
  for (const [, tile] of entries) {
    if (tile.kind === "JOKER") {
      jokerCount += 1;
      continue;
    }
    const key = `${tile.color}:${tile.number}`;
    faceCounts.set(key, (faceCounts.get(key) ?? 0) + 1);
  }
  if (
    jokerCount !== NUMBER_TILE_INVENTORY_TOTALS.jokers ||
    NUMBER_TILE_COLORS.some((color) =>
      NUMBER_TILE_NUMBERS.some(
        (number) => faceCounts.get(`${color}:${number}`) !== 2,
      ),
    )
  ) {
    throw new Error("Number Tile state inventory composition is invalid.");
  }

  return readonlyMap(entries);
}

function clonePlayerMap<TValue>(
  source: ReadonlyMap<PlayerId, TValue>,
  turnOrder: readonly PlayerId[],
  cloneValue: (value: TValue) => TValue,
  name: string,
): ReadonlyMap<PlayerId, TValue> {
  if (
    source.size !== turnOrder.length ||
    turnOrder.some((playerId) => !source.has(playerId)) ||
    [...source.keys()].some((playerId) => !turnOrder.includes(playerId))
  ) {
    throw new Error(`${name} must match the complete turn order.`);
  }
  return readonlyMap(
    turnOrder.map((playerId) => {
      const value = source.get(playerId);
      if (value === undefined) {
        throw new Error(`${name} is missing a canonical Player.`);
      }
      return [playerId, cloneValue(value)] as const;
    }),
  );
}

function cloneTable(
  table: NumberTileTable,
  tilesById: ReadonlyMap<TileId, NumberTile>,
): NumberTileTable {
  const cloned = cloneNumberTileTable(table);
  for (const meld of cloned.melds) {
    const validation = normalizeNumberTileMeld(meld, tilesById);
    if (!validation.ok) {
      throw new Error(`Invalid canonical Number Tile meld: ${validation.error.code}.`);
    }
    if (meld.kind === "RUN" && meld.tiles.some((placement, index) =>
      placement.tileId !== validation.value.meld.tiles[index]!.tileId)) {
      // Accepting unsorted proposals must not relax the persisted/projection
      // boundary: successful Submit stores a normalized candidate beforehand.
      throw new Error("Invalid canonical Number Tile meld: RUN order is not normalized.");
    }
  }
  return cloned;
}

function tableTileIds(table: NumberTileTable): readonly TileId[] {
  return table.melds.flatMap((meld) =>
    meld.tiles.map((placement) => placement.tileId),
  );
}

function validateConservation(
  tilesById: ReadonlyMap<TileId, NumberTile>,
  pool: readonly TileId[],
  racks: ReadonlyMap<PlayerId, readonly TileId[]>,
  table: NumberTileTable,
): void {
  const located = [...pool, ...[...racks.values()].flat(), ...tableTileIds(table)];
  const unique = new Set(located);
  if (
    located.length !== tilesById.size ||
    unique.size !== tilesById.size ||
    [...unique].some((tileId) => !tilesById.has(tileId))
  ) {
    throw new Error("Number Tile state violated physical Tile conservation.");
  }
}

function samePlayerResult(
  actual: NumberTilePlayerResultEntry,
  expected: NumberTilePlayerResultEntry,
): boolean {
  return (
    actual.playerId === expected.playerId &&
    actual.score === expected.score &&
    actual.remainingRackCount === expected.remainingRackCount &&
    actual.penaltyCost === expected.penaltyCost &&
    actual.forfeited === expected.forfeited
  );
}

function sameRanking(
  actual: NumberTileStalemateRankingEntry,
  expected: NumberTileStalemateRankingEntry,
): boolean {
  return actual.rank === expected.rank && samePlayerResult(actual, expected);
}

function sameResult(
  actual: NumberTileGameResult,
  expected: NumberTileGameResult,
): boolean {
  if ("rankingMode" in actual || "rankingMode" in expected) {
    if (!("rankingMode" in actual) || !("rankingMode" in expected)) return false;
    return actual.rankingMode === expected.rankingMode && actual.reason === expected.reason &&
      actual.finishedAt === expected.finishedAt &&
      actual.winnerPlayerIds.length === expected.winnerPlayerIds.length &&
      actual.winnerPlayerIds.every((id, index) => id === expected.winnerPlayerIds[index]) &&
      actual.rankings.length === expected.rankings.length &&
      actual.rankings.every((entry, index) => {
        const other = expected.rankings[index];
        return other !== undefined && entry.playerId === other.playerId && entry.rank === other.rank &&
          entry.forfeited === other.forfeited && entry.remainingRackCount === other.remainingRackCount;
      });
  }
  if (
    actual.reason !== expected.reason ||
    actual.finishedAt !== expected.finishedAt ||
    actual.winnerPlayerIds.length !== expected.winnerPlayerIds.length ||
    !actual.winnerPlayerIds.every(
      (playerId, index) => playerId === expected.winnerPlayerIds[index],
    )
  ) {
    return false;
  }
  if (actual.reason === "STALEMATE") {
    if (expected.reason !== "STALEMATE") {
      return false;
    }
    return (
      actual.rankings.length === expected.rankings.length &&
      actual.rankings.every((entry, index) => {
        const expectedEntry = expected.rankings[index];
        return expectedEntry !== undefined && sameRanking(entry, expectedEntry);
      })
    );
  }
  if (expected.reason === "STALEMATE") {
    return false;
  }
  return (
    actual.playerResults.length === expected.playerResults.length &&
    actual.playerResults.every((entry, index) => {
      const expectedEntry = expected.playerResults[index];
      return expectedEntry !== undefined && samePlayerResult(entry, expectedEntry);
    })
  );
}

function cloneValidatedResult(
  state: NumberTileGameState,
  turnOrder: readonly PlayerId[],
  racks: ReadonlyMap<PlayerId, readonly TileId[]>,
  tilesById: ReadonlyMap<TileId, NumberTile>,
  forfeitedPlayerIds: ReadonlySet<PlayerId>,
): NumberTileGameResult {
  if (state.result === null) {
    throw new Error("Finished Number Tile state requires a result.");
  }
  if ("rankingMode" in state.result) {
    const expected = createNumberPlacementResult(state, state.result.reason, parse(ServerTimeSchema, state.result.finishedAt));
    if (!sameResult(state.result, expected)) throw new Error("Number placement result does not match canonical state.");
    return expected;
  }
  const input = {
    playerIds: turnOrder,
    racks,
    tilesById,
    forfeitedPlayerIds,
    finishedAt: parse(ServerTimeSchema, state.result.finishedAt),
  } as const;
  let expected: NumberTileGameResult;
  if (state.result.reason === "RACK_EMPTY") {
    const winnerPlayerId = state.result.winnerPlayerIds[0];
    if (
      winnerPlayerId === undefined ||
      state.result.winnerPlayerIds.length !== 1
    ) {
      throw new Error("Number Tile rack-empty result requires one winner.");
    }
    expected = createNumberTileRackEmptyResult(input, winnerPlayerId);
  } else if (state.result.reason === "LAST_PLAYER_STANDING") {
    expected = createNumberTileLastPlayerStandingResult(input);
  } else if (state.result.reason === "STALEMATE") {
    expected = createNumberTileStalemateResult(input);
  } else {
    throw new Error("Unsupported Number Tile result reason.");
  }
  if (!sameResult(state.result, expected)) {
    throw new Error("Number Tile result does not match canonical state.");
  }
  return expected;
}

export class NumberTileGameStateAdapter implements NumberTileGameStateStorage {
  readonly gameType = "NUMBER_TILE" as const;

  constructor() {
    Object.freeze(this);
  }

  cloneAndValidate(state: NumberTileGameState): NumberTileGameState {
    if (state.rulesVersion !== NUMBER_TILE_RULES_VERSION) {
      throw new Error("Unsupported Number Tile rules version.");
    }
    const gameId = parse(GameIdSchema, state.gameId);
    const gameRevision = parse(GameRevisionSchema, state.gameRevision);
    const turnOrder = Object.freeze(
      state.turnOrder.map((playerId) => parse(PlayerIdSchema, playerId)),
    );
    if (
      turnOrder.length < NUMBER_TILE_RULES.minPlayers ||
      turnOrder.length > NUMBER_TILE_RULES.maxPlayers ||
      new Set(turnOrder).size !== turnOrder.length
    ) {
      throw new Error("Number Tile turn order is invalid.");
    }

    const tilesById = cloneTiles(state.tilesById);
    const pool = Object.freeze(
      state.pool.map((tileId) => parse(TileIdSchema, tileId)),
    );
    const racks = clonePlayerMap(
      state.racks,
      turnOrder,
      (rack) => Object.freeze(rack.map((tileId) => parse(TileIdSchema, tileId))),
      "Number Tile racks",
    );
    const initialMeldCompleted = clonePlayerMap(
      state.initialMeldCompleted,
      turnOrder,
      (completed) => {
        if (typeof completed !== "boolean") {
          throw new TypeError("Number Tile initial-meld state must be boolean.");
        }
        return completed;
      },
      "Number Tile initial-meld state",
    );
    const offlineTimeoutStreakByPlayerId = clonePlayerMap(
      state.offlineTimeoutStreakByPlayerId,
      turnOrder,
      (streak) => {
        requireNonNegativeSafeInteger(streak, "Number Tile offline timeout streak");
        if (streak > 2) {
          throw new RangeError("Number Tile offline timeout streak must not exceed two.");
        }
        return streak;
      },
      "Number Tile offline timeout state",
    );
    const forfeitedPlayerIds = createNumberTileReadonlyPlayerSet(
      [...state.forfeitedPlayerIds].map((playerId) =>
        parse(PlayerIdSchema, playerId),
      ),
    );
    if (
      [...forfeitedPlayerIds].some((playerId) => !turnOrder.includes(playerId))
    ) {
      throw new Error("Number Tile forfeit state references an unknown Player.");
    }
    const noPlayPlayerIds = Object.freeze(
      state.noPlayPlayerIds.map((playerId) => parse(PlayerIdSchema, playerId)),
    );
    const placementOrder = state.placementOrder === undefined ? undefined : Object.freeze(state.placementOrder.map(id => parse(PlayerIdSchema, id)));
    if (placementOrder !== undefined && (new Set(placementOrder).size !== placementOrder.length || placementOrder.some(id => !turnOrder.includes(id) || forfeitedPlayerIds.has(id) || racks.get(id)?.length !== 0))) throw new Error("Invalid Number placement history.");
    const ineligible = numberIneligiblePlayers({ forfeitedPlayerIds, ...(placementOrder === undefined ? {} : { placementOrder }) });
    const canonicalNoPlayPlayerIds = pruneNumberTileNoPlayTracker(
      turnOrder,
      ineligible,
      noPlayPlayerIds,
    );
    if (
      canonicalNoPlayPlayerIds.length !== noPlayPlayerIds.length ||
      canonicalNoPlayPlayerIds.some(
        (playerId, index) => playerId !== noPlayPlayerIds[index],
      )
    ) {
      throw new Error("Number Tile no-play tracker is not canonical.");
    }
    if (pool.length > 0 && noPlayPlayerIds.length > 0) {
      throw new Error(
        "Number Tile no-play tracker requires an empty pool.",
      );
    }
    if (
      turnOrder.some(
        (playerId) =>
          offlineTimeoutStreakByPlayerId.get(playerId) === 2 &&
          !forfeitedPlayerIds.has(playerId),
      )
    ) {
      throw new Error(
        "A second Number Tile offline timeout must forfeit the Player.",
      );
    }

    const table = cloneTable(state.table, tilesById);
    validateConservation(tilesById, pool, racks, table);
    const base = {
      gameId,
      gameRevision,
      rulesVersion: NUMBER_TILE_RULES_VERSION,
      tilesById,
      pool,
      racks,
      table,
      initialMeldCompleted,
      offlineTimeoutStreakByPlayerId,
      turnOrder,
      forfeitedPlayerIds,
      noPlayPlayerIds,
    } as const;

    if (placementOrder !== undefined) {
      const placedBase = { ...base, placementOrder };
      if (state.turn === null) {
        if (state.result === null || !("rankingMode" in state.result)) throw new Error("Placement game requires placement result.");
        const candidate = { ...placedBase, turn: null, result: state.result };
        return Object.freeze({ ...candidate, result: cloneValidatedResult(candidate, turnOrder, racks, tilesById, forfeitedPlayerIds) });
      }
      const turn = cloneTurn(state.turn);
      const active = numberActivePlayers(placedBase);
      if (state.result !== null || active.length < 2 || !active.includes(turn.activePlayerId) || active.some(id => racks.get(id)?.length === 0) || pool.length === 0 && active.every(id => noPlayPlayerIds.includes(id))) throw new Error("Invalid active placement game.");
      return Object.freeze({ ...placedBase, turn, result: null });
    }

    if (state.turn === null) {
      const result = cloneValidatedResult(
        state,
        turnOrder,
        racks,
        tilesById,
        forfeitedPlayerIds,
      );
      const emptyRackPlayerIds = turnOrder.filter(
        (playerId) => racks.get(playerId)?.length === 0,
      );
      const finish = evaluateNumberTileFinish({
        turnOrder,
        forfeitedPlayerIds,
        noPlayPlayerIds,
        poolTileCount: pool.length,
        rackEmptyPlayerId:
          emptyRackPlayerIds.length === 1 ? emptyRackPlayerIds[0]! : null,
      });
      if (finish?.reason !== result.reason) {
        throw new Error("Number Tile terminal state and result disagree.");
      }
      return Object.freeze({ ...base, turn: null, result });
    }

    if (state.result !== null) {
      throw new Error("Active Number Tile state must not contain a result.");
    }
    const turn = cloneTurn(state.turn);
    if (
      !turnOrder.includes(turn.activePlayerId) ||
      forfeitedPlayerIds.has(turn.activePlayerId)
    ) {
      throw new Error("Number Tile active Turn Player is invalid.");
    }
    const emptyRackPlayerIds = turnOrder.filter(
      (playerId) => racks.get(playerId)?.length === 0,
    );
    const terminal = evaluateNumberTileFinish({
      turnOrder,
      forfeitedPlayerIds,
      noPlayPlayerIds,
      poolTileCount: pool.length,
      rackEmptyPlayerId:
        emptyRackPlayerIds.length === 1 ? emptyRackPlayerIds[0]! : null,
    });
    if (emptyRackPlayerIds.length > 1 || terminal !== null) {
      throw new Error("Active Number Tile state contains a terminal condition.");
    }
    return Object.freeze({ ...base, turn, result: null });
  }

  inspectLifecycle(
    state: NumberTileGameState,
  ): NumberTileGameLifecycleInspection {
    if (state.turn === null) {
      if (state.result === null) {
        throw new TypeError("Number Tile GameState lifecycle is invalid.");
      }
      return Object.freeze({
        lifecycle: "FINISHED",
        gameId: state.gameId,
        finishedAt: state.result.finishedAt,
      });
    }
    if (state.result !== null) {
      throw new TypeError("Number Tile GameState lifecycle is invalid.");
    }
    return Object.freeze({
      lifecycle: "RUNNING",
      gameId: state.gameId,
      gameRevision: state.gameRevision,
      activeTurn: Object.freeze({
        turnId: state.turn.turnId,
        deadlineAt: state.turn.deadlineAt,
      }),
    });
  }
}
