import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'valibot';
import { GameIdSchema, PlayerIdSchema, ServerTimeSchema, TurnIdSchema, CENTURY_COLORS, centurySum, type CenturyAction, type CenturyMerchant, type CenturySpices } from '@hangul-rummikub/shared';
import { makeCenturyCards } from './games/century/domain/catalog.js';
import { createCenturyGame, applyCenturyAction, parseCenturyState, centuryMerchant, centuryPoint, cancelCentury, type CenturyState } from './games/century/domain/game.js';
import { projectCentury } from './games/century/compatibility/projector.js';
let sequence=0;
const time=()=>parse(ServerTimeSchema,1000+sequence),turn=()=>parse(TurnIdSchema,`turn-${++sequence}`);
function setup(n=2,starter=0){const cards=makeCenturyCards(n,()=>`card-${++sequence}`);return createCenturyGame({...cards,gameId:parse(GameIdSchema,`game-${++sequence}`),playerIds:Array.from({length:n},(_,i)=>parse(PlayerIdSchema,`player-${i}`)),now:time(),transitionId:turn(),starter});}
function act(s:CenturyState,action:CenturyAction){const result=applyCenturyAction(s,s.activePlayerId,action,time(),turn());assert.ok(result.ok,JSON.stringify(action));return result.state;}
const zero=():CenturySpices=>[0,0,0,0];
function inHand(s:CenturyState,predicate:(c:CenturyMerchant)=>boolean){const card=s.merchants.find(c=>predicate(c)&&(s.merchantDeck.includes(c.cardId)||s.market.some(m=>m.cardId===c.cardId)));assert.ok(card);s.merchantDeck=s.merchantDeck.filter(id=>id!==card.cardId);s.market=s.market.filter(m=>m.cardId!==card.cardId);if(s.market.length<6){const id=s.merchantDeck.shift();if(id)s.market.push({cardId:id,spices:zero()});}s.players.find(p=>p.playerId===s.activePlayerId)!.hand.push(card.cardId);return card;}
function current(s:CenturyState){return s.players.find(p=>p.playerId===s.activePlayerId)!;}
function stored(s:CenturyState){return {gameId:s.gameId,gameRevision:s.revision,startedAt:s.startedAt,finishedAt:s.finishedAt,state:s};}
test('CENTURY setup: 2–5 players, all starters, exact deck facts and opaque unique zones',()=>{
 for(let n=2;n<=5;n++)for(let starter=0;starter<n;starter++){
  const s=setup(n,starter);assert.equal(s.market.length,6);assert.equal(s.pointMarket.length,5);assert.equal(s.merchantDeck.length,37);assert.equal(s.pointDeck.length,31);assert.equal(s.merchants.length,43+n*2);assert.equal(s.points.length,36);assert.equal(s.gold,n*2);
  s.players.forEach((p,i)=>{const seat=(i-starter+n)%n;assert.deepEqual(p.spices,seat===0?[3,0,0,0]:seat<3?[4,0,0,0]:[3,1,0,0]);assert.equal(p.hand.length,2);});
  assert.ok(s.merchants.some(c=>c.kind==='PRODUCE'&&c.gain.join()==='0,0,0,1'));assert.equal(s.merchants.some(c=>c.kind==='PRODUCE'&&c.gain.join()==='0,0,0,4'),false);parseCenturyState(s);
 }
 assert.throws(()=>setup(1));assert.throws(()=>setup(6));
});
test('CENTURY invalid actions leave live state and revision intact; owned cards and strict runtime input',()=>{
 const s=setup(),before=structuredClone(s),card=current(s).hand[0]!;
 for(const input of [{kind:'PRODUCE',cardId:s.players[1]!.hand[0],returned:zero()},{kind:'PRODUCE',cardId:'unknown',returned:zero()},{kind:'PRODUCE',cardId:card,returned:[1,0,0,0]},{kind:'PRODUCE',cardId:card,returned:zero(),gain:[99,0,0,0]},{kind:'TRADE',cardId:card,times:1,returned:zero()},{kind:'TRADE',cardId:card,times:Infinity,returned:zero()}]){assert.equal(applyCenturyAction(s,s.activePlayerId,input,time(),turn()).ok,false);assert.deepEqual(s,before);}
 const wrong=applyCenturyAction(s,s.players[1]!.playerId,{kind:'REST',returned:zero()},time(),turn());assert.deepEqual(wrong,{ok:false,reason:'NOT_YOUR_TURN'});
});
test('CENTURY production: exact overflow return, no early 10-cube limit, unused production is unavailable until rest',()=>{
 let s=setup();current(s).spices=[9,0,0,0];const card=current(s).hand[0]!,actor=s.activePlayerId;
 assert.equal(applyCenturyAction(s,actor,{kind:'PRODUCE',cardId:card,returned:zero()},time(),turn()).ok,false);
 s=act(s,{kind:'PRODUCE',cardId:card,returned:[1,0,0,0]});assert.deepEqual(s.players[0]!.spices,[10,0,0,0]);assert.deepEqual(s.players[0]!.played,[card]);assert.equal(s.revision,1);
 s=act(s,{kind:'REST',returned:zero()});assert.equal(applyCenturyAction(s,actor,{kind:'PRODUCE',cardId:card,returned:zero()},time(),turn()).ok,false);
 s=act(s,{kind:'REST',returned:zero()});assert.ok(s.players[0]!.hand.includes(card));assert.deepEqual(s.players[0]!.played,[]);
});
test('CENTURY trade: repeated exchange, sequential affordability, final discard and overflow above capacity mid-action',()=>{
 const s=setup();current(s).spices=[0,3,0,7];const card=inHand(s,c=>c.kind==='TRADE'&&c.cost.join()==='0,1,0,0'&&c.gain.join()==='3,0,0,0');
 const before=structuredClone(s);assert.equal(applyCenturyAction(s,s.activePlayerId,{kind:'TRADE',cardId:card.cardId,times:4,returned:zero()},time(),turn()).ok,false);assert.deepEqual(s,before);
 const next=act(s,{kind:'TRADE',cardId:card.cardId,times:3,returned:[6,0,0,0]});assert.deepEqual(next.players[0]!.spices,[3,0,0,7]);assert.deepEqual(next.feedback?.gained,[9,0,0,0]);
});
test('CENTURY upgrades: same cube twice, partial/zero upgrades, missing input, brown cannot upgrade',()=>{
 const s=setup(),card=current(s).hand[1]!;current(s).spices=[1,0,0,0];
 const next=act(s,{kind:'UPGRADE',cardId:card,upgrades:[0,1],returned:zero()});assert.deepEqual(next.players[0]!.spices,[0,0,1,0]);
 assert.deepEqual(act(s,{kind:'UPGRADE',cardId:card,upgrades:[],returned:zero()}).players[0]!.spices,[1,0,0,0]);
 for(const upgrades of [[0,0],[0,1,2],[3]])assert.equal(applyCenturyAction(s,s.activePlayerId,{kind:'UPGRADE',cardId:card,upgrades,returned:zero()},time(),turn()).ok,false);
});
test('CENTURY acquire: pay each earlier card before taking deposits, exact ID order, replenishment and immediate use prohibited',()=>{
 const s=setup(),target=s.market[3]!,first=s.market[0]!,before=structuredClone(s);target.spices=[0,2,0,0];const payment=s.market.slice(0,3).map(m=>({cardId:m.cardId,color:0 as const}));
 assert.equal(applyCenturyAction(s,s.activePlayerId,{kind:'ACQUIRE',cardId:target.cardId,payment:[...payment].reverse(),returned:zero()},time(),turn()).ok,false);
 const next=act(s,{kind:'ACQUIRE',cardId:target.cardId,payment,returned:zero()});assert.deepEqual(next.players[0]!.spices,[0,2,0,0]);assert.deepEqual(next.market[0]!.spices,[1,0,0,0]);assert.equal(next.market[0]!.cardId,first.cardId);assert.ok(next.players[0]!.hand.includes(target.cardId));assert.equal(next.merchantDeck.length,before.merchantDeck.length-1);
 current(s).spices=zero();target.spices=[9,0,0,0];assert.equal(applyCenturyAction(s,s.activePlayerId,{kind:'ACQUIRE',cardId:target.cardId,payment,returned:zero()},time(),turn()).ok,false);
 const free=act(s,{kind:'ACQUIRE',cardId:s.market[0]!.cardId,payment:[],returned:zero()});assert.equal(free.market.length,6);
});
test('CENTURY coins: last gold does not also award silver; silver moves to first slot',()=>{
 let s=setup();s.gold=1;s.players[1]!.gold=3;current(s).spices=[...centuryPoint(s,s.pointMarket[0]!).cost];s=act(s,{kind:'CLAIM',cardId:s.pointMarket[0]!,returned:zero()});assert.equal(s.players[0]!.gold,1);assert.equal(s.players[0]!.silver,0);assert.equal(s.gold,0);
 current(s).spices=[...centuryPoint(s,s.pointMarket[1]!).cost];s=act(s,{kind:'CLAIM',cardId:s.pointMarket[1]!,returned:zero()});assert.equal(s.players[1]!.silver,0);
 current(s).spices=[...centuryPoint(s,s.pointMarket[0]!).cost];s=act(s,{kind:'CLAIM',cardId:s.pointMarket[0]!,returned:zero()});assert.equal(s.players[0]!.silver,1);assert.equal(s.silver,3);
});
test('CENTURY final round completes all seats from every starting position; score items and cancellation',()=>{
 for(let n=2;n<=5;n++)for(let starter=0;starter<n;starter++){
  let s=setup(n,starter),p=current(s),target=n<=3?6:5;p.points.push(...s.pointDeck.splice(0,target-1));p.spices=[...centuryPoint(s,s.pointMarket[0]!).cost];s=parseCenturyState(s);
  s=act(s,{kind:'CLAIM',cardId:s.pointMarket[0]!,returned:zero()});assert.equal(s.phase,'PLAYING');assert.equal(s.finalRound,true);
  for(let i=1;i<n;i++){s=act(s,{kind:'REST',returned:zero()});assert.equal(s.phase,i===n-1?'FINISHED':'PLAYING');}
  assert.equal(s.result?.reason,'POINT_CARDS');assert.equal(s.result?.scores.length,n);assert.equal(s.result?.winnerPlayerIds.length,1);parseCenturyState(s);
 }
 const cancelled=cancelCentury(setup(),time());assert.deepEqual(cancelled.result?.winnerPlayerIds,[]);assert.equal(cancelled.result?.reason,'CANCELLED');assert.equal(applyCenturyAction(cancelled,cancelled.activePlayerId,{kind:'REST',returned:zero()},time(),turn()).ok,false);
});
test('CENTURY persistence rejects duplicate zones, altered card effects, negative resources, fake coins and false scores',()=>{
 const s=setup();for(const mutate of [(x:CenturyState)=>x.players[0]!.hand.push(x.players[1]!.hand[0]!), (x:CenturyState)=>{x.players[0]!.spices[0]=-1;},(x:CenturyState)=>{x.gold++;},(x:CenturyState)=>{x.points[0]!.points++;},(x:CenturyState)=>{x.finalRound=true;}]){const copy=structuredClone(s);mutate(copy);assert.throws(()=>parseCenturyState(copy));}
 const ended=cancelCentury(s,time());ended.result!.scores[0]!.total++;assert.throws(()=>parseCenturyState(ended));
});
test('CENTURY projection: no other hand/claimed IDs or deck order; public played cards and own points',()=>{
 const s=setup(5);s.players[1]!.points.push(s.pointDeck.shift()!);const view=projectCentury(stored(s),s.players[0]!.playerId),wire=JSON.stringify(view);
 for(const id of [...s.players.slice(1).flatMap(p=>[...p.hand,...p.points]),...s.merchantDeck,...s.pointDeck])assert.equal(wire.includes(`"${id}"`),false);
 assert.equal(view.privateState.hand.length,2);assert.equal(view.playerStates[1]!.pointCount,1);assert.equal('merchants' in view,false);assert.throws(()=>projectCentury(stored(s),parse(PlayerIdSchema,'outsider')));
});
test('CENTURY tied final totals favor the later seat relative to the starter',()=>{
 let s=setup();const sorted=[...s.points].sort((a,b)=>a.points-b.points);s.players[0]!.points=sorted.slice(0,6).map(c=>c.cardId);s.players[1]!.points=sorted.slice(6,11).map(c=>c.cardId);
 const used=new Set(s.players.flatMap(p=>p.points)),remaining=s.points.filter(c=>!used.has(c.cardId));s.pointMarket=remaining.slice(0,5).map(c=>c.cardId);s.pointDeck=remaining.slice(5).map(c=>c.cardId);
 const a=sorted.slice(0,6).reduce((n,c)=>n+c.points,0),b=sorted.slice(6,11).reduce((n,c)=>n+c.points,0);assert.ok(Math.abs(a-b)<=10);s.players[0]!.spices=[0,Math.max(0,b-a),0,0];s.players[1]!.spices=[0,Math.max(0,a-b),0,0];s.finalRound=true;s.activePlayerId=s.players[1]!.playerId;s=parseCenturyState(s);
 s=act(s,{kind:'REST',returned:zero()});assert.equal(s.result!.scores[0]!.total,s.result!.scores[1]!.total);assert.deepEqual(s.result!.winnerPlayerIds,[s.players[1]!.playerId]);
});
test('CENTURY complete games from legal base actions, all player counts and varied deterministic decks',()=>{
 for(let n=2;n<=5;n++)for(let seed=0;seed<3;seed++){
  const cards=makeCenturyCards(n,()=>`full-${++sequence}`);let rng=seed+1;
  for(let i=cards.points.length-1;i>0;i--){rng=(Math.imul(rng,1664525)+1013904223)>>>0;const j=rng%(i+1);[cards.points[i],cards.points[j]]=[cards.points[j]!,cards.points[i]!];}
  let s=createCenturyGame({...cards,gameId:parse(GameIdSchema,`full-game-${++sequence}`),playerIds:Array.from({length:n},(_,i)=>parse(PlayerIdSchema,`full-player-${i}`)),now:time(),transitionId:turn(),starter:seed%n});
  const targets=new Map<string,string>();let turns=0;
  while(s.phase==='PLAYING'&&turns++<2500){
   const p=current(s),points=s.pointMarket.map(id=>centuryPoint(s,id)),affordable=points.find(c=>CENTURY_COLORS.every(i=>p.spices[i]>=c.cost[i]));
   if(affordable){s=act(s,{kind:'CLAIM',cardId:affordable.cardId,returned:zero()});targets.delete(p.playerId);continue;}
   const target=points.find(c=>c.cardId===targets.get(p.playerId))??[...points].sort((a,b)=>CENTURY_COLORS.reduce<number>((t,i)=>t+Math.max(0,a.cost[i]-p.spices[i])*(i+1),0)-CENTURY_COLORS.reduce<number>((t,i)=>t+Math.max(0,b.cost[i]-p.spices[i])*(i+1),0))[0]!;targets.set(p.playerId,target.cardId);
   const hand=p.hand.map(id=>centuryMerchant(s,id)),upgrade=hand.find(c=>c.kind==='UPGRADE'),produce=hand.find(c=>c.kind==='PRODUCE');let action:CenturyAction={kind:'REST',returned:zero()};
   if(upgrade?.kind==='UPGRADE'){
    const cubes=[...p.spices],steps:(0|1|2)[]=[];
    for(let step=0;step<upgrade.steps;step++){let source:0|1|2|undefined;for(const dest of [3,2,1]){if(cubes[dest]!>=target.cost[dest]!)continue;source=([2,1,0] as const).find(i=>i<dest&&cubes[i]!>target.cost[i]);if(source!==undefined)break;}if(source===undefined)break;steps.push(source);cubes[source]!--;cubes[source+1]!++;}
    if(steps.length)action={kind:'UPGRADE',cardId:upgrade.cardId,upgrades:steps,returned:zero()};
   }
   if(action.kind==='REST'&&produce?.kind==='PRODUCE'&&(p.spices[0]<target.cost[0]||centurySum(p.spices)<10)){
    const after:CenturySpices=[...p.spices],returned=zero();for(const i of CENTURY_COLORS)after[i]+=produce.gain[i];let excess=Math.max(0,centurySum(after)-10);for(const i of CENTURY_COLORS){const discard=Math.min(excess,Math.max(0,after[i]-target.cost[i]));returned[i]=discard;excess-=discard;}assert.equal(excess,0);action={kind:'PRODUCE',cardId:produce.cardId,returned};
   }
   s=act(s,action);
  }
  assert.equal(s.phase,'FINISHED',`n=${n}, seed=${seed}, turns=${turns}`);assert.equal(s.result?.reason,'POINT_CARDS');assert.equal(s.revision%n,0);assert.ok(s.result!.scores.every(p=>p.total===p.cardPoints+p.coinPoints+p.spicePoints));
 }
});
