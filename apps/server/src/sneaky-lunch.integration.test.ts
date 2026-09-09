import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import { SneakyLobbyPlatformSnapshotV2Schema, SneakyPlayingPlatformSnapshotV2Schema, SneakyFinishedPlatformSnapshotV2Schema,
  SessionBootstrapAckSchema, StateSyncWireAckSchema, StateSnapshotWireEventSchema, ServerTimeSchema, TurnIdSchema, RoomLeaveAckSchema } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
import type { Difficulty } from "./games/sneaky-lunch/domain/game.js";
import { SneakyLunchGameStateAdapter } from "./games/sneaky-lunch/compatibility/adapter.js";

type Client = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
async function harness(t: TestContext, count = 2, boxes = 1, difficulty: Difficulty = "NORMAL", realTime = false) {
  const server = createHttpServer({ serveWeb: false }), clients: Client[] = [];
  t.after(async () => { clients.forEach(c => c.disconnect()); await server.shutdown(); });
  await new Promise<void>(r => server.httpServer.listen(0, "127.0.0.1", r));
  const address = server.httpServer.address(); assert.ok(address && typeof address !== "string");
  const port = address.port;
  let seq = 0, now = server.runtime.clock.now();
  if (!realTime) t.mock.method(server.runtime.clock, "now", () => now);
  async function connect(capabilities = ["SNEAKY_LUNCH"]) {
    const c: Client = io(`http://127.0.0.1:${port}`, { transports: ["websocket"], forceNew: true, reconnection: false,
      auth: { supportedSnapshotVersions: [2], supportedGameTypes: capabilities } });
    clients.push(c); await new Promise<void>((resolve, reject) => { c.once("connect", resolve); c.once("connect_error", reject); }); return c;
  }
  const request = (kind: string, payload: unknown = {}, extra: Record<string, unknown> = {}): {kind:string;protocolVersion:number;requestId:string;payload:unknown;[key:string]:unknown} => ({ kind, protocolVersion: 1, requestId: `sneaky-test-${++seq}`, payload, ...extra });
  const send = (c: Client, command: ReturnType<typeof request>) => new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`SNEAKY ACK missing ${command.kind}`)), 3000);
    c.emit(command.kind, command, value => { clearTimeout(timer); resolve(value); });
  });
  const call = (c: Client, kind: string, payload: unknown = {}, extra: Record<string, unknown> = {}) => send(c, request(kind, payload, extra));
  const success = (raw: unknown) => { const ack = parse(StateSyncWireAckSchema, raw); assert.ok(ack.ok, !ack.ok ? ack.error.code : ""); return ack.data.snapshot; };
  async function bootstrap(c: Client) { const ack = parse(SessionBootstrapAckSchema, await call(c, "session:bootstrap")); assert.ok(ack.ok); return ack.data.credential; }
  const host = await connect(), credential = await bootstrap(host);
  let lobby = parse(SneakyLobbyPlatformSnapshotV2Schema, success(await call(host, "room:create", { bootstrapCredential: credential, nickname: "도시락1", gameType: "SNEAKY_LUNCH" })));
  assert.deepEqual(lobby.room.settings, { lunchboxCount: 3, difficulty: "NORMAL" });
  const members = [{ client: host, playerId: lobby.self.playerId, credential }];
  for (let i = 1; i < count; i++) {
    const client = await connect(), credential = await bootstrap(client);
    lobby = parse(SneakyLobbyPlatformSnapshotV2Schema, success(await call(client, "room:join", { bootstrapCredential: credential, nickname: `도시락${i + 1}`, roomCode: lobby.room.roomCode })));
    members.push({ client, playerId: lobby.self.playerId, credential });
  }
  lobby = parse(SneakyLobbyPlatformSnapshotV2Schema, success(await call(host, "sneaky:configure", { lunchboxCount: boxes, difficulty }, { expectedRoomRevision: lobby.versions.roomRevision })));
  const first = parse(SneakyPlayingPlatformSnapshotV2Schema, success(await call(host, "game:start", {}, { expectedRoomRevision: lobby.versions.roomRevision })));
  async function stored() { const room = await server.runtime.persistence.findById(first.room.roomId); assert.ok(room?.gameType === "SNEAKY_LUNCH" && room.game); return room; }
  const sync = async (c = host) => success(await call(c, "state:sync"));
  function time(at: number) { now = parse(ServerTimeSchema, at); }
  function tick(ms = 150) { time(now + ms); }
  async function advance(fake = false) {
    const room = await stored(), s = room.game!.state;
    time(s.nextTransitionAt!);
    t.mock.method(server.runtime.sneakyLunchService!.deps.random, "nextInt", () => fake ? 0 : 9999);
    const identity = { roomId: room.roomId, gameId: room.game!.gameId, expectedGameRevision: room.game!.gameRevision, turnId: parse(TurnIdSchema, s.transitionId), deadlineAt: now };
    assert.equal((await server.runtime.sneakyLunchService!.timeout(identity)).status, "APPLIED");
    assert.equal((await server.runtime.sneakyLunchService!.timeout(identity)).status, "NO_OP");
    const viewer = members.find(m => !room.departedPlayerIds?.includes(m.playerId))!;
    return parse(SneakyPlayingPlatformSnapshotV2Schema, await sync(viewer.client));
  }
  async function eat(index = 0) {
    const room = await stored();
    return call(members[index]!.client, "sneaky:eat", {}, { gameId: room.game!.gameId, teacherStateRevision: room.game!.state.teacherStateRevision });
  }
  return { server, connect, bootstrap, call, request, send, success, sync, members, first, lobby, stored, time, tick, advance, eat };
}

