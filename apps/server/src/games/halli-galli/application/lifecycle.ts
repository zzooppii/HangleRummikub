import { GameRevisionSchema, TurnIdSchema, type PlayerId, type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelHalli } from "../domain/game.js";
import { transitionHalli } from "./service.js";
export function createHalliLifecycle() {
  return {
    applyPlayingLeave(input: { room: RoomRecord; actorPlayerId: PlayerId; occurredAt: ServerTime }): PlayingLeaveActionResult {
      const { room } = input;
      if (room.gameType !== "HALLI_GALLI" || room.phase !== "PLAYING" || !room.game) throw new Error("HALLI playing room required.");
      const state = cancelHalli(room.game.state, input.occurredAt);
      return { candidate: transitionHalli(room, state, input.occurredAt), advisory: "NONE", finishedGameId: state.phase === "FINISHED" ? room.game.gameId : null,
        nextTurnIdentity: state.phase === "FINISHED" ? null : { roomId: room.roomId, gameId: room.game.gameId, gameRevision: parse(GameRevisionSchema, state.revision), turnId: parse(TurnIdSchema, state.transitionId) } };
    },
  };
}
