import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as v from "valibot";
import { DuetLobbyPlatformSnapshotV2Schema, DuetPlayingPlatformSnapshotV2Schema, DuetFinishedPlatformSnapshotV2Schema, DuetPlayingProjectionSchema, PlayerIdSchema, type DuetRole } from "@hangul-rummikub/shared";
import { duetControls, duetClueError } from "../features/word-duet/ui.js";
import { DuetScreen } from "../features/word-duet/DuetScreen.js";
import { decodeWebSnapshot, type DuetWebSnapshot } from './snapshot-wire-decoder.js';
import { resolveRoomSnapshotView } from './room-snapshot-view.js';
import { getGameStartControl } from './game-start.js';
const self=v.parse(PlayerIdSchema,'a');
const players=[{playerId:'a',nickname:'별빛',isHost:true,connectionStatus:'CONNECTED'},{playerId:'b',nickname:'달빛',isHost:false,connectionStatus:'CONNECTED'}];
function lobby(){return v.parse(DuetLobbyPlatformSnapshotV2Schema,{snapshotVersion:2,versions:{roomRevision:1,presenceVersion:1},serverTime:1000,self:{playerId:'a'},room:{roomId:'r',roomCode:'ABC234',gameType:'WORD_DUET',phase:'LOBBY',players},game:null});}
function playing(){const l=lobby();const cards=Array.from({length:25},(_,i)=>({cardId:`card-${i}`,word:`단어${i}`,foundBy:null,bystanderFor:[]}));return v.parse(DuetPlayingPlatformSnapshotV2Schema,{...l,room:{...l.room,phase:'PLAYING'},game:{gameType:'WORD_DUET',gameId:'g',gameRevision:0,rulesVersion:'duet-2025-ko-v1',phase:'CLUE',turnId:'t',clueGiverId:null,guessesThisTurn:0,cards,tokensRemaining:9,foundCount:0,playerStates:players.map(p=>({playerId:p.playerId,cluesComplete:false,passed:false})),privateState:{playerId:'a',key:cards.map((c,i)=>({cardId:c.cardId,role:i<9?'AGENT':i<12?'ASSASSIN':'BYSTANDER'}))},currentClue:null,history:[]}});}
const render=(snapshot:DuetWebSnapshot)=>renderToStaticMarkup(createElement(DuetScreen,{snapshot,connected:true,pending:false,error:null,connectionLabel:'접속 중',onCommand:async()=>{},onRematch:()=>{},onStart:()=>{},onLeave:()=>{},onCopy:()=>{}}));
test('DUET UI: concrete lobby/playing/finished route, original art lobby and 25 accessible cards',()=>{
 const l=lobby(),s=playing(),g=s.game;
 const finished=v.parse(DuetFinishedPlatformSnapshotV2Schema,{...s,room:{...s.room,phase:'FINISHED'},game:{gameType:g.gameType,gameId:g.gameId,gameRevision:1,rulesVersion:g.rulesVersion,cards:g.cards,tokensRemaining:g.tokensRemaining,foundCount:0,playerStates:g.playerStates,privateState:g.privateState,currentClue:null,history:[],phase:'FINISHED',result:{reason:'CANCELLED',winnerPlayerIds:[]},revealedKeys:players.map(p=>({playerId:p.playerId,key:g.privateState.key}))}});
 for(const x of [l,s,finished]){const d=decodeWebSnapshot(x);assert.equal(d.kind,'COMPATIBLE');if(d.kind!=='COMPATIBLE')throw new Error();assert.equal(resolveRoomSnapshotView(d.value).kind,'WORD_DUET');}
 assert.match(render(l),/우리 둘만의 작전/);assert.match(render(l),/작전 시작/);
 const html=render(s);assert.equal((html.match(/class="duet-word /g)??[]).length,25);assert.match(html,/힌트 보내기/);assert.match(html,/나만의 비밀 지도/);assert.match(render(finished),/취소되었습니다/);
 assert.equal(getGameStartControl(l,false).canStart,true);
});
test('DUET UI: controls separate giver/guesser, key completion, zero and final guesses',()=>{
 const s=playing(),g=s.game;assert.ok(duetControls(g,self).canClue);
 const guessing=v.parse(DuetPlayingProjectionSchema,{...g,phase:'GUESS',clueGiverId:'b',currentClue:{playerId:'b',word:'암호',number:0}});
 assert.ok(duetControls(guessing,self).canGuess);assert.equal(duetControls(guessing,self).canEnd,false);
 assert.ok(duetControls({...guessing,guessesThisTurn:1},self).canEnd);
 assert.equal(duetControls({...guessing,clueGiverId:self},self).canGuess,false);
 assert.ok(duetControls({...guessing,phase:'SUDDEN_DEATH',clueGiverId:null},self).canGuess);
 const complete={...guessing,phase:'SUDDEN_DEATH' as const,clueGiverId:null,playerStates:guessing.playerStates.map(p=>({...p,cluesComplete:p.playerId!=='a'}))};assert.equal(duetControls(complete,self).canGuess,false);
 assert.equal(duetClueError('암호',g.cards),null);assert.ok(duetClueError(g.cards[0]!.word,g.cards));assert.ok(duetClueError('두 단어',g.cards));
});
test('DUET DTO: reject other viewer and concealed fields even if UI would not render them',()=>{
 const s=playing();assert.equal(v.safeParse(DuetPlayingPlatformSnapshotV2Schema,{...s,game:{...s.game,privateState:{...s.game.privateState,playerId:'b'}}}).success,false);
 assert.equal(v.safeParse(DuetPlayingPlatformSnapshotV2Schema,{...s,game:{...s.game,revealedKeys:[]}}).success,false);
 const roles:DuetRole[]=['AGENT','ASSASSIN'];assert.equal(v.safeParse(DuetPlayingPlatformSnapshotV2Schema,{...s,game:{...s.game,cards:s.game.cards.map(c=>({...c,roles}))}}).success,false);
});

test('DUET portraits: only public contacts get art, initial render never replays the reveal',()=>{
 const s=playing();
 assert.doesNotMatch(render(s),/duet-card-cover/);
 const found=v.parse(DuetPlayingPlatformSnapshotV2Schema,{...s,game:{...s.game,foundCount:1,cards:s.game.cards.map((c,i)=>i===0?{...c,foundBy:'b'}:c)}});
 const html=render(found);
 assert.equal((html.match(/class="duet-card-cover"/g)??[]).length,1);
 assert.match(html,/agent-contact.webp/);
 assert.match(html,/단어0 · 발견한 요원/);
 assert.doesNotMatch(html,/assassin-contact.webp|is-arriving/);
});
