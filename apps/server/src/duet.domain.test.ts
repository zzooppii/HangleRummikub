import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { DuetCardIdSchema, DuetClientCommandSchema, DuetPlayingProjectionSchema, DuetFinishedProjectionSchema, duetProjectionIsConsistent, GameIdSchema, GameRevisionSchema, PlayerIdSchema, TurnIdSchema, ServerTimeSchema, type DuetAction } from "@hangul-rummikub/shared";
import { createDuetGame, applyDuetAction, parseDuetState, remainingClues, DUET_ROLE_PAIRS, cancelDuet, type DuetState } from "./games/word-duet/domain/game.js";
import { DUET_WORDS } from "./games/word-duet/domain/words.js";
import { projectDuet } from "./games/word-duet/compatibility/projector.js";
import { DuetGameStateAdapter } from "./games/word-duet/compatibility/adapter.js";
const a=v.parse(PlayerIdSchema,'a'),b=v.parse(PlayerIdSchema,'b'),now=v.parse(ServerTimeSchema,1000);
let seq=0;const next=()=>v.parse(TurnIdSchema,`turn-${++seq}`);
function initial(seed=0){
 const pairs=[...DUET_ROLE_PAIRS];let n=seed;for(let i=pairs.length-1;seed&&i>0;i--){n=(n*1664525+1013904223)>>>0;const j=n%(i+1);[pairs[i],pairs[j]]=[pairs[j]!,pairs[i]!];}
 return createDuetGame({gameId:v.parse(GameIdSchema,'duet-game'),playerIds:[a,b],now,transitionId:next(),cards:pairs.map((roles,i)=>({cardId:v.parse(DuetCardIdSchema,`opaque-${i}`),word:DUET_WORDS[i]!,roles:[roles[0],roles[1]],foundBy:null,bystanderFor:[]}))});
}
const stored=(s:DuetState)=>({gameId:s.gameId,gameRevision:s.revision,startedAt:s.startedAt,finishedAt:s.finishedAt,state:s});
function apply(s:DuetState,id:typeof a,action:DuetAction){const before=structuredClone(s),r=applyDuetAction(s,id,action,now,next());assert.deepEqual(s,before);assert.ok(r.ok,r.ok?'':r.reason);return r.state;}
const clue=(s:DuetState,id=a,number=1)=>apply(s,id,{kind:'GIVE_CLUE',word:'연결',number});
const guess=(s:DuetState,id:typeof a,i:number)=>apply(s,id,{kind:'GUESS',cardId:s.cards[i]!.cardId});
test('DUET: 25 opaque cards, 15 targets, exact joint key distribution, original word pack',()=>{
 const s=initial();assert.ok(DUET_WORDS.length>=250);assert.equal(new Set(DUET_WORDS).size,DUET_WORDS.length);assert.equal(s.cards.filter(c=>c.roles.includes('AGENT')).length,15);
 for(const p of [a,b])assert.equal(remainingClues(s,p),9);
 assert.equal(s.tokensRemaining,9);assert.equal(s.clueGiverId,null);
 const invalid=structuredClone(s);invalid.cards[0]!.roles[0]='BYSTANDER';assert.throws(()=>parseDuetState(invalid));
 assert.throws(()=>createDuetGame({gameId:s.gameId,playerIds:[a,a],now,transitionId:next(),cards:s.cards}));
 const adapter=new DuetGameStateAdapter();assert.deepEqual(adapter.inspectLifecycle(stored(s)),{lifecycle:'RUNNING',gameId:s.gameId,gameRevision:0,activeTurn:null});assert.throws(()=>adapter.cloneAndValidate({...stored(s),gameRevision:v.parse(GameRevisionSchema,1)}));
});

