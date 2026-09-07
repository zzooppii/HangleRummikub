import assert from "node:assert/strict";
import test from "node:test";

import {
  GameIdSchema,
  PlayerIdSchema,
  ServerTimeSchema,
  TurnIdSchema,
  type GameId,
  type PlayerId,
  type ServerTime,
  type TurnId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { GEM_CARDSET_V1, GEM_CARDSET_VERSION } from "./games/gem-card/domain/cardset-v1.js";
import {
  createGemCard,
  type GemCard,
  type GemCardId,
  type GemCardTier,
} from "./games/gem-card/domain/card.js";
import {
  GEM_RULES_VERSION,
  assertGemCardConservation,
  assertGemGameResourceConservation,
  createInitialGemGameState,
  type GemGameState,
} from "./games/gem-card/domain/game-state.js";
import {
  createGemMarket,
  createGemTierMarket,
  createInitialGemMarket,
  gemFaceUpCardIds,
  getGemFaceUpCardId,
  getGemTierMarket,
  isGemMarketDeckAndFaceUpEmpty,
  removeAndRefillGemMarketCard,
  type GemMarketSlots,
  type GemPreShuffledTierDecks,
} from "./games/gem-card/domain/market.js";
import {
  GEM_SCORE_TARGET,
  createGemPlayerState,
  createInitialGemPlayerState,
  deriveGemPermanentDiscounts,
  deriveGemVictoryScore,
  hasGemPlayerReachedScoreTarget,
} from "./games/gem-card/domain/player-state.js";
import {
  assertGemResourceConservation,
  createGemResourceCounts,
} from "./games/gem-card/domain/resource.js";
import {
  GEM_TURN_DURATION_MS,
  createGemTurn,
  gemEligiblePlayerIds,
  isGemActionBeforeDeadline,
  nextGemEligiblePlayerId,
  type GemTurn,
} from "./games/gem-card/domain/turn.js";

const A = parse(PlayerIdSchema, "gem-player-a");
const B = parse(PlayerIdSchema, "gem-player-b");
const C = parse(PlayerIdSchema, "gem-player-c");
const D = parse(PlayerIdSchema, "gem-player-d");
const GAME_ID = parse(GameIdSchema, "gem-game-1");
const STARTED_AT = parse(ServerTimeSchema, 100_000);

function playerIds(count: number): readonly PlayerId[] {
  return [A, B, C, D].slice(0, count);
}

function canonicalTierDecks(): GemPreShuffledTierDecks {
  return {
    1: GEM_CARDSET_V1.filter((card) => card.tier === 1).map(
      (card) => card.cardId,
    ),
    2: GEM_CARDSET_V1.filter((card) => card.tier === 2).map(
      (card) => card.cardId,
    ),
    3: GEM_CARDSET_V1.filter((card) => card.tier === 3).map(
      (card) => card.cardId,
    ),
  };
}

function initialTurn(activePlayerId: PlayerId): GemTurn {
  return {
    turnId: parse(TurnIdSchema, "gem-turn-1"),
    turnNumber: 1,
    activePlayerId,
    startedAt: STARTED_AT,
    deadlineAt: parse(
      ServerTimeSchema,
      STARTED_AT + GEM_TURN_DURATION_MS,
    ),
  };
}

function createGame(
  count = 2,
  order: readonly PlayerId[] = playerIds(count),
) {
  return createInitialGemGameState({
    gameId: GAME_ID,
    playerIds: playerIds(count),
    turnOrder: order,
    tierDecks: canonicalTierDecks(),
    initialTurn: initialTurn(order[0]!),
  });
}

function allLocatedCardIds(state: GemGameState): readonly GemCardId[] {
  return [
    ...state.market.flatMap((tier) => [
      ...tier.deck,
      ...tier.slots.filter((cardId) => cardId !== null),
    ]),
    ...state.players.flatMap((player) => [
      ...player.purchasedCardIds,
      ...player.reservedCardIds,
    ]),
  ];
}

test("initial GEM setup은 2/3/4 player와 immutable shuffled turn order를 지원한다", () => {
  for (const count of [2, 3, 4]) {
    const order = [...playerIds(count)].reverse();
    const state = createGame(count, order);

    assert.equal(state.players.length, count);
    assert.deepEqual(
      state.players.map((player) => player.playerId),
      playerIds(count),
    );
    assert.deepEqual(state.turnOrder, order);
    assert.equal(state.turn.activePlayerId, order[0]);
    assert.equal(state.turn.turnNumber, 1);
    assert.equal(state.players.every((player) => !player.forfeited), true);
  }
});

test("initial GEM state는 version/revision/target과 no-overall-deadline policy를 고정한다", () => {
  const state = createGame();

  assert.equal(GEM_RULES_VERSION, "gem-rules-v1");
  assert.equal(GEM_CARDSET_VERSION, "gem-cardset-v1");
  assert.equal(GEM_SCORE_TARGET, 18);
  assert.equal(state.gameId, GAME_ID);
  assert.equal(state.gameRevision, 0);
  assert.equal(state.rulesVersion, "gem-rules-v1");
  assert.equal(state.cardSetVersion, "gem-cardset-v1");
  assert.equal(state.cards, GEM_CARDSET_V1);
  assert.deepEqual(state.noProgressPlayerIds, []);
  assert.equal(state.pendingFairRound, null);
  assert.equal(state.result, null);
  assert.equal(Object.hasOwn(state, "gameDeadlineAt"), false);
  assert.equal(Object.hasOwn(state, "roomId"), false);
  assert.equal(Object.hasOwn(state, "presence"), false);
  assert.equal(Object.hasOwn(state, "storageRevision"), false);
});

test("initial players는 zero resources/cards/score/discount/streak으로 시작한다", () => {
  const state = createGame(4);
  const zeroCounts = {
    DAWN: 0,
    TIDE: 0,
    GROVE: 0,
    EMBER: 0,
    ECHO: 0,
    PRISM: 0,
  };

  for (const player of state.players) {
    assert.deepEqual(player.resources, zeroCounts);
    assert.deepEqual(player.purchasedCardIds, []);
    assert.deepEqual(player.reservedCardIds, []);
    assert.equal(player.forfeited, false);
    assert.equal(player.offlineTimeoutStreak, 0);
    assert.equal(deriveGemVictoryScore(player, state.cards), 0);
    assert.deepEqual(deriveGemPermanentDiscounts(player, state.cards), {
      DAWN: 0,
      TIDE: 0,
      GROVE: 0,
      EMBER: 0,
      ECHO: 0,
    });
  }
});

test("score threshold는 purchased-card points의 derived 합계 18에서 도달한다", () => {
  const below = createGemPlayerState({
    ...createInitialGemPlayerState(A),
    purchasedCardIds: [
      GEM_CARDSET_V1[32]!.cardId,
      GEM_CARDSET_V1[35]!.cardId,
      GEM_CARDSET_V1[38]!.cardId,
    ],
  });
  const reached = createGemPlayerState({
    ...below,
    purchasedCardIds: [
      ...below.purchasedCardIds,
      GEM_CARDSET_V1[30]!.cardId,
    ],
  });

  assert.equal(deriveGemVictoryScore(below, GEM_CARDSET_V1), 15);
  assert.equal(hasGemPlayerReachedScoreTarget(below, GEM_CARDSET_V1), false);
  assert.equal(deriveGemVictoryScore(reached, GEM_CARDSET_V1), 18);
  assert.equal(hasGemPlayerReachedScoreTarget(reached, GEM_CARDSET_V1), true);
});

test("initial supply와 player holdings는 canonical resource conservation을 만족한다", () => {
  const state = createGame(4);

  assert.deepEqual(state.supply, {
    DAWN: 7,
    TIDE: 7,
    GROVE: 7,
    EMBER: 7,
    ECHO: 7,
    PRISM: 5,
  });
  assert.doesNotThrow(() =>
    assertGemResourceConservation(
      state.supply,
      state.players.map((player) => player.resources),
    ),
  );
  assert.doesNotThrow(() => assertGemGameResourceConservation(state));
  assert.throws(
    () =>
      assertGemResourceConservation(
        createGemResourceCounts({ ...state.supply, PRISM: 4 }),
        state.players.map((player) => player.resources),
      ),
    /PRISM resource conservation failed/u,
  );
});

test("initial market은 tier별 3장 face-up, 12장 private deck과 stable slots를 만든다", () => {
  const decks = canonicalTierDecks();
  const market = createInitialGemMarket(decks);

  assert.equal(market.length, 3);
  assert.equal(gemFaceUpCardIds(market).length, 9);
  for (const tier of [1, 2, 3] as const) {
    const tierMarket = getGemTierMarket(market, tier);
    assert.equal(tierMarket.tier, tier);
    assert.deepEqual(tierMarket.slots, decks[tier].slice(0, 3));
    assert.deepEqual(tierMarket.deck, decks[tier].slice(3));
    assert.equal(tierMarket.deck.length, 12);
    assert.equal(getGemFaceUpCardId(market, { tier, slotIndex: 1 }), decks[tier][1]);
  }
  assert.equal(isGemMarketDeckAndFaceUpEmpty(market), false);
});

test("market removal은 같은 tier/slot을 즉시 refill하고 다른 slot/tier를 보존한다", () => {
  const market = createInitialGemMarket(canonicalTierDecks());
  const originalTier = getGemTierMarket(market, 2);
  const removed = removeAndRefillGemMarketCard(market, {
    tier: 2,
    slotIndex: 1,
  });
  assert.notEqual(removed, null);
  if (removed === null) return;

  const nextTier = getGemTierMarket(removed.market, 2);
  assert.equal(removed.removedCardId, originalTier.slots[1]);
  assert.equal(nextTier.slots[1], originalTier.deck[0]);
  assert.equal(nextTier.deck[0], originalTier.deck[1]);
  assert.equal(nextTier.deck.length, 11);
  assert.equal(nextTier.slots[0], originalTier.slots[0]);
  assert.equal(nextTier.slots[2], originalTier.slots[2]);
  assert.deepEqual(getGemTierMarket(removed.market, 1), market[0]);
  assert.deepEqual(getGemTierMarket(removed.market, 3), market[2]);
  assert.deepEqual(getGemTierMarket(market, 2), originalTier);
});

test("empty tier deck refill은 slot을 null로 남기며 compression/cross-tier fallback을 하지 않는다", () => {
  const tierOneCard = canonicalTierDecks()[1][0]!;
  const market = createGemMarket([
    createGemTierMarket({
      tier: 1,
      deck: [],
      slots: [tierOneCard, null, null],
    }),
    createGemTierMarket({ tier: 2, deck: [], slots: [null, null, null] }),
    createGemTierMarket({ tier: 3, deck: [], slots: [null, null, null] }),
  ]);
  const removed = removeAndRefillGemMarketCard(market, {
    tier: 1,
    slotIndex: 0,
  });
  assert.notEqual(removed, null);
  if (removed === null) return;

  assert.deepEqual(getGemTierMarket(removed.market, 1).slots, [null, null, null]);
  assert.equal(getGemTierMarket(removed.market, 1).deck.length, 0);
  assert.equal(isGemMarketDeckAndFaceUpEmpty(removed.market), true);
  assert.equal(
    removeAndRefillGemMarketCard(removed.market, { tier: 1, slotIndex: 0 }),
    null,
  );
});

test("initial setup은 canonical 45-card physical conservation을 만족한다", () => {
  const state = createGame(3);
  const located = allLocatedCardIds(state);

  assert.equal(state.cards.length, 45);
  assert.equal(located.length, 45);
  assert.equal(new Set(located).size, 45);
  assert.deepEqual(
    [...located].sort(),
    state.cards.map((card) => card.cardId).sort(),
  );
  assert.doesNotThrow(() => assertGemCardConservation(state));

  const missingCardState = {
    ...state,
    cards: state.cards.slice(1),
  } as GemGameState;
  assert.throws(
    () => assertGemCardConservation(missingCardState),
    /45 cards|card conservation/u,
  );

  const first = state.cards[0]!;
  const fourth = state.cards[3]!;
  const alteredCatalog = state.cards.map((card): GemCard => {
    if (card.cardId === first.cardId) {
      return createGemCard({ ...card, cost: fourth.cost });
    }
    if (card.cardId === fourth.cardId) {
      return createGemCard({ ...card, cost: first.cost });
    }
    return card;
  });
  assert.throws(
    () =>
      assertGemCardConservation({
        ...state,
        cards: alteredCatalog,
      } as GemGameState),
    /exact gem-cardset-v1 catalog/u,
  );
});

test("initial state는 caller inputs에서 detached되고 모든 nested canonical data를 freeze한다", () => {
  const mutablePlayerIds = [A, B];
  const mutableTurnOrder = [B, A];
  const mutableDecks = {
    1: [...canonicalTierDecks()[1]],
    2: [...canonicalTierDecks()[2]],
    3: [...canonicalTierDecks()[3]],
  };
  const mutableTurn = { ...initialTurn(B) };
  const state = createInitialGemGameState({
    gameId: GAME_ID,
    playerIds: mutablePlayerIds,
    turnOrder: mutableTurnOrder,
    tierDecks: mutableDecks,
    initialTurn: mutableTurn,
  });

  mutablePlayerIds.reverse();
  mutableTurnOrder.reverse();
  mutableDecks[1].reverse();
  mutableTurn.turnNumber = 9;

  assert.deepEqual(state.players.map((player) => player.playerId), [A, B]);
  assert.deepEqual(state.turnOrder, [B, A]);
  assert.equal(state.market[0].slots[0], "GC-T1-01");
  assert.equal(state.turn.turnNumber, 1);
  assert.notEqual(state.turn, mutableTurn);

  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.cards), true);
  assert.ok(state.cards.every(Object.isFrozen));
  assert.ok(state.cards.every((card) => Object.isFrozen(card.cost)));
  assert.equal(Object.isFrozen(state.market), true);
  assert.ok(state.market.every(Object.isFrozen));
  assert.ok(state.market.every((tier) => Object.isFrozen(tier.deck)));
  assert.ok(state.market.every((tier) => Object.isFrozen(tier.slots)));
  assert.equal(Object.isFrozen(state.supply), true);
  assert.equal(Object.isFrozen(state.players), true);
  assert.ok(state.players.every(Object.isFrozen));
  assert.ok(state.players.every((player) => Object.isFrozen(player.resources)));
  assert.ok(
    state.players.every((player) => Object.isFrozen(player.purchasedCardIds)),
  );
  assert.ok(
    state.players.every((player) => Object.isFrozen(player.reservedCardIds)),
  );
  assert.equal(Object.isFrozen(state.turnOrder), true);
  assert.equal(Object.isFrozen(state.noProgressPlayerIds), true);
  assert.equal(Object.isFrozen(state.turn), true);
});

