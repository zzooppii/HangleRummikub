import type { PlayerId } from "@hangul-rummikub/shared";

import {
  hasAnyGemLegalMainAction,
  type GemDomainResult,
} from "./actions.js";
import type { GemCard } from "./card.js";
import { createGemMarket, type GemMarket } from "./market.js";
import {
  createGemPlayerState,
  findGemPlayer,
  hasGemPlayerReachedScoreTarget,
  replaceGemPlayer,
  type GemPlayerState,
} from "./player-state.js";
import {
  createEmptyGemResourceCounts,
  createGemResourceCounts,
  GEM_INITIAL_RESOURCE_TOTALS,
  GEM_RESOURCES,
  type GemResourceCounts,
} from "./resource.js";
import {
  gemEligiblePlayerIds,
  nextGemEligiblePlayerId,
} from "./turn.js";

export type GemFairRoundFinishReason =
  | "SCORE_THRESHOLD_ROUND_END"
  | "MARKET_EXHAUSTED_ROUND_END";

export type GemPendingFairRound = Readonly<{
  reason: GemFairRoundFinishReason;
  remainingPlayerIds: readonly PlayerId[];
}>;

export type GemFinishReason =
  | GemFairRoundFinishReason
  | "NO_PROGRESS"
  | "LAST_PLAYER_STANDING";

export const GEM_FAIR_ROUND_FINISH_REASONS = Object.freeze([
  "SCORE_THRESHOLD_ROUND_END",
  "MARKET_EXHAUSTED_ROUND_END",
] as const satisfies readonly GemFairRoundFinishReason[]);

export type GemFinishDecision =
  | Readonly<{
      kind: "CONTINUE";
      pendingFairRound: GemPendingFairRound | null;
    }>
  | Readonly<{
      kind: "FINISH";
      reason: "LAST_PLAYER_STANDING";
      winnerPlayerId: PlayerId;
    }>
  | Readonly<{
      kind: "FINISH";
      reason: Exclude<GemFinishReason, "LAST_PLAYER_STANDING">;
    }>;

function forfeitedPlayerIds(
  players: readonly GemPlayerState[],
): ReadonlySet<PlayerId> {
  return new Set(
    players.filter((player) => player.forfeited).map((player) => player.playerId),
  );
}

function validatePlayers(
  turnOrder: readonly PlayerId[],
  players: readonly GemPlayerState[],
): readonly GemPlayerState[] {
  const cloned = Object.freeze(players.map(createGemPlayerState));
  if (
    cloned.length !== turnOrder.length ||
    new Set(cloned.map((player) => player.playerId)).size !== cloned.length ||
    new Set(turnOrder).size !== turnOrder.length ||
    turnOrder.some((playerId) => findGemPlayer(cloned, playerId) === undefined) ||
    cloned.some((player) => !turnOrder.includes(player.playerId))
  ) {
    throw new Error("GEM players must match the immutable turn order exactly.");
  }
  return cloned;
}

function validateNoProgressTracker(
  tracker: readonly PlayerId[],
  turnOrder: readonly PlayerId[],
): void {
  if (
    new Set(tracker).size !== tracker.length ||
    tracker.some((playerId) => !turnOrder.includes(playerId))
  ) {
    throw new Error("GEM no-progress tracker contains invalid player IDs.");
  }
}

export function resetGemNoProgressTracker(): readonly PlayerId[] {
  return Object.freeze([]);
}

export function pruneGemNoProgressTracker(
  tracker: readonly PlayerId[],
  turnOrder: readonly PlayerId[],
  players: readonly GemPlayerState[],
): readonly PlayerId[] {
  validateNoProgressTracker(tracker, turnOrder);
  const canonicalPlayers = validatePlayers(turnOrder, players);
  const eligible = gemEligiblePlayerIds(
    turnOrder,
    forfeitedPlayerIds(canonicalPlayers),
  );
  return Object.freeze(
    turnOrder.filter(
      (playerId) => eligible.includes(playerId) && tracker.includes(playerId),
    ),
  );
}

