import * as v from "valibot";

export const SUPPORTED_GAME_TYPES = Object.freeze([
  "HANGUL_TILE",
] as const);

export const GameTypeSchema = v.picklist(SUPPORTED_GAME_TYPES);
export type GameType = v.InferOutput<typeof GameTypeSchema>;