test("setup은 invalid player cardinality/identity/order를 fail-closed한다", () => {
  const createWith = (
    players: readonly PlayerId[],
    order: readonly PlayerId[],
  ) =>
    createInitialGemGameState({
      gameId: GAME_ID,
      playerIds: players,
      turnOrder: order,
      tierDecks: canonicalTierDecks(),
      initialTurn: initialTurn(order[0] ?? A),
    });

  assert.throws(() => createWith([A], [A]), /two to four players/u);
  assert.throws(
    () => createWith([A, B, C, D, parse(PlayerIdSchema, "gem-player-e")], [A, B, C, D, parse(PlayerIdSchema, "gem-player-e")]),
    /two to four players/u,
  );
  assert.throws(() => createWith([A, A], [A, A]), /same unique set/u);
  assert.throws(() => createWith([A, B], [A, C]), /same unique set/u);
  assert.throws(() => createWith([A, B], [A]), /same unique set/u);
});

test("setup은 missing/duplicate/wrong-tier card deck을 fail-closed한다", () => {
  const missing = canonicalTierDecks();
  const missingDecks: GemPreShuffledTierDecks = {
    ...missing,
    1: missing[1].slice(1),
  };
  assert.throws(
    () =>
      createInitialGemGameState({
        gameId: GAME_ID,
        playerIds: [A, B],
        turnOrder: [A, B],
        tierDecks: missingDecks,
        initialTurn: initialTurn(A),
      }),
    /every canonical card exactly once/u,
  );

  const duplicate = canonicalTierDecks();
  const duplicateTierOne = [...duplicate[1]];
  duplicateTierOne[1] = duplicateTierOne[0]!;
  assert.throws(
    () =>
      createInitialGemGameState({
        gameId: GAME_ID,
        playerIds: [A, B],
        turnOrder: [A, B],
        tierDecks: { ...duplicate, 1: duplicateTierOne },
        initialTurn: initialTurn(A),
      }),
    /every canonical card exactly once/u,
  );

  const wrongTier = canonicalTierDecks();
  const tierOne = [...wrongTier[1]];
  const tierTwo = [...wrongTier[2]];
  [tierOne[0], tierTwo[0]] = [tierTwo[0]!, tierOne[0]!];
  assert.throws(
    () =>
      createInitialGemGameState({
        gameId: GAME_ID,
        playerIds: [A, B],
        turnOrder: [A, B],
        tierDecks: { 1: tierOne, 2: tierTwo, 3: wrongTier[3] },
        initialTurn: initialTurn(A),
      }),
    /another tier/u,
  );
});

