import type {
  ConnectionStatus,
  PlayerId,
  PresenceVersion,
  RoomId,
} from "@hangul-rummikub/shared";

export type RoomPresenceReadModel = Readonly<{
  presenceVersion: PresenceVersion;
  connectionStatusByPlayerId: ReadonlyMap<PlayerId, ConnectionStatus>;
}>;

/** Read-only application boundary over ephemeral socket presence. */
export interface PlayerPresenceReader {
  readRoomPresence(roomId: RoomId): Promise<RoomPresenceReadModel>;
}
