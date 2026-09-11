import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelClue } from "../domain/game.js";
import { transitionClue } from "./service.js";
export function createClueLifecycle(){return {
  applyPlayingLeave(input:{room:RoomRecord;actorPlayerId:PlayerId;occurredAt:ServerTime}):PlayingLeaveActionResult {
    const {room}=input;if(room.gameType!=='CLUE'||room.phase!=='PLAYING'||!room.game)throw new Error('Clue playing room required.');
    const state=cancelClue(room.game.state,input.occurredAt);
    return {candidate:transitionClue(room,state,input.occurredAt),advisory:'NONE',finishedGameId:room.game.gameId,nextTurnIdentity:null};
  },
};}
