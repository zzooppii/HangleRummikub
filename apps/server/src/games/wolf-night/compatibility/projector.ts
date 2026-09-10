import { WolfPlayingProjectionSchema, WolfFinishedProjectionSchema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { actionRole, canPass } from "../domain/game.js";
import type { WolfStoredGame } from "./adapter.js";
export function projectWolf(game: WolfStoredGame, self: PlayerId) {
  const s = game.state, p = s.players.find(p => p.playerId === self);
  if (!p) throw new Error("WOLF viewer must be a participant.");
  const base = { gameType: "WOLF_NIGHT", gameId: game.gameId, gameRevision: game.gameRevision, rulesVersion: s.rulesVersion,
    settings: s.settings, deck: [...s.deck].sort(), playerStates: s.players.map(p => ({ playerId: p.playerId })), messages: s.messages };
  if (s.phase === "FINISHED") return parse(WolfFinishedProjectionSchema, { ...base, phase: "FINISHED", result: s.result });
  const role = actionRole(s, p);
  return parse(WolfPlayingProjectionSchema, { ...base, phase: "PLAYING", stage: s.stage, phaseId: s.transitionId, deadlineAt: s.nextTransitionAt,
    privateView: { playerId: self, originalRole: p.originalRole, copiedRole: p.copiedRole, actionRole: role, actionRevision: p.actionRevision,
      canPass: canPass(role), loneWolf: role === "WEREWOLF", observations: p.observations, votedFor: p.votedFor } });
}
