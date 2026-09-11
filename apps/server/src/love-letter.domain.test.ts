import assert from 'node:assert/strict';
import test from 'node:test';
import {parse} from 'valibot';
import {GameIdSchema,PlayerIdSchema,ServerTimeSchema,TurnIdSchema,LoveLetterCardIdSchema,loveLetterProjectionIsConsistent,type LoveLetterRank,type LoveLetterAction} from '@hangul-rummikub/shared';
import {makeLoveLetterCards,createLoveLetterGame,parseLoveLetterState,applyLoveLetterAction,confirmLoveLetterRound,cancelLoveLetter,loveLetterTargets,type LoveLetterState} from './games/love-letter/domain/game.js';
import {projectLoveLetter} from './games/love-letter/compatibility/projector.js';
let sequence=0;const next=()=>parse(TurnIdSchema,`turn-${++sequence}`),now=parse(ServerTimeSchema,1000),pid=(i:number)=>parse(PlayerIdSchema,`player-${i}`);
function setup(seed=1){const cards=makeLoveLetterCards(()=>`opaque-${++sequence}`);let random=seed;for(let i=cards.length-1;i>0;i--){random=(random*1664525+1013904223)>>>0;const j=random%(i+1);[cards[i],cards[j]]=[cards[j]!,cards[i]!];}return {cards,starter:0};}
function initial(count=3,seed=1){return createLoveLetterGame({...setup(seed),gameId:parse(GameIdSchema,'letter-match'),playerIds:Array.from({length:count},(_,i)=>pid(i)),now,transitionId:next()});}
function rig(hands:LoveLetterRank[][],options:{deck?:LoveLetterRank[];discards?:LoveLetterRank[][];aside?:LoveLetterRank}={}):LoveLetterState{
 const s=initial(hands.length),pool=makeLoveLetterCards(()=>`rig-${++sequence}`);
 const take=(rank:LoveLetterRank)=>{const i=pool.findIndex(c=>c.rank===rank);assert.ok(i>=0,`fixture rank ${rank}`);return pool.splice(i,1)[0]!;};
 s.players.forEach((p,i)=>{p.hand=hands[i]!.map(take);p.discards=(options.discards?.[i]??[]).map(take);});
 s.aside=take(options.aside??0);s.faceUp=hands.length===2?pool.splice(0,3):[];
 s.deck=options.deck===undefined?pool.splice(0):options.deck.map(take);
 s.players.at(-1)!.discards.push(...pool);return parseLoveLetterState(s);
}
function play(s:LoveLetterState,rank:LoveLetterRank,target:number|null=null,guess:Exclude<LoveLetterRank,1>|null=null):LoveLetterAction{
 const card=s.players.find(p=>p.playerId===s.activePlayerId)!.hand.find(c=>c.rank===rank);assert.ok(card);
 return {kind:'PLAY',cardId:card.cardId,targetPlayerId:target===null?null:pid(target),guess};
}
function apply(s:LoveLetterState,a:LoveLetterAction){const before=structuredClone(s),r=applyLoveLetterAction(s,s.activePlayerId,a,now,next());assert.ok(r.ok,r.ok?'':r.reason);assert.deepEqual(s,before,'candidate must not mutate source');return r.state;}
function project(s:LoveLetterState,index=0){return projectLoveLetter({gameId:s.gameId,gameRevision:s.revision,startedAt:s.startedAt,finishedAt:s.finishedAt,state:s},pid(index));}
function legal(s:LoveLetterState):LoveLetterAction{
 const p=s.players.find(p=>p.playerId===s.activePlayerId)!;
 if(s.stage==='CHANCELLOR')return {kind:'CHANCELLOR',keepCardId:p.hand[0]!.cardId,returnCardIds:p.hand.slice(1).map(c=>c.cardId)};
 const forced=p.hand.some(c=>c.rank===8)&&p.hand.some(c=>c.rank===5||c.rank===7);
 const card=(forced?p.hand.find(c=>c.rank===8):p.hand.find(c=>c.rank!==9))??p.hand[0]!;
 const targets=loveLetterTargets(s,p.playerId,card.rank);
 return {kind:'PLAY',cardId:card.cardId,targetPlayerId:targets[0]??null,guess:card.rank===1&&targets.length?9:null};
}
test('LOVE_LETTER setup: 21 opaque cards, 2–6 players, 2p exclusions, automatic first draw',()=>{
 for(let n=2;n<=6;n++){const s=initial(n);assert.equal(s.deck.length,21-1-(n===2?3:0)-n-1);assert.equal(s.faceUp.length,n===2?3:0);assert.equal(s.players[0]!.hand.length,2);for(let i=0;i<n;i++)assert.ok(loveLetterProjectionIsConsistent(project(s,i)));}
 assert.throws(()=>initial(1));assert.throws(()=>initial(7));const s=initial();s.deck[0]=s.players[0]!.hand[0]!;assert.throws(()=>parseLoveLetterState(s));
});
test('LOVE_LETTER rejects foreign/nonexistent cards, wrong actor and injected payload without mutation',()=>{
 const s=initial(),before=structuredClone(s);
 for(const cardId of [s.players[1]!.hand[0]!.cardId,parse(LoveLetterCardIdSchema,'absent')])assert.deepEqual(applyLoveLetterAction(s,pid(0),{kind:'PLAY',cardId,targetPlayerId:null,guess:null},now,next()),{ok:false,reason:'INVALID_ACTION'});
 assert.deepEqual(applyLoveLetterAction(s,pid(1),legal(s),now,next()),{ok:false,reason:'NOT_YOUR_TURN'});
 const malformed={...legal(s),extra:'injected'};assert.equal(applyLoveLetterAction(s,pid(0),malformed,now,next()).ok,false);assert.deepEqual(s,before);
});
test('LOVE_LETTER Guard: hit, miss, illegal guard guess and protected target',()=>{
 const s=rig([[1,4],[9],[8]]),out=apply(s,play(s,1,1,9));assert.ok(out.players[1]!.eliminated);assert.equal(out.history[0]!.outcome,'HIT');assert.equal(out.players[1]!.discards.at(-1)?.rank,9);
 assert.equal(apply(s,play(s,1,1,8)).players[1]!.eliminated,false);
 const bad={...play(s,1,1,9),guess:1};assert.equal(applyLoveLetterAction(s,pid(0),bad,now,next()).ok,false);
 s.players[1]!.protected=true;assert.equal(applyLoveLetterAction(s,pid(0),play(s,1,1,9),now,next()).ok,false);
});
test('LOVE_LETTER Priest and Baron deliver only historical rank to permitted players',()=>{
 const s=rig([[2,4],[9],[8]]),out=apply(s,play(s,2,1));assert.equal(project(out).privateState.notes[0]?.rank,9);assert.equal(project(out,1).privateState.notes.length,0);assert.equal(project(out,2).privateState.notes.length,0);
 for(const id of [...out.deck,...out.players[1]!.hand,...out.players[2]!.hand,...(out.aside?[out.aside]:[])].map(c=>c.cardId))assert.ok(!JSON.stringify(project(out)).includes(id));
 const b=rig([[3,4],[7],[9]]),baron=apply(b,play(b,3,1));assert.ok(baron.players[0]!.eliminated);assert.equal(project(baron,0).privateState.notes[0]?.rank,7);assert.equal(project(baron,1).privateState.notes[0]?.rank,4);assert.equal(project(baron,2).privateState.notes.length,0);assert.ok(!JSON.stringify(project(baron,2)).includes(b.players[1]!.hand[0]!.cardId));
 const t=rig([[3,4],[4],[9]]);assert.ok(apply(t,play(t,3,1)).players.every(p=>!p.eliminated));
});
test('LOVE_LETTER Handmaid protection expires at own turn; all protected means no target or Prince self',()=>{
 const s=rig([[4,8],[1],[9]]),protectedState=apply(s,play(s,4));assert.ok(protectedState.players[0]!.protected);
 let nextState=protectedState;while(nextState.phase==='PLAYING'&&nextState.activePlayerId!==pid(0))nextState=apply(nextState,legal(nextState));if(nextState.phase==='PLAYING')assert.equal(nextState.players[0]!.protected,false);
 const no=rig([[2,4],[7],[9]]);no.players[1]!.protected=true;no.players[2]!.protected=true;assert.equal(apply(no,play(no,2)).history[0]!.outcome,'NO_TARGET');
 const prince=rig([[5,4],[7],[9]]);prince.players[1]!.protected=true;prince.players[2]!.protected=true;assert.deepEqual(loveLetterTargets(prince,pid(0),5),[pid(0)]);assert.equal(applyLoveLetterAction(prince,pid(0),play(prince,5),now,next()).ok,false);assert.equal(apply(prince,play(prince,5,0)).players[0]!.discards.at(-1)?.rank,4);
});
test('LOVE_LETTER Prince: discarding Princess eliminates without draw; empty deck uses reserve',()=>{
 const s=rig([[5,4],[9],[8]]),out=apply(s,play(s,5,1));assert.ok(out.players[1]!.eliminated);assert.equal(out.deck.length,s.deck.length-1,'only next player draws');
 const empty=rig([[5,4],[7],[9]],{deck:[],aside:8}),reserve=apply(empty,play(empty,5,1));assert.equal(reserve.aside,null);assert.equal(reserve.players[1]!.hand[0]?.rank,8);assert.equal(reserve.phase,'ROUND_RESULT');
});
test('LOVE_LETTER Chancellor: private draw, exact return order, no Countess constraint, 0/1 deck exceptions',()=>{
 const s=rig([[6,8],[9],[4]],{deck:[7,5,1]}),out=apply(s,play(s,6));assert.equal(out.stage,'CHANCELLOR');assert.equal(out.activePlayerId,pid(0));assert.equal(out.players[0]!.hand.length,3);assert.equal(project(out,1).privateState.hand.length,1);
 const hand=out.players[0]!.hand,king=hand.find(c=>c.rank===7)!;const returns=hand.filter(c=>c!==king).reverse();
 const bad={kind:'CHANCELLOR' as const,keepCardId:king.cardId,returnCardIds:[king.cardId,king.cardId]};assert.equal(applyLoveLetterAction(out,pid(0),bad,now,next()).ok,false);
 const done=apply(out,{kind:'CHANCELLOR',keepCardId:king.cardId,returnCardIds:returns.map(c=>c.cardId)});assert.equal(done.players[0]!.hand[0]?.rank,7);assert.deepEqual(done.deck.map(c=>c.cardId),returns.map(c=>c.cardId));
 const one=rig([[6,8],[9],[4]],{deck:[7]}),pending=apply(one,play(one,6));assert.equal(pending.stage,'CHANCELLOR');assert.equal(pending.phase,'PLAYING');assert.equal(pending.players[0]!.hand.length,2);
 const no=rig([[6,8],[9],[4]],{deck:[]});assert.equal(apply(no,play(no,6)).phase,'ROUND_RESULT');
});
test('LOVE_LETTER King, forced/voluntary Countess and Princess suicide',()=>{
 const s=rig([[7,4],[9],[8]]),out=apply(s,play(s,7,1));assert.equal(out.players[0]!.hand[0]?.rank,9);assert.equal(out.players[1]!.hand[0]?.rank,4);
 for(const r of [5,7] as const){const c=rig([[8,r],[9],[4]]);assert.equal(applyLoveLetterAction(c,pid(0),play(c,r,1),now,next()).ok,false);assert.equal(apply(c,play(c,8)).history[0]!.outcome,'PLAYED');}
 const voluntary=rig([[8,4],[9],[7]]);assert.equal(apply(voluntary,play(voluntary,8)).history[0]!.outcome,'PLAYED');
 const princess=rig([[9,4],[7],[8]]);assert.ok(apply(princess,play(princess,9)).players[0]!.eliminated);
});
test('LOVE_LETTER round ties award everyone, Spy bonus once and only among survivors',()=>{
 const tie=rig([[8,4],[4],[2]],{deck:[]}),out=apply(tie,play(tie,8));assert.deepEqual(out.roundResults[0]!.winnerPlayerIds,[pid(0),pid(1)]);
 const spy=rig([[0,4],[8],[9]],{deck:[],aside:0}),bonus=apply(spy,play(spy,0));assert.equal(bonus.roundResults[0]?.spyPlayerId,pid(0));assert.equal(bonus.players[0]!.tokens,1);assert.equal(bonus.players[2]!.tokens,1);
 const two=rig([[4,8],[9],[7]],{deck:[],aside:1,discards:[[0,0]]}),once=apply(two,play(two,4));assert.equal(once.players[0]!.tokens,1);
 const eliminated=rig([[9,4],[8],[7]],{deck:[],aside:0,discards:[[0]]}),gone=apply(eliminated,play(eliminated,9));assert.equal(gone.roundResults[0]?.spyPlayerId,null);
});
test('LOVE_LETTER full deterministic matches 2–6 players preserve cards, privacy, tokens and fresh identities',()=>{
 for(let n=2;n<=6;n++)for(let seed=1;seed<=8;seed++){
  let s=initial(n,seed),steps=0;
  while(s.phase!=='FINISHED'&&steps++<700){
   const oldRevision=s.revision;
   if(s.phase==='ROUND_RESULT'){
    const oldIds=new Set([...s.deck,...s.players.flatMap(p=>[...p.hand,...p.discards])].map(c=>c.cardId));
    const winner=s.roundResults.at(-1)!.winnerPlayerIds[0]!;const r=confirmLoveLetterRound(s,pid(0),setup(seed+steps),next());assert.ok(r.ok);s=r.state;assert.equal(s.activePlayerId,winner);assert.ok(s.players.every(p=>p.hand.every(c=>!oldIds.has(c.cardId))));
   }else s=apply(s,legal(s));
   assert.equal(s.revision,oldRevision+1);for(let i=0;i<n;i++){const p=project(s,i);assert.ok(loveLetterProjectionIsConsistent(p));for(const other of s.players.filter(p=>p.playerId!==pid(i)))for(const c of other.hand)assert.ok(!JSON.stringify(p).includes(c.cardId));}
  }
  assert.equal(s.phase,'FINISHED');assert.equal(s.result?.reason,'TOKENS');assert.ok(s.result.winnerPlayerIds.length>=1);
 }
});
test('LOVE_LETTER cancellation preserves cards without publishing remaining hands',()=>{
 const s=initial(),out=cancelLoveLetter(s,now);assert.equal(out.result?.reason,'CANCELLED');assert.deepEqual(out.players,s.players);assert.deepEqual(project(out).roundResults,[]);
});
