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

import { drawSelectedNumberTile } from "./games/number-tile/domain/draw.js";
import { createNumberTileLastPlayerStandingResult } from "./games/number-tile/domain/result-engine.js";
import {
  advanceNumberTileOfflineTimeoutStreak,
  applyNumberTileForfeit,
  canNumberTilePass,
  evaluateNumberTileFinish,
  isNumberTileNoPlayCycleComplete,
  nextEligibleNumberTilePlayer,
  numberTileEligiblePlayerIds,
  pruneNumberTileNoPlayTracker,
  recordNumberTileNoPlay,
  resetNumberTileNoPlayTracker,
  resetNumberTileOfflineTimeoutStreak,
} from "./games/number-tile/domain/stalemate.js";
import type { NumberTile } from "./games/number-tile/domain/tile.js";

const A = parse(PlayerIdSchema, "number-player-a");
const B = parse(PlayerIdSchema, "number-player-b");
const C = parse(PlayerIdSchema, "number-player-c");
const D = parse(PlayerIdSchema, "number-player-d");
const TURN_ORDER = Object.freeze([A, B, C]);

function noPlay(
  actorPlayerId: PlayerId,
  noPlayPlayerIds: readonly PlayerId[],
  forfeitedPlayerIds: ReadonlySet<PlayerId> = new Set(),
): readonly PlayerId[] {
  return recordNumberTileNoPlay({
    turnOrder: TURN_ORDER,
    forfeitedPlayerIds,
    noPlayPlayerIds,
    actorPlayerId,
    poolTileCount: 0,
  });
}

test("Number Pass는 pool이 empty일 때만 허용한다", () => {
  assert.equal(canNumberTilePass(0), true);
  assert.equal(canNumberTilePass(1), false);
  assert.throws(() => canNumberTilePass(-1), RangeError);
  assert.throws(
    () =>
      recordNumberTileNoPlay({
        turnOrder: TURN_ORDER,
        forfeitedPlayerIds: new Set(),
        noPlayPlayerIds: [],
        actorPlayerId: A,
        poolTileCount: 1,
      }),
    /only when the pool is empty/,
  );
});

test("offline timeout streak은 두 번째 action 뒤 forfeit를 지시하고 resume에서 reset된다", () => {
  assert.deepEqual(advanceNumberTileOfflineTimeoutStreak(0), {
    streak: 1,
    shouldForfeit: false,
  });
  assert.deepEqual(advanceNumberTileOfflineTimeoutStreak(1), {
    streak: 2,
    shouldForfeit: true,
  });
  assert.equal(resetNumberTileOfflineTimeoutStreak(), 0);
  assert.throws(
    () => advanceNumberTileOfflineTimeoutStreak(2),
    /must be zero or one/u,
  );
});

