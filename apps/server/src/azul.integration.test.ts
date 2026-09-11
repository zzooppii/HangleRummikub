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
import type { AzulAction, AzulPlayingProjection, AzulDestination } from "@hangul-rummikub/shared";

type Client = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
type Command = { kind: string; protocolVersion: number; requestId: string; payload: unknown; [key: string]: unknown };
async function harness(t: TestContext, count = 2) {
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
  let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: count > 4 ? "WOLF_NIGHT" : "AZUL" }));
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

function azul(snapshot: PlatformSnapshotV2) { if (snapshot.game?.gameType !== "AZUL") throw new Error("Expected Azul game."); return snapshot.game; }
type Harness = Awaited<ReturnType<typeof harness>>;
async function start(h: Harness) { const s = await h.sync(); return h.success(await h.call(h.host, "game:start", {}, { expectedRoomRevision: s.versions.roomRevision })); }
function action(h: Harness, s: PlatformSnapshotV2, payload: unknown) { const g = azul(s); if (g.phase !== "PLAYING") throw new Error("Expected draft phase."); return h.request("azul:act", payload, { gameId: g.gameId, expectedGameRevision: g.gameRevision, turnId: g.turnId }); }
function legalMove(g: AzulPlayingProjection): AzulAction {
  const p = g.playerStates.find(p => p.playerId === g.activePlayerId)!;
  for (const destination of [0, 1, 2, 3, 4, "FLOOR"] satisfies AzulDestination[]) {
    for (const source of [...g.factories.map((_, index) => ({ kind: "FACTORY" as const, index })), { kind: "CENTER" as const }]) {
      const tiles = source.kind === "CENTER" ? g.center : g.factories[source.index]!;
      for (const tile of tiles) {
        if (destination !== "FLOOR" && (p.patternLines[destination]!.length === destination + 1 || p.patternLines[destination]!.some(t => t.color !== tile.color) || p.wall[destination]!.some(t => t?.color === tile.color))) continue;
        return { source, color: tile.color, destination };
      }
    }
  }
  throw new Error("No legal move.");
}
test("AZUL socket: starts 2/3/4-player games without readiness and with 30-second deadlines; rejects 1/5 players", async t => {
  for (const count of [2, 3, 4]) { const h = await harness(t, count), s = await start(h); assert.equal(azul(s).factories.length, 2 * count + 1); assert.equal(azul(s).playerStates.length, count); assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(d => d.roomId === s.room.roomId), true); }
  const single = await harness(t, 1), one = await single.sync(); assert.equal(single.failure(await single.call(single.host, "game:start", {}, { expectedRoomRevision: one.versions.roomRevision })), "NOT_ENOUGH_PLAYERS");
  const large = await harness(t, 5), selected = large.success(await large.send(large.host, large.selection(await large.sync(), "AZUL"))); assert.equal(selected.room.players.length, 5); assert.equal(large.failure(await large.call(large.host, "game:start", {}, { expectedRoomRevision: selected.versions.roomRevision })), "NOT_ENOUGH_PLAYERS");
  const four = await harness(t, 4), outsider = await four.connect(), credential = await four.bootstrap(outsider); assert.equal(four.failure(await four.call(outsider, "room:join", { bootstrapCredential: credential, nickname: "다섯째", roomCode: four.lobby.room.roomCode })), "ROOM_FULL");
});
test("AZUL socket: wrong actor, injected fields, nonexistent factories and stale turns do not commit", async t => {
  const h = await harness(t), s = await start(h), g = azul(s); if (g.phase !== "PLAYING") throw new Error();
  const actor = h.members.find(p => p.playerId === g.activePlayerId)!, other = h.members.find(p => p !== actor)!;
  const before = await h.server.runtime.persistence.findById(s.room.roomId), payload = legalMove(g);
  assert.equal(h.failure(await h.send(other.client, action(h, s, payload))), "NOT_YOUR_TURN");
  assert.equal(h.failure(await h.send(actor.client, action(h, s, { ...payload, tileId: "private-probe" }))), "INVALID_PAYLOAD");
  assert.equal(h.failure(await h.send(actor.client, action(h, s, { ...payload, source: { kind: "FACTORY", index: 8 } }))), "RULE_VIOLATION");
  assert.equal(h.failure(await h.send(actor.client, { ...action(h, s, payload), turnId: "past-turn" })), "STALE_GAME_REVISION");
  assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId), before);
});
test("AZUL socket: hidden bag/discard remain private, public boards match for all participants", async t => {
  const h = await harness(t, 3), s = await start(h), g = azul(s), room = await h.server.runtime.persistence.findById(s.room.roomId); assert.ok(room?.gameType === "AZUL" && room.game);
  const hiddenIds: readonly string[] = room.game.state.bag;
  for (const member of h.members) { const view = azul(await h.sync(member.client)); assert.deepEqual(view, g); for (const hiddenId of hiddenIds) assert.equal(JSON.stringify(view).includes(`"${hiddenId}"`), false); assert.equal("inventory" in view, false); assert.equal("bag" in view, false); }
});
test("AZUL socket: accepted retry commits once; concurrent distinct requests have one winner", async t => {
  const h = await harness(t), s = await start(h), g = azul(s); if (g.phase !== "PLAYING") throw new Error();
  const actor = h.members.find(p => p.playerId === g.activePlayerId)!, c = action(h, s, legalMove(g));
  h.success(await h.send(actor.client, c)); const after = await h.server.runtime.persistence.findById(s.room.roomId);
  h.success(await h.send(actor.client, c)); assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId), after);
  assert.equal(h.failure(await h.send(actor.client, { ...c, payload: { source: { kind: "CENTER" }, color: "RED", destination: "FLOOR" } })), "REQUEST_ID_REUSED");
  assert.equal(h.failure(await h.send(actor.client, { ...c, requestId: "stale-distinct" })), "STALE_GAME_REVISION");
  const next = await h.sync(), ng = azul(next); if (ng.phase !== "PLAYING") throw new Error(); const member = h.members.find(p => p.playerId === ng.activePlayerId)!, c2 = action(h, next, legalMove(ng));
  const results = await Promise.all([h.send(member.client, c2), h.send(member.client, { ...c2, requestId: "parallel-distinct" })]); assert.equal(results.map(r => v.parse(StateSyncWireAckSchema, r)).filter(r => r.ok).length, 1);
});
test("AZUL socket: refresh restores same board/turn, old primary cannot act, unsupported client cannot resume", async t => {
  const h = await harness(t), s = await start(h), g = azul(s); if (g.phase !== "PLAYING") throw new Error();
  const member = h.members.find(p => p.playerId === g.activePlayerId)!, replacement = await h.connect();
  const resumed = h.success(await h.call(replacement, "session:resume", { credential: { ...member.credential, roomCode: s.room.roomCode }, lastSeenVersions: null })); assert.deepEqual(azul(resumed), g);
  assert.equal(h.failure(await h.send(member.client, action(h, resumed, legalMove(g)))), "UNAUTHENTICATED");
  const unsupported = await h.connect(SUPPORTED_GAME_TYPES.filter(type => type !== "AZUL")); assert.equal(h.failure(await h.call(unsupported, "session:resume", { credential: { ...member.credential, roomCode: s.room.roomCode }, lastSeenVersions: null })), "INCOMPATIBLE_GAME_CAPABILITY");
});
test("AZUL socket: completes a match with automatic rounds, host succession, same-room rematch and stale-command rejection", async t => {
  const h = await harness(t); let s = await start(h), steps = 0; const firstId = azul(s).gameId; let old: Command | null = null;
  while (s.room.phase === "PLAYING" && steps++ < 900) { const g = azul(s); if (g.phase !== "PLAYING") throw new Error(); const actor = h.members.find(p => p.playerId === g.activePlayerId)!; old = action(h, s, legalMove(g)); s = h.success(await h.send(actor.client, old)); }
  const end = azul(s); assert.equal(end.phase, "FINISHED"); if (end.phase !== "FINISHED") throw new Error(); assert.equal(end.result.reason, "WALL_COMPLETE"); assert.ok(end.lastRound); assert.ok(end.round >= 5);
  const guest = h.members[1]!; h.host.disconnect(); await h.sync(guest.client);
  const at = h.server.runtime.clock.now(); t.mock.method(h.server.runtime.clock, "now", () => v.parse(ServerTimeSchema, at + 61_000)); assert.equal(await h.server.runtime.azulHostSuccession!.evaluate(s.room.roomId), true);
  const inherited = await h.sync(guest.client), lobby = h.success(await h.send(guest.client, h.selection(inherited, "AZUL"))); assert.equal(lobby.room.roomCode, s.room.roomCode); assert.equal(lobby.room.phase, "LOBBY");
  const host = h.members[0]!, replacement = await h.connect(); h.success(await h.call(replacement, "session:resume", { credential: { ...host.credential, roomCode: s.room.roomCode }, lastSeenVersions: null }));
  const current = await h.sync(guest.client), fresh = h.success(await h.call(guest.client, "game:start", {}, { expectedRoomRevision: current.versions.roomRevision })); assert.notEqual(azul(fresh).gameId, firstId);
  assert.ok(old); assert.equal(h.failure(await h.send(guest.client, { ...old, requestId: "old-game-attempt" })), "STALE_GAME_REVISION");
});
test("AZUL socket: explicit leave cancels and game switch preserves room and remaining players", async t => {
  const h = await harness(t), s = await start(h); const ack = v.parse(RoomLeaveAckSchema, await h.call(h.members[1]!.client, "room:leave", {}, { expectedRoomRevision: s.versions.roomRevision, expectedGameRevision: azul(s).gameRevision })); assert.ok(ack.ok);
  const end = await h.sync(), g = azul(end); assert.equal(g.phase, "FINISHED"); if (g.phase !== "FINISHED") throw new Error(); assert.equal(g.result.reason, "CANCELLED"); assert.deepEqual(g.result.winnerPlayerIds, []);
  const selected = h.success(await h.send(h.host, h.selection(end, "NUMBER_TILE"))); assert.equal(selected.room.roomCode, s.room.roomCode); assert.equal(selected.room.players.length, 1);
});