for (const count of [2, 4, 8]) test(`SNEAKY raw ${count} players: countdown, hidden plans, multiple catches, teacher win and fresh same-room rematch`, async t => {
  const h = await harness(t, count);
  assert.equal(h.first.game.phase, "COUNTDOWN"); assert.equal(parse(StateSyncWireAckSchema, await h.eat()).ok, false);
  let view = await h.advance(); assert.equal(view.game.phase, "CLASSROOM");
  const forbidden = new Set(["nextTransitionAt", "plannedOutcome", "seed", "consecutiveFakes", "transitionId", "lastAcceptedEatAt"]);
  const audit = (value: unknown): void => { if (value && typeof value === "object") for (const [key, child] of Object.entries(value)) { assert.equal(forbidden.has(key), false, key); audit(child); } };
  for (const m of h.members) audit(await h.sync(m.client));
  h.success(await h.eat()); view = await h.advance(true); assert.equal(view.game.phase === "CLASSROOM" && view.game.teacherState, "SUSPICIOUS");
  h.success(await h.eat()); view = await h.advance(); assert.equal(view.game.phase === "CLASSROOM" && view.game.teacherState, "BOARD");
  await h.advance(); view = await h.advance(); assert.equal(view.game.phase === "CLASSROOM" && view.game.teacherState, "WATCHING");
  for (let i = 0; i < count; i++) {
    const result = h.success(await h.eat(i));
    assert.equal(result.room.phase, i === count - 1 ? "FINISHED" : "PLAYING");
  }
  const finished = parse(SneakyFinishedPlatformSnapshotV2Schema, await h.sync()); audit(finished);
  assert.equal(finished.game.result.reason, "TEACHER_WIN"); assert.equal(finished.game.result.winnerPlayerId, null);
  assert.equal(h.server.runtime.turnScheduler.scheduledCount, 0);
  const command = h.request("sneaky:rematch", {}, { gameId: finished.game.gameId, expectedRoomRevision: finished.versions.roomRevision, expectedGameRevision: finished.game.gameRevision });
  assert.equal(parse(StateSyncWireAckSchema, await h.send(h.members[1]!.client, command)).ok, false);
  const lobby = parse(SneakyLobbyPlatformSnapshotV2Schema, h.success(await h.send(h.members[0]!.client, command)));
  h.success(await h.send(h.members[0]!.client, command));
  assert.equal(lobby.room.roomCode, h.first.room.roomCode); assert.deepEqual(lobby.room.players.map(p => p.playerId), h.first.room.players.map(p => p.playerId));
  const fresh = parse(SneakyPlayingPlatformSnapshotV2Schema, h.success(await h.call(h.members[0]!.client, "game:start", {}, { expectedRoomRevision: lobby.versions.roomRevision })));
  assert.notEqual(fresh.game.gameId, h.first.game.gameId); assert.equal(fresh.game.gameRevision, 0); assert.ok(fresh.game.playerStates.every(p => p.completedBites === 0 && p.status === "ACTIVE"));
  assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
});
test("SNEAKY raw rate/replay/conflict, stale fairness, current danger; recovery preserves plan", async t => {
  const h = await harness(t); let view = await h.advance();
  const command = h.request("sneaky:eat", {}, { gameId: view.game.gameId, teacherStateRevision: view.game.teacherStateRevision });
  const first = parse(SneakyPlayingPlatformSnapshotV2Schema, h.success(await h.send(h.members[0]!.client, command)));
  h.success(await h.send(h.members[0]!.client, command)); assert.equal((await h.stored()).game!.state.players[0]!.completedBites, 1);
  assert.equal(parse(StateSyncWireAckSchema, await h.send(h.members[0]!.client, { ...command, teacherStateRevision: 999 })).ok, false);
  const fast = h.request("sneaky:eat", {}, { gameId: view.game.gameId, teacherStateRevision: view.game.teacherStateRevision });
  const limited = parse(SneakyPlayingPlatformSnapshotV2Schema, h.success(await h.send(h.members[0]!.client, fast))); assert.equal(limited.game.gameRevision, first.game.gameRevision);
  h.tick(150); h.success(await h.send(h.members[0]!.client, fast)); assert.equal((await h.stored()).game!.state.players[0]!.completedBites, 1);
  h.success(await h.eat()); assert.equal((await h.stored()).game!.state.players[0]!.completedBites, 2);
  await h.advance(); view = await h.advance();
  assert.equal(parse(StateSyncWireAckSchema, await h.call(h.members[0]!.client, "sneaky:eat", {}, { gameId: view.game.gameId, teacherStateRevision: 1 })).ok, false);
  assert.equal((await h.stored()).game!.state.players[0]!.status, "ACTIVE");
  const before = (await h.stored()).game!;
  const restored = new SneakyLunchGameStateAdapter().cloneAndValidate(JSON.parse(JSON.stringify(before))); assert.deepEqual(restored, before);
  h.success(await h.eat()); assert.equal((await h.stored()).game!.state.players[0]!.status, "CAUGHT");
  assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
});
test("SNEAKY raw final-bite race has one winner, no optimistic double completion", async t => {
  const h = await harness(t, 2, 1, "EASY"); await h.advance();
  for (let i = 0; i < 29; i++) { h.success(await h.eat(0)); h.success(await h.eat(1)); h.tick(); }
  const responses = await Promise.all([h.eat(0), h.eat(1)]);
  assert.equal(responses.filter(r => parse(StateSyncWireAckSchema, r).ok).length, 1);
  const finished = parse(SneakyFinishedPlatformSnapshotV2Schema, await h.sync());
  assert.equal(finished.game.result.reason, "PLAYER_FINISHED"); assert.equal(finished.game.playerStates.filter(p => p.completedBites === 30).length, 1);
  assert.equal(h.server.runtime.turnScheduler.scheduledCount, 0);
});
test("SNEAKY offline 29/30s, resume identity, last survivor not winner, Finished 60s Host transfer", async t => {
  const h = await harness(t), runtime = h.server.runtime, policy = runtime.sneakyLunchPresence!; await h.advance(); h.success(await h.eat());
  const roomId = h.first.room.roomId, host = h.members[0]!, other = h.members[1]!;
  const disconnect = (id: typeof host.playerId) => { const binding = runtime.connectionRegistry.listActiveBindings(roomId).find(b => b.playerId === id)!;
    runtime.connectionRegistry.disconnect(binding.socketId, binding.connectionGeneration); policy.disconnected(roomId, id, runtime.clock.now()); };
  let start = runtime.clock.now(); disconnect(host.playerId); h.time(start + 29000);
  assert.equal(await policy.evaluate(roomId), false); const resumed = await h.connect();
  const own = parse(SneakyPlayingPlatformSnapshotV2Schema, h.success(await h.call(resumed, "session:resume", { credential: { ...host.credential, roomCode: h.first.room.roomCode }, lastSeenVersions: null })));
  assert.equal(own.self.playerId, host.playerId); assert.equal(own.game.playerStates[0]!.completedBites, 1);
  start = runtime.clock.now(); disconnect(host.playerId); h.time(start + 30000);
  assert.equal(await policy.evaluate(roomId), true); assert.equal((await h.stored()).phase, "PLAYING"); assert.equal((await h.stored()).game!.state.players[0]!.status, "FORFEITED");
  const room = await h.stored();
  // Finish remaining player through the real server eat path, keeping the teacher's current safe state.
  for (let i = 0; i < room.game!.state.requiredBites; i++) { h.success(await h.eat(1)); h.tick(); }
  h.time(Math.max(runtime.clock.now(), start + 60000)); const before = (await h.stored()).game;
  assert.equal(await policy.evaluate(roomId), true); const after = await h.stored(); assert.equal(after.hostPlayerId, other.playerId); assert.deepEqual(after.game, before);
  const back = await h.connect(); const finished = parse(SneakyFinishedPlatformSnapshotV2Schema, h.success(await h.call(back, "session:resume", { credential: { ...host.credential, roomCode: h.first.room.roomCode }, lastSeenVersions: null })));
  assert.equal(finished.room.players.find(p => p.isHost)?.playerId, other.playerId);
  const lobby = parse(SneakyLobbyPlatformSnapshotV2Schema, h.success(await h.call(other.client, "sneaky:rematch", {}, { gameId: finished.game.gameId, expectedRoomRevision: finished.versions.roomRevision, expectedGameRevision: finished.game.gameRevision })));
  assert.equal(lobby.room.players.length, 2);
});
test("SNEAKY explicit leave preserves result and excludes next Lobby; new Host can rematch", async t => {
  const h = await harness(t, 3), view = await h.advance();
  const host = h.members[0]!, result = parse(RoomLeaveAckSchema, await h.call(host.client, "room:leave", {}, {
    expectedRoomRevision: view.versions.roomRevision, expectedGameRevision: view.game.gameRevision })); assert.ok(result.ok, !result.ok ? result.error.code : "");
  const room = await h.stored(); assert.equal(room.hostPlayerId, h.members[1]!.playerId); assert.equal(room.game!.state.players[0]!.status, "FORFEITED");
  await h.advance(); await h.advance(); h.success(await h.eat(1)); h.success(await h.eat(2));
  const finished = parse(SneakyFinishedPlatformSnapshotV2Schema, await h.sync(h.members[1]!.client)); assert.equal(finished.game.playerStates.length, 3);
  const lobby = parse(SneakyLobbyPlatformSnapshotV2Schema, h.success(await h.call(h.members[1]!.client, "sneaky:rematch", {}, { gameId: finished.game.gameId, expectedRoomRevision: finished.versions.roomRevision, expectedGameRevision: finished.game.gameRevision })));
  assert.equal(lobby.room.players.length, 2); assert.equal(lobby.room.players.some(p => p.playerId === host.playerId), false);
  const stale = await h.connect(); assert.equal(parse(StateSyncWireAckSchema, await h.call(stale, "session:resume", { credential: { ...host.credential, roomCode: h.first.room.roomCode }, lastSeenVersions: null })).ok, false);
});

