import * as v from "valibot";
import { TileIdSchema } from "../../identifiers.js";

export const AZUL_COLORS = ["BLUE", "YELLOW", "RED", "BLACK", "WHITE"] as const;
export const AzulColorSchema = v.picklist(AZUL_COLORS);
export type AzulColor = v.InferOutput<typeof AzulColorSchema>;
export const AzulTileSchema = v.strictObject({ tileId: TileIdSchema, color: AzulColorSchema });
export type AzulTile = v.InferOutput<typeof AzulTileSchema>;
export const AzulSourceSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("FACTORY"), index: v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(8)) }),
  v.strictObject({ kind: v.literal("CENTER") }),
]);
export const AzulDestinationSchema = v.union([v.picklist([0, 1, 2, 3, 4]), v.literal("FLOOR")]);
export const AzulActionSchema = v.strictObject({ source: AzulSourceSchema, color: AzulColorSchema, destination: AzulDestinationSchema });
export type AzulAction = v.InferOutput<typeof AzulActionSchema>;
export type AzulSource = AzulAction["source"];
export type AzulDestination = AzulAction["destination"];
export const AZUL_FLOOR_PENALTIES = [1, 1, 2, 2, 2, 3, 3] as const;
/** Colored front board: column belonging to a color on a zero-based row. */
export function azulWallColumn(row: number, color: AzulColor): number {
  return (AZUL_COLORS.indexOf(color) + row) % 5;
}

export const AZUL_TURN_DURATION_MS = 30_000;
