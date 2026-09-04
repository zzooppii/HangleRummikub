import type {
  PlayerId,
  ServerTime,
  TileId,
} from "@hangul-rummikub/shared";

import type { TileInstance } from "./tile-inventory.js";

export type GameFinishReason =
  | "RACK_EMPTY"
  | "TIME_LIMIT"
  | "STALEMATE"
  | "LAST_PLAYER_STANDING"
  | "ALL_PLAYERS_FORFEITED";

export type GameRankingEntry = Readonly<{
  playerId: PlayerId;
  rank: number;
  score: number;
  remainingRackCount: number;
  penaltyCost: number;
  forfeited: boolean;
}>;

export type GameResult = Readonly<{
  reason: GameFinishReason;
  finishedAt: ServerTime;
  winnerPlayerIds: readonly PlayerId[];
  rankings: readonly GameRankingEntry[];
}>;

export type ResultEngineInput = Readonly<{
  playerIds: readonly PlayerId[];
  racks: ReadonlyMap<PlayerId, readonly TileId[]>;
  tilesById: ReadonlyMap<TileId, TileInstance>;
  forfeitedPlayerIds: ReadonlySet<PlayerId>;
  finishedAt: ServerTime;
}>;

type UnrankedEntry = Readonly<{
  playerId: PlayerId;
  score: number;
  remainingRackCount: number;
  penaltyCost: number;
  forfeited: boolean;
  order: number;
}>;

type RankedEntry = Readonly<{
  entry: UnrankedEntry;
  rankKey: readonly number[];
}>;

function compareRankKeys(
  left: readonly number[],
  right: readonly number[],
): number {
  for (let index = 0; index < left.length; index += 1) {
    const difference = left[index]! - right[index]!;
    if (difference !== 0) {
      return difference;
    }
  }
  return 0;
}

function sameRankKey(
  left: readonly number[],
  right: readonly number[],
): boolean {
  return compareRankKeys(left, right) === 0;
}

function rankEntries(
  entries: readonly RankedEntry[],
): readonly GameRankingEntry[] {
  const sorted = [...entries].sort((left, right) => {
    const rankDifference = compareRankKeys(left.rankKey, right.rankKey);
    return rankDifference !== 0
      ? rankDifference
      : left.entry.order - right.entry.order;
  });

  let previousKey: readonly number[] | undefined;
  let currentRank = 0;
  return Object.freeze(
    sorted.map(({ entry, rankKey }, index) => {
      if (previousKey === undefined || !sameRankKey(previousKey, rankKey)) {
        currentRank = index + 1;
        previousKey = rankKey;
      }

      return Object.freeze({
        playerId: entry.playerId,
        rank: currentRank,
        score: entry.score,
        remainingRackCount: entry.remainingRackCount,
        penaltyCost: entry.penaltyCost,
        forfeited: entry.forfeited,
      });
    }),
  );
}

function validateInput(input: ResultEngineInput): void {
  if (!Number.isSafeInteger(input.finishedAt) || input.finishedAt < 0) {
    throw new RangeError("Result finishedAt must be a non-negative safe integer.");
  }
  if (input.playerIds.length === 0) {
    throw new Error("A Game result requires at least one Player.");
  }
  if (new Set(input.playerIds).size !== input.playerIds.length) {
    throw new Error("Result playerIds must be unique.");
  }
  if (
    input.racks.size !== input.playerIds.length ||
    input.playerIds.some((playerId) => !input.racks.has(playerId)) ||
    [...input.racks.keys()].some(
      (playerId) => !input.playerIds.includes(playerId),
    )
  ) {
    throw new Error("Result racks must match the complete Player set.");
  }
  if (
    [...input.forfeitedPlayerIds].some(
      (playerId) => !input.playerIds.includes(playerId),
    )
  ) {
    throw new Error("A result cannot reference an unknown forfeited Player.");
  }
}

export function calculateRackPenalty(
  rackTileIds: readonly TileId[],
  tilesById: ReadonlyMap<TileId, TileInstance>,
): number {
  let penaltyCost = 0;
  for (const tileId of rackTileIds) {
    const tile = tilesById.get(tileId);
    if (tile === undefined) {
      throw new Error("A result rack references an unknown Tile.");
    }
    penaltyCost += tile.kind === "JOKER" ? 30 : 1;
  }
  return penaltyCost;
}

function createEntries(input: ResultEngineInput): readonly UnrankedEntry[] {
  validateInput(input);
  return Object.freeze(
    input.playerIds.map((playerId, order) => {
      const rack = input.racks.get(playerId);
      if (rack === undefined) {
        throw new Error("Result derivation missed a Player rack.");
      }
      const penaltyCost = calculateRackPenalty(rack, input.tilesById);
      return Object.freeze({
        playerId,
        score: penaltyCost === 0 ? 0 : -penaltyCost,
        remainingRackCount: rack.length,
        penaltyCost,
        forfeited: input.forfeitedPlayerIds.has(playerId),
        order,
      });
    }),
  );
}