test("SNEAKY admission/settings/primary/cross-game requests fail closed", async t => {
  const h = await harness(t, 8), host = h.members[0]!;
  const unauthorized = await h.connect();
  const identity = { gameId: h.first.game.gameId, teacherStateRevision: 0 };
  assert.equal(parse(StateSyncWireAckSchema, await h.call(unauthorized, "sneaky:eat", {}, identity)).ok, false);
  const before = await h.stored();
  assert.equal(parse(StateSyncWireAckSchema, await h.call(host.client, "sneaky:configure", { lunchboxCount: 5, difficulty: "HARD" }, { expectedRoomRevision: before.roomRevision })).ok, false);
  assert.deepEqual(await h.stored(), before);
  for (const gameType of ["HANGUL_TILE", "NUMBER_TILE", "GEM_CARD", "CITY_ROLE", "DRAW_RELAY"]) {
    const c = await h.connect([gameType, "SNEAKY_LUNCH"]), credential = await h.bootstrap(c);
    const lobby = h.success(await h.call(c, "room:create", { gameType, bootstrapCredential: credential, nickname: "격리" }));
    const snapshot = await h.server.runtime.persistence.findById(lobby.room.roomId);
    for (const [kind, payload, extra] of [
      ["sneaky:eat", {}, identity], ["sneaky:configure", { lunchboxCount: 1, difficulty: "EASY" }, { expectedRoomRevision: lobby.versions.roomRevision }],
      ["sneaky:rematch", {}, { gameId: h.first.game.gameId, expectedRoomRevision: lobby.versions.roomRevision, expectedGameRevision: 0 }],
    ] as const) assert.equal(parse(StateSyncWireAckSchema, await h.call(c, kind, payload, extra)).ok, false);
    assert.deepEqual(await h.server.runtime.persistence.findById(lobby.room.roomId), snapshot);
  }
  const replaced = await h.connect(); h.success(await h.call(replaced, "session:resume", { credential: { ...host.credential, roomCode: h.first.room.roomCode }, lastSeenVersions: null }));
  assert.equal(parse(StateSyncWireAckSchema, await h.call(host.client, "sneaky:eat", {}, identity)).ok, false);
});

