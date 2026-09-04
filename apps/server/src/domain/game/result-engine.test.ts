import assert from "node:assert/strict";
import test from "node:test";

import {
  PlayerIdSchema,
  ServerTimeSchema,
  TileIdSchema,
  type PlayerId,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  calculateRackPenalty,
  createAllPlayersForfeitedResult,
  createForfeitResult,
  createLastPlayerStandingResult,
  createRackEmptyResult,
  createStalemateResult,
  createTimeLimitResult,
  type ResultEngineInput,
} from "./result-engine.js";
import type { TileInstance } from "./tile-inventory.js";

const A = parse(PlayerIdSchema, "player-a");
const B = parse(PlayerIdSchema, "player-b");
const C = parse(PlayerIdSchema, "player-c");

function tileId(value: string): TileId {
  return parse(TileIdSchema, value);
}

function ordinary(value: string): TileInstance {
  return Object.freeze({
    tileId: tileId(value),
    kind: "ORDINARY",
    physicalType: "GIYEOK_NIEUN_ROTATION",
    sourceBag: "CONSONANT",
    allowedSymbols: Object.freeze(["ㄱ", "ㄴ"] as const),
  });
}

function joker(value: string): TileInstance {
  return Object.freeze({
    tileId: tileId(value),
    kind: "JOKER",
    physicalType: "JOKER",
    sourceBag: "VOWEL",
  });
}

const ORDINARY_TILES = Object.freeze(
  Array.from({ length: 12 }, (_unused, index) => ordinary(`ordinary-${index}`)),
);
const JOKER = joker("joker-1");
const TILES = Object.freeze(
  new Map<TileId, TileInstance>(
    [...ORDINARY_TILES, JOKER].map((tile) => [tile.tileId, tile]),
  ),
);

function input(
  racks: ReadonlyMap<PlayerId, readonly TileId[]>,
  forfeitedPlayerIds: ReadonlySet<PlayerId> = new Set(),
): ResultEngineInput {
  return Object.freeze({
    playerIds: Object.freeze([...racks.keys()]),
    racks,
    tilesById: TILES,
    forfeitedPlayerIds,
    finishedAt: parse(ServerTimeSchema, 42_000),
  });
}

function ids(start: number, count: number): readonly TileId[] {
  return Object.freeze(
    ORDINARY_TILES.slice(start, start + count).map((tile) => tile.tileId),
  );
}

test("rack penalty는 ordinary 1, Joker 30을 합산한다", () => {
  assert.equal(calculateRackPenalty([...ids(0, 2), JOKER.tileId], TILES), 32);
});

test("RACK_EMPTY는 단독 winner에게 다른 Player penalty 합을 이전한다", () => {
  const result = createRackEmptyResult(
    input(
      new Map([
        [A, Object.freeze([])],
        [B, ids(0, 4)],
        [C, Object.freeze([...ids(4, 2), JOKER.tileId])],
      ]),
    ),
    A,
  );

  assert.deepEqual(result, {
    reason: "RACK_EMPTY",
    finishedAt: 42_000,
    winnerPlayerIds: [A],
    rankings: [
      {
        playerId: A,
        rank: 1,
        score: 36,
        remainingRackCount: 0,
        penaltyCost: 0,
        forfeited: false,
      },
      {
        playerId: B,
        rank: 2,
        score: -4,
        remainingRackCount: 4,
        penaltyCost: 4,
        forfeited: false,
      },
      {
        playerId: C,
        rank: 3,
        score: -32,
        remainingRackCount: 3,
        penaltyCost: 32,
        forfeited: false,
      },
    ],
  });
});

test("TIME_LIMIT는 rack count를 먼저, penalty를 다음 기준으로 사용한다", () => {
  const result = createTimeLimitResult(
    input(
      new Map([
        [A, Object.freeze([...ids(0, 1), JOKER.tileId])],
        [B, ids(1, 3)],
      ]),
    ),
  );

  assert.deepEqual(
    result.rankings.map(({ playerId, rank, penaltyCost }) => ({
      playerId,
      rank,
      penaltyCost,
    })),
    [
      { playerId: A, rank: 1, penaltyCost: 31 },
      { playerId: B, rank: 2, penaltyCost: 3 },
    ],
  );
  assert.deepEqual(result.winnerPlayerIds, [A]);
});

test("TIME_LIMIT는 rack count가 같으면 penaltyCost가 낮은 Player를 앞세운다", () => {
  const result = createTimeLimitResult(
    input(
      new Map([
        [A, ids(0, 3)],
        [B, Object.freeze([...ids(3, 2), JOKER.tileId])],
        [C, ids(5, 4)],
      ]),
    ),
  );

  assert.deepEqual(
    result.rankings.map(({ playerId, rank, remainingRackCount, penaltyCost }) => ({
      playerId,
      rank,
      remainingRackCount,
      penaltyCost,
    })),
    [
      {
        playerId: A,
        rank: 1,
        remainingRackCount: 3,
        penaltyCost: 3,
      },
      {
        playerId: B,
        rank: 2,
        remainingRackCount: 3,
        penaltyCost: 32,
      },
      {
        playerId: C,
        rank: 3,
        remainingRackCount: 4,
        penaltyCost: 4,
      },
    ],
  );
  assert.deepEqual(result.winnerPlayerIds, [A]);
  assert.deepEqual(result.rankings.map((entry) => entry.score), [-3, -32, -4]);
});

