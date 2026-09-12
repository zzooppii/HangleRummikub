import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import {CLUE_SUSPECTS,CLUE_WEAPONS,CLUE_ROOMS,CLUE_BONUS_CELLS,CLUE_ROOM_AREAS,CLUE_CORRIDORS,clueNeighbors,clueReachablePaths,isClueRoom,GameIdSchema,PlayerIdSchema,TileIdSchema,TurnIdSchema,ServerTimeSchema,type ClueAction,type ClueRoom,type ClueCardKey,type ClueTriple} from "@hangul-rummikub/shared";
import {createClueGame,makeClueCards,applyClueAction,parseClueState,cluePaths,cancelClue,type ClueState} from "./games/clue/domain/game.js";
import {projectClue} from "./games/clue/compatibility/projector.js";
const at=v.parse(ServerTimeSchema,1000);let seq=0;
function random(seed=1){return {nextInt(max:number){seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed%max;}};}
function game(n=3,seed=1){return createClueGame({gameId:v.parse(GameIdSchema,"clue-game"),playerIds:Array.from({length:n},(_,i)=>v.parse(PlayerIdSchema,"p"+i)),cards:makeClueCards(()=>v.parse(TileIdSchema,"opaque-"+(++seq))),now:at,turnId:v.parse(TurnIdSchema,"turn-"+(++seq)),random:random(seed)});}
function act(s:ClueState,action:ClueAction,actor=s.players[s.turnIndex]!.playerId):ClueState {const applied=applyClueAction(s,actor,action,at,v.parse(TurnIdSchema,"turn-"+(++seq)),{nextInt:max=>max-1});assert.ok(applied.ok,applied.ok?"":applied.reason);return applied.state;}
function atRoom(s:ClueState,room:ClueRoom):ClueState{const copy=parseClueState(s);copy.tokens.find(t=>t.suspect===copy.players[copy.turnIndex]!.suspect)!.location=room;copy.phase="SUGGEST";return parseClueState(copy);}
function triple(key:ClueCardKey,s:ClueState):ClueTriple{return {suspect:CLUE_SUSPECTS.find(k=>k===key)??s.solution.suspect,weapon:CLUE_WEAPONS.find(k=>k===key)??s.solution.weapon,room:CLUE_ROOMS.find(k=>k===key)??s.solution.room};}
function project(s:ClueState,index:number){return projectClue({gameId:s.gameId,gameRevision:s.revision,startedAt:s.startedAt,finishedAt:s.finishedAt,state:s},s.players[index]!.playerId);}
function wrong(s:ClueState):ClueAction{return {type:"ACCUSE",...s.solution,suspect:CLUE_SUSPECTS.find(k=>k!==s.solution.suspect)!};}
test("Clue: 3/4/5/6-player seeded deals conserve 21 opaque cards and one solution per category",()=>{
  for(const n of [3,4,5,6])for(let seed=0;seed<25;seed++){const s=game(n,seed);assert.equal(s.players.reduce((sum,p)=>sum+p.hand.length,0),18);assert.equal(s.envelope.length,3);assert.equal(s.tokens.length,6);assert.equal(s.players[0]!.suspect,"SCARLET");assert.equal(s.phase,"TURN_START");assert.deepEqual(parseClueState(s),s);for(let i=0;i<n;i++){const view=project(s,i);assert.equal(view.privateState.hand.length,s.players[i]!.hand.length);assert.equal(view.privateState.caseFile,null);for(const c of [...s.envelope,...s.players.filter((_,j)=>j!==i).flatMap(p=>p.hand)])assert.equal(JSON.stringify(view).includes(JSON.stringify(c.cardId)),false);}}
});
test("Clue: board doors are reciprocal corridor edges, walls block, rooms stop routes",()=>{
  for(const area of CLUE_ROOM_AREAS)for(const door of area.doors){assert.ok(CLUE_CORRIDORS.includes(door));assert.ok(clueNeighbors(door).includes(area.room));assert.ok(clueNeighbors(area.room).includes(door));}
  assert.deepEqual(clueNeighbors("C:9:11"),[]);assert.equal(clueReachablePaths("C:13:7",1,[]).has("KITCHEN"),true);assert.equal(clueReachablePaths("C:13:7",1,[]).has("C:7:5"),false);
  const paths=clueReachablePaths("KITCHEN",6,["C:13:7"]);assert.deepEqual([...paths.keys()],["DINING"]);
  for(const path of clueReachablePaths("C:9:7",6,[]).values()){assert.equal(new Set(path).size,path.length);assert.ok(path.length<=6);assert.ok(path.slice(0,-1).every(p=>!isClueRoom(p)));}
});
test("Clue: roll/move/turn commands are atomic and reject wrong actor, walls, second rolls and early passes",()=>{
  const s=game(),before=JSON.stringify(s),actor=s.players[0]!.playerId;
  const reject=(state:ClueState,action:ClueAction,id=actor)=>{const before=JSON.stringify(state);const r=applyClueAction(state,id,action,at,v.parse(TurnIdSchema,"bad-turn"),random());assert.equal(r.ok,false);assert.equal(JSON.stringify(state),before);};
  reject(s,{type:"ROLL"},s.players[1]!.playerId);reject(s,{type:"END_TURN"});reject(s,{type:"MOVE",destination:"HALL"});
  const rolled=act(s,{type:"ROLL"});assert.equal(rolled.die,6);assert.equal(JSON.stringify(s),before);reject(rolled,{type:"ROLL"});reject(rolled,{type:"MOVE",destination:"C:9:11"});
  const moved=act(rolled,{type:"MOVE",destination:"HALL"});assert.equal(moved.phase,"SUGGEST");assert.equal(moved.tokens[0]!.location,"HALL");reject(moved,{type:"MOVE",destination:"STUDY"});assert.equal(act(moved,{type:"END_TURN"}).turnIndex,1);
});
test("Clue: secret passage replaces rolling, same-room reentry is impossible, summons permit next-turn suggestion",()=>{
  let s=atRoom(game(),"KITCHEN");s.phase="TURN_START";
  s=act(s,{type:"PASSAGE"});assert.equal(s.tokens[0]!.location,"LIBRARY");assert.equal(s.phase,"SUGGEST");
  const moved=atRoom(game(),"KITCHEN");moved.phase="TURN_START";const rolled=act(moved,{type:"ROLL"});assert.equal(cluePaths(rolled).has("KITCHEN"),false);
  let q=atRoom(game(),"LIBRARY");q=act(q,{type:"SUGGEST",suspect:q.players[1]!.suspect,weapon:"ROPE"});assert.equal(q.players[1]!.summoned,true);assert.equal(q.tokens.find(t=>t.suspect===q.players[1]!.suspect)!.location,"LIBRARY");
  if(q.phase==="RESPOND"){const owner=q.players.find(p=>p.playerId===q.suggestion!.responderPlayerId)!;const card=owner.hand.find(c=>[q.suggestion!.suspect,q.suggestion!.weapon,q.suggestion!.room].some(k=>k===c.key))!;q=act(q,{type:"SHOW_CARD",cardId:card.cardId},owner.playerId);}
  q=act(q,{type:"END_TURN"});assert.equal(q.turnIndex,1);assert.equal(q.players[1]!.summoned,true);assert.equal(act(q,{type:"SUGGEST",suspect:"WHITE",weapon:"PIPE"}).suggestion!.room,"LIBRARY");
});
test("Clue: server skips empty hands in order; only matching responder can reveal, third party receives no card ID",()=>{
  const initial=game(),target=initial.players[2]!.hand[0]!,choice=triple(target.key,initial);let s=atRoom(initial,choice.room);
  s=act(s,{type:"SUGGEST",suspect:choice.suspect,weapon:choice.weapon});assert.equal(s.phase,"RESPOND");assert.equal(s.suggestion!.responderPlayerId,s.players[2]!.playerId);assert.deepEqual(s.suggestion!.passedPlayerIds,[s.players[1]!.playerId]);
  const before=JSON.stringify(s);for(const cardId of [s.players[1]!.hand[0]!.cardId,v.parse(TileIdSchema,"nonexistent")]){const rejected=applyClueAction(s,s.players[2]!.playerId,{type:"SHOW_CARD",cardId},at,v.parse(TurnIdSchema,"bad"),random());assert.deepEqual(rejected,{ok:false,reason:"INVALID_ACTION"});}assert.equal(JSON.stringify(s),before);
  assert.equal(applyClueAction(s,s.players[0]!.playerId,{type:"SHOW_CARD",cardId:target.cardId},at,v.parse(TurnIdSchema,"bad"),random()).ok,false);
  s=act(s,{type:"SHOW_CARD",cardId:target.cardId},s.players[2]!.playerId);assert.equal(s.phase,"END_TURN");assert.equal(project(s,0).privateState.evidence[0]!.card.cardId,target.cardId);assert.equal(project(s,2).privateState.evidence[0]!.card.cardId,target.cardId);assert.equal(project(s,1).privateState.evidence.length,0);assert.equal(JSON.stringify(project(s,1)).includes(JSON.stringify(target.cardId)),false);assert.equal(s.history.at(-1)!.type,"SUGGEST");
});
test("Clue: unrefuted suggestions are not wins, own cards may be suggested, repeated evidence keeps latest reveal",()=>{
  let s=game();s=atRoom(s,s.solution.room);s=act(s,{type:"SUGGEST",suspect:s.solution.suspect,weapon:s.solution.weapon});assert.equal(s.phase,"END_TURN");assert.equal(s.result,null);
  s=game();const choice=triple(s.players[0]!.hand[0]!.key,s);s=atRoom(s,choice.room);s=act(s,{type:"SUGGEST",suspect:choice.suspect,weapon:choice.weapon});assert.equal(s.phase,"END_TURN");
  s=game();const card=s.players[2]!.hand[0]!,repeat=triple(card.key,s);let lastId=0;
  for(let round=0;round<2;round++){
    s=atRoom(s,repeat.room);s=act(s,{type:"SUGGEST",suspect:repeat.suspect,weapon:repeat.weapon});
    assert.ok(s.suggestion!.id>lastId);lastId=s.suggestion!.id;
    s=act(s,{type:"SHOW_CARD",cardId:card.cardId},s.players[2]!.playerId);
    assert.equal(s.evidence.length,1);assert.equal(project(s,0).privateState.evidence[0]!.suggestionId,lastId);
    if(round===0){s=act(s,{type:"END_TURN"});for(let i=0;i<2;i++)s=act(atRoom(s,"HALL"),{type:"END_TURN"});}
  }
});
test("Clue: failed accuser privately learns case file, loses turns but still supplies evidence",()=>{
  let s=game();const lost=s.players[0]!.playerId,held=s.players[0]!.hand[0]!;s=act(s,wrong(s));assert.equal(s.turnIndex,1);assert.equal(s.players[0]!.eliminated,true);assert.deepEqual(project(s,0).privateState.caseFile,s.solution);assert.equal(project(s,1).privateState.caseFile,null);
  const choice=triple(held.key,s);s=atRoom(s,choice.room);s=act(s,{type:"SUGGEST",suspect:choice.suspect,weapon:choice.weapon});assert.equal(s.suggestion!.responderPlayerId,lost);s=act(s,{type:"SHOW_CARD",cardId:held.cardId},lost);assert.equal(s.phase,"END_TURN");assert.equal(s.players[0]!.eliminated,true);
});
test("Clue: correct accusation wins once; all wrong accusations produce no winner; cancel resolves pending game",()=>{
  let s=game();const solved=act(s,{type:"ACCUSE",...s.solution});assert.equal(solved.phase,"FINISHED");assert.deepEqual(solved.result,{reason:"SOLVED",winnerPlayerIds:[s.players[0]!.playerId]});assert.equal(project(solved,1).phase,"FINISHED");assert.equal(applyClueAction(solved,s.players[0]!.playerId,{type:"ROLL"},at,v.parse(TurnIdSchema,"bad"),random()).ok,false);
  for(let i=0;i<3;i++)s=act(s,wrong(s));assert.equal(s.result!.reason,"ALL_ELIMINATED");assert.deepEqual(s.result!.winnerPlayerIds,[]);
  let pending=atRoom(game(),"HALL");pending=act(pending,{type:"SUGGEST",suspect:"SCARLET",weapon:"ROPE"});const end=cancelClue(pending,at);assert.equal(end.result!.reason,"CANCELLED");assert.deepEqual(cancelClue(end,at),end);
});
test("Clue: stored state rejects missing cards, forged evidence, overlapping corridor tokens and bad response stages",()=>{
  const s=game();assert.throws(()=>parseClueState({...s,envelope:[s.envelope[0],s.envelope[0],s.envelope[2]]}));
  assert.throws(()=>parseClueState({...s,evidence:[{suggestionId:1,fromPlayerId:s.players[1]!.playerId,toPlayerId:s.players[0]!.playerId,card:s.players[0]!.hand[0]}]}));
  assert.throws(()=>parseClueState({...s,tokens:s.tokens.map((t,i)=>i===1?{...t,location:s.tokens[0]!.location}:t)}));assert.throws(()=>parseClueState({...s,phase:"RESPOND"}));
});

