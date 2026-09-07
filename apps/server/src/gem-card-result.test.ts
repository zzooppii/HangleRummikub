import assert from "node:assert/strict";
import test from "node:test";

import {
  PlayerIdSchema,
  ServerTimeSchema,
  type PlayerId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { GEM_CARDSET_V1 } from "./games/gem-card/domain/cardset-v1.js";
import { parseGemCardId, type GemCardId } from "./games/gem-card/domain/card.js";
import {
  createGemPlayerState,
  deriveGemVictoryScore,
  type GemPlayerState,
} from "./games/gem-card/domain/player-state.js";
import type { GemFinishReason } from "./games/gem-card/domain/progress.js";
import {
  GEM_FINISH_REASONS,
  createGemGameResult,
} from "./games/gem-card/domain/result-engine.js";
import { createEmptyGemResourceCounts } from "./games/gem-card/domain/resource.js";

const A = parse(PlayerIdSchema, "gem-result-player-a");
const B = parse(PlayerIdSchema, "gem-result-player-b");
const C = parse(PlayerIdSchema, "gem-result-player-c");
const D = parse(PlayerIdSchema, "gem-result-player-d");
const FINISHED_AT = parse(ServerTimeSchema, 123_456);

function cards(...ids: string[]): readonly GemCardId[] {
  return Object.freeze(ids.map(parseGemCardId));
}

function player(
  playerId: PlayerId,
  purchasedCardIds: readonly GemCardId[],
  forfeited = false,
  reservedCardIds: readonly GemCardId[] = [],
): GemPlayerState {
  return createGemPlayerState({
    playerId,
    resources: createEmptyGemResourceCounts(),
    purchasedCardIds,
    reservedCardIds,
    forfeited,
    offlineTimeoutStreak: 0,
  });
}

function result(
  reason: GemFinishReason,
  players: readonly GemPlayerState[],
) {
  return createGemGameResult({
    reason,
    finishedAt: FINISHED_AT,
    players,
    cards: GEM_CARDSET_V1,
  });
}

const SCORE_18_A = cards("GC-T3-03", "GC-T3-06", "GC-T3-09", "GC-T3-01");
const SCORE_18_B = cards("GC-T3-12", "GC-T3-15", "GC-T3-02", "GC-T3-05");
const SCORE_14_C = cards("GC-T3-08", "GC-T3-11", "GC-T3-14", "GC-T2-02");

test("GEM finish reason 집합은 confirmed 네 reason만 가진다", () => {
  assert.deepEqual(GEM_FINISH_REASONS, [
    "SCORE_THRESHOLD_ROUND_END",
    "MARKET_EXHAUSTED_ROUND_END",
    "NO_PROGRESS",
    "LAST_PLAYER_STANDING",
  ]);
  for (const forbidden of [
    "TIME_LIMIT",
    "RACK_EMPTY",
    "STALEMATE",
    "ALL_PLAYERS_FORFEITED",
  ]) {
    assert.equal(GEM_FINISH_REASONS.includes(forbidden as GemFinishReason), false);
  }
});

test("score는 purchased-card victory points에서만 derive하고 reserve는 포함하지 않는다", () => {
  const canonical = player(
    A,
    cards("GC-T3-03", "GC-T2-03"),
    false,
    cards("GC-T3-06"),
  );
  assert.equal(deriveGemVictoryScore(canonical, GEM_CARDSET_V1), 8);
});

test("18,18,14는 공동 winner와 competition ranking 1,1,3을 만든다", () => {
  const gameResult = result("SCORE_THRESHOLD_ROUND_END", [
    player(A, SCORE_18_A),
    player(B, SCORE_18_B),
    player(C, SCORE_14_C),
  ]);

  assert.deepEqual(gameResult.winnerPlayerIds, [A, B]);
  assert.deepEqual(
    gameResult.rankings.map(({ playerId, rank, score }) => ({ playerId, rank, score })),
    [
      { playerId: A, rank: 1, score: 18 },
      { playerId: B, rank: 1, score: 18 },
      { playerId: C, rank: 3, score: 14 },
    ],
  );
});

test("market exhaustion과 NO_PROGRESS도 최종 purchased-card score로 ranking한다", () => {
  const canonicalPlayers = [
    player(A, cards("GC-T3-03")),
    player(B, cards("GC-T3-02")),
    player(C, cards("GC-T3-01")),
  ];
  for (const reason of [
    "MARKET_EXHAUSTED_ROUND_END",
    "NO_PROGRESS",
  ] as const) {
    const gameResult = result(reason, canonicalPlayers);
    assert.equal(gameResult.reason, reason);
    assert.deepEqual(gameResult.winnerPlayerIds, [A]);
    assert.deepEqual(gameResult.rankings.map((entry) => entry.score), [5, 4, 3]);
    assert.deepEqual(gameResult.rankings.map((entry) => entry.rank), [1, 2, 3]);
  }
});

test("더 높은 forfeited score는 non-forfeited winner eligibility를 얻지 못한다", () => {
  const forfeitedThirty = cards(
    "GC-T3-03",
    "GC-T3-06",
    "GC-T3-09",
    "GC-T3-12",
    "GC-T3-15",
    "GC-T2-03",
    "GC-T2-02",
  );
  const gameResult = result("NO_PROGRESS", [
    player(A, cards("GC-T3-01", "GC-T2-05", "GC-T2-06", "GC-T2-08")),
    player(C, cards()),
    player(B, forfeitedThirty, true),
  ]);

  assert.deepEqual(gameResult.winnerPlayerIds, [A]);
  assert.deepEqual(
    gameResult.rankings.map(({ playerId, rank, score, forfeited }) => ({
      playerId,
      rank,
      score,
      forfeited,
    })),
    [
      { playerId: A, rank: 1, score: 10, forfeited: false },
      { playerId: C, rank: 2, score: 0, forfeited: false },
      { playerId: B, rank: 3, score: 30, forfeited: true },
    ],
  );
});

test("forfeited subgroup는 eligible 뒤에서 offset competition ranking을 사용한다", () => {
  const gameResult = result("MARKET_EXHAUSTED_ROUND_END", [
    player(A, SCORE_18_A),
    player(B, SCORE_14_C),
    player(C, cards("GC-T3-12"), true),
    player(D, cards("GC-T3-15"), true),
  ]);

  assert.deepEqual(gameResult.winnerPlayerIds, [A]);
  assert.deepEqual(
    gameResult.rankings.map(({ playerId, rank, score, forfeited }) => ({
      playerId,
      rank,
      score,
      forfeited,
    })),
    [
      { playerId: A, rank: 1, score: 18, forfeited: false },
      { playerId: B, rank: 2, score: 14, forfeited: false },
      { playerId: C, rank: 3, score: 5, forfeited: true },
      { playerId: D, rank: 3, score: 5, forfeited: true },
    ],
  );
});

test("LAST_PLAYER_STANDING은 score와 무관하게 유일 survivor만 winner로 둔다", () => {
  const gameResult = result("LAST_PLAYER_STANDING", [
    player(A, cards("GC-T1-01")),
    player(B, SCORE_18_A, true),
    player(C, SCORE_14_C, true),
  ]);

  assert.deepEqual(gameResult.winnerPlayerIds, [A]);
  assert.deepEqual(
    gameResult.rankings.map(({ playerId, rank, score, forfeited }) => ({
      playerId,
      rank,
      score,
      forfeited,
    })),
    [
      { playerId: A, rank: 1, score: 0, forfeited: false },
      { playerId: B, rank: 2, score: 18, forfeited: true },
      { playerId: C, rank: 3, score: 14, forfeited: true },
    ],
  );
});

test("result는 finishedAt, purchased count, nested arrays와 entries를 immutable하게 보존한다", () => {
  const gameResult = result("NO_PROGRESS", [
    player(A, SCORE_18_A),
    player(B, SCORE_14_C),
  ]);

  assert.equal(gameResult.finishedAt, FINISHED_AT);
  assert.deepEqual(
    gameResult.rankings.map((entry) => entry.purchasedCardCount),
    [4, 4],
  );
  assert.equal(Object.isFrozen(gameResult), true);
  assert.equal(Object.isFrozen(gameResult.winnerPlayerIds), true);
  assert.equal(Object.isFrozen(gameResult.rankings), true);
  assert.equal(gameResult.rankings.every(Object.isFrozen), true);
});

test("result preconditions는 unknown reason, duplicate player와 invalid LAST_PLAYER_STANDING을 fail-closed한다", () => {
  assert.throws(
    () => result("TIME_LIMIT" as GemFinishReason, [player(A, []), player(B, [])]),
    /Unknown GEM finish reason/u,
  );
  assert.throws(
    () => result("NO_PROGRESS", [player(A, []), player(A, [])]),
    /player IDs must be unique/u,
  );
  assert.throws(
    () => result("LAST_PLAYER_STANDING", [player(A, []), player(B, [])]),
    /exactly one eligible player/u,
  );
  assert.throws(
    () => result("NO_PROGRESS", [player(A, [], true), player(B, [], true)]),
    /requires an eligible player/u,
  );
  assert.throws(
    () => result("NO_PROGRESS", [player(A, []), player(B, [], true)]),
    /at least two eligible players/u,
  );
  assert.throws(
    () =>
      result("SCORE_THRESHOLD_ROUND_END", [
        player(A, cards("GC-T3-01")),
        player(B, cards("GC-T3-02")),
      ]),
    /reach 18 points/u,
  );
  assert.throws(
    () =>
      result("NO_PROGRESS", [
        player(A, cards("GC-T1-01")),
        player(B, cards("GC-T1-01")),
      ]),
    /cannot belong to more than one result player/u,
  );
});
