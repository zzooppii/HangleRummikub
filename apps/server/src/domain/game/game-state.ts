import {
  GameRevisionSchema,
  ServerTimeSchema,
  type GameId,
  type GameRevision,
  type PlayerId,
  type ServerTime,
  type TileId,
  type TurnId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import type { IdGenerator, RandomSource } from "../../ports/system.js";
import type {
  Board,
  BoardSyllable,
  BoardTilePlacement,
  WordGroup,
} from "./board.js";
import {
  TILE_INVENTORY_TOTALS,
  TILE_INVENTORY_VERSION,
  cloneTileInstance,
  createCanonicalTileInstances,
  type TileInstance,
} from "./tile-inventory.js";

export const RULES_VERSION = "hangul-rummikub-rules-v1";
export const DICTIONARY_VERSION = "test-dictionary-v1";
export const JOKER_RULES_VERSION = "hangul-joker-rules-v1";

export type RulesConfig = Readonly<{
  rulesVersion: string;
  dictionaryVersion: string;
  tileInventoryVersion: string;
  minPlayers: number;
  maxPlayers: number;
  turnDurationMs: number;
  gameDurationMs: number;
  initialRack: Readonly<{
    consonants: number;
    vowels: number;
  }>;
  initialMeld: Readonly<{
    minimumTileCount: number;
    minimumWordSyllables: number;
  }>;
  timeoutPenaltyTileCount: number;
  jokerRulesVersion: string;
}>;

export type GameTurn = Readonly<{
  turnId: TurnId;
  turnNumber: number;
  activePlayerId: PlayerId;
  startedAt: ServerTime;
  deadlineAt: ServerTime;
}>;

export type GameState = Readonly<{
  gameId: GameId;
  gameRevision: GameRevision;
  rulesConfig: RulesConfig;
  tilesById: ReadonlyMap<TileId, TileInstance>;
  /** The last element is the next server-authoritative draw. */
  consonantBag: readonly TileId[];
  /** The last element is the next server-authoritative draw. */
  vowelBag: readonly TileId[];
  racks: ReadonlyMap<PlayerId, readonly TileId[]>;
  board: Board;
  initialMeldCompleted: ReadonlyMap<PlayerId, boolean>;
  turnOrder: readonly PlayerId[];
  turn: GameTurn;
  gameStartedAt: ServerTime;
  gameDeadlineAt: ServerTime;
}>;

export type CreateInitialGameStateInput = Readonly<{
  playerIds: readonly PlayerId[];
  startedAt: ServerTime;
  idGenerator: IdGenerator;
  randomSource: RandomSource;
  rulesConfig?: RulesConfig;
}>;

const DEFAULT_RULES_CONFIG: RulesConfig = Object.freeze({
  rulesVersion: RULES_VERSION,
  dictionaryVersion: DICTIONARY_VERSION,
  tileInventoryVersion: TILE_INVENTORY_VERSION,
  minPlayers: 2,
  maxPlayers: 4,
  turnDurationMs: 60_000,
  gameDurationMs: 1_500_000,
  initialRack: Object.freeze({
    consonants: 7,
    vowels: 7,
  }),
  initialMeld: Object.freeze({
    minimumTileCount: 6,
    minimumWordSyllables: 2,
  }),
  timeoutPenaltyTileCount: 3,
  jokerRulesVersion: JOKER_RULES_VERSION,
});

function matchesDefaultRulesConfig(config: RulesConfig): boolean {
  return (
    config.rulesVersion === DEFAULT_RULES_CONFIG.rulesVersion &&
    config.dictionaryVersion === DEFAULT_RULES_CONFIG.dictionaryVersion &&
    config.tileInventoryVersion === DEFAULT_RULES_CONFIG.tileInventoryVersion &&
    config.minPlayers === DEFAULT_RULES_CONFIG.minPlayers &&
    config.maxPlayers === DEFAULT_RULES_CONFIG.maxPlayers &&
    config.turnDurationMs === DEFAULT_RULES_CONFIG.turnDurationMs &&
    config.gameDurationMs === DEFAULT_RULES_CONFIG.gameDurationMs &&
    config.initialRack.consonants ===
      DEFAULT_RULES_CONFIG.initialRack.consonants &&
    config.initialRack.vowels === DEFAULT_RULES_CONFIG.initialRack.vowels &&
    config.initialMeld.minimumTileCount ===
      DEFAULT_RULES_CONFIG.initialMeld.minimumTileCount &&
    config.initialMeld.minimumWordSyllables ===
      DEFAULT_RULES_CONFIG.initialMeld.minimumWordSyllables &&
    config.timeoutPenaltyTileCount ===
      DEFAULT_RULES_CONFIG.timeoutPenaltyTileCount &&
    config.jokerRulesVersion === DEFAULT_RULES_CONFIG.jokerRulesVersion
  );
}

export function cloneRulesConfig(config: RulesConfig): RulesConfig {
  if (!matchesDefaultRulesConfig(config)) {
    throw new Error("Unsupported RulesConfig snapshot.");
  }

  return Object.freeze({
    rulesVersion: config.rulesVersion,
    dictionaryVersion: config.dictionaryVersion,
    tileInventoryVersion: config.tileInventoryVersion,
    minPlayers: config.minPlayers,
    maxPlayers: config.maxPlayers,
    turnDurationMs: config.turnDurationMs,
    gameDurationMs: config.gameDurationMs,
    initialRack: Object.freeze({
      consonants: config.initialRack.consonants,
      vowels: config.initialRack.vowels,
    }),
    initialMeld: Object.freeze({
      minimumTileCount: config.initialMeld.minimumTileCount,
      minimumWordSyllables: config.initialMeld.minimumWordSyllables,
    }),
    timeoutPenaltyTileCount: config.timeoutPenaltyTileCount,
    jokerRulesVersion: config.jokerRulesVersion,
  });
}

export function createDefaultRulesConfig(): RulesConfig {
  return cloneRulesConfig(DEFAULT_RULES_CONFIG);
}

/** Returns a frozen shuffled copy and never changes the caller's collection. */
export function fisherYatesShuffle<TValue>(
  values: readonly TValue[],
  randomSource: RandomSource,
): readonly TValue[] {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selectedIndex = randomSource.nextInt(index + 1);
    if (
      !Number.isSafeInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex > index
    ) {
      throw new RangeError(
        "RandomSource returned an index outside the Fisher-Yates range.",
      );
    }

    const currentValue = shuffled[index]!;
    shuffled[index] = shuffled[selectedIndex]!;
    shuffled[selectedIndex] = currentValue;
  }

  return Object.freeze(shuffled);
}

