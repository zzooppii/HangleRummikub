import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelDuet } from "../domain/game.js";
import { transitionDuet } from "./service.js";
export function createDuetLifecycle(){return {
  applyPlayingLeave(input:{room:RoomRecord;actorPlayerId:PlayerId;occurredAt:ServerTime}):PlayingLeaveActionResult {
    const {room}=input;if(room.gameType!=='WORD_DUET'||room.phase!=='PLAYING'||!room.game)throw new Error('Duet playing room required.');
    const state=cancelDuet(room.game.state,input.occurredAt);
    return {candidate:transitionDuet(room,state,input.occurredAt),advisory:'NONE',finishedGameId:room.game.gameId,nextTurnIdentity:null};
  },
};}
