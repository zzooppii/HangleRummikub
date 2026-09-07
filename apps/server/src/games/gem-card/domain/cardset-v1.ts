import {
  createGemCard,
  totalGemCardCost,
  type GemCard,
  type GemCardId,
  type GemCardTier,
} from "./card.js";
import {
  GEM_BASIC_RESOURCES,
  type GemBasicResource,
} from "./resource.js";

export const GEM_CARDSET_VERSION = "gem-cardset-v1";

type CardSeed = readonly [
  cardId: string,
  tier: GemCardTier,
  production: GemBasicResource,
  dawn: number,
  tide: number,
  grove: number,
  ember: number,
  echo: number,
  points: number,
];

const CARD_ROWS = Object.freeze([
  ["GC-T1-01", 1, "DAWN", 0, 2, 1, 0, 0, 0],
  ["GC-T1-02", 1, "DAWN", 1, 0, 2, 1, 0, 0],
  ["GC-T1-03", 1, "DAWN", 2, 0, 1, 0, 2, 1],
  ["GC-T1-04", 1, "TIDE", 0, 0, 2, 1, 0, 0],
  ["GC-T1-05", 1, "TIDE", 0, 1, 0, 2, 1, 0],
  ["GC-T1-06", 1, "TIDE", 2, 2, 0, 1, 0, 1],
  ["GC-T1-07", 1, "GROVE", 0, 0, 0, 2, 1, 0],
  ["GC-T1-08", 1, "GROVE", 1, 0, 1, 0, 2, 0],
  ["GC-T1-09", 1, "GROVE", 0, 2, 2, 0, 1, 1],
  ["GC-T1-10", 1, "EMBER", 1, 0, 0, 0, 2, 0],
  ["GC-T1-11", 1, "EMBER", 2, 1, 0, 1, 0, 0],
  ["GC-T1-12", 1, "EMBER", 1, 0, 2, 2, 0, 1],
  ["GC-T1-13", 1, "ECHO", 2, 1, 0, 0, 0, 0],
  ["GC-T1-14", 1, "ECHO", 0, 2, 1, 0, 1, 0],
  ["GC-T1-15", 1, "ECHO", 0, 1, 0, 2, 2, 1],
  ["GC-T2-01", 2, "DAWN", 0, 2, 0, 2, 1, 1],
  ["GC-T2-02", 2, "DAWN", 2, 0, 3, 0, 2, 2],
  ["GC-T2-03", 2, "DAWN", 1, 2, 1, 3, 1, 3],
  ["GC-T2-04", 2, "TIDE", 1, 0, 2, 0, 2, 1],
  ["GC-T2-05", 2, "TIDE", 2, 2, 0, 3, 0, 2],
  ["GC-T2-06", 2, "TIDE", 1, 1, 2, 1, 3, 3],
  ["GC-T2-07", 2, "GROVE", 2, 1, 0, 2, 0, 1],
  ["GC-T2-08", 2, "GROVE", 0, 2, 2, 0, 3, 2],
  ["GC-T2-09", 2, "GROVE", 3, 1, 1, 2, 1, 3],
  ["GC-T2-10", 2, "EMBER", 0, 2, 1, 0, 2, 1],
  ["GC-T2-11", 2, "EMBER", 3, 0, 2, 2, 0, 2],
  ["GC-T2-12", 2, "EMBER", 1, 3, 1, 1, 2, 3],
  ["GC-T2-13", 2, "ECHO", 2, 0, 2, 1, 0, 1],
  ["GC-T2-14", 2, "ECHO", 0, 3, 0, 2, 2, 2],
  ["GC-T2-15", 2, "ECHO", 2, 1, 3, 1, 1, 3],
  ["GC-T3-01", 3, "DAWN", 0, 3, 2, 0, 3, 3],
  ["GC-T3-02", 3, "DAWN", 3, 0, 3, 2, 2, 4],
  ["GC-T3-03", 3, "DAWN", 1, 4, 1, 4, 1, 5],
  ["GC-T3-04", 3, "TIDE", 3, 0, 3, 2, 0, 3],
  ["GC-T3-05", 3, "TIDE", 2, 3, 0, 3, 2, 4],
  ["GC-T3-06", 3, "TIDE", 1, 1, 4, 1, 4, 5],
  ["GC-T3-07", 3, "GROVE", 0, 3, 0, 3, 2, 3],
  ["GC-T3-08", 3, "GROVE", 2, 2, 3, 0, 3, 4],
  ["GC-T3-09", 3, "GROVE", 4, 1, 1, 4, 1, 5],
  ["GC-T3-10", 3, "EMBER", 2, 0, 3, 0, 3, 3],
  ["GC-T3-11", 3, "EMBER", 3, 2, 2, 3, 0, 4],
  ["GC-T3-12", 3, "EMBER", 1, 4, 1, 1, 4, 5],
  ["GC-T3-13", 3, "ECHO", 3, 2, 0, 3, 0, 3],
  ["GC-T3-14", 3, "ECHO", 0, 3, 2, 2, 3, 4],
  ["GC-T3-15", 3, "ECHO", 4, 1, 4, 1, 1, 5],
] satisfies readonly CardSeed[]);

