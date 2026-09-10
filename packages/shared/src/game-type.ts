import * as v from "valibot";

export const SUPPORTED_GAME_TYPES = Object.freeze([
  "HANGUL_TILE",
  "NUMBER_TILE",
  "GEM_CARD",
  "CITY_ROLE",
  "DRAW_RELAY",
  "SNEAKY_LUNCH",
  "WOLF_NIGHT",
  "HALLI_GALLI",
] as const);

export const GameTypeSchema = v.picklist(SUPPORTED_GAME_TYPES);
export type GameType = v.InferOutput<typeof GameTypeSchema>;
