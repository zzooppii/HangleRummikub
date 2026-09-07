import {
  createGemCard,
  type GemCard,
  type GemCardId,
  type GemCardTier,
} from "./card.js";
import { findGemCard } from "./cardset-v1.js";
import {
  gemFaceUpCardIds,
  createGemMarket,
  getGemFaceUpCardId,
  removeAndRefillGemMarketCard,
  type GemMarket,
  type GemMarketCardSource,
} from "./market.js";
import {
  createGemPlayerState,
  deriveGemPermanentDiscounts,
  type GemPlayerState,
} from "./player-state.js";
import {
  createEmptyGemBasicResourceCounts,
  createGemBasicResourceCounts,
  createGemResourceCounts,
  GEM_BASIC_RESOURCES,
  GEM_INITIAL_RESOURCE_TOTALS,
  GEM_RESOURCE_LIMIT,
  isGemBasicResource,
  totalGemResources,
  type GemBasicResource,
  type GemBasicResourceCounts,
  type GemResourceCounts,
} from "./resource.js";

export type GemDomainFailureReason =
  | "INVALID_RESOURCE_SELECTION"
  | "RESOURCE_SUPPLY_EMPTY"
  | "RESOURCE_LIMIT_EXCEEDED"
  | "CARD_NOT_AVAILABLE"
  | "INSUFFICIENT_RESOURCES"
  | "RESERVE_LIMIT_REACHED"
  | "INVALID_RESERVED_CARD_ACCESS"
  | "YIELD_NOT_ALLOWED"
  | "PLAYER_FORFEITED";

export type GemDomainResult<TValue> =
  | Readonly<{ ok: true; value: TValue }>
  | Readonly<{ ok: false; reason: GemDomainFailureReason }>;

const RESET_GEM_NO_PROGRESS_PLAYER_IDS = Object.freeze([] as const);

function success<TValue>(value: TValue): GemDomainResult<TValue> {
  return Object.freeze({ ok: true, value });
}

function failure<TValue>(
  reason: GemDomainFailureReason,
): GemDomainResult<TValue> {
  return Object.freeze({ ok: false, reason });
}

export type GemCollectSelection =
  | Readonly<{
      kind: "BASIC";
      resources: readonly GemBasicResource[];
    }>
  | Readonly<{
      kind: "PRISM";
    }>;

export type GemCollectTransition = Readonly<{
  player: GemPlayerState;
  supply: GemResourceCounts;
  noProgressPlayerIds: readonly [];
}>;

export function collectGemResources(input: Readonly<{
  player: GemPlayerState;
  supply: GemResourceCounts;
  selection: GemCollectSelection;
}>): GemDomainResult<GemCollectTransition> {
  const player = createGemPlayerState(input.player);
  const supply = createGemResourceCounts(input.supply);
  if (player.forfeited) return failure("PLAYER_FORFEITED");

  let resources: readonly GemBasicResource[] | readonly ["PRISM"];
  if (input.selection.kind === "PRISM") {
    if (Object.keys(input.selection).length !== 1) {
      return failure("INVALID_RESOURCE_SELECTION");
    }
    resources = Object.freeze(["PRISM"] as const);
  } else {
    resources = input.selection.resources;
    if (
      resources.length < 1 ||
      resources.length > 2 ||
      resources.some((resource) => !isGemBasicResource(resource)) ||
      new Set(resources).size !== resources.length
    ) {
      return failure("INVALID_RESOURCE_SELECTION");
    }
  }

  if (resources.some((resource) => supply[resource] < 1)) {
    return failure("RESOURCE_SUPPLY_EMPTY");
  }
  if (totalGemResources(player.resources) + resources.length > GEM_RESOURCE_LIMIT) {
    return failure("RESOURCE_LIMIT_EXCEEDED");
  }

  const nextSupply = { ...supply };
  const nextHoldings = { ...player.resources };
  for (const resource of resources) {
    nextSupply[resource] -= 1;
    nextHoldings[resource] += 1;
  }
  return success(
    Object.freeze({
      player: createGemPlayerState({ ...player, resources: createGemResourceCounts(nextHoldings) }),
      supply: createGemResourceCounts(nextSupply),
      noProgressPlayerIds: RESET_GEM_NO_PROGRESS_PLAYER_IDS,
    }),
  );
}

export function calculateGemEffectiveCost(
  card: GemCard,
  discounts: GemBasicResourceCounts,
): GemBasicResourceCounts {
  const canonicalCard = createGemCard(card);
  const validDiscounts = createGemBasicResourceCounts(discounts);
  return createGemBasicResourceCounts({
    DAWN: Math.max(0, canonicalCard.cost.DAWN - validDiscounts.DAWN),
    TIDE: Math.max(0, canonicalCard.cost.TIDE - validDiscounts.TIDE),
    GROVE: Math.max(0, canonicalCard.cost.GROVE - validDiscounts.GROVE),
    EMBER: Math.max(0, canonicalCard.cost.EMBER - validDiscounts.EMBER),
    ECHO: Math.max(0, canonicalCard.cost.ECHO - validDiscounts.ECHO),
  });
}

