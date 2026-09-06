import * as v from "valibot";

import { TileIdSchema } from "../../identifiers.js";

/** Stable rule identifiers. Presentation colors remain Web-owned. */
export const NUMBER_TILE_COLORS = Object.freeze([
  "RED",
  "BLUE",
  "BLACK",
  "ORANGE",
] as const);
export const NumberTileColorSchema = v.picklist(NUMBER_TILE_COLORS);
export type NumberTileColor = v.InferOutput<typeof NumberTileColorSchema>;

export const NUMBER_TILE_NUMBERS = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
] as const);
export const NumberTileNumberSchema = v.picklist(NUMBER_TILE_NUMBERS);
export type NumberTileNumber = v.InferOutput<typeof NumberTileNumberSchema>;

/** Transport resource limits, not gameplay acceptance rules. */
export const NUMBER_PROPOSED_TABLE_MAX_MELDS = 106;
export const NUMBER_PROPOSED_MELD_MAX_TILE_REFERENCES = 106;
export const NUMBER_PROPOSED_TABLE_MAX_TILE_REFERENCES = 106;

export const NumberTileOrdinaryProposedPlacementSchema = v.strictObject({
  tileId: TileIdSchema,
  kind: v.literal("ORDINARY"),
});
export type NumberTileOrdinaryProposedPlacement = v.InferOutput<
  typeof NumberTileOrdinaryProposedPlacementSchema
>;

export const NumberTileJokerProposedPlacementSchema = v.strictObject({
  tileId: TileIdSchema,
  kind: v.literal("JOKER"),
  assignedNumber: NumberTileNumberSchema,
  assignedColor: NumberTileColorSchema,
});
export type NumberTileJokerProposedPlacement = v.InferOutput<
  typeof NumberTileJokerProposedPlacementSchema
>;

export const NumberTileProposedPlacementSchema = v.variant("kind", [
  NumberTileOrdinaryProposedPlacementSchema,
  NumberTileJokerProposedPlacementSchema,
]);
export type NumberTileProposedPlacement = v.InferOutput<
  typeof NumberTileProposedPlacementSchema
>;

const NumberTileProposedPlacementsSchema = v.pipe(
  v.array(NumberTileProposedPlacementSchema),
  v.maxLength(
    NUMBER_PROPOSED_MELD_MAX_TILE_REFERENCES,
    "A proposed Number Tile meld contains too many Tile references.",
  ),
);

export const NumberTileProposedGroupSchema = v.strictObject({
  kind: v.literal("GROUP"),
  // Empty and otherwise invalid melds are structurally safe; the RuleEngine
  // owns gameplay acceptance after canonical Tile lookup.
  tiles: NumberTileProposedPlacementsSchema,
});
export type NumberTileProposedGroup = v.InferOutput<
  typeof NumberTileProposedGroupSchema
>;

export const NumberTileProposedRunSchema = v.strictObject({
  kind: v.literal("RUN"),
  tiles: NumberTileProposedPlacementsSchema,
});
export type NumberTileProposedRun = v.InferOutput<
  typeof NumberTileProposedRunSchema
>;

export const NumberTileProposedMeldSchema = v.variant("kind", [
  NumberTileProposedGroupSchema,
  NumberTileProposedRunSchema,
]);
export type NumberTileProposedMeld = v.InferOutput<
  typeof NumberTileProposedMeldSchema
>;

function proposedTableTileReferenceCount(table: {
  melds: readonly { tiles: readonly unknown[] }[];
}): number {
  return table.melds.reduce((total, meld) => total + meld.tiles.length, 0);
}

const NumberTileProposedTableObjectSchema = v.strictObject({
  melds: v.pipe(
    v.array(NumberTileProposedMeldSchema),
    v.maxLength(
      NUMBER_PROPOSED_TABLE_MAX_MELDS,
      "A proposed Number Tile Table contains too many melds.",
    ),
  ),
});

export const NumberTileProposedTableSchema = v.pipe(
  NumberTileProposedTableObjectSchema,
  v.check(
    (table) =>
      proposedTableTileReferenceCount(table) <=
      NUMBER_PROPOSED_TABLE_MAX_TILE_REFERENCES,
    "A proposed Number Tile Table contains too many physical Tile references.",
  ),
);
export type NumberTileProposedTable = v.InferOutput<
  typeof NumberTileProposedTableSchema
>;
