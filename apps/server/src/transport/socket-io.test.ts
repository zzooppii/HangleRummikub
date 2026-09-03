import assert from "node:assert/strict";
import test from "node:test";

import {
  NicknameSchema,
  PROTOCOL_VERSION,
  RequestIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  SessionTokenSchema,
  validateRoomCreateAck,
  validateRoomJoinAck,
  validateSessionBootstrapAck,
  validateSessionReplacedNotification,
  validateSessionResumeAck,
  validateStateSnapshotEvent,
  validateStateSyncAck,
  type ClientToServerEvents,
  type ConnectionStatus,
  type Nickname,
  type PlayerId,
  type RequestId,
  type RoomCode,
  type RoomCreateAck,
  type RoomCreateCommand,
  type RoomJoinAck,
  type RoomJoinCommand,
  type RoomId,
  type ServerToClientEvents,
  type SessionBootstrapAck,
  type SessionBootstrapCommand,
  type SessionResumeAck,
  type SessionResumeCommand,
  type SessionReplacedNotification,
  type SessionToken,
  type StateSnapshot,
  type StateSnapshotEvent,
  type StateSyncAck,
  type StateSyncCommand,
} from "@hangul-rummikub/shared";
import {
  io as createSocketClient,
  type Socket as SocketIoClient,
} from "socket.io-client";
import { parse } from "valibot";

import { LobbyStateSnapshotProjector } from "../application/lobby-state-snapshot-projector.js";
import { RoomSessionApplicationService } from "../application/room-session-service.js";
import { SessionResumeService } from "../application/session-resume-service.js";
import type { ApplicationRuntime } from "../composition-root.js";
import { ConnectionRegistry } from "../infrastructure/connection-registry.js";
import { InMemoryPersistence } from "../infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "../infrastructure/keyed-serial-executor.js";
import {
  FakeIdGenerator,
  NodeCryptoSessionTokenIssuer,
  SystemClock,
} from "../infrastructure/system.js";
import type { RoomCodeGenerator } from "../ports/system.js";
import { createHttpServer } from "../server.js";

const NETWORK_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 5;

type TypedClient = SocketIoClient<ServerToClientEvents, ClientToServerEvents>;

interface RawClientToServerEvents {
  "session:bootstrap": (
    command: unknown,
    acknowledge: (ack: SessionBootstrapAck) => void,
  ) => void;
}

type RawClient = SocketIoClient<ServerToClientEvents, RawClientToServerEvents>;
type SnapshotCommandAck =
  | RoomCreateAck
  | RoomJoinAck
  | SessionResumeAck
  | StateSyncAck;

type ServerUnderTest = ReturnType<typeof createHttpServer>;

type TestHarness = Readonly<{
  server: ServerUnderTest;
  url: string;
  disconnectClients: Array<() => void>;
  networkPayloads: unknown[];
}>;

type ClientObserver = Readonly<{
  snapshots: StateSnapshotEvent[];
  replacements: SessionReplacedNotification[];
}>;

type HostedRoom = Readonly<{
  socket: TypedClient;
  observer: ClientObserver;
  sessionToken: SessionToken;
  snapshot: StateSnapshot;
}>;

function requestId(value: string): RequestId {
  return parse(RequestIdSchema, value);
}

function nickname(value: string): Nickname {
  return parse(NicknameSchema, value);
}

function roomCode(value: string): RoomCode {
  return parse(RoomCodeSchema, value);
}

function sessionToken(value: string): SessionToken {
  return parse(SessionTokenSchema, value);
}

function roomId(value: string): RoomId {
  return parse(RoomIdSchema, value);
}

class SequenceRoomCodeGenerator implements RoomCodeGenerator {
  #cursor = 0;

  constructor(private readonly candidates: readonly RoomCode[]) {}

  get callCount(): number {
    return this.#cursor;
  }

