import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, safeParse } from "valibot";
import { JaipurPlayingProjectionSchema, JaipurLobbyPlatformSnapshotV2Schema, JaipurPlayingPlatformSnapshotV2Schema, JaipurFinishedPlatformSnapshotV2Schema, JaipurCardSchema, JaipurClientCommandSchema, GAME_PLAYER_LIMITS, type JaipurCardType } from "@hangul-rummikub/shared";
import { JaipurScreen } from "../features/jaipur/JaipurScreen.js";
import { emptyJaipurDraft, previewJaipur } from "../features/jaipur/ui.js";
import { decodeWebSnapshot, type JaipurWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
const card=(type:JaipurCardType,id:string)=>parse(JaipurCardSchema,{type,cardId:id});
const players=[{playerId:'a',nickname:'하비',isHost:true,connectionStatus:'CONNECTED'},{playerId:'b',nickname:'친구',isHost:false,connectionStatus:'CONNECTED'}];
function lobby(n=2){return parse(JaipurLobbyPlatformSnapshotV2Schema,{snapshotVersion:2,versions:{roomRevision:1,presenceVersion:1},serverTime:1000,self:{playerId:'a'},room:{roomId:'room-jaipur',roomCode:'BCDFGH',gameType:'JAIPUR',phase:'LOBBY',players:players.slice(0,n)},game:null});}
function base(){return {gameType:'JAIPUR',gameId:'jp-game',gameRevision:0,rulesVersion:'jaipur-base-v1',round:1,roundId:'round-1',
  market:[card('DIAMOND','m0'),card('CLOTH','m1'),card('SPICE','m2'),card('CAMEL','m3'),card('CAMEL','m4')],deckCount:33,discardTop:null,
  goodsBank:[{type:'DIAMOND',values:[7,7,5,5,5]},{type:'GOLD',values:[6,6,5,5,5]},{type:'SILVER',values:[5,5,5,5,5]},{type:'CLOTH',values:[5,3,3,2,2,1,1]},{type:'SPICE',values:[5,3,3,2,2,1,1]},{type:'LEATHER',values:[4,3,2,1,1,1,1,1,1]}],
  bonusBank:[{size:3,count:7},{size:4,count:6},{size:5,count:5}],playerStates:[{playerId:'a',handCount:6,seals:0},{playerId:'b',handCount:5,seals:0}],
  privateState:{playerId:'a',hand:[card('LEATHER','h0'),card('LEATHER','h1'),card('LEATHER','h2'),card('GOLD','h3'),card('GOLD','h4'),card('CLOTH','h5')],camelCount:3,goodsTokens:[],bonusTokens:[]},roundResults:[],feedback:null};}
function playing(){const l=lobby();return parse(JaipurPlayingPlatformSnapshotV2Schema,{...l,room:{...l.room,phase:'PLAYING'},game:{...base(),phase:'PLAYING',turnId:'turn-1',activePlayerId:'a'}});}
const render=(snapshot:JaipurWebSnapshot)=>renderToStaticMarkup(createElement(JaipurScreen,{snapshot,connected:true,pending:false,error:null,connectionLabel:'접속 중',onCommand:async()=>{},onRematch:()=>{},onStart:()=>{},onLeave:()=>{},onCopy:()=>{}}));
test('Jaipur UI: lobby, playing, round result and finished decode into concrete screens',()=>{
  const l=lobby(),p=playing(),g=base();
  const r=parse(JaipurPlayingPlatformSnapshotV2Schema,{...p,game:{...g,phase:'ROUND_RESULT',confirmedPlayerIds:[],roundResults:[{round:1,reason:'DECK_DEPLETED',winnerPlayerId:'a',scores:players.map((p,i)=>({playerId:p.playerId,goodsPoints:20-i,bonusPoints:0,camelPoints:0,total:20-i,goodsTokenCount:6,bonusTokenCount:0,camelCount:2}))}]}});
  const f=parse(JaipurFinishedPlatformSnapshotV2Schema,{...l,room:{...l.room,phase:'FINISHED'},game:{...g,phase:'FINISHED',result:{reason:'CANCELLED',winnerPlayerIds:[]}}});
  for(const s of [l,p,r,f]){const d=decodeWebSnapshot(s);assert.equal(d.kind,'COMPATIBLE');if(d.kind!=='COMPATIBLE')throw new Error();assert.equal(resolveRoomSnapshotView(d.value).kind,'JAIPUR');assert.match(render(s),/JAIPUR/);}
  assert.match(render(l),/자이푸르 시작/);assert.match(render(p),/공용 시장/);assert.match(render(p),/상대|친구/);assert.match(render(p),/낙타 비공개/);assert.match(render(r),/확인 · 다음 라운드/);assert.match(render(f),/매치가 취소되었습니다/);
});
test('Jaipur UI: 1/2/3 player control and readiness-free host start',()=>{
  assert.deepEqual(GAME_PLAYER_LIMITS.JAIPUR,{min:2,max:2});assert.equal(getGameStartControl(lobby(1),false).canStart,false);assert.equal(getGameStartControl(lobby(),false).canStart,true);
  const l=lobby(),three={...l,room:{...l.room,players:[...l.room.players,{...l.room.players[1]!,playerId:'c'}]}};
  assert.equal(getGameStartControl(three,false).canStart,false);assert.match(getGameStartControl(three,false).guidance,/정확히 2명/);
  assert.equal(getGameStartControl({...l,room:{...l.room,players:l.room.players.map(p=>({...p,isReady:false}))}},false).canStart,true);
});
test('Jaipur UI: exchange count, same-type restriction, camel choice and seven-card limit',()=>{
  const g=parse(JaipurPlayingProjectionSchema,playing().game),draft={...emptyJaipurDraft('EXCHANGE'),marketIds:g.market.slice(0,2).map(c=>c.cardId),handIds:[g.privateState.hand[0]!.cardId],camelCount:1};
  const valid=previewJaipur(g,draft);assert.equal(valid.action?.kind,'EXCHANGE');assert.equal(valid.handAfter,7);
  assert.match(previewJaipur(g,{...draft,camelCount:0}).reason,/수량/);
  assert.match(previewJaipur(g,{...draft,handIds:[g.privateState.hand[5]!.cardId]}).reason,/같은 상품/);
  assert.match(previewJaipur(g,{...draft,handIds:[],camelCount:2}).reason,/최대 7장/);
  assert.equal(previewJaipur(g,emptyJaipurDraft('TAKE_CAMELS')).action?.kind,'TAKE_CAMELS');
  assert.equal(previewJaipur(g,emptyJaipurDraft()).handAfter,g.privateState.hand.length);
});
test('Jaipur UI: sale preview uses public token values and conceals random bonus value',()=>{
  const g=parse(JaipurPlayingProjectionSchema,playing().game),draft={...emptyJaipurDraft('SELL'),handIds:g.privateState.hand.slice(0,3).map(c=>c.cardId)};
  const p=previewJaipur(g,draft);assert.equal(p.goodsPoints,9);assert.equal(p.bonusSize,3);assert.equal(p.handAfter,3);
  assert.equal(previewJaipur({...g,bonusBank:g.bonusBank.map(b=>({...b,count:0}))},draft).bonusSize,null);
  assert.match(previewJaipur(g,{...draft,handIds:[g.privateState.hand[3]!.cardId]}).reason,/2장 이상/);
});
test('Jaipur DTO: exact action scope, untrusted fields and viewer identity',()=>{
  const good={kind:'jaipur:act',protocolVersion:1,requestId:'request-1',gameId:'game-1',expectedGameRevision:0,turnId:'turn-1',payload:{kind:'TAKE_CAMELS'}};
  assert.equal(safeParse(JaipurClientCommandSchema,good).success,true);
  for(const bad of [{...good,turnId:undefined},{...good,expectedGameRevision:-1},{...good,payload:{kind:'TAKE_CAMELS',playerId:'b'}},{...good,payload:{kind:'EXCHANGE',marketCardIds:[],handCardIds:[],camelCount:-1}}])assert.equal(safeParse(JaipurClientCommandSchema,bad).success,false);
  const p=playing();
  assert.equal(safeParse(JaipurPlayingPlatformSnapshotV2Schema,{...p,game:{...p.game,activePlayerId:'outsider'}}).success,false);
  assert.equal(safeParse(JaipurPlayingPlatformSnapshotV2Schema,{...p,game:{...p.game,market:p.game.market.map(()=>p.game.market[0])}}).success,false);
  assert.equal(safeParse(JaipurPlayingPlatformSnapshotV2Schema,{...p,game:{...p.game,privateState:{...p.game.privateState,playerId:'b'}}}).success,false);
  assert.equal(safeParse(JaipurPlayingPlatformSnapshotV2Schema,{...p,game:{...p.game,privateState:{...p.game.privateState,hand:[]}}}).success,false);
});
