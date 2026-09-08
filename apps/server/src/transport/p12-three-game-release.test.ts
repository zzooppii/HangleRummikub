import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import {
  ClientCommandSchema,
  LobbyPlatformSnapshotV2Schema,
  LobbyStateSnapshotSchema,
  PlayingPlatformSnapshotV2Schema,
  PlayingStateSnapshotSchema,
  RequestIdSchema,
  RoomLeaveAckSchema,
  SessionBootstrapAckSchema,
  SessionReplacedNotificationSchema,
  StateSnapshotWireEventSchema,
  StateSyncWireAckSchema,
  type GameType,
  type PlayingPlatformSnapshotV2,
  type RoomId,
} from "@hangul-rummikub/shared";

import { createHttpServer } from "../server.js";

// Raw requests and responses cross the real Socket.IO boundary. Responses are
// parsed independently; no seeded canonical state or production test hook is used.
type RawClient = Socket<
  Record<string, (value: unknown) => void>,
  Record<string, (value: unknown, ack: (value: unknown) => void) => void>
>;
const GAME_TYPES = ["HANGUL_TILE", "NUMBER_TILE", "GEM_CARD"] as const;
const TURN_MS = { HANGUL_TILE: 60_000, NUMBER_TILE: 90_000, GEM_CARD: 45_000 };
const authFor = (gameType: GameType) => ({
  supportedSnapshotVersions: [2, 1],
  supportedGameTypes: [gameType],
});

async function waitUntil(check: () => boolean): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (!check()) {
    assert.ok(Date.now() < deadline, "Timed out waiting for server presence");
    await new Promise<void>(resolve => setTimeout(resolve, 5));
  }
}

async function harness(t: TestContext) {
  const server = createHttpServer({ serveWeb: false });
  const clients: RawClient[] = [];
  t.after(async () => {
    clients.forEach(client => client.disconnect());
    await server.shutdown();
  });
  await new Promise<void>((resolve, reject) => {
    server.httpServer.once("error", reject);
    server.httpServer.listen(0, "127.0.0.1", resolve);
  });
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  let sequence = 0;
  const schedulerSpies = [
    t.mock.method(server.runtime.turnScheduler, "scheduleTimeout"),
    t.mock.method(server.runtime.turnScheduler, "cancelTimeout"),
    t.mock.method(server.runtime.turnScheduler, "cancelRoom"),
    t.mock.method(server.runtime.gameDeadlineScheduler, "scheduleDeadline"),
    t.mock.method(server.runtime.gameDeadlineScheduler, "cancelDeadline"),
    t.mock.method(server.runtime.gameDeadlineScheduler, "cancelRoom"),
  ];

  async function connect(auth?: Record<string, unknown>): Promise<RawClient> {
    // socket.io-client erases event-map generics at its public factory boundary.
    const client = io(url, {
      ...(auth === undefined ? {} : { auth }),
      autoConnect: false,
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
    }) as RawClient;
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("P12 connection timeout")), 5_000);
      client.once("connect", () => { clearTimeout(timer); resolve(); });
      client.once("connect_error", error => { clearTimeout(timer); reject(error); });
      client.connect();
    });
    assert.equal(client.io.engine.transport.name, "websocket");
    return client;
  }

  function command(kind: string, payload: unknown, extra: Record<string, unknown> = {}) {
    return {
      kind, protocolVersion: 1,
      requestId: parse(RequestIdSchema, `p12-raw-${++sequence}`),
      payload, ...extra,
    };
  }
  async function send(client: RawClient, request: ReturnType<typeof command>) {
    return new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error(`No ack for ${request.kind}`)), 5_000);
      client.emit(request.kind, request, value => { clearTimeout(timer); resolve(value); });
    });
  }
  const call = (client: RawClient, kind: string, payload: unknown, extra?: Record<string, unknown>) =>
    send(client, command(kind, payload, extra));
  async function bootstrap(client: RawClient) {
    const ack = parse(SessionBootstrapAckSchema, await call(client, "session:bootstrap", {}));
    assert.ok(ack.ok);
    return ack.data.credential;
  }
  function success(value: unknown) {
    const ack = parse(StateSyncWireAckSchema, value);
    assert.ok(ack.ok, !ack.ok ? ack.error.code : undefined);
    return ack.data.snapshot;
  }
  function failure(value: unknown, code?: string) {
    const ack = parse(StateSyncWireAckSchema, value);
    assert.equal(ack.ok, false);
    assert.ok(!ack.ok);
    if (code !== undefined) assert.equal(ack.error.code, code);
    return ack;
  }
  const sync = async (client: RawClient) => success(await call(client, "state:sync", {}));
  async function group(gameType: GameType, count: number) {
    const host = await connect(authFor(gameType));
    const hostCredential = await bootstrap(host);
    let lobby = parse(LobbyPlatformSnapshotV2Schema, success(await call(host, "room:create", {
      bootstrapCredential: hostCredential, nickname: "Player1", gameType,
    })));
    const members = [{ client: host, credential: hostCredential, playerId: lobby.self.playerId }];
    for (let index = 1; index < count; index++) {
      const client = await connect(authFor(gameType));
      const credential = await bootstrap(client);
      lobby = parse(LobbyPlatformSnapshotV2Schema, success(await call(client, "room:join", {
        bootstrapCredential: credential, nickname: `Player${index + 1}`, roomCode: lobby.room.roomCode,
      })));
      members.push({ client, credential, playerId: lobby.self.playerId });
    }
    return { host, members, lobby };
  }
  async function start(p: Awaited<ReturnType<typeof group>>) {
    return parse(PlayingPlatformSnapshotV2Schema, success(await call(p.host, "game:start", {}, {
      expectedRoomRevision: p.lobby.versions.roomRevision,
    })));
  }
  async function checkpoint(roomId: RoomId) {
    return {
      room: await server.runtime.persistence.findById(roomId),
      turns: await server.runtime.persistence.listActiveTurnDeadlines(),
      overall: await server.runtime.persistence.listActiveGameDeadlines(),
      turnTimers: server.runtime.turnScheduler.scheduledCount,
      overallTimers: server.runtime.gameDeadlineScheduler.scheduledCount,
      schedulerCalls: schedulerSpies.map(spy => spy.mock.callCount()),
      bindings: server.runtime.connectionRegistry.listActiveBindings(roomId),
      presence: server.runtime.connectionRegistry.getPresenceVersion(roomId),
    };
  }
  return { server, connect, command, send, call, bootstrap, success, failure, sync, group, start, checkpoint };
}

