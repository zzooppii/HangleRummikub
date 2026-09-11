import { LostCitiesPlayingProjectionSchema, LostCitiesFinishedProjectionSchema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { lostCitiesCard, lostCitiesCumulative, scoreLostCitiesExpedition } from "../domain/game.js";
import type { LostCitiesStoredGame } from "./adapter.js";
export function projectLostCities(game:LostCitiesStoredGame,viewer:PlayerId) {
  const s=game.state,p=s.players.find(p=>p.playerId===viewer);if(!p)throw new Error('Lost Cities viewer missing.');
  const base={gameType:'LOST_CITIES',gameId:game.gameId,gameRevision:game.gameRevision,rulesVersion:s.rulesVersion,settings:s.settings,round:s.round,roundId:s.roundId,
    deckCount:s.deck.length,discards:s.discards.map(d=>({suit:d.suit,count:d.cards.length,top:d.cards.length?lostCitiesCard(s,d.cards.at(-1)!):null})),
    playerStates:s.players.map(p=>({playerId:p.playerId,handCount:p.hand.length,cumulative:lostCitiesCumulative(s,p.playerId),
      expeditions:p.expeditions.map(e=>{const cards=e.cards.map(id=>lostCitiesCard(s,id));return {suit:e.suit,cards,score:scoreLostCitiesExpedition(e.suit,cards)};})})),
    privateState:{playerId:viewer,hand:p.hand.map(id=>lostCitiesCard(s,id))},roundResults:s.roundResults,feedback:s.feedback};
  if(s.phase==='FINISHED')return parse(LostCitiesFinishedProjectionSchema,{...base,phase:'FINISHED',result:s.result});
  return parse(LostCitiesPlayingProjectionSchema,s.phase==='PLAYING'?{...base,phase:'PLAYING',turnId:s.transitionId,activePlayerId:s.activePlayerId,deadlineAt:s.deadlineAt}:{...base,phase:'ROUND_RESULT',confirmedPlayerIds:s.confirmedPlayerIds});
}
