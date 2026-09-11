import assert from 'node:assert/strict';
import test from 'node:test';
import {createElement} from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {parse} from 'valibot';
import {LoveLetterPlayingProjectionSchema,LoveLetterCardSchema,LoveLetterActionSchema,PlayerIdSchema,loveLetterProjectionIsConsistent,type LoveLetterProjection} from '@hangul-rummikub/shared';
import {CourtCard,LoveLetterScreen} from '../features/love-letter/LoveLetterScreen.js';
import {forcedCountess,makePlay,targetsFor,eventText} from '../features/love-letter/ui.js';
import {courtTransitionCues,CourtAudio} from '../features/love-letter/sound.js';
import {decodeWebSnapshot,type LoveLetterWebSnapshot} from './snapshot-wire-decoder.js';
const pid=(id:string)=>parse(PlayerIdSchema,id),card=(rank:number,id:string)=>parse(LoveLetterCardSchema,{cardId:id,rank});
function game(){return parse(LoveLetterPlayingProjectionSchema,{gameType:'LOVE_LETTER',gameId:'game-1',gameRevision:0,rulesVersion:'love-letter-21-v1',round:1,roundId:'round-1',turnNumber:1,targetTokens:5,deckCount:16,setAsideCount:1,faceUp:[],playerStates:[{playerId:'a',handCount:2,tokens:0,eliminated:false,protected:false,discards:[]},{playerId:'b',handCount:1,tokens:0,eliminated:false,protected:false,discards:[]},{playerId:'c',handCount:1,tokens:0,eliminated:false,protected:true,discards:[]}],privateState:{playerId:'a',hand:[card(1,'guard'),card(2,'priest')],notes:[]},history:[],roundResults:[],phase:'PLAYING',stage:'PLAY_CARD',turnId:'turn-1',activePlayerId:'a'});}
function snapshot(g:LoveLetterProjection|null=game()):LoveLetterWebSnapshot{
 const raw={snapshotVersion:2,versions:{roomRevision:1,presenceVersion:0},serverTime:1000,self:{playerId:'a'},room:{roomId:'room-1',roomCode:'ABCDEF',gameType:'LOVE_LETTER',phase:g?.phase==='FINISHED'?'FINISHED':g?'PLAYING':'LOBBY',players:['a','b','c'].map((id,i)=>({playerId:id,nickname:`참가${i+1}`,isHost:i===0,connectionStatus:'CONNECTED'}))},game:g};
 const decoded=decodeWebSnapshot(raw);assert.equal(decoded.kind,'COMPATIBLE');if(decoded.kind!=='COMPATIBLE'||decoded.value.kind!=='PLATFORM_V2_LOVE_LETTER')throw new Error(JSON.stringify(decoded));return decoded.value.platformSnapshot;
}
test('Love Letter web: target filtering, Guard guess, Countess forced selection',()=>{
 const g=game();assert.deepEqual(targetsFor(g,1),[pid('b')]);assert.deepEqual(targetsFor(g,5),[pid('a'),pid('b')]);assert.equal(makePlay(g,'guard',pid('b'),1),null);assert.equal(makePlay(g,'guard',null,9),null);
 assert.ok(makePlay(g,'guard',pid('b'),9));assert.ok(makePlay(g,'priest',pid('b'),null));assert.equal(makePlay(g,'priest',pid('c'),null),null);
 const hand=[card(8,'countess'),card(5,'prince')];assert.ok(forcedCountess(hand));assert.equal(makePlay({...g,privateState:{...g.privateState,hand}},'prince',pid('a'),null),null);
 assert.throws(()=>parse(LoveLetterActionSchema,{kind:'CHANCELLOR',keepCardId:'one',returnCardIds:[],deck:[]}));
});
test('Love Letter web: malformed private state/conservation and foreign player rejected',()=>{
 assert.ok(loveLetterProjectionIsConsistent(game()));assert.equal(loveLetterProjectionIsConsistent({...game(),deckCount:15}),false);
 assert.equal(loveLetterProjectionIsConsistent({...game(),privateState:{...game().privateState,playerId:pid('outsider')}}),false);
});
test('Love Letter web: no old/duplicate audio, new protection/turn/result cues',()=>{
 const g=game();assert.deepEqual(courtTransitionCues(null,g,'a'),[]);assert.deepEqual(courtTransitionCues(g,g,'a'),[]);
 const shield={...g,gameRevision:parse(LoveLetterPlayingProjectionSchema,{...g,gameRevision:1}).gameRevision,history:[{sequence:1,actorPlayerId:pid('b'),rank:4 as const,targetPlayerId:null,guess:null,outcome:'PROTECTED' as const,eliminatedPlayerIds:[]}]};assert.deepEqual(courtTransitionCues(g,shield,'a'),['SHIELD']);
 const audio=new CourtAudio();assert.doesNotThrow(()=>{audio.setLevel(false,.5);audio.play(['WIN']);audio.dispose();});
});
test('Love Letter web: lobby, hand and result use illustrated cards with accessible actions',()=>{
 const rendered=renderToStaticMarkup(createElement(CourtCard,{rank:9}));assert.match(rendered,/ll-portrait/);assert.match(rendered,/공주/);assert.match(rendered,/즉시 탈락/);
 const props={connected:true,pending:false,error:null,connectionLabel:'연결됨',onCommand:async()=>{},onRematch:()=>{},onStart:()=>{},onLeave:()=>{},onCopy:()=>{}};
 const lobby=renderToStaticMarkup(createElement(LoveLetterScreen,{...props,snapshot:snapshot(null)}));assert.match(lobby,/게임 시작/);assert.match(lobby,/효과음 음량/);
 const playing=renderToStaticMarkup(createElement(LoveLetterScreen,{...props,snapshot:snapshot()}));assert.match(playing,/당신의 차례/);assert.match(playing,/나에게만 보이는 손패/);assert.match(playing,/비공개 손패/);assert.match(playing,/대상 선택/);assert.match(playing,/공개 기록/);
 assert.equal(eventText(game(),x=>x),'편지가 배분되었습니다. 궁정의 마음을 읽어보세요.');
});
