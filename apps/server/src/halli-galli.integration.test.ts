import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import { HalliLobbyPlatformSnapshotV2Schema, HalliPlayingPlatformSnapshotV2Schema, HalliFinishedPlatformSnapshotV2Schema, SessionBootstrapAckSchema,
  StateSyncWireAckSchema, RoomLeaveAckSchema, ServerTimeSchema, TurnIdSchema } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
type Client = Socket<Record<string,(value:unknown)=>void>,Record<string,(value:unknown,ack:(value:unknown)=>void)=>void>>;
async function harness(t:TestContext,count=3,start=true){
 const server=createHttpServer({serveWeb:false}),clients:Client[]=[];
 t.after(async()=>{clients.forEach(c=>c.disconnect());await server.shutdown();});
 await new Promise<void>(r=>server.httpServer.listen(0,"127.0.0.1",r));const address=server.httpServer.address();assert.ok(address&&typeof address!=="string");const port=address.port;
 let seq=0,now=server.runtime.clock.now();t.mock.method(server.runtime.clock,"now",()=>now);t.mock.method(server.runtime.halliService!.deps.random,"nextInt",(n:number)=>n-1);
 async function connect(types=["HALLI_GALLI"]){const c:Client=io(`http://127.0.0.1:${port}`,{transports:["websocket"],forceNew:true,reconnection:false,auth:{supportedSnapshotVersions:[2],supportedGameTypes:types}});clients.push(c);await new Promise<void>((r,j)=>{c.once("connect",r);c.once("connect_error",j);});return c;}
 const request=(kind:string,payload:unknown={},extra:Record<string,unknown>={}):{kind:string;protocolVersion:number;requestId:string;payload:unknown;[key:string]:unknown}=>({kind,protocolVersion:1,requestId:`halli-${++seq}`,payload,...extra});
 const send=(c:Client,command:ReturnType<typeof request>)=>new Promise<unknown>((r,j)=>{const timer=setTimeout(()=>j(new Error(`Missing ${command.kind} ACK`)),4000);c.emit(command.kind,command,result=>{clearTimeout(timer);r(result);});});
 const call=(c:Client,kind:string,payload:unknown={},extra:Record<string,unknown>={})=>send(c,request(kind,payload,extra));
 const success=(value:unknown)=>{const ack=parse(StateSyncWireAckSchema,value);assert.ok(ack.ok,ack.ok?"":ack.error.code);return ack.data.snapshot;};
 const failure=(value:unknown)=>{const ack=parse(StateSyncWireAckSchema,value);assert.equal(ack.ok,false);if(ack.ok)throw new Error();return ack.error.code;};
 async function bootstrap(c:Client){const ack=parse(SessionBootstrapAckSchema,await call(c,"session:bootstrap"));assert.ok(ack.ok);return ack.data.credential;}
 const host=await connect(),credential=await bootstrap(host);
 let lobby=parse(HalliLobbyPlatformSnapshotV2Schema,success(await call(host,"room:create",{bootstrapCredential:credential,nickname:"과일1",gameType:"HALLI_GALLI"})));
 const members=[{client:host,playerId:lobby.self.playerId,credential}];
 for(let i=1;i<count;i++){const c=await connect(),credential=await bootstrap(c);lobby=parse(HalliLobbyPlatformSnapshotV2Schema,success(await call(c,"room:join",{bootstrapCredential:credential,nickname:`과일${i+1}`,roomCode:lobby.room.roomCode})));members.push({client:c,playerId:lobby.self.playerId,credential});}
 if(start)success(await call(host,"game:start",{},{expectedRoomRevision:lobby.versions.roomRevision}));
 async function stored(){const room=await server.runtime.persistence.findById(lobby.room.roomId);assert.ok(room?.gameType==="HALLI_GALLI"&&room.game);return room;}
 const sync=async(c=host)=>success(await call(c,"state:sync"));
 function time(at:number){now=parse(ServerTimeSchema,at);}
 async function advance(){const room=await stored(),s=room.game!.state;time(s.nextTransitionAt!);const deadline={roomId:room.roomId,gameId:room.game!.gameId,expectedGameRevision:room.game!.gameRevision,turnId:parse(TurnIdSchema,s.transitionId),deadlineAt:now};
 assert.equal((await server.runtime.halliService!.timeout(deadline)).status,"APPLIED");assert.equal((await server.runtime.halliService!.timeout(deadline)).status,"NO_OP");return deadline;}
 async function finishByExhaustion() {
  for (let i = 0; i < 56 && (await stored()).phase === "PLAYING"; i++) await advance();
  const end = parse(HalliFinishedPlatformSnapshotV2Schema, await sync());
  assert.equal(end.game.result.reason, "LAST_PLAYER"); assert.equal(end.game.result.winnerPlayerIds.length, 1);
  assert.deepEqual(end.game.result.scores.map(p => p.cards).sort((a, b) => b - a), [56, ...Array.from({ length: count - 1 }, () => 0)]);
  return end;
 }
 return{finishByExhaustion,server,connect,bootstrap,request,send,call,success,failure,lobby,members,stored,sync,time,advance};
}
for (const count of [2, 3, 6]) test(`HALLI raw ${count} players: admission, start, flip, privacy and timer`, async t => {
 const h = await harness(t, count); const first = parse(HalliPlayingPlatformSnapshotV2Schema, await h.sync());
 assert.equal(first.game.playerStates.length, count); assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
 const privateCards = (await h.stored()).game!.state.players.flatMap(p => p.deck);
 for (const m of h.members) { const wire = JSON.stringify(await h.sync(m.client)); assert.ok(privateCards.every(c => !wire.includes(c.id))); assert.ok(!wire.includes('"deck":')); }
 const host = h.members[0]!, extra = { gameId: first.game.gameId, expectedGameRevision: first.game.gameRevision, turnId: first.game.turnId };
 assert.equal(h.failure(await h.call(h.members[1]!.client, "halli:flip", {}, extra)), "NOT_YOUR_TURN");
 h.time(first.game.flipAvailableAt); const request = h.request("halli:flip", {}, extra);
 const flipped = parse(HalliPlayingPlatformSnapshotV2Schema, h.success(await h.send(host.client, request))); h.success(await h.send(host.client, request));
 assert.equal(flipped.game.playerStates[0]!.discardCount, 1); assert.equal((await h.stored()).game!.gameRevision, 1);
 assert.equal(h.failure(await h.send(host.client, { ...request, payload: { cheat: true } })), "INVALID_PAYLOAD");
 assert.equal(h.failure(await h.send(host.client, { ...request, kind: "halli:bell", turnId: undefined })), "REQUEST_ID_REUSED");
 await h.advance(); assert.equal((await h.stored()).game!.gameRevision, 2); assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
});
for (const count of [2, 3]) test(`HALLI ${count} players: correct bell awards once and continues; stale input and retries cannot mutate`, async t => {
 const h = await harness(t, count);
 // Reach a valid five through real sequential flips rather than replacing repository state.
 let current = parse(HalliPlayingPlatformSnapshotV2Schema, await h.sync());
 for (let i = 0; i < 45; i++) {
  const sums = new Map<string, number>(); current.game.playerStates.forEach(p => { if (p.topCard) sums.set(p.topCard.fruit, (sums.get(p.topCard.fruit) ?? 0) + p.topCard.count); });
  if ([...sums.values()].includes(5)) break;
  const actor = h.members.find(p => p.playerId === current.game.activePlayerId)!; h.time(current.game.flipAvailableAt);
  current = parse(HalliPlayingPlatformSnapshotV2Schema, h.success(await h.call(actor.client, "halli:flip", {}, { gameId: current.game.gameId, expectedGameRevision: current.game.gameRevision, turnId: current.game.turnId })));
 }
 const before = await h.stored(); const pileCount = before.game!.state.players.reduce((n, p) => n + p.discard.length, 0);
 const commands = h.members.map(() => h.request("halli:bell", {}, { gameId: current.game.gameId, expectedGameRevision: current.game.gameRevision }));
 const acks = await Promise.all(h.members.map((p, i) => h.send(p.client, commands[i]!)));
 assert.equal(acks.map(x => parse(StateSyncWireAckSchema, x)).filter(a => a.ok).length, 1);
 const after = (await h.stored()).game!; assert.equal(after.state.phase, "PLAYING"); assert.equal(after.state.result, null); assert.equal(after.gameRevision, before.game!.gameRevision + 1); assert.equal(after.state.feedback?.kind, "CORRECT"); assert.equal(after.state.feedback.cards, pileCount);
 const winner = acks.findIndex(x => parse(StateSyncWireAckSchema, x).ok); h.success(await h.send(h.members[winner]!.client, commands[winner]!));
 assert.deepEqual((await h.stored()).game, after);
 const awarded = after.state.players[winner]!, previousDeck = before.game!.state.players[winner]!.deck;
 assert.deepEqual(awarded.deck, [...previousDeck, ...before.game!.state.players.flatMap(p => p.discard)]);
 const replacement = await h.connect(); h.success(await h.call(replacement, "session:resume", { credential: { ...h.members[winner]!.credential, roomCode: h.lobby.room.roomCode }, lastSeenVersions: null }));
 assert.deepEqual((await h.stored()).game, after);
 assert.equal(h.failure(await h.send(replacement, { ...commands[winner]!, expectedGameRevision: after.gameRevision })), "REQUEST_ID_REUSED");
 h.time(after.state.flipAvailableAt);
 const next = parse(HalliPlayingPlatformSnapshotV2Schema, h.success(await h.call(replacement, "halli:flip", {}, { gameId: after.gameId, expectedGameRevision: after.gameRevision, turnId: after.state.transitionId })));
 assert.equal(next.game.gameRevision, after.gameRevision + 1);
 assert.deepEqual((await h.stored()).game!.state.players[winner]!.discard[0], previousDeck[0]);
});
test("HALLI resume preserves deck/turn and replaces old primary; wrong game and malformed commands rejected", async t => {
 const h = await harness(t), host = h.members[0]!, before = await h.stored();
 const replacement = await h.connect(); h.success(await h.call(replacement, "session:resume", { credential: { ...host.credential, roomCode: h.lobby.room.roomCode }, lastSeenVersions: null }));
 const scope = { gameId: before.game!.gameId, expectedGameRevision: before.game!.gameRevision };
 assert.equal(h.failure(await h.call(host.client, "halli:bell", {}, scope)), "UNAUTHENTICATED");
 assert.deepEqual((await h.stored()).game, before.game);
 assert.equal(h.failure(await h.call(replacement, "halli:bell", {}, { ...scope, gameId: "foreign" })), "STALE_GAME_REVISION");
 assert.equal(h.failure(await h.call(replacement, "halli:bell", { fruit: "BANANA", count: 5 }, scope)), "INVALID_PAYLOAD");
 const old = await h.connect(["WOLF_NIGHT"]), credential = await h.bootstrap(old);
 assert.equal(h.failure(await h.call(old, "room:join", { bootstrapCredential: credential, nickname: "구버전", roomCode: h.lobby.room.roomCode })), "INCOMPATIBLE_GAME_CAPABILITY");
});
test("HALLI finished result, host rematch, old callbacks and old commands isolation", async t => {
 const h = await harness(t, 2), host = h.members[0]!, first = parse(HalliPlayingPlatformSnapshotV2Schema, await h.sync());
 const room = await h.stored(); const oldTimer = { roomId: room.roomId, gameId: room.game!.gameId, expectedGameRevision: room.game!.gameRevision, turnId: parse(TurnIdSchema, room.game!.state.transitionId), deadlineAt: parse(ServerTimeSchema, room.game!.state.nextTransitionAt) };
 const end = await h.finishByExhaustion(); assert.equal(h.server.runtime.turnScheduler.scheduledCount, 0);
 const extra = { gameId: end.game.gameId, expectedGameRevision: end.game.gameRevision, expectedRoomRevision: end.versions.roomRevision };
 assert.equal(h.failure(await h.call(h.members[1]!.client, "halli:rematch", {}, extra)), "HOST_ONLY");
 const lobby = parse(HalliLobbyPlatformSnapshotV2Schema, h.success(await h.call(host.client, "halli:rematch", {}, extra)));
 const next = parse(HalliPlayingPlatformSnapshotV2Schema, h.success(await h.call(host.client, "game:start", {}, { expectedRoomRevision: lobby.versions.roomRevision })));
 assert.notEqual(next.game.gameId, first.game.gameId); assert.equal((await h.server.runtime.halliService!.timeout(oldTimer)).status, "NO_OP");
 assert.equal(h.failure(await h.call(host.client, "halli:bell", {}, { gameId: first.game.gameId, expectedGameRevision: 0 })), "STALE_GAME_REVISION");
});
test("HALLI six-player capacity, start host and current revision", async t => {
 const h = await harness(t, 6, false), host = h.members[0]!, extra = { expectedRoomRevision: h.lobby.versions.roomRevision };
 const c = await h.connect(), credential = await h.bootstrap(c);
 assert.equal(h.failure(await h.call(c, "room:join", { bootstrapCredential: credential, nickname: "일곱", roomCode: h.lobby.room.roomCode })), "ROOM_FULL");
 assert.equal(h.failure(await h.call(h.members[1]!.client, "game:start", {}, extra)), "HOST_ONLY");
 assert.equal(h.failure(await h.call(host.client, "game:start", {}, { expectedRoomRevision: 999 })), "STALE_ROOM_REVISION");
 h.success(await h.call(host.client, "game:start", {}, extra));
});
test("HALLI explicit leave cancels game, preserves result and removes departed player on rematch", async t => {
 const h = await harness(t), room = await h.stored(), host = h.members[0]!;
 const leave = parse(RoomLeaveAckSchema, await h.call(h.members[2]!.client, "room:leave", {}, { expectedRoomRevision: room.roomRevision, expectedGameRevision: room.game!.gameRevision })); assert.ok(leave.ok);
 const end = parse(HalliFinishedPlatformSnapshotV2Schema, await h.sync()); assert.equal(end.game.result.reason, "CANCELLED");
 const lobby = parse(HalliLobbyPlatformSnapshotV2Schema, h.success(await h.call(host.client, "halli:rematch", {}, { gameId: end.game.gameId, expectedGameRevision: end.game.gameRevision, expectedRoomRevision: end.versions.roomRevision })));
 assert.equal(lobby.room.players.length, 2);
});
test("HALLI timer recovery continues past fifteen minutes using server Clock", async t => {
 const h = await harness(t, 3, false), runtime = h.server.runtime;
 const diagnostic = t.mock.method(console, "error", () => undefined);
 const schedule = t.mock.method(runtime.turnScheduler, "scheduleTimeout", async () => { throw new Error("offline scheduler"); });
 h.success(await h.call(h.members[0]!.client, "game:start", {}, { expectedRoomRevision: h.lobby.versions.roomRevision })); assert.equal(diagnostic.mock.callCount(), 1); schedule.mock.restore();
 const room = await h.stored(); h.time(room.game!.state.nextTransitionAt!); assert.equal(await runtime.overdueTurnSweeper.sweepOnce(), 1);
 const current = await h.stored(); h.time(current.game!.state.startedAt + 900_000); assert.equal(await runtime.overdueTurnSweeper.sweepOnce(), 1);
 const ongoing = parse(HalliPlayingPlatformSnapshotV2Schema, await h.sync()); assert.equal(ongoing.game.gameRevision, current.game!.gameRevision + 1); assert.equal(runtime.turnScheduler.scheduledCount, 1);
});
test("HALLI finished offline host transfers after 60 seconds without changing result", async t => {
 const h = await harness(t, 2); await h.finishByExhaustion();
 const before = (await h.stored()).game!, runtime = h.server.runtime, host = h.members[0]!;
 const binding = runtime.connectionRegistry.listActiveBindings(h.lobby.room.roomId).find(b => b.playerId === host.playerId)!;
 runtime.connectionRegistry.disconnect(binding.socketId, binding.connectionGeneration); const at = runtime.clock.now();
 runtime.halliHostSuccession!.disconnected(h.lobby.room.roomId, host.playerId, at);
 h.time(at + 59999); assert.equal(await runtime.halliHostSuccession!.evaluate(h.lobby.room.roomId), false);
 h.time(at + 60000); assert.equal(await runtime.halliHostSuccession!.evaluate(h.lobby.room.roomId), true);
 const after = await h.stored(); assert.equal(after.hostPlayerId, h.members[1]!.playerId); assert.deepEqual(after.game, before);
});


test("HALLI fast play: two clients alternate immediately with no Clock advance", async t => {
 const h = await harness(t, 2);
 let current = parse(HalliPlayingPlatformSnapshotV2Schema, await h.sync());
 const at = current.serverTime;
 for (let i = 0; i < 8; i++) {
  const actor = h.members.find(m => m.playerId === current.game.activePlayerId)!;
  const command = h.request("halli:flip", {}, { gameId: current.game.gameId, expectedGameRevision: current.game.gameRevision, turnId: current.game.turnId });
  current = parse(HalliPlayingPlatformSnapshotV2Schema, h.success(await h.send(actor.client, command)));
  assert.equal(current.serverTime, at); assert.equal(current.game.flipAvailableAt, at);
  assert.equal(current.game.gameRevision, i + 1);
  assert.equal(current.game.playerStates.reduce((n, p) => n + p.discardCount, 0), i + 1);
  h.success(await h.send(actor.client, command)); assert.equal((await h.stored()).game!.gameRevision, i + 1);
 }
 const end = (await h.stored()).game!;
 assert.equal(new Set(end.state.players.flatMap(p => [...p.deck, ...p.discard]).map(c => c.id)).size, 56);
 assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
});
