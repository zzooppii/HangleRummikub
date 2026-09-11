import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, safeParse } from "valibot";
import { GuryongtuPlayingPlatformSnapshotV2Schema, GuryongtuLobbyPlatformSnapshotV2Schema, GuryongtuFinishedPlatformSnapshotV2Schema, GuryongtuClientCommandSchema, GAME_PLAYER_LIMITS, TurnIdSchema } from "@hangul-rummikub/shared";
import { GuryongtuScreen } from "../features/guryongtu/GuryongtuScreen.js";
import { guryongtuInstruction, guryongtuSelection, guryongtuScope } from "../features/guryongtu/ui.js";
import { decodeWebSnapshot, type GuryongtuWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
const players = [{playerId:'a',nickname:'하비',isHost:true,connectionStatus:'CONNECTED'}, {playerId:'b',nickname:'친구',isHost:false,connectionStatus:'CONNECTED'}];
function lobby(n = 2) {return parse(GuryongtuLobbyPlatformSnapshotV2Schema,{snapshotVersion:2,versions:{roomRevision:1,presenceVersion:1},serverTime:1000,self:{playerId:'a'},room:{roomId:'room-gt',roomCode:'BCDFGH',gameType:'GURYONGTU',phase:'LOBBY',players:players.slice(0,n)},game:null});}
function playing() {const l = lobby(); return parse(GuryongtuPlayingPlatformSnapshotV2Schema,{...l,room:{...l.room,phase:'PLAYING'},game:{gameType:'GURYONGTU',gameId:'gt-game',gameRevision:0,rulesVersion:'guryongtu-base-v1',round:1,roundId:'r1',attackerId:'a',phase:'PLAYING',stage:'ATTACK',turnId:'t1',activePlayerId:'a',submitted:null,history:[],roundResults:[],playerStates:players.map(p=>({playerId:p.playerId,handCount:9,oddCount:5,evenCount:4,wins:0,matchWins:0})),privateState:{playerId:'a',hand:Array.from({length:9},(_,i)=>({tileId:`own-${i}`,rank:i+1})),used:[],submitted:null}}});}
const render = (snapshot: GuryongtuWebSnapshot, connected = true) => renderToStaticMarkup(createElement(GuryongtuScreen,{snapshot,connected,pending:false,error:null,connectionLabel:connected?'접속 중':'재접속 중',onCommand:async()=>{},onRematch:()=>{},onStart:()=>{},onLeave:()=>{},onCopy:()=>{}}));
test('GURYONGTU UI: concrete routing, accessible tile controls, 2-player start, cancellation',()=>{
  const l=lobby(),p=playing(); const {phase: _phase, ...base}=p.game; const clean = Object.fromEntries(Object.entries(base).filter(([key])=>!['stage','turnId','activePlayerId'].includes(key))); const f=parse(GuryongtuFinishedPlatformSnapshotV2Schema,{...l,room:{...l.room,phase:'FINISHED'},game:{...clean,phase:'FINISHED',result:{reason:'CANCELLED',winnerPlayerIds:[]}}});
  for (const s of [l,p,f]) {const d=decodeWebSnapshot(s);assert.equal(d.kind,'COMPATIBLE');if(d.kind!=='COMPATIBLE')throw new Error();assert.equal(resolveRoomSnapshotView(d.value).kind,'GURYONGTU');assert.match(render(s),/구룡투/);}
  assert.deepEqual(GAME_PLAYER_LIMITS.GURYONGTU,{min:2,max:2});assert.equal(getGameStartControl(lobby(1),false).canStart,false);assert.equal(getGameStartControl(l,false).canStart,true);
  assert.equal((render(p).match(/aria-label="\d번/g)??[]).length,9);assert.match(render(f),/매치가 취소되었습니다/);
  assert.match(render(p,false),/aria-label="1번 홀수 타일"/);assert.match(render(p,false),/disabled="" aria-pressed="false"/);
});
test('GURYONGTU UI: draft selection stays within the current actor and scope',()=>{
  const g=playing().game, id=g.privateState.hand[0]!.tileId;
  assert.equal(guryongtuSelection(g,'a',id)?.rank,1);assert.equal(guryongtuSelection(g,'b',id),null);assert.equal(guryongtuSelection(g,'a',null),null);
  assert.match(guryongtuInstruction(g,'a'),/먼저/);assert.match(guryongtuInstruction(g,'b'),/상대/);
  assert.notEqual(guryongtuScope(g),guryongtuScope({...g,roundId:parse(TurnIdSchema,'round-new')}));
});
test('GURYONGTU DTO: only opaque tile submissions, current scope, exact viewer and concealed numbers',()=>{
  const c={kind:'guryongtu:act',protocolVersion:1,requestId:'request',gameId:'game',expectedGameRevision:0,turnId:'turn',payload:{kind:'PLAY_TILE',tileId:'opaque'}};
  assert.equal(safeParse(GuryongtuClientCommandSchema,c).success,true);
  for(const bad of [{...c,turnId:undefined},{...c,expectedGameRevision:-1},{...c,payload:{...c.payload,rank:9}},{...c,payload:{...c.payload,actorPlayerId:'b'}},{...c,payload:{kind:'PLAY_TILE',tileId:''}}])assert.equal(safeParse(GuryongtuClientCommandSchema,bad).success,false);
  const s=playing();
  for(const game of [{...s.game,privateState:{...s.game.privateState,playerId:'b'}},{...s.game,submitted:{playerId:'b',parity:'ODD',rank:7}},{...s.game,playerStates:s.game.playerStates.map(p=>({...p,hand:[]}))}])assert.equal(safeParse(GuryongtuPlayingPlatformSnapshotV2Schema,{...s,game}).success,false);
});
test('GURYONGTU UI: a previous result remains labeled with its duel while the next tile is pending',()=>{
  const s=playing(),g=s.game;
  const snapshot=parse(GuryongtuPlayingPlatformSnapshotV2Schema,{...s,game:{...g,gameRevision:3,stage:'DEFEND',activePlayerId:'b',submitted:{playerId:'a',parity:'EVEN'},
    history:[{duel:1,attackerId:'a',plays:[{playerId:'a',parity:'ODD'},{playerId:'b',parity:'ODD'}],winnerPlayerId:'a'}],
    playerStates:[{playerId:'a',handCount:7,oddCount:4,evenCount:3,wins:1,matchWins:0},{playerId:'b',handCount:8,oddCount:4,evenCount:4,wins:0,matchWins:0}],
    privateState:{playerId:'a',hand:g.privateState.hand.slice(2),used:g.privateState.hand.slice(0,1),submitted:g.privateState.hand[1]}}});
  const html=render(snapshot);assert.match(html,/1번째 대결 · 승리/);assert.match(html,/2번째 대결/);assert.match(html,/상대가 응수할 타일/);
});
