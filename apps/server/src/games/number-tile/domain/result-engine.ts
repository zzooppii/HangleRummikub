import type {
  PlayerId,
  ServerTime,
  TileId,
} from "@hangul-rummikub/shared";

import { cloneNumberTile, type NumberTile } from "./tile.js";
import type { NumberPlacementResult } from "./placement-ranking.js";

export type NumberTileSingleWinnerFinishReason =
  | "RACK_EMPTY"
  | "LAST_PLAYER_STANDING";

export type NumberTileFinishReason =
  | NumberTileSingleWinnerFinishReason
  | "STALEMATE";

export type NumberTilePlayerResultEntry = Readonly<{
  playerId: PlayerId;
  score: number;
  remainingRackCount: number;
  penaltyCost: number;
  forfeited: boolean;
}>;

export type NumberTileStalemateRankingEntry = NumberTilePlayerResultEntry &
  Readonly<{
    rank: number;
  }>;

export type NumberTileSingleWinnerResult = Readonly<{
  reason: NumberTileSingleWinnerFinishReason;
  finishedAt: ServerTime;
  winnerPlayerIds: readonly [PlayerId];
  playerResults: readonly NumberTilePlayerResultEntry[];
}>;

export type NumberTileStalemateResult = Readonly<{
  reason: "STALEMATE";
  finishedAt: ServerTime;
  winnerPlayerIds: readonly PlayerId[];
  rankings: readonly NumberTileStalemateRankingEntry[];
}>;

export type NumberTileGameResult =
  | NumberPlacementResult
  | NumberTileSingleWinnerResult
  | NumberTileStalemateResult;

export type NumberTileResultEngineInput = Readonly<{
  playerIds: readonly PlayerId[];
  racks: ReadonlyMap<PlayerId, readonly TileId[]>;
  tilesById: ReadonlyMap<TileId, NumberTile>;
  forfeitedPlayerIds: ReadonlySet<PlayerId>;
  finishedAt: ServerTime;
}>;

type NumberTileUnrankedEntry = NumberTilePlayerResultEntry &
  Readonly<{
    order: number;
  }>;

function canonicalNegative(value: number): number {
  return value === 0 ? 0 : -value;
}

function validateInput(input: NumberTileResultEngineInput): void {
  if (!Number.isSafeInteger(input.finishedAt) || input.finishedAt < 0) {
    throw new RangeError(
      "Number Tile result finishedAt must be a non-negative safe integer.",
    );
  }
  if (input.playerIds.length < 2 || input.playerIds.length > 4) {
    throw new Error("Number Tile result requires two to four Players.");
  }
  if (new Set(input.playerIds).size !== input.playerIds.length) {
    throw new Error("Number Tile result Player IDs must be unique.");
  }
  if (
    input.racks.size !== input.playerIds.length ||
    input.playerIds.some((playerId) => !input.racks.has(playerId)) ||
    [...input.racks.keys()].some(
      (playerId) => !input.playerIds.includes(playerId),
    )
  ) {
    throw new Error("Number Tile result racks must match the complete Player set.");
  }
  if (
    [...input.forfeitedPlayerIds].some(
      (playerId) => !input.playerIds.includes(playerId),
    )
  ) {
    throw new Error("Number Tile result references an unknown forfeited Player.");
  }
  for (const [tileId, tile] of input.tilesById) {
    if (tile.tileId !== tileId) {
      throw new Error("Number Tile result Tile lookup key must match its tileId.");
    }
    cloneNumberTile(tile);
  }

  const rackTileIds = new Set<TileId>();
  for (const rack of input.racks.values()) {
    for (const tileId of rack) {
      if (rackTileIds.has(tileId)) {
        throw new Error(
          "A physical Number Tile cannot appear in more than one result rack position.",
        );
      }
      rackTileIds.add(tileId);
      if (!input.tilesById.has(tileId)) {
        throw new Error("Number Tile result rack references an unknown Tile.");
      }
    }
  }
}

export function calculateNumberTileRackPenalty(
  rackTileIds: readonly TileId[],
  tilesById: ReadonlyMap<TileId, NumberTile>,
): number {
  const seenTileIds = new Set<TileId>();
  let penaltyCost = 0;
  for (const tileId of rackTileIds) {
    if (seenTileIds.has(tileId)) {
      throw new Error("Number Tile rack penalty cannot count a Tile twice.");
    }
    seenTileIds.add(tileId);

    const tile = tilesById.get(tileId);
    if (tile === undefined) {
      throw new Error("Number Tile rack penalty references an unknown Tile.");
    }
    if (tile.tileId !== tileId) {
      throw new Error("Number Tile rack penalty Tile key must match its tileId.");
    }
    const validatedTile = cloneNumberTile(tile);
    penaltyCost +=
      validatedTile.kind === "JOKER" ? 30 : validatedTile.number;
  }
  return penaltyCost;
}

function createEntries(
  input: NumberTileResultEngineInput,
): readonly NumberTileUnrankedEntry[] {
  validateInput(input);
  return Object.freeze(
    input.playerIds.map((playerId, order) => {
      const rack = input.racks.get(playerId);
      if (rack === undefined) {
        throw new Error("Number Tile result derivation missed a Player rack.");
      }
      const penaltyCost = calculateNumberTileRackPenalty(
        rack,
        input.tilesById,
      );
      return Object.freeze({
        playerId,
        score: canonicalNegative(penaltyCost),
        remainingRackCount: rack.length,
        penaltyCost,
        forfeited: input.forfeitedPlayerIds.has(playerId),
        order,
      });
    }),
  );
}

