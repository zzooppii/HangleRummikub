import { LoveLetterPlayingProjectionSchema,LoveLetterFinishedProjectionSchema,loveLetterTargetTokens,type PlayerId } from '@hangul-rummikub/shared';
import { parse } from 'valibot';
import type { LoveLetterStoredGame } from './adapter.js';
export function projectLoveLetter(game:LoveLetterStoredGame,viewer:PlayerId){
 const s=game.state,p=s.players.find(p=>p.playerId===viewer);if(!p)throw new Error('Love Letter viewer missing.');
 const base={gameType:'LOVE_LETTER',gameId:game.gameId,gameRevision:game.gameRevision,rulesVersion:s.rulesVersion,round:s.round,roundId:s.roundId,turnNumber:s.turnNumber,targetTokens:loveLetterTargetTokens(s.players.length),deckCount:s.deck.length,setAsideCount:s.aside?1:0,faceUp:s.faceUp,
 playerStates:s.players.map(p=>({playerId:p.playerId,handCount:p.hand.length,tokens:p.tokens,eliminated:p.eliminated,protected:p.protected,discards:p.discards})),
 privateState:{playerId:viewer,hand:p.hand,notes:p.notes},history:s.history,roundResults:s.roundResults};
 if(s.phase==='FINISHED')return parse(LoveLetterFinishedProjectionSchema,{...base,phase:'FINISHED',result:s.result});
 return parse(LoveLetterPlayingProjectionSchema,s.phase==='PLAYING'?{...base,phase:'PLAYING',stage:s.stage,turnId:s.transitionId,activePlayerId:s.activePlayerId}:{...base,phase:'ROUND_RESULT'});
}