  generateCandidate(): RoomCode {
    const candidate = this.candidates[this.#cursor];
    if (candidate === undefined) {
      throw new Error("Room code test sequence is exhausted.");
    }
    this.#cursor += 1;
    return candidate;
  }
}

type DeterministicRuntime = Readonly<{
  runtime: ApplicationRuntime;
  tokenIssuer: NodeCryptoSessionTokenIssuer;
  roomCodeGenerator: SequenceRoomCodeGenerator;
}>;

function createDeterministicRuntime(): DeterministicRuntime {
  const persistence = new InMemoryPersistence();
  const clock = new SystemClock();
  const connectionRegistry = new ConnectionRegistry();
  const tokenIssuer = new NodeCryptoSessionTokenIssuer();
  const roomCodeGenerator = new SequenceRoomCodeGenerator([
    roomCode("ABCDEF"),
    roomCode("BCDEFG"),
  ]);
  const roomSessionService = new RoomSessionApplicationService({
    roomRepository: persistence,
    sessionRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    clock,
    idGenerator: new FakeIdGenerator(),
    roomCodeGenerator,
    sessionTokenIssuer: tokenIssuer,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(),
  });
  const sessionResumeService = new SessionResumeService({
    sessionRepository: persistence,
    roomRepository: persistence,
    sessionTokenIssuer: tokenIssuer,
  });
  const snapshotProjector = new LobbyStateSnapshotProjector({
    clock,
    presenceReader: {
      async readRoomPresence(targetRoomId) {
        const connectionStatusByPlayerId = new Map<
          PlayerId,
          ConnectionStatus
        >();
        for (const binding of connectionRegistry.listActiveBindings(
          targetRoomId,
        )) {
          connectionStatusByPlayerId.set(binding.playerId, "CONNECTED");
        }
        return {
          presenceVersion: connectionRegistry.getPresenceVersion(targetRoomId),
          connectionStatusByPlayerId,
        };
      },
    },
  });

  return {
    runtime: {
      clock,
      connectionRegistry,
      persistence,
      roomSessionService,
      sessionResumeService,
      snapshotProjector,
    },
    tokenIssuer,
    roomCodeGenerator,
  };
}

function bootstrapCommand(id: string): SessionBootstrapCommand {
  return {
    kind: "session:bootstrap",
    protocolVersion: PROTOCOL_VERSION,
    requestId: requestId(id),
    payload: {},
  };
}

function stateSyncCommand(id: string): StateSyncCommand {
  return {
    kind: "state:sync",
    protocolVersion: PROTOCOL_VERSION,
    requestId: requestId(id),
    payload: {},
  };
}

async function startServer(
  runtime?: ApplicationRuntime,
): Promise<TestHarness> {
  const server =
    runtime === undefined ? createHttpServer() : createHttpServer({ runtime });

  await new Promise<void>((resolve, reject) => {
    const handleError = (error: Error): void => {
      server.httpServer.off("listening", handleListening);
      reject(error);
    };
    const handleListening = (): void => {
      server.httpServer.off("error", handleError);
      resolve();
    };

    server.httpServer.once("error", handleError);
    server.httpServer.once("listening", handleListening);
    server.httpServer.listen(0, "127.0.0.1");
  });

  const address = server.httpServer.address();
  if (address === null || typeof address === "string") {
    await server.io.close();
    throw new Error("Test server did not expose a TCP address.");
  }

  return {
    server,
    url: `http://127.0.0.1:${address.port}`,
    disconnectClients: [],
    networkPayloads: [],
  };
}

async function stopServer(harness: TestHarness): Promise<void> {
  for (const disconnect of harness.disconnectClients) {
    disconnect();
  }

  await harness.server.io.close();
  if (!harness.server.httpServer.listening) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    harness.server.httpServer.close((error) => {
      if (error === undefined) {
        resolve();
      } else {
        reject(error);
      }
    });
  });
}

async function connectTypedClient(harness: TestHarness): Promise<TypedClient> {
  const socket: TypedClient = createSocketClient(harness.url, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  });
  harness.disconnectClients.push(() => {
    socket.disconnect();
  });

  const connected = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      reject(new Error("Timed out connecting Socket.IO test client."));
    }, NETWORK_TIMEOUT_MS);
    const handleConnect = (): void => {
      clearTimeout(timeout);
      socket.off("connect_error", handleConnectError);
      resolve();
    };
    const handleConnectError = (error: Error): void => {
      clearTimeout(timeout);
      socket.off("connect", handleConnect);
      reject(error);
    };

    socket.once("connect", handleConnect);
    socket.once("connect_error", handleConnectError);
  });
  socket.connect();
  await connected;
  return socket;
}

async function connectRawClient(harness: TestHarness): Promise<RawClient> {
  const socket: RawClient = createSocketClient(harness.url, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  });
  harness.disconnectClients.push(() => {
    socket.disconnect();
  });

  const connected = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      reject(new Error("Timed out connecting raw Socket.IO test client."));
    }, NETWORK_TIMEOUT_MS);
    const handleConnect = (): void => {
      clearTimeout(timeout);
      socket.off("connect_error", handleConnectError);
      resolve();
    };
    const handleConnectError = (error: Error): void => {
      clearTimeout(timeout);
      socket.off("connect", handleConnect);
      reject(error);
    };

    socket.once("connect", handleConnect);
    socket.once("connect_error", handleConnectError);
  });
  socket.connect();
  await connected;
  return socket;
}