function grant(s:ClueState,kind:ClueState['bonus']['deck'][number],index=0){
  const at=s.bonus.deck.indexOf(kind);assert.ok(at>=0);s.bonus.deck.splice(at,1);s.players[index]!.bonusHand.push(kind);return parseClueState(s);
}
function landBonus(kind:ClueState['bonus']['deck'][number]){
  const s=game(),index=s.bonus.deck.indexOf(kind);s.bonus.deck.splice(index,1);s.bonus.deck.push(kind);
  s.tokens[0]!.location='C:10:15';s.phase='MOVE';s.die=6;
  return act(s,{type:'MOVE',destination:'C:11:15'});
}
test('Clue bonus: six kinds total 17, public reveal exactly 2; only landing draws, no repeated move',()=>{
  const s=game();assert.equal(s.bonus.deck.length,17);assert.equal(s.bonus.deck.filter(k=>k==='PUBLIC_REVEAL').length,2);
  const moved=landBonus('PLUS_SIX');assert.deepEqual(moved.players[0]!.bonusHand,['PLUS_SIX']);assert.equal(moved.bonus.deck.length,16);
  assert.equal(applyClueAction(moved,moved.players[0]!.playerId,{type:'MOVE',destination:'C:11:15'},at,v.parse(TurnIdSchema,'bad'),random()).ok,false);
  s.tokens[0]!.location='C:10:15';s.phase='MOVE';s.die=6;
  const crossed=act(s,{type:'MOVE',destination:'C:12:15'});assert.equal(crossed.bonus.deck.length,17);
});
test('Clue bonus: immediate free suggestion chooses any room without moving suspect or weapon',()=>{
  const s=landBonus('EXTRA_SUGGEST');assert.equal(s.phase,'BONUS');const positions=JSON.stringify([s.tokens,s.weapons]);
  assert.equal(applyClueAction(s,s.players[0]!.playerId,{type:'END_TURN'},at,v.parse(TurnIdSchema,'bad'),random()).ok,false);
  const next=act(s,{type:'BONUS_SUGGEST',...s.solution});assert.equal(next.phase,'END_TURN');assert.equal(JSON.stringify([next.tokens,next.weapons]),positions);assert.equal(next.bonus.pending,null);assert.ok(next.bonus.discard.includes('EXTRA_SUGGEST'));
});
test('Clue bonus: teleport enters selected room and permits a normal suggestion',()=>{
  const s=act(landBonus('TELEPORT'),{type:'BONUS_MOVE',room:'KITCHEN'});assert.equal(s.phase,'SUGGEST');assert.equal(s.tokens[0]!.location,'KITCHEN');assert.equal(s.bonus.deck.length,16);
  assert.ok(act(s,{type:'SUGGEST',suspect:'SCARLET',weapon:'ROPE'}).suggestion);
});
test('Clue bonus: +6 can extend current movement or be stored, immediate +6 gives six new steps',()=>{
  let s=grant(game(),'PLUS_SIX');s=act(s,{type:'ROLL'});s=act(s,{type:'USE_BONUS',kind:'PLUS_SIX'});assert.equal(s.die,12);assert.equal(s.players[0]!.bonusHand.length,0);
  const immediate=act(landBonus('PLUS_SIX'),{type:'USE_BONUS',kind:'PLUS_SIX'});assert.equal(immediate.phase,'MOVE');assert.equal(immediate.die,6);
  const stored=act(landBonus('PLUS_SIX'),{type:'END_TURN'});assert.deepEqual(stored.players[0]!.bonusHand,['PLUS_SIX']);assert.equal(stored.bonus.justDrewPlusSix,false);
  assert.equal(applyClueAction(stored,stored.players[1]!.playerId,{type:'USE_BONUS',kind:'PLUS_SIX'},at,v.parse(TurnIdSchema,'bad'),random()).ok,false);
});
test('Clue bonus: extra turn returns same player once and does not grant eliminated player a turn',()=>{
  let s=grant(game(),'EXTRA_TURN');s=act(s,{type:'USE_BONUS',kind:'EXTRA_TURN'});s=act(atRoom(s,'HALL'),{type:'END_TURN'});assert.equal(s.turnIndex,0);assert.equal(s.turnNumber,2);assert.equal(s.phase,'TURN_START');assert.equal(s.bonus.extraTurn,false);
  s=act(atRoom(s,'HALL'),{type:'END_TURN'});assert.equal(s.turnIndex,1);
  let fail=grant(game(),'EXTRA_TURN');fail=act(fail,{type:'USE_BONUS',kind:'EXTRA_TURN'});fail=act(fail,wrong(fail));assert.equal(fail.turnIndex,1);assert.equal(fail.bonus.extraTurn,false);
});
test('Clue bonus: target selects their own public card, forged IDs fail atomically and every viewer learns only that card',()=>{
  let s=landBonus('PUBLIC_REVEAL');const target=s.players[1]!,shown=target.hand[0]!;
  s=act(s,{type:'BONUS_TARGET',playerId:target.playerId});const before=JSON.stringify(s);
  for(const cardId of [s.players[0]!.hand[0]!.cardId,v.parse(TileIdSchema,'unknown')])assert.equal(applyClueAction(s,target.playerId,{type:'BONUS_REVEAL',cardId},at,v.parse(TurnIdSchema,'bad'),random()).ok,false);
  assert.equal(JSON.stringify(s),before);assert.equal(project(s,2).bonus.publicEvidence.length,0);
  s=act(s,{type:'BONUS_REVEAL',cardId:shown.cardId},target.playerId);assert.equal(s.phase,'END_TURN');
  for(let i=0;i<3;i++){const view=project(s,i);assert.deepEqual(view.bonus.publicEvidence,[{playerId:target.playerId,card:shown}]);if(i!==1)for(const other of target.hand.slice(1))assert.equal(JSON.stringify(view).includes(other.cardId),false);}
});
test('Clue bonus: peek only sees current shown card after spending; other eligible viewers may skip',()=>{
  let s=grant(grant(game(4),'PEEK',1),'PEEK',3);const card=s.players[2]!.hand[0]!,choice=triple(card.key,s);
  s=act(atRoom(s,choice.room),{type:'SUGGEST',suspect:choice.suspect,weapon:choice.weapon});assert.equal(s.suggestion!.responderPlayerId,s.players[2]!.playerId);
  s=act(s,{type:'SHOW_CARD',cardId:card.cardId},s.players[2]!.playerId);assert.equal(s.phase,'PEEK');assert.equal(project(s,1).privateState.evidence.length,0);
  assert.equal(applyClueAction(s,s.players[3]!.playerId,{type:'USE_BONUS',kind:'PEEK'},at,v.parse(TurnIdSchema,'bad'),random()).ok,false);
  s=act(s,{type:'USE_BONUS',kind:'PEEK'},s.players[1]!.playerId);assert.equal(project(s,1).privateState.evidence[0]!.card.cardId,card.cardId);assert.equal(project(s,3).privateState.evidence.length,0);
  s=act(s,{type:'SKIP_PEEK'},s.players[3]!.playerId);assert.equal(s.phase,'END_TURN');assert.deepEqual(s.players[3]!.bonusHand,['PEEK']);assert.equal(project(s,3).privateState.evidence.length,0);
});
test('Clue bonus: exhausted deck reshuffles discard and rejects corrupt inventories or pending states',()=>{
  const s=game();s.bonus.discard=s.bonus.deck;s.bonus.deck=[];s.tokens[0]!.location='C:10:15';s.die=6;s.phase='MOVE';
  const next=act(s,{type:'MOVE',destination:'C:11:15'});assert.equal(next.bonus.deck.length,16);assert.equal(next.bonus.discard.length,0);
  assert.throws(()=>parseClueState({...next,bonus:{...next.bonus,deck:[]}}));
  assert.throws(()=>parseClueState({...game(),phase:'BONUS'}));
});

