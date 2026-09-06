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
  calculateNumberTileRackPenalty,
  createNumberTileLastPlayerStandingResult,
  createNumberTileRackEmptyResult,
  createNumberTileStalemateResult,
  type NumberTileResultEngineInput,
} from "./games/number-tile/domain/result-engine.js";
import type { NumberTile } from "./games/number-tile/domain/tile.js";

const A = parse(PlayerIdSchema, "number-result-player-a");
const B = parse(PlayerIdSchema, "number-result-player-b");
const C = parse(PlayerIdSchema, "number-result-player-c");
const D = parse(PlayerIdSchema, "number-result-player-d");

function tileId(value: string): TileId {
  return parse(TileIdSchema, value);
}

function ordinary(value: string, number: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13): NumberTile {
  return Object.freeze({
    tileId: tileId(value),
    kind: "ORDINARY",
    number,
    color: "RED",
  });
}

function joker(value: string): NumberTile {
  return Object.freeze({ tileId: tileId(value), kind: "JOKER" });
}

function resultInput(
  playerRacks: readonly (readonly [PlayerId, readonly NumberTile[]])[],
  forfeitedPlayerIds: ReadonlySet<PlayerId> = new Set(),
): NumberTileResultEngineInput {
  const tiles = playerRacks.flatMap(([, rack]) => rack);
  return Object.freeze({
    playerIds: Object.freeze(playerRacks.map(([playerId]) => playerId)),
    racks: new Map(
      playerRacks.map(([playerId, rack]) => [
        playerId,
        Object.freeze(rack.map((tile) => tile.tileId)),
      ]),
    ),
    tilesById: new Map(tiles.map((tile) => [tile.tileId, tile])),
    forfeitedPlayerIds,
    finishedAt: parse(ServerTimeSchema, 42_000),
  });
}

test("Number rack penalty는 ordinary face value와 Joker 30을 합산한다", () => {
  const five = ordinary("penalty-five", 5);
  const thirteen = ordinary("penalty-thirteen", 13);
  const wild = joker("penalty-joker");
  const tiles = new Map([five, thirteen, wild].map((tile) => [tile.tileId, tile]));

  assert.equal(
    calculateNumberTileRackPenalty(
      [five.tileId, thirteen.tileId, wild.tileId],
      tiles,
    ),
    48,
  );
});

test("Joker-only rack의 canonical penalty는 30이다", () => {
  const wild = joker("joker-only-penalty");
  assert.equal(
    calculateNumberTileRackPenalty(
      [wild.tileId],
      new Map([[wild.tileId, wild]]),
    ),
    30,
  );
});

test("RACK_EMPTY winner는 다른 Player penalty 합을 받고 loser는 own negative penalty를 받는다", () => {
  const bTiles = [ordinary("rack-b-8", 8), ordinary("rack-b-10", 10)];
  const cTiles = [ordinary("rack-c-13", 13), ordinary("rack-c-12", 12), ordinary("rack-c-2", 2)];
  const result = createNumberTileRackEmptyResult(
    resultInput(
      [
        [A, []],
        [B, bTiles],
        [C, cTiles],
      ],
      new Set([C]),
    ),
    A,
  );

  assert.deepEqual(result.winnerPlayerIds, [A]);
  assert.deepEqual(
    result.playerResults.map(({ playerId, score, penaltyCost }) => ({
      playerId,
      score,
      penaltyCost,
    })),
    [
      { playerId: A, score: 45, penaltyCost: 0 },
      { playerId: B, score: -18, penaltyCost: 18 },
      { playerId: C, score: -27, penaltyCost: 27 },
    ],
  );
  assert.equal(result.playerResults[2]?.forfeited, true);
  assert.equal(result.playerResults.some((entry) => "rank" in entry), false);
});

test("LAST_PLAYER_STANDING은 유일한 non-forfeited Player를 winner로 만든다", () => {
  const result = createNumberTileLastPlayerStandingResult(
    resultInput(
      [
        [A, [ordinary("lps-a-3", 3)]],
        [B, [ordinary("lps-b-7", 7)]],
        [C, [ordinary("lps-c-11", 11), joker("lps-c-joker")]],
      ],
      new Set([A, C]),
    ),
  );

  assert.deepEqual(result.winnerPlayerIds, [B]);
  assert.deepEqual(result.playerResults.map((entry) => entry.score), [-3, 44, -41]);
  assert.deepEqual(
    result.playerResults.map((entry) => entry.forfeited),
    [true, false, true],
  );
  assert.equal(result.playerResults.some((entry) => "rank" in entry), false);
});

test("STALEMATE는 non-forfeited lower penalty tie를 1,1,3으로 ranking한다", () => {
  const result = createNumberTileStalemateResult(
    resultInput([
      [A, [ordinary("stalemate-a-8", 8)]],
      [B, [ordinary("stalemate-b-8", 8)]],
      [C, [ordinary("stalemate-c-13", 13), ordinary("stalemate-c-7", 7)]],
    ]),
  );

  assert.deepEqual(result.winnerPlayerIds, [A, B]);
  assert.deepEqual(result.rankings.map((entry) => entry.rank), [1, 1, 3]);
  assert.deepEqual(result.rankings.map((entry) => entry.score), [-8, -8, -20]);
});

