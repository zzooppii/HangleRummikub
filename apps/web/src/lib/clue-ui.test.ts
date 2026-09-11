import assert from "node:assert/strict";
import test from "node:test";
import {createElement} from "react";
import {renderToStaticMarkup} from "react-dom/server";
import {parse,safeParse} from "valibot";
import {CLUE_CARD_KEYS,CLUE_SUSPECTS,CLUE_WEAPONS,CLUE_ROOMS,CLUE_STARTS,ClueLobbyPlatformSnapshotV2Schema,CluePlayingPlatformSnapshotV2Schema,ClueFinishedPlatformSnapshotV2Schema,ClueClientCommandSchema} from "@hangul-rummikub/shared";
import {ClueScreen} from "../features/clue/ClueScreen.js";
import {clueControls,clueKnownOwner,clueNoteStorageKey,parseClueNotes} from "../features/clue/ui.js";
import {decodeWebSnapshot,type ClueWebSnapshot} from "./snapshot-wire-decoder.js";
import {resolveRoomSnapshotView} from "./room-snapshot-view.js";
import {getGameStartControl} from "./game-start.js";
const players=[{playerId:"a",nickname:"하비",isHost:true,connectionStatus:"CONNECTED"},{playerId:"b",nickname:"민지",isHost:false,connectionStatus:"CONNECTED"},{playerId:"c",nickname:"준",isHost:false,connectionStatus:"CONNECTED"}];
const solution={suspect:"PEACOCK",weapon:"REVOLVER",room:"STUDY"};
const hands=players.map((p,i)=>({playerId:p.playerId,hand:CLUE_CARD_KEYS.filter(k=>![solution.suspect,solution.weapon,solution.room].includes(k)).filter((_,j)=>j%3===i).map(key=>({key,cardId:"fixture-"+key}))}));
function lobby(){return parse(ClueLobbyPlatformSnapshotV2Schema,{snapshotVersion:2,versions:{roomRevision:1,presenceVersion:1},serverTime:1000,self:{playerId:"a"},room:{roomId:"clue-room",roomCode:"ABCDEF",gameType:"CLUE",phase:"LOBBY",players},game:null});}
function playing(){const l=lobby();return parse(CluePlayingPlatformSnapshotV2Schema,{...l,room:{...l.room,phase:"PLAYING"},game:{gameType:"CLUE",gameId:"clue-game",gameRevision:0,rulesVersion:"clue-classic-manor-v1",phase:"TURN_START",turnId:"turn-1",turnPlayerId:"a",turnNumber:1,die:null,suggestion:null,history:[],playerStates:players.map((p,i)=>({playerId:p.playerId,suspect:CLUE_SUSPECTS[i],eliminated:false,summoned:false,cardCount:6})),tokens:CLUE_SUSPECTS.map(suspect=>({suspect,location:CLUE_STARTS[suspect]})),weapons:CLUE_WEAPONS.map((weapon,i)=>({weapon,room:CLUE_ROOMS[i]})),privateState:{playerId:"a",hand:hands[0]!.hand,evidence:[],caseFile:null}}});}
function render(snapshot:ClueWebSnapshot){return renderToStaticMarkup(createElement(ClueScreen,{snapshot,connected:true,pending:false,error:null,connectionLabel:"서버 연결됨",onCommand:async()=>{},onRematch(){},onStart(){},onLeave(){},onCopy(){}}));}
test("Clue UI: lobby, playing and finished use concrete renderer and original illustrated assets",()=>{
  const l=lobby(),p=playing(),{phase:_phase,turnId:_turn,...base}=p.game;
  const f=parse(ClueFinishedPlatformSnapshotV2Schema,{...p,room:{...p.room,phase:"FINISHED"},game:{...base,phase:"FINISHED",privateState:{...base.privateState,caseFile:solution},solution,result:{reason:"SOLVED",winnerPlayerIds:["a"]},revealedHands:hands}});
  for(const s of [l,p,f]){const d=decodeWebSnapshot(s);assert.equal(d.kind,"COMPATIBLE");if(d.kind!=="COMPATIBLE")throw new Error();assert.equal(resolveRoomSnapshotView(d.value).kind,"CLUE");assert.match(render(s),/클루/);}
  assert.equal(getGameStartControl(l,false).canStart,true);assert.match(render(l),/저택에 입장하기/);const html=render(p);assert.match(html,/\/images\/clue\/rooms.webp/);assert.match(html,/\/images\/clue\/suspects.webp/);assert.match(html,/\/images\/clue\/objects.webp/);assert.match(html,/주사위 굴리기/);assert.match(render(f),/하비님이 사건을 해결했습니다/);
});
test("Clue UI: turn owner differs from responder, eliminated player can respond and only selected hand matches",()=>{
  const g=playing().game;assert.equal(clueControls(g,"a").roll,true);assert.equal(clueControls(g,"b").roll,false);
  const responding={...g,phase:"RESPOND" as const,suggestion:{id:1,playerId:g.playerStates[0]!.playerId,suspect:CLUE_SUSPECTS[0],weapon:CLUE_WEAPONS[0],room:CLUE_ROOMS[0],passedPlayerIds:[],responderPlayerId:g.playerStates[1]!.playerId,resolved:false}};
  responding.playerStates=responding.playerStates.map(p=>p.playerId==="b"?{...p,eliminated:true}:p);
  assert.equal(clueControls(responding,"b").respond,true);assert.equal(clueControls(responding,"a").respond,false);assert.equal(clueControls(responding,"a").accuse,false);assert.equal(clueControls(responding,"b").roll,false);
});
test("Clue UI: private notes validate keys and marks, isolate games/players and distinguish known facts",()=>{
  assert.deepEqual(parseClueNotes({marks:{"SCARLET:a":"?","SCARLET:outsider":"✓","invented:a":"×","PLUM:a":"bad"},text:"메모"},["a"]),{marks:{"SCARLET:a":"?"},text:"메모"});
  assert.deepEqual(parseClueNotes(null,["a"]),{marks:{},text:""});assert.equal(parseClueNotes({marks:{},text:"x".repeat(3000)},[]).text.length,2000);assert.notEqual(clueNoteStorageKey("g1","a"),clueNoteStorageKey("g2","a"));assert.notEqual(clueNoteStorageKey("g1","a"),clueNoteStorageKey("g1","b"));
  const g=playing().game;assert.equal(clueKnownOwner(g,g.privateState.hand[0]!.key),"a");assert.equal(clueKnownOwner(g,"STUDY"),null);
});
test("Clue DTO: hidden fields, wrong viewer, duplicate hands, forged dice and unauthorized evidence fail closed",()=>{
  const s=playing(),g=s.game;
  for(const bad of [{...g,solution},{...g,privateState:{...g.privateState,playerId:"b"}},{...g,privateState:{...g.privateState,caseFile:solution}},{...g,privateState:{...g.privateState,hand:Array(6).fill(g.privateState.hand[0])}},{...g,privateState:{...g.privateState,evidence:[{suggestionId:1,fromPlayerId:"b",toPlayerId:"c",card:hands[1]!.hand[0]}]}}])assert.equal(safeParse(CluePlayingPlatformSnapshotV2Schema,{...s,game:bad}).success,false);
  const c={kind:"clue:act",protocolVersion:1,requestId:"req",gameId:"game",expectedGameRevision:0,turnId:"turn",payload:{type:"ROLL"}};assert.equal(safeParse(ClueClientCommandSchema,c).success,true);for(const bad of [{...c,payload:{type:"ROLL",die:6}},{...c,actorPlayerId:"a"},{...c,turnId:undefined},{...c,payload:{type:"MOVE",destination:"C:99:0"}}])assert.equal(safeParse(ClueClientCommandSchema,bad).success,false);
});
