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
  createAllPlayersForfeitedResult,
  createLastPlayerStandingResult,
  createRackEmptyResult,
  createStalemateResult,
  createTimeLimitResult,
  type GameResult,
} from "./result-engine.js";
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

export type {
  GameFinishReason,
  GameRankingEntry,
  GameResult,
} from "./result-engine.js";

type GameStateBase = Readonly<{
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
  /** Server-only consecutive timeout count while the Player was OFFLINE. */
  offlineTimeoutStreakByPlayerId: ReadonlyMap<PlayerId, number>;
  /** Original turnOrder remains immutable; active rotation skips this set. */
  forfeitedPlayerIds: ReadonlySet<PlayerId>;
  /** Server-only participants in the current consecutive no-move cycle. */
  noMoveTurnEndPlayerIds: ReadonlySet<PlayerId>;
  turnOrder: readonly PlayerId[];
  gameStartedAt: ServerTime;
  gameDeadlineAt: ServerTime;
}>;

export type PlayingGameState = GameStateBase &
  Readonly<{
    turn: GameTurn;
    result: null;
  }>;

export type FinishedGameState = GameStateBase &
  Readonly<{
    /** A terminal Game has no active or next Turn. */
    turn: null;
    result: GameResult;
  }>;

export type GameState = PlayingGameState | FinishedGameState;

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

function requireNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function cloneValidatedGameResult(gameState: FinishedGameState): GameResult {
  const input = {
    playerIds: gameState.turnOrder,
    racks: gameState.racks,
    tilesById: gameState.tilesById,
    forfeitedPlayerIds: gameState.forfeitedPlayerIds,
    finishedAt: gameState.result.finishedAt,
  } as const;
  let expected: GameResult;
  switch (gameState.result.reason) {
    case "RACK_EMPTY": {
      const winnerPlayerId = gameState.result.winnerPlayerIds[0];
      if (
        winnerPlayerId === undefined ||
        gameState.result.winnerPlayerIds.length !== 1
      ) {
        throw new Error("Rack-empty result requires exactly one winner.");
      }
      expected = createRackEmptyResult(input, winnerPlayerId);
      break;
    }
    case "TIME_LIMIT":
      expected = createTimeLimitResult(input);
      break;
    case "STALEMATE":
      expected = createStalemateResult(input);
      break;
    case "LAST_PLAYER_STANDING":
      expected = createLastPlayerStandingResult(input);
      break;
    case "ALL_PLAYERS_FORFEITED":
      expected = createAllPlayersForfeitedResult(input);
      break;
  }
  const sameResult =
    gameState.result.reason === expected.reason &&
    gameState.result.finishedAt === expected.finishedAt &&
    gameState.result.winnerPlayerIds.length === expected.winnerPlayerIds.length &&
    gameState.result.winnerPlayerIds.every(
      (playerId, index) => playerId === expected.winnerPlayerIds[index],
    ) &&
    gameState.result.rankings.length === expected.rankings.length &&
    gameState.result.rankings.every((entry, index) => {
      const expectedEntry = expected.rankings[index];
      return (
        expectedEntry !== undefined &&
        entry.playerId === expectedEntry.playerId &&
        entry.rank === expectedEntry.rank &&
        entry.score === expectedEntry.score &&
        entry.remainingRackCount === expectedEntry.remainingRackCount &&
        entry.penaltyCost === expectedEntry.penaltyCost &&
        entry.forfeited === expectedEntry.forfeited
      );
    });
  if (!sameResult) {
    throw new Error("Terminal Game result does not match canonical state.");
  }
  return expected;
}