test('DUET: guess uses the partner key, including own assassin; correct guesses exceed clue number',()=>{
 let s=clue(initial());s=guess(s,b,8);assert.equal(s.cards[8]!.roles[1],'ASSASSIN');assert.equal(s.cards[8]!.foundBy,b);
 for(const i of [0,1,2,3])s=guess(s,b,i);assert.equal(s.guessesThisTurn,5);assert.equal(s.tokensRemaining,9);
 s=apply(s,b,{kind:'END_GUESSES'});assert.equal(s.phase,'CLUE');assert.equal(s.clueGiverId,b);assert.equal(s.tokensRemaining,8);
});
test('DUET: bystander directions preserve the word for the other player; shared agent covers for both',()=>{
 let s=guess(clue(initial()),b,9);assert.deepEqual(s.cards[9]!.bystanderFor,[b]);assert.equal(s.tokensRemaining,8);
 s=guess(clue(s,b),a,9);assert.equal(s.cards[9]!.foundBy,a);assert.deepEqual(s.cards[9]!.bystanderFor,[b]);
 s=guess(s,a,0);assert.equal(remainingClues(s,a),8);assert.equal(remainingClues(s,b),7);
});
test('DUET: invalid actions preserve state and revision, exact-word clues and premature end rejected',()=>{
 const s=clue(initial()),before=structuredClone(s);
 for(const [id,action] of [[a,{kind:'GUESS',cardId:s.cards[0]!.cardId}],[b,{kind:'END_GUESSES'}],[b,{kind:'GUESS',cardId:v.parse(DuetCardIdSchema,'unknown')}],[a,{kind:'GIVE_CLUE',word:'암호',number:2}]] as const){assert.equal(applyDuetAction(s,id,action,now,next()).ok,false);assert.deepEqual(s,before);}
 const fresh=initial();assert.equal(applyDuetAction(fresh,a,{kind:'GIVE_CLUE',word:fresh.cards[0]!.word,number:2},now,next()).ok,false);
 let marked=guess(s,b,14);marked=clue(marked,b);marked=guess(marked,a,15);marked=clue(marked,a);assert.equal(applyDuetAction(marked,b,{kind:'GUESS',cardId:marked.cards[14]!.cardId},now,next()).ok,false);
});
test('DUET: 9 turns lead to sudden death; no new hints, wrong bystander loses with token conservation',()=>{
 let s=initial();for(let i=0;i<9;i++){
  const giver=s.clueGiverId??a,guesser=giver===a?b:a,index=s.cards.findIndex(c=>c.foundBy===null&&c.roles[giver===a?0:1]==='AGENT');
  s=guess(clue(s,giver),guesser,index);s=apply(s,guesser,{kind:'END_GUESSES'});
 }
 assert.equal(s.phase,'SUDDEN_DEATH');assert.equal(s.tokensRemaining,0);assert.equal(applyDuetAction(s,a,{kind:'GIVE_CLUE',word:'암호',number:0},now,next()).ok,false);
 const actor=remainingClues(s,b)>0?a:b,index=s.cards.findIndex(c=>c.foundBy===null&&c.roles[actor===a?1:0]==='BYSTANDER');
 s=guess(s,actor,index);assert.equal(s.phase,'FINISHED');assert.equal(s.result?.reason,'SUDDEN_DEATH_MISS');assert.equal(s.tokensRemaining,0);assert.deepEqual(s.result?.winnerPlayerIds,[]);
});
test('DUET: permanent pass is distinct from ending guesses; both passed triggers early sudden death',()=>{
 let s=apply(initial(),a,{kind:'PASS_CLUES'});assert.equal(s.clueGiverId,b);assert.equal(s.tokensRemaining,9);
 assert.equal(applyDuetAction(s,a,{kind:'GIVE_CLUE',word:'암호',number:2},now,next()).ok,false);
 s=apply(s,b,{kind:'PASS_CLUES'});assert.equal(s.phase,'SUDDEN_DEATH');assert.equal(s.tokensRemaining,9);
 s=guess(s,a,14);assert.equal(s.result?.reason,'SUDDEN_DEATH_MISS');assert.equal(s.tokensRemaining,9);
});
test('DUET: assassin, cancellation and complete two-sided victory have distinct cooperative results',()=>{
 const lost=guess(clue(initial()),b,24);assert.equal(lost.result?.reason,'ASSASSIN');assert.equal(lost.tokensRemaining,9);
 assert.equal(cancelDuet(initial(),now).result?.reason,'CANCELLED');
 for(let seed=0;seed<30;seed++){
  let s=initial(seed);s=clue(s,a,0);
  for(let i=0;i<25;i++)if(s.cards[i]!.roles[0]==='AGENT')s=guess(s,b,i);
  assert.equal(remainingClues(s,a),0);assert.equal(remainingClues(s,b),6);
  s=apply(s,b,{kind:'END_GUESSES'});s=clue(s,b,1);
  for(let i=0;i<25;i++)if(!s.cards[i]!.foundBy&&s.cards[i]!.roles[1]==='AGENT')s=guess(s,a,i);
  assert.equal(s.result?.reason,'ALL_AGENTS');assert.deepEqual(s.result.winnerPlayerIds,[a,b]);assert.equal(s.tokensRemaining,8);
  assert.ok(duetProjectionIsConsistent(projectDuet(stored(s),a)));assert.ok(v.safeParse(DuetFinishedProjectionSchema,projectDuet(stored(s),a)).success);
 }
});
test('DUET: projections contain only the viewer key and public history; strict wire rejects hidden fields',()=>{
 const s=initial(),pa=projectDuet(stored(s),a),pb=projectDuet(stored(s),b);
 assert.notDeepEqual(pa.privateState.key,pb.privateState.key);assert.equal('revealedKeys' in pa,false);assert.equal('roles' in pa.cards[0]!,false);assert.equal('remaining' in pa.playerStates[0]!,false);
 assert.ok(duetProjectionIsConsistent(pa));assert.equal(v.safeParse(DuetPlayingProjectionSchema,{...pa,revealedKeys:[]}).success,false);
 assert.equal(v.safeParse(DuetPlayingProjectionSchema,{...pa,cards:pa.cards.map((c,i)=>({...c,roles:s.cards[i]!.roles}))}).success,false);
 assert.throws(()=>projectDuet(stored(s),v.parse(PlayerIdSchema,'outsider')));
 const c={kind:'duet:act',protocolVersion:1,requestId:'r',gameId:s.gameId,expectedGameRevision:0,turnId:s.transitionId,payload:{kind:'GIVE_CLUE',word:'암호',number:0}};
 assert.ok(v.safeParse(DuetClientCommandSchema,c).success);
 for(const bad of [{...c,actorPlayerId:a},{...c,turnId:undefined},{...c,payload:{...c.payload,word:'두 단어'}},{...c,payload:{...c.payload,number:10}}])assert.equal(v.safeParse(DuetClientCommandSchema,bad).success,false);
});