test("AZUL timer: server deadline survives resume; premature/stale callbacks do nothing; expired command and racing timeouts commit once", async t => {
  const h=await harness(t), s=await start(h), g=azul(s); assert.equal(g.phase,'PLAYING'); if(g.phase!=='PLAYING')throw new Error();
  assert.equal(g.deadlineAt-g.turnStartedAt,30_000);
  const service=h.server.runtime.azulService!;
  const deadline=(await h.server.runtime.persistence.listActiveTurnDeadlines()).find(d=>d.roomId===s.room.roomId)!; assert.ok(deadline);
  const before=await h.server.runtime.persistence.findById(s.room.roomId);
  assert.deepEqual(await service.timeout(deadline),{status:'NO_OP'});
  assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId),before);
  const actor=h.members.find(m=>m.playerId===g.activePlayerId)!, replacement=await h.connect();
  const resumed=h.success(await h.call(replacement,'session:resume',{credential:{...actor.credential,roomCode:s.room.roomCode},lastSeenVersions:null}));
  assert.deepEqual(azul(resumed),g);
  t.mock.method(h.server.runtime.clock,'now',()=>v.parse(ServerTimeSchema,g.deadlineAt));
  const late=action(h,s,legalMove(g));
  assert.equal(h.failure(await h.send(replacement,late)),'TURN_EXPIRED');
  assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId),before);
  const results=await Promise.all([service.timeout(deadline),service.timeout(deadline),h.send(replacement,{...late,requestId:'deadline-race'})]);
  assert.equal(results.slice(0,2).filter(r=>typeof r==='object' && r!==null && 'status' in r && r.status==='APPLIED').length,1);
  const next=azul(await h.sync(replacement)); assert.equal(next.gameRevision,g.gameRevision+1); assert.equal(next.feedback?.automatic,true);
  if(next.phase!=='PLAYING')throw new Error(); assert.equal(next.deadlineAt,g.deadlineAt+30_000); assert.notEqual(next.turnId,g.turnId);
  assert.deepEqual(await service.timeout(deadline),{status:'NO_OP'});
  const active=(await h.server.runtime.persistence.listActiveTurnDeadlines()).find(d=>d.roomId===s.room.roomId)!;
  assert.equal(active.turnId,next.turnId); assert.equal(active.deadlineAt,next.deadlineAt);
});
test("AZUL timer: a successful manual command makes its old timeout stale; leaving removes active deadline",async t=>{
  const h=await harness(t),s=await start(h),g=azul(s);if(g.phase!=='PLAYING')throw new Error();
  const deadline=(await h.server.runtime.persistence.listActiveTurnDeadlines()).find(d=>d.roomId===s.room.roomId)!;
  const actor=h.members.find(m=>m.playerId===g.activePlayerId)!;
  h.success(await h.send(actor.client,action(h,s,legalMove(g))));
  t.mock.method(h.server.runtime.clock,'now',()=>v.parse(ServerTimeSchema,g.deadlineAt));
  assert.deepEqual(await h.server.runtime.azulService!.timeout(deadline),{status:'NO_OP'});
  const current=await h.sync();
  const ack=v.parse(RoomLeaveAckSchema,await h.call(h.members[1]!.client,'room:leave',{}, {expectedRoomRevision:current.versions.roomRevision,expectedGameRevision:azul(current).gameRevision})); assert.ok(ack.ok);
  assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(d=>d.roomId===s.room.roomId),false);
});
