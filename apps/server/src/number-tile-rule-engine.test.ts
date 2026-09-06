import assert from "node:assert/strict";
import test from "node:test";

import { TileIdSchema, type TileId } from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  validateNumberTileMeld,
  validateNumberTileSubmit,
  type NumberTileRuleFailureCode,
} from "./games/number-tile/domain/rule-engine.js";
import type {
  NumberTileJokerPlacement,
  NumberTileMeld,
  NumberTileOrdinaryPlacement,
  NumberTilePlacement,
  NumberTileTable,
} from "./games/number-tile/domain/table.js";
import type {
  NumberTile,
  NumberTileColor,
  NumberTileNumber,
} from "./games/number-tile/domain/tile.js";

class RuleFixture {
  readonly tilesById = new Map<TileId, NumberTile>();
  #sequence = 0;

  ordinary(
    color: NumberTileColor,
    number: NumberTileNumber,
  ): NumberTileOrdinaryPlacement {
    const tileId = parse(
      TileIdSchema,
      `number-rule-${this.#sequence += 1}`,
    );
    this.tilesById.set(
      tileId,
      Object.freeze({ tileId, kind: "ORDINARY", color, number }),
    );
    return Object.freeze({ tileId, kind: "ORDINARY" });
  }

  joker(
    assignedColor: NumberTileColor,
    assignedNumber: NumberTileNumber,
  ): NumberTileJokerPlacement {
    const tileId = parse(
      TileIdSchema,
      `number-rule-${this.#sequence += 1}`,
    );
    this.tilesById.set(tileId, Object.freeze({ tileId, kind: "JOKER" }));
    return Object.freeze({
      tileId,
      kind: "JOKER",
      assignedColor,
      assignedNumber,
    });
  }
}

function table(...melds: readonly NumberTileMeld[]): NumberTileTable {
  return { melds };
}

function run(...tiles: readonly NumberTilePlacement[]): NumberTileMeld {
  return { kind: "RUN", tiles };
}

function group(...tiles: readonly NumberTilePlacement[]): NumberTileMeld {
  return { kind: "GROUP", tiles };
}

function tileIds(...placements: readonly NumberTilePlacement[]): TileId[] {
  return placements.map((placement) => placement.tileId);
}

function submit(
  fixture: RuleFixture,
  canonicalTable: NumberTileTable,
  proposedTable: NumberTileTable,
  rack: readonly NumberTilePlacement[],
  initialMeldCompleted: boolean,
) {
  return validateNumberTileSubmit({
    canonicalTable,
    proposedTable,
    tilesById: fixture.tilesById,
    actorRackTileIds: tileIds(...rack),
    initialMeldCompleted,
  });
}

function assertFailure(
  result: ReturnType<typeof validateNumberTileSubmit>,
  code: NumberTileRuleFailureCode,
): void {
  assert.deepEqual(result, { ok: false, error: { code } });
}

test("initial meld exactly 30은 성공하고 completion candidate를 만든다", () => {
  const fixture = new RuleFixture();
  const red10 = fixture.ordinary("RED", 10);
  const blue10 = fixture.ordinary("BLUE", 10);
  const black10 = fixture.ordinary("BLACK", 10);
  const result = submit(
    fixture,
    table(),
    table(group(red10, blue10, black10)),
    [red10, blue10, black10],
    false,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.initialMeldValue, 30);
    assert.equal(result.value.completesInitialMeld, true);
    assert.deepEqual(result.value.remainingRackTileIds, []);
  }
});

test("initial meld 29는 atomic candidate 단계에서 거절한다", () => {
  const fixture = new RuleFixture();
  const first = [2, 3, 4].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  const second = ["RED", "BLUE", "BLACK", "ORANGE"].map((color) =>
    fixture.ordinary(color as NumberTileColor, 5),
  );
  const canonical = table();
  const proposed = table(run(...first), group(...second));
  const result = submit(
    fixture,
    canonical,
    proposed,
    [...first, ...second],
    false,
  );

  assertFailure(result, "INITIAL_MELD_TOO_LOW");
  assert.deepEqual(canonical, { melds: [] });
  assert.equal(proposed.melds.length, 2);
});

