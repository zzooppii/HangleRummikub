import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, safeParse } from "valibot";
import { GameRevisionSchema, TurnIdSchema, PlayerIdSchema, LOST_CITIES_SUITS, LostCitiesCardSchema, LostCitiesLobbyPlatformSnapshotV2Schema, LostCitiesPlayingPlatformSnapshotV2Schema, LostCitiesFinishedPlatformSnapshotV2Schema, LostCitiesClientCommandSchema, GAME_PLAYER_LIMITS, type LostCitiesSuit } from "@hangul-rummikub/shared";
import { LostCitiesScreen } from "../features/lost-cities/LostCitiesScreen.js";
import { canPlaceLostCities, emptyLostCitiesDraft, previewLostCities, sortLostCitiesHand } from "../features/lost-cities/ui.js";
import { decodeWebSnapshot, type LostCitiesWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
const card=(suit:LostCitiesSuit,id:string,value:number|'I')=>parse(LostCitiesCardSchema,value==='I'?{suit,cardId:id,kind:'INVESTMENT'}:{suit,cardId:id,kind:'NUMBER',value});
const players=[{playerId:'a',nickname:'하비',isHost:true,connectionStatus:'CONNECTED'},{playerId:'b',nickname:'친구',isHost:false,connectionStatus:'CONNECTED'}];
function lobby(n=2){return parse(LostCitiesLobbyPlatformSnapshotV2Schema,{snapshotVersion:2,versions:{roomRevision:1,presenceVersion:1},serverTime:1000,self:{playerId:'a'},room:{roomId:'lc-room',roomCode:'BCDFGH',gameType:'LOST_CITIES',phase:'LOBBY',players:players.slice(0,n)},game:null});}
const emptyScore=(suit:LostCitiesSuit)=>({suit,cardCount:0,sum:0,cost:0,multiplier:1,bonus:0,total:0});
function playing(){const l=lobby();return parse(LostCitiesPlayingPlatformSnapshotV2Schema,{...l,room:{...l.room,phase:'PLAYING'},game:{gameType:'LOST_CITIES',gameId:'lc-game',gameRevision:0,rulesVersion:'lost-cities-base-v1',round:1,roundId:'r1',phase:'PLAYING',turnId:'t1',activePlayerId:'a',deadlineAt:61000,deckCount:44,
  discards:LOST_CITIES_SUITS.map(suit=>({suit,count:0,top:null})),playerStates:players.map(p=>({playerId:p.playerId,handCount:8,cumulative:0,expeditions:LOST_CITIES_SUITS.map(suit=>({suit,cards:[],score:emptyScore(suit)}))})),
  privateState:{playerId:'a',hand:[card('DESERT','h1',2),card('DESERT','h2',4),card('JUNGLE','h3','I'),card('JUNGLE','h4',3),card('OCEAN','h5',6),card('OCEAN','h6',8),card('VOLCANO','h7',10),card('SNOW','h8','I')]},roundResults:[],feedback:null}});}
const render=(snapshot:LostCitiesWebSnapshot)=>renderToStaticMarkup(createElement(LostCitiesScreen,{snapshot,connected:true,pending:false,error:null,connectionLabel:'접속 중',onCommand:async()=>{},onRematch:()=>{},onStart:()=>{},onLeave:()=>{},onCopy:()=>{}}));
function ended(){const p=playing();if(p.game.phase!=='PLAYING')throw new Error();const {turnId:_turn,activePlayerId:_active,deadlineAt:_deadline,...g}=p.game;return {...p,game:{...g,phase:'ROUND_RESULT',deckCount:0,confirmedPlayerIds:[],
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

test('Lost Cities expansion lobby exposes host selection and renders six illustrated lanes',()=>{
  const l=lobby();l.room.settings={mode:'SIX_EXPEDITIONS'};
  const html=render(l);assert.match(html,/게임 모드 · 방장 선택/);assert.match(html,/확장판/);assert.match(html,/6개 탐험 · 72장/);assert.match(html,/canyon.png/);
  const guest=render({...l,self:{playerId:l.room.players[1]!.playerId}});assert.match(guest,/<fieldset[^>]*disabled/);
  const p=playing(),suit='CANYON' as const;
  p.room.settings={mode:'SIX_EXPEDITIONS'};p.game.settings={mode:'SIX_EXPEDITIONS'};p.game.rulesVersion='lost-cities-six-v1';p.game.deckCount=56;
  p.game.discards.push({suit,count:0,top:null});p.game.playerStates.forEach(player=>player.expeditions.push({suit,cards:[],score:{suit,cardCount:0,sum:0,cost:0,multiplier:1,bonus:0,total:0}}));
  p.game.privateState.hand[0]=card(suit,'purple-hand',2);
  const parsed=parse(LostCitiesPlayingPlatformSnapshotV2Schema,p),board=render(parsed);
  assert.equal((board.match(/class="lc-lane /g)??[]).length,6);assert.match(board,/협곡 2/);assert.match(board,/여섯 탐험 보드/);assert.match(board,/56장/);
  assert.equal(safeParse(LostCitiesPlayingPlatformSnapshotV2Schema,{...p,room:{...p.room,settings:{mode:'BASE'}}}).success,false);
  assert.equal(safeParse(LostCitiesPlayingPlatformSnapshotV2Schema,{...p,game:{...p.game,settings:{mode:'BASE'}}}).success,false);
});
test('Lost Cities configure command accepts only explicit modes and a room revision',()=>{
  const c={kind:'lostCities:configure',protocolVersion:1,requestId:'configure',expectedRoomRevision:3,payload:{mode:'SIX_EXPEDITIONS'}};
  assert.equal(safeParse(LostCitiesClientCommandSchema,c).success,true);
  for(const invalid of [{...c,payload:{mode:'EXPANSION'}},{...c,payload:{mode:'BASE',cards:72}},{...c,expectedRoomRevision:undefined}])assert.equal(safeParse(LostCitiesClientCommandSchema,invalid).success,false);
});

import { LostCitiesAudio, lostCitiesTransitionCues } from "../features/lost-cities/sound.js";
import { lostCitiesSecondsLeft } from "../features/lost-cities/turn-timer.js";
test('Lost Cities turn banner and timer distinguish ownership, expiry and round results',()=>{
  const p=playing();if(p.game.phase!=='PLAYING')throw new Error();assert.match(render(p),/당신의 차례/);assert.match(render(p),/01:00/);assert.match(render(p),/소리 켜짐/);assert.match(render(p),/lc-turn-mine/);
  p.game.activePlayerId=parse(PlayerIdSchema,'b');assert.match(render(p),/친구의 차례/);assert.match(render(p),/lc-turn-other/);
  p.serverTime=p.game.deadlineAt;const expired=render(p);assert.match(expired,/00:00/);assert.match(expired,/자동 행동을 기다립니다/);
  assert.doesNotMatch(render(parse(LostCitiesPlayingPlatformSnapshotV2Schema,ended())),/role="timer"/);
});
test('Lost Cities countdown uses server time, clamps expiry and accounts for suspended-tab elapsed time',()=>{
  assert.equal(lostCitiesSecondsLeft(61000,1000),60);assert.equal(lostCitiesSecondsLeft(61000,1000,50500),10);
  assert.equal(lostCitiesSecondsLeft(61000,1000,60000),0);assert.equal(lostCitiesSecondsLeft(61000,1000,300000),0);
  assert.equal(lostCitiesSecondsLeft(null,1000),0);
});
test('Lost Cities sound observes accepted transitions once and never replays old feedback on sync',()=>{
  const g=playing().game;if(g.phase!=='PLAYING')throw new Error();assert.deepEqual(lostCitiesTransitionCues(null,g,'a'),['TURN']);
  const next=structuredClone(g);next.gameRevision=parse(GameRevisionSchema,1);next.turnId=parse(TurnIdSchema,'t2');next.activePlayerId=parse(PlayerIdSchema,'b');
  next.feedback={playerId:g.activePlayerId,kind:'DISCARD',card:g.privateState.hand[0]!,draw:{kind:'DECK'},at:playing().serverTime};
  assert.deepEqual(lostCitiesTransitionCues(g,next,'a'),['DISCARD','DRAW']);
  assert.deepEqual(lostCitiesTransitionCues(g,next,'b'),['DISCARD','DRAW','TURN']);
  assert.deepEqual(lostCitiesTransitionCues(next,structuredClone(next),'a'),[]);
  assert.deepEqual(lostCitiesTransitionCues(null,next,'a'),[]);
  const result=parse(LostCitiesPlayingPlatformSnapshotV2Schema,ended()).game;result.gameRevision=parse(GameRevisionSchema,2);
  assert.deepEqual(lostCitiesTransitionCues(next,result,'a'),['ROUND']);
  assert.deepEqual(lostCitiesTransitionCues(null,result,'a'),[]);
});
test('Lost Cities unavailable or blocked audio never prevents gameplay',()=>{
  const absent=new LostCitiesAudio(()=>null);assert.doesNotThrow(()=>{absent.unlock();absent.play(['TURN']);absent.dispose();});
  const blocked=new LostCitiesAudio(()=>{throw new Error('Device blocked');});assert.doesNotThrow(()=>{blocked.unlock();blocked.play(['SELECT']);blocked.dispose();});
});
