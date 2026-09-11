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
  "ISLAND_SETTLERS",
  "SPLENDOR",
  "JAIPUR",
  "GURYONGTU",
  "WORD_DUET",
  "LOST_CITIES",
  "SABOTEUR",
  "LIAR_GAME",
  "AZUL",
  "CLUE",
] as const);

export const GameTypeSchema = v.picklist(SUPPORTED_GAME_TYPES);
export type GameType = v.InferOutput<typeof GameTypeSchema>;

export const GAME_PLAYER_LIMITS = Object.freeze({
  GURYONGTU: { min: 2, max: 2 },
  AZUL: { min: 2, max: 4 },
  CLUE: { min: 3, max: 6 },
  HANGUL_TILE: { min: 2, max: 4 }, NUMBER_TILE: { min: 2, max: 4 }, GEM_CARD: { min: 2, max: 4 },
  CITY_ROLE: { min: 2, max: 6 }, DRAW_RELAY: { min: 3, max: 8 }, SNEAKY_LUNCH: { min: 2, max: 8 },
  WOLF_NIGHT: { min: 3, max: 10 }, HALLI_GALLI: { min: 2, max: 6 }, ISLAND_SETTLERS: { min: 3, max: 4 },
  LIAR_GAME: { min: 4, max: 8 },
  SABOTEUR: { min: 3, max: 10 },
  WORD_DUET: { min: 2, max: 2 },
  SPLENDOR: { min: 2, max: 4 }, JAIPUR: { min: 2, max: 2 }, LOST_CITIES: { min: 2, max: 2 },
} as const satisfies Record<GameType, Readonly<{ min: number; max: number }>>);
