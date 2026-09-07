import type { TileId } from "@hangul-rummikub/shared";

export type NumberTileMeldKind = "GROUP" | "RUN";

export type NumberTileOrdinaryPlacement = Readonly<{
  tileId: TileId;
  kind: "ORDINARY";
}>;

export type NumberTileJokerPlacement = Readonly<{
  tileId: TileId;
  kind: "JOKER";
}>;

/**
 * A Table placement refers to one canonical physical Tile. Ordinary faces come
 * from the canonical Tile record. A Joker's role is derived from its containing
 * meld and its position instead of being persisted on the physical placement.
 */
export type NumberTilePlacement =
  | NumberTileOrdinaryPlacement
  | NumberTileJokerPlacement;

export type NumberTileMeld = Readonly<{
  kind: NumberTileMeldKind;
  tiles: readonly NumberTilePlacement[];
}>;

export type NumberTileTable = Readonly<{
  melds: readonly NumberTileMeld[];
}>;

/** The complete final Table proposed by one atomic Number Submit. */
export type NumberTileProposedTable = Readonly<{
  melds: readonly NumberTileMeld[];
}>;

function cloneNumberTilePlacement(
  placement: NumberTilePlacement,
): NumberTilePlacement {
  const keys = Object.keys(placement);
  if (
    keys.length !== 2 ||
    !keys.includes("tileId") ||
    !keys.includes("kind") ||
    (placement.kind !== "ORDINARY" && placement.kind !== "JOKER")
  ) {
    throw new Error("Number Tile Table placement shape is invalid.");
  }
  return Object.freeze({
    tileId: placement.tileId,
    kind: placement.kind,
  });
}

export function cloneNumberTileTable(
  table: NumberTileTable | NumberTileProposedTable,
): NumberTileTable {
  return Object.freeze({
    melds: Object.freeze(
      table.melds.map((meld) =>
        Object.freeze({
          kind: meld.kind,
          tiles: Object.freeze(meld.tiles.map(cloneNumberTilePlacement)),
        }),
      ),
    ),
  });
}

export function createEmptyNumberTileTable(): NumberTileTable {
  return Object.freeze({ melds: Object.freeze([]) });
}
