import { GameIdSchema,GameRevisionSchema,ServerTimeSchema,TurnIdSchema,type GameId,type GameRevision,type ServerTime,type TurnId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { parseDrawRelayState,type DrawRelayState } from "../domain/game.js";
export type DrawRelayStoredGame = Readonly<{ gameId:GameId; gameRevision:GameRevision; startedAt:ServerTime; finishedAt:ServerTime|null; state:DrawRelayState }>;
export type DrawRelayLifecycle =
 | Readonly<{ lifecycle:"RUNNING";gameId:GameId;gameRevision:GameRevision;activeTurn:Readonly<{turnId:TurnId;deadlineAt:ServerTime}>|null }>
 | Readonly<{ lifecycle:"FINISHED";gameId:GameId;finishedAt:ServerTime }>;
export class DrawRelayGameStateAdapter {
  readonly gameType = "DRAW_RELAY";
  cloneAndValidate(game:DrawRelayStoredGame):DrawRelayStoredGame {
    const state=parseDrawRelayState(game.state),gameId=parse(GameIdSchema,game.gameId),gameRevision=parse(GameRevisionSchema,game.gameRevision),startedAt=parse(ServerTimeSchema,game.startedAt);
    if(state.gameId!==gameId||state.revision!==gameRevision||state.startedAt<startedAt||state.finishedAt!==game.finishedAt)throw new Error("DRAW persisted metadata mismatch.");
    const finishedAt=state.finishedAt===null?null:parse(ServerTimeSchema,state.finishedAt);
    if(finishedAt!==null&&finishedAt<startedAt)throw new Error("DRAW finish precedes start.");
    return {gameId,gameRevision,startedAt,finishedAt,state};
  }
  inspectLifecycle(game:DrawRelayStoredGame):DrawRelayLifecycle {
    if(game.state.phase==="FINISHED") { if(game.finishedAt===null)throw new Error("Missing finish time.");return {lifecycle:"FINISHED",gameId:game.gameId,finishedAt:game.finishedAt}; }
    return {lifecycle:"RUNNING",gameId:game.gameId,gameRevision:game.gameRevision,activeTurn:game.state.deadlineAt===null?null:{turnId:parse(TurnIdSchema,game.state.stageToken),deadlineAt:parse(ServerTimeSchema,game.state.deadlineAt)}};
  }
}
