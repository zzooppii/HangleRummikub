import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import { LiarLobbyPlatformSnapshotV2Schema, LiarPlayingPlatformSnapshotV2Schema, LiarFinishedPlatformSnapshotV2Schema, SessionBootstrapAckSchema,
  StateSyncWireAckSchema, RoomLeaveAckSchema, ServerTimeSchema, TurnIdSchema } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
type Client = Socket<Record<string,(value:unknown)=>void>,Record<string,(value:unknown,ack:(value:unknown)=>void)=>void>>;
function active(input: unknown) { const s = parse(LiarPlayingPlatformSnapshotV2Schema, input); if (s.game.stage === "ROUND_RESULT") throw new Error("Expected active round"); return { ...s, game: s.game }; }
function roundResult(input: unknown) { const s = parse(LiarPlayingPlatformSnapshotV2Schema, input); if (s.game.stage !== "ROUND_RESULT") throw new Error("Expected round result"); return { ...s, game: s.game }; }
async function harness(t:TestContext,count=4,start=true){
 const server=createHttpServer({serveWeb:false}),clients:Client[]=[];
 t.after(async()=>{clients.forEach(c=>c.disconnect());await server.shutdown();});
 await new Promise<void>(r=>server.httpServer.listen(0,"127.0.0.1",r));const address=server.httpServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;
 let seq=0,now=server.runtime.clock.now();t.mock.method(server.runtime.clock,"now",()=>now);t.mock.method(server.runtime.liarService!.deps.random,"nextInt",(n:number)=>n-1);
 async function connect(types=["LIAR_GAME", "WOLF_NIGHT"]){const c:Client=io(`http://127.0.0.1:${port}`,{transports:["websocket"],forceNew:true,reconnection:false,auth:{supportedSnapshotVersions:[2],supportedGameTypes:types,supportsRoomPreparation:true}});clients.push(c);await new Promise<void>((r,j)=>{c.once("connect",r);c.once("connect_error",j);});return c;}
 const request=(kind:string,payload:unknown={},extra:Record<string,unknown>={}):{kind:string;protocolVersion:number;requestId:string;payload:unknown;[key:string]:unknown}=>({kind,protocolVersion:1,requestId:`liar-${++seq}`,payload,...extra});
 const send=(c:Client,command:ReturnType<typeof request>)=>new Promise<unknown>((r,j)=>{const timer=setTimeout(()=>j(new Error(`Missing ${command.kind} ACK`)),4000);c.emit(command.kind,command,result=>{clearTimeout(timer);r(result);});});
 const call=(c:Client,kind:string,payload:unknown={},extra:Record<string,unknown>={})=>send(c,request(kind,payload,extra));
 const success=(value:unknown)=>{const ack=parse(StateSyncWireAckSchema,value);assert.ok(ack.ok,ack.ok?"":ack.error.code);return ack.data.snapshot;};
 const failure=(value:unknown)=>{const ack=parse(StateSyncWireAckSchema,value);assert.equal(ack.ok,false);if(ack.ok)throw new Error();return ack.error.code;};
 async function bootstrap(c:Client){const ack=parse(SessionBootstrapAckSchema,await call(c,"session:bootstrap"));assert.ok(ack.ok);return ack.data.credential;}
 const host=await connect(),credential=await bootstrap(host);
 let lobby=parse(LiarLobbyPlatformSnapshotV2Schema,success(await call(host,"room:create",{bootstrapCredential:credential,nickname:"달빛1",gameType:"LIAR_GAME"})));
 const members=[{client:host,playerId:lobby.self.playerId,credential}];
 for(let i=1;i<count;i++){const c=await connect(),credential=await bootstrap(c);lobby=parse(LiarLobbyPlatformSnapshotV2Schema,success(await call(c,"room:join",{bootstrapCredential:credential,nickname:`달빛${i+1}`,roomCode:lobby.room.roomCode})));members.push({client:c,playerId:lobby.self.playerId,credential});}
 lobby=parse(LiarLobbyPlatformSnapshotV2Schema,success(await call(host,"liar:configure",{category:"FOOD",discussionSeconds:90},{expectedRoomRevision:lobby.versions.roomRevision})));
 if(start)success(await call(host,"game:start",{},{expectedRoomRevision:lobby.versions.roomRevision}));
 async function stored(){const room=await server.runtime.persistence.findById(lobby.room.roomId);assert.ok(room?.gameType==="LIAR_GAME"&&room.game);return room;}
 const sync=async(c=host)=>success(await call(c,"state:sync"));
 function time(at:number){now=parse(ServerTimeSchema,at);}
 async function advance(){const room=await stored(),s=room.game!.state;time(s.nextTransitionAt!);const deadline={roomId:room.roomId,gameId:room.game!.gameId,expectedGameRevision:room.game!.gameRevision,turnId:parse(TurnIdSchema,s.transitionId),deadlineAt:now};
 assert.equal((await server.runtime.liarService!.timeout(deadline)).status,"APPLIED");assert.equal((await server.runtime.liarService!.timeout(deadline)).status,"NO_OP");return deadline;}
 async function stage(target:string){for(let i=0;i<200&&(await stored()).game!.state.stage!==target;i++) {
   const state=(await stored()).game!.state;
   if(state.stage==="ROUND_RESULT") success(await call(host,"liar:nextRound",{},{gameId:state.gameId,phaseId:state.transitionId})); else await advance();
 }assert.equal((await stored()).game!.state.stage,target);}

 return{server,connect,bootstrap,request,send,call,success,failure,lobby,members,stored,sync,time,advance,stage};
}
for (const count of [4, 6, 8]) test(`LIAR ${count} clients: automatic phases, simultaneous votes, guess and same-room restart`, async t => {
  const h = await harness(t, count), first = active(await h.sync()); assert.equal(first.game.stage, "REVEAL");
  assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
  await h.stage("VOTE"); const room = await h.stored(), game = room.game!, liar = game.state.liarPlayerId, citizen = h.members.find(m => m.playerId !== liar)!;
  const replies = await Promise.all(h.members.map(m => h.call(m.client, "liar:vote", { playerId: m.playerId === liar ? citizen.playerId : liar }, { gameId: game.gameId, phaseId: game.state.transitionId })));
  replies.forEach(h.success);
  const caught = active(await h.sync()); assert.equal(caught.game.stage, "GUESS");
  const liarClient = h.members.find(m => m.playerId === liar)!;
  const guess = h.request("liar:guess", { text: game.state.word }, { gameId: game.gameId, phaseId: caught.game.phaseId });
  const result = roundResult(h.success(await h.send(liarClient.client, guess)));
  assert.equal(result.game.result.reason, "GUESS_CORRECT"); assert.equal(h.server.runtime.turnScheduler.scheduledCount, 0);
  h.success(await h.send(liarClient.client, guess)); assert.equal((await h.stored()).game!.gameRevision, result.game.gameRevision);
  await h.stage("FINISHED");
  const finished = parse(LiarFinishedPlatformSnapshotV2Schema, await h.sync());
  assert.equal(finished.game.rounds.length, 10);
  assert.equal(new Set(finished.game.rounds.map(r => r.result.word)).size, 10);
  const rematch = h.request("room:selectGame", { gameType: "LIAR_GAME", gameId: game.gameId }, { expectedRoomRevision: finished.versions.roomRevision, expectedGameRevision: finished.game.gameRevision });
  const lobby = parse(LiarLobbyPlatformSnapshotV2Schema, h.success(await h.send(h.members[0]!.client, rematch)));
  assert.equal(lobby.room.roomCode, first.room.roomCode); assert.deepEqual(lobby.room.players.map(p => p.playerId), first.room.players.map(p => p.playerId));
  const fresh = active(h.success(await h.call(h.members[0]!.client, "game:start", {}, { expectedRoomRevision: lobby.versions.roomRevision })));
  assert.notEqual(fresh.game.gameId, first.game.gameId); assert.equal(h.failure(await h.call(liarClient.client, "liar:guess", { text: game.state.word }, { gameId: game.gameId, phaseId: caught.game.phaseId })), "STALE_GAME_REVISION");
});
test("LIAR role, word and vote secrecy survives resume and primary replacement", async t => {
  const h = await harness(t), room = await h.stored(), liar = h.members.find(m => m.playerId === room.game!.state.liarPlayerId)!, citizen = h.members.find(m => m !== liar)!;
  let own = active(await h.sync(liar.client)); assert.equal(own.game.privateView.role, "LIAR");
  for (const secret of [room.game!.state.word, '"aliases"', '"liarPlayerId"', '"voteRounds"']) assert.ok(!JSON.stringify(own).includes(secret), secret);
  const city = active(await h.sync(citizen.client)); assert.equal(city.game.privateView.role, "CITIZEN");
  await h.stage("VOTE"); own = active(await h.sync(liar.client));
  h.success(await h.call(liar.client, "liar:vote", { playerId: citizen.playerId }, { gameId: own.game.gameId, phaseId: own.game.phaseId }));
  const before = active(await h.sync(liar.client)); const other = active(await h.sync(citizen.client)); assert.equal(other.game.privateView.votedFor, null);
  const replacement = await h.connect(); const resumed = active(h.success(await h.call(replacement, "session:resume", { credential: { ...liar.credential, roomCode: h.lobby.room.roomCode }, lastSeenVersions: null })));
  assert.deepEqual(resumed.game, before.game); assert.equal(resumed.self.playerId, liar.playerId);
  assert.equal(h.failure(await h.call(liar.client, "liar:vote", { playerId: citizen.playerId }, { gameId: own.game.gameId, phaseId: own.game.phaseId })), "UNAUTHENTICATED");
});
test("LIAR scoped clues, replay/conflict and exact deadline reject invalid changes", async t => {
  const h = await harness(t); await h.stage("CLUE"); let room = await h.stored(); const game = room.game!, actor = h.members.find(m => m.playerId === game.state.players[0]!.playerId)!, other = h.members.find(m => m !== actor)!;
  const c = h.request("liar:clue", { text: "바삭해요" }, { gameId: game.gameId, phaseId: game.state.transitionId });
  assert.equal(h.failure(await h.send(other.client, c)), "INVALID_PAYLOAD"); assert.equal((await h.stored()).game!.gameRevision, game.gameRevision);
  h.success(await h.send(actor.client, c)); const committed = (await h.stored()).game!; h.success(await h.send(actor.client, c)); assert.equal((await h.stored()).game!.gameRevision, committed.gameRevision);
  assert.equal(h.failure(await h.send(actor.client, { ...c, payload: { text: "다른 말" } })), "REQUEST_ID_REUSED");
  room = await h.stored(); h.time(room.game!.state.nextTransitionAt!);
  const nextActor = h.members.find(m => m.playerId === room.game!.state.players[1]!.playerId)!;
  const denied = await h.call(nextActor.client, "liar:clue", { text: "too late" }, { gameId: game.gameId, phaseId: room.game!.state.transitionId }); assert.equal(h.failure(denied), "STALE_GAME_REVISION");
  assert.equal((await h.stored()).game!.gameRevision, committed.gameRevision); await h.advance(); assert.equal((await h.stored()).game!.state.players[1]!.clueDone, true);
});
test("LIAR raw runoff restricts targets and simultaneous re-votes settle once", async t => {
  const h = await harness(t); await h.stage("VOTE"); let s = active(await h.sync());
  for (const [i, target] of [1, 0, 1, 0].entries()) h.success(await h.call(h.members[i]!.client, "liar:vote", { playerId: h.members[target]!.playerId }, { gameId: s.game.gameId, phaseId: s.game.phaseId }));
  s = active(await h.sync()); assert.equal(s.game.stage, "REVOTE"); assert.equal(s.game.privateView.votedFor, null);
  assert.equal(h.failure(await h.call(h.members[0]!.client, "liar:vote", { playerId: h.members[2]!.playerId }, { gameId: s.game.gameId, phaseId: s.game.phaseId })), "INVALID_PAYLOAD");
  const results = await Promise.all([1, 0, 1, 0].map((target, i) => h.call(h.members[i]!.client, "liar:vote", { playerId: h.members[target]!.playerId }, { gameId: s.game.gameId, phaseId: s.game.phaseId })));
  results.forEach(h.success); const finish = roundResult(await h.sync()); assert.equal(finish.game.result.reason, "TIE"); assert.equal(finish.game.result.voteRounds.length, 2);
});
test("LIAR admission, configure authority, cross-game commands, chat and departure cancellation", async t => {
  const h = await harness(t, 3, false), host = h.members[0]!, other = h.members[1]!;
  assert.equal(h.failure(await h.call(host.client, "game:start", {}, { expectedRoomRevision: h.lobby.versions.roomRevision })), "NOT_ENOUGH_PLAYERS");
  assert.equal(h.failure(await h.call(other.client, "liar:configure", { category: "ANIMAL", discussionSeconds: 90 }, { expectedRoomRevision: h.lobby.versions.roomRevision })), "HOST_ONLY");
  assert.equal(h.failure(await h.call(host.client, "liar:configure", { category: "ANIMAL", discussionSeconds: 90, word: "secret" }, { expectedRoomRevision: h.lobby.versions.roomRevision })), "INVALID_PAYLOAD");
  const old = await h.connect(["WOLF_NIGHT"]), credential = await h.bootstrap(old);
  assert.equal(h.failure(await h.call(old, "room:join", { bootstrapCredential: credential, nickname: "old", roomCode: h.lobby.room.roomCode })), "INCOMPATIBLE_GAME_CAPABILITY");
  const newcomer = await h.connect(), freshCredential = await h.bootstrap(newcomer);
  const lobby = parse(LiarLobbyPlatformSnapshotV2Schema, h.success(await h.call(newcomer, "room:join", { bootstrapCredential: freshCredential, nickname: "fourth", roomCode: h.lobby.room.roomCode })));
  h.success(await h.call(host.client, "game:start", {}, { expectedRoomRevision: lobby.versions.roomRevision }));
  const intruder = await h.connect(), intruderCredential = await h.bootstrap(intruder);
  assert.equal(h.failure(await h.call(intruder, "room:join", { bootstrapCredential: intruderCredential, nickname: "late", roomCode: h.lobby.room.roomCode })), "ROOM_NOT_JOINABLE");
  let s = active(await h.sync());
  assert.equal(h.failure(await h.call(host.client, "wolf:say", { text: "wrong game" }, { gameId: s.game.gameId, phaseId: s.game.phaseId })), "INVALID_PHASE");
  assert.equal(h.failure(await h.call(host.client, "liar:say", { text: "early" }, { gameId: s.game.gameId, phaseId: s.game.phaseId })), "INVALID_PAYLOAD");
  await h.stage("DISCUSSION"); s = active(await h.sync());
  h.success(await h.call(host.client, "liar:say", { text: "<img src=x onerror=alert(1)>" }, { gameId: s.game.gameId, phaseId: s.game.phaseId }));
  assert.equal(h.failure(await h.call(host.client, "liar:say", { text: "spam" }, { gameId: s.game.gameId, phaseId: s.game.phaseId })), "INVALID_PAYLOAD");
  const room = await h.stored(); const leave = parse(RoomLeaveAckSchema, await h.call(newcomer, "room:leave", {}, { expectedRoomRevision: room.roomRevision, expectedGameRevision: room.game!.gameRevision })); assert.ok(leave.ok);
  const end = parse(LiarFinishedPlatformSnapshotV2Schema, await h.sync()); assert.equal(end.game.result.reason, "CANCELLED"); assert.deepEqual(end.game.result.winnerPlayerIds, []);
  const reset = parse(LiarLobbyPlatformSnapshotV2Schema, h.success(await h.call(host.client, "room:selectGame", { gameType: "LIAR_GAME", gameId: end.game.gameId }, { expectedRoomRevision: end.versions.roomRevision, expectedGameRevision: end.game.gameRevision })));
  assert.equal(reset.room.players.length, 3);
});
test("LIAR maximum capacity and finished host succession preserve the result", async t => {
  const h = await harness(t, 8, false), ninth = await h.connect(), credential = await h.bootstrap(ninth);
  assert.equal(h.failure(await h.call(ninth, "room:join", { bootstrapCredential: credential, nickname: "nine", roomCode: h.lobby.room.roomCode })), "ROOM_FULL");
  h.success(await h.call(h.members[0]!.client, "game:start", {}, { expectedRoomRevision: h.lobby.versions.roomRevision }));
  const stale = await h.advance(); await h.stage("FINISHED"); const before = parse(LiarFinishedPlatformSnapshotV2Schema, await h.sync());
  const runtime = h.server.runtime, host = h.members[0]!, binding = runtime.connectionRegistry.listActiveBindings(h.lobby.room.roomId).find(b => b.playerId === host.playerId)!;
  runtime.connectionRegistry.disconnect(binding.socketId, binding.connectionGeneration); const at = runtime.clock.now(); runtime.liarHostSuccession!.disconnected(h.lobby.room.roomId, host.playerId, at);
  h.time(at + 59999); assert.equal(await runtime.liarHostSuccession!.evaluate(h.lobby.room.roomId), false); h.time(at + 60000); assert.equal(await runtime.liarHostSuccession!.evaluate(h.lobby.room.roomId), true);
  const end = parse(LiarFinishedPlatformSnapshotV2Schema, await h.sync(h.members[1]!.client)); assert.deepEqual(end.game, before.game); assert.equal(end.room.players.find(p => p.isHost)!.playerId, h.members[1]!.playerId);
  assert.equal((await runtime.liarService!.timeout(stale)).status, "NO_OP");
});
test("LIAR scheduling failure preserves commit and overdue sweeper recovers deadline", async t => {
  const h = await harness(t, 4, false), runtime = h.server.runtime;
  const diagnostics = t.mock.method(console, "error", () => undefined);
  const scheduler = t.mock.method(runtime.turnScheduler, "scheduleTimeout", async () => { throw new Error("test scheduler unavailable"); });
  const start = active(h.success(await h.call(h.members[0]!.client, "game:start", {}, { expectedRoomRevision: h.lobby.versions.roomRevision })));
  assert.equal(start.game.stage, "REVEAL"); assert.equal(diagnostics.mock.callCount(), 1); scheduler.mock.restore();
  h.time((await h.stored()).game!.state.nextTransitionAt!); assert.equal(await runtime.overdueTurnSweeper.sweepOnce(), 1);
  assert.equal(active(await h.sync()).game.stage, "CLUE");
});
test("LIAR a ten-person existing lobby can switch in without losing participants, then blocks start", async t => {
  const h = await harness(t, 4, false), host = h.members[0]!;
  h.success(await h.call(host.client, "room:selectGame", { gameType: "WOLF_NIGHT", gameId: null }, { expectedRoomRevision: h.lobby.versions.roomRevision, expectedGameRevision: null }));
  for (let i = 4; i < 10; i++) { const client = await h.connect(), credential = await h.bootstrap(client); h.success(await h.call(client, "room:join", { bootstrapCredential: credential, nickname: `추가${i}`, roomCode: h.lobby.room.roomCode })); }
  const before = await h.server.runtime.persistence.findById(h.lobby.room.roomId); assert.ok(before);
  const lobby = parse(LiarLobbyPlatformSnapshotV2Schema, h.success(await h.call(host.client, "room:selectGame", { gameType: "LIAR_GAME", gameId: null }, { expectedRoomRevision: before.roomRevision, expectedGameRevision: null })));
  assert.equal(lobby.room.players.length, 10); assert.equal(lobby.room.roomCode, h.lobby.room.roomCode);
  assert.equal(h.failure(await h.call(host.client, "game:start", {}, { expectedRoomRevision: lobby.versions.roomRevision })), "INVALID_PHASE");
});
test("LIAR early clue deadline callback and vote/timeout race cannot advance twice", async t => {
  const h = await harness(t); await h.stage("CLUE"); const room = await h.stored(), game = room.game!;
  const oldDeadline = { roomId: room.roomId, gameId: game.gameId, expectedGameRevision: game.gameRevision, turnId: parse(TurnIdSchema, game.state.transitionId), deadlineAt: parse(ServerTimeSchema, game.state.nextTransitionAt) };
  const actor = h.members.find(m => m.playerId === game.state.players[0]!.playerId)!;
  h.success(await h.call(actor.client, "liar:clue", { text: "힌트" }, { gameId: game.gameId, phaseId: game.state.transitionId }));
  h.time(oldDeadline.deadlineAt); assert.equal((await h.server.runtime.liarService!.timeout(oldDeadline)).status, "NO_OP");
  await h.stage("VOTE"); const current = await h.stored(), state = current.game!.state;
  h.time(state.nextTransitionAt!);
  const late = h.call(h.members[0]!.client, "liar:vote", { playerId: h.members[1]!.playerId }, { gameId: current.game!.gameId, phaseId: state.transitionId });
  const timed = h.server.runtime.liarService!.timeout({ roomId: room.roomId, gameId: current.game!.gameId, expectedGameRevision: current.game!.gameRevision, turnId: parse(TurnIdSchema, state.transitionId), deadlineAt: parse(ServerTimeSchema, state.nextTransitionAt) });
  assert.equal(h.failure(await late), "STALE_GAME_REVISION"); assert.equal((await timed).status, "APPLIED");
  const end = roundResult(await h.sync()); assert.equal(end.game.result.reason, "NO_VOTES"); assert.equal(end.game.gameRevision, current.game!.gameRevision + 1);
});

