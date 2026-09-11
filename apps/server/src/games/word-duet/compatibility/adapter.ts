import { GameIdSchema, GameRevisionSchema, ServerTimeSchema, type GameId, type GameRevision, type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { parseDuetState, type DuetState } from "../domain/game.js";
export type DuetStoredGame=Readonly<{gameId:GameId;gameRevision:GameRevision;startedAt:ServerTime;finishedAt:ServerTime|null;state:DuetState}>;
export type DuetLifecycle=Readonly<{lifecycle:'RUNNING';gameId:GameId;gameRevision:GameRevision;activeTurn:null}>|Readonly<{lifecycle:'FINISHED';gameId:GameId;finishedAt:ServerTime}>;
export class DuetGameStateAdapter {
  cloneAndValidate(game:DuetStoredGame):DuetStoredGame {
    const state=parseDuetState(game.state),gameId=parse(GameIdSchema,game.gameId),gameRevision=parse(GameRevisionSchema,game.gameRevision),startedAt=parse(ServerTimeSchema,game.startedAt);
    if(state.gameId!==gameId||state.revision!==gameRevision||state.startedAt!==startedAt||state.finishedAt!==game.finishedAt)throw new Error('Duet stored metadata mismatch.');
    return {gameId,gameRevision,startedAt,finishedAt:state.finishedAt,state};
  }
  inspectLifecycle(game:DuetStoredGame):DuetLifecycle {
    if(game.state.phase==='FINISHED'){if(game.finishedAt===null)throw new Error('Duet finish time missing.');return {lifecycle:'FINISHED',gameId:game.gameId,finishedAt:game.finishedAt};}
    return {lifecycle:'RUNNING',gameId:game.gameId,gameRevision:game.gameRevision,activeTurn:null};
  }
}