export function cloneGameState(gameState: PlayingGameState): PlayingGameState;
export function cloneGameState(gameState: FinishedGameState): FinishedGameState;
export function cloneGameState(gameState: GameState): GameState;
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
  const clonedOfflineTimeoutStreaks = [
    ...gameState.offlineTimeoutStreakByPlayerId,
  ].map(([playerId, streak]) => {
    requireNonNegativeSafeInteger(streak, "offline timeout streak");
    if (streak > 2) {
      throw new RangeError("Offline timeout streak must not exceed two.");
    }
    return [playerId, streak] as const;
  });
  const forfeitedPlayerIds = new Set(gameState.forfeitedPlayerIds);
  const noMoveTurnEndPlayerIds = new Set(gameState.noMoveTurnEndPlayerIds);

  if (
    clonedOfflineTimeoutStreaks.length !== gameState.turnOrder.length ||
    !gameState.turnOrder.every((playerId) =>
      gameState.offlineTimeoutStreakByPlayerId.has(playerId),
    ) ||
    [...gameState.offlineTimeoutStreakByPlayerId.keys()].some(
      (playerId) => !gameState.turnOrder.includes(playerId),
    ) ||
    [...forfeitedPlayerIds].some(
      (playerId) => !gameState.turnOrder.includes(playerId),
    ) ||
    [...noMoveTurnEndPlayerIds].some(
      (playerId) =>
        !gameState.turnOrder.includes(playerId) ||
        forfeitedPlayerIds.has(playerId),
    )
  ) {
    throw new Error(
      "Player timeout/forfeit state must match the complete turn order.",
    );
  }

  const base = {
    gameId: gameState.gameId,
    gameRevision: gameState.gameRevision,
    rulesConfig: cloneRulesConfig(gameState.rulesConfig),
    tilesById: createReadonlyMap(clonedTiles),
    consonantBag: Object.freeze([...gameState.consonantBag]),
    vowelBag: Object.freeze([...gameState.vowelBag]),
    racks: createReadonlyMap(clonedRacks),
    board: cloneBoard(gameState.board),
    initialMeldCompleted: createReadonlyMap(clonedMeldStatus),
    offlineTimeoutStreakByPlayerId: createReadonlyMap(
      clonedOfflineTimeoutStreaks,
    ),
    forfeitedPlayerIds: Object.freeze(forfeitedPlayerIds),
    noMoveTurnEndPlayerIds: Object.freeze(noMoveTurnEndPlayerIds),
    turnOrder: Object.freeze([...gameState.turnOrder]),
    gameStartedAt: gameState.gameStartedAt,
    gameDeadlineAt: gameState.gameDeadlineAt,
  };

  if (gameState.turn === null) {
    const scorePlayerIds = gameState.result.rankings.map(
      (entry) => entry.playerId,
    );
    if (
      scorePlayerIds.length !== gameState.turnOrder.length ||
      new Set(scorePlayerIds).size !== scorePlayerIds.length ||
      !gameState.turnOrder.every((playerId) => scorePlayerIds.includes(playerId))
    ) {
      throw new Error(
        "A terminal Game result must score every turn-order Player once.",
      );
    }
    return Object.freeze({
      ...base,
      turn: null,
      result: cloneValidatedGameResult(gameState),
    });
  }

  if (gameState.result !== null) {
    throw new Error("An active Game must not contain a terminal result.");
  }
  if (gameState.forfeitedPlayerIds.has(gameState.turn.activePlayerId)) {
    throw new Error("An active Turn cannot belong to a forfeited Player.");
  }
  if (
    gameState.turnOrder.every((playerId) =>
      gameState.forfeitedPlayerIds.has(playerId),
    )
  ) {
    throw new Error("An active Game must have a non-forfeited Player.");
  }

  return Object.freeze({
    ...base,
    turn: Object.freeze({
      turnId: gameState.turn.turnId,
      turnNumber: gameState.turn.turnNumber,
      activePlayerId: gameState.turn.activePlayerId,
      startedAt: gameState.turn.startedAt,
      deadlineAt: gameState.turn.deadlineAt,
    }),
    result: null,
  });
}

export function createInitialGameState(
  input: CreateInitialGameStateInput,
): PlayingGameState {
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
  const offlineTimeoutStreakByPlayerId = new Map<PlayerId, number>();
  for (const playerId of playerIds) {
    const rack: TileId[] = [];
    drawIntoRack(consonantBag, rack, rulesConfig.initialRack.consonants);
    drawIntoRack(vowelBag, rack, rulesConfig.initialRack.vowels);
    racks.set(playerId, Object.freeze(rack));
    initialMeldCompleted.set(playerId, false);
    offlineTimeoutStreakByPlayerId.set(playerId, 0);
  }

  const turnOrder = fisherYatesShuffle(playerIds, input.randomSource);
  const activePlayerId = turnOrder[0];
  if (activePlayerId === undefined) {
    throw new Error("Initial turn requires an active Player.");
  }

  const gameState: PlayingGameState = Object.freeze({
    gameId: input.idGenerator.generateGameId(),
    gameRevision: parse(GameRevisionSchema, 0),
    rulesConfig,
    tilesById,
    consonantBag: Object.freeze(consonantBag),
    vowelBag: Object.freeze(vowelBag),
    racks: createReadonlyMap(racks),
    board: Object.freeze({ wordGroups: Object.freeze([]) }),
    initialMeldCompleted: createReadonlyMap(initialMeldCompleted),
    offlineTimeoutStreakByPlayerId: createReadonlyMap(
      offlineTimeoutStreakByPlayerId,
    ),
    forfeitedPlayerIds: Object.freeze(new Set<PlayerId>()),
    noMoveTurnEndPlayerIds: Object.freeze(new Set<PlayerId>()),
    turnOrder,
    turn: Object.freeze({
      turnId: input.idGenerator.generateTurnId(),
      turnNumber: 1,
      activePlayerId,
      startedAt: gameStartedAt,
      deadlineAt: addDuration(gameStartedAt, rulesConfig.turnDurationMs),
    }),
    result: null,
    gameStartedAt,
    gameDeadlineAt: addDuration(gameStartedAt, rulesConfig.gameDurationMs),
  });

  assertInitialTileConservation(gameState);
  return gameState;
}
