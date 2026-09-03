import type { RoomId } from "@hangul-rummikub/shared";

import { GameStartService } from "./application/game-start-service.js";
import { LobbyStateSnapshotProjector } from "./application/lobby-state-snapshot-projector.js";
import { RoomSessionApplicationService } from "./application/room-session-service.js";
import { SessionResumeService } from "./application/session-resume-service.js";
import { TurnDrawService } from "./application/turn-draw-service.js";
import { TurnPassService } from "./application/turn-pass-service.js";
import { TurnSubmitService } from "./application/turn-submit-service.js";
import { TurnTimeoutService } from "./application/turn-timeout-service.js";
import { ConnectionRegistry } from "./infrastructure/connection-registry.js";
import { ConnectionRegistryPresenceReader } from "./infrastructure/connection-registry-presence-reader.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import { InProcessTurnScheduler } from "./infrastructure/in-process-turn-scheduler.js";
import { KeyedSerialExecutor } from "./infrastructure/keyed-serial-executor.js";
import { OverdueTurnSweeper } from "./infrastructure/overdue-turn-sweeper.js";
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
  roomSessionService: RoomSessionApplicationService;
  sessionResumeService: SessionResumeService;
  snapshotProjector: LobbyStateSnapshotProjector;
  turnDrawService: TurnDrawService;
  turnPassService: TurnPassService;
  turnScheduler: InProcessTurnScheduler;
  turnSubmitService: TurnSubmitService;
  turnTimeoutService: TurnTimeoutService;
  overdueTurnSweeper: OverdueTurnSweeper;
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
  let acceptsTimeoutWork = false;
  let turnTimeoutService: TurnTimeoutService | undefined;
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
    turnScheduler,
    onTurnSchedulingFailure: reportTurnSchedulingFailure,
  });
  const snapshotProjector = new LobbyStateSnapshotProjector({
    clock,
    presenceReader,
  });

  let running = false;
  return Object.freeze({
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
      if (running) {
        return;
      }
      running = true;
      acceptsTimeoutWork = true;
      turnScheduler.start();
      overdueTurnSweeper.start();
    },
    stop() {
      if (!running) {
        return;
      }
      running = false;
      acceptsTimeoutWork = false;
      overdueTurnSweeper.stop();
      turnScheduler.stop();
    },
  });
}
