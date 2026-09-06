import assert from "node:assert/strict";
import test from "node:test";

import {
  LobbyPlatformSnapshotV2Schema,
  NicknameSchema,
  PLATFORM_SNAPSHOT_VERSION,
  PROTOCOL_VERSION,
  PlayingPlatformSnapshotV2Schema,
  PlayingStateSnapshotSchema,
  RequestIdSchema,
  SessionReplacedNotificationSchema,
  StateSnapshotSchema,
  StateSnapshotWireEventSchema,
  type GameStartWireAck,
  type PlatformSnapshotV2,
  type PlayingPlatformSnapshotV2,
  type PlayingStateSnapshot,
  type RequestId,
  type RoomCreateWireAck,
  type RoomJoinWireAck,
  type SessionBootstrapAck,
  type SessionResumeWireAck,
  type SessionToken,
  type SnapshotWireClientToServerEvents,
  type SnapshotWireServerToClientEvents,
  type StateSnapshot,
  type StateSnapshotWireEvent,
  type StateSyncWireAck,
  type TurnDrawWireAck,
} from "@hangul-rummikub/shared";
import {
  io as createSocketClient,
  type Socket as SocketIoClient,
} from "socket.io-client";
import * as v from "valibot";

import { createHttpServer } from "../server.js";

const NETWORK_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 5;

type WireClient = SocketIoClient<
  SnapshotWireServerToClientEvents,
  SnapshotWireClientToServerEvents
>;

type Harness = Readonly<{
  server: ReturnType<typeof createHttpServer>;
  url: string;
  clients: WireClient[];
}>;

type ClientObserver = Readonly<{
  snapshots: StateSnapshotWireEvent[];
  replacements: import("@hangul-rummikub/shared").SessionReplacedNotification[];
}>;

function requestId(value: string): RequestId {
  return v.parse(RequestIdSchema, value);
}

async function startHarness(): Promise<Harness> {
  const server = createHttpServer();
  await new Promise<void>((resolve, reject) => {
    const onError = (error: Error): void => {
      server.httpServer.off("listening", onListening);
      reject(error);
    };
    const onListening = (): void => {
      server.httpServer.off("error", onError);
      resolve();
    };

    server.httpServer.once("error", onError);
    server.httpServer.once("listening", onListening);
    server.httpServer.listen(0, "127.0.0.1");
  });

  const address = server.httpServer.address();
  if (address === null || typeof address === "string") {
    await server.shutdown();
    throw new Error("Snapshot negotiation test server has no TCP address.");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    clients: [],
  };
}

async function stopHarness(harness: Harness): Promise<void> {
  for (const client of harness.clients) {
    client.disconnect();
  }
  await harness.server.shutdown();
}

function createClient(
  harness: Harness,
  auth?: Readonly<Record<string, unknown>>,
): WireClient {
  // socket.io-client's public overload erases event-map generics. Keep the
  // assertion at this test-only network adapter boundary.
  const client = createSocketClient(harness.url, {
    ...(auth === undefined ? {} : { auth }),
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  }) as WireClient;
  harness.clients.push(client);
  return client;
}

async function connectClient(
  harness: Harness,
  auth?: Readonly<Record<string, unknown>>,
): Promise<WireClient> {
  const client = createClient(harness, auth);
  const connected = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off("connect", onConnect);
      client.off("connect_error", onError);
      reject(new Error("Timed out connecting snapshot negotiation client."));
    }, NETWORK_TIMEOUT_MS);
    const onConnect = (): void => {
      clearTimeout(timeout);
      client.off("connect_error", onError);
      resolve();
    };
    const onError = (error: Error): void => {
      clearTimeout(timeout);
      client.off("connect", onConnect);
      reject(error);
    };
    client.once("connect", onConnect);
    client.once("connect_error", onError);
  });
  client.connect();
  await connected;
  return client;
}