function observeClient(
  socket: TypedClient,
  networkPayloads: unknown[],
): ClientObserver {
  const snapshots: StateSnapshotEvent[] = [];
  const replacements: SessionReplacedNotification[] = [];

  socket.on("state:snapshot", (event) => {
    snapshots.push(event);
    networkPayloads.push(event);
  });
  socket.on("session:replaced", (event) => {
    replacements.push(event);
    networkPayloads.push(event);
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

    try {
      emit((ack) => {
        clearTimeout(timeout);
        resolve(ack);
      });
    } catch (error) {
      clearTimeout(timeout);
      reject(error);
    }
  });
}

function emitBootstrap(
  socket: TypedClient,
  command: SessionBootstrapCommand,
): Promise<SessionBootstrapAck> {
  return emitWithAck("session:bootstrap", (acknowledge) => {
    socket.emit("session:bootstrap", command, acknowledge);
  });
}

function emitCreate(
  socket: TypedClient,
  command: RoomCreateCommand,
): Promise<RoomCreateAck> {
  return emitWithAck("room:create", (acknowledge) => {
    socket.emit("room:create", command, acknowledge);
  });
}

function emitJoin(
  socket: TypedClient,
  command: RoomJoinCommand,
): Promise<RoomJoinAck> {
  return emitWithAck("room:join", (acknowledge) => {
    socket.emit("room:join", command, acknowledge);
  });
}

function emitResume(
  socket: TypedClient,
  command: SessionResumeCommand,
): Promise<SessionResumeAck> {
  return emitWithAck("session:resume", (acknowledge) => {
    socket.emit("session:resume", command, acknowledge);
  });
}

function emitStateSync(
  socket: TypedClient,
  command: StateSyncCommand,
): Promise<StateSyncAck> {
  return emitWithAck("state:sync", (acknowledge) => {
    socket.emit("state:sync", command, acknowledge);
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

function takeMatching<TValue>(
  values: TValue[],
  predicate: (value: TValue) => boolean,
): TValue | null {
  const index = values.findIndex(predicate);
  if (index < 0) {
    return null;
  }
  const value = values[index];
  if (value === undefined) {
    return null;
  }
  values.splice(index, 1);
  return value;
}

function waitForSnapshot(
  observer: ClientObserver,
  predicate: (event: StateSnapshotEvent) => boolean,
): Promise<StateSnapshotEvent> {
  return waitForValue("matching state:snapshot event", () =>
    takeMatching(observer.snapshots, predicate),
  );
}

function waitForReplacement(
  observer: ClientObserver,
): Promise<SessionReplacedNotification> {
  return waitForValue("session:replaced event", () =>
    takeMatching(observer.replacements, () => true),
  );
}

function requireBootstrapSuccess(ack: SessionBootstrapAck): SessionToken {
  assert.equal(validateSessionBootstrapAck(ack).ok, true);
  assert.equal(ack.ok, true);
  if (!ack.ok) {
    throw new Error("Expected bootstrap success.");
  }
  assert.equal(ack.scope, "UNSCOPED");
  return ack.data.credential.sessionToken;
}

function requireSnapshotSuccess(ack: SnapshotCommandAck): StateSnapshot {
  assert.equal(ack.ok, true);
  if (!ack.ok) {
    throw new Error("Expected snapshot success.");
  }
  assert.equal(ack.scope, "ROOM");
  assert.deepEqual(ack.versions, ack.data.snapshot.versions);
  return ack.data.snapshot;
}

function requireFailureCode(
  ack: SnapshotCommandAck | SessionBootstrapAck,
  expectedCode: string,
): void {
  assert.equal(ack.ok, false);
  if (ack.ok) {
    throw new Error("Expected command failure.");
  }
  assert.equal(ack.error.code, expectedCode);
}

async function bootstrap(
  socket: TypedClient,
  id: string,
): Promise<SessionToken> {
  return requireBootstrapSuccess(await emitBootstrap(socket, bootstrapCommand(id)));
}

async function createHostedRoom(
  harness: TestHarness,
  hostName: string,
): Promise<HostedRoom> {
  const socket = await connectTypedClient(harness);
  const observer = observeClient(socket, harness.networkPayloads);
  const token = await bootstrap(socket, `${hostName}-bootstrap`);
  const ack = await emitCreate(socket, {
    kind: "room:create",
    protocolVersion: PROTOCOL_VERSION,
    requestId: requestId(`${hostName}-create`),
    payload: {
      bootstrapCredential: { sessionToken: token },
      nickname: nickname(hostName),
    },
  });
  assert.equal(validateRoomCreateAck(ack).ok, true);
  harness.networkPayloads.push(ack);
  const snapshot = requireSnapshotSuccess(ack);
  await waitForSnapshot(
    observer,
    (event) =>
      event.payload.snapshot.versions.presenceVersion ===
      snapshot.versions.presenceVersion,
  );

  return { socket, observer, sessionToken: token, snapshot };
}

function playerStatus(snapshot: StateSnapshot, playerId: string) {
  return snapshot.room.players.find((player) => player.playerId === playerId)
    ?.connectionStatus;
}

function collectObjectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectObjectKeys);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }

  return Object.keys(value).flatMap((key) => [
    key,
    ...collectObjectKeys(Reflect.get(value, key)),
  ]);
}