function withoutOrder(
  entry: NumberTileUnrankedEntry,
  score: number = entry.score,
): NumberTilePlayerResultEntry {
  return Object.freeze({
    playerId: entry.playerId,
    score,
    remainingRackCount: entry.remainingRackCount,
    penaltyCost: entry.penaltyCost,
    forfeited: entry.forfeited,
  });
}

function createSingleWinnerResult(
  reason: NumberTileSingleWinnerFinishReason,
  input: NumberTileResultEngineInput,
  entries: readonly NumberTileUnrankedEntry[],
  winnerPlayerId: PlayerId,
): NumberTileSingleWinnerResult {
  const winner = entries.find((entry) => entry.playerId === winnerPlayerId);
  if (winner === undefined) {
    throw new Error("Number Tile result winner must be a canonical Player.");
  }
  const losingPenaltyTotal = entries.reduce(
    (total, entry) =>
      entry.playerId === winnerPlayerId ? total : total + entry.penaltyCost,
    0,
  );
  const winnerPlayerIds: readonly [PlayerId] = Object.freeze([winnerPlayerId]);
  return Object.freeze({
    reason,
    finishedAt: input.finishedAt,
    winnerPlayerIds,
    playerResults: Object.freeze(
      entries.map((entry) =>
        withoutOrder(
          entry,
          entry.playerId === winnerPlayerId
            ? losingPenaltyTotal
            : canonicalNegative(entry.penaltyCost),
        ),
      ),
    ),
  });
}

function assertNoEmptyRack(
  entries: readonly NumberTileUnrankedEntry[],
  reason: "LAST_PLAYER_STANDING" | "STALEMATE",
): void {
  if (entries.some((entry) => entry.remainingRackCount === 0)) {
    throw new Error(
      `Number Tile ${reason} cannot follow an unhandled rack-empty condition.`,
    );
  }
}

export function createNumberTileRackEmptyResult(
  input: NumberTileResultEngineInput,
  winnerPlayerId: PlayerId,
): NumberTileSingleWinnerResult {
  const entries = createEntries(input);
  const winner = entries.find((entry) => entry.playerId === winnerPlayerId);
  if (winner === undefined || winner.remainingRackCount !== 0) {
    throw new Error("Number Tile rack-empty winner must have an empty rack.");
  }
  if (winner.forfeited) {
    throw new Error("A forfeited Number Tile Player cannot win by emptying a rack.");
  }
  if (
    entries.some(
      (entry) =>
        entry.playerId !== winnerPlayerId && entry.remainingRackCount === 0,
    )
  ) {
    throw new Error(
      "Number Tile rack-empty result requires exactly one empty rack.",
    );
  }
  return createSingleWinnerResult("RACK_EMPTY", input, entries, winnerPlayerId);
}

export function createNumberTileLastPlayerStandingResult(
  input: NumberTileResultEngineInput,
): NumberTileSingleWinnerResult {
  const entries = createEntries(input);
  const survivors = entries.filter((entry) => !entry.forfeited);
  if (survivors.length !== 1) {
    throw new Error(
      "Number Tile last-player-standing requires exactly one survivor.",
    );
  }
  assertNoEmptyRack(entries, "LAST_PLAYER_STANDING");
  return createSingleWinnerResult(
    "LAST_PLAYER_STANDING",
    input,
    entries,
    survivors[0]!.playerId,
  );
}

function rankNumberTileSubgroup(
  entries: readonly NumberTileUnrankedEntry[],
  rankOffset: number,
): readonly NumberTileStalemateRankingEntry[] {
  const sorted = [...entries].sort(
    (left, right) =>
      left.penaltyCost - right.penaltyCost || left.order - right.order,
  );
  let previousPenalty: number | undefined;
  let localRank = 0;
  return Object.freeze(
    sorted.map((entry, index) => {
      if (
        previousPenalty === undefined ||
        previousPenalty !== entry.penaltyCost
      ) {
        localRank = index + 1;
        previousPenalty = entry.penaltyCost;
      }
      return Object.freeze({
        ...withoutOrder(entry),
        rank: rankOffset + localRank,
      });
    }),
  );
}

export function createNumberTileStalemateResult(
  input: NumberTileResultEngineInput,
): NumberTileStalemateResult {
  const entries = createEntries(input);
  const eligibleEntries = entries.filter((entry) => !entry.forfeited);
  if (eligibleEntries.length < 2) {
    throw new Error(
      "Number Tile stalemate requires at least two eligible Players.",
    );
  }
  assertNoEmptyRack(entries, "STALEMATE");
  const eligibleRankings = rankNumberTileSubgroup(eligibleEntries, 0);
  const forfeitedRankings = rankNumberTileSubgroup(
    entries.filter((entry) => entry.forfeited),
    eligibleEntries.length,
  );
  const rankings = Object.freeze([
    ...eligibleRankings,
    ...forfeitedRankings,
  ]);
  return Object.freeze({
    reason: "STALEMATE",
    finishedAt: input.finishedAt,
    winnerPlayerIds: Object.freeze(
      eligibleRankings
        .filter((entry) => entry.rank === 1)
        .map((entry) => entry.playerId),
    ),
    rankings,
  });
}
