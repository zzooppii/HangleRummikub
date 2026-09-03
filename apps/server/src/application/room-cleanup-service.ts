import type { RoomCode, RoomId, RoomRevision } from "@hangul-rummikub/shared";

import type { StorageRevision } from "../model/persistence.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type {
  RoomCleanupUnitOfWork,
  RoomUnitOfWorkCommitPrecondition,
} from "../ports/room-unit-of-work.js";
import type { RoomMutationSerialExecutor } from "./room-session-service.js";

export type RoomCleanupReason =
  | "LOBBY_EMPTY"
  | "PLAYING_ALL_OFFLINE_RETENTION"
  | "FINISHED_RETENTION";

export type RoomCleanupInput = Readonly<{
  roomId: RoomId;
  reason: RoomCleanupReason;
  expectedRoomRevision?: RoomRevision;
  expectedStorageRevision?: StorageRevision;
  precondition?: RoomUnitOfWorkCommitPrecondition;
}>;

export type RoomCleanupResult =
  | Readonly<{
      status: "CLEANED";
      roomId: RoomId;
      roomCode: RoomCode;
      reason: RoomCleanupReason;
    }>
  | Readonly<{
      status: "NO_OP";
      reason: "ROOM_NOT_FOUND" | "STALE_ROOM" | "PRECONDITION_FAILED";
    }>
  | Readonly<{ status: "FAILED"; reason: "INTERNAL_ERROR" }>;

/** Ephemeral resources are released only after canonical cleanup commits. */
export interface RoomCleanupResources {
  /** May notify connected clients before deleting ephemeral bindings. */
  cleanupRoom(roomId: RoomId, roomCode: RoomCode): void | Promise<void>;
}

export type RoomCleanupServiceDependencies = Readonly<{
  roomRepository: RoomRepository;
  roomUnitOfWork: RoomCleanupUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  resources?: RoomCleanupResources;
}>;

export class RoomCleanupService {
  readonly #roomRepository: RoomRepository;
  readonly #roomUnitOfWork: RoomCleanupUnitOfWork;
  readonly #roomMutationExecutor: RoomMutationSerialExecutor;
  readonly #resources: RoomCleanupResources | undefined;

  constructor(dependencies: RoomCleanupServiceDependencies) {
    this.#roomRepository = dependencies.roomRepository;
    this.#roomUnitOfWork = dependencies.roomUnitOfWork;
    this.#roomMutationExecutor = dependencies.roomMutationExecutor;
    this.#resources = dependencies.resources;
  }

  async cleanup(input: RoomCleanupInput): Promise<RoomCleanupResult> {
    try {
      const result = await this.#roomMutationExecutor.run(input.roomId, async () => {
        const room = await this.#roomRepository.findById(input.roomId);
        if (room === null) {
          return { status: "NO_OP", reason: "ROOM_NOT_FOUND" } as const;
        }
        if (
          (input.expectedRoomRevision !== undefined &&
            room.roomRevision !== input.expectedRoomRevision) ||
          (input.expectedStorageRevision !== undefined &&
            room.storageRevision !== input.expectedStorageRevision)
        ) {
          return { status: "NO_OP", reason: "STALE_ROOM" } as const;
        }

        const committed = await this.#roomUnitOfWork.cleanup(
          {
            roomMutation: {
              kind: "DELETE",
              roomId: room.roomId,
              expectedRoomRevision: room.roomRevision,
              expectedStorageRevision: room.storageRevision,
            },
            sessionMutation: { kind: "DELETE_BY_ROOM", roomId: room.roomId },
          },
          input.precondition,
        );
        if (committed.status !== "COMMITTED") {
          return {
            status: "NO_OP",
            reason:
              committed.reason === "COMMIT_PRECONDITION_FAILED"
                ? "PRECONDITION_FAILED"
                : "STALE_ROOM",
          } as const;
        }
        return {
          status: "CLEANED",
          roomId: room.roomId,
          roomCode: room.roomCode,
          reason: input.reason,
        } as const;
      });

      if (result.status === "CLEANED") {
        try {
          await this.#resources?.cleanupRoom(result.roomId, result.roomCode);
        } catch {
          // Canonical cleanup is already committed. Infrastructure recovery is
          // deliberately best-effort and must not resurrect the Room.
        }
      }
      return result;
    } catch {
      return { status: "FAILED", reason: "INTERNAL_ERROR" };
    }
  }
}
