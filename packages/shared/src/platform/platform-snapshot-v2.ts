import * as v from "valibot";

import {
  HangulTileFinishedProjectionV2Schema,
  HangulTilePlayingProjectionV2Schema,
} from "../games/hangul-tile/v2-projection-contracts.js";
import {
  NicknameSchema,
  PlayerIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
} from "../identifiers.js";
import {
  PresenceVersionSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
} from "../protocol.js";
import { ConnectionStatusSchema } from "../projections.js";

export const PLATFORM_SNAPSHOT_VERSION = 2;
export const PlatformSnapshotVersionSchema = v.literal(
  PLATFORM_SNAPSHOT_VERSION,
);
export type PlatformSnapshotVersion = v.InferOutput<
  typeof PlatformSnapshotVersionSchema
>;

export const PlatformSnapshotVersionsV2Schema = v.strictObject({
  roomRevision: RoomRevisionSchema,
  presenceVersion: PresenceVersionSchema,
});
export type PlatformSnapshotVersionsV2 = v.InferOutput<
  typeof PlatformSnapshotVersionsV2Schema
>;

export const PlatformPlayerViewV2Schema = v.strictObject({
  playerId: PlayerIdSchema,
  nickname: NicknameSchema,
  isHost: v.boolean(),
  connectionStatus: ConnectionStatusSchema,
});
export type PlatformPlayerViewV2 = v.InferOutput<
  typeof PlatformPlayerViewV2Schema
>;

const PlatformSelfViewV2Schema = v.strictObject({
  playerId: PlayerIdSchema,
});

const LobbyPlatformRoomViewV2Schema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("LOBBY"),
  gameType: v.literal("HANGUL_TILE"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(4)),
});

const ActivePlatformPlayersV2Schema = v.pipe(
  v.array(PlatformPlayerViewV2Schema),
  v.minLength(2),
  v.maxLength(4),
);

const PlayingPlatformRoomViewV2Schema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("PLAYING"),
  gameType: v.literal("HANGUL_TILE"),
  players: ActivePlatformPlayersV2Schema,
});

const FinishedPlatformRoomViewV2Schema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("FINISHED"),
  gameType: v.literal("HANGUL_TILE"),
  players: ActivePlatformPlayersV2Schema,
});

function hasUniqueRoomPlayers(snapshot: {
  room: { players: readonly { playerId: string }[] };
}): boolean {
  const playerIds = snapshot.room.players.map((player) => player.playerId);
  return new Set(playerIds).size === playerIds.length;
}

function containsSelfPlayer(snapshot: {
  room: { players: readonly { playerId: string }[] };
  self: { playerId: string };
}): boolean {
  return snapshot.room.players.some(
    (player) => player.playerId === snapshot.self.playerId,
  );
}

function hasAtMostOneHost(snapshot: {
  room: { players: readonly { isHost: boolean }[] };
}): boolean {
  return snapshot.room.players.filter((player) => player.isHost).length <= 1;
}

function hasMatchingGamePlayers(snapshot: {
  room: { players: readonly { playerId: string }[] };
  game: { playerStates: readonly { playerId: string }[] };
}): boolean {
  const roomPlayerIds = new Set(
    snapshot.room.players.map((player) => player.playerId),
  );
  return (
    snapshot.game.playerStates.length === roomPlayerIds.size &&
    snapshot.game.playerStates.every((player) =>
      roomPlayerIds.has(player.playerId)
    )
  );
}

function privateRackMatchesSelfCount(snapshot: {
  self: { playerId: string };
  game: {
    playerStates: readonly { playerId: string; rackCount: number }[];
    privateState: { rack: readonly unknown[] };
  };
}): boolean {
  const selfGameState = snapshot.game.playerStates.find(
    (player) => player.playerId === snapshot.self.playerId,
  );
  return (
    selfGameState !== undefined &&
    selfGameState.rackCount === snapshot.game.privateState.rack.length
  );
}

