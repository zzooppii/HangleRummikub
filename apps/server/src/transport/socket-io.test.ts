import assert from "node:assert/strict";
import test from "node:test";

import {
  GameRevisionSchema,
  NicknameSchema,
  PROTOCOL_VERSION,
  RequestIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  SessionTokenSchema,
  validateGameFinishedEvent,
  validateGameStartAck,
  validateFinishedStateSnapshot,
  validatePlayingStateSnapshot,
  validateRoomCreateAck,
  validateRoomJoinAck,
  validateSessionBootstrapAck,
  validateSessionReplacedNotification,
  validateSessionResumeAck,
  validateStateSnapshotEvent,
  validateStateSyncAck,
  validateTurnStartedEvent,
  validateTurnDrawAck,
  validateTurnPassAck,
  validateTurnSubmitAck,
  type ClientToServerEvents,
  type FinishedStateSnapshot,
  type GameFinishedEvent,
  type GameStartAck,
  type GameStartCommand,
  type Nickname,
  type PlayingStateSnapshot,
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
  type TileId,
  type TurnStartedEvent,
  type TurnDrawAck,
  type TurnDrawCommand,
  type TurnPassAck,
  type TurnPassCommand,
  type TurnSubmitAck,
  type TurnSubmitCommand,
} from "@hangul-rummikub/shared";
import {
  io as createSocketClient,
  type Socket as SocketIoClient,
} from "socket.io-client";
import { parse } from "valibot";

import { GameStartService } from "../application/game-start-service.js";
import { LobbyStateSnapshotProjector } from "../application/lobby-state-snapshot-projector.js";
import { RoomSessionApplicationService } from "../application/room-session-service.js";
import { SessionResumeService } from "../application/session-resume-service.js";
import { TurnDrawService } from "../application/turn-draw-service.js";
import { TurnPassService } from "../application/turn-pass-service.js";
import { TurnSubmitService } from "../application/turn-submit-service.js";
import { TurnTimeoutService } from "../application/turn-timeout-service.js";
import type { ApplicationRuntime } from "../composition-root.js";
import type {
  FinishedGameState,
  PlayingGameState,
} from "../domain/game/game-state.js";
import {
  JOKER_ALLOWED_SYMBOLS,
  type OrdinaryTileInstance,
} from "../domain/game/tile-inventory.js";
import { ConnectionRegistry } from "../infrastructure/connection-registry.js";
import { ConnectionRegistryPresenceReader } from "../infrastructure/connection-registry-presence-reader.js";
import { InMemoryPersistence } from "../infrastructure/in-memory-persistence.js";
import { InProcessTurnScheduler } from "../infrastructure/in-process-turn-scheduler.js";
import { KeyedSerialExecutor } from "../infrastructure/keyed-serial-executor.js";
import { OverdueTurnSweeper } from "../infrastructure/overdue-turn-sweeper.js";
import { TestDictionaryProvider } from "../infrastructure/test-dictionary-provider.js";
import type { RoomRecord } from "../model/persistence.js";
import {
  FakeIdGenerator,
  NodeCryptoSessionTokenIssuer,
  SystemClock,
} from "../infrastructure/system.js";
import type {
  PlayerPresenceReader,
  RoomPresenceReadModel,
} from "../ports/player-presence-reader.js";
import type {
  RandomSource,
  RoomCodeGenerator,
  ScheduledTurnDeadline,
} from "../ports/system.js";
import { createHttpServer } from "../server.js";

const NETWORK_TIMEOUT_MS = 5_000;
const POLL_INTERVAL_MS = 5;

type TypedClient = SocketIoClient<ServerToClientEvents, ClientToServerEvents>;

interface RawClientToServerEvents {
  "session:bootstrap": (
    command: unknown,
    acknowledge: (ack: SessionBootstrapAck) => void,
  ) => void;
  "game:start": (
    command: unknown,
    acknowledge: (ack: GameStartAck) => void,
  ) => void;
  "turn:submit": (
    command: unknown,
    acknowledge: (ack: TurnSubmitAck) => void,
  ) => void;
  "turn:draw": (
    command: unknown,
    acknowledge: (ack: TurnDrawAck) => void,
  ) => void;
  "turn:pass": (
    command: unknown,
    acknowledge: (ack: TurnPassAck) => void,
  ) => void;
}

type RawClient = SocketIoClient<ServerToClientEvents, RawClientToServerEvents>;
type SnapshotCommandAck =
  | GameStartAck
  | RoomCreateAck
  | RoomJoinAck
  | SessionResumeAck
  | StateSyncAck
  | TurnDrawAck
  | TurnPassAck
  | TurnSubmitAck;

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
  turnStarts: TurnStartedEvent[];
  gameFinishes: GameFinishedEvent[];
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

class ZeroRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be positive.");
    }
    return 0;
  }
}

class InjectableFailurePresenceReader implements PlayerPresenceReader {
  #successfulReadsBeforeFailure: number | null = null;
  #nextReadBarrier:
    | Readonly<{
        markEntered(): void;
        releasePromise: Promise<void>;
      }>
    | null = null;

  constructor(private readonly delegate: PlayerPresenceReader) {}

  failAfterSuccessfulReads(count: number): void {
    if (!Number.isSafeInteger(count) || count < 0) {
      throw new RangeError("Failure countdown must be non-negative.");
    }
    this.#successfulReadsBeforeFailure = count;
  }

  blockNextRead(): Readonly<{
    entered: Promise<void>;
    release(): void;
  }> {
    if (this.#nextReadBarrier !== null) {
      throw new Error("A presence read is already blocked.");
    }

    let markEntered = (): void => {};
    let release = (): void => {};
    const entered = new Promise<void>((resolve) => {
      markEntered = resolve;
    });
    const releasePromise = new Promise<void>((resolve) => {
      release = resolve;
    });
    this.#nextReadBarrier = { markEntered, releasePromise };
    return { entered, release };
  }

  async readRoomPresence(roomId: RoomId): Promise<RoomPresenceReadModel> {
    const barrier = this.#nextReadBarrier;
    if (barrier !== null) {
      this.#nextReadBarrier = null;
      barrier.markEntered();
      await barrier.releasePromise;
    }

    if (this.#successfulReadsBeforeFailure !== null) {
      if (this.#successfulReadsBeforeFailure === 0) {
        this.#successfulReadsBeforeFailure = null;
        throw new Error("Injected projection delivery failure.");
      }
      this.#successfulReadsBeforeFailure -= 1;
    }

    return this.delegate.readRoomPresence(roomId);
  }
}

