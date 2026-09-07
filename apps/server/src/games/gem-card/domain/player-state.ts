import {
  PlayerIdSchema,
  type PlayerId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { findGemCard } from "./cardset-v1.js";
import { parseGemCardId, type GemCard, type GemCardId } from "./card.js";
import {
  createEmptyGemBasicResourceCounts,
  createEmptyGemResourceCounts,
  createGemBasicResourceCounts,
  createGemResourceCounts,
  GEM_RESOURCE_LIMIT,
  totalGemResources,
  type GemBasicResourceCounts,
  type GemResourceCounts,
} from "./resource.js";

export type GemPlayerState = Readonly<{
  playerId: PlayerId;
  resources: GemResourceCounts;
  purchasedCardIds: readonly GemCardId[];
  reservedCardIds: readonly GemCardId[];
  forfeited: boolean;
  offlineTimeoutStreak: number;
}>;

export const GEM_SCORE_TARGET = 18;

function requireUniqueCardIds(
  cardIds: readonly GemCardId[],
  label: string,
): readonly GemCardId[] {
  const parsed = cardIds.map(parseGemCardId);
  if (new Set(parsed).size !== parsed.length) {
    throw new Error(`${label} must not contain duplicate card IDs.`);
  }
  return Object.freeze(parsed);
}

export function createGemPlayerState(
  player: GemPlayerState,
): GemPlayerState {
  const purchasedCardIds = requireUniqueCardIds(
    player.purchasedCardIds,
    "GEM purchased cards",
  );
  const reservedCardIds = requireUniqueCardIds(
    player.reservedCardIds,
    "GEM reserved cards",
  );
  if (
    purchasedCardIds.some((cardId) => reservedCardIds.includes(cardId))
  ) {
    throw new Error("A GEM card cannot be purchased and reserved simultaneously.");
  }
  if (reservedCardIds.length > 2) {
    throw new Error("A GEM player cannot reserve more than two cards.");
  }
  if (
    !Number.isSafeInteger(player.offlineTimeoutStreak) ||
    player.offlineTimeoutStreak < 0 ||
    player.offlineTimeoutStreak > 3
  ) {
    throw new RangeError("GEM offline timeout streak must be between zero and three.");
  }
  if (typeof player.forfeited !== "boolean") {
    throw new TypeError("GEM forfeited state must be boolean.");
  }
  const resources = createGemResourceCounts(player.resources);
  if (totalGemResources(resources) > GEM_RESOURCE_LIMIT) {
    throw new Error("GEM player resources exceed the hand limit.");
  }
  return Object.freeze({
    playerId: parse(PlayerIdSchema, player.playerId),
    resources,
    purchasedCardIds,
    reservedCardIds,
    forfeited: player.forfeited,
    offlineTimeoutStreak: player.offlineTimeoutStreak,
  });
}

export function createInitialGemPlayerState(
  playerId: PlayerId,
): GemPlayerState {
  return createGemPlayerState({
    playerId,
    resources: createEmptyGemResourceCounts(),
    purchasedCardIds: Object.freeze([]),
    reservedCardIds: Object.freeze([]),
    forfeited: false,
    offlineTimeoutStreak: 0,
  });
}

function requireOwnedCards(
  cardIds: readonly GemCardId[],
  cards: readonly GemCard[],
): readonly GemCard[] {
  return cardIds.map((cardId) => {
    const card = findGemCard(cards, cardId);
    if (card === undefined) {
      throw new Error("GEM player state references an unknown card.");
    }
    return card;
  });
}

export function deriveGemPermanentDiscounts(
  player: GemPlayerState,
  cards: readonly GemCard[],
): GemBasicResourceCounts {
  const discounts = {
    ...createEmptyGemBasicResourceCounts(),
  } as Record<keyof GemBasicResourceCounts, number>;
  for (const card of requireOwnedCards(player.purchasedCardIds, cards)) {
    discounts[card.productionResource] += 1;
  }
  return createGemBasicResourceCounts(discounts);
}

export function deriveGemVictoryScore(
  player: GemPlayerState,
  cards: readonly GemCard[],
): number {
  return requireOwnedCards(player.purchasedCardIds, cards).reduce(
    (score, card) => score + card.victoryPoints,
    0,
  );
}

export function hasGemPlayerReachedScoreTarget(
  player: GemPlayerState,
  cards: readonly GemCard[],
): boolean {
  return deriveGemVictoryScore(player, cards) >= GEM_SCORE_TARGET;
}

export function findGemPlayer(
  players: readonly GemPlayerState[],
  playerId: PlayerId,
): GemPlayerState | undefined {
  return players.find((player) => player.playerId === playerId);
}

export function replaceGemPlayer(
  players: readonly GemPlayerState[],
  replacement: GemPlayerState,
): readonly GemPlayerState[] {
  const replacementIndex = players.findIndex(
    (player) => player.playerId === replacement.playerId,
  );
  if (replacementIndex < 0) {
    throw new Error("Cannot replace an unknown GEM player.");
  }
  return Object.freeze(
    players.map((player, index) =>
      index === replacementIndex ? createGemPlayerState(replacement) : createGemPlayerState(player),
    ),
  );
}
