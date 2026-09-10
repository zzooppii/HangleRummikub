import { HalliPlayingProjectionSchema, HalliFinishedProjectionSchema } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { HalliStoredGame } from "./adapter.js";
export function projectHalli(game: HalliStoredGame) {
 const s = game.state;
 const base = { gameType: "HALLI_GALLI", gameId: game.gameId, gameRevision: game.gameRevision, rulesVersion: s.rulesVersion, feedback: s.feedback,
  playerStates: s.players.map(p => { const top = p.discard.at(-1); return { playerId: p.playerId, deckCount: p.deck.length, discardCount: p.discard.length, eliminated: p.eliminated, topCard: top ? { fruit: top.fruit, count: top.count } : null }; }) };
 return s.phase === "FINISHED" ? parse(HalliFinishedProjectionSchema, { ...base, phase: "FINISHED", result: s.result }) :
  parse(HalliPlayingProjectionSchema, { ...base, phase: "PLAYING", turnId: s.transitionId, activePlayerId: s.activePlayerId, flipAvailableAt: s.flipAvailableAt, deadlineAt: s.nextTransitionAt, gameDeadlineAt: s.gameDeadlineAt });
}