test("LIAR next round is host-only, serialized, replay-safe and restores completed scores on reconnect", async t => {
  const h = await harness(t), host = h.members[0]!, other = h.members[1]!;
  const early = active(await h.sync());
  assert.equal(h.failure(await h.call(host.client, "liar:nextRound", {}, { gameId: early.game.gameId, phaseId: early.game.phaseId })), "INVALID_PHASE");
  await h.stage("ROUND_RESULT");
  const result = roundResult(await h.sync()), before = await h.stored();
  assert.equal(h.server.runtime.turnScheduler.scheduledCount, 0);
  assert.equal(await h.server.runtime.overdueTurnSweeper.sweepOnce(), 0);
  assert.equal(h.failure(await h.call(other.client, "liar:nextRound", {}, { gameId: result.game.gameId, phaseId: result.game.phaseId })), "HOST_ONLY");
  assert.equal(h.failure(await h.call(host.client, "liar:nextRound", { points: 99 }, { gameId: result.game.gameId, phaseId: result.game.phaseId })), "INVALID_PAYLOAD");
  assert.equal(h.failure(await h.call(host.client, "liar:nextRound", {}, { gameId: result.game.gameId, phaseId: early.game.phaseId })), "STALE_GAME_REVISION");
  const resumedClient = await h.connect();
  const resumed = roundResult(h.success(await h.call(resumedClient, "session:resume", { credential: { ...other.credential, roomCode: h.lobby.room.roomCode }, lastSeenVersions: null })));
  assert.deepEqual(resumed.game, result.game);
  const c = h.request("liar:nextRound", {}, { gameId: result.game.gameId, phaseId: result.game.phaseId });
  (await Promise.all([h.send(host.client, c), h.send(host.client, c)])).forEach(h.success);
  const after = await h.stored(), fresh = active(await h.sync());
  assert.equal(fresh.game.roundNumber, 2); assert.equal(after.game!.gameRevision, before.game!.gameRevision + 1);
  assert.deepEqual([...fresh.game.scores].sort((a,b)=>a.playerId.localeCompare(b.playerId)), [...result.game.scores].sort((a,b)=>a.playerId.localeCompare(b.playerId)));
  assert.equal(after.liarPromptHistory!.length, 2); assert.notEqual(after.game!.state.word, before.game!.state.word);
  assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
  h.success(await h.send(host.client, c)); assert.equal((await h.stored()).liarPromptHistory!.length, 2);
  assert.equal(h.failure(await h.call(host.client, "liar:nextRound", {}, { gameId: result.game.gameId, phaseId: result.game.phaseId })), "STALE_GAME_REVISION");
  assert.ok(!JSON.stringify(fresh).includes('"liarPromptHistory"'));
});

