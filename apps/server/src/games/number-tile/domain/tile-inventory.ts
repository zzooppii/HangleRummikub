import type { TileId } from "@hangul-rummikub/shared";

import type { IdGenerator } from "../../../ports/system.js";
import {
  NUMBER_TILE_COLORS,
  NUMBER_TILE_NUMBERS,
  cloneNumberTile,
  type NumberTile,
} from "./tile.js";

export const NUMBER_TILE_INVENTORY_VERSION = "number-tile-inventory-v1";

export const NUMBER_TILE_INVENTORY_TOTALS = Object.freeze({
  ordinary: 104,
  jokers: 2,
  total: 106,
});

export type NumberTileIdGenerator = Pick<IdGenerator, "generateTileId">;

/**
 * Creates the exact canonical physical inventory in a deterministic face order.
 * Pool shuffling is deliberately a separate setup concern.
 */
export function createCanonicalNumberTileInventory(
  idGenerator: NumberTileIdGenerator,
): readonly NumberTile[] {
  const inventory: NumberTile[] = [];
  const generatedTileIds = new Set<TileId>();

  const addTile = (tile: NumberTile): void => {
    const canonicalTile = cloneNumberTile(tile);
    if (generatedTileIds.has(canonicalTile.tileId)) {
      throw new Error("IdGenerator produced a duplicate Number Tile tileId.");
    }
    generatedTileIds.add(canonicalTile.tileId);
    inventory.push(canonicalTile);
  };

  for (const color of NUMBER_TILE_COLORS) {
    for (const number of NUMBER_TILE_NUMBERS) {
      for (let copy = 0; copy < 2; copy += 1) {
        addTile({
          tileId: idGenerator.generateTileId(),
          kind: "ORDINARY",
          number,
          color,
        });
      }
    }
  }

  for (let joker = 0; joker < NUMBER_TILE_INVENTORY_TOTALS.jokers; joker += 1) {
    addTile({ tileId: idGenerator.generateTileId(), kind: "JOKER" });
  }

  if (inventory.length !== NUMBER_TILE_INVENTORY_TOTALS.total) {
    throw new Error("Canonical Number Tile inventory size is invalid.");
  }

  return Object.freeze(inventory);
}

/** Short compatibility name for callers that do not need to state canonicality. */
export const createNumberTileInventory = createCanonicalNumberTileInventory;