test("여러 새 meld의 value를 합산해 initial 30을 허용한다", () => {
  const fixture = new RuleFixture();
  const redRun = [4, 5, 6].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  const fives = ["BLUE", "BLACK", "ORANGE"].map((color) =>
    fixture.ordinary(color as NumberTileColor, 5),
  );
  const result = submit(
    fixture,
    table(),
    table(run(...redRun), group(...fives)),
    [...redRun, ...fives],
    false,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.initialMeldValue, 30);
  }
});

test("initial 30은 existing Table 값이 아니라 새 rack meld 값만 센다", () => {
  const fixture = new RuleFixture();
  const existing = [10, 11, 12].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  const fresh = [1, 2, 3].map((number) =>
    fixture.ordinary("BLUE", number as NumberTileNumber),
  );

  assertFailure(
    submit(
      fixture,
      table(run(...existing)),
      table(run(...existing), run(...fresh)),
      fresh,
      false,
    ),
    "INITIAL_MELD_TOO_LOW",
  );
});

test("initial meld Joker는 assigned number value를 사용한다", () => {
  const fixture = new RuleFixture();
  const orange9 = fixture.ordinary("ORANGE", 9);
  const joker10 = fixture.joker("ORANGE", 10);
  const orange11 = fixture.ordinary("ORANGE", 11);
  const result = submit(
    fixture,
    table(),
    table(run(orange9, joker10, orange11)),
    [orange9, joker10, orange11],
    false,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.initialMeldValue, 30);
  }
});

test("initial player는 existing Table을 그대로 두고 새 meld만 추가할 수 있다", () => {
  const fixture = new RuleFixture();
  const old = [1, 2, 3].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  const fresh = [10, 11, 12].map((number) =>
    fixture.ordinary("BLUE", number as NumberTileNumber),
  );
  const canonical = table(run(...old));
  const result = submit(
    fixture,
    canonical,
    table(run(...fresh), run(...old)),
    fresh,
    false,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.value.initialMeldValue, 33);
  }
});

test("initial player는 GROUP order와 Table order 변화만으로 기존 meld를 변경한 것으로 보지 않는다", () => {
  const fixture = new RuleFixture();
  const oldGroup = [
    fixture.ordinary("RED", 7),
    fixture.ordinary("BLUE", 7),
    fixture.ordinary("BLACK", 7),
  ];
  const freshRun = [10, 11, 12].map((number) =>
    fixture.ordinary("ORANGE", number as NumberTileNumber),
  );
  const result = submit(
    fixture,
    table(group(...oldGroup)),
    table(run(...freshRun), group(...[...oldGroup].reverse())),
    freshRun,
    false,
  );

  assert.equal(result.ok, true);
});

test("initial player는 existing Joker assignment를 바꿀 수 없다", () => {
  const fixture = new RuleFixture();
  const red7 = fixture.ordinary("RED", 7);
  const blue7 = fixture.ordinary("BLUE", 7);
  const joker = fixture.joker("BLACK", 7);
  const fresh = ["RED", "BLUE", "BLACK"].map((color) =>
    fixture.ordinary(color as NumberTileColor, 10),
  );

  assertFailure(
    submit(
      fixture,
      table(group(red7, blue7, joker)),
      table(
        group(red7, blue7, {
          ...joker,
          assignedColor: "ORANGE",
        }),
        group(...fresh),
      ),
      fresh,
      false,
    ),
    "TABLE_REARRANGEMENT_NOT_ALLOWED",
  );
});

test("initial player가 existing Table을 regroup하면 거절한다", () => {
  const fixture = new RuleFixture();
  const old = [1, 2, 3].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  const fresh = [4, 5, 6, 7, 8, 9].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  assertFailure(
    submit(
      fixture,
      table(run(...old)),
      table(run(...old, ...fresh)),
      fresh,
      false,
    ),
    "TABLE_REARRANGEMENT_NOT_ALLOWED",
  );
});

test("initial player가 새 meld를 내지 않으면 거절한다", () => {
  const fixture = new RuleFixture();
  const old = [1, 2, 3].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  assertFailure(
    submit(fixture, table(run(...old)), table(run(...old)), [], false),
    "INITIAL_MELD_REQUIRED",
  );
});