test("initial turn은 first shuffled player, turn 1, exact 45 seconds만 허용한다", () => {
  const state = createGame(3, [C, A, B]);

  assert.equal(GEM_TURN_DURATION_MS, 45_000);
  assert.deepEqual(state.turn, {
    turnId: "gem-turn-1",
    turnNumber: 1,
    activePlayerId: C,
    startedAt: 100_000,
    deadlineAt: 145_000,
  });
  assert.equal(isGemActionBeforeDeadline(parse(ServerTimeSchema, 144_999), state.turn.deadlineAt), true);
  assert.equal(isGemActionBeforeDeadline(state.turn.deadlineAt, state.turn.deadlineAt), false);

  assert.throws(
    () =>
      createInitialGemGameState({
        gameId: GAME_ID,
        playerIds: [A, B],
        turnOrder: [A, B],
        tierDecks: canonicalTierDecks(),
        initialTurn: initialTurn(B),
      }),
    /first shuffled player/u,
  );
  assert.throws(
    () =>
      createInitialGemGameState({
        gameId: GAME_ID,
        playerIds: [A, B],
        turnOrder: [A, B],
        tierDecks: canonicalTierDecks(),
        initialTurn: { ...initialTurn(A), turnNumber: 2 },
      }),
    /first shuffled player/u,
  );
  assert.throws(
    () =>
      createGemTurn({
        ...initialTurn(A),
        deadlineAt: parse(ServerTimeSchema, 144_999),
      }),
    /exactly 45 seconds/u,
  );
});