test("두 번째 offline timeout은 draw/no-play action 뒤 forfeit와 terminal precedence를 적용할 수 있다", () => {
  const turnOrder = Object.freeze([A, B]);
  const aTile: NumberTile = Object.freeze({
    tileId: parse(TileIdSchema, "timeout-order-a-4"),
    kind: "ORDINARY",
    color: "RED",
    number: 4,
  });
  const bTile: NumberTile = Object.freeze({
    tileId: parse(TileIdSchema, "timeout-order-b-2"),
    kind: "ORDINARY",
    color: "BLUE",
    number: 2,
  });
  const drawnTile: NumberTile = Object.freeze({
    tileId: parse(TileIdSchema, "timeout-order-b-drawn-13"),
    kind: "ORDINARY",
    color: "BLACK",
    number: 13,
  });
  const timeoutDecision = advanceNumberTileOfflineTimeoutStreak(1);
  assert.equal(timeoutDecision.shouldForfeit, true);

  // The required timeout draw is applied before the resulting forfeit.
  const draw = drawSelectedNumberTile(
    [drawnTile.tileId],
    [bTile.tileId],
    drawnTile.tileId,
  );
  const afterDrawForfeit = applyNumberTileForfeit(
    turnOrder,
    new Set(),
    [],
    B,
  );
  assert.deepEqual(
    evaluateNumberTileFinish({
      turnOrder,
      forfeitedPlayerIds: afterDrawForfeit.forfeitedPlayerIds,
      noPlayPlayerIds: afterDrawForfeit.noPlayPlayerIds,
      poolTileCount: draw.poolTileIds.length,
      rackEmptyPlayerId: null,
    }),
    { reason: "LAST_PLAYER_STANDING", winnerPlayerId: A },
  );
  const racks = new Map<PlayerId, readonly TileId[]>([
    [A, [aTile.tileId]],
    [B, draw.rackTileIds],
  ]);
  const result = createNumberTileLastPlayerStandingResult({
    playerIds: turnOrder,
    racks,
    tilesById: new Map(
      [aTile, bTile, drawnTile].map((tile) => [tile.tileId, tile]),
    ),
    forfeitedPlayerIds: afterDrawForfeit.forfeitedPlayerIds,
    finishedAt: parse(ServerTimeSchema, 90_000),
  });
  assert.deepEqual(
    result.playerResults.map(({ playerId, penaltyCost, score }) => ({
      playerId,
      penaltyCost,
      score,
    })),
    [
      { playerId: A, penaltyCost: 4, score: 15 },
      { playerId: B, penaltyCost: 15, score: -15 },
    ],
  );

  // In the empty-pool branch the no-play commit also precedes forfeit; with
  // one survivor, LAST_PLAYER_STANDING wins over the formerly complete cycle.
  const afterNoTile = recordNumberTileNoPlay({
    turnOrder,
    forfeitedPlayerIds: new Set(),
    noPlayPlayerIds: [A],
    actorPlayerId: B,
    poolTileCount: 0,
  });
  assert.deepEqual(afterNoTile, [A, B]);
  const afterNoTileForfeit = applyNumberTileForfeit(
    turnOrder,
    new Set(),
    afterNoTile,
    B,
  );
  assert.deepEqual(
    evaluateNumberTileFinish({
      turnOrder,
      forfeitedPlayerIds: afterNoTileForfeit.forfeitedPlayerIds,
      noPlayPlayerIds: afterNoTileForfeit.noPlayPlayerIds,
      poolTileCount: 0,
      rackEmptyPlayerId: null,
    }),
    { reason: "LAST_PLAYER_STANDING", winnerPlayerId: A },
  );
});

test("pool-empty 첫 Pass와 partial cycle은 STALEMATE를 만들지 않는다", () => {
  const first = noPlay(A, []);
  const second = noPlay(B, first);

  assert.deepEqual(first, [A]);
  assert.deepEqual(second, [A, B]);
  assert.deepEqual(noPlay(A, first), [A]);
  assert.equal(isNumberTileNoPlayCycleComplete(TURN_ORDER, new Set(), first), false);
  assert.equal(isNumberTileNoPlayCycleComplete(TURN_ORDER, new Set(), second), false);
  assert.equal(Object.isFrozen(first), true);
});

test("eligible 전원의 Pass 또는 pool-empty timeout 기록이 full cycle을 완성한다", () => {
  const afterPass = noPlay(A, []);
  const afterTimeout = noPlay(B, afterPass);
  const complete = noPlay(C, afterTimeout);

  assert.deepEqual(complete, [A, B, C]);
  assert.equal(
    isNumberTileNoPlayCycleComplete(TURN_ORDER, new Set(), complete),
    true,
  );
  assert.deepEqual(
    evaluateNumberTileFinish({
      turnOrder: TURN_ORDER,
      forfeitedPlayerIds: new Set(),
      noPlayPlayerIds: complete,
      poolTileCount: 0,
      rackEmptyPlayerId: null,
    }),
    { reason: "STALEMATE" },
  );
});

test("valid Submit과 pool을 비우는 Draw는 no-play tracker를 새 cycle로 reset한다", () => {
  const prior = noPlay(A, []);
  const reset = resetNumberTileNoPlayTracker();

  assert.deepEqual(prior, [A]);
  assert.deepEqual(reset, []);
  assert.equal(Object.isFrozen(reset), true);
  assert.deepEqual(prior, [A]);
});

test("presence와 무관하게 offline non-forfeited Player도 eligible이다", () => {
  assert.deepEqual(numberTileEligiblePlayerIds(TURN_ORDER, new Set()), [A, B, C]);
  assert.equal(
    isNumberTileNoPlayCycleComplete(TURN_ORDER, new Set(), [A, B]),
    false,
  );
});

