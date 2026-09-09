import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import { DrawRelayPlayingPlatformSnapshotV2Schema, DrawRelayFinishedPlatformSnapshotV2Schema, LobbyPlatformSnapshotV2Schema,
  SessionBootstrapAckSchema, StateSyncWireAckSchema, ServerTimeSchema, TurnIdSchema, RoomLeaveAckSchema } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
import { DRAW_PROMPTS } from "./games/draw-relay/domain/prompts-v1.js";

type Client = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
async function harness(t: TestContext, count = 3, drawSeconds?: 15|30|45|60|90) {
  const server = createHttpServer({ serveWeb: false }), clients: Client[] = [];
  t.after(async () => { clients.forEach(c => c.disconnect()); await server.shutdown(); });
  await new Promise<void>(r => server.httpServer.listen(0, "127.0.0.1", r));
  const address = server.httpServer.address(); assert.ok(address && typeof address !== "string");
  const port = address.port;
  let seq = 0;
  async function connect() {
    const c: Client = io(`http://127.0.0.1:${port}`, { transports: ["websocket"], forceNew: true, reconnection: false,
      auth: { supportedSnapshotVersions: [2], supportedGameTypes: ["DRAW_RELAY"] } });
    clients.push(c); await new Promise<void>((resolve, reject) => { c.once("connect", resolve); c.once("connect_error", reject); }); return c;
  }
  const request = (kind: string, payload: unknown = {}, extra: Record<string, unknown> = {}) => ({ kind, protocolVersion: 1, requestId: `draw-test-${++seq}`, payload, ...extra });
  const send = (c: Client, command: ReturnType<typeof request>) => new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`DRAW ACK missing ${command.kind}`)), 3000);
    c.emit(command.kind, command, value => { clearTimeout(timer); resolve(value); });
  });
  const call = (c: Client, kind: string, payload: unknown = {}, extra: Record<string, unknown> = {}) => send(c, request(kind, payload, extra));
  const success = (raw: unknown) => { const ack = parse(StateSyncWireAckSchema, raw); assert.ok(ack.ok, !ack.ok ? ack.error.code : ""); return ack.data.snapshot; };
  async function bootstrap(c: Client) { const ack = parse(SessionBootstrapAckSchema, await call(c, "session:bootstrap")); assert.ok(ack.ok); return ack.data.credential; }
  const host = await connect(), credential = await bootstrap(host);
  let lobby = parse(LobbyPlatformSnapshotV2Schema, success(await call(host, "room:create", { bootstrapCredential: credential, nickname: "그림1", gameType: "DRAW_RELAY" })));
  const members = [{ client: host, playerId: lobby.self.playerId, credential }];
  assert.ok(lobby.room.gameType === "DRAW_RELAY");
  assert.equal(lobby.room.drawSeconds, 60);
  for (let i = 1; i < count; i++) {
    const client = await connect(), credential = await bootstrap(client);
    lobby = parse(LobbyPlatformSnapshotV2Schema, success(await call(client, "room:join", { bootstrapCredential: credential, nickname: `그림${i + 1}`, roomCode: lobby.room.roomCode })));
    members.push({ client, playerId: lobby.self.playerId, credential });
  }
  if (drawSeconds !== undefined) {
    const denied = parse(StateSyncWireAckSchema, await call(members[1]!.client, "draw:configure", { promptMode: "MIXED", drawSeconds }, { expectedRoomRevision: lobby.versions.roomRevision }));
    assert.equal(denied.ok, false);
    lobby = parse(LobbyPlatformSnapshotV2Schema, success(await call(host, "draw:configure", { promptMode: "MIXED", drawSeconds }, { expectedRoomRevision: lobby.versions.roomRevision })));
    assert.ok(lobby.room.gameType === "DRAW_RELAY"); assert.equal(lobby.room.drawSeconds, drawSeconds);
    lobby = parse(LobbyPlatformSnapshotV2Schema, success(await call(host, "draw:configure", { promptMode: "EASY" }, { expectedRoomRevision: lobby.versions.roomRevision })));
    assert.ok(lobby.room.gameType === "DRAW_RELAY"); assert.equal(lobby.room.drawSeconds, drawSeconds);
  }
  const first = parse(DrawRelayPlayingPlatformSnapshotV2Schema, success(await call(host, "game:start", {}, { expectedRoomRevision: lobby.versions.roomRevision })));
  const sync = async (c: Client) => success(await call(c, "state:sync"));
  async function relay() {
    let view = parse(DrawRelayPlayingPlatformSnapshotV2Schema, await sync(host));
    while (view.game.phase !== "REVEAL") {
      for (const member of members) {
        const own = parse(DrawRelayPlayingPlatformSnapshotV2Schema, await sync(member.client));
        assert.notEqual(own.game.phase, "REVEAL");
        success(await call(member.client, own.game.phase === "DRAW" ? "draw:submitDrawing" : "draw:submitGuess",
          own.game.phase === "DRAW" ? { drawing: { strokes: [] } } : { text: "내 그림 추측" }, { gameId: own.game.gameId, stageToken: own.game.stageToken }));
      }
      view = parse(DrawRelayPlayingPlatformSnapshotV2Schema, await sync(host));
    }
    return view;
  }
  return { server, connect, call, request, send, success, sync, members, first, relay, lobby };
}

