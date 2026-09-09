import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { monitorEventLoopDelay, performance } from "node:perf_hooks";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import { SneakyLobbyPlatformSnapshotV2Schema, SneakyPlayingPlatformSnapshotV2Schema, SneakyFinishedPlatformSnapshotV2Schema,
  SessionBootstrapAckSchema, StateSyncWireAckSchema, StateSnapshotWireEventSchema, ServerTimeSchema, TurnIdSchema, RoomLeaveAckSchema } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
import { planTeacher, type Difficulty } from "./games/sneaky-lunch/domain/game.js";
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
// P22 complete-game cross product. Only injected time is accelerated; every action uses the real socket/application/UoW path.
for (const count of [2, 3, 4, 6, 8]) for (const difficulty of ["EASY", "NORMAL", "HARD", "NIGHTMARE"] as const) for (const boxes of [1, 3, 5]) {
  test(`P22 SNEAKY complete game: ${count} players / ${difficulty} / ${boxes} lunchboxes`, async t => {
    const h = await harness(t, count, boxes, difficulty); await h.advance();
    let commands = 0, transitions = 0;
    while ((await h.stored()).phase === "PLAYING") {
      const state = (await h.stored()).game!.state, now = h.server.runtime.clock.now();
      if (now >= state.nextTransitionAt!) { await h.advance(transitions++ % 3 === 0); continue; }
      if (state.teacherState === "BOARD" || state.teacherState === "SUSPICIOUS") {
        // A short phase boundary does not reset the player's 150ms interval.
        const nextBiteAt = (state.players[0]!.lastAcceptedEatAt ?? now - 150) + 150;
        if (now < nextBiteAt) { h.time(Math.min(nextBiteAt, state.nextTransitionAt!)); continue; }
        h.success(await h.eat()); commands++;
        assert.equal((await h.stored()).game!.state.players[0]!.completedBites, commands);
        h.time(Math.min(now + 150, state.nextTransitionAt!));
      } else h.time(state.nextTransitionAt!);
      assert.ok(commands <= boxes * 30 + 1 && transitions < 150, "bounded completion without stuck/extra progress");
    }
    const finished = parse(SneakyFinishedPlatformSnapshotV2Schema, await h.sync());
    assert.equal(finished.game.result.reason, "PLAYER_FINISHED"); assert.equal(finished.game.result.winnerPlayerId, h.members[0]!.playerId);
    assert.equal(commands, boxes * 30); assert.equal(finished.game.playerStates[0]!.completedBites, boxes * 30);
    assert.equal(finished.game.playerStates.length, count); assert.ok(finished.game.playerStates.every(p => p.completedBites <= boxes * 30));
    assert.deepEqual(finished.game.settings, { lunchboxCount: boxes, difficulty });
    assert.equal(h.server.runtime.turnScheduler.scheduledCount, 0);
    assert.deepEqual(new SneakyLunchGameStateAdapter().cloneAndValidate(JSON.parse(JSON.stringify((await h.stored()).game))), (await h.stored()).game);
  });
}

