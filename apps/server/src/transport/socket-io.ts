import {
  PROTOCOL_VERSION,
  validateGameStartCommand,
  validateRequestId,
  validateRoomCreateCommand,
  validateRoomJoinCommand,
  validateSessionBootstrapCommand,
  validateSessionResumeCommand,
  validateStateSyncCommand,
  type ClientToServerEvents,
  type ErrorDto,
  type GameStartAck,
  type PlayerId,
  type PlayingStateSnapshot,
  type RequestId,
  type RoomCreateAck,
  type RoomId,
  type RoomJoinAck,
  type RoomScopedAck,
  type ServerTime,
  type ServerToClientEvents,
  type SessionBootstrapAck,
  type SessionReplacedNotification,
  type SessionResumeAck,
  type StateSnapshot,
  type StateSnapshotDeliveryData,
  type StateSnapshotEvent,
  type StateSyncAck,
  type TurnStartedEvent,
  type UncorrelatedFailureAck,
  type UnscopedAckFailure,
} from "@hangul-rummikub/shared";
import type { Server as SocketIOServer, Socket } from "socket.io";

import type { ApplicationRuntime } from "../composition-root.js";
import {
  createSocketId,
  type AuthenticatedSocketBinding,
  type BindPrimaryConnectionResult,
  type SocketId,
} from "../infrastructure/connection-registry.js";
import { KeyedSerialExecutor } from "../infrastructure/keyed-serial-executor.js";

type EmptyEvents = Record<never, never>;
type EmptySocketData = Record<never, never>;

export type RealtimeServer = SocketIOServer<
  ClientToServerEvents,
  ServerToClientEvents,
  EmptyEvents,
  EmptySocketData
>;

type RealtimeSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  EmptyEvents,
  EmptySocketData
>;

type CorrelatableFailureAck =
  | UncorrelatedFailureAck
  | UnscopedAckFailure;

type SocketAuthenticationExecutor = KeyedSerialExecutor<SocketId>;

const INVALID_PAYLOAD_ERROR = Object.freeze({
  code: "INVALID_PAYLOAD",
  message: "Command payload is invalid.",
  recoverable: false,
} satisfies ErrorDto);

const UNAUTHENTICATED_ERROR: ErrorDto = Object.freeze({
  code: "UNAUTHENTICATED",
  message: "Socket is not authenticated as the current Player connection.",
  recoverable: true,
});

const ROOM_NOT_FOUND_ERROR: ErrorDto = Object.freeze({
  code: "ROOM_NOT_FOUND",
  message: "Room was not found.",
  recoverable: false,
});

const INTERNAL_ERROR: ErrorDto = Object.freeze({
  code: "INTERNAL_ERROR",
  message: "An internal error occurred.",
  recoverable: false,
});

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function requestIdFrom(input: unknown): RequestId | null {
  if (!isRecord(input)) {
    return null;
  }

  const validation = validateRequestId(input.requestId);
  return validation.ok ? validation.value : null;
}

function failureAck(
  command: unknown,
  error: ErrorDto,
  serverTime: ServerTime,
): CorrelatableFailureAck {
  const requestId = requestIdFrom(command);
  if (requestId === null) {
    return {
      scope: "UNSCOPED",
      requestId: null,
      ok: false,
      serverTime,
      error: INVALID_PAYLOAD_ERROR,
    };
  }

  return {
    scope: "UNSCOPED",
    requestId,
    ok: false,
    serverTime,
    error,
  };
}

function snapshotSuccessAck(
  requestId: RequestId,
  snapshot: StateSnapshot,
): RoomScopedAck<StateSnapshotDeliveryData> {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: snapshot.serverTime,
    versions: snapshot.versions,
    data: { snapshot },
  };
}

function gameStartSuccessAck(
  requestId: RequestId,
  snapshot: PlayingStateSnapshot,
): GameStartAck {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: snapshot.serverTime,
    versions: snapshot.versions,
    data: { snapshot },
  };
}

function isPlayingSnapshot(
  snapshot: StateSnapshot,
): snapshot is PlayingStateSnapshot {
  return snapshot.room.phase === "PLAYING" && "game" in snapshot;
}

function isCurrentBinding(
  runtime: ApplicationRuntime,
  expected: AuthenticatedSocketBinding,
): boolean {
  const current = runtime.connectionRegistry.getAuthenticatedBinding(
    expected.socketId,
  );

  return (
    current !== null &&
    current.roomId === expected.roomId &&
    current.playerId === expected.playerId &&
    current.connectionGeneration === expected.connectionGeneration
  );
}

