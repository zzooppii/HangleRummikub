import type {
  PlayerId,
  RoomId,
  RoomRevision,
  ServerTime,
} from "@hangul-rummikub/shared";

import type {
  IdempotencyRecord,
  RoomRecord,
  RoomWriteCandidate,
  StorageRevision,
} from "../model/persistence.js";
import type { SessionVerificationData } from "./system.js";

export type AtomicRoomUpsert =
  | Readonly<{
      kind: "CREATE";
      candidate: RoomWriteCandidate;
    }>
  | Readonly<{
      kind: "REPLACE";
      candidate: RoomWriteCandidate;
      expectedRoomRevision: RoomRevision;
      expectedStorageRevision: StorageRevision;
    }>;

export type AtomicRoomDelete = Readonly<{
  kind: "DELETE";
  roomId: RoomId;
  expectedRoomRevision: RoomRevision;
  expectedStorageRevision: StorageRevision;
}>;

export type AtomicSessionPromotion =
  | Readonly<{ kind: "NONE" }>
  | Readonly<{
      kind: "PROMOTE_UNBOUND";
      verificationData: SessionVerificationData;
      roomId: RoomId;
      playerId: PlayerId;
      now: ServerTime;
    }>;

export type AtomicSessionCleanup = Readonly<{
  kind: "DELETE_BY_ROOM";
  roomId: RoomId;
}>;

export type RoomUnitOfWorkChangeSet =
  | Readonly<{
      roomMutation: AtomicRoomUpsert;
      sessionMutation: AtomicSessionPromotion;
      idempotency: IdempotencyRecord;
    }>
  | Readonly<{
      roomMutation: AtomicRoomDelete;
      sessionMutation: AtomicSessionCleanup;
      idempotencyScopesToDelete: readonly string[];
      idempotency: IdempotencyRecord;
    }>;

export type RoomUnitOfWorkFailure =
  | "ROOM_ID_CONFLICT"
  | "ROOM_CODE_CONFLICT"
  | "ROOM_NOT_FOUND"
  | "STALE_ROOM_REVISION"
  | "STALE_STORAGE_REVISION"
  | "STORAGE_REVISION_EXHAUSTED"
  | "SESSION_NOT_FOUND"
  | "SESSION_ALREADY_BOUND"
  | "SESSION_EXPIRED"
  | "PLAYER_NOT_FOUND"
  | "SESSION_ROOM_MISMATCH"
  | "COMMIT_PRECONDITION_FAILED";

/**
 * A process-local condition that must still hold at the instant an in-memory
 * candidate becomes live. It is intentionally transport-agnostic: callers
 * may use it for ephemeral authorization without exposing socket details to
 * the application or persistence model.
 */
export type RoomUnitOfWorkCommitPrecondition = Readonly<{
  isSatisfied(): boolean;
}>;

export type RoomUnitOfWorkResult =
  | {
      status: "COMMITTED";
      room: RoomRecord | null;
      idempotency: IdempotencyRecord;
    }
  | { status: "REPLAY"; idempotency: IdempotencyRecord }
  | { status: "IDEMPOTENCY_CONFLICT"; idempotency: IdempotencyRecord }
  | { status: "PRECONDITION_FAILED"; reason: RoomUnitOfWorkFailure };

export interface RoomUnitOfWork {
  commit(
    changeSet: RoomUnitOfWorkChangeSet,
    precondition?: RoomUnitOfWorkCommitPrecondition,
  ): Promise<RoomUnitOfWorkResult>;
}
