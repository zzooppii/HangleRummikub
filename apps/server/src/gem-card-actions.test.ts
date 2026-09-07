import assert from "node:assert/strict";
import test from "node:test";

import {
  PlayerIdSchema,
  type PlayerId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  assertGemYieldAllowed,
  calculateGemEffectiveCost,
  calculateGemPayment,
  collectGemResources,
  evaluateGemLegalMainActions,
  hasAnyGemLegalMainAction,
  purchaseGemCard,
  reserveGemMarketCard,
  type GemCollectSelection,
  type GemDomainFailureReason,
  type GemDomainResult,
} from "./games/gem-card/domain/actions.js";
import {
  GEM_CARDSET_V1,
  findGemCard,
} from "./games/gem-card/domain/cardset-v1.js";
import {
  parseGemCardId,
  type GemCard,
  type GemCardId,
} from "./games/gem-card/domain/card.js";
import {
  createGemMarket,
  getGemTierMarket,
  type GemMarket,
  type GemMarketSlots,
} from "./games/gem-card/domain/market.js";
import {
  createGemPlayerState,
  deriveGemPermanentDiscounts,
  deriveGemVictoryScore,
  type GemPlayerState,
} from "./games/gem-card/domain/player-state.js";
import {
  createEmptyGemResourceCounts,
  createGemResourceCounts,
  GEM_INITIAL_RESOURCE_TOTALS,
  type GemResource,
  type GemResourceCounts,
} from "./games/gem-card/domain/resource.js";

const PLAYER_A = parse(PlayerIdSchema, "gem-actions-player-a");

type ResourceOverrides = Partial<Record<GemResource, number>>;

function cardId(value: string): GemCardId {
  return parseGemCardId(value);
}

function card(value: string): GemCard {
  const found = findGemCard(GEM_CARDSET_V1, cardId(value));
  if (found === undefined) {
    throw new Error(`Missing canonical GEM test card ${value}.`);
  }
  return found;
}

function resources(overrides: ResourceOverrides = {}): GemResourceCounts {
  return createGemResourceCounts({
    ...createEmptyGemResourceCounts(),
    ...overrides,
  });
}

function supply(overrides: ResourceOverrides = {}): GemResourceCounts {
  return createGemResourceCounts({
    ...GEM_INITIAL_RESOURCE_TOTALS,
    ...overrides,
  });
}

function supplyAfterHoldings(
  holdings: GemResourceCounts,
): GemResourceCounts {
  return createGemResourceCounts({
    DAWN: GEM_INITIAL_RESOURCE_TOTALS.DAWN - holdings.DAWN,
    TIDE: GEM_INITIAL_RESOURCE_TOTALS.TIDE - holdings.TIDE,
    GROVE: GEM_INITIAL_RESOURCE_TOTALS.GROVE - holdings.GROVE,
    EMBER: GEM_INITIAL_RESOURCE_TOTALS.EMBER - holdings.EMBER,
    ECHO: GEM_INITIAL_RESOURCE_TOTALS.ECHO - holdings.ECHO,
    PRISM: GEM_INITIAL_RESOURCE_TOTALS.PRISM - holdings.PRISM,
  });
}

function player(input: Readonly<{
  playerId?: PlayerId;
  resources?: GemResourceCounts;
  purchasedCardIds?: readonly GemCardId[];
  reservedCardIds?: readonly GemCardId[];
  forfeited?: boolean;
}> = {}): GemPlayerState {
  return createGemPlayerState({
    playerId: input.playerId ?? PLAYER_A,
    resources: input.resources ?? resources(),
    purchasedCardIds: input.purchasedCardIds ?? [],
    reservedCardIds: input.reservedCardIds ?? [],
    forfeited: input.forfeited ?? false,
    offlineTimeoutStreak: 0,
  });
}

function slots(
  first: GemCardId | null = null,
  second: GemCardId | null = null,
  third: GemCardId | null = null,
): GemMarketSlots {
  return [first, second, third];
}

