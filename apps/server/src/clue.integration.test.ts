import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import * as v from "valibot";
import {
  SUPPORTED_GAME_TYPES, PlatformSnapshotV2Schema, SessionBootstrapAckSchema,
  StateSyncWireAckSchema, RoomLeaveAckSchema, type GameType, type PlatformSnapshotV2,
  ServerTimeSchema,
} from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
import { clueReachablePaths, isClueRoom, CLUE_SUSPECTS, CLUE_WEAPONS, type ClueCard } from "@hangul-rummikub/shared";

type Client = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
type Command = { kind: string; protocolVersion: number; requestId: string; payload: unknown; [key: string]: unknown };
async function harness(t: TestContext, count = 3) {
  const server = createHttpServer({ serveWeb: false }), clients: Client[] = [];
  t.after(async () => { clients.forEach(c => c.disconnect()); await server.shutdown(); });
  await new Promise<void>(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const address = server.httpServer.address(); assert.ok(address && typeof address !== "string");
  const port = address.port;
  let seq = 0;
  const request = (kind: string, payload: unknown = {}, extra: Record<string, unknown> = {}): Command => ({ kind, protocolVersion: 1, requestId: `room-prepare-${++seq}`, payload, ...extra });
  async function connect(types: readonly GameType[] = SUPPORTED_GAME_TYPES) {
    const client: Client = io(`http://127.0.0.1:${port}`, { transports: ["websocket"], forceNew: true, reconnection: false, auth: { supportsRoomPreparation: true, supportedSnapshotVersions: [2], supportedGameTypes: types } });
    clients.push(client);
    await new Promise<void>((resolve, reject) => { client.once("connect", resolve); client.once("connect_error", reject); });
    return client;
  }
  const send = (client: Client, command: Command) => new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Missing ${command.kind} acknowledgement`)), 5000);
    client.emit(command.kind, command, value => { clearTimeout(timer); resolve(value); });
  });
  const call = (client: Client, kind: string, payload: unknown = {}, extra: Record<string, unknown> = {}) => send(client, request(kind, payload, extra));
  const success = (raw: unknown) => { const ack = v.parse(StateSyncWireAckSchema, raw); assert.ok(ack.ok, ack.ok ? "" : JSON.stringify(ack.error)); return v.parse(PlatformSnapshotV2Schema, ack.data.snapshot); };
  const failure = (raw: unknown) => { const ack = v.parse(StateSyncWireAckSchema, raw); assert.equal(ack.ok, false); if (ack.ok) throw new Error("Expected failure"); return ack.error.code; };
  const bootstrap = async (client: Client) => { const ack = v.parse(SessionBootstrapAckSchema, await call(client, "session:bootstrap")); assert.ok(ack.ok); return ack.data.credential; };
  const host = await connect(), hostCredential = await bootstrap(host);
  let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: count > 6 ? "WOLF_NIGHT" : "CLUE" }));
  const members = [{ client: host, credential: hostCredential, playerId: lobby.self.playerId }];
  for (let i = 1; i < count; i++) {
    const client = await connect(), credential = await bootstrap(client);
    lobby = success(await call(client, "room:join", { bootstrapCredential: credential, nickname: `참가${i}`, roomCode: lobby.room.roomCode }));
    members.push({ client, credential, playerId: lobby.self.playerId });
  }
  const sync = async (client = host) => success(await call(client, "state:sync"));
  function selection(snapshot: PlatformSnapshotV2, gameType: GameType): Command {
    const game = snapshot.game;
    return request("room:selectGame", { gameType, gameId: game === null ? null : "gameId" in game ? game.gameId : game.publicState.gameId }, {
      expectedRoomRevision: snapshot.versions.roomRevision, expectedGameRevision: game?.gameRevision ?? null,
    });
  }
  async function readyAll() {
    for (const member of members) {
      const current = await sync(member.client);
      success(await call(member.client, "room:ready", { ready: true }, { expectedRoomRevision: current.versions.roomRevision }));
    }
    return sync();
  }
  return { server, host, members, lobby, connect, bootstrap, request, send, call, success, failure, sync, selection, readyAll };
}

function clue(snapshot:PlatformSnapshotV2){if(snapshot.game?.gameType!=="CLUE")throw new Error("Expected Clue game.");return snapshot.game;}
type Harness=Awaited<ReturnType<typeof harness>>;
async function start(h:Harness){const s=await h.sync();return h.success(await h.call(h.host,"game:start",{},{expectedRoomRevision:s.versions.roomRevision}));}
function action(h:Harness,s:PlatformSnapshotV2,payload:unknown){const g=clue(s);if(g.phase==="FINISHED")throw new Error("Clue finished.");return h.request("clue:act",payload,{gameId:g.gameId,expectedGameRevision:g.gameRevision,turnId:g.turnId});}
async function reachRoom(h:Harness){
  let s=await h.sync();for(let step=0;step<160;step++){
    const g=clue(s);if(g.phase==="FINISHED")throw new Error("Unexpected finished.");
    const actor=h.members.find(p=>p.playerId===g.turnPlayerId)!;
    if(g.phase==="SUGGEST")return {s,actor};
    if(g.phase==="TURN_START")s=h.success(await h.send(actor.client,action(h,s,{type:"ROLL"})));
    else if(g.phase==="MOVE"){
      const me=g.playerStates.find(p=>p.playerId===actor.playerId)!,location=g.tokens.find(t=>t.suspect===me.suspect)!.location;
      const paths=clueReachablePaths(location,g.die!,g.tokens.filter(t=>t.suspect!==me.suspect).map(t=>t.location));
      const target=[...paths.keys()].find(isClueRoom)??[...paths.keys()].at(-1);
      s=h.success(await h.send(actor.client,action(h,s,target?{type:"MOVE",destination:target}:{type:"END_TURN"})));
    }else s=h.success(await h.send(actor.client,action(h,s,{type:"END_TURN"})));
  }throw new Error("Failed to reach a room.");
}
test("CLUE socket: admission 3–6, strict capability and private deals for all viewers",async t=>{
  for(const count of [3,4,5,6]){const h=await harness(t,count),s=await start(h),stored=await h.server.runtime.persistence.findById(s.room.roomId);assert.ok(stored?.gameType==="CLUE"&&stored.game);assert.equal(clue(s).playerStates.length,count);assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(d=>d.roomId===s.room.roomId),false);for(const member of h.members){const view=clue(await h.sync(member.client));assert.equal(view.privateState.playerId,member.playerId);assert.equal(view.privateState.caseFile,null);const forbidden:readonly ClueCard[]=[...stored.game.state.envelope,...stored.game.state.players.filter(p=>p.playerId!==member.playerId).flatMap(p=>p.hand)];for(const c of forbidden)assert.equal(JSON.stringify(view).includes(c.cardId),false);}}
  const h=await harness(t,2),s=await h.sync();assert.equal(h.failure(await h.call(h.host,"game:start",{},{expectedRoomRevision:s.versions.roomRevision})),"NOT_ENOUGH_PLAYERS");
  const large=await harness(t,7),selected=large.success(await large.send(large.host,large.selection(await large.sync(),"CLUE")));assert.equal(large.failure(await large.call(large.host,"game:start",{},{expectedRoomRevision:selected.versions.roomRevision})),"NOT_ENOUGH_PLAYERS");
});
test("CLUE socket: wrong actor, injected die, stale identity, retries and concurrent moves preserve atomic state",async t=>{
  const h=await harness(t),s=await start(h),c=action(h,s,{type:"ROLL"}),before=await h.server.runtime.persistence.findById(s.room.roomId);
  assert.equal(h.failure(await h.send(h.members[1]!.client,c)),"NOT_YOUR_TURN");assert.equal(h.failure(await h.send(h.host,{...c,payload:{type:"ROLL",value:6}})),"INVALID_PAYLOAD");assert.equal(h.failure(await h.send(h.host,{...c,turnId:"old-turn"})),"STALE_GAME_REVISION");assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId),before);
  const results=await Promise.all([h.send(h.host,c),h.send(h.host,{...c,requestId:"concurrent-roll"})]);assert.equal(results.map(r=>v.parse(StateSyncWireAckSchema,r)).filter(r=>r.ok).length,1);const after=await h.server.runtime.persistence.findById(s.room.roomId);h.success(await h.send(h.host,c));assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId),after);
  assert.equal(h.failure(await h.send(h.host,{...c,payload:{type:"END_TURN"}})),"REQUEST_ID_REUSED");
});
test("CLUE socket: travel, private response, out-of-turn responder, refresh and old connection rejection",async t=>{
  const h=await harness(t);await start(h);const {s,actor}=await reachRoom(h);const stored=await h.server.runtime.persistence.findById(s.room.roomId);assert.ok(stored?.gameType==="CLUE"&&stored.game);
  const card=stored.game.state.players.filter(p=>p.playerId!==actor.playerId).flatMap(p=>p.hand).find(c=>[...CLUE_SUSPECTS,...CLUE_WEAPONS].some(key=>key===c.key))!;
  const q=h.success(await h.send(actor.client,action(h,s,{type:"SUGGEST",suspect:CLUE_SUSPECTS.find(k=>k===card.key)??stored.game.state.solution.suspect,weapon:CLUE_WEAPONS.find(k=>k===card.key)??stored.game.state.solution.weapon}))),qg=clue(q);assert.equal(qg.phase,"RESPOND");if(qg.phase!=="RESPOND"||!qg.suggestion?.responderPlayerId)throw new Error();
  const responder=h.members.find(p=>p.playerId===qg.suggestion!.responderPlayerId)!,view=clue(await h.sync(responder.client));const matching=view.privateState.hand.find(c=>[qg.suggestion!.suspect,qg.suggestion!.weapon,qg.suggestion!.room].some(k=>k===c.key))!;
  const stale=action(h,q,{type:"SHOW_CARD",cardId:matching.cardId});assert.equal(h.failure(await h.send(actor.client,stale)),"NOT_YOUR_TURN");
  assert.equal(h.failure(await h.send(responder.client,action(h,q,{type:"SHOW_CARD",cardId:"opaque-probe"}))),"RULE_VIOLATION");
  const replacement=await h.connect();const resumed=h.success(await h.call(replacement,"session:resume",{credential:{...responder.credential,roomCode:q.room.roomCode},lastSeenVersions:null}));assert.deepEqual(clue(resumed),view);
  assert.equal(h.failure(await h.send(responder.client,stale)),"UNAUTHENTICATED");h.success(await h.send(replacement,stale));const asked=clue(await h.sync(actor.client));assert.equal(asked.phase,"END_TURN");assert.equal(asked.privateState.evidence.at(-1)!.card.cardId,matching.cardId);
  const third=h.members.find(p=>p!==actor&&p!==responder)!;assert.equal(JSON.stringify(clue(await h.sync(third.client))).includes(matching.cardId),false);
  const actorAgain=await h.connect();const recovered=h.success(await h.call(actorAgain,"session:resume",{credential:{...actor.credential,roomCode:q.room.roomCode},lastSeenVersions:null}));assert.deepEqual(clue(recovered).privateState.evidence,asked.privateState.evidence);
  const unsupported=await h.connect(SUPPORTED_GAME_TYPES.filter(type=>type!=="CLUE"));assert.equal(h.failure(await h.call(unsupported,"session:resume",{credential:{...actor.credential,roomCode:q.room.roomCode},lastSeenVersions:null})),"INCOMPATIBLE_GAME_CAPABILITY");
});
test("CLUE socket: solved result, host succession and fresh same-room game reject old commands",async t=>{
  const h=await harness(t),s=await start(h),stored=await h.server.runtime.persistence.findById(s.room.roomId);assert.ok(stored?.gameType==="CLUE"&&stored.game);const old=action(h,s,{type:"ACCUSE",...stored.game.state.solution}),end=h.success(await h.send(h.host,old));assert.equal(clue(end).phase,"FINISHED");
  h.host.disconnect();const guest=h.members[1]!;await h.sync(guest.client);const now=h.server.runtime.clock.now();t.mock.method(h.server.runtime.clock,"now",()=>v.parse(ServerTimeSchema,now+61_000));assert.equal(await h.server.runtime.clueHostSuccession!.evaluate(s.room.roomId),true);
  const lobby=h.success(await h.send(guest.client,h.selection(await h.sync(guest.client),"CLUE")));assert.equal(lobby.room.roomCode,s.room.roomCode);assert.equal(lobby.room.phase,"LOBBY");
  const replacement=await h.connect();h.success(await h.call(replacement,"session:resume",{credential:{...h.members[0]!.credential,roomCode:s.room.roomCode},lastSeenVersions:null}));const latest=await h.sync(guest.client);const fresh=h.success(await h.call(guest.client,"game:start",{},{expectedRoomRevision:latest.versions.roomRevision}));assert.notEqual(clue(fresh).gameId,clue(s).gameId);assert.equal(h.failure(await h.send(replacement,{...old,requestId:"past-game"})),"STALE_GAME_REVISION");
});
test("CLUE socket: explicit leave cancels, then game switch preserves remaining room membership",async t=>{
  const h=await harness(t),s=await start(h);const ack=v.parse(RoomLeaveAckSchema,await h.call(h.members[1]!.client,"room:leave",{},{expectedRoomRevision:s.versions.roomRevision,expectedGameRevision:clue(s).gameRevision}));assert.ok(ack.ok);const end=await h.sync(),g=clue(end);assert.equal(g.phase,"FINISHED");if(g.phase!=="FINISHED")throw new Error();assert.equal(g.result.reason,"CANCELLED");const lobby=h.success(await h.send(h.host,h.selection(end,"NUMBER_TILE")));assert.equal(lobby.room.roomCode,s.room.roomCode);assert.equal(lobby.room.players.length,2);
});
