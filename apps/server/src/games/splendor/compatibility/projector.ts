import {
  SplendorPlayingProjectionSchema,
  SplendorFinishedProjectionSchema,
  type PlayerId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { SplendorStoredGame } from "./adapter.js";
import { cardFor, bonusesFor, scoreFor } from "../domain/game.js";
export function projectSplendor(game: SplendorStoredGame, viewer: PlayerId) {
  const s = game.state,
    p = s.players.find((p) => p.playerId === viewer);
  if (!p) throw new Error("SPLENDOR viewer missing.");
  const base = {
    gameType: "SPLENDOR",
    gameId: game.gameId,
    gameRevision: game.gameRevision,
    rulesVersion: s.rulesVersion,
    cardSetVersion: "splendor-base-2014-v1",
    bank: { ...s.bank },
    market: s.market.map((t) => ({
      tier: t.tier,
      slots: t.slots.map((id) => (id === null ? null : cardFor(s, id))),
      deckCount: t.deck.length,
    })),
    nobles: s.nobles,
    playerStates: s.players.map((p) => ({
      playerId: p.playerId,
      tokens: { ...p.tokens },
      bonuses: bonusesFor(s, p),
      purchased: p.purchased.map((id) => cardFor(s, id)),
      reservedCount: p.reserved.length,
      nobles: p.nobles,
      score: scoreFor(s, p),
    })),
    privateState: {
      playerId: viewer,
      reserved: p.reserved.map((id) => cardFor(s, id)),
    },
    feedback: s.feedback,
    round: s.round,
    finalRound: s.finalRound,
  };
  return s.phase === "FINISHED"
    ? parse(SplendorFinishedProjectionSchema, {
        ...base,
        phase: "FINISHED",
        result: s.result,
      })
    : parse(SplendorPlayingProjectionSchema, {
        ...base,
        phase: "PLAYING",
        turnId: s.transitionId,
        activePlayerId: s.activePlayerId,
        deadlineAt: s.nextTransitionAt,
      });
}
