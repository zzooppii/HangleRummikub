import {
  TileIdSchema,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

/** Stable rule identifiers; presentation colors belong to the Web layer. */
export const NUMBER_TILE_COLORS = Object.freeze([
  "RED",
  "BLUE",
  "BLACK",
  "ORANGE",
] as const);

export type NumberTileColor = (typeof NUMBER_TILE_COLORS)[number];

export const NUMBER_TILE_NUMBERS = Object.freeze([
  1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13,
] as const);

export type NumberTileNumber = (typeof NUMBER_TILE_NUMBERS)[number];

export type OrdinaryNumberTile = Readonly<{
  tileId: TileId;
  kind: "ORDINARY";
  number: NumberTileNumber;
  color: NumberTileColor;
}>;

export type JokerNumberTile = Readonly<{
  tileId: TileId;
  kind: "JOKER";
}>;

export type NumberTile = OrdinaryNumberTile | JokerNumberTile;

function hasExactKeys(
  value: object,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  return (
    actualKeys.length === expectedKeys.length &&
    actualKeys.every((key, index) => key === expectedKeys[index])
  );
}

export function isNumberTileColor(value: unknown): value is NumberTileColor {
  return (
    typeof value === "string" &&
    NUMBER_TILE_COLORS.some((color) => color === value)
  );
}

export function isNumberTileNumber(value: unknown): value is NumberTileNumber {
  return (
    typeof value === "number" &&
    NUMBER_TILE_NUMBERS.some((number) => number === value)
  );
}

/**
 * Returns a detached immutable physical Tile descriptor while also rejecting
 * corrupt runtime data that reached a trusted domain boundary.
 */
export function cloneNumberTile(tile: NumberTile): NumberTile {
  if (typeof tile !== "object" || tile === null) {
    throw new Error("Invalid Number Tile descriptor.");
  }

  let tileId: TileId;
  try {
    tileId = parse(TileIdSchema, tile.tileId);
  } catch {
    throw new Error("Number Tile requires a valid opaque tileId.");
  }

  if (
    tile.kind === "JOKER" &&
    hasExactKeys(tile, ["kind", "tileId"])
  ) {
    return Object.freeze({ tileId, kind: "JOKER" });
  }

  if (
    tile.kind !== "ORDINARY" ||
    !hasExactKeys(tile, ["color", "kind", "number", "tileId"]) ||
    !isNumberTileNumber(tile.number) ||
    !isNumberTileColor(tile.color)
  ) {
    throw new Error("Invalid Number Tile descriptor.");
  }

  return Object.freeze({
    tileId,
    kind: "ORDINARY",
    number: tile.number,
    color: tile.color,
  });
}
