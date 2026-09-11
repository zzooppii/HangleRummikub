import { GameIdSchema, GameRevisionSchema, ServerTimeSchema, type GameId, type GameRevision, type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { parseLoveLetterState, type LoveLetterState } from "../domain/game.js";
export type LoveLetterStoredGame=Readonly<{gameId:GameId;gameRevision:GameRevision;startedAt:ServerTime;finishedAt:ServerTime|null;state:LoveLetterState}>;
export type LoveLetterLifecycle=Readonly<{lifecycle:'RUNNING';gameId:GameId;gameRevision:GameRevision;activeTurn:null}>|Readonly<{lifecycle:'FINISHED';gameId:GameId;finishedAt:ServerTime}>;
export class LoveLetterGameStateAdapter {
  cloneAndValidate(game:LoveLetterStoredGame):LoveLetterStoredGame {
    const state=parseLoveLetterState(game.state),gameId=parse(GameIdSchema,game.gameId),gameRevision=parse(GameRevisionSchema,game.gameRevision),startedAt=parse(ServerTimeSchema,game.startedAt);
    if(state.gameId!==gameId||state.revision!==gameRevision||state.startedAt!==startedAt||state.finishedAt!==game.finishedAt)throw new Error('LoveLetter stored metadata mismatch.');
    return {gameId,gameRevision,startedAt,finishedAt:state.finishedAt,state};
  }
  inspectLifecycle(game:LoveLetterStoredGame):LoveLetterLifecycle {
    if(game.state.phase==='FINISHED'){if(game.finishedAt===null)throw new Error('LoveLetter finish time missing.');return {lifecycle:'FINISHED',gameId:game.gameId,finishedAt:game.finishedAt};}
    return {lifecycle:'RUNNING',gameId:game.gameId,gameRevision:game.gameRevision,activeTurn:null};
  }
}