test("P22 SNEAKY published timing and fake distributions are measurably distinct; Nightmare caps streak at two", t => {
  const report: Record<string, { boardMeanMs: number; suspiciousMeanMs: number; fakePercent: number; effectiveFakePercent: number; maximumFakeStreak: number }> = {};
  for (const difficulty of ["EASY", "NORMAL", "HARD", "NIGHTMARE"] as const) {
    let board = 0, suspicious = 0, proposalFakes = 0, effectiveFakes = 0, streak = 0, maxStreak = 0, seed = 918273;
    for (let sample = 0; sample < 10000; sample++) {
      const input = { duration: sample, band: sample * 7919 % 10000, outcome: sample };
      board += planTeacher(difficulty, "BOARD", 0, input).durationMs;
      const p = planTeacher(difficulty, "SUSPICIOUS", 0, input); suspicious += p.durationMs; if (p.outcome === "FAKE") proposalFakes++;
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const effective = planTeacher(difficulty, "SUSPICIOUS", streak, { ...input, outcome: seed % 10000 });
      if (effective.outcome === "FAKE") { effectiveFakes++; streak++; } else streak = 0;
      maxStreak = Math.max(maxStreak, streak);
    }
    report[difficulty] = { boardMeanMs: board / 10000, suspiciousMeanMs: suspicious / 10000, fakePercent: proposalFakes / 100,
      effectiveFakePercent: effectiveFakes / 100, maximumFakeStreak: maxStreak };
  }
  assert.ok(report.EASY!.boardMeanMs > report.NORMAL!.boardMeanMs && report.NORMAL!.boardMeanMs > report.HARD!.boardMeanMs);
  assert.deepEqual(Object.values(report).map(r => r.fakePercent), [18, 30, 43, 58]); assert.equal(report.NIGHTMARE!.maximumFakeStreak, 2);
  t.diagnostic(JSON.stringify({ timingDistribution: report }));
});

test("P22 SNEAKY rematch can change options and rejects stale old-game timer/taps; Lobby ninth player rejected", async t => {
  const h = await harness(t, 8, 1, "EASY"); await h.advance();
  const old = (await h.stored()).game!;
  await h.advance(); await h.advance();
  for (let i = 0; i < 8; i++) h.success(await h.eat(i));
  const finished = parse(SneakyFinishedPlatformSnapshotV2Schema, await h.sync());
  const l = parse(SneakyLobbyPlatformSnapshotV2Schema, h.success(await h.call(h.members[0]!.client, "sneaky:rematch", {}, {
    gameId: finished.game.gameId, expectedRoomRevision: finished.versions.roomRevision, expectedGameRevision: finished.game.gameRevision })));
  const ninth = await h.connect(), credential = await h.bootstrap(ninth);
  assert.equal(parse(StateSyncWireAckSchema, await h.call(ninth, "room:join", { roomCode: l.room.roomCode, nickname: "아홉째", bootstrapCredential: credential })).ok, false);
  const configured = parse(SneakyLobbyPlatformSnapshotV2Schema, h.success(await h.call(h.members[0]!.client, "sneaky:configure", { lunchboxCount: 5, difficulty: "NIGHTMARE" }, { expectedRoomRevision: l.versions.roomRevision })));
  const second = parse(SneakyPlayingPlatformSnapshotV2Schema, h.success(await h.call(h.members[0]!.client, "game:start", {}, { expectedRoomRevision: configured.versions.roomRevision })));
  assert.deepEqual(second.game.settings, { lunchboxCount: 5, difficulty: "NIGHTMARE" }); assert.equal(second.game.requiredBites, 150);
  assert.ok(second.game.playerStates.every(p => p.status === "ACTIVE" && p.completedBites === 0)); assert.notEqual(second.game.gameId, old.gameId);
  assert.equal(parse(StateSyncWireAckSchema, await h.call(h.members[0]!.client, "sneaky:eat", {}, { gameId: old.gameId, teacherStateRevision: old.state.teacherStateRevision })).ok, false);
  assert.equal((await h.server.runtime.sneakyLunchService!.timeout({ roomId: second.room.roomId, gameId: old.gameId, expectedGameRevision: old.gameRevision,
    turnId: parse(TurnIdSchema, old.state.transitionId), deadlineAt: parse(ServerTimeSchema, old.state.nextTransitionAt) })).status, "NO_OP");
  assert.equal((await h.stored()).game!.gameRevision, 0); assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
});
test("P22 SNEAKY Finished Host transfer loses atomically to resumed offline generation", async t => {
  const h = await harness(t); await h.advance(); await h.advance(); await h.advance(); h.success(await h.eat(0)); h.success(await h.eat(1));
  const r = h.server.runtime, policy = r.sneakyLunchPresence!, roomId = h.first.room.roomId, host = h.members[0]!;
  const binding = r.connectionRegistry.listActiveBindings(roomId).find(b => b.playerId === host.playerId)!;
  const since = r.clock.now(); r.connectionRegistry.disconnect(binding.socketId, binding.connectionGeneration); policy.disconnected(roomId, host.playerId, since);
  h.time(since + 60000); const before = await h.stored(), commit = r.persistence.commit.bind(r.persistence);
  t.mock.method(r.persistence, "commit", async (...args: Parameters<typeof commit>) => { policy.resumed(roomId, host.playerId); return commit(...args); });
  assert.equal(await policy.evaluate(roomId), false); assert.deepEqual(await h.stored(), before); assert.equal((await h.stored()).hostPlayerId, host.playerId);
});

