import type { GameType } from "@hangul-rummikub/shared";

import type { GameRegistration } from "../game-registry.js";

export const NUMBER_TILE_GAME_TYPE = "NUMBER_TILE" satisfies GameType;

export function createNumberTileRegistration(): GameRegistration {
  return Object.freeze({ gameType: NUMBER_TILE_GAME_TYPE });
}
