import assert from "node:assert/strict";
import test from "node:test";

import { TileIdSchema, type TileId } from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { FakeIdGenerator } from "./infrastructure/system.js";
import {
  NUMBER_TILE_INVENTORY_TOTALS,
  NUMBER_TILE_INVENTORY_VERSION,
  createCanonicalNumberTileInventory,
  createNumberTileInventory,
} from "./games/number-tile/domain/tile-inventory.js";
import {
  NUMBER_TILE_COLORS,
  NUMBER_TILE_NUMBERS,
  cloneNumberTile,
  isNumberTileColor,
  isNumberTileNumber,
  type NumberTile,
} from "./games/number-tile/domain/tile.js";

test("Number Tile inventory v1은 1..13 네 색 두 copy와 Joker 두 장으로 정확히 106장을 만든다", () => {
  const inventory = createCanonicalNumberTileInventory(new FakeIdGenerator());
  const ordinary = inventory.filter((tile) => tile.kind === "ORDINARY");
  const jokers = inventory.filter((tile) => tile.kind === "JOKER");

  assert.equal(NUMBER_TILE_INVENTORY_VERSION, "number-tile-inventory-v1");
  assert.deepEqual(NUMBER_TILE_INVENTORY_TOTALS, {
    ordinary: 104,
    jokers: 2,
    total: 106,
  });
  assert.equal(inventory.length, 106);
  assert.equal(ordinary.length, 104);
  assert.equal(jokers.length, 2);
  assert.equal(new Set(inventory.map((tile) => tile.tileId)).size, 106);

  assert.deepEqual(
    [...new Set(ordinary.map((tile) => tile.color))].sort(),
    [...NUMBER_TILE_COLORS].sort(),
  );
  assert.deepEqual(
    [...new Set(ordinary.map((tile) => tile.number))].sort(
      (left, right) => left - right,
    ),
    [...NUMBER_TILE_NUMBERS],
  );

  for (const color of NUMBER_TILE_COLORS) {
    for (const number of NUMBER_TILE_NUMBERS) {
      assert.equal(
        ordinary.filter(
          (tile) => tile.color === color && tile.number === number,
        ).length,
        2,
        `${color} ${number} must have exactly two physical copies`,
      );
    }
  }
});

test("inventory factory는 deterministic face order와 immutable physical descriptors를 제공한다", () => {
  const inventory = createNumberTileInventory(new FakeIdGenerator());

  assert.deepEqual(inventory[0], {
    tileId: parse(TileIdSchema, "test-tile-1"),
    kind: "ORDINARY",
    number: 1,
    color: "RED",
  });
  assert.deepEqual(inventory[103], {
    tileId: parse(TileIdSchema, "test-tile-104"),
    kind: "ORDINARY",
    number: 13,
    color: "ORANGE",
  });
  assert.deepEqual(inventory.slice(104), [
    { tileId: parse(TileIdSchema, "test-tile-105"), kind: "JOKER" },
    { tileId: parse(TileIdSchema, "test-tile-106"), kind: "JOKER" },
  ]);
  assert.equal(Object.isFrozen(inventory), true);
  assert.equal(inventory.every(Object.isFrozen), true);
});

test("inventory factory는 duplicate physical tileId를 fail-closed한다", () => {
  const duplicateTileId = parse(TileIdSchema, "duplicate-tile");
  const duplicateIdGenerator = {
    generateTileId(): TileId {
      return duplicateTileId;
    },
  };

  assert.throws(
    () => createCanonicalNumberTileInventory(duplicateIdGenerator),
    /duplicate Number Tile tileId/u,
  );
});

test("inventory factory는 malformed generated tileId를 fail-closed한다", () => {
  const invalidIdGenerator = {
    generateTileId(): TileId {
      return "" as TileId;
    },
  };

  assert.throws(
    () => createCanonicalNumberTileInventory(invalidIdGenerator),
    /valid opaque tileId/u,
  );

  const overlongIdGenerator = {
    generateTileId(): TileId {
      return "x".repeat(129) as TileId;
    },
  };
  assert.throws(
    () => createCanonicalNumberTileInventory(overlongIdGenerator),
    /valid opaque tileId/u,
  );
});

test("Number Tile guards와 clone은 rule identifier를 검증하고 detached descriptor를 만든다", () => {
  assert.equal(isNumberTileColor("RED"), true);
  assert.equal(isNumberTileColor("GREEN"), false);
  assert.equal(isNumberTileNumber(1), true);
  assert.equal(isNumberTileNumber(13), true);
  assert.equal(isNumberTileNumber(0), false);
  assert.equal(isNumberTileNumber(14), false);
  assert.equal(isNumberTileNumber(7.5), false);

  const source: NumberTile = {
    tileId: parse(TileIdSchema, "ordinary-1"),
    kind: "ORDINARY",
    number: 7,
    color: "BLUE",
  };
  const cloned = cloneNumberTile(source);

  assert.deepEqual(cloned, source);
  assert.notEqual(cloned, source);
  assert.equal(Object.isFrozen(cloned), true);

  assert.throws(
    () =>
      cloneNumberTile({
        tileId: source.tileId,
        kind: "ORDINARY",
        number: 99,
        color: "BLUE",
      } as unknown as NumberTile),
    /Invalid Number Tile descriptor/u,
  );
  assert.throws(
    () =>
      cloneNumberTile({
        tileId: source.tileId,
        kind: "JOKER",
        number: 7,
        color: "RED",
      } as unknown as NumberTile),
    /Invalid Number Tile descriptor/u,
  );
  assert.throws(
    () =>
      cloneNumberTile({
        tileId: source.tileId,
        kind: "JOKER",
        assignedNumber: 7,
        assignedColor: "RED",
      } as unknown as NumberTile),
    /Invalid Number Tile descriptor/u,
  );
  assert.throws(
    () =>
      cloneNumberTile({
        ...source,
        assignedNumber: 7,
        assignedColor: "BLUE",
      } as unknown as NumberTile),
    /Invalid Number Tile descriptor/u,
  );
});
