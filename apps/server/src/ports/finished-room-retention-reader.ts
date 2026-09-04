import type {
  GameId,
  RoomId,
  ServerTime,
} from "@hangul-rummikub/shared";

/** Detached canonical identity used to recover missing FINISHED retention work. */
export type FinishedRoomRetentionIdentity = Readonly<{
  roomId: RoomId;
  gameId: GameId;
  finishedAt: ServerTime;
}>;

export interface FinishedRoomRetentionReader {
  listFinishedRoomRetentions(): Promise<
    readonly FinishedRoomRetentionIdentity[]
  >;
}