async function expectConnectionRejection(
  harness: Harness,
  auth: Readonly<Record<string, unknown>>,
  expectedMessage: string,
): Promise<void> {
  const client = createClient(harness, auth);
  const rejected = new Promise<string>((resolve, reject) => {
    const timeout = setTimeout(() => {
      client.off("connect", onConnect);
      client.off("connect_error", onError);
      reject(new Error("Timed out waiting for snapshot negotiation rejection."));
    }, NETWORK_TIMEOUT_MS);
    const onConnect = (): void => {
      clearTimeout(timeout);
      client.off("connect_error", onError);
      reject(new Error("Incompatible snapshot client unexpectedly connected."));
    };
    const onError = (error: Error): void => {
      clearTimeout(timeout);
      client.off("connect", onConnect);
      resolve(error.message);
    };
    client.once("connect", onConnect);
    client.once("connect_error", onError);
  });
  client.connect();
  const message = await rejected;
  assert.equal(message, expectedMessage);
  assert.equal(client.connected, false);
}

function observeClient(client: WireClient): ClientObserver {
  const snapshots: StateSnapshotWireEvent[] = [];
  const replacements: import("@hangul-rummikub/shared").SessionReplacedNotification[] = [];
  client.on("state:snapshot", (event) => {
    snapshots.push(v.parse(StateSnapshotWireEventSchema, event));
  });
  client.on("session:replaced", (event) => {
    replacements.push(v.parse(SessionReplacedNotificationSchema, event));
  });
  return { snapshots, replacements };
}

