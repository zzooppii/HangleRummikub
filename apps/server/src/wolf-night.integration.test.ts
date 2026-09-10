import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import { WolfLobbyPlatformSnapshotV2Schema, WolfPlayingPlatformSnapshotV2Schema, WolfFinishedPlatformSnapshotV2Schema, SessionBootstrapAckSchema,
  StateSyncWireAckSchema, RoomLeaveAckSchema, ServerTimeSchema, TurnIdSchema, type WolfRole } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
type Client = Socket<Record<string,(value:unknown)=>void>,Record<string,(value:unknown,ack:(value:unknown)=>void)=>void>>;
async function harness(t:TestContext,count=3,roles:WolfRole[]|null=null,start=true){
 const server=createHttpServer({serveWeb:false}),clients:Client[]=[];
 t.after(async()=>{clients.forEach(c=>c.disconnect());await server.shutdown();});
 await new Promise<void>(r=>server.httpServer.listen(0,"127.0.0.1",r));const address=server.httpServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;
 let seq=0,now=server.runtime.clock.now();t.mock.method(server.runtime.clock,"now",()=>now);t.mock.method(server.runtime.wolfService!.deps.random,"nextInt",(n:number)=>n-1);
 async function connect(types=["WOLF_NIGHT"]){const c:Client=io(`http://127.0.0.1:${port}`,{transports:["websocket"],forceNew:true,reconnection:false,auth:{supportedSnapshotVersions:[2],supportedGameTypes:types}});clients.push(c);await new Promise<void>((r,j)=>{c.once("connect",r);c.once("connect_error",j);});return c;}
 const request=(kind:string,payload:unknown={},extra:Record<string,unknown>={}):{kind:string;protocolVersion:number;requestId:string;payload:unknown;[key:string]:unknown}=>({kind,protocolVersion:1,requestId:`wolf-${++seq}`,payload,...extra});
 const send=(c:Client,command:ReturnType<typeof request>)=>new Promise<unknown>((r,j)=>{const timer=setTimeout(()=>j(new Error(`Missing ${command.kind} ACK`)),4000);c.emit(command.kind,command,result=>{clearTimeout(timer);r(result);});});
 const call=(c:Client,kind:string,payload:unknown={},extra:Record<string,unknown>={})=>send(c,request(kind,payload,extra));
 const success=(value:unknown)=>{const ack=parse(StateSyncWireAckSchema,value);assert.ok(ack.ok,ack.ok?"":ack.error.code);return ack.data.snapshot;};
 const failure=(value:unknown)=>{const ack=parse(StateSyncWireAckSchema,value);assert.equal(ack.ok,false);if(ack.ok)throw new Error();return ack.error.code;};
 async function bootstrap(c:Client){const ack=parse(SessionBootstrapAckSchema,await call(c,"session:bootstrap"));assert.ok(ack.ok);return ack.data.credential;}
 const host=await connect(),credential=await bootstrap(host);
 let lobby=parse(WolfLobbyPlatformSnapshotV2Schema,success(await call(host,"room:create",{bootstrapCredential:credential,nickname:"달빛1",gameType:"WOLF_NIGHT"})));
 const members=[{client:host,playerId:lobby.self.playerId,credential}];
 for(let i=1;i<count;i++){const c=await connect(),credential=await bootstrap(c);lobby=parse(WolfLobbyPlatformSnapshotV2Schema,success(await call(c,"room:join",{bootstrapCredential:credential,nickname:`달빛${i+1}`,roomCode:lobby.room.roomCode})));members.push({client:c,playerId:lobby.self.playerId,credential});}
 lobby=parse(WolfLobbyPlatformSnapshotV2Schema,success(await call(host,"wolf:configure",{roles,discussionSeconds:120},{expectedRoomRevision:lobby.versions.roomRevision})));
 if(start)success(await call(host,"game:start",{},{expectedRoomRevision:lobby.versions.roomRevision}));
 async function stored(){const room=await server.runtime.persistence.findById(lobby.room.roomId);assert.ok(room?.gameType==="WOLF_NIGHT"&&room.game);return room;}
 const sync=async(c=host)=>success(await call(c,"state:sync"));
 function time(at:number){now=parse(ServerTimeSchema,at);}
 async function advance(){const room=await stored(),s=room.game!.state;time(s.nextTransitionAt!);const deadline={roomId:room.roomId,gameId:room.game!.gameId,expectedGameRevision:room.game!.gameRevision,turnId:parse(TurnIdSchema,s.transitionId),deadlineAt:now};
 assert.equal((await server.runtime.wolfService!.timeout(deadline)).status,"APPLIED");assert.equal((await server.runtime.wolfService!.timeout(deadline)).status,"NO_OP");return deadline;}
 async function stage(target:string){for(let i=0;i<15&&(await stored()).game!.state.stage!==target;i++)await advance();assert.equal((await stored()).game!.state.stage,target);}
 async function act(index:number,payload:unknown){const r=await stored(),p=r.game!.state.players[index]!;return call(members[index]!.client,"wolf:act",payload,{gameId:r.game!.gameId,phaseId:r.game!.state.transitionId,expectedActionRevision:p.actionRevision});}
 return{server,connect,bootstrap,request,send,call,success,failure,lobby,members,stored,sync,time,advance,stage,act};
}
for(const count of [3,6,10])test(`WOLF raw ${count} players: timed night, vote race, immutable result and rematch`,async t=>{
 const h=await harness(t,count),first=parse(WolfPlayingPlatformSnapshotV2Schema,await h.sync());assert.equal(first.game.stage,"REVEAL");assert.equal(h.server.runtime.turnScheduler.scheduledCount,1);
 await h.stage("VOTE");const before=await h.stored(),game=before.game!;
 const votes=await Promise.all(h.members.map((m,i)=>h.call(m.client,"wolf:vote",{playerId:h.members[(i+1)%count]!.playerId},{gameId:game.gameId,phaseId:game.state.transitionId})));
 votes.forEach(h.success);const finished=parse(WolfFinishedPlatformSnapshotV2Schema,await h.sync());assert.equal(finished.game.result.eliminatedPlayerIds.length,0);assert.equal(h.server.runtime.turnScheduler.scheduledCount,0);
 assert.equal(h.failure(await h.call(h.members[1]!.client,"wolf:rematch",{},{gameId:game.gameId,expectedGameRevision:finished.game.gameRevision,expectedRoomRevision:finished.versions.roomRevision})),"HOST_ONLY");
 const rematch=h.request("wolf:rematch",{},{gameId:game.gameId,expectedGameRevision:finished.game.gameRevision,expectedRoomRevision:finished.versions.roomRevision});
 const lobby=parse(WolfLobbyPlatformSnapshotV2Schema,h.success(await h.send(h.members[0]!.client,rematch)));h.success(await h.send(h.members[0]!.client,rematch));assert.equal(lobby.room.roomCode,first.room.roomCode);assert.deepEqual(lobby.room.players.map(p=>p.playerId),first.room.players.map(p=>p.playerId));
 const fresh=parse(WolfPlayingPlatformSnapshotV2Schema,h.success(await h.call(h.members[0]!.client,"game:start",{},{expectedRoomRevision:lobby.versions.roomRevision})));assert.notEqual(fresh.game.gameId,game.gameId);assert.equal(fresh.game.gameRevision,0);
 assert.equal(h.failure(await h.call(h.members[1]!.client,"wolf:vote",{playerId:h.members[0]!.playerId},{gameId:game.gameId,phaseId:game.state.transitionId})),"STALE_GAME_REVISION");
});
test("WOLF raw private projection, viewer-only observations, replay/conflict, scoped action and stale deadline",async t=>{
 const h=await harness(t,3,["SEER","ROBBER","TROUBLEMAKER","WEREWOLF","WEREWOLF","VILLAGER"]);await h.stage("SEER");
 let room=await h.stored();const game=room.game!,p=game.state.players[0]!;
 const c=h.request("wolf:act",{type:"CENTER",indices:[0,1]},{gameId:game.gameId,phaseId:game.state.transitionId,expectedActionRevision:p.actionRevision});
 const first=parse(WolfPlayingPlatformSnapshotV2Schema,h.success(await h.send(h.members[0]!.client,c)));h.success(await h.send(h.members[0]!.client,c));assert.equal((await h.stored()).game!.gameRevision,first.game.gameRevision);
 assert.equal(h.failure(await h.send(h.members[0]!.client,{...c,payload:{type:"PASS"}})),"REQUEST_ID_REUSED");
 const other=parse(WolfPlayingPlatformSnapshotV2Schema,await h.sync(h.members[1]!.client));assert.equal(other.game.privateView.originalRole,"ROBBER");assert.deepEqual(other.game.privateView.observations,[]);assert.equal(first.game.privateView.observations[0]!.cards.length,2);
 const forbidden=new Set(["center","card","copiedRoles","votes","initialCards"]);const audit=(value:unknown):void=>{if(value&&typeof value==="object")for(const[k,x]of Object.entries(value)){assert.equal(forbidden.has(k),false,k);audit(x);}};audit(other);
 assert.equal(h.failure(await h.act(1,{type:"CENTER",indices:[0,1]})),"INVALID_PAYLOAD");
 await h.stage("ROBBER");room=await h.stored();const prior=room.game!.gameRevision;h.time(room.game!.state.nextTransitionAt!);
 assert.equal(h.failure(await h.act(1,{type:"PLAYERS",playerIds:[p.playerId]})),"STALE_GAME_REVISION");assert.equal((await h.stored()).game!.gameRevision,prior);
});
test("WOLF raw Doppelganger two-step action, copied role transfer and resume preserve private memory",async t=>{
 const h=await harness(t,3,["DOPPELGANGER","ROBBER","WEREWOLF","SEER","VILLAGER","TROUBLEMAKER"]);await h.stage("DOPPELGANGER");
 h.success(await h.act(0,{type:"PLAYERS",playerIds:[h.members[1]!.playerId]}));let own=parse(WolfPlayingPlatformSnapshotV2Schema,await h.sync());assert.equal(own.game.privateView.actionRole,"ROBBER");
 h.success(await h.act(0,{type:"PLAYERS",playerIds:[h.members[2]!.playerId]}));own=parse(WolfPlayingPlatformSnapshotV2Schema,await h.sync());assert.equal(own.game.privateView.originalRole,"DOPPELGANGER");assert.equal(own.game.privateView.copiedRole,"ROBBER");
 const host=h.members[0]!,replacement=await h.connect();const resumed=parse(WolfPlayingPlatformSnapshotV2Schema,h.success(await h.call(replacement,"session:resume",{credential:{...host.credential,roomCode:h.lobby.room.roomCode},lastSeenVersions:null})));
 assert.equal(resumed.self.playerId,host.playerId);assert.deepEqual(resumed.game.privateView,own.game.privateView);
 assert.equal(h.failure(await h.call(host.client,"wolf:act",{type:"PASS"},{gameId:own.game.gameId,phaseId:own.game.phaseId,expectedActionRevision:own.game.privateView.actionRevision})),"UNAUTHENTICATED");
});
test("WOLF raw day-only bounded chat, secret immutable votes, explicit departure cancellation and roster rematch",async t=>{
 const h=await harness(t,4),host=h.members[0]!;let own=parse(WolfPlayingPlatformSnapshotV2Schema,await h.sync());
 assert.equal(h.failure(await h.call(host.client,"wolf:say",{text:"night leak"},{gameId:own.game.gameId,phaseId:own.game.phaseId})),"INVALID_PAYLOAD");
 await h.stage("DISCUSSION");own=parse(WolfPlayingPlatformSnapshotV2Schema,await h.sync());
 h.success(await h.call(host.client,"wolf:say",{text:"나는 예언자였어요"},{gameId:own.game.gameId,phaseId:own.game.phaseId}));
 assert.equal(h.failure(await h.call(host.client,"wolf:say",{text:"spam"},{gameId:own.game.gameId,phaseId:own.game.phaseId})),"INVALID_PAYLOAD");
 assert.equal(parse(WolfPlayingPlatformSnapshotV2Schema,await h.sync(h.members[2]!.client)).game.messages[0]!.text,"나는 예언자였어요");
 await h.stage("VOTE");own=parse(WolfPlayingPlatformSnapshotV2Schema,await h.sync());
 h.success(await h.call(host.client,"wolf:vote",{playerId:h.members[1]!.playerId},{gameId:own.game.gameId,phaseId:own.game.phaseId}));
 assert.equal(parse(WolfPlayingPlatformSnapshotV2Schema,await h.sync(h.members[1]!.client)).game.privateView.votedFor,null);
 assert.equal(h.failure(await h.call(host.client,"wolf:vote",{playerId:h.members[2]!.playerId},{gameId:own.game.gameId,phaseId:own.game.phaseId})),"INVALID_PAYLOAD");
 const room=await h.stored();const leave=parse(RoomLeaveAckSchema,await h.call(h.members[3]!.client,"room:leave",{},{expectedRoomRevision:room.roomRevision,expectedGameRevision:room.game!.gameRevision}));assert.ok(leave.ok,leave.ok?"":leave.error.code);
 const end=parse(WolfFinishedPlatformSnapshotV2Schema,await h.sync());assert.equal(end.game.result.reason,"CANCELLED");assert.deepEqual(end.game.result.winnerPlayerIds,[]);
 const lobby=parse(WolfLobbyPlatformSnapshotV2Schema,h.success(await h.call(host.client,"wolf:rematch",{},{gameId:end.game.gameId,expectedGameRevision:end.game.gameRevision,expectedRoomRevision:end.versions.roomRevision})));
 assert.equal(lobby.room.players.length,3);assert.equal(lobby.room.players.some(p=>p.playerId===h.members[3]!.playerId),false);
});
test("WOLF raw admission, host configure authority, deck mismatch, unknown fields and other game commands",async t=>{
 const h=await harness(t,2,null,false),host=h.members[0]!,other=h.members[1]!;
 assert.equal(h.failure(await h.call(host.client,"game:start",{},{expectedRoomRevision:h.lobby.versions.roomRevision})),"NOT_ENOUGH_PLAYERS");
 assert.equal(h.failure(await h.call(other.client,"wolf:configure",{roles:null,discussionSeconds:180},{expectedRoomRevision:h.lobby.versions.roomRevision})),"HOST_ONLY");
 assert.equal(h.failure(await h.call(host.client,"wolf:configure",{roles:null,discussionSeconds:180,secret:true},{expectedRoomRevision:h.lobby.versions.roomRevision})),"INVALID_PAYLOAD");
 const old=await h.connect(["SNEAKY_LUNCH"]),credential=await h.bootstrap(old);
 assert.equal(h.failure(await h.call(old,"room:join",{bootstrapCredential:credential,nickname:"older",roomCode:h.lobby.room.roomCode})),"INCOMPATIBLE_GAME_CAPABILITY");
 assert.equal(h.failure(await h.call(host.client,"sneaky:eat",{},{gameId:"wrong",teacherStateRevision:0})),"INCOMPATIBLE_GAME_CAPABILITY");
});
test("WOLF raw ten-player capacity rejects eleventh member",async t=>{
 const h=await harness(t,10,null,false),c=await h.connect(),credential=await h.bootstrap(c);
 assert.equal(h.failure(await h.call(c,"room:join",{bootstrapCredential:credential,nickname:"열한번째",roomCode:h.lobby.room.roomCode})),"ROOM_FULL");
});
test("WOLF raw stale callbacks cannot advance rematches; disconnected host transfers only after 60 seconds",async t=>{
 const h=await harness(t),runtime=h.server.runtime;const oldDeadline=await h.advance();await h.stage("FINISHED");const original=parse(WolfFinishedPlatformSnapshotV2Schema,await h.sync());
 const host=h.members[0]!,binding=runtime.connectionRegistry.listActiveBindings(h.lobby.room.roomId).find(b=>b.playerId===host.playerId)!;
 runtime.connectionRegistry.disconnect(binding.socketId,binding.connectionGeneration);const at=runtime.clock.now();runtime.wolfHostSuccession!.disconnected(h.lobby.room.roomId,host.playerId,at);
 h.time(at+59999);assert.equal(await runtime.wolfHostSuccession!.evaluate(h.lobby.room.roomId),false);h.time(at+60000);assert.equal(await runtime.wolfHostSuccession!.evaluate(h.lobby.room.roomId),true);
 const finish=parse(WolfFinishedPlatformSnapshotV2Schema,await h.sync(h.members[1]!.client));assert.deepEqual(finish.game,original.game);assert.equal(finish.room.players.find(p=>p.isHost)!.playerId,h.members[1]!.playerId);
 const lobby=parse(WolfLobbyPlatformSnapshotV2Schema,h.success(await h.call(h.members[1]!.client,"wolf:rematch",{},{gameId:finish.game.gameId,expectedGameRevision:finish.game.gameRevision,expectedRoomRevision:finish.versions.roomRevision})));
 assert.equal(lobby.room.players.length,3);assert.equal((await runtime.wolfService!.timeout(oldDeadline)).status,"NO_OP");
});
test("WOLF scheduler failure preserves successful start and stored deadline is recoverable",async t=>{
 const h=await harness(t,3,null,false),runtime=h.server.runtime;
 const diagnostics=t.mock.method(console,"error",()=>undefined);
 const scheduler=t.mock.method(runtime.turnScheduler,"scheduleTimeout",async()=>{throw new Error("test scheduler unavailable");});
 const first=parse(WolfPlayingPlatformSnapshotV2Schema,h.success(await h.call(h.members[0]!.client,"game:start",{},{expectedRoomRevision:h.lobby.versions.roomRevision})));
 assert.equal(first.game.stage,"REVEAL");assert.equal(diagnostics.mock.callCount(),1);scheduler.mock.restore();
 const room=await h.stored();h.time(room.game!.state.nextTransitionAt!);assert.equal(await runtime.overdueTurnSweeper.sweepOnce(),1);
 const recovered=parse(WolfPlayingPlatformSnapshotV2Schema,await h.sync());assert.notEqual(recovered.game.phaseId,first.game.phaseId);assert.equal(recovered.game.stage,"WEREWOLF");assert.equal(runtime.turnScheduler.scheduledCount,1);
});