test("동일 pattern의 별도 meld는 distinct physical IDs이면 허용한다", () => {
  const fixture = new RuleFixture();
  const first = ["RED", "BLUE", "BLACK"].map((color) =>
    fixture.ordinary(color as NumberTileColor, 10),
  );
  const second = ["RED", "BLUE", "BLACK"].map((color) =>
    fixture.ordinary(color as NumberTileColor, 10),
  );
  const result = submit(
    fixture,
    table(),
    table(group(...first), group(...second)),
    [...first, ...second],
    false,
  );
  assert.equal(result.ok, true);
});

test("normal turn은 existing RUN split과 rack tile extension을 허용한다", () => {
  const fixture = new RuleFixture();
  const threeToSix = [3, 4, 5, 6].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  const eightToTen = [8, 9, 10].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  const seven = fixture.ordinary("RED", 7);
  const result = submit(
    fixture,
    table(run(...threeToSix), run(...eightToTen)),
    table(run(...threeToSix.slice(0, 3)), run(threeToSix[3]!, seven, ...eightToTen)),
    [seven],
    true,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.newlyUsedRackTileIds, [seven.tileId]);
    assert.equal(result.value.completesInitialMeld, false);
    assert.equal(result.value.initialMeldValue, null);
  }
});

test("normal turn은 두 RUN의 merge를 허용한다", () => {
  const fixture = new RuleFixture();
  const oneToThree = [1, 2, 3].map((number) =>
    fixture.ordinary("BLUE", number as NumberTileNumber),
  );
  const fiveToSeven = [5, 6, 7].map((number) =>
    fixture.ordinary("BLUE", number as NumberTileNumber),
  );
  const four = fixture.ordinary("BLUE", 4);
  assert.equal(
    submit(
      fixture,
      table(run(...oneToThree), run(...fiveToSeven)),
      table(run(...oneToThree, four, ...fiveToSeven)),
      [four],
      true,
    ).ok,
    true,
  );
});

test("normal turn은 4-color GROUP tile을 RUN으로 이동할 수 있다", () => {
  const fixture = new RuleFixture();
  const red7 = fixture.ordinary("RED", 7);
  const blue7 = fixture.ordinary("BLUE", 7);
  const black7 = fixture.ordinary("BLACK", 7);
  const orange7 = fixture.ordinary("ORANGE", 7);
  const orange8 = fixture.ordinary("ORANGE", 8);
  const orange9 = fixture.ordinary("ORANGE", 9);
  assert.equal(
    submit(
      fixture,
      table(group(red7, blue7, black7, orange7)),
      table(group(red7, blue7, black7), run(orange7, orange8, orange9)),
      [orange8, orange9],
      true,
    ).ok,
    true,
  );
});

test("rack의 마지막 physical Joker를 valid meld에 내면 remaining rack이 비어진다", () => {
  const fixture = new RuleFixture();
  const red7 = fixture.ordinary("RED", 7);
  const blue7 = fixture.ordinary("BLUE", 7);
  const black7 = fixture.ordinary("BLACK", 7);
  const joker = fixture.joker("ORANGE", 7);
  const result = submit(
    fixture,
    table(group(red7, blue7, black7)),
    table(group(red7, blue7, black7, joker)),
    [joker],
    true,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.newlyUsedRackTileIds, [joker.tileId]);
    assert.deepEqual(result.value.remainingRackTileIds, []);
  }
});

test("valid final Table이어도 rack contribution이 없으면 거절한다", () => {
  const fixture = new RuleFixture();
  const old = [1, 2, 3].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  assertFailure(
    submit(fixture, table(run(...old)), table(run(...old)), [], true),
    "NO_NEW_RACK_TILE",
  );
});

test("pre-turn Table physical tile이 누락되면 conservation failure다", () => {
  const fixture = new RuleFixture();
  const old = [1, 2, 3, 4].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  const five = fixture.ordinary("RED", 5);
  assertFailure(
    submit(
      fixture,
      table(run(...old)),
      table(run(old[0]!, old[1]!, five)),
      [five],
      true,
    ),
    "TILE_CONSERVATION_FAILED",
  );
});

