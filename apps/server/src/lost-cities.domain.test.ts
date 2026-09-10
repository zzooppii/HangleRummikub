import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "valibot";
import { GameIdSchema, PlayerIdSchema, ServerTimeSchema, TurnIdSchema, LOST_CITIES_SUITS, type LostCitiesCard, type LostCitiesSuit } from "@hangul-rummikub/shared";
import { makeLostCitiesCards } from "./games/lost-cities/domain/catalog.js";
import { applyLostCitiesAction, cancelLostCities, confirmLostCitiesRound, createLostCitiesGame, lostCitiesCard, parseLostCitiesState, scoreLostCitiesExpedition, type LostCitiesState } from "./games/lost-cities/domain/game.js";
import { projectLostCities } from "./games/lost-cities/compatibility/projector.js";
import { shuffleFrozen } from "./domain/frozen-fisher-yates.js";
let seq=0;
const at=parse(ServerTimeSchema,1000),next=()=>parse(TurnIdSchema,`transition-${++seq}`),a=parse(PlayerIdSchema,'a'),b=parse(PlayerIdSchema,'b');
function setup(seed=0){let x=seed+1;return {cards:[...shuffleFrozen(makeLostCitiesCards(()=>`card-${++seq}`),{nextInt(n){x=(x*1664525+1013904223)>>>0;return x%n;}})]};}
function game(seed=0){return createLostCitiesGame({...setup(seed),gameId:parse(GameIdSchema,`game-${++seq}`),playerIds:[a,b],now:at,transitionId:next(),starter:0});}
function card(s:LostCitiesState,suit:LostCitiesSuit,value:number|'I',copy=0){return s.cards.filter(c=>c.suit===suit&&(value==='I'?c.kind==='INVESTMENT':c.kind==='NUMBER'&&c.value===value))[copy]!;}
function arrange(s:LostCitiesState,hand:LostCitiesCard[],expeditions:LostCitiesCard[]=[],discard:LostCitiesCard[]=[]){
  const used=new Set([...hand,...expeditions,...discard].map(c=>c.cardId)),remaining=s.cards.filter(c=>!used.has(c.cardId)).map(c=>c.cardId);
  s.players[0]!.hand=[...hand.map(c=>c.cardId),...remaining.splice(0,8-hand.length)];s.players[1]!.hand=remaining.splice(0,8);s.deck=remaining;
  s.players[0]!.expeditions=LOST_CITIES_SUITS.map(suit=>({suit,cards:expeditions.filter(c=>c.suit===suit).map(c=>c.cardId)}));
  s.discards=LOST_CITIES_SUITS.map(suit=>({suit,cards:discard.filter(c=>c.suit===suit).map(c=>c.cardId)}));return parseLostCitiesState(s);
}
function accept(r:ReturnType<typeof applyLostCitiesAction>){assert.ok(r.ok,r.ok?'':r.reason);return r.state;}
function finishRound(initial:LostCitiesState){let s=initial;for(let i=0;i<44&&s.phase==='PLAYING';i++){const p=s.players.find(p=>p.playerId===s.activePlayerId)!;s=accept(applyLostCitiesAction(s,p.playerId,{kind:'DISCARD',cardId:p.hand[0],draw:{kind:'DECK'}},at,next()));}return s;}