test("LIAR round-result host succession allows continuation and departure retains earned points without a champion", async t => {
  const h = await harness(t); await h.stage("ROUND_RESULT");
  const runtime = h.server.runtime, host = h.members[0]!, nextHost = h.members[1]!, before = roundResult(await h.sync());
  const binding = runtime.connectionRegistry.listActiveBindings(h.lobby.room.roomId).find(b => b.playerId === host.playerId)!;
  runtime.connectionRegistry.disconnect(binding.socketId, binding.connectionGeneration);
  const at = runtime.clock.now(); runtime.liarHostSuccession!.disconnected(h.lobby.room.roomId, host.playerId, at); h.time(at + 60000);
  assert.equal(await runtime.liarHostSuccession!.evaluate(h.lobby.room.roomId), true);
  const after = roundResult(await h.sync(nextHost.client)); assert.deepEqual(after.game, before.game);
  const leave = parse(RoomLeaveAckSchema, await h.call(h.members[2]!.client, "room:leave", {}, { expectedRoomRevision: after.versions.roomRevision, expectedGameRevision: after.game.gameRevision })); assert.ok(leave.ok);
  const cancelled = parse(LiarFinishedPlatformSnapshotV2Schema, await h.sync(nextHost.client));
  assert.deepEqual(cancelled.game.scores, before.game.scores); assert.equal(cancelled.game.rounds.length, 1);
  assert.deepEqual(cancelled.game.matchWinnerPlayerIds, []); assert.equal(cancelled.game.result.reason, "CANCELLED");
});