function turnOf(snapshot: PlayingPlatformSnapshotV2) {
  assert.ok(snapshot.game.gameType !== "CITY_ROLE", "P12 fixture remains the three released games.");
  return snapshot.game.gameType === "HANGUL_TILE" ? snapshot.game.publicState.turn : snapshot.game.turn;
}
function identity(snapshot: PlayingPlatformSnapshotV2) {
  return { expectedGameRevision: snapshot.game.gameRevision, turnId: turnOf(snapshot).turnId };
}
const ACTIONS = [
  { gameType: "HANGUL_TILE", kind: "turn:submit", payload: { proposedBoard: { wordGroups: [] } } },
  { gameType: "HANGUL_TILE", kind: "turn:draw", payload: { bagKind: "CONSONANT" } },
  { gameType: "HANGUL_TILE", kind: "turn:pass", payload: {} },
  { gameType: "NUMBER_TILE", kind: "number:submit", payload: { proposedTable: { melds: [] } } },
  { gameType: "NUMBER_TILE", kind: "number:draw", payload: {} },
  { gameType: "NUMBER_TILE", kind: "number:pass", payload: {} },
  { gameType: "GEM_CARD", kind: "gem:collect", payload: { selection: { kind: "PRISM" } } },
  { gameType: "GEM_CARD", kind: "gem:purchase", payload: { source: { kind: "MARKET", tier: 1, slotIndex: 0 } } },
  { gameType: "GEM_CARD", kind: "gem:reserve", payload: { source: { tier: 1, slotIndex: 0 } } },
  { gameType: "GEM_CARD", kind: "gem:yield", payload: {} },
] as const;