function market(input: Readonly<{
  tier1Slots?: GemMarketSlots;
  tier1Deck?: readonly GemCardId[];
  tier2Slots?: GemMarketSlots;
  tier2Deck?: readonly GemCardId[];
  tier3Slots?: GemMarketSlots;
  tier3Deck?: readonly GemCardId[];
}> = {}): GemMarket {
  return createGemMarket([
    {
      tier: 1,
      slots: input.tier1Slots ?? slots(),
      deck: input.tier1Deck ?? [],
    },
    {
      tier: 2,
      slots: input.tier2Slots ?? slots(),
      deck: input.tier2Deck ?? [],
    },
    {
      tier: 3,
      slots: input.tier3Slots ?? slots(),
      deck: input.tier3Deck ?? [],
    },
  ]);
}

function assertFailure<TValue>(
  result: GemDomainResult<TValue>,
  reason: GemDomainFailureReason,
): void {
  assert.deepEqual(result, { ok: false, reason });
  assert.equal(Object.isFrozen(result), true);
}

test("COLLECT는 available basic 한 종류 또는 서로 다른 두 종류를 exact transfer한다", () => {
  const sourcePlayer = player();
  const sourceSupply = supply();

  const one = collectGemResources({
    player: sourcePlayer,
    supply: sourceSupply,
    selection: { kind: "BASIC", resources: ["DAWN"] },
  });
  assert.equal(one.ok, true);
  if (!one.ok) return;
  assert.deepEqual(one.value.player.resources, resources({ DAWN: 1 }));
  assert.deepEqual(one.value.supply, supply({ DAWN: 6 }));

  const two = collectGemResources({
    player: sourcePlayer,
    supply: sourceSupply,
    selection: { kind: "BASIC", resources: ["TIDE", "GROVE"] },
  });
  assert.equal(two.ok, true);
  if (!two.ok) return;
  assert.deepEqual(
    two.value.player.resources,
    resources({ TIDE: 1, GROVE: 1 }),
  );
  assert.deepEqual(two.value.supply, supply({ TIDE: 6, GROVE: 6 }));
  assert.deepEqual(sourcePlayer.resources, resources());
  assert.deepEqual(sourceSupply, GEM_INITIAL_RESOURCE_TOTALS);
  assert.equal(Object.isFrozen(two.value), true);
  assert.equal(Object.isFrozen(two.value.player.resources), true);
  assert.equal(Object.isFrozen(two.value.supply), true);
  assert.deepEqual(two.value.noProgressPlayerIds, []);
});

