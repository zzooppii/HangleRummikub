import assert from "node:assert/strict";
import test from "node:test";

import { FakeIdGenerator } from "../../infrastructure/system.js";
import {
  CANONICAL_TILE_INVENTORY_V1,
  JOKER_ALLOWED_SYMBOLS,
  TILE_INVENTORY_TOTALS,
  TILE_INVENTORY_VERSION,
  createCanonicalTileInstances,
} from "./tile-inventory.js";

const EXPECTED_ORDINARY_DEFINITIONS = [
  ["GIYEOK_NIEUN_ROTATION", "CONSONANT", 12, ["ㄱ", "ㄴ"]],
  ["DIGEUT", "CONSONANT", 6, ["ㄷ"]],
  ["RIEUL", "CONSONANT", 6, ["ㄹ"]],
  ["MIEUM", "CONSONANT", 6, ["ㅁ"]],
  ["BIEUP", "CONSONANT", 6, ["ㅂ"]],
  ["SIOT", "CONSONANT", 6, ["ㅅ"]],
  ["IEUNG", "CONSONANT", 6, ["ㅇ"]],
  ["JIEUT", "CONSONANT", 6, ["ㅈ"]],
  ["CHIEUT", "CONSONANT", 6, ["ㅊ"]],
  ["KIEUK", "CONSONANT", 6, ["ㅋ"]],
  ["TIEUT", "CONSONANT", 6, ["ㅌ"]],
  ["PIEUP", "CONSONANT", 6, ["ㅍ"]],
  ["HIEUH", "CONSONANT", 6, ["ㅎ"]],
  ["SSANG_BIEUP", "CONSONANT", 2, ["ㅃ"]],
  ["SSANG_JIEUT", "CONSONANT", 2, ["ㅉ"]],
  ["SSANG_DIGEUT", "CONSONANT", 2, ["ㄸ"]],
  ["SSANG_GIYEOK", "CONSONANT", 2, ["ㄲ"]],
  ["SSANG_SIOT", "CONSONANT", 2, ["ㅆ"]],
  ["A_ROTATION", "VOWEL", 20, ["ㅏ", "ㅓ", "ㅗ", "ㅜ"]],
  ["YA_ROTATION", "VOWEL", 20, ["ㅑ", "ㅕ", "ㅛ", "ㅠ"]],
  ["I_EU_ROTATION", "VOWEL", 12, ["ㅣ", "ㅡ"]],
  ["AE", "VOWEL", 2, ["ㅐ"]],
  ["E", "VOWEL", 2, ["ㅔ"]],
  ["YAE", "VOWEL", 2, ["ㅒ"]],
  ["YE", "VOWEL", 2, ["ㅖ"]],
] as const;

test("C-22 inventory v1은 exact physical family, quantity, symbol mapping을 한 곳에 정의한다", () => {
  assert.equal(TILE_INVENTORY_VERSION, "hangul-tile-inventory-v1");

  const ordinaryDefinitions = CANONICAL_TILE_INVENTORY_V1.filter(
    (definition) => definition.kind === "ORDINARY",
  ).map((definition) => [
    definition.physicalType,
    definition.sourceBag,
    definition.quantity,
    [...definition.allowedSymbols],
  ]);

  assert.deepEqual(ordinaryDefinitions, EXPECTED_ORDINARY_DEFINITIONS);
  assert.deepEqual(
    CANONICAL_TILE_INVENTORY_V1.filter(
      (definition) => definition.kind === "JOKER",
    ).map((definition) => [
      definition.physicalType,
      definition.sourceBag,
      definition.quantity,
    ]),
    [
      ["JOKER", "CONSONANT", 1],
      ["JOKER", "VOWEL", 1],
    ],
  );
});

test("inventory totals은 ordinary 94/60, Joker 2, physical pool 95/61, 전체 156이다", () => {
  assert.deepEqual(TILE_INVENTORY_TOTALS, {
    ordinaryConsonants: 94,
    ordinaryVowels: 60,
    jokers: 2,
    consonantPool: 95,
    vowelPool: 61,
    grandTotal: 156,
  });
});

test("Joker one-position universe는 RuleEngine과 공유하는 exact 19+14 symbols다", () => {
  assert.deepEqual(JOKER_ALLOWED_SYMBOLS, [
    "ㄱ",
    "ㄲ",
    "ㄴ",
    "ㄷ",
    "ㄸ",
    "ㄹ",
    "ㅁ",
    "ㅂ",
    "ㅃ",
    "ㅅ",
    "ㅆ",
    "ㅇ",
    "ㅈ",
    "ㅉ",
    "ㅊ",
    "ㅋ",
    "ㅌ",
    "ㅍ",
    "ㅎ",
    "ㅏ",
    "ㅐ",
    "ㅑ",
    "ㅒ",
    "ㅓ",
    "ㅔ",
    "ㅕ",
    "ㅖ",
    "ㅗ",
    "ㅛ",
    "ㅜ",
    "ㅠ",
    "ㅡ",
    "ㅣ",
  ]);
});

test("factory는 IdGenerator로 156개의 unique opaque Tile instance를 만든다", () => {
  const tiles = createCanonicalTileInstances(new FakeIdGenerator());
  const tileIds = tiles.map((tile) => tile.tileId);

  assert.equal(tiles.length, 156);
  assert.equal(new Set(tileIds).size, 156);
  assert.deepEqual(tileIds.slice(0, 3), [
    "test-tile-1",
    "test-tile-2",
    "test-tile-3",
  ]);
  assert.ok(tileIds.every((tileId) => !/[ㄱ-ㅎㅏ-ㅣ]/u.test(tileId)));
  assert.ok(tiles.every((tile) => !("assignedSymbol" in tile)));

  const ordinaryCount = tiles.filter((tile) => tile.kind === "ORDINARY").length;
  const jokerCount = tiles.filter((tile) => tile.kind === "JOKER").length;
  assert.equal(ordinaryCount, 154);
  assert.equal(jokerCount, 2);

  for (const definition of CANONICAL_TILE_INVENTORY_V1) {
    const matchingInstances = tiles.filter(
      (tile) =>
        tile.kind === definition.kind &&
        tile.physicalType === definition.physicalType &&
        tile.sourceBag === definition.sourceBag,
    );
    assert.equal(matchingInstances.length, definition.quantity);
  }
});

test("factory output과 canonical definitions의 모든 nested value는 frozen이다", () => {
  const tiles = createCanonicalTileInstances(new FakeIdGenerator());

  assert.ok(Object.isFrozen(CANONICAL_TILE_INVENTORY_V1));
  assert.ok(
    CANONICAL_TILE_INVENTORY_V1.every(
      (definition) =>
        Object.isFrozen(definition) &&
        (definition.kind === "JOKER" || Object.isFrozen(definition.allowedSymbols)),
    ),
  );
  assert.ok(Object.isFrozen(tiles));
  assert.ok(
    tiles.every(
      (tile) =>
        Object.isFrozen(tile) &&
        (tile.kind === "JOKER" || Object.isFrozen(tile.allowedSymbols)),
    ),
  );
});

test("duplicate tileId를 반환하는 generator는 canonical inventory를 만들 수 없다", () => {
  class DuplicateTileIdGenerator extends FakeIdGenerator {
    readonly #duplicateTileId = super.generateTileId();

    override generateTileId() {
      return this.#duplicateTileId;
    }
  }

  assert.throws(
    () => createCanonicalTileInstances(new DuplicateTileIdGenerator()),
    /duplicate tileId/u,
  );
});
