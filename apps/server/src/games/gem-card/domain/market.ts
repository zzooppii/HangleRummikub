import {
  GEM_CARD_TIERS,
  parseGemCardId,
  type GemCardId,
  type GemCardTier,
} from "./card.js";

export type GemMarketSlots = readonly [
  GemCardId | null,
  GemCardId | null,
  GemCardId | null,
];

export type GemTierMarket = Readonly<{
  tier: GemCardTier;
  deck: readonly GemCardId[];
  slots: GemMarketSlots;
}>;

export type GemMarket = readonly [
  GemTierMarket,
  GemTierMarket,
  GemTierMarket,
];

export type GemPreShuffledTierDecks = Readonly<
  Record<GemCardTier, readonly GemCardId[]>
>;

export type GemMarketCardSource = Readonly<{
  tier: GemCardTier;
  slotIndex: 0 | 1 | 2;
}>;

function requireSlotIndex(value: number): asserts value is 0 | 1 | 2 {
  if (value !== 0 && value !== 1 && value !== 2) {
    throw new RangeError("GEM market slot index must be zero, one, or two.");
  }
}

function cloneCardIds(cardIds: readonly GemCardId[]): readonly GemCardId[] {
  const cloned = cardIds.map(parseGemCardId);
  if (new Set(cloned).size !== cloned.length) {
    throw new Error("GEM market card IDs must be unique.");
  }
  return Object.freeze(cloned);
}

export function createGemTierMarket(
  market: GemTierMarket,
): GemTierMarket {
  if (!GEM_CARD_TIERS.includes(market.tier)) {
    throw new Error("GEM market tier must be 1, 2, or 3.");
  }
  if (market.slots.length !== 3) {
    throw new Error("GEM market tier must contain exactly three slots.");
  }
  const deck = cloneCardIds(market.deck);
  const slots = Object.freeze(
    market.slots.map((cardId) =>
      cardId === null ? null : parseGemCardId(cardId),
    ),
  ) as GemMarketSlots;
  if (deck.length > 0 && slots.some((cardId) => cardId === null)) {
    throw new Error("A GEM tier with remaining deck cards cannot contain an empty slot.");
  }
  const located = [...deck, ...slots.filter((cardId) => cardId !== null)];
  if (new Set(located).size !== located.length) {
    throw new Error("A GEM card cannot occupy multiple market positions.");
  }
  if (located.some((cardId) => !cardId.startsWith(`GC-T${market.tier}-`))) {
    throw new Error("A GEM market tier contains a card from another tier.");
  }
  return Object.freeze({ tier: market.tier, deck, slots });
}

export function createGemMarket(tiers: readonly GemTierMarket[]): GemMarket {
  if (
    tiers.length !== 3 ||
    !GEM_CARD_TIERS.every((tier) => tiers.some((entry) => entry.tier === tier))
  ) {
    throw new Error("GEM market must contain exactly one state for each tier.");
  }
  const ordered = GEM_CARD_TIERS.map((tier) => {
    const state = tiers.find((entry) => entry.tier === tier);
    if (state === undefined) throw new Error("GEM market tier is missing.");
    return createGemTierMarket(state);
  });
  const allCardIds = ordered.flatMap((tier) => [
    ...tier.deck,
    ...tier.slots.filter((cardId) => cardId !== null),
  ]);
  if (new Set(allCardIds).size !== allCardIds.length) {
    throw new Error("A GEM card cannot appear in more than one market tier.");
  }
  return Object.freeze(ordered) as GemMarket;
}

export function createInitialGemMarket(
  tierDecks: GemPreShuffledTierDecks,
): GemMarket {
  return createGemMarket(
    GEM_CARD_TIERS.map((tier) => {
      const cards = cloneCardIds(tierDecks[tier]);
      if (cards.length !== 15) {
        throw new Error(`Initial GEM tier ${tier} deck must contain 15 cards.`);
      }
      return {
        tier,
        slots: [cards[0] ?? null, cards[1] ?? null, cards[2] ?? null],
        deck: cards.slice(3),
      };
    }),
  );
}

export function getGemTierMarket(
  market: GemMarket,
  tier: GemCardTier,
): GemTierMarket {
  const result = market.find((entry) => entry.tier === tier);
  if (result === undefined) throw new Error("Canonical GEM market tier is missing.");
  return result;
}

export function getGemFaceUpCardId(
  market: GemMarket,
  source: GemMarketCardSource,
): GemCardId | null {
  requireSlotIndex(source.slotIndex);
  return getGemTierMarket(market, source.tier).slots[source.slotIndex];
}

export type GemMarketRemoval = Readonly<{
  removedCardId: GemCardId;
  market: GemMarket;
}>;

export function removeAndRefillGemMarketCard(
  market: GemMarket,
  source: GemMarketCardSource,
): GemMarketRemoval | null {
  requireSlotIndex(source.slotIndex);
  const tierState = getGemTierMarket(market, source.tier);
  const removedCardId = tierState.slots[source.slotIndex];
  if (removedCardId === null) return null;
  const replacement = tierState.deck[0] ?? null;
  const nextSlots = [...tierState.slots] as [
    GemCardId | null,
    GemCardId | null,
    GemCardId | null,
  ];
  nextSlots[source.slotIndex] = replacement;
  const nextTier = createGemTierMarket({
    tier: tierState.tier,
    deck: tierState.deck.slice(replacement === null ? 0 : 1),
    slots: nextSlots,
  });
  return Object.freeze({
    removedCardId,
    market: createGemMarket(
      market.map((entry) =>
        entry.tier === source.tier ? nextTier : entry,
      ),
    ),
  });
}

export function gemFaceUpCardIds(market: GemMarket): readonly GemCardId[] {
  return Object.freeze(
    market.flatMap((tier) =>
      tier.slots.filter((cardId) => cardId !== null),
    ),
  );
}

export function isGemMarketDeckAndFaceUpEmpty(market: GemMarket): boolean {
  return market.every(
    (tier) =>
      tier.deck.length === 0 && tier.slots.every((cardId) => cardId === null),
  );
}