function snapshotEvent(snapshot: StateSnapshot): StateSnapshotEvent {
  return {
    kind: "state:snapshot",
    protocolVersion: PROTOCOL_VERSION,
    versions: snapshot.versions,
    serverTime: snapshot.serverTime,
    payload: { snapshot },
  };
}

function turnStartedEvent(
  snapshot: PlayingStateSnapshot,
): TurnStartedEvent {
  return {
    kind: "turn:started",
    protocolVersion: PROTOCOL_VERSION,
    versions: snapshot.versions,
    serverTime: snapshot.serverTime,
    payload: {
      gameId: snapshot.game.gameId,
      turnId: snapshot.game.turn.turnId,
      turnNumber: snapshot.game.turn.turnNumber,
      activePlayerId: snapshot.game.turn.activePlayerId,
      deadlineAt: snapshot.game.turn.deadlineAt,
    },
  };
}

function internalRoomChannel(roomId: RoomId): string {
  return `room:${roomId}`;
}

function reportPostCommitDeliveryFailure(): void {
  console.error(
    "A committed Room mutation could not be delivered; the client can resume or request state sync.",
  );
}

function reportSnapshotFanOutFailure(): void {
  console.error(
    "A StateSnapshot fan-out failed; connected clients can request state sync.",
  );
}

async function loadSnapshot(
  runtime: ApplicationRuntime,
  roomId: RoomId,
  playerId: PlayerId,
): Promise<StateSnapshot | null> {
  const room = await runtime.persistence.findById(roomId);
  if (room === null) {
    return null;
  }

  return runtime.snapshotProjector.project({ room, selfPlayerId: playerId });
}

async function fanOutRoomSnapshots(
  io: RealtimeServer,
  runtime: ApplicationRuntime,
  roomId: RoomId,
): Promise<void> {
  const room = await runtime.persistence.findById(roomId);
  if (room === null) {
    return;
  }

  for (const binding of runtime.connectionRegistry.listActiveBindings(roomId)) {
    if (!room.players.some((player) => player.playerId === binding.playerId)) {
      continue;
    }

    const snapshot = await runtime.snapshotProjector.project({
      room,
      selfPlayerId: binding.playerId,
    });
    if (!isCurrentBinding(runtime, binding)) {
      continue;
    }
    io.to(binding.socketId).emit("state:snapshot", snapshotEvent(snapshot));
  }
}

function notifyReplacedSocket(
  io: RealtimeServer,
  runtime: ApplicationRuntime,
  binding: AuthenticatedSocketBinding,
): void {
  try {
    const replacedSocket = io.sockets.sockets.get(binding.socketId);
    if (replacedSocket === undefined) {
      return;
    }
    if (
      runtime.connectionRegistry.getAuthenticatedBinding(binding.socketId) !==
      null
    ) {
      return;
    }

    const notification: SessionReplacedNotification = {
      kind: "session:replaced",
      protocolVersion: PROTOCOL_VERSION,
      serverTime: runtime.clock.now(),
      reason: "NEW_PRIMARY_CONNECTION",
    };
    replacedSocket.emit("session:replaced", notification);
    void Promise.resolve(
      replacedSocket.leave(internalRoomChannel(binding.roomId)),
    ).catch(reportSnapshotFanOutFailure);
  } catch {
    reportSnapshotFanOutFailure();
  }
}

async function bindPrimarySocket(
  io: RealtimeServer,
  runtime: ApplicationRuntime,
  socket: RealtimeSocket,
  roomId: RoomId,
  playerId: PlayerId,
): Promise<AuthenticatedSocketBinding> {
  if (!socket.connected) {
    throw new Error("Disconnected socket cannot become a primary connection.");
  }

  const socketId = createSocketId(socket.id);
  const roomChannel = internalRoomChannel(roomId);
  const current = runtime.connectionRegistry.getAuthenticatedBinding(socketId);
  if (
    current !== null &&
    (current.roomId !== roomId || current.playerId !== playerId)
  ) {
    throw new Error("Socket is already bound to a different Player.");
  }

  await socket.join(roomChannel);
  if (!socket.connected) {
    await socket.leave(roomChannel);
    throw new Error("Disconnected socket cannot become a primary connection.");
  }

  if (current !== null) {
    if (!isCurrentBinding(runtime, current)) {
      await socket.leave(roomChannel);
      throw new Error("Socket is no longer the current primary connection.");
    }
    return current;
  }

  let result: BindPrimaryConnectionResult;
  try {
    result = runtime.connectionRegistry.bindPrimary({
      socketId,
      roomId,
      playerId,
    });
  } catch (error) {
    await socket.leave(roomChannel);
    throw error;
  }

  if (result.replacedBinding !== null) {
    notifyReplacedSocket(io, runtime, result.replacedBinding);
  }

  return result.binding;
}