test("TIME_LIMIT exact tie는 공동 winner와 competition rank를 만든다", () => {
  const result = createTimeLimitResult(
    input(
      new Map([
        [A, ids(0, 2)],
        [B, ids(2, 2)],
        [C, ids(4, 3)],
      ]),
    ),
  );

  assert.deepEqual(result.winnerPlayerIds, [A, B]);
  assert.deepEqual(result.rankings.map((entry) => entry.rank), [1, 1, 3]);
  assert.deepEqual(result.rankings.map((entry) => entry.score), [-2, -2, -3]);
});

test("STALEMATE는 rack count가 아니라 penalty만으로 공동 순위를 정한다", () => {
  const result = createStalemateResult(
    input(
      new Map([
        [A, ids(0, 2)],
        [B, Object.freeze([JOKER.tileId])],
        [C, ids(2, 2)],
      ]),
    ),
  );

  assert.deepEqual(result.winnerPlayerIds, [A, C]);
  assert.deepEqual(result.rankings.map((entry) => entry.rank), [1, 1, 3]);
  assert.deepEqual(result.rankings.map((entry) => entry.playerId), [A, C, B]);
});

test("LAST_PLAYER_STANDING은 survivor 자신의 penalty를 빼지 않고 loser penalty만 이전한다", () => {
  const result = createLastPlayerStandingResult(
    input(
      new Map([
        [A, ids(0, 2)],
        [B, ids(2, 4)],
        [C, Object.freeze([...ids(6, 2), JOKER.tileId])],
      ]),
      new Set([B, C]),
    ),
  );

  assert.equal(result.reason, "LAST_PLAYER_STANDING");
  assert.deepEqual(result.winnerPlayerIds, [A]);
  assert.equal(result.rankings[0]?.score, 36);
  assert.equal(result.rankings[0]?.penaltyCost, 2);
  assert.deepEqual(result.rankings.map((entry) => entry.forfeited), [false, true, true]);
});

test("ALL_PLAYERS_FORFEITED는 winner 없이 negative-only competition ranking을 만든다", () => {
  const result = createAllPlayersForfeitedResult(
    input(
      new Map([
        [A, ids(0, 2)],
        [B, Object.freeze([JOKER.tileId])],
        [C, ids(2, 2)],
      ]),
      new Set([A, B, C]),
    ),
  );

  assert.deepEqual(result.winnerPlayerIds, []);
  assert.deepEqual(result.rankings.map((entry) => entry.rank), [1, 1, 3]);
  assert.deepEqual(result.rankings.map((entry) => entry.score), [-2, -2, -30]);
  assert.ok(result.rankings.every((entry) => entry.forfeited));
});

test("empty rack의 negative penalty score는 -0이 아닌 canonical 0이다", () => {
  const result = createAllPlayersForfeitedResult(
    input(
      new Map([
        [A, Object.freeze([])],
        [B, ids(0, 1)],
      ]),
      new Set([A, B]),
    ),
  );

  assert.equal(Object.is(result.rankings[0]?.score, -0), false);
  assert.equal(result.rankings[0]?.score, 0);
});

test("createForfeitResult는 survivor 2명 이상이면 null, 1/0명이면 terminal result를 반환한다", () => {
  const racks = new Map([
    [A, ids(0, 1)],
    [B, ids(1, 1)],
    [C, ids(2, 1)],
  ]);

  assert.equal(createForfeitResult(input(racks, new Set([C]))), null);
  assert.equal(
    createForfeitResult(input(racks, new Set([B, C])))?.reason,
    "LAST_PLAYER_STANDING",
  );
  assert.equal(
    createForfeitResult(input(racks, new Set([A, B, C])))?.reason,
    "ALL_PLAYERS_FORFEITED",
  );
});

test("Result Engine은 같은 frozen input에 deterministic하며 caller collections를 mutate하지 않는다", () => {
  const racks = Object.freeze(
    new Map<PlayerId, readonly TileId[]>([
      [A, ids(0, 2)],
      [B, ids(2, 3)],
    ]),
  );
  const source = input(racks);
  const beforeRacks = [...racks].map(([playerId, rack]) => [playerId, [...rack]]);
  const beforeTiles = [...TILES];

  const first = createTimeLimitResult(source);
  const second = createTimeLimitResult(source);

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.deepEqual(
    [...racks].map(([playerId, rack]) => [playerId, [...rack]]),
    beforeRacks,
  );
  assert.deepEqual([...TILES], beforeTiles);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.rankings));
  assert.ok(first.rankings.every(Object.isFrozen));
});
