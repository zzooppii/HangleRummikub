import type { CityBuildingTemplate } from "./cardset-v1.js";
import type { CityPlayerId } from "./identity.js";

export const CITY_RULES_V2 = "city-rules-v2";
export const CITY_CARDSET_V2 = "city-cardset-v2";

/** Public build history, scoped to player/template/game, never physical copy. */
export type CityLandmarkHistory = Readonly<{
  playerId: CityPlayerId;
  gardenUsed: boolean;
  sundialUsed: boolean;
  staircaseInitialized: boolean;
  staircaseRemaining: number;
  staircaseSpent: number;
  lastDiscountRound: number | null;
}>;
export function initialCityLandmarkHistory(playerId: CityPlayerId): CityLandmarkHistory {
  return Object.freeze({ playerId, gardenUsed: false, sundialUsed: false,
    staircaseInitialized: false, staircaseRemaining: 0, staircaseSpent: 0, lastDiscountRound: null });
}

export function cityLandmarkDiscount(history: CityLandmarkHistory | undefined, round: number,
  city: readonly CityBuildingTemplate[], building: CityBuildingTemplate): number {
  return history !== undefined && history.staircaseRemaining > 0 && history.lastDiscountRound !== round &&
    city.some(card => card.templateId === "CB-LAN-04") && building.category !== "LANDMARK" && building.cost >= 2 ? 1 : 0;
}

export function cityLandmarkScoring(city: readonly CityBuildingTemplate[], forfeited: boolean): Readonly<{ diversityBonus: number; landmarkBonus: number }> {
  if (forfeited) return { diversityBonus: 0, landmarkBonus: 0 };
  const categories = new Set(city.map(card => card.category));
  const ordinaryCount = [...categories].filter(category => category !== "LANDMARK").length;
  const has = (id: string) => city.some(card => card.templateId === id);
  return { diversityBonus: categories.size === 5 || has("CB-LAN-05") && ordinaryCount === 3 ? 3 : 0,
    landmarkBonus: has("CB-LAN-06") ? ordinaryCount : 0 };
}
