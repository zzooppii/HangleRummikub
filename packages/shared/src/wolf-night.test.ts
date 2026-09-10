import assert from "node:assert/strict";
import test from "node:test";
import { safeParse, parse } from "valibot";
import { WolfSettingsSchema, WolfClientCommandSchema, WolfPlayingPlatformSnapshotV2Schema, WolfLobbyPlatformSnapshotV2Schema, defaultWolfDeck, WolfDeckSchema } from "./index.js";
const players=Array.from({length:3},(_,i)=>({playerId:`wolf-${i}`,nickname:`마을${i}`,isHost:i===0,connectionStatus:"CONNECTED"}));
test("WOLF beginner decks use the requested three-player lineup and add villagers for four and five",()=>{
 const base=["WEREWOLF","WEREWOLF","ROBBER","TROUBLEMAKER","DRUNK","VILLAGER"];
 for(let n=3;n<=5;n++)assert.deepEqual(defaultWolfDeck(n),[...base,...Array.from({length:n-3},()=>"VILLAGER")]);
});
function playing(){return {snapshotVersion:2,serverTime:1000,versions:{roomRevision:1,presenceVersion:1},self:{playerId:"wolf-0"},room:{gameType:"WOLF_NIGHT",roomId:"wolf-room",roomCode:"BCDFGH",phase:"PLAYING",players},game:{gameType:"WOLF_NIGHT",gameId:"wolf-game",gameRevision:0,rulesVersion:"wolf-night-v1",settings:{roles:null,discussionSeconds:180},deck:["SEER","ROBBER","TROUBLEMAKER","WEREWOLF","WEREWOLF","VILLAGER"].sort(),playerStates:players.map(p=>({playerId:p.playerId})),messages:[],phase:"PLAYING",stage:"REVEAL",phaseId:"wolf-phase",deadlineAt:16000,privateView:{playerId:"wolf-0",originalRole:"SEER",copiedRole:null,actionRole:null,actionRevision:0,canPass:false,loneWolf:false,observations:[],votedFor:null}}};}
test("WOLF deck contract validates all basic roles, physical limits, paired Masons and Insomniac setup",()=>{
 for(let n=3;n<=10;n++)assert.equal(safeParse(WolfDeckSchema,defaultWolfDeck(n)).success,true);
 assert.equal(safeParse(WolfDeckSchema,["DOPPELGANGER","MASON","MASON","INSOMNIAC","ROBBER","HUNTER","TANNER","DRUNK","MINION","WEREWOLF","SEER","TROUBLEMAKER","VILLAGER"]).success,true);
 for(const roles of [["MASON","SEER","ROBBER","WEREWOLF","WEREWOLF","VILLAGER"],["SEER","SEER","ROBBER","WEREWOLF","WEREWOLF","VILLAGER"],["INSOMNIAC","SEER","MINION","WEREWOLF","WEREWOLF","VILLAGER"]])assert.equal(safeParse(WolfDeckSchema,roles).success,false);
 assert.equal(safeParse(WolfSettingsSchema,{roles:null,discussionSeconds:999999}).success,false);
});
test("WOLF commands reject duplicate/out-of-range targets and client authority fields",()=>{
 const command={protocolVersion:1,requestId:"wolf-request",kind:"wolf:act",gameId:"wolf-game",phaseId:"wolf-phase",expectedActionRevision:0,payload:{type:"CENTER",indices:[0,1]}};
 assert.equal(safeParse(WolfClientCommandSchema,command).success,true);
 for(const payload of [{type:"CENTER",indices:[0,0]},{type:"CENTER",indices:[3]},{type:"CENTER",indices:[0,1,2]},{type:"PLAYERS",playerIds:["a","a"]},{type:"PLAYERS",playerIds:[]}])assert.equal(safeParse(WolfClientCommandSchema,{...command,payload}).success,false);
 assert.equal(safeParse(WolfClientCommandSchema,{...command,actorPlayerId:"forged"}).success,false);
 assert.equal(safeParse(WolfClientCommandSchema,{...command,expectedActionRevision:-1}).success,false);
});
test("WOLF snapshot rejects hidden state, wrong viewers, missing roster and extra private vote maps",()=>{
 const s=playing();parse(WolfPlayingPlatformSnapshotV2Schema,s);
 for(const game of [{...s.game,center:["WEREWOLF","VILLAGER","SEER"]},{...s.game,votes:{"wolf-1":"wolf-0"}},{...s.game,privateView:{...s.game.privateView,playerId:"wolf-1"}},{...s.game,playerStates:s.game.playerStates.slice(1)}])assert.equal(safeParse(WolfPlayingPlatformSnapshotV2Schema,{...s,game}).success,false);
 assert.equal(safeParse(WolfLobbyPlatformSnapshotV2Schema,{...s,game:null,room:{...s.room,phase:"LOBBY",settings:{roles:null,discussionSeconds:180}}}).success,true);
});
