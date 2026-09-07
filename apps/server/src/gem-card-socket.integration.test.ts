import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import { GemCardPlayingPlatformSnapshotV2Schema, GemCardFinishedPlatformSnapshotV2Schema, LobbyPlatformSnapshotV2Schema, SessionBootstrapAckSchema, StateSnapshotWireEventSchema, StateSyncWireAckSchema, RoomLeaveAckSchema, type GemCardPlayingPlatformSnapshotV2, } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
// Deliberately unknown input/output at the raw network boundary; all responses
// are independently parsed using the production runtime schemas.
type RawClient = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
const gemAuth = { supportedSnapshotVersions: [2, 1], supportedGameTypes: ["GEM_CARD"] };
async function harness(t: TestContext) {
  const server = createHttpServer({ serveWeb: false });
  const clients: RawClient[] = [];
  t.after(async () => { clients.forEach(client => client.disconnect()); await server.shutdown(); });
  await new Promise<void>(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  let sequence = 0;
  async function connect(auth?: Record<string, unknown>) {
    const client = io(url, { ...(auth === undefined ? {} : { auth }), autoConnect: false, transports: ["websocket"], forceNew: true, reconnection: false }) as RawClient;
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("GEM socket connect timeout")), 5000);
      client.once("connect", () => { clearTimeout(timer); resolve(); });
      client.once("connect_error", error => { clearTimeout(timer); reject(error); });
      client.connect();
    });
    return client;
  }
  function command(kind: string, payload: unknown, extra: Record<string, unknown> = {}) {
    return { kind, protocolVersion: 1, requestId: `gem-raw-${++sequence}`, payload, ...extra };
  }
  async function send(client: RawClient, request: ReturnType<typeof command>) {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No acknowledgement for ${request.kind}`)), 5000);
      client.emit(request.kind, request, value => { clearTimeout(timer); resolve(value); });
    });
  }
  const call = (client: RawClient, kind: string, payload: unknown, extra?: Record<string, unknown>) => send(client, command(kind, payload, extra));
  async function bootstrap(client: RawClient) {
    const ack = parse(SessionBootstrapAckSchema, await call(client, "session:bootstrap", {}));
    assert.equal(ack.ok, true);
    if (!ack.ok)
      throw new Error("bootstrap failed");
    return ack.data.credential;
  }
  function success(value: unknown) {
    const ack = parse(StateSyncWireAckSchema, value);
    assert.equal(ack.ok, true);
    if (!ack.ok)
      throw new Error("Rejected command");
    return ack.data.snapshot;
  }
  const sync = async (client: RawClient) => success(await call(client, "state:sync", {}));
  const playing = (value: unknown) => parse(GemCardPlayingPlatformSnapshotV2Schema, value);
  function failure(value: unknown, code?: string) {
    const ack = parse(StateSyncWireAckSchema, value);
    assert.equal(ack.ok, false);
    if (ack.ok)
      throw new Error("Expected rejection");
    if (code)
      assert.equal(ack.error.code, code);
  }
  async function pair() {
    const a = await connect(gemAuth), b = await connect(gemAuth);
    const ca = await bootstrap(a), cb = await bootstrap(b);
    const created = parse(LobbyPlatformSnapshotV2Schema, success(await call(a, "room:create", { bootstrapCredential: ca, nickname: "GemA", gameType: "GEM_CARD" })));
    const joined = parse(LobbyPlatformSnapshotV2Schema, success(await call(b, "room:join", { bootstrapCredential: cb, nickname: "GemB", roomCode: created.room.roomCode })));
    return { a, b, ca, cb, created, joined };
  }
  const identity = (snapshot: GemCardPlayingPlatformSnapshotV2) => ({ expectedGameRevision: snapshot.game.gameRevision, turnId: snapshot.game.turn.turnId });
  return { server, url, connect, bootstrap, call, command, send, success, failure, sync, playing, pair, identity };
}
test("raw GEM V2 create/join/start/collect/reserve/resume/leave: public state, snapshot ordering, no legacy advisory", async (t) => {
  const h = await harness(t), p = await h.pair();
  const events: string[] = [];
  for (const client of [p.a, p.b]) {
    client.on("state:snapshot", event => { parse(StateSnapshotWireEventSchema, event); events.push("snapshot"); });
    client.on("turn:started", () => events.push("legacy-turn"));
    client.on("game:finished", () => events.push("legacy-finish"));
  }
  const started = h.playing(h.success(await h.call(p.a, "game:start", {}, { expectedRoomRevision: p.joined.versions.roomRevision })));
  assert.equal(started.snapshotVersion, 2);
  assert.equal(started.room.gameType, "GEM_CARD");
  assert.equal(started.game.gameRevision, 0);
  assert.equal(started.room.players.length, 2);
  assert.equal(started.game.turn.deadlineAt - started.game.turn.startedAt, 45000);
  assert.ok(started.game.market.every(tier => tier.slots.every(Boolean) && tier.remainingDeckCount === 12));
  assert.deepEqual(started.game.supply, { DAWN: 7, TIDE: 7, GROVE: 7, EMBER: 7, ECHO: 7, PRISM: 5 });
  assert.equal("privateState" in started.game, false);
  const actor = started.game.turn.activePlayerId === p.created.self.playerId ? p.a : p.b;
  const collect = h.command("gem:collect", { selection: { kind: "BASIC", resources: ["DAWN", "TIDE"] } }, h.identity(started));
  const collected = h.playing(h.success(await h.send(actor, collect)));
  events.push("collect-ack");
  assert.ok(events.indexOf("snapshot") < events.indexOf("collect-ack"));
  assert.equal(collected.game.gameRevision, 1);
  assert.equal(collected.game.supply.DAWN, 6);
  const storage = await h.server.runtime.persistence.findById(started.room.roomId);
  h.success(await h.send(actor, collect));
  assert.deepEqual(await h.server.runtime.persistence.findById(started.room.roomId), storage);
  const next = actor === p.a ? p.b : p.a;
  const reserved = h.playing(h.success(await h.call(next, "gem:reserve", { source: { tier: 1, slotIndex: 0 } }, h.identity(collected))));
  assert.equal(reserved.game.gameRevision, 2);
  assert.deepEqual(reserved.game.supply, collected.game.supply);
  assert.equal(reserved.game.market[0]!.remainingDeckCount, 11);
  assert.equal(reserved.game.playerStates.reduce((n, player) => n + player.reservedCards.length, 0), 1);
  const aView = h.playing(await h.sync(p.a)), bView = h.playing(await h.sync(p.b));
  assert.deepEqual(aView.game, bView.game);
  const persisted = await h.server.runtime.persistence.findById(started.room.roomId);
  assert.equal(persisted?.gameType, "GEM_CARD");
  assert.ok(persisted.game);
  const json = JSON.stringify(aView);
  for (const tier of persisted.game.market)
    for (const id of tier.deck)
      assert.equal(json.includes(id), false);
  for (const key of ["privateState", "rack", "storageRevision", "offlineTimeoutStreak", "noProgressPlayerIds", "sessionToken", "pendingFairRound", "deck"])
    assert.equal(json.includes(`"${key}"`), false);
  const resumedClient = await h.connect(gemAuth);
  const resumed = h.playing(h.success(await h.call(resumedClient, "session:resume", { credential: { ...p.cb, roomCode: p.created.room.roomCode }, lastSeenVersions: null })));
  assert.equal(resumed.self.playerId, p.joined.self.playerId);
  assert.equal(resumed.room.players.length, 2);
  assert.deepEqual(resumed.game, bView.game);
  h.failure(await h.call(p.b, "gem:yield", {}, h.identity(resumed)));
  // Earn the exact printed basic costs through public commands, then purchase
  // the public market card. No seed/debug mutation or client payment plan.
  let purchased = false;
  for (let i = 0; i < 12 && !purchased; i++) {
    const view = h.playing(await h.sync(p.a));
    const client = view.game.turn.activePlayerId === p.created.self.playerId ? p.a : resumedClient;
    const player = view.game.playerStates.find(player => player.playerId === view.game.turn.activePlayerId)!;
    const card = view.game.market[0]!.slots[0]!;
    const needed = (["DAWN", "TIDE", "GROVE", "EMBER", "ECHO"] as const).filter(resource => card.cost[resource] > player.resources[resource] + player.production[resource]);
    if (needed.length === 0) {
      const nextView = h.playing(h.success(await h.call(client, "gem:purchase", { source: { kind: "MARKET", tier: 1, slotIndex: 0 } }, h.identity(view))));
      assert.ok(nextView.game.playerStates.find(p => p.playerId === player.playerId)!.purchasedCards.some(c => c.cardId === card.cardId));
      assert.equal(nextView.game.market[0]!.remainingDeckCount, view.game.market[0]!.remainingDeckCount - 1);
      purchased = true;
    }
    else {
      h.success(await h.call(client, "gem:collect", { selection: { kind: "BASIC", resources: needed.slice(0, 2) } }, h.identity(view)));
    }
  }
  assert.equal(purchased, true);
  const beforeLeave = await h.sync(resumedClient);
  assert.ok("snapshotVersion" in beforeLeave);
  assert.ok(beforeLeave.game);
  const leave = parse(RoomLeaveAckSchema, await h.call(resumedClient, "room:leave", {}, { expectedRoomRevision: beforeLeave.versions.roomRevision, expectedGameRevision: beforeLeave.game.gameRevision }));
  assert.equal(leave.ok, true);
  const finished = parse(GemCardFinishedPlatformSnapshotV2Schema, await h.sync(p.a));
  assert.equal(finished.game.result.reason, "LAST_PLAYER_STANDING");
  assert.equal(finished.game.result.rankings.length, 2);
  assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).length, 0);
  assert.equal((await h.server.runtime.persistence.listActiveGameDeadlines()).length, 0);
  assert.equal((await h.server.runtime.persistence.listFinishedRoomRetentions()).length, 1);
  assert.equal(events.some(event => event.startsWith("legacy-")), false);
});
test("GEM admission rejects omitted, H/N-only and V1-only capabilities before create/join/resume mutation", async (t) => {
  const h = await harness(t), p = await h.pair();
  for (const auth of [undefined, { supportedSnapshotVersions: [2, 1], supportedGameTypes: ["HANGUL_TILE", "NUMBER_TILE"] }, { supportedSnapshotVersions: [1], supportedGameTypes: ["GEM_CARD"] }]) {
    const client = await h.connect(auth);
    const credential = await h.bootstrap(client);
    const before = await h.server.runtime.persistence.findById(p.created.room.roomId);
    h.failure(await h.call(client, "room:create", { bootstrapCredential: credential, nickname: "Wrong", gameType: "GEM_CARD" }), "INCOMPATIBLE_GAME_CAPABILITY");
    h.failure(await h.call(client, "room:join", { bootstrapCredential: credential, nickname: "Wrong", roomCode: p.created.room.roomCode }), "INCOMPATIBLE_GAME_CAPABILITY");
    h.failure(await h.call(client, "session:resume", { credential: { ...p.ca, roomCode: p.created.room.roomCode }, lastSeenVersions: null }), "INCOMPATIBLE_GAME_CAPABILITY");
    assert.deepEqual(await h.server.runtime.persistence.findById(p.created.room.roomId), before);
    h.failure(await h.call(client, "state:sync", {}));
    // Rejected GEM admission does not consume the bootstrap credential.
    const compatible = await h.connect(gemAuth);
    const joined = h.success(await h.call(compatible, "room:join", { bootstrapCredential: credential, nickname: "Eligible", roomCode: p.created.room.roomCode }));
    assert.equal(joined.room.players.length, 3);
    assert.ok("snapshotVersion" in joined);
    const left = parse(RoomLeaveAckSchema, await h.call(compatible, "room:leave", {}, { expectedRoomRevision: joined.versions.roomRevision, expectedGameRevision: null }));
    assert.equal(left.ok, true);
  }
});
test("raw three-game command isolation and strict GEM payload rejection leave revisions/storage unchanged", async (t) => {
  const h = await harness(t), p = await h.pair();
  const started = h.playing(h.success(await h.call(p.a, "game:start", {}, { expectedRoomRevision: p.joined.versions.roomRevision })));
  const active = started.game.turn.activePlayerId === p.created.self.playerId ? p.a : p.b;
  const before = await h.server.runtime.persistence.findById(started.room.roomId);
  for (const [kind, payload] of [["turn:draw", { bagKind: "CONSONANT" }], ["number:draw", {}], ["gem:collect", { selection: { kind: "BASIC", resources: ["DAWN", "DAWN"] } }], ["gem:collect", { selection: { kind: "PRISM", resources: ["DAWN"] } }], ["gem:purchase", { source: { kind: "MARKET", tier: 1, slotIndex: 0 }, payment: {} }], ["gem:yield", { extra: true }]] as const) {
    h.failure(await h.call(active, kind, payload, h.identity(started)));
    assert.deepEqual(await h.server.runtime.persistence.findById(started.room.roomId), before);
  }
  for (const gameType of ["HANGUL_TILE", "NUMBER_TILE"] as const) {
    const client = await h.connect({ supportedSnapshotVersions: [2, 1], supportedGameTypes: [gameType, "GEM_CARD"] });
    const credential = await h.bootstrap(client);
    const room = h.success(await h.call(client, "room:create", { bootstrapCredential: credential, nickname: gameType, gameType }));
    const original = await h.server.runtime.persistence.findById(room.room.roomId);
    for (const [kind, payload] of [["gem:collect", { selection: { kind: "PRISM" } }], ["gem:reserve", { source: { tier: 1, slotIndex: 0 } }], ["gem:purchase", { source: { kind: "MARKET", tier: 1, slotIndex: 0 } }], ["gem:yield", {}]] as const) {
      h.failure(await h.call(client, kind, payload, h.identity(started)));
      assert.deepEqual(await h.server.runtime.persistence.findById(room.room.roomId), original);
    }
  }
});
