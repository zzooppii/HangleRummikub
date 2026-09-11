import { GameRevisionSchema, TurnIdSchema, type PlayerId, type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelSpyfall } from "../domain/game.js";
import { transitionSpyfall } from "./service.js";
export function createSpyfallLifecycle() {
  return {
    applyPlayingLeave(input: { room: RoomRecord; actorPlayerId: PlayerId; occurredAt: ServerTime }): PlayingLeaveActionResult {
      const { room } = input;
      if (room.gameType !== "SPYFALL" || room.phase !== "PLAYING" || !room.game) throw new Error("SPYFALL playing room required.");
      const state = cancelSpyfall(room.game.state, input.occurredAt);
      return { candidate: transitionSpyfall(room, state, input.occurredAt), advisory: "NONE", finishedGameId: state.phase === "FINISHED" ? room.game.gameId : null,
        nextTurnIdentity: state.phase === "FINISHED" ? null : { roomId: room.roomId, gameId: room.game.gameId, gameRevision: parse(GameRevisionSchema, state.revision), turnId: parse(TurnIdSchema, state.transitionId) } };
    },
  };
}
