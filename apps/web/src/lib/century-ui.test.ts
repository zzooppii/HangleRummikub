import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, safeParse } from 'valibot';
import { CenturyLobbyPlatformSnapshotV2Schema, CenturyPlayingPlatformSnapshotV2Schema, CenturyClientCommandSchema, GameRevisionSchema } from '@hangul-rummikub/shared';
import { CenturyScreen } from '../features/century/CenturyScreen.js';
import { emptyCenturyDraft, previewCentury } from '../features/century/ui.js';
import { centuryTransitionCues, CenturyAudio } from '../features/century/sound.js';
import { decodeWebSnapshot } from './snapshot-wire-decoder.js';
const players=[{playerId:'a',nickname:'하비',isHost:true,connectionStatus:'CONNECTED'},{playerId:'b',nickname:'민아',isHost:false,connectionStatus:'CONNECTED'}];
function lobby(){return parse(CenturyLobbyPlatformSnapshotV2Schema,{snapshotVersion:2,versions:{roomRevision:1,presenceVersion:1},serverTime:1000,self:{playerId:'a'},room:{roomId:'century-room',roomCode:'ABCDEF',gameType:'CENTURY',phase:'LOBBY',players},game:null});}
function playing(){const s=lobby();return parse(CenturyPlayingPlatformSnapshotV2Schema,{...s,room:{...s.room,phase:'PLAYING'},game:{gameType:'CENTURY',rulesVersion:'century-spice-road-v1',gameId:'century-game',gameRevision:0,phase:'PLAYING',turnId:'turn',activePlayerId:'a',startingPlayerId:'a',round:1,finalRound:false,targetCount:6,gold:4,silver:4,merchantDeckCount:37,pointDeckCount:31,market:Array.from({length:6},(_,i)=>({card:{cardId:`market-${i}`,kind:'PRODUCE',gain:[2,0,0,0]},spices:i===2?[0,2,0,0]:[0,0,0,0]})),pointMarket:Array.from({length:5},(_,i)=>({cardId:`point-${i}`,points:6,cost:[2,2,0,0]})),playerStates:players.map(p=>({playerId:p.playerId,spices:p.playerId==='a'?[6,1,0,1]:[4,0,0,0],handCount:p.playerId==='a'?3:2,played:[],pointCount:0,gold:0,silver:0})),privateState:{playerId:'a',hand:[{cardId:'produce',kind:'PRODUCE',gain:[4,0,0,0]},{cardId:'upgrade',kind:'UPGRADE',steps:2},{cardId:'trade',kind:'TRADE',cost:[2,0,0,0],gain:[0,0,1,0]}],points:[]},feedback:null}});}
test('CENTURY UI: lobby, market, personal hand, original illustrations, accessible audio controls and decoder',()=>{
 for(const s of [lobby(),playing()]){assert.equal(decodeWebSnapshot(s).kind,'COMPATIBLE');const html=renderToStaticMarkup(createElement(CenturyScreen,{snapshot:s,connected:true,pending:false,error:null,connectionLabel:'연결됨',onCommand:async()=>{},onStart(){},onRematch(){},onCopy(){},onLeave(){}}));assert.match(html,/향신료의 길/);assert.match(html,/효과음 음량/);assert.match(html,/소리 듣기/);if(s.game){assert.match(html,/상인 시장/);assert.match(html,/실행 전/);assert.match(html,/반환/);assert.equal((html.match(/class="ct-market-slot"/g)??[]).length,6);}else assert.match(html,/교역 시작/);}
});
test('CENTURY preview: repeat trade, chained upgrade, per-card payment and explicit overflow',()=>{
 const g=playing().game,before=structuredClone(g);let d=emptyCenturyDraft();d.cardId=g.privateState.hand[2]!.cardId;d.times=3;let p=previewCentury(g,d);assert.equal(p.action?.kind,'TRADE');assert.deepEqual(p.after,[0,1,3,1]);
 d=emptyCenturyDraft();d.cardId=g.privateState.hand[1]!.cardId;d.upgrades=[0,1];p=previewCentury(g,d);assert.deepEqual(p.after,[5,1,1,1]);assert.ok(p.action);
 d=emptyCenturyDraft();d.cardId=g.privateState.hand[0]!.cardId;p=previewCentury(g,d);assert.equal(p.excess,2);assert.equal(p.action,null);d.returned=[2,0,0,0];p=previewCentury(g,d);assert.ok(p.action);assert.deepEqual(p.after,[8,1,0,1]);
 d=emptyCenturyDraft();d.mode='ACQUIRE';d.cardId=g.market[2]!.card.cardId;d.payment=[0,1];p=previewCentury(g,d);assert.ok(p.action?.kind==='ACQUIRE');assert.deepEqual(p.action.payment,[{cardId:g.market[0]!.card.cardId,color:0},{cardId:g.market[1]!.card.cardId,color:1}]);assert.deepEqual(p.after,[5,2,0,1]);assert.deepEqual(g,before);
});
test('CENTURY DTO: cross-viewer/private injection, inconsistent counts/coins and impossible commands rejected',()=>{
 const s=playing(),g=s.game;for(const game of [{...g,privateState:{...g.privateState,playerId:'b'}},{...g,merchantDeck:['secret']},{...g,gold:3},{...g,finalRound:true},{...g,playerStates:g.playerStates.map(p=>({...p,handCount:999}))}])assert.equal(safeParse(CenturyPlayingPlatformSnapshotV2Schema,{...s,game}).success,false);
 const c={kind:'century:act',protocolVersion:1,requestId:'r',gameId:'g',expectedGameRevision:0,turnId:'t',payload:{kind:'REST',returned:[0,0,0,0]}};assert.equal(safeParse(CenturyClientCommandSchema,c).success,true);
 for(const payload of [{kind:'REST',returned:[-1,0,0,0]},{kind:'UPGRADE',cardId:'c',upgrades:[3],returned:[0,0,0,0]},{kind:'TRADE',cardId:'c',times:11,returned:[0,0,0,0]},{...c.payload,playerId:'other'}])assert.equal(safeParse(CenturyClientCommandSchema,{...c,payload}).success,false);
});
test('CENTURY sounds: first snapshot/reconnect baseline, repeated and stale revisions do not replay',()=>{
 const g=playing().game,next={...g,gameRevision:parse(GameRevisionSchema,1),feedback:{playerId:g.activePlayerId,kind:'TRADE' as const,spent:[2,0,0,0] as [number,number,number,number],gained:[0,0,1,0] as [number,number,number,number],returned:[0,0,0,0] as [number,number,number,number],at:g.gameRevision}};
 const parsed=parse(CenturyPlayingPlatformSnapshotV2Schema,{...playing(),game:next}).game;
 assert.deepEqual(centuryTransitionCues(null,parsed,'a'),[]);assert.deepEqual(centuryTransitionCues(g,parsed,'a'),['TRADE']);assert.deepEqual(centuryTransitionCues(parsed,parsed,'a'),[]);assert.deepEqual(centuryTransitionCues(parsed,g,'a'),[]);
 const audio=new CenturyAudio(()=>null);audio.unlock();audio.play(['CLAIM','REST']);audio.setVolume(0);audio.dispose();
});