test("같거나 다른 meld의 duplicate tileId는 전역에서 거절한다", () => {
  const fixture = new RuleFixture();
  const old = [1, 2, 3].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  const sevenBlue = fixture.ordinary("BLUE", 7);
  const sevenBlack = fixture.ordinary("BLACK", 7);
  assertFailure(
    submit(
      fixture,
      table(run(...old)),
      table(
        run(...old),
        group(old[0]!, sevenBlue, sevenBlack),
      ),
      [sevenBlue, sevenBlack],
      true,
    ),
    "DUPLICATE_TILE_REFERENCE",
  );
});

test("unknown과 known-but-unowned Tile은 같은 access error로 정규화한다", () => {
  const fixture = new RuleFixture();
  const old = [1, 2, 3].map((number) =>
    fixture.ordinary("RED", number as NumberTileNumber),
  );
  const actorFour = fixture.ordinary("RED", 4);
  const otherFive = fixture.ordinary("RED", 5);
  const unknownId = parse(TileIdSchema, "number-rule-unknown");

  const knownResult = submit(
    fixture,
    table(run(...old)),
    table(run(...old, otherFive)),
    [actorFour],
    true,
  );
  const unknownResult = submit(
    fixture,
    table(run(...old)),
    table(
      run(
        ...old,
        { tileId: unknownId, kind: "JOKER", assignedColor: "NOPE", assignedNumber: 99 } as unknown as NumberTilePlacement,
      ),
    ),
    [actorFour],
    true,
  );
  assertFailure(knownResult, "INVALID_TILE_ACCESS");
  assertFailure(unknownResult, "INVALID_TILE_ACCESS");
});

test("exact ordinary replacement과 same-Submit Joker reuse는 성공한다", () => {
  const fixture = new RuleFixture();
  const red5 = fixture.ordinary("RED", 5);
  const joker = fixture.joker("RED", 6);
  const red7 = fixture.ordinary("RED", 7);
  const red6 = fixture.ordinary("RED", 6);
  const blue9 = fixture.ordinary("BLUE", 9);
  const black9 = fixture.ordinary("BLACK", 9);
  const finalJoker = Object.freeze({
    ...joker,
    assignedColor: "ORANGE" as const,
    assignedNumber: 9 as const,
  });
  const result = submit(
    fixture,
    table(run(red5, joker, red7)),
    table(run(red5, red6, red7), group(blue9, black9, finalJoker)),
    [red6, blue9, black9],
    true,
  );

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.recoveredJokerTileIds, [joker.tileId]);
    assert.deepEqual(result.value.newlyUsedRackTileIds, [
      red6.tileId,
      blue9.tileId,
      black9.tileId,
    ]);
  }
});

for (const [
  label,
  replacementColor,
  replacementNumber,
  supportColor,
  supportNumbers,
] of [
  ["wrong color", "BLUE", 6, "BLUE", [7, 8]],
  ["wrong number", "RED", 8, "RED", [9, 10]],
] as const) {
  test(`Joker recovery의 ${label} replacement는 거절한다`, () => {
    const fixture = new RuleFixture();
    const red5 = fixture.ordinary("RED", 5);
    const joker = fixture.joker("RED", 6);
    const red7 = fixture.ordinary("RED", 7);
    const existingRed6 = fixture.ordinary("RED", 6);
    const existingBlue6 = fixture.ordinary("BLUE", 6);
    const existingBlack6 = fixture.ordinary("BLACK", 6);
    const existingOrange6 = fixture.ordinary("ORANGE", 6);
    const replacement = fixture.ordinary(
      replacementColor,
      replacementNumber,
    );
    const support = supportNumbers.map((number) =>
      fixture.ordinary(supportColor, number),
    );
    const blue9 = fixture.ordinary("BLUE", 9);
    const black9 = fixture.ordinary("BLACK", 9);
    const finalJoker = {
      ...joker,
      assignedColor: "ORANGE" as const,
      assignedNumber: 9 as const,
    };
    const result = submit(
      fixture,
      table(
        run(red5, joker, red7),
        group(existingRed6, existingBlue6, existingBlack6, existingOrange6),
      ),
      table(
        run(red5, existingRed6, red7),
        group(existingBlue6, existingBlack6, existingOrange6),
        run(replacement, ...support),
        group(blue9, black9, finalJoker),
      ),
      [replacement, ...support, blue9, black9],
      true,
    );
    assertFailure(result, "INVALID_JOKER_RECOVERY");
  });
}

