import type {
  ConnectionStatus,
  PlayerId,
  RoomId,
} from "@hangul-rummikub/shared";

import type { PlayerPresenceReader } from "../ports/player-presence-reader.js";
import type { ConnectionRegistry } from "./connection-registry.js";

export class ConnectionRegistryPresenceReader implements PlayerPresenceReader {
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
}
