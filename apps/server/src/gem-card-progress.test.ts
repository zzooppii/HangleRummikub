import assert from "node:assert/strict";
import test from "node:test";

import {
  PlayerIdSchema,
  ServerTimeSchema,
  TurnIdSchema,
  type PlayerId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { GEM_CARDSET_V1 } from "./games/gem-card/domain/cardset-v1.js";
import { parseGemCardId } from "./games/gem-card/domain/card.js";
import {
  createGemMarket,
  type GemMarket,
} from "./games/gem-card/domain/market.js";
import {
  createGemPlayerState,
  type GemPlayerState,
} from "./games/gem-card/domain/player-state.js";
import {
  allEligibleGemPlayersLackMainAction,
  applyGemExplicitLeaveForfeit,
  applyGemOfflineTimeoutForfeit,
  applyGemTimeoutRule,
  applyGemYield,
  consumeGemPendingFairRoundTurn,
  evaluateGemFinishAfterConsumedTurn,
  evaluateGemFinishAfterForfeit,
  evaluateGemTimeout,
  isGemMarketExhausted,
  isGemNoProgressCycleComplete,
  pruneGemNoProgressTracker,
  recordGemVerifiedYield,
  resetGemNoProgressTracker,
  resetGemOfflineTimeoutStreak,
  startGemFairRoundAfterConsumedTurn,
  startGemMarketFairRoundWithoutTurnConsumption,
  type GemPendingFairRound,
} from "./games/gem-card/domain/progress.js";
import {
  createEmptyGemResourceCounts,
  createGemResourceCounts,
  type GemResourceCounts,
} from "./games/gem-card/domain/resource.js";
import {
  createGemTurn,
  gemEligiblePlayerIds,
  isGemActionBeforeDeadline,
  nextGemEligiblePlayerId,
} from "./games/gem-card/domain/turn.js";

const A = parse(PlayerIdSchema, "gem-progress-player-a");
const B = parse(PlayerIdSchema, "gem-progress-player-b");
const C = parse(PlayerIdSchema, "gem-progress-player-c");
const D = parse(PlayerIdSchema, "gem-progress-player-d");
const TURN_ORDER = Object.freeze([A, B, C]);

function resources(
  overrides: Partial<Record<keyof GemResourceCounts, number>> = {},
): GemResourceCounts {
  return createGemResourceCounts({
    DAWN: overrides.DAWN ?? 0,
    TIDE: overrides.TIDE ?? 0,
    GROVE: overrides.GROVE ?? 0,
    EMBER: overrides.EMBER ?? 0,
    ECHO: overrides.ECHO ?? 0,
    PRISM: overrides.PRISM ?? 0,
  });
}

function player(
  playerId: PlayerId,
  overrides: Partial<
    Pick<
      GemPlayerState,
      | "resources"
      | "purchasedCardIds"
      | "reservedCardIds"
      | "forfeited"
      | "offlineTimeoutStreak"
    >
  > = {},
): GemPlayerState {
  return createGemPlayerState({
    playerId,
    resources: overrides.resources ?? createEmptyGemResourceCounts(),
    purchasedCardIds: overrides.purchasedCardIds ?? Object.freeze([]),
    reservedCardIds: overrides.reservedCardIds ?? Object.freeze([]),
    forfeited: overrides.forfeited ?? false,
    offlineTimeoutStreak: overrides.offlineTimeoutStreak ?? 0,
  });
}

function players(
  overrides: Readonly<Partial<Record<"A" | "B" | "C", Partial<GemPlayerState>>>> = {},
): readonly GemPlayerState[] {
  const create = (
    playerId: PlayerId,
    key: "A" | "B" | "C",
  ): GemPlayerState => {
    const value = overrides[key];
    return player(playerId, value);
  };
  return Object.freeze([create(A, "A"), create(B, "B"), create(C, "C")]);
}

function emptyMarket(): GemMarket {
  return createGemMarket([
    { tier: 1, deck: [], slots: [null, null, null] },
    { tier: 2, deck: [], slots: [null, null, null] },
    { tier: 3, deck: [], slots: [null, null, null] },
  ]);
}

function blockedMarket(): GemMarket {
  return createGemMarket([
    {
      tier: 1,
      deck: [],
      slots: [parseGemCardId("GC-T1-15"), null, null],
    },
    { tier: 2, deck: [], slots: [null, null, null] },
    { tier: 3, deck: [], slots: [null, null, null] },
  ]);
}

function blockedPlayers(
  overrides: Readonly<Partial<Record<"A" | "B" | "C", Partial<GemPlayerState>>>> = {},
): readonly GemPlayerState[] {
  return players({
    A: {
      reservedCardIds: [
        parseGemCardId("GC-T1-01"),
        parseGemCardId("GC-T1-02"),
      ],
      ...overrides.A,
    },
    B: {
      reservedCardIds: [
        parseGemCardId("GC-T1-03"),
        parseGemCardId("GC-T1-04"),
      ],
      ...overrides.B,
    },
    C: {
      reservedCardIds: [
        parseGemCardId("GC-T1-05"),
        parseGemCardId("GC-T1-06"),
      ],
      ...overrides.C,
    },
  });
}

function playersWithScoreTarget(actorPlayerId: PlayerId): readonly GemPlayerState[] {
  const scoreCards = Object.freeze([
    parseGemCardId("GC-T3-01"),
    parseGemCardId("GC-T3-03"),
    parseGemCardId("GC-T3-06"),
    parseGemCardId("GC-T3-09"),
  ]);
  return Object.freeze(
    players().map((entry) =>
      entry.playerId === actorPlayerId
        ? createGemPlayerState({ ...entry, purchasedCardIds: scoreCards })
        : entry,
    ),
  );
}

function finishEvidence(
  overrides: Readonly<{
    supply?: GemResourceCounts;
    market?: GemMarket;
    noProgressPlayerIds?: readonly PlayerId[];
  }> = {},
) {
  return {
    supply: overrides.supply ?? resources({ DAWN: 1 }),
    market: overrides.market ?? blockedMarket(),
    cards: GEM_CARDSET_V1,
    noProgressPlayerIds: overrides.noProgressPlayerIds ?? Object.freeze([]),
  } as const;
}

function expectPending(
  decision: ReturnType<typeof evaluateGemFinishAfterConsumedTurn>,
  reason: GemPendingFairRound["reason"],
  remainingPlayerIds: readonly PlayerId[],
): GemPendingFairRound {
  assert.equal(decision.kind, "CONTINUE");
  if (decision.kind !== "CONTINUE") {
    throw new Error("Expected GEM fair round to remain pending.");
  }
  assert.ok(decision.pendingFairRound);
  assert.equal(decision.pendingFairRound.reason, reason);
  assert.deepEqual(decision.pendingFairRound.remainingPlayerIds, remainingPlayerIds);
  return decision.pendingFairRound;
}

test("verified YIELD tracker는 immutable turn order로 기록하고 full eligible cycle만 완료한다", () => {
  const canonicalPlayers = players();
  const afterA = recordGemVerifiedYield({
    tracker: [],
    turnOrder: TURN_ORDER,
    players: canonicalPlayers,
    actorPlayerId: A,
  });
  const afterB = recordGemVerifiedYield({
    tracker: afterA,
    turnOrder: TURN_ORDER,
    players: canonicalPlayers,
    actorPlayerId: B,
  });
  const afterC = recordGemVerifiedYield({
    tracker: afterB,
    turnOrder: TURN_ORDER,
    players: canonicalPlayers,
    actorPlayerId: C,
  });

  assert.deepEqual(afterA, [A]);
  assert.deepEqual(afterB, [A, B]);
  assert.deepEqual(afterC, [A, B, C]);
  assert.equal(
    isGemNoProgressCycleComplete({
      tracker: afterB,
      turnOrder: TURN_ORDER,
      players: canonicalPlayers,
    }),
    false,
  );
  assert.equal(
    isGemNoProgressCycleComplete({
      tracker: afterC,
      turnOrder: TURN_ORDER,
      players: canonicalPlayers,
    }),
    true,
  );
  assert.equal(Object.isFrozen(afterC), true);
  assert.deepEqual(
    recordGemVerifiedYield({
      tracker: afterA,
      turnOrder: TURN_ORDER,
      players: canonicalPlayers,
      actorPlayerId: A,
    }),
    [A],
  );
});

test("main action reset과 forfeit pruning은 source tracker를 변경하지 않는다", () => {
  const source = Object.freeze([A, B, C]);
  const canonicalPlayers = players({ B: { forfeited: true } });

  assert.deepEqual(resetGemNoProgressTracker(), []);
  assert.deepEqual(
    pruneGemNoProgressTracker(source, TURN_ORDER, canonicalPlayers),
    [A, C],
  );
  assert.deepEqual(source, [A, B, C]);
});

test("presence와 무관하게 non-forfeited player만 no-progress eligibility를 가진다", () => {
  const canonicalPlayers = players({ B: { forfeited: true } });
  assert.deepEqual(gemEligiblePlayerIds(TURN_ORDER, new Set([B])), [A, C]);
  assert.equal(
    isGemNoProgressCycleComplete({
      tracker: [A, C],
      turnOrder: TURN_ORDER,
      players: canonicalPlayers,
    }),
    true,
  );
});

test("all-player legal-action revalidation은 explicit leave가 반환한 supply를 반영한다", () => {
  const noActionMarket = blockedMarket();
  const noActionPlayers = blockedPlayers({
    C: { resources: resources({ GROVE: 7 }) },
  });
  assert.equal(
    allEligibleGemPlayersLackMainAction({
      players: noActionPlayers,
      supply: resources(),
      market: noActionMarket,
      cards: GEM_CARDSET_V1,
    }),
    true,
  );

  const afterLeave = applyGemExplicitLeaveForfeit({
    players: noActionPlayers,
    supply: resources(),
    noProgressPlayerIds: [A, B, C],
    playerId: C,
  });
  assert.deepEqual(afterLeave.noProgressPlayerIds, [A, B]);
  assert.equal(afterLeave.supply.GROVE, 7);
  assert.equal(
    allEligibleGemPlayersLackMainAction({
      players: afterLeave.players,
      supply: afterLeave.supply,
      market: noActionMarket,
      cards: GEM_CARDSET_V1,
    }),
    false,
  );
  const noProgressComplete =
    isGemNoProgressCycleComplete({
      tracker: afterLeave.noProgressPlayerIds,
      turnOrder: TURN_ORDER,
      players: afterLeave.players,
    }) &&
    allEligibleGemPlayersLackMainAction({
      players: afterLeave.players,
      supply: afterLeave.supply,
      market: noActionMarket,
      cards: GEM_CARDSET_V1,
    });
  assert.equal(noProgressComplete, false);
  assert.deepEqual(
    evaluateGemFinishAfterForfeit({
      turnOrder: TURN_ORDER,
      players: afterLeave.players,
      currentActivePlayerId: A,
      existingPendingFairRound: null,
      supply: afterLeave.supply,
      market: noActionMarket,
      cards: GEM_CARDSET_V1,
      noProgressPlayerIds: afterLeave.noProgressPlayerIds,
    }),
    { kind: "CONTINUE", pendingFairRound: null },
  );
});

test("combined YIELD transition은 canonical legal action이 있으면 reject하고 없을 때만 cycle을 기록한다", () => {
  const canonicalPlayers = players();
  const rejected = applyGemYield({
    playerId: B,
    players: canonicalPlayers,
    turnOrder: TURN_ORDER,
    noProgressPlayerIds: [A, C],
    supply: resources({ DAWN: 1 }),
    market: emptyMarket(),
    cards: GEM_CARDSET_V1,
  });
  assert.deepEqual(rejected, { ok: false, reason: "YIELD_NOT_ALLOWED" });

  const noActionPlayers = blockedPlayers();
  const accepted = applyGemYield({
    playerId: B,
    players: noActionPlayers,
    turnOrder: TURN_ORDER,
    noProgressPlayerIds: [A, C],
    supply: resources(),
    market: blockedMarket(),
    cards: GEM_CARDSET_V1,
  });
  assert.equal(accepted.ok, true);
  if (!accepted.ok) throw new Error("Expected verified GEM YIELD to succeed.");
  assert.deepEqual(accepted.value.noProgressPlayerIds, [A, B, C]);
  assert.equal(accepted.value.noProgressComplete, true);

  const staleTracker = applyGemYield({
    playerId: B,
    players: blockedPlayers({
      A: { reservedCardIds: [], resources: resources() },
      B: { resources: resources({ DAWN: 7, TIDE: 2 }) },
    }),
    turnOrder: TURN_ORDER,
    noProgressPlayerIds: [A, C],
    supply: resources({ DAWN: 1 }),
    market: blockedMarket(),
    cards: GEM_CARDSET_V1,
  });
  assert.equal(staleTracker.ok, true);
  if (!staleTracker.ok) throw new Error("Expected actor-local GEM YIELD to succeed.");
  assert.equal(staleTracker.value.noProgressComplete, false);
});

test("market exhaustion은 모든 source와 eligible reserve가 없을 때만 성립한다", () => {
  const empty = emptyMarket();
  const tierCard = parseGemCardId("GC-T1-01");
  const oneDeckCard = createGemMarket([
    {
      tier: 1,
      deck: [parseGemCardId("GC-T1-04")],
      slots: [
        tierCard,
        parseGemCardId("GC-T1-02"),
        parseGemCardId("GC-T1-03"),
      ],
    },
    { tier: 2, deck: [], slots: [null, null, null] },
    { tier: 3, deck: [], slots: [null, null, null] },
  ]);
  const oneFaceUpCard = createGemMarket([
    { tier: 1, deck: [], slots: [tierCard, null, null] },
    { tier: 2, deck: [], slots: [null, null, null] },
    { tier: 3, deck: [], slots: [null, null, null] },
  ]);

  assert.equal(isGemMarketExhausted(oneDeckCard, players()), false);
  assert.equal(isGemMarketExhausted(oneFaceUpCard, players()), false);
  assert.equal(
    isGemMarketExhausted(
      empty,
      players({ A: { reservedCardIds: [tierCard] } }),
    ),
    false,
  );
  assert.equal(
    isGemMarketExhausted(
      empty,
      players({ A: { reservedCardIds: [tierCard], forfeited: true } }),
    ),
    true,
  );
  assert.equal(isGemMarketExhausted(empty, players()), true);
});

test("timeout은 legal action 유무에 따라 tracker reset 또는 verified no-progress를 결정한다", () => {
  const canonicalPlayers = players();
  const withAction = evaluateGemTimeout({
    playerId: A,
    players: canonicalPlayers,
    turnOrder: TURN_ORDER,
    noProgressPlayerIds: [B],
    supply: resources({ DAWN: 1 }),
    market: emptyMarket(),
    cards: GEM_CARDSET_V1,
    isOffline: false,
  });
  const noActionPlayers = blockedPlayers();
  const withoutAction = evaluateGemTimeout({
    playerId: A,
    players: noActionPlayers,
    turnOrder: TURN_ORDER,
    noProgressPlayerIds: [B],
    supply: resources(),
    market: blockedMarket(),
    cards: GEM_CARDSET_V1,
    isOffline: false,
  });

  assert.deepEqual(withAction, {
    consequence: "NO_ACTION_ADVANCE",
    player: canonicalPlayers[0],
    noProgressPlayerIds: [],
    shouldForfeitAfterAction: false,
  });
  assert.equal(withoutAction.consequence, "VERIFIED_NO_PROGRESS");
  assert.deepEqual(withoutAction.noProgressPlayerIds, [A, B]);
  assert.equal(withoutAction.shouldForfeitAfterAction, false);
});

test("offline timeout 1/2/3은 세 번째 no-action accounting 뒤 forfeit를 지시한다", () => {
  let canonicalPlayers = blockedPlayers();
  let current = canonicalPlayers[1]!;

  for (const expectedStreak of [1, 2, 3] as const) {
    const decision = evaluateGemTimeout({
      playerId: B,
      players: canonicalPlayers,
      turnOrder: TURN_ORDER,
      noProgressPlayerIds: expectedStreak === 3 ? [A] : [],
      supply: resources(),
      market: blockedMarket(),
      cards: GEM_CARDSET_V1,
      isOffline: true,
    });
    assert.equal(decision.player.offlineTimeoutStreak, expectedStreak);
    assert.equal(decision.shouldForfeitAfterAction, expectedStreak === 3);
    if (expectedStreak === 3) {
      assert.deepEqual(decision.noProgressPlayerIds, [A, B]);
      const forfeited = applyGemOfflineTimeoutForfeit({
        players: canonicalPlayers.map((entry) =>
          entry.playerId === B ? decision.player : entry,
        ),
        supply: resources(),
        noProgressPlayerIds: decision.noProgressPlayerIds,
        playerId: B,
      });
      assert.equal(forfeited.players[1]?.forfeited, true);
      assert.deepEqual(forfeited.noProgressPlayerIds, [A]);
    }
    current = decision.player;
    canonicalPlayers = canonicalPlayers.map((entry) =>
      entry.playerId === B ? current : entry,
    );
  }

  const beforeThird = players({ B: { offlineTimeoutStreak: 2 } });
  const transition = applyGemTimeoutRule({
    playerId: B,
    players: beforeThird,
    turnOrder: TURN_ORDER,
    noProgressPlayerIds: [A],
    supply: resources(),
    market: emptyMarket(),
    cards: GEM_CARDSET_V1,
    isOffline: true,
  });
  assert.equal(transition.playerForfeitedAfterAction, true);
  assert.equal(transition.players[1]?.offlineTimeoutStreak, 3);
  assert.equal(transition.players[1]?.forfeited, true);
  assert.deepEqual(transition.noProgressPlayerIds, [A]);
  assert.equal(transition.noProgressComplete, false);

  const twoPlayerOrder = Object.freeze([A, B]);
  const twoPlayerTransition = applyGemTimeoutRule({
    playerId: B,
    players: Object.freeze([player(A), player(B, { offlineTimeoutStreak: 2 })]),
    turnOrder: twoPlayerOrder,
    noProgressPlayerIds: [A],
    supply: resources(),
    market: emptyMarket(),
    cards: GEM_CARDSET_V1,
    isOffline: true,
  });
  assert.deepEqual(
    evaluateGemFinishAfterConsumedTurn({
      turnOrder: twoPlayerOrder,
      players: twoPlayerTransition.players,
      actorPlayerId: B,
      existingPendingFairRound: {
        reason: "MARKET_EXHAUSTED_ROUND_END",
        remainingPlayerIds: [A],
      },
      ...finishEvidence({
        supply: resources(),
        market: emptyMarket(),
        noProgressPlayerIds: [A],
      }),
    }),
    { kind: "FINISH", reason: "LAST_PLAYER_STANDING", winnerPlayerId: A },
  );
});

test("connected timeout은 streak을 증가시키지 않고 resume helper는 streak을 reset한다", () => {
  const actor = player(A, { offlineTimeoutStreak: 2 });
  const canonicalPlayers = Object.freeze([actor, player(B)]);
  const decision = evaluateGemTimeout({
    playerId: A,
    players: canonicalPlayers,
    turnOrder: [A, B],
    noProgressPlayerIds: [],
    supply: resources({ DAWN: 1 }),
    market: emptyMarket(),
    cards: GEM_CARDSET_V1,
    isOffline: false,
  });

  assert.equal(decision.player.offlineTimeoutStreak, 2);
  assert.equal(resetGemOfflineTimeoutStreak(decision.player).offlineTimeoutStreak, 0);
  assert.equal(actor.offlineTimeoutStreak, 2);
});

test("explicit leave는 resources만 supply로 반환하고 cards와 score source를 동결한다", () => {
  const purchased = parseGemCardId("GC-T3-03");
  const reserved = parseGemCardId("GC-T2-01");
  const sourcePlayers = Object.freeze([
    player(A),
    player(B, {
      resources: resources({ DAWN: 2, PRISM: 1 }),
      purchasedCardIds: [purchased],
      reservedCardIds: [reserved],
    }),
  ]);
  const sourceSupply = resources({ DAWN: 5, PRISM: 4 });
  const transition = applyGemExplicitLeaveForfeit({
    players: sourcePlayers,
    supply: sourceSupply,
    noProgressPlayerIds: [A, B],
    playerId: B,
  });
  const leaver = transition.players[1]!;

  assert.equal(transition.supply.DAWN, 7);
  assert.equal(transition.supply.PRISM, 5);
  assert.deepEqual(leaver.resources, resources());
  assert.deepEqual(leaver.purchasedCardIds, [purchased]);
  assert.deepEqual(leaver.reservedCardIds, [reserved]);
  assert.equal(leaver.forfeited, true);
  assert.deepEqual(transition.noProgressPlayerIds, [A]);
  assert.equal(sourcePlayers[1]?.resources.DAWN, 2);
  assert.equal(sourceSupply.DAWN, 5);
  assert.deepEqual(
    evaluateGemFinishAfterForfeit({
      turnOrder: [A, B],
      players: transition.players,
      currentActivePlayerId: A,
      existingPendingFairRound: null,
      supply: transition.supply,
      market: emptyMarket(),
      cards: GEM_CARDSET_V1,
      noProgressPlayerIds: transition.noProgressPlayerIds,
    }),
    { kind: "FINISH", reason: "LAST_PLAYER_STANDING", winnerPlayerId: A },
  );
});

test("offline-timeout forfeit는 explicit leave와 달리 resources를 player에게 동결한다", () => {
  const held = resources({ DAWN: 2, PRISM: 1 });
  const sourcePlayers = Object.freeze([
    player(A),
    player(B, {
      resources: held,
      purchasedCardIds: [parseGemCardId("GC-T3-03")],
      reservedCardIds: [parseGemCardId("GC-T2-01")],
      offlineTimeoutStreak: 3,
    }),
  ]);
  const sourceSupply = resources({ DAWN: 5, PRISM: 4 });
  const transition = applyGemOfflineTimeoutForfeit({
    players: sourcePlayers,
    supply: sourceSupply,
    noProgressPlayerIds: [A, B],
    playerId: B,
  });

  assert.deepEqual(transition.players[1]?.resources, held);
  assert.deepEqual(transition.players[1]?.purchasedCardIds, [
    parseGemCardId("GC-T3-03"),
  ]);
  assert.deepEqual(transition.players[1]?.reservedCardIds, [
    parseGemCardId("GC-T2-01"),
  ]);
  assert.deepEqual(transition.supply, sourceSupply);
  assert.equal(transition.players[1]?.forfeited, true);
  assert.deepEqual(transition.noProgressPlayerIds, [A]);
  assert.throws(
    () =>
      applyGemOfflineTimeoutForfeit({
        players: Object.freeze([
          player(A),
          player(B, { offlineTimeoutStreak: 2 }),
        ]),
        supply: sourceSupply,
        noProgressPlayerIds: [],
        playerId: B,
      }),
    /requires the third consecutive timeout/u,
  );
});

test("turn helper는 forfeited player만 건너뛰고 45초 deadline equality를 expired로 본다", () => {
  assert.deepEqual(gemEligiblePlayerIds(TURN_ORDER, new Set([B])), [A, C]);
  assert.equal(nextGemEligiblePlayerId(TURN_ORDER, new Set([B]), A), C);
  assert.equal(nextGemEligiblePlayerId(TURN_ORDER, new Set([B]), C), A);
  assert.equal(nextGemEligiblePlayerId(TURN_ORDER, new Set([B]), B), C);

  const turn = createGemTurn({
    turnId: parse(TurnIdSchema, "gem-progress-turn-1"),
    turnNumber: 1,
    activePlayerId: A,
    startedAt: parse(ServerTimeSchema, 10_000),
    deadlineAt: parse(ServerTimeSchema, 55_000),
  });
  assert.equal(isGemActionBeforeDeadline(parse(ServerTimeSchema, 54_999), turn.deadlineAt), true);
  assert.equal(isGemActionBeforeDeadline(parse(ServerTimeSchema, 55_000), turn.deadlineAt), false);
  assert.throws(
    () => nextGemEligiblePlayerId(TURN_ORDER, new Set(), D),
    /not in turn order/u,
  );
});

test("A/B/C score threshold trigger는 immutable cycle boundary 전에 정확히 종료한다", () => {
  const afterAPlayers = playersWithScoreTarget(A);

  const afterA = expectPending(
    evaluateGemFinishAfterConsumedTurn({
      turnOrder: TURN_ORDER,
      players: afterAPlayers,
      actorPlayerId: A,
      existingPendingFairRound: null,
      ...finishEvidence(),
    }),
    "SCORE_THRESHOLD_ROUND_END",
    [B, C],
  );
  const afterB = expectPending(
    evaluateGemFinishAfterConsumedTurn({
      turnOrder: TURN_ORDER,
      players: afterAPlayers,
      actorPlayerId: B,
      existingPendingFairRound: afterA,
      ...finishEvidence({
        supply: resources(),
        market: emptyMarket(),
        noProgressPlayerIds: [A, B, C],
      }),
    }),
    "SCORE_THRESHOLD_ROUND_END",
    [C],
  );
  assert.deepEqual(
    evaluateGemFinishAfterConsumedTurn({
      turnOrder: TURN_ORDER,
      players: afterAPlayers,
      actorPlayerId: C,
      existingPendingFairRound: afterB,
      ...finishEvidence(),
    }),
    { kind: "FINISH", reason: "SCORE_THRESHOLD_ROUND_END" },
  );

  const afterBPlayers = playersWithScoreTarget(B);
  const afterBTrigger = expectPending(
    evaluateGemFinishAfterConsumedTurn({
      turnOrder: TURN_ORDER,
      players: afterBPlayers,
      actorPlayerId: B,
      existingPendingFairRound: null,
      ...finishEvidence(),
    }),
    "SCORE_THRESHOLD_ROUND_END",
    [C],
  );
  assert.deepEqual(
    evaluateGemFinishAfterConsumedTurn({
      turnOrder: TURN_ORDER,
      players: afterBPlayers,
      actorPlayerId: C,
      existingPendingFairRound: afterBTrigger,
      ...finishEvidence(),
    }),
    { kind: "FINISH", reason: "SCORE_THRESHOLD_ROUND_END" },
  );

  assert.deepEqual(
    evaluateGemFinishAfterConsumedTurn({
      turnOrder: TURN_ORDER,
      players: playersWithScoreTarget(C),
      actorPlayerId: C,
      existingPendingFairRound: null,
      ...finishEvidence(),
    }),
    { kind: "FINISH", reason: "SCORE_THRESHOLD_ROUND_END" },
  );
});

test("fair-round queue는 forfeited player를 skip하고 out-of-turn trigger는 current turn을 포함한다", () => {
  const canonicalPlayers = players({ B: { forfeited: true } });
  assert.deepEqual(
    startGemFairRoundAfterConsumedTurn({
      reason: "MARKET_EXHAUSTED_ROUND_END",
      turnOrder: TURN_ORDER,
      players: canonicalPlayers,
      actorPlayerId: A,
    }),
    { reason: "MARKET_EXHAUSTED_ROUND_END", remainingPlayerIds: [C] },
  );
  assert.deepEqual(
    startGemMarketFairRoundWithoutTurnConsumption({
      turnOrder: TURN_ORDER,
      players: canonicalPlayers,
      currentActivePlayerId: A,
    }),
    { reason: "MARKET_EXHAUSTED_ROUND_END", remainingPlayerIds: [A, C] },
  );
});

test("fair-round consumption은 canonical queue 순서를 강제한다", () => {
  const pending = startGemFairRoundAfterConsumedTurn({
    reason: "SCORE_THRESHOLD_ROUND_END",
    turnOrder: TURN_ORDER,
    players: players(),
    actorPlayerId: A,
  });
  assert.deepEqual(consumeGemPendingFairRoundTurn(pending, B), {
    reason: "SCORE_THRESHOLD_ROUND_END",
    remainingPlayerIds: [C],
  });
  assert.throws(
    () => consumeGemPendingFairRoundTurn(pending, C),
    /out of canonical order/u,
  );
  assert.throws(
    () =>
      consumeGemPendingFairRoundTurn(
        {
          reason: "SCORE_THRESHOLD_ROUND_END",
          remainingPlayerIds: [B, B],
        },
        B,
      ),
    /must be unique/u,
  );
});

test("pending fair-round의 세 번째 offline timeout은 turn을 소비한 뒤 actor를 prune한다", () => {
  const timeoutTransition = applyGemTimeoutRule({
    playerId: B,
    players: players({ B: { offlineTimeoutStreak: 2 } }),
    turnOrder: TURN_ORDER,
    noProgressPlayerIds: [],
    supply: resources(),
    market: emptyMarket(),
    cards: GEM_CARDSET_V1,
    isOffline: true,
  });
  assert.deepEqual(
    evaluateGemFinishAfterConsumedTurn({
      turnOrder: TURN_ORDER,
      players: timeoutTransition.players,
      actorPlayerId: B,
      existingPendingFairRound: {
        reason: "SCORE_THRESHOLD_ROUND_END",
        remainingPlayerIds: [B, C],
      },
      ...finishEvidence(),
    }),
    {
      kind: "CONTINUE",
      pendingFairRound: {
        reason: "SCORE_THRESHOLD_ROUND_END",
        remainingPlayerIds: [C],
      },
    },
  );

  const fourPlayerOrder = Object.freeze([A, B, C, D]);
  const lastPendingTimeout = applyGemTimeoutRule({
    playerId: D,
    players: Object.freeze([
      player(A),
      player(B),
      player(C),
      player(D, { offlineTimeoutStreak: 2 }),
    ]),
    turnOrder: fourPlayerOrder,
    noProgressPlayerIds: [],
    supply: resources(),
    market: emptyMarket(),
    cards: GEM_CARDSET_V1,
    isOffline: true,
  });
  assert.deepEqual(
    evaluateGemFinishAfterConsumedTurn({
      turnOrder: fourPlayerOrder,
      players: lastPendingTimeout.players,
      actorPlayerId: D,
      existingPendingFairRound: {
        reason: "SCORE_THRESHOLD_ROUND_END",
        remainingPlayerIds: [D],
      },
      ...finishEvidence(),
    }),
    { kind: "FINISH", reason: "SCORE_THRESHOLD_ROUND_END" },
  );
});

test("finish precedence는 LAST_PLAYER_STANDING, existing pending, score, market, no-progress 순이다", () => {
  const lpsPlayers = players({ B: { forfeited: true }, C: { forfeited: true } });
  assert.deepEqual(
    evaluateGemFinishAfterConsumedTurn({
      turnOrder: TURN_ORDER,
      players: lpsPlayers,
      actorPlayerId: A,
      existingPendingFairRound: {
        reason: "MARKET_EXHAUSTED_ROUND_END",
        remainingPlayerIds: [A],
      },
      ...finishEvidence({
        supply: resources(),
        market: emptyMarket(),
        noProgressPlayerIds: [A],
      }),
    }),
    { kind: "FINISH", reason: "LAST_PLAYER_STANDING", winnerPlayerId: A },
  );

  const scoreWins = evaluateGemFinishAfterConsumedTurn({
    turnOrder: TURN_ORDER,
    players: playersWithScoreTarget(B),
    actorPlayerId: B,
    existingPendingFairRound: null,
    ...finishEvidence({
      supply: resources(),
      market: emptyMarket(),
      noProgressPlayerIds: [A, B, C],
    }),
  });
  expectPending(scoreWins, "SCORE_THRESHOLD_ROUND_END", [C]);

  const marketWins = evaluateGemFinishAfterConsumedTurn({
    turnOrder: TURN_ORDER,
    players: players(),
    actorPlayerId: B,
    existingPendingFairRound: null,
    ...finishEvidence({
      supply: resources(),
      market: emptyMarket(),
      noProgressPlayerIds: [A, B, C],
    }),
  });
  expectPending(marketWins, "MARKET_EXHAUSTED_ROUND_END", [C]);

  assert.deepEqual(
    evaluateGemFinishAfterConsumedTurn({
      turnOrder: TURN_ORDER,
      players: blockedPlayers(),
      actorPlayerId: B,
      existingPendingFairRound: null,
      ...finishEvidence({
        supply: resources(),
        market: blockedMarket(),
        noProgressPlayerIds: [A, B, C],
      }),
    }),
    { kind: "FINISH", reason: "NO_PROGRESS" },
  );
});

test("forfeit finish evaluation은 LPS를 우선하고 market trigger에서 current turn을 소비하지 않는다", () => {
  assert.deepEqual(
    evaluateGemFinishAfterForfeit({
      turnOrder: TURN_ORDER,
      players: players({ C: { forfeited: true } }),
      currentActivePlayerId: A,
      existingPendingFairRound: null,
      ...finishEvidence({
        supply: resources(),
        market: emptyMarket(),
        noProgressPlayerIds: [A, B],
      }),
    }),
    {
      kind: "CONTINUE",
      pendingFairRound: {
        reason: "MARKET_EXHAUSTED_ROUND_END",
        remainingPlayerIds: [A, B],
      },
    },
  );

  assert.deepEqual(
    evaluateGemFinishAfterForfeit({
      turnOrder: TURN_ORDER,
      players: players({ B: { forfeited: true }, C: { forfeited: true } }),
      currentActivePlayerId: A,
      existingPendingFairRound: null,
      ...finishEvidence({
        supply: resources(),
        market: emptyMarket(),
        noProgressPlayerIds: [A],
      }),
    }),
    { kind: "FINISH", reason: "LAST_PLAYER_STANDING", winnerPlayerId: A },
  );
});
