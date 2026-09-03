import type {
  ConnectionStatus,
  PlayerId,
  RoomId,
} from "@hangul-rummikub/shared";

import type { PlayerPresenceReader } from "../ports/player-presence-reader.js";
import type {
  PlayerPresenceLease,
  PlayerPresenceLeaseReader,
} from "../ports/player-presence-lease.js";
import type {
  LobbyDisconnectLease,
  RoomPresenceLease,
  RoomPresencePolicyReader,
} from "../ports/room-presence-policy.js";
import type { ConnectionRegistry } from "./connection-registry.js";

export class ConnectionRegistryPresenceReader
  implements
    PlayerPresenceReader,
    PlayerPresenceLeaseReader,
    RoomPresencePolicyReader
{
  constructor(private readonly connectionRegistry: ConnectionRegistry) {}

  async readRoomPresence(roomId: RoomId) {
    const connectionStatusByPlayerId = new Map<PlayerId, ConnectionStatus>();

    for (const binding of this.connectionRegistry.listActiveBindings(roomId)) {
      connectionStatusByPlayerId.set(binding.playerId, "CONNECTED");
    }

    return Object.freeze({
      presenceVersion: this.connectionRegistry.getPresenceVersion(roomId),
      connectionStatusByPlayerId,
    });
  }

  async acquirePlayerPresenceLease(
    roomId: RoomId,
    playerId: PlayerId,
  ): Promise<PlayerPresenceLease> {
    const connectionStatus = this.connectionRegistry.getConnectionStatus(
      roomId,
      playerId,
    );
    const connectionGeneration =
      this.connectionRegistry.getConnectionGeneration(roomId, playerId);

    return Object.freeze({
      connectionStatus,
      connectionGeneration,
      isCurrent: () => {
        if (
          this.connectionRegistry.getConnectionGeneration(roomId, playerId) !==
          connectionGeneration
        ) {
          return false;
        }
        return (
          this.connectionRegistry.getConnectionStatus(roomId, playerId) ===
          connectionStatus
        );
      },
    });
  }

  async acquireLobbyDisconnectLease(
    roomId: RoomId,
    playerId: PlayerId,
  ): Promise<LobbyDisconnectLease> {
    const connectionGeneration =
      this.connectionRegistry.getConnectionGeneration(roomId, playerId);
    const connectionStatus = this.connectionRegistry.getConnectionStatus(
      roomId,
      playerId,
    );
    return Object.freeze({
      connectionStatus,
      connectionGeneration,
      isCurrent: () =>
        connectionGeneration !== null &&
        connectionStatus === "OFFLINE" &&
        this.connectionRegistry.isCurrentOfflineGeneration(
          roomId,
          playerId,
          connectionGeneration,
        ),
    });
  }

  async acquireRoomPresenceLease(roomId: RoomId): Promise<RoomPresenceLease> {
    const presenceVersion = this.connectionRegistry.getPresenceVersion(roomId);
    const connectionStatusByPlayerId = new Map<
      PlayerId,
      ConnectionStatus
    >();
    for (const binding of this.connectionRegistry.listActiveBindings(roomId)) {
      connectionStatusByPlayerId.set(binding.playerId, "CONNECTED");
    }
    return Object.freeze({
      presenceVersion,
      connectionStatusByPlayerId,
      isCurrent: () =>
        this.connectionRegistry.getPresenceVersion(roomId) === presenceVersion,
    });
  }
}