export function recordGemVerifiedYield(input: Readonly<{
  tracker: readonly PlayerId[];
  turnOrder: readonly PlayerId[];
  players: readonly GemPlayerState[];
  actorPlayerId: PlayerId;
}>): readonly PlayerId[] {
  const tracker = pruneGemNoProgressTracker(
    input.tracker,
    input.turnOrder,
    input.players,
  );
  const actor = findGemPlayer(input.players, input.actorPlayerId);
  if (actor === undefined || actor.forfeited) {
    throw new Error("Only an eligible GEM player can record verified YIELD.");
  }
  return tracker.includes(input.actorPlayerId)
    ? tracker
    : Object.freeze(
        input.turnOrder.filter(
          (playerId) => tracker.includes(playerId) || playerId === input.actorPlayerId,
        ),
      );
}

export function isGemNoProgressCycleComplete(input: Readonly<{
  tracker: readonly PlayerId[];
  turnOrder: readonly PlayerId[];
  players: readonly GemPlayerState[];
}>): boolean {
  const tracker = pruneGemNoProgressTracker(
    input.tracker,
    input.turnOrder,
    input.players,
  );
  const eligible = gemEligiblePlayerIds(
    input.turnOrder,
    forfeitedPlayerIds(input.players),
  );
  return eligible.length > 1 && eligible.every((playerId) => tracker.includes(playerId));
}

export function allEligibleGemPlayersLackMainAction(input: Readonly<{
  players: readonly GemPlayerState[];
  supply: GemResourceCounts;
  market: GemMarket;
  cards: readonly GemCard[];
}>): boolean {
  return input.players
    .filter((player) => !player.forfeited)
    .every(
      (player) =>
        !hasAnyGemLegalMainAction({
          player,
          supply: input.supply,
          market: input.market,
          cards: input.cards,
        }),
    );
}

export function isGemMarketExhausted(
  market: GemMarket,
  players: readonly GemPlayerState[],
): boolean {
  const canonicalMarket = createGemMarket(market);
  const canonicalPlayers = players.map(createGemPlayerState);
  const sourceEmpty = canonicalMarket.every(
    (tier) =>
      tier.deck.length === 0 && tier.slots.every((cardId) => cardId === null),
  );
  return (
    sourceEmpty &&
    canonicalPlayers
      .filter((player) => !player.forfeited)
      .every((player) => player.reservedCardIds.length === 0)
  );
}

function remainingAfterConsumedTurn(
  turnOrder: readonly PlayerId[],
  players: readonly GemPlayerState[],
  actorPlayerId: PlayerId,
): readonly PlayerId[] {
  validatePlayers(turnOrder, players);
  const actorIndex = turnOrder.indexOf(actorPlayerId);
  if (actorIndex < 0) throw new Error("GEM fair-round actor is not in turn order.");
  return Object.freeze(
    turnOrder
      .slice(actorIndex + 1)
      .filter((playerId) => !findGemPlayer(players, playerId)?.forfeited),
  );
}

function remainingWithoutTurnConsumption(
  turnOrder: readonly PlayerId[],
  players: readonly GemPlayerState[],
  currentActivePlayerId: PlayerId,
): readonly PlayerId[] {
  validatePlayers(turnOrder, players);
  const activeIndex = turnOrder.indexOf(currentActivePlayerId);
  if (activeIndex < 0) throw new Error("GEM active player is not in turn order.");
  return Object.freeze(
    turnOrder
      .slice(activeIndex)
      .filter((playerId) => !findGemPlayer(players, playerId)?.forfeited),
  );
}

export function startGemFairRoundAfterConsumedTurn(input: Readonly<{
  reason: GemFairRoundFinishReason;
  turnOrder: readonly PlayerId[];
  players: readonly GemPlayerState[];
  actorPlayerId: PlayerId;
}>): GemPendingFairRound {
  if (!GEM_FAIR_ROUND_FINISH_REASONS.includes(input.reason)) {
    throw new Error("GEM fair-round reason is invalid.");
  }
  return Object.freeze({
    reason: input.reason,
    remainingPlayerIds: remainingAfterConsumedTurn(
      input.turnOrder,
      input.players,
      input.actorPlayerId,
    ),
  });
}

export function startGemMarketFairRoundWithoutTurnConsumption(input: Readonly<{
  turnOrder: readonly PlayerId[];
  players: readonly GemPlayerState[];
  currentActivePlayerId: PlayerId;
}>): GemPendingFairRound {
  return Object.freeze({
    reason: "MARKET_EXHAUSTED_ROUND_END",
    remainingPlayerIds: remainingWithoutTurnConsumption(
      input.turnOrder,
      input.players,
      input.currentActivePlayerId,
    ),
  });
}

