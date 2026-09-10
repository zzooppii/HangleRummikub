import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "valibot";
import { GameIdSchema, PlayerIdSchema, ServerTimeSchema, TurnIdSchema, JaipurCardIdSchema, type JaipurCardType, type JaipurAction } from "@hangul-rummikub/shared";
import { makeJaipurCards, JAIPUR_BONUS_VALUES } from "./games/jaipur/domain/catalog.js";
import { createJaipurGame, applyJaipurAction, confirmJaipurRound, cancelJaipur, parseJaipurState, scoreJaipurRound, jaipurCard, type JaipurState } from "./games/jaipur/domain/game.js";
import { projectJaipur } from "./games/jaipur/compatibility/projector.js";

let sequence=0;
const now=parse(ServerTimeSchema,1000),next=()=>parse(TurnIdSchema,`jaipur-turn-${++sequence}`);
const playerIds=['a','b'].map(s=>parse(PlayerIdSchema,s));
function setup(seed=1) {
  const cards=makeJaipurCards(()=>`opaque-${++sequence}`);
  let random=seed;
  for(let i=cards.length-1;i>0;i--){random=(random*1664525+1013904223)>>>0;const j=random%(i+1);[cards[i],cards[j]]=[cards[j]!,cards[i]!];}
  return {cards,bonusBank:JAIPUR_BONUS_VALUES.map(b=>({size:b.size,values:[...b.values]}))};
}
function initial(seed=1){return createJaipurGame({...setup(seed),gameId:parse(GameIdSchema,'jaipur-game'),playerIds,now,transitionId:next(),starter:0});}
function rig(hand:JaipurCardType[],market:JaipurCardType[],herd=0):JaipurState {
  const s=initial(),available=[...s.cards];
  const take=(type:JaipurCardType)=>{const index=available.findIndex(c=>c.type===type);assert.ok(index>=0);return available.splice(index,1)[0]!.cardId;};
  s.players.forEach(p=>{p.hand=[];p.herd=[];});
  s.players[0]!.hand=hand.map(take);s.players[0]!.herd=Array.from({length:herd},()=>take('CAMEL'));
  s.market=market.map(take);s.deck=available.map(c=>c.cardId);s.discard=[];
  return parseJaipurState(s);
}
function apply(s:JaipurState,action:JaipurAction){const before=structuredClone(s),r=applyJaipurAction(s,s.activePlayerId,action,now,next());assert.ok(r.ok,r.ok?'':r.reason);assert.deepEqual(s,before);return r.state;}
function drain(s:JaipurState,type:JaipurState['goodsBank'][number]['type'],remaining=0){const bank=s.goodsBank.find(b=>b.type===type)!;for(const value of bank.values.splice(0,bank.values.length-remaining))s.players[1]!.goodsTokens.push({type,value});}
const market:JaipurCardType[]=['DIAMOND','CLOTH','SPICE','CAMEL','CAMEL'];

