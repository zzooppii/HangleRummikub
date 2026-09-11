import { RoomPreparationCommandSchema } from "@hangul-rummikub/shared";
import { CityExpansionClientCommandSchema } from "@hangul-rummikub/shared";
import { DrawClientCommandSchema } from "@hangul-rummikub/shared";
import { validateGemCollectCommand, validateGemPurchaseCommand, validateGemReserveCommand, validateGemYieldCommand, type GemCollectWireAck, type GemCardPlayingPlatformSnapshotV2, type GemCardFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import { validateCityClientCommand, type CityClientCommand, type CityActionWireAck } from "@hangul-rummikub/shared";
import { safeParse as parseNumberRematch } from "valibot";
import { NumberRematchCommandSchema } from "@hangul-rummikub/shared";
import {
  PROTOCOL_VERSION,
  validateNumberDrawCommand,
  validateNumberPassCommand,
  validateNumberSubmitCommand,
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
  type ErrorDto,
  type FinishedStateSnapshot,
  type GameFinishedEvent,
  type GameStartWireAck,
  type GameType,
  type HangulTileFinishedPlatformSnapshotV2,
  type HangulTilePlayingPlatformSnapshotV2,
  type NumberDrawWireAck,
  type NumberPassWireAck,
  type NumberSubmitWireAck,
  type NumberTileFinishedPlatformSnapshotV2,
  type NumberTilePlayingPlatformSnapshotV2,
  type PlayerId,
  type PlayingSnapshotWirePayload,
  type PlayingStateSnapshot,
  type RequestId,
  type RoomCreateWireAck,
  type RoomClosedEvent,
  type RoomId,
  type RoomJoinWireAck,
  type RoomLeaveAck,
  type RoomScopedAck,
  type RoomScopedAckFailure,
  type ServerTime,
  type SnapshotWireClientToServerEvents,
  type SnapshotWireServerToClientEvents,
  type SnapshotWireVersion,
  type SessionBootstrapAck,
  type SessionReplacedNotification,
  type SessionResumeWireAck,
  type StateSnapshot,
  type StateSnapshotWireDeliveryData,
  type StateSnapshotWireEvent,
  type StateSnapshotWirePayload,
  type StateVersions,
  type StateSyncWireAck,
  type TurnStartedEvent,
  type TurnDrawWireAck,
  type TurnPassWireAck,
  type TurnSubmitWireAck,
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
import type {
  HangulRoomRecord,
  RoomRecord,
} from "../model/persistence.js";
import {
  negotiateSnapshotVersion,
  SNAPSHOT_NEGOTIATION_ERROR_MESSAGES,
} from "./snapshot-version-negotiation.js";
import {
  GAME_TYPE_CAPABILITY_ERROR_MESSAGE,
  negotiateGameTypeCapability,
} from "./game-type-capability.js";
import { isRoomAdmissionCompatible } from "../application/room-admission-policy.js";
import { selectSnapshotWirePayload } from "./snapshot-wire-selector.js";

type EmptyEvents = Record<never, never>;
export type RealtimeSocketData = {
  selectedSnapshotVersion: SnapshotWireVersion;
  supportedGameTypes: readonly GameType[];
  supportsRoomPreparation: boolean;
};

export type RealtimeServer = SocketIOServer<
  SnapshotWireClientToServerEvents,
  SnapshotWireServerToClientEvents,
  EmptyEvents,
  RealtimeSocketData
>;

type RealtimeSocket = Socket<
  SnapshotWireClientToServerEvents,
  SnapshotWireServerToClientEvents,
  EmptyEvents,
  RealtimeSocketData
>;

type CorrelatableFailureAck =
  | UncorrelatedFailureAck
  | UnscopedAckFailure;
type TurnCommandFailureAck = CorrelatableFailureAck | RoomScopedAckFailure;

type SnapshotMetadata = Readonly<{
  serverTime: ServerTime;
  versions: StateVersions;
}>;

type HangulPlayingOrFinishedWirePayload =
  | PlayingStateSnapshot
  | FinishedStateSnapshot
  | HangulTilePlayingPlatformSnapshotV2
  | HangulTileFinishedPlatformSnapshotV2;

type SocketAuthenticationExecutor = KeyedSerialExecutor<SocketId>;

class RoomMembershipEndedError extends Error {}
class IncompatibleGameCapabilityError extends Error {}

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
  metadata: SnapshotMetadata,
  wireSnapshot: StateSnapshotWirePayload,
): RoomScopedAck<StateSnapshotWireDeliveryData> {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: metadata.serverTime,
    versions: metadata.versions,
    data: { snapshot: wireSnapshot },
  };
}

function gameStartSuccessAck(
  requestId: RequestId,
  metadata: SnapshotMetadata,
  wireSnapshot: PlayingSnapshotWirePayload,
): GameStartWireAck {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: metadata.serverTime,
    versions: metadata.versions,
    data: { snapshot: wireSnapshot },
  };
}

function turnSubmitSuccessAck(
  requestId: RequestId,
  metadata: SnapshotMetadata,
  wireSnapshot:
    | PlayingStateSnapshot
    | FinishedStateSnapshot
    | HangulTilePlayingPlatformSnapshotV2
    | HangulTileFinishedPlatformSnapshotV2,
): TurnSubmitWireAck {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: metadata.serverTime,
    versions: metadata.versions,
    data: { snapshot: wireSnapshot },
  };
}

function turnDrawSuccessAck(
  requestId: RequestId,
  metadata: SnapshotMetadata,
  wireSnapshot: PlayingStateSnapshot | HangulTilePlayingPlatformSnapshotV2,
): TurnDrawWireAck {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: metadata.serverTime,
    versions: metadata.versions,
    data: { snapshot: wireSnapshot },
  };
}

function turnPassSuccessAck(
  requestId: RequestId,
  metadata: SnapshotMetadata,
  wireSnapshot:
    | PlayingStateSnapshot
    | FinishedStateSnapshot
    | HangulTilePlayingPlatformSnapshotV2
    | HangulTileFinishedPlatformSnapshotV2,
): TurnPassWireAck {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: metadata.serverTime,
    versions: metadata.versions,
    data: { snapshot: wireSnapshot },
  };
}

function numberSubmitSuccessAck(
  requestId: RequestId,
  metadata: SnapshotMetadata,
  wireSnapshot:
    | NumberTilePlayingPlatformSnapshotV2
    | NumberTileFinishedPlatformSnapshotV2,
): NumberSubmitWireAck {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: metadata.serverTime,
    versions: metadata.versions,
    data: { snapshot: wireSnapshot },
  };
}