export function consumeGemPendingFairRoundTurn(
  pending: GemPendingFairRound,
  actorPlayerId: PlayerId,
): GemPendingFairRound {
  if (!GEM_FAIR_ROUND_FINISH_REASONS.includes(pending.reason)) {
    throw new Error("GEM pending fair-round reason is invalid.");
  }
  if (new Set(pending.remainingPlayerIds).size !== pending.remainingPlayerIds.length) {
    throw new Error("GEM pending fair-round players must be unique.");
  }
  const first = pending.remainingPlayerIds[0];
  if (first !== actorPlayerId) {
    throw new Error("GEM fair-round turn consumption is out of canonical order.");
  }
  return Object.freeze({
    reason: pending.reason,
    remainingPlayerIds: Object.freeze(pending.remainingPlayerIds.slice(1)),
  });
}

export function pruneGemPendingFairRound(
  pending: GemPendingFairRound,
  turnOrder: readonly PlayerId[],
  players: readonly GemPlayerState[],
): GemPendingFairRound {
  validatePlayers(turnOrder, players);
  if (!GEM_FAIR_ROUND_FINISH_REASONS.includes(pending.reason)) {
    throw new Error("GEM pending fair-round reason is invalid.");
  }
  if (
    new Set(pending.remainingPlayerIds).size !== pending.remainingPlayerIds.length ||
    pending.remainingPlayerIds.some((playerId) => !turnOrder.includes(playerId)) ||
    !turnOrder
      .filter((playerId) => pending.remainingPlayerIds.includes(playerId))
      .every((playerId, index) => playerId === pending.remainingPlayerIds[index])
  ) {
    throw new Error("GEM pending fair-round players are invalid or out of order.");
  }
  const eligible = new Set(
    players.filter((player) => !player.forfeited).map((player) => player.playerId),
  );
  return Object.freeze({
    reason: pending.reason,
    remainingPlayerIds: Object.freeze(
      pending.remainingPlayerIds.filter((playerId) => eligible.has(playerId)),
    ),
  });
}

function finishPendingOrContinue(
  pending: GemPendingFairRound,
): GemFinishDecision {
  return pending.remainingPlayerIds.length === 0
    ? Object.freeze({ kind: "FINISH", reason: pending.reason })
    : Object.freeze({ kind: "CONTINUE", pendingFairRound: pending });
}

export function evaluateGemFinishAfterConsumedTurn(input: Readonly<{
  turnOrder: readonly PlayerId[];
  players: readonly GemPlayerState[];
  actorPlayerId: PlayerId;
  existingPendingFairRound: GemPendingFairRound | null;
  supply: GemResourceCounts;
  market: GemMarket;
  cards: readonly GemCard[];
  noProgressPlayerIds: readonly PlayerId[];
}>): GemFinishDecision {
  const players = validatePlayers(input.turnOrder, input.players);
  const actor = findGemPlayer(players, input.actorPlayerId);
  if (actor === undefined) {
    throw new Error("GEM finish evaluation actor is missing.");
  }
  const eligible = gemEligiblePlayerIds(
    input.turnOrder,
    forfeitedPlayerIds(players),
  );
  if (eligible.length === 0) {
    throw new Error("GEM finish evaluation cannot have zero eligible players.");
  }
  if (eligible.length === 1) {
    const winnerPlayerId = eligible[0];
    if (winnerPlayerId === undefined) {
      throw new Error("GEM last-player-standing winner is missing.");
    }
    return Object.freeze({
      kind: "FINISH",
      reason: "LAST_PLAYER_STANDING",
      winnerPlayerId,
    });
  }
  if (input.existingPendingFairRound !== null) {
    const afterConsumedTurn = consumeGemPendingFairRoundTurn(
      input.existingPendingFairRound,
      input.actorPlayerId,
    );
    return finishPendingOrContinue(
      pruneGemPendingFairRound(afterConsumedTurn, input.turnOrder, players),
    );
  }
  if (hasGemPlayerReachedScoreTarget(actor, input.cards)) {
    return finishPendingOrContinue(
      startGemFairRoundAfterConsumedTurn({
        reason: "SCORE_THRESHOLD_ROUND_END",
        turnOrder: input.turnOrder,
        players,
        actorPlayerId: input.actorPlayerId,
      }),
    );
  }
  if (isGemMarketExhausted(input.market, players)) {
    return finishPendingOrContinue(
      startGemFairRoundAfterConsumedTurn({
        reason: "MARKET_EXHAUSTED_ROUND_END",
        turnOrder: input.turnOrder,
        players,
        actorPlayerId: input.actorPlayerId,
      }),
    );
  }
  if (
    isGemNoProgressCycleComplete({
      tracker: input.noProgressPlayerIds,
      turnOrder: input.turnOrder,
      players,
    }) &&
    allEligibleGemPlayersLackMainAction({
      players,
      supply: input.supply,
      market: input.market,
      cards: input.cards,
    })
  ) {
    return Object.freeze({ kind: "FINISH", reason: "NO_PROGRESS" });
  }
  return Object.freeze({ kind: "CONTINUE", pendingFairRound: null });
}