test('Jaipur: two players, 55 opaque cards, setup and all token inventories',()=>{
  const s=initial();assert.equal(s.cards.length,55);assert.equal(new Set(s.cards.map(c=>c.cardId)).size,55);assert.equal(s.market.length,5);assert.equal(s.deck.length,40);assert.equal(s.players.flatMap(p=>[...p.hand,...p.herd]).length,10);assert.ok(s.market.filter(id=>jaipurCard(s,id).type==='CAMEL').length>=3);
  assert.equal(s.goodsBank.reduce((n,b)=>n+b.values.length,0),38);assert.equal(s.bonusBank.reduce((n,b)=>n+b.values.length,0),18);
  for(const ids of [playerIds.slice(0,1),[...playerIds,parse(PlayerIdSchema,'c')],[playerIds[0]!,playerIds[0]!]])assert.throws(()=>createJaipurGame({...setup(),gameId:s.gameId,playerIds:ids,now,transitionId:next(),starter:0}));
});
test('Jaipur: single good refills market; all camels go into the separate herd',()=>{
  const s=rig(['LEATHER'],market);const taken=apply(s,{kind:'TAKE_GOOD',cardId:s.market[0]!});assert.equal(taken.players[0]!.hand.length,2);assert.equal(taken.market.length,5);assert.equal(taken.deck.length,s.deck.length-1);assert.equal(taken.activePlayerId,playerIds[1]);
  const camels=apply(s,{kind:'TAKE_CAMELS'});assert.equal(camels.players[0]!.herd.length,2);assert.equal(camels.players[0]!.hand.length,1);assert.equal(camels.deck.length,s.deck.length-2);
});
test('Jaipur: exchange goods and herd atomically without drawing',()=>{
  const s=rig(['LEATHER','LEATHER','GOLD'],market,2),hand=s.players[0]!.hand;
  const out=apply(s,{kind:'EXCHANGE',marketCardIds:s.market.slice(0,2),handCardIds:[hand[0]!],camelCount:1});
  assert.equal(out.deck.length,s.deck.length);assert.equal(out.players[0]!.hand.length,4);assert.equal(out.players[0]!.herd.length,1);assert.ok(out.market.includes(hand[0]!));
});
test('Jaipur: invalid IDs, duplicates, same-type exchange, one-for-one and hand overflow leave state unchanged',()=>{
  const s=rig(['CLOTH','CLOTH','LEATHER','LEATHER','GOLD','SILVER','SPICE'],market,3),before=structuredClone(s),h=s.players[0]!.hand;
  const foreign=s.deck[0]!,unknown=parse(JaipurCardIdSchema,'does-not-exist');
  const invalid:unknown[]=[{kind:'TAKE_GOOD',cardId:s.market[0]},{kind:'TAKE_GOOD',cardId:foreign},{kind:'TAKE_GOOD',cardId:unknown},{kind:'TAKE_GOOD',cardId:s.market[3]},
    {kind:'SELL',cardIds:[h[0],h[0]]},{kind:'SELL',cardIds:[foreign]},{kind:'SELL',cardIds:[unknown]},
    {kind:'EXCHANGE',marketCardIds:[s.market[0]],handCardIds:[h[2]],camelCount:0},
    {kind:'EXCHANGE',marketCardIds:s.market.slice(0,2),handCardIds:[h[0],h[2]],camelCount:0},
    {kind:'EXCHANGE',marketCardIds:s.market.slice(0,2),handCardIds:[],camelCount:2},
    {kind:'EXCHANGE',marketCardIds:[s.market[0],s.market[0]],handCardIds:[h[2],h[3]],camelCount:0},
    {kind:'EXCHANGE',marketCardIds:s.market.slice(0,2),handCardIds:[],camelCount:4},{kind:'PASS'}];
  for(const action of invalid){assert.equal(applyJaipurAction(s,s.activePlayerId,action,now,next()).ok,false);assert.deepEqual(s,before);}
  assert.equal(applyJaipurAction(s,playerIds[1]!,{kind:'TAKE_CAMELS'},now,next()).ok,false);
});
test('Jaipur: selling expensive goods needs two; mixed sales and empty sales fail',()=>{
  const s=rig(['GOLD','LEATHER'],market);
  for(const cardIds of [[],[s.players[0]!.hand[0]],s.players[0]!.hand])assert.equal(applyJaipurAction(s,s.activePlayerId,{kind:'SELL',cardIds},now,next()).ok,false);
});
for(const amount of [3,4,5,6,7])test(`Jaipur: sale of ${amount} uses descending tokens and correct bonus tier`,()=>{
  const s=rig(Array.from({length:amount},()=> 'LEATHER'),market);const out=apply(s,{kind:'SELL',cardIds:s.players[0]!.hand});
  assert.equal(out.players[0]!.hand.length,0);assert.deepEqual(out.players[0]!.goodsTokens.map(t=>t.value),[4,3,2,1,1,1,1].slice(0,amount));assert.equal(out.players[0]!.bonusTokens[0]?.size,Math.min(amount,5));
});
test('Jaipur: fewer goods tokens still grants sale-size bonus; empty bonus stack creates nothing',()=>{
  const s=rig(['GOLD','GOLD','GOLD'],market);drain(s,'GOLD',1);
  const out=apply(parseJaipurState(s),{kind:'SELL',cardIds:s.players[0]!.hand});assert.equal(out.players[0]!.goodsTokens.length,1);assert.equal(out.players[0]!.bonusTokens.length,1);
  const s2=rig(['LEATHER','LEATHER','LEATHER'],market),bank=s2.bonusBank.find(b=>b.size===3)!;
  for(const value of bank.values.splice(0))s2.players[1]!.bonusTokens.push({size:3,value});
  const out2=apply(parseJaipurState(s2),{kind:'SELL',cardIds:s2.players[0]!.hand});assert.equal(out2.players[0]!.bonusTokens.length,0);assert.equal(out2.bonusBank.find(b=>b.size===3)?.values.length,0);
});
test('Jaipur: three depleted goods types end the round immediately',()=>{
  const s=rig(['GOLD','GOLD'],market);drain(s,'DIAMOND');drain(s,'SILVER');drain(s,'GOLD',1);
  const out=apply(parseJaipurState(s),{kind:'SELL',cardIds:s.players[0]!.hand});assert.equal(out.phase,'ROUND_RESULT');assert.equal(out.roundResults[0]?.reason,'GOODS_DEPLETED');
});
test('Jaipur: empty deck alone does not finish; inability to refill does',()=>{
  const s=rig(['LEATHER'],market);s.discard.push(...s.deck.splice(1));
  const out=apply(parseJaipurState(s),{kind:'TAKE_GOOD',cardId:s.market[0]!});assert.equal(out.deck.length,0);assert.equal(out.market.length,5);assert.equal(out.phase,'PLAYING');
  const finish=apply(out,{kind:'TAKE_CAMELS'});assert.equal(finish.phase,'ROUND_RESULT');assert.equal(finish.roundResults[0]?.reason,'DECK_DEPLETED');
});
test('Jaipur: score ties use bonus counts then goods counts, camel ties grant no token',()=>{
  const s=rig([],market);let r=scoreJaipurRound(s,'DECK_DEPLETED');assert.equal(r.winnerPlayerId,null);assert.ok(r.scores.every(p=>p.camelPoints===0));
  s.players[0]!.bonusTokens=[{size:3,value:1},{size:3,value:1}];s.players[1]!.bonusTokens=[{size:3,value:2}];r=scoreJaipurRound(s,'DECK_DEPLETED');assert.equal(r.winnerPlayerId,playerIds[0]);
  s.players[0]!.bonusTokens=[];s.players[1]!.bonusTokens=[];s.players[0]!.goodsTokens=[{type:'LEATHER',value:1},{type:'LEATHER',value:1}];s.players[1]!.goodsTokens=[{type:'LEATHER',value:2}];assert.equal(scoreJaipurRound(s,'DECK_DEPLETED').winnerPlayerId,playerIds[0]);
  const camel=rig([],market,1);assert.equal(scoreJaipurRound(camel,'DECK_DEPLETED').scores[0]?.camelPoints,5);
});
test('Jaipur: both round confirmations, loser starts, fresh card IDs and monotonic match revision',()=>{
  const s=rig([],market,1);s.discard.push(...s.deck.splice(0));const end=apply(parseJaipurState(s),{kind:'TAKE_CAMELS'});assert.equal(end.phase,'ROUND_RESULT');
  const one=confirmJaipurRound(end,playerIds[0]!,setup(4),next());assert.ok(one.ok);assert.equal(one.state.phase,'ROUND_RESULT');assert.equal(confirmJaipurRound(one.state,playerIds[0]!,setup(),next()).ok,false);
  const two=confirmJaipurRound(one.state,playerIds[1]!,setup(5),next());assert.ok(two.ok);assert.equal(two.state.phase,'PLAYING');assert.equal(two.state.round,2);assert.equal(two.state.gameId,end.gameId);assert.equal(two.state.revision,end.revision+2);assert.notEqual(two.state.roundId,end.roundId);assert.equal(two.state.startingPlayerId,playerIds[1]);assert.ok(two.state.cards.every(c=>!end.cards.some(old=>old.cardId===c.cardId)));
  assert.equal(cancelJaipur(one.state,now).phase,'FINISHED');
});
test('Jaipur: snapshots hide opponent hand, herd, deck IDs/order and bonus values',()=>{
  const s=rig(['GOLD','LEATHER'],market,2),stored={gameId:s.gameId,gameRevision:s.revision,startedAt:s.startedAt,finishedAt:s.finishedAt,state:s};
  const a=projectJaipur(stored,playerIds[0]!),b=projectJaipur(stored,playerIds[1]!);assert.equal(a.privateState.hand.length,2);assert.equal(a.privateState.camelCount,2);
  for(const id of [...s.players[0]!.hand,...s.players[0]!.herd,...s.deck])assert.equal(JSON.stringify(b).includes(id),false);
  assert.ok(b.playerStates.every(p=>!('camelCount' in p)&&!('score' in p)));assert.ok(b.bonusBank.every(p=>!('values' in p)));assert.throws(()=>projectJaipur(stored,parse(PlayerIdSchema,'stranger')));
});
test('Jaipur: corrupt stored card/token counts and inconsistent winners are rejected',()=>{
  const s=initial();for(const mutate of [(x:JaipurState)=>x.deck.push(x.deck[0]!), (x:JaipurState)=>x.goodsBank[0]!.values.pop(),(x:JaipurState)=>x.bonusBank[0]!.values.push(3),(x:JaipurState)=>{x.players[0]!.seals=1;}]){const bad=structuredClone(s);mutate(bad);assert.throws(()=>parseJaipurState(bad));}
});
test('Jaipur: twenty deterministic full matches conserve inventory and finish with two seals',()=>{
  for(let seed=1;seed<=20;seed++){
    let s=initial(seed),steps=0;
    while(s.phase!=='FINISHED'&&steps++<800){
      if(s.phase==='ROUND_RESULT'){for(const actor of playerIds){const r=confirmJaipurRound(s,actor,setup(seed+steps),next());assert.ok(r.ok);s=r.state;}continue;}
      const p=s.players.find(p=>p.playerId===s.activePlayerId)!,groups=new Map<JaipurCardType,typeof p.hand>();
      for(const id of p.hand){const type=jaipurCard(s,id).type;groups.set(type,[...(groups.get(type)??[]),id]);}
      const sale=[...groups].find(([type,ids])=>!['DIAMOND','GOLD','SILVER'].includes(type)||ids.length>=2);
      const single=s.market.find(id=>jaipurCard(s,id).type!=='CAMEL');
      s=apply(s,sale?{kind:'SELL',cardIds:sale[1]}:single&&p.hand.length<7?{kind:'TAKE_GOOD',cardId:single}:{kind:'TAKE_CAMELS'});
    }
    assert.equal(s.phase,'FINISHED');assert.equal(s.result?.reason,'SEALS');assert.equal(s.players.filter(p=>p.seals===2).length,1);assert.ok(s.roundResults.length>=2);assert.deepEqual(parseJaipurState(s),s);
  }
});
