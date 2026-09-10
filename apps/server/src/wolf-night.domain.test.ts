import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema, GameRevisionSchema, ServerTimeSchema, WolfActionSchema, defaultWolfDeck, WOLF_ROLES, type WolfRole, type WolfStage } from "@hangul-rummikub/shared";
import { createWolfGame, actWolf, advanceWolf, actionRole, voteWolf, sayWolf, parseWolfState, cancelWolf, effectiveRole, type WolfState } from "./games/wolf-night/domain/game.js";
import { projectWolf } from "./games/wolf-night/compatibility/projector.js";
import { WolfGameStateAdapter } from "./games/wolf-night/compatibility/adapter.js";
let token = 0;
function create(deck: WolfRole[] = defaultWolfDeck(3)) {
  return createWolfGame({ gameId: parse(GameIdSchema, "wolf-game"), playerIds: deck.slice(3).map((_,i) => parse(PlayerIdSchema, `player-${i}`)), settings: { roles: deck, discussionSeconds: 120 }, deck, now: 1000, transitionId: parse(TurnIdSchema, `phase-${++token}`) });
}
function advance(s: WolfState) { return advanceWolf(s, s.nextTransitionAt!, parse(TurnIdSchema, `phase-${++token}`), 0, 0); }
function stage(s: WolfState, target: WolfStage): WolfState { for(let n=0; n<15 && s.stage !== target; n++) s=advance(s); assert.equal(s.stage,target); return s; }
function act(s: WolfState, index: number, payload: unknown) {
  const p=s.players[index]!; const result=actWolf(s,p.playerId,s.transitionId,p.actionRevision,parse(WolfActionSchema,payload),s.phaseStartedAt+1);
  assert.ok(result.ok); return result.state;
}
function cast(s: WolfState, choices: number[]) { for (let i=0;i<choices.length;i++) { const next=voteWolf(s,s.players[i]!.playerId,s.players[choices[i]!]!.playerId,s.transitionId,s.phaseStartedAt+1); assert.ok(next); s=next; } return s; }
function view(s: WolfState, index=0) { return projectWolf({state:s,gameId:s.gameId,gameRevision:parse(GameRevisionSchema,s.revision),startedAt:parse(ServerTimeSchema,s.startedAt),finishedAt:s.finishedAt===null?null:parse(ServerTimeSchema,s.finishedAt)},s.players[index]!.playerId); }
for(const n of [3,4,5,6,7,8,9,10]) test(`WOLF ${n} participants: card conservation, three center cards and deterministic timeout completion`,()=>{
  let s=create(defaultWolfDeck(n));assert.equal(s.players.length,n);assert.equal(s.center.length,3);const initial=structuredClone(s);
  s=stage(s,"FINISHED");assert.equal(s.result!.eliminatedPlayerIds.length,0);assert.equal(s.result!.wolvesWin,true);assert.deepEqual(initial,createWolfGame({gameId:initial.gameId,playerIds:initial.players.map(p=>p.playerId),settings:initial.settings,deck:initial.deck,now:initial.startedAt,transitionId:initial.transitionId}));
  assert.deepEqual(parseWolfState(JSON.parse(JSON.stringify(s))),s);
});
test("WOLF deadline, role ownership, duplicate action and forged self/foreign/duplicate targets reject without modifying input",()=>{
 const s=stage(create(["SEER","ROBBER","TROUBLEMAKER","WEREWOLF","WEREWOLF","VILLAGER"]),"SEER"),before=structuredClone(s),p=s.players[0]!;
 for(const [who,phase,revision,now,payload] of [
  [1,s.transitionId,s.players[1]!.actionRevision,s.phaseStartedAt+1,{type:"PLAYERS",playerIds:[p.playerId]}],
  [0,"wrong",p.actionRevision,s.phaseStartedAt+1,{type:"CENTER",indices:[0,1]}],
  [0,s.transitionId,p.actionRevision,s.nextTransitionAt!,{type:"CENTER",indices:[0,1]}],
  [0,s.transitionId,p.actionRevision,s.phaseStartedAt+1,{type:"PLAYERS",playerIds:[p.playerId]}],
  [0,s.transitionId,p.actionRevision,s.phaseStartedAt+1,{type:"PLAYERS",playerIds:["unknown"]}],
 ] as const){ assert.equal(actWolf(s,s.players[who]!.playerId,phase,revision,parse(WolfActionSchema,payload),now).ok,false); }
 assert.deepEqual(s,before);const next=act(s,0,{type:"CENTER",indices:[0,1]});assert.equal(next.players[0]!.observations[0]!.cards.length,2);
 assert.equal(actWolf(next,p.playerId,s.transitionId,p.actionRevision,{type:"PASS"},s.phaseStartedAt+2).ok,false);
});
test("WOLF robber knows new face, target learns nothing, troublemaker conserves identities and never reveals exchanged faces",()=>{
 let s=stage(create(["ROBBER","WEREWOLF","TROUBLEMAKER","SEER","WEREWOLF","VILLAGER"]),"ROBBER");
 s=act(s,0,{type:"PLAYERS",playerIds:[s.players[1]!.playerId]});assert.equal(s.players[0]!.card.role,"WEREWOLF");assert.equal(s.players[1]!.card.role,"ROBBER");assert.equal(s.players[1]!.originalRole,"WEREWOLF");
 s=stage(s,"TROUBLEMAKER");s=act(s,2,{type:"PLAYERS",playerIds:[s.players[0]!.playerId,s.players[1]!.playerId]});
 assert.equal(s.players[0]!.card.role,"ROBBER");assert.deepEqual(s.players[2]!.observations.at(-1)!.cards,[]);assert.equal(s.players[0]!.observations.at(-1)!.cards[0]!.role,"WEREWOLF");
});
test("WOLF drunk must exchange without learning card; insomniac receives its current card at the end",()=>{
 let s=stage(create(["DRUNK","INSOMNIAC","ROBBER","WEREWOLF","WEREWOLF","SEER"]),"ROBBER");
 s=act(s,2,{type:"PLAYERS",playerIds:[s.players[1]!.playerId]});s=stage(s,"DRUNK");
 assert.equal(actWolf(s,s.players[0]!.playerId,s.transitionId,s.players[0]!.actionRevision,{type:"PASS"},s.phaseStartedAt+1).ok,false);
 s=act(s,0,{type:"CENTER",indices:[0]});assert.equal(s.players[0]!.card.role,"WEREWOLF");assert.deepEqual(s.players[0]!.observations.at(-1)!.cards,[]);
 s=stage(s,"INSOMNIAC");assert.equal(s.players[1]!.observations.at(-1)!.cards[0]!.role,"ROBBER");
});
for(const copied of WOLF_ROLES.filter(r=>r!=="DOPPELGANGER")) test(`WOLF Doppelganger copies ${copied} with correct timing and card-bound identity`,()=>{
 let deck:WolfRole[]=["DOPPELGANGER",copied,"VILLAGER","WEREWOLF","SEER","ROBBER"];
 if(copied==="SEER")deck[4]="TROUBLEMAKER";
 if(copied==="ROBBER")deck[5]="TROUBLEMAKER";
 if(copied==="MASON")deck[4]="MASON";
 let s=stage(create(deck),"DOPPELGANGER");s=act(s,0,{type:"PLAYERS",playerIds:[s.players[1]!.playerId]});
 assert.equal(s.players[0]!.copiedRole,copied);assert.equal(effectiveRole(s.players[0]!.card),copied);
 if(copied==="SEER"){assert.equal(actionRole(s,s.players[0]!),"SEER");s=act(s,0,{type:"CENTER",indices:[0,1]});assert.equal(s.players[0]!.observations.at(-1)!.cards.length,2);}
 if(copied==="ROBBER"){s=act(s,0,{type:"PLAYERS",playerIds:[s.players[2]!.playerId]});assert.equal(s.players[0]!.card.role,"VILLAGER");assert.equal(effectiveRole(s.players[2]!.card),"ROBBER");}
 if(copied==="TROUBLEMAKER"){s=act(s,0,{type:"PLAYERS",playerIds:[s.players[1]!.playerId,s.players[2]!.playerId]});assert.equal(s.players[2]!.card.role,"TROUBLEMAKER");}
 if(copied==="DRUNK"){s=act(s,0,{type:"CENTER",indices:[0]});assert.equal(effectiveRole(s.center[0]),"DRUNK");}
 if(copied==="MINION")assert.equal(s.players[0]!.observations.at(-1)!.label,"WOLVES");
 if(copied==="WEREWOLF"){s=stage(s,"WEREWOLF");assert.deepEqual(s.players[0]!.observations.at(-1)!.playerIds,[s.players[1]!.playerId]);assert.equal(actionRole(s,s.players[0]!),null);}
 if(copied==="MASON"){s=stage(s,"MASON");assert.deepEqual(s.players[1]!.observations.at(-1)!.playerIds,[s.players[0]!.playerId]);}
 if(copied==="INSOMNIAC"){s=stage(s,"INSOMNIAC");assert.equal(s.players[0]!.observations.length,1);s=stage(s,"DOPPEL_INSOMNIAC");assert.equal(s.players[0]!.observations.at(-1)!.cards[0]!.role,"DOPPELGANGER");}
 s=stage(s,"DISCUSSION");assert.equal(actionRole(s,s.players[0]!),null);
});
test("WOLF lone wolf sees one center; minion observes wolves without being revealed to them; pair Masons see each other",()=>{
 let s=stage(create(["WEREWOLF","MINION","VILLAGER","SEER","ROBBER","TROUBLEMAKER"]),"WEREWOLF");assert.equal(actionRole(s,s.players[0]!),"WEREWOLF");s=act(s,0,{type:"CENTER",indices:[2]});s=stage(s,"MINION");assert.deepEqual(s.players[1]!.observations[0]!.playerIds,[s.players[0]!.playerId]);assert.equal(s.players[0]!.observations[0]!.playerIds.length,0);
 s=stage(create(["MASON","MASON","VILLAGER","SEER","ROBBER","WEREWOLF"]),"MASON");assert.deepEqual(s.players[0]!.observations[0]!.playerIds,[s.players[1]!.playerId]);
});
test("WOLF mandatory timeout copy and drunk exchange execute once; optional copy ability expires",()=>{
 let s=stage(create(["DOPPELGANGER","DRUNK","VILLAGER","SEER","ROBBER","WEREWOLF"]),"DOPPELGANGER");s=advance(s);assert.equal(s.players[0]!.copiedRole,"DRUNK");assert.equal(s.players[0]!.card.role,"SEER");assert.equal(s.players[0]!.observations.filter(n=>n.label==="AUTO").length,2);
 s=stage(s,"DRUNK");s=advance(s);assert.equal(s.players[1]!.card.role,"DOPPELGANGER");assert.equal(effectiveRole(s.players[1]!.card),"DRUNK");
});
test("WOLF final roles decide winners; no new role is leaked during discussion or partial voting",()=>{
 let s=stage(create(["ROBBER","WEREWOLF","VILLAGER","SEER","WEREWOLF","TROUBLEMAKER"]),"ROBBER");s=act(s,0,{type:"PLAYERS",playerIds:[s.players[1]!.playerId]});s=stage(s,"VOTE");
 const before=view(s,1);assert.equal(before.phase,"PLAYING");assert.equal("result" in before,false);assert.equal("center" in before,false);assert.deepEqual(before.deck,[...s.deck].sort());
 s=cast(s,[1,0,0]);assert.equal(s.result!.villageWins,true);assert.equal(s.result!.winnerPlayerIds.includes(s.players[0]!.playerId),false);assert.equal(s.result!.winnerPlayerIds.includes(s.players[1]!.playerId),true);
});
test("WOLF one vote each kills nobody, no wolves yields village victory; tied majority kills all tied players",()=>{
 let s=cast(stage(create(["SEER","ROBBER","VILLAGER","WEREWOLF","WEREWOLF","TROUBLEMAKER"]),"VOTE"),[1,2,0]);assert.equal(s.result!.villageWins,true);assert.deepEqual(s.result!.eliminatedPlayerIds,[]);
 s=cast(stage(create(["WEREWOLF","TANNER","VILLAGER","ROBBER","SEER","WEREWOLF","TROUBLEMAKER"]),"VOTE"),[1,0,1,0]);assert.equal(s.result!.eliminatedPlayerIds.length,2);assert.equal(s.result!.villageWins,true);assert.equal(s.result!.tannerWins,true);
});
test("WOLF hunter and Doppelganger-hunter chain; Tanner alone overrides wolf victory",()=>{
 let s=stage(create(["HUNTER","WEREWOLF","VILLAGER","SEER","ROBBER","TROUBLEMAKER"]),"VOTE");s=cast(s,[1,0,0]);assert.equal(s.result!.eliminatedPlayerIds.length,2);assert.equal(s.result!.villageWins,true);
 s=stage(create(["DOPPELGANGER","HUNTER","WEREWOLF","SEER","ROBBER","TROUBLEMAKER"]),"DOPPELGANGER");s=act(s,0,{type:"PLAYERS",playerIds:[s.players[1]!.playerId]});s=cast(stage(s,"VOTE"),[1,2,0]);assert.equal(s.result!.eliminatedPlayerIds.length,0);
 s=stage(create(["DOPPELGANGER","HUNTER","WEREWOLF","VILLAGER","SEER","ROBBER","TROUBLEMAKER"]),"DOPPELGANGER");s=act(s,0,{type:"PLAYERS",playerIds:[s.players[1]!.playerId]});s=cast(stage(s,"VOTE"),[1,2,0,0]);assert.equal(s.result!.eliminatedPlayerIds.length,3);assert.equal(s.result!.villageWins,true);
 s=cast(stage(create(["TANNER","WEREWOLF","VILLAGER","SEER","ROBBER","TROUBLEMAKER"]),"VOTE"),[1,0,0]);assert.equal(s.result!.tannerWins,true);assert.equal(s.result!.wolvesWin,false);assert.equal(s.result!.villageWins,false);
});
test("WOLF minion without wolves wins only on another non-minion death, Tanner takes precedence",()=>{
 let s=cast(stage(create(["MINION","SEER","VILLAGER","WEREWOLF","WEREWOLF","ROBBER"]),"VOTE"),[1,2,1]);assert.equal(s.result!.wolvesWin,true);assert.deepEqual(s.result!.winnerPlayerIds,[s.players[0]!.playerId]);
 s=cast(stage(create(["MINION","TANNER","VILLAGER","WEREWOLF","WEREWOLF","ROBBER"]),"VOTE"),[1,2,1]);assert.equal(s.result!.wolvesWin,false);assert.equal(s.result!.tannerWins,true);
});
test("WOLF per-viewer observations, rate-limited day chat, cancellation and storage corruption checks",()=>{
 let s=stage(create(["SEER","ROBBER","VILLAGER","WEREWOLF","WEREWOLF","TROUBLEMAKER"]),"SEER");s=act(s,0,{type:"CENTER",indices:[0,1]});
 for(let i=0;i<3;i++){const own=view(s,i);assert.equal(own.phase,"PLAYING");if(own.phase!=="PLAYING")throw new Error();assert.equal(own.privateView.playerId,s.players[i]!.playerId);assert.equal(own.privateView.observations.length,i===0?1:0);assert.equal(JSON.stringify(own).includes('"card"'),false);}
 assert.equal(sayWolf(s,s.players[0]!.playerId,"hi",s.transitionId,s.phaseStartedAt+1),null);s=stage(s,"DISCUSSION");
 const next=sayWolf(s,s.players[0]!.playerId,"hello",s.transitionId,s.phaseStartedAt+1);assert.ok(next);assert.equal(sayWolf(next,s.players[0]!.playerId,"again",s.transitionId,s.phaseStartedAt+2),null);
 const cancelled=cancelWolf(next,s.phaseStartedAt+3);assert.equal(cancelled.result!.reason,"CANCELLED");assert.deepEqual(cancelled.result!.winnerPlayerIds,[]);
 const corrupt=structuredClone(s);corrupt.players[0]!.card.id=corrupt.players[1]!.card.id;assert.throws(()=>parseWolfState(corrupt));
 assert.throws(()=>new WolfGameStateAdapter().cloneAndValidate({gameId:s.gameId,gameRevision:parse(GameRevisionSchema,999),startedAt:parse(ServerTimeSchema,s.startedAt),finishedAt:null,state:s}));
});
test("WOLF drunk receiving an unawakened center Doppelganger gets no copied ability and is on village team",()=>{
 let s=stage(create(["DRUNK","WEREWOLF","VILLAGER","DOPPELGANGER","SEER","ROBBER"]),"DRUNK");s=act(s,0,{type:"CENTER",indices:[0]});assert.equal(s.players[0]!.card.role,"DOPPELGANGER");assert.equal(s.players[0]!.card.copiedRole,null);assert.equal(actionRole(s,s.players[0]!),null);
 s=cast(stage(s,"VOTE"),[1,2,1]);assert.equal(s.result!.villageWins,true);assert.ok(s.result!.winnerPlayerIds.includes(s.players[0]!.playerId));
});

