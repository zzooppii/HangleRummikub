import { GemCardPlayingProjectionV2Schema, GemCardFinishedProjectionV2Schema } from "../games/gem-card/v2-projection-contracts.js";
import { CityRolePlayingProjectionV2Schema, CityRoleFinishedProjectionV2Schema, cityPrivateStateMatchesViewer } from "../games/city-role/v2-projection-contracts.js";
import * as v from "valibot";

import {
  HangulTileFinishedProjectionV2Schema,
  HangulTilePlayingProjectionV2Schema,
} from "../games/hangul-tile/v2-projection-contracts.js";
import {
  NumberTileFinishedProjectionV2Schema,
  NumberTilePlayingProjectionV2Schema,
} from "../games/number-tile/v2-projection-contracts.js";
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

const LobbyPlatformPlayersV2Schema = v.pipe(
  v.array(PlatformPlayerViewV2Schema),
  v.maxLength(4),
);

const ActivePlatformPlayersV2Schema = v.pipe(
  v.array(PlatformPlayerViewV2Schema),
  v.minLength(2),
  v.maxLength(4),
);

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

const HangulTileLobbyPlatformRoomViewV2Schema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("LOBBY"),
  gameType: v.literal("HANGUL_TILE"),
  players: LobbyPlatformPlayersV2Schema,
});

const NumberTileLobbyPlatformRoomViewV2Schema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("LOBBY"),
  gameType: v.literal("NUMBER_TILE"),
  players: LobbyPlatformPlayersV2Schema,
});

const GemCardLobbyPlatformRoomViewV2Schema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("LOBBY"),
  gameType: v.literal("GEM_CARD"),
  players: LobbyPlatformPlayersV2Schema,
});

const HangulTileLobbyPlatformSnapshotV2ObjectSchema = v.strictObject({
  snapshotVersion: PlatformSnapshotVersionSchema,
  versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema,
  room: HangulTileLobbyPlatformRoomViewV2Schema,
  self: PlatformSelfViewV2Schema,
  game: v.null(),
});

export const HangulTileLobbyPlatformSnapshotV2Schema = v.pipe(
  HangulTileLobbyPlatformSnapshotV2ObjectSchema,
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
export type HangulTileLobbyPlatformSnapshotV2 = v.InferOutput<
  typeof HangulTileLobbyPlatformSnapshotV2Schema
>;

const NumberTileLobbyPlatformSnapshotV2ObjectSchema = v.strictObject({
  snapshotVersion: PlatformSnapshotVersionSchema,
  versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema,
  room: NumberTileLobbyPlatformRoomViewV2Schema,
  self: PlatformSelfViewV2Schema,
  game: v.null(),
});

export const NumberTileLobbyPlatformSnapshotV2Schema = v.pipe(
  NumberTileLobbyPlatformSnapshotV2ObjectSchema,
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
export type NumberTileLobbyPlatformSnapshotV2 = v.InferOutput<
  typeof NumberTileLobbyPlatformSnapshotV2Schema
>;

const GemCardLobbyPlatformSnapshotV2ObjectSchema = v.strictObject({
  snapshotVersion: PlatformSnapshotVersionSchema,
  versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema,
  room: GemCardLobbyPlatformRoomViewV2Schema,
  self: PlatformSelfViewV2Schema,
  game: v.null(),
});

export const GemCardLobbyPlatformSnapshotV2Schema = v.pipe(
  GemCardLobbyPlatformSnapshotV2ObjectSchema,
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
export type GemCardLobbyPlatformSnapshotV2 = v.InferOutput<
  typeof GemCardLobbyPlatformSnapshotV2Schema
>;

const CityLobbyPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(1), v.maxLength(6));
const CityActivePlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(2), v.maxLength(6));
const CityOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const CityRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("CITY_ROLE") };
export const CityRoleLobbyPlatformSnapshotV2Schema = v.pipe(v.strictObject({ ...CityOuter,
  room: v.strictObject({ ...CityRoom, phase: v.literal("LOBBY"), players: CityLobbyPlayers }), game: v.null(),
}), v.check(snapshot => hasUniqueRoomPlayers(snapshot), "Duplicate CITY participants."), v.check(snapshot => containsSelfPlayer(snapshot), "CITY self must belong to Room."), v.check(snapshot => hasAtMostOneHost(snapshot), "CITY has at most one host."));
export type CityRoleLobbyPlatformSnapshotV2 = v.InferOutput<typeof CityRoleLobbyPlatformSnapshotV2Schema>;
export const CityRolePlayingPlatformSnapshotV2Schema = v.pipe(v.strictObject({ ...CityOuter,
  room: v.strictObject({ ...CityRoom, phase: v.literal("PLAYING"), players: CityActivePlayers }), game: CityRolePlayingProjectionV2Schema,
}), v.check(snapshot => hasUniqueRoomPlayers(snapshot), "Duplicate CITY participants."), v.check(snapshot => containsSelfPlayer(snapshot), "CITY self must belong to Room."),
v.check(snapshot => hasAtMostOneHost(snapshot), "CITY has at most one host."), v.check(snapshot => hasMatchingGamePlayers(snapshot), "CITY game roster must match Room."),
v.check(snapshot => cityPrivateStateMatchesViewer(snapshot.game, snapshot.self.playerId), "CITY private state must match viewer and current window."));
export type CityRolePlayingPlatformSnapshotV2 = v.InferOutput<typeof CityRolePlayingPlatformSnapshotV2Schema>;
export const CityRoleFinishedPlatformSnapshotV2Schema = v.pipe(v.strictObject({ ...CityOuter,
  room: v.strictObject({ ...CityRoom, phase: v.literal("FINISHED"), players: CityActivePlayers }), game: CityRoleFinishedProjectionV2Schema,
}), v.check(snapshot => hasUniqueRoomPlayers(snapshot), "Duplicate CITY participants."), v.check(snapshot => containsSelfPlayer(snapshot), "CITY self must belong to Room."),
v.check(snapshot => hasAtMostOneHost(snapshot), "CITY has at most one host."), v.check(snapshot => hasMatchingGamePlayers(snapshot), "CITY game roster must match Room."),
v.check(snapshot => cityPrivateStateMatchesViewer(snapshot.game, snapshot.self.playerId), "CITY private state must match viewer."));
export type CityRoleFinishedPlatformSnapshotV2 = v.InferOutput<typeof CityRoleFinishedPlatformSnapshotV2Schema>;

