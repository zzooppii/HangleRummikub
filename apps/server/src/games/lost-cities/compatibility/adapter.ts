import { GameIdSchema, GameRevisionSchema, ServerTimeSchema, type GameId, type GameRevision, type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { parseLostCitiesState, type LostCitiesState } from "../domain/game.js";
export type LostCitiesStoredGame=Readonly<{gameId:GameId;gameRevision:GameRevision;startedAt:ServerTime;finishedAt:ServerTime|null;state:LostCitiesState}>;
export type LostCitiesLifecycle=Readonly<{lifecycle:'RUNNING';gameId:GameId;gameRevision:GameRevision;activeTurn:null}>|Readonly<{lifecycle:'FINISHED';gameId:GameId;finishedAt:ServerTime}>;
export class LostCitiesGameStateAdapter {
  cloneAndValidate(game:LostCitiesStoredGame):LostCitiesStoredGame {
    const state=parseLostCitiesState(game.state),gameId=parse(GameIdSchema,game.gameId),gameRevision=parse(GameRevisionSchema,game.gameRevision),startedAt=parse(ServerTimeSchema,game.startedAt);
    if(state.gameId!==gameId||state.revision!==gameRevision||state.startedAt!==startedAt||state.finishedAt!==game.finishedAt)throw new Error('LostCities stored metadata mismatch.');
    return {gameId,gameRevision,startedAt,finishedAt:state.finishedAt,state};
  }
  inspectLifecycle(game:LostCitiesStoredGame):LostCitiesLifecycle {
    if(game.state.phase==='FINISHED'){if(game.finishedAt===null)throw new Error('LostCities finish time missing.');return {lifecycle:'FINISHED',gameId:game.gameId,finishedAt:game.finishedAt};}
    return {lifecycle:'RUNNING',gameId:game.gameId,gameRevision:game.gameRevision,activeTurn:null};
  }
}