test("WOLF checklist: Seer then Robber then Troublemaker then Drunk preserves every physical card and result",()=>{
 let s=create(["SEER","ROBBER","TROUBLEMAKER","DRUNK","WEREWOLF","WEREWOLF","VILLAGER"]);
 const originals=s.players.map(p=>p.originalRole),ids=[...s.players.map(p=>p.card.id),...s.center.map(c=>c.id)].sort();
 const conserved=()=>assert.deepEqual([...s.players.map(p=>p.card.id),...s.center.map(c=>c.id)].sort(),ids);
 s=stage(s,"SEER");s=act(s,0,{type:"PLAYERS",playerIds:[s.players[1]!.playerId]});
 assert.deepEqual(s.players[0]!.observations.at(-1)!.cards,[{location:s.players[1]!.playerId,role:"ROBBER"}]);conserved();
 s=advance(s);assert.equal(s.stage,"ROBBER");s=act(s,1,{type:"PLAYERS",playerIds:[s.players[3]!.playerId]});
 assert.deepEqual(s.players.map(p=>p.card.role),["SEER","DRUNK","TROUBLEMAKER","ROBBER"]);conserved();
 s=advance(s);assert.equal(s.stage,"TROUBLEMAKER");s=act(s,2,{type:"PLAYERS",playerIds:[s.players[0]!.playerId,s.players[3]!.playerId]});
 assert.deepEqual(s.players.map(p=>p.card.role),["ROBBER","DRUNK","TROUBLEMAKER","SEER"]);assert.deepEqual(s.players[2]!.observations.at(-1)!.cards,[]);conserved();
 s=advance(s);assert.equal(s.stage,"DRUNK");assert.equal(actionRole(s,s.players[1]!),null);assert.equal(actionRole(s,s.players[3]!),"DRUNK");
 s=act(s,3,{type:"CENTER",indices:[0]});assert.deepEqual(s.players.map(p=>p.card.role),["ROBBER","DRUNK","TROUBLEMAKER","WEREWOLF"]);
 assert.deepEqual(s.center.map(c=>c.role),["SEER","WEREWOLF","VILLAGER"]);assert.deepEqual(s.players[3]!.observations.at(-1)!.cards,[]);conserved();
 s=cast(stage(s,"VOTE"),[3,3,3,0]);
 assert.deepEqual(s.result!.players.map(p=>p.originalRole),originals);
 assert.deepEqual(s.result!.players.map(p=>p.finalRole),["ROBBER","DRUNK","TROUBLEMAKER","WEREWOLF"]);
 assert.deepEqual(s.result!.eliminatedPlayerIds,[s.players[3]!.playerId]);assert.deepEqual(s.result!.winnerPlayerIds,s.players.slice(0,3).map(p=>p.playerId));
 const projected=view(s);assert.equal(projected.phase,"FINISHED");if(projected.phase!=="FINISHED")throw new Error();assert.deepEqual(projected.result,s.result);conserved();
});
test("WOLF checklist: four distinct votes kill nobody; no wolves with a village death has no winners",()=>{
 const deck:WolfRole[]=["SEER","ROBBER","VILLAGER","TROUBLEMAKER","WEREWOLF","WEREWOLF","VILLAGER"];
 let s=cast(stage(create(deck),"VOTE"),[1,2,3,0]);assert.deepEqual(s.result!.eliminatedPlayerIds,[]);assert.equal(s.result!.villageWins,true);
 s=cast(stage(create(deck),"VOTE"),[1,0,0,0]);assert.deepEqual(s.result!.eliminatedPlayerIds,[s.players[0]!.playerId]);assert.deepEqual(s.result!.winnerPlayerIds,[]);
});
test("WOLF checklist: Seer alternatives are exclusive and invalid cardinality leaves state unchanged",()=>{
 for(const choice of ["PLAYERS","CENTER"] as const){
  const s=stage(create(["SEER","ROBBER","VILLAGER","WEREWOLF","WEREWOLF","TROUBLEMAKER"]),"SEER"),p=s.players[0]!,before=structuredClone(s);
  for(const payload of [{type:"CENTER",indices:[0]},{type:"PLAYERS",playerIds:[s.players[1]!.playerId,s.players[2]!.playerId]}])assert.equal(actWolf(s,p.playerId,s.transitionId,p.actionRevision,parse(WolfActionSchema,payload),s.phaseStartedAt+1).ok,false);
  assert.deepEqual(s,before);
  const first=act(s,0,choice==="PLAYERS"?{type:"PLAYERS",playerIds:[s.players[1]!.playerId]}:{type:"CENTER",indices:[0,1]});
  assert.equal(first.players[0]!.observations[0]!.cards.length,choice==="PLAYERS"?1:2);
  assert.equal(actWolf(first,p.playerId,first.transitionId,first.players[0]!.actionRevision,choice==="PLAYERS"?{type:"CENTER",indices:[0,1]}:{type:"PLAYERS",playerIds:[s.players[1]!.playerId]},first.phaseStartedAt+2).ok,false);
 }
});
test("WOLF checklist: lone Mason learns no partner and a center Mason stays concealed",()=>{
 const s=stage(create(["MASON","SEER","VILLAGER","MASON","ROBBER","WEREWOLF"]),"MASON"),own=view(s);
 assert.equal(own.phase,"PLAYING");if(own.phase!=="PLAYING")throw new Error();
 assert.deepEqual(own.privateView.observations,[{label:"MASONS",playerIds:[],cards:[]}]);assert.equal("center" in own,false);
});
test("WOLF checklist: no-wolf Minion cannot win by own death or no deaths",()=>{
 for(const choices of [[1,0,0],[1,2,0]]){
  const s=cast(stage(create(["MINION","SEER","VILLAGER","WEREWOLF","WEREWOLF","ROBBER"]),"VOTE"),choices);
  assert.equal(s.result!.wolvesWin,false);assert.equal(s.result!.winnerPlayerIds.includes(s.players[0]!.playerId),false);
  assert.equal(s.result!.villageWins,choices[1]===2);
 }
});