test("COLLECT는 PRISM 한 개만 별도 action으로 transfer한다", () => {
  const result = collectGemResources({
    player: player(),
    supply: supply(),
    selection: { kind: "PRISM" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.player.resources, resources({ PRISM: 1 }));
  assert.deepEqual(result.value.supply, supply({ PRISM: 4 }));
});

test("COLLECT는 empty, duplicate, 세 basic, basic+PRISM 선택을 atomic reject한다", () => {
  const sourcePlayer = player();
  const sourceSupply = supply();
  const invalidSelections: readonly GemCollectSelection[] = [
    { kind: "BASIC", resources: [] },
    { kind: "BASIC", resources: ["DAWN", "DAWN"] },
    { kind: "BASIC", resources: ["DAWN", "TIDE", "GROVE"] },
    {
      kind: "BASIC",
      resources: ["DAWN", "PRISM"],
    } as unknown as GemCollectSelection,
  ];

  for (const selection of invalidSelections) {
    assertFailure(
      collectGemResources({
        player: sourcePlayer,
        supply: sourceSupply,
        selection,
      }),
      "INVALID_RESOURCE_SELECTION",
    );
  }
  assert.deepEqual(sourcePlayer, player());
  assert.deepEqual(sourceSupply, supply());
});

test("COLLECT는 unavailable basic/PRISM과 forfeited Player를 mutation 없이 거절한다", () => {
  const unavailableBasicSupply = supply({ DAWN: 0 });
  const emptyPrismSupply = supply({ PRISM: 0 });
  const sourcePlayer = player();

  assertFailure(
    collectGemResources({
      player: sourcePlayer,
      supply: unavailableBasicSupply,
      selection: { kind: "BASIC", resources: ["DAWN"] },
    }),
    "RESOURCE_SUPPLY_EMPTY",
  );
  assertFailure(
    collectGemResources({
      player: sourcePlayer,
      supply: emptyPrismSupply,
      selection: { kind: "PRISM" },
    }),
    "RESOURCE_SUPPLY_EMPTY",
  );
  assertFailure(
    collectGemResources({
      player: player({ forfeited: true }),
      supply: supply(),
      selection: { kind: "BASIC", resources: ["DAWN"] },
    }),
    "PLAYER_FORFEITED",
  );
  assert.deepEqual(unavailableBasicSupply, supply({ DAWN: 0 }));
  assert.deepEqual(emptyPrismSupply, supply({ PRISM: 0 }));
  assert.deepEqual(sourcePlayer, player());
});

test("COLLECT resource cap은 8→1만 허용하고 8→2와 9→1을 atomic reject한다", () => {
  const eight = resources({ DAWN: 7, TIDE: 1 });
  const atEight = player({ resources: eight });
  const one = collectGemResources({
    player: atEight,
    supply: supply({ DAWN: 0, TIDE: 6 }),
    selection: { kind: "BASIC", resources: ["GROVE"] },
  });
  assert.equal(one.ok, true);
  if (one.ok) {
    assert.deepEqual(
      one.value.player.resources,
      resources({ DAWN: 7, TIDE: 1, GROVE: 1 }),
    );
  }

  const sourceSupply = supply({ DAWN: 0, TIDE: 6 });
  assertFailure(
    collectGemResources({
      player: atEight,
      supply: sourceSupply,
      selection: { kind: "BASIC", resources: ["GROVE", "EMBER"] },
    }),
    "RESOURCE_LIMIT_EXCEEDED",
  );
  const atNine = player({
    resources: resources({ DAWN: 7, TIDE: 2 }),
  });
  assertFailure(
    collectGemResources({
      player: atNine,
      supply: supply({ DAWN: 0, TIDE: 5 }),
      selection: { kind: "BASIC", resources: ["GROVE"] },
    }),
    "RESOURCE_LIMIT_EXCEEDED",
  );
  assert.deepEqual(atEight.resources, eight);
  assert.deepEqual(sourceSupply, supply({ DAWN: 0, TIDE: 6 }));
  assert.deepEqual(atNine.resources, resources({ DAWN: 7, TIDE: 2 }));
});

test("permanent discount는 purchased production을 세고 unrelated cost는 유지하며 zero에서 floor한다", () => {
  const target = card("GC-T3-03");
  const none = deriveGemPermanentDiscounts(player(), GEM_CARDSET_V1);
  assert.deepEqual(calculateGemEffectiveCost(target, none), target.cost);

  const tideDiscount = deriveGemPermanentDiscounts(
    player({ purchasedCardIds: [cardId("GC-T1-04")] }),
    GEM_CARDSET_V1,
  );
  assert.deepEqual(tideDiscount, {
    DAWN: 0,
    TIDE: 1,
    GROVE: 0,
    EMBER: 0,
    ECHO: 0,
  });
  assert.deepEqual(calculateGemEffectiveCost(target, tideDiscount), {
    DAWN: 1,
    TIDE: 3,
    GROVE: 1,
    EMBER: 4,
    ECHO: 1,
  });

  const threeDawnDiscounts = deriveGemPermanentDiscounts(
    player({
      purchasedCardIds: [
        cardId("GC-T1-01"),
        cardId("GC-T1-02"),
        cardId("GC-T1-03"),
      ],
    }),
    GEM_CARDSET_V1,
  );
  assert.equal(threeDawnDiscounts.DAWN, 3);
  assert.deepEqual(calculateGemEffectiveCost(target, threeDawnDiscounts), {
    DAWN: 0,
    TIDE: 4,
    GROVE: 1,
    EMBER: 4,
    ECHO: 1,
  });
});

test("payment는 effective cost에 basic holdings를 먼저 쓰고 부족분만 PRISM으로 채운다", () => {
  const target = card("GC-T1-01");
  const exact = calculateGemPayment(
    player({ resources: resources({ TIDE: 2, GROVE: 1 }) }),
    target.cardId,
    GEM_CARDSET_V1,
  );
  assert.equal(exact.ok, true);
  if (!exact.ok) return;
  assert.deepEqual(exact.value.basicSpent, {
    DAWN: 0,
    TIDE: 2,
    GROVE: 1,
    EMBER: 0,
    ECHO: 0,
  });
  assert.equal(exact.value.prismSpent, 0);
  assert.deepEqual(exact.value.resultingResources, resources());

  const withWild = calculateGemPayment(
    player({ resources: resources({ TIDE: 2, PRISM: 3 }) }),
    target.cardId,
    GEM_CARDSET_V1,
  );
  assert.equal(withWild.ok, true);
  if (!withWild.ok) return;
  assert.equal(withWild.value.basicSpent.TIDE, 2);
  assert.equal(withWild.value.basicSpent.GROVE, 0);
  assert.equal(withWild.value.prismSpent, 1);
  assert.deepEqual(withWild.value.resultingResources, resources({ PRISM: 2 }));
  assert.equal(Object.isFrozen(withWild.value.effectiveCost), true);
  assert.equal(Object.isFrozen(withWild.value.basicSpent), true);
  assert.equal(Object.isFrozen(withWild.value.resultingResources), true);
});

test("payment는 permanent discount를 적용하고 부족한 basic+PRISM이면 atomic reject한다", () => {
  const target = card("GC-T1-01");
  const discountedPlayer = player({
    resources: resources({ TIDE: 1, GROVE: 1 }),
    purchasedCardIds: [cardId("GC-T1-04")],
  });
  const discounted = calculateGemPayment(
    discountedPlayer,
    target.cardId,
    GEM_CARDSET_V1,
  );
  assert.equal(discounted.ok, true);
  if (discounted.ok) {
    assert.deepEqual(discounted.value.effectiveCost, {
      DAWN: 0,
      TIDE: 1,
      GROVE: 1,
      EMBER: 0,
      ECHO: 0,
    });
    assert.deepEqual(discounted.value.resultingResources, resources());
  }

  const insufficientPlayer = player({
    resources: resources({ TIDE: 1, PRISM: 1 }),
  });
  assertFailure(
    calculateGemPayment(insufficientPlayer, target.cardId, GEM_CARDSET_V1),
    "INSUFFICIENT_RESOURCES",
  );
  assert.deepEqual(
    insufficientPlayer.resources,
    resources({ TIDE: 1, PRISM: 1 }),
  );
});

test("market purchase는 card를 한 번 이동하고 payment를 supply에 반환하며 같은 slot을 refill한다", () => {
  const purchased = cardId("GC-T1-01");
  const refill = cardId("GC-T1-02");
  const secondSlot = cardId("GC-T1-03");
  const thirdSlot = cardId("GC-T1-04");
  const sourceMarket = market({
    tier1Slots: slots(purchased, secondSlot, thirdSlot),
    tier1Deck: [refill],
  });
  const holdings = resources({ TIDE: 2, GROVE: 1 });
  const sourcePlayer = player({ resources: holdings });
  const sourceSupply = supplyAfterHoldings(holdings);
  const result = purchaseGemCard({
    player: sourcePlayer,
    supply: sourceSupply,
    market: sourceMarket,
    cards: GEM_CARDSET_V1,
    source: { kind: "MARKET", tier: 1, slotIndex: 0 },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.purchasedCardId, purchased);
  assert.deepEqual(result.value.player.purchasedCardIds, [purchased]);
  assert.deepEqual(result.value.player.reservedCardIds, []);
  assert.deepEqual(result.value.player.resources, resources());
  assert.deepEqual(result.value.supply, GEM_INITIAL_RESOURCE_TOTALS);
  assert.deepEqual(result.value.noProgressPlayerIds, []);
  assert.deepEqual(getGemTierMarket(result.value.market, 1), {
    tier: 1,
    deck: [],
    slots: [refill, secondSlot, thirdSlot],
  });
  assert.equal(deriveGemVictoryScore(result.value.player, GEM_CARDSET_V1), 0);
  assert.deepEqual(getGemTierMarket(sourceMarket, 1), {
    tier: 1,
    deck: [refill],
    slots: [purchased, secondSlot, thirdSlot],
  });
  assert.deepEqual(sourcePlayer.resources, holdings);
  assert.deepEqual(sourceSupply, supplyAfterHoldings(holdings));
});

test("market purchase는 empty deck이면 제거한 slot을 null로 남기고 다른 slot/tier를 압축하지 않는다", () => {
  const purchased = cardId("GC-T1-03");
  const untouched = cardId("GC-T1-04");
  const tierTwo = cardId("GC-T2-01");
  const holdings = resources({ DAWN: 2, GROVE: 1, ECHO: 2 });
  const sourceMarket = market({
    tier1Slots: slots(purchased, untouched),
    tier2Slots: slots(tierTwo),
  });
  const result = purchaseGemCard({
    player: player({ resources: holdings }),
    supply: supplyAfterHoldings(holdings),
    market: sourceMarket,
    cards: GEM_CARDSET_V1,
    source: { kind: "MARKET", tier: 1, slotIndex: 0 },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(getGemTierMarket(result.value.market, 1).slots, [
    null,
    untouched,
    null,
  ]);
  assert.deepEqual(getGemTierMarket(result.value.market, 2).slots, [
    tierTwo,
    null,
    null,
  ]);
  assert.equal(deriveGemVictoryScore(result.value.player, GEM_CARDSET_V1), 1);
});

test("reserved purchase는 own card만 제거해 purchased로 옮기고 market을 변경하지 않는다", () => {
  const reserved = cardId("GC-T1-01");
  const otherReserved = cardId("GC-T2-01");
  const holdings = resources({ TIDE: 2, GROVE: 1 });
  const sourceMarket = market({
    tier3Slots: slots(cardId("GC-T3-01")),
  });
  const sourcePlayer = player({
    resources: holdings,
    reservedCardIds: [reserved, otherReserved],
  });
  const result = purchaseGemCard({
    player: sourcePlayer,
    supply: supplyAfterHoldings(holdings),
    market: sourceMarket,
    cards: GEM_CARDSET_V1,
    source: { kind: "RESERVED", cardId: reserved },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.deepEqual(result.value.player.reservedCardIds, [otherReserved]);
  assert.deepEqual(result.value.player.purchasedCardIds, [reserved]);
  assert.deepEqual(result.value.market, sourceMarket);
  assert.deepEqual(sourcePlayer.reservedCardIds, [reserved, otherReserved]);

  const opponentCard = cardId("GC-T1-02");
  assertFailure(
    purchaseGemCard({
      player: sourcePlayer,
      supply: supplyAfterHoldings(holdings),
      market: sourceMarket,
      cards: GEM_CARDSET_V1,
      source: { kind: "RESERVED", cardId: opponentCard },
    }),
    "INVALID_RESERVED_CARD_ACCESS",
  );
  assert.deepEqual(sourcePlayer.reservedCardIds, [reserved, otherReserved]);
});

test("purchase는 unavailable slot, insufficient resources, forfeited player를 atomic reject한다", () => {
  const sourceMarket = market({
    tier1Slots: slots(null, cardId("GC-T1-01")),
  });
  const sourceSupply = supply();
  const sourcePlayer = player();

  assertFailure(
    purchaseGemCard({
      player: sourcePlayer,
      supply: sourceSupply,
      market: sourceMarket,
      cards: GEM_CARDSET_V1,
      source: { kind: "MARKET", tier: 1, slotIndex: 0 },
    }),
    "CARD_NOT_AVAILABLE",
  );
  assertFailure(
    purchaseGemCard({
      player: sourcePlayer,
      supply: sourceSupply,
      market: sourceMarket,
      cards: GEM_CARDSET_V1,
      source: { kind: "MARKET", tier: 1, slotIndex: 1 },
    }),
    "INSUFFICIENT_RESOURCES",
  );
  assertFailure(
    purchaseGemCard({
      player: player({ forfeited: true }),
      supply: sourceSupply,
      market: sourceMarket,
      cards: GEM_CARDSET_V1,
      source: { kind: "MARKET", tier: 1, slotIndex: 1 },
    }),
    "PLAYER_FORFEITED",
  );
  assert.deepEqual(sourceMarket, market({
    tier1Slots: slots(null, cardId("GC-T1-01")),
  }));
  assert.deepEqual(sourceSupply, supply());
  assert.deepEqual(sourcePlayer, player());
});

test("purchase는 corrupt resource conservation에서 fail-closed하고 source를 변경하지 않는다", () => {
  const target = cardId("GC-T1-01");
  const holdings = resources({ TIDE: 2, GROVE: 1 });
  const impossibleSupply = supply();
  const sourceMarket = market({ tier1Slots: slots(target) });

  assert.throws(
    () =>
      purchaseGemCard({
        player: player({ resources: holdings }),
        supply: impossibleSupply,
        market: sourceMarket,
        cards: GEM_CARDSET_V1,
        source: { kind: "MARKET", tier: 1, slotIndex: 0 },
      }),
    /supply exceeded its canonical total/u,
  );
  assert.deepEqual(impossibleSupply, supply());
  assert.deepEqual(
    getGemTierMarket(sourceMarket, 1).slots,
    [target, null, null],
  );
});

test("RESERVE는 first/second face-up card identity를 보존하고 no reward로 같은 slot을 refill한다", () => {
  const first = cardId("GC-T1-01");
  const refill = cardId("GC-T1-02");
  const secondSlot = cardId("GC-T1-03");
  const thirdSlot = cardId("GC-T1-04");
  const existing = cardId("GC-T2-01");
  const sourceMarket = market({
    tier1Slots: slots(first, secondSlot, thirdSlot),
    tier1Deck: [refill],
  });
  const sourcePlayer = player({ reservedCardIds: [existing] });
  const result = reserveGemMarketCard({
    player: sourcePlayer,
    market: sourceMarket,
    source: { tier: 1, slotIndex: 0 },
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.reservedCardId, first);
  assert.deepEqual(result.value.player.reservedCardIds, [existing, first]);
  assert.deepEqual(result.value.player.resources, sourcePlayer.resources);
  assert.deepEqual(result.value.noProgressPlayerIds, []);
  assert.deepEqual(getGemTierMarket(result.value.market, 1), {
    tier: 1,
    deck: [],
    slots: [refill, secondSlot, thirdSlot],
  });
  assert.deepEqual(sourcePlayer.reservedCardIds, [existing]);
  assert.deepEqual(getGemTierMarket(sourceMarket, 1), {
    tier: 1,
    deck: [refill],
    slots: [first, secondSlot, thirdSlot],
  });
});

test("RESERVE는 third card, empty face-up slot, forfeited player를 atomic reject한다", () => {
  const visible = cardId("GC-T1-01");
  const sourceMarket = market({
    tier1Slots: slots(null, visible),
  });
  const atLimit = player({
    reservedCardIds: [cardId("GC-T2-01"), cardId("GC-T3-01")],
  });

  assertFailure(
    reserveGemMarketCard({
      player: atLimit,
      market: sourceMarket,
      source: { tier: 1, slotIndex: 1 },
    }),
    "RESERVE_LIMIT_REACHED",
  );
  assertFailure(
    reserveGemMarketCard({
      player: player(),
      market: sourceMarket,
      source: { tier: 1, slotIndex: 0 },
    }),
    "CARD_NOT_AVAILABLE",
  );
  assertFailure(
    reserveGemMarketCard({
      player: player({ forfeited: true }),
      market: sourceMarket,
      source: { tier: 1, slotIndex: 1 },
    }),
    "PLAYER_FORFEITED",
  );
  assert.deepEqual(getGemTierMarket(sourceMarket, 1), {
    tier: 1,
    deck: [],
    slots: [null, visible, null],
  });
  assert.deepEqual(atLimit.reservedCardIds, [
    cardId("GC-T2-01"),
    cardId("GC-T3-01"),
  ]);
});

test("legal-action evaluator는 COLLECT/PURCHASE/RESERVE를 독립적으로 판정한다", () => {
  const emptyMarket = market();
  const collectOnly = {
    player: player(),
    supply: supply(),
    market: emptyMarket,
    cards: GEM_CARDSET_V1,
  };
  assert.deepEqual(evaluateGemLegalMainActions(collectOnly), {
    collect: true,
    purchase: false,
    reserve: false,
  });

  const reserveOnly = {
    player: player(),
    supply: resources(),
    market: market({ tier3Slots: slots(cardId("GC-T3-03")) }),
    cards: GEM_CARDSET_V1,
  };
  assert.deepEqual(evaluateGemLegalMainActions(reserveOnly), {
    collect: false,
    purchase: false,
    reserve: true,
  });

  const purchaseHoldings = resources({
    DAWN: 2,
    TIDE: 2,
    GROVE: 1,
    EMBER: 2,
    ECHO: 2,
  });
  const purchaseOnly = {
    player: player({
      resources: purchaseHoldings,
      reservedCardIds: [cardId("GC-T1-01"), cardId("GC-T3-03")],
    }),
    supply: resources(),
    market: emptyMarket,
    cards: GEM_CARDSET_V1,
  };
  assert.deepEqual(evaluateGemLegalMainActions(purchaseOnly), {
    collect: false,
    purchase: true,
    reserve: false,
  });
  assert.equal(hasAnyGemLegalMainAction(collectOnly), true);
  assert.equal(hasAnyGemLegalMainAction(reserveOnly), true);
  assert.equal(hasAnyGemLegalMainAction(purchaseOnly), true);

  const forfeited = {
    ...collectOnly,
    player: player({ forfeited: true }),
  };
  assert.deepEqual(evaluateGemLegalMainActions(forfeited), {
    collect: false,
    purchase: false,
    reserve: false,
  });
});

test("YIELD는 어떤 legal main action도 없을 때만 허용한다", () => {
  const noActions = {
    player: player({ resources: resources({ DAWN: 7, TIDE: 2 }) }),
    supply: resources(),
    market: market(),
    cards: GEM_CARDSET_V1,
  };
  assert.equal(hasAnyGemLegalMainAction(noActions), false);
  assert.deepEqual(assertGemYieldAllowed(noActions), {
    ok: true,
    value: { allowed: true },
  });

  const collectLegal = {
    ...noActions,
    player: player(),
    supply: supply(),
  };
  const reserveLegal = {
    ...noActions,
    player: player(),
    market: market({ tier1Slots: slots(cardId("GC-T1-01")) }),
  };
  const purchaseLegal = {
    ...noActions,
    player: player({
      resources: resources({ TIDE: 2, GROVE: 1 }),
      reservedCardIds: [cardId("GC-T1-01"), cardId("GC-T3-03")],
    }),
  };
  for (const input of [collectLegal, reserveLegal, purchaseLegal]) {
    assertFailure(assertGemYieldAllowed(input), "YIELD_NOT_ALLOWED");
  }
  assertFailure(
    assertGemYieldAllowed({
      ...noActions,
      player: player({ forfeited: true }),
    }),
    "PLAYER_FORFEITED",
  );
});