export function evaluateGemFinishAfterForfeit(input: Readonly<{
  turnOrder: readonly PlayerId[];
  players: readonly GemPlayerState[];
  currentActivePlayerId: PlayerId;
  existingPendingFairRound: GemPendingFairRound | null;
  supply: GemResourceCounts;
  market: GemMarket;
  cards: readonly GemCard[];
  noProgressPlayerIds: readonly PlayerId[];
}>): GemFinishDecision {
  const players = validatePlayers(input.turnOrder, input.players);
  const eligible = gemEligiblePlayerIds(
    input.turnOrder,
    forfeitedPlayerIds(players),
  );
  if (eligible.length === 0) {
    throw new Error("GEM finish evaluation cannot have zero eligible players.");
  }
  if (eligible.length === 1) {
    const winnerPlayerId = eligible[0];
    if (winnerPlayerId === undefined) {
      throw new Error("GEM last-player-standing winner is missing.");
    }
    return Object.freeze({
      kind: "FINISH",
      reason: "LAST_PLAYER_STANDING",
      winnerPlayerId,
    });
  }
  if (input.existingPendingFairRound !== null) {
    return finishPendingOrContinue(
      pruneGemPendingFairRound(
        input.existingPendingFairRound,
        input.turnOrder,
        players,
      ),
    );
  }
  if (isGemMarketExhausted(input.market, players)) {
    return finishPendingOrContinue(
      startGemMarketFairRoundWithoutTurnConsumption({
        turnOrder: input.turnOrder,
        players,
        currentActivePlayerId: input.currentActivePlayerId,
      }),
    );
  }
  if (
    isGemNoProgressCycleComplete({
      tracker: input.noProgressPlayerIds,
      turnOrder: input.turnOrder,
      players,
    }) &&
    allEligibleGemPlayersLackMainAction({
      players,
      supply: input.supply,
      market: input.market,
      cards: input.cards,
    })
  ) {
    return Object.freeze({ kind: "FINISH", reason: "NO_PROGRESS" });
  }
  return Object.freeze({ kind: "CONTINUE", pendingFairRound: null });
}

export type GemForfeitTransition = Readonly<{
  players: readonly GemPlayerState[];
  supply: GemResourceCounts;
  noProgressPlayerIds: readonly PlayerId[];
}>;

function markGemPlayerForfeited(
  player: GemPlayerState,
  resources: GemResourceCounts,
): GemPlayerState {
  return createGemPlayerState({ ...player, resources, forfeited: true });
}

function removeForfeitedTrackerEntry(
  tracker: readonly PlayerId[],
  playerId: PlayerId,
): readonly PlayerId[] {
  return Object.freeze(tracker.filter((entry) => entry !== playerId));
}

export function applyGemExplicitLeaveForfeit(input: Readonly<{
  players: readonly GemPlayerState[];
  supply: GemResourceCounts;
  noProgressPlayerIds: readonly PlayerId[];
  playerId: PlayerId;
}>): GemForfeitTransition {
  const player = findGemPlayer(input.players, input.playerId);
  if (player === undefined) throw new Error("GEM explicit leave references an unknown player.");
  if (player.forfeited) throw new Error("GEM player has already forfeited.");
  if (input.players.filter((entry) => !entry.forfeited).length <= 1) {
    throw new Error("The final eligible GEM player cannot leave after terminal state.");
  }
  const supply = { ...createGemResourceCounts(input.supply) };
  for (const resource of GEM_RESOURCES) {
    supply[resource] += player.resources[resource];
    if (supply[resource] > GEM_INITIAL_RESOURCE_TOTALS[resource]) {
      throw new Error(`GEM explicit leave overfilled ${resource} supply.`);
    }
  }
  return Object.freeze({
    players: replaceGemPlayer(
      input.players,
      markGemPlayerForfeited(player, createEmptyGemResourceCounts()),
    ),
    supply: createGemResourceCounts(supply),
    noProgressPlayerIds: removeForfeitedTrackerEntry(
      input.noProgressPlayerIds,
      input.playerId,
    ),
  });
}

