import type { PlayerId, ServerTime } from "@hangul-rummikub/shared";
import type { RoomRecord } from "../../../model/persistence.js";
import type { PlayingLeaveActionResult } from "../../../application/player-lifecycle-router.js";
import { cancelJaipur } from "../domain/game.js";
import { transitionJaipur } from "./service.js";
export function createJaipurLifecycle(){return {
  applyPlayingLeave(input:{room:RoomRecord;actorPlayerId:PlayerId;occurredAt:ServerTime}):PlayingLeaveActionResult {
    const {room}=input;if(room.gameType!=='JAIPUR'||room.phase!=='PLAYING'||!room.game)throw new Error('Jaipur playing room required.');
    const state=cancelJaipur(room.game.state,input.occurredAt);
    return {candidate:transitionJaipur(room,state,input.occurredAt),advisory:'NONE',finishedGameId:room.game.gameId,nextTurnIdentity:null};
  },
};}
