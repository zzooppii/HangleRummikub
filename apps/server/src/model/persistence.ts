import {
  BOOTSTRAP_SESSION_TTL_MS,
  ServerTimeSchema,
  type Nickname,
  type PlayerId,
  type RequestId,
  type RoomCode,
  type RoomId,
  type RoomPhase,
  type RoomRevision,
  type ServerTime,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type { GameState } from "../domain/game/game-state.js";
import type { SessionVerificationData } from "../ports/system.js";

export const StorageRevisionSchema = v.pipe(
  v.number(),
  v.integer("Storage revision must be an integer."),
  v.safeInteger("Storage revision must be a safe integer."),
  v.minValue(0, "Storage revision must not be negative."),
  v.brand("StorageRevision"),
);
export type StorageRevision = v.InferOutput<typeof StorageRevisionSchema>;

export function createStorageRevision(value: number): StorageRevision {
  return v.parse(StorageRevisionSchema, value);
}

export function incrementStorageRevision(
  revision: StorageRevision,
): StorageRevision {
  return createStorageRevision(revision + 1);
}

export type PlayerRecord = Readonly<{
  playerId: PlayerId;
  nickname: Nickname;
  joinOrder: number;
}>;

export type RoomRecord = Readonly<{
  roomId: RoomId;
  roomCode: RoomCode;
  phase: RoomPhase;
  /** A Lobby may briefly be hostless while all remaining members are offline. */
  hostPlayerId: PlayerId | null;
  players: readonly PlayerRecord[];
  game: GameState | null;
  roomRevision: RoomRevision;
  storageRevision: StorageRevision;
  createdAt: ServerTime;
  updatedAt: ServerTime;
}>;

export type RoomWriteCandidate = Omit<RoomRecord, "storageRevision">;

export type UnboundSessionRecord = Readonly<{
  state: "UNBOUND";
  verificationData: SessionVerificationData;
  issuedAt: ServerTime;
  expiresAt: ServerTime;
}>;

export type BoundSessionRecord = Readonly<{
  state: "BOUND";
  verificationData: SessionVerificationData;
  roomId: RoomId;
  playerId: PlayerId;
}>;

export type SessionRecord = UnboundSessionRecord | BoundSessionRecord;

export function createUnboundSessionRecord(
  verificationData: SessionVerificationData,
  issuedAt: ServerTime,
): UnboundSessionRecord {
  const expiresAt = v.parse(
    ServerTimeSchema,
    issuedAt + BOOTSTRAP_SESSION_TTL_MS,
  );

  return Object.freeze({
    state: "UNBOUND",
    verificationData: Object.freeze({
      algorithm: verificationData.algorithm,
      digestHex: verificationData.digestHex,
    }),
    issuedAt,
    expiresAt,
  });
}

export type JsonValue =
  | null
  | boolean
  | number
  | string
  | readonly JsonValue[]
  | Readonly<{ [key: string]: JsonValue }>;

export type IdempotencyRecord = Readonly<{
  scopeKey: string;
  requestId: RequestId;
  payloadFingerprint: string;
  terminalResult: JsonValue;
  createdAt: ServerTime;
}>;