export type GemPayment = Readonly<{
  effectiveCost: GemBasicResourceCounts;
  basicSpent: GemBasicResourceCounts;
  prismSpent: number;
  resultingResources: GemResourceCounts;
}>;

export function calculateGemPayment(
  player: GemPlayerState,
  cardId: GemCardId,
  cards: readonly GemCard[],
): GemDomainResult<GemPayment> {
  const canonicalPlayer = createGemPlayerState(player);
  const card = findGemCard(cards, cardId);
  if (card === undefined) {
    throw new Error("GEM payment references an unknown canonical card.");
  }
  const effectiveCost = calculateGemEffectiveCost(
    card,
    deriveGemPermanentDiscounts(canonicalPlayer, cards),
  );
  const basicSpent = { ...createEmptyGemBasicResourceCounts() };
  let prismNeeded = 0;
  for (const resource of GEM_BASIC_RESOURCES) {
    const amount = Math.min(
      canonicalPlayer.resources[resource],
      effectiveCost[resource],
    );
    basicSpent[resource] = amount;
    prismNeeded += effectiveCost[resource] - amount;
  }
  if (canonicalPlayer.resources.PRISM < prismNeeded) {
    return failure("INSUFFICIENT_RESOURCES");
  }
  const resultingResources = { ...canonicalPlayer.resources };
  for (const resource of GEM_BASIC_RESOURCES) {
    resultingResources[resource] -= basicSpent[resource];
  }
  resultingResources.PRISM -= prismNeeded;
  return success(
    Object.freeze({
      effectiveCost,
      basicSpent: createGemBasicResourceCounts(basicSpent),
      prismSpent: prismNeeded,
      resultingResources: createGemResourceCounts(resultingResources),
    }),
  );
}

function returnGemPaymentToSupply(
  supply: GemResourceCounts,
  payment: GemPayment,
): GemResourceCounts {
  const nextSupply = { ...createGemResourceCounts(supply) };
  for (const resource of GEM_BASIC_RESOURCES) {
    nextSupply[resource] += payment.basicSpent[resource];
  }
  nextSupply.PRISM += payment.prismSpent;
  for (const resource of Object.keys(nextSupply) as (keyof GemResourceCounts)[]) {
    if (nextSupply[resource] > GEM_INITIAL_RESOURCE_TOTALS[resource]) {
      throw new Error(`GEM ${resource} supply exceeded its canonical total.`);
    }
  }
  return createGemResourceCounts(nextSupply);
}

export type GemPurchaseSource =
  | Readonly<{
      kind: "MARKET";
      tier: GemCardTier;
      slotIndex: 0 | 1 | 2;
    }>
  | Readonly<{
      kind: "RESERVED";
      cardId: GemCardId;
    }>;

export type GemPurchaseTransition = Readonly<{
  purchasedCardId: GemCardId;
  payment: GemPayment;
  player: GemPlayerState;
  supply: GemResourceCounts;
  market: GemMarket;
  noProgressPlayerIds: readonly [];
}>;

function resolvePurchaseCard(
  player: GemPlayerState,
  market: GemMarket,
  source: GemPurchaseSource,
): GemDomainResult<Readonly<{ cardId: GemCardId; marketSource: GemMarketCardSource | null }>> {
  if (source.kind === "MARKET") {
    const marketSource = Object.freeze({ tier: source.tier, slotIndex: source.slotIndex });
    const cardId = getGemFaceUpCardId(market, marketSource);
    return cardId === null
      ? failure("CARD_NOT_AVAILABLE")
      : success(Object.freeze({ cardId, marketSource }));
  }
  return player.reservedCardIds.includes(source.cardId)
    ? success(Object.freeze({ cardId: source.cardId, marketSource: null }))
    : failure("INVALID_RESERVED_CARD_ACCESS");
}