function rowToCard(row: CardSeed): GemCard {
  const [cardId, tier, productionResource, DAWN, TIDE, GROVE, EMBER, ECHO, victoryPoints] = row;
  return createGemCard({
    cardId: cardId as GemCardId,
    tier,
    productionResource,
    cost: { DAWN, TIDE, GROVE, EMBER, ECHO },
    victoryPoints,
  });
}

export type GemCardSetAudit = Readonly<{
  cardCount: number;
  tierCardCounts: Readonly<Record<GemCardTier, number>>;
  tierTotalCosts: Readonly<Record<GemCardTier, number>>;
  tierVictoryPoints: Readonly<Record<GemCardTier, number>>;
  printedDemand: Readonly<Record<GemBasicResource, number>>;
  productionCounts: Readonly<Record<GemBasicResource, number>>;
  pointDistribution: Readonly<Record<0 | 1 | 2 | 3 | 4 | 5, number>>;
  totalVictoryPoints: number;
}>;

const TIER_BOUNDS = Object.freeze({
  1: Object.freeze({ minCost: 3, maxCost: 5, minPoints: 0, maxPoints: 1 }),
  2: Object.freeze({ minCost: 5, maxCost: 8, minPoints: 1, maxPoints: 3 }),
  3: Object.freeze({ minCost: 8, maxCost: 11, minPoints: 3, maxPoints: 5 }),
} satisfies Record<GemCardTier, Readonly<{ minCost: number; maxCost: number; minPoints: number; maxPoints: number }>>);