test("SNEAKY eight raw clients / 15-second real-time tapping keeps teacher scheduler responsive", async t => {
  const h = await harness(t, 8, 5, "NORMAL", true);
  let latest = h.first, events = 0, bytes = 0, requests = 0, maxAckMs = 0;
  for (const m of h.members) m.client.on("state:snapshot", raw => {
    events++; bytes += Buffer.byteLength(JSON.stringify(raw));
    const event = parse(StateSnapshotWireEventSchema, raw);
    const snapshot = parse(SneakyPlayingPlatformSnapshotV2Schema, event.payload.snapshot);
    if (snapshot.game.gameRevision >= latest.game.gameRevision) latest = snapshot;
  });
  const delay = monitorEventLoopDelay({ resolution: 20 }); delay.enable();
  t.after(() => delay.disable());
  const memoryBefore = process.memoryUsage().heapUsed;
  await new Promise<void>(resolve => setTimeout(resolve, 3100));
  const start = performance.now();
  while (performance.now() - start < 15000) {
    const began = performance.now(), view = latest;
    if (view.game.phase === "CLASSROOM" && (view.game.teacherState === "BOARD" || view.game.teacherState === "SUSPICIOUS")) {
      await Promise.all(h.members.map(async m => {
        const at = performance.now(); requests++;
        const raw = await h.call(m.client, "sneaky:eat", {}, { gameId: view.game.gameId, teacherStateRevision: view.game.teacherStateRevision });
        const ack = parse(StateSyncWireAckSchema, raw);
        assert.ok(ack.ok || ack.error.code === "STALE_GAME_REVISION");
        maxAckMs = Math.max(maxAckMs, performance.now() - at);
      }));
    }
    await new Promise<void>(resolve => setTimeout(resolve, Math.max(1, 166 - (performance.now() - began))));
  }
  const state = (await h.stored()).game!.state;
  assert.ok(requests >= 160, `Too little exercise: ${requests}`);
  assert.ok(state.teacherStateRevision >= 4, `Teacher starved: ${state.teacherStateRevision}`);
  assert.equal(state.phase, "CLASSROOM"); assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
  assert.ok(state.players.every(p => p.status === "ACTIVE" && p.completedBites > 10 && p.completedBites < 150));
  assert.ok(maxAckMs < 2000, `ACK stalled ${maxAckMs}`);
  t.diagnostic(JSON.stringify({ durationMs: Math.round(performance.now() - start), requests, acceptedBites: state.players.reduce((n, p) => n + p.completedBites, 0),
    teacherTransitions: state.teacherStateRevision, snapshotEvents: events, snapshotBytes: bytes, maxAckMs: Math.round(maxAckMs),
    eventLoopP99Ms: Math.round(delay.percentile(99) / 1e6), heapDeltaMB: Math.round((process.memoryUsage().heapUsed - memoryBefore) / 1048576) }));
});

