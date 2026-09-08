import type { GameRegistration } from "../game-registry.js";

export const CITY_ROLE_GAME_TYPE = "CITY_ROLE";
export function createCityRoleRegistration(): GameRegistration {
  return Object.freeze({ gameType: CITY_ROLE_GAME_TYPE });
}
