import assert from "node:assert/strict";
import test from "node:test";

import {
  GEM_CARD_TIERS,
  createGemCard,
  parseGemCardId,
  totalGemCardCost,
  type GemCard,
} from "./games/gem-card/domain/card.js";
import {
  GEM_CARDSET_V1,
  GEM_CARDSET_VERSION,
  auditGemCardSet,
  findGemCard,
  validateGemCardSet,
} from "./games/gem-card/domain/cardset-v1.js";
import {
  GEM_BASIC_RESOURCES,
  GEM_INITIAL_RESOURCE_TOTALS,
  GEM_RESOURCES,
  GEM_RESOURCE_LIMIT,
  assertGemResourceConservation,
  createEmptyGemBasicResourceCounts,
  createEmptyGemResourceCounts,
  createGemBasicResourceCounts,
  createGemResourceCounts,
  createInitialGemSupply,
  isGemBasicResource,
  isGemResource,
  totalGemResources,
  type GemBasicResourceCounts,
  type GemResourceCounts,
} from "./games/gem-card/domain/resource.js";

const CANONICAL_CARD_ROWS = Object.freeze([
  "GC-T1-01|1|DAWN|0,2,1,0,0|0",
  "GC-T1-02|1|DAWN|1,0,2,1,0|0",
  "GC-T1-03|1|DAWN|2,0,1,0,2|1",
  "GC-T1-04|1|TIDE|0,0,2,1,0|0",
  "GC-T1-05|1|TIDE|0,1,0,2,1|0",
  "GC-T1-06|1|TIDE|2,2,0,1,0|1",
  "GC-T1-07|1|GROVE|0,0,0,2,1|0",
  "GC-T1-08|1|GROVE|1,0,1,0,2|0",
  "GC-T1-09|1|GROVE|0,2,2,0,1|1",
  "GC-T1-10|1|EMBER|1,0,0,0,2|0",
  "GC-T1-11|1|EMBER|2,1,0,1,0|0",
  "GC-T1-12|1|EMBER|1,0,2,2,0|1",
  "GC-T1-13|1|ECHO|2,1,0,0,0|0",
  "GC-T1-14|1|ECHO|0,2,1,0,1|0",
  "GC-T1-15|1|ECHO|0,1,0,2,2|1",
  "GC-T2-01|2|DAWN|0,2,0,2,1|1",
  "GC-T2-02|2|DAWN|2,0,3,0,2|2",
  "GC-T2-03|2|DAWN|1,2,1,3,1|3",
  "GC-T2-04|2|TIDE|1,0,2,0,2|1",
  "GC-T2-05|2|TIDE|2,2,0,3,0|2",
  "GC-T2-06|2|TIDE|1,1,2,1,3|3",
  "GC-T2-07|2|GROVE|2,1,0,2,0|1",
  "GC-T2-08|2|GROVE|0,2,2,0,3|2",
  "GC-T2-09|2|GROVE|3,1,1,2,1|3",
  "GC-T2-10|2|EMBER|0,2,1,0,2|1",
  "GC-T2-11|2|EMBER|3,0,2,2,0|2",
  "GC-T2-12|2|EMBER|1,3,1,1,2|3",
  "GC-T2-13|2|ECHO|2,0,2,1,0|1",
  "GC-T2-14|2|ECHO|0,3,0,2,2|2",
  "GC-T2-15|2|ECHO|2,1,3,1,1|3",
  "GC-T3-01|3|DAWN|0,3,2,0,3|3",
  "GC-T3-02|3|DAWN|3,0,3,2,2|4",
  "GC-T3-03|3|DAWN|1,4,1,4,1|5",
  "GC-T3-04|3|TIDE|3,0,3,2,0|3",
  "GC-T3-05|3|TIDE|2,3,0,3,2|4",
  "GC-T3-06|3|TIDE|1,1,4,1,4|5",
  "GC-T3-07|3|GROVE|0,3,0,3,2|3",
  "GC-T3-08|3|GROVE|2,2,3,0,3|4",
  "GC-T3-09|3|GROVE|4,1,1,4,1|5",
  "GC-T3-10|3|EMBER|2,0,3,0,3|3",
  "GC-T3-11|3|EMBER|3,2,2,3,0|4",
  "GC-T3-12|3|EMBER|1,4,1,1,4|5",
  "GC-T3-13|3|ECHO|3,2,0,3,0|3",
  "GC-T3-14|3|ECHO|0,3,2,2,3|4",
  "GC-T3-15|3|ECHO|4,1,4,1,1|5",
] as const);

