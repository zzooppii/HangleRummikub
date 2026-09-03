import {
  PROTOCOL_VERSION,
  StateSnapshotSchema,
  type ConnectionStatus,
  type PlayerId,
  type PresenceVersion,
  type RoomId,
  type StateSnapshot,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type { RoomRecord } from "../model/persistence.js";
import type { Clock } from "../ports/system.js";

export type RoomPresenceReadModel = Readonly<{
  presenceVersion: PresenceVersion;
  connectionStatusByPlayerId: ReadonlyMap<PlayerId, ConnectionStatus>;
}>;

export interface RoomPresenceReadPort {
  readRoomPresence(roomId: RoomId): Promise<RoomPresenceReadModel>;
}

export type LobbyStateSnapshotProjectorDependencies = Readonly<{
  clock: Clock;
  presenceReader: RoomPresenceReadPort;
}>;

export type ProjectLobbyStateSnapshotInput = Readonly<{
  room: RoomRecord;
  selfPlayerId: PlayerId;
}>;

export class LobbyStateSnapshotProjector {
  readonly #clock: Clock;
  readonly #presenceReader: RoomPresenceReadPort;

  constructor(dependencies: LobbyStateSnapshotProjectorDependencies) {
    this.#clock = dependencies.clock;
    this.#presenceReader = dependencies.presenceReader;
  }

  async project(
    input: ProjectLobbyStateSnapshotInput,
  ): Promise<StateSnapshot> {
    if (
      !input.room.players.some(
        (player) => player.playerId === input.selfPlayerId,
      )
    ) {
      throw new Error("Snapshot self Player is not present in the Room.");
    }

    const presence = await this.#presenceReader.readRoomPresence(
      input.room.roomId,
    );
    const snapshot = {
      protocolVersion: PROTOCOL_VERSION,
      versions: {
        roomRevision: input.room.roomRevision,
        gameRevision: null,
        presenceVersion: presence.presenceVersion,
      },
      serverTime: this.#clock.now(),
      room: {
        roomId: input.room.roomId,
        roomCode: input.room.roomCode,
        phase: input.room.phase,
        players: input.room.players.map((player) => ({
          playerId: player.playerId,
          nickname: player.nickname,
          isHost: player.playerId === input.room.hostPlayerId,
          connectionStatus:
            presence.connectionStatusByPlayerId.get(player.playerId) ??
            "OFFLINE",
        })),
      },
      self: {
        playerId: input.selfPlayerId,
      },
    };

    return v.parse(StateSnapshotSchema, snapshot);
  }
}

