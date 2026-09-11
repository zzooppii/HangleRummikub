import { CenturyPlayingProjectionSchema, CenturyFinishedProjectionSchema, type PlayerId } from '@hangul-rummikub/shared';
import { parse } from 'valibot';
import { centuryMerchant, centuryPoint } from '../domain/game.js';
import type { CenturyStoredGame } from './adapter.js';
export function projectCentury(game:CenturyStoredGame,viewer:PlayerId){
 const s=game.state,p=s.players.find(p=>p.playerId===viewer);if(!p)throw new Error('Century viewer missing.');
 const base={gameType:'CENTURY',gameId:game.gameId,gameRevision:game.gameRevision,rulesVersion:s.rulesVersion,startingPlayerId:s.startingPlayerId,round:s.round,finalRound:s.finalRound,targetCount:s.players.length<=3?6:5,
 market:s.market.map(m=>({card:centuryMerchant(s,m.cardId),spices:m.spices})),pointMarket:s.pointMarket.map(id=>centuryPoint(s,id)),merchantDeckCount:s.merchantDeck.length,pointDeckCount:s.pointDeck.length,gold:s.gold,silver:s.silver,
 playerStates:s.players.map(p=>({playerId:p.playerId,spices:p.spices,handCount:p.hand.length,played:p.played.map(id=>centuryMerchant(s,id)),pointCount:p.points.length,gold:p.gold,silver:p.silver})),privateState:{playerId:viewer,hand:p.hand.map(id=>centuryMerchant(s,id)),points:p.points.map(id=>centuryPoint(s,id))},feedback:s.feedback};
 return s.phase==='FINISHED'?parse(CenturyFinishedProjectionSchema,{...base,phase:'FINISHED',result:s.result}):parse(CenturyPlayingProjectionSchema,{...base,phase:'PLAYING',turnId:s.transitionId,activePlayerId:s.activePlayerId});
}