function serializeCard(card: GemCard): string {
  return [
    card.cardId,
    card.tier,
    card.productionResource,
    GEM_BASIC_RESOURCES.map((resource) => card.cost[resource]).join(","),
    card.victoryPoints,
  ].join("|");
}

function replaceCard(
  index: number,
  replacement: GemCard,
): readonly GemCard[] {
  return GEM_CARDSET_V1.map((card, cardIndex) =>
    cardIndex === index ? replacement : card,
  );
}

test("GEM resource identifiers와 initial supply는 confirmed v1 값을 정확히 고정한다", () => {
  assert.deepEqual(GEM_BASIC_RESOURCES, [
    "DAWN",
    "TIDE",
    "GROVE",
    "EMBER",
    "ECHO",
  ]);
  assert.deepEqual(GEM_RESOURCES, [
    "DAWN",
    "TIDE",
    "GROVE",
    "EMBER",
    "ECHO",
    "PRISM",
  ]);
  assert.equal(GEM_RESOURCE_LIMIT, 9);
  assert.deepEqual(GEM_INITIAL_RESOURCE_TOTALS, {
    DAWN: 7,
    TIDE: 7,
    GROVE: 7,
    EMBER: 7,
    ECHO: 7,
    PRISM: 5,
  });
  assert.deepEqual(createInitialGemSupply(), GEM_INITIAL_RESOURCE_TOTALS);
  assert.equal(totalGemResources(createInitialGemSupply()), 40);
  assert.equal(Object.isFrozen(GEM_BASIC_RESOURCES), true);
  assert.equal(Object.isFrozen(GEM_RESOURCES), true);
  assert.equal(Object.isFrozen(GEM_INITIAL_RESOURCE_TOTALS), true);
});

test("GEM resource runtime guards는 basic과 PRISM 경계를 fail-closed한다", () => {
  for (const resource of GEM_BASIC_RESOURCES) {
    assert.equal(isGemBasicResource(resource), true);
    assert.equal(isGemResource(resource), true);
  }
  assert.equal(isGemBasicResource("PRISM"), false);
  assert.equal(isGemResource("PRISM"), true);
  for (const value of ["RED", "", null, 1]) {
    assert.equal(isGemBasicResource(value), false);
    assert.equal(isGemResource(value), false);
  }
});

