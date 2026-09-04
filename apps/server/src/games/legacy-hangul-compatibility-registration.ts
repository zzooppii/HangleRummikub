import type { GameType } from "@hangul-rummikub/shared";

import type { GameRegistration } from "./game-registry.js";

export const LEGACY_V1_DEFAULT_GAME_TYPE = "HANGUL_TILE" satisfies GameType;

export function createLegacyHangulCompatibilityRegistration(): GameRegistration {
  return Object.freeze({
    gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
  });
}
