import type { PlayerId, RoomId } from "@hangul-rummikub/shared";

import { GameStartService } from "./application/game-start-service.js";
import { LobbyDisconnectGraceService } from "./application/lobby-disconnect-grace-service.js";
import { LobbyStateSnapshotProjector } from "./application/lobby-state-snapshot-projector.js";
import { RoomCleanupService } from "./application/room-cleanup-service.js";
import { RoomLeaveService } from "./application/room-leave-service.js";
import { RoomPresencePolicyService } from "./application/room-presence-policy-service.js";
import { RoomRetentionService } from "./application/room-retention-service.js";
import { RoomSessionApplicationService } from "./application/room-session-service.js";
import { SessionResumeService } from "./application/session-resume-service.js";
import { TurnDrawService } from "./application/turn-draw-service.js";
import { TurnPassService } from "./application/turn-pass-service.js";
import { TurnSubmitService } from "./application/turn-submit-service.js";
import { TurnTimeoutService } from "./application/turn-timeout-service.js";
import { ConnectionRegistry } from "./infrastructure/connection-registry.js";
import { ConnectionRegistryPresenceReader } from "./infrastructure/connection-registry-presence-reader.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import { InProcessRoomPolicyScheduler } from "./infrastructure/in-process-room-policy-scheduler.js";
import { InProcessTurnScheduler } from "./infrastructure/in-process-turn-scheduler.js";
import { KeyedSerialExecutor } from "./infrastructure/keyed-serial-executor.js";
import { OverdueTurnSweeper } from "./infrastructure/overdue-turn-sweeper.js";
import {
  RoomLifecycleResources,
  type RoomClosedAdvisoryListener,
} from "./infrastructure/room-lifecycle-resources.js";
import { TestDictionaryProvider } from "./infrastructure/test-dictionary-provider.js";
import {
  CryptoRandomSource,
  NodeCryptoIdGenerator,
  NodeCryptoSessionTokenIssuer,
  RandomRoomCodeGenerator,
  SystemClock,
} from "./infrastructure/system.js";

export type ApplicationRuntime = Readonly<{
  clock: SystemClock;
  connectionRegistry: ConnectionRegistry;
  gameStartService: GameStartService;
  persistence: InMemoryPersistence;
  roomLeaveService: RoomLeaveService;
  roomPolicyScheduler: InProcessRoomPolicyScheduler;
  roomPresencePolicyService: RoomPresencePolicyService;
  roomSessionService: RoomSessionApplicationService;
  sessionResumeService: SessionResumeService;
  snapshotProjector: LobbyStateSnapshotProjector;
  turnDrawService: TurnDrawService;
  turnPassService: TurnPassService;
  turnScheduler: InProcessTurnScheduler;
  turnSubmitService: TurnSubmitService;
  turnTimeoutService: TurnTimeoutService;
  overdueTurnSweeper: OverdueTurnSweeper;
  subscribeRoomClosed(listener: RoomClosedAdvisoryListener): () => void;
  subscribeRoomPlayerRemoved(
    listener: (roomId: RoomId, playerId: PlayerId) => void | Promise<void>,
  ): () => void;
  runRoomMutation<TResult>(
    roomId: RoomId,
    task: () => Promise<TResult>,
  ): Promise<TResult>;
  start(): void;
  stop(): void;
}>;

function reportTurnSchedulingFailure(): void {
  console.error(
    "A committed Turn could not be scheduled; the overdue sweeper remains the recovery path.",
  );
}

function reportTurnTimeoutFailure(): void {
  console.error(
    "A scheduled Turn timeout could not be processed; the overdue sweeper will retry it.",
  );
}

function reportRoomPolicyFailure(): void {
  console.error(
    "A Room lifecycle policy could not be processed; a later connection or policy callback may retry it.",
  );
}