export function purchaseGemCard(input: Readonly<{
  player: GemPlayerState;
  supply: GemResourceCounts;
  market: GemMarket;
  cards: readonly GemCard[];
  source: GemPurchaseSource;
}>): GemDomainResult<GemPurchaseTransition> {
  const player = createGemPlayerState(input.player);
  if (player.forfeited) return failure("PLAYER_FORFEITED");
  const canonicalMarket = createGemMarket(input.market);
  const resolved = resolvePurchaseCard(player, canonicalMarket, input.source);
  if (!resolved.ok) return resolved;
  const card = findGemCard(input.cards, resolved.value.cardId);
  if (card === undefined) throw new Error("GEM purchase references an unknown canonical card.");
  const payment = calculateGemPayment(player, card.cardId, input.cards);
  if (!payment.ok) return payment;

  let market = canonicalMarket;
  if (resolved.value.marketSource !== null) {
    const removal = removeAndRefillGemMarketCard(market, resolved.value.marketSource);
    if (removal === null || removal.removedCardId !== card.cardId) {
      throw new Error("Canonical GEM market changed during pure purchase resolution.");
    }
    market = removal.market;
  }
  const reservedCardIds =
    resolved.value.marketSource === null
      ? player.reservedCardIds.filter((cardId) => cardId !== card.cardId)
      : player.reservedCardIds;
  const nextPlayer = createGemPlayerState({
    ...player,
    resources: payment.value.resultingResources,
    reservedCardIds,
    purchasedCardIds: [...player.purchasedCardIds, card.cardId],
  });
  return success(
    Object.freeze({
      purchasedCardId: card.cardId,
      payment: payment.value,
      player: nextPlayer,
      supply: returnGemPaymentToSupply(input.supply, payment.value),
      market,
      noProgressPlayerIds: RESET_GEM_NO_PROGRESS_PLAYER_IDS,
    }),
  );
}

export type GemReserveTransition = Readonly<{
  reservedCardId: GemCardId;
  player: GemPlayerState;
  market: GemMarket;
  noProgressPlayerIds: readonly [];
}>;

export function reserveGemMarketCard(input: Readonly<{
  player: GemPlayerState;
  market: GemMarket;
  source: GemMarketCardSource;
}>): GemDomainResult<GemReserveTransition> {
  const player = createGemPlayerState(input.player);
  if (player.forfeited) return failure("PLAYER_FORFEITED");
  if (player.reservedCardIds.length >= 2) return failure("RESERVE_LIMIT_REACHED");
  const removal = removeAndRefillGemMarketCard(
    createGemMarket(input.market),
    input.source,
  );
  if (removal === null) return failure("CARD_NOT_AVAILABLE");
  return success(
    Object.freeze({
      reservedCardId: removal.removedCardId,
      player: createGemPlayerState({
        ...player,
        reservedCardIds: [...player.reservedCardIds, removal.removedCardId],
      }),
      market: removal.market,
      noProgressPlayerIds: RESET_GEM_NO_PROGRESS_PLAYER_IDS,
    }),
  );
}

function canGemCollect(player: GemPlayerState, supply: GemResourceCounts): boolean {
  return (
    !player.forfeited &&
    totalGemResources(player.resources) < GEM_RESOURCE_LIMIT &&
    (GEM_BASIC_RESOURCES.some((resource) => supply[resource] > 0) || supply.PRISM > 0)
  );
}

function canGemPurchase(
  player: GemPlayerState,
  market: GemMarket,
  cards: readonly GemCard[],
): boolean {
  const candidates = [...gemFaceUpCardIds(market), ...player.reservedCardIds];
  return candidates.some((cardId) => {
    const card = findGemCard(cards, cardId);
    if (card === undefined) throw new Error("GEM legal-action check found an unknown card.");
    return calculateGemPayment(player, card.cardId, cards).ok;
  });
}

function canGemReserve(player: GemPlayerState, market: GemMarket): boolean {
  return player.reservedCardIds.length < 2 && gemFaceUpCardIds(market).length > 0;
}

export type GemLegalMainActions = Readonly<{
  collect: boolean;
  purchase: boolean;
  reserve: boolean;
}>;

export function evaluateGemLegalMainActions(input: Readonly<{
  player: GemPlayerState;
  supply: GemResourceCounts;
  market: GemMarket;
  cards: readonly GemCard[];
}>): GemLegalMainActions {
  const player = createGemPlayerState(input.player);
  const supply = createGemResourceCounts(input.supply);
  const market = createGemMarket(input.market);
  if (player.forfeited) {
    return Object.freeze({ collect: false, purchase: false, reserve: false });
  }
  return Object.freeze({
    collect: canGemCollect(player, supply),
    purchase: canGemPurchase(player, market, input.cards),
    reserve: canGemReserve(player, market),
  });
}

export function hasAnyGemLegalMainAction(input: Readonly<{
  player: GemPlayerState;
  supply: GemResourceCounts;
  market: GemMarket;
  cards: readonly GemCard[];
}>): boolean {
  const legal = evaluateGemLegalMainActions(input);
  return legal.collect || legal.purchase || legal.reserve;
}

export function assertGemYieldAllowed(input: Readonly<{
  player: GemPlayerState;
  supply: GemResourceCounts;
  market: GemMarket;
  cards: readonly GemCard[];
}>): GemDomainResult<Readonly<{ allowed: true }>> {
  if (input.player.forfeited) return failure("PLAYER_FORFEITED");
  return hasAnyGemLegalMainAction(input)
    ? failure("YIELD_NOT_ALLOWED")
    : success(Object.freeze({ allowed: true }));
}
