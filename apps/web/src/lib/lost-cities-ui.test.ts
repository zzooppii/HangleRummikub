import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, safeParse } from "valibot";
import { LOST_CITIES_SUITS, LostCitiesCardSchema, LostCitiesLobbyPlatformSnapshotV2Schema, LostCitiesPlayingPlatformSnapshotV2Schema, LostCitiesFinishedPlatformSnapshotV2Schema, LostCitiesClientCommandSchema, GAME_PLAYER_LIMITS, type LostCitiesSuit } from "@hangul-rummikub/shared";
import { LostCitiesScreen } from "../features/lost-cities/LostCitiesScreen.js";
import { canPlaceLostCities, emptyLostCitiesDraft, previewLostCities, sortLostCitiesHand } from "../features/lost-cities/ui.js";
import { decodeWebSnapshot, type LostCitiesWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
const card=(suit:LostCitiesSuit,id:string,value:number|'I')=>parse(LostCitiesCardSchema,value==='I'?{suit,cardId:id,kind:'INVESTMENT'}:{suit,cardId:id,kind:'NUMBER',value});
const players=[{playerId:'a',nickname:'하비',isHost:true,connectionStatus:'CONNECTED'},{playerId:'b',nickname:'친구',isHost:false,connectionStatus:'CONNECTED'}];
function lobby(n=2){return parse(LostCitiesLobbyPlatformSnapshotV2Schema,{snapshotVersion:2,versions:{roomRevision:1,presenceVersion:1},serverTime:1000,self:{playerId:'a'},room:{roomId:'lc-room',roomCode:'BCDFGH',gameType:'LOST_CITIES',phase:'LOBBY',players:players.slice(0,n)},game:null});}
const emptyScore=(suit:LostCitiesSuit)=>({suit,cardCount:0,sum:0,cost:0,multiplier:1,bonus:0,total:0});
function playing(){const l=lobby();return parse(LostCitiesPlayingPlatformSnapshotV2Schema,{...l,room:{...l.room,phase:'PLAYING'},game:{gameType:'LOST_CITIES',gameId:'lc-game',gameRevision:0,rulesVersion:'lost-cities-base-v1',round:1,roundId:'r1',phase:'PLAYING',turnId:'t1',activePlayerId:'a',deckCount:44,
  discards:LOST_CITIES_SUITS.map(suit=>({suit,count:0,top:null})),playerStates:players.map(p=>({playerId:p.playerId,handCount:8,cumulative:0,expeditions:LOST_CITIES_SUITS.map(suit=>({suit,cards:[],score:emptyScore(suit)}))})),
  privateState:{playerId:'a',hand:[card('DESERT','h1',2),card('DESERT','h2',4),card('JUNGLE','h3','I'),card('JUNGLE','h4',3),card('OCEAN','h5',6),card('OCEAN','h6',8),card('VOLCANO','h7',10),card('SNOW','h8','I')]},roundResults:[],feedback:null}});}
const render=(snapshot:LostCitiesWebSnapshot)=>renderToStaticMarkup(createElement(LostCitiesScreen,{snapshot,connected:true,pending:false,error:null,connectionLabel:'접속 중',onCommand:async()=>{},onRematch:()=>{},onStart:()=>{},onLeave:()=>{},onCopy:()=>{}}));
function ended(){const p=playing();if(p.game.phase!=='PLAYING')throw new Error();const {turnId:_turn,activePlayerId:_active,...g}=p.game;return {...p,game:{...g,phase:'ROUND_RESULT',deckCount:0,confirmedPlayerIds:[],
  discards:LOST_CITIES_SUITS.map((suit,i)=>({suit,count:i===0?8:9,top:card(suit,`discard-${i}`,9)})),roundResults:[{round:1,scores:players.map(p=>({playerId:p.playerId,expeditions:LOST_CITIES_SUITS.map(emptyScore),total:0,cumulative:0}))}]}};}
test('Lost Cities UI decodes lobby and renders illustration cards, five lanes and hand privacy',()=>{
  for(const s of [lobby(),playing()]){const d=decodeWebSnapshot(s);assert.equal(d.kind,'COMPATIBLE');if(d.kind!=='COMPATIBLE')throw new Error();assert.equal(resolveRoomSnapshotView(d.value).kind,'LOST_CITIES');assert.match(render(s),/LOST CITIES/);}
  const html=render(playing());assert.equal((html.match(/class="lc-hand-card /g)??[]).length,8);assert.equal((html.match(/class="lc-lane /g)??[]).length,5);assert.match(html,/lc-card-art/);assert.match(html,/나에게만 보입니다/);assert.match(html,/턴 확정/);
});
test('Lost Cities round and match screens retain scores and offer appropriate next action',()=>{
  const raw=ended();
  const r=parse(LostCitiesPlayingPlatformSnapshotV2Schema,raw);assert.match(render(r),/확인 · 다음 라운드/);
  const {confirmedPlayerIds:_confirmed,...base}=raw.game;
  const cancelled=parse(LostCitiesFinishedPlatformSnapshotV2Schema,{...raw,room:{...raw.room,phase:'FINISHED'},game:{...base,phase:'FINISHED',result:{reason:'CANCELLED',winnerPlayerIds:[]}}});
  assert.match(render(cancelled),/매치가 취소되었습니다/);assert.match(render(cancelled),/같은 방에서 다시 하기/);
});
test('Lost Cities 2-player start respects connection, host and roster',()=>{
  assert.deepEqual(GAME_PLAYER_LIMITS.LOST_CITIES,{min:2,max:2});assert.equal(getGameStartControl(lobby(1),false).canStart,false);assert.equal(getGameStartControl(lobby(),false).canStart,true);
  const s=lobby();s.room.players[1]!.connectionStatus='OFFLINE';assert.equal(getGameStartControl(s,false).canStart,false);
});
test('Lost Cities draft requires card, destination and valid draw before producing command',()=>{
  const g=playing().game,draft=emptyLostCitiesDraft();assert.equal(previewLostCities(g,draft).action,null);
  draft.cardId=g.privateState.hand[0]!.cardId;draft.kind='PLAY';assert.equal(previewLostCities(g,draft).action,null);
  draft.draw={kind:'DECK'};assert.deepEqual(previewLostCities(g,draft).action,{kind:'PLAY',cardId:draft.cardId,draw:{kind:'DECK'}});
  draft.draw={kind:'DISCARD',suit:'OCEAN'};assert.equal(previewLostCities(g,draft).action,null);
  draft.kind='DISCARD';draft.draw={kind:'DISCARD',suit:'DESERT'};assert.match(previewLostCities(g,draft).hint,/방금 버린/);
});
test('Lost Cities hand ordering and placement hint preserve investment and ascending-number rules',()=>{
  const high=card('DESERT','high',8),low=card('DESERT','low',3),invest=card('DESERT','investment','I');
  assert.equal(canPlaceLostCities(low,[high]),false);assert.equal(canPlaceLostCities(invest,[low]),false);assert.equal(canPlaceLostCities(invest,[invest]),true);assert.equal(canPlaceLostCities(high,[low]),true);
  const source=[high,invest,low];assert.deepEqual(sortLostCitiesHand(source),[invest,low,high]);assert.deepEqual(source,[high,invest,low]);
});
test('Lost Cities strict wire rejects secret fields, false card counts, wrong self and malformed commands',()=>{
  const p=playing();assert.equal(safeParse(LostCitiesPlayingPlatformSnapshotV2Schema,{...p,game:{...p.game,deck:['secret']}}).success,false);
  assert.equal(safeParse(LostCitiesPlayingPlatformSnapshotV2Schema,{...p,game:{...p.game,deckCount:43}}).success,false);
  assert.equal(safeParse(LostCitiesPlayingPlatformSnapshotV2Schema,{...p,self:{playerId:'b'}}).success,false);
  const c={kind:'lostCities:act',protocolVersion:1,requestId:'req',gameId:'game',expectedGameRevision:0,turnId:'turn',payload:{kind:'PLAY',cardId:'card',draw:{kind:'DECK'}}};
  assert.equal(safeParse(LostCitiesClientCommandSchema,c).success,true);assert.equal(safeParse(LostCitiesClientCommandSchema,{...c,payload:{...c.payload,score:100}}).success,false);assert.equal(safeParse(LostCitiesClientCommandSchema,{...c,turnId:undefined}).success,false);
});