for (const gameType of GAME_TYPES) {
  for (const count of [2, 3, 4]) {
    test(`P12 raw ${gameType} ${count}-player start, constraints, setup, privacy and timer`, async t => {
      const h = await harness(t);
      if (count === 2) {
        const solo = await h.group(gameType, 1);
        const before = await h.checkpoint(solo.lobby.room.roomId);
        h.failure(await h.call(solo.host, "game:start", {}, { expectedRoomRevision: solo.lobby.versions.roomRevision }), "NOT_ENOUGH_PLAYERS");
        assert.deepEqual(await h.checkpoint(solo.lobby.room.roomId), before);
      }
      const p = await h.group(gameType, count);
      const before = await h.checkpoint(p.lobby.room.roomId);
      h.failure(await h.call(p.members[1]!.client, "game:start", {}, { expectedRoomRevision: p.lobby.versions.roomRevision }), "HOST_ONLY");
      assert.deepEqual(await h.checkpoint(p.lobby.room.roomId), before);
      if (count === 4) {
        const extra = await h.connect(authFor(gameType));
        const credential = await h.bootstrap(extra);
        h.failure(await h.call(extra, "room:join", {
          bootstrapCredential: credential, nickname: "Player5", roomCode: p.lobby.room.roomCode,
        }), "ROOM_FULL");
        assert.deepEqual(await h.checkpoint(p.lobby.room.roomId), before);
      }
      const started = await h.start(p);
      assert.equal(started.room.gameType, gameType);
      assert.equal(started.room.players.length, count);
      assert.equal(started.game.gameRevision, 0);
      assert.equal(started.versions.roomRevision, p.lobby.versions.roomRevision + 1);
      assert.equal(started.versions.presenceVersion, p.lobby.versions.presenceVersion);
      const turn = turnOf(started);
      assert.equal(turn.deadlineAt - turn.startedAt, TURN_MS[gameType]);
      const stored = await h.server.runtime.persistence.findById(started.room.roomId);
      assert.ok(stored?.game);
      assert.ok(stored.gameType !== "CITY_ROLE");
      assert.deepEqual(new Set(stored.game.turnOrder), new Set(p.members.map(member => member.playerId)));
      assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
      assert.equal(h.server.runtime.gameDeadlineScheduler.scheduledCount, gameType === "HANGUL_TILE" ? 1 : 0);
      if (stored.gameType === "HANGUL_TILE") {
        assert.equal(stored.game.gameDeadlineAt - stored.game.gameStartedAt, 25 * 60_000);
      } else {
        assert.equal("gameDeadlineAt" in stored.game, false);
      }
      const views = await Promise.all(p.members.map(async member =>
        parse(PlayingPlatformSnapshotV2Schema, await h.sync(member.client))));
      for (const [index, view] of views.entries()) {
        const serialized = JSON.stringify(view);
        for (const member of p.members) assert.equal(serialized.includes(member.credential.sessionToken), false);
        for (const key of ["sessionToken", "storageRevision", "offlineTimeoutStreak", "idempotency", "scheduler"])
          assert.equal(serialized.includes(`"${key}"`), false);
        if (view.game.gameType === "GEM_CARD") {
          assert.equal("privateState" in view.game, false);
          assert.equal("rack" in view.game, false);
          assert.deepEqual(view.game.supply, { DAWN: 7, TIDE: 7, GROVE: 7, EMBER: 7, ECHO: 7, PRISM: 5 });
          assert.equal(view.game.market.length, 3);
          assert.ok(view.game.market.every(tier => tier.slots.filter(Boolean).length === 3 && tier.remainingDeckCount === 12));
          assert.ok(view.game.playerStates.every(player => Object.values(player.resources).every(value => value === 0) && player.score === 0));
          assert.equal(stored.gameType, "GEM_CARD");
          assert.ok(stored.gameType === "GEM_CARD");
          for (const cardId of stored.game.market.flatMap(tier => tier.deck)) assert.equal(serialized.includes(cardId), false);
          assert.deepEqual(view.game, started.game);
        } else {
          assert.ok(view.game.gameType === "HANGUL_TILE" || view.game.gameType === "NUMBER_TILE");
          assert.equal(view.game.privateState.rack.length, 14);
          assert.ok(view.game.playerStates.every(player => player.rackCount === 14));
          for (const [otherIndex, other] of views.entries()) {
            if (otherIndex === index) continue;
            const otherJson = JSON.stringify(other);
            for (const tile of view.game.privateState.rack) assert.equal(otherJson.includes(tile.tileId), false);
          }
          if (view.game.gameType === "HANGUL_TILE") {
            assert.deepEqual(view.game.publicState.bagCounts, { consonant: 95 - 7 * count, vowel: 61 - 7 * count });
          } else {
            assert.equal(view.game.remainingPoolCount, 106 - 14 * count);
          }
        }
      }
    });
  }

  test(`P12 raw ${gameType} rejects every foreign action before scheduler/idempotency mutation; revision and replay`, async t => {
    const h = await harness(t), p = await h.group(gameType, 2), started = await h.start(p);
    const active = p.members.find(member => member.playerId === turnOf(started).activePlayerId)!;
    const scope = `room-player:${started.room.roomId}:${active.playerId}`;
    const before = await h.checkpoint(started.room.roomId);
    const rejectedIds = [];
    for (const action of ACTIONS.filter(action => action.gameType !== gameType)) {
      const request = h.command(action.kind, action.payload, identity(started));
      parse(ClientCommandSchema, request); // Prove rejection is not malformed input.
      assert.deepEqual(await h.server.runtime.persistence.classify(scope, request.requestId, "probe"), { status: "MISS" });
      h.failure(await h.send(active.client, request));
      assert.deepEqual(await h.checkpoint(started.room.roomId), before);
      assert.deepEqual(await h.server.runtime.persistence.classify(scope, request.requestId, "probe"), { status: "MISS" });
      rejectedIds.push(request.requestId);
    }
    const rejectedOwn = ACTIONS.find(action => action.gameType === gameType && (action.kind.endsWith(":pass") || action.kind === "gem:yield"))!;
    h.failure(await h.call(active.client, rejectedOwn.kind, rejectedOwn.payload, identity(started)));
    assert.deepEqual(await h.checkpoint(started.room.roomId), before);
    const legal = ACTIONS.find(action => action.gameType === gameType && (action.kind.endsWith(":draw") || action.kind === "gem:collect"))!;
    const request = h.command(legal.kind, legal.payload, { ...identity(started), requestId: rejectedIds[0] });
    const accepted = parse(PlayingPlatformSnapshotV2Schema, h.success(await h.send(active.client, request)));
    assert.equal(accepted.game.gameRevision, started.game.gameRevision + 1);
    assert.deepEqual(accepted.versions, started.versions);
    assert.notEqual(turnOf(accepted).turnId, turnOf(started).turnId);
    const committed = await h.checkpoint(started.room.roomId);
    h.success(await h.send(active.client, request));
    // Successful replay may ask the scheduler to ensure the same current timer;
    // persisted identity, active timer count and canonical state must stay exact.
    const replayed = await h.checkpoint(started.room.roomId);
    assert.deepEqual({ ...replayed, schedulerCalls: [] }, { ...committed, schedulerCalls: [] });
    const conflict = { ...request, expectedGameRevision: accepted.game.gameRevision };
    h.failure(await h.send(active.client, conflict), "REQUEST_ID_REUSED");
    assert.deepEqual(await h.checkpoint(started.room.roomId), replayed);
  });

  test(`P12 raw ${gameType} admission uses canonical Room type and rejects incompatible create/join/resume atomically`, async t => {
    const h = await harness(t), p = await h.group(gameType, 2);
    const incompatible: (Record<string, unknown> | undefined)[] = [
      { supportedSnapshotVersions: [2, 1], supportedGameTypes: GAME_TYPES.filter(type => type !== gameType) },
      ...(gameType === "HANGUL_TILE" ? [] : [
        undefined,
        { supportedSnapshotVersions: [2, 1] },
        { supportedSnapshotVersions: [1], supportedGameTypes: [gameType] },
      ]),
    ];
    for (const auth of incompatible) {
      const client = await h.connect(auth), credential = await h.bootstrap(client);
      const before = await h.checkpoint(p.lobby.room.roomId);
      h.failure(await h.call(client, "room:create", { bootstrapCredential: credential, nickname: "Blocked", gameType }), "INCOMPATIBLE_GAME_CAPABILITY");
      h.failure(await h.call(client, "room:join", { bootstrapCredential: credential, nickname: "Blocked", roomCode: p.lobby.room.roomCode }), "INCOMPATIBLE_GAME_CAPABILITY");
      h.failure(await h.call(client, "session:resume", { credential: { ...p.members[0]!.credential, roomCode: p.lobby.room.roomCode }, lastSeenVersions: null }), "INCOMPATIBLE_GAME_CAPABILITY");
      assert.deepEqual(await h.checkpoint(p.lobby.room.roomId), before);
      h.failure(await h.call(client, "state:sync", {}));
      // A failed admission must leave its bootstrap credential reusable.
      const compatible = await h.connect(authFor(gameType));
      const created = parse(LobbyPlatformSnapshotV2Schema, h.success(await h.call(compatible, "room:create", {
        bootstrapCredential: credential, nickname: "Eligible", gameType,
      })));
      assert.equal(created.room.gameType, gameType);
    }
    const forged = await h.connect(authFor(gameType)), credential = await h.bootstrap(forged);
    const before = await h.checkpoint(p.lobby.room.roomId);
    h.failure(await h.call(forged, "room:join", {
      bootstrapCredential: credential, nickname: "Forged", roomCode: p.lobby.room.roomCode, gameType,
    }), "INVALID_PAYLOAD");
    assert.deepEqual(await h.checkpoint(p.lobby.room.roomId), before);
  });

  test(`P12 raw ${gameType} nickname/token protection, offline start, primary replacement, reconnect and leave`, async t => {
    const h = await harness(t), p = await h.group(gameType, 2), guest = p.members[1]!;
    const attacker = await h.connect(authFor(gameType)), attackerCredential = await h.bootstrap(attacker);
    const before = await h.checkpoint(p.lobby.room.roomId);
    h.failure(await h.call(attacker, "room:join", {
      bootstrapCredential: attackerCredential, nickname: "Player2", roomCode: p.lobby.room.roomCode,
    }), "NICKNAME_TAKEN");
    h.failure(await h.call(attacker, "session:resume", {
      credential: { ...attackerCredential, roomCode: p.lobby.room.roomCode }, lastSeenVersions: null,
    }));
    h.failure(await h.call(attacker, "session:resume", {
      credential: { roomCode: p.lobby.room.roomCode, playerId: guest.playerId }, lastSeenVersions: null,
    }), "INVALID_PAYLOAD");
    assert.deepEqual(await h.checkpoint(p.lobby.room.roomId), before);
    guest.client.disconnect();
    await waitUntil(() => h.server.runtime.connectionRegistry.getPrimaryBinding(p.lobby.room.roomId, guest.playerId) === null);
    const offline = await h.checkpoint(p.lobby.room.roomId);
    h.failure(await h.call(p.host, "game:start", {}, { expectedRoomRevision: p.lobby.versions.roomRevision }), "PLAYERS_NOT_CONNECTED");
    assert.deepEqual(await h.checkpoint(p.lobby.room.roomId), offline);
    const returned = await h.connect(authFor(gameType));
    const resumePayload = { credential: { ...guest.credential, roomCode: p.lobby.room.roomCode }, lastSeenVersions: null };
    const lobby = parse(LobbyPlatformSnapshotV2Schema, h.success(await h.call(returned, "session:resume", resumePayload)));
    assert.equal(lobby.self.playerId, guest.playerId);
    assert.equal(lobby.room.players.length, 2);
    assert.equal(lobby.versions.roomRevision, p.lobby.versions.roomRevision);
    const started = await h.start(p);
    const replacing = await h.connect(authFor(gameType));
    const replacementEvents: unknown[] = [];
    returned.on("session:replaced", value => replacementEvents.push(parse(SessionReplacedNotificationSchema, value)));
    const oldVersions = (await h.sync(returned)).versions;
    const resumed = parse(PlayingPlatformSnapshotV2Schema, h.success(await h.call(replacing, "session:resume", resumePayload)));
    await waitUntil(() => replacementEvents.length === 1);
    assert.equal(resumed.self.playerId, guest.playerId);
    assert.equal(resumed.room.players.length, 2);
    assert.equal(resumed.game.gameRevision, started.game.gameRevision);
    assert.deepEqual(resumed.versions, oldVersions);
    h.failure(await h.call(returned, "state:sync", {}), "UNAUTHENTICATED");
    const beforeOffline = await h.checkpoint(p.lobby.room.roomId);
    replacing.disconnect();
    await waitUntil(() => h.server.runtime.connectionRegistry.getPrimaryBinding(p.lobby.room.roomId, guest.playerId) === null);
    const presenceOnly = await h.checkpoint(p.lobby.room.roomId);
    assert.deepEqual(presenceOnly.room, beforeOffline.room);
    assert.equal(presenceOnly.presence, beforeOffline.presence + 1);
    const reconnected = await h.connect(authFor(gameType));
    const rejoined = parse(PlayingPlatformSnapshotV2Schema, h.success(await h.call(reconnected, "session:resume", resumePayload)));
    assert.equal(rejoined.self.playerId, guest.playerId);
    assert.equal(rejoined.room.players.length, 2);
    assert.equal(rejoined.game.gameRevision, started.game.gameRevision);
    assert.equal(rejoined.versions.roomRevision, started.versions.roomRevision);
    assert.equal(rejoined.versions.presenceVersion, beforeOffline.presence + 2);
    assert.deepEqual(turnOf(rejoined), turnOf(started));
    const left = parse(RoomLeaveAckSchema, await h.call(reconnected, "room:leave", {}, {
      expectedRoomRevision: rejoined.versions.roomRevision, expectedGameRevision: rejoined.game.gameRevision,
    }));
    assert.ok(left.ok);
    const stale = await h.connect(authFor(gameType));
    h.failure(await h.call(stale, "session:resume", resumePayload));
    const finished = await h.sync(p.host);
    assert.equal(finished.room.phase, "FINISHED");
    assert.equal(h.server.runtime.turnScheduler.scheduledCount, 0);
    assert.equal(h.server.runtime.gameDeadlineScheduler.scheduledCount, 0);
  });
}

