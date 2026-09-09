import { GameRevisionSchema, TurnIdSchema, type PlayerId, type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { forfeitLunch } from "../domain/game.js";
import { transitionSneaky } from "./service.js";
export function createSneakyLifecycle() {
  return {
    applyPlayingLeave(input: { room: RoomRecord; actorPlayerId: PlayerId; occurredAt: ServerTime }): PlayingLeaveActionResult {
      const { room } = input;
      if (room.gameType !== "SNEAKY_LUNCH" || room.phase !== "PLAYING" || !room.game) throw new Error("SNEAKY playing room required.");
      const state = forfeitLunch(room.game.state, input.actorPlayerId, input.occurredAt);
      return { candidate: transitionSneaky(room, state, input.occurredAt), advisory: "NONE", finishedGameId: state.phase === "FINISHED" ? room.game.gameId : null,
        nextTurnIdentity: state.phase === "FINISHED" ? null : { roomId: room.roomId, gameId: room.game.gameId, gameRevision: parse(GameRevisionSchema, state.revision), turnId: parse(TurnIdSchema, state.transitionId) } };
    },
  };
}
