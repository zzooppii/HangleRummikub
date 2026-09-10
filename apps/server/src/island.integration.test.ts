import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import { IslandLobbyPlatformSnapshotV2Schema, IslandPlayingPlatformSnapshotV2Schema, IslandFinishedPlatformSnapshotV2Schema, SessionBootstrapAckSchema, StateSyncWireAckSchema, RoomLeaveAckSchema, ServerTimeSchema, ISLAND_RESOURCES, emptyIslandResources, type IslandAction } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
import { islandRandom } from "./games/island/domain/game.js";
type Client = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
async function harness(t: TestContext, count = 3, start = true) {
  const server = createHttpServer({ serveWeb: false }), clients: Client[] = [];
  t.after(async () => { clients.forEach(c => c.disconnect()); await server.shutdown(); });
  await new Promise<void>(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const address = server.httpServer.address(); assert.ok(address && typeof address !== "string"); const port = address.port;
  let seq = 0, now = server.runtime.clock.now();
  t.mock.method(server.runtime.clock, "now", () => now);
  t.mock.method(server.runtime.islandService!.deps.random, "nextInt", islandRandom(133));
  async function connect(types = ["ISLAND_SETTLERS"]) {
    const c: Client = io("http://127.0.0.1:" + port, { transports: ["websocket"], forceNew: true, reconnection: false, auth: { supportedSnapshotVersions: [2], supportedGameTypes: types } });
    clients.push(c); await new Promise<void>((r, j) => { c.once("connect", r); c.once("connect_error", j); }); return c;
  }
  const request = (kind: string, payload: unknown = {}, extra: Record<string, unknown> = {}) => ({ kind, protocolVersion: 1, requestId: "island-request-" + ++seq, payload, ...extra });
  const send = (c: Client, command: ReturnType<typeof request>) => new Promise<unknown>((r, j) => { const timer = setTimeout(() => j(new Error("Missing " + command.kind + " ACK")), 6000); c.emit(command.kind, command, result => { clearTimeout(timer); r(result); }); });
  const call = (c: Client, kind: string, payload: unknown = {}, extra: Record<string, unknown> = {}) => send(c, request(kind, payload, extra));
  const success = (input: unknown) => { const a = parse(StateSyncWireAckSchema, input); assert.ok(a.ok, a.ok ? "" : a.error.code); return a.data.snapshot; };
  const failure = (input: unknown) => { const a = parse(StateSyncWireAckSchema, input); assert.equal(a.ok, false); if (a.ok) throw new Error("Expected failure"); return a.error.code; };
  async function bootstrap(c: Client) { const a = parse(SessionBootstrapAckSchema, await call(c, "session:bootstrap")); assert.ok(a.ok); return a.data.credential; }
  const host = await connect(), credential = await bootstrap(host);
  let lobby = parse(IslandLobbyPlatformSnapshotV2Schema, success(await call(host, "room:create", { bootstrapCredential: credential, nickname: "개척자1", gameType: "ISLAND_SETTLERS" })));
  const members = [{ client: host, playerId: lobby.self.playerId, credential }];
  for (let i = 1; i < count; i++) {
    const c = await connect(), credential = await bootstrap(c);
    lobby = parse(IslandLobbyPlatformSnapshotV2Schema, success(await call(c, "room:join", { bootstrapCredential: credential, nickname: "개척자" + (i + 1), roomCode: lobby.room.roomCode })));
    members.push({ client: c, playerId: lobby.self.playerId, credential });
  }
  if (start) success(await call(host, "game:start", {}, { expectedRoomRevision: lobby.versions.roomRevision }));
  const sync = async (c = host) => success(await call(c, "state:sync"));
  async function stored() { const room = await server.runtime.persistence.findById(lobby.room.roomId); assert.ok(room?.gameType === "ISLAND_SETTLERS" && room.game); return room; }
  async function command(c: Client, payload: IslandAction) { const s = parse(IslandPlayingPlatformSnapshotV2Schema, await sync(c)); return request("island:act", payload, { gameId: s.game.gameId, expectedGameRevision: s.game.gameRevision, turnId: s.game.turnId }); }
  async function act(c: Client, payload: IslandAction) { return success(await send(c, await command(c, payload))); }
  function time(at: number) { now = parse(ServerTimeSchema, at); }
  async function advance() {
    const room = await stored(), game = room.game!, s = game.state; time(s.deadlineAt);
    const deadline = { roomId: room.roomId, gameId: game.gameId, expectedGameRevision: game.gameRevision, turnId: s.turnId, deadlineAt: s.deadlineAt };
    assert.equal((await server.runtime.islandService!.timeout(deadline)).status, "APPLIED");
    assert.equal((await server.runtime.islandService!.timeout(deadline)).status, "NO_OP"); return deadline;
  }
  async function completeSetup() {
    for (let i = 0; i < count * 4; i++) {
      const s = parse(IslandPlayingPlatformSnapshotV2Schema, await sync()), member = members.find(p => p.playerId === s.game.activePlayerId)!;
      const own = parse(IslandPlayingPlatformSnapshotV2Schema, await sync(member.client));
      assert.ok(own.game.stage.kind === "SETUP_SETTLEMENT" || own.game.stage.kind === "SETUP_ROAD");
      await act(member.client, own.game.stage.kind === "SETUP_SETTLEMENT" ? { type: "BUILD_SETTLEMENT", vertex: own.game.legalActions.settlementVertices[0]! } : { type: "BUILD_ROAD", edge: own.game.legalActions.roadEdges[0]! });
    }
  }
  async function toAction() {
    const first = parse(IslandPlayingPlatformSnapshotV2Schema, await sync()), m = members.find(m => m.playerId === first.game.activePlayerId)!;
    let current = parse(IslandPlayingPlatformSnapshotV2Schema, await sync(m.client));
    if (current.game.stage.kind === "ROLL") current = parse(IslandPlayingPlatformSnapshotV2Schema, await act(m.client, { type: "ROLL" }));
    if (current.game.stage.kind === "ROBBER_HEX") current = parse(IslandPlayingPlatformSnapshotV2Schema, await act(m.client, { type: "MOVE_ROBBER", hex: current.game.legalActions.robberHexes[0]! }));
    if (current.game.stage.kind === "ROBBER_VICTIM") current = parse(IslandPlayingPlatformSnapshotV2Schema, await act(m.client, { type: "STEAL", playerId: current.game.stage.candidates[0]! }));
    assert.equal(current.game.stage.kind, "ACTION"); return { member: m, snapshot: current };
  }
  return { server, members, lobby, connect, bootstrap, request, send, call, success, failure, sync, stored, command, act, advance, time, completeSetup, toAction };
}
for (const count of [3, 4]) test("ISLAND Socket.IO " + count + " players: start, legal setup, projection isolation and exactly one timer", async t => {
  const h = await harness(t, count), room = await h.stored(), state = room.game!.state;
  assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
  for (const member of h.members) {
    const wire = parse(IslandPlayingPlatformSnapshotV2Schema, await h.sync(member.client));
    assert.equal(wire.game.privateState.playerId, member.playerId);
    assert.equal(wire.game.legalActions.settlementVertices.length > 0, wire.game.activePlayerId === member.playerId);
    assert.ok(state.deck.every(c => !JSON.stringify(wire).includes(JSON.stringify(c.id))));
    assert.ok(!JSON.stringify(wire).includes(member.credential.sessionToken));
  }
  await h.completeSetup(); const { snapshot } = await h.toAction();
  const canonical = (await h.stored()).game!.state;
  for (const member of h.members) {
    const wire = parse(IslandPlayingPlatformSnapshotV2Schema, await h.sync(member.client));
    for (const p of canonical.players) assert.deepEqual(wire.game.playerStates.find(publicPlayer => publicPlayer.playerId === p.playerId)!.resources, p.resources);
  }
  assert.equal(snapshot.game.buildings.length, count * 2); assert.equal(snapshot.game.roads.length, count * 2);
  assert.equal(snapshot.game.turnNumber, 1); assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
  await h.advance(); assert.equal((await h.stored()).game!.state.turnNumber, 2);
});
test("ISLAND rejects two-player starts, fifth join, nonhost, stale room revision and wrong capability", async t => {
  const two = await harness(t, 2, false);
  assert.equal(two.failure(await two.call(two.members[0]!.client, "game:start", {}, { expectedRoomRevision: two.lobby.versions.roomRevision })), "NOT_ENOUGH_PLAYERS");
  const h = await harness(t, 4, false), c = await h.connect(), credential = await h.bootstrap(c);
  assert.equal(h.failure(await h.call(c, "room:join", { bootstrapCredential: credential, nickname: "다섯", roomCode: h.lobby.room.roomCode })), "ROOM_FULL");
  assert.equal(h.failure(await h.call(h.members[1]!.client, "game:start", {}, { expectedRoomRevision: h.lobby.versions.roomRevision })), "HOST_ONLY");
  assert.equal(h.failure(await h.call(h.members[0]!.client, "game:start", {}, { expectedRoomRevision: 999 })), "STALE_ROOM_REVISION");
  const old = await h.connect(["HALLI_GALLI"]), oldCredential = await h.bootstrap(old);
  assert.equal(h.failure(await h.call(old, "room:join", { bootstrapCredential: oldCredential, nickname: "예전앱", roomCode: h.lobby.room.roomCode })), "INCOMPATIBLE_GAME_CAPABILITY");
});
test("ISLAND setup commit is atomic and idempotent; wrong actor and forged payload cannot mutate", async t => {
  const h = await harness(t), current = parse(IslandPlayingPlatformSnapshotV2Schema, await h.sync()), actor = h.members.find(m => m.playerId === current.game.activePlayerId)!, other = h.members.find(m => m.playerId !== actor.playerId)!;
  const own = parse(IslandPlayingPlatformSnapshotV2Schema, await h.sync(actor.client)), request = await h.command(actor.client, { type: "BUILD_SETTLEMENT", vertex: own.game.legalActions.settlementVertices[0]! });
  const before = (await h.stored()).game!;
  assert.equal(h.failure(await h.send(other.client, { ...request, requestId: "wrong-actor" })), "NOT_YOUR_TURN");
  assert.equal(h.failure(await h.send(actor.client, { ...request, requestId: "forged", payload: { type: "BUILD_SETTLEMENT", vertex: 0, cost: 0 } })), "INVALID_PAYLOAD");
  assert.deepEqual((await h.stored()).game, before);
  const first = h.success(await h.send(actor.client, request)); h.success(await h.send(actor.client, request));
  assert.equal((await h.stored()).game!.gameRevision, before.gameRevision + 1); assert.equal(parse(IslandPlayingPlatformSnapshotV2Schema, first).game.buildings.length, 1);
  assert.equal(h.failure(await h.send(actor.client, { ...request, payload: { type: "ROLL" } })), "REQUEST_ID_REUSED");
  assert.equal(h.failure(await h.send(actor.client, { ...request, requestId: "new-stale" })), "STALE_GAME_REVISION");
});
test("ISLAND reconnect restores board/resources/deadline, replaces old primary and rejects late input", async t => {
  const h = await harness(t); await h.completeSetup(); const { member, snapshot } = await h.toAction();
  const before = (await h.stored()).game!, command = await h.command(member.client, { type: "END_TURN" }), replacement = await h.connect();
  const resumed = parse(IslandPlayingPlatformSnapshotV2Schema, h.success(await h.call(replacement, "session:resume", { credential: { ...member.credential, roomCode: h.lobby.room.roomCode }, lastSeenVersions: null })));
  assert.deepEqual(resumed.game.privateState, snapshot.game.privateState); assert.equal(resumed.game.deadlineAt, snapshot.game.deadlineAt); assert.deepEqual((await h.stored()).game, before);
  assert.equal(h.failure(await h.send(member.client, command)), "UNAUTHENTICATED");
  h.time(snapshot.game.deadlineAt); assert.equal(h.failure(await h.send(replacement, command)), "STALE_GAME_REVISION");
  assert.equal(await h.server.runtime.overdueTurnSweeper.sweepOnce(), 1); assert.equal((await h.stored()).game!.state.turnNumber, 2);
});
test("ISLAND concurrent trade responses refresh safely, final double confirmation exchanges resources once", async t => {
  const h = await harness(t); await h.completeSetup(); const { member } = await h.toAction();
  const before = (await h.stored()).game!.state, actor = before.players.find(p => p.playerId === member.playerId)!;
  let pair: { otherId: typeof actor.playerId; give: typeof ISLAND_RESOURCES[number]; receive: typeof ISLAND_RESOURCES[number] } | null = null;
  for (const other of before.players.filter(p => p.playerId !== actor.playerId)) for (const give of ISLAND_RESOURCES) for (const receive of ISLAND_RESOURCES) if (give !== receive && actor.resources[give] > 0 && other.resources[receive] > 0) pair = { otherId: other.playerId, give, receive };
  assert.ok(pair, "Starting resources must provide a legal trade fixture.");
  const other = h.members.find(m => m.playerId === pair.otherId)!, third = h.members.find(m => m.playerId !== member.playerId && m.playerId !== other.playerId)!;
  await h.act(member.client, { type: "OFFER_TRADE", give: { ...emptyIslandResources(), [pair.give]: 1 }, receive: { ...emptyIslandResources(), [pair.receive]: 1 } });
  const offered = (await h.stored()).game!.state.trade!, yes = await h.command(other.client, { type: "RESPOND_TRADE", tradeId: offered.id, accepted: true }), no = await h.command(third.client, { type: "RESPOND_TRADE", tradeId: offered.id, accepted: false });
  const responses = await Promise.all([h.send(other.client, yes), h.send(third.client, no)]);
  assert.equal(responses.map(r => parse(StateSyncWireAckSchema, r)).filter(r => r.ok).length, 1);
  if (!parse(StateSyncWireAckSchema, responses[0]).ok) await h.act(other.client, { type: "RESPOND_TRADE", tradeId: offered.id, accepted: true });
  if (!parse(StateSyncWireAckSchema, responses[1]).ok) await h.act(third.client, { type: "RESPOND_TRADE", tradeId: offered.id, accepted: false });
  const ready = (await h.stored()).game!.state; assert.equal(ready.trade!.responses.length, 2);
  const confirm = await h.command(member.client, { type: "CONFIRM_TRADE", tradeId: offered.id, playerId: other.playerId });
  const acks = await Promise.all([h.send(member.client, confirm), h.send(member.client, { ...confirm, requestId: "second-confirm" })]);
  assert.equal(acks.map(a => parse(StateSyncWireAckSchema, a)).filter(a => a.ok).length, 1);
  const after = (await h.stored()).game!.state; assert.equal(after.trade, null);
  assert.equal(after.players.find(p => p.playerId === member.playerId)!.resources[pair.give], actor.resources[pair.give] - 1);
  h.success(await h.send(member.client, confirm)); assert.deepEqual((await h.stored()).game!.state, after);
});
test("ISLAND leave cancellation, host rematch, new identity and old timeout isolation", async t => {
  const h = await harness(t, 4), old = (await h.stored()).game!, oldTimer = { roomId: h.lobby.room.roomId, gameId: old.gameId, expectedGameRevision: old.gameRevision, turnId: old.state.turnId, deadlineAt: old.state.deadlineAt };
  const room = await h.stored(), leave = parse(RoomLeaveAckSchema, await h.call(h.members[3]!.client, "room:leave", {}, { expectedRoomRevision: room.roomRevision, expectedGameRevision: room.game!.gameRevision })); assert.ok(leave.ok);
  const end = parse(IslandFinishedPlatformSnapshotV2Schema, await h.sync()); assert.equal(end.game.result.reason, "CANCELLED"); assert.equal(h.server.runtime.turnScheduler.scheduledCount, 0);
  const extra = { gameId: end.game.gameId, expectedGameRevision: end.game.gameRevision, expectedRoomRevision: end.versions.roomRevision };
  assert.equal(h.failure(await h.call(h.members[1]!.client, "island:rematch", {}, extra)), "HOST_ONLY");
  const lobby = parse(IslandLobbyPlatformSnapshotV2Schema, h.success(await h.call(h.members[0]!.client, "island:rematch", {}, extra))); assert.equal(lobby.room.players.length, 3);
  const next = parse(IslandPlayingPlatformSnapshotV2Schema, h.success(await h.call(h.members[0]!.client, "game:start", {}, { expectedRoomRevision: lobby.versions.roomRevision })));
  assert.notEqual(next.game.gameId, old.gameId); h.time(oldTimer.deadlineAt);
  assert.equal((await h.server.runtime.islandService!.timeout(oldTimer)).status, "NO_OP");
  assert.equal(h.failure(await h.call(h.members[0]!.client, "island:act", { type: "ROLL" }, { gameId: old.gameId, expectedGameRevision: old.gameRevision, turnId: old.state.turnId })), "STALE_GAME_REVISION");
});
test("ISLAND scheduler failure preserves start and is recovered by the overdue sweeper", async t => {
  const h = await harness(t, 3, false), runtime = h.server.runtime;
  const diagnostic = t.mock.method(console, "error", () => undefined);
  const schedule = t.mock.method(runtime.turnScheduler, "scheduleTimeout", async () => { throw new Error("test schedule failure"); });
  h.success(await h.call(h.members[0]!.client, "game:start", {}, { expectedRoomRevision: h.lobby.versions.roomRevision }));
  assert.equal(diagnostic.mock.callCount(), 1); schedule.mock.restore();
  const before = (await h.stored()).game!; h.time(before.state.deadlineAt);
  assert.equal(await runtime.overdueTurnSweeper.sweepOnce(), 1); assert.equal((await h.stored()).game!.state.setupStep, 1); assert.equal(runtime.turnScheduler.scheduledCount, 1);
});
