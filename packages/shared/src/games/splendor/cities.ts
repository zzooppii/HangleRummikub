import * as v from "valibot";
import { SPLENDOR_COLORS, SplendorCostSchema, SplendorCityIdSchema, type SplendorCost } from "./actions.js";

export const SplendorCitySchema = v.strictObject({
  cityId: SplendorCityIdSchema,
  tile: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(7)),
  side: v.picklist(["A", "B"]),
  points: v.pipe(v.number(), v.integer(), v.minValue(11), v.maxValue(17)),
  cost: SplendorCostSchema,
  sameColor: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(6)),
});
export type SplendorCity = v.InferOutput<typeof SplendorCitySchema>;

// Cities of Splendor (2017): seven physical tiles, two alternative faces each.
// Rows are paired by the printed illustration, never drawn as fourteen independent tiles.
const FACES = [
  [[13, 0, 0, 0, 4, 3, 0], [13, 0, 0, 3, 0, 4, 0]],
  [[13, 3, 4, 0, 0, 0, 0], [13, 4, 0, 0, 3, 0, 0]],
  [[17, 0, 0, 0, 0, 0, 0], [16, 1, 1, 1, 1, 1, 0]],
  [[11, 3, 3, 0, 3, 3, 0], [11, 3, 0, 3, 3, 3, 0]],
  [[12, 0, 0, 0, 0, 0, 6], [15, 0, 0, 0, 0, 0, 5]],
  [[14, 0, 0, 4, 0, 0, 4], [13, 0, 3, 4, 0, 0, 0]],
  [[14, 2, 1, 1, 2, 2, 0], [13, 2, 2, 2, 2, 2, 0]],
] as const;
export const SPLENDOR_CITY_TILES: readonly (readonly SplendorCity[])[] = FACES.map((faces, i) =>
  faces.map(([points, WHITE, BLUE, GREEN, RED, BLACK, sameColor], side) =>
    v.parse(SplendorCitySchema, {cityId: `SPC-${i + 1}-${side === 0 ? "A" : "B"}`,
      tile: i + 1, side: side === 0 ? "A" : "B", points,
      cost: {WHITE, BLUE, GREEN, RED, BLACK}, sameColor})),
);
export function meetsSplendorCity(city: SplendorCity, score: number, bonuses: SplendorCost): boolean {
  return score >= city.points && SPLENDOR_COLORS.every(k => bonuses[k] >= city.cost[k]) &&
    (city.sameColor === 0 || SPLENDOR_COLORS.some(k => city.cost[k] === 0 && bonuses[k] >= city.sameColor));
}