test('Clue photo map: eight-wide lower hall, four rows to entrance, blocked stair footprint and exact bonus cells',()=>{
  assert.deepEqual(CLUE_BONUS_CELLS,['C:8:5','C:10:6','C:7:8','C:12:12','C:9:13','C:11:15']);
  for(const cell of CLUE_BONUS_CELLS)assert.ok(CLUE_CORRIDORS.includes(cell));
  const row=(y:number)=>CLUE_CORRIDORS.filter(c=>c.endsWith(':'+y));
  assert.equal(row(13).length,8);assert.equal(row(14).length,8);assert.equal(row(15).length,8);assert.equal(row(16).length,4);
  assert.equal(CLUE_CORRIDORS.length,69);
  for(const cell of ['C:6:6','C:7:6','C:8:6','C:6:7','C:7:7','C:8:7','C:8:10','C:11:12'])assert.equal(CLUE_CORRIDORS.includes(cell),false);
  assert.equal(clueReachablePaths('C:9:5',100,[]).has('C:10:6'),false);
  assert.equal(clueReachablePaths('C:9:13',3,[]).has('C:9:16'),true);assert.equal(clueReachablePaths('C:9:13',3,[]).has('HALL'),false);assert.equal(clueReachablePaths('C:9:13',4,[]).has('HALL'),true);
  const reachable=clueReachablePaths('C:9:16',100,[]);for(const cell of CLUE_CORRIDORS){const y=Number(cell.split(':')[2]);assert.equal(cell==='C:9:16'||reachable.has(cell),y>=6,cell);}
});