function createResult(
  reason: GameFinishReason,
  finishedAt: ServerTime,
  winnerPlayerIds: readonly PlayerId[],
  rankings: readonly GameRankingEntry[],
): GameResult {
  return Object.freeze({
    reason,
    finishedAt,
    winnerPlayerIds: Object.freeze([...winnerPlayerIds]),
    rankings: Object.freeze([...rankings]),
  });
}

function createSingleWinnerRankings(
  entries: readonly UnrankedEntry[],
  winnerPlayerId: PlayerId,
): readonly GameRankingEntry[] {
  const winner = entries.find((entry) => entry.playerId === winnerPlayerId);
  if (winner === undefined) {
    throw new Error("The result winner must be a canonical Player.");
  }
  const losingPenaltyTotal = entries.reduce(
    (total, entry) =>
      entry.playerId === winnerPlayerId ? total : total + entry.penaltyCost,
    0,
  );
  const winnerRanking = Object.freeze({
    playerId: winner.playerId,
    rank: 1,
    score: losingPenaltyTotal,
    remainingRackCount: winner.remainingRackCount,
    penaltyCost: winner.penaltyCost,
    forfeited: winner.forfeited,
  });
  const losingRankings = rankEntries(
    entries
      .filter((entry) => entry.playerId !== winnerPlayerId)
      .map((entry) => ({ entry, rankKey: [entry.penaltyCost] })),
  ).map((entry) => Object.freeze({ ...entry, rank: entry.rank + 1 }));

  return Object.freeze([winnerRanking, ...losingRankings]);
}

export function createRackEmptyResult(
  input: ResultEngineInput,
  winnerPlayerId: PlayerId,
): GameResult {
  const entries = createEntries(input);
  const winner = entries.find((entry) => entry.playerId === winnerPlayerId);
  if (winner === undefined || winner.remainingRackCount !== 0) {
    throw new Error("The rack-empty winner must have an empty rack.");
  }
  if (winner.forfeited) {
    throw new Error("A forfeited Player cannot win by emptying a rack.");
  }
  return createResult(
    "RACK_EMPTY",
    input.finishedAt,
    [winnerPlayerId],
    createSingleWinnerRankings(entries, winnerPlayerId),
  );
}

export function createTimeLimitResult(input: ResultEngineInput): GameResult {
  const rankings = rankEntries(
    createEntries(input).map((entry) => ({
      entry,
      rankKey: [entry.remainingRackCount, entry.penaltyCost],
    })),
  );
  return createResult(
    "TIME_LIMIT",
    input.finishedAt,
    rankings.filter((entry) => entry.rank === 1).map((entry) => entry.playerId),
    rankings,
  );
}

export function createStalemateResult(input: ResultEngineInput): GameResult {
  const rankings = rankEntries(
    createEntries(input).map((entry) => ({
      entry,
      rankKey: [entry.penaltyCost],
    })),
  );
  return createResult(
    "STALEMATE",
    input.finishedAt,
    rankings.filter((entry) => entry.rank === 1).map((entry) => entry.playerId),
    rankings,
  );
}

export function createLastPlayerStandingResult(
  input: ResultEngineInput,
): GameResult {
  const entries = createEntries(input);
  const survivors = entries.filter((entry) => !entry.forfeited);
  if (survivors.length !== 1) {
    throw new Error("Last-player-standing requires exactly one survivor.");
  }
  const winnerPlayerId = survivors[0]!.playerId;
  return createResult(
    "LAST_PLAYER_STANDING",
    input.finishedAt,
    [winnerPlayerId],
    createSingleWinnerRankings(entries, winnerPlayerId),
  );
}

export function createAllPlayersForfeitedResult(
  input: ResultEngineInput,
): GameResult {
  const entries = createEntries(input);
  if (entries.some((entry) => !entry.forfeited)) {
    throw new Error("All-players-forfeited requires every Player to forfeit.");
  }
  const rankings = rankEntries(
    entries.map((entry) => ({ entry, rankKey: [entry.penaltyCost] })),
  );
  return createResult(
    "ALL_PLAYERS_FORFEITED",
    input.finishedAt,
    [],
    rankings,
  );
}

export function createForfeitResult(
  input: ResultEngineInput,
): GameResult | null {
  validateInput(input);
  const survivorCount = input.playerIds.filter(
    (playerId) => !input.forfeitedPlayerIds.has(playerId),
  ).length;
  if (survivorCount === 1) {
    return createLastPlayerStandingResult(input);
  }
  if (survivorCount === 0) {
    return createAllPlayersForfeitedResult(input);
  }
  return null;
}
