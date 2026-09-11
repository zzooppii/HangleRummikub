import { CluePlayingProjectionSchema, ClueFinishedProjectionSchema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { ClueStoredGame } from "./adapter.js";
export function projectClue(game:ClueStoredGame,viewer:PlayerId){
  const s=game.state,me=s.players.find(p=>p.playerId===viewer);if(!me)throw new Error("Clue viewer missing.");
  const base={gameType:"CLUE",gameId:game.gameId,gameRevision:game.gameRevision,rulesVersion:s.rulesVersion,
    playerStates:s.players.map(({playerId,suspect,eliminated,summoned,cardCount})=>({playerId,suspect,eliminated,summoned,cardCount})),tokens:s.tokens,weapons:s.weapons,
    turnPlayerId:s.players[s.turnIndex]!.playerId,turnNumber:s.turnNumber,die:s.die,suggestion:s.suggestion,history:s.history,
    privateState:{playerId:viewer,hand:me.hand,evidence:s.evidence.filter(e=>e.fromPlayerId===viewer||e.toPlayerId===viewer),caseFile:me.eliminated||s.phase==="FINISHED"?s.solution:null}};
  return s.phase==="FINISHED"?parse(ClueFinishedProjectionSchema,{...base,phase:s.phase,result:s.result,solution:s.solution,revealedHands:s.players.map(p=>({playerId:p.playerId,hand:p.hand}))}):parse(CluePlayingProjectionSchema,{...base,phase:s.phase,turnId:s.transitionId});
}
