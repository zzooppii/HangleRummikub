import { GameRevisionSchema, TurnIdSchema, type PlayerId, type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { RoomRecord } from "../../../model/persistence.js";
import type { IdGenerator } from "../../../ports/system.js";
import type { PlayingLeaveActionResult, PresenceRestoredPlan } from "../../../application/player-lifecycle-router.js";
import { leaveRelay, resumeRelay } from "../domain/game.js";
import { transitionDraw } from "./service.js";

export function createDrawRelayLifecycle(ids: IdGenerator) {
  return {
    applyPlayingLeave(input: { room: RoomRecord; actorPlayerId: PlayerId; occurredAt: ServerTime }): PlayingLeaveActionResult {
      const { room } = input;
      if (room.gameType !== "DRAW_RELAY" || room.phase !== "PLAYING" || !room.game) throw new Error("DRAW playing room required.");
      const state = leaveRelay(room.game.state, input.actorPlayerId, input.occurredAt, ids.generateTurnId());
      const candidate = transitionDraw(room, state, input.occurredAt);
      return { candidate, advisory: "NONE", finishedGameId: null,
        nextTurnIdentity: state.deadlineAt === null ? null : { roomId: room.roomId, gameId: room.game.gameId,
          gameRevision: parse(GameRevisionSchema, state.revision), turnId: parse(TurnIdSchema, state.stageToken) } };
    },
    planPresenceRestored(room: RoomRecord, playerId: PlayerId): PresenceRestoredPlan {
      if (room.gameType !== "DRAW_RELAY" || !room.game || room.phase !== "PLAYING") return { status: "NO_CHANGE" };
      const player = room.game.state.players.find(p => p.playerId === playerId);
      if (!player || player.forfeited || player.offlineMissStreak === 0) return { status: "NO_CHANGE" };
      const state = resumeRelay(room.game.state, playerId);
      const game = { ...room.game, state, gameRevision: parse(GameRevisionSchema, state.revision) };
      return { status: "RESET", gameType: "DRAW_RELAY", game, gameId: game.gameId,
        gameRevision: game.gameRevision, previousOfflineTimeoutStreak: player.offlineMissStreak };
    },
  };
}
