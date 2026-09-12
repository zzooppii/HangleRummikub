import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import { SpyfallLobbyPlatformSnapshotV2Schema, SpyfallPlayingPlatformSnapshotV2Schema, SpyfallFinishedPlatformSnapshotV2Schema, SessionBootstrapAckSchema,
  StateSyncWireAckSchema, RoomLeaveAckSchema, ServerTimeSchema, TurnIdSchema } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
type Client = Socket<Record<string,(value:unknown)=>void>,Record<string,(value:unknown,ack:(value:unknown)=>void)=>void>>;
async function harness(t:TestContext,count=4,start=true){
 const server=createHttpServer({serveWeb:false}),clients:Client[]=[];
 t.after(async()=>{clients.forEach(c=>c.disconnect());await server.shutdown();});
 await new Promise<void>(r=>server.httpServer.listen(0,"127.0.0.1",r));const address=server.httpServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;
 let seq=0,now=server.runtime.clock.now();t.mock.method(server.runtime.clock,"now",()=>now);t.mock.method(server.runtime.spyfallService!.deps.random,"nextInt",(n:number)=>n-1);
 async function connect(types=["SPYFALL", "WOLF_NIGHT"]){const c:Client=io(`http://127.0.0.1:${port}`,{transports:["websocket"],forceNew:true,reconnection:false,auth:{supportedSnapshotVersions:[2],supportedGameTypes:types,supportsRoomPreparation:true}});clients.push(c);await new Promise<void>((r,j)=>{c.once("connect",r);c.once("connect_error",j);});return c;}
 const request=(kind:string,payload:unknown={},extra:Record<string,unknown>={}):{kind:string;protocolVersion:number;requestId:string;payload:unknown;[key:string]:unknown}=>({kind,protocolVersion:1,requestId:`spyfall-${++seq}`,payload,...extra});
 const send=(c:Client,command:ReturnType<typeof request>)=>new Promise<unknown>((r,j)=>{const timer=setTimeout(()=>j(new Error(`Missing ${command.kind} ACK`)),4000);c.emit(command.kind,command,result=>{clearTimeout(timer);r(result);});});
 const call=(c:Client,kind:string,payload:unknown={},extra:Record<string,unknown>={})=>send(c,request(kind,payload,extra));
 const success=(value:unknown)=>{const ack=parse(StateSyncWireAckSchema,value);assert.ok(ack.ok,ack.ok?"":ack.error.code);return ack.data.snapshot;};
 const failure=(value:unknown)=>{const ack=parse(StateSyncWireAckSchema,value);assert.equal(ack.ok,false);if(ack.ok)throw new Error();return ack.error.code;};
 async function bootstrap(c:Client){const ack=parse(SessionBootstrapAckSchema,await call(c,"session:bootstrap"));assert.ok(ack.ok);return ack.data.credential;}
 const host=await connect(),credential=await bootstrap(host);
 let lobby=parse(SpyfallLobbyPlatformSnapshotV2Schema,success(await call(host,"room:create",{bootstrapCredential:credential,nickname:"달빛1",gameType:"SPYFALL"})));
 const members=[{client:host,playerId:lobby.self.playerId,credential}];
 for(let i=1;i<count;i++){const c=await connect(),credential=await bootstrap(c);lobby=parse(SpyfallLobbyPlatformSnapshotV2Schema,success(await call(c,"room:join",{bootstrapCredential:credential,nickname:`달빛${i+1}`,roomCode:lobby.room.roomCode})));members.push({client:c,playerId:lobby.self.playerId,credential});}
 lobby=parse(SpyfallLobbyPlatformSnapshotV2Schema,success(await call(host,"spyfall:configure",{roundSeconds:480,useRoles:true,locationPack:"ALL"},{expectedRoomRevision:lobby.versions.roomRevision})));
 if(start)success(await call(host,"game:start",{},{expectedRoomRevision:lobby.versions.roomRevision}));
 async function stored(){const room=await server.runtime.persistence.findById(lobby.room.roomId);assert.ok(room?.gameType==="SPYFALL"&&room.game);return room;}
 const sync=async(c=host)=>success(await call(c,"state:sync"));
 function time(at:number){now=parse(ServerTimeSchema,at);}
 async function advance(){const room=await stored(),s=room.game!.state;time(s.nextTransitionAt!);const deadline={roomId:room.roomId,gameId:room.game!.gameId,expectedGameRevision:room.game!.gameRevision,turnId:parse(TurnIdSchema,s.transitionId),deadlineAt:now};
 assert.equal((await server.runtime.spyfallService!.timeout(deadline)).status,"APPLIED");assert.equal((await server.runtime.spyfallService!.timeout(deadline)).status,"NO_OP");return deadline;}
 async function stage(target:string){for(let i=0;i<40&&(await stored()).game!.state.stage!==target;i++)await advance();assert.equal((await stored()).game!.state.stage,target);}

 return{server,connect,bootstrap,request,send,call,success,failure,lobby,members,stored,sync,time,advance,stage};
}
for (const count of [3, 4, 8]) test(`SPYFALL ${count} clients: full questioning, private simultaneous ballots, victory, rematch and stale callback`, async t => {
  const h = await harness(t, count), first = parse(SpyfallPlayingPlatformSnapshotV2Schema, await h.sync());
  const oldDeadline = await h.advance(); let room = await h.stored(), s = room.game!.state;
  const a = h.members.find(m => m.playerId === s.questionerId)!, b = h.members.find(m => m.playerId !== a.playerId)!, spy = s.spyPlayerId;
  const scope = () => ({ gameId: s.gameId, phaseId: s.transitionId });
  h.success(await h.call(a.client, "spyfall:ask", { playerId: b.playerId }, scope())); s = (await h.stored()).game!.state;
  h.success(await h.call(b.client, "spyfall:answer", {}, scope())); s = (await h.stored()).game!.state;
  const accuser = h.members.find(m => m.playerId !== spy)!;
  h.success(await h.call(accuser.client, "spyfall:accuse", { playerId: spy }, scope())); s = (await h.stored()).game!.state;
  const replies = await Promise.all(h.members.filter(m => m.playerId !== accuser.playerId && m.playerId !== spy).map(m => h.call(m.client, "spyfall:vote", { agree: true }, scope()))); replies.forEach(h.success);
  s = (await h.stored()).game!.state;
  const spyClient = h.members.find(m => m.playerId === spy)!.client;
  const chance = parse(SpyfallPlayingPlatformSnapshotV2Schema, await h.sync(spyClient));
  assert.equal(chance.game.stage, "GUESS"); assert.equal(chance.game.revealedSpyId, spy);
  assert.ok(!JSON.stringify(chance).includes('"location":'));
  h.success(await h.call(spyClient, "spyfall:guess", { location: s.location === "HOSPITAL" ? "SCHOOL" : "HOSPITAL" }, scope()));
  const finish = parse(SpyfallFinishedPlatformSnapshotV2Schema, await h.sync()); assert.equal(finish.game.result.reason, "GUESS_WRONG"); assert.equal(h.server.runtime.turnScheduler.scheduledCount, 0);
  const reset = h.request("room:selectGame", { gameType: "SPYFALL", gameId: s.gameId }, { expectedRoomRevision: finish.versions.roomRevision, expectedGameRevision: finish.game.gameRevision });
  const lobby = parse(SpyfallLobbyPlatformSnapshotV2Schema, h.success(await h.send(h.members[0]!.client, reset)));
  h.success(await h.send(h.members[0]!.client, reset)); assert.equal(lobby.room.roomCode, first.room.roomCode);
  assert.deepEqual(lobby.room.players.map(p => p.playerId), first.room.players.map(p => p.playerId));
  const next = parse(SpyfallPlayingPlatformSnapshotV2Schema, h.success(await h.call(h.members[0]!.client, "game:start", {}, { expectedRoomRevision: lobby.versions.roomRevision })));
  assert.notEqual(next.game.gameId, s.gameId); assert.equal((await h.server.runtime.spyfallService!.timeout(oldDeadline)).status, "NO_OP");
  assert.equal(h.failure(await h.call(a.client, "spyfall:ask", { playerId: b.playerId }, scope())), "STALE_GAME_REVISION");
});
test("SPYFALL raw spy privacy survives primary replacement; guess retries commit exactly once", async t => {
  const h = await harness(t), room = await h.stored(), spy = h.members.find(m => m.playerId === room.game!.state.spyPlayerId)!, citizen = h.members.find(m => m !== spy)!;
  const own = parse(SpyfallPlayingPlatformSnapshotV2Schema, await h.sync(spy.client)); assert.equal(own.game.privateView.role, "SPY");
  for (const secret of ['"location":', '"job":', '"spyPlayerId":', '"ballots":']) assert.ok(!JSON.stringify(own).includes(secret), secret);
  const replacement = await h.connect(); const resumed = parse(SpyfallPlayingPlatformSnapshotV2Schema, h.success(await h.call(replacement, "session:resume", { credential: { ...spy.credential, roomCode: h.lobby.room.roomCode }, lastSeenVersions: null })));
  assert.equal(resumed.self.playerId, spy.playerId); assert.equal(resumed.game.privateView.role, "SPY");
  await h.advance(); let s = (await h.stored()).game!.state;
  const reveal = h.request("spyfall:reveal", {}, { gameId: s.gameId, phaseId: s.transitionId });
  assert.equal(h.failure(await h.send(citizen.client, reveal)), "INVALID_PAYLOAD");
  h.success(await h.send(replacement, reveal)); s = (await h.stored()).game!.state;
  const guess = h.request("spyfall:guess", { location: s.location }, { gameId: s.gameId, phaseId: s.transitionId });
  const result = parse(SpyfallFinishedPlatformSnapshotV2Schema, h.success(await h.send(replacement, guess))); assert.equal(result.game.result.reason, "GUESS_CORRECT");
  h.success(await h.send(replacement, guess)); assert.equal((await h.stored()).game!.gameRevision, result.game.gameRevision);
  assert.equal(h.failure(await h.send(replacement, { ...guess, payload: { location: "HOSPITAL" } })), "REQUEST_ID_REUSED");
});
test("SPYFALL simultaneous accusations serialize, ballots remain private, expired inputs cannot change the game", async t => {
  const h = await harness(t); await h.advance(); let s = (await h.stored()).game!.state;
  const [a, b, c, d] = h.members; assert.ok(a && b && c && d);
  const scope = { gameId: s.gameId, phaseId: s.transitionId };
  const replies = await Promise.all([h.call(a.client, "spyfall:accuse", { playerId: d.playerId }, scope), h.call(b.client, "spyfall:accuse", { playerId: d.playerId }, scope)]);
  const parsed = replies.map(r => parse(StateSyncWireAckSchema, r)); assert.equal(parsed.filter(r => r.ok).length, 1);
  s = (await h.stored()).game!.state; const voter = h.members.find(m => m.playerId !== s.accuserId && m.playerId !== s.suspectId)!;
  h.success(await h.call(voter.client, "spyfall:vote", { agree: false }, { gameId: s.gameId, phaseId: s.transitionId }));
  const own = parse(SpyfallPlayingPlatformSnapshotV2Schema, await h.sync(voter.client)); assert.equal(own.game.privateView.vote, false);
  const suspect = parse(SpyfallPlayingPlatformSnapshotV2Schema, await h.sync(d.client)); assert.equal(suspect.game.privateView.vote, null); assert.ok(!JSON.stringify(suspect).includes('"ballots"'));
  h.time(s.nextTransitionAt!); const before = (await h.stored()).game!.gameRevision;
  assert.equal(h.failure(await h.call(c.client, "spyfall:vote", { agree: true }, { gameId: s.gameId, phaseId: s.transitionId })), "STALE_GAME_REVISION");
  assert.equal((await h.stored()).game!.gameRevision, before); await h.advance(); assert.equal((await h.stored()).game!.state.stage, "QUESTION");
});
test("SPYFALL host configuration, incapable clients, leave cancellation and timeout recovery", async t => {
  const h = await harness(t, 3, false), host = h.members[0]!, other = h.members[1]!;
  assert.equal(h.failure(await h.call(other.client, "spyfall:configure", { roundSeconds: 360, useRoles: false, locationPack: "EVERYDAY" }, { expectedRoomRevision: h.lobby.versions.roomRevision })), "HOST_ONLY");
  const old = await h.connect(["WOLF_NIGHT"]), credential = await h.bootstrap(old);
  assert.equal(h.failure(await h.call(old, "room:join", { bootstrapCredential: credential, nickname: "구버전", roomCode: h.lobby.room.roomCode })), "INCOMPATIBLE_GAME_CAPABILITY");
  const scheduler = t.mock.method(h.server.runtime.turnScheduler, "scheduleTimeout", async () => { throw new Error("test scheduler unavailable"); });
  h.success(await h.call(host.client, "game:start", {}, { expectedRoomRevision: h.lobby.versions.roomRevision })); scheduler.mock.restore();
  await h.advance(); const s = (await h.stored()).game!.state; assert.equal(s.stage, "QUESTION");
  const current = await h.stored();
  const left = parse(RoomLeaveAckSchema, await h.call(other.client, "room:leave", {}, { expectedRoomRevision: current.roomRevision, expectedGameRevision: current.game!.gameRevision })); assert.ok(left.ok, left.ok ? "" : left.error.code);
  const ended = parse(SpyfallFinishedPlatformSnapshotV2Schema, await h.sync()); assert.equal(ended.game.result.reason, "CANCELLED"); assert.deepEqual(ended.game.result.winnerPlayerIds, []);
});

