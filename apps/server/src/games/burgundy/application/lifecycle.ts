import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelBurgundy } from "../domain/game.js";
import { transitionBurgundy } from "./service.js";
export function createBurgundyLifecycle() {
  return {
    applyPlayingLeave(input: {
      room: RoomRecord;
      actorPlayerId: PlayerId;
      occurredAt: ServerTime;
    }): PlayingLeaveActionResult {
      const { room } = input;
      if (
        room.gameType !== "BURGUNDY" ||
        room.phase !== "PLAYING" ||
        !room.game
      )
        throw new Error("Burgundy playing room required.");
      const state = cancelBurgundy(room.game.state, input.occurredAt);
      return {
        candidate: transitionBurgundy(room, state, input.occurredAt),
        advisory: "NONE",
        finishedGameId: room.game.gameId,
        nextTurnIdentity: null,
      };
    },
  };
}