function emitWithAck<TAck>(
  label: string,
  emit: (acknowledge: (ack: TAck) => void) => void,
): Promise<TAck> {
  return new Promise<TAck>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${label} acknowledgement.`));
    }, NETWORK_TIMEOUT_MS);
    emit((ack) => {
      clearTimeout(timeout);
      resolve(ack);
    });
  });
}

async function waitForValue<TValue>(
  label: string,
  read: () => TValue | null,
): Promise<TValue> {
  const deadline = Date.now() + NETWORK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = read();
    if (value !== null) {
      return value;
    }
    await new Promise<void>((resolve) => {
      setTimeout(resolve, POLL_INTERVAL_MS);
    });
  }
  throw new Error(`Timed out waiting for ${label}.`);
}

function takeSnapshot(
  observer: ClientObserver,
  predicate: (event: StateSnapshotWireEvent) => boolean,
): StateSnapshotWireEvent | null {
  const index = observer.snapshots.findIndex(predicate);
  if (index < 0) {
    return null;
  }
  return observer.snapshots.splice(index, 1)[0] ?? null;
}

function waitForSnapshot(
  observer: ClientObserver,
  predicate: (event: StateSnapshotWireEvent) => boolean,
): Promise<StateSnapshotWireEvent> {
  return waitForValue("matching negotiated state:snapshot", () =>
    takeSnapshot(observer, predicate),
  );
}

function waitForReplacement(
  observer: ClientObserver,
): Promise<import("@hangul-rummikub/shared").SessionReplacedNotification> {
  return waitForValue("session:replaced", () =>
    observer.replacements.shift() ?? null,
  );
}

async function bootstrap(client: WireClient, suffix: string): Promise<SessionToken> {
  const ack = await emitWithAck<SessionBootstrapAck>(
    `${suffix} bootstrap`,
    (acknowledge) => {
      client.emit(
        "session:bootstrap",
        {
          kind: "session:bootstrap",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId(`${suffix}-bootstrap`),
          payload: {},
        },
        acknowledge,
      );
    },
  );
  assert.equal(ack.ok, true);
  if (!ack.ok) {
    throw new Error(`${suffix} bootstrap failed.`);
  }
  return ack.data.credential.sessionToken;
}

function requireV1(snapshot: unknown): StateSnapshot {
  const parsed = v.parse(StateSnapshotSchema, snapshot);
  assert.equal("snapshotVersion" in parsed, false);
  assert.equal("gameType" in parsed.room, false);
  return parsed;
}

function parseV2(snapshot: unknown): PlatformSnapshotV2 {
  if (
    typeof snapshot !== "object" ||
    snapshot === null ||
    !("snapshotVersion" in snapshot)
  ) {
    throw new Error("Expected PlatformSnapshot V2.");
  }
  assert.equal(snapshot.snapshotVersion, PLATFORM_SNAPSHOT_VERSION);
  if (!("room" in snapshot) || typeof snapshot.room !== "object" || snapshot.room === null) {
    throw new Error("Expected PlatformSnapshot V2 Room.");
  }
  const phase = (snapshot.room as { phase?: unknown }).phase;
  if (phase === "LOBBY") {
    return v.parse(LobbyPlatformSnapshotV2Schema, snapshot);
  }
  return v.parse(PlayingPlatformSnapshotV2Schema, snapshot);
}

function requireV1Playing(snapshot: unknown): PlayingStateSnapshot {
  return v.parse(PlayingStateSnapshotSchema, snapshot);
}

function requireV2Playing(snapshot: unknown): PlayingPlatformSnapshotV2 {
  return v.parse(PlayingPlatformSnapshotV2Schema, snapshot);
}

function platformPlayersFromV1(snapshot: StateSnapshot) {
  return snapshot.room.players.map((player) => ({
    playerId: player.playerId,
    nickname: player.nickname,
    isHost: player.isHost,
    connectionStatus: player.connectionStatus,
  }));
}

function assertEnvelopeMatchesPayload(event: StateSnapshotWireEvent): void {
  const snapshot = event.payload.snapshot;
  assert.equal(event.protocolVersion, PROTOCOL_VERSION);
  assert.equal(event.serverTime, snapshot.serverTime);
  if ("snapshotVersion" in snapshot) {
    assert.equal(event.versions.roomRevision, snapshot.versions.roomRevision);
    assert.equal(
      event.versions.presenceVersion,
      snapshot.versions.presenceVersion,
    );
    assert.equal(
      event.versions.gameRevision,
      snapshot.game?.gameRevision ?? null,
    );
    return;
  }
  assert.deepEqual(event.versions, snapshot.versions);
}

function assertPlayingSemanticParity(
  legacy: PlayingStateSnapshot,
  platform: PlayingPlatformSnapshotV2,
): void {
  assert.equal(platform.snapshotVersion, PLATFORM_SNAPSHOT_VERSION);
  assert.equal(platform.room.gameType, "HANGUL_TILE");
  assert.equal(platform.game.gameType, "HANGUL_TILE");
  assert.equal(platform.room.roomId, legacy.room.roomId);
  assert.equal(platform.room.roomCode, legacy.room.roomCode);
  assert.equal(platform.room.phase, legacy.room.phase);
  assert.deepEqual(platform.room.players, platformPlayersFromV1(legacy));
  assert.equal(platform.versions.roomRevision, legacy.versions.roomRevision);
  assert.equal(
    platform.versions.presenceVersion,
    legacy.versions.presenceVersion,
  );
  assert.equal(platform.game.gameRevision, legacy.versions.gameRevision);
  assert.deepEqual(platform.game.publicState, legacy.game);
  assert.deepEqual(
    platform.game.playerStates,
    legacy.room.players.map((player) => ({
      playerId: player.playerId,
      rackCount: player.rackCount,
      initialMeldCompleted: player.initialMeldCompleted,
      forfeited: player.forfeited,
    })),
  );
  const selfState = platform.game.playerStates.find(
    (player) => player.playerId === platform.self.playerId,
  );
  assert.notEqual(selfState, undefined);
  assert.equal(platform.game.privateState.rack.length, selfState?.rackCount);
}

function collectStrings(input: unknown, output = new Set<string>()): Set<string> {
  if (typeof input === "string") {
    output.add(input);
  } else if (Array.isArray(input)) {
    for (const value of input) {
      collectStrings(value, output);
    }
  } else if (typeof input === "object" && input !== null) {
    for (const value of Object.values(input)) {
      collectStrings(value, output);
    }
  }
  return output;
}

test("explicit game을 고른 negotiated V2 host와 legacy V1 guest는 같은 Room의 ack/fan-out/sync에서 format과 semantic privacy를 유지한다", async (t) => {
  const harness = await startHarness();
  t.after(() => stopHarness(harness));

  const legacyClient = await connectClient(harness);
  const v2Client = await connectClient(harness, {
    supportedSnapshotVersions: [2, 1],
  });
  const legacyObserver = observeClient(legacyClient);
  const v2Observer = observeClient(v2Client);
  const legacyToken = await bootstrap(legacyClient, "mixed-legacy");
  const v2Token = await bootstrap(v2Client, "mixed-v2");

  const createAck = await emitWithAck<RoomCreateWireAck>(
    "V2 explicit room:create",
    (acknowledge) => {
      v2Client.emit(
        "room:create",
        {
          kind: "room:create",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("mixed-create"),
          payload: {
            bootstrapCredential: { sessionToken: v2Token },
            nickname: v.parse(NicknameSchema, "PlatformA"),
            gameType: "HANGUL_TILE",
          },
        },
        acknowledge,
      );
    },
  );
  assert.equal(createAck.ok, true);
  if (!createAck.ok) {
    throw new Error("V2 explicit Room create failed.");
  }
  const created = parseV2(createAck.data.snapshot);
  assert.equal(created.room.phase, "LOBBY");
  assert.equal(created.room.gameType, "HANGUL_TILE");
  assert.equal(created.game, null);
  assert.equal(
    (await harness.server.runtime.persistence.findById(created.room.roomId))
      ?.gameType,
    "HANGUL_TILE",
  );
  await waitForSnapshot(
    v2Observer,
    (event) => event.payload.snapshot.room.roomId === created.room.roomId,
  );

  legacyObserver.snapshots.length = 0;
  v2Observer.snapshots.length = 0;
  const joinAck = await emitWithAck<RoomJoinWireAck>(
    "legacy room:join",
    (acknowledge) => {
      legacyClient.emit(
        "room:join",
        {
          kind: "room:join",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("mixed-join"),
          payload: {
            bootstrapCredential: { sessionToken: legacyToken },
            nickname: v.parse(NicknameSchema, "LegacyB"),
            roomCode: created.room.roomCode,
          },
        },
        acknowledge,
      );
    },
  );
  assert.equal(joinAck.ok, true);
  if (!joinAck.ok) {
    throw new Error("Legacy Room join failed.");
  }
  const joined = requireV1(joinAck.data.snapshot);
  assert.equal(joined.room.phase, "LOBBY");

  const lobbyV1Event = await waitForSnapshot(
    legacyObserver,
    (event) => event.payload.snapshot.room.players.length === 2,
  );
  const lobbyV2Event = await waitForSnapshot(
    v2Observer,
    (event) => event.payload.snapshot.room.players.length === 2,
  );
  assertEnvelopeMatchesPayload(lobbyV1Event);
  assertEnvelopeMatchesPayload(lobbyV2Event);
  const lobbyV1 = requireV1(lobbyV1Event.payload.snapshot);
  const lobbyV2 = parseV2(lobbyV2Event.payload.snapshot);
  assert.equal(lobbyV2.room.phase, "LOBBY");
  assert.equal(lobbyV2.game, null);
  assert.deepEqual(lobbyV2.room.players, platformPlayersFromV1(lobbyV1));
  assert.equal(lobbyV2.versions.roomRevision, lobbyV1.versions.roomRevision);
  assert.equal(
    lobbyV2.versions.presenceVersion,
    lobbyV1.versions.presenceVersion,
  );

  legacyObserver.snapshots.length = 0;
  v2Observer.snapshots.length = 0;
  const startAck = await emitWithAck<GameStartWireAck>(
    "V2 game:start",
    (acknowledge) => {
      v2Client.emit(
        "game:start",
        {
          kind: "game:start",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("mixed-start"),
          expectedRoomRevision: lobbyV1.versions.roomRevision,
          payload: {},
        },
        acknowledge,
      );
    },
  );
  assert.equal(startAck.ok, true);
  if (!startAck.ok) {
    throw new Error("Mixed Room game start failed.");
  }
  const startAckSnapshot = requireV2Playing(startAck.data.snapshot);
  assert.equal(startAckSnapshot.game.gameRevision, 0);

  const playingV1Event = await waitForSnapshot(
    legacyObserver,
    (event) => event.versions.gameRevision === 0,
  );
  const playingV2Event = await waitForSnapshot(
    v2Observer,
    (event) => event.versions.gameRevision === 0,
  );
  assertEnvelopeMatchesPayload(playingV1Event);
  assertEnvelopeMatchesPayload(playingV2Event);
  const playingV1 = requireV1Playing(playingV1Event.payload.snapshot);
  const playingV2 = requireV2Playing(playingV2Event.payload.snapshot);
  assertPlayingSemanticParity(playingV1, playingV2);
  assert.equal(playingV1.self.rack.length, 14);
  assert.equal(playingV2.game.privateState.rack.length, 14);
  assert.equal(playingV1.game.bagCounts.consonant, 81);
  assert.equal(playingV1.game.bagCounts.vowel, 47);

  const legacyRackIds = playingV1.self.rack.map((tile) => tile.tileId);
  const v2RackIds = playingV2.game.privateState.rack.map((tile) => tile.tileId);
  const legacyStrings = collectStrings(playingV1Event);
  const v2Strings = collectStrings(playingV2Event);
  for (const tileId of legacyRackIds) {
    assert.equal(v2Strings.has(tileId), false);
  }
  for (const tileId of v2RackIds) {
    assert.equal(legacyStrings.has(tileId), false);
  }

  legacyObserver.snapshots.length = 0;
  v2Observer.snapshots.length = 0;
  const activeIsLegacy =
    playingV1.game.turn.activePlayerId === playingV1.self.playerId;
  const activeClient = activeIsLegacy ? legacyClient : v2Client;
  const drawAck = await emitWithAck<TurnDrawWireAck>(
    "mixed turn:draw",
    (acknowledge) => {
      activeClient.emit(
        "turn:draw",
        {
          kind: "turn:draw",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("mixed-draw"),
          expectedGameRevision: playingV1.versions.gameRevision,
          turnId: playingV1.game.turn.turnId,
          payload: { bagKind: "CONSONANT" },
        },
        acknowledge,
      );
    },
  );
  assert.equal(drawAck.ok, true);
  if (!drawAck.ok) {
    throw new Error("Mixed Room draw failed.");
  }
  if (activeIsLegacy) {
    requireV1Playing(drawAck.data.snapshot);
  } else {
    requireV2Playing(drawAck.data.snapshot);
  }

  const drawnV1Event = await waitForSnapshot(
    legacyObserver,
    (event) => event.versions.gameRevision === 1,
  );
  const drawnV2Event = await waitForSnapshot(
    v2Observer,
    (event) => event.versions.gameRevision === 1,
  );
  const drawnV1 = requireV1Playing(drawnV1Event.payload.snapshot);
  const drawnV2 = requireV2Playing(drawnV2Event.payload.snapshot);
  assertPlayingSemanticParity(drawnV1, drawnV2);
  assert.equal(drawnV1.game.bagCounts.consonant, 80);
  const activeBeforeIds = activeIsLegacy ? legacyRackIds : v2RackIds;
  const activeAfterRack = activeIsLegacy
    ? drawnV1.self.rack
    : drawnV2.game.privateState.rack;
  const drawnTileIds = activeAfterRack
    .map((tile) => tile.tileId)
    .filter((tileId) => !activeBeforeIds.includes(tileId));
  assert.equal(drawnTileIds.length, 1);
  const drawnTileId = drawnTileIds[0];
  if (drawnTileId === undefined) {
    throw new Error("Draw did not add one private Tile to the active rack.");
  }
  const opponentEvent = activeIsLegacy ? drawnV2Event : drawnV1Event;
  assert.equal(collectStrings(opponentEvent).has(drawnTileId), false);

  legacyObserver.snapshots.length = 0;
  v2Observer.snapshots.length = 0;
  const legacySyncAck = await emitWithAck<StateSyncWireAck>(
    "legacy state:sync",
    (acknowledge) => {
      legacyClient.emit(
        "state:sync",
        {
          kind: "state:sync",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("mixed-sync-v1"),
          payload: {},
        },
        acknowledge,
      );
    },
  );
  const v2SyncAck = await emitWithAck<StateSyncWireAck>(
    "V2 state:sync",
    (acknowledge) => {
      v2Client.emit(
        "state:sync",
        {
          kind: "state:sync",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("mixed-sync-v2"),
          payload: {},
        },
        acknowledge,
      );
    },
  );
  assert.equal(legacySyncAck.ok, true);
  assert.equal(v2SyncAck.ok, true);
  if (!legacySyncAck.ok || !v2SyncAck.ok) {
    throw new Error("Mixed state sync failed.");
  }
  const syncedV1 = requireV1Playing(legacySyncAck.data.snapshot);
  const syncedV2 = requireV2Playing(v2SyncAck.data.snapshot);
  assertPlayingSemanticParity(syncedV1, syncedV2);
  requireV1Playing(
    (
      await waitForSnapshot(
        legacyObserver,
        (event) => event.versions.gameRevision === 1,
      )
    ).payload.snapshot,
  );
  requireV2Playing(
    (
      await waitForSnapshot(
        v2Observer,
        (event) => event.versions.gameRevision === 1,
      )
    ).payload.snapshot,
  );
});

test("resume와 primary replacement는 새 socket capability를 사용하고 session:replaced wire를 유지한다", async (t) => {
  const harness = await startHarness();
  t.after(() => stopHarness(harness));

  const host = await connectClient(harness);
  const firstV2 = await connectClient(harness, {
    supportedSnapshotVersions: [2, 1],
  });
  const firstV2Observer = observeClient(firstV2);
  const hostToken = await bootstrap(host, "resume-host");
  const playerToken = await bootstrap(firstV2, "resume-player");
  const createAck = await emitWithAck<RoomCreateWireAck>(
    "resume host create",
    (acknowledge) => {
      host.emit(
        "room:create",
        {
          kind: "room:create",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("resume-create"),
          payload: {
            bootstrapCredential: { sessionToken: hostToken },
            nickname: v.parse(NicknameSchema, "ResumeHost"),
          },
        },
        acknowledge,
      );
    },
  );
  assert.equal(createAck.ok, true);
  if (!createAck.ok) {
    throw new Error("Resume fixture Room create failed.");
  }
  const room = requireV1(createAck.data.snapshot);
  const joinAck = await emitWithAck<RoomJoinWireAck>(
    "resume player join",
    (acknowledge) => {
      firstV2.emit(
        "room:join",
        {
          kind: "room:join",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("resume-join"),
          payload: {
            bootstrapCredential: { sessionToken: playerToken },
            nickname: v.parse(NicknameSchema, "ResumePlayer"),
            roomCode: room.room.roomCode,
          },
        },
        acknowledge,
      );
    },
  );
  assert.equal(joinAck.ok, true);
  if (!joinAck.ok) {
    throw new Error("Resume fixture join failed.");
  }
  const joined = parseV2(joinAck.data.snapshot);

  const replacementV1 = await connectClient(harness, {
    supportedSnapshotVersions: [1],
  });
  const resumeV1Ack = await emitWithAck<SessionResumeWireAck>(
    "explicit V1 replacement resume",
    (acknowledge) => {
      replacementV1.emit(
        "session:resume",
        {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("resume-v1"),
          payload: {
            credential: {
              roomCode: room.room.roomCode,
              sessionToken: playerToken,
            },
            lastSeenVersions: null,
          },
        },
        acknowledge,
      );
    },
  );
  assert.equal(resumeV1Ack.ok, true);
  if (!resumeV1Ack.ok) {
    throw new Error("Explicit V1 replacement resume failed.");
  }
  requireV1(resumeV1Ack.data.snapshot);
  const firstReplacement = await waitForReplacement(firstV2Observer);
  assert.equal(firstReplacement.kind, "session:replaced");
  assert.equal(firstReplacement.protocolVersion, PROTOCOL_VERSION);
  assert.equal(firstReplacement.reason, "NEW_PRIMARY_CONNECTION");

  replacementV1.disconnect();
  await waitForValue("replacement disconnect", () =>
    harness.server.runtime.connectionRegistry.getPrimaryBinding(
      room.room.roomId,
      joined.self.playerId,
    ) === null
      ? true
      : null,
  );

  const resumedV2 = await connectClient(harness, {
    supportedSnapshotVersions: [2, 1],
  });
  const resumeV2Ack = await emitWithAck<SessionResumeWireAck>(
    "V2 replacement resume",
    (acknowledge) => {
      resumedV2.emit(
        "session:resume",
        {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("resume-v2"),
          payload: {
            credential: {
              roomCode: room.room.roomCode,
              sessionToken: playerToken,
            },
            lastSeenVersions: null,
          },
        },
        acknowledge,
      );
    },
  );
  assert.equal(resumeV2Ack.ok, true);
  if (!resumeV2Ack.ok) {
    throw new Error("V2 replacement resume failed.");
  }
  parseV2(resumeV2Ack.data.snapshot);
});

test("malformed 또는 공통 버전 없는 explicit capability는 handler 전 connect_error로 fail-closed한다", async (t) => {
  const harness = await startHarness();
  t.after(() => stopHarness(harness));

  await expectConnectionRejection(
    harness,
    { supportedSnapshotVersions: "2,1" },
    "INVALID_SNAPSHOT_CAPABILITY",
  );
  await expectConnectionRejection(
    harness,
    { supportedSnapshotVersions: [3] },
    "INCOMPATIBLE_SNAPSHOT_VERSION",
  );
  assert.equal(harness.server.io.sockets.sockets.size, 0);
});
