import {
  GameIdSchema,
  GameRevisionSchema,
  PlayerIdSchema,
  type GameId,
  type GameRevision,
  type PlayerId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  GEM_CARDSET_V1,
  GEM_CARDSET_VERSION,
  validateGemCardSet,
} from "./cardset-v1.js";
import type { GemCard, GemCardId } from "./card.js";
import {
  createInitialGemMarket,
  type GemMarket,
  type GemPreShuffledTierDecks,
} from "./market.js";
import {
  createInitialGemPlayerState,
  type GemPlayerState,
} from "./player-state.js";
import type { GemPendingFairRound } from "./progress.js";
import type { GemGameResult } from "./result-engine.js";
import {
  assertGemResourceConservation,
  createInitialGemSupply,
  GEM_BASIC_RESOURCES,
  type GemResourceCounts,
} from "./resource.js";
import { createGemTurn, type GemTurn } from "./turn.js";

export const GEM_RULES_VERSION = "gem-rules-v1";

type GemGameStateBase = Readonly<{
  gameId: GameId;
  gameRevision: GameRevision;
  rulesVersion: typeof GEM_RULES_VERSION;
  cardSetVersion: typeof GEM_CARDSET_VERSION;
  cards: readonly GemCard[];
  market: GemMarket;
  supply: GemResourceCounts;
  players: readonly GemPlayerState[];
  turnOrder: readonly PlayerId[];
  noProgressPlayerIds: readonly PlayerId[];
  pendingFairRound: GemPendingFairRound | null;
}>;

export type PlayingGemGameState = GemGameStateBase &
  Readonly<{
    turn: GemTurn;
    result: null;
  }>;

export type FinishedGemGameState = GemGameStateBase &
  Readonly<{
    turn: null;
    result: GemGameResult;
  }>;

export type GemGameState = PlayingGemGameState | FinishedGemGameState;

function validateInitialDecks(tierDecks: GemPreShuffledTierDecks): void {
  const suppliedIds = [1, 2, 3].flatMap((tier) =>
    tierDecks[tier as 1 | 2 | 3],
  );
  const canonicalIds = GEM_CARDSET_V1.map((card) => card.cardId);
  if (
    suppliedIds.length !== canonicalIds.length ||
    new Set(suppliedIds).size !== suppliedIds.length ||
    canonicalIds.some((cardId) => !suppliedIds.includes(cardId))
  ) {
    throw new Error("Initial GEM tier decks must contain every canonical card exactly once.");
  }
}

export function createInitialGemGameState(input: Readonly<{
  gameId: GameId;
  playerIds: readonly PlayerId[];
  turnOrder: readonly PlayerId[];
  tierDecks: GemPreShuffledTierDecks;
  initialTurn: GemTurn;
}>): PlayingGemGameState {
  const playerIds = Object.freeze(
    input.playerIds.map((playerId) => parse(PlayerIdSchema, playerId)),
  );
  const turnOrder = Object.freeze(
    input.turnOrder.map((playerId) => parse(PlayerIdSchema, playerId)),
  );
  if (playerIds.length < 2 || playerIds.length > 4) {
    throw new Error("GEM game requires two to four players.");
  }
  if (
    new Set(playerIds).size !== playerIds.length ||
    turnOrder.length !== playerIds.length ||
    new Set(turnOrder).size !== turnOrder.length ||
    playerIds.some((playerId) => !turnOrder.includes(playerId))
  ) {
    throw new Error("GEM player IDs and turn order must be the same unique set.");
  }
  const turn = createGemTurn(input.initialTurn);
  if (turn.activePlayerId !== turnOrder[0] || turn.turnNumber !== 1) {
    throw new Error("Initial GEM turn must begin with the first shuffled player.");
  }
  validateInitialDecks(input.tierDecks);
  return Object.freeze({
    gameId: parse(GameIdSchema, input.gameId),
    gameRevision: parse(GameRevisionSchema, 0),
    rulesVersion: GEM_RULES_VERSION,
    cardSetVersion: GEM_CARDSET_VERSION,
    cards: GEM_CARDSET_V1,
    market: createInitialGemMarket(input.tierDecks),
    supply: createInitialGemSupply(),
    players: Object.freeze(playerIds.map(createInitialGemPlayerState)),
    turnOrder,
    noProgressPlayerIds: Object.freeze([]),
    pendingFairRound: null,
    turn,
    result: null,
  });
}

export function assertGemCardConservation(state: GemGameState): void {
  const cards = validateGemCardSet(state.cards);
  for (const canonicalCard of GEM_CARDSET_V1) {
    const candidate = cards.find((card) => card.cardId === canonicalCard.cardId);
    if (
      candidate === undefined ||
      candidate.tier !== canonicalCard.tier ||
      candidate.productionResource !== canonicalCard.productionResource ||
      candidate.victoryPoints !== canonicalCard.victoryPoints ||
      GEM_BASIC_RESOURCES.some(
        (resource) => candidate.cost[resource] !== canonicalCard.cost[resource],
      )
    ) {
      throw new Error("GEM game state must use the exact gem-cardset-v1 catalog.");
    }
  }
  const locatedCardIds: GemCardId[] = [];
  for (const tier of state.market) {
    locatedCardIds.push(...tier.deck);
    locatedCardIds.push(
      ...tier.slots.filter((cardId) => cardId !== null),
    );
  }
  for (const player of state.players) {
    locatedCardIds.push(...player.purchasedCardIds, ...player.reservedCardIds);
  }
  if (
    locatedCardIds.length !== cards.length ||
    new Set(locatedCardIds).size !== cards.length ||
    cards.some((card) => !locatedCardIds.includes(card.cardId))
  ) {
    throw new Error("GEM canonical card conservation failed.");
  }
}

export function assertGemGameResourceConservation(state: GemGameState): void {
  assertGemResourceConservation(
    state.supply,
    state.players.map((player) => player.resources),
  );
}