test("P22 SNEAKY lone Host cannot start and capacity remains game-specific", async t => {
  const h = await harness(t), solo = await h.connect(), credential = await h.bootstrap(solo);
  const l = parse(SneakyLobbyPlatformSnapshotV2Schema, h.success(await h.call(solo, "room:create", { bootstrapCredential: credential, nickname: "혼자", gameType: "SNEAKY_LUNCH" })));
  const denied = parse(StateSyncWireAckSchema, await h.call(solo, "game:start", {}, { expectedRoomRevision: l.versions.roomRevision }));
  assert.equal(denied.ok, false); if (!denied.ok) assert.equal(denied.error.code, "NOT_ENOUGH_PLAYERS");
  const unchanged = parse(SneakyLobbyPlatformSnapshotV2Schema, await h.sync(solo)); assert.deepEqual(unchanged.room, l.room); assert.equal(unchanged.game, null);
});
test("P22 SNEAKY every persisted teacher phase preserves hidden plan and overdue recovery advances once", async t => {
  const h = await harness(t); await h.advance(); const adapter = new SneakyLunchGameStateAdapter();
  for (const phase of ["BOARD", "SUSPICIOUS", "WATCHING", "RETURNING"]) {
    const room = await h.stored(), original = room.game!, clone = adapter.cloneAndValidate(JSON.parse(JSON.stringify(original)));
    assert.equal(clone.state.teacherState, phase); assert.deepEqual(clone, original);
    const lifecycle = adapter.inspectLifecycle(clone); assert.equal(lifecycle.lifecycle, "RUNNING"); if (lifecycle.lifecycle !== "RUNNING") throw new Error("Unexpected fixture terminal");
    assert.equal(lifecycle.activeTurn.deadlineAt, original.state.nextTransitionAt);
    assert.equal(lifecycle.activeTurn.turnId, original.state.transitionId);
    for (const member of h.members) {
      const view = parse(SneakyPlayingPlatformSnapshotV2Schema, await h.sync(member.client));
      assert.equal(view.game.phase === "CLASSROOM" && view.game.teacherState, phase);
      for (const secret of ["plannedOutcome", "nextTransitionAt", "consecutiveFakes", "transitionId"]) assert.equal(secret in view.game, false);
    }
    await h.server.runtime.turnScheduler.cancelTimeout(lifecycle.activeTurn.turnId);
    h.time(lifecycle.activeTurn.deadlineAt + 30000);
    const identity = { roomId: room.roomId, gameId: clone.gameId, expectedGameRevision: clone.gameRevision, ...lifecycle.activeTurn };
    assert.equal((await h.server.runtime.sneakyLunchService!.timeout(identity)).status, "APPLIED");
    const current = (await h.stored()).game!;
    assert.equal(current.gameRevision, original.gameRevision + 1); assert.equal(current.state.phaseStartedAt, h.server.runtime.clock.now());
    assert.ok(current.state.nextTransitionAt! > h.server.runtime.clock.now()); assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
    assert.equal((await h.server.runtime.sneakyLunchService!.timeout(identity)).status, "NO_OP"); assert.deepEqual((await h.stored()).game, current);
  }
});
