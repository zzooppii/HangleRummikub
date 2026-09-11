import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelLoveLetter } from "../domain/game.js";
import { transitionLoveLetter } from "./service.js";
export function createLoveLetterLifecycle(){return {
  applyPlayingLeave(input:{room:RoomRecord;actorPlayerId:PlayerId;occurredAt:ServerTime}):PlayingLeaveActionResult {
    const {room}=input;if(room.gameType!=='LOVE_LETTER'||room.phase!=='PLAYING'||!room.game)throw new Error('LoveLetter playing room required.');
    const state=cancelLoveLetter(room.game.state,input.occurredAt);
    return {candidate:transitionLoveLetter(room,state,input.occurredAt),advisory:'NONE',finishedGameId:room.game.gameId,nextTurnIdentity:null};
  },
};}