function createReadonlyMap<TKey, TValue>(
  entries: Iterable<readonly [TKey, TValue]>,
): ReadonlyMap<TKey, TValue> {
  return Object.freeze(new Map(entries));
}

function addDuration(startedAt: ServerTime, durationMs: number): ServerTime {
  const deadline = startedAt + durationMs;
  if (!Number.isSafeInteger(deadline)) {
    throw new RangeError("Game deadline must be a safe integer timestamp.");
  }
  return parse(ServerTimeSchema, deadline);
}

function assertPlayers(
  playerIds: readonly PlayerId[],
  rulesConfig: RulesConfig,
): void {
  if (
    playerIds.length < rulesConfig.minPlayers ||
    playerIds.length > rulesConfig.maxPlayers
  ) {
    throw new RangeError(
      `Game requires ${rulesConfig.minPlayers}-${rulesConfig.maxPlayers} players.`,
    );
  }

  if (new Set(playerIds).size !== playerIds.length) {
    throw new Error("Game playerIds must be unique.");
  }
}

function drawIntoRack(
  bag: TileId[],
  rack: TileId[],
  drawCount: number,
): void {
  for (let drawIndex = 0; drawIndex < drawCount; drawIndex += 1) {
    const tileId = bag.pop();
    if (tileId === undefined) {
      throw new Error("Canonical Tile bag was exhausted during initial deal.");
    }
    rack.push(tileId);
  }
}

function clonePlacement(placement: BoardTilePlacement): BoardTilePlacement {
  return Object.freeze({
    tileId: placement.tileId,
    assignedSymbol: placement.assignedSymbol,
  });
}

function cloneSyllable(syllable: BoardSyllable): BoardSyllable {
  return Object.freeze({
    choseong: Object.freeze(syllable.choseong.map(clonePlacement)),
    jungseong: Object.freeze(syllable.jungseong.map(clonePlacement)),
    jongseong: Object.freeze(syllable.jongseong.map(clonePlacement)),
  });
}

function cloneWordGroup(wordGroup: WordGroup): WordGroup {
  return Object.freeze({
    groupId: wordGroup.groupId,
    syllables: Object.freeze(wordGroup.syllables.map(cloneSyllable)),
  });
}

function cloneBoard(board: Board): Board {
  return Object.freeze({
    wordGroups: Object.freeze(board.wordGroups.map(cloneWordGroup)),
  });
}

function assertInitialTileConservation(gameState: GameState): void {
  const locatedTileIds = [
    ...gameState.consonantBag,
    ...gameState.vowelBag,
    ...[...gameState.racks.values()].flat(),
  ];
  const uniqueLocatedTileIds = new Set(locatedTileIds);

  if (
    locatedTileIds.length !== TILE_INVENTORY_TOTALS.grandTotal ||
    uniqueLocatedTileIds.size !== TILE_INVENTORY_TOTALS.grandTotal ||
    gameState.tilesById.size !== TILE_INVENTORY_TOTALS.grandTotal
  ) {
    throw new Error("Initial GameState violated Tile conservation.");
  }

  for (const tileId of uniqueLocatedTileIds) {
    if (!gameState.tilesById.has(tileId)) {
      throw new Error("Initial GameState contains an unknown located tileId.");
    }
  }
}

