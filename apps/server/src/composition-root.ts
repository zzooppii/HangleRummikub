import type { RoomId } from "@hangul-rummikub/shared";

import { GameStartService } from "./application/game-start-service.js";
import { LobbyStateSnapshotProjector } from "./application/lobby-state-snapshot-projector.js";
import { RoomSessionApplicationService } from "./application/room-session-service.js";
import { SessionResumeService } from "./application/session-resume-service.js";
import { TurnSubmitService } from "./application/turn-submit-service.js";
import { ConnectionRegistry } from "./infrastructure/connection-registry.js";
import { ConnectionRegistryPresenceReader } from "./infrastructure/connection-registry-presence-reader.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "./infrastructure/keyed-serial-executor.js";
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
  turnSubmitService: TurnSubmitService;
}>;

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
  });
  const turnSubmitService = new TurnSubmitService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor,
    clock,
    idGenerator,
    dictionaryProvider: new TestDictionaryProvider(),
  });
  const snapshotProjector = new LobbyStateSnapshotProjector({
    clock,
    presenceReader,
  });

  return Object.freeze({
    clock,
    connectionRegistry,
    gameStartService,
    persistence,
    roomSessionService,
    sessionResumeService,
    snapshotProjector,
    turnSubmitService,
  });
}