test("forfeit는 해당 tracker 기록만 제거하고 remaining eligible 기록은 보존한다", () => {
  const sourceForfeited = new Set<PlayerId>();
  const sourceTracker = Object.freeze([A, B]);
  const transition = applyNumberTileForfeit(
    TURN_ORDER,
    sourceForfeited,
    sourceTracker,
    B,
  );

  assert.equal(transition.changed, true);
  assert.deepEqual([...transition.forfeitedPlayerIds], [B]);
  assert.equal("add" in transition.forfeitedPlayerIds, false);
  assert.deepEqual(transition.noPlayPlayerIds, [A]);
  assert.deepEqual([...sourceForfeited], []);
  assert.deepEqual(sourceTracker, [A, B]);
  assert.deepEqual(
    pruneNumberTileNoPlayTracker(TURN_ORDER, new Set([B]), [A, B]),
    [A],
  );
});

test("forfeited Player를 skip하며 immutable turn order에서 wrap한다", () => {
  assert.equal(nextEligibleNumberTilePlayer(TURN_ORDER, new Set([B]), A), C);
  assert.equal(nextEligibleNumberTilePlayer(TURN_ORDER, new Set([A]), C), B);
  assert.equal(nextEligibleNumberTilePlayer(TURN_ORDER, new Set([A, C]), B), B);
});

test("RACK_EMPTY는 LAST_PLAYER_STANDING과 STALEMATE보다 우선한다", () => {
  assert.deepEqual(
    evaluateNumberTileFinish({
      turnOrder: TURN_ORDER,
      forfeitedPlayerIds: new Set([B, C]),
      noPlayPlayerIds: [A],
      poolTileCount: 0,
      rackEmptyPlayerId: A,
    }),
    { reason: "RACK_EMPTY", winnerPlayerId: A },
  );
});

test("eligible 한 명이 남으면 완성된 tracker보다 LAST_PLAYER_STANDING이 우선한다", () => {
  assert.deepEqual(
    evaluateNumberTileFinish({
      turnOrder: TURN_ORDER,
      forfeitedPlayerIds: new Set([B, C]),
      noPlayPlayerIds: [A],
      poolTileCount: 0,
      rackEmptyPlayerId: null,
    }),
    { reason: "LAST_PLAYER_STANDING", winnerPlayerId: A },
  );
});

test("2-player cycle 도중 상대 forfeit는 STALEMATE 대신 즉시 LAST_PLAYER_STANDING이다", () => {
  const turnOrder = Object.freeze([A, B]);
  const transition = applyNumberTileForfeit(
    turnOrder,
    new Set(),
    [A],
    B,
  );

  assert.deepEqual(transition.noPlayPlayerIds, [A]);
  assert.deepEqual(
    evaluateNumberTileFinish({
      turnOrder,
      forfeitedPlayerIds: transition.forfeitedPlayerIds,
      noPlayPlayerIds: transition.noPlayPlayerIds,
      poolTileCount: 0,
      rackEmptyPlayerId: null,
    }),
    { reason: "LAST_PLAYER_STANDING", winnerPlayerId: A },
  );
});

test("3-player cycle에서 unrecorded Player forfeit 후 remaining 기록이 완성돼 있으면 STALEMATE다", () => {
  const transition = applyNumberTileForfeit(
    TURN_ORDER,
    new Set(),
    [A, B],
    C,
  );

  assert.deepEqual(transition.noPlayPlayerIds, [A, B]);
  assert.deepEqual(
    evaluateNumberTileFinish({
      turnOrder: TURN_ORDER,
      forfeitedPlayerIds: transition.forfeitedPlayerIds,
      noPlayPlayerIds: transition.noPlayPlayerIds,
      poolTileCount: 0,
      rackEmptyPlayerId: null,
    }),
    { reason: "STALEMATE" },
  );
});

test("NUMBER_TILE은 final survivor 추가 forfeit와 all-forfeited finish를 fail-closed한다", () => {
  assert.throws(
    () => applyNumberTileForfeit(TURN_ORDER, new Set([B, C]), [], A),
    /final eligible/,
  );
  assert.throws(
    () =>
      evaluateNumberTileFinish({
        turnOrder: TURN_ORDER,
        forfeitedPlayerIds: new Set([A, B, C]),
        noPlayPlayerIds: [],
        poolTileCount: 0,
        rackEmptyPlayerId: null,
      }),
    /all-players-forfeited/,
  );
});

test("tracker는 unknown 또는 duplicate Player record를 fail-closed한다", () => {
  assert.throws(
    () => noPlay(A, [D]),
    /unknown Player/,
  );
  assert.throws(
    () => noPlay(A, [A, A]),
    /duplicates/,
  );
});
