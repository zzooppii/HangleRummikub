import type {
  ConnectionStatus,
  PlayerId,
  PresenceVersion,
  RoomId,
} from "@hangul-rummikub/shared";

export type LobbyDisconnectLease = Readonly<{
  connectionStatus: ConnectionStatus;
  connectionGeneration: number | null;
  isCurrent(): boolean;
}>;

export type RoomPresenceLease = Readonly<{
  presenceVersion: PresenceVersion;
  connectionStatusByPlayerId: ReadonlyMap<PlayerId, ConnectionStatus>;
  isCurrent(): boolean;
}>;

export interface RoomPresencePolicyReader {
  acquireLobbyDisconnectLease(
    roomId: RoomId,
    playerId: PlayerId,
  ): Promise<LobbyDisconnectLease>;
  acquireRoomPresenceLease(roomId: RoomId): Promise<RoomPresenceLease>;
}
