import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import {
  CityActionWireAckSchema, CityRolePlayingPlatformSnapshotV2Schema, ClientCommandSchema,
  LobbyPlatformSnapshotV2Schema, PlayingPlatformSnapshotV2Schema, RequestIdSchema,
  SessionBootstrapAckSchema, SessionReplacedNotificationSchema, StateSnapshotWireEventSchema,
  StateSyncWireAckSchema, type CityRolePlayingPlatformSnapshotV2, type GameType,
  type PlayingPlatformSnapshotV2, type RoomId,
} from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
import { CryptoRandomSource } from "./infrastructure/system.js";

type RawClient = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
const AUTH = { supportedSnapshotVersions: [2, 1], supportedGameTypes: ["HANGUL_TILE", "NUMBER_TILE", "GEM_CARD", "CITY_ROLE"] };
const CITY_ACTIONS = [
  { kind: "city:selectRole", payload: { roleId: "CR-08" } },
  { kind: "city:takeIncome", payload: {} },
  { kind: "city:drawBuildingCards", payload: {} },
  { kind: "city:chooseBuildingCard", payload: { cardId: "opaque-unowned-probe" } },
  { kind: "city:useRoleAbility", payload: { ability: "MARK_ROLE_DISABLED", targetRoleId: "CR-08" } },
  { kind: "city:build", payload: { cardId: "opaque-unowned-probe" } },
  { kind: "city:endTurn", payload: {} },
] as const;
const HNG_ACTIONS = [
  { kind: "turn:submit", payload: { proposedBoard: { wordGroups: [] } } },
  { kind: "turn:draw", payload: { bagKind: "CONSONANT" } },
  { kind: "turn:pass", payload: {} },
  { kind: "number:submit", payload: { proposedTable: { melds: [] } } },
  { kind: "number:draw", payload: {} },
  { kind: "number:pass", payload: {} },
  { kind: "gem:collect", payload: { selection: { kind: "PRISM" } } },
  { kind: "gem:purchase", payload: { source: { kind: "MARKET", tier: 1, slotIndex: 0 } } },
  { kind: "gem:reserve", payload: { source: { tier: 1, slotIndex: 0 } } },
  { kind: "gem:yield", payload: {} },
] as const;