export function applyGemOfflineTimeoutForfeit(input: Readonly<{
  players: readonly GemPlayerState[];
  supply: GemResourceCounts;
  noProgressPlayerIds: readonly PlayerId[];
  playerId: PlayerId;
}>): GemForfeitTransition {
  const player = findGemPlayer(input.players, input.playerId);
  if (player === undefined) throw new Error("GEM timeout forfeit references an unknown player.");
  if (player.forfeited) throw new Error("GEM player has already forfeited.");
  if (player.offlineTimeoutStreak !== 3) {
    throw new Error("GEM offline-timeout forfeit requires the third consecutive timeout.");
  }
  if (input.players.filter((entry) => !entry.forfeited).length <= 1) {
    throw new Error("The final eligible GEM player cannot forfeit after terminal state.");
  }
  return Object.freeze({
    players: replaceGemPlayer(
      input.players,
      markGemPlayerForfeited(player, player.resources),
    ),
    supply: createGemResourceCounts(input.supply),
    noProgressPlayerIds: removeForfeitedTrackerEntry(
      input.noProgressPlayerIds,
      input.playerId,
    ),
  });
}

export type GemTimeoutConsequence = "NO_ACTION_ADVANCE" | "VERIFIED_NO_PROGRESS";

export type GemTimeoutDecision = Readonly<{
  consequence: GemTimeoutConsequence;
  player: GemPlayerState;
  noProgressPlayerIds: readonly PlayerId[];
  shouldForfeitAfterAction: boolean;
}>;

export function evaluateGemTimeout(input: Readonly<{
  playerId: PlayerId;
  players: readonly GemPlayerState[];
  turnOrder: readonly PlayerId[];
  noProgressPlayerIds: readonly PlayerId[];
  supply: GemResourceCounts;
  market: GemMarket;
  cards: readonly GemCard[];
  isOffline: boolean;
}>): GemTimeoutDecision {
  const player = findGemPlayer(input.players, input.playerId);
  if (player === undefined) throw new Error("GEM timeout references an unknown player.");
  const canonicalPlayer = createGemPlayerState(player);
  if (canonicalPlayer.forfeited) throw new Error("A forfeited GEM player cannot time out.");
  if (canonicalPlayer.offlineTimeoutStreak === 3) {
    throw new Error("A third-timeout GEM player must be forfeited atomically.");
  }
  const legalMainActionExists = hasAnyGemLegalMainAction({
    player: canonicalPlayer,
    supply: input.supply,
    market: input.market,
    cards: input.cards,
  });
  let offlineTimeoutStreak = canonicalPlayer.offlineTimeoutStreak;
  if (input.isOffline) offlineTimeoutStreak += 1;
  if (offlineTimeoutStreak > 3) {
    throw new Error("GEM offline timeout streak exceeded the terminal third timeout.");
  }
  const nextPlayer = createGemPlayerState({ ...canonicalPlayer, offlineTimeoutStreak });
  const noProgressPlayerIds = legalMainActionExists
    ? resetGemNoProgressTracker()
    : recordGemVerifiedYield({
        tracker: input.noProgressPlayerIds,
        turnOrder: input.turnOrder,
        players: replaceGemPlayer(input.players, nextPlayer),
        actorPlayerId: canonicalPlayer.playerId,
      });
  return Object.freeze({
    consequence: legalMainActionExists
      ? "NO_ACTION_ADVANCE"
      : "VERIFIED_NO_PROGRESS",
    player: nextPlayer,
    noProgressPlayerIds,
    shouldForfeitAfterAction: input.isOffline && offlineTimeoutStreak === 3,
  });
}

export function resetGemOfflineTimeoutStreak(
  player: GemPlayerState,
): GemPlayerState {
  return createGemPlayerState({ ...player, offlineTimeoutStreak: 0 });
}

