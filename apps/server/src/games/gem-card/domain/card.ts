import * as v from "valibot";

import {
  createGemBasicResourceCounts,
  isGemBasicResource,
  type GemBasicResource,
  type GemBasicResourceCounts,
} from "./resource.js";

export const GEM_CARD_TIERS = Object.freeze([1, 2, 3] as const);
export type GemCardTier = (typeof GEM_CARD_TIERS)[number];

export const GemCardIdSchema = v.pipe(
  v.string(),
  v.regex(
    /^GC-T[123]-(?:0[1-9]|1[0-5])$/u,
    "GEM card ID must use the canonical GC-T{tier}-{01..15} format.",
  ),
  v.brand("GemCardId"),
);
export type GemCardId = v.InferOutput<typeof GemCardIdSchema>;

export type GemCard = Readonly<{
  cardId: GemCardId;
  tier: GemCardTier;
  cost: GemBasicResourceCounts;
  productionResource: GemBasicResource;
  victoryPoints: number;
}>;

export function isGemCardTier(value: unknown): value is GemCardTier {
  return (
    typeof value === "number" &&
    GEM_CARD_TIERS.some((tier) => tier === value)
  );
}

export function parseGemCardId(value: unknown): GemCardId {
  return v.parse(GemCardIdSchema, value);
}

export function createGemCard(card: GemCard): GemCard {
  const cardId = parseGemCardId(card.cardId);
  if (!isGemCardTier(card.tier)) {
    throw new Error("GEM card tier must be 1, 2, or 3.");
  }
  if (!cardId.startsWith(`GC-T${card.tier}-`)) {
    throw new Error("GEM card ID tier must match the card tier.");
  }
  if (!isGemBasicResource(card.productionResource)) {
    throw new Error("GEM card production must be a canonical basic resource.");
  }
  if (!Number.isSafeInteger(card.victoryPoints) || card.victoryPoints < 0) {
    throw new RangeError("GEM card victory points must be a non-negative safe integer.");
  }
  return Object.freeze({
    cardId,
    tier: card.tier,
    cost: createGemBasicResourceCounts(card.cost),
    productionResource: card.productionResource,
    victoryPoints: card.victoryPoints,
  });
}

export function totalGemCardCost(card: GemCard): number {
  return Object.values(createGemBasicResourceCounts(card.cost)).reduce(
    (total, value) => total + value,
    0,
  );
}
