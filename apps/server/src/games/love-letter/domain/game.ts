import * as v from "valibot";
import {
 GameIdSchema,GameRevisionSchema,PlayerIdSchema,ServerTimeSchema,TurnIdSchema,
 LoveLetterCardSchema,LoveLetterCardIdSchema,LoveLetterActionSchema,LoveLetterNoteSchema,LoveLetterEventSchema,LoveLetterRoundResultSchema,LoveLetterResultSchema,
 LOVE_LETTER_COUNTS,LOVE_LETTER_RANKS,loveLetterTargetTokens,
 type LoveLetterCard,type PlayerId,type GameId,type ServerTime,type TurnId,
} from "@hangul-rummikub/shared";
const count=v.pipe(v.number(),v.safeInteger(),v.minValue(0));
const PlayerSchema=v.strictObject({playerId:PlayerIdSchema,tokens:count,eliminated:v.boolean(),protected:v.boolean(),hand:v.pipe(v.array(LoveLetterCardSchema),v.maxLength(3)),discards:v.pipe(v.array(LoveLetterCardSchema),v.maxLength(21)),notes:v.pipe(v.array(LoveLetterNoteSchema),v.maxLength(64))});
const StateSchema=v.strictObject({gameId:GameIdSchema,revision:GameRevisionSchema,rulesVersion:v.literal('love-letter-21-v1'),startedAt:ServerTimeSchema,finishedAt:v.nullable(ServerTimeSchema),phase:v.picklist(['PLAYING','ROUND_RESULT','FINISHED']),stage:v.picklist(['PLAY_CARD','CHANCELLOR']),round:v.pipe(count,v.minValue(1)),roundId:TurnIdSchema,transitionId:TurnIdSchema,turnNumber:count,activePlayerId:PlayerIdSchema,players:v.pipe(v.array(PlayerSchema),v.minLength(2),v.maxLength(6)),deck:v.pipe(v.array(LoveLetterCardSchema),v.maxLength(21)),aside:v.nullable(LoveLetterCardSchema),faceUp:v.pipe(v.array(LoveLetterCardSchema),v.maxLength(3)),history:v.pipe(v.array(LoveLetterEventSchema),v.maxLength(64)),roundResults:v.pipe(v.array(LoveLetterRoundResultSchema),v.maxLength(30)),result:v.nullable(LoveLetterResultSchema)});
export type LoveLetterState=v.InferOutput<typeof StateSchema>;
type Player=LoveLetterState['players'][number];
type Outcome={ok:true;state:LoveLetterState}|{ok:false;reason:'INVALID_ACTION'|'INVALID_PHASE'|'NOT_YOUR_TURN'};
const invalid:Outcome={ok:false,reason:'INVALID_ACTION'};
export type LoveLetterRoundSetup={cards:LoveLetterCard[];starter:number};
export function makeLoveLetterCards(id:()=>string):LoveLetterCard[]{return LOVE_LETTER_RANKS.flatMap(rank=>Array.from({length:LOVE_LETTER_COUNTS[rank]},()=>({cardId:v.parse(LoveLetterCardIdSchema,id()),rank})));}
function allCards(s:LoveLetterState):LoveLetterCard[]{return [...s.deck,...(s.aside?[s.aside]:[]),...s.faceUp,...s.players.flatMap(p=>[...p.hand,...p.discards])];}
export function parseLoveLetterState(input:unknown):LoveLetterState {
 const s=v.parse(StateSchema,input),cards=allCards(s),ids=new Set(s.players.map(p=>p.playerId));
 if(ids.size!==s.players.length||!ids.has(s.activePlayerId)||cards.length!==21||new Set(cards.map(c=>c.cardId)).size!==21)throw new Error('Love Letter identity or conservation mismatch.');
 if(LOVE_LETTER_RANKS.some(r=>cards.filter(c=>c.rank===r).length!==LOVE_LETTER_COUNTS[r]))throw new Error('Love Letter inventory mismatch.');
 if(s.faceUp.length!==(s.players.length===2?3:0))throw new Error('Love Letter setup mismatch.');
 if(s.players.some(p=>p.eliminated&&(p.hand.length!==0||p.protected)))throw new Error('Love Letter eliminated hand mismatch.');
 if(s.players.some(p=>p.notes.some(n=>!ids.has(n.subjectPlayerId))))throw new Error('Love Letter private note subject mismatch.');
 if(s.history.some((e,i)=>e.sequence!==i+1||!ids.has(e.actorPlayerId)||(e.targetPlayerId!==null&&!ids.has(e.targetPlayerId))||e.eliminatedPlayerIds.some(id=>!ids.has(id))))throw new Error('Love Letter history mismatch.');
 if(s.phase==='PLAYING'){
  const active=s.players.find(p=>p.playerId===s.activePlayerId);
  if(!active||active.eliminated||active.protected||active.hand.length<2||active.hand.length>(s.stage==='CHANCELLOR'?3:2)||s.players.filter(p=>!p.eliminated).length<2)throw new Error('Love Letter active hand mismatch.');
  if(s.players.some(p=>p!==active&&!p.eliminated&&p.hand.length!==1)||s.finishedAt!==null||s.result!==null)throw new Error('Love Letter running state mismatch.');
  if(s.stage==='CHANCELLOR'&&s.history.at(-1)?.outcome!=='CHOOSE')throw new Error('Love Letter pending effect mismatch.');
 }else if(s.phase==='ROUND_RESULT'){
  if(s.roundResults.at(-1)?.round!==s.round||s.result!==null||s.finishedAt!==null||s.players.some(p=>p.hand.length>1))throw new Error('Love Letter round result mismatch.');
 }else if(s.result===null||s.finishedAt===null||s.result.winnerPlayerIds.some(id=>!ids.has(id)))throw new Error('Love Letter result mismatch.');
 if(s.roundResults.some((r,i)=>r.round!==i+1||r.winnerPlayerIds.length===0||new Set(r.winnerPlayerIds).size!==r.winnerPlayerIds.length||r.winnerPlayerIds.some(id=>!ids.has(id))||(r.spyPlayerId!==null&&!ids.has(r.spyPlayerId))))throw new Error('Love Letter round history mismatch.');
 const expectedRounds=s.phase==='PLAYING'||s.result?.reason==='CANCELLED'&&s.roundResults.at(-1)?.round!==s.round?s.round-1:s.round;
 if(s.roundResults.length!==expectedRounds)throw new Error('Love Letter round count mismatch.');
 for(const p of s.players){const earned=s.roundResults.reduce((n,r)=>n+Number(r.winnerPlayerIds.includes(p.playerId))+Number(r.spyPlayerId===p.playerId),0);if(p.tokens!==earned)throw new Error('Love Letter token mismatch.');}
 if(s.result?.reason==='TOKENS'){
  const winners=s.players.filter(p=>p.tokens>=loveLetterTargetTokens(s.players.length)).map(p=>p.playerId);
  if(winners.length===0||winners.length!==s.result.winnerPlayerIds.length||winners.some(id=>!s.result?.winnerPlayerIds.includes(id)))throw new Error('Love Letter match winner mismatch.');
 }
 return s;
}
function take(deck:LoveLetterCard[]):LoveLetterCard {const c=deck.shift();if(!c)throw new Error('Love Letter missing draw.');return c;}
function deal(s:LoveLetterState,cards:LoveLetterCard[],starter:number):void {
 s.deck=cards.map(c=>({...c}));s.aside=take(s.deck);s.faceUp=s.players.length===2?[take(s.deck),take(s.deck),take(s.deck)]:[];
 s.players.forEach(p=>{p.hand=[take(s.deck)];p.discards=[];p.notes=[];p.eliminated=false;p.protected=false;});
 const first=s.players[starter];if(!first)throw new Error('Love Letter starter missing.');
 s.activePlayerId=first.playerId;first.hand.push(take(s.deck));s.history=[];s.stage='PLAY_CARD';s.turnNumber=1;
}
export function createLoveLetterGame(input:LoveLetterRoundSetup&{gameId:GameId;playerIds:PlayerId[];now:ServerTime;transitionId:TurnId}):LoveLetterState {
 const s:LoveLetterState={gameId:input.gameId,revision:v.parse(GameRevisionSchema,0),rulesVersion:'love-letter-21-v1',startedAt:input.now,finishedAt:null,phase:'PLAYING',stage:'PLAY_CARD',round:1,roundId:input.transitionId,transitionId:input.transitionId,turnNumber:1,activePlayerId:input.playerIds[input.starter]!,players:input.playerIds.map(playerId=>({playerId,tokens:0,eliminated:false,protected:false,hand:[],discards:[],notes:[]})),deck:[],aside:null,faceUp:[],history:[],roundResults:[],result:null};
 deal(s,input.cards,input.starter);return parseLoveLetterState(s);
}
function eliminate(p:Player):void{p.discards.push(...p.hand);p.hand=[];p.eliminated=true;p.protected=false;}
function finishTurn(s:LoveLetterState,now:ServerTime):void{
 const alive=s.players.filter(p=>!p.eliminated);
 if(alive.length===1||s.deck.length===0){
  const max=Math.max(...alive.map(p=>p.hand[0]?.rank??-1));
  const winners=alive.filter(p=>p.hand[0]?.rank===max).map(p=>p.playerId);
  const spies=alive.filter(p=>p.discards.some(c=>c.rank===0));const spy=spies.length===1?spies[0]!.playerId:null;
  for(const p of s.players)p.tokens+=Number(winners.includes(p.playerId))+Number(spy===p.playerId);
  s.roundResults.push({round:s.round,reason:alive.length===1?'LAST_PLAYER':'DECK_EMPTY',winnerPlayerIds:winners,spyPlayerId:spy,reveals:alive.flatMap(p=>p.hand.map(c=>({playerId:p.playerId,rank:c.rank})))});
  const match=s.players.filter(p=>p.tokens>=loveLetterTargetTokens(s.players.length)).map(p=>p.playerId);
  s.stage='PLAY_CARD';
  if(match.length){s.phase='FINISHED';s.result={reason:'TOKENS',winnerPlayerIds:match};s.finishedAt=now;}else s.phase='ROUND_RESULT';
  return;
 }
 let index=s.players.findIndex(p=>p.playerId===s.activePlayerId);
 do{index=(index+1)%s.players.length;}while(s.players[index]!.eliminated);
 const next=s.players[index]!;s.activePlayerId=next.playerId;next.protected=false;next.hand.push(take(s.deck));s.turnNumber++;s.stage='PLAY_CARD';
}
export function loveLetterTargets(s:Pick<LoveLetterState,'players'>,actor:PlayerId,rank:number):PlayerId[]{
 if(![1,2,3,5,7].includes(rank))return [];
 return s.players.filter(p=>!p.eliminated&&(p.playerId===actor?rank===5:!p.protected)).map(p=>p.playerId);
}
export function applyLoveLetterAction(source:LoveLetterState,actor:PlayerId,input:unknown,now:ServerTime,nextId:TurnId):Outcome{
 const parsed=v.safeParse(LoveLetterActionSchema,input);if(!parsed.success)return invalid;
 if(source.phase!=='PLAYING')return {ok:false,reason:'INVALID_PHASE'};
 if(source.activePlayerId!==actor)return {ok:false,reason:'NOT_YOUR_TURN'};
 const action=parsed.output,s=parseLoveLetterState(source),p=s.players.find(p=>p.playerId===actor)!;
 if(action.kind==='CHANCELLOR'){
  if(s.stage!=='CHANCELLOR')return invalid;
  const ids=[action.keepCardId,...action.returnCardIds];
  if(ids.length!==p.hand.length||new Set(ids).size!==ids.length||ids.some(id=>!p.hand.some(c=>c.cardId===id)))return invalid;
  const keep=p.hand.find(c=>c.cardId===action.keepCardId)!;
  s.deck.push(...action.returnCardIds.map(id=>p.hand.find(c=>c.cardId===id)!));p.hand=[keep];
  s.history.push({sequence:s.history.length+1,actorPlayerId:actor,rank:6,targetPlayerId:null,guess:null,outcome:'RETURNED',eliminatedPlayerIds:[]});
  finishTurn(s,now);
 }else{
  if(s.stage!=='PLAY_CARD')return invalid;
  const card=p.hand.find(c=>c.cardId===action.cardId);if(!card)return invalid;
  if(p.hand.some(c=>c.rank===8)&&p.hand.some(c=>c.rank===5||c.rank===7)&&card.rank!==8)return invalid;
  const targets=loveLetterTargets(s,actor,card.rank);
  if(targets.length?(!action.targetPlayerId||!targets.includes(action.targetPlayerId)):action.targetPlayerId!==null)return invalid;
  if(card.rank===1&&targets.length>0?action.guess===null:action.guess!==null)return invalid;
  p.hand=p.hand.filter(c=>c.cardId!==card.cardId);p.discards.push(card);
  const target=s.players.find(p=>p.playerId===action.targetPlayerId);
  const event:v.InferOutput<typeof LoveLetterEventSchema>={sequence:s.history.length+1,actorPlayerId:actor,rank:card.rank,targetPlayerId:action.targetPlayerId,guess:action.guess,outcome:'PLAYED',eliminatedPlayerIds:[]};
  const eliminatedBefore=new Set(s.players.filter(p=>p.eliminated).map(p=>p.playerId));
  if([1,2,3,7].includes(card.rank)&&!target)event.outcome='NO_TARGET';
  else switch(card.rank){
   case 1: if(target){if(target.hand[0]?.rank===action.guess){eliminate(target);event.outcome='HIT';}else event.outcome='MISS';}break;
   case 2: if(target){p.notes.push({turn:s.turnNumber,subjectPlayerId:target.playerId,rank:target.hand[0]!.rank,source:'PRIEST'});event.outcome='LOOK';}break;
   case 3: if(target){const a=p.hand[0]!,b=target.hand[0]!;p.notes.push({turn:s.turnNumber,subjectPlayerId:target.playerId,rank:b.rank,source:'BARON'});target.notes.push({turn:s.turnNumber,subjectPlayerId:actor,rank:a.rank,source:'BARON'});if(a.rank<b.rank)eliminate(p);if(b.rank<a.rank)eliminate(target);event.outcome='COMPARE';}break;
   case 4:p.protected=true;event.outcome='PROTECTED';break;
   case 5:if(target){const discarded=take(target.hand);target.discards.push(discarded);if(discarded.rank===9){eliminate(target);event.outcome='ELIMINATED';}else{if(s.deck.length)target.hand=[take(s.deck)];else{if(!s.aside)throw new Error('Love Letter reserve missing.');target.hand=[s.aside];s.aside=null;}event.outcome='REDRAW';}}break;
   case 6: {const draws=Math.min(2,s.deck.length);for(let i=0;i<draws;i++)p.hand.push(take(s.deck));if(draws>0){s.stage='CHANCELLOR';event.outcome='CHOOSE';}break;}
   case 7:if(target){const hand=p.hand;p.hand=target.hand;target.hand=hand;event.outcome='SWAP';}break;
   case 9:eliminate(p);event.outcome='ELIMINATED';break;
  }
  event.eliminatedPlayerIds=s.players.filter(p=>p.eliminated&&!eliminatedBefore.has(p.playerId)).map(p=>p.playerId);
  s.history.push(event);
  if(s.stage!=='CHANCELLOR')finishTurn(s,now);
 }
 s.revision=v.parse(GameRevisionSchema,s.revision+1);s.transitionId=nextId;
 return {ok:true,state:parseLoveLetterState(s)};
}
export function confirmLoveLetterRound(source:LoveLetterState,_actor:PlayerId,setup:LoveLetterRoundSetup,nextId:TurnId):Outcome{
 if(source.phase!=='ROUND_RESULT')return {ok:false,reason:'INVALID_PHASE'};
 const s=parseLoveLetterState(source),winners=s.roundResults.at(-1)!.winnerPlayerIds,starter=winners[setup.starter];if(!starter)return invalid;
 s.phase='PLAYING';s.round++;s.roundId=nextId;s.transitionId=nextId;s.revision=v.parse(GameRevisionSchema,s.revision+1);
 deal(s,setup.cards,s.players.findIndex(p=>p.playerId===starter));return {ok:true,state:parseLoveLetterState(s)};
}
export function cancelLoveLetter(source:LoveLetterState,now:ServerTime):LoveLetterState{
 const s=parseLoveLetterState(source);s.phase='FINISHED';s.result={reason:'CANCELLED',winnerPlayerIds:[]};s.finishedAt=now;s.revision=v.parse(GameRevisionSchema,s.revision+1);return parseLoveLetterState(s);
}
