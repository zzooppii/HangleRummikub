import type { PlayerId, RoomId, ServerTime } from "@hangul-rummikub/shared";

import type {
  BoundSessionRecord,
  SessionRecord,
  UnboundSessionRecord,
} from "../model/persistence.js";
import type { SessionVerificationData } from "./system.js";

export type SaveUnboundSessionResult =
  | { status: "SAVED"; session: UnboundSessionRecord }
  | { status: "SESSION_ALREADY_EXISTS" };

export type PromoteUnboundSessionInput = Readonly<{
  verificationData: SessionVerificationData;
  roomId: RoomId;
  playerId: PlayerId;
  now: ServerTime;
}>;

export type PromoteUnboundSessionResult =
  | { status: "PROMOTED"; session: BoundSessionRecord }
  | { status: "SESSION_NOT_FOUND" }
  | { status: "SESSION_ALREADY_BOUND" }
  | { status: "SESSION_EXPIRED" }
  | { status: "ROOM_NOT_FOUND" }
  | { status: "PLAYER_NOT_FOUND" };

export interface SessionRepository {
  findByVerificationData(
    verificationData: SessionVerificationData,
  ): Promise<SessionRecord | null>;
  saveUnbound(
    session: UnboundSessionRecord,
  ): Promise<SaveUnboundSessionResult>;
  promoteUnbound(
    input: PromoteUnboundSessionInput,
  ): Promise<PromoteUnboundSessionResult>;
  deleteByVerificationData(
    verificationData: SessionVerificationData,
  ): Promise<boolean>;
  deleteByRoomId(roomId: RoomId): Promise<number>;
}