async function harness(t: TestContext) {
  const server = createHttpServer({ serveWeb: false }), clients: RawClient[] = [];
  t.after(async () => { clients.forEach(client => client.disconnect()); await server.shutdown(); });
  await new Promise<void>((resolve, reject) => { server.httpServer.once("error", reject); server.httpServer.listen(0, "127.0.0.1", resolve); });
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  const schedulerSpies = [
    t.mock.method(server.runtime.turnScheduler, "scheduleTimeout"),
    t.mock.method(server.runtime.turnScheduler, "cancelTimeout"),
    t.mock.method(server.runtime.turnScheduler, "cancelRoom"),
    t.mock.method(server.runtime.gameDeadlineScheduler, "scheduleDeadline"),
    t.mock.method(server.runtime.gameDeadlineScheduler, "cancelDeadline"),
    t.mock.method(server.runtime.gameDeadlineScheduler, "cancelRoom"),
  ];
  let sequence = 0;
  async function connect() {
    // socket.io-client factory has no event-map type arguments; all payloads remain unknown.
    const client = io(url, { auth: AUTH, autoConnect: false, transports: ["websocket"], forceNew: true, reconnection: false }) as RawClient;
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("P16 raw connection timeout")), 5_000);
      client.once("connect", () => { clearTimeout(timer); resolve(); });
      client.once("connect_error", error => { clearTimeout(timer); reject(error); });
      client.connect();
    });
    assert.equal(client.io.engine.transport.name, "websocket");
    return client;
  }
  function command(kind: string, payload: unknown, extra: Record<string, unknown> = {}) {
    return { kind, protocolVersion: 1, requestId: parse(RequestIdSchema, `p16-security-${++sequence}`), payload, ...extra };
  }
  const send = (client: RawClient, request: ReturnType<typeof command>) => new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No P16 acknowledgement: ${request.kind}`)), 5_000);
    client.emit(request.kind, request, value => { clearTimeout(timer); resolve(value); });
  });
  const call = (client: RawClient, kind: string, payload: unknown, extra?: Record<string, unknown>) => send(client, command(kind, payload, extra));
  function success(value: unknown) {
    const ack = parse(StateSyncWireAckSchema, value);
    assert.ok(ack.ok, !ack.ok ? ack.error.code : undefined);
    return ack.data.snapshot;
  }
  function failure(value: unknown, expected?: string) {
    const ack = parse(StateSyncWireAckSchema, value);
    assert.ok(!ack.ok, "Expected fail-closed rejection");
    if (expected !== undefined) assert.equal(ack.error.code, expected);
    return ack;
  }
  async function bootstrap(client: RawClient) {
    const ack = parse(SessionBootstrapAckSchema, await call(client, "session:bootstrap", {}));
    assert.ok(ack.ok);
    return ack.data.credential;
  }
  const sync = async (client: RawClient) => success(await call(client, "state:sync", {}));
  const city = (value: unknown) => parse(CityRolePlayingPlatformSnapshotV2Schema, value);
  async function group(gameType: GameType, count = 2) {
    const host = await connect(), hostCredential = await bootstrap(host);
    let lobby = parse(LobbyPlatformSnapshotV2Schema, success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "Member1", gameType })));
    const members = [{ client: host, playerId: lobby.self.playerId, credential: hostCredential, packets: [] as unknown[] }];
    for (let index = 1; index < count; index++) {
      const client = await connect(), credential = await bootstrap(client);
      lobby = parse(LobbyPlatformSnapshotV2Schema, success(await call(client, "room:join", { bootstrapCredential: credential, nickname: `Member${index + 1}`, roomCode: lobby.room.roomCode })));
      members.push({ client, playerId: lobby.self.playerId, credential, packets: [] });
    }
    for (const member of members) member.client.on("state:snapshot", value => { parse(StateSnapshotWireEventSchema, value); member.packets.push(value); });
    return { members, lobby };
  }
  async function start(members: Awaited<ReturnType<typeof group>>) {
    return parse(PlayingPlatformSnapshotV2Schema, success(await call(members.members[0]!.client, "game:start", {}, { expectedRoomRevision: members.lobby.versions.roomRevision })));
  }
  async function checkpoint(roomId: RoomId) {
    return { room: await server.runtime.persistence.findById(roomId),
      deadlines: await server.runtime.persistence.listActiveTurnDeadlines(), overall: await server.runtime.persistence.listActiveGameDeadlines(),
      turnTimers: server.runtime.turnScheduler.scheduledCount, overallTimers: server.runtime.gameDeadlineScheduler.scheduledCount,
      schedulerCalls: schedulerSpies.map(spy => spy.mock.callCount()),
      bindings: server.runtime.connectionRegistry.listActiveBindings(roomId), presence: server.runtime.connectionRegistry.getPresenceVersion(roomId) };
  }
  async function action(client: RawClient, kind: string, payload: unknown, view: CityRolePlayingPlatformSnapshotV2) {
    const request = command(kind, payload, cityIdentity(view));
    parse(ClientCommandSchema, request);
    const ack = parse(CityActionWireAckSchema, await send(client, request));
    assert.ok(ack.ok, !ack.ok ? ack.error.code : undefined);
    assert.deepEqual(Object.keys(ack.data).sort(), ["committedGameRevision", "gameId"]);
    return city(await sync(client));
  }
  return { server, connect, command, send, call, success, failure, bootstrap, sync, city, group, start, checkpoint, action };
}
function cityIdentity(view: CityRolePlayingPlatformSnapshotV2) {
  return { gameId: view.game.gameId, expectedGameRevision: view.game.gameRevision, actionId: view.game.window.actionId };
}
function legacyTurn(view: PlayingPlatformSnapshotV2) {
  assert.ok(view.game.gameType === "HANGUL_TILE" || view.game.gameType === "NUMBER_TILE" || view.game.gameType === "GEM_CARD");
  return view.game.gameType === "HANGUL_TILE" ? view.game.publicState.turn : view.game.turn;
}

for (const gameType of ["HANGUL_TILE", "NUMBER_TILE", "GEM_CARD"] as const) {
  test(`P16 raw full seven CITY commands -> ${gameType} are schema-valid, fail closed and do not mutate any mechanism`, async t => {
    const h = await harness(t), group = await h.group(gameType), view = await h.start(group);
    const actor = group.members.find(member => member.playerId === legacyTurn(view).activePlayerId)!;
    const before = await h.checkpoint(view.room.roomId), scope = `room-player:${view.room.roomId}:${actor.playerId}`;
    for (const action of CITY_ACTIONS) {
      const request = h.command(action.kind, action.payload, { gameId: view.game.gameType === "HANGUL_TILE" ? view.game.publicState.gameId : view.game.gameId, expectedGameRevision: view.game.gameRevision, actionId: legacyTurn(view).turnId });
      parse(ClientCommandSchema, request); // Wrong game, not a malformed input shortcut.
      assert.deepEqual(await h.server.runtime.persistence.classify(scope, request.requestId, "probe"), { status: "MISS" });
      h.failure(await h.send(actor.client, request));
      assert.deepEqual(await h.checkpoint(view.room.roomId), before, action.kind);
      assert.deepEqual(await h.server.runtime.persistence.classify(scope, request.requestId, "probe"), { status: "MISS" });
    }
  });
}

test("P16 raw all ten Hangul/Number/Gem commands -> CITY fail closed with state/revision/scheduler/idempotency unchanged", async t => {
  const h = await harness(t), group = await h.group("CITY_ROLE"), view = h.city(await h.start(group));
  const actor = group.members.find(member => member.playerId === view.game.window.activePlayerId)!;
  const before = await h.checkpoint(view.room.roomId), scope = `room-player:${view.room.roomId}:${actor.playerId}`;
  for (const action of HNG_ACTIONS) {
    const request = h.command(action.kind, action.payload, { expectedGameRevision: view.game.gameRevision, turnId: view.game.window.actionId });
    parse(ClientCommandSchema, request);
    assert.deepEqual(await h.server.runtime.persistence.classify(scope, request.requestId, "probe"), { status: "MISS" });
    h.failure(await h.send(actor.client, request));
    assert.deepEqual(await h.checkpoint(view.room.roomId), before, action.kind);
    assert.deepEqual(await h.server.runtime.persistence.classify(scope, request.requestId, "probe"), { status: "MISS" });
  }
});

test("CR02 investigation: two real socket clients resume unresolved v2 mark and observe exact gold transfer once", async t => {
  const actualNextInt = CryptoRandomSource.prototype.nextInt;
  t.mock.method(CryptoRandomSource.prototype, "nextInt", (max: number) => max === 0x1_0000_0000 ? 2 : actualNextInt(max));
  const h = await harness(t), group = await h.group("CITY_ROLE", 2);
  let view = h.city(await h.start(group));
  const owners = new Map<string, typeof group.members[number]>();
  for (const requested of ["CR-02", "CR-06", null] as const) {
    const actor = group.members.find(m => m.playerId === view.game.window.activePlayerId)!;
    view = h.city(await h.sync(actor.client));
    assert.ok(view.game.phase === "ROLE_SELECTION");
    const roleId = requested ?? view.game.privateState.availableRoleIds!.filter(id => id !== "CR-01")[0]!;
    owners.set(roleId, actor);
    assert.ok(view.game.phase === "ROLE_SELECTION" && view.game.privateState.availableRoleIds?.includes(roleId), JSON.stringify({ roleId, available: view.game.privateState }));
    const discardRoleId = view.game.privateState.availableRoleIds!.find(id => id === "CR-01") ?? view.game.privateState.availableRoleIds!.find(id => id !== roleId && id !== "CR-06")!;
    view = await h.action(actor.client, "city:selectRole", { roleId, discardRoleId }, view);
  }
  const source = owners.get("CR-02")!, target = owners.get("CR-06")!;
  assert.notEqual(source.playerId, target.playerId);
  view = h.city(await h.sync(source.client));
  assert.ok(view.game.phase === "ROLE_ACTION" && view.game.window.activeRoleId === "CR-02");
  view = await h.action(source.client, "city:takeIncome", {}, view);
  view = await h.action(source.client, "city:useRoleAbility", { ability: "MARK_ROLE_GOLD_TRANSFER", targetRoleId: "CR-06" }, view);
  assert.equal(view.game.privateState.marks[0]?.status, "UNRESOLVED");
  assert.deepEqual(h.city(await h.sync(target.client)).game.privateState.marks, []);
  source.client.disconnect();
  source.client = await h.connect();
  const resumed = h.city(h.success(await h.call(source.client, "session:resume", { credential: { ...source.credential, roomCode: view.room.roomCode }, lastSeenVersions: null })));
  assert.equal(resumed.self.playerId, source.playerId);
  assert.equal(resumed.room.players.length, 2);
  assert.equal(resumed.game.privateState.marks[0]?.status, "UNRESOLVED");
  view = resumed;
  while (view.game.phase === "ROLE_ACTION" && view.game.window.activeRoleId !== "CR-06") {
    const actor = group.members.find(m => m.playerId === view.game.window.activePlayerId)!;
    view = h.city(await h.sync(actor.client));
    assert.ok(view.game.phase === "ROLE_ACTION");
    if (view.game.privateState.action?.acquisition === "NOT_TAKEN") view = await h.action(actor.client, "city:takeIncome", {}, view);
    const before = view;
    const request = h.command("city:endTurn", {}, cityIdentity(before));
    const ack = parse(CityActionWireAckSchema, await h.send(actor.client, request));
    assert.ok(ack.ok);
    view = h.city(await h.sync(actor.client));
    if (view.game.phase !== "ROLE_ACTION" || view.game.window.activeRoleId !== "CR-06") continue;
    const gold = (v: CityRolePlayingPlatformSnapshotV2, id: string) => v.game.playerStates.find(p => p.playerId === id)!.gold;
    const stolen = gold(before, target.playerId);
    assert.ok(stolen > 0);
    assert.equal(gold(view, target.playerId), 0, "no city income: all existing gold stolen");
    assert.equal(gold(view, source.playerId), gold(before, source.playerId) + stolen);
    assert.equal(view.game.gameRevision, before.game.gameRevision + 1);
    t.diagnostic(`CR02 raw: source ${gold(before, source.playerId)} -> ${gold(view, source.playerId)}; target ${stolen} -> 0; revision ${before.game.gameRevision} -> ${view.game.gameRevision}`);
    const replay = parse(CityActionWireAckSchema, await h.send(actor.client, request));
    assert.ok(replay.ok);
    assert.deepEqual(replay.data, ack.data);
    assert.deepEqual(replay.versions, ack.versions);
    for (const member of group.members) {
      const synced = h.city(await h.sync(member.client));
      assert.equal(gold(synced, source.playerId), gold(view, source.playerId));
      assert.equal(gold(synced, target.playerId), 0);
      assert.equal(synced.game.gameRevision, view.game.gameRevision);
    }
    view = h.city(await h.sync(target.client));
    view = await h.action(target.client, "city:takeIncome", {}, view);
    assert.equal(gold(view, target.playerId), 3, "basic2 then CR06 extra1, not part of theft");
    assert.equal(gold(view, source.playerId), gold(before, source.playerId) + stolen);
    return;
  }
  assert.fail("CR06 transfer boundary not exercised");
});

test("P16 raw six-viewer network privacy spans secret draft, pending draw and both actor-private interference marks", async t => {
  // Only the injected random port is deterministic; no canonical state or server endpoint is edited.
  const actualNextInt = CryptoRandomSource.prototype.nextInt;
  t.mock.method(CryptoRandomSource.prototype, "nextInt", (max: number) => max === 0x1_0000_0000 ? 0 : actualNextInt(max));
  const h = await harness(t), group = await h.group("CITY_ROLE", 6);
  let view = h.city(await h.start(group));
  const privateIds = new Set<string>();
  async function auditViews() {
    const stored = await h.server.runtime.persistence.findById(view.room.roomId);
    assert.equal(stored?.gameType, "CITY_ROLE");
    assert.ok(stored.game);
    const state = stored.game.state;
    const views: CityRolePlayingPlatformSnapshotV2[] = [];
    for (const member of group.members) {
      const own = h.city(await h.sync(member.client));
      views.push(own);
      const json = JSON.stringify(own), self = state.players.find(player => String(player.playerId) === member.playerId)!;
      assert.deepEqual(own.game.privateState.hand.map(card => card.cardId), self.hand);
      assert.deepEqual(own.game.privateState.selectedRoleIds, state.round.assignments.filter(role => String(role.playerId) === member.playerId).map(role => role.roleId));
      assert.deepEqual(own.game.privateState.marks, state.marks.filter(mark => String(mark.sourcePlayerId) === member.playerId).map(mark => ({ kind: mark.kind, targetRoleId: mark.targetRoleId, status: mark.status })));
      for (const other of state.players) if (String(other.playerId) !== member.playerId) for (const cardId of other.hand) assert.equal(json.includes(cardId), false);
      for (const cardId of state.deck) assert.equal(json.includes(cardId), false);
      assert.equal(json.includes(stored.game.entropySeed), false);
      for (const key of ["deck", "discard", "hiddenRemoved", "assignments", "entropySeed", "entropyCounter", "offlineTimeoutStreak", "sessionToken", "verificationData", "storageRevision", "idempotency", "scheduler"]) assert.equal(json.includes(`"${key}"`), false);
      // This seeded round hides CR-08; no action below targets/reveals it.
      assert.deepEqual(state.round.hiddenRemoved, ["CR-08"]);
      assert.equal(json.includes("CR-08"), false);
      if (own.game.phase === "ROLE_SELECTION") {
        assert.equal("availableRoleIds" in own.game.privateState, own.game.window.activePlayerId === member.playerId);
      } else {
        assert.equal("availableRoleIds" in own.game.privateState, false);
        assert.equal("action" in own.game.privateState, own.game.window.activePlayerId === member.playerId);
        assert.equal("pendingCards" in own.game.privateState, String(state.pendingChoice?.ownerPlayerId) === member.playerId);
        if (String(state.pendingChoice?.ownerPlayerId) !== member.playerId) for (const cardId of state.pendingChoice?.cards ?? []) assert.equal(json.includes(cardId), false);
      }
      assert.equal(own.room.players.length, 6);
      assert.equal(own.game.playerStates.length, 6);
      assert.ok(Buffer.byteLength(json) < 25_000, "Six-player snapshot unexpectedly large");
      for (const entry of own.game.playerStates) assert.deepEqual(Object.keys(entry).sort(), ["builtBuildings", "forfeited", "gold", "handCount", "playerId", "scorePreview"]);
      for (const participant of group.members) assert.equal(json.includes(participant.credential.sessionToken), false);
    }
    assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
    assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).length, 1);
    return views;
  }
  await auditViews();
  for (const roleId of ["CR-01", "CR-02", "CR-03", "CR-04", "CR-05", "CR-06"] as const) {
    const actor = group.members.find(member => member.playerId === view.game.window.activePlayerId)!;
    view = h.city(await h.sync(actor.client));
    assert.equal(view.game.phase, "ROLE_SELECTION");
    view = await h.action(actor.client, "city:selectRole", { roleId }, view);
    await auditViews();
  }
  assert.equal(view.game.phase, "ROLE_ACTION");
  assert.ok(view.game.phase === "ROLE_ACTION");
  assert.equal(view.game.window.activeRoleId, "CR-01");
  const first = group.members.find(member => member.playerId === view.game.window.activePlayerId)!;
  view = h.city(await h.sync(first.client));
  const deadline = view.game.window.deadlineAt;
  view = await h.action(first.client, "city:drawBuildingCards", {}, view);
  assert.ok(view.game.phase === "ROLE_ACTION" && view.game.privateState.pendingCards);
  const pending = view.game.privateState.pendingCards;
  pending.forEach(card => privateIds.add(card.cardId));
  await auditViews();
  for (const member of group.members.filter(member => member !== first)) for (const packet of member.packets) for (const id of privateIds) assert.equal(JSON.stringify(packet).includes(id), false);
  view = await h.action(first.client, "city:chooseBuildingCard", { cardId: pending[0]!.cardId }, view);
  assert.equal(view.game.window.deadlineAt, deadline);
  view = await h.action(first.client, "city:useRoleAbility", { ability: "MARK_ROLE_DISABLED", targetRoleId: "CR-06" }, view);
  await auditViews();
  view = await h.action(first.client, "city:endTurn", {}, view);
  assert.ok(view.game.phase === "ROLE_ACTION");
  assert.equal(view.game.window.activeRoleId, "CR-02");
  const second = group.members.find(member => member.playerId === view.game.window.activePlayerId)!;
  view = h.city(await h.sync(second.client));
  view = await h.action(second.client, "city:takeIncome", {}, view);
  view = await h.action(second.client, "city:useRoleAbility", { ability: "MARK_ROLE_GOLD_TRANSFER", targetRoleId: "CR-05" }, view);
  await auditViews();
  for (const member of group.members) {
    assert.ok(member.packets.length >= 6, "Real fan-out snapshots missing");
    for (const packet of member.packets) {
      const wire = parse(StateSnapshotWireEventSchema, packet).payload.snapshot;
      assert.equal(wire.self.playerId, member.playerId);
      const serialized = JSON.stringify(packet);
      for (const participant of group.members) assert.equal(serialized.includes(participant.credential.sessionToken), false);
      // The final join fan-out may arrive after listeners attach; its Lobby
      // projection is also checked rather than treated as a Playing frame.
      if (wire.room.phase === "LOBBY") {
        assert.equal(parse(LobbyPlatformSnapshotV2Schema, wire).game, null);
        continue;
      }
      const snapshot = h.city(wire);
      for (const mark of snapshot.game.privateState.marks) {
        const expectedSource = mark.kind === "DISABLE" ? first : second;
        assert.equal(snapshot.self.playerId, expectedSource.playerId);
      }
    }
  }
});

test("P16 raw CITY six-player credentials fail closed and primary replacement restores exact private choice without duplicate seat", async t => {
  const h = await harness(t), group = await h.group("CITY_ROLE", 6), started = h.city(await h.start(group));
  const actor = group.members.find(member => member.playerId === started.game.window.activePlayerId)!;
  const own = h.city(await h.sync(actor.client)), attacker = await h.connect(), credential = await h.bootstrap(attacker);
  const before = await h.checkpoint(own.room.roomId);
  h.failure(await h.call(attacker, "session:resume", { credential: { roomCode: own.room.roomCode, playerId: actor.playerId }, lastSeenVersions: null }), "INVALID_PAYLOAD");
  h.failure(await h.call(attacker, "session:resume", { credential: { ...actor.credential, roomCode: own.room.roomCode, sessionToken: "incorrect-token" }, lastSeenVersions: null }));
  h.failure(await h.call(attacker, "room:join", { bootstrapCredential: credential, roomCode: own.room.roomCode, nickname: own.room.players.find(player => player.playerId === actor.playerId)!.nickname }));
  assert.deepEqual(await h.checkpoint(own.room.roomId), before);
  const replacementEvents: unknown[] = [];
  actor.client.on("session:replaced", value => replacementEvents.push(parse(SessionReplacedNotificationSchema, value)));
  const fresh = await h.connect();
  const resumed = h.city(h.success(await h.call(fresh, "session:resume", { credential: { ...actor.credential, roomCode: own.room.roomCode }, lastSeenVersions: null })));
  assert.equal(resumed.self.playerId, actor.playerId);
  assert.equal(resumed.room.players.length, 6);
  assert.deepEqual(resumed.game, own.game);
  assert.deepEqual(resumed.versions, own.versions);
  const after = await h.checkpoint(own.room.roomId);
  assert.deepEqual(after.room, before.room);
  assert.deepEqual(after.deadlines, before.deadlines);
  h.failure(await h.call(actor.client, "state:sync", {}), "UNAUTHENTICATED");
  h.failure(await h.call(actor.client, "city:selectRole", { roleId: "CR-08" }, cityIdentity(own)), "UNAUTHENTICATED");
  assert.equal(replacementEvents.length, 1);
  assert.deepEqual(await h.checkpoint(own.room.roomId), after);
  const bindings = h.server.runtime.connectionRegistry.listActiveBindings(own.room.roomId);
  assert.equal(bindings.length, 6);
  assert.equal(bindings.filter(binding => binding.playerId === actor.playerId).length, 1);
});
