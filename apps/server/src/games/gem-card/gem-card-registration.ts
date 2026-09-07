import type { GameRegistration } from "../game-registry.js";
export const GEM_CARD_GAME_TYPE = "GEM_CARD";
export function createGemCardRegistration(): GameRegistration {
  return Object.freeze({ gameType: GEM_CARD_GAME_TYPE });
}
