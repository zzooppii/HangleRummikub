import {
  GameIdSchema,
  GameRevisionSchema,
  PlayerIdSchema,
  ServerTimeSchema,
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
  FisherYatesRandomIndexError,
  shuffleFrozen,
} from "../../../domain/frozen-fisher-yates.js";
import type {
  Clock,
  IdGenerator,
  RandomSource,
} from "../../../ports/system.js";
import type { NumberTileGameResult } from "./result-engine.js";
import { createNumberTileReadonlyPlayerSet } from "./stalemate.js";
import {
  createEmptyNumberTileTable,
  type NumberTileTable,
} from "./table.js";
import {
  NUMBER_TILE_INVENTORY_TOTALS,
  NUMBER_TILE_INVENTORY_VERSION,
  createCanonicalNumberTileInventory,
} from "./tile-inventory.js";
import type { NumberTile } from "./tile.js";

export const NUMBER_TILE_RULES_VERSION = "number-tile-rules-v1";

export const NUMBER_TILE_RULES = Object.freeze({
  rulesVersion: NUMBER_TILE_RULES_VERSION,
  tileInventoryVersion: NUMBER_TILE_INVENTORY_VERSION,
  minPlayers: 2,
  maxPlayers: 4,
  initialRackSize: 14,
  initialMeldMinimumValue: 30,
  turnDurationMs: 90_000,
  jokerPenalty: 30,
});

export type NumberTileTurn = Readonly<{
  turnId: TurnId;
  turnNumber: number;
  activePlayerId: PlayerId;
  startedAt: ServerTime;
  deadlineAt: ServerTime;
}>;

type NumberTileGameStateBase = Readonly<{
  gameId: GameId;
  gameRevision: GameRevision;
  rulesVersion: typeof NUMBER_TILE_RULES_VERSION;
  tilesById: ReadonlyMap<TileId, NumberTile>;
  /** Server-private single pool; a later application action selects the draw. */
  pool: readonly TileId[];
  racks: ReadonlyMap<PlayerId, readonly TileId[]>;
  table: NumberTileTable;
  initialMeldCompleted: ReadonlyMap<PlayerId, boolean>;
  /** Number-game state only; connected/offline presence remains platform-owned. */
  offlineTimeoutStreakByPlayerId: ReadonlyMap<PlayerId, number>;
  /** The immutable order chosen once at game start. */
  turnOrder: readonly PlayerId[];
  forfeitedPlayerIds: ReadonlySet<PlayerId>;
  /** Eligible players already counted in the current pool-empty no-play cycle. */
  noPlayPlayerIds: readonly PlayerId[];
}>;

export type PlayingNumberTileGameState = NumberTileGameStateBase &
  Readonly<{
    turn: NumberTileTurn;
    result: null;
  }>;

export type FinishedNumberTileGameState = NumberTileGameStateBase &
  Readonly<{
    turn: null;
    result: NumberTileGameResult;
  }>;

export type NumberTileGameState =
  | PlayingNumberTileGameState
  | FinishedNumberTileGameState;

export type NumberTileSetupIdGenerator = Pick<
  IdGenerator,
  "generateGameId" | "generateTurnId" | "generateTileId"
>;

export type CreateInitialNumberTileGameStateInput = Readonly<{
  playerIds: readonly PlayerId[];
  idGenerator: NumberTileSetupIdGenerator;
  randomSource: RandomSource;
  clock: Pick<Clock, "now">;
}>;

class NumberTileReadonlyMap<TKey, TValue>
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

function createReadonlyMap<TKey, TValue>(
  entries: Iterable<readonly [TKey, TValue]>,
): ReadonlyMap<TKey, TValue> {
  return new NumberTileReadonlyMap(entries);
}

function shuffleNumberTileValues<TValue>(
  values: readonly TValue[],
  randomSource: RandomSource,
): readonly TValue[] {
  try {
    return shuffleFrozen(values, randomSource);
  } catch (error) {
    if (error instanceof FisherYatesRandomIndexError) {
      throw new RangeError(
        "RandomSource returned an index outside the Number Tile shuffle range.",
      );
    }
    throw error;
  }
}

function requirePlayers(playerIds: readonly PlayerId[]): void {
  if (
    playerIds.length < NUMBER_TILE_RULES.minPlayers ||
    playerIds.length > NUMBER_TILE_RULES.maxPlayers
  ) {
    throw new RangeError(
      `Number Tile requires ${NUMBER_TILE_RULES.minPlayers}-${NUMBER_TILE_RULES.maxPlayers} players.`,
    );
  }
  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("Number Tile playerIds must be unique.");
  }
}