test("DRAW prompt pack: 600 original unique words, exact 200/250/150 buckets", () => {
  assert.equal(DRAW_PROMPTS.length, 600); assert.equal(new Set(DRAW_PROMPTS.map(p => p.text)).size, 600);
  assert.equal(new Set(DRAW_PROMPTS.map(p => p.id)).size, 600);
  assert.deepEqual(["EASY", "NORMAL", "HARD"].map(d => DRAW_PROMPTS.filter(p => p.difficulty === d).length), [200, 250, 150]);
});

test("DRAW Host config reaches canonical timer and all viewers; PLAYING configuration rejects", async t => {
  const h = await harness(t, 3, 30);
  const stored = await h.server.runtime.persistence.findById(h.first.room.roomId);
  assert.ok(stored?.gameType === "DRAW_RELAY" && stored.game);
  assert.equal(stored.drawSeconds, 30); assert.equal(stored.game.state.deadlineAt! - stored.game.state.startedAt, 30000);
  for (const member of h.members) assert.equal(parse(DrawRelayPlayingPlatformSnapshotV2Schema, await h.sync(member.client)).game.drawSeconds, 30);
  const denied = parse(StateSyncWireAckSchema, await h.call(h.members[0]!.client, "draw:configure", { promptMode: "MIXED", drawSeconds: 15 }, { expectedRoomRevision: h.first.versions.roomRevision }));
  assert.equal(denied.ok, false);
  assert.deepEqual(await h.server.runtime.persistence.findById(h.first.room.roomId), stored);
});

for (const count of [3, 4, 5, 8]) test(`DRAW raw ${count} players: private assignments, barrier, Reveal prefix, Finished and same-room rematch`, async t => {
  const h = await harness(t, count), host = h.members[0]!;
  assert.equal(h.first.room.players.length, count);
  const stored = await h.server.runtime.persistence.findById(h.first.room.roomId); assert.ok(stored?.gameType === "DRAW_RELAY" && stored.game);
  for (const m of h.members) {
    const own = parse(DrawRelayPlayingPlatformSnapshotV2Schema, await h.sync(m.client));
    assert.equal(own.game.phase, "DRAW");
    const ownerPrompt = stored.game.state.books.find(b => b.ownerPlayerId === m.playerId)!.initialPrompt;
    const containsExact = (value: unknown): boolean => value === ownerPrompt ||
      (value !== null && typeof value === "object" && Object.values(value).some(containsExact));
    assert.equal(containsExact(own), false);
    assert.ok(!("books" in own.game));
  }
  let view = await h.relay(); assert.equal(view.game.phase, "REVEAL");
  assert.ok("books" in view.game); assert.equal(view.game.books.length, 1); assert.equal(view.game.books[0]!.initialPrompt, null); assert.equal(view.game.books[0]!.pages.length, 0);
  const bad = parse(StateSyncWireAckSchema, await h.call(h.members[1]!.client, "draw:revealNext", {}, { gameId: view.game.gameId, stageToken: view.game.stageToken, expectedGameRevision: view.game.gameRevision }));
  assert.ok(!bad.ok); assert.equal(bad.error.code, "HOST_ONLY");
  for (;;) {
    const next = h.success(await h.call(host.client, "draw:revealNext", {}, { gameId: view.game.gameId, stageToken: view.game.stageToken, expectedGameRevision: view.game.gameRevision }));
    if (next.room.phase === "FINISHED") {
      const finished = parse(DrawRelayFinishedPlatformSnapshotV2Schema, next);
      assert.equal(finished.game.books.length, count); assert.equal(h.server.runtime.turnScheduler.scheduledCount, 0);
      const lobby = parse(LobbyPlatformSnapshotV2Schema, h.success(await h.call(host.client, "draw:rematch", {}, { gameId: finished.game.gameId, stageToken: finished.game.stageToken,
        expectedGameRevision: finished.game.gameRevision, expectedRoomRevision: finished.versions.roomRevision })));
      assert.equal(lobby.room.roomCode, h.first.room.roomCode); assert.deepEqual(lobby.room.players.map(p => p.playerId), h.first.room.players.map(p => p.playerId));
      const fresh = parse(DrawRelayPlayingPlatformSnapshotV2Schema, h.success(await h.call(host.client, "game:start", {}, { expectedRoomRevision: lobby.versions.roomRevision })));
      assert.notEqual(fresh.game.gameId, h.first.game.gameId); assert.equal(fresh.game.gameRevision, 0); break;
    }
    view = parse(DrawRelayPlayingPlatformSnapshotV2Schema, next);
  }
});