test("resource count factories는 exact key, non-negative integer, detached freeze를 보장한다", () => {
  const source: Record<keyof GemResourceCounts, number> = {
    DAWN: 1,
    TIDE: 2,
    GROVE: 3,
    EMBER: 1,
    ECHO: 1,
    PRISM: 1,
  };
  const counts = createGemResourceCounts(source);
  source.DAWN = 7;

  assert.deepEqual(counts, {
    DAWN: 1,
    TIDE: 2,
    GROVE: 3,
    EMBER: 1,
    ECHO: 1,
    PRISM: 1,
  });
  assert.notEqual(counts, source);
  assert.equal(Object.isFrozen(counts), true);
  assert.deepEqual(createEmptyGemResourceCounts(), {
    DAWN: 0,
    TIDE: 0,
    GROVE: 0,
    EMBER: 0,
    ECHO: 0,
    PRISM: 0,
  });
  assert.deepEqual(createEmptyGemBasicResourceCounts(), {
    DAWN: 0,
    TIDE: 0,
    GROVE: 0,
    EMBER: 0,
    ECHO: 0,
  });

  const valid = createEmptyGemResourceCounts();
  assert.throws(
    () =>
      createGemResourceCounts({
        ...valid,
        EXTRA: 0,
      } as unknown as GemResourceCounts),
    /exactly six resources/u,
  );
  assert.throws(
    () =>
      createGemBasicResourceCounts({
        DAWN: 0,
        TIDE: 0,
        GROVE: 0,
        EMBER: 0,
      } as unknown as GemBasicResourceCounts),
    /exactly five basic resources/u,
  );
  for (const invalid of [-1, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(
      () => createGemResourceCounts({ ...valid, PRISM: invalid }),
      /non-negative safe integer/u,
    );
  }
});

test("resource conservation은 supply와 모든 player holdings의 exact totals를 검증한다", () => {
  const playerA = createGemResourceCounts({
    DAWN: 2,
    TIDE: 0,
    GROVE: 1,
    EMBER: 0,
    ECHO: 0,
    PRISM: 1,
  });
  const playerB = createGemResourceCounts({
    DAWN: 0,
    TIDE: 3,
    GROVE: 0,
    EMBER: 1,
    ECHO: 2,
    PRISM: 0,
  });
  const supply = createGemResourceCounts({
    DAWN: 5,
    TIDE: 4,
    GROVE: 6,
    EMBER: 6,
    ECHO: 5,
    PRISM: 4,
  });

  assert.doesNotThrow(() =>
    assertGemResourceConservation(supply, [playerA, playerB]),
  );
  assert.throws(
    () =>
      assertGemResourceConservation(
        createGemResourceCounts({ ...supply, DAWN: 4 }),
        [playerA, playerB],
      ),
    /DAWN resource conservation failed/u,
  );
});

test("GemCardId와 tier는 canonical stable identifier만 허용한다", () => {
  assert.deepEqual(GEM_CARD_TIERS, [1, 2, 3]);
  assert.equal(parseGemCardId("GC-T1-01"), "GC-T1-01");
  assert.equal(parseGemCardId("GC-T3-15"), "GC-T3-15");
  for (const invalid of [
    "GC-T0-01",
    "GC-T1-00",
    "GC-T1-16",
    "GC-T1-1",
    "GC-T4-15",
    "gc-t1-01",
    "SPL-T1-01",
  ]) {
    assert.throws(() => parseGemCardId(invalid));
  }

  const canonical = GEM_CARDSET_V1[0]!;
  assert.throws(
    () => createGemCard({ ...canonical, tier: 2 }),
    /ID tier must match/u,
  );
  assert.throws(
    () =>
      createGemCard({
        ...canonical,
        productionResource: "PRISM",
      } as unknown as GemCard),
    /canonical basic resource/u,
  );
  assert.throws(
    () => createGemCard({ ...canonical, victoryPoints: -1 }),
    /non-negative safe integer/u,
  );
});

test("gem-cardset-v1은 승인된 45개 card row를 순서와 값까지 고정한다", () => {
  assert.equal(GEM_CARDSET_VERSION, "gem-cardset-v1");
  assert.equal(GEM_CARDSET_V1.length, 45);
  assert.deepEqual(GEM_CARDSET_V1.map(serializeCard), CANONICAL_CARD_ROWS);
  assert.equal(new Set(GEM_CARDSET_V1.map((card) => card.cardId)).size, 45);
  assert.ok(
    GEM_CARDSET_V1.every((card) => !Object.hasOwn(card.cost, "PRISM")),
  );
});

test("gem-cardset-v1 audit은 tier/resource/point balance totals를 고정한다", () => {
  const audit = auditGemCardSet(GEM_CARDSET_V1);

  assert.deepEqual(audit, {
    cardCount: 45,
    tierCardCounts: { 1: 15, 2: 15, 3: 15 },
    tierTotalCosts: { 1: 60, 2: 100, 3: 145 },
    tierVictoryPoints: { 1: 5, 2: 30, 3: 60 },
    printedDemand: { DAWN: 61, TIDE: 61, GROVE: 61, EMBER: 61, ECHO: 61 },
    productionCounts: { DAWN: 9, TIDE: 9, GROVE: 9, EMBER: 9, ECHO: 9 },
    pointDistribution: { 0: 10, 1: 10, 2: 5, 3: 10, 4: 5, 5: 5 },
    totalVictoryPoints: 95,
  });
  assert.equal(audit.tierTotalCosts[1] / 15, 4);
  assert.equal(audit.tierTotalCosts[2] / 15, 100 / 15);
  assert.equal(audit.tierTotalCosts[3] / 15, 145 / 15);
  assert.equal(audit.tierVictoryPoints[1] / 15, 1 / 3);
  assert.equal(audit.tierVictoryPoints[2] / 15, 2);
  assert.equal(audit.tierVictoryPoints[3] / 15, 4);

  for (const tier of GEM_CARD_TIERS) {
    for (const resource of GEM_BASIC_RESOURCES) {
      assert.equal(
        GEM_CARDSET_V1.filter(
          (card) =>
            card.tier === tier && card.productionResource === resource,
        ).length,
        3,
      );
    }
  }
});

test("tier별 cost/point envelope와 unique tuple을 모두 만족한다", () => {
  const bounds = {
    1: { minCost: 3, maxCost: 5, minPoints: 0, maxPoints: 1 },
    2: { minCost: 5, maxCost: 8, minPoints: 1, maxPoints: 3 },
    3: { minCost: 8, maxCost: 11, minPoints: 3, maxPoints: 5 },
  } as const;

  for (const tier of GEM_CARD_TIERS) {
    const cards = GEM_CARDSET_V1.filter((card) => card.tier === tier);
    assert.equal(Math.min(...cards.map(totalGemCardCost)), bounds[tier].minCost);
    assert.equal(Math.max(...cards.map(totalGemCardCost)), bounds[tier].maxCost);
    assert.equal(
      Math.min(...cards.map((card) => card.victoryPoints)),
      bounds[tier].minPoints,
    );
    assert.equal(
      Math.max(...cards.map((card) => card.victoryPoints)),
      bounds[tier].maxPoints,
    );
    const tuples = cards.map(
      (card) =>
        `${GEM_BASIC_RESOURCES.map((resource) => card.cost[resource]).join(",")}|${card.productionResource}|${card.victoryPoints}`,
    );
    assert.equal(new Set(tuples).size, 15);
  }
});

test("canonical cardset과 validator output은 nested cost까지 detached deep-frozen이다", () => {
  const mutableCost = { ...GEM_CARDSET_V1[0]!.cost };
  const mutableCards = GEM_CARDSET_V1.map((card, index) =>
    index === 0 ? { ...card, cost: mutableCost } : { ...card },
  );
  const validated = validateGemCardSet(mutableCards);
  mutableCost.DAWN = 6;
  mutableCards.reverse();

  assert.deepEqual(validated.map(serializeCard), CANONICAL_CARD_ROWS);
  assert.notEqual(validated, mutableCards);
  assert.notEqual(validated[0], mutableCards[mutableCards.length - 1]);
  assert.equal(Object.isFrozen(validated), true);
  assert.ok(validated.every(Object.isFrozen));
  assert.ok(validated.every((card) => Object.isFrozen(card.cost)));
  assert.equal(Object.isFrozen(GEM_CARDSET_V1), true);
  assert.ok(GEM_CARDSET_V1.every(Object.isFrozen));
  assert.ok(GEM_CARDSET_V1.every((card) => Object.isFrozen(card.cost)));
});

test("cardset validator는 missing/duplicate/skew/envelope/duplicate tuple을 거절한다", () => {
  assert.throws(
    () => validateGemCardSet(GEM_CARDSET_V1.slice(1)),
    /exactly 45 cards/u,
  );
  assert.throws(
    () => validateGemCardSet(replaceCard(1, GEM_CARDSET_V1[0]!)),
    /card IDs must be unique/u,
  );

  const demandSkew = createGemCard({
    ...GEM_CARDSET_V1[0]!,
    cost: { ...GEM_CARDSET_V1[0]!.cost, DAWN: 1 },
  });
  assert.throws(
    () => validateGemCardSet(replaceCard(0, demandSkew)),
    /printed demand must equal 61/u,
  );

  const outsideTierEnvelope = createGemCard({
    ...GEM_CARDSET_V1[0]!,
    cost: { ...GEM_CARDSET_V1[0]!.cost, DAWN: 4 },
  });
  assert.throws(
    () => auditGemCardSet(replaceCard(0, outsideTierEnvelope)),
    /tier balance envelope/u,
  );

  const first = GEM_CARDSET_V1[0]!;
  const duplicateTuple = createGemCard({
    ...GEM_CARDSET_V1[1]!,
    productionResource: first.productionResource,
    cost: first.cost,
    victoryPoints: first.victoryPoints,
  });
  assert.throws(
    () => auditGemCardSet(replaceCard(1, duplicateTuple)),
    /must not duplicate/u,
  );
});

test("findGemCard는 exact identity lookup만 수행하고 unknown은 fallback하지 않는다", () => {
  const target = GEM_CARDSET_V1[17]!;
  const found = findGemCard(GEM_CARDSET_V1, target.cardId);
  assert.deepEqual(found, target);
  assert.notEqual(found, target);
  assert.equal(Object.isFrozen(found), true);
  assert.equal(
    findGemCard(GEM_CARDSET_V1, parseGemCardId("GC-T3-15"))?.cardId,
    "GC-T3-15",
  );
  assert.equal(
    findGemCard([], parseGemCardId("GC-T1-01")),
    undefined,
  );
});