test("P12 raw legacy with both capability fields omitted keeps exact Hangul V1 create/join/start/draw/resume wire", async t => {
  const h = await harness(t), host = await h.connect(), guest = await h.connect();
  const a = await h.bootstrap(host), b = await h.bootstrap(guest);
  const created = parse(LobbyStateSnapshotSchema, h.success(await h.call(host, "room:create", { bootstrapCredential: a, nickname: "Legacy1" })));
  const joined = parse(LobbyStateSnapshotSchema, h.success(await h.call(guest, "room:join", { bootstrapCredential: b, nickname: "Legacy2", roomCode: created.room.roomCode })));
  const snapshots: unknown[] = [];
  host.on("state:snapshot", value => snapshots.push(parse(StateSnapshotWireEventSchema, value)));
  const started = parse(PlayingStateSnapshotSchema, h.success(await h.call(host, "game:start", {}, { expectedRoomRevision: joined.versions.roomRevision })));
  for (const snapshot of [created, joined, started]) {
    assert.equal("snapshotVersion" in snapshot, false);
    assert.equal("gameType" in snapshot.room, false);
    assert.equal(snapshot.protocolVersion, 1);
  }
  assert.equal(started.self.rack.length, 14);
  assert.deepEqual(started.game.bagCounts, { consonant: 81, vowel: 47 });
  const active = started.game.turn.activePlayerId === started.self.playerId ? host : guest;
  const drawn = parse(PlayingStateSnapshotSchema, h.success(await h.call(active, "turn:draw", { bagKind: "CONSONANT" }, {
    expectedGameRevision: started.versions.gameRevision, turnId: started.game.turn.turnId,
  })));
  assert.equal(drawn.versions.gameRevision, 1);
  assert.equal(drawn.game.bagCounts.consonant, 80);
  const reconnect = await h.connect();
  const resumed = parse(PlayingStateSnapshotSchema, h.success(await h.call(reconnect, "session:resume", {
    credential: { ...b, roomCode: created.room.roomCode }, lastSeenVersions: null,
  })));
  assert.equal(resumed.self.playerId, joined.self.playerId);
  assert.equal(resumed.room.players.length, 2);
  assert.equal(resumed.versions.gameRevision, 1);
  assert.equal("snapshotVersion" in resumed, false);
  assert.ok(snapshots.length > 0);
  for (const event of snapshots) assert.equal(JSON.stringify(event).includes("snapshotVersion"), false);
});
