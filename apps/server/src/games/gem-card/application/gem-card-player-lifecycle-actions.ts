import type { GameId, GameRevision, PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { CurrentTurnIdentity } from "../../../application/turn-transition.js";
import type { RoomRecord, RoomWriteCandidate } from "../../../model/persistence.js";
import type { IdGenerator } from "../../../ports/system.js";
import type { PlayingGemGameState } from "../domain/game-state.js";
import { replaceGemPlayer } from "../domain/player-state.js";
import { applyGemExplicitLeaveForfeit, evaluateGemFinishAfterForfeit, resetGemOfflineTimeoutStreak } from "../domain/progress.js";
import { asGemPlayingRoom } from "./gem-card-command-service.js";
import { transitionGemRoom } from "./gem-card-transition.js";
export type GemCardPlayingLeaveActionResult = Readonly<{
  candidate: RoomWriteCandidate;
  nextTurnIdentity: CurrentTurnIdentity | null;
  finishedGameId: GameId | null;
  advisory: "NONE";
}>;
export type GemCardPresenceRestoredPlan = Readonly<{
  status: "NO_CHANGE";
}> | Readonly<{
  status: "RESET";
  game: PlayingGemGameState;
  gameId: GameId;
  gameRevision: GameRevision;
  previousOfflineTimeoutStreak: number;
}>;
export interface GemCardPlayerLifecycleActionRouting {
  readonly gameType: "GEM_CARD";
  applyPlayingLeave(input: {
    room: RoomRecord;
    actorPlayerId: PlayerId;
    occurredAt: ServerTime;
  }): GemCardPlayingLeaveActionResult;
  planPresenceRestored(room: RoomRecord, playerId: PlayerId): GemCardPresenceRestoredPlan;
}
export function createGemCardPlayerLifecycleActions(ids: IdGenerator): GemCardPlayerLifecycleActionRouting {
  return Object.freeze({
    gameType: "GEM_CARD",
    applyPlayingLeave(input: {
      room: RoomRecord;
      actorPlayerId: PlayerId;
      occurredAt: ServerTime;
    }): GemCardPlayingLeaveActionResult {
      const room = asGemPlayingRoom(input.room);
      if (!room)
        throw new Error("GEM leave requires a playing GEM room.");
      const actor = room.game.players.find(p => p.playerId === input.actorPlayerId);
      if (!actor)
        throw new Error("GEM leave player missing.");
      if (actor.forfeited)
        return { candidate: { ...room, updatedAt: input.occurredAt }, nextTurnIdentity: null, finishedGameId: null, advisory: "NONE" };
      const change = applyGemExplicitLeaveForfeit({ ...room.game, playerId: input.actorPlayerId });
      const base: PlayingGemGameState = { ...room.game, ...change };
      const finish = evaluateGemFinishAfterForfeit({ ...base, currentActivePlayerId: base.turn.activePlayerId, existingPendingFairRound: base.pendingFairRound });
      const candidate = transitionGemRoom(room, base, finish, input.occurredAt, ids, false);
      const game = candidate.game;
      if (!game)
        throw new Error("GEM leave lost game.");
      return { candidate, advisory: "NONE", finishedGameId: game.turn === null ? game.gameId : null,
        nextTurnIdentity: game.turn === null ? null : { roomId: room.roomId, gameId: game.gameId, gameRevision: game.gameRevision, turnId: game.turn.turnId } };
    },
    planPresenceRestored(room: RoomRecord, playerId: PlayerId): GemCardPresenceRestoredPlan {
      if (room.gameType !== "GEM_CARD")
        throw new Error("GEM presence gameType mismatch.");
      const playing = asGemPlayingRoom(room);
      const player = playing?.game.players.find(p => p.playerId === playerId);
      if (!playing || !player || player.forfeited || player.offlineTimeoutStreak === 0)
        return { status: "NO_CHANGE" };
      const game = Object.freeze({ ...playing.game, players: replaceGemPlayer(playing.game.players, resetGemOfflineTimeoutStreak(player)) });
      return { status: "RESET", game, gameId: game.gameId, gameRevision: game.gameRevision, previousOfflineTimeoutStreak: player.offlineTimeoutStreak };
    },
  });
}