type DeterministicRuntime = Readonly<{
  runtime: ApplicationRuntime;
  tokenIssuer: NodeCryptoSessionTokenIssuer;
  roomCodeGenerator: SequenceRoomCodeGenerator;
  presenceReader: InjectableFailurePresenceReader;
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
  const idGenerator = new FakeIdGenerator();
  const roomMutationExecutor = new KeyedSerialExecutor<RoomId>();
  const presenceReader = new InjectableFailurePresenceReader(
    new ConnectionRegistryPresenceReader(connectionRegistry),
  );
  let acceptsTimeoutWork = false;
  let turnTimeoutService: TurnTimeoutService | undefined;
  const enqueueTimeout = async (
    deadline: ScheduledTurnDeadline,
  ): Promise<void> => {
    if (!acceptsTimeoutWork || turnTimeoutService === undefined) {
      return;
    }
    await turnTimeoutService.timeout(deadline);
  };
  const turnScheduler = new InProcessTurnScheduler({
    clock,
    onDeadline: enqueueTimeout,
  });
  const overdueTurnSweeper = new OverdueTurnSweeper({
    activeTurnReader: persistence,
    clock,
    enqueueTimeout,
  });
  const roomSessionService = new RoomSessionApplicationService({
    roomRepository: persistence,
    sessionRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    clock,
    idGenerator,
    roomCodeGenerator,
    sessionTokenIssuer: tokenIssuer,
    roomMutationExecutor,
  });
  const sessionResumeService = new SessionResumeService({
    sessionRepository: persistence,
    roomRepository: persistence,
    sessionTokenIssuer: tokenIssuer,
  });
  const gameStartService = new GameStartService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    presenceReader,
    clock,
    idGenerator,
    randomSource: new ZeroRandomSource(),
    turnScheduler,
  });
  const turnSubmitService = new TurnSubmitService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    dictionaryProvider: new TestDictionaryProvider(),
    turnScheduler,
  });
  const turnDrawService = new TurnDrawService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    turnScheduler,
  });
  const turnPassService = new TurnPassService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    turnScheduler,
  });
  turnTimeoutService = new TurnTimeoutService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    randomSource: new ZeroRandomSource(),
    turnScheduler,
  });
  const snapshotProjector = new LobbyStateSnapshotProjector({
    clock,
    presenceReader,
  });

  return {
    runtime: {
      clock,
      connectionRegistry,
      gameStartService,
      persistence,
      roomSessionService,
      sessionResumeService,
      snapshotProjector,
      turnDrawService,
      turnPassService,
      turnScheduler,
      turnSubmitService,
      turnTimeoutService,
      overdueTurnSweeper,
      start() {
        acceptsTimeoutWork = true;
        turnScheduler.start();
        overdueTurnSweeper.start();
      },
      stop() {
        acceptsTimeoutWork = false;
        overdueTurnSweeper.stop();
        turnScheduler.stop();
      },
    },
    tokenIssuer,
    roomCodeGenerator,
    presenceReader,
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
  const turnStarts: TurnStartedEvent[] = [];
  const gameFinishes: GameFinishedEvent[] = [];

  socket.on("state:snapshot", (event) => {
    snapshots.push(event);
    networkPayloads.push(event);
  });
  socket.on("session:replaced", (event) => {
    replacements.push(event);
    networkPayloads.push(event);
  });
  socket.on("turn:started", (event) => {
    turnStarts.push(event);
    networkPayloads.push(event);
  });
  socket.on("game:finished", (event) => {
    gameFinishes.push(event);
    networkPayloads.push(event);
  });

  return { snapshots, replacements, turnStarts, gameFinishes };
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

function emitGameStart(
  socket: TypedClient,
  command: GameStartCommand,
): Promise<GameStartAck> {
  return emitWithAck("game:start", (acknowledge) => {
    socket.emit("game:start", command, acknowledge);
  });
}

function emitTurnSubmit(
  socket: TypedClient,
  command: TurnSubmitCommand,
): Promise<TurnSubmitAck> {
  return emitWithAck("turn:submit", (acknowledge) => {
    socket.emit("turn:submit", command, acknowledge);
  });
}

function emitTurnDraw(
  socket: TypedClient,
  command: TurnDrawCommand,
): Promise<TurnDrawAck> {
  return emitWithAck("turn:draw", (acknowledge) => {
    socket.emit("turn:draw", command, acknowledge);
  });
}

function emitTurnPass(
  socket: TypedClient,
  command: TurnPassCommand,
): Promise<TurnPassAck> {
  return emitWithAck("turn:pass", (acknowledge) => {
    socket.emit("turn:pass", command, acknowledge);
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

async function waitForAsyncValue<TValue>(
  label: string,
  read: () => Promise<TValue | null>,
): Promise<TValue> {
  const deadline = Date.now() + NETWORK_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const value = await read();
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

function waitForTurnStarted(
  observer: ClientObserver,
  predicate: (event: TurnStartedEvent) => boolean,
): Promise<TurnStartedEvent> {
  return waitForValue("matching turn:started event", () =>
    takeMatching(observer.turnStarts, predicate),
  );
}

function waitForGameFinished(
  observer: ClientObserver,
  predicate: (event: GameFinishedEvent) => boolean,
): Promise<GameFinishedEvent> {
  return waitForValue("matching game:finished event", () =>
    takeMatching(observer.gameFinishes, predicate),
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

function requirePlayingSnapshot(
  snapshot: StateSnapshot,
): PlayingStateSnapshot {
  const validation = validatePlayingStateSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error("Expected a PLAYING StateSnapshot.");
  }
  assert.equal(validation.value.versions.gameRevision, 0);
  return validation.value;
}

function requireAnyPlayingSnapshot(
  snapshot: StateSnapshot,
): PlayingStateSnapshot {
  const validation = validatePlayingStateSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error("Expected a PLAYING StateSnapshot.");
  }
  return validation.value;
}

function requireFinishedSnapshot(
  snapshot: StateSnapshot,
): FinishedStateSnapshot {
  const validation = validateFinishedStateSnapshot(snapshot);
  if (!validation.ok) {
    throw new Error("Expected a FINISHED StateSnapshot.");
  }
  return validation.value;
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

async function joinHostedRoom(
  harness: TestHarness,
  host: HostedRoom,
  guestName: string,
): Promise<HostedRoom> {
  const socket = await connectTypedClient(harness);
  const observer = observeClient(socket, harness.networkPayloads);
  const token = await bootstrap(socket, `${guestName}-bootstrap`);
  const ack = await emitJoin(socket, {
    kind: "room:join",
    protocolVersion: PROTOCOL_VERSION,
    requestId: requestId(`${guestName}-join`),
    payload: {
      bootstrapCredential: { sessionToken: token },
      nickname: nickname(guestName),
      roomCode: host.snapshot.room.roomCode,
    },
  });
  assert.equal(validateRoomJoinAck(ack).ok, true);
  harness.networkPayloads.push(ack);
  const snapshot = requireSnapshotSuccess(ack);

  return { socket, observer, sessionToken: token, snapshot };
}

type SeededSubmitFixture = Readonly<{
  room: RoomRecord & Readonly<{ game: PlayingGameState }>;
  proposedBoard: TurnSubmitCommand["payload"]["proposedBoard"];
  usedTileIds: readonly TileId[];
}>;

type StartedTwoPlayerRoom = Readonly<{
  host: HostedRoom;
  guest: HostedRoom;
  snapshot: PlayingStateSnapshot;
}>;

async function startTwoPlayerRoom(
  harness: TestHarness,
  hostName: string,
  guestName: string,
): Promise<StartedTwoPlayerRoom> {
  const host = await createHostedRoom(harness, hostName);
  const guest = await joinHostedRoom(harness, host, guestName);
  const acknowledgement = await emitGameStart(host.socket, {
    kind: "game:start",
    protocolVersion: PROTOCOL_VERSION,
    requestId: requestId(`${hostName}-start`),
    expectedRoomRevision: guest.snapshot.versions.roomRevision,
    payload: {},
  });
  const snapshot = requirePlayingSnapshot(
    requireSnapshotSuccess(acknowledgement),
  );
  await Promise.all([
    waitForSnapshot(
      host.observer,
      (event) => event.payload.snapshot.room.phase === "PLAYING",
    ),
    waitForSnapshot(
      guest.observer,
      (event) => event.payload.snapshot.room.phase === "PLAYING",
    ),
    waitForTurnStarted(
      host.observer,
      (event) => event.payload.gameId === snapshot.game.gameId,
    ),
    waitForTurnStarted(
      guest.observer,
      (event) => event.payload.gameId === snapshot.game.gameId,
    ),
  ]);

  return { host, guest, snapshot };
}

async function seedBothBagsEmpty(
  persistence: InMemoryPersistence,
  roomIdValue: RoomId,
  actorPlayerId: PlayerId,
): Promise<RoomRecord & Readonly<{ game: PlayingGameState }>> {
  const room = await persistence.findById(roomIdValue);
  if (
    room === null ||
    room.phase !== "PLAYING" ||
    room.game === null ||
    room.game.turn === null ||
    room.game.result !== null
  ) {
    throw new Error("A canonical PLAYING Room is required for pass setup.");
  }
  const game = room.game;
  const actorRack = game.racks.get(actorPlayerId);
  if (actorRack === undefined) {
    throw new Error("Pass setup actor has no canonical rack.");
  }
  const racks = new Map(
    [...game.racks].map(([playerIdValue, rack]) => [
      playerIdValue,
      Object.freeze(
        playerIdValue === actorPlayerId
          ? [...rack, ...game.consonantBag, ...game.vowelBag]
          : [...rack],
      ),
    ] as const),
  );
  const candidateGame: PlayingGameState = Object.freeze({
    ...game,
    consonantBag: Object.freeze([]),
    vowelBag: Object.freeze([]),
    racks,
  });
  const result = await persistence.replace({
    candidate: {
      roomId: room.roomId,
      roomCode: room.roomCode,
      phase: "PLAYING",
      hostPlayerId: room.hostPlayerId,
      players: room.players,
      game: candidateGame,
      roomRevision: room.roomRevision,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    },
    expectedRoomRevision: room.roomRevision,
    expectedStorageRevision: room.storageRevision,
  });
  if (
    result.status !== "REPLACED" ||
    result.room.game === null ||
    result.room.game.turn === null ||
    result.room.game.result !== null
  ) {
    throw new Error("Failed to persist deterministic empty-bag fixture.");
  }
  return result.room as RoomRecord & Readonly<{ game: PlayingGameState }>;
}

async function seedOverdueCurrentTurn(
  persistence: InMemoryPersistence,
  roomIdValue: RoomId,
): Promise<RoomRecord & Readonly<{ game: PlayingGameState }>> {
  const room = await persistence.findById(roomIdValue);
  if (
    room === null ||
    room.phase !== "PLAYING" ||
    room.game === null ||
    room.game.turn === null ||
    room.game.result !== null
  ) {
    throw new Error("A canonical PLAYING Room is required for timeout setup.");
  }
  const game: PlayingGameState = Object.freeze({
    ...room.game,
    turn: Object.freeze({
      ...room.game.turn,
      deadlineAt: room.game.turn.startedAt,
    }),
  });
  const result = await persistence.replace({
    candidate: {
      roomId: room.roomId,
      roomCode: room.roomCode,
      phase: "PLAYING",
      hostPlayerId: room.hostPlayerId,
      players: room.players,
      game,
      roomRevision: room.roomRevision,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    },
    expectedRoomRevision: room.roomRevision,
    expectedStorageRevision: room.storageRevision,
  });
  if (
    result.status !== "REPLACED" ||
    result.room.game === null ||
    result.room.game.turn === null ||
    result.room.game.result !== null
  ) {
    throw new Error("Failed to persist deterministic overdue Turn fixture.");
  }
  return result.room as RoomRecord & Readonly<{ game: PlayingGameState }>;
}

function findOrdinaryTileForSymbol(
  game: PlayingGameState,
  assignedSymbol: string,
  excluded: ReadonlySet<TileId>,
): OrdinaryTileInstance {
  const tile = [...game.tilesById.values()].find(
    (candidate) =>
      candidate.kind === "ORDINARY" &&
      !excluded.has(candidate.tileId) &&
      candidate.allowedSymbols.some((symbol) => symbol === assignedSymbol),
  );
  if (tile === undefined || tile.kind !== "ORDINARY") {
    throw new Error(`Missing deterministic Tile for ${assignedSymbol}.`);
  }
  return tile;
}

/**
 * Test-only canonical fixture injection. It relocates every physical Tile
 * exactly once and does not add a production command or backdoor.
 */
async function seedDalgyalSubmitFixture(
  persistence: InMemoryPersistence,
  roomIdValue: RoomId,
  actorPlayerId: PlayerId,
  leaveOneRackTile: boolean,
): Promise<SeededSubmitFixture> {
  const room = await persistence.findById(roomIdValue);
  if (
    room === null ||
    room.phase !== "PLAYING" ||
    room.game === null ||
    room.game.turn === null ||
    room.game.result !== null
  ) {
    throw new Error("A canonical PLAYING Room is required for Submit setup.");
  }
  const game = room.game;
  const used = new Set<TileId>();
  const choose = (symbol: string): OrdinaryTileInstance => {
    const tile = findOrdinaryTileForSymbol(game, symbol, used);
    used.add(tile.tileId);
    return tile;
  };

  const digeut = choose("ㄷ");
  const firstA = choose("ㅏ");
  const firstRieul = choose("ㄹ");
  const giyeok = choose("ㄱ");
  const ya = choose("ㅑ");
  const secondRieul = choose("ㄹ");
  const wordTiles = [
    digeut,
    firstA,
    firstRieul,
    giyeok,
    ya,
    secondRieul,
  ] as const;

  const extraTile = leaveOneRackTile
    ? [...game.tilesById.values()].find((tile) => !used.has(tile.tileId))
    : undefined;
  if (leaveOneRackTile && extraTile === undefined) {
    throw new Error("Missing deterministic extra rack Tile.");
  }
  if (extraTile !== undefined) {
    used.add(extraTile.tileId);
  }
  const actorRack = Object.freeze([
    ...wordTiles.map((tile) => tile.tileId),
    ...(extraTile === undefined ? [] : [extraTile.tileId]),
  ]);

  const allocated = new Set<TileId>(actorRack);
  const nextRacks = new Map<PlayerId, readonly TileId[]>([
    [actorPlayerId, actorRack],
  ]);
  for (const playerIdValue of game.turnOrder) {
    if (playerIdValue === actorPlayerId) {
      continue;
    }
    const priorRack = game.racks.get(playerIdValue);
    if (priorRack === undefined) {
      throw new Error("Canonical Game is missing a Player rack.");
    }
    const nextRack = priorRack.filter((tileIdValue) => {
      if (allocated.has(tileIdValue)) {
        return false;
      }
      allocated.add(tileIdValue);
      return true;
    });
    for (const tileIdValue of game.tilesById.keys()) {
      if (nextRack.length >= priorRack.length) {
        break;
      }
      if (!allocated.has(tileIdValue)) {
        allocated.add(tileIdValue);
        nextRack.push(tileIdValue);
      }
    }
    nextRacks.set(playerIdValue, Object.freeze(nextRack));
  }

  const consonantBag: TileId[] = [];
  const vowelBag: TileId[] = [];
  for (const tile of game.tilesById.values()) {
    if (allocated.has(tile.tileId)) {
      continue;
    }
    (tile.sourceBag === "CONSONANT" ? consonantBag : vowelBag).push(
      tile.tileId,
    );
  }

  const seededGame: PlayingGameState = Object.freeze({
    ...game,
    consonantBag: Object.freeze(consonantBag),
    vowelBag: Object.freeze(vowelBag),
    racks: nextRacks,
    result: null,
  });
  const replaced = await persistence.replace({
    candidate: {
      roomId: room.roomId,
      roomCode: room.roomCode,
      phase: "PLAYING",
      hostPlayerId: room.hostPlayerId,
      players: room.players,
      game: seededGame,
      roomRevision: room.roomRevision,
      createdAt: room.createdAt,
      updatedAt: room.updatedAt,
    },
    expectedRoomRevision: room.roomRevision,
    expectedStorageRevision: room.storageRevision,
  });
  if (
    replaced.status !== "REPLACED" ||
    replaced.room.game === null ||
    replaced.room.game.turn === null ||
    replaced.room.game.result !== null
  ) {
    throw new Error("Failed to persist deterministic Submit fixture.");
  }

  return {
    room: replaced.room as RoomRecord & Readonly<{ game: PlayingGameState }>,
    usedTileIds: Object.freeze(wordTiles.map((tile) => tile.tileId)),
    proposedBoard: {
      wordGroups: [
        {
          groupId: "group-dalgyal",
          syllables: [
            {
              choseong: [
                {
                  tileId: digeut.tileId,
                  assignedSymbol: "ㄷ",
                },
              ],
              jungseong: [
                {
                  tileId: firstA.tileId,
                  assignedSymbol: "ㅏ",
                },
              ],
              jongseong: [
                {
                  tileId: firstRieul.tileId,
                  assignedSymbol: "ㄹ",
                },
              ],
            },
            {
              choseong: [
                {
                  tileId: giyeok.tileId,
                  assignedSymbol: "ㄱ",
                },
              ],
              jungseong: [
                {
                  tileId: ya.tileId,
                  assignedSymbol: "ㅑ",
                },
              ],
              jongseong: [
                {
                  tileId: secondRieul.tileId,
                  assignedSymbol: "ㄹ",
                },
              ],
            },
          ],
        },
      ],
    },
  };
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

function collectStringValues(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStringValues);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }

  return Object.values(value).flatMap(collectStringValues);
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
  { timeout: 90_000 },
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

        const oldStartAck = await emitGameStart(host.socket, {
          kind: "game:start",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("replaced-old-start"),
          expectedRoomRevision: host.snapshot.versions.roomRevision,
          payload: {},
        });
        assert.equal(validateGameStartAck(oldStartAck).ok, true);
        harness.networkPayloads.push(oldStartAck);
        requireFailureCode(oldStartAck, "UNAUTHENTICATED");

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

    await context.test("game:start payload, authentication, minimum Player gate는 LOBBY를 변경하지 않는다", async () => {
      const harness = await startServer();
      try {
        const host = await createHostedRoom(harness, "StartHost");

        const onePlayerAck = await emitGameStart(host.socket, {
          kind: "game:start",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("one-player-start"),
          expectedRoomRevision: host.snapshot.versions.roomRevision,
          payload: {},
        });
        assert.equal(validateGameStartAck(onePlayerAck).ok, true);
        requireFailureCode(onePlayerAck, "NOT_ENOUGH_PLAYERS");

        const unboundSocket = await connectTypedClient(harness);
        const unauthenticatedAck = await emitGameStart(unboundSocket, {
          kind: "game:start",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("unauthenticated-start"),
          expectedRoomRevision: host.snapshot.versions.roomRevision,
          payload: {},
        });
        assert.equal(validateGameStartAck(unauthenticatedAck).ok, true);
        requireFailureCode(unauthenticatedAck, "UNAUTHENTICATED");

        const rawSocket = await connectRawClient(harness);
        const malformedAck = await emitWithAck<GameStartAck>(
          "malformed game:start",
          (acknowledge) => {
            rawSocket.emit(
              "game:start",
              {
                kind: "game:start",
                protocolVersion: PROTOCOL_VERSION,
                requestId: "malformed-game-start",
                payload: {},
              },
              acknowledge,
            );
          },
        );
        assert.equal(validateGameStartAck(malformedAck).ok, true);
        requireFailureCode(malformedAck, "INVALID_PAYLOAD");

        const syncAck = await emitStateSync(
          host.socket,
          stateSyncCommand("start-gate-state-sync"),
        );
        const unchanged = requireSnapshotSuccess(syncAck);
        assert.equal(unchanged.room.phase, "LOBBY");
        assert.equal(unchanged.versions.roomRevision, 0);
        assert.equal(unchanged.versions.gameRevision, null);
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("game:start는 Host, current revision, 모든 Player CONNECTED를 검증한다", async () => {
      const harness = await startServer();
      try {
        const host = await createHostedRoom(harness, "GateHost");
        const guest = await joinHostedRoom(harness, host, "GateGuest");
        const lobbyRevision = guest.snapshot.versions.roomRevision;

        const nonHostAck = await emitGameStart(guest.socket, {
          kind: "game:start",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("non-host-start"),
          expectedRoomRevision: lobbyRevision,
          payload: {},
        });
        assert.equal(validateGameStartAck(nonHostAck).ok, true);
        requireFailureCode(nonHostAck, "HOST_ONLY");

        const staleAck = await emitGameStart(host.socket, {
          kind: "game:start",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("stale-start"),
          expectedRoomRevision: host.snapshot.versions.roomRevision,
          payload: {},
        });
        assert.equal(validateGameStartAck(staleAck).ok, true);
        requireFailureCode(staleAck, "STALE_ROOM_REVISION");

        guest.socket.disconnect();
        await waitForSnapshot(
          host.observer,
          (event) =>
            event.payload.snapshot.room.phase === "LOBBY" &&
            playerStatus(
              event.payload.snapshot,
              guest.snapshot.self.playerId,
            ) === "OFFLINE",
        );

        const offlineAck = await emitGameStart(host.socket, {
          kind: "game:start",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("offline-player-start"),
          expectedRoomRevision: lobbyRevision,
          payload: {},
        });
        assert.equal(validateGameStartAck(offlineAck).ok, true);
        requireFailureCode(offlineAck, "PLAYERS_NOT_CONNECTED");

        const syncAck = await emitStateSync(
          host.socket,
          stateSyncCommand("offline-start-state-sync"),
        );
        const unchanged = requireSnapshotSuccess(syncAck);
        assert.equal(unchanged.room.phase, "LOBBY");
        assert.equal(unchanged.versions.roomRevision, lobbyRevision);
        assert.equal(unchanged.versions.gameRevision, null);
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("Host game:start는 개인별 PLAYING snapshot과 turn:started를 fan-out하고 재시도에서 redeal하지 않는다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const host = await createHostedRoom(harness, "PlayHost");
        const guest = await joinHostedRoom(harness, host, "PlayGuest");
        const startCommand: GameStartCommand = {
          kind: "game:start",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("successful-game-start"),
          expectedRoomRevision: guest.snapshot.versions.roomRevision,
          payload: {},
        };

        const startAck = await emitGameStart(host.socket, startCommand);
        assert.equal(validateGameStartAck(startAck).ok, true);
        harness.networkPayloads.push(startAck);
        const started = requirePlayingSnapshot(
          requireSnapshotSuccess(startAck),
        );
        assert.equal(started.versions.roomRevision, 2);
        assert.equal(started.versions.gameRevision, 0);
        assert.equal(started.room.players.length, 2);
        assert.ok(
          started.room.players.every(
            (player) =>
              player.connectionStatus === "CONNECTED" &&
              player.rackCount === 14 &&
              player.initialMeldCompleted === false,
          ),
        );
        assert.equal(started.game.board.wordGroups.length, 0);
        assert.equal(started.game.bagCounts.consonant, 81);
        assert.equal(started.game.bagCounts.vowel, 47);
        assert.equal(started.game.turnOrder.length, 2);
        assert.equal(new Set(started.game.turnOrder).size, 2);
        assert.equal(started.game.turn.turnNumber, 1);
        assert.equal(
          started.game.turn.activePlayerId,
          started.game.turnOrder[0],
        );
        assert.equal(
          started.game.turn.deadlineAt - started.game.turn.startedAt,
          60_000,
        );
        assert.equal(started.self.rack.length, 14);

        const [hostSnapshotEvent, guestSnapshotEvent, hostTurn, guestTurn] =
          await Promise.all([
            waitForSnapshot(
              host.observer,
              (event) => event.payload.snapshot.room.phase === "PLAYING",
            ),
            waitForSnapshot(
              guest.observer,
              (event) => event.payload.snapshot.room.phase === "PLAYING",
            ),
            waitForTurnStarted(
              host.observer,
              (event) => event.payload.gameId === started.game.gameId,
            ),
            waitForTurnStarted(
              guest.observer,
              (event) => event.payload.gameId === started.game.gameId,
            ),
          ]);
        assert.equal(validateStateSnapshotEvent(hostSnapshotEvent).ok, true);
        assert.equal(validateStateSnapshotEvent(guestSnapshotEvent).ok, true);
        assert.equal(validateTurnStartedEvent(hostTurn).ok, true);
        assert.equal(validateTurnStartedEvent(guestTurn).ok, true);

        const hostView = requirePlayingSnapshot(
          hostSnapshotEvent.payload.snapshot,
        );
        const guestView = requirePlayingSnapshot(
          guestSnapshotEvent.payload.snapshot,
        );
        assert.deepEqual(hostView.game, guestView.game);
        assert.deepEqual(hostView.room, guestView.room);
        assert.equal(hostView.self.playerId, host.snapshot.self.playerId);
        assert.equal(guestView.self.playerId, guest.snapshot.self.playerId);
        assert.equal(hostView.self.rack.length, 14);
        assert.equal(guestView.self.rack.length, 14);
        const hostRackTileIds = new Set(
          hostView.self.rack.map((tile) => tile.tileId),
        );
        assert.ok(
          guestView.self.rack.every(
            (tile) => !hostRackTileIds.has(tile.tileId),
          ),
        );
        const guestWireStringValues = new Set(collectStringValues(guestView));
        for (const tileId of hostRackTileIds) {
          assert.equal(guestWireStringValues.has(tileId), false);
        }
        assert.deepEqual(hostTurn.payload, guestTurn.payload);
        assert.equal(hostTurn.payload.turnNumber, 1);

        const replayAck = await emitGameStart(host.socket, startCommand);
        assert.equal(validateGameStartAck(replayAck).ok, true);
        const replayed = requirePlayingSnapshot(
          requireSnapshotSuccess(replayAck),
        );
        assert.equal(replayed.game.gameId, started.game.gameId);
        assert.equal(replayed.game.turn.turnId, started.game.turn.turnId);
        assert.deepEqual(replayed.game.turnOrder, started.game.turnOrder);
        assert.deepEqual(replayed.self.rack, started.self.rack);
        assert.deepEqual(replayed.game.bagCounts, started.game.bagCounts);

        const secondStartAck = await emitGameStart(host.socket, {
          ...startCommand,
          requestId: requestId("new-start-after-playing"),
          expectedRoomRevision: started.versions.roomRevision,
        });
        assert.equal(validateGameStartAck(secondStartAck).ok, true);
        requireFailureCode(secondStartAck, "INVALID_PHASE");

        const lateSocket = await connectTypedClient(harness);
        const lateToken = await bootstrap(lateSocket, "late-bootstrap");
        const lateJoinAck = await emitJoin(lateSocket, {
          kind: "room:join",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("late-join"),
          payload: {
            bootstrapCredential: { sessionToken: lateToken },
            nickname: nickname("LateGuest"),
            roomCode: started.room.roomCode,
          },
        });
        assert.equal(validateRoomJoinAck(lateJoinAck).ok, true);
        requireFailureCode(lateJoinAck, "ROOM_NOT_JOINABLE");

        assertNoNetworkSecrets(harness.networkPayloads, [
          host.sessionToken,
          guest.sessionToken,
          lateToken,
        ]);
        for (const payload of harness.networkPayloads) {
          const keys = new Set(collectObjectKeys(payload));
          for (const forbiddenKey of [
            "consonantBag",
            "idempotency",
            "racks",
            "rulesConfig",
            "tilesById",
            "vowelBag",
          ]) {
            assert.equal(keys.has(forbiddenKey), false, forbiddenKey);
          }
        }
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("in-flight game:start 중 Host primary가 교체되면 commit과 idempotency를 모두 거절한다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const host = await createHostedRoom(harness, "RaceHost");
        const guest = await joinHostedRoom(harness, host, "RaceGuest");
        const lobbyRevision = guest.snapshot.versions.roomRevision;
        const command: GameStartCommand = {
          kind: "game:start",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("in-flight-replaced-start"),
          expectedRoomRevision: lobbyRevision,
          payload: {},
        };

        const presenceRead = deterministic.presenceReader.blockNextRead();
        const oldStartAcknowledgement = emitGameStart(host.socket, command);
        await presenceRead.entered;

        const replacementSocket = await connectTypedClient(harness);
        observeClient(replacementSocket, harness.networkPayloads);
        const replacementAck = await emitResume(replacementSocket, {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("replace-during-start"),
          payload: {
            credential: {
              roomCode: host.snapshot.room.roomCode,
              sessionToken: host.sessionToken,
            },
            lastSeenVersions: host.snapshot.versions,
          },
        });
        assert.equal(validateSessionResumeAck(replacementAck).ok, true);
        requireSnapshotSuccess(replacementAck);
        const replaced = await waitForReplacement(host.observer);
        assert.equal(validateSessionReplacedNotification(replaced).ok, true);

        presenceRead.release();
        const rejectedStart = await oldStartAcknowledgement;
        assert.equal(validateGameStartAck(rejectedStart).ok, true);
        requireFailureCode(rejectedStart, "UNAUTHENTICATED");

        const persisted = await deterministic.runtime.persistence.findById(
          host.snapshot.room.roomId,
        );
        assert.ok(persisted);
        assert.equal(persisted.phase, "LOBBY");
        assert.equal(persisted.game, null);
        assert.equal(persisted.roomRevision, lobbyRevision);
        assert.deepEqual(
          await deterministic.runtime.persistence.classify(
            `room-player:${persisted.roomId}:${host.snapshot.self.playerId}`,
            command.requestId,
            JSON.stringify(["game:start", command.expectedRoomRevision]),
          ),
          { status: "MISS" },
        );
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("game:start commit 뒤 projection delivery 실패는 Game을 rollback하지 않고 동일 요청 replay로 복구한다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const host = await createHostedRoom(harness, "FailHost");
        const guest = await joinHostedRoom(harness, host, "FailGuest");
        await Promise.all([
          waitForSnapshot(
            host.observer,
            (event) => event.payload.snapshot.room.players.length === 2,
          ),
          waitForSnapshot(
            guest.observer,
            (event) => event.payload.snapshot.room.players.length === 2,
          ),
        ]);

        const command: GameStartCommand = {
          kind: "game:start",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("delivery-failure-start"),
          expectedRoomRevision: guest.snapshot.versions.roomRevision,
          payload: {},
        };
        let firstAcknowledgement: GameStartAck | null = null;
        deterministic.presenceReader.failAfterSuccessfulReads(1);
        host.socket.emit("game:start", command, (acknowledgement) => {
          firstAcknowledgement = acknowledgement;
        });

        const committed = await waitForAsyncValue(
          "committed Game after delivery failure",
          async () => {
            const room = await deterministic.runtime.persistence.findById(
              host.snapshot.room.roomId,
            );
            return room?.phase === "PLAYING" && room.game !== null ? room : null;
          },
        );
        assert.equal(firstAcknowledgement, null);
        assert.equal(committed.roomRevision, guest.snapshot.versions.roomRevision + 1);
        assert.equal(committed.storageRevision, 2);
        assert.ok(committed.game);
        if (committed.game.turn === null) {
          throw new Error("Committed game:start fixture must have a Turn.");
        }

        const replayAck = await emitGameStart(host.socket, command);
        assert.equal(validateGameStartAck(replayAck).ok, true);
        const replayed = requirePlayingSnapshot(
          requireSnapshotSuccess(replayAck),
        );
        assert.equal(replayed.game.gameId, committed.game.gameId);
        assert.equal(replayed.game.turn.turnId, committed.game.turn.turnId);
        assert.deepEqual(
          replayed.self.rack,
          committed.game.racks
            .get(replayed.self.playerId)
            ?.map((tileId) => {
              const tile = committed.game?.tilesById.get(tileId);
              if (tile === undefined) {
                throw new Error("Expected committed rack Tile.");
              }
              return tile.kind === "JOKER"
                ? {
                    tileId: tile.tileId,
                    kind: tile.kind,
                    physicalType: tile.physicalType,
                    sourceBag: tile.sourceBag,
                    allowedSymbols: [...JOKER_ALLOWED_SYMBOLS],
                  }
                : {
                    tileId: tile.tileId,
                    kind: tile.kind,
                    physicalType: tile.physicalType,
                    sourceBag: tile.sourceBag,
                    allowedSymbols: [...tile.allowedSymbols],
                  };
            }),
        );
        assert.deepEqual(
          await deterministic.runtime.persistence.findById(committed.roomId),
          committed,
        );
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("PLAYING session resume/state:sync은 동일 Game, Player, rack, turnOrder를 복구하고 redeal하지 않는다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const host = await createHostedRoom(harness, "ResumeHost");
        const guest = await joinHostedRoom(harness, host, "ResumeGuest");
        const startAck = await emitGameStart(host.socket, {
          kind: "game:start",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("resume-game-start"),
          expectedRoomRevision: guest.snapshot.versions.roomRevision,
          payload: {},
        });
        const hostStarted = requirePlayingSnapshot(
          requireSnapshotSuccess(startAck),
        );
        const guestStartedEvent = await waitForSnapshot(
          guest.observer,
          (event) => event.payload.snapshot.room.phase === "PLAYING",
        );
        const guestStarted = requirePlayingSnapshot(
          guestStartedEvent.payload.snapshot,
        );

        guest.socket.disconnect();
        const offlineEvent = await waitForSnapshot(
          host.observer,
          (event) =>
            event.payload.snapshot.room.phase === "PLAYING" &&
            playerStatus(
              event.payload.snapshot,
              guestStarted.self.playerId,
            ) === "OFFLINE",
        );
        const offline = requirePlayingSnapshot(
          offlineEvent.payload.snapshot,
        );
        assert.equal(
          offline.versions.roomRevision,
          hostStarted.versions.roomRevision,
        );
        assert.equal(
          offline.versions.gameRevision,
          hostStarted.versions.gameRevision,
        );

        const resumedSocket = await connectTypedClient(harness);
        const resumedObserver = observeClient(
          resumedSocket,
          harness.networkPayloads,
        );
        const resumeAck = await emitResume(resumedSocket, {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("playing-session-resume"),
          payload: {
            credential: {
              roomCode: guestStarted.room.roomCode,
              sessionToken: guest.sessionToken,
            },
            lastSeenVersions: offline.versions,
          },
        });
        assert.equal(validateSessionResumeAck(resumeAck).ok, true);
        const resumed = requirePlayingSnapshot(
          requireSnapshotSuccess(resumeAck),
        );
        assert.equal(resumed.self.playerId, guestStarted.self.playerId);
        assert.equal(resumed.room.players.length, 2);
        assert.equal(resumed.game.gameId, guestStarted.game.gameId);
        assert.deepEqual(resumed.game.turn, guestStarted.game.turn);
        assert.deepEqual(resumed.game.turnOrder, guestStarted.game.turnOrder);
        assert.deepEqual(resumed.game.bagCounts, guestStarted.game.bagCounts);
        assert.deepEqual(resumed.self.rack, guestStarted.self.rack);
        assert.equal(
          playerStatus(resumed, guestStarted.self.playerId),
          "CONNECTED",
        );
        await waitForSnapshot(
          resumedObserver,
          (event) => event.payload.snapshot.room.phase === "PLAYING",
        );

        const syncAck = await emitStateSync(
          resumedSocket,
          stateSyncCommand("playing-state-sync"),
        );
        assert.equal(validateStateSyncAck(syncAck).ok, true);
        const synced = requirePlayingSnapshot(
          requireSnapshotSuccess(syncAck),
        );
        assert.equal(synced.game.gameId, guestStarted.game.gameId);
        assert.deepEqual(synced.game.turnOrder, guestStarted.game.turnOrder);
        assert.deepEqual(synced.self.rack, guestStarted.self.rack);
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("turn:submit malformed payload와 invalid Board는 canonical Game을 변경하지 않는다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const { host, guest, snapshot } = await startTwoPlayerRoom(
          harness,
          "InvalidHost",
          "InvalidGuest",
        );
        const actor =
          snapshot.game.turn.activePlayerId === host.snapshot.self.playerId
            ? host
            : guest;
        const before = await deterministic.runtime.persistence.findById(
          snapshot.room.roomId,
        );
        assert.ok(before);

        const rawSocket = await connectRawClient(harness);
        const malformedAck = await emitWithAck<TurnSubmitAck>(
          "malformed turn:submit",
          (acknowledge) => {
            rawSocket.emit(
              "turn:submit",
              {
                kind: "turn:submit",
                protocolVersion: PROTOCOL_VERSION,
                requestId: "malformed-submit",
                expectedGameRevision: snapshot.versions.gameRevision,
                turnId: snapshot.game.turn.turnId,
                payload: { proposedBoard: { wordGroups: "not-an-array" } },
              },
              acknowledge,
            );
          },
        );
        assert.equal(validateTurnSubmitAck(malformedAck).ok, true);
        requireFailureCode(malformedAck, "INVALID_PAYLOAD");

        const clientAuthorityAck = await emitWithAck<TurnSubmitAck>(
          "client-authority turn:submit",
          (acknowledge) => {
            rawSocket.emit(
              "turn:submit",
              {
                kind: "turn:submit",
                protocolVersion: PROTOCOL_VERSION,
                requestId: "client-authority-submit",
                expectedGameRevision: snapshot.versions.gameRevision,
                turnId: snapshot.game.turn.turnId,
                payload: {
                  proposedBoard: {
                    wordGroups: [
                      {
                        groupId: "client-authority-group",
                        syllables: [
                          {
                            choseong: [
                              {
                                tileId: "client-authority-c",
                                assignedSymbol: "ㄱ",
                                physicalType: "GIYEOK_NIEUN_ROTATION",
                                ownerPlayerId: "player-spoofed",
                              },
                            ],
                            jungseong: [
                              {
                                tileId: "client-authority-v",
                                assignedSymbol: "ㅏ",
                              },
                            ],
                            jongseong: [],
                          },
                        ],
                      },
                    ],
                  },
                },
              },
              acknowledge,
            );
          },
        );
        assert.equal(validateTurnSubmitAck(clientAuthorityAck).ok, true);
        requireFailureCode(clientAuthorityAck, "INVALID_PAYLOAD");

        const invalidAck = await emitTurnSubmit(actor.socket, {
          kind: "turn:submit",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("invalid-empty-board-submit"),
          expectedGameRevision: snapshot.versions.gameRevision,
          turnId: snapshot.game.turn.turnId,
          payload: { proposedBoard: { wordGroups: [] } },
        });
        assert.equal(validateTurnSubmitAck(invalidAck).ok, true);
        requireFailureCode(invalidAck, "RULE_VIOLATION");
        assert.equal(invalidAck.scope, "ROOM");
        if (invalidAck.scope !== "ROOM") {
          throw new Error("Expected an authenticated Submit rule rejection.");
        }
        assert.deepEqual(invalidAck.versions, snapshot.versions);

        assert.deepEqual(
          await deterministic.runtime.persistence.findById(
            snapshot.room.roomId,
          ),
          before,
        );
        assert.equal(
          actor.observer.snapshots.some(
            (event) => event.versions.gameRevision === 1,
          ),
          false,
        );
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("accepted turn:submit은 개인별 snapshot, next turn, idempotent replay와 resume을 제공한다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const { host, guest, snapshot } = await startTwoPlayerRoom(
          harness,
          "SubmitHost",
          "SubmitGuest",
        );
        const actor =
          snapshot.game.turn.activePlayerId === host.snapshot.self.playerId
            ? host
            : guest;
        const other = actor === host ? guest : host;
        const fixture = await seedDalgyalSubmitFixture(
          deterministic.runtime.persistence,
          snapshot.room.roomId,
          actor.snapshot.self.playerId,
          true,
        );
        const command: TurnSubmitCommand = {
          kind: "turn:submit",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("accepted-turn-submit"),
          expectedGameRevision: fixture.room.game.gameRevision,
          turnId: fixture.room.game.turn.turnId,
          payload: { proposedBoard: fixture.proposedBoard },
        };

        const acknowledgement = await emitTurnSubmit(actor.socket, command);
        assert.equal(validateTurnSubmitAck(acknowledgement).ok, true);
        harness.networkPayloads.push(acknowledgement);
        const submitted = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(acknowledgement),
        );
        assert.equal(submitted.versions.gameRevision, 1);
        assert.equal(
          submitted.versions.roomRevision,
          fixture.room.roomRevision,
        );
        assert.equal(submitted.game.board.wordGroups.length, 1);
        assert.equal(submitted.self.rack.length, 1);
        assert.notEqual(
          submitted.game.turn.activePlayerId,
          actor.snapshot.self.playerId,
        );
        assert.equal(
          submitted.game.turn.deadlineAt - submitted.game.turn.startedAt,
          60_000,
        );

        const [actorEvent, otherEvent, actorTurn, otherTurn] =
          await Promise.all([
            waitForSnapshot(
              actor.observer,
              (event) => event.versions.gameRevision === 1,
            ),
            waitForSnapshot(
              other.observer,
              (event) => event.versions.gameRevision === 1,
            ),
            waitForTurnStarted(
              actor.observer,
              (event) => event.versions.gameRevision === 1,
            ),
            waitForTurnStarted(
              other.observer,
              (event) => event.versions.gameRevision === 1,
            ),
          ]);
        assert.equal(validateStateSnapshotEvent(actorEvent).ok, true);
        assert.equal(validateStateSnapshotEvent(otherEvent).ok, true);
        assert.equal(validateTurnStartedEvent(actorTurn).ok, true);
        assert.equal(validateTurnStartedEvent(otherTurn).ok, true);
        const actorView = requireAnyPlayingSnapshot(
          actorEvent.payload.snapshot,
        );
        const otherView = requireAnyPlayingSnapshot(
          otherEvent.payload.snapshot,
        );
        assert.deepEqual(actorView.game, otherView.game);
        assert.equal(actorView.self.rack.length, 1);
        assert.equal(otherView.self.rack.length, 14);
        const privateActorTile = actorView.self.rack[0];
        assert.ok(privateActorTile);
        assert.equal(
          new Set(collectStringValues(otherView)).has(privateActorTile.tileId),
          false,
        );

        const persistedAfterFirst =
          await deterministic.runtime.persistence.findById(
            snapshot.room.roomId,
          );
        assert.ok(persistedAfterFirst?.game);
        assert.equal(persistedAfterFirst.storageRevision, 4);
        assert.equal(persistedAfterFirst.game.gameRevision, 1);

        const replay = await emitTurnSubmit(actor.socket, command);
        assert.equal(validateTurnSubmitAck(replay).ok, true);
        const replayed = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(replay),
        );
        assert.equal(replayed.game.turn.turnId, submitted.game.turn.turnId);
        assert.deepEqual(replayed.self.rack, submitted.self.rack);
        assert.deepEqual(
          await deterministic.runtime.persistence.findById(
            snapshot.room.roomId,
          ),
          persistedAfterFirst,
        );

        const conflict = await emitTurnSubmit(actor.socket, {
          ...command,
          payload: {
            proposedBoard: {
              wordGroups: command.payload.proposedBoard.wordGroups.map(
                (group) => ({ ...group, groupId: `${group.groupId}-changed` }),
              ),
            },
          },
        });
        assert.equal(validateTurnSubmitAck(conflict).ok, true);
        requireFailureCode(conflict, "REQUEST_ID_REUSED");

        actor.socket.disconnect();
        await waitForSnapshot(
          other.observer,
          (event) =>
            event.versions.gameRevision === 1 &&
            playerStatus(
              event.payload.snapshot,
              actor.snapshot.self.playerId,
            ) === "OFFLINE",
        );
        const resumedSocket = await connectTypedClient(harness);
        const resumedObserver = observeClient(
          resumedSocket,
          harness.networkPayloads,
        );
        const resumeAck = await emitResume(resumedSocket, {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("resume-after-turn-submit"),
          payload: {
            credential: {
              roomCode: snapshot.room.roomCode,
              sessionToken: actor.sessionToken,
            },
            lastSeenVersions: submitted.versions,
          },
        });
        const resumed = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(resumeAck),
        );
        assert.equal(resumed.versions.gameRevision, 1);
        assert.deepEqual(resumed.game.board, submitted.game.board);
        assert.deepEqual(resumed.self.rack, submitted.self.rack);
        await waitForSnapshot(
          resumedObserver,
          (event) => event.versions.gameRevision === 1,
        );

        assertNoNetworkSecrets(harness.networkPayloads, [
          host.sessionToken,
          guest.sessionToken,
        ]);
        for (const payload of harness.networkPayloads) {
          const keys = new Set(collectObjectKeys(payload));
          for (const forbiddenKey of [
            "consonantBag",
            "idempotency",
            "racks",
            "rulesConfig",
            "tilesById",
            "vowelBag",
          ]) {
            assert.equal(keys.has(forbiddenKey), false, forbiddenKey);
          }
        }
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("ADVANCED request replay는 이후 FINISHED가 된 Room의 최신 snapshot으로 복구한다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const { host, guest, snapshot } = await startTwoPlayerRoom(
          harness,
          "ReplayHost",
          "ReplayGuest",
        );
        const actor =
          snapshot.game.turn.activePlayerId === host.snapshot.self.playerId
            ? host
            : guest;
        const fixture = await seedDalgyalSubmitFixture(
          deterministic.runtime.persistence,
          snapshot.room.roomId,
          actor.snapshot.self.playerId,
          true,
        );
        const command: TurnSubmitCommand = {
          kind: "turn:submit",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("advanced-before-finish"),
          expectedGameRevision: fixture.room.game.gameRevision,
          turnId: fixture.room.game.turn.turnId,
          payload: { proposedBoard: fixture.proposedBoard },
        };
        const advanced = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(await emitTurnSubmit(actor.socket, command)),
        );

        const room = await deterministic.runtime.persistence.findById(
          snapshot.room.roomId,
        );
        if (
          room === null ||
          room.phase !== "PLAYING" ||
          room.game === null ||
          room.game.turn === null ||
          room.game.result !== null
        ) {
          throw new Error("Expected the accepted Submit to leave a PLAYING Game.");
        }
        const game = room.game;
        const winnerPlayerId = game.turn.activePlayerId;
        const winnerRack = game.racks.get(winnerPlayerId);
        if (winnerRack === undefined) {
          throw new Error("Expected the next active Player rack.");
        }
        const consonantBag = [...game.consonantBag];
        const vowelBag = [...game.vowelBag];
        for (const tileIdValue of winnerRack) {
          const tile = game.tilesById.get(tileIdValue);
          if (tile === undefined) {
            throw new Error("Expected a canonical rack Tile.");
          }
          (tile.sourceBag === "CONSONANT" ? consonantBag : vowelBag).push(
            tileIdValue,
          );
        }
        const racks = new Map(
          [...game.racks].map(([playerIdValue, rack]) => [
            playerIdValue,
            playerIdValue === winnerPlayerId ? Object.freeze([]) : rack,
          ] as const),
        );
        const penaltyByPlayer = new Map<PlayerId, number>();
        let winnerScore = 0;
        for (const playerIdValue of game.turnOrder) {
          if (playerIdValue === winnerPlayerId) {
            continue;
          }
          const rack = racks.get(playerIdValue);
          if (rack === undefined) {
            throw new Error("Expected every turn-order Player rack.");
          }
          const penalty = rack.reduce((total, tileIdValue) => {
            const tile = game.tilesById.get(tileIdValue);
            if (tile === undefined) {
              throw new Error("Expected a canonical score Tile.");
            }
            return total + (tile.kind === "JOKER" ? 30 : 1);
          }, 0);
          penaltyByPlayer.set(playerIdValue, penalty);
          winnerScore += penalty;
        }
        const finishedAt = game.turn.startedAt;
        const finishedGame: FinishedGameState = Object.freeze({
          ...game,
          gameRevision: parse(GameRevisionSchema, game.gameRevision + 1),
          consonantBag: Object.freeze(consonantBag),
          vowelBag: Object.freeze(vowelBag),
          racks,
          turn: null,
          result: Object.freeze({
            reason: "RACK_EMPTY",
            winnerPlayerId,
            scores: Object.freeze(
              game.turnOrder.map((playerIdValue) => {
                const rack = racks.get(playerIdValue);
                if (rack === undefined) {
                  throw new Error("Expected every result Player rack.");
                }
                return Object.freeze({
                  playerId: playerIdValue,
                  score:
                    playerIdValue === winnerPlayerId
                      ? winnerScore
                      : -(penaltyByPlayer.get(playerIdValue) ?? 0),
                  remainingRackTileCount: rack.length,
                });
              }),
            ),
            finishedAt,
          }),
        });
        const replacement = await deterministic.runtime.persistence.replace({
          candidate: {
            roomId: room.roomId,
            roomCode: room.roomCode,
            phase: "FINISHED",
            hostPlayerId: room.hostPlayerId,
            players: room.players,
            game: finishedGame,
            roomRevision: parse(RoomRevisionSchema, room.roomRevision + 1),
            createdAt: room.createdAt,
            updatedAt: finishedAt,
          },
          expectedRoomRevision: room.roomRevision,
          expectedStorageRevision: room.storageRevision,
        });
        assert.equal(replacement.status, "REPLACED");
        if (replacement.status !== "REPLACED") {
          throw new Error("Expected test-only FINISHED state replacement.");
        }

        const replay = requireFinishedSnapshot(
          requireSnapshotSuccess(await emitTurnSubmit(actor.socket, command)),
        );
        assert.equal(
          replay.versions.gameRevision,
          finishedGame.gameRevision,
        );
        assert.equal(replay.room.phase, "FINISHED");
        assert.notEqual(replay.versions.gameRevision, advanced.versions.gameRevision);
        assert.deepEqual(
          await deterministic.runtime.persistence.findById(room.roomId),
          replacement.room,
        );
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("turn:submit post-commit delivery 실패는 replay와 state:sync로 복구한다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const { host, guest, snapshot } = await startTwoPlayerRoom(
          harness,
          "RetryHost",
          "RetryGuest",
        );
        const actor =
          snapshot.game.turn.activePlayerId === host.snapshot.self.playerId
            ? host
            : guest;
        const fixture = await seedDalgyalSubmitFixture(
          deterministic.runtime.persistence,
          snapshot.room.roomId,
          actor.snapshot.self.playerId,
          true,
        );
        const command: TurnSubmitCommand = {
          kind: "turn:submit",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("delivery-failure-submit"),
          expectedGameRevision: fixture.room.game.gameRevision,
          turnId: fixture.room.game.turn.turnId,
          payload: { proposedBoard: fixture.proposedBoard },
        };
        let firstAcknowledgement: TurnSubmitAck | null = null;
        deterministic.presenceReader.failAfterSuccessfulReads(1);
        actor.socket.emit("turn:submit", command, (acknowledgement) => {
          firstAcknowledgement = acknowledgement;
        });

        const committed = await waitForAsyncValue(
          "committed Submit after delivery failure",
          async () => {
            const room = await deterministic.runtime.persistence.findById(
              snapshot.room.roomId,
            );
            return room?.game?.gameRevision === 1 ? room : null;
          },
        );
        assert.equal(firstAcknowledgement, null);
        assert.equal(committed.storageRevision, 4);

        const replay = await emitTurnSubmit(actor.socket, command);
        const replayed = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(replay),
        );
        assert.equal(replayed.versions.gameRevision, 1);
        const sync = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(
            await emitStateSync(
              actor.socket,
              stateSyncCommand("sync-after-submit-delivery-failure"),
            ),
          ),
        );
        assert.deepEqual(sync.game.board, replayed.game.board);
        assert.deepEqual(sync.self.rack, replayed.self.rack);
        assert.deepEqual(
          await deterministic.runtime.persistence.findById(
            snapshot.room.roomId,
          ),
          committed,
        );
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("마지막 rack Tile Submit은 FINISHED snapshot과 game:finished를 전송한다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const { host, guest, snapshot } = await startTwoPlayerRoom(
          harness,
          "FinishHost",
          "FinishGuest",
        );
        const actor =
          snapshot.game.turn.activePlayerId === host.snapshot.self.playerId
            ? host
            : guest;
        const other = actor === host ? guest : host;
        const fixture = await seedDalgyalSubmitFixture(
          deterministic.runtime.persistence,
          snapshot.room.roomId,
          actor.snapshot.self.playerId,
          false,
        );
        const command: TurnSubmitCommand = {
          kind: "turn:submit",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("rack-empty-submit"),
          expectedGameRevision: fixture.room.game.gameRevision,
          turnId: fixture.room.game.turn.turnId,
          payload: { proposedBoard: fixture.proposedBoard },
        };

        const acknowledgement = await emitTurnSubmit(actor.socket, command);
        assert.equal(validateTurnSubmitAck(acknowledgement).ok, true);
        harness.networkPayloads.push(acknowledgement);
        const finished = requireFinishedSnapshot(
          requireSnapshotSuccess(acknowledgement),
        );
        assert.equal(finished.versions.gameRevision, 1);
        assert.equal(
          finished.versions.roomRevision,
          fixture.room.roomRevision + 1,
        );
        assert.equal(finished.self.rack.length, 0);
        assert.equal(finished.game.result.reason, "RACK_EMPTY");
        assert.equal(
          finished.game.result.winnerPlayerId,
          actor.snapshot.self.playerId,
        );
        assert.equal("turn" in finished.game, false);

        const [actorEvent, otherEvent, actorFinished, otherFinished] =
          await Promise.all([
            waitForSnapshot(
              actor.observer,
              (event) => event.payload.snapshot.room.phase === "FINISHED",
            ),
            waitForSnapshot(
              other.observer,
              (event) => event.payload.snapshot.room.phase === "FINISHED",
            ),
            waitForGameFinished(
              actor.observer,
              (event) => event.payload.gameRevision === 1,
            ),
            waitForGameFinished(
              other.observer,
              (event) => event.payload.gameRevision === 1,
            ),
          ]);
        assert.equal(validateStateSnapshotEvent(actorEvent).ok, true);
        assert.equal(validateStateSnapshotEvent(otherEvent).ok, true);
        assert.equal(validateGameFinishedEvent(actorFinished).ok, true);
        assert.equal(validateGameFinishedEvent(otherFinished).ok, true);
        const otherView = requireFinishedSnapshot(otherEvent.payload.snapshot);
        assert.deepEqual(otherView.game, finished.game);
        assert.equal(otherView.self.rack.length, 14);

        const persisted = await deterministic.runtime.persistence.findById(
          snapshot.room.roomId,
        );
        assert.equal(persisted?.phase, "FINISHED");
        assert.equal(persisted?.storageRevision, 4);
        assert.equal(persisted?.game?.turn, null);
        assert.equal(persisted?.game?.result?.reason, "RACK_EMPTY");

        const sync = requireFinishedSnapshot(
          requireSnapshotSuccess(
            await emitStateSync(
              actor.socket,
              stateSyncCommand("sync-finished-game"),
            ),
          ),
        );
        assert.deepEqual(sync.game.result, finished.game.result);
        assertNoNetworkSecrets(harness.networkPayloads, [
          host.sessionToken,
          guest.sessionToken,
        ]);
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("turn:draw는 한 Tile만 지급하고 개인별 snapshot, next Turn, idempotent replay를 제공한다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const { host, guest, snapshot } = await startTwoPlayerRoom(
          harness,
          "DrawHost",
          "DrawGuest",
        );
        const actor =
          snapshot.game.turn.activePlayerId === host.snapshot.self.playerId
            ? host
            : guest;
        const other = actor === host ? guest : host;
        const actorBefore = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(
            await emitStateSync(
              actor.socket,
              stateSyncCommand("draw-actor-before"),
            ),
          ),
        );
        const persistedBefore = await deterministic.runtime.persistence.findById(
          snapshot.room.roomId,
        );
        assert.ok(persistedBefore?.game);

        const rawSocket = await connectRawClient(harness);
        const malformedAck = await emitWithAck<TurnDrawAck>(
          "malformed turn:draw",
          (acknowledge) => {
            rawSocket.emit(
              "turn:draw",
              {
                kind: "turn:draw",
                protocolVersion: PROTOCOL_VERSION,
                requestId: "malformed-draw",
                expectedGameRevision: actorBefore.versions.gameRevision,
                turnId: actorBefore.game.turn.turnId,
                payload: {
                  bagKind: "CONSONANT",
                  tileId: "client-selected-tile",
                },
              },
              acknowledge,
            );
          },
        );
        assert.equal(validateTurnDrawAck(malformedAck).ok, true);
        requireFailureCode(malformedAck, "INVALID_PAYLOAD");
        assert.deepEqual(
          await deterministic.runtime.persistence.findById(
            snapshot.room.roomId,
          ),
          persistedBefore,
        );

        const command: TurnDrawCommand = {
          kind: "turn:draw",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("accepted-turn-draw"),
          expectedGameRevision: actorBefore.versions.gameRevision,
          turnId: actorBefore.game.turn.turnId,
          payload: { bagKind: "CONSONANT" },
        };
        const acknowledgement = await emitTurnDraw(actor.socket, command);
        assert.equal(validateTurnDrawAck(acknowledgement).ok, true);
        harness.networkPayloads.push(acknowledgement);
        const actorAfter = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(acknowledgement),
        );
        assert.equal(actorAfter.versions.gameRevision, 1);
        assert.equal(
          actorAfter.versions.roomRevision,
          actorBefore.versions.roomRevision,
        );
        assert.equal(actorAfter.self.rack.length, actorBefore.self.rack.length + 1);
        assert.equal(
          actorAfter.game.bagCounts.consonant,
          actorBefore.game.bagCounts.consonant - 1,
        );
        assert.equal(
          actorAfter.game.bagCounts.vowel,
          actorBefore.game.bagCounts.vowel,
        );
        assert.deepEqual(actorAfter.game.board, actorBefore.game.board);
        assert.notEqual(
          actorAfter.game.turn.activePlayerId,
          actorBefore.game.turn.activePlayerId,
        );

        const [actorEvent, otherEvent, actorTurn, otherTurn] =
          await Promise.all([
            waitForSnapshot(
              actor.observer,
              (event) => event.versions.gameRevision === 1,
            ),
            waitForSnapshot(
              other.observer,
              (event) => event.versions.gameRevision === 1,
            ),
            waitForTurnStarted(
              actor.observer,
              (event) => event.versions.gameRevision === 1,
            ),
            waitForTurnStarted(
              other.observer,
              (event) => event.versions.gameRevision === 1,
            ),
          ]);
        assert.equal(validateStateSnapshotEvent(actorEvent).ok, true);
        assert.equal(validateStateSnapshotEvent(otherEvent).ok, true);
        assert.equal(validateTurnStartedEvent(actorTurn).ok, true);
        assert.equal(validateTurnStartedEvent(otherTurn).ok, true);
        const otherView = requireAnyPlayingSnapshot(
          otherEvent.payload.snapshot,
        );
        const drawnTile = actorAfter.self.rack.find(
          (tile) =>
            !actorBefore.self.rack.some(
              (beforeTile) => beforeTile.tileId === tile.tileId,
            ),
        );
        assert.ok(drawnTile);
        assert.equal(
          otherView.room.players.find(
            (player) => player.playerId === actorAfter.self.playerId,
          )?.rackCount,
          actorAfter.self.rack.length,
        );
        assert.equal(
          new Set(collectStringValues(otherView)).has(drawnTile.tileId),
          false,
        );

        const persistedAfter = await deterministic.runtime.persistence.findById(
          snapshot.room.roomId,
        );
        assert.ok(persistedAfter?.game);
        assert.equal(
          persistedAfter.storageRevision,
          persistedBefore.storageRevision + 1,
        );
        assert.equal(persistedAfter.roomRevision, persistedBefore.roomRevision);

        const replay = await emitTurnDraw(actor.socket, command);
        assert.equal(validateTurnDrawAck(replay).ok, true);
        const replaySnapshot = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(replay),
        );
        assert.deepEqual(replaySnapshot.self.rack, actorAfter.self.rack);
        assert.equal(
          replaySnapshot.game.turn.turnId,
          actorAfter.game.turn.turnId,
        );
        assert.deepEqual(
          await deterministic.runtime.persistence.findById(
            snapshot.room.roomId,
          ),
          persistedAfter,
        );

        const conflict = await emitTurnDraw(actor.socket, {
          ...command,
          payload: { bagKind: "VOWEL" },
        });
        assert.equal(validateTurnDrawAck(conflict).ok, true);
        requireFailureCode(conflict, "REQUEST_ID_REUSED");

        actor.socket.disconnect();
        await waitForSnapshot(
          other.observer,
          (event) =>
            event.versions.gameRevision === 1 &&
            playerStatus(
              event.payload.snapshot,
              actor.snapshot.self.playerId,
            ) === "OFFLINE",
        );
        const resumedSocket = await connectTypedClient(harness);
        const resumeAck = await emitResume(resumedSocket, {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("resume-after-turn-draw"),
          payload: {
            credential: {
              roomCode: snapshot.room.roomCode,
              sessionToken: actor.sessionToken,
            },
            lastSeenVersions: actorAfter.versions,
          },
        });
        const resumed = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(resumeAck),
        );
        assert.deepEqual(resumed.self.rack, actorAfter.self.rack);
        assert.deepEqual(resumed.game.bagCounts, actorAfter.game.bagCounts);
        assert.equal(resumed.game.turn.turnId, actorAfter.game.turn.turnId);
        assertNoNetworkSecrets(harness.networkPayloads, [
          host.sessionToken,
          guest.sessionToken,
        ]);
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("turn:pass는 두 bag이 모두 empty일 때만 next Turn을 한 번 생성한다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const { host, guest, snapshot } = await startTwoPlayerRoom(
          harness,
          "PassHost",
          "PassGuest",
        );
        const actor =
          snapshot.game.turn.activePlayerId === host.snapshot.self.playerId
            ? host
            : guest;
        const other = actor === host ? guest : host;
        const command: TurnPassCommand = {
          kind: "turn:pass",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("turn-pass-not-allowed"),
          expectedGameRevision: snapshot.versions.gameRevision,
          turnId: snapshot.game.turn.turnId,
          payload: {},
        };
        const beforeReject = await deterministic.runtime.persistence.findById(
          snapshot.room.roomId,
        );
        const rejected = await emitTurnPass(actor.socket, command);
        assert.equal(validateTurnPassAck(rejected).ok, true);
        requireFailureCode(rejected, "PASS_NOT_ALLOWED");
        assert.deepEqual(
          await deterministic.runtime.persistence.findById(
            snapshot.room.roomId,
          ),
          beforeReject,
        );

        const seeded = await seedBothBagsEmpty(
          deterministic.runtime.persistence,
          snapshot.room.roomId,
          actor.snapshot.self.playerId,
        );
        const actorRackBefore = seeded.game.racks.get(
          actor.snapshot.self.playerId,
        );
        assert.ok(actorRackBefore);
        const acceptedCommand: TurnPassCommand = {
          ...command,
          requestId: requestId("accepted-turn-pass"),
        };
        const acknowledgement = await emitTurnPass(
          actor.socket,
          acceptedCommand,
        );
        assert.equal(validateTurnPassAck(acknowledgement).ok, true);
        harness.networkPayloads.push(acknowledgement);
        const passed = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(acknowledgement),
        );
        assert.equal(passed.versions.gameRevision, 1);
        assert.equal(passed.game.bagCounts.consonant, 0);
        assert.equal(passed.game.bagCounts.vowel, 0);
        assert.deepEqual(passed.game.board, snapshot.game.board);
        assert.equal(passed.self.rack.length, actorRackBefore.length);
        assert.notEqual(
          passed.game.turn.activePlayerId,
          snapshot.game.turn.activePlayerId,
        );

        const [actorEvent, otherEvent, actorTurn, otherTurn] =
          await Promise.all([
            waitForSnapshot(
              actor.observer,
              (event) => event.versions.gameRevision === 1,
            ),
            waitForSnapshot(
              other.observer,
              (event) => event.versions.gameRevision === 1,
            ),
            waitForTurnStarted(
              actor.observer,
              (event) => event.versions.gameRevision === 1,
            ),
            waitForTurnStarted(
              other.observer,
              (event) => event.versions.gameRevision === 1,
            ),
          ]);
        assert.equal(validateStateSnapshotEvent(actorEvent).ok, true);
        assert.equal(validateStateSnapshotEvent(otherEvent).ok, true);
        assert.equal(validateTurnStartedEvent(actorTurn).ok, true);
        assert.equal(validateTurnStartedEvent(otherTurn).ok, true);
        const persisted = await deterministic.runtime.persistence.findById(
          snapshot.room.roomId,
        );
        assert.ok(persisted?.game);
        assert.equal(persisted.storageRevision, seeded.storageRevision + 1);
        assert.equal(persisted.roomRevision, seeded.roomRevision);
        assert.deepEqual(
          persisted.game.racks.get(actor.snapshot.self.playerId),
          actorRackBefore,
        );
      } finally {
        await stopServer(harness);
      }
    });

    await context.test("expired Submit 뒤 internal timeout은 penalty와 next Turn을 fan-out하고 resume으로 복구한다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const { host, guest, snapshot } = await startTwoPlayerRoom(
          harness,
          "TimeoutHost",
          "TimeoutGuest",
        );
        const actor =
          snapshot.game.turn.activePlayerId === host.snapshot.self.playerId
            ? host
            : guest;
        const other = actor === host ? guest : host;
        const actorBefore = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(
            await emitStateSync(
              actor.socket,
              stateSyncCommand("timeout-actor-before"),
            ),
          ),
        );
        const overdue = await seedOverdueCurrentTurn(
          deterministic.runtime.persistence,
          snapshot.room.roomId,
        );
        const expiredSubmit = await emitTurnSubmit(actor.socket, {
          kind: "turn:submit",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("expired-before-timeout"),
          expectedGameRevision: overdue.game.gameRevision,
          turnId: overdue.game.turn.turnId,
          payload: { proposedBoard: { wordGroups: [] } },
        });
        assert.equal(validateTurnSubmitAck(expiredSubmit).ok, true);
        requireFailureCode(expiredSubmit, "TURN_EXPIRED");
        assert.deepEqual(
          await deterministic.runtime.persistence.findById(
            snapshot.room.roomId,
          ),
          overdue,
        );

        actor.socket.disconnect();
        await waitForSnapshot(
          other.observer,
          (event) =>
            event.versions.gameRevision === 0 &&
            playerStatus(
              event.payload.snapshot,
              actor.snapshot.self.playerId,
            ) === "OFFLINE",
        );

        const timeoutResult = await deterministic.runtime.turnTimeoutService.timeout({
          roomId: overdue.roomId,
          gameId: overdue.game.gameId,
          turnId: overdue.game.turn.turnId,
          expectedGameRevision: overdue.game.gameRevision,
          deadlineAt: overdue.game.turn.deadlineAt,
        });
        assert.equal(timeoutResult.status, "APPLIED");

        const [otherEvent, otherTurn] = await Promise.all([
            waitForSnapshot(
              other.observer,
              (event) => event.versions.gameRevision === 1,
            ),
            waitForTurnStarted(
              other.observer,
              (event) => event.versions.gameRevision === 1,
            ),
          ]);
        const otherAfter = requireAnyPlayingSnapshot(
          otherEvent.payload.snapshot,
        );
        assert.equal(validateStateSnapshotEvent(otherEvent).ok, true);
        assert.equal(validateTurnStartedEvent(otherTurn).ok, true);
        assert.notEqual(
          otherAfter.game.turn.activePlayerId,
          actorBefore.game.turn.activePlayerId,
        );

        const persistedAfter = await deterministic.runtime.persistence.findById(
          snapshot.room.roomId,
        );
        assert.ok(persistedAfter?.game);
        assert.equal(persistedAfter.storageRevision, overdue.storageRevision + 1);
        assert.equal(persistedAfter.roomRevision, overdue.roomRevision);
        const duplicateTimeout = await deterministic.runtime.turnTimeoutService.timeout({
          roomId: overdue.roomId,
          gameId: overdue.game.gameId,
          turnId: overdue.game.turn.turnId,
          expectedGameRevision: overdue.game.gameRevision,
          deadlineAt: overdue.game.turn.deadlineAt,
        });
        assert.equal(duplicateTimeout.status, "NO_OP");
        assert.deepEqual(
          await deterministic.runtime.persistence.findById(
            snapshot.room.roomId,
          ),
          persistedAfter,
        );

        const resumedSocket = await connectTypedClient(harness);
        const resumeAck = await emitResume(resumedSocket, {
          kind: "session:resume",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("resume-after-timeout"),
          payload: {
            credential: {
              roomCode: snapshot.room.roomCode,
              sessionToken: actor.sessionToken,
            },
            lastSeenVersions: otherAfter.versions,
          },
        });
        const resumed = requireAnyPlayingSnapshot(
          requireSnapshotSuccess(resumeAck),
        );
        assert.equal(resumed.versions.gameRevision, 1);
        assert.equal(resumed.self.rack.length, actorBefore.self.rack.length + 3);
        assert.equal(
          resumed.game.turn.turnId,
          otherAfter.game.turn.turnId,
        );
        assert.equal(
          otherAfter.room.players.find(
            (player) => player.playerId === resumed.self.playerId,
          )?.rackCount,
          resumed.self.rack.length,
        );
        const penaltyTileIds = resumed.self.rack
          .filter(
            (tile) =>
              !actorBefore.self.rack.some(
                (beforeTile) => beforeTile.tileId === tile.tileId,
              ),
          )
          .map((tile) => tile.tileId);
        assert.equal(penaltyTileIds.length, 3);
        const otherStrings = new Set(collectStringValues(otherAfter));
        for (const penaltyTileId of penaltyTileIds) {
          assert.equal(otherStrings.has(penaltyTileId), false);
        }
        assertNoNetworkSecrets(harness.networkPayloads, [
          host.sessionToken,
          guest.sessionToken,
        ]);
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