test('Clue amended doors: red boundary blocks both directions, study only has left door, kitchen/dining is one normal step',()=>{
  assert.equal(clueNeighbors('C:9:5').includes('C:9:6'),false);assert.equal(clueNeighbors('C:9:6').includes('C:9:5'),false);
  assert.deepEqual(clueNeighbors('STUDY'),['C:9:5']);assert.equal(clueNeighbors('C:11:6').includes('STUDY'),false);
  for(const [from,to] of [['KITCHEN','DINING'],['DINING','KITCHEN']] as const){
    assert.deepEqual(clueReachablePaths(from,1,[]).get(to),[to]);
    let s=atRoom(game(),from);s.phase='TURN_START';s=act(s,{type:'ROLL'});s.die=1;s=act(s,{type:'MOVE',destination:to});assert.equal(s.tokens[0]!.location,to);assert.equal(s.phase,'SUGGEST');
    assert.ok([...clueReachablePaths(from,6,[]).values()].every(path=>path.slice(0,-1).every(p=>!isClueRoom(p))));
  }
  let blocked=game();blocked.tokens[0]!.location='C:9:5';blocked.phase='MOVE';blocked.die=6;
  const before=JSON.stringify(blocked);assert.equal(applyClueAction(blocked,blocked.players[0]!.playerId,{type:'MOVE',destination:'C:9:6'},at,v.parse(TurnIdSchema,'blocked-wall'),random()).ok,false);assert.equal(JSON.stringify(blocked),before);
});