export const LobbyPlatformSnapshotV2Schema = v.union([
  HangulTileLobbyPlatformSnapshotV2Schema,
  NumberTileLobbyPlatformSnapshotV2Schema,
  GemCardLobbyPlatformSnapshotV2Schema,
  CityRoleLobbyPlatformSnapshotV2Schema,
]);
export type LobbyPlatformSnapshotV2 = v.InferOutput<
  typeof LobbyPlatformSnapshotV2Schema
>;

const HangulTilePlayingPlatformRoomViewV2Schema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("PLAYING"),
  gameType: v.literal("HANGUL_TILE"),
  players: ActivePlatformPlayersV2Schema,
});

const NumberTilePlayingPlatformRoomViewV2Schema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("PLAYING"),
  gameType: v.literal("NUMBER_TILE"),
  players: ActivePlatformPlayersV2Schema,
});

const GemCardPlayingPlatformRoomViewV2Schema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("PLAYING"),
  gameType: v.literal("GEM_CARD"),
  players: ActivePlatformPlayersV2Schema,
});

const HangulTilePlayingPlatformSnapshotV2ObjectSchema = v.strictObject({
  snapshotVersion: PlatformSnapshotVersionSchema,
  versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema,
  room: HangulTilePlayingPlatformRoomViewV2Schema,
  self: PlatformSelfViewV2Schema,
  game: HangulTilePlayingProjectionV2Schema,
});

export const HangulTilePlayingPlatformSnapshotV2Schema = v.pipe(
  HangulTilePlayingPlatformSnapshotV2ObjectSchema,
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
    (snapshot) => hasMatchingGamePlayers(snapshot),
    "Game player states must match the Room player identities.",
  ),
  v.check(
    (snapshot) => privateRackMatchesSelfCount(snapshot),
    "The private game rack must match the self player rack count.",
  ),
);
export type HangulTilePlayingPlatformSnapshotV2 = v.InferOutput<
  typeof HangulTilePlayingPlatformSnapshotV2Schema
>;

const NumberTilePlayingPlatformSnapshotV2ObjectSchema = v.strictObject({
  snapshotVersion: PlatformSnapshotVersionSchema,
  versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema,
  room: NumberTilePlayingPlatformRoomViewV2Schema,
  self: PlatformSelfViewV2Schema,
  game: NumberTilePlayingProjectionV2Schema,
});

export const NumberTilePlayingPlatformSnapshotV2Schema = v.pipe(
  NumberTilePlayingPlatformSnapshotV2ObjectSchema,
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
    (snapshot) => hasMatchingGamePlayers(snapshot),
    "Game player states must match the Room player identities.",
  ),
  v.check(
    (snapshot) => privateRackMatchesSelfCount(snapshot),
    "The private game rack must match the self player rack count.",
  ),
);
export type NumberTilePlayingPlatformSnapshotV2 = v.InferOutput<
  typeof NumberTilePlayingPlatformSnapshotV2Schema
>;

