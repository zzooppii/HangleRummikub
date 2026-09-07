import {
  ServerTimeSchema,
  type PlayerId,
  type ServerTime,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import type { GemCard } from "./card.js";
import {
  createGemPlayerState,
  deriveGemVictoryScore,
  type GemPlayerState,
} from "./player-state.js";
import type { GemFinishReason } from "./progress.js";

export const GEM_FINISH_REASONS = Object.freeze([
  "SCORE_THRESHOLD_ROUND_END",
  "MARKET_EXHAUSTED_ROUND_END",
  "NO_PROGRESS",
  "LAST_PLAYER_STANDING",
] as const satisfies readonly GemFinishReason[]);

export type GemPlayerResultEntry = Readonly<{
  playerId: PlayerId;
  rank: number;
  score: number;
  purchasedCardCount: number;
  forfeited: boolean;
}>;

export type GemGameResult = Readonly<{
  reason: GemFinishReason;
  finishedAt: ServerTime;
  winnerPlayerIds: readonly PlayerId[];
  rankings: readonly GemPlayerResultEntry[];
}>;

type UnrankedEntry = Readonly<{
  playerId: PlayerId;
  score: number;
  purchasedCardCount: number;
  forfeited: boolean;
  order: number;
}>;

function rankGroup(
  entries: readonly UnrankedEntry[],
  rankOffset: number,
): readonly GemPlayerResultEntry[] {
  const sorted = [...entries].sort(
    (left, right) => right.score - left.score || left.order - right.order,
  );
  let previousScore: number | null = null;
  let previousRank = rankOffset;
  return Object.freeze(
    sorted.map((entry, index) => {
      const rank =
        previousScore === entry.score ? previousRank : rankOffset + index + 1;
      previousScore = entry.score;
      previousRank = rank;
      return Object.freeze({
        playerId: entry.playerId,
        rank,
        score: entry.score,
        purchasedCardCount: entry.purchasedCardCount,
        forfeited: entry.forfeited,
      });
    }),
  );
}

export function createGemGameResult(input: Readonly<{
  reason: GemFinishReason;
  finishedAt: ServerTime;
  players: readonly GemPlayerState[];
  cards: readonly GemCard[];
}>): GemGameResult {
  if (!GEM_FINISH_REASONS.includes(input.reason)) {
    throw new Error("Unknown GEM finish reason.");
  }
  if (input.players.length < 2 || input.players.length > 4) {
    throw new Error("GEM result requires two to four players.");
  }
  const players = input.players.map(createGemPlayerState);
  if (new Set(players.map((player) => player.playerId)).size !== players.length) {
    throw new Error("GEM result player IDs must be unique.");
  }
  const entries = players.map((player, order) =>
    Object.freeze({
      playerId: player.playerId,
      score: deriveGemVictoryScore(player, input.cards),
      purchasedCardCount: player.purchasedCardIds.length,
      forfeited: player.forfeited,
      order,
    }),
  );
  const playerCardIds = players.flatMap((player) => [
    ...player.purchasedCardIds,
    ...player.reservedCardIds,
  ]);
  if (new Set(playerCardIds).size !== playerCardIds.length) {
    throw new Error("A GEM card cannot belong to more than one result player.");
  }
  const eligible = entries.filter((entry) => !entry.forfeited);
  if (eligible.length === 0) throw new Error("GEM result requires an eligible player.");
  if (input.reason === "LAST_PLAYER_STANDING" && eligible.length !== 1) {
    throw new Error("GEM last-player-standing result requires exactly one eligible player.");
  }
  if (input.reason !== "LAST_PLAYER_STANDING" && eligible.length < 2) {
    throw new Error("Non-last-player-standing GEM result requires at least two eligible players.");
  }
  if (
    input.reason === "SCORE_THRESHOLD_ROUND_END" &&
    entries.every((entry) => entry.score < 18)
  ) {
    throw new Error("GEM score-threshold result requires a player to reach 18 points.");
  }
  const eligibleRankings = rankGroup(eligible, 0);
  const forfeitedRankings = rankGroup(
    entries.filter((entry) => entry.forfeited),
    eligible.length,
  );
  return Object.freeze({
    reason: input.reason,
    finishedAt: parse(ServerTimeSchema, input.finishedAt),
    winnerPlayerIds: Object.freeze(
      eligibleRankings
        .filter((entry) => entry.rank === 1)
        .map((entry) => entry.playerId),
    ),
    rankings: Object.freeze([...eligibleRankings, ...forfeitedRankings]),
  });
}
