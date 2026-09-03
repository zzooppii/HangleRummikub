import type {
  GameId,
  PlayerId,
  PresenceVersion,
  RoomId,
  ServerTime,
} from "@hangul-rummikub/shared";

export type LobbyDisconnectGraceDeadline = Readonly<{
  kind: "LOBBY_DISCONNECT_GRACE";
  roomId: RoomId;
  playerId: PlayerId;
  connectionGeneration: number;
  disconnectedAt: ServerTime;
  deadlineAt: ServerTime;
}>;

export type PlayingAllOfflineDeadline = Readonly<{
  kind: "PLAYING_ALL_OFFLINE_RETENTION";
  roomId: RoomId;
  gameId: GameId;
  presenceVersion: PresenceVersion;
  allOfflineAt: ServerTime;
  deadlineAt: ServerTime;
}>;

export type FinishedRoomRetentionDeadline = Readonly<{
  kind: "FINISHED_ROOM_RETENTION";
  roomId: RoomId;
  gameId: GameId;
  finishedAt: ServerTime;
  deadlineAt: ServerTime;
}>;

export type RoomPolicyDeadline =
  | LobbyDisconnectGraceDeadline
  | PlayingAllOfflineDeadline
  | FinishedRoomRetentionDeadline;

export interface RoomPolicyScheduler {
  schedule(deadline: RoomPolicyDeadline): Promise<void>;
  /** Cancel only an older grace generation when a resume marker is supplied. */
  cancelLobbyGrace(
    roomId: RoomId,
    playerId: PlayerId,
    resumedConnectionGeneration?: number,
  ): Promise<void>;
  /** Cancel only an older all-offline observation when a marker is supplied. */
  cancelPlayingAllOffline(
    roomId: RoomId,
    currentPresenceVersion?: PresenceVersion,
  ): Promise<void>;
  cancelRoom(roomId: RoomId): Promise<void>;
}
