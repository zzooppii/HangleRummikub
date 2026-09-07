import { GemCardPlayingProjectionV2Schema, GemCardFinishedProjectionV2Schema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { GemGameState } from "../domain/game-state.js";
import type { GemCardId } from "../domain/card.js";
import { findGemCard } from "../domain/cardset-v1.js";
import { deriveGemPermanentDiscounts, deriveGemVictoryScore } from "../domain/player-state.js";
export function projectGemCardV2Game(input: {
  phase: "PLAYING" | "FINISHED";
  game: GemGameState;
  playerIds: readonly PlayerId[];
  selfPlayerId: PlayerId;
}) {
  const { game } = input;
  if (!input.playerIds.includes(input.selfPlayerId) || new Set(input.playerIds).size !== game.players.length || input.playerIds.length !== game.players.length || game.players.some(p => !input.playerIds.includes(p.playerId)))
    throw new Error("GEM projection player identity mismatch.");
  const card = (id: GemCardId) => {
    const value = findGemCard(game.cards, id);
    if (!value)
      throw new Error("GEM public card is missing.");
    return { cardId: value.cardId, tier: value.tier, cost: { ...value.cost }, productionResource: value.productionResource, victoryPoints: value.victoryPoints };
  };
  const common = {
    gameType: "GEM_CARD", gameId: game.gameId, gameRevision: game.gameRevision,
    rulesVersion: game.rulesVersion, cardSetVersion: game.cardSetVersion, turnOrder: [...game.turnOrder],
    supply: { ...game.supply },
    market: game.market.map(t => ({ tier: t.tier, slots: t.slots.map(id => id === null ? null : card(id)), remainingDeckCount: t.deck.length })),
    playerStates: game.players.map(p => ({ playerId: p.playerId, resources: { ...p.resources }, production: { ...deriveGemPermanentDiscounts(p, game.cards) }, purchasedCards: p.purchasedCardIds.map(card), reservedCards: p.reservedCardIds.map(card), score: deriveGemVictoryScore(p, game.cards), forfeited: p.forfeited })),
  };
  if (input.phase === "PLAYING" && game.turn !== null && game.result === null) {
    return parse(GemCardPlayingProjectionV2Schema, { ...common, turn: { ...game.turn }, fairRound: game.pendingFairRound === null ? null : { reason: game.pendingFairRound.reason } });
  }
  if (input.phase === "FINISHED" && game.turn === null && game.result !== null) {
    return parse(GemCardFinishedProjectionV2Schema, { ...common, result: { reason: game.result.reason, finishedAt: game.result.finishedAt, winnerPlayerIds: [...game.result.winnerPlayerIds], rankings: game.result.rankings.map(p => ({ ...p })) } });
  }
  throw new Error("GEM projection phase mismatch.");
}
export type GemCardV2GameProjector = typeof projectGemCardV2Game;
