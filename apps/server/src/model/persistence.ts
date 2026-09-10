import type { IslandStoredGame } from "../games/island/compatibility/adapter.js";
import type { LostCitiesSettings, CityExpansionSettings } from "@hangul-rummikub/shared";
import type { SplendorStoredGame } from "../games/splendor/compatibility/adapter.js";
import type { JaipurStoredGame } from "../games/jaipur/compatibility/adapter.js";
import type { LostCitiesStoredGame } from "../games/lost-cities/compatibility/adapter.js";
import type { HalliStoredGame } from "../games/halli-galli/compatibility/adapter.js";
import type { WolfStoredGame } from "../games/wolf-night/compatibility/adapter.js";
import type { WolfSettings } from "@hangul-rummikub/shared";
import type { SneakyLunchStoredGame } from "../games/sneaky-lunch/compatibility/adapter.js";
import type { LunchSettings } from "../games/sneaky-lunch/domain/game.js";
import type { GemGameState } from "../games/gem-card/domain/game-state.js";
import type { CityRoleStoredGame } from "../games/city-role/compatibility/city-role-game-state-adapter.js";
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

import type { GameState as HangulGameState } from "../games/hangul-tile/domain/game-state.js";
import type { NumberTileGameState } from "../games/number-tile/domain/game-state.js";
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

type RoomRecordBase = Readonly<{
  /** Present after selecting the next game; all members must prepare again. */
  readyPlayerIds?: readonly PlayerId[];
  /** Explicit departures stay separate from the completed game roster. */
  departedPlayerIds?: readonly PlayerId[];
  roomId: RoomId;
  roomCode: RoomCode;
  phase: RoomPhase;
  /** A Lobby may briefly be hostless while all remaining members are offline. */
  hostPlayerId: PlayerId | null;
  players: readonly PlayerRecord[];
  roomRevision: RoomRevision;
  storageRevision: StorageRevision;
  createdAt: ServerTime;
  updatedAt: ServerTime;
}>;

export type HangulRoomRecord = RoomRecordBase &
  Readonly<{
    gameType: "HANGUL_TILE";
    game: HangulGameState | null;
  }>;

export type NumberTileRoomRecord = RoomRecordBase &
  Readonly<{
    gameType: "NUMBER_TILE";
    game: NumberTileGameState | null;
    /** Explicit leave only; result roster remains intact until rematch. */
    departedPlayerIds?: readonly PlayerId[];
  }>;

/**
 * The exact concrete game states currently supported by the server.
 * `gameType` is the discriminator so callers cannot construct a typed Room
 * whose game metadata and concrete state disagree.
 */
export type GemCardRoomRecord = RoomRecordBase & Readonly<{ gameType: "GEM_CARD"; game: GemGameState | null }>;
export type CityRoleRoomRecord = RoomRecordBase & Readonly<{ gameType: "CITY_ROLE"; settings?: CityExpansionSettings; game: CityRoleStoredGame | null }>;
export type DrawRelayRoomRecord = RoomRecordBase & Readonly<{ gameType:"DRAW_RELAY";game:DrawRelayStoredGame|null; departedPlayerIds?:readonly PlayerId[]; promptMode?:"EASY"|"NORMAL"|"MIXED"; drawSeconds?:15|30|45|60|90 }>;
export type SneakyLunchRoomRecord = RoomRecordBase & Readonly<{ gameType: "SNEAKY_LUNCH"; game: SneakyLunchStoredGame | null; departedPlayerIds?: readonly PlayerId[]; settings?: LunchSettings }>;
export type WolfRoomRecord = RoomRecordBase & Readonly<{ gameType: "WOLF_NIGHT"; game: WolfStoredGame | null; departedPlayerIds?: readonly PlayerId[]; settings?: WolfSettings }>;
export type SplendorRoomRecord = RoomRecordBase & Readonly<{ gameType: "SPLENDOR"; game: SplendorStoredGame | null; departedPlayerIds?: readonly PlayerId[] }>;
export type JaipurRoomRecord = RoomRecordBase & Readonly<{ gameType: "JAIPUR"; game: JaipurStoredGame | null; departedPlayerIds?: readonly PlayerId[] }>;
export type LostCitiesRoomRecord = RoomRecordBase & Readonly<{ gameType: "LOST_CITIES"; settings?: LostCitiesSettings; game: LostCitiesStoredGame | null; departedPlayerIds?: readonly PlayerId[] }>;
export type HalliRoomRecord = RoomRecordBase & Readonly<{ gameType: "HALLI_GALLI"; game: HalliStoredGame | null; departedPlayerIds?: readonly PlayerId[] }>;
export type IslandRoomRecord = RoomRecordBase & Readonly<{ gameType: "ISLAND_SETTLERS"; game: IslandStoredGame | null; departedPlayerIds?: readonly PlayerId[] }>;
export type RoomRecord = LostCitiesRoomRecord | JaipurRoomRecord | SplendorRoomRecord | IslandRoomRecord | HalliRoomRecord | WolfRoomRecord | HangulRoomRecord | NumberTileRoomRecord | GemCardRoomRecord | CityRoleRoomRecord | DrawRelayRoomRecord | SneakyLunchRoomRecord;

type WithoutStorageRevision<TRoom> = TRoom extends RoomRecord
  ? Omit<TRoom, "storageRevision">
  : never;

/** Preserves the `gameType`/state correlation across write candidates. */
export type RoomWriteCandidate = WithoutStorageRevision<RoomRecord>;

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
import type { DrawRelayStoredGame } from "../games/draw-relay/compatibility/adapter.js";