function assertNoNetworkSecrets(
  payloads: readonly unknown[],
  rawTokens: readonly SessionToken[],
): void {
  const forbiddenKeys = new Set([
    "bootstrapCredential",
    "connectionGeneration",
    "digestHex",
    "rawToken",
    "sessionToken",
    "socketId",
    "storageRevision",
    "tokenHash",
    "verificationData",
  ]);

  for (const payload of payloads) {
    for (const key of collectObjectKeys(payload)) {
      assert.equal(forbiddenKeys.has(key), false, `network secret key: ${key}`);
    }
    const serialized = JSON.stringify(payload);
    assert.notEqual(serialized, undefined);
    if (serialized !== undefined) {
      for (const token of rawTokens) {
        assert.equal(serialized.includes(token), false, "raw token on network");
      }
    }
  }
}

test(
  "Socket.IO Room/Session transport integration",
  { timeout: 60_000 },
  async (context) => {
    await context.test("bootstrap, Room create, Host snapshot, current state sync와 secret projection", async () => {
      const harness = await startServer();
      try {
        const host = await connectTypedClient(harness);
        const observer = observeClient(host, harness.networkPayloads);
        const bootstrapAck = await emitBootstrap(
          host,
          bootstrapCommand("bootstrap-direct-token"),
        );
        assert.equal(validateSessionBootstrapAck(bootstrapAck).ok, true);
        const token = requireBootstrapSuccess(bootstrapAck);
        assert.equal(typeof token, "string");
        assert.ok(token.length >= 32);

        const createAck = await emitCreate(host, {
          kind: "room:create",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("create-room"),
          payload: {
            bootstrapCredential: { sessionToken: token },
            nickname: nickname("Host"),
          },
        });
        assert.equal(validateRoomCreateAck(createAck).ok, true);
        harness.networkPayloads.push(createAck);
        const created = requireSnapshotSuccess(createAck);
        assert.equal(created.room.phase, "LOBBY");
        assert.equal(created.room.players.length, 1);
        assert.equal(created.room.players[0]?.isHost, true);
        assert.equal(created.room.players[0]?.connectionStatus, "CONNECTED");
        assert.equal(created.self.playerId, created.room.players[0]?.playerId);
        assert.equal(created.versions.roomRevision, 0);
        assert.equal(created.versions.gameRevision, null);
        assert.equal(created.versions.presenceVersion, 1);

        const createEvent = await waitForSnapshot(
          observer,
          (event) => event.payload.snapshot.room.roomId === created.room.roomId,
        );
        assert.equal(validateStateSnapshotEvent(createEvent).ok, true);
        assert.deepEqual(createEvent.payload.snapshot.versions, created.versions);
        assert.deepEqual(createEvent.payload.snapshot.room, created.room);
        assert.deepEqual(createEvent.payload.snapshot.self, created.self);
        assert.ok(createEvent.payload.snapshot.serverTime >= created.serverTime);

        const syncAck = await emitStateSync(
          host,
          stateSyncCommand("current-state-sync"),
        );
        assert.equal(validateStateSyncAck(syncAck).ok, true);
        harness.networkPayloads.push(syncAck);
        const synced = requireSnapshotSuccess(syncAck);
        assert.equal(synced.self.playerId, created.self.playerId);
        assert.deepEqual(synced.versions, created.versions);
        const syncEvent = await waitForSnapshot(
          observer,
          (event) =>
            event.payload.snapshot.serverTime === synced.serverTime &&
            event.payload.snapshot.self.playerId === synced.self.playerId,
        );
        assert.equal(validateStateSnapshotEvent(syncEvent).ok, true);

        assertNoNetworkSecrets(harness.networkPayloads, [token]);
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("join fanout, disconnect presence, resume와 Player 보존", async () => {
      const harness = await startServer();
      try {
        const host = await createHostedRoom(harness, "Host");
        const guestSocket = await connectTypedClient(harness);
        const guestObserver = observeClient(
          guestSocket,
          harness.networkPayloads,
        );
        const guestToken = await bootstrap(guestSocket, "guest-bootstrap");
        const joinAck = await emitJoin(guestSocket, {
          kind: "room:join",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("guest-join"),
          payload: {
            bootstrapCredential: { sessionToken: guestToken },
            nickname: nickname("Guest"),
            roomCode: host.snapshot.room.roomCode,
          },
        });
        assert.equal(validateRoomJoinAck(joinAck).ok, true);
        harness.networkPayloads.push(joinAck);
        const joined = requireSnapshotSuccess(joinAck);
        assert.equal(joined.room.players.length, 2);
        assert.equal(joined.versions.roomRevision, 1);
        assert.equal(joined.versions.presenceVersion, 2);
        assert.equal(joined.self.playerId === host.snapshot.self.playerId, false);
        const guestPlayerId = joined.self.playerId;

        const [hostJoinEvent, guestJoinEvent] = await Promise.all([
          waitForSnapshot(
            host.observer,
            (event) => event.payload.snapshot.versions.presenceVersion === 2,
          ),
          waitForSnapshot(
            guestObserver,
            (event) => event.payload.snapshot.versions.presenceVersion === 2,
          ),
        ]);
        assert.equal(
          hostJoinEvent.payload.snapshot.self.playerId,
          host.snapshot.self.playerId,
        );
        assert.equal(guestJoinEvent.payload.snapshot.self.playerId, guestPlayerId);
        assert.deepEqual(
          hostJoinEvent.payload.snapshot.room,
          guestJoinEvent.payload.snapshot.room,
        );

        guestSocket.disconnect();
        const offlineEvent = await waitForSnapshot(
          host.observer,
          (event) =>
            playerStatus(event.payload.snapshot, guestPlayerId) === "OFFLINE",
        );
        const offline = offlineEvent.payload.snapshot;
        assert.equal(offline.versions.presenceVersion, 3);
        assert.equal(offline.versions.roomRevision, joined.versions.roomRevision);
        assert.equal(offline.room.players.length, 2);

        const resumedSocket = await connectTypedClient(harness);
        const resumedObserver = observeClient(
          resumedSocket,
          harness.networkPayloads,
        );
        const resumeAck = await emitResume(resumedSocket, {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("guest-resume"),
          payload: {
            credential: {
              roomCode: joined.room.roomCode,
              sessionToken: guestToken,
            },
            lastSeenVersions: offline.versions,
          },
        });
        assert.equal(validateSessionResumeAck(resumeAck).ok, true);
        harness.networkPayloads.push(resumeAck);
        const resumed = requireSnapshotSuccess(resumeAck);
        assert.equal(resumed.self.playerId, guestPlayerId);
        assert.equal(resumed.room.players.length, 2);
        assert.equal(
          new Set(resumed.room.players.map((player) => player.playerId)).size,
          2,
        );
        assert.equal(resumed.versions.roomRevision, joined.versions.roomRevision);
        assert.equal(resumed.versions.presenceVersion, 4);
        assert.equal(playerStatus(resumed, guestPlayerId), "CONNECTED");
        await waitForSnapshot(
          resumedObserver,
          (event) => event.payload.snapshot.versions.presenceVersion === 4,
        );

        assertNoNetworkSecrets(harness.networkPayloads, [
          host.sessionToken,
          guestToken,
        ]);
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("duplicate resume replacement와 stale disconnect는 새 primary를 보존한다", async () => {
      const harness = await startServer();
      try {
        const host = await createHostedRoom(harness, "Host");
        const oldSocketId = host.socket.id;
        assert.notEqual(oldSocketId, undefined);

        const replacementSocket = await connectTypedClient(harness);
        const replacementObserver = observeClient(
          replacementSocket,
          harness.networkPayloads,
        );
        const resumeAck = await emitResume(replacementSocket, {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("replacement-resume"),
          payload: {
            credential: {
              roomCode: host.snapshot.room.roomCode,
              sessionToken: host.sessionToken,
            },
            lastSeenVersions: host.snapshot.versions,
          },
        });
        assert.equal(validateSessionResumeAck(resumeAck).ok, true);
        harness.networkPayloads.push(resumeAck);
        const replacement = requireSnapshotSuccess(resumeAck);
        assert.equal(
          replacement.versions.presenceVersion,
          host.snapshot.versions.presenceVersion,
        );

        const replaced = await waitForReplacement(host.observer);
        assert.equal(validateSessionReplacedNotification(replaced).ok, true);
        assert.equal(replaced.reason, "NEW_PRIMARY_CONNECTION");

        const oldSyncAck = await emitStateSync(
          host.socket,
          stateSyncCommand("replaced-old-sync"),
        );
        assert.equal(validateStateSyncAck(oldSyncAck).ok, true);
        harness.networkPayloads.push(oldSyncAck);
        requireFailureCode(oldSyncAck, "UNAUTHENTICATED");

        host.socket.disconnect();
        if (oldSocketId !== undefined) {
          await waitForValue("stale server socket removal", () =>
            harness.server.io.sockets.sockets.has(oldSocketId) ? null : true,
          );
        }

        const replacementSyncAck = await emitStateSync(
          replacementSocket,
          stateSyncCommand("replacement-sync"),
        );
        assert.equal(validateStateSyncAck(replacementSyncAck).ok, true);
        harness.networkPayloads.push(replacementSyncAck);
        const afterStaleDisconnect = requireSnapshotSuccess(
          replacementSyncAck,
        );
        assert.equal(
          afterStaleDisconnect.versions.presenceVersion,
          replacement.versions.presenceVersion,
        );
        assert.equal(
          playerStatus(afterStaleDisconnect, replacement.self.playerId),
          "CONNECTED",
        );
        await waitForSnapshot(
          replacementObserver,
          (event) =>
            event.payload.snapshot.serverTime ===
            afterStaleDisconnect.serverTime,
        );

        assertNoNetworkSecrets(harness.networkPayloads, [host.sessionToken]);
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("같은 socket의 resume 및 accepted create 재시도는 identity와 presence를 중복 생성하지 않는다", async () => {
      const harness = await startServer();
      try {
        const host = await createHostedRoom(harness, "Host");

        const createReplayAck = await emitCreate(host.socket, {
          kind: "room:create",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("Host-create"),
          payload: {
            bootstrapCredential: { sessionToken: host.sessionToken },
            nickname: nickname("Host"),
          },
        });
        assert.equal(validateRoomCreateAck(createReplayAck).ok, true);
        const createReplay = requireSnapshotSuccess(createReplayAck);
        assert.equal(createReplay.room.roomId, host.snapshot.room.roomId);
        assert.equal(createReplay.self.playerId, host.snapshot.self.playerId);
        assert.deepEqual(createReplay.versions, host.snapshot.versions);
        assert.equal(createReplay.room.players.length, 1);

        host.socket.disconnect();
        await waitForValue("Host offline registry transition", () =>
          harness.server.runtime.connectionRegistry.getConnectionStatus(
            host.snapshot.room.roomId,
            host.snapshot.self.playerId,
          ) === "OFFLINE" &&
          harness.server.runtime.connectionRegistry.getPresenceVersion(
            host.snapshot.room.roomId,
          ) === 2
            ? true
            : null,
        );

        const resumedSocket = await connectTypedClient(harness);
        observeClient(resumedSocket, harness.networkPayloads);
        const command: SessionResumeCommand = {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("same-socket-resume"),
          payload: {
            credential: {
              roomCode: host.snapshot.room.roomCode,
              sessionToken: host.sessionToken,
            },
            lastSeenVersions: host.snapshot.versions,
          },
        };

        const firstAck = await emitResume(resumedSocket, command);
        assert.equal(validateSessionResumeAck(firstAck).ok, true);
        const first = requireSnapshotSuccess(firstAck);
        const firstBinding =
          harness.server.runtime.connectionRegistry.getPrimaryBinding(
            first.room.roomId,
            first.self.playerId,
          );
        assert.notEqual(firstBinding, null);

        const secondAck = await emitResume(resumedSocket, command);
        assert.equal(validateSessionResumeAck(secondAck).ok, true);
        const second = requireSnapshotSuccess(secondAck);
        const secondBinding =
          harness.server.runtime.connectionRegistry.getPrimaryBinding(
            second.room.roomId,
            second.self.playerId,
          );

        assert.equal(second.room.roomId, first.room.roomId);
        assert.equal(second.self.playerId, first.self.playerId);
        assert.equal(
          second.versions.presenceVersion,
          first.versions.presenceVersion,
        );
        assert.equal(second.versions.presenceVersion, 3);
        assert.deepEqual(secondBinding, firstBinding);
        assert.equal(second.room.players.length, 1);
        assert.equal(
          harness.server.runtime.connectionRegistry.listActiveBindings(
            second.room.roomId,
          ).length,
          1,
        );
        const persistedRoom =
          await harness.server.runtime.persistence.findById(second.room.roomId);
        assert.equal(persistedRoom?.players.length, 1);
        assert.equal(persistedRoom?.roomRevision, 0);
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("같은 socket의 concurrent identity command는 canonical Room 하나만 생성한다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const socket = await connectTypedClient(harness);
        observeClient(socket, harness.networkPayloads);
        const firstToken = await bootstrap(socket, "parallel-bootstrap-a");
        const secondToken = await bootstrap(socket, "parallel-bootstrap-b");
        const firstCommand: RoomCreateCommand = {
          kind: "room:create",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("parallel-create-a"),
          payload: {
            bootstrapCredential: { sessionToken: firstToken },
            nickname: nickname("Alpha"),
          },
        };
        const secondCommand: RoomCreateCommand = {
          kind: "room:create",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("parallel-create-b"),
          payload: {
            bootstrapCredential: { sessionToken: secondToken },
            nickname: nickname("Beta"),
          },
        };

        const [firstAck, secondAck] = await Promise.all([
          emitCreate(socket, firstCommand),
          emitCreate(socket, secondCommand),
        ]);
        assert.equal(validateRoomCreateAck(firstAck).ok, true);
        assert.equal(validateRoomCreateAck(secondAck).ok, true);
        const attempts = [
          { ack: firstAck, token: firstToken },
          { ack: secondAck, token: secondToken },
        ];
        assert.equal(attempts.filter(({ ack }) => ack.ok).length, 1);

        const accepted = attempts.find(({ ack }) => ack.ok);
        const rejected = attempts.find(({ ack }) => !ack.ok);
        if (accepted === undefined || !accepted.ack.ok) {
          throw new Error("Expected one accepted identity command.");
        }
        if (rejected === undefined || rejected.ack.ok) {
          throw new Error("Expected one rejected identity command.");
        }
        assert.equal(rejected.ack.error.code, "UNAUTHENTICATED");

        const acceptedSnapshot = accepted.ack.data.snapshot;
        const firstPersistedRoom =
          await deterministic.runtime.persistence.findById(
            roomId("test-room-1"),
          );
        const secondPersistedRoom =
          await deterministic.runtime.persistence.findById(
            roomId("test-room-2"),
          );
        assert.notEqual(firstPersistedRoom, null);
        assert.equal(secondPersistedRoom, null);
        assert.equal(
          firstPersistedRoom?.roomId,
          acceptedSnapshot.room.roomId,
        );
        assert.equal(deterministic.roomCodeGenerator.callCount, 1);

        for (const attempt of attempts) {
          const verificationData =
            deterministic.tokenIssuer.deriveVerificationData(attempt.token);
          const session =
            await deterministic.runtime.persistence.findByVerificationData(
              verificationData,
            );
          assert.equal(session?.state, attempt.ack.ok ? "BOUND" : "UNBOUND");
        }
        assert.equal(
          deterministic.runtime.connectionRegistry.listActiveBindings(
            acceptedSnapshot.room.roomId,
          ).length,
          1,
        );
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("replacement notification 동기 실패가 새 primary와 resume ack를 깨지 않는다", async () => {
      const harness = await startServer();
      try {
        const host = await createHostedRoom(harness, "Host");
        const oldSocketId = host.socket.id;
        if (oldSocketId === undefined) {
          throw new Error("Connected client must have a socket ID.");
        }
        const oldServerSocket = harness.server.io.sockets.sockets.get(
          oldSocketId,
        );
        if (oldServerSocket === undefined) {
          throw new Error("Server-side socket must exist for the host.");
        }

        const originalEmitDescriptor = Object.getOwnPropertyDescriptor(
          oldServerSocket,
          "emit",
        );
        Object.defineProperty(oldServerSocket, "emit", {
          configurable: true,
          value(): never {
            throw new Error("Injected replacement notification failure.");
          },
        });

        try {
          const replacementSocket = await connectTypedClient(harness);
          const resumeAck = await emitResume(replacementSocket, {
            kind: "session:resume",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("replacement-notification-failure"),
            payload: {
              credential: {
                roomCode: host.snapshot.room.roomCode,
                sessionToken: host.sessionToken,
              },
              lastSeenVersions: host.snapshot.versions,
            },
          });

          assert.equal(validateSessionResumeAck(resumeAck).ok, true);
          const resumed = requireSnapshotSuccess(resumeAck);
          assert.equal(resumed.self.playerId, host.snapshot.self.playerId);
          assert.equal(
            resumed.versions.presenceVersion,
            host.snapshot.versions.presenceVersion,
          );

          const replacementSyncAck = await emitStateSync(
            replacementSocket,
            stateSyncCommand("replacement-after-notification-failure"),
          );
          assert.equal(validateStateSyncAck(replacementSyncAck).ok, true);
          assert.equal(
            requireSnapshotSuccess(replacementSyncAck).self.playerId,
            host.snapshot.self.playerId,
          );

          const oldSyncAck = await emitStateSync(
            host.socket,
            stateSyncCommand("old-after-notification-failure"),
          );
          assert.equal(validateStateSyncAck(oldSyncAck).ok, true);
          requireFailureCode(oldSyncAck, "UNAUTHENTICATED");
        } finally {
          if (originalEmitDescriptor === undefined) {
            Reflect.deleteProperty(oldServerSocket, "emit");
          } else {
            Object.defineProperty(
              oldServerSocket,
              "emit",
              originalEmitDescriptor,
            );
          }
        }
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("malformed와 incompatible command는 안전한 validation ack를 반환한다", async () => {
      const harness = await startServer();
      try {
        const socket = await connectRawClient(harness);
        const malformed = await emitWithAck<SessionBootstrapAck>(
          "malformed session:bootstrap",
          (acknowledge) => {
            socket.emit("session:bootstrap", null, acknowledge);
          },
        );
        assert.equal(validateSessionBootstrapAck(malformed).ok, true);
        requireFailureCode(malformed, "INVALID_PAYLOAD");
        if (!malformed.ok) {
          assert.equal(malformed.requestId, null);
        }

        const incompatible = await emitWithAck<SessionBootstrapAck>(
          "incompatible session:bootstrap",
          (acknowledge) => {
            socket.emit(
              "session:bootstrap",
              {
                kind: "session:bootstrap",
                protocolVersion: 2,
                requestId: "incompatible-request",
                payload: {},
              },
              acknowledge,
            );
          },
        );
        assert.equal(validateSessionBootstrapAck(incompatible).ok, true);
        requireFailureCode(incompatible, "INCOMPATIBLE_PROTOCOL");
        if (!incompatible.ok) {
          assert.equal(incompatible.requestId, "incompatible-request");
        }
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("resume은 invalid token과 다른 Room code를 같은 safe failure로 거절한다", async () => {
      const harness = await startServer();
      try {
        const host = await createHostedRoom(harness, "Host");
        const client = await connectTypedClient(harness);
        const invalidTokenAck = await emitResume(client, {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("invalid-token-resume"),
          payload: {
            credential: {
              roomCode: host.snapshot.room.roomCode,
              sessionToken: sessionToken("not-a-real-session-token"),
            },
            lastSeenVersions: null,
          },
        });
        assert.equal(validateSessionResumeAck(invalidTokenAck).ok, true);
        requireFailureCode(invalidTokenAck, "SESSION_NOT_FOUND");

        const wrongRoomAck = await emitResume(client, {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("wrong-room-resume"),
          payload: {
            credential: {
              roomCode: roomCode(
                host.snapshot.room.roomCode === "ABCDEF"
                  ? "BCDEFG"
                  : "ABCDEF",
              ),
              sessionToken: host.sessionToken,
            },
            lastSeenVersions: null,
          },
        });
        assert.equal(validateSessionResumeAck(wrongRoomAck).ok, true);
        requireFailureCode(wrongRoomAck, "SESSION_NOT_FOUND");
        if (!invalidTokenAck.ok && !wrongRoomAck.ok) {
          assert.deepEqual(invalidTokenAck.error, wrongRoomAck.error);
        }
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("fresh process-memory runtime에서는 이전 bound session을 복구하지 못한다", async () => {
      const original = await startServer();
      let token: SessionToken;
      let code: RoomCode;
      try {
        const host = await createHostedRoom(original, "Host");
        token = host.sessionToken;
        code = host.snapshot.room.roomCode;
      } finally {
        await stopServer(original);
      }

      const restarted = await startServer();
      try {
        const socket = await connectTypedClient(restarted);
        const ack = await emitResume(socket, {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("restart-resume"),
          payload: {
            credential: { roomCode: code, sessionToken: token },
            lastSeenVersions: null,
          },
        });
        assert.equal(validateSessionResumeAck(ack).ok, true);
        requireFailureCode(ack, "SESSION_NOT_FOUND");
      } finally {
        await stopServer(restarted);
      }
    });
  },
);