test("SNEAKY no connected Host successor preserves state; reconnect re-evaluates without revival", async t => {
  const h = await harness(t), runtime = h.server.runtime, policy = runtime.sneakyLunchPresence!, roomId = h.first.room.roomId;
  const since = runtime.clock.now();
  for (const m of h.members) {
    const b = runtime.connectionRegistry.listActiveBindings(roomId).find(b => b.playerId === m.playerId)!;
    runtime.connectionRegistry.disconnect(b.socketId, b.connectionGeneration); policy.disconnected(roomId, m.playerId, since);
  }
  h.time(since + 30000); assert.equal(await policy.evaluate(roomId), true);
  const finished = await h.stored(); assert.equal(finished.game!.state.result?.reason, "TEACHER_WIN"); assert.equal(runtime.turnScheduler.scheduledCount, 0);
  h.time(since + 60000); assert.equal(await policy.evaluate(roomId), false); assert.deepEqual(await h.stored(), finished);
  const participant = h.members[1]!, back = await h.connect();
  h.success(await h.call(back, "session:resume", { credential: { ...participant.credential, roomCode: h.first.room.roomCode }, lastSeenVersions: null }));
  await policy.evaluate(roomId);
  const after = await h.stored(); assert.equal(after.hostPlayerId, participant.playerId); assert.deepEqual(after.game, finished.game);
});
test("SNEAKY offline forfeit commit vs resume generation race is atomic and leaves progress unchanged", async t => {
  const h = await harness(t), r = h.server.runtime, policy = r.sneakyLunchPresence!, host = h.members[0]!, roomId = h.first.room.roomId;
  await h.advance(); h.success(await h.eat());
  const binding = r.connectionRegistry.listActiveBindings(roomId).find(b => b.playerId === host.playerId)!;
  const since = r.clock.now(); r.connectionRegistry.disconnect(binding.socketId, binding.connectionGeneration); policy.disconnected(roomId, host.playerId, since);
  h.time(since + 30000); const before = await h.stored(), commit = r.persistence.commit.bind(r.persistence);
  t.mock.method(r.persistence, "commit", async (...args: Parameters<typeof commit>) => {
    policy.resumed(roomId, host.playerId); return commit(...args);
  });
  assert.equal(await policy.evaluate(roomId), false); assert.deepEqual(await h.stored(), before);
});