test("STALEMATE는 forfeited Player를 penalty와 무관하게 eligible 뒤에 둔다", () => {
  const result = createNumberTileStalemateResult(
    resultInput(
      [
        [A, [ordinary("group-a-8", 8)]],
        [B, [ordinary("group-b-13", 13), ordinary("group-b-2", 2)]],
        [C, [ordinary("group-c-3", 3)]],
        [D, [ordinary("group-d-13", 13), ordinary("group-d-7", 7)]],
      ],
      new Set([C, D]),
    ),
  );

  assert.deepEqual(result.winnerPlayerIds, [A]);
  assert.deepEqual(
    result.rankings.map(({ playerId, rank, score }) => ({ playerId, rank, score })),
    [
      { playerId: A, rank: 1, score: -8 },
      { playerId: B, rank: 2, score: -15 },
      { playerId: C, rank: 3, score: -3 },
      { playerId: D, rank: 4, score: -20 },
    ],
  );
});

test("4-player STALEMATE forfeited subgroup tie는 preceding count를 offset으로 사용한다", () => {
  const result = createNumberTileStalemateResult(
    resultInput(
      [
        [A, [ordinary("tie-a-8", 8)]],
        [B, [ordinary("tie-b-8", 8)]],
        [C, [ordinary("tie-c-3", 3)]],
        [D, [ordinary("tie-d-3", 3)]],
      ],
      new Set([C, D]),
    ),
  );

  assert.deepEqual(result.rankings.map((entry) => entry.rank), [1, 1, 3, 3]);
  assert.deepEqual(result.rankings.map((entry) => entry.playerId), [A, B, C, D]);
});

test("STALEMATE는 더 높은 우선순위인 empty-rack terminal을 우회하지 않는다", () => {
  assert.throws(
    () =>
      createNumberTileStalemateResult(
        resultInput([
          [A, []],
          [B, [ordinary("empty-precedence-b-1", 1)]],
        ]),
      ),
    /cannot follow an unhandled rack-empty condition/u,
  );
});

test("result derivation은 duplicate physical rack reference와 unknown Tile을 거절한다", () => {
  const repeated = ordinary("duplicate-result-tile", 7);
  assert.throws(
    () =>
      createNumberTileStalemateResult(
        resultInput([
          [A, [repeated]],
          [B, [repeated]],
        ]),
      ),
    /more than one result rack position/,
  );

  const unknownId = tileId("unknown-result-tile");
  const input = resultInput([
    [A, []],
    [B, [ordinary("known-result-tile", 2)]],
  ]);
  const bRack = input.racks.get(B);
  assert.ok(bRack);
  const corrupt: NumberTileResultEngineInput = {
    ...input,
    racks: new Map([
      [A, [unknownId]],
      [B, bRack],
    ]),
  };
  assert.throws(
    () => createNumberTileStalemateResult(corrupt),
    /unknown Tile/,
  );
});

test("result reason preconditions는 invalid winner와 insufficient STALEMATE eligibility를 거절한다", () => {
  const activeRack = ordinary("precondition-active", 4);
  const source = resultInput([
    [A, [activeRack]],
    [B, [ordinary("precondition-b", 5)]],
  ]);
  assert.throws(
    () => createNumberTileRackEmptyResult(source, A),
    /empty rack/,
  );
  assert.throws(
    () => createNumberTileLastPlayerStandingResult(source),
    /exactly one survivor/,
  );
  assert.throws(
    () =>
      createNumberTileStalemateResult({
        ...source,
        forfeitedPlayerIds: new Set([B]),
      }),
    /at least two eligible/,
  );

  assert.throws(
    () =>
      createNumberTileRackEmptyResult(
        resultInput([
          [A, []],
          [B, []],
        ]),
        A,
      ),
    /exactly one empty rack/u,
  );

  assert.throws(
    () =>
      createNumberTileLastPlayerStandingResult(
        resultInput(
          [
            [A, []],
            [B, [ordinary("empty-lps-b", 2)]],
          ],
          new Set([B]),
        ),
      ),
    /cannot follow an unhandled rack-empty condition/u,
  );
});

test("result는 deterministic detached frozen output이며 caller collections를 mutate하지 않는다", () => {
  const racks = Object.freeze([
    [A, Object.freeze([ordinary("immutable-a", 4)])],
    [B, Object.freeze([ordinary("immutable-b", 6)])],
  ] as const);
  const source = resultInput(racks);
  const beforeRacks = [...source.racks].map(([playerId, rack]) => [
    playerId,
    [...rack],
  ]);

  const first = createNumberTileStalemateResult(source);
  const second = createNumberTileStalemateResult(source);

  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.deepEqual(
    [...source.racks].map(([playerId, rack]) => [playerId, [...rack]]),
    beforeRacks,
  );
  assert.equal(Object.isFrozen(first), true);
  assert.equal(Object.isFrozen(first.rankings), true);
  assert.equal(first.rankings.every(Object.isFrozen), true);
});
