import { JaipurPlayingProjectionSchema, JaipurFinishedProjectionSchema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { jaipurCard } from "../domain/game.js";
import type { JaipurStoredGame } from "./adapter.js";
export function projectJaipur(game:JaipurStoredGame,viewer:PlayerId){
  const s=game.state,p=s.players.find(p=>p.playerId===viewer);if(!p)throw new Error('Jaipur viewer missing.');
  const base={gameType:'JAIPUR',gameId:game.gameId,gameRevision:game.gameRevision,rulesVersion:s.rulesVersion,round:s.round,roundId:s.roundId,
    market:s.market.map(id=>jaipurCard(s,id)),deckCount:s.deck.length,discardTop:s.discard.length?jaipurCard(s,s.discard.at(-1)!):null,
    goodsBank:s.goodsBank,bonusBank:s.bonusBank.map(b=>({size:b.size,count:b.values.length})),
    playerStates:s.players.map(p=>({playerId:p.playerId,handCount:p.hand.length,seals:p.seals})),
    privateState:{playerId:viewer,hand:p.hand.map(id=>jaipurCard(s,id)),camelCount:p.herd.length,goodsTokens:p.goodsTokens,bonusTokens:p.bonusTokens},roundResults:s.roundResults,feedback:s.feedback};
  if(s.phase==='FINISHED')return parse(JaipurFinishedProjectionSchema,{...base,phase:'FINISHED',result:s.result});
  return parse(JaipurPlayingProjectionSchema,s.phase==='PLAYING'?{...base,phase:'PLAYING',turnId:s.transitionId,activePlayerId:s.activePlayerId}:{...base,phase:'ROUND_RESULT',confirmedPlayerIds:s.confirmedPlayerIds});
}
