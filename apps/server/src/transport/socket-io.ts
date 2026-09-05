import {
  PROTOCOL_VERSION,
  validateGameStartCommand,
  validateRequestId,
  validateRoomCreateCommand,
  validateRoomJoinCommand,
  validateRoomLeaveCommand,
  validateSessionBootstrapCommand,
  validateSessionResumeCommand,
  validateStateSyncCommand,
  validateTurnDrawCommand,
  validateTurnPassCommand,
  validateTurnSubmitCommand,
  type ClientToServerEvents,
  type ErrorDto,
  type FinishedStateSnapshot,
  type GameFinishedEvent,
  type GameStartAck,
  type PlayerId,
  type PlayingStateSnapshot,
  type RequestId,
  type RoomCreateAck,
  type RoomClosedEvent,
  type RoomId,
  type RoomJoinAck,
  type RoomLeaveAck,
  type RoomScopedAck,
  type RoomScopedAckFailure,
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
  type TurnDrawAck,
  type TurnPassAck,
  type TurnSubmitAck,
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
type TurnCommandFailureAck = CorrelatableFailureAck | RoomScopedAckFailure;

type SocketAuthenticationExecutor = KeyedSerialExecutor<SocketId>;

class RoomMembershipEndedError extends Error {}

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

const REQUEST_ID_REUSED_ERROR: ErrorDto = Object.freeze({
  code: "REQUEST_ID_REUSED",
  message: "Request ID was already used for a different command payload.",
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

function turnSubmitSuccessAck(
  requestId: RequestId,
  snapshot: PlayingStateSnapshot | FinishedStateSnapshot,
): TurnSubmitAck {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: snapshot.serverTime,
    versions: snapshot.versions,
    data: { snapshot },
  };
}

function turnActionSuccessAck(
  requestId: RequestId,
  snapshot: PlayingStateSnapshot | FinishedStateSnapshot,
): TurnDrawAck | TurnPassAck {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: snapshot.serverTime,
    versions: snapshot.versions,
    data: { snapshot },
  };
}

function roomClosedEvent(
  runtime: ApplicationRuntime,
  roomId: RoomId,
  roomCode: import("@hangul-rummikub/shared").RoomCode,
): RoomClosedEvent {
  return {
    kind: "room:closed",
    protocolVersion: PROTOCOL_VERSION,
    serverTime: runtime.clock.now(),
    payload: { roomId, roomCode },
  };
}

async function turnSubmitFailureAck(
  runtime: ApplicationRuntime,
  binding: AuthenticatedSocketBinding,
  requestId: RequestId,
  error: ErrorDto,
  fallbackServerTime: ServerTime,
): Promise<TurnCommandFailureAck> {
  if (!isCurrentBinding(runtime, binding)) {
    return failureAck(
      { requestId },
      UNAUTHENTICATED_ERROR,
      fallbackServerTime,
    );
  }

  let snapshot: StateSnapshot | null;
  try {
    snapshot = await loadSnapshot(
      runtime,
      binding.roomId,
      binding.playerId,
    );
  } catch {
    return failureAck({ requestId }, error, fallbackServerTime);
  }
  if (snapshot === null) {
    return failureAck({ requestId }, error, fallbackServerTime);
  }
  if (!isCurrentBinding(runtime, binding)) {
    return failureAck(
      { requestId },
      UNAUTHENTICATED_ERROR,
      fallbackServerTime,
    );
  }

  return {
    scope: "ROOM",
    requestId,
    ok: false,
    serverTime: snapshot.serverTime,
    versions: snapshot.versions,
    error,
  } satisfies RoomScopedAckFailure;
}

async function turnActionFailureAck(
  runtime: ApplicationRuntime,
  binding: AuthenticatedSocketBinding,
  requestId: RequestId,
  error: ErrorDto,
  fallbackServerTime: ServerTime,
): Promise<TurnCommandFailureAck> {
  return turnSubmitFailureAck(
    runtime,
    binding,
    requestId,
    error,
    fallbackServerTime,
  );
}

function isPlayingSnapshot(
  snapshot: StateSnapshot,
): snapshot is PlayingStateSnapshot {
  return snapshot.room.phase === "PLAYING" && "game" in snapshot;
}

function isFinishedSnapshot(
  snapshot: StateSnapshot,
): snapshot is FinishedStateSnapshot {
  return snapshot.room.phase === "FINISHED" && "game" in snapshot;
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

function gameFinishedEvent(
  snapshot: FinishedStateSnapshot,
): GameFinishedEvent {
  return {
    kind: "game:finished",
    protocolVersion: PROTOCOL_VERSION,
    versions: snapshot.versions,
    serverTime: snapshot.serverTime,
    payload: {
      gameId: snapshot.game.gameId,
      reason: snapshot.game.result.reason,
      winnerPlayerIds: snapshot.game.result.winnerPlayerIds,
      finalGameRevision: snapshot.versions.gameRevision,
      finishedAt: snapshot.game.result.finishedAt,
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

function reportRoomPolicyOrchestrationFailure(): void {
  console.error(
    "A Room lifecycle policy follow-up failed; canonical state remains authoritative.",
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

async function emitCurrentGameAdvisory(
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
    if (isPlayingSnapshot(snapshot)) {
      io.to(internalRoomChannel(roomId)).emit(
        "turn:started",
        turnStartedEvent(snapshot),
      );
    } else if (isFinishedSnapshot(snapshot)) {
      io.to(internalRoomChannel(roomId)).emit(
        "game:finished",
        gameFinishedEvent(snapshot),
      );
    }
    return;
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

  // Session verification and joining the Socket.IO channel both await. Re-read
  // the canonical membership immediately before the synchronous registry bind
  // so a concurrent grace/retention cleanup cannot resurrect a stale Player.
  const currentRoom = await runtime.persistence.findById(roomId);
  if (
    currentRoom === null ||
    !currentRoom.players.some((player) => player.playerId === playerId)
  ) {
    await socket.leave(roomChannel);
    throw new RoomMembershipEndedError(
      "Room membership ended before the socket could be bound.",
    );
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
        try {
          await runtime.roomPresencePolicyService.electLobbyHostIfNeeded(
            result.data.roomId,
          );
        } catch {
          reportRoomPolicyOrchestrationFailure();
        }
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
        let currentSessionError: ErrorDto | null = null;
        const verifyAndBind = async (): Promise<AuthenticatedSocketBinding | null> => {
          // The first verification locates the Room lane. Re-verify while
          // holding the lifecycle mutation lane for phases whose explicit
          // leave retains Player membership. This prevents a deleted
          // PLAYING/FINISHED credential from resurrecting that Player.
          const currentSession =
            await runtime.sessionResumeService.resumeSession({
              sessionToken: command.value.payload.credential.sessionToken,
              roomCode: command.value.payload.credential.roomCode,
            });
          if (!currentSession.ok) {
            currentSessionError = currentSession.error;
            return null;
          }
          if (
            currentSession.data.roomId !== result.data.roomId ||
            currentSession.data.playerId !== result.data.playerId
          ) {
            currentSessionError = UNAUTHENTICATED_ERROR;
            return null;
          }
          return bindPrimarySocket(
            io,
            runtime,
            socket,
            currentSession.data.roomId,
            currentSession.data.playerId,
          );
        };
        binding =
          result.data.room.phase === "LOBBY"
            ? await verifyAndBind()
            : await runtime.runRoomMutation(result.data.roomId, verifyAndBind);
        if (binding === null) {
          acknowledgeIfPresent(
            acknowledge,
            failureAck(
              commandInput,
              currentSessionError ?? ROOM_NOT_FOUND_ERROR,
              receivedAt,
            ),
          );
          return;
        }

        // Lobby resume cannot wait for the Room lane: an in-flight game:start
        // deliberately waits for an immediate primary replacement to revoke
        // the old actor lease. Grace cleanup uses a generation lease, and this
        // final credential check closes the remaining cleanup-before-bind
        // window. PLAYING/FINISHED already perform verify+bind in the lane.
        const boundSession = await runtime.sessionResumeService.resumeSession({
          sessionToken: command.value.payload.credential.sessionToken,
          roomCode: command.value.payload.credential.roomCode,
        });
        if (
          !boundSession.ok ||
          boundSession.data.roomId !== binding.roomId ||
          boundSession.data.playerId !== binding.playerId
        ) {
          const rejectedBinding = binding;
          if (isCurrentBinding(runtime, binding)) {
            runtime.connectionRegistry.removePlayer(
              binding.roomId,
              binding.playerId,
            );
          }
          binding = null;
          try {
            await socket.leave(internalRoomChannel(rejectedBinding.roomId));
          } catch {
            reportSnapshotFanOutFailure();
          }
          acknowledgeIfPresent(
            acknowledge,
            failureAck(
              commandInput,
              boundSession.ok ? UNAUTHENTICATED_ERROR : boundSession.error,
              receivedAt,
            ),
          );
          return;
        }
        const resumePolicyFollowUp =
          runtime.roomPresencePolicyService.onResume(
            result.data.roomId,
            result.data.playerId,
          );
        if (
          result.data.room.phase === "LOBBY" &&
          result.data.room.hostPlayerId !== null
        ) {
          // A Lobby command can already hold the Room mutation lane while it
          // waits for this primary replacement (for example game:start's final
          // actor lease check). Host election is a post-bind policy follow-up,
          // so do not make the resume acknowledgement wait behind that lane.
          // The new connection generation already makes an old grace deadline
          // stale; onResume still cancels it and reconciles Host state once the
          // lane becomes available. A hostless Lobby has no game:start actor
          // that can create this cycle, so await its Host reconciliation and
          // return an authoritative snapshot that already names the new Host.
          void resumePolicyFollowUp
            .then(() =>
              fanOutRoomSnapshots(io, runtime, result.data.roomId),
            )
            .catch(reportRoomPolicyOrchestrationFailure);
        } else {
          try {
            await resumePolicyFollowUp;
          } catch {
            // The generation-aware presence bind already makes an obsolete
            // retention callback stale. A policy follow-up failure must not
            // invalidate a successfully verified Player session.
            reportRoomPolicyOrchestrationFailure();
          }
        }
        const snapshot = await loadSnapshot(
          runtime,
          result.data.roomId,
          result.data.playerId,
        );
        if (snapshot === null) {
          const rejectedBinding = binding;
          if (isCurrentBinding(runtime, rejectedBinding)) {
            runtime.connectionRegistry.removePlayer(
              rejectedBinding.roomId,
              rejectedBinding.playerId,
            );
          }
          binding = null;
          try {
            await socket.leave(internalRoomChannel(rejectedBinding.roomId));
          } catch {
            reportSnapshotFanOutFailure();
          }
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
      } catch (error: unknown) {
        if (binding === null) {
          acknowledgeIfPresent(
            acknowledge,
            failureAck(
              commandInput,
              error instanceof RoomMembershipEndedError
                ? ROOM_NOT_FOUND_ERROR
                : INTERNAL_ERROR,
              receivedAt,
            ),
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

      const result = await runtime.legacyHangulV1CommandRouter.start({
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

function registerTurnSubmitHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("turn:submit", (rawCommand, acknowledge) => {
    // The canonical deadline comparison uses arrival time, never validation,
    // queue wait, dictionary lookup, or a client-provided timestamp.
    const receivedAt = runtime.clock.now();
    let committed = false;
    const commandInput: unknown = rawCommand;
    const command = validateTurnSubmitCommand(commandInput);
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

      const result = await runtime.legacyHangulV1CommandRouter.submit({
        roomId: binding.roomId,
        actorPlayerId: binding.playerId,
        requestId: command.value.requestId,
        expectedGameRevision: command.value.expectedGameRevision,
        turnId: command.value.turnId,
        receivedAt,
        proposedBoard: command.value.payload.proposedBoard,
        authorization: {
          isCurrent: () =>
            socket.connected && isCurrentBinding(runtime, binding),
        },
      });
      if (!result.ok) {
        acknowledgeIfPresent(
          acknowledge,
          await turnSubmitFailureAck(
            runtime,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }
      committed = true;

      const snapshot = await loadSnapshot(
        runtime,
        binding.roomId,
        binding.playerId,
      );
      if (snapshot === null) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }

      if (!isPlayingSnapshot(snapshot) && !isFinishedSnapshot(snapshot)) {
        reportPostCommitDeliveryFailure();
        return;
      }

      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      if (isPlayingSnapshot(snapshot)) {
        io.to(internalRoomChannel(binding.roomId)).emit(
          "turn:started",
          turnStartedEvent(snapshot),
        );
      } else if (isFinishedSnapshot(snapshot)) {
        io.to(internalRoomChannel(binding.roomId)).emit(
          "game:finished",
          gameFinishedEvent(snapshot),
        );
      }

      const ack = turnSubmitSuccessAck(command.value.requestId, snapshot);
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

function registerTurnDrawHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("turn:draw", (rawCommand, acknowledge) => {
    // Arrival time, captured before validation or queueing, is authoritative.
    const receivedAt = runtime.clock.now();
    let committed = false;
    const commandInput: unknown = rawCommand;
    const command = validateTurnDrawCommand(commandInput);
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

      const result = await runtime.legacyHangulV1CommandRouter.draw({
        roomId: binding.roomId,
        actorPlayerId: binding.playerId,
        requestId: command.value.requestId,
        expectedGameRevision: command.value.expectedGameRevision,
        turnId: command.value.turnId,
        receivedAt,
        bagKind: command.value.payload.bagKind,
        authorization: {
          isCurrent: () =>
            socket.connected && isCurrentBinding(runtime, binding),
        },
      });
      if (!result.ok) {
        acknowledgeIfPresent(
          acknowledge,
          await turnActionFailureAck(
            runtime,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
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
      await emitCurrentGameAdvisory(io, runtime, binding.roomId);
      acknowledgeIfPresent(
        acknowledge,
        turnActionSuccessAck(command.value.requestId, snapshot),
      );
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

function registerTurnPassHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("turn:pass", (rawCommand, acknowledge) => {
    // Arrival time, captured before validation or queueing, is authoritative.
    const receivedAt = runtime.clock.now();
    let committed = false;
    const commandInput: unknown = rawCommand;
    const command = validateTurnPassCommand(commandInput);
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

      const result = await runtime.legacyHangulV1CommandRouter.pass({
        roomId: binding.roomId,
        actorPlayerId: binding.playerId,
        requestId: command.value.requestId,
        expectedGameRevision: command.value.expectedGameRevision,
        turnId: command.value.turnId,
        receivedAt,
        authorization: {
          isCurrent: () =>
            socket.connected && isCurrentBinding(runtime, binding),
        },
      });
      if (!result.ok) {
        acknowledgeIfPresent(
          acknowledge,
          await turnActionFailureAck(
            runtime,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }
      committed = true;

      const snapshot = await loadSnapshot(
        runtime,
        binding.roomId,
        binding.playerId,
      );
      if (
        snapshot === null ||
        (!isPlayingSnapshot(snapshot) && !isFinishedSnapshot(snapshot))
      ) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }

      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      await emitCurrentGameAdvisory(io, runtime, binding.roomId);
      acknowledgeIfPresent(
        acknowledge,
        turnActionSuccessAck(command.value.requestId, snapshot),
      );
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

function registerRoomLeaveHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
  authenticationExecutor: SocketAuthenticationExecutor,
): void {
  const maxTerminalAcknowledgements = 16;
  type TerminalRoomLeaveAcknowledgement = Readonly<{
    roomId: RoomId;
    playerId: PlayerId;
    fingerprint: string;
    acknowledgement: RoomLeaveAck;
  }>;
  const terminalAcks = new Map<
    RequestId,
    TerminalRoomLeaveAcknowledgement
  >();

  const terminalAppliesToBinding = (
    terminal: TerminalRoomLeaveAcknowledgement,
    binding: AuthenticatedSocketBinding | null,
  ): boolean =>
    binding === null ||
    (binding.roomId === terminal.roomId &&
      binding.playerId === terminal.playerId);

  socket.on("room:leave", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    const commandInput: unknown = rawCommand;
    const command = validateRoomLeaveCommand(commandInput);
    if (!command.ok) {
      acknowledgeIfPresent(
        acknowledge,
        failureAck(commandInput, command.error, receivedAt),
      );
      return;
    }

    const fingerprint = JSON.stringify([
      "room:leave",
      command.value.expectedRoomRevision,
      command.value.expectedGameRevision,
    ]);
    const terminal = terminalAcks.get(command.value.requestId);
    const bindingAtEntry = runtime.connectionRegistry.getAuthenticatedBinding(
      createSocketId(socket.id),
    );
    if (
      terminal !== undefined &&
      terminalAppliesToBinding(terminal, bindingAtEntry)
    ) {
      acknowledgeIfPresent(
        acknowledge,
        terminal.fingerprint === fingerprint
          ? terminal.acknowledgement
          : failureAck(commandInput, REQUEST_ID_REUSED_ERROR, receivedAt),
      );
      return;
    }

    void authenticationExecutor.run(createSocketId(socket.id), async () => {
      const replayAfterQueue = terminalAcks.get(command.value.requestId);
      const bindingAfterQueue =
        runtime.connectionRegistry.getAuthenticatedBinding(
          createSocketId(socket.id),
        );
      if (
        replayAfterQueue !== undefined &&
        terminalAppliesToBinding(replayAfterQueue, bindingAfterQueue)
      ) {
        acknowledgeIfPresent(
          acknowledge,
          replayAfterQueue.fingerprint === fingerprint
            ? replayAfterQueue.acknowledgement
            : failureAck(commandInput, REQUEST_ID_REUSED_ERROR, receivedAt),
        );
        return;
      }

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

      const roomBefore = await runtime.persistence.findById(binding.roomId);
      if (roomBefore === null) {
        acknowledgeIfPresent(
          acknowledge,
          failureAck(commandInput, ROOM_NOT_FOUND_ERROR, receivedAt),
        );
        return;
      }
      const actorWasCurrent =
        roomBefore.phase === "PLAYING" &&
        roomBefore.game?.turn?.activePlayerId === binding.playerId;

      const result = await runtime.roomLeaveService.leave({
        roomId: binding.roomId,
        actorPlayerId: binding.playerId,
        requestId: command.value.requestId,
        expectedRoomRevision: command.value.expectedRoomRevision,
        expectedGameRevision: command.value.expectedGameRevision,
        authorization: {
          isCurrent: () =>
            socket.connected && isCurrentBinding(runtime, binding),
        },
      });
      if (!result.ok) {
        acknowledgeIfPresent(
          acknowledge,
          await turnSubmitFailureAck(
            runtime,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }

      const acknowledgement: RoomLeaveAck = {
        scope: "ROOM",
        requestId: command.value.requestId,
        ok: true,
        serverTime: runtime.clock.now(),
        versions: {
          roomRevision:
            result.data.roomRevision ?? command.value.expectedRoomRevision,
          gameRevision: result.data.gameRevision,
          presenceVersion: runtime.connectionRegistry.getPresenceVersion(
            binding.roomId,
          ),
        },
        data: {
          roomId: binding.roomId,
          roomCode: roomBefore.roomCode,
          roomClosed: result.data.roomClosed,
        },
      };
      terminalAcks.set(command.value.requestId, {
        roomId: binding.roomId,
        playerId: binding.playerId,
        fingerprint,
        acknowledgement,
      });
      if (terminalAcks.size > maxTerminalAcknowledgements) {
        const oldestRequestId = terminalAcks.keys().next().value;
        if (oldestRequestId !== undefined) {
          terminalAcks.delete(oldestRequestId);
        }
      }

      // Canonical leave has already committed. Remove the transport channel
      // subscription before acknowledging so this socket cannot observe later
      // Room snapshots despite no longer owning a Room membership.
      try {
        await socket.leave(internalRoomChannel(binding.roomId));
      } catch {
        reportPostCommitDeliveryFailure();
      }
      acknowledgeIfPresent(acknowledge, acknowledgement);

      if (
        !result.data.roomClosed &&
        (actorWasCurrent || result.data.phase === "FINISHED")
      ) {
        await emitCurrentGameAdvisory(io, runtime, binding.roomId);
      }
    }).catch(() => {
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
    const disconnectedAt = runtime.clock.now();
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

    void runtime.roomPresencePolicyService
      .onCurrentDisconnect({
        roomId: binding.roomId,
        playerId: binding.playerId,
        connectionGeneration: binding.connectionGeneration,
        presenceVersion: result.presenceVersion,
        disconnectedAt,
      })
      .catch(reportRoomPolicyOrchestrationFailure);
    void fanOutRoomSnapshots(io, runtime, binding.roomId).catch(
      reportSnapshotFanOutFailure,
    );
  });
}

export function registerSocketIoHandlers(
  io: RealtimeServer,
  runtime: ApplicationRuntime,
): () => void {
  const authenticationExecutor = new KeyedSerialExecutor<SocketId>();
  const unsubscribeTimeoutApplied = runtime.turnTimeoutService.subscribeApplied(
    async (data) => {
      try {
        await fanOutRoomSnapshots(io, runtime, data.roomId);
        await emitCurrentGameAdvisory(io, runtime, data.roomId);
      } catch {
        reportSnapshotFanOutFailure();
      }
    },
  );
  const unsubscribeGameDeadlineApplied =
    runtime.gameDeadlineService.subscribeApplied(async (data) => {
      try {
        await fanOutRoomSnapshots(io, runtime, data.roomId);
        await emitCurrentGameAdvisory(io, runtime, data.roomId);
      } catch {
        reportSnapshotFanOutFailure();
      }
    });
  const unsubscribeRoomPlayerRemoved = runtime.subscribeRoomPlayerRemoved(
    async (roomId) => {
      try {
        await fanOutRoomSnapshots(io, runtime, roomId);
      } catch {
        reportSnapshotFanOutFailure();
      }
    },
  );
  const unsubscribeRoomClosed = runtime.subscribeRoomClosed(
    async (roomId, roomCode, connectedBindings) => {
      const event = roomClosedEvent(runtime, roomId, roomCode);
      for (const binding of connectedBindings) {
        const connectedSocket = io.sockets.sockets.get(binding.socketId);
        if (connectedSocket === undefined) {
          continue;
        }
        connectedSocket.emit("room:closed", event);
        try {
          await connectedSocket.leave(internalRoomChannel(binding.roomId));
        } catch {
          reportPostCommitDeliveryFailure();
        }
      }
    },
  );

  io.on("connection", (socket) => {
    registerBootstrapHandler(socket, runtime);
    registerCreateRoomHandler(io, socket, runtime, authenticationExecutor);
    registerJoinRoomHandler(io, socket, runtime, authenticationExecutor);
    registerResumeHandler(io, socket, runtime, authenticationExecutor);
    registerStateSyncHandler(socket, runtime);
    registerGameStartHandler(io, socket, runtime);
    registerTurnSubmitHandler(io, socket, runtime);
    registerTurnDrawHandler(io, socket, runtime);
    registerTurnPassHandler(io, socket, runtime);
    registerRoomLeaveHandler(io, socket, runtime, authenticationExecutor);
    registerDisconnectHandler(io, socket, runtime);
  });

  return () => {
    unsubscribeRoomClosed();
    unsubscribeRoomPlayerRemoved();
    unsubscribeTimeoutApplied();
    unsubscribeGameDeadlineApplied();
  };
}