test("DRAW Host grace: 59 seconds preserve, 60 seconds earliest connected; cursor and all Book state unchanged", async t => {
  const h = await harness(t), initial = await h.relay(), runtime = h.server.runtime;
  let view = initial;
  for (let i = 0; i < 2; i++) view = parse(DrawRelayPlayingPlatformSnapshotV2Schema, h.success(await h.call(h.members[0]!.client, "draw:revealNext", {}, {
    gameId: view.game.gameId, stageToken: view.game.stageToken, expectedGameRevision: view.game.gameRevision })));
  const policy = runtime.drawRelayHostSuccession!; const host = h.members[0]!;
  const binding = runtime.connectionRegistry.listActiveBindings(view.room.roomId).find(b => b.playerId === host.playerId)!;
  runtime.connectionRegistry.disconnect(binding.socketId, binding.connectionGeneration);
  const start = runtime.clock.now(); policy.disconnected(view.room.roomId, host.playerId, start);
  t.mock.method(runtime.clock, "now", () => parse(ServerTimeSchema, start + 59_000));
  assert.equal(await policy.evaluate(view.room.roomId), false);
  const before = await runtime.persistence.findById(view.room.roomId);
  t.mock.method(runtime.clock, "now", () => parse(ServerTimeSchema, start + 60_000));
  assert.equal(await policy.evaluate(view.room.roomId), true); assert.equal(await policy.evaluate(view.room.roomId), false);
  const after = await runtime.persistence.findById(view.room.roomId); assert.ok(after);
  assert.equal(after.hostPlayerId, h.members[1]!.playerId); assert.deepEqual(after.game, before!.game);
  assert.equal(after.roomRevision, before!.roomRevision + 1);
  const successor = parse(DrawRelayPlayingPlatformSnapshotV2Schema, await h.sync(h.members[1]!.client));
  assert.ok("books" in successor.game); assert.equal(successor.game.books[0]!.pages.length, 1);
  assert.equal(successor.game.books.length, 1); assert.equal(successor.game.reveal.pageIndex, 1);
  const fresh = await h.connect();
  const resumed = parse(DrawRelayPlayingPlatformSnapshotV2Schema, h.success(await h.call(fresh, "session:resume", {
    credential: { ...host.credential, roomCode: view.room.roomCode }, lastSeenVersions: null })));
  assert.equal(resumed.self.playerId, host.playerId); assert.equal(resumed.room.players.find(p => p.isHost)?.playerId, h.members[1]!.playerId);
  h.success(await h.call(h.members[1]!.client, "draw:revealNext", {}, { gameId: successor.game.gameId, stageToken: successor.game.stageToken, expectedGameRevision: successor.game.gameRevision }));
});

