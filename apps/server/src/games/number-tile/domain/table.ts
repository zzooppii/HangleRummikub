import type { TileId } from "@hangul-rummikub/shared";

import type { NumberTileColor, NumberTileNumber } from "./tile.js";

export type NumberTileMeldKind = "GROUP" | "RUN";

export type NumberTileOrdinaryPlacement = Readonly<{
  tileId: TileId;
  kind: "ORDINARY";
}>;

export type NumberTileJokerPlacement = Readonly<{
  tileId: TileId;
  kind: "JOKER";
  assignedNumber: NumberTileNumber;
  assignedColor: NumberTileColor;
}>;

/**
 * A Table placement refers to one canonical physical Tile. Ordinary faces come
 * from the canonical Tile record; only a Joker carries a proposed assignment.
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
  return placement.kind === "JOKER"
    ? Object.freeze({
        tileId: placement.tileId,
        kind: placement.kind,
        assignedNumber: placement.assignedNumber,
        assignedColor: placement.assignedColor,
      })
    : Object.freeze({
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
