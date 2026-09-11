import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelCarcassonne } from "../domain/game.js";
import { transitionCarcassonne } from "./service.js";
export function createCarcassonneLifecycle() {
  return {
    applyPlayingLeave(input: {
      room: RoomRecord;
      actorPlayerId: PlayerId;
      occurredAt: ServerTime;
    }): PlayingLeaveActionResult {
      const { room } = input;
      if (
        room.gameType !== "CARCASSONNE" ||
        room.phase !== "PLAYING" ||
        !room.game
      )
        throw new Error("Carcassonne playing room required.");
      const state = cancelCarcassonne(room.game.state, input.occurredAt);
      return {
        candidate: transitionCarcassonne(room, state, input.occurredAt),
        advisory: "NONE",
        finishedGameId: room.game.gameId,
        nextTurnIdentity: null,
      };
    },
  };
}