test("DRAW grace resume cancels stale callback; DRAW phase never transfers", async t => {
  const h = await harness(t), r = h.server.runtime, policy = r.drawRelayHostSuccession!, host = h.members[0]!;
  const binding = r.connectionRegistry.listActiveBindings(h.first.room.roomId).find(b => b.playerId === host.playerId)!;
  r.connectionRegistry.disconnect(binding.socketId, binding.connectionGeneration);
  const now = r.clock.now(); policy.disconnected(h.first.room.roomId, host.playerId, now);
  t.mock.method(r.clock, "now", () => parse(ServerTimeSchema, now + 60_000));
  assert.equal(await policy.evaluate(h.first.room.roomId), false);
  const fresh = await h.connect();
  h.success(await h.call(fresh, "session:resume", { credential: { ...host.credential, roomCode: h.first.room.roomCode }, lastSeenVersions: null }));
  assert.equal(policy.offline.get(h.first.room.roomId)?.has(host.playerId), false);
  assert.equal(await policy.evaluate(h.first.room.roomId), false);
  assert.equal((await r.persistence.findById(h.first.room.roomId))!.hostPlayerId, host.playerId);
});

test("DRAW no eligible successor preserves Reveal; reconnect before grace preserves Host", async t => {
  const h = await harness(t), view = await h.relay(), r = h.server.runtime, policy = r.drawRelayHostSuccession!, now = r.clock.now();
  for (const b of r.connectionRegistry.listActiveBindings(view.room.roomId)) {
    r.connectionRegistry.disconnect(b.socketId, b.connectionGeneration); policy.disconnected(view.room.roomId, b.playerId, now);
  }
  const before = await r.persistence.findById(view.room.roomId);
  t.mock.method(r.clock, "now", () => parse(ServerTimeSchema, now + 60_000));
  assert.equal(await policy.evaluate(view.room.roomId), false); assert.deepEqual(await r.persistence.findById(view.room.roomId), before);
  // The old primary is re-established before the queued policy commit; the lease must fail closed.
  const fresh = await h.connect(), host = h.members[0]!;
  h.success(await h.call(fresh, "session:resume", { credential: { ...host.credential, roomCode: view.room.roomCode }, lastSeenVersions: null }));
  assert.equal(await policy.evaluate(view.room.roomId), false);
  assert.equal((await r.persistence.findById(view.room.roomId))!.hostPlayerId, host.playerId);
});

test("DRAW Reveal Host resumes at 59s: stale 60s callback cannot transfer or alter pages", async t => {
  const h = await harness(t), view = await h.relay(), r = h.server.runtime, host = h.members[0]!, policy = r.drawRelayHostSuccession!;
  const binding = r.connectionRegistry.listActiveBindings(view.room.roomId).find(b => b.playerId === host.playerId)!;
  r.connectionRegistry.disconnect(binding.socketId, binding.connectionGeneration);
  const now = r.clock.now(); policy.disconnected(view.room.roomId, host.playerId, now);
  const before = await r.persistence.findById(view.room.roomId);
  t.mock.method(r.clock, "now", () => parse(ServerTimeSchema, now + 59_000));
  const fresh = await h.connect();
  h.success(await h.call(fresh, "session:resume", { credential: { ...host.credential, roomCode: view.room.roomCode }, lastSeenVersions: null }));
  t.mock.method(r.clock, "now", () => parse(ServerTimeSchema, now + 60_000));
  assert.equal(await policy.evaluate(view.room.roomId), false);
  const after = await r.persistence.findById(view.room.roomId);
  assert.equal(after!.hostPlayerId, host.playerId); assert.deepEqual(after!.game, before!.game);
});

test("DRAW Finished offline Host succession enables same-room rematch without changing recap", async t => {
  const h = await harness(t), r = h.server.runtime, host = h.members[0]!;
  let view = await h.relay();
  for (;;) {
    const next = h.success(await h.call(host.client, "draw:revealNext", {}, { gameId: view.game.gameId, stageToken: view.game.stageToken, expectedGameRevision: view.game.gameRevision }));
    if (next.room.phase === "FINISHED") break;
    view = parse(DrawRelayPlayingPlatformSnapshotV2Schema, next);
  }
  const before = await r.persistence.findById(view.room.roomId);
  const binding = r.connectionRegistry.listActiveBindings(view.room.roomId).find(b => b.playerId === host.playerId)!;
  r.connectionRegistry.disconnect(binding.socketId, binding.connectionGeneration);
  const now = r.clock.now(); r.drawRelayHostSuccession!.disconnected(view.room.roomId, host.playerId, now);
  t.mock.method(r.clock, "now", () => parse(ServerTimeSchema, now + 60_000));
  assert.equal(await r.drawRelayHostSuccession!.evaluate(view.room.roomId), true);
  assert.deepEqual((await r.persistence.findById(view.room.roomId))!.game, before!.game);
  const successor = h.members[1]!, finished = parse(DrawRelayFinishedPlatformSnapshotV2Schema, await h.sync(successor.client));
  const command = h.request("draw:rematch", {}, { gameId: finished.game.gameId, stageToken: finished.game.stageToken,
    expectedGameRevision: finished.game.gameRevision, expectedRoomRevision: finished.versions.roomRevision });
  const lobby = parse(LobbyPlatformSnapshotV2Schema, h.success(await h.send(successor.client, command)));
  assert.equal(lobby.room.roomCode, view.room.roomCode); assert.equal(lobby.room.players.length, 3);
  assert.equal(lobby.room.players.find(p => p.isHost)?.playerId, successor.playerId);
  h.success(await h.send(successor.client, command));
  assert.equal((await r.persistence.findById(view.room.roomId))!.roomRevision, lobby.versions.roomRevision);
});