test("eligible turn helper는 immutable order를 유지하며 forfeited player만 skip한다", () => {
  const order = Object.freeze([A, B, C]);

  assert.deepEqual(gemEligiblePlayerIds(order, new Set([B])), [A, C]);
  assert.equal(nextGemEligiblePlayerId(order, new Set([B]), A), C);
  assert.equal(nextGemEligiblePlayerId(order, new Set([B]), C), A);
  assert.deepEqual(order, [A, B, C]);
  assert.throws(
    () => gemEligiblePlayerIds(order, new Set([D])),
    /unknown player/u,
  );
});

test("player canonicalization은 hand/reserve/card/streak invariants와 deep freeze를 보장한다", () => {
  const initial = createInitialGemPlayerState(A);
  assert.equal(Object.isFrozen(initial), true);
  assert.equal(Object.isFrozen(initial.resources), true);
  assert.equal(Object.isFrozen(initial.purchasedCardIds), true);
  assert.equal(Object.isFrozen(initial.reservedCardIds), true);

  const resources = createGemResourceCounts({
    DAWN: 2,
    TIDE: 1,
    GROVE: 1,
    EMBER: 1,
    ECHO: 1,
    PRISM: 2,
  });
  const cardA = GEM_CARDSET_V1[0]!.cardId;
  const cardB = GEM_CARDSET_V1[1]!.cardId;
  const player = createGemPlayerState({
    ...initial,
    resources,
    purchasedCardIds: [cardA],
    reservedCardIds: [cardB],
    offlineTimeoutStreak: 2,
  });
  assert.equal(deriveGemVictoryScore(player, GEM_CARDSET_V1), 0);
  assert.deepEqual(deriveGemPermanentDiscounts(player, GEM_CARDSET_V1), {
    DAWN: 1,
    TIDE: 0,
    GROVE: 0,
    EMBER: 0,
    ECHO: 0,
  });

  assert.throws(
    () =>
      createGemPlayerState({
        ...initial,
        resources: createGemResourceCounts({
          DAWN: 7,
          TIDE: 3,
          GROVE: 0,
          EMBER: 0,
          ECHO: 0,
          PRISM: 0,
        }),
      }),
    /hand limit/u,
  );
  assert.throws(
    () =>
      createGemPlayerState({
        ...initial,
        reservedCardIds: [cardA, cardB, GEM_CARDSET_V1[2]!.cardId],
      }),
    /more than two cards/u,
  );
  assert.throws(
    () =>
      createGemPlayerState({
        ...initial,
        purchasedCardIds: [cardA],
        reservedCardIds: [cardA],
      }),
    /purchased and reserved/u,
  );
  assert.throws(
    () => createGemPlayerState({ ...initial, offlineTimeoutStreak: 4 }),
    /between zero and three/u,
  );
  assert.throws(
    () => createGemPlayerState({ ...initial, forfeited: 1 as unknown as boolean }),
    /must be boolean/u,
  );
});

