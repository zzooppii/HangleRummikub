import assert from "node:assert/strict";
import test from "node:test";

import {
  GameRevisionSchema,
  NicknameSchema,
  OPAQUE_IDENTIFIER_MAX_LENGTH,
  PROPOSED_BOARD_MAX_WORD_GROUPS,
  PROTOCOL_VERSION,
  RequestIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  SessionTokenSchema,
  TileIdSchema,
  validateGameFinishedEvent,
  validateGameStartAck,
  validateFinishedStateSnapshot,
  validatePlayingStateSnapshot,
  validateRoomCreateAck,
  validateRoomJoinAck,
  validateRoomLeaveAck,
  validateRoomClosedEvent,
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
  type RoomClosedEvent,
  type RoomJoinAck,
  type RoomJoinCommand,
  type RoomLeaveAck,
  type RoomLeaveCommand,
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
import { GameDeadlineService } from "../application/game-deadline-service.js";
import { LobbyDisconnectGraceService } from "../application/lobby-disconnect-grace-service.js";
import { LobbyStateSnapshotProjector } from "../application/lobby-state-snapshot-projector.js";
import { RoomCleanupService } from "../application/room-cleanup-service.js";
import { RoomLeaveService } from "../application/room-leave-service.js";
import { RoomPresencePolicyService } from "../application/room-presence-policy-service.js";
import { RoomRetentionService } from "../application/room-retention-service.js";
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
import { createRackEmptyResult } from "../domain/game/result-engine.js";
import {
  JOKER_ALLOWED_SYMBOLS,
  type OrdinaryTileInstance,
} from "../domain/game/tile-inventory.js";
import { GameRegistry } from "../games/game-registry.js";
import {
  createLegacyHangulCompatibilityRegistration,
  LEGACY_V1_DEFAULT_GAME_TYPE,
} from "../games/legacy-hangul-compatibility-registration.js";
import { createLegacyHangulPlayerLifecycleActions } from "../games/legacy-hangul-player-lifecycle-actions.js";
import {
  LegacyHangulServerActionRouter,
  type LegacyHangulServerActionCapability,
  type LegacyHangulServerActionRouting,
} from "../games/legacy-hangul-server-action-router.js";
import {
  LegacyHangulV1CommandRouter,
  type LegacyHangulV1CommandCapability,
} from "../games/legacy-hangul-v1-command-router.js";
import { projectLegacyHangulV1Game } from "../games/legacy-hangul-v1-game-projector.js";
import { ConnectionRegistry } from "../infrastructure/connection-registry.js";
import { ConnectionRegistryPresenceReader } from "../infrastructure/connection-registry-presence-reader.js";
import { InMemoryPersistence } from "../infrastructure/in-memory-persistence.js";
import { InProcessGameDeadlineScheduler } from "../infrastructure/in-process-game-deadline-scheduler.js";
import { InProcessRoomPolicyScheduler } from "../infrastructure/in-process-room-policy-scheduler.js";
import { InProcessTurnScheduler } from "../infrastructure/in-process-turn-scheduler.js";
import { KeyedSerialExecutor } from "../infrastructure/keyed-serial-executor.js";
import { OverdueTurnSweeper } from "../infrastructure/overdue-turn-sweeper.js";
import { OverdueGameDeadlineSweeper } from "../infrastructure/overdue-game-deadline-sweeper.js";
import {
  RoomLifecycleResources,
  type RoomClosedAdvisoryListener,
} from "../infrastructure/room-lifecycle-resources.js";
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
  ScheduledGameDeadline,
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
  "room:leave": (
    command: unknown,
    acknowledge: (ack: RoomLeaveAck) => void,
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
  roomClosures: RoomClosedEvent[];
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
  const gameRegistry = new GameRegistry([
    createLegacyHangulCompatibilityRegistration(),
  ]);
  const clock = new SystemClock();
  const connectionRegistry = new ConnectionRegistry();
  const tokenIssuer = new NodeCryptoSessionTokenIssuer();
  const roomCodeGenerator = new SequenceRoomCodeGenerator([
    roomCode("ABCDEF"),
    roomCode("BCDEFG"),
  ]);
  const idGenerator = new FakeIdGenerator();
  const playerLifecycleActions =
    createLegacyHangulPlayerLifecycleActions(idGenerator);
  const roomMutationExecutor = new KeyedSerialExecutor<RoomId>();
  const registryPresenceReader = new ConnectionRegistryPresenceReader(
    connectionRegistry,
  );
  const presenceReader = new InjectableFailurePresenceReader(
    registryPresenceReader,
  );
  let acceptsTimeoutWork = false;
  let acceptsGameDeadlineWork = false;
  let legacyHangulServerActionRouter:
    | LegacyHangulServerActionRouting
    | undefined;
  const enqueueTimeout = async (
    deadline: ScheduledTurnDeadline,
  ): Promise<void> => {
    if (
      !acceptsTimeoutWork ||
      legacyHangulServerActionRouter === undefined
    ) {
      return;
    }
    await legacyHangulServerActionRouter.handleTurnTimeout(deadline);
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
  const enqueueGameDeadline = async (
    deadline: ScheduledGameDeadline,
  ): Promise<void> => {
    if (
      !acceptsGameDeadlineWork ||
      legacyHangulServerActionRouter === undefined
    ) {
      return;
    }
    await legacyHangulServerActionRouter.handleGameDeadline(deadline);
  };
  const gameDeadlineScheduler = new InProcessGameDeadlineScheduler({
    clock,
    onDeadline: enqueueGameDeadline,
  });
  const overdueGameDeadlineSweeper = new OverdueGameDeadlineSweeper({
    activeGameReader: persistence,
    clock,
    enqueueDeadline: enqueueGameDeadline,
  });
  const roomClosedListeners = new Set<RoomClosedAdvisoryListener>();
  const roomPlayerRemovedListeners = new Set<
    (roomId: RoomId, playerId: PlayerId) => void | Promise<void>
  >();
  let acceptsRoomPolicyWork = false;
  let roomPresencePolicyService: RoomPresencePolicyService | undefined;
  const roomPolicyScheduler = new InProcessRoomPolicyScheduler({
    clock,
    onDeadline: async (deadline) => {
      if (!acceptsRoomPolicyWork || roomPresencePolicyService === undefined) {
        return;
      }
      await roomPresencePolicyService.onDeadline(deadline);
    },
  });
  const lifecycleResources = new RoomLifecycleResources({
    connectionRegistry,
    policyScheduler: roomPolicyScheduler,
    turnTimerCleanup: turnScheduler,
    gameDeadlineTimerCleanup: gameDeadlineScheduler,
    onRoomClosed: async (closedRoomId, closedRoomCode, bindings) => {
      for (const listener of roomClosedListeners) {
        await listener(closedRoomId, closedRoomCode, bindings);
      }
    },
    onPlayerRemoved: async (removedRoomId, removedPlayerId) => {
      await roomPresencePolicyService?.onPlayerRemoved(
        removedRoomId,
        clock.now(),
      );
      for (const listener of roomPlayerRemovedListeners) {
        await listener(removedRoomId, removedPlayerId);
      }
    },
  });
  const roomCleanupService = new RoomCleanupService({
    roomRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    resources: lifecycleResources,
  });
  const lobbyDisconnectGraceService = new LobbyDisconnectGraceService({
    roomRepository: persistence,
    roomUnitOfWork: persistence,
    roomCleanupUnitOfWork: persistence,
    roomMutationExecutor,
    presenceReader: registryPresenceReader,
    clock,
    resources: lifecycleResources,
  });
  const roomRetentionService = new RoomRetentionService({
    cleanupService: roomCleanupService,
    roomRepository: persistence,
    presenceReader: registryPresenceReader,
    clock,
  });
  roomPresencePolicyService = new RoomPresencePolicyService({
    roomRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    scheduler: roomPolicyScheduler,
    roomPresenceReader: registryPresenceReader,
    playerPresenceLeaseReader: registryPresenceReader,
    playerLifecycleActions,
    clock,
    lobbyGraceService: lobbyDisconnectGraceService,
    retentionService: roomRetentionService,
  });
  const onGameFinished = async (input: {
    roomId: RoomId;
    gameId: import("@hangul-rummikub/shared").GameId;
  }): Promise<void> => {
    await Promise.allSettled([
      turnScheduler.cancelRoom(input.roomId),
      gameDeadlineScheduler.cancelDeadline(input.gameId),
      roomPresencePolicyService?.scheduleFinishedRetention(input.roomId),
    ]);
  };
  const gameDeadlineService = new GameDeadlineService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    gameDeadlineScheduler,
  });
  gameDeadlineService.subscribeApplied(onGameFinished);
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
    gameRegistrationReader: gameRegistry,
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
    gameDeadlineScheduler,
    gameRegistrationReader: gameRegistry,
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
    onGameFinished,
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
    onGameFinished,
  });
  const legacyHangulV1CommandCapability: LegacyHangulV1CommandCapability =
    Object.freeze({
      gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
      start: (input) => gameStartService.start(input),
      submit: (input) => turnSubmitService.submit(input),
      draw: (input) => turnDrawService.draw(input),
      pass: (input) => turnPassService.pass(input),
    });
  const legacyHangulV1CommandRouter = new LegacyHangulV1CommandRouter({
    roomRepository: persistence,
    capability: legacyHangulV1CommandCapability,
  });
  const turnTimeoutService = new TurnTimeoutService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    randomSource: new ZeroRandomSource(),
    presenceLeaseReader: registryPresenceReader,
    turnScheduler,
    onGameFinished,
  });
  const legacyHangulServerActionCapability: LegacyHangulServerActionCapability =
    Object.freeze({
      gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
      handleTurnTimeout: (input) => turnTimeoutService.timeout(input),
      handleGameDeadline: (input) => gameDeadlineService.expire(input),
    });
  legacyHangulServerActionRouter = new LegacyHangulServerActionRouter({
    roomRepository: persistence,
    capability: legacyHangulServerActionCapability,
  });
  const snapshotProjector = new LobbyStateSnapshotProjector({
    clock,
    presenceReader,
    legacyHangulV1GameProjector: projectLegacyHangulV1Game,
  });
  const roomLeaveService = new RoomLeaveService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomCleanupUnitOfWork: persistence,
    roomMutationExecutor,
    presenceReader: registryPresenceReader,
    playerLifecycleActions,
    clock,
    resources: lifecycleResources,
    turnScheduler,
    onGameFinished,
  });

  return {
    runtime: {
      clock,
      connectionRegistry,
      gameRegistry,
      gameDeadlineScheduler,
      legacyHangulServerActionRouter,
      legacyHangulV1CommandRouter,
      overdueGameDeadlineSweeper,
      persistence,
      roomLeaveService,
      roomPolicyScheduler,
      roomPresencePolicyService,
      roomSessionService,
      sessionResumeService,
      snapshotProjector,
      turnScheduler,
      overdueTurnSweeper,
      subscribeGameDeadlineApplied(listener) {
        return gameDeadlineService.subscribeApplied(listener);
      },
      subscribeTurnTimeoutApplied(listener) {
        return turnTimeoutService.subscribeApplied(listener);
      },
      subscribeRoomClosed(listener) {
        roomClosedListeners.add(listener);
        return () => {
          roomClosedListeners.delete(listener);
        };
      },
      subscribeRoomPlayerRemoved(listener) {
        roomPlayerRemovedListeners.add(listener);
        return () => {
          roomPlayerRemovedListeners.delete(listener);
        };
      },
      runRoomMutation(roomId, task) {
        return roomMutationExecutor.run(roomId, task);
      },
      start() {
        acceptsTimeoutWork = true;
        acceptsGameDeadlineWork = true;
        acceptsRoomPolicyWork = true;
        roomPolicyScheduler.start();
        turnScheduler.start();
        gameDeadlineScheduler.start();
        overdueTurnSweeper.start();
        overdueGameDeadlineSweeper.start();
      },
      stop() {
        acceptsTimeoutWork = false;
        acceptsGameDeadlineWork = false;
        acceptsRoomPolicyWork = false;
        roomPolicyScheduler.stop();
        overdueTurnSweeper.stop();
        overdueGameDeadlineSweeper.stop();
        turnScheduler.stop();
        gameDeadlineScheduler.stop();
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
  const roomClosures: RoomClosedEvent[] = [];

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
  socket.on("room:closed", (event) => {
    roomClosures.push(event);
    networkPayloads.push(event);
  });

  return {
    snapshots,
    replacements,
    turnStarts,
    gameFinishes,
    roomClosures,
  };
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

function emitRoomLeave(
  socket: TypedClient,
  command: RoomLeaveCommand,
): Promise<RoomLeaveAck> {
  return emitWithAck("room:leave", (acknowledge) => {
    socket.emit("room:leave", command, acknowledge);
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

function waitForRoomClosed(
  observer: ClientObserver,
): Promise<RoomClosedEvent> {
  return waitForValue("room:closed event", () =>
    takeMatching(observer.roomClosures, () => true),
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
      gameType: room.gameType,
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
      gameType: room.gameType,
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

async function seedOverdueGameDeadline(
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
    throw new Error(
      "A canonical PLAYING Room is required for Game deadline setup.",
    );
  }
  const game: PlayingGameState = Object.freeze({
    ...room.game,
    gameDeadlineAt: room.game.gameStartedAt,
  });
  const result = await persistence.replace({
    candidate: {
      roomId: room.roomId,
      roomCode: room.roomCode,
      gameType: room.gameType,
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
    throw new Error("Failed to persist an overdue Game deadline fixture.");
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
      gameType: room.gameType,
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
        const finishedAt = game.turn.startedAt;
        const finishedGame: FinishedGameState = Object.freeze({
          ...game,
          gameRevision: parse(GameRevisionSchema, game.gameRevision + 1),
          consonantBag: Object.freeze(consonantBag),
          vowelBag: Object.freeze(vowelBag),
          racks,
          turn: null,
          result: createRackEmptyResult(
            {
              playerIds: game.turnOrder,
              racks,
              tilesById: game.tilesById,
              forfeitedPlayerIds: game.forfeitedPlayerIds,
              finishedAt,
            },
            winnerPlayerId,
          ),
        });
        const replacement = await deterministic.runtime.persistence.replace({
          candidate: {
            roomId: room.roomId,
            roomCode: room.roomCode,
            gameType: room.gameType,
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
          finished.game.result.winnerPlayerIds[0],
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
              (event) => event.payload.finalGameRevision === 1,
            ),
            waitForGameFinished(
              other.observer,
              (event) => event.payload.finalGameRevision === 1,
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

    await context.test("Game deadline service는 TIME_LIMIT snapshot과 generalized game:finished를 fan-out한다", async () => {
      const deterministic = createDeterministicRuntime();
      const harness = await startServer(deterministic.runtime);
      try {
        const { host, guest, snapshot } = await startTwoPlayerRoom(
          harness,
          "DeadHost",
          "DeadGuest",
        );
        const overdue = await seedOverdueGameDeadline(
          deterministic.runtime.persistence,
          snapshot.room.roomId,
        );
        host.observer.gameFinishes.splice(0);
        guest.observer.gameFinishes.splice(0);

        const result =
          await deterministic.runtime.legacyHangulServerActionRouter.handleGameDeadline({
            roomId: overdue.roomId,
            gameId: overdue.game.gameId,
            deadlineAt: overdue.game.gameDeadlineAt,
          });
        assert.equal(result.status, "APPLIED");
        if (result.status !== "APPLIED") {
          throw new Error("Expected overdue Game deadline to finish.");
        }

        const [hostSnapshotEvent, guestSnapshotEvent, hostFinish, guestFinish] =
          await Promise.all([
            waitForSnapshot(
              host.observer,
              (event) =>
                event.payload.snapshot.room.phase === "FINISHED" &&
                event.versions.gameRevision === result.data.gameRevision,
            ),
            waitForSnapshot(
              guest.observer,
              (event) =>
                event.payload.snapshot.room.phase === "FINISHED" &&
                event.versions.gameRevision === result.data.gameRevision,
            ),
            waitForGameFinished(
              host.observer,
              (event) =>
                event.payload.reason === "TIME_LIMIT" &&
                event.payload.finalGameRevision === result.data.gameRevision,
            ),
            waitForGameFinished(
              guest.observer,
              (event) =>
                event.payload.reason === "TIME_LIMIT" &&
                event.payload.finalGameRevision === result.data.gameRevision,
            ),
          ]);
        const hostFinished = requireFinishedSnapshot(
          hostSnapshotEvent.payload.snapshot,
        );
        const guestFinished = requireFinishedSnapshot(
          guestSnapshotEvent.payload.snapshot,
        );
        assert.equal(hostFinished.game.result.reason, "TIME_LIMIT");
        assert.deepEqual(guestFinished.game, hostFinished.game);
        assert.equal(validateGameFinishedEvent(hostFinish).ok, true);
        assert.equal(validateGameFinishedEvent(guestFinish).ok, true);
        assert.equal(
          deterministic.runtime.roomPolicyScheduler.scheduledCount,
          1,
        );
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

        const stalemateAck = await emitTurnPass(other.socket, {
          kind: "turn:pass",
          protocolVersion: PROTOCOL_VERSION,
          requestId: requestId("stalemate-ending-turn-pass"),
          expectedGameRevision: passed.versions.gameRevision,
          turnId: passed.game.turn.turnId,
          payload: {},
        });
        assert.equal(validateTurnPassAck(stalemateAck).ok, true);
        const stalemate = requireFinishedSnapshot(
          requireSnapshotSuccess(stalemateAck),
        );
        assert.equal(stalemate.versions.gameRevision, 2);
        assert.equal(stalemate.game.result.reason, "STALEMATE");
        assert.equal("turn" in stalemate.game, false);

        const [actorFinishedEvent, otherFinishedEvent, actorFinish, otherFinish] =
          await Promise.all([
            waitForSnapshot(
              actor.observer,
              (event) =>
                event.payload.snapshot.room.phase === "FINISHED" &&
                event.versions.gameRevision === 2,
            ),
            waitForSnapshot(
              other.observer,
              (event) =>
                event.payload.snapshot.room.phase === "FINISHED" &&
                event.versions.gameRevision === 2,
            ),
            waitForGameFinished(
              actor.observer,
              (event) =>
                event.payload.reason === "STALEMATE" &&
                event.payload.finalGameRevision === 2,
            ),
            waitForGameFinished(
              other.observer,
              (event) =>
                event.payload.reason === "STALEMATE" &&
                event.payload.finalGameRevision === 2,
            ),
          ]);
        assert.equal(
          requireFinishedSnapshot(actorFinishedEvent.payload.snapshot).game
            .result.reason,
          "STALEMATE",
        );
        assert.equal(
          requireFinishedSnapshot(otherFinishedEvent.payload.snapshot).game
            .result.reason,
          "STALEMATE",
        );
        assert.equal(validateGameFinishedEvent(actorFinish).ok, true);
        assert.equal(validateGameFinishedEvent(otherFinish).ok, true);
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

        const timeoutResult =
          await deterministic.runtime.legacyHangulServerActionRouter.handleTurnTimeout({
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
        const duplicateTimeout =
          await deterministic.runtime.legacyHangulServerActionRouter.handleTurnTimeout({
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

test(
  "Phase 15 Socket.IO Room lifecycle",
  { concurrency: false },
  async (context) => {
    await context.test(
      "Lobby Host leave는 successor snapshot을 fan-out하고 동일 요청만 terminal replay하며 socket channel을 떠난다",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const host = await createHostedRoom(harness, "LeaveHost");
          const guest = await joinHostedRoom(harness, host, "LeaveGuest");
          const third = await joinHostedRoom(harness, host, "LeaveThird");
          host.observer.turnStarts.splice(0);

          const command: RoomLeaveCommand = {
            kind: "room:leave",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("host-leave-terminal"),
            expectedRoomRevision: third.snapshot.versions.roomRevision,
            expectedGameRevision: null,
            payload: {},
          };
          const acknowledgement = await emitRoomLeave(host.socket, command);
          assert.equal(validateRoomLeaveAck(acknowledgement).ok, true);
          assert.equal(acknowledgement.ok, true);
          if (!acknowledgement.ok) {
            throw new Error("Expected Host leave success.");
          }
          assert.equal(acknowledgement.data.roomClosed, false);

          const successor = await waitForSnapshot(
            guest.observer,
            (event) =>
              event.payload.snapshot.room.players.length === 2 &&
              event.payload.snapshot.room.players.some(
                (player) =>
                  player.playerId === guest.snapshot.self.playerId &&
                  player.isHost,
              ),
          );
          assert.equal(
            successor.payload.snapshot.room.players.some(
              (player) => player.playerId === host.snapshot.self.playerId,
            ),
            false,
          );

          const replay = await emitRoomLeave(host.socket, command);
          assert.deepEqual(replay, acknowledgement);
          const conflict = await emitRoomLeave(host.socket, {
            ...command,
            expectedRoomRevision: parse(
              RoomRevisionSchema,
              command.expectedRoomRevision + 1,
            ),
          });
          assert.equal(conflict.ok, false);
          if (conflict.ok) {
            throw new Error("Expected leave request ID conflict.");
          }
          assert.equal(conflict.error.code, "REQUEST_ID_REUSED");

          const gameStart = await emitGameStart(guest.socket, {
            kind: "game:start",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("successor-start"),
            expectedRoomRevision:
              successor.payload.snapshot.versions.roomRevision,
            payload: {},
          });
          const playing = requireAnyPlayingSnapshot(
            requireSnapshotSuccess(gameStart),
          );
          await waitForTurnStarted(
            third.observer,
            (event) => event.payload.gameId === playing.game.gameId,
          );
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 25);
          });
          assert.equal(host.observer.turnStarts.length, 0);

          const resumeSocket = await connectTypedClient(harness);
          const resume = await emitResume(resumeSocket, {
            kind: "session:resume",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("left-host-resume"),
            payload: {
              credential: {
                roomCode: host.snapshot.room.roomCode,
                sessionToken: host.sessionToken,
              },
              lastSeenVersions: null,
            },
          });
          requireFailureCode(resume, "SESSION_NOT_FOUND");
        } finally {
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "마지막 Lobby Player leave는 secret-free room:closed를 보내고 Room/session을 cleanup한다",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const host = await createHostedRoom(harness, "SoloLeave");
          const command: RoomLeaveCommand = {
            kind: "room:leave",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("solo-leave"),
            expectedRoomRevision: host.snapshot.versions.roomRevision,
            expectedGameRevision: null,
            payload: {},
          };
          const [acknowledgement, concurrentReplay] = await Promise.all([
            emitRoomLeave(host.socket, command),
            emitRoomLeave(host.socket, command),
          ]);
          assert.equal(validateRoomLeaveAck(acknowledgement).ok, true);
          assert.equal(acknowledgement.ok, true);
          if (!acknowledgement.ok) {
            throw new Error("Expected last Player leave success.");
          }
          assert.equal(acknowledgement.data.roomClosed, true);
          assert.deepEqual(concurrentReplay, acknowledgement);

          const closed = await waitForRoomClosed(host.observer);
          assert.equal(validateRoomClosedEvent(closed).ok, true);
          assert.deepEqual(closed.payload, {
            roomId: host.snapshot.room.roomId,
            roomCode: host.snapshot.room.roomCode,
          });
          assert.equal(
            await deterministic.runtime.persistence.findById(
              host.snapshot.room.roomId,
            ),
            null,
          );
          assert.equal(
            await deterministic.runtime.persistence.findByCode(
              host.snapshot.room.roomCode,
            ),
            null,
          );

          const replay = await emitRoomLeave(host.socket, command);
          assert.deepEqual(replay, acknowledgement);
          assertNoNetworkSecrets(harness.networkPayloads, [host.sessionToken]);
        } finally {
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "room:leave terminal replay cache는 같은 socket의 새 Room scope로 새지 않는다",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const first = await createHostedRoom(harness, "ScopeRoomA");
          const sharedRequestId = requestId("scoped-terminal-leave");
          const firstAck = await emitRoomLeave(first.socket, {
            kind: "room:leave",
            protocolVersion: PROTOCOL_VERSION,
            requestId: sharedRequestId,
            expectedRoomRevision: first.snapshot.versions.roomRevision,
            expectedGameRevision: null,
            payload: {},
          });
          assert.equal(firstAck.ok, true);
          if (!firstAck.ok) {
            throw new Error("Expected first scoped leave success.");
          }

          const secondBootstrap = await bootstrap(
            first.socket,
            "scope-room-b-bootstrap",
          );
          const secondCreate = await emitCreate(first.socket, {
            kind: "room:create",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("scope-room-b-create"),
            payload: {
              bootstrapCredential: { sessionToken: secondBootstrap },
              nickname: nickname("ScopeRoomB"),
            },
          });
          const second = requireSnapshotSuccess(secondCreate);
          assert.notEqual(second.room.roomId, first.snapshot.room.roomId);
          assert.equal(
            second.versions.roomRevision,
            first.snapshot.versions.roomRevision,
          );

          const secondAck = await emitRoomLeave(first.socket, {
            kind: "room:leave",
            protocolVersion: PROTOCOL_VERSION,
            requestId: sharedRequestId,
            expectedRoomRevision: second.versions.roomRevision,
            expectedGameRevision: null,
            payload: {},
          });
          assert.equal(secondAck.ok, true);
          if (!secondAck.ok) {
            throw new Error("Expected second scoped leave success.");
          }
          assert.equal(secondAck.data.roomId, second.room.roomId);
          assert.equal(secondAck.data.roomCode, second.room.roomCode);
          assert.equal(
            await deterministic.runtime.persistence.findById(
              second.room.roomId,
            ),
            null,
          );
        } finally {
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "2인 Game의 current Player leave는 LAST_PLAYER_STANDING을 전달하고 떠난 socket에는 broadcast하지 않는다",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const started = await startTwoPlayerRoom(
            harness,
            "PlayLeaveA",
            "PlayLeaveB",
          );
          const actor =
            started.snapshot.game.turn.activePlayerId ===
            started.host.snapshot.self.playerId
              ? started.host
              : started.guest;
          const other = actor === started.host ? started.guest : started.host;
          actor.observer.turnStarts.splice(0);
          actor.observer.gameFinishes.splice(0);
          other.observer.gameFinishes.splice(0);

          const acknowledgement = await emitRoomLeave(actor.socket, {
            kind: "room:leave",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("current-playing-leave"),
            expectedRoomRevision: started.snapshot.versions.roomRevision,
            expectedGameRevision: started.snapshot.versions.gameRevision,
            payload: {},
          });
          assert.equal(validateRoomLeaveAck(acknowledgement).ok, true);
          assert.equal(acknowledgement.ok, true);

          const afterLeave = await waitForSnapshot(
            other.observer,
            (event) =>
              event.payload.snapshot.room.phase === "FINISHED" &&
              event.payload.snapshot.versions.gameRevision === 1,
          );
          const finished = requireFinishedSnapshot(
            afterLeave.payload.snapshot,
          );
          assert.equal(
            finished.room.players.find(
              (player) => player.playerId === actor.snapshot.self.playerId,
            )?.forfeited,
            true,
          );
          assert.equal(finished.game.result.reason, "LAST_PLAYER_STANDING");
          assert.deepEqual(
            finished.game.result.winnerPlayerIds,
            [other.snapshot.self.playerId],
          );
          const advisory = await waitForGameFinished(
            other.observer,
            (event) =>
              event.payload.reason === "LAST_PLAYER_STANDING" &&
              event.payload.finalGameRevision === 1,
          );
          assert.equal(validateGameFinishedEvent(advisory).ok, true);
          await new Promise<void>((resolve) => {
            setTimeout(resolve, 25);
          });
          assert.equal(actor.observer.turnStarts.length, 0);
          assert.equal(actor.observer.gameFinishes.length, 0);
        } finally {
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "FINISHED commit은 actor delivery가 끊겨도 retention을 먼저 등록한다",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        let releaseProjection = (): void => {};
        try {
          const started = await startTwoPlayerRoom(
            harness,
            "FinishDropA",
            "FinishDropB",
          );
          const actor =
            started.snapshot.game.turn.activePlayerId ===
            started.host.snapshot.self.playerId
              ? started.host
              : started.guest;
          const fixture = await seedDalgyalSubmitFixture(
            deterministic.runtime.persistence,
            started.snapshot.room.roomId,
            actor.snapshot.self.playerId,
            false,
          );
          const projectionRead = deterministic.presenceReader.blockNextRead();
          releaseProjection = projectionRead.release;
          actor.socket.emit(
            "turn:submit",
            {
              kind: "turn:submit",
              protocolVersion: PROTOCOL_VERSION,
              requestId: requestId("finish-before-delivery-drop"),
              expectedGameRevision: fixture.room.game.gameRevision,
              turnId: fixture.room.game.turn.turnId,
              payload: { proposedBoard: fixture.proposedBoard },
            },
            () => {},
          );
          await projectionRead.entered;

          const committed = await deterministic.runtime.persistence.findById(
            started.snapshot.room.roomId,
          );
          assert.equal(committed?.phase, "FINISHED");
          assert.equal(
            deterministic.runtime.roomPolicyScheduler.scheduledCount,
            1,
          );

          actor.socket.disconnect();
          releaseProjection();
          await waitForValue("FINISHED retention remains scheduled", () =>
            deterministic.runtime.roomPolicyScheduler.scheduledCount === 1
              ? true
              : null,
          );
        } finally {
          releaseProjection();
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "2인 Game의 두 번째 offline timeout은 LAST_PLAYER_STANDING으로 종료한다",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const started = await startTwoPlayerRoom(
            harness,
            "OfflineTurnA",
            "OfflineTurnB",
          );
          const offlineActor =
            started.snapshot.game.turn.activePlayerId ===
            started.host.snapshot.self.playerId
              ? started.host
              : started.guest;
          const connectedActor =
            offlineActor === started.host ? started.guest : started.host;
          connectedActor.observer.gameFinishes.splice(0);
          offlineActor.socket.disconnect();
          await waitForSnapshot(
            connectedActor.observer,
            (event) =>
              event.versions.gameRevision === 0 &&
              playerStatus(
                event.payload.snapshot,
                offlineActor.snapshot.self.playerId,
              ) === "OFFLINE",
          );

          const applyCurrentTimeout = async (): Promise<Readonly<{
            result: Extract<
              Awaited<
                ReturnType<
                  ApplicationRuntime["legacyHangulServerActionRouter"]["handleTurnTimeout"]
                >
              >,
              { status: "APPLIED" }
            >;
            snapshot: PlayingStateSnapshot;
          }>> => {
            const overdue = await seedOverdueCurrentTurn(
              deterministic.runtime.persistence,
              started.snapshot.room.roomId,
            );
            const result =
              await deterministic.runtime.legacyHangulServerActionRouter.handleTurnTimeout({
                roomId: overdue.roomId,
                gameId: overdue.game.gameId,
                turnId: overdue.game.turn.turnId,
                expectedGameRevision: overdue.game.gameRevision,
                deadlineAt: overdue.game.turn.deadlineAt,
              });
            assert.equal(result.status, "APPLIED");
            if (result.status !== "APPLIED") {
              throw new Error("Expected current Turn timeout to apply.");
            }
            const event = await waitForSnapshot(
              connectedActor.observer,
              (candidate) =>
                candidate.versions.gameRevision === result.data.gameRevision,
            );
            return {
              result,
              snapshot: requireAnyPlayingSnapshot(event.payload.snapshot),
            };
          };

          const firstOfflineTimeout = await applyCurrentTimeout();
          assert.equal(
            firstOfflineTimeout.result.data.timedOutPlayerId,
            offlineActor.snapshot.self.playerId,
          );
          assert.equal(
            firstOfflineTimeout.result.data.offlineTimeoutStreak,
            1,
          );
          assert.equal(
            firstOfflineTimeout.result.data.timedOutPlayerForfeited,
            false,
          );

          const connectedTimeout = await applyCurrentTimeout();
          assert.equal(
            connectedTimeout.result.data.timedOutPlayerId,
            connectedActor.snapshot.self.playerId,
          );
          assert.equal(connectedTimeout.result.data.offlineTimeoutStreak, 0);

          const overdue = await seedOverdueCurrentTurn(
            deterministic.runtime.persistence,
            started.snapshot.room.roomId,
          );
          const secondOfflineTimeout =
            await deterministic.runtime.legacyHangulServerActionRouter.handleTurnTimeout({
              roomId: overdue.roomId,
              gameId: overdue.game.gameId,
              turnId: overdue.game.turn.turnId,
              expectedGameRevision: overdue.game.gameRevision,
              deadlineAt: overdue.game.turn.deadlineAt,
            });
          assert.equal(secondOfflineTimeout.status, "APPLIED");
          if (secondOfflineTimeout.status !== "APPLIED") {
            throw new Error("Expected second offline timeout to apply.");
          }
          assert.equal(
            secondOfflineTimeout.data.timedOutPlayerId,
            offlineActor.snapshot.self.playerId,
          );
          assert.equal(
            secondOfflineTimeout.data.offlineTimeoutStreak,
            2,
          );
          assert.equal(
            secondOfflineTimeout.data.timedOutPlayerForfeited,
            true,
          );
          assert.equal(secondOfflineTimeout.data.outcome, "FINISHED");
          if (secondOfflineTimeout.data.outcome !== "FINISHED") {
            throw new Error("Expected terminal offline timeout outcome.");
          }
          assert.equal(
            secondOfflineTimeout.data.finishReason,
            "LAST_PLAYER_STANDING",
          );
          assert.deepEqual(secondOfflineTimeout.data.winnerPlayerIds, [
            connectedActor.snapshot.self.playerId,
          ]);

          const terminalEvent = await waitForSnapshot(
            connectedActor.observer,
            (candidate) =>
              candidate.payload.snapshot.room.phase === "FINISHED" &&
              candidate.versions.gameRevision ===
                secondOfflineTimeout.data.gameRevision,
          );
          const terminalSnapshot = requireFinishedSnapshot(
            terminalEvent.payload.snapshot,
          );
          assert.equal(
            terminalSnapshot.room.players.find(
              (player) =>
                player.playerId === offlineActor.snapshot.self.playerId,
            )?.forfeited,
            true,
          );
          assert.equal(terminalSnapshot.game.result.reason, "LAST_PLAYER_STANDING");
          assert.deepEqual(
            terminalSnapshot.game.result.winnerPlayerIds,
            [connectedActor.snapshot.self.playerId],
          );
          await waitForGameFinished(
            connectedActor.observer,
            (event) =>
              event.payload.reason === "LAST_PLAYER_STANDING" &&
              event.payload.finalGameRevision ===
                secondOfflineTimeout.data.gameRevision,
          );

          const connectedViewStrings = new Set(
            collectStringValues(terminalSnapshot),
          );
          for (const penaltyTileId of [
            ...firstOfflineTimeout.result.data.penaltyTileIds,
            ...secondOfflineTimeout.data.penaltyTileIds,
          ]) {
            assert.equal(connectedViewStrings.has(penaltyTileId), false);
          }
        } finally {
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "current disconnect는 grace를 등록하고 같은 session resume은 old grace를 취소한다",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const host = await createHostedRoom(harness, "GraceHost");
          const guest = await joinHostedRoom(harness, host, "GraceGuest");
          guest.socket.disconnect();
          await waitForValue("Lobby disconnect grace registration", () =>
            deterministic.runtime.roomPolicyScheduler.scheduledCount === 1
              ? true
              : null,
          );
          const offline = await waitForSnapshot(
            host.observer,
            (event) =>
              event.payload.snapshot.room.players.some(
                (player) =>
                  player.playerId === guest.snapshot.self.playerId &&
                  player.connectionStatus === "OFFLINE",
              ),
          );
          assert.equal(offline.payload.snapshot.versions.gameRevision, null);

          const resumedSocket = await connectTypedClient(harness);
          const resumed = await emitResume(resumedSocket, {
            kind: "session:resume",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("grace-resume"),
            payload: {
              credential: {
                roomCode: guest.snapshot.room.roomCode,
                sessionToken: guest.sessionToken,
              },
              lastSeenVersions: guest.snapshot.versions,
            },
          });
          assert.equal(validateSessionResumeAck(resumed).ok, true);
          assert.equal(resumed.ok, true);
          await waitForValue("Lobby grace cancellation", () =>
            deterministic.runtime.roomPolicyScheduler.scheduledCount === 0
              ? true
              : null,
          );
        } finally {
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "Lobby grace expiry와 resume 경합은 새 primary generation을 보존한다",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const host = await createHostedRoom(harness, "GraceRace");
          const playerId = host.snapshot.self.playerId;
          const currentRoomId = host.snapshot.room.roomId;
          host.socket.disconnect();
          await waitForValue("offline grace generation", () => {
            const generation =
              deterministic.runtime.connectionRegistry.getConnectionGeneration(
                currentRoomId,
                playerId,
              );
            return generation === null ? null : generation;
          });
          const generation =
            deterministic.runtime.connectionRegistry.getConnectionGeneration(
              currentRoomId,
              playerId,
            );
          assert.notEqual(generation, null);
          if (generation === null) {
            throw new Error("Expected disconnected Player generation.");
          }

          let enterLane = (): void => {};
          let releaseLane = (): void => {};
          const laneEntered = new Promise<void>((resolve) => {
            enterLane = resolve;
          });
          const laneRelease = new Promise<void>((resolve) => {
            releaseLane = resolve;
          });
          const heldLane = deterministic.runtime.runRoomMutation(
            currentRoomId,
            async () => {
              enterLane();
              await laneRelease;
            },
          );
          await laneEntered;

          const now = deterministic.runtime.clock.now();
          const graceExpiry =
            deterministic.runtime.roomPresencePolicyService.onDeadline({
              kind: "LOBBY_DISCONNECT_GRACE",
              roomId: currentRoomId,
              playerId,
              connectionGeneration: generation,
              disconnectedAt: parse(ServerTimeSchema, now - 60_001),
              deadlineAt: parse(ServerTimeSchema, now - 1),
            });

          const resumedSocket = await connectTypedClient(harness);
          const resumed = await emitResume(resumedSocket, {
            kind: "session:resume",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("grace-expiry-resume-race"),
            payload: {
              credential: {
                roomCode: host.snapshot.room.roomCode,
                sessionToken: host.sessionToken,
              },
              lastSeenVersions: host.snapshot.versions,
            },
          });
          assert.equal(resumed.ok, true);

          releaseLane();
          await heldLane;
          await graceExpiry;
          const room = await deterministic.runtime.persistence.findById(
            currentRoomId,
          );
          assert.ok(room);
          assert.equal(
            room.players.some((player) => player.playerId === playerId),
            true,
          );
          assert.equal(
            deterministic.runtime.connectionRegistry.getConnectionStatus(
              currentRoomId,
              playerId,
            ),
            "CONNECTED",
          );
        } finally {
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "hostless Lobby resume은 Host election이 반영된 snapshot을 반환한다",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const host = await createHostedRoom(harness, "HostlessA");
          const guest = await joinHostedRoom(harness, host, "HostlessB");
          host.socket.disconnect();
          guest.socket.disconnect();
          await waitForValue("both Lobby grace registrations", () =>
            deterministic.runtime.roomPolicyScheduler.scheduledCount === 2
              ? true
              : null,
          );
          const hostGeneration =
            deterministic.runtime.connectionRegistry.getConnectionGeneration(
              host.snapshot.room.roomId,
              host.snapshot.self.playerId,
            );
          assert.notEqual(hostGeneration, null);
          if (hostGeneration === null) {
            throw new Error("Expected disconnected Host generation.");
          }
          const now = deterministic.runtime.clock.now();
          await deterministic.runtime.roomPresencePolicyService.onDeadline({
            kind: "LOBBY_DISCONNECT_GRACE",
            roomId: host.snapshot.room.roomId,
            playerId: host.snapshot.self.playerId,
            connectionGeneration: hostGeneration,
            disconnectedAt: parse(ServerTimeSchema, now - 60_001),
            deadlineAt: parse(ServerTimeSchema, now - 1),
          });
          const hostless = await deterministic.runtime.persistence.findById(
            host.snapshot.room.roomId,
          );
          assert.ok(hostless);
          assert.equal(hostless.hostPlayerId, null);

          const resumedSocket = await connectTypedClient(harness);
          const resumed = await emitResume(resumedSocket, {
            kind: "session:resume",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("hostless-lobby-resume"),
            payload: {
              credential: {
                roomCode: guest.snapshot.room.roomCode,
                sessionToken: guest.sessionToken,
              },
              lastSeenVersions: guest.snapshot.versions,
            },
          });
          const resumedSnapshot = requireSnapshotSuccess(resumed);
          assert.equal(resumedSnapshot.room.phase, "LOBBY");
          assert.equal(
            resumedSnapshot.room.players.find(
              (player) => player.playerId === guest.snapshot.self.playerId,
            )?.isHost,
            true,
          );
        } finally {
          await stopServer(harness);
        }
      },
    );
  },
);

type StartedMultiPlayerRoom = Readonly<{
  players: readonly HostedRoom[];
  snapshot: PlayingStateSnapshot;
}>;

async function startMultiPlayerRoom(
  harness: TestHarness,
  names: readonly [string, string, ...string[]],
): Promise<StartedMultiPlayerRoom> {
  const host = await createHostedRoom(harness, names[0]);
  const players: HostedRoom[] = [host];
  for (const name of names.slice(1)) {
    players.push(await joinHostedRoom(harness, host, name));
  }
  const latest = players.at(-1);
  if (latest === undefined) {
    throw new Error("A multi-Player fixture requires at least two Players.");
  }
  const acknowledgement = await emitGameStart(host.socket, {
    kind: "game:start",
    protocolVersion: PROTOCOL_VERSION,
    requestId: requestId(`${names[0]}-multi-start`),
    expectedRoomRevision: latest.snapshot.versions.roomRevision,
    payload: {},
  });
  const snapshot = requirePlayingSnapshot(
    requireSnapshotSuccess(acknowledgement),
  );
  await Promise.all(
    players.flatMap((player) => [
      waitForSnapshot(
        player.observer,
        (event) =>
          event.payload.snapshot.room.phase === "PLAYING" &&
          event.payload.snapshot.room.roomId === snapshot.room.roomId,
      ),
      waitForTurnStarted(
        player.observer,
        (event) => event.payload.gameId === snapshot.game.gameId,
      ),
    ]),
  );
  return { players, snapshot };
}

function playerById(
  players: readonly HostedRoom[],
  playerIdValue: PlayerId,
): HostedRoom {
  const player = players.find(
    (candidate) => candidate.snapshot.self.playerId === playerIdValue,
  );
  if (player === undefined) {
    throw new Error(`Missing Socket.IO Player fixture for ${playerIdValue}.`);
  }
  return player;
}

test(
  "Phase 17 Socket.IO security and complete lifecycle matrix",
  { concurrency: false, timeout: 90_000 },
  async (context) => {
    await context.test(
      "2-player create/start/Submit/Draw/disconnect/resume/timeout/finish lifecycle preserves identity and privacy",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const started = await startTwoPlayerRoom(
            harness,
            "E2E2Host",
            "E2E2Guest",
          );
          const originalRoomId = started.snapshot.room.roomId;
          const originalGameId = started.snapshot.game.gameId;
          const actor =
            started.snapshot.game.turn.activePlayerId ===
            started.host.snapshot.self.playerId
              ? started.host
              : started.guest;
          const other = actor === started.host ? started.guest : started.host;
          const fixture = await seedDalgyalSubmitFixture(
            deterministic.runtime.persistence,
            originalRoomId,
            actor.snapshot.self.playerId,
            true,
          );
          const submitted = requireAnyPlayingSnapshot(
            requireSnapshotSuccess(
              await emitTurnSubmit(actor.socket, {
                kind: "turn:submit",
                protocolVersion: PROTOCOL_VERSION,
                requestId: requestId("e2e2-submit"),
                expectedGameRevision: fixture.room.game.gameRevision,
                turnId: fixture.room.game.turn.turnId,
                payload: { proposedBoard: fixture.proposedBoard },
              }),
            ),
          );
          assert.equal(submitted.room.roomId, originalRoomId);
          assert.equal(submitted.game.gameId, originalGameId);

          const afterSubmitState =
            await deterministic.runtime.persistence.findById(originalRoomId);
          const oldTurnCommands = [
            emitTurnSubmit(actor.socket, {
              kind: "turn:submit",
              protocolVersion: PROTOCOL_VERSION,
              requestId: requestId("e2e2-old-submit"),
              expectedGameRevision: fixture.room.game.gameRevision,
              turnId: fixture.room.game.turn.turnId,
              payload: { proposedBoard: fixture.proposedBoard },
            }),
            emitTurnDraw(actor.socket, {
              kind: "turn:draw",
              protocolVersion: PROTOCOL_VERSION,
              requestId: requestId("e2e2-old-draw"),
              expectedGameRevision: fixture.room.game.gameRevision,
              turnId: fixture.room.game.turn.turnId,
              payload: { bagKind: "CONSONANT" },
            }),
            emitTurnPass(actor.socket, {
              kind: "turn:pass",
              protocolVersion: PROTOCOL_VERSION,
              requestId: requestId("e2e2-old-pass"),
              expectedGameRevision: fixture.room.game.gameRevision,
              turnId: fixture.room.game.turn.turnId,
              payload: {},
            }),
          ] as const;
          for (const acknowledgement of await Promise.all(oldTurnCommands)) {
            requireFailureCode(acknowledgement, "NOT_YOUR_TURN");
          }
          assert.deepEqual(
            await deterministic.runtime.persistence.findById(originalRoomId),
            afterSubmitState,
          );

          const drawn = requireAnyPlayingSnapshot(
            requireSnapshotSuccess(
              await emitTurnDraw(other.socket, {
                kind: "turn:draw",
                protocolVersion: PROTOCOL_VERSION,
                requestId: requestId("e2e2-draw"),
                expectedGameRevision: submitted.versions.gameRevision,
                turnId: submitted.game.turn.turnId,
                payload: { bagKind: "CONSONANT" },
              }),
            ),
          );
          assert.equal(drawn.game.turn.activePlayerId, actor.snapshot.self.playerId);

          actor.socket.disconnect();
          await waitForSnapshot(
            other.observer,
            (event) =>
              event.versions.gameRevision === drawn.versions.gameRevision &&
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
          const resumed = requireAnyPlayingSnapshot(
            requireSnapshotSuccess(
              await emitResume(resumedSocket, {
                kind: "session:resume",
                protocolVersion: PROTOCOL_VERSION,
                requestId: requestId("e2e2-resume"),
                payload: {
                  credential: {
                    roomCode: started.snapshot.room.roomCode,
                    sessionToken: actor.sessionToken,
                  },
                  lastSeenVersions: drawn.versions,
                },
              }),
            ),
          );
          assert.equal(resumed.self.playerId, actor.snapshot.self.playerId);
          assert.equal(resumed.game.gameId, originalGameId);
          assert.equal(resumed.game.turn.turnId, drawn.game.turn.turnId);

          const overdue = await seedOverdueCurrentTurn(
            deterministic.runtime.persistence,
            originalRoomId,
          );
          const timeout =
            await deterministic.runtime.legacyHangulServerActionRouter.handleTurnTimeout({
              roomId: originalRoomId,
              gameId: originalGameId,
              turnId: overdue.game.turn.turnId,
              expectedGameRevision: overdue.game.gameRevision,
              deadlineAt: overdue.game.turn.deadlineAt,
            });
          assert.equal(timeout.status, "APPLIED");
          if (timeout.status !== "APPLIED") {
            throw new Error("Expected integrated timeout to apply.");
          }
          const afterTimeoutEvent = await waitForSnapshot(
            resumedObserver,
            (event) =>
              event.versions.gameRevision === timeout.data.gameRevision,
          );
          const afterTimeout = requireAnyPlayingSnapshot(
            afterTimeoutEvent.payload.snapshot,
          );
          assert.equal(afterTimeout.game.turn.activePlayerId, other.snapshot.self.playerId);

          const leave = await emitRoomLeave(other.socket, {
            kind: "room:leave",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("e2e2-finish-leave"),
            expectedRoomRevision: afterTimeout.versions.roomRevision,
            expectedGameRevision: afterTimeout.versions.gameRevision,
            payload: {},
          });
          assert.equal(leave.ok, true);
          const terminal = requireFinishedSnapshot(
            (
              await waitForSnapshot(
                resumedObserver,
                (event) => event.payload.snapshot.room.phase === "FINISHED",
              )
            ).payload.snapshot,
          );
          assert.equal(terminal.room.roomId, originalRoomId);
          assert.equal(terminal.game.gameId, originalGameId);
          assert.equal(terminal.game.result.reason, "LAST_PLAYER_STANDING");
          assert.deepEqual(terminal.game.result.winnerPlayerIds, [
            actor.snapshot.self.playerId,
          ]);
          assert.equal(terminal.game.result.rankings.length, 2);
          assertNoNetworkSecrets(harness.networkPayloads, [
            started.host.sessionToken,
            started.guest.sessionToken,
          ]);
        } finally {
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "3-player reconnect와 forfeit 이후 turn transition은 forfeited Player를 건너뛰고 3-entry result로 끝난다",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const started = await startMultiPlayerRoom(harness, [
            "E2E3Host",
            "E2E3Guest1",
            "E2E3Guest2",
          ]);
          assert.equal(started.snapshot.game.turnOrder.length, 3);
          assert.equal(new Set(started.snapshot.game.turnOrder).size, 3);
          const activeId = started.snapshot.game.turn.activePlayerId;
          const reconnecting = started.players.find(
            (player) => player.snapshot.self.playerId !== activeId,
          );
          if (reconnecting === undefined) {
            throw new Error("Missing non-active reconnect fixture.");
          }
          reconnecting.socket.disconnect();
          const connectedObserver = started.players.find(
            (player) => player !== reconnecting,
          )?.observer;
          if (connectedObserver === undefined) {
            throw new Error("Missing connected observer fixture.");
          }
          await waitForSnapshot(
            connectedObserver,
            (event) =>
              playerStatus(
                event.payload.snapshot,
                reconnecting.snapshot.self.playerId,
              ) === "OFFLINE",
          );
          const resumedSocket = await connectTypedClient(harness);
          const resumedObserver = observeClient(
            resumedSocket,
            harness.networkPayloads,
          );
          const resumedSnapshot = requireAnyPlayingSnapshot(
            requireSnapshotSuccess(
              await emitResume(resumedSocket, {
                kind: "session:resume",
                protocolVersion: PROTOCOL_VERSION,
                requestId: requestId("e2e3-resume"),
                payload: {
                  credential: {
                    roomCode: reconnecting.snapshot.room.roomCode,
                    sessionToken: reconnecting.sessionToken,
                  },
                  lastSeenVersions: started.snapshot.versions,
                },
              }),
            ),
          );
          assert.equal(
            resumedSnapshot.self.playerId,
            reconnecting.snapshot.self.playerId,
          );
          const livePlayers = started.players.map((player) =>
            player === reconnecting
              ? { ...player, socket: resumedSocket, observer: resumedObserver }
              : player,
          );
          const forfeiting = livePlayers.find(
            (player) =>
              player.snapshot.self.playerId !== activeId &&
              player.snapshot.self.playerId !== resumedSnapshot.self.playerId,
          );
          if (forfeiting === undefined) {
            throw new Error("Missing non-current forfeit fixture.");
          }
          const currentView = requireAnyPlayingSnapshot(
            requireSnapshotSuccess(
              await emitStateSync(
                playerById(livePlayers, activeId).socket,
                stateSyncCommand("e2e3-before-forfeit"),
              ),
            ),
          );
          assert.equal(
            (
              await emitRoomLeave(forfeiting.socket, {
                kind: "room:leave",
                protocolVersion: PROTOCOL_VERSION,
                requestId: requestId("e2e3-noncurrent-leave"),
                expectedRoomRevision: currentView.versions.roomRevision,
                expectedGameRevision: currentView.versions.gameRevision,
                payload: {},
              })
            ).ok,
            true,
          );
          const afterForfeit = requireAnyPlayingSnapshot(
            requireSnapshotSuccess(
              await emitStateSync(
                playerById(livePlayers, activeId).socket,
                stateSyncCommand("e2e3-after-forfeit"),
              ),
            ),
          );
          assert.equal(afterForfeit.game.turn.activePlayerId, activeId);
          assert.equal(
            afterForfeit.room.players.find(
              (player) => player.playerId === forfeiting.snapshot.self.playerId,
            )?.forfeited,
            true,
          );
          const afterDraw = requireAnyPlayingSnapshot(
            requireSnapshotSuccess(
              await emitTurnDraw(playerById(livePlayers, activeId).socket, {
                kind: "turn:draw",
                protocolVersion: PROTOCOL_VERSION,
                requestId: requestId("e2e3-draw-after-forfeit"),
                expectedGameRevision: afterForfeit.versions.gameRevision,
                turnId: afterForfeit.game.turn.turnId,
                payload: { bagKind: "VOWEL" },
              }),
            ),
          );
          assert.notEqual(
            afterDraw.game.turn.activePlayerId,
            forfeiting.snapshot.self.playerId,
          );
          const finalLeaver = playerById(
            livePlayers,
            afterDraw.game.turn.activePlayerId,
          );
          const survivor = livePlayers.find(
            (player) =>
              player.snapshot.self.playerId !==
                forfeiting.snapshot.self.playerId &&
              player.snapshot.self.playerId !==
                finalLeaver.snapshot.self.playerId,
          );
          if (survivor === undefined) {
            throw new Error("Missing 3-Player survivor fixture.");
          }
          const survivorObserver = survivor.observer;
          assert.equal(
            (
              await emitRoomLeave(finalLeaver.socket, {
                kind: "room:leave",
                protocolVersion: PROTOCOL_VERSION,
                requestId: requestId("e2e3-terminal-leave"),
                expectedRoomRevision: afterDraw.versions.roomRevision,
                expectedGameRevision: afterDraw.versions.gameRevision,
                payload: {},
              })
            ).ok,
            true,
          );
          const terminal = requireFinishedSnapshot(
            (
              await waitForSnapshot(
                survivorObserver,
                (event) => event.payload.snapshot.room.phase === "FINISHED",
              )
            ).payload.snapshot,
          );
          assert.equal(terminal.game.result.reason, "LAST_PLAYER_STANDING");
          assert.deepEqual(terminal.game.result.winnerPlayerIds, [
            survivor.snapshot.self.playerId,
          ]);
          assert.equal(terminal.game.result.rankings.length, 3);
        } finally {
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "4-player capacity/start/privacy/multiple transitions/final ranking은 canonical limits를 유지한다",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const host = await createHostedRoom(harness, "E2E4Host");
          const guests = [
            await joinHostedRoom(harness, host, "E2E4Guest1"),
            await joinHostedRoom(harness, host, "E2E4Guest2"),
            await joinHostedRoom(harness, host, "E2E4Guest3"),
          ];
          const players = [host, ...guests];
          const fullRoom = guests[2]?.snapshot;
          if (fullRoom === undefined) {
            throw new Error("Missing 4-Player Lobby snapshot.");
          }

          const fifthSocket = await connectTypedClient(harness);
          const fifthToken = await bootstrap(fifthSocket, "e2e4-fifth-bootstrap");
          const beforeFifth = await deterministic.runtime.persistence.findById(
            host.snapshot.room.roomId,
          );
          const fifthJoin = await emitJoin(fifthSocket, {
            kind: "room:join",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("e2e4-fifth-join"),
            payload: {
              bootstrapCredential: { sessionToken: fifthToken },
              nickname: nickname("E2E4Fifth"),
              roomCode: host.snapshot.room.roomCode,
            },
          });
          requireFailureCode(fifthJoin, "ROOM_FULL");
          assert.deepEqual(
            await deterministic.runtime.persistence.findById(
              host.snapshot.room.roomId,
            ),
            beforeFifth,
          );

          const nonHostStart = await emitGameStart(guests[0]?.socket ?? host.socket, {
            kind: "game:start",
            protocolVersion: PROTOCOL_VERSION,
            requestId: requestId("e2e4-nonhost-start"),
            expectedRoomRevision: fullRoom.versions.roomRevision,
            payload: {},
          });
          requireFailureCode(nonHostStart, "HOST_ONLY");
          assert.deepEqual(
            await deterministic.runtime.persistence.findById(
              host.snapshot.room.roomId,
            ),
            beforeFifth,
          );

          const started = requirePlayingSnapshot(
            requireSnapshotSuccess(
              await emitGameStart(host.socket, {
                kind: "game:start",
                protocolVersion: PROTOCOL_VERSION,
                requestId: requestId("e2e4-host-start"),
                expectedRoomRevision: fullRoom.versions.roomRevision,
                payload: {},
              }),
            ),
          );
          assert.equal(started.room.players.length, 4);
          assert.equal(started.game.turnOrder.length, 4);
          assert.equal(new Set(started.game.turnOrder).size, 4);
          assert.deepEqual(started.game.bagCounts, {
            consonant: 67,
            vowel: 33,
          });

          const views = await Promise.all(
            players.map(async (player, index) =>
              requireAnyPlayingSnapshot(
                requireSnapshotSuccess(
                  await emitStateSync(
                    player.socket,
                    stateSyncCommand(`e2e4-private-view-${index}`),
                  ),
                ),
              ),
            ),
          );
          for (const [index, view] of views.entries()) {
            assert.equal(view.self.rack.length, 14);
            const ownTileIds = view.self.rack.map((tile) => tile.tileId);
            for (const [otherIndex, otherView] of views.entries()) {
              if (otherIndex === index) {
                continue;
              }
              const otherStrings = new Set(collectStringValues(otherView));
              for (const tileIdValue of ownTileIds) {
                assert.equal(otherStrings.has(tileIdValue), false);
              }
            }
          }

          let current = started;
          for (const [index, bagKind] of (
            ["CONSONANT", "VOWEL"] as const
          ).entries()) {
            const currentActor = playerById(
              players,
              current.game.turn.activePlayerId,
            );
            current = requireAnyPlayingSnapshot(
              requireSnapshotSuccess(
                await emitTurnDraw(currentActor.socket, {
                  kind: "turn:draw",
                  protocolVersion: PROTOCOL_VERSION,
                  requestId: requestId(`e2e4-transition-${index}`),
                  expectedGameRevision: current.versions.gameRevision,
                  turnId: current.game.turn.turnId,
                  payload: { bagKind },
                }),
              ),
            );
          }

          for (const [index, leaver] of guests.entries()) {
            const beforeLeave = requireAnyPlayingSnapshot(
              requireSnapshotSuccess(
                await emitStateSync(
                  host.socket,
                  stateSyncCommand(`e2e4-before-leave-${index}`),
                ),
              ),
            );
            const acknowledgement = await emitRoomLeave(leaver.socket, {
              kind: "room:leave",
              protocolVersion: PROTOCOL_VERSION,
              requestId: requestId(`e2e4-leave-${index}`),
              expectedRoomRevision: beforeLeave.versions.roomRevision,
              expectedGameRevision: beforeLeave.versions.gameRevision,
              payload: {},
            });
            assert.equal(acknowledgement.ok, true);
          }
          const terminal = requireFinishedSnapshot(
            (
              await waitForSnapshot(
                host.observer,
                (event) => event.payload.snapshot.room.phase === "FINISHED",
              )
            ).payload.snapshot,
          );
          assert.equal(terminal.game.result.reason, "LAST_PLAYER_STANDING");
          assert.deepEqual(terminal.game.result.winnerPlayerIds, [
            host.snapshot.self.playerId,
          ]);
          assert.equal(terminal.game.result.rankings.length, 4);
          assert.equal(
            terminal.game.result.rankings.filter((entry) => entry.forfeited)
              .length,
            3,
          );
          assertNoNetworkSecrets(harness.networkPayloads, [
            ...players.map((player) => player.sessionToken),
            fifthToken,
          ]);
        } finally {
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "network Tile probes for unknown, another rack and bag are indistinguishable and immutable",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const started = await startTwoPlayerRoom(
            harness,
            "ProbeHost",
            "ProbeGuest",
          );
          const actor =
            started.snapshot.game.turn.activePlayerId ===
            started.host.snapshot.self.playerId
              ? started.host
              : started.guest;
          const other = actor === started.host ? started.guest : started.host;
          const fixture = await seedDalgyalSubmitFixture(
            deterministic.runtime.persistence,
            started.snapshot.room.roomId,
            actor.snapshot.self.playerId,
            true,
          );
          const otherRack = fixture.room.game.racks.get(
            other.snapshot.self.playerId,
          );
          const otherRackTileId = otherRack?.[0];
          const bagTileId =
            fixture.room.game.consonantBag[0] ??
            fixture.room.game.vowelBag[0];
          if (otherRackTileId === undefined || bagTileId === undefined) {
            throw new Error("Tile probe fixture requires private rack and bag Tiles.");
          }
          const firstGroup = fixture.proposedBoard.wordGroups[0];
          if (firstGroup === undefined) {
            throw new Error("Tile probe fixture requires a WordGroup.");
          }
          const probes = [
            {
              name: "unknown",
              tileId: parse(TileIdSchema, "phase17-unknown-tile"),
            },
            { name: "other-rack", tileId: otherRackTileId },
            { name: "bag", tileId: bagTileId },
          ] as const;
          const before = await deterministic.runtime.persistence.findById(
            started.snapshot.room.roomId,
          );
          const publicErrors: Array<Readonly<{
            code: string;
            message: string;
            recoverable: boolean;
          }>> = [];

          for (const [index, probe] of probes.entries()) {
            const proposedBoard = {
              wordGroups: [
                {
                  ...firstGroup,
                  syllables: firstGroup.syllables.map(
                    (syllable, syllableIndex) =>
                      syllableIndex === 0
                        ? {
                            ...syllable,
                            choseong: [
                              {
                                tileId: probe.tileId,
                                assignedSymbol: "ㅇ",
                              },
                            ],
                          }
                        : syllable,
                  ),
                },
              ],
            };
            const acknowledgement = await emitTurnSubmit(actor.socket, {
              kind: "turn:submit",
              protocolVersion: PROTOCOL_VERSION,
              requestId: requestId(`phase17-probe-${index}`),
              expectedGameRevision: fixture.room.game.gameRevision,
              turnId: fixture.room.game.turn.turnId,
              payload: { proposedBoard },
            });
            requireFailureCode(acknowledgement, "INVALID_TILE_ACCESS");
            if (acknowledgement.ok) {
              throw new Error("Expected Tile probe rejection.");
            }
            publicErrors.push(acknowledgement.error);
          }
          assert.ok(
            publicErrors.every(
              (error) =>
                error.code === publicErrors[0]?.code &&
                error.message === publicErrors[0]?.message &&
                error.recoverable === publicErrors[0]?.recoverable,
            ),
          );
          assert.deepEqual(
            await deterministic.runtime.persistence.findById(
              started.snapshot.room.roomId,
            ),
            before,
          );
        } finally {
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "malformed, forged and oversized commands return safe errors without changing canonical state",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const started = await startTwoPlayerRoom(
            harness,
            "FuzzHost",
            "FuzzGuest",
          );
          const before = await deterministic.runtime.persistence.findById(
            started.snapshot.room.roomId,
          );
          const raw = await connectRawClient(harness);
          const invalidCommands: readonly Readonly<{
            name: string;
            emit(acknowledge: (ack: TurnSubmitAck) => void): void;
            expectedCode: "INVALID_PAYLOAD" | "INCOMPATIBLE_PROTOCOL";
          }>[] = [
            {
              name: "forged actor",
              emit: (acknowledge) =>
                raw.emit(
                  "turn:submit",
                  {
                    kind: "turn:submit",
                    protocolVersion: PROTOCOL_VERSION,
                    requestId: "phase17-forged-actor",
                    expectedGameRevision: started.snapshot.versions.gameRevision,
                    turnId: started.snapshot.game.turn.turnId,
                    playerId: started.snapshot.self.playerId,
                    payload: { proposedBoard: { wordGroups: [] } },
                  },
                  acknowledge,
                ),
              expectedCode: "INVALID_PAYLOAD",
            },
            {
              name: "floating revision",
              emit: (acknowledge) =>
                raw.emit(
                  "turn:submit",
                  {
                    kind: "turn:submit",
                    protocolVersion: PROTOCOL_VERSION,
                    requestId: "phase17-floating-revision",
                    expectedGameRevision: 0.5,
                    turnId: started.snapshot.game.turn.turnId,
                    payload: { proposedBoard: { wordGroups: [] } },
                  },
                  acknowledge,
                ),
              expectedCode: "INVALID_PAYLOAD",
            },
            {
              name: "oversized request identifier",
              emit: (acknowledge) =>
                raw.emit(
                  "turn:submit",
                  {
                    kind: "turn:submit",
                    protocolVersion: PROTOCOL_VERSION,
                    requestId: "r".repeat(
                      OPAQUE_IDENTIFIER_MAX_LENGTH + 1,
                    ),
                    expectedGameRevision: started.snapshot.versions.gameRevision,
                    turnId: started.snapshot.game.turn.turnId,
                    payload: { proposedBoard: { wordGroups: [] } },
                  },
                  acknowledge,
                ),
              expectedCode: "INVALID_PAYLOAD",
            },
            {
              name: "oversized proposed Board",
              emit: (acknowledge) =>
                raw.emit(
                  "turn:submit",
                  {
                    kind: "turn:submit",
                    protocolVersion: PROTOCOL_VERSION,
                    requestId: "phase17-oversized-board",
                    expectedGameRevision: started.snapshot.versions.gameRevision,
                    turnId: started.snapshot.game.turn.turnId,
                    payload: {
                      proposedBoard: {
                        wordGroups: Array.from(
                          { length: PROPOSED_BOARD_MAX_WORD_GROUPS + 1 },
                          (_, index) => ({
                            groupId: `oversized-group-${index}`,
                            syllables: [],
                          }),
                        ),
                      },
                    },
                  },
                  acknowledge,
                ),
              expectedCode: "INVALID_PAYLOAD",
            },
            {
              name: "unsupported protocol",
              emit: (acknowledge) =>
                raw.emit(
                  "turn:submit",
                  {
                    kind: "turn:submit",
                    protocolVersion: PROTOCOL_VERSION + 1,
                    requestId: "phase17-protocol",
                    expectedGameRevision: started.snapshot.versions.gameRevision,
                    turnId: started.snapshot.game.turn.turnId,
                    payload: { proposedBoard: { wordGroups: [] } },
                  },
                  acknowledge,
                ),
              expectedCode: "INCOMPATIBLE_PROTOCOL",
            },
          ];

          for (const fixture of invalidCommands) {
            const acknowledgement = await emitWithAck<TurnSubmitAck>(
              fixture.name,
              fixture.emit,
            );
            requireFailureCode(acknowledgement, fixture.expectedCode);
          }
          assert.deepEqual(
            await deterministic.runtime.persistence.findById(
              started.snapshot.room.roomId,
            ),
            before,
          );
        } finally {
          await stopServer(harness);
        }
      },
    );

    await context.test(
      "reconnect storm leaves one Player and one current primary without stale grace work",
      async () => {
        const deterministic = createDeterministicRuntime();
        const harness = await startServer(deterministic.runtime);
        try {
          const host = await createHostedRoom(harness, "StormHost");
          let currentSocket = host.socket;
          let currentObserver = host.observer;
          let currentSnapshot = host.snapshot;

          for (let index = 0; index < 4; index += 1) {
            const nextSocket = await connectTypedClient(harness);
            const nextObserver = observeClient(
              nextSocket,
              harness.networkPayloads,
            );
            const resumed = requireSnapshotSuccess(
              await emitResume(nextSocket, {
                kind: "session:resume",
                protocolVersion: PROTOCOL_VERSION,
                requestId: requestId(`storm-resume-${index}`),
                payload: {
                  credential: {
                    roomCode: host.snapshot.room.roomCode,
                    sessionToken: host.sessionToken,
                  },
                  lastSeenVersions: currentSnapshot.versions,
                },
              }),
            );
            await waitForReplacement(currentObserver);
            const staleAck = await emitStateSync(
              currentSocket,
              stateSyncCommand(`storm-stale-sync-${index}`),
            );
            requireFailureCode(staleAck, "UNAUTHENTICATED");
            currentSocket.disconnect();
            currentSocket = nextSocket;
            currentObserver = nextObserver;
            currentSnapshot = resumed;
          }

          const bindings =
            deterministic.runtime.connectionRegistry.listActiveBindings(
              host.snapshot.room.roomId,
            );
          assert.equal(bindings.length, 1);
          assert.equal(bindings[0]?.playerId, host.snapshot.self.playerId);
          assert.equal(bindings[0]?.socketId, currentSocket.id);
          assert.equal(
            deterministic.runtime.connectionRegistry.getConnectionStatus(
              host.snapshot.room.roomId,
              host.snapshot.self.playerId,
            ),
            "CONNECTED",
          );
          assert.equal(
            deterministic.runtime.roomPolicyScheduler.scheduledCount,
            0,
          );
          const room = await deterministic.runtime.persistence.findById(
            host.snapshot.room.roomId,
          );
          assert.equal(room?.players.length, 1);
          const finalSync = requireSnapshotSuccess(
            await emitStateSync(
              currentSocket,
              stateSyncCommand("storm-final-sync"),
            ),
          );
          assert.equal(finalSync.self.playerId, host.snapshot.self.playerId);
        } finally {
          await stopServer(harness);
        }
      },
    );
  },
);