function addTurnDuration(startedAt: ServerTime): ServerTime {
  const deadlineAt = startedAt + NUMBER_TILE_RULES.turnDurationMs;
  if (!Number.isSafeInteger(deadlineAt)) {
    throw new RangeError("Number Tile turn deadline must be a safe integer.");
  }
  return parse(ServerTimeSchema, deadlineAt);
}

/** Exact server-authoritative boundary: equality is already expired. */
export function isNumberTileActionBeforeDeadline(
  receivedAt: ServerTime,
  deadlineAt: ServerTime,
): boolean {
  return (
    parse(ServerTimeSchema, receivedAt) < parse(ServerTimeSchema, deadlineAt)
  );
}

function assertInitialConservation(
  tilesById: ReadonlyMap<TileId, NumberTile>,
  pool: readonly TileId[],
  racks: ReadonlyMap<PlayerId, readonly TileId[]>,
): void {
  const locatedTileIds = [...pool, ...[...racks.values()].flat()];
  const uniqueLocatedTileIds = new Set(locatedTileIds);
  if (
    tilesById.size !== NUMBER_TILE_INVENTORY_TOTALS.total ||
    locatedTileIds.length !== NUMBER_TILE_INVENTORY_TOTALS.total ||
    uniqueLocatedTileIds.size !== NUMBER_TILE_INVENTORY_TOTALS.total
  ) {
    throw new Error("Initial Number Tile state violated physical conservation.");
  }
  for (const tileId of uniqueLocatedTileIds) {
    if (!tilesById.has(tileId)) {
      throw new Error("Initial Number Tile state contains an unknown tileId.");
    }
  }
}

/**
 * Pure deterministic setup. Runtime time, identity, and randomness all enter
 * through narrow injected ports; Room/connection/scheduler state is absent.
 */
export function createInitialNumberTileGameState(
  input: CreateInitialNumberTileGameStateInput,
): PlayingNumberTileGameState {
  const playerIds = Object.freeze(
    input.playerIds.map((playerId) => parse(PlayerIdSchema, playerId)),
  );
  requirePlayers(playerIds);

  // Capture one authoritative instant so turn fields cannot drift internally.
  const startedAt = parse(ServerTimeSchema, input.clock.now());
  const inventory = createCanonicalNumberTileInventory(input.idGenerator);
  const tilesById = createReadonlyMap(
    inventory.map((tile) => [tile.tileId, tile] as const),
  );
  const pool = [
    ...shuffleNumberTileValues(
      inventory.map((tile) => tile.tileId),
      input.randomSource,
    ),
  ];

  const racks = new Map<PlayerId, readonly TileId[]>();
  const initialMeldCompleted = new Map<PlayerId, boolean>();
  const offlineTimeoutStreakByPlayerId = new Map<PlayerId, number>();
  for (const playerId of playerIds) {
    const rack: TileId[] = [];
    for (
      let drawIndex = 0;
      drawIndex < NUMBER_TILE_RULES.initialRackSize;
      drawIndex += 1
    ) {
      const tileId = pool.pop();
      if (tileId === undefined) {
        throw new Error("Number Tile pool was exhausted during initial deal.");
      }
      rack.push(tileId);
    }
    racks.set(playerId, Object.freeze(rack));
    initialMeldCompleted.set(playerId, false);
    offlineTimeoutStreakByPlayerId.set(playerId, 0);
  }

  const turnOrder = shuffleNumberTileValues(playerIds, input.randomSource);
  const activePlayerId = turnOrder[0];
  if (activePlayerId === undefined) {
    throw new Error("Number Tile initial turn requires an active player.");
  }

  const frozenRacks = createReadonlyMap(racks);
  const frozenPool = Object.freeze(pool);
  assertInitialConservation(tilesById, frozenPool, frozenRacks);

  return Object.freeze({
    gameId: parse(GameIdSchema, input.idGenerator.generateGameId()),
    gameRevision: parse(GameRevisionSchema, 0),
    rulesVersion: NUMBER_TILE_RULES_VERSION,
    tilesById,
    pool: frozenPool,
    racks: frozenRacks,
    table: createEmptyNumberTileTable(),
    initialMeldCompleted: createReadonlyMap(initialMeldCompleted),
    offlineTimeoutStreakByPlayerId: createReadonlyMap(
      offlineTimeoutStreakByPlayerId,
    ),
    turnOrder,
    forfeitedPlayerIds: createNumberTileReadonlyPlayerSet(),
    noPlayPlayerIds: Object.freeze([]),
    turn: Object.freeze({
      turnId: parse(TurnIdSchema, input.idGenerator.generateTurnId()),
      turnNumber: 1,
      activePlayerId,
      startedAt,
      deadlineAt: addTurnDuration(startedAt),
    }),
    result: null,
  });
}
