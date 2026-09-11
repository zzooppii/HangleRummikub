import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelAzul } from "../domain/game.js";
import { transitionAzul } from "./service.js";
export function createAzulLifecycle(){return {
  applyPlayingLeave(input:{room:RoomRecord;actorPlayerId:PlayerId;occurredAt:ServerTime}):PlayingLeaveActionResult {
    const {room}=input;if(room.gameType!=='AZUL'||room.phase!=='PLAYING'||!room.game)throw new Error('Azul playing room required.');
    const state=cancelAzul(room.game.state,input.occurredAt);
    return {candidate:transitionAzul(room,state,input.occurredAt),advisory:'NONE',finishedGameId:room.game.gameId,nextTurnIdentity:null};
  },
};}