test("WOLF checklist: resume between Doppel copy and exchange, then reject duplicate exchange on new connection",async t=>{
 const h=await harness(t,3,["DOPPELGANGER","ROBBER","WEREWOLF","SEER","VILLAGER","TROUBLEMAKER"]);await h.stage("DOPPELGANGER");
 h.success(await h.act(0,{type:"PLAYERS",playerIds:[h.members[1]!.playerId]}));
 const before=parse(WolfPlayingPlatformSnapshotV2Schema,await h.sync()),host=h.members[0]!;
 host.client.disconnect();const replacement=await h.connect();
 const resumed=parse(WolfPlayingPlatformSnapshotV2Schema,h.success(await h.call(replacement,"session:resume",{credential:{...host.credential,roomCode:h.lobby.room.roomCode},lastSeenVersions:null})));
 assert.deepEqual(resumed.game.privateView,before.game.privateView);assert.equal(resumed.game.privateView.actionRole,"ROBBER");
 const scope={gameId:resumed.game.gameId,phaseId:resumed.game.phaseId,expectedActionRevision:resumed.game.privateView.actionRevision};
 const done=parse(WolfPlayingPlatformSnapshotV2Schema,h.success(await h.call(replacement,"wolf:act",{type:"PLAYERS",playerIds:[h.members[2]!.playerId]},scope)));
 assert.equal(done.game.privateView.actionRole,null);assert.equal(done.game.privateView.observations.at(-1)!.cards[0]!.role,"WEREWOLF");
 const stored=structuredClone((await h.stored()).game!.state);
 // A fresh request ID cannot replay the ability, even with the latest revision.
 h.failure(await h.call(replacement,"wolf:act",{type:"PLAYERS",playerIds:[h.members[1]!.playerId]},{...scope,expectedActionRevision:done.game.privateView.actionRevision}));
 assert.deepEqual((await h.stored()).game!.state,stored);
 replacement.disconnect();const again=await h.connect();
 const restored=parse(WolfPlayingPlatformSnapshotV2Schema,h.success(await h.call(again,"session:resume",{credential:{...host.credential,roomCode:h.lobby.room.roomCode},lastSeenVersions:null})));
 assert.deepEqual(restored.game.privateView,done.game.privateView);
 const other=parse(WolfPlayingPlatformSnapshotV2Schema,await h.sync(h.members[2]!.client));assert.equal(other.game.privateView.originalRole,"WEREWOLF");assert.deepEqual(other.game.privateView.observations,[]);
});