const LobbyPlatformSnapshotV2ObjectSchema = v.strictObject({
  snapshotVersion: PlatformSnapshotVersionSchema,
  versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema,
  room: LobbyPlatformRoomViewV2Schema,
  self: PlatformSelfViewV2Schema,
  game: v.null(),
});

export const LobbyPlatformSnapshotV2Schema = v.pipe(
  LobbyPlatformSnapshotV2ObjectSchema,
  v.check(
    (snapshot) => hasUniqueRoomPlayers(snapshot),
    "Room players must not contain duplicates.",
  ),
  v.check(
    (snapshot) => containsSelfPlayer(snapshot),
    "Snapshot self Player must belong to the Room.",
  ),
  v.check(
    (snapshot) => hasAtMostOneHost(snapshot),
    "A Room may expose at most one Host.",
  ),
);
export type LobbyPlatformSnapshotV2 = v.InferOutput<
  typeof LobbyPlatformSnapshotV2Schema
>;

const PlayingPlatformSnapshotV2ObjectSchema = v.strictObject({
  snapshotVersion: PlatformSnapshotVersionSchema,
  versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema,
  room: PlayingPlatformRoomViewV2Schema,
  self: PlatformSelfViewV2Schema,
  game: HangulTilePlayingProjectionV2Schema,
});

export const PlayingPlatformSnapshotV2Schema = v.pipe(
  PlayingPlatformSnapshotV2ObjectSchema,
  v.check(
    (snapshot) => hasUniqueRoomPlayers(snapshot),
    "Room players must not contain duplicates.",
  ),
  v.check(
    (snapshot) => containsSelfPlayer(snapshot),
    "Snapshot self Player must belong to the Room.",
  ),
  v.check(
    (snapshot) => hasAtMostOneHost(snapshot),
    "A Room may expose at most one Host.",
  ),
  v.check(
    (snapshot) => snapshot.room.gameType === snapshot.game.gameType,
    "Room gameType and game projection discriminator must match.",
  ),
  v.check(
    (snapshot) => hasMatchingGamePlayers(snapshot),
    "Hangul player states must match the Room player identities.",
  ),
  v.check(
    (snapshot) => privateRackMatchesSelfCount(snapshot),
    "The private Hangul rack must match the self player rack count.",
  ),
);
export type PlayingPlatformSnapshotV2 = v.InferOutput<
  typeof PlayingPlatformSnapshotV2Schema
>;

const FinishedPlatformSnapshotV2ObjectSchema = v.strictObject({
  snapshotVersion: PlatformSnapshotVersionSchema,
  versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema,
  room: FinishedPlatformRoomViewV2Schema,
  self: PlatformSelfViewV2Schema,
  game: HangulTileFinishedProjectionV2Schema,
});

export const FinishedPlatformSnapshotV2Schema = v.pipe(
  FinishedPlatformSnapshotV2ObjectSchema,
  v.check(
    (snapshot) => hasUniqueRoomPlayers(snapshot),
    "Room players must not contain duplicates.",
  ),
  v.check(
    (snapshot) => containsSelfPlayer(snapshot),
    "Snapshot self Player must belong to the Room.",
  ),
  v.check(
    (snapshot) => hasAtMostOneHost(snapshot),
    "A Room may expose at most one Host.",
  ),
  v.check(
    (snapshot) => snapshot.room.gameType === snapshot.game.gameType,
    "Room gameType and game projection discriminator must match.",
  ),
  v.check(
    (snapshot) => hasMatchingGamePlayers(snapshot),
    "Hangul player states must match the Room player identities.",
  ),
  v.check(
    (snapshot) => privateRackMatchesSelfCount(snapshot),
    "The private Hangul rack must match the self player rack count.",
  ),
);
export type FinishedPlatformSnapshotV2 = v.InferOutput<
  typeof FinishedPlatformSnapshotV2Schema
>;

export const PlatformSnapshotV2Schema = v.union([
  LobbyPlatformSnapshotV2Schema,
  PlayingPlatformSnapshotV2Schema,
  FinishedPlatformSnapshotV2Schema,
]);
export type PlatformSnapshotV2 = v.InferOutput<
  typeof PlatformSnapshotV2Schema
>;