export function auditGemCardSet(cards: readonly GemCard[]): GemCardSetAudit {
  const validated = cards.map(createGemCard);
  if (validated.length !== 45) {
    throw new Error("gem-cardset-v1 must contain exactly 45 cards.");
  }
  if (new Set(validated.map((card) => card.cardId)).size !== 45) {
    throw new Error("gem-cardset-v1 card IDs must be unique.");
  }

  const tierCardCounts: Record<GemCardTier, number> = { 1: 0, 2: 0, 3: 0 };
  const tierTotalCosts: Record<GemCardTier, number> = { 1: 0, 2: 0, 3: 0 };
  const tierVictoryPoints: Record<GemCardTier, number> = { 1: 0, 2: 0, 3: 0 };
  const printedDemand: Record<GemBasicResource, number> = { DAWN: 0, TIDE: 0, GROVE: 0, EMBER: 0, ECHO: 0 };
  const productionCounts: Record<GemBasicResource, number> = { DAWN: 0, TIDE: 0, GROVE: 0, EMBER: 0, ECHO: 0 };
  const tierProductionCounts = new Map<string, number>();
  const tupleByTier = new Map<GemCardTier, Set<string>>();
  const pointDistribution: Record<0 | 1 | 2 | 3 | 4 | 5, number> = { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };

  for (const card of validated) {
    const totalCost = totalGemCardCost(card);
    const bounds = TIER_BOUNDS[card.tier];
    if (totalCost < bounds.minCost || totalCost > bounds.maxCost || card.victoryPoints < bounds.minPoints || card.victoryPoints > bounds.maxPoints) {
      throw new Error(`GEM card ${card.cardId} violates its tier balance envelope.`);
    }
    tierCardCounts[card.tier] += 1;
    tierTotalCosts[card.tier] += totalCost;
    tierVictoryPoints[card.tier] += card.victoryPoints;
    productionCounts[card.productionResource] += 1;
    const productionKey = `${card.tier}:${card.productionResource}`;
    tierProductionCounts.set(productionKey, (tierProductionCounts.get(productionKey) ?? 0) + 1);
    for (const resource of GEM_BASIC_RESOURCES) printedDemand[resource] += card.cost[resource];
    pointDistribution[card.victoryPoints as 0 | 1 | 2 | 3 | 4 | 5] += 1;
    const tuple = `${GEM_BASIC_RESOURCES.map((resource) => card.cost[resource]).join(",")}|${card.productionResource}|${card.victoryPoints}`;
    const seen = tupleByTier.get(card.tier) ?? new Set<string>();
    if (seen.has(tuple)) throw new Error("GEM cards within a tier must not duplicate cost, production, and points.");
    seen.add(tuple);
    tupleByTier.set(card.tier, seen);
  }

  for (const tier of [1, 2, 3] as const) {
    if (tierCardCounts[tier] !== 15) throw new Error(`GEM tier ${tier} must contain exactly 15 cards.`);
    for (const resource of GEM_BASIC_RESOURCES) {
      if (tierProductionCounts.get(`${tier}:${resource}`) !== 3) throw new Error(`GEM tier ${tier} must produce ${resource} exactly three times.`);
    }
  }
  for (const resource of GEM_BASIC_RESOURCES) {
    if (productionCounts[resource] !== 9) throw new Error(`GEM card set must produce ${resource} exactly nine times.`);
  }

  return Object.freeze({
    cardCount: validated.length,
    tierCardCounts: Object.freeze(tierCardCounts),
    tierTotalCosts: Object.freeze(tierTotalCosts),
    tierVictoryPoints: Object.freeze(tierVictoryPoints),
    printedDemand: Object.freeze(printedDemand),
    productionCounts: Object.freeze(productionCounts),
    pointDistribution: Object.freeze(pointDistribution),
    totalVictoryPoints: validated.reduce((sum, card) => sum + card.victoryPoints, 0),
  });
}

export function validateGemCardSet(cards: readonly GemCard[]): readonly GemCard[] {
  const cloned = Object.freeze(cards.map(createGemCard));
  const audit = auditGemCardSet(cloned);
  for (const resource of GEM_BASIC_RESOURCES) {
    if (audit.printedDemand[resource] !== 61) {
      throw new Error(`gem-cardset-v1 ${resource} printed demand must equal 61.`);
    }
  }
  if (
    audit.tierTotalCosts[1] !== 60 ||
    audit.tierTotalCosts[2] !== 100 ||
    audit.tierTotalCosts[3] !== 145 ||
    audit.tierVictoryPoints[1] !== 5 ||
    audit.tierVictoryPoints[2] !== 30 ||
    audit.tierVictoryPoints[3] !== 60 ||
    audit.totalVictoryPoints !== 95 ||
    audit.pointDistribution[0] !== 10 ||
    audit.pointDistribution[1] !== 10 ||
    audit.pointDistribution[2] !== 5 ||
    audit.pointDistribution[3] !== 10 ||
    audit.pointDistribution[4] !== 5 ||
    audit.pointDistribution[5] !== 5
  ) {
    throw new Error("gem-cardset-v1 does not match the confirmed balance audit.");
  }
  return cloned;
}

export const GEM_CARDSET_V1 = validateGemCardSet(CARD_ROWS.map(rowToCard));

export function findGemCard(
  cards: readonly GemCard[],
  cardId: GemCardId,
): GemCard | undefined {
  const card = cards.find((candidate) => candidate.cardId === cardId);
  return card === undefined ? undefined : createGemCard(card);
}