async function authenticatedEntryRetryAllowed(
  runtime: ApplicationRuntime,
  socket: RealtimeSocket,
  sessionToken: unknown,
): Promise<boolean> {
  const binding = runtime.connectionRegistry.getAuthenticatedBinding(
    createSocketId(socket.id),
  );
  if (binding === null) {
    return true;
  }

  const room = await runtime.persistence.findById(binding.roomId);
  if (room === null) {
    return false;
  }
  const resumed = await runtime.sessionResumeService.resumeSession({
    sessionToken,
    roomCode: room.roomCode,
  });

  return (
    resumed.ok &&
    resumed.data.roomId === binding.roomId &&
    resumed.data.playerId === binding.playerId
  );
}

function acknowledgeIfPresent<TAck>(
  acknowledge: unknown,
  ack: TAck,
): void {
  if (typeof acknowledge === "function") {
    acknowledge(ack);
  }
}

function registerBootstrapHandler(
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("session:bootstrap", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    const commandInput: unknown = rawCommand;
    const command = validateSessionBootstrapCommand(commandInput);
    if (!command.ok) {
      acknowledgeIfPresent(
        acknowledge,
        failureAck(commandInput, command.error, receivedAt),
      );
      return;
    }

    void runtime.roomSessionService.bootstrapSession().then(
      (result) => {
        const ack: SessionBootstrapAck = result.ok
          ? {
              scope: "UNSCOPED",
              requestId: command.value.requestId,
              ok: true,
              serverTime: result.data.issuedAt,
              data: {
                credential: { sessionToken: result.data.sessionToken },
                expiresAt: result.data.expiresAt,
              },
            }
          : failureAck(commandInput, result.error, receivedAt);
        acknowledgeIfPresent(acknowledge, ack);
      },
      () => {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, INTERNAL_ERROR, receivedAt),
        );
      },
    );
  });
}

function registerCreateRoomHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
  authenticationExecutor: SocketAuthenticationExecutor,
): void {
  socket.on("room:create", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    const commandInput: unknown = rawCommand;
    const command = validateRoomCreateCommand(commandInput);
    if (!command.ok) {
      acknowledgeIfPresent(
        acknowledge,
        failureAck(commandInput, command.error, receivedAt),
      );
      return;
    }

    void authenticationExecutor.run(createSocketId(socket.id), async () => {
      if (
        !(await authenticatedEntryRetryAllowed(
          runtime,
          socket,
          command.value.payload.bootstrapCredential.sessionToken,
        ))
      ) {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, UNAUTHENTICATED_ERROR, receivedAt),
        );
        return;
      }

      const result = await runtime.roomSessionService.createRoom({
        sessionToken:
          command.value.payload.bootstrapCredential.sessionToken,
        requestId: command.value.requestId,
        nickname: command.value.payload.nickname,
      });
      if (!result.ok) {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, result.error, receivedAt),
        );
        return;
      }

      try {
        const binding = await bindPrimarySocket(
          io,
          runtime,
          socket,
          result.data.roomId,
          result.data.playerId,
        );
        const snapshot = await loadSnapshot(
          runtime,
          result.data.roomId,
          result.data.playerId,
        );
        if (snapshot === null) {
          reportPostCommitDeliveryFailure();
          return;
        }
        if (!socket.connected || !isCurrentBinding(runtime, binding)) {
          return;
        }

        const ack: RoomCreateAck = snapshotSuccessAck(
          command.value.requestId,
          snapshot,
        );
        acknowledgeIfPresent(acknowledge, ack);
        void fanOutRoomSnapshots(io, runtime, result.data.roomId).catch(
          reportSnapshotFanOutFailure,
        );
      } catch {
        reportPostCommitDeliveryFailure();
      }
    }).catch(() => {
      acknowledgeIfPresent(
        acknowledge,
        failureAck(commandInput, INTERNAL_ERROR, receivedAt),
      );
    });
  });
}

function registerJoinRoomHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
  authenticationExecutor: SocketAuthenticationExecutor,
): void {
  socket.on("room:join", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    const commandInput: unknown = rawCommand;
    const command = validateRoomJoinCommand(commandInput);
    if (!command.ok) {
      acknowledgeIfPresent(
        acknowledge,
        failureAck(commandInput, command.error, receivedAt),
      );
      return;
    }

    void authenticationExecutor.run(createSocketId(socket.id), async () => {
      if (
        !(await authenticatedEntryRetryAllowed(
          runtime,
          socket,
          command.value.payload.bootstrapCredential.sessionToken,
        ))
      ) {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, UNAUTHENTICATED_ERROR, receivedAt),
        );
        return;
      }

      const result = await runtime.roomSessionService.joinRoom({
        sessionToken:
          command.value.payload.bootstrapCredential.sessionToken,
        requestId: command.value.requestId,
        roomCode: command.value.payload.roomCode,
        nickname: command.value.payload.nickname,
      });
      if (!result.ok) {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, result.error, receivedAt),
        );
        return;
      }

      try {
        const binding = await bindPrimarySocket(
          io,
          runtime,
          socket,
          result.data.roomId,
          result.data.playerId,
        );
        const snapshot = await loadSnapshot(
          runtime,
          result.data.roomId,
          result.data.playerId,
        );
        if (snapshot === null) {
          reportPostCommitDeliveryFailure();
          return;
        }
        if (!socket.connected || !isCurrentBinding(runtime, binding)) {
          return;
        }

        const ack: RoomJoinAck = snapshotSuccessAck(
          command.value.requestId,
          snapshot,
        );
        acknowledgeIfPresent(acknowledge, ack);
        void fanOutRoomSnapshots(io, runtime, result.data.roomId).catch(
          reportSnapshotFanOutFailure,
        );
      } catch {
        reportPostCommitDeliveryFailure();
      }
    }).catch(() => {
      acknowledgeIfPresent(
        acknowledge,
        failureAck(commandInput, INTERNAL_ERROR, receivedAt),
      );
    });
  });
}

function registerResumeHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
  authenticationExecutor: SocketAuthenticationExecutor,
): void {
  socket.on("session:resume", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    const commandInput: unknown = rawCommand;
    const command = validateSessionResumeCommand(commandInput);
    if (!command.ok) {
      acknowledgeIfPresent(
        acknowledge,
        failureAck(commandInput, command.error, receivedAt),
      );
      return;
    }

    void authenticationExecutor.run(createSocketId(socket.id), async () => {
      const result = await runtime.sessionResumeService.resumeSession({
        sessionToken: command.value.payload.credential.sessionToken,
        roomCode: command.value.payload.credential.roomCode,
      });
      if (!result.ok) {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, result.error, receivedAt),
        );
        return;
      }

      const existingBinding =
        runtime.connectionRegistry.getAuthenticatedBinding(
          createSocketId(socket.id),
        );
      if (
        existingBinding !== null &&
        (existingBinding.roomId !== result.data.roomId ||
          existingBinding.playerId !== result.data.playerId)
      ) {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, UNAUTHENTICATED_ERROR, receivedAt),
        );
        return;
      }

      let binding: AuthenticatedSocketBinding | null = null;
      try {
        binding = await bindPrimarySocket(
          io,
          runtime,
          socket,
          result.data.roomId,
          result.data.playerId,
        );
        const snapshot = await loadSnapshot(
          runtime,
          result.data.roomId,
          result.data.playerId,
        );
        if (snapshot === null) {
          runtime.connectionRegistry.disconnect(
            binding.socketId,
            binding.connectionGeneration,
          );
          acknowledgeIfPresent(
            acknowledge,
            failureAck(commandInput, ROOM_NOT_FOUND_ERROR, receivedAt),
          );
          return;
        }
        if (!socket.connected || !isCurrentBinding(runtime, binding)) {
          return;
        }

        const ack: SessionResumeAck = snapshotSuccessAck(
          command.value.requestId,
          snapshot,
        );
        acknowledgeIfPresent(acknowledge, ack);
        void fanOutRoomSnapshots(io, runtime, result.data.roomId).catch(
          reportSnapshotFanOutFailure,
        );
      } catch {
        if (binding === null) {
          acknowledgeIfPresent(
            acknowledge,
            failureAck(commandInput, INTERNAL_ERROR, receivedAt),
          );
          return;
        }
        reportPostCommitDeliveryFailure();
      }
    }).catch(() => {
      acknowledgeIfPresent(
        acknowledge,
        failureAck(commandInput, INTERNAL_ERROR, receivedAt),
      );
    });
  });
}

