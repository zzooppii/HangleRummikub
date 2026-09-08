import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import {
  deriveNumberTileRun,
  NumberTileRunV2Schema,
  type NumberTileRunFace,
  type NumberTileNumber,
} from "./index.js";

const orange = (number: NumberTileNumber): NumberTileRunFace => ({ color: "ORANGE", number });
function permutations<T>(values: readonly T[]): T[][] {
  return values.length === 0 ? [[]] : values.flatMap((value, index) =>
    permutations(values.filter((_item, position) => index !== position))
      .map(rest => [value, ...rest]));
}

test("production regression: orange 7, joker, orange 9, orange 6 has one canonical RUN in every permutation", () => {
  const physical = Object.freeze([
    Object.freeze({ tileId: "orange-seven", face: orange(7) }),
    Object.freeze({ tileId: "physical-joker", face: null }),
    Object.freeze({ tileId: "orange-nine", face: orange(9) }),
    Object.freeze({ tileId: "orange-six", face: orange(6) }),
  ]);
  for (const tiles of permutations(physical)) {
    const before = JSON.stringify(tiles);
    const result = deriveNumberTileRun(tiles.map(tile => tile.face));
    assert.equal(result.status, "VALID");
    if (result.status !== "VALID") throw new Error("Expected unique RUN.");
    assert.equal(result.solution.jokerNumber, 8);
    assert.equal(result.solution.value, 30);
    assert.deepEqual(result.solution.orderedIndices.map(index => tiles[index]?.tileId),
      ["orange-six", "orange-seven", "physical-joker", "orange-nine"]);
    assert.equal(JSON.stringify(tiles), before);
    assert.equal(Object.isFrozen(result), true);
    assert.equal(Object.isFrozen(result.solution), true);
    assert.equal(Object.isFrozen(result.solution.orderedIndices), true);
  }
});

test("ordinary unordered RUNs canonicalize without changing their physical index membership", () => {
  for (const numbers of permutations([4, 6, 5] as const)) {
    const result = deriveNumberTileRun(numbers.map(orange));
    assert.equal(result.status, "VALID");
    if (result.status !== "VALID") throw new Error("Expected ordinary RUN.");
    assert.equal(result.solution.jokerNumber, null);
    assert.equal(result.solution.value, 15);
    assert.deepEqual(result.solution.orderedIndices.map(index => numbers[index]), [4, 5, 6]);
  }
});

test("unique boundary Joker solutions ignore impossible raw edge positions without wrapping", () => {
  for (const [faces, expected] of [
    [[null, orange(1), orange(2)], 3],
    [[orange(12), orange(13), null], 11],
  ] as const) {
    const result = deriveNumberTileRun(faces);
    assert.equal(result.status, "VALID");
    if (result.status !== "VALID") throw new Error("Expected unique boundary RUN.");
    assert.equal(result.solution.jokerNumber, expected);
  }
  assert.equal(deriveNumberTileRun([orange(13), null, orange(1)]).status, "INVALID");
});

test("genuine Joker ambiguity honors valid positional intent but never silently picks a numeric outcome", () => {
  for (const [faces, joker, value] of [
    [[null, orange(5), orange(6)], 4, 15],
    [[orange(5), orange(6), null], 7, 18],
  ] as const) {
    const result = deriveNumberTileRun(faces);
    assert.equal(result.status, "VALID");
    if (result.status !== "VALID") throw new Error("Expected explicit ordered intention.");
    assert.equal(result.solution.jokerNumber, joker);
    assert.equal(result.solution.value, value);
  }
  const unresolved = deriveNumberTileRun([orange(6), null, orange(5)]);
  assert.equal(unresolved.status, "AMBIGUOUS");
  if (unresolved.status !== "AMBIGUOUS") throw new Error("Expected two choices.");
  assert.deepEqual(unresolved.candidates.map(candidate => candidate.jokerNumber), [4, 7]);
  assert.deepEqual(unresolved.candidates.map(candidate => candidate.value), [15, 18]);
  assert.equal(Object.isFrozen(unresolved.candidates), true);
});

test("unordered inference still rejects gaps, mixed colors, duplicate numbers, multiple Jokers and short melds", () => {
  const invalid: readonly (readonly NumberTileRunFace[])[] = [
    [orange(4), null, orange(7)],
    [orange(4), { color: "RED", number: 5 }, orange(6)],
    [orange(4), orange(4), null],
    [orange(4), null, null],
    [orange(4), orange(5)],
    [orange(4), orange(6), orange(7)],
    [orange(12), orange(13), orange(1)],
  ];
  for (const faces of invalid) assert.equal(deriveNumberTileRun(faces).status, "INVALID");
});

test("canonical Number V2 output remains strict ordered bare-Joker wire, not an unordered public snapshot", () => {
  const raw = [
    { tileId: "orange-seven", kind: "ORDINARY", color: "ORANGE", number: 7 },
    { tileId: "physical-joker", kind: "JOKER" },
    { tileId: "orange-nine", kind: "ORDINARY", color: "ORANGE", number: 9 },
    { tileId: "orange-six", kind: "ORDINARY", color: "ORANGE", number: 6 },
  ] as const;
  const result = deriveNumberTileRun(raw.map(tile => tile.kind === "JOKER" ? null : tile));
  if (result.status !== "VALID") throw new Error("Expected screenshot RUN.");
  assert.equal(v.safeParse(NumberTileRunV2Schema, { kind: "RUN", tiles: raw }).success, false);
  const canonical = { kind: "RUN", tiles: result.solution.orderedIndices.map(index => raw[index]) };
  assert.equal(v.safeParse(NumberTileRunV2Schema, canonical).success, true);
  assert.deepEqual(canonical.tiles[2], { tileId: "physical-joker", kind: "JOKER" });
});
