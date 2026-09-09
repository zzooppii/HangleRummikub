import * as v from "valibot";

export const DRAW_RELAY_DRAW_SECONDS = [15, 30, 45, 60, 90] as const;
export const DrawRelayDrawSecondsSchema = v.picklist(DRAW_RELAY_DRAW_SECONDS);
export type DrawRelayDrawSeconds = v.InferOutput<typeof DrawRelayDrawSecondsSchema>;
