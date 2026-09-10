import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelLostCities } from "../domain/game.js";
import { transitionLostCities } from "./service.js";
export function createLostCitiesLifecycle(){return {
  applyPlayingLeave(input:{room:RoomRecord;actorPlayerId:PlayerId;occurredAt:ServerTime}):PlayingLeaveActionResult {
    const {room}=input;if(room.gameType!=='LOST_CITIES'||room.phase!=='PLAYING'||!room.game)throw new Error('LostCities playing room required.');
    const state=cancelLostCities(room.game.state,input.occurredAt);
    return {candidate:transitionLostCities(room,state,input.occurredAt),advisory:'NONE',finishedGameId:room.game.gameId,nextTurnIdentity:null};
  },
};}
