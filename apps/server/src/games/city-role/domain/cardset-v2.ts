import { CITY_BUILDING_TEMPLATES, getCityTemplate, createCityCards, validateCityCards,
  type CityBuildingCard, type CityBuildingTemplate } from "./cardset-v1.js";
import type { BuildingCardId } from "./identity.js";

/** Current distribution; legacy 60-card games retain their complete original inventory. */
export const CITY_BUILDING_TEMPLATES_V2: readonly CityBuildingTemplate[] = Object.freeze(
  CITY_BUILDING_TEMPLATES.map(template => Object.freeze({ ...template,
    copies: template.category === "TRADE"
      ? (template.templateId === "CB-TRA-01" || template.templateId === "CB-TRA-02" ? 4 : 3)
      : template.templateId === "CB-CUL-06" || template.templateId === "CB-GUA-06" ? 1 : 2,
  })),
);
export const CITY_CARD_COUNT_V2 = CITY_BUILDING_TEMPLATES_V2.reduce((sum, template) => sum + template.copies, 0);

export function createCityCardsV2(cardIds: readonly BuildingCardId[]): readonly CityBuildingCard[] {
  return createCityCards(cardIds, CITY_BUILDING_TEMPLATES_V2);
}

export function validateCityGameCards(cards: readonly CityBuildingCard[], rulesVersion: string): readonly CityBuildingCard[] {
  if (rulesVersion === "city-rules-v3") {
    const specials = cards.filter(c => c.templateId.startsWith("CB-SP-"));
    if (specials.length !== 14 || new Set(specials.map(c => c.templateId)).size !== 14) throw new Error("CITY requires 14 distinct special cards.");
    return validateCityCards(cards, [...CITY_BUILDING_TEMPLATES_V2.filter(t => t.category !== "LANDMARK"), ...specials.map(c => ({ ...getCityTemplate(c.templateId), copies: 1 }))]);
  }
  // Only complete legacy inventories qualify; partial or mixed distributions fail exact counts.
  return validateCityCards(cards, rulesVersion === "city-rules-v2" && cards.length !== 60
    ? CITY_BUILDING_TEMPLATES_V2 : CITY_BUILDING_TEMPLATES);
}
