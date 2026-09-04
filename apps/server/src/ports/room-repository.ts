import type {
  RoomCode,
  RoomId,
  RoomRevision,
} from "@hangul-rummikub/shared";

import type {
  RoomRecord,
  RoomWriteCandidate,
  StorageRevision,
} from "../model/persistence.js";

export type CreateRoomResult =
  | { status: "CREATED"; room: RoomRecord }
  | { status: "ROOM_ID_CONFLICT" }
  | { status: "ROOM_CODE_CONFLICT" };

export type ReplaceRoomInput = Readonly<{
  candidate: RoomWriteCandidate;
  expectedRoomRevision: RoomRevision;
  expectedStorageRevision: StorageRevision;
}>;

export type ReplaceRoomResult =
  | { status: "REPLACED"; room: RoomRecord }
  | { status: "ROOM_NOT_FOUND" }
  | { status: "ROOM_CODE_CONFLICT" }
  | { status: "GAME_TYPE_MISMATCH" }
  | { status: "STALE_ROOM_REVISION" }
  | { status: "STALE_STORAGE_REVISION" }
  | { status: "STORAGE_REVISION_EXHAUSTED" };

export type DeleteRoomInput = Readonly<{
  roomId: RoomId;
  expectedRoomRevision: RoomRevision;
  expectedStorageRevision: StorageRevision;
}>;

export type DeleteRoomResult =
  | { status: "DELETED" }
  | { status: "ROOM_NOT_FOUND" }
  | { status: "STALE_ROOM_REVISION" }
  | { status: "STALE_STORAGE_REVISION" };

export interface RoomRepository {
  findById(roomId: RoomId): Promise<RoomRecord | null>;
  findByCode(roomCode: RoomCode): Promise<RoomRecord | null>;
  createIfAbsent(candidate: RoomWriteCandidate): Promise<CreateRoomResult>;
  replace(input: ReplaceRoomInput): Promise<ReplaceRoomResult>;
  delete(input: DeleteRoomInput): Promise<DeleteRoomResult>;
}