function registerStateSyncHandler(
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("state:sync", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    const commandInput: unknown = rawCommand;
    const command = validateStateSyncCommand(commandInput);
    if (!command.ok) {
      acknowledgeIfPresent(
        acknowledge,
        failureAck(commandInput, command.error, receivedAt),
      );
      return;
    }

    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(
        createSocketId(socket.id),
      );
      if (binding === null) {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, UNAUTHENTICATED_ERROR, receivedAt),
        );
        return;
      }

      const snapshot = await loadSnapshot(
        runtime,
        binding.roomId,
        binding.playerId,
      );
      if (snapshot === null) {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, ROOM_NOT_FOUND_ERROR, receivedAt),
        );
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, UNAUTHENTICATED_ERROR, receivedAt),
        );
        return;
      }

      const ack: StateSyncAck = snapshotSuccessAck(
        command.value.requestId,
        snapshot,
      );
      acknowledgeIfPresent(acknowledge, ack);
      socket.emit("state:snapshot", snapshotEvent(snapshot));
    })().catch(() => {
      acknowledgeIfPresent(
        acknowledge,
        failureAck(commandInput, INTERNAL_ERROR, receivedAt),
      );
    });
  });
}

function registerGameStartHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("game:start", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    let committed = false;
    const commandInput: unknown = rawCommand;
    const command = validateGameStartCommand(commandInput);
    if (!command.ok) {
      acknowledgeIfPresent(
        acknowledge,
        failureAck(commandInput, command.error, receivedAt),
      );
      return;
    }

    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(
        createSocketId(socket.id),
      );
      if (binding === null) {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, UNAUTHENTICATED_ERROR, receivedAt),
        );
        return;
      }

      const result = await runtime.gameStartService.start({
        roomId: binding.roomId,
        actorPlayerId: binding.playerId,
        requestId: command.value.requestId,
        expectedRoomRevision: command.value.expectedRoomRevision,
        authorization: {
          isCurrent: () =>
            socket.connected && isCurrentBinding(runtime, binding),
        },
      });
      if (!result.ok) {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, result.error, receivedAt),
        );
        return;
      }
      committed = true;

      const snapshot = await loadSnapshot(
        runtime,
        binding.roomId,
        binding.playerId,
      );
      if (snapshot === null || !isPlayingSnapshot(snapshot)) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }

      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      io.to(internalRoomChannel(binding.roomId)).emit(
        "turn:started",
        turnStartedEvent(snapshot),
      );
      const ack = gameStartSuccessAck(
        command.value.requestId,
        snapshot,
      );
      acknowledgeIfPresent(acknowledge, ack);
    })().catch(() => {
      if (committed) {
        reportPostCommitDeliveryFailure();
        return;
      }
      acknowledgeIfPresent(
        acknowledge,
        failureAck(commandInput, INTERNAL_ERROR, receivedAt),
      );
    });
  });
}

function registerDisconnectHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("disconnect", () => {
    const socketId = createSocketId(socket.id);
    const binding = runtime.connectionRegistry.getAuthenticatedBinding(socketId);
    if (binding === null) {
      return;
    }

    const result = runtime.connectionRegistry.disconnect(
      socketId,
      binding.connectionGeneration,
    );
    if (result.status !== "DISCONNECTED") {
      return;
    }

    void fanOutRoomSnapshots(io, runtime, binding.roomId).catch(
      reportSnapshotFanOutFailure,
    );
  });
}

export function registerSocketIoHandlers(
  io: RealtimeServer,
  runtime: ApplicationRuntime,
): void {
  const authenticationExecutor = new KeyedSerialExecutor<SocketId>();

  io.on("connection", (socket) => {
    registerBootstrapHandler(socket, runtime);
    registerCreateRoomHandler(io, socket, runtime, authenticationExecutor);
    registerJoinRoomHandler(io, socket, runtime, authenticationExecutor);
    registerResumeHandler(io, socket, runtime, authenticationExecutor);
    registerStateSyncHandler(socket, runtime);
    registerGameStartHandler(io, socket, runtime);
    registerDisconnectHandler(io, socket, runtime);
  });
}
