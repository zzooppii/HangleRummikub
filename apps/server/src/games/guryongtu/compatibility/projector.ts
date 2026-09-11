import { GuryongtuPlayingProjectionSchema, GuryongtuFinishedProjectionSchema, guryongtuParity, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { GuryongtuStoredGame } from "./adapter.js";
export function projectGuryongtu(game: GuryongtuStoredGame, viewer: PlayerId) {
  const s = game.state, self = s.players.find(p => p.playerId === viewer);
  if (!self) throw new Error("Guryongtu viewer missing.");
  const submitted = s.players.find(p => p.submitted !== null);
  const base = { gameType: "GURYONGTU", gameId: game.gameId, gameRevision: game.gameRevision, rulesVersion: s.rulesVersion, round: s.round, roundId: s.roundId, attackerId: s.attackerId,
    playerStates: s.players.map(p => ({playerId: p.playerId, handCount: p.hand.length, oddCount: p.hand.filter(t => t.rank % 2).length, evenCount: p.hand.filter(t => t.rank % 2 === 0).length, wins: p.wins, matchWins: p.matchWins})),
    submitted: submitted?.submitted ? {playerId: submitted.playerId, parity: guryongtuParity(submitted.submitted.rank)} : null,
    privateState: {playerId: viewer, hand: self.hand, submitted: self.submitted, used: self.used}, history: s.history, roundResults: s.roundResults };
  if (s.phase === "FINISHED") return parse(GuryongtuFinishedProjectionSchema, {...base, phase: "FINISHED", result: s.result});
  return parse(GuryongtuPlayingProjectionSchema, s.phase === "PLAYING" ? {...base, phase: "PLAYING", stage: s.stage, turnId: s.transitionId, activePlayerId: s.activePlayerId} : {...base, phase: "ROUND_RESULT", confirmedPlayerIds: s.confirmedPlayerIds});
}