test("DRAW private draft reconnect, replay and concurrent submission barrier exact once", async t => {
  const h = await harness(t), host = h.members[0]!, game = h.first.game;
  const drawing = { strokes: [{ strokeId: "private-stroke", tool: "PEN", color: "#202838", width: 4, points: [{ x: 30, y: 40 }] }] };
  const save = h.request("draw:draftSave", { drawing, expectedDraftRevision: 0 }, { gameId: game.gameId, stageToken: game.stageToken });
  h.success(await h.send(host.client, save)); h.success(await h.send(host.client, save));
  const fresh = await h.connect();
  const own = parse(DrawRelayPlayingPlatformSnapshotV2Schema, h.success(await h.call(fresh, "session:resume", { credential: { ...host.credential, roomCode: h.first.room.roomCode }, lastSeenVersions: null })));
  assert.equal(own.game.phase, "DRAW"); assert.ok("privateState" in own.game && own.game.privateState);
  assert.deepEqual(own.game.privateState.draft, drawing); assert.equal(own.game.privateState.draftRevision, 1);
  assert.ok(!JSON.stringify(await h.sync(h.members[1]!.client)).includes("private-stroke"));
  host.client = fresh;
  const commands = h.members.map(() => h.request("draw:submitDrawing", { drawing: { strokes: [] } }, { gameId: game.gameId, stageToken: game.stageToken }));
  await Promise.all(h.members.map(async (m, i) => h.success(await h.send(m.client, commands[i]!))));
  h.success(await h.send(fresh, commands[0]!));
  const stored = await h.server.runtime.persistence.findById(h.first.room.roomId); assert.ok(stored?.gameType === "DRAW_RELAY" && stored.game);
  assert.equal(stored.game.state.stageIndex, 2); assert.equal(stored.game.gameRevision, 4);
  assert.ok(stored.game.state.books.every(b => b.pages.length === 1)); assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
});

test("DRAW Host commit race: resume invalidates offline generation before atomic commit", async t => {
  const h = await harness(t), view = await h.relay(), r = h.server.runtime, policy = r.drawRelayHostSuccession!, host = h.members[0]!;
  const binding = r.connectionRegistry.listActiveBindings(view.room.roomId).find(b => b.playerId === host.playerId)!;
  r.connectionRegistry.disconnect(binding.socketId, binding.connectionGeneration);
  const now = r.clock.now(); policy.disconnected(view.room.roomId, host.playerId, now);
  t.mock.method(r.clock, "now", () => parse(ServerTimeSchema, now + 60_000));
  const before = await r.persistence.findById(view.room.roomId);
  const commit = r.persistence.commit.bind(r.persistence);
  t.mock.method(r.persistence, "commit", async (...args: Parameters<typeof commit>) => {
    // Pause point after candidate/lease selection, before the real UoW guard.
    // Resume synchronously invalidates the generation even when room-lane work is queued.
    policy.resumed(view.room.roomId, host.playerId);
    return commit(...args);
  });
  assert.equal(await policy.evaluate(view.room.roomId), false);
  assert.deepEqual(await r.persistence.findById(view.room.roomId), before);
  assert.equal(await policy.evaluate(view.room.roomId), false);
});