test("market canonicalization은 exact tiers/slots/unique identity를 검증한다", () => {
  const decks = canonicalTierDecks();
  assert.throws(
    () =>
      createGemMarket([
        createGemTierMarket({ tier: 1, deck: [], slots: [null, null, null] }),
        createGemTierMarket({ tier: 1, deck: [], slots: [null, null, null] }),
        createGemTierMarket({ tier: 3, deck: [], slots: [null, null, null] }),
      ]),
    /exactly one state for each tier/u,
  );
  assert.throws(
    () =>
      createGemTierMarket({
        tier: 1,
        deck: [],
        slots: [decks[1][0], decks[1][0], null] as GemMarketSlots,
      }),
    /multiple market positions/u,
  );
  assert.throws(
    () =>
      createGemTierMarket({
        tier: 1,
        deck: [],
        slots: [decks[2][0]!, null, null],
      }),
    /another tier/u,
  );
  assert.throws(
    () => getGemFaceUpCardId(createInitialGemMarket(decks), { tier: 1, slotIndex: 3 as 0 }),
    /slot index/u,
  );
  assert.throws(
    () =>
      createGemTierMarket({
        tier: 1,
        deck: [decks[1][3]!],
        slots: [decks[1][0]!, null, decks[1][2]!],
      }),
    /remaining deck cards cannot contain an empty slot/u,
  );
});

test("setup runtime schemas는 malformed game/turn identity를 fail-closed한다", () => {
  assert.throws(
    () =>
      createInitialGemGameState({
        gameId: "" as GameId,
        playerIds: [A, B],
        turnOrder: [A, B],
        tierDecks: canonicalTierDecks(),
        initialTurn: initialTurn(A),
      }),
  );
  assert.throws(
    () =>
      createGemTurn({
        ...initialTurn(A),
        turnId: "" as TurnId,
      }),
  );
  assert.throws(
    () =>
      createGemTurn({
        ...initialTurn(A),
        startedAt: -1 as ServerTime,
        deadlineAt: (GEM_TURN_DURATION_MS - 1) as ServerTime,
      }),
  );
});

test("GEM domain card tiers remain exact numeric identifiers", () => {
  const tiers: readonly GemCardTier[] = stateCardTiers(createGame());
  assert.deepEqual(tiers, [1, 2, 3]);
});

function stateCardTiers(state: GemGameState): readonly GemCardTier[] {
  return Object.freeze(
    [...new Set(state.cards.map((card) => card.tier))].sort(
      (left, right) => left - right,
    ),
  );
}