test("matching pre-table ordinary는 recovered Joker replacement 공급이 아니다", () => {
  const fixture = new RuleFixture();
  const red5a = fixture.ordinary("RED", 5);
  const jokerA = fixture.joker("RED", 6);
  const red7a = fixture.ordinary("RED", 7);
  const red5b = fixture.ordinary("RED", 5);
  const jokerB = fixture.joker("RED", 6);
  const red7b = fixture.ordinary("RED", 7);
  const existingRed6 = fixture.ordinary("RED", 6);
  const blue6 = fixture.ordinary("BLUE", 6);
  const black6 = fixture.ordinary("BLACK", 6);
  const actorRed6 = fixture.ordinary("RED", 6);
  const actorOrange6 = fixture.ordinary("ORANGE", 6);
  const actorBlue9 = fixture.ordinary("BLUE", 9);
  const actorBlack9 = fixture.ordinary("BLACK", 9);
  const actorBlue10 = fixture.ordinary("BLUE", 10);
  const actorBlack10 = fixture.ordinary("BLACK", 10);
  const finalJokerA = { ...jokerA, assignedColor: "ORANGE" as const, assignedNumber: 9 as const };
  const finalJokerB = { ...jokerB, assignedColor: "ORANGE" as const, assignedNumber: 10 as const };
  const result = submit(
    fixture,
    table(
      run(red5a, jokerA, red7a),
      run(red5b, jokerB, red7b),
      group(existingRed6, blue6, black6),
    ),
    table(
      run(red5a, actorRed6, red7a),
      run(red5b, existingRed6, red7b),
      group(blue6, black6, actorOrange6),
      group(actorBlue9, actorBlack9, finalJokerA),
      group(actorBlue10, actorBlack10, finalJokerB),
    ),
    [
      actorRed6,
      actorOrange6,
      actorBlue9,
      actorBlack9,
      actorBlue10,
      actorBlack10,
    ],
    true,
  );
  assertFailure(result, "INVALID_JOKER_RECOVERY");
});

test("같은 old face Joker 두 장은 exact replacement 두 장이면 성공한다", () => {
  const fixture = new RuleFixture();
  const red5a = fixture.ordinary("RED", 5);
  const jokerA = fixture.joker("RED", 6);
  const red7a = fixture.ordinary("RED", 7);
  const red5b = fixture.ordinary("RED", 5);
  const jokerB = fixture.joker("RED", 6);
  const red7b = fixture.ordinary("RED", 7);
  const red6a = fixture.ordinary("RED", 6);
  const red6b = fixture.ordinary("RED", 6);
  const blue9 = fixture.ordinary("BLUE", 9);
  const black9 = fixture.ordinary("BLACK", 9);
  const blue10 = fixture.ordinary("BLUE", 10);
  const black10 = fixture.ordinary("BLACK", 10);
  const result = submit(
    fixture,
    table(run(red5a, jokerA, red7a), run(red5b, jokerB, red7b)),
    table(
      run(red5a, red6a, red7a),
      run(red5b, red6b, red7b),
      group(blue9, black9, { ...jokerA, assignedColor: "ORANGE", assignedNumber: 9 }),
      group(blue10, black10, { ...jokerB, assignedColor: "ORANGE", assignedNumber: 10 }),
    ),
    [red6a, red6b, blue9, black9, blue10, black10],
    true,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.recoveredJokerTileIds, [
      jokerA.tileId,
      jokerB.tileId,
    ]);
  }
});

test("assignment가 같은 Joker는 meld 위치가 바뀌어도 recovery가 아니다", () => {
  const fixture = new RuleFixture();
  const red5 = fixture.ordinary("RED", 5);
  const joker = fixture.joker("RED", 6);
  const red7 = fixture.ordinary("RED", 7);
  const red8 = fixture.ordinary("RED", 8);
  const red4 = fixture.ordinary("RED", 4);
  const result = submit(
    fixture,
    table(run(red5, joker, red7)),
    table(run(red4, red5, joker, red7, red8)),
    [red4, red8],
    true,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.recoveredJokerTileIds, []);
  }
});