test("DRAW explicit leave retains routes, defaults future pages, excludes rematch and rejects stale resume", async t => {
  const h = await harness(t), host = h.members[0]!, departed = h.members[1]!, r = h.server.runtime;
  const ack = parse(RoomLeaveAckSchema, await h.call(departed.client, "room:leave", {}, {
    expectedRoomRevision: h.first.versions.roomRevision, expectedGameRevision: h.first.game.gameRevision }));
  assert.ok(ack.ok);
  let view = parse(DrawRelayPlayingPlatformSnapshotV2Schema, await h.sync(host.client));
  while (view.game.phase !== "REVEAL") {
    for (const member of h.members.filter(m => m !== departed)) {
      const own = parse(DrawRelayPlayingPlatformSnapshotV2Schema, await h.sync(member.client));
      h.success(await h.call(member.client, own.game.phase === "DRAW" ? "draw:submitDrawing" : "draw:submitGuess",
        own.game.phase === "DRAW" ? { drawing: { strokes: [] } } : { text: "함께 그린 그림" }, { gameId: own.game.gameId, stageToken: own.game.stageToken }));
    }
    view = parse(DrawRelayPlayingPlatformSnapshotV2Schema, await h.sync(host.client));
  }
  const stored = await r.persistence.findById(view.room.roomId); assert.ok(stored?.gameType === "DRAW_RELAY" && stored.game);
  assert.equal(stored.game.state.books.length, 3);
  assert.ok(stored.game.state.books.flatMap(b => b.pages).filter(p => p.authorPlayerId === departed.playerId).every(p => p.timedOut));
  for (;;) {
    const next = h.success(await h.call(host.client, "draw:revealNext", {}, { gameId: view.game.gameId, stageToken: view.game.stageToken, expectedGameRevision: view.game.gameRevision }));
    if (next.room.phase === "FINISHED") {
      const finished = parse(DrawRelayFinishedPlatformSnapshotV2Schema, next);
      const lobby = parse(LobbyPlatformSnapshotV2Schema, h.success(await h.call(host.client, "draw:rematch", {}, {
        gameId: finished.game.gameId, stageToken: finished.game.stageToken, expectedGameRevision: finished.game.gameRevision, expectedRoomRevision: finished.versions.roomRevision })));
      assert.equal(lobby.room.players.length, 2); assert.ok(lobby.room.players.every(p => p.playerId !== departed.playerId));
      break;
    }
    view = parse(DrawRelayPlayingPlatformSnapshotV2Schema, next);
  }
  const stale = parse(StateSyncWireAckSchema, await h.call(await h.connect(), "session:resume", { credential: { ...departed.credential, roomCode: view.room.roomCode }, lastSeenVersions: null }));
  assert.equal(stale.ok, false);
});

test("DRAW timeout ignores saved draft, rejects late submit and applies duplicate callback only once", async t => {
  const h = await harness(t), r = h.server.runtime, game = h.first.game, host = h.members[0]!;
  assert.ok("deadlineAt" in game);
  const drawing = { strokes: [{ strokeId: "not-submitted", tool: "PEN", color: "#202838", width: 4, points: [{ x: 1, y: 1 }] }] };
  h.success(await h.call(host.client, "draw:draftSave", { drawing, expectedDraftRevision: 0 }, { gameId: game.gameId, stageToken: game.stageToken }));
  t.mock.method(r.clock, "now", () => game.deadlineAt);
  const deadline = { roomId: h.first.room.roomId, gameId: game.gameId, expectedGameRevision: game.gameRevision, turnId: parse(TurnIdSchema, game.stageToken), deadlineAt: game.deadlineAt };
  const results = await Promise.all([r.drawRelayService!.timeout(deadline), r.drawRelayService!.timeout(deadline),
    h.call(host.client, "draw:submitDrawing", { drawing }, { gameId: game.gameId, stageToken: game.stageToken })]);
  assert.deepEqual(results.slice(0, 2), [{ status: "APPLIED" }, { status: "NO_OP" }]);
  assert.equal(parse(StateSyncWireAckSchema, results[2]).ok, false);
  const stored = await r.persistence.findById(h.first.room.roomId); assert.ok(stored?.gameType === "DRAW_RELAY" && stored.game);
  assert.equal(stored.game.gameRevision, 2); assert.equal(stored.game.state.stageIndex, 2);
  assert.ok(stored.game.state.books.every(b => b.pages.length === 1 && b.pages[0]!.kind === "DRAWING" && b.pages[0]!.drawing.strokes.length === 0));
  assert.equal(r.turnScheduler.scheduledCount, 1);
});
