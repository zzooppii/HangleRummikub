import * as v from 'valibot';
import { GameIdSchema, GameRevisionSchema, PlayerIdSchema, TurnIdSchema, ServerTimeSchema, CenturyCardIdSchema, CenturyMerchantSchema, CenturyPointSchema, CenturySpicesSchema, CenturyCountSchema, CenturyActionSchema, CenturyResultSchema, CenturyFeedbackSchema, centurySum, CENTURY_COLORS, type CenturyAction, type CenturyMerchant, type CenturyPoint, type CenturySpices, type PlayerId } from '@hangul-rummikub/shared';
import { makeCenturyCards, centuryInventorySignature } from './catalog.js';
const ids = v.array(CenturyCardIdSchema);
const State = v.strictObject({
 gameId:GameIdSchema, rulesVersion:v.literal('century-spice-road-v1'), revision:GameRevisionSchema, phase:v.picklist(['PLAYING','FINISHED']), startedAt:ServerTimeSchema, finishedAt:v.nullable(ServerTimeSchema),
 transitionId:TurnIdSchema, activePlayerId:PlayerIdSchema, startingPlayerId:PlayerIdSchema, round:v.pipe(CenturyCountSchema,v.minValue(1)), finalRound:v.boolean(),
 merchants:v.array(CenturyMerchantSchema), points:v.array(CenturyPointSchema), merchantDeck:ids, pointDeck:ids,
 market:v.pipe(v.array(v.strictObject({cardId:CenturyCardIdSchema,spices:CenturySpicesSchema})),v.maxLength(6)), pointMarket:v.pipe(ids,v.maxLength(5)),
 gold:CenturyCountSchema,silver:CenturyCountSchema,
 players:v.pipe(v.array(v.strictObject({playerId:PlayerIdSchema,spices:CenturySpicesSchema,hand:ids,played:ids,points:ids,gold:CenturyCountSchema,silver:CenturyCountSchema})),v.minLength(2),v.maxLength(5)),
 result:v.nullable(CenturyResultSchema),feedback:CenturyFeedbackSchema,
});
export type CenturyState=v.InferOutput<typeof State>;
export function centuryMerchant(s:Pick<CenturyState,'merchants'>, id:string):CenturyMerchant {const c=s.merchants.find(c=>c.cardId===id);if(!c)throw new Error('Invalid Century merchant.');return c;}
export function centuryPoint(s:Pick<CenturyState,'points'>, id:string):CenturyPoint {const c=s.points.find(c=>c.cardId===id);if(!c)throw new Error('Invalid Century point card.');return c;}
export function scoreCentury(s:CenturyState){return s.players.map(p=>{const cardPoints=p.points.reduce((n,id)=>n+centuryPoint(s,id).points,0),coinPoints=p.gold*3+p.silver,spicePoints=p.spices[1]+p.spices[2]+p.spices[3];return {playerId:p.playerId,cardPoints,coinPoints,spicePoints,total:cardPoints+coinPoints+spicePoints};});}
function winner(s:CenturyState):PlayerId {const scores=scoreCentury(s), first=s.players.findIndex(p=>p.playerId===s.startingPlayerId);return [...scores].sort((a,b)=>b.total-a.total||((s.players.findIndex(p=>p.playerId===b.playerId)-first+s.players.length)%s.players.length)-((s.players.findIndex(p=>p.playerId===a.playerId)-first+s.players.length)%s.players.length))[0]!.playerId;}
const signature=(cards:readonly (CenturyMerchant|CenturyPoint)[])=>cards.map(centuryInventorySignature).sort().join('|');
export function parseCenturyState(input:unknown):CenturyState {
 const s=v.parse(State,input),players=new Set(s.players.map(p=>p.playerId)),n=players.size,target=n<=3?6:5;
 if(n!==s.players.length||!players.has(s.activePlayerId)||!players.has(s.startingPlayerId))throw new Error('Invalid Century roster.');
 let seq=0;const canonical=makeCenturyCards(n,()=>`validation-${++seq}`);
 if(signature(s.merchants)!==signature(canonical.merchants)||signature(s.points)!==signature(canonical.points))throw new Error('Century catalog mismatch.');
 const all=[...s.merchants,...s.points],allIds=new Set(all.map(c=>c.cardId));
 const merchantZones=[...s.merchantDeck,...s.market.map(m=>m.cardId),...s.players.flatMap(p=>[...p.hand,...p.played])],pointZones=[...s.pointDeck,...s.pointMarket,...s.players.flatMap(p=>p.points)],zones=[...merchantZones,...pointZones];
 if(allIds.size!==all.length||zones.length!==all.length||new Set(zones).size!==all.length||zones.some(id=>!allIds.has(id))||merchantZones.some(id=>!s.merchants.some(c=>c.cardId===id))||pointZones.some(id=>!s.points.some(c=>c.cardId===id)))throw new Error('Century card conservation failed.');
 if(s.players.some(p=>centurySum(p.spices)>10||p.points.length>target)||s.gold+s.players.reduce((t,p)=>t+p.gold,0)!==n*2||s.silver+s.players.reduce((t,p)=>t+p.silver,0)!==n*2)throw new Error('Century resource/coin invariant failed.');
 if(s.market.length<6&&s.merchantDeck.length>0||s.pointMarket.length<5&&s.pointDeck.length>0)throw new Error('Century market must be replenished.');
 if(s.finalRound!==s.players.some(p=>p.points.length>=target))throw new Error('Century final round mismatch.');
 if((s.phase==='FINISHED')!==(s.finishedAt!==null&&s.result!==null)||s.phase==='PLAYING'&&(s.finishedAt!==null||s.result!==null)||s.finishedAt!==null&&s.finishedAt<s.startedAt)throw new Error('Century finish mismatch.');
 if(s.feedback&&!players.has(s.feedback.playerId))throw new Error('Century feedback actor mismatch.');
 if(s.result){
  if(JSON.stringify(s.result.scores)!==JSON.stringify(scoreCentury(s)))throw new Error('Century score mismatch.');
  if(s.result.reason==='CANCELLED'?s.result.winnerPlayerIds.length!==0:!s.finalRound||s.result.winnerPlayerIds.length!==1||s.result.winnerPlayerIds[0]!==winner(s)||s.players[(s.players.findIndex(p=>p.playerId===s.activePlayerId)+1)%n]!.playerId!==s.startingPlayerId)throw new Error('Century winner mismatch.');
 }
 return s;
}
export function createCenturyGame(input:{gameId:CenturyState['gameId'];playerIds:PlayerId[];now:CenturyState['startedAt'];transitionId:CenturyState['transitionId'];starter:number;merchants:CenturyMerchant[];points:CenturyPoint[]}):CenturyState {
 const n=input.playerIds.length;if(n<2||n>5||!Number.isInteger(input.starter)||input.starter<0||input.starter>=n)throw new Error('Century requires 2–5 players.');
 const merchants=structuredClone(input.merchants),points=structuredClone(input.points),merchantDeck=merchants.slice(n*2).map(c=>c.cardId),pointDeck=points.map(c=>c.cardId);
 const players=input.playerIds.map((playerId,i)=>{const seat=(i-input.starter+n)%n;return {playerId,spices:[seat===0||seat>=3?3:4,seat>=3?1:0,0,0],hand:merchants.slice(i*2,i*2+2).map(c=>c.cardId),played:[],points:[],gold:0,silver:0};});
 return parseCenturyState({gameId:input.gameId,rulesVersion:'century-spice-road-v1',revision:0,phase:'PLAYING',startedAt:input.now,finishedAt:null,transitionId:input.transitionId,activePlayerId:input.playerIds[input.starter],startingPlayerId:input.playerIds[input.starter],round:1,finalRound:false,merchants,points,market:merchantDeck.splice(0,6).map(cardId=>({cardId,spices:[0,0,0,0]})),pointMarket:pointDeck.splice(0,5),merchantDeck,pointDeck,gold:n*2,silver:n*2,players,result:null,feedback:null});
}
export type CenturyApplied={ok:true;state:CenturyState}|{ok:false;reason:'INVALID_PHASE'|'NOT_YOUR_TURN'|'INVALID_ACTION'};
export function applyCenturyAction(current:CenturyState,actor:PlayerId,input:unknown,now:CenturyState['startedAt'],nextTurn:CenturyState['transitionId']):CenturyApplied {
 if(current.phase!=='PLAYING')return {ok:false,reason:'INVALID_PHASE'};
 if(current.activePlayerId!==actor)return {ok:false,reason:'NOT_YOUR_TURN'};
 const parsed=v.safeParse(CenturyActionSchema,input);if(!parsed.success)return {ok:false,reason:'INVALID_ACTION'};
 const action:CenturyAction=parsed.output,s=structuredClone(current),p=s.players.find(p=>p.playerId===actor)!;
 const spent:CenturySpices=[0,0,0,0],gained:CenturySpices=[0,0,0,0];
 const invalid=():CenturyApplied=>({ok:false,reason:'INVALID_ACTION'});
 const pay=(cost:CenturySpices)=>{if(CENTURY_COLORS.some(i=>p.spices[i]<cost[i]))return false;for(const i of CENTURY_COLORS){p.spices[i]-=cost[i];spent[i]+=cost[i];}return true;};
 const gain=(add:CenturySpices)=>{for(const i of CENTURY_COLORS){p.spices[i]+=add[i];gained[i]+=add[i];}};
 if(action.kind==='REST'){p.hand.push(...p.played);p.played=[];}
 else if(action.kind==='ACQUIRE'){
  const index=s.market.findIndex(m=>m.cardId===action.cardId);if(index<0||action.payment.length!==index)return invalid();
  for(let j=0;j<index;j++){const payment=action.payment[j]!,slot=s.market[j]!;if(payment.cardId!==slot.cardId||p.spices[payment.color]<1)return invalid();p.spices[payment.color]--;spent[payment.color]++;slot.spices[payment.color]++;}
  const [taken]=s.market.splice(index,1);gain(taken!.spices);p.hand.push(taken!.cardId);
  const cardId=s.merchantDeck.shift();if(cardId)s.market.push({cardId,spices:[0,0,0,0]});
 }else if(action.kind==='CLAIM'){
  const index=s.pointMarket.indexOf(action.cardId);if(index<0)return invalid();const card=centuryPoint(s,action.cardId);if(!pay(card.cost))return invalid();
  if(index===0&&s.gold>0){s.gold--;p.gold++;}else if((index===1&&s.gold>0||index===0&&s.gold===0)&&s.silver>0){s.silver--;p.silver++;}
  p.points.push(...s.pointMarket.splice(index,1));const id=s.pointDeck.shift();if(id)s.pointMarket.push(id);
 }else{
  const index=p.hand.indexOf(action.cardId);if(index<0)return invalid();const card=centuryMerchant(s,action.cardId);
  if(card.kind!==action.kind)return invalid();
  if(action.kind==='PRODUCE'&&card.kind==='PRODUCE')gain(card.gain);
  else if(action.kind==='TRADE'&&card.kind==='TRADE'){for(let i=0;i<action.times;i++){if(!pay(card.cost))return invalid();gain(card.gain);}}
  else if(action.kind==='UPGRADE'&&card.kind==='UPGRADE'){if(action.upgrades.length>card.steps)return invalid();for(const color of action.upgrades){if(p.spices[color]<1)return invalid();p.spices[color]--;p.spices[color+1]!++;spent[color]++;gained[color+1]!++;}}
  p.played.push(...p.hand.splice(index,1));
 }
 const excess=Math.max(0,centurySum(p.spices)-10);
 if(centurySum(action.returned)!==excess||CENTURY_COLORS.some(i=>action.returned[i]>p.spices[i]))return invalid();
 for(const i of CENTURY_COLORS)p.spices[i]-=action.returned[i];
 s.revision=v.parse(GameRevisionSchema,s.revision+1);s.feedback={playerId:actor,kind:action.kind,spent,gained,returned:[...action.returned],at:now};
 s.finalRound=s.players.some(p=>p.points.length>=(s.players.length<=3?6:5));
 const next=s.players[(s.players.findIndex(p=>p.playerId===actor)+1)%s.players.length]!.playerId;
 if(s.finalRound&&next===s.startingPlayerId){s.phase='FINISHED';s.finishedAt=now;s.result={reason:'POINT_CARDS',winnerPlayerIds:[winner(s)],scores:scoreCentury(s)};}
 else {s.activePlayerId=next;s.transitionId=nextTurn;if(next===s.startingPlayerId)s.round++;}
 return {ok:true,state:parseCenturyState(s)};
}
export function cancelCentury(current:CenturyState,now:CenturyState['startedAt']):CenturyState {if(current.phase==='FINISHED')return parseCenturyState(current);const s=structuredClone(current);s.phase='FINISHED';s.finishedAt=now;s.revision=v.parse(GameRevisionSchema,s.revision+1);s.result={reason:'CANCELLED',winnerPlayerIds:[],scores:scoreCentury(s)};return parseCenturyState(s);}
