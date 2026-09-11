import { DuetPlayingProjectionSchema, DuetFinishedProjectionSchema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { remainingClues } from "../domain/game.js";
import type { DuetStoredGame } from "./adapter.js";
export function projectDuet(game:DuetStoredGame,viewer:PlayerId){
  const s=game.state;
  if(!s.players.includes(viewer))throw new Error('Duet viewer missing.');
  const key=(id:PlayerId)=>s.cards.map(c=>({cardId:c.cardId,role:c.roles[s.players[0]===id?0:1]}));
  const base={gameType:'WORD_DUET',gameId:game.gameId,gameRevision:game.gameRevision,rulesVersion:s.rulesVersion,
    cards:s.cards.map(({cardId,word,foundBy,bystanderFor})=>({cardId,word,foundBy,bystanderFor:[...bystanderFor]})),
    tokensRemaining:s.tokensRemaining,foundCount:s.cards.filter(c=>c.foundBy!==null).length,
    playerStates:s.players.map(playerId=>({playerId,cluesComplete:remainingClues(s,playerId)===0,passed:s.passed.includes(playerId)})),
    privateState:{playerId:viewer,key:key(viewer)},currentClue:s.currentClue,history:s.history};
  if(s.phase==='FINISHED')return parse(DuetFinishedProjectionSchema,{...base,phase:'FINISHED',result:s.result,revealedKeys:s.players.map(playerId=>({playerId,key:key(playerId)}))});
  return parse(DuetPlayingProjectionSchema,{...base,phase:s.phase,turnId:s.transitionId,clueGiverId:s.clueGiverId,guessesThisTurn:s.guessesThisTurn});
}