test('Lost Cities inventory: 60 unique cards, eight private cards each, deterministic injected shuffle',()=>{
  const s=game();assert.equal(s.cards.length,60);assert.equal(new Set(s.cards.map(c=>c.cardId)).size,60);assert.deepEqual(s.players.map(p=>p.hand.length),[8,8]);assert.equal(s.deck.length,44);
  for(const suit of LOST_CITIES_SUITS){assert.equal(s.cards.filter(c=>c.suit===suit&&c.kind==='INVESTMENT').length,3);assert.deepEqual(s.cards.filter(c=>c.suit===suit&&c.kind==='NUMBER').map(c=>c.kind==='NUMBER'?c.value:0).sort((a,b)=>a-b),[2,3,4,5,6,7,8,9,10]);}
  assert.throws(()=>createLostCitiesGame({...setup(),gameId:s.gameId,playerIds:[a,a],now:at,transitionId:next(),starter:0}));
});
test('Lost Cities scoring: empty, investments only, negative multipliers and flat eight-card bonus',()=>{
  const s=game(),suit='DESERT';
  assert.equal(scoreLostCitiesExpedition(suit,[]).total,0);
  assert.equal(scoreLostCitiesExpedition(suit,[card(s,suit,'I')]).total,-40);
  assert.equal(scoreLostCitiesExpedition(suit,[card(s,suit,'I'),card(s,suit,'I',1),card(s,suit,2)]).total,-54);
  const seven=[card(s,suit,'I'),card(s,suit,'I',1),...[2,3,4,5,6].map(v=>card(s,suit,v))];
  assert.equal(scoreLostCitiesExpedition(suit,seven).total,0);
  const score=scoreLostCitiesExpedition(suit,[...seven,card(s,suit,7)]);assert.equal(score.total,41);assert.equal(score.bonus,20);assert.equal(score.multiplier,3);
  assert.equal(scoreLostCitiesExpedition(suit,s.cards.filter(c=>c.suit===suit)).total,156);
});
test('Lost Cities rejects lower numbers, late investments, unavailable draw and foreign IDs without mutation',()=>{
  const base=game(),low=card(base,'DESERT',3),invest=card(base,'DESERT','I'),high=card(base,'DESERT',8);
  const s=arrange(base,[low,invest,high],[card(base,'DESERT',5)]),before=structuredClone(s);
  for(const id of [low.cardId,invest.cardId,s.players[1]!.hand[0],'unknown'])assert.deepEqual(applyLostCitiesAction(s,a,{kind:'PLAY',cardId:id,draw:{kind:'DECK'}},at,next()),{ok:false,reason:'INVALID_ACTION'});
  assert.deepEqual(applyLostCitiesAction(s,b,{kind:'PLAY',cardId:high.cardId,draw:{kind:'DECK'}},at,next()),{ok:false,reason:'NOT_YOUR_TURN'});
  assert.equal(applyLostCitiesAction(s,a,{kind:'PLAY',cardId:high.cardId,draw:{kind:'DISCARD',suit:'OCEAN'}},at,next()).ok,false);
  assert.deepEqual(s,before);
  const nextState=accept(applyLostCitiesAction(s,a,{kind:'PLAY',cardId:high.cardId,draw:{kind:'DECK'}},at,next()));assert.equal(nextState.deck.length,s.deck.length-1);assert.equal(nextState.players[0]!.hand.length,8);assert.equal(nextState.activePlayerId,b);
});
test('Lost Cities discard draw: top only, no deck depletion and no immediately reclaiming the discard',()=>{
  const base=game(),offered=card(base,'DESERT',8),bottom=card(base,'OCEAN',2),top=card(base,'OCEAN',5);
  const s=arrange(base,[offered],[],[bottom,top]),before=structuredClone(s);
  const r=accept(applyLostCitiesAction(s,a,{kind:'DISCARD',cardId:offered.cardId,draw:{kind:'DISCARD',suit:'OCEAN'}},at,next()));
  assert.equal(r.deck.length,s.deck.length);assert.ok(r.players[0]!.hand.includes(top.cardId));assert.deepEqual(r.discards.find(d=>d.suit==='OCEAN')!.cards,[bottom.cardId]);assert.deepEqual(s,before);
  assert.equal(applyLostCitiesAction(s,a,{kind:'DISCARD',cardId:offered.cardId,draw:{kind:'DISCARD',suit:'DESERT'}},at,next()).ok,false);
  const sameSuit=arrange(game(),[],[]);const candidate=sameSuit.players[0]!.hand[0]!;
  assert.equal(applyLostCitiesAction(sameSuit,a,{kind:'DISCARD',cardId:candidate,draw:{kind:'DISCARD',suit:lostCitiesCard(sameSuit,candidate).suit}},at,next()).ok,false);
});
test('Lost Cities last deck card settles immediately; two confirmations deal fresh identities',()=>{
  let s=game();while(s.deck.length>1){const id=s.deck.shift()!,c=lostCitiesCard(s,id);s.discards.find(d=>d.suit===c.suit)!.cards.push(id);}s=parseLostCitiesState(s);
  const draw=s.deck[0]!,p=s.players[0]!,oldIds=new Set(s.cards.map(c=>c.cardId));
  const ended=accept(applyLostCitiesAction(s,a,{kind:'DISCARD',cardId:p.hand[0],draw:{kind:'DECK'}},at,next()));
  assert.equal(ended.phase,'ROUND_RESULT');assert.equal(ended.deck.length,0);assert.ok(ended.players[0]!.hand.includes(draw));assert.equal(ended.roundResults.length,1);
  assert.equal(applyLostCitiesAction(ended,b,{kind:'DISCARD',cardId:ended.players[1]!.hand[0],draw:{kind:'DECK'}},at,next()).ok,false);
  const first=accept(confirmLostCitiesRound(ended,a,null,next()));assert.equal(first.phase,'ROUND_RESULT');assert.deepEqual(first.players,ended.players);
  assert.equal(confirmLostCitiesRound(first,a,setup(),next()).ok,false);
  const second=accept(confirmLostCitiesRound(first,b,setup(),next()));assert.equal(second.phase,'PLAYING');assert.equal(second.round,2);assert.equal(second.startingPlayerId,b);assert.equal(second.deck.length,44);assert.ok(second.cards.every(c=>!oldIds.has(c.cardId)));assert.notEqual(second.roundId,ended.roundId);
});
test('Lost Cities three rounds use cumulative scores; drawn cards stay private in every projection',()=>{
  for(let seed=0;seed<20;seed++){
    let s=game(seed);
    for(let round=1;round<=3;round++){
      for(let turn=0;s.phase==='PLAYING'&&turn<44;turn++){
        const p=s.players.find(p=>p.playerId===s.activePlayerId)!,c=lostCitiesCard(s,p.hand[0]!),e=p.expeditions.find(e=>e.suit===c.suit)!;
        const canPlay=!e.cards.length||(c.kind==='NUMBER'&&e.cards.every(id=>{const old=lostCitiesCard(s,id);return old.kind==='INVESTMENT'||old.value<c.value;}))||c.kind==='INVESTMENT'&&e.cards.every(id=>lostCitiesCard(s,id).kind==='INVESTMENT');
        const before=structuredClone(s);s=accept(applyLostCitiesAction(s,p.playerId,{kind:canPlay?'PLAY':'DISCARD',cardId:c.cardId,draw:{kind:'DECK'}},at,next()));assert.equal(before.deck.length-1,s.deck.length);
        for(const viewer of [a,b]){const projected=projectLostCities({gameId:s.gameId,gameRevision:s.revision,startedAt:s.startedAt,finishedAt:s.finishedAt,state:s},viewer),other=s.players.find(p=>p.playerId!==viewer)!;for(const id of [...s.deck,...other.hand])assert.equal(JSON.stringify(projected).includes(`"${id}"`),false);}
      }
      assert.equal(s.roundResults.length,round);
      if(round<3){s=accept(confirmLostCitiesRound(s,a,null,next()));s=accept(confirmLostCitiesRound(s,b,setup(seed+round),next()));}
    }
    assert.equal(s.phase,'FINISHED');assert.equal(s.result?.reason,'THREE_ROUNDS');
    const scores=s.players.map(p=>({id:p.playerId,total:s.roundResults.reduce((n,r)=>n+r.scores.find(x=>x.playerId===p.playerId)!.total,0)})),best=Math.max(...scores.map(p=>p.total));
    assert.deepEqual(s.result?.winnerPlayerIds,scores.filter(p=>p.total===best).map(p=>p.id));
  }
});
test('Lost Cities full tie is joint victory; cancellation preserves cards and awards no winner',()=>{
  let s=game();for(let i=0;i<3;i++){s=finishRound(s);if(i<2){s=accept(confirmLostCitiesRound(s,a,null,next()));s=accept(confirmLostCitiesRound(s,b,setup(i),next()));}}
  assert.deepEqual(s.result?.winnerPlayerIds,[a,b]);
  const active=game(),cancelled=cancelLostCities(active,at);assert.equal(cancelled.result?.reason,'CANCELLED');assert.deepEqual(cancelled.result?.winnerPlayerIds,[]);assert.deepEqual(cancelled.players,active.players);assert.equal(active.phase,'PLAYING');
});
test('Lost Cities persistence rejects duplicate zone identity, wrong inventory, bad phase and fabricated score',()=>{
  const s=game(),duplicate=structuredClone(s);duplicate.deck[0]=duplicate.players[0]!.hand[0]!;assert.throws(()=>parseLostCitiesState(duplicate));
  const inventory=structuredClone(s);inventory.cards[0]={...inventory.cards[0]!,kind:'NUMBER',value:10};assert.throws(()=>parseLostCitiesState(inventory));
  assert.throws(()=>parseLostCitiesState({...s,phase:'ROUND_RESULT'}));
  const ended=finishRound(s);ended.roundResults[0]!.scores[0]!.expeditions[0]!.total=100;assert.throws(()=>parseLostCitiesState(ended));
});
