import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelGuryongtu } from "../domain/game.js";
import { transitionGuryongtu } from "./service.js";
export function createGuryongtuLifecycle(){return {
  applyPlayingLeave(input:{room:RoomRecord;actorPlayerId:PlayerId;occurredAt:ServerTime}):PlayingLeaveActionResult {
    const {room}=input;if(room.gameType!=='GURYONGTU'||room.phase!=='PLAYING'||!room.game)throw new Error('Guryongtu playing room required.');
    const state=cancelGuryongtu(room.game.state,input.occurredAt);
    return {candidate:transitionGuryongtu(room,state,input.occurredAt),advisory:'NONE',finishedGameId:room.game.gameId,nextTurnIdentity:null};
  },
};}
