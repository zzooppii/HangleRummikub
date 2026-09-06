import type { TileId } from "@hangul-rummikub/shared";

export type NumberTileDrawResult = Readonly<{
  drawnTileId: TileId;
  poolTileIds: readonly TileId[];
  rackTileIds: readonly TileId[];
}>;

/**
 * Applies an already server-selected physical Tile. Random selection and turn
 * commit ownership remain outside the pure Number domain boundary.
 */
export function drawSelectedNumberTile(
  poolTileIds: readonly TileId[],
  rackTileIds: readonly TileId[],
  selectedTileId: TileId,
): NumberTileDrawResult {
  if (new Set(poolTileIds).size !== poolTileIds.length) {
    throw new Error("Canonical Number Tile pool contains a duplicate Tile ID.");
  }
  if (new Set(rackTileIds).size !== rackTileIds.length) {
    throw new Error("Canonical Number Tile rack contains a duplicate Tile ID.");
  }
  const poolTileIdSet = new Set(poolTileIds);
  if (rackTileIds.some((tileId) => poolTileIdSet.has(tileId))) {
    throw new Error("A physical Number Tile cannot be in pool and rack.");
  }

  const selectedIndex = poolTileIds.indexOf(selectedTileId);
  if (selectedIndex < 0) {
    throw new Error("Selected Number Tile is not in the canonical pool.");
  }

  return Object.freeze({
    drawnTileId: selectedTileId,
    poolTileIds: Object.freeze([
      ...poolTileIds.slice(0, selectedIndex),
      ...poolTileIds.slice(selectedIndex + 1),
    ]),
    rackTileIds: Object.freeze([...rackTileIds, selectedTileId]),
  });
}