export function cloneGameState(gameState: GameState): GameState {
  const clonedTiles = [...gameState.tilesById].map(
    ([tileId, tile]) => [tileId, cloneTileInstance(tile)] as const,
  );
  const clonedRacks = [...gameState.racks].map(
    ([playerId, rack]) => [playerId, Object.freeze([...rack])] as const,
  );
  const clonedMeldStatus = [...gameState.initialMeldCompleted].map(
    ([playerId, completed]) => [playerId, completed] as const,
  );

  return Object.freeze({
    gameId: gameState.gameId,
    gameRevision: gameState.gameRevision,
    rulesConfig: cloneRulesConfig(gameState.rulesConfig),
    tilesById: createReadonlyMap(clonedTiles),
    consonantBag: Object.freeze([...gameState.consonantBag]),
    vowelBag: Object.freeze([...gameState.vowelBag]),
    racks: createReadonlyMap(clonedRacks),
    board: cloneBoard(gameState.board),
    initialMeldCompleted: createReadonlyMap(clonedMeldStatus),
    turnOrder: Object.freeze([...gameState.turnOrder]),
    turn: Object.freeze({
      turnId: gameState.turn.turnId,
      turnNumber: gameState.turn.turnNumber,
      activePlayerId: gameState.turn.activePlayerId,
      startedAt: gameState.turn.startedAt,
      deadlineAt: gameState.turn.deadlineAt,
    }),
    gameStartedAt: gameState.gameStartedAt,
    gameDeadlineAt: gameState.gameDeadlineAt,
  });
}

export function createInitialGameState(
  input: CreateInitialGameStateInput,
): GameState {
  const rulesConfig =
    input.rulesConfig === undefined
      ? createDefaultRulesConfig()
      : cloneRulesConfig(input.rulesConfig);
  const playerIds = Object.freeze([...input.playerIds]);
  const gameStartedAt = parse(ServerTimeSchema, input.startedAt);
  assertPlayers(playerIds, rulesConfig);

  const tileInstances = createCanonicalTileInstances(input.idGenerator);
  const tilesById = createReadonlyMap(
    tileInstances.map((tile) => [tile.tileId, tile] as const),
  );
  const consonantBag = [
    ...fisherYatesShuffle(
      tileInstances
        .filter((tile) => tile.sourceBag === "CONSONANT")
        .map((tile) => tile.tileId),
      input.randomSource,
    ),
  ];
  const vowelBag = [
    ...fisherYatesShuffle(
      tileInstances
        .filter((tile) => tile.sourceBag === "VOWEL")
        .map((tile) => tile.tileId),
      input.randomSource,
    ),
  ];

  const racks = new Map<PlayerId, readonly TileId[]>();
  const initialMeldCompleted = new Map<PlayerId, boolean>();
  for (const playerId of playerIds) {
    const rack: TileId[] = [];
    drawIntoRack(consonantBag, rack, rulesConfig.initialRack.consonants);
    drawIntoRack(vowelBag, rack, rulesConfig.initialRack.vowels);
    racks.set(playerId, Object.freeze(rack));
    initialMeldCompleted.set(playerId, false);
  }

  const turnOrder = fisherYatesShuffle(playerIds, input.randomSource);
  const activePlayerId = turnOrder[0];
  if (activePlayerId === undefined) {
    throw new Error("Initial turn requires an active Player.");
  }

  const gameState: GameState = Object.freeze({
    gameId: input.idGenerator.generateGameId(),
    gameRevision: parse(GameRevisionSchema, 0),
    rulesConfig,
    tilesById,
    consonantBag: Object.freeze(consonantBag),
    vowelBag: Object.freeze(vowelBag),
    racks: createReadonlyMap(racks),
    board: Object.freeze({ wordGroups: Object.freeze([]) }),
    initialMeldCompleted: createReadonlyMap(initialMeldCompleted),
    turnOrder,
    turn: Object.freeze({
      turnId: input.idGenerator.generateTurnId(),
      turnNumber: 1,
      activePlayerId,
      startedAt: gameStartedAt,
      deadlineAt: addDuration(gameStartedAt, rulesConfig.turnDurationMs),
    }),
    gameStartedAt,
    gameDeadlineAt: addDuration(gameStartedAt, rulesConfig.gameDurationMs),
  });

  assertInitialTileConservation(gameState);
  return gameState;
}
