import {
  PresenceVersionSchema,
  type ConnectionStatus,
  type PlayerId,
  type PresenceVersion,
  type RoomId,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

export const SocketIdSchema = v.pipe(
  v.string(),
  v.nonEmpty("Socket ID must not be empty."),
  v.brand("SocketId"),
);
export type SocketId = v.InferOutput<typeof SocketIdSchema>;

export const ConnectionGenerationSchema = v.pipe(
  v.number(),
  v.integer("Connection generation must be an integer."),
  v.safeInteger("Connection generation must be a safe integer."),
  v.minValue(1, "Connection generation must be positive."),
  v.brand("ConnectionGeneration"),
);
export type ConnectionGeneration = v.InferOutput<
  typeof ConnectionGenerationSchema
>;

export function createSocketId(value: string): SocketId {
  return v.parse(SocketIdSchema, value);
}

export type AuthenticatedSocketBinding = Readonly<{
  socketId: SocketId;
  roomId: RoomId;
  playerId: PlayerId;
  connectionGeneration: ConnectionGeneration;
}>;

export type BindPrimaryConnectionInput = Readonly<{
  socketId: SocketId;
  roomId: RoomId;
  playerId: PlayerId;
}>;

export type BindPrimaryConnectionResult = Readonly<{
  binding: AuthenticatedSocketBinding;
  replacedBinding: AuthenticatedSocketBinding | null;
  presenceChanged: boolean;
  presenceVersion: PresenceVersion;
}>;

export type DisconnectConnectionResult =
  | Readonly<{ status: "IGNORED" }>
  | Readonly<{
      status: "DISCONNECTED";
      binding: AuthenticatedSocketBinding;
      presenceVersion: PresenceVersion;
    }>;

type PlayerConnectionState = Readonly<{
  connectionGeneration: ConnectionGeneration;
  primarySocketId: SocketId | null;
}>;

function initialPresenceVersion(): PresenceVersion {
  return v.parse(PresenceVersionSchema, 0);
}

function incrementPresenceVersion(
  current: PresenceVersion,
): PresenceVersion {
  return v.parse(PresenceVersionSchema, current + 1);
}

function initialConnectionGeneration(): ConnectionGeneration {
  return v.parse(ConnectionGenerationSchema, 1);
}

function incrementConnectionGeneration(
  current: ConnectionGeneration,
): ConnectionGeneration {
  return v.parse(ConnectionGenerationSchema, current + 1);
}

function cloneBinding(
  binding: AuthenticatedSocketBinding,
): AuthenticatedSocketBinding {
  return Object.freeze({
    socketId: binding.socketId,
    roomId: binding.roomId,
    playerId: binding.playerId,
    connectionGeneration: binding.connectionGeneration,
  });
}

export class ConnectionRegistry {
  readonly #bindingsBySocket = new Map<SocketId, AuthenticatedSocketBinding>();
  readonly #playersByRoom = new Map<
    RoomId,
    Map<PlayerId, PlayerConnectionState>
  >();
  readonly #presenceVersionsByRoom = new Map<RoomId, PresenceVersion>();

  bindPrimary(
    input: BindPrimaryConnectionInput,
  ): BindPrimaryConnectionResult {
    if (this.#bindingsBySocket.has(input.socketId)) {
      throw new Error("Socket is already authenticated.");
    }

    const roomPlayers = this.#playersByRoom.get(input.roomId);
    const previousState = roomPlayers?.get(input.playerId);
    const connectionGeneration =
      previousState === undefined
        ? initialConnectionGeneration()
        : incrementConnectionGeneration(previousState.connectionGeneration);
    const previousPresenceVersion = this.getPresenceVersion(input.roomId);
    const presenceChanged = previousState?.primarySocketId == null;
    const presenceVersion = presenceChanged
      ? incrementPresenceVersion(previousPresenceVersion)
      : previousPresenceVersion;
    const binding = cloneBinding({
      socketId: input.socketId,
      roomId: input.roomId,
      playerId: input.playerId,
      connectionGeneration,
    });
    const replacedBinding =
      previousState?.primarySocketId == null
        ? null
        : this.#bindingsBySocket.get(previousState.primarySocketId) ?? null;

    if (replacedBinding !== null) {
      this.#bindingsBySocket.delete(replacedBinding.socketId);
    }

    this.#bindingsBySocket.set(binding.socketId, binding);
    const nextRoomPlayers = roomPlayers ?? new Map<PlayerId, PlayerConnectionState>();
    nextRoomPlayers.set(
      binding.playerId,
      Object.freeze({
        connectionGeneration: binding.connectionGeneration,
        primarySocketId: binding.socketId,
      }),
    );
    if (roomPlayers === undefined) {
      this.#playersByRoom.set(binding.roomId, nextRoomPlayers);
    }
    if (presenceChanged) {
      this.#presenceVersionsByRoom.set(binding.roomId, presenceVersion);
    }

    return Object.freeze({
      binding: cloneBinding(binding),
      replacedBinding:
        replacedBinding === null ? null : cloneBinding(replacedBinding),
      presenceChanged,
      presenceVersion,
    });
  }

  getAuthenticatedBinding(
    socketId: SocketId,
  ): AuthenticatedSocketBinding | null {
    const binding = this.#bindingsBySocket.get(socketId);
    if (binding === undefined) {
      return null;
    }

    const primary = this.#playersByRoom
      .get(binding.roomId)
      ?.get(binding.playerId);
    if (
      primary?.primarySocketId !== binding.socketId ||
      primary.connectionGeneration !== binding.connectionGeneration
    ) {
      return null;
    }

    return cloneBinding(binding);
  }

  getPrimaryBinding(
    roomId: RoomId,
    playerId: PlayerId,
  ): AuthenticatedSocketBinding | null {
    const socketId = this.#playersByRoom
      .get(roomId)
      ?.get(playerId)?.primarySocketId;
    return socketId == null
      ? null
      : this.getAuthenticatedBinding(socketId);
  }

  disconnect(
    socketId: SocketId,
    connectionGeneration: ConnectionGeneration,
  ): DisconnectConnectionResult {
    const binding = this.#bindingsBySocket.get(socketId);
    if (
      binding === undefined ||
      binding.connectionGeneration !== connectionGeneration
    ) {
      return Object.freeze({ status: "IGNORED" });
    }

    const roomPlayers = this.#playersByRoom.get(binding.roomId);
    if (roomPlayers === undefined) {
      return Object.freeze({ status: "IGNORED" });
    }

    const playerState = roomPlayers.get(binding.playerId);
    if (
      playerState?.primarySocketId !== binding.socketId ||
      playerState.connectionGeneration !== binding.connectionGeneration
    ) {
      return Object.freeze({ status: "IGNORED" });
    }

    const presenceVersion = incrementPresenceVersion(
      this.getPresenceVersion(binding.roomId),
    );

    this.#bindingsBySocket.delete(binding.socketId);
    roomPlayers.set(
      binding.playerId,
      Object.freeze({
        connectionGeneration: binding.connectionGeneration,
        primarySocketId: null,
      }),
    );
    this.#presenceVersionsByRoom.set(binding.roomId, presenceVersion);

    return Object.freeze({
      status: "DISCONNECTED",
      binding: cloneBinding(binding),
      presenceVersion,
    });
  }

  getConnectionStatus(
    roomId: RoomId,
    playerId: PlayerId,
  ): ConnectionStatus {
    return this.getPrimaryBinding(roomId, playerId) === null
      ? "OFFLINE"
      : "CONNECTED";
  }

  getPresenceVersion(roomId: RoomId): PresenceVersion {
    return (
      this.#presenceVersionsByRoom.get(roomId) ?? initialPresenceVersion()
    );
  }

  listActiveBindings(roomId: RoomId): readonly AuthenticatedSocketBinding[] {
    const bindings: AuthenticatedSocketBinding[] = [];
    for (const binding of this.#bindingsBySocket.values()) {
      if (binding.roomId === roomId) {
        bindings.push(cloneBinding(binding));
      }
    }
    return Object.freeze(bindings);
  }
}