/** Creates one isolated process-memory runtime; importing this module has no side effects. */
export function createApplicationRuntime(): ApplicationRuntime {
  const persistence = new InMemoryPersistence();
  const clock = new SystemClock();
  const randomSource = new CryptoRandomSource();
  const idGenerator = new NodeCryptoIdGenerator();
  const roomCodeGenerator = new RandomRoomCodeGenerator(randomSource);
  const sessionTokenIssuer = new NodeCryptoSessionTokenIssuer();
  const roomMutationExecutor = new KeyedSerialExecutor<RoomId>();
  const connectionRegistry = new ConnectionRegistry();
  const presenceReader = new ConnectionRegistryPresenceReader(
    connectionRegistry,
  );
  const roomClosedListeners = new Set<RoomClosedAdvisoryListener>();
  const roomPlayerRemovedListeners = new Set<
    (roomId: RoomId, playerId: PlayerId) => void | Promise<void>
  >();
  let acceptsTimeoutWork = false;
  let acceptsRoomPolicyWork = false;
  let turnTimeoutService: TurnTimeoutService | undefined;
  let roomPresencePolicyService: RoomPresencePolicyService | undefined;
  const enqueueTimeout = async (
    deadline: Parameters<TurnTimeoutService["timeout"]>[0],
  ): Promise<void> => {
    if (!acceptsTimeoutWork || turnTimeoutService === undefined) {
      return;
    }
    const result = await turnTimeoutService.timeout(deadline);
    if (result.status === "FAILED") {
      reportTurnTimeoutFailure();
    }
  };
  const turnScheduler = new InProcessTurnScheduler({
    clock,
    onDeadline: enqueueTimeout,
    onCallbackFailure: reportTurnTimeoutFailure,
  });
  const overdueTurnSweeper = new OverdueTurnSweeper({
    activeTurnReader: persistence,
    clock,
    enqueueTimeout,
    onFailure: reportTurnTimeoutFailure,
  });
  const roomPolicyScheduler = new InProcessRoomPolicyScheduler({
    clock,
    onDeadline: async (deadline) => {
      if (!acceptsRoomPolicyWork || roomPresencePolicyService === undefined) {
        return;
      }
      await roomPresencePolicyService.onDeadline(deadline);
    },
    onCallbackFailure: reportRoomPolicyFailure,
  });
  const notifyRoomClosed: RoomClosedAdvisoryListener = async (
    roomId,
    roomCode,
    bindings,
  ) => {
    for (const listener of roomClosedListeners) {
      try {
        await listener(roomId, roomCode, bindings);
      } catch {
        reportRoomPolicyFailure();
      }
    }
  };
  const notifyRoomPlayerRemoved = async (
    roomId: RoomId,
    playerId: PlayerId,
  ): Promise<void> => {
    if (roomPresencePolicyService !== undefined) {
      try {
        await roomPresencePolicyService.onPlayerRemoved(roomId, clock.now());
      } catch {
        reportRoomPolicyFailure();
      }
    }
    for (const listener of roomPlayerRemovedListeners) {
      try {
        await listener(roomId, playerId);
      } catch {
        reportRoomPolicyFailure();
      }
    }
  };
  const roomLifecycleResources = new RoomLifecycleResources({
    connectionRegistry,
    policyScheduler: roomPolicyScheduler,
    turnTimerCleanup: turnScheduler,
    onRoomClosed: notifyRoomClosed,
    onPlayerRemoved: notifyRoomPlayerRemoved,
  });
  const roomCleanupService = new RoomCleanupService({
    roomRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    resources: roomLifecycleResources,
  });
  const lobbyDisconnectGraceService = new LobbyDisconnectGraceService({
    roomRepository: persistence,
    roomUnitOfWork: persistence,
    roomCleanupUnitOfWork: persistence,
    roomMutationExecutor,
    presenceReader,
    clock,
    resources: roomLifecycleResources,
  });
  const roomRetentionService = new RoomRetentionService({
    cleanupService: roomCleanupService,
    roomRepository: persistence,
    presenceReader,
    clock,
  });
  roomPresencePolicyService = new RoomPresencePolicyService({
    roomRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    scheduler: roomPolicyScheduler,
    roomPresenceReader: presenceReader,
    playerPresenceLeaseReader: presenceReader,
    clock,
    lobbyGraceService: lobbyDisconnectGraceService,
    retentionService: roomRetentionService,
  });

  const roomSessionService = new RoomSessionApplicationService({
    roomRepository: persistence,
    sessionRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    clock,
    idGenerator,
    roomCodeGenerator,
    sessionTokenIssuer,
    roomMutationExecutor,
  });
  const sessionResumeService = new SessionResumeService({
    sessionRepository: persistence,
    roomRepository: persistence,
    sessionTokenIssuer,
  });
  const gameStartService = new GameStartService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    presenceReader,
    clock,
    idGenerator,
    randomSource,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
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
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
  });
  const turnDrawService = new TurnDrawService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
  });
  const turnPassService = new TurnPassService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
  });
  turnTimeoutService = new TurnTimeoutService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    randomSource,
    presenceLeaseReader: presenceReader,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
  });
  const snapshotProjector = new LobbyStateSnapshotProjector({
    clock,
    presenceReader,
  });
  const roomLeaveService = new RoomLeaveService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomCleanupUnitOfWork: persistence,
    roomMutationExecutor,
    presenceReader,
    clock,
    idGenerator,
    resources: roomLifecycleResources,
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
  });

  let running = false;
  return Object.freeze({
    clock,
    connectionRegistry,
    gameStartService,
    persistence,
    roomLeaveService,
    roomPolicyScheduler,
    roomPresencePolicyService,
    roomSessionService,
    sessionResumeService,
    snapshotProjector,
    turnDrawService,
    turnPassService,
    turnScheduler,
    turnSubmitService,
    turnTimeoutService,
    overdueTurnSweeper,
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
      if (running) {
        return;
      }
      running = true;
      acceptsTimeoutWork = true;
      acceptsRoomPolicyWork = true;
      roomPolicyScheduler.start();
      turnScheduler.start();
      overdueTurnSweeper.start();
    },
    stop() {
      if (!running) {
        return;
      }
      running = false;
      acceptsTimeoutWork = false;
      acceptsRoomPolicyWork = false;
      roomPolicyScheduler.stop();
      overdueTurnSweeper.stop();
      turnScheduler.stop();
    },
  });
}
