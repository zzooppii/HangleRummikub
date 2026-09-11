import { LiarPlayingProjectionSchema, LiarFinishedProjectionSchema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { LiarStoredGame } from "./adapter.js";
export function projectLiar(game: LiarStoredGame, self: PlayerId) {
  const s = game.state, p = s.players.find(p => p.playerId === self);
  if (!p) throw new Error("LIAR viewer must be a participant.");
  const base = { gameType: "LIAR_GAME", gameId: game.gameId, gameRevision: game.gameRevision, rulesVersion: s.rulesVersion,
    settings: s.settings, category: s.category, playerStates: s.players.map(p => ({ playerId: p.playerId, clue: p.clue, clueDone: p.clueDone })),
    messages: s.messages.map(m => ({ playerId: m.playerId, text: m.text, at: m.at })) };
  if (s.phase === "FINISHED") return parse(LiarFinishedProjectionSchema, { ...base, phase: "FINISHED", result: s.result });
  const identity = { playerId: self, votedFor: s.stage === "VOTE" || s.stage === "REVOTE" ? p.votedFor : null };
  return parse(LiarPlayingProjectionSchema, { ...base, phase: "PLAYING", stage: s.stage, phaseId: s.transitionId, deadlineAt: s.nextTransitionAt,
    activePlayerId: s.stage === "CLUE" ? s.players[s.clueIndex]!.playerId : s.stage === "GUESS" ? s.liarPlayerId : null,
    voteCandidates: s.stage === "VOTE" || s.stage === "REVOTE" ? s.voteCandidates : [],
    privateView: self === s.liarPlayerId ? { ...identity, role: "LIAR" } : { ...identity, role: "CITIZEN", word: s.word } });
}
