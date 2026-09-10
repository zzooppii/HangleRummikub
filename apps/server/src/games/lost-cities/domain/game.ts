import * as v from "valibot";
import {
  GameIdSchema, GameRevisionSchema, PlayerIdSchema, ServerTimeSchema, TurnIdSchema,
  LostCitiesCardSchema, LostCitiesCardIdSchema, LostCitiesSuitSchema, LostCitiesActionSchema,
  LostCitiesRoundResultSchema, LostCitiesResultSchema, LostCitiesFeedbackSchema,
  LostCitiesExpeditionScoreSchema, lostCitiesSuits, lostCitiesRulesVersion, LostCitiesSettingsSchema, type LostCitiesSettings, lostCitiesCardsAreOrdered,
  type LostCitiesCard, type LostCitiesExpeditionScore, type PlayerId, type LostCitiesSuit,
} from "@hangul-rummikub/shared";

const ids = v.array(LostCitiesCardIdSchema);
const zones = v.pipe(v.array(v.strictObject({suit:LostCitiesSuitSchema, cards:v.pipe(ids,v.maxLength(12))})),v.minLength(5),v.maxLength(6));
const State = v.strictObject({
  gameId:GameIdSchema, settings:v.optional(LostCitiesSettingsSchema,()=>({mode:'BASE'})), rulesVersion:v.picklist(['lost-cities-base-v1','lost-cities-six-v1']), revision:GameRevisionSchema,
  phase:v.picklist(['PLAYING','ROUND_RESULT','FINISHED']), startedAt:ServerTimeSchema, finishedAt:v.nullable(ServerTimeSchema),
  round:v.pipe(v.number(),v.safeInteger(),v.minValue(1),v.maxValue(3)), roundId:TurnIdSchema, transitionId:TurnIdSchema,
  activePlayerId:PlayerIdSchema, startingPlayerId:PlayerIdSchema,
  cards:v.pipe(v.array(LostCitiesCardSchema),v.minLength(60),v.maxLength(72)), deck:ids, discards:zones,
  players:v.pipe(v.array(v.strictObject({playerId:PlayerIdSchema,hand:v.pipe(ids,v.length(8)),expeditions:zones})),v.length(2)),
  confirmedPlayerIds:v.pipe(v.array(PlayerIdSchema),v.maxLength(1)),
  roundResults:v.pipe(v.array(LostCitiesRoundResultSchema),v.maxLength(3)), result:v.nullable(LostCitiesResultSchema),feedback:LostCitiesFeedbackSchema,
});
export type LostCitiesState = v.InferOutput<typeof State>;
export type LostCitiesRoundSetup = { cards: LostCitiesCard[] };
type Identity = {settings?:LostCitiesSettings;gameId:LostCitiesState['gameId'];playerIds:PlayerId[];now:LostCitiesState['startedAt'];transitionId:LostCitiesState['transitionId'];starter:number};
const emptyZones = (mode:LostCitiesSettings["mode"]) => lostCitiesSuits(mode).map(suit=>({suit,cards:[] as LostCitiesCard['cardId'][]}));
export function lostCitiesCard(s: Pick<LostCitiesState,'cards'>, id:string):LostCitiesCard {
  const card=s.cards.find(c=>c.cardId===id);if(!card)throw new Error('Invalid Lost Cities card reference.');return card;
}
export function scoreLostCitiesExpedition(suit:LostCitiesSuit,cards:readonly LostCitiesCard[]):LostCitiesExpeditionScore {
  const sum=cards.reduce((n,c)=>n+(c.kind==='NUMBER'?c.value:0),0),cost=cards.length?20:0,multiplier=1+cards.filter(c=>c.kind==='INVESTMENT').length,bonus=cards.length>=8?20:0;
  return v.parse(LostCitiesExpeditionScoreSchema,{suit,cardCount:cards.length,sum,cost,multiplier,bonus,total:(sum-cost)*multiplier+bonus});
}
export function lostCitiesCumulative(s:Pick<LostCitiesState,'roundResults'>,playerId:PlayerId):number {
  return s.roundResults.reduce((n,r)=>n+(r.scores.find(p=>p.playerId===playerId)?.total??0),0);
}
function hasSuits(z:readonly {suit:string}[],suits:readonly string[]):boolean { return z.length===suits.length&&new Set(z.map(e=>e.suit)).size===suits.length&&z.every(e=>suits.includes(e.suit)); }
export function parseLostCitiesState(input:unknown):LostCitiesState {
  const s=v.parse(State,input),players=new Set(s.players.map(p=>p.playerId));
  const suits=lostCitiesSuits(s.settings.mode),total=suits.length*12;
  if(s.rulesVersion!==lostCitiesRulesVersion(s.settings.mode))throw new Error("Lost Cities rules mismatch.");
  if(players.size!==2||!players.has(s.activePlayerId)||!players.has(s.startingPlayerId)||s.confirmedPlayerIds.some(id=>!players.has(id)))throw new Error('Invalid Lost Cities players.');
  if(!hasSuits(s.discards,suits)||s.players.some(p=>!hasSuits(p.expeditions,suits)))throw new Error('Invalid Lost Cities suits.');
  const all=[...s.deck,...s.discards.flatMap(d=>d.cards),...s.players.flatMap(p=>[...p.hand,...p.expeditions.flatMap(e=>e.cards)])],cards=new Map(s.cards.map(c=>[c.cardId,c]));
  if(cards.size!==total||all.length!==total||new Set(all).size!==total||all.some(id=>!cards.has(id)))throw new Error('Lost Cities card conservation failed.');
  for(const suit of suits) {
    const set=s.cards.filter(c=>c.suit===suit);
    if(set.length!==12||set.filter(c=>c.kind==='INVESTMENT').length!==3||Array.from({length:9},(_,i)=>i+2).some(value=>set.filter(c=>c.kind==='NUMBER'&&c.value===value).length!==1))throw new Error('Invalid Lost Cities inventory.');
  }
  for(const d of s.discards)if(d.cards.some(id=>lostCitiesCard(s,id).suit!==d.suit))throw new Error('Invalid Lost Cities discard suit.');
  for(const p of s.players)for(const e of p.expeditions)if(!lostCitiesCardsAreOrdered(e.cards.map(id=>lostCitiesCard(s,id)),e.suit))throw new Error('Invalid Lost Cities expedition.');
  if((s.phase==='FINISHED')!==(s.result!==null&&s.finishedAt!==null)||(s.phase!=='FINISHED'&&(s.result!==null||s.finishedAt!==null))||s.finishedAt!==null&&s.finishedAt<s.startedAt)throw new Error('Invalid Lost Cities finish.');
  if(s.phase==='PLAYING'&&(s.deck.length===0||s.confirmedPlayerIds.length!==0||s.roundResults.length!==s.round-1))throw new Error('Invalid Lost Cities playing phase.');
  if(s.phase==='ROUND_RESULT'&&(s.round===3||s.deck.length!==0||s.roundResults.length!==s.round))throw new Error('Invalid Lost Cities round result phase.');
  if(s.phase==='FINISHED'&&s.confirmedPlayerIds.length!==0)throw new Error('Unexpected result confirmations.');
  for(const [i,r] of s.roundResults.entries()) {
    if(r.round!==i+1||new Set(r.scores.map(p=>p.playerId)).size!==2||r.scores.some(p=>!players.has(p.playerId)||!hasSuits(p.expeditions,suits)||p.total!==p.expeditions.reduce((n,e)=>n+e.total,0)||p.cumulative!==lostCitiesCumulative({roundResults:s.roundResults.slice(0,i+1)},p.playerId)))throw new Error('Invalid Lost Cities history.');
    for(const p of r.scores)for(const e of p.expeditions)if(e.total!==(e.sum-e.cost)*e.multiplier+e.bonus||e.cost!==(e.cardCount?20:0)||e.bonus!==(e.cardCount>=8?20:0))throw new Error('Invalid Lost Cities historical score.');
  }
  if(s.result?.reason==='THREE_ROUNDS') {
    const best=Math.max(...s.players.map(p=>lostCitiesCumulative(s,p.playerId))),winners=s.players.filter(p=>lostCitiesCumulative(s,p.playerId)===best).map(p=>p.playerId);
    if(s.round!==3||s.deck.length!==0||s.roundResults.length!==3||s.result.winnerPlayerIds.length!==winners.length||new Set(s.result.winnerPlayerIds).size!==winners.length||winners.some(id=>!s.result?.winnerPlayerIds.includes(id)))throw new Error('Invalid Lost Cities match winner.');
  }
  if(s.result?.reason==='CANCELLED'&&(s.result.winnerPlayerIds.length!==0||![s.round-1,s.round].includes(s.roundResults.length)))throw new Error('Invalid Lost Cities cancellation.');
  if(s.roundResults.length===s.round) {
    const last=s.roundResults.at(-1)!;
    for(const p of s.players)for(const e of p.expeditions){const expected=scoreLostCitiesExpedition(e.suit,e.cards.map(id=>lostCitiesCard(s,id))),actual=last.scores.find(x=>x.playerId===p.playerId)?.expeditions.find(x=>x.suit===e.suit);if(JSON.stringify(actual)!==JSON.stringify(expected))throw new Error('Lost Cities settled board mismatch.');}
  }
  if(s.feedback&&(!players.has(s.feedback.playerId)||JSON.stringify(lostCitiesCard(s,s.feedback.card.cardId))!==JSON.stringify(s.feedback.card)||s.feedback.at<s.startedAt))throw new Error('Invalid Lost Cities feedback.');
  return s;
}
function deal(s:LostCitiesState,setup:LostCitiesRoundSetup):void {
  s.cards=structuredClone(setup.cards);s.deck=s.cards.map(c=>c.cardId);s.discards=emptyZones(s.settings.mode);
  for(const p of s.players){p.hand=s.deck.splice(0,8);p.expeditions=emptyZones(s.settings.mode);}
}
export function createLostCitiesGame(input:Identity & LostCitiesRoundSetup):LostCitiesState {
  if(input.playerIds.length!==2||new Set(input.playerIds).size!==2||![0,1].includes(input.starter))throw new Error('Lost Cities requires two players.');
  const starter=input.playerIds[input.starter]!;
  const s:LostCitiesState={gameId:input.gameId,settings:input.settings??{mode:'BASE'},rulesVersion:lostCitiesRulesVersion(input.settings?.mode??'BASE'),revision:v.parse(GameRevisionSchema,0),phase:'PLAYING',startedAt:input.now,finishedAt:null,round:1,roundId:input.transitionId,transitionId:input.transitionId,activePlayerId:starter,startingPlayerId:starter,cards:[],deck:[],discards:[],players:input.playerIds.map(playerId=>({playerId,hand:[],expeditions:[]})),confirmedPlayerIds:[],roundResults:[],result:null,feedback:null};
  deal(s,input);return parseLostCitiesState(s);
}
function endRound(s:LostCitiesState,now:LostCitiesState['startedAt']):void {
  const scores=s.players.map(p=>{const expeditions=p.expeditions.map(e=>scoreLostCitiesExpedition(e.suit,e.cards.map(id=>lostCitiesCard(s,id)))),total=expeditions.reduce((n,e)=>n+e.total,0);return {playerId:p.playerId,expeditions,total,cumulative:lostCitiesCumulative(s,p.playerId)+total};});
  s.roundResults.push({round:s.round,scores});s.phase='ROUND_RESULT';
  if(s.round===3){const best=Math.max(...scores.map(p=>p.cumulative));s.phase='FINISHED';s.finishedAt=now;s.result={reason:'THREE_ROUNDS',winnerPlayerIds:scores.filter(p=>p.cumulative===best).map(p=>p.playerId)};}
}
type Outcome={ok:true;state:LostCitiesState}|{ok:false;reason:'INVALID_ACTION'|'NOT_YOUR_TURN'|'INVALID_PHASE'};
export function applyLostCitiesAction(input:LostCitiesState,actor:PlayerId,actionInput:unknown,now:LostCitiesState['startedAt'],nextId:LostCitiesState['transitionId']):Outcome {
  if(input.phase!=='PLAYING')return {ok:false,reason:'INVALID_PHASE'};
  if(input.activePlayerId!==actor)return {ok:false,reason:'NOT_YOUR_TURN'};
  const parsed=v.safeParse(LostCitiesActionSchema,actionInput),fail:Outcome={ok:false,reason:'INVALID_ACTION'};
  if(!parsed.success)return fail;
  const a=parsed.output,s=structuredClone(input),p=s.players.find(p=>p.playerId===actor);
  if(!p||!p.hand.includes(a.cardId))return fail;
  const card=lostCitiesCard(s,a.cardId);
  const destination=(a.kind==='PLAY'?p.expeditions:s.discards).find(e=>e.suit===card.suit)!;
  if(a.kind==='PLAY'&&!lostCitiesCardsAreOrdered([...destination.cards.map(id=>lostCitiesCard(s,id)),card],card.suit))return fail;
  // Resolve both actions on the detached candidate; never reveal a deck card before commit.
  if(a.draw.kind==='DISCARD'&&a.kind==='DISCARD'&&a.draw.suit===card.suit)return fail;
  const source=a.draw.kind==='DECK'?s.deck:s.discards.find(d=>a.draw.kind==='DISCARD'&&d.suit===a.draw.suit)?.cards;
  if(!source||source.length===0)return fail;
  p.hand=p.hand.filter(id=>id!==a.cardId);destination.cards.push(a.cardId);
  const drawn=a.draw.kind==='DECK'?source.shift()!:source.pop()!;p.hand.push(drawn);
  s.revision=v.parse(GameRevisionSchema,s.revision+1);s.transitionId=nextId;
  s.feedback={playerId:actor,kind:a.kind,card,draw:a.draw.kind==='DECK'?{kind:'DECK'}:{kind:'DISCARD',card:lostCitiesCard(s,drawn)},at:now};
  if(s.deck.length===0)endRound(s,now);else s.activePlayerId=s.players.find(q=>q.playerId!==actor)!.playerId;
  return {ok:true,state:parseLostCitiesState(s)};
}
export function confirmLostCitiesRound(input:LostCitiesState,actor:PlayerId,setup:LostCitiesRoundSetup|null,nextId:LostCitiesState['transitionId']):Outcome {
  if(input.phase!=='ROUND_RESULT'||!input.players.some(p=>p.playerId===actor)||input.confirmedPlayerIds.includes(actor))return {ok:false,reason:'INVALID_PHASE'};
  const s=structuredClone(input);s.revision=v.parse(GameRevisionSchema,s.revision+1);
  if(s.confirmedPlayerIds.length===0)s.confirmedPlayerIds.push(actor);
  else {
    if(!setup)return {ok:false,reason:'INVALID_ACTION'};
    const [a,b]=s.players;if(!a||!b)throw new Error('Missing Lost Cities players.');
    const delta=lostCitiesCumulative(s,a.playerId)-lostCitiesCumulative(s,b.playerId);
    s.startingPlayerId=delta>0?a.playerId:delta<0?b.playerId:s.startingPlayerId===a.playerId?b.playerId:a.playerId;
    s.activePlayerId=s.startingPlayerId;s.round++;s.roundId=nextId;s.transitionId=nextId;s.phase='PLAYING';s.confirmedPlayerIds=[];s.feedback=null;deal(s,setup);
  }
  return {ok:true,state:parseLostCitiesState(s)};
}
export function cancelLostCities(input:LostCitiesState,now:LostCitiesState['startedAt']):LostCitiesState {
  if(input.phase==='FINISHED')return parseLostCitiesState(input);
  return parseLostCitiesState({...input,revision:v.parse(GameRevisionSchema,input.revision+1),phase:'FINISHED',finishedAt:now,result:{reason:'CANCELLED',winnerPlayerIds:[]},confirmedPlayerIds:[]});
}
