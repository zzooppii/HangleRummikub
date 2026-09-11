import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelCentury } from "../domain/game.js";
import { transitionCentury } from "./service.js";
export function createCenturyLifecycle(){return {
  applyPlayingLeave(input:{room:RoomRecord;actorPlayerId:PlayerId;occurredAt:ServerTime}):PlayingLeaveActionResult {
    const {room}=input;if(room.gameType!=='CENTURY'||room.phase!=='PLAYING'||!room.game)throw new Error('Century playing room required.');
    const state=cancelCentury(room.game.state,input.occurredAt);
    return {candidate:transitionCentury(room,state,input.occurredAt),advisory:'NONE',finishedGameId:room.game.gameId,nextTurnIdentity:null};
  },
};}