const GemCardPlayingPlatformSnapshotV2ObjectSchema = v.strictObject({
  snapshotVersion: PlatformSnapshotVersionSchema,
  versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema,
  room: GemCardPlayingPlatformRoomViewV2Schema,
  self: PlatformSelfViewV2Schema,
  game: GemCardPlayingProjectionV2Schema,
});

export const GemCardPlayingPlatformSnapshotV2Schema = v.pipe(
  GemCardPlayingPlatformSnapshotV2ObjectSchema,
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
    (snapshot) => hasMatchingGamePlayers(snapshot),
    "Game player states must match the Room player identities.",
  ),
);
export type GemCardPlayingPlatformSnapshotV2 = v.InferOutput<
  typeof GemCardPlayingPlatformSnapshotV2Schema
>;

export const PlayingPlatformSnapshotV2Schema = v.union([
  HangulTilePlayingPlatformSnapshotV2Schema,
  NumberTilePlayingPlatformSnapshotV2Schema,
  GemCardPlayingPlatformSnapshotV2Schema,
  CityRolePlayingPlatformSnapshotV2Schema,
]);
export type PlayingPlatformSnapshotV2 = v.InferOutput<
  typeof PlayingPlatformSnapshotV2Schema
>;

const HangulTileFinishedPlatformRoomViewV2Schema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("FINISHED"),
  gameType: v.literal("HANGUL_TILE"),
  players: ActivePlatformPlayersV2Schema,
});

const NumberTileFinishedPlatformRoomViewV2Schema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("FINISHED"),
  gameType: v.literal("NUMBER_TILE"),
  players: ActivePlatformPlayersV2Schema,
});

const GemCardFinishedPlatformRoomViewV2Schema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("FINISHED"),
  gameType: v.literal("GEM_CARD"),
  players: ActivePlatformPlayersV2Schema,
});

const HangulTileFinishedPlatformSnapshotV2ObjectSchema = v.strictObject({
  snapshotVersion: PlatformSnapshotVersionSchema,
  versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema,
  room: HangulTileFinishedPlatformRoomViewV2Schema,
  self: PlatformSelfViewV2Schema,
  game: HangulTileFinishedProjectionV2Schema,
});

export const HangulTileFinishedPlatformSnapshotV2Schema = v.pipe(
  HangulTileFinishedPlatformSnapshotV2ObjectSchema,
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
    (snapshot) => hasMatchingGamePlayers(snapshot),
    "Game player states must match the Room player identities.",
  ),
  v.check(
    (snapshot) => privateRackMatchesSelfCount(snapshot),
    "The private game rack must match the self player rack count.",
  ),
);
export type HangulTileFinishedPlatformSnapshotV2 = v.InferOutput<
  typeof HangulTileFinishedPlatformSnapshotV2Schema
>;

const NumberTileFinishedPlatformSnapshotV2ObjectSchema = v.strictObject({
  snapshotVersion: PlatformSnapshotVersionSchema,
  versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema,
  room: NumberTileFinishedPlatformRoomViewV2Schema,
  self: PlatformSelfViewV2Schema,
  game: NumberTileFinishedProjectionV2Schema,
});

export const NumberTileFinishedPlatformSnapshotV2Schema = v.pipe(
  NumberTileFinishedPlatformSnapshotV2ObjectSchema,
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
    (snapshot) => hasMatchingGamePlayers(snapshot),
    "Game player states must match the Room player identities.",
  ),
  v.check(
    (snapshot) => privateRackMatchesSelfCount(snapshot),
    "The private game rack must match the self player rack count.",
  ),
);
export type NumberTileFinishedPlatformSnapshotV2 = v.InferOutput<
  typeof NumberTileFinishedPlatformSnapshotV2Schema
>;

const GemCardFinishedPlatformSnapshotV2ObjectSchema = v.strictObject({
  snapshotVersion: PlatformSnapshotVersionSchema,
  versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema,
  room: GemCardFinishedPlatformRoomViewV2Schema,
  self: PlatformSelfViewV2Schema,
  game: GemCardFinishedProjectionV2Schema,
});

export const GemCardFinishedPlatformSnapshotV2Schema = v.pipe(
  GemCardFinishedPlatformSnapshotV2ObjectSchema,
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
    (snapshot) => hasMatchingGamePlayers(snapshot),
    "Game player states must match the Room player identities.",
  ),
);
export type GemCardFinishedPlatformSnapshotV2 = v.InferOutput<
  typeof GemCardFinishedPlatformSnapshotV2Schema
>;

export const FinishedPlatformSnapshotV2Schema = v.union([
  HangulTileFinishedPlatformSnapshotV2Schema,
  NumberTileFinishedPlatformSnapshotV2Schema,
  GemCardFinishedPlatformSnapshotV2Schema,
  CityRoleFinishedPlatformSnapshotV2Schema,
]);
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
