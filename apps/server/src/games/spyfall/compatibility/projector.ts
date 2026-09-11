import { SpyfallPlayingProjectionSchema, SpyfallFinishedProjectionSchema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { SpyfallStoredGame } from "./adapter.js";
export function projectSpyfall(game: SpyfallStoredGame, self: PlayerId) {
  const s = game.state, p = s.players.find(p => p.playerId === self);
  if (!p) throw new Error("SPYFALL viewer must be a participant.");
  const base = { gameType: "SPYFALL", gameId: game.gameId, gameRevision: game.gameRevision, rulesVersion: s.rulesVersion, settings: s.settings,
    playerStates: s.players.map(p => ({ playerId: p.playerId, accusationUsed: p.accusationUsed })), history: s.history.map(h => ({ ...h })) };
  if (s.phase === "FINISHED") return parse(SpyfallFinishedProjectionSchema, { ...base, phase: "FINISHED", result: s.result });
  const identity = { playerId: self, vote: s.stage === "ACCUSATION" ? p.vote : null };
  return parse(SpyfallPlayingProjectionSchema, { ...base, phase: "PLAYING", stage: s.stage, phaseId: s.transitionId, deadlineAt: s.nextTransitionAt,
    roundDeadlineAt: s.roundDeadlineAt, remainingMs: s.remainingMs, questionerId: s.questionerId, previousQuestionerId: s.previousQuestionerId, respondentId: s.respondentId,
    accuserId: s.accuserId, suspectId: s.suspectId, finalAccuserId: s.finalIndex >= 0 ? s.players[s.finalIndex]?.playerId ?? null : null,
    revealedSpyId: s.stage === "GUESS" ? s.spyPlayerId : null,
    privateView: self === s.spyPlayerId ? { ...identity, role: "SPY" } : { ...identity, role: "CITIZEN", location: s.location, job: p.job } });
}
