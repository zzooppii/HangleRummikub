import type {
  ConnectionStatus,
  PlayerId,
  RoomId,
} from "@hangul-rummikub/shared";

import {
  LobbyStateSnapshotProjector,
  type RoomPresenceReadPort,
} from "./application/lobby-state-snapshot-projector.js";
import { RoomSessionApplicationService } from "./application/room-session-service.js";
import { SessionResumeService } from "./application/session-resume-service.js";
import { ConnectionRegistry } from "./infrastructure/connection-registry.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "./infrastructure/keyed-serial-executor.js";
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
  persistence: InMemoryPersistence;
  roomSessionService: RoomSessionApplicationService;
  sessionResumeService: SessionResumeService;
  snapshotProjector: LobbyStateSnapshotProjector;
}>;

function createPresenceReader(
  connectionRegistry: ConnectionRegistry,
): RoomPresenceReadPort {
  return {
    async readRoomPresence(roomId: RoomId) {
      const connectionStatusByPlayerId = new Map<
        PlayerId,
        ConnectionStatus
      >();

      for (const binding of connectionRegistry.listActiveBindings(roomId)) {
        connectionStatusByPlayerId.set(binding.playerId, "CONNECTED");
      }

      return {
        presenceVersion: connectionRegistry.getPresenceVersion(roomId),
        connectionStatusByPlayerId,
      };
    },
  };
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
  const snapshotProjector = new LobbyStateSnapshotProjector({
    clock,
    presenceReader: createPresenceReader(connectionRegistry),
  });

  return Object.freeze({
    clock,
    connectionRegistry,
    persistence,
    roomSessionService,
    sessionResumeService,
    snapshotProjector,
  });
}