function gemSuccessAck(
  requestId: RequestId,
  metadata: SnapshotMetadata,
  wireSnapshot:
    | GemCardPlayingPlatformSnapshotV2
    | GemCardFinishedPlatformSnapshotV2,
): GemCollectWireAck {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: metadata.serverTime,
    versions: metadata.versions,
    data: { snapshot: wireSnapshot },
  };
}

function numberDrawSuccessAck(
  requestId: RequestId,
  metadata: SnapshotMetadata,
  wireSnapshot: NumberTilePlayingPlatformSnapshotV2,
): NumberDrawWireAck {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: metadata.serverTime,
    versions: metadata.versions,
    data: { snapshot: wireSnapshot },
  };
}

function numberPassSuccessAck(
  requestId: RequestId,
  metadata: SnapshotMetadata,
  wireSnapshot:
    | NumberTilePlayingPlatformSnapshotV2
    | NumberTileFinishedPlatformSnapshotV2,
): NumberPassWireAck {
  return {
    scope: "ROOM",
    requestId,
    ok: true,
    serverTime: metadata.serverTime,
    versions: metadata.versions,
    data: { snapshot: wireSnapshot },
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
  socket: RealtimeSocket,
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

  let metadata: SnapshotMetadata | null;
  try {
    const loaded = await loadSnapshotForSocket(
      runtime,
      socket,
      binding.roomId,
      binding.playerId,
    );
    metadata = loaded?.metadata ?? null;
  } catch {
    return failureAck({ requestId }, error, fallbackServerTime);
  }
  if (metadata === null) {
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
    serverTime: metadata.serverTime,
    versions: metadata.versions,
    error,
  } satisfies RoomScopedAckFailure;
}

async function turnActionFailureAck(
  runtime: ApplicationRuntime,
  socket: RealtimeSocket,
  binding: AuthenticatedSocketBinding,
  requestId: RequestId,
  error: ErrorDto,
  fallbackServerTime: ServerTime,
): Promise<TurnCommandFailureAck> {
  return turnSubmitFailureAck(
    runtime,
    socket,
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

function isPlayingWireSnapshot(
  snapshot: StateSnapshotWirePayload,
): snapshot is PlayingSnapshotWirePayload {
  return snapshot.room.phase === "PLAYING";
}

function isNumberTilePlayingWireSnapshot(
  snapshot: StateSnapshotWirePayload,
): snapshot is NumberTilePlayingPlatformSnapshotV2 {
  return (
    "snapshotVersion" in snapshot &&
    snapshot.room.gameType === "NUMBER_TILE" &&
    snapshot.room.phase === "PLAYING"
  );
}

function isNumberTileFinishedWireSnapshot(
  snapshot: StateSnapshotWirePayload,
): snapshot is NumberTileFinishedPlatformSnapshotV2 {
  return (
    "snapshotVersion" in snapshot &&
    snapshot.room.gameType === "NUMBER_TILE" &&
    snapshot.room.phase === "FINISHED"
  );
}

function isGemCardPlayingWireSnapshot(
  snapshot: StateSnapshotWirePayload,
): snapshot is GemCardPlayingPlatformSnapshotV2 {
  return (
    "snapshotVersion" in snapshot &&
    snapshot.room.gameType === "GEM_CARD" &&
    snapshot.room.phase === "PLAYING"
  );
}

function isGemCardFinishedWireSnapshot(
  snapshot: StateSnapshotWirePayload,
): snapshot is GemCardFinishedPlatformSnapshotV2 {
  return (
    "snapshotVersion" in snapshot &&
    snapshot.room.gameType === "GEM_CARD" &&
    snapshot.room.phase === "FINISHED"
  );
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

function snapshotEvent(
  metadata: SnapshotMetadata,
  wireSnapshot: StateSnapshotWirePayload,
): StateSnapshotWireEvent {
  return {
    kind: "state:snapshot",
    protocolVersion: PROTOCOL_VERSION,
    versions: metadata.versions,
    serverTime: metadata.serverTime,
    payload: { snapshot: wireSnapshot },
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

type LoadedLegacySnapshot = Readonly<{
  room: HangulRoomRecord;
  snapshot: StateSnapshot;
}>;

type LoadedWireSnapshot = Readonly<{
  room: RoomRecord;
  wireSnapshot: StateSnapshotWirePayload;
  metadata: SnapshotMetadata;
  legacySnapshot: StateSnapshot | null;
}>;

function socketAdmissionCapabilities(
  socket: RealtimeSocket,
): import("../application/room-admission-policy.js").RoomAdmissionCapabilities {
  return {
    selectedSnapshotVersion: socket.data.selectedSnapshotVersion,
    supportedGameTypes: socket.data.supportedGameTypes,
    supportsRoomPreparation: socket.data.supportsRoomPreparation,
  };
}

function metadataFromWireSnapshot(
  snapshot: StateSnapshotWirePayload,
): SnapshotMetadata {
  if ("protocolVersion" in snapshot) {
    return {
      serverTime: snapshot.serverTime,
      versions: snapshot.versions,
    };
  }
  return {
    serverTime: snapshot.serverTime,
    versions: {
      roomRevision: snapshot.versions.roomRevision,
      gameRevision: snapshot.game?.gameRevision ?? null,
      presenceVersion: snapshot.versions.presenceVersion,
    },
  };
}

async function loadLegacySnapshot(
  runtime: ApplicationRuntime,
  roomId: RoomId,
  playerId: PlayerId,
): Promise<LoadedLegacySnapshot | null> {
  const room = await runtime.persistence.findById(roomId);
  if (room === null) {
    return null;
  }
  if (room.gameType !== "HANGUL_TILE") {
    throw new Error("Legacy Hangul snapshot requested for another gameType.");
  }

  return {
    room,
    snapshot: await runtime.snapshotProjector.project({
      room,
      selfPlayerId: playerId,
    }),
  };
}

function selectSnapshotForSocket(
  socket: RealtimeSocket,
  room: HangulRoomRecord,
  legacySnapshot: PlayingStateSnapshot,
): PlayingStateSnapshot | HangulTilePlayingPlatformSnapshotV2;
function selectSnapshotForSocket(
  socket: RealtimeSocket,
  room: HangulRoomRecord,
  legacySnapshot: FinishedStateSnapshot,
): FinishedStateSnapshot | HangulTileFinishedPlatformSnapshotV2;
function selectSnapshotForSocket(
  socket: RealtimeSocket,
  room: HangulRoomRecord,
  legacySnapshot: PlayingStateSnapshot | FinishedStateSnapshot,
): HangulPlayingOrFinishedWirePayload;
function selectSnapshotForSocket(
  socket: RealtimeSocket,
  room: HangulRoomRecord,
  legacySnapshot: StateSnapshot,
): StateSnapshotWirePayload;
function selectSnapshotForSocket(
  socket: RealtimeSocket,
  room: HangulRoomRecord,
  legacySnapshot: StateSnapshot,
): StateSnapshotWirePayload {
  return selectSnapshotWirePayload({
    selectedVersion: socket.data.selectedSnapshotVersion,
    canonicalGameType: room.gameType,
    legacySnapshot,
  });
}

async function projectSnapshotForSocket(
  runtime: ApplicationRuntime,
  socket: RealtimeSocket,
  room: RoomRecord,
  selfPlayerId: PlayerId,
): Promise<LoadedWireSnapshot> {
  if (
    !isRoomAdmissionCompatible(
      room.gameType,
      socketAdmissionCapabilities(socket),
      room.readyPlayerIds !== undefined,
    )
  ) {
    throw new IncompatibleGameCapabilityError(
      "Socket cannot represent the canonical Room game.",
    );
  }

  if (room.gameType === "HANGUL_TILE" && !(room.phase === "LOBBY" && socket.data.selectedSnapshotVersion === 2)) {
    const legacySnapshot = await runtime.snapshotProjector.project({
      room,
      selfPlayerId,
    });
    const wireSnapshot = selectSnapshotForSocket(
      socket,
      room,
      legacySnapshot,
    );
    return {
      room,
      wireSnapshot,
      metadata: metadataFromWireSnapshot(wireSnapshot),
      legacySnapshot,
    };
  }

  const wireSnapshot = await runtime.platformSnapshotV2Projector.project({
    room,
    selfPlayerId,
  });
  return {
    room,
    wireSnapshot,
    metadata: metadataFromWireSnapshot(wireSnapshot),
    legacySnapshot: null,
  };
}

async function loadSnapshotForSocket(
  runtime: ApplicationRuntime,
  socket: RealtimeSocket,
  roomId: RoomId,
  playerId: PlayerId,
): Promise<LoadedWireSnapshot | null> {
  const room = await runtime.persistence.findById(roomId);
  return room === null
    ? null
    : projectSnapshotForSocket(runtime, socket, room, playerId);
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

    const connectedSocket = io.sockets.sockets.get(binding.socketId);
    if (connectedSocket === undefined) {
      continue;
    }
    const loaded = await projectSnapshotForSocket(
      runtime,
      connectedSocket,
      room,
      binding.playerId,
    );
    if (!isCurrentBinding(runtime, binding)) {
      continue;
    }
    connectedSocket.emit(
      "state:snapshot",
      snapshotEvent(loaded.metadata, loaded.wireSnapshot),
    );
  }
}

async function emitCurrentGameAdvisory(
  io: RealtimeServer,
  runtime: ApplicationRuntime,
  roomId: RoomId,
): Promise<void> {
  const room = await runtime.persistence.findById(roomId);
  if (room === null || room.gameType !== "HANGUL_TILE") {
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

  const admissionRoom = await runtime.persistence.findById(roomId);
  if (
    admissionRoom === null ||
    !admissionRoom.players.some((player) => player.playerId === playerId)
  ) {
    throw new RoomMembershipEndedError(
      "Room membership ended before the socket could be bound.",
    );
  }
  if (
    !isRoomAdmissionCompatible(
      admissionRoom.gameType,
      socketAdmissionCapabilities(socket),
      admissionRoom.readyPlayerIds !== undefined,
    )
  ) {
    throw new IncompatibleGameCapabilityError(
      "Socket cannot bind to an unsupported Room game.",
    );
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
  if (
    !isRoomAdmissionCompatible(
      currentRoom.gameType,
      socketAdmissionCapabilities(socket),
      currentRoom.readyPlayerIds !== undefined,
    )
  ) {
    await socket.leave(roomChannel);
    throw new IncompatibleGameCapabilityError(
      "Socket cannot bind to an unsupported Room game.",
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
    admissionCapabilities: socketAdmissionCapabilities(socket),
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
        gameType: command.value.payload.gameType,
        admissionCapabilities: socketAdmissionCapabilities(socket),
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
        const loaded = await loadSnapshotForSocket(
          runtime,
          socket,
          result.data.roomId,
          result.data.playerId,
        );
        if (loaded === null) {
          reportPostCommitDeliveryFailure();
          return;
        }
        if (!socket.connected || !isCurrentBinding(runtime, binding)) {
          return;
        }

        const ack: RoomCreateWireAck = snapshotSuccessAck(
          command.value.requestId,
          loaded.metadata,
          loaded.wireSnapshot,
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
        admissionCapabilities: socketAdmissionCapabilities(socket),
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
        const loaded = await loadSnapshotForSocket(
          runtime,
          socket,
          result.data.roomId,
          result.data.playerId,
        );
        if (loaded === null) {
          reportPostCommitDeliveryFailure();
          return;
        }
        if (!socket.connected || !isCurrentBinding(runtime, binding)) {
          return;
        }

        const ack: RoomJoinWireAck = snapshotSuccessAck(
          command.value.requestId,
          loaded.metadata,
          loaded.wireSnapshot,
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
        admissionCapabilities: socketAdmissionCapabilities(socket),
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
              admissionCapabilities: socketAdmissionCapabilities(socket),
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
          admissionCapabilities: socketAdmissionCapabilities(socket),
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
        runtime.drawRelayHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.islandHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.splendorHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.jaipurHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.loveLetterHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.guryongtuHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.azulHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.carcassonneHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.clueHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.duetHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.saboteurHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.lostCitiesHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.halliHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.wolfHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.liarHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.spyfallHostSuccession?.resumed(result.data.roomId, result.data.playerId);
        runtime.sneakyLunchPresence?.resumed(result.data.roomId, result.data.playerId);
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
        const loaded = await loadSnapshotForSocket(
          runtime,
          socket,
          result.data.roomId,
          result.data.playerId,
        );
        if (loaded === null) {
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

        const ack: SessionResumeWireAck = snapshotSuccessAck(
          command.value.requestId,
          loaded.metadata,
          loaded.wireSnapshot,
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

      const loaded = await loadSnapshotForSocket(
        runtime,
        socket,
        binding.roomId,
        binding.playerId,
      );
      if (loaded === null) {
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

      const ack: StateSyncWireAck = snapshotSuccessAck(
        command.value.requestId,
        loaded.metadata,
        loaded.wireSnapshot,
      );
      acknowledgeIfPresent(acknowledge, ack);
      socket.emit(
        "state:snapshot",
        snapshotEvent(loaded.metadata, loaded.wireSnapshot),
      );
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

      const result = await runtime.gameStartRouter.start({
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

      const loaded = await loadSnapshotForSocket(
        runtime,
        socket,
        binding.roomId,
        binding.playerId,
      );
      if (
        loaded === null ||
        !isPlayingWireSnapshot(loaded.wireSnapshot)
      ) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }

      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      if (
        loaded.legacySnapshot !== null &&
        isPlayingSnapshot(loaded.legacySnapshot)
      ) {
        io.to(internalRoomChannel(binding.roomId)).emit(
          "turn:started",
          turnStartedEvent(loaded.legacySnapshot),
        );
      }
      const ack = gameStartSuccessAck(
        command.value.requestId,
        loaded.metadata,
        loaded.wireSnapshot,
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
            socket,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }
      committed = true;

      const loaded = await loadLegacySnapshot(
        runtime,
        binding.roomId,
        binding.playerId,
      );
      if (loaded === null) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }

      if (
        !isPlayingSnapshot(loaded.snapshot) &&
        !isFinishedSnapshot(loaded.snapshot)
      ) {
        reportPostCommitDeliveryFailure();
        return;
      }

      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      if (isPlayingSnapshot(loaded.snapshot)) {
        io.to(internalRoomChannel(binding.roomId)).emit(
          "turn:started",
          turnStartedEvent(loaded.snapshot),
        );
      } else if (isFinishedSnapshot(loaded.snapshot)) {
        io.to(internalRoomChannel(binding.roomId)).emit(
          "game:finished",
          gameFinishedEvent(loaded.snapshot),
        );
      }

      const wireSnapshot = selectSnapshotForSocket(
        socket,
        loaded.room,
        loaded.snapshot,
      );
      const ack = turnSubmitSuccessAck(
        command.value.requestId,
        metadataFromWireSnapshot(wireSnapshot),
        wireSnapshot,
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
            socket,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }
      committed = true;

      const loaded = await loadLegacySnapshot(
        runtime,
        binding.roomId,
        binding.playerId,
      );
      if (loaded === null || !isPlayingSnapshot(loaded.snapshot)) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }

      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      await emitCurrentGameAdvisory(io, runtime, binding.roomId);
      const wireSnapshot = selectSnapshotForSocket(
        socket,
        loaded.room,
        loaded.snapshot,
      );
      acknowledgeIfPresent(
        acknowledge,
        turnDrawSuccessAck(
          command.value.requestId,
          metadataFromWireSnapshot(wireSnapshot),
          wireSnapshot,
        ),
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
            socket,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }
      committed = true;

      const loaded = await loadLegacySnapshot(
        runtime,
        binding.roomId,
        binding.playerId,
      );
      if (
        loaded === null ||
        (!isPlayingSnapshot(loaded.snapshot) &&
          !isFinishedSnapshot(loaded.snapshot))
      ) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }

      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      await emitCurrentGameAdvisory(io, runtime, binding.roomId);
      const wireSnapshot = selectSnapshotForSocket(
        socket,
        loaded.room,
        loaded.snapshot,
      );
      acknowledgeIfPresent(
        acknowledge,
        turnPassSuccessAck(
          command.value.requestId,
          metadataFromWireSnapshot(wireSnapshot),
          wireSnapshot,
        ),
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

/** Seven closed CITY events share only authenticated transport delivery plumbing. */
function registerCityHandlers(io: RealtimeServer, socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  function receive(event: CityClientCommand["kind"], raw: unknown, acknowledge: (ack: CityActionWireAck) => void): void {
    const receivedAt = runtime.clock.now();
    const command = validateCityClientCommand(raw);
    if (!command.ok || command.value.kind !== event) {
      acknowledgeIfPresent(acknowledge, failureAck(raw, command.ok ? INVALID_PAYLOAD_ERROR : command.error, receivedAt));
      return;
    }
    let committed = false;
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (binding === null) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt));
        return;
      }
      if (!isRoomAdmissionCompatible("CITY_ROLE", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, { code: "INCOMPATIBLE_GAME_CAPABILITY", message: "CITY requires V2 and CITY capability.", recoverable: false }, receivedAt));
        return;
      }
      const value = command.value;
      const input = { roomId: binding.roomId, actorPlayerId: binding.playerId, requestId: value.requestId,
        gameId: value.gameId, expectedGameRevision: value.expectedGameRevision, actionId: value.actionId, receivedAt,
        authorization: { isCurrent: () => socket.connected && isCurrentBinding(runtime, binding) } };
      const router = runtime.cityRoleCommandRouter;
      const result = await (async () => {
        switch (value.kind) {
          case "city:selectRole": return router.selectRole({ ...input, roleId: value.payload.roleId, ...(value.payload.discardRoleId === undefined ? {} : { discardRoleId: value.payload.discardRoleId }) });
          case "city:takeIncome": return router.takeIncome(input);
          case "city:drawBuildingCards": return router.drawBuildingCards(input);
          case "city:chooseBuildingCard": return router.chooseBuildingCard({ ...input, cardId: value.payload.cardId });
          case "city:useRoleAbility": return router.useRoleAbility({ ...input, ability: value.payload });
          case "city:build": return router.build({ ...input, cardId: value.payload.cardId });
          case "city:endTurn": return router.endTurn(input);
        }
      })();
      if (!result.ok) {
        acknowledgeIfPresent(acknowledge, await turnSubmitFailureAck(runtime, socket, binding, value.requestId, result.error, receivedAt));
        return;
      }
      committed = true;
      const loaded = await loadSnapshotForSocket(runtime, socket, binding.roomId, binding.playerId);
      if (loaded === null || !socket.connected || !isCurrentBinding(runtime, binding)) return;
      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      // Replay data is the original commit receipt, never a stale private snapshot.
      acknowledgeIfPresent(acknowledge, { scope: "ROOM", requestId: value.requestId, ok: true,
        serverTime: loaded.metadata.serverTime, versions: loaded.metadata.versions,
        data: { gameId: result.data.gameId, committedGameRevision: result.data.gameRevision } });
    })().catch(() => {
      if (committed) reportPostCommitDeliveryFailure();
      else acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt));
    });
  }
  for (const event of ["city:configure", "city:expansionAction"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), parsed = parseNumberRematch(CityExpansionClientCommandSchema, raw);
    if (!parsed.success || parsed.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("CITY_ROLE", socketAdmissionCapabilities(socket))) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
      const service = runtime.cityRoleCommandService;
      if (!service) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const c = parsed.output, base = { roomId: binding.roomId, actorPlayerId: binding.playerId, requestId: c.requestId, authorization: { isCurrent: () => socket.connected && isCurrentBinding(runtime, binding) } };
      const result = c.kind === "city:configure" ? await service.configure({ ...base, expectedRoomRevision: c.expectedRoomRevision, settings: c.payload }) : await service.expansion({ ...base, gameId: c.gameId, expectedGameRevision: c.expectedGameRevision, actionId: c.actionId, receivedAt, action: c.payload });
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw, result.error, receivedAt)); return; }
      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      const loaded = await loadSnapshotForSocket(runtime, socket, binding.roomId, binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime, binding)) acknowledgeIfPresent(acknowledge, snapshotSuccessAck(c.requestId, loaded.metadata, loaded.wireSnapshot));
    })().catch(() => acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)));
  });
  socket.on("city:selectRole", (raw, ack) => receive("city:selectRole", raw, ack));
  socket.on("city:takeIncome", (raw, ack) => receive("city:takeIncome", raw, ack));
  socket.on("city:drawBuildingCards", (raw, ack) => receive("city:drawBuildingCards", raw, ack));
  socket.on("city:chooseBuildingCard", (raw, ack) => receive("city:chooseBuildingCard", raw, ack));
  socket.on("city:useRoleAbility", (raw, ack) => receive("city:useRoleAbility", raw, ack));
  socket.on("city:build", (raw, ack) => receive("city:build", raw, ack));
  socket.on("city:endTurn", (raw, ack) => receive("city:endTurn", raw, ack));
}

function registerGemCollectHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("gem:collect", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    let committed = false;
    const commandInput: unknown = rawCommand;
    const command = validateGemCollectCommand(commandInput);
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
      if (!isRoomAdmissionCompatible("GEM_CARD", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(commandInput, { code: "INCOMPATIBLE_GAME_CAPABILITY", message: "GEM requires V2 and GEM capability.", recoverable: false }, receivedAt));
        return;
      }
      const result = await runtime.gemCardCommandRouter.collect({
        roomId: binding.roomId,
        actorPlayerId: binding.playerId,
        requestId: command.value.requestId,
        expectedGameRevision: command.value.expectedGameRevision,
        turnId: command.value.turnId,
        receivedAt,
        selection: command.value.payload.selection,
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
            socket,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }
      committed = true;
      const loaded = await loadSnapshotForSocket(
        runtime,
        socket,
        binding.roomId,
        binding.playerId,
      );
      if (
        loaded === null ||
        (!isGemCardPlayingWireSnapshot(loaded.wireSnapshot) &&
          !isGemCardFinishedWireSnapshot(loaded.wireSnapshot))
      ) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }
      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      acknowledgeIfPresent(
        acknowledge,
        gemSuccessAck(
          command.value.requestId,
          loaded.metadata,
          loaded.wireSnapshot,
        ),
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


function registerGemPurchaseHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("gem:purchase", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    let committed = false;
    const commandInput: unknown = rawCommand;
    const command = validateGemPurchaseCommand(commandInput);
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
      if (!isRoomAdmissionCompatible("GEM_CARD", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(commandInput, { code: "INCOMPATIBLE_GAME_CAPABILITY", message: "GEM requires V2 and GEM capability.", recoverable: false }, receivedAt));
        return;
      }
      const result = await runtime.gemCardCommandRouter.purchase({
        roomId: binding.roomId,
        actorPlayerId: binding.playerId,
        requestId: command.value.requestId,
        expectedGameRevision: command.value.expectedGameRevision,
        turnId: command.value.turnId,
        receivedAt,
        source: command.value.payload.source,
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
            socket,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }
      committed = true;
      const loaded = await loadSnapshotForSocket(
        runtime,
        socket,
        binding.roomId,
        binding.playerId,
      );
      if (
        loaded === null ||
        (!isGemCardPlayingWireSnapshot(loaded.wireSnapshot) &&
          !isGemCardFinishedWireSnapshot(loaded.wireSnapshot))
      ) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }
      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      acknowledgeIfPresent(
        acknowledge,
        gemSuccessAck(
          command.value.requestId,
          loaded.metadata,
          loaded.wireSnapshot,
        ),
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


function registerGemReserveHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("gem:reserve", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    let committed = false;
    const commandInput: unknown = rawCommand;
    const command = validateGemReserveCommand(commandInput);
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
      if (!isRoomAdmissionCompatible("GEM_CARD", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(commandInput, { code: "INCOMPATIBLE_GAME_CAPABILITY", message: "GEM requires V2 and GEM capability.", recoverable: false }, receivedAt));
        return;
      }
      const result = await runtime.gemCardCommandRouter.reserve({
        roomId: binding.roomId,
        actorPlayerId: binding.playerId,
        requestId: command.value.requestId,
        expectedGameRevision: command.value.expectedGameRevision,
        turnId: command.value.turnId,
        receivedAt,
        source: command.value.payload.source,
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
            socket,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }
      committed = true;
      const loaded = await loadSnapshotForSocket(
        runtime,
        socket,
        binding.roomId,
        binding.playerId,
      );
      if (
        loaded === null ||
        (!isGemCardPlayingWireSnapshot(loaded.wireSnapshot) &&
          !isGemCardFinishedWireSnapshot(loaded.wireSnapshot))
      ) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }
      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      acknowledgeIfPresent(
        acknowledge,
        gemSuccessAck(
          command.value.requestId,
          loaded.metadata,
          loaded.wireSnapshot,
        ),
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


function registerGemYieldHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("gem:yield", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    let committed = false;
    const commandInput: unknown = rawCommand;
    const command = validateGemYieldCommand(commandInput);
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
      if (!isRoomAdmissionCompatible("GEM_CARD", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(commandInput, { code: "INCOMPATIBLE_GAME_CAPABILITY", message: "GEM requires V2 and GEM capability.", recoverable: false }, receivedAt));
        return;
      }
      const result = await runtime.gemCardCommandRouter.yield({
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
          await turnSubmitFailureAck(
            runtime,
            socket,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }
      committed = true;
      const loaded = await loadSnapshotForSocket(
        runtime,
        socket,
        binding.roomId,
        binding.playerId,
      );
      if (
        loaded === null ||
        (!isGemCardPlayingWireSnapshot(loaded.wireSnapshot) &&
          !isGemCardFinishedWireSnapshot(loaded.wireSnapshot))
      ) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }
      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      acknowledgeIfPresent(
        acknowledge,
        gemSuccessAck(
          command.value.requestId,
          loaded.metadata,
          loaded.wireSnapshot,
        ),
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

function registerNumberSubmitHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("number:submit", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    let committed = false;
    const commandInput: unknown = rawCommand;
    const command = validateNumberSubmitCommand(commandInput);
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
      const result = await runtime.numberTileCommandRouter.submit({
        roomId: binding.roomId,
        actorPlayerId: binding.playerId,
        requestId: command.value.requestId,
        expectedGameRevision: command.value.expectedGameRevision,
        turnId: command.value.turnId,
        receivedAt,
        proposedTable: command.value.payload.proposedTable,
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
            socket,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }
      committed = true;
      const loaded = await loadSnapshotForSocket(
        runtime,
        socket,
        binding.roomId,
        binding.playerId,
      );
      if (
        loaded === null ||
        (!isNumberTilePlayingWireSnapshot(loaded.wireSnapshot) &&
          !isNumberTileFinishedWireSnapshot(loaded.wireSnapshot))
      ) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }
      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      acknowledgeIfPresent(
        acknowledge,
        numberSubmitSuccessAck(
          command.value.requestId,
          loaded.metadata,
          loaded.wireSnapshot,
        ),
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

function registerNumberDrawHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("number:draw", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    let committed = false;
    const commandInput: unknown = rawCommand;
    const command = validateNumberDrawCommand(commandInput);
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
      const result = await runtime.numberTileCommandRouter.draw({
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
            socket,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }
      committed = true;
      const loaded = await loadSnapshotForSocket(
        runtime,
        socket,
        binding.roomId,
        binding.playerId,
      );
      if (
        loaded === null ||
        !isNumberTilePlayingWireSnapshot(loaded.wireSnapshot)
      ) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }
      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      acknowledgeIfPresent(
        acknowledge,
        numberDrawSuccessAck(
          command.value.requestId,
          loaded.metadata,
          loaded.wireSnapshot,
        ),
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

function registerNumberPassHandler(
  io: RealtimeServer,
  socket: RealtimeSocket,
  runtime: ApplicationRuntime,
): void {
  socket.on("number:pass", (rawCommand, acknowledge) => {
    const receivedAt = runtime.clock.now();
    let committed = false;
    const commandInput: unknown = rawCommand;
    const command = validateNumberPassCommand(commandInput);
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
      const result = await runtime.numberTileCommandRouter.pass({
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
            socket,
            binding,
            command.value.requestId,
            result.error,
            receivedAt,
          ),
        );
        return;
      }
      committed = true;
      const loaded = await loadSnapshotForSocket(
        runtime,
        socket,
        binding.roomId,
        binding.playerId,
      );
      if (
        loaded === null ||
        (!isNumberTilePlayingWireSnapshot(loaded.wireSnapshot) &&
          !isNumberTileFinishedWireSnapshot(loaded.wireSnapshot))
      ) {
        reportPostCommitDeliveryFailure();
        return;
      }
      if (!socket.connected || !isCurrentBinding(runtime, binding)) {
        return;
      }
      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      acknowledgeIfPresent(
        acknowledge,
        numberPassSuccessAck(
          command.value.requestId,
          loaded.metadata,
          loaded.wireSnapshot,
        ),
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


import { IslandClientCommandSchema } from "@hangul-rummikub/shared";
function registerIslandHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["island:act", "island:rematch"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(IslandClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("ISLAND_SETTLERS", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"ISLAND requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.islandService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.islandService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

import { SplendorClientCommandSchema } from "@hangul-rummikub/shared";
function registerSplendorHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["splendor:configure", "splendor:act", "splendor:rematch"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(SplendorClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("SPLENDOR", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"SPLENDOR requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.splendorService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.splendorService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

import { JaipurClientCommandSchema } from "@hangul-rummikub/shared";
function registerJaipurHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["jaipur:act", "jaipur:nextRound"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(JaipurClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("JAIPUR", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"JAIPUR requires V2 capability.",recoverable:false}, receivedAt)); return;
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"WORD_DUET requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.jaipurService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.jaipurService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

import { LoveLetterClientCommandSchema } from "@hangul-rummikub/shared";
function registerLoveLetterHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["loveLetter:act", "loveLetter:nextRound"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(LoveLetterClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("LOVE_LETTER", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"LOVE_LETTER requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.loveLetterService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.loveLetterService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

import { GuryongtuClientCommandSchema } from "@hangul-rummikub/shared";
function registerGuryongtuHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["guryongtu:act", "guryongtu:nextRound"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(GuryongtuClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("GURYONGTU", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"GURYONGTU requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.guryongtuService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.guryongtuService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

import { AzulClientCommandSchema } from "@hangul-rummikub/shared";
function registerAzulHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["azul:act"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(AzulClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("AZUL", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"AZUL requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.azulService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.azulService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}


import { CarcassonneClientCommandSchema } from "@hangul-rummikub/shared";
function registerCarcassonneHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["carcassonne:act"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(CarcassonneClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("CARCASSONNE", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"CARCASSONNE requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.carcassonneService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.carcassonneService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}


import { ClueClientCommandSchema } from "@hangul-rummikub/shared";
function registerClueHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["clue:act"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(ClueClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("CLUE", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"CLUE requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.clueService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.clueService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

import { DuetClientCommandSchema } from "@hangul-rummikub/shared";
function registerDuetHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["duet:act"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(DuetClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("WORD_DUET", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"WORD_DUET requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.duetService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.duetService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

import { SaboteurClientCommandSchema } from "@hangul-rummikub/shared";
function registerSaboteurHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["saboteur:act", "saboteur:nextRound", "saboteur:say"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(SaboteurClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("SABOTEUR", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"SABOTEUR requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.saboteurService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.saboteurService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}


import { LostCitiesClientCommandSchema } from "@hangul-rummikub/shared";
function registerLostCitiesHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["lostCities:configure", "lostCities:act", "lostCities:nextRound"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(LostCitiesClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("LOST_CITIES", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"LOST_CITIES requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.lostCitiesService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.lostCitiesService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

import { HalliClientCommandSchema } from "@hangul-rummikub/shared";
function registerHalliHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["halli:flip", "halli:bell", "halli:rematch"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(HalliClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("HALLI_GALLI", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"HALLI requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.halliService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.halliService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

import { WolfClientCommandSchema } from "@hangul-rummikub/shared";
function registerWolfHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["wolf:configure", "wolf:act", "wolf:vote", "wolf:say", "wolf:rematch"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(WolfClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("WOLF_NIGHT", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"WOLF requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.wolfService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.wolfService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

import { SpyfallClientCommandSchema } from "@hangul-rummikub/shared";
function registerSpyfallHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["spyfall:configure", "spyfall:ask", "spyfall:answer", "spyfall:accuse", "spyfall:vote", "spyfall:skip", "spyfall:reveal", "spyfall:guess"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(SpyfallClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("SPYFALL", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"SPYFALL requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.spyfallService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.spyfallService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

import { LiarClientCommandSchema } from "@hangul-rummikub/shared";
function registerLiarHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["liar:configure", "liar:clue", "liar:vote", "liar:say", "liar:guess"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(LiarClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("LIAR_GAME", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"LIAR requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.liarService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.liarService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

import { SneakyClientCommandSchema } from "@hangul-rummikub/shared";
function registerSneakyHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["sneaky:configure", "sneaky:eat", "sneaky:rematch"] as const) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now(), command = parseNumberRematch(SneakyClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event) { acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("SNEAKY_LUNCH", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, {code:"INCOMPATIBLE_GAME_CAPABILITY",message:"SNEAKY requires V2 capability.",recoverable:false}, receivedAt)); return;
      }
      if (!runtime.sneakyLunchService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.sneakyLunchService.command({roomId:binding.roomId,actorPlayerId:binding.playerId,command:command.output,receivedAt,
        authorization:{isCurrent:()=>socket.connected && isCurrentBinding(runtime,binding)}});
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw,result.error,receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime,socket,binding.roomId,binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime,binding)) acknowledgeIfPresent(acknowledge,snapshotSuccessAck(command.output.requestId,loaded.metadata,loaded.wireSnapshot));
    })().catch(()=>acknowledgeIfPresent(acknowledge,failureAck(raw,INTERNAL_ERROR,receivedAt)));
  });
}

function registerDrawRelayHandlers(socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  const events = ["draw:draftSave", "draw:submitDrawing", "draw:submitGuess", "draw:revealNext", "draw:rematch", "draw:configure"] as const;
  for (const event of events) socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
    const receivedAt = runtime.clock.now();
    const command = parseNumberRematch(DrawClientCommandSchema, raw);
    if (!command.success || command.output.kind !== event || Buffer.byteLength(JSON.stringify(raw)) > 512_000) {
      acknowledgeIfPresent(acknowledge, failureAck(raw, INVALID_PAYLOAD_ERROR, receivedAt)); return;
    }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, receivedAt)); return; }
      if (!isRoomAdmissionCompatible("DRAW_RELAY", socketAdmissionCapabilities(socket))) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, { code: "INCOMPATIBLE_GAME_CAPABILITY", message: "DRAW requires V2 capability.", recoverable: false }, receivedAt)); return;
      }
      if (!runtime.drawRelayService) { acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)); return; }
      const result = await runtime.drawRelayService.command({ roomId: binding.roomId, actorPlayerId: binding.playerId,
        command: command.output, receivedAt, authorization: { isCurrent: () => socket.connected && isCurrentBinding(runtime, binding) } });
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw, result.error, receivedAt)); return; }
      const loaded = await loadSnapshotForSocket(runtime, socket, binding.roomId, binding.playerId);
      if (loaded && socket.connected && isCurrentBinding(runtime, binding))
        acknowledgeIfPresent(acknowledge, snapshotSuccessAck(command.output.requestId, loaded.metadata, loaded.wireSnapshot));
    })().catch(() => acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, receivedAt)));
  });
}

function registerRoomPreparationHandlers(io: RealtimeServer, socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  for (const event of ["room:selectGame", "room:ready"] as const) {
    socket.on(event, (raw: unknown, acknowledge: (ack: StateSyncWireAck) => void) => {
      const now = runtime.clock.now();
      const parsed = parseNumberRematch(RoomPreparationCommandSchema, raw);
      if (!parsed.success || parsed.output.kind !== event) {
        acknowledgeIfPresent(acknowledge, failureAck(raw, { code: "INVALID_PAYLOAD", message: "Invalid room preparation command.", recoverable: false }, now));
        return;
      }
      void (async () => {
        const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
        if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, now)); return; }
        const result = await runtime.roomGameSelectionService.prepare({
          roomId: binding.roomId, actorPlayerId: binding.playerId, command: parsed.output,
          authorization: { isCurrent: () => socket.connected && isCurrentBinding(runtime, binding) },
          canRepresentGame: gameType => [...io.sockets.sockets.values()].every(member => {
            const current = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(member.id));
            return current?.roomId !== binding.roomId || (member.data.supportsRoomPreparation && member.data.selectedSnapshotVersion === 2 && isRoomAdmissionCompatible(gameType, socketAdmissionCapabilities(member)));
          }),
        });
        if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw, result.error, now)); return; }
        const loaded = await loadSnapshotForSocket(runtime, socket, binding.roomId, binding.playerId);
        if (!loaded || !socket.connected || !isCurrentBinding(runtime, binding)) return;
        acknowledgeIfPresent(acknowledge, snapshotSuccessAck(parsed.output.requestId, loaded.metadata, loaded.wireSnapshot));
        await fanOutRoomSnapshots(io, runtime, binding.roomId);
      })().catch(() => acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, now)));
    });
  }
}

function registerNumberRematchHandler(io: RealtimeServer, socket: RealtimeSocket, runtime: ApplicationRuntime): void {
  socket.on("number:rematch", (raw, acknowledge) => {
    const now = runtime.clock.now(), parsed = parseNumberRematch(NumberRematchCommandSchema, raw);
    if (!parsed.success) { acknowledgeIfPresent(acknowledge, failureAck(raw, { code: "INVALID_PAYLOAD", message: "Invalid rematch request.", recoverable: false }, now)); return; }
    void (async () => {
      const binding = runtime.connectionRegistry.getAuthenticatedBinding(createSocketId(socket.id));
      if (!binding) { acknowledgeIfPresent(acknowledge, failureAck(raw, UNAUTHENTICATED_ERROR, now)); return; }
      const command = parsed.output;
      const result = await runtime.numberTileRematchService.rematch({ roomId: binding.roomId, actorPlayerId: binding.playerId,
        requestId: command.requestId, gameId: command.payload.gameId, expectedRoomRevision: command.expectedRoomRevision, expectedGameRevision: command.expectedGameRevision,
        authorization: { isCurrent: () => socket.connected && isCurrentBinding(runtime, binding) } });
      if (!result.ok) { acknowledgeIfPresent(acknowledge, failureAck(raw, result.error, now)); return; }
      const loaded = await loadSnapshotForSocket(runtime, socket, binding.roomId, binding.playerId);
      if (!loaded || !socket.connected || !isCurrentBinding(runtime, binding)) return;
      await fanOutRoomSnapshots(io, runtime, binding.roomId);
      acknowledgeIfPresent(acknowledge, snapshotSuccessAck(command.requestId, loaded.metadata, loaded.wireSnapshot));
    })().catch(() => acknowledgeIfPresent(acknowledge, failureAck(raw, INTERNAL_ERROR, now)));
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
            socket,
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

      if (!result.data.roomClosed && result.gameAdvisory !== "NONE") {
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

    runtime.drawRelayHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.islandHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.splendorHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.jaipurHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.loveLetterHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.guryongtuHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.azulHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.carcassonneHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.clueHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.duetHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.saboteurHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.lostCitiesHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.halliHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.wolfHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.liarHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.spyfallHostSuccession?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
    runtime.sneakyLunchPresence?.disconnected(binding.roomId, binding.playerId, disconnectedAt);
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
  io.use((socket, next) => {
    const negotiation = negotiateSnapshotVersion(socket.handshake.auth);
    if (!negotiation.ok) {
      next(
        new Error(
          SNAPSHOT_NEGOTIATION_ERROR_MESSAGES[negotiation.reason],
        ),
      );
      return;
    }

    const gameCapability = negotiateGameTypeCapability(socket.handshake.auth);
    if (!gameCapability.ok) {
      next(new Error(GAME_TYPE_CAPABILITY_ERROR_MESSAGE));
      return;
    }

    socket.data.selectedSnapshotVersion = negotiation.selectedVersion;
    socket.data.supportedGameTypes = gameCapability.supportedGameTypes;
    socket.data.supportsRoomPreparation = isRecord(socket.handshake.auth) && socket.handshake.auth.supportsRoomPreparation === true;
    next();
  });
  const unsubscribeTimeoutApplied = runtime.subscribeTurnTimeoutApplied(
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
    runtime.subscribeGameDeadlineApplied(async (data) => {
      try {
        await fanOutRoomSnapshots(io, runtime, data.roomId);
        await emitCurrentGameAdvisory(io, runtime, data.roomId);
      } catch {
        reportSnapshotFanOutFailure();
      }
    });
  const unsubscribeNumberTileTimeoutApplied =
    runtime.subscribeNumberTileTimeoutApplied(async (data) => {
      try {
        await fanOutRoomSnapshots(io, runtime, data.roomId);
      } catch {
        reportSnapshotFanOutFailure();
      }
    });
  const unsubscribeGemCardTimeoutApplied =
    runtime.subscribeGemCardTimeoutApplied(async (data) => {
      try {
        await fanOutRoomSnapshots(io, runtime, data.roomId);
      } catch {
        reportSnapshotFanOutFailure();
      }
    });
  const unsubscribeIsland = runtime.islandService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeSplendor = runtime.splendorService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeJaipur = runtime.jaipurService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeLoveLetter = runtime.loveLetterService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeGuryongtu = runtime.guryongtuService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeAzul = runtime.azulService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeCarcassonne = runtime.carcassonneService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeClue = runtime.clueService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeDuet = runtime.duetService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeSaboteur = runtime.saboteurService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeLostCities = runtime.lostCitiesService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeHalli = runtime.halliService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeWolf = runtime.wolfService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeLiar = runtime.liarService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeSpyfall = runtime.spyfallService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeSneaky = runtime.sneakyLunchService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeDrawRelay = runtime.drawRelayService?.subscribe(roomId => fanOutRoomSnapshots(io, runtime, roomId));
  const unsubscribeCityRoleTimeoutApplied = runtime.subscribeCityRoleTimeoutApplied(async data => {
    try { await fanOutRoomSnapshots(io, runtime, data.roomId); }
    catch { reportSnapshotFanOutFailure(); }
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
    registerGemCollectHandler(io, socket, runtime);
    registerGemPurchaseHandler(io, socket, runtime);
    registerGemReserveHandler(io, socket, runtime);
    registerGemYieldHandler(io, socket, runtime);
    registerCityHandlers(io, socket, runtime);
    registerDrawRelayHandlers(socket, runtime);
    registerIslandHandlers(socket, runtime);
    registerSplendorHandlers(socket, runtime);
    registerJaipurHandlers(socket, runtime);
    registerLoveLetterHandlers(socket, runtime);
    registerGuryongtuHandlers(socket, runtime);
    registerAzulHandlers(socket, runtime);
    registerCarcassonneHandlers(socket, runtime);
    registerClueHandlers(socket, runtime);
    registerDuetHandlers(socket, runtime);
    registerSaboteurHandlers(socket, runtime);
    registerLostCitiesHandlers(socket, runtime);
    registerHalliHandlers(socket, runtime);
    registerWolfHandlers(socket, runtime);
    registerLiarHandlers(socket, runtime);
    registerSpyfallHandlers(socket, runtime);
    registerSneakyHandlers(socket, runtime);
    registerNumberSubmitHandler(io, socket, runtime);
    registerNumberDrawHandler(io, socket, runtime);
    registerNumberPassHandler(io, socket, runtime);
    registerNumberRematchHandler(io, socket, runtime);
    registerRoomPreparationHandlers(io, socket, runtime);
    registerRoomLeaveHandler(io, socket, runtime, authenticationExecutor);
    registerDisconnectHandler(io, socket, runtime);
  });

  return () => {
    unsubscribeRoomClosed();
    unsubscribeRoomPlayerRemoved();
    unsubscribeTimeoutApplied();
    unsubscribeNumberTileTimeoutApplied();
    unsubscribeGemCardTimeoutApplied();
    unsubscribeCityRoleTimeoutApplied();
    unsubscribeDrawRelay?.();
    unsubscribeIsland?.();
    unsubscribeSplendor?.();
    unsubscribeJaipur?.();
    unsubscribeLoveLetter?.();
    unsubscribeGuryongtu?.();
    unsubscribeAzul?.();
    unsubscribeCarcassonne?.();
    unsubscribeClue?.();
    unsubscribeDuet?.();
    unsubscribeSaboteur?.();
    unsubscribeLostCities?.();
    unsubscribeHalli?.();
    unsubscribeWolf?.();
    unsubscribeLiar?.();
    unsubscribeSpyfall?.();
    unsubscribeSneaky?.();
    unsubscribeGameDeadlineApplied();
  };
}