test("LIAR draw history survives rematch, category changes and switching away and back", async t => {
  const h = await harness(t); await h.stage("FINISHED");
  const first = await h.stored(), host = h.members[0]!.client;
  assert.equal(first.liarPromptHistory!.length, 10);
  h.success(await h.call(host, "room:selectGame", { gameType: "WOLF_NIGHT", gameId: first.game!.gameId }, { expectedRoomRevision: first.roomRevision, expectedGameRevision: first.game!.gameRevision }));
  const wolf = await h.server.runtime.persistence.findById(first.roomId); assert.ok(wolf);
  assert.deepEqual(wolf.liarPromptHistory, first.liarPromptHistory);
  const lobby = parse(LiarLobbyPlatformSnapshotV2Schema, h.success(await h.call(host, "room:selectGame", { gameType: "LIAR_GAME", gameId: null }, { expectedRoomRevision: wolf.roomRevision, expectedGameRevision: null })));
  const configured = parse(LiarLobbyPlatformSnapshotV2Schema, h.success(await h.call(host, "liar:configure", { category: "FOOD", discussionSeconds: 60 }, { expectedRoomRevision: lobby.versions.roomRevision })));
  const fresh = active(h.success(await h.call(host, "game:start", {}, { expectedRoomRevision: configured.versions.roomRevision })));
  assert.ok(fresh.game.scores.every(p => p.points === 0));
  const after = await h.stored(); assert.equal(after.liarPromptHistory!.length, 11);
  assert.ok(!first.liarPromptHistory!.some(p => p.word === after.game!.state.word));
});
