import type { BurgundyColor } from "./actions.js";
export * from "./expansion-data.js";

/** 2019 anniversary rulebook, component list p.1 and monasteries pp.9–12. */
export const BURGUNDY_COLORS = ["BUILDING", "LIVESTOCK", "MINE", "SHIP", "MONASTERY", "CASTLE"] as const;
export const BURGUNDY_BUILDINGS = ["MARKET", "CARPENTER", "CHURCH", "WAREHOUSE", "BOARDING_HOUSE", "BANK", "TOWN_HALL", "WATCHTOWER"] as const;
export type BurgundyBuilding = typeof BURGUNDY_BUILDINGS[number] | "WHITE_CASTLE" | "CRANE";
export type BurgundyAnimal = "SHEEP" | "PIG" | "COW" | "GOAT" | "GEESE";
export interface BurgundyTileDefinition {
  kind: string;
  color: BurgundyColor;
  supply: BurgundyColor | "BLACK" | "INN";
  count: number;
  building?: BurgundyBuilding;
  animal?: BurgundyAnimal;
  animals?: number;
  knowledge?: number;
  whiteCastle?: boolean;
  inn?: boolean;
  expansion?: "extraTiles" | "whiteCastles" | "inns";
}
export const BURGUNDY_KNOWLEDGE_BUILDINGS: Readonly<Record<number, BurgundyBuilding>> = {
  16: "CARPENTER", 17: "WATCHTOWER", 18: "BOARDING_HOUSE", 19: "CHURCH",
  20: "MARKET", 21: "TOWN_HALL", 22: "BANK", 23: "WAREHOUSE", 29: "WHITE_CASTLE",
};
// The 2019 edition uses goats in place of the original chickens:
// https://boardgamegeek.com/image/5036796
const blackKnowledge = new Set([7, 12, 14, 15, 24, 25]);
export const BURGUNDY_CATALOG: readonly BurgundyTileDefinition[] = [
  ...BURGUNDY_BUILDINGS.flatMap(building => [
    { kind: building, color: "BUILDING" as const, supply: "BUILDING" as const, count: 5, building },
    { kind: `${building}_BLACK`, color: "BUILDING" as const, supply: "BLACK" as const, count: 2, building },
  ]),
  ...(["SHEEP", "PIG", "COW", "GOAT"] as const).flatMap(animal => [
    ...([2, 3, 4] as const).map(animals => ({ kind: `${animal}_${animals}`, color: "LIVESTOCK" as const, supply: "LIVESTOCK" as const, count: animals === 4 ? 1 : 2, animal, animals })),
    ...([3, 4] as const).map(animals => ({ kind: `${animal}_${animals}_BLACK`, color: "LIVESTOCK" as const, supply: "BLACK" as const, count: 1, animal, animals })),
  ]),
  { kind: "MINE", color: "MINE", supply: "MINE", count: 10 },
  { kind: "MINE_BLACK", color: "MINE", supply: "BLACK", count: 2 },
  { kind: "SHIP", color: "SHIP", supply: "SHIP", count: 20 },
  { kind: "SHIP_BLACK", color: "SHIP", supply: "BLACK", count: 6 },
  { kind: "CASTLE", color: "CASTLE", supply: "CASTLE", count: 14 },
  { kind: "CASTLE_BLACK", color: "CASTLE", supply: "BLACK", count: 2 },
  ...Array.from({ length: 26 }, (_, index): BurgundyTileDefinition => ({
    kind: `KNOWLEDGE_${index + 1}`, color: "MONASTERY", supply: blackKnowledge.has(index + 1) ? "BLACK" : "MONASTERY", count: 1, knowledge: index + 1,
  })),
  { kind: "KNOWLEDGE_27", color: "MONASTERY", supply: "MONASTERY", count: 1, knowledge: 27, expansion: "extraTiles" },
  { kind: "KNOWLEDGE_28", color: "MONASTERY", supply: "MONASTERY", count: 1, knowledge: 28, expansion: "extraTiles" },
  { kind: "CRANE", color: "BUILDING", supply: "BLACK", count: 1, building: "CRANE", expansion: "extraTiles" },
  { kind: "GEESE", color: "LIVESTOCK", supply: "BLACK", count: 1, animal: "GEESE", animals: 2, expansion: "extraTiles" },
  { kind: "WHITE_CASTLE", color: "BUILDING", supply: "BUILDING", count: 6, building: "WHITE_CASTLE", whiteCastle: true, expansion: "whiteCastles" },
  { kind: "WHITE_CASTLE_BLACK", color: "BUILDING", supply: "BLACK", count: 2, building: "WHITE_CASTLE", whiteCastle: true, expansion: "whiteCastles" },
  { kind: "KNOWLEDGE_29", color: "MONASTERY", supply: "MONASTERY", count: 1, knowledge: 29, expansion: "whiteCastles" },
  { kind: "INN", color: "BUILDING", supply: "INN", count: 5, inn: true, expansion: "inns" },
];
export function burgundyTileDefinition(kind: string): BurgundyTileDefinition {
  const definition = BURGUNDY_CATALOG.find(tile => tile.kind === kind);
  if (!definition) throw new Error("Unknown Burgundy tile kind");
  return definition;
}
