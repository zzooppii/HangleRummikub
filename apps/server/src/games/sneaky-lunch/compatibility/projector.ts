import { SneakyFinishedProjectionSchema, SneakyPlayingProjectionSchema } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { SneakyLunchStoredGame } from "./adapter.js";
export function projectSneakyLunch(game: SneakyLunchStoredGame) {
  const s = game.state;
  const base = { gameType: "SNEAKY_LUNCH", gameId: game.gameId, gameRevision: game.gameRevision, rulesVersion: s.rulesVersion,
    ...(s.placementOrder ? { placementOrder: [...s.placementOrder] } : {}),
    settings: { lunchboxCount: s.settings.lunchboxCount, difficulty: s.settings.difficulty }, requiredBites: s.requiredBites, teacherStateRevision: s.teacherStateRevision,
    playerStates: s.players.map(p => ({ playerId: p.playerId, status: p.status, completedBites: p.completedBites })) };
  if (s.phase === "FINISHED") return parse(SneakyFinishedProjectionSchema, { ...base, phase: s.phase, result: s.result });
  if (s.phase === "COUNTDOWN") return parse(SneakyPlayingProjectionSchema, { ...base, phase: s.phase, countdownEndsAt: s.nextTransitionAt });
  return parse(SneakyPlayingProjectionSchema, { ...base, phase: s.phase, teacherState: s.teacherState });
}
