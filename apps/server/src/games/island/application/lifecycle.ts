import { GameRevisionSchema, TurnIdSchema, type PlayerId, type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelIsland } from "../domain/game.js";
import { transitionIsland } from "./service.js";
export function createIslandLifecycle() {
  return {
    applyPlayingLeave(input: { room: RoomRecord; actorPlayerId: PlayerId; occurredAt: ServerTime }): PlayingLeaveActionResult {
      const { room } = input;
      if (room.gameType !== "ISLAND_SETTLERS" || room.phase !== "PLAYING" || !room.game) throw new Error("ISLAND playing room required.");
      const state = cancelIsland(room.game.state, input.occurredAt);
      return { candidate: transitionIsland(room, state, input.occurredAt), advisory: "NONE", finishedGameId: state.phase === "FINISHED" ? room.game.gameId : null,
        nextTurnIdentity: state.phase === "FINISHED" ? null : { roomId: room.roomId, gameId: room.game.gameId, gameRevision: parse(GameRevisionSchema, state.revision), turnId: parse(TurnIdSchema, state.turnId) } };
    },
  };
}