test("pre-turn Joker가 final Table에서 사라지면 conservation failure다", () => {
  const fixture = new RuleFixture();
  const red5 = fixture.ordinary("RED", 5);
  const joker = fixture.joker("RED", 6);
  const red7 = fixture.ordinary("RED", 7);
  const red6 = fixture.ordinary("RED", 6);
  assertFailure(
    submit(
      fixture,
      table(run(red5, joker, red7)),
      table(run(red5, red6, red7)),
      [red6],
      true,
    ),
    "TILE_CONSERVATION_FAILED",
  );
});

test("성공 output Table은 input에서 detached되고 deep-frozen된다", () => {
  const fixture = new RuleFixture();
  const old = [1, 2, 3].map((number) =>
    fixture.ordinary("BLACK", number as NumberTileNumber),
  );
  const four = fixture.ordinary("BLACK", 4);
  const proposed = table(run(...old, four));
  const result = submit(
    fixture,
    table(run(...old)),
    proposed,
    [four],
    true,
  );
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.notEqual(result.value.table, proposed);
    assert.notEqual(result.value.table.melds, proposed.melds);
    assert.ok(Object.isFrozen(result.value));
    assert.ok(Object.isFrozen(result.value.table));
    assert.ok(Object.isFrozen(result.value.table.melds));
    assert.ok(Object.isFrozen(result.value.table.melds[0]!.tiles));
  }
});

test("corrupt canonical Table은 candidate failure로 숨기지 않고 fail-fast한다", () => {
  const fixture = new RuleFixture();
  const red1 = fixture.ordinary("RED", 1);
  const red3 = fixture.ordinary("RED", 3);
  const red4 = fixture.ordinary("RED", 4);
  assert.throws(
    () =>
      submit(
        fixture,
        table(run(red1, red3, red4)),
        table(run(red1, red3, red4)),
        [],
        true,
      ),
    /Invalid canonical Number Table/u,
  );
});

test("runtime-corrupt ordinary face와 lookup key mismatch는 fail-fast한다", () => {
  const invalidFaceFixture = new RuleFixture();
  const invalidFace = invalidFaceFixture.ordinary("RED", 7);
  const blue = invalidFaceFixture.ordinary("BLUE", 7);
  const black = invalidFaceFixture.ordinary("BLACK", 7);
  invalidFaceFixture.tilesById.set(
    invalidFace.tileId,
    {
      tileId: invalidFace.tileId,
      kind: "ORDINARY",
      color: "RED",
      number: 99,
    } as unknown as NumberTile,
  );
  assert.throws(
    () =>
      validateNumberTileMeld(
        group(invalidFace, blue, black),
        invalidFaceFixture.tilesById,
      ),
    /Invalid Number Tile descriptor/u,
  );

  const keyFixture = new RuleFixture();
  const keyedPlacement = keyFixture.ordinary("RED", 7);
  const keyedBlue = keyFixture.ordinary("BLUE", 7);
  const keyedBlack = keyFixture.ordinary("BLACK", 7);
  const differentId = parse(TileIdSchema, "number-rule-different-id");
  keyFixture.tilesById.set(
    keyedPlacement.tileId,
    Object.freeze({
      tileId: differentId,
      kind: "ORDINARY",
      color: "RED",
      number: 7,
    }),
  );
  assert.throws(
    () =>
      validateNumberTileMeld(
        group(keyedPlacement, keyedBlue, keyedBlack),
        keyFixture.tilesById,
      ),
    /lookup key does not match tileId/u,
  );

  const rackFixture = new RuleFixture();
  const oldRun = [1, 2, 3].map((number) =>
    rackFixture.ordinary("ORANGE", number as NumberTileNumber),
  );
  const usedFour = rackFixture.ordinary("ORANGE", 4);
  const unusedCorrupt = rackFixture.ordinary("BLACK", 9);
  rackFixture.tilesById.set(
    unusedCorrupt.tileId,
    {
      tileId: unusedCorrupt.tileId,
      kind: "ORDINARY",
      color: "BLACK",
      number: 99,
    } as unknown as NumberTile,
  );
  assert.throws(
    () =>
      submit(
        rackFixture,
        table(run(...oldRun)),
        table(run(...oldRun, usedFour)),
        [usedFour, unusedCorrupt],
        true,
      ),
    /Invalid Number Tile descriptor/u,
  );
});