export type GemTimeoutTransition = Readonly<{
  consequence: GemTimeoutConsequence;
  players: readonly GemPlayerState[];
  supply: GemResourceCounts;
  noProgressPlayerIds: readonly PlayerId[];
  playerForfeitedAfterAction: boolean;
  noProgressComplete: boolean;
  nextActivePlayerId: PlayerId;
}>;

export function applyGemTimeoutRule(input: Readonly<{
  playerId: PlayerId;
  players: readonly GemPlayerState[];
  turnOrder: readonly PlayerId[];
  noProgressPlayerIds: readonly PlayerId[];
  supply: GemResourceCounts;
  market: GemMarket;
  cards: readonly GemCard[];
  isOffline: boolean;
}>): GemTimeoutTransition {
  const player = findGemPlayer(input.players, input.playerId);
  if (player === undefined) throw new Error("GEM timeout references an unknown player.");
  const decision = evaluateGemTimeout({
    playerId: player.playerId,
    players: input.players,
    turnOrder: input.turnOrder,
    noProgressPlayerIds: input.noProgressPlayerIds,
    supply: input.supply,
    market: input.market,
    cards: input.cards,
    isOffline: input.isOffline,
  });
  let players = replaceGemPlayer(input.players, decision.player);
  let noProgressPlayerIds = decision.noProgressPlayerIds;
  let supply = createGemResourceCounts(input.supply);
  if (decision.shouldForfeitAfterAction) {
    const forfeit = applyGemOfflineTimeoutForfeit({
      players,
      supply,
      noProgressPlayerIds,
      playerId: input.playerId,
    });
    players = forfeit.players;
    supply = forfeit.supply;
    noProgressPlayerIds = forfeit.noProgressPlayerIds;
  }
  const noProgressComplete =
    isGemNoProgressCycleComplete({
      tracker: noProgressPlayerIds,
      turnOrder: input.turnOrder,
      players,
    }) &&
    allEligibleGemPlayersLackMainAction({
      players,
      supply,
      market: input.market,
      cards: input.cards,
    });
  return Object.freeze({
    consequence: decision.consequence,
    players,
    supply,
    noProgressPlayerIds,
    playerForfeitedAfterAction: decision.shouldForfeitAfterAction,
    noProgressComplete,
    nextActivePlayerId: nextGemEligiblePlayerId(
      input.turnOrder,
      forfeitedPlayerIds(players),
      input.playerId,
    ),
  });
}

export type GemYieldTransition = Readonly<{
  noProgressPlayerIds: readonly PlayerId[];
  noProgressComplete: boolean;
}>;

export function applyGemYield(input: Readonly<{
  playerId: PlayerId;
  players: readonly GemPlayerState[];
  turnOrder: readonly PlayerId[];
  noProgressPlayerIds: readonly PlayerId[];
  supply: GemResourceCounts;
  market: GemMarket;
  cards: readonly GemCard[];
}>): GemDomainResult<GemYieldTransition> {
  const player = findGemPlayer(input.players, input.playerId);
  if (player === undefined) {
    throw new Error("GEM YIELD references an unknown player.");
  }
  const canonicalPlayer = createGemPlayerState(player);
  if (canonicalPlayer.forfeited) {
    return Object.freeze({ ok: false, reason: "PLAYER_FORFEITED" });
  }
  if (
    hasAnyGemLegalMainAction({
      player: canonicalPlayer,
      supply: input.supply,
      market: input.market,
      cards: input.cards,
    })
  ) {
    return Object.freeze({ ok: false, reason: "YIELD_NOT_ALLOWED" });
  }
  const noProgressPlayerIds = recordGemVerifiedYield({
    tracker: input.noProgressPlayerIds,
    turnOrder: input.turnOrder,
    players: input.players,
    actorPlayerId: canonicalPlayer.playerId,
  });
  return Object.freeze({
    ok: true,
    value: Object.freeze({
      noProgressPlayerIds,
      noProgressComplete:
        isGemNoProgressCycleComplete({
          tracker: noProgressPlayerIds,
          turnOrder: input.turnOrder,
          players: input.players,
        }) &&
        allEligibleGemPlayersLackMainAction({
          players: input.players,
          supply: input.supply,
          market: input.market,
          cards: input.cards,
        }),
    }),
  });
}
