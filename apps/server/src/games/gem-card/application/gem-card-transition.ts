import { RoomRevisionSchema, ServerTimeSchema, type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { nextGameRevision } from "../../../domain/game-revision.js";
import type { GemCardRoomRecord, RoomWriteCandidate } from "../../../model/persistence.js";
import type { IdGenerator } from "../../../ports/system.js";
import type { PlayingGemGameState } from "../domain/game-state.js";
import { createGemTurn, GEM_TURN_DURATION_MS, nextGemEligiblePlayerId } from "../domain/turn.js";
import type { GemFinishDecision } from "../domain/progress.js";
import { createGemGameResult } from "../domain/result-engine.js";
export function nextGemTurn(game: PlayingGemGameState, at: ServerTime, ids: Pick<IdGenerator, "generateTurnId">) {
  const forfeited = new Set(game.players.filter(p => p.forfeited).map(p => p.playerId));
  return createGemTurn({ turnId: ids.generateTurnId(), turnNumber: game.turn.turnNumber + 1,
    activePlayerId: nextGemEligiblePlayerId(game.turnOrder, forfeited, game.turn.activePlayerId),
    startedAt: at, deadlineAt: parse(ServerTimeSchema, at + GEM_TURN_DURATION_MS) });
}
/** One concrete GEM gameplay candidate; never commits an intermediate timeout/forfeit. */
export function transitionGemRoom(room: GemCardRoomRecord, base: PlayingGemGameState, finish: GemFinishDecision, at: ServerTime, ids: Pick<IdGenerator, "generateTurnId">, consumedTurn: boolean): RoomWriteCandidate & {
  gameType: "GEM_CARD";
} {
  const gameRevision = nextGameRevision(base.gameRevision);
  if (finish.kind === "FINISH") {
    const result = createGemGameResult({ reason: finish.reason, finishedAt: at, players: base.players, cards: base.cards });
    return Object.freeze({ ...room, phase: "FINISHED", roomRevision: parse(RoomRevisionSchema, room.roomRevision + 1), updatedAt: at,
      game: Object.freeze({ ...base, gameRevision, pendingFairRound: null, turn: null, result }) });
  }
  const activeForfeited = base.players.some(p => p.playerId === base.turn.activePlayerId && p.forfeited);
  const turn = consumedTurn || activeForfeited ? nextGemTurn(base, at, ids) : base.turn;
  return Object.freeze({ ...room, updatedAt: at, game: Object.freeze({ ...base, gameRevision, pendingFairRound: finish.pendingFairRound, turn }) });
}