test("SPYFALL final conviction keeps the answer private through reconnect and accepts one winning guess", async t => {
  const h = await harness(t, 3); await h.stage("FINAL_ACCUSATION");
  let s = (await h.stored()).game!.state;
  const spy = h.members.find(m => m.playerId === s.spyPlayerId)!, accuser = h.members.find(m => m.playerId === s.players[s.finalIndex]!.playerId)!;
  h.success(await h.call(accuser.client, "spyfall:accuse", { playerId: spy.playerId }, { gameId: s.gameId, phaseId: s.transitionId }));
  s = (await h.stored()).game!.state;
  const voter = h.members.find(m => m !== spy && m !== accuser)!;
  h.success(await h.call(voter.client, "spyfall:vote", { agree: true }, { gameId: s.gameId, phaseId: s.transitionId }));
  s = (await h.stored()).game!.state;
  assert.equal(s.stage, "GUESS"); assert.equal(s.voteRounds.at(-1)?.final, true);
  const replacement = await h.connect();
  const resumed = parse(SpyfallPlayingPlatformSnapshotV2Schema, h.success(await h.call(replacement, "session:resume", { credential: { ...spy.credential, roomCode: h.lobby.room.roomCode }, lastSeenVersions: null })));
  assert.equal(resumed.game.deadlineAt, s.nextTransitionAt); assert.equal(resumed.game.stage, "GUESS");
  for (const secret of ['"location":', '"job":', '"ballots":', '"result":']) assert.ok(!JSON.stringify(resumed).includes(secret), secret);
  const guess = h.request("spyfall:guess", { location: s.location }, { gameId: s.gameId, phaseId: s.transitionId });
  assert.equal(h.failure(await h.send(accuser.client, guess)), "INVALID_PAYLOAD");
  const finish = parse(SpyfallFinishedPlatformSnapshotV2Schema, h.success(await h.send(replacement, guess)));
  assert.equal(finish.game.result.reason, "GUESS_CORRECT"); assert.deepEqual(finish.game.result.winnerPlayerIds, [spy.playerId]);
  h.success(await h.send(replacement, guess)); assert.equal((await h.stored()).game!.gameRevision, finish.game.gameRevision);
  assert.equal(h.server.runtime.turnScheduler.scheduledCount, 0);
});
