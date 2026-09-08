import { parseBuildingCardId, type BuildingCardId } from "./identity.js";

export const CITY_CARDSET_VERSION = "city-cardset-v1";
export const CITY_CATEGORIES = Object.freeze([
  "CIVIC", "CULTURE", "TRADE", "GUARD", "LANDMARK",
] as const);
export type CityCategory = (typeof CITY_CATEGORIES)[number];

const TEMPLATE_ROWS = [
  ["CB-CIV-01", "비표보관소", "CIVIC", 1],
  ["CB-CIV-02", "공론마당", "CIVIC", 2],
  ["CB-CIV-03", "길안내소", "CIVIC", 2],
  ["CB-CIV-04", "협의뜰", "CIVIC", 3],
  ["CB-CIV-05", "우편회랑", "CIVIC", 4],
  ["CB-CIV-06", "수평의사당", "CIVIC", 6],
  ["CB-CUL-01", "종이공방", "CULTURE", 1],
  ["CB-CUL-02", "낭독쉼터", "CULTURE", 1],
  ["CB-CUL-03", "노래뜰", "CULTURE", 3],
  ["CB-CUL-04", "기록정원", "CULTURE", 4],
  ["CB-CUL-05", "별관측실", "CULTURE", 4],
  ["CB-CUL-06", "이야기회랑", "CULTURE", 5],
  ["CB-TRA-01", "저울마당", "TRADE", 1],
  ["CB-TRA-02", "포장공방", "TRADE", 2],
  ["CB-TRA-03", "교환안뜰", "TRADE", 2],
  ["CB-TRA-04", "상인회랑", "TRADE", 3],
  ["CB-TRA-05", "장부전당", "TRADE", 5],
  ["CB-TRA-06", "운송집결소", "TRADE", 5],
  ["CB-GUA-01", "등불초소", "GUARD", 1],
  ["CB-GUA-02", "길목대기소", "GUARD", 2],
  ["CB-GUA-03", "신호마당", "GUARD", 3],
  ["CB-GUA-04", "순찰회랑", "GUARD", 3],
  ["CB-GUA-05", "지도훈련소", "GUARD", 4],
  ["CB-GUA-06", "방호전당", "GUARD", 5],
  ["CB-LAN-01", "빗물정원", "LANDMARK", 1],
  ["CB-LAN-02", "작은해시계", "LANDMARK", 2],
  ["CB-LAN-03", "돌물결마당", "LANDMARK", 2],
  ["CB-LAN-04", "바람계단", "LANDMARK", 4],
  ["CB-LAN-05", "달그림회랑", "LANDMARK", 4],
  ["CB-LAN-06", "일곱길기념뜰", "LANDMARK", 5],
] as const satisfies readonly (readonly [string, string, CityCategory, number])[];

export type BuildingTemplateId = (typeof TEMPLATE_ROWS)[number][0];
export type CityBuildingTemplate = Readonly<{
  templateId: BuildingTemplateId;
  name: string;
  category: CityCategory;
  cost: number;
  victoryPoints: number;
  copies: 2;
}>;
export type CityBuildingCard = Readonly<{
  cardId: BuildingCardId;
  templateId: BuildingTemplateId;
}>;

export const CITY_BUILDING_TEMPLATES: readonly CityBuildingTemplate[] = Object.freeze(
  TEMPLATE_ROWS.map(([templateId, name, category, cost]) => Object.freeze({
    templateId, name, category, cost, victoryPoints: cost, copies: 2 as const,
  })),
);

export function getCityTemplate(templateId: BuildingTemplateId): CityBuildingTemplate {
  const template = CITY_BUILDING_TEMPLATES.find((candidate) => candidate.templateId === templateId);
  if (template === undefined) throw new Error("CITY building template is not in city-cardset-v1.");
  return template;
}

/** Validates a complete inventory, not a hand or deck zone on its own. */
export function validateCityCards(cards: readonly CityBuildingCard[]): readonly CityBuildingCard[] {
  if (cards.length !== 60) throw new Error("CITY inventory must contain exactly 60 physical cards.");
  const seen = new Set<BuildingCardId>();
  const templateCounts = new Map<BuildingTemplateId, number>();
  const detached = cards.map((card) => {
    const cardId = parseBuildingCardId(card.cardId);
    const { templateId } = getCityTemplate(card.templateId);
    if (seen.has(cardId)) throw new Error("CITY physical card identities must be unique.");
    seen.add(cardId);
    templateCounts.set(templateId, (templateCounts.get(templateId) ?? 0) + 1);
    return Object.freeze({ cardId, templateId });
  });
  for (const template of CITY_BUILDING_TEMPLATES) {
    if (templateCounts.get(template.templateId) !== template.copies) {
      throw new Error("CITY inventory must contain exactly two copies of each approved template.");
    }
  }
  return Object.freeze(detached);
}

/** Caller supplies opaque identities; this binding is not the shuffled deck order. */
export function createCityCards(cardIds: readonly BuildingCardId[]): readonly CityBuildingCard[] {
  if (cardIds.length !== 60) throw new Error("CITY card creation requires exactly 60 supplied identities.");
  const cards: CityBuildingCard[] = [];
  for (const template of CITY_BUILDING_TEMPLATES) {
    for (let copy = 0; copy < template.copies; copy += 1) {
      const cardId = cardIds[cards.length];
      if (cardId === undefined) throw new Error("CITY physical card identity is missing.");
      cards.push({ cardId, templateId: template.templateId });
    }
  }
  return validateCityCards(cards);
}
