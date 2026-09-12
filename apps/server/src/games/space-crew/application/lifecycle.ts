import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { transitionSpaceCrew } from "./service.js";

/** Pure cancellation candidate. The awaited service hook durably prepares campaign interruption. */
export function createSpaceCrewLifecycle() {
  return {
    applyPlayingLeave(input: { room: RoomRecord; actorPlayerId: PlayerId; occurredAt: ServerTime }): PlayingLeaveActionResult {
      const room = input.room;
      if (room.gameType !== "SPACE_CREW" || room.phase !== "PLAYING" || !room.game) throw new Error("SPACE_CREW playing room required.");
      return { candidate: transitionSpaceCrew(room, { ...room.game.state, cancelled: true, revision: room.game.state.revision + 1 }, input.occurredAt),
        advisory: "NONE", finishedGameId: room.game.gameId, nextTurnIdentity: null };
    },
  };
}
