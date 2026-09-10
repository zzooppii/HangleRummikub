import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse } from "valibot";
import { WolfLobbyPlatformSnapshotV2Schema, WolfPlayingPlatformSnapshotV2Schema, WolfFinishedPlatformSnapshotV2Schema, WOLF_ROLES } from "@hangul-rummikub/shared";
import { WolfNightScreen, wolfSelectionValid } from "../features/wolf-night/WolfNightScreen.js";
import { ROLE_COPY } from "../features/wolf-night/roles.js";
import { decodeWebSnapshot, type WolfWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
import { projectRoomSnapshotShell } from "./room-snapshot-shell.js";
import { decideSnapshotUpdate } from "./snapshot-state.js";
const players=Array.from({length:10},(_,i)=>({playerId:`wolf-${i}`,nickname:`마을${i}`,isHost:i===0,connectionStatus:"CONNECTED"}));
function lobby(n=3){return parse(WolfLobbyPlatformSnapshotV2Schema,{snapshotVersion:2,serverTime:1000,versions:{roomRevision:0,presenceVersion:0},self:{playerId:"wolf-0"},room:{gameType:"WOLF_NIGHT",roomId:"wolf-room",roomCode:"BCDFGH",phase:"LOBBY",players:players.slice(0,n),settings:{roles:null,discussionSeconds:180}},game:null});}
function playing(stage="SEER",role:string|null="SEER"){
 const l=lobby(),{settings,...room}=l.room;
 return parse(WolfPlayingPlatformSnapshotV2Schema,{...l,versions:{roomRevision:1,presenceVersion:0},room:{...room,phase:"PLAYING"},game:{gameType:"WOLF_NIGHT",gameId:"wolf-game",gameRevision:1,rulesVersion:"wolf-night-v1",settings,deck:["SEER","ROBBER","TROUBLEMAKER","WEREWOLF","WEREWOLF","VILLAGER"].sort(),playerStates:room.players.map(p=>({playerId:p.playerId})),messages:[],phase:"PLAYING",stage,phaseId:"wolf-phase",deadlineAt:11000,privateView:{playerId:"wolf-0",originalRole:"SEER",copiedRole:null,actionRole:role,actionRevision:1,canPass:role!==null,loneWolf:false,observations:[],votedFor:null}}});
}
function html(snapshot:WolfWebSnapshot,connected=true){return renderToStaticMarkup(createElement(WolfNightScreen,{snapshot,connected,pending:false,error:null,connectionLabel:"연결됨",onCommand:async()=>undefined,onStart(){},onLeave(){},onCopy(){}}));}
function shell(s:WolfWebSnapshot){const decoded=decodeWebSnapshot(s);assert.equal(decoded.kind,"COMPATIBLE");if(decoded.kind!=="COMPATIBLE")throw new Error();return projectRoomSnapshotShell(decoded.value);}
test("WOLF Home routing and 3–10 admission, host-only settings and start",()=>{
 for(const n of [3,4,6,10])assert.equal(getGameStartControl(lobby(n),false).canStart,true);assert.equal(getGameStartControl(lobby(2),false).canStart,false);
 const decoded=decodeWebSnapshot(lobby());assert.equal(decoded.kind,"COMPATIBLE");if(decoded.kind==="COMPATIBLE")assert.equal(resolveRoomSnapshotView(decoded.value).kind,"WOLF_NIGHT");
 assert.match(html(lobby()),/밤을 시작하기/);assert.match(html({...lobby(),self:{playerId:lobby().room.players[1]!.playerId}}),/fieldset[^>]*disabled/);
});
test("WOLF ability target counts distinguish Seer alternatives, swaps and center-only roles",()=>{
 assert.equal(wolfSelectionValid("SEER",1,0),true);assert.equal(wolfSelectionValid("SEER",0,2),true);assert.equal(wolfSelectionValid("SEER",1,2),false);
 assert.equal(wolfSelectionValid("TROUBLEMAKER",2,0),true);assert.equal(wolfSelectionValid("TROUBLEMAKER",1,0),false);
 for(const r of ["DRUNK","WEREWOLF"] as const){assert.equal(wolfSelectionValid(r,0,1),true);assert.equal(wolfSelectionValid(r,1,0),false);}
 assert.equal(wolfSelectionValid(null,1,0),false);
});
test("WOLF private card initially concealed, explicit reveal affordance and original-role caveat",()=>{
 const output=html(playing());assert.match(output,/눌러서 역할 확인/);assert.doesNotMatch(output,/wolf-secret-card revealed/);assert.match(output,/처음 받은 역할입니다/);assert.doesNotMatch(output,/copiedRoles|initialCards|center:/);
 for(const role of WOLF_ROLES)assert.ok(ROLE_COPY[role].description.length>10);
});
test("WOLF night chat disabled, dormant players cannot select actions, disconnected input blocked",()=>{
 assert.match(html(playing()),/input[^>]*disabled/);assert.doesNotMatch(html(playing("DISCUSSION",null)),/능력 사용하지 않기/);
 assert.match(html(playing("VOTE",null)),/확정하면 바꿀 수 없습니다/);assert.match(html(playing(),false),/button[^>]*aria-label="중앙 카드 1"[^>]*disabled/);
});
test("WOLF result uses final role and winner IDs and rematch cannot be replaced by delayed old-game snapshots",()=>{
 const p=playing(),finished=parse(WolfFinishedPlatformSnapshotV2Schema,{...p,versions:{roomRevision:2,presenceVersion:0},room:{...p.room,phase:"FINISHED"},game:{gameType:p.game.gameType,gameId:p.game.gameId,gameRevision:8,rulesVersion:p.game.rulesVersion,settings:p.game.settings,deck:p.game.deck,playerStates:p.game.playerStates,messages:[],phase:"FINISHED",result:{reason:"VOTED",eliminatedPlayerIds:[],winnerPlayerIds:p.room.players.map(x=>x.playerId),villageWins:true,wolvesWin:false,tannerWins:false,players:p.room.players.map(x=>({playerId:x.playerId,originalRole:"SEER",finalRole:"ROBBER",effectiveRole:"ROBBER",votedFor:null,votesReceived:0})),center:["SEER","WEREWOLF","WEREWOLF"]}}});
 assert.match(html(finished),/마을팀 승리/);assert.match(html(finished),/대기실로 돌아가기/);
 const next={...lobby(),versions:{roomRevision:parse(WolfLobbyPlatformSnapshotV2Schema,{...lobby(),versions:{roomRevision:3,presenceVersion:0}}).versions.roomRevision,presenceVersion:lobby().versions.presenceVersion}};
 assert.equal(decideSnapshotUpdate(shell(next),shell(finished)),"IGNORE_STALE");
});
