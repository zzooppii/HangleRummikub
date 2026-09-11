import { SaboteurPlayingProjectionSchema, SaboteurFinishedProjectionSchema, saboteurProjectionIsConsistent } from "../games/saboteur/contracts.js";
import { ISLAND_RESOURCES } from "../games/island/actions.js";
import { SplendorPlayingProjectionSchema, SplendorFinishedProjectionSchema, splendorProjectionIsConsistent } from "../games/splendor/contracts.js";
import { JaipurPlayingProjectionSchema, JaipurFinishedProjectionSchema, jaipurProjectionIsConsistent } from "../games/jaipur/contracts.js";
import { LoveLetterPlayingProjectionSchema, LoveLetterFinishedProjectionSchema, loveLetterProjectionIsConsistent } from "../games/love-letter/contracts.js";
import { GuryongtuPlayingProjectionSchema, GuryongtuFinishedProjectionSchema, guryongtuProjectionIsConsistent } from "../games/guryongtu/contracts.js";
import { AzulPlayingProjectionSchema, AzulFinishedProjectionSchema, azulProjectionIsConsistent } from "../games/azul/contracts.js";
import { CarcassonnePlayingProjectionSchema, CarcassonneFinishedProjectionSchema, carcassonneProjectionIsConsistent } from "../games/carcassonne/contracts.js";
import { CluePlayingProjectionSchema, ClueFinishedProjectionSchema, clueProjectionIsConsistent } from "../games/clue/contracts.js";
import { DuetPlayingProjectionSchema, DuetFinishedProjectionSchema, duetProjectionIsConsistent } from "../games/word-duet/contracts.js";
import { LostCitiesSettingsSchema } from "../games/lost-cities/actions.js";
import { LostCitiesPlayingProjectionSchema, LostCitiesFinishedProjectionSchema, lostCitiesProjectionIsConsistent } from "../games/lost-cities/contracts.js";
import { IslandPlayingProjectionSchema, IslandFinishedProjectionSchema } from "../games/island/contracts.js";
import { HalliPlayingProjectionSchema, HalliFinishedProjectionSchema } from "../games/halli-galli/contracts.js";
import { CityExpansionSettingsSchema } from "../games/city-role/expansion-contracts.js";
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
  isReady: v.optional(v.boolean()),
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
  v.maxLength(10),
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

const CityLobbyPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(1), v.maxLength(10));
const CityActivePlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(2), v.maxLength(6));
const CityOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema,
  serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const CityRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("CITY_ROLE") };
export const CityRoleLobbyPlatformSnapshotV2Schema = v.pipe(v.strictObject({ ...CityOuter,
  room: v.strictObject({ ...CityRoom, settings: v.optional(CityExpansionSettingsSchema), phase: v.literal("LOBBY"), players: CityLobbyPlayers }), game: v.null(),
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

const DrawOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const DrawRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("DRAW_RELAY") };
const DrawPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema),v.minLength(3),v.maxLength(8));
const DrawRelayLobbyPlatformSnapshotV2Raw = v.pipe(v.strictObject({ ...DrawOuter,
  room: v.strictObject({ ...DrawRoom, phase:v.literal("LOBBY"), players:v.pipe(v.array(PlatformPlayerViewV2Schema),v.maxLength(10)), promptMode:v.picklist(["EASY","NORMAL","MIXED"]), drawSeconds:v.optional(DrawRelayDrawSecondsSchema,90) }), game:v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)),v.check(s => containsSelfPlayer(s)),v.check(s => hasAtMostOneHost(s)));
const DrawRelayPlayingPlatformSnapshotV2Raw = v.pipe(v.strictObject({ ...DrawOuter,
  room:v.strictObject({ ...DrawRoom,phase:v.literal("PLAYING"),players:DrawPlayers }),game:DrawRelayPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)),v.check(s => containsSelfPlayer(s)),v.check(s => hasAtMostOneHost(s)),v.check(s => hasMatchingGamePlayers(s)),
  v.check(s => !("privateState" in s.game) || s.game.privateState.submitted === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.submitted));
const DrawRelayFinishedPlatformSnapshotV2Raw = v.pipe(v.strictObject({ ...DrawOuter,
  room:v.strictObject({ ...DrawRoom,phase:v.literal("FINISHED"),players:DrawPlayers }),game:DrawRelayFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)),v.check(s => containsSelfPlayer(s)),v.check(s => hasAtMostOneHost(s)),v.check(s => hasMatchingGamePlayers(s)));
export type DrawRelayLobbyPlatformSnapshotV2 = v.InferOutput<typeof DrawRelayLobbyPlatformSnapshotV2Raw>;
export const DrawRelayLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown,DrawRelayLobbyPlatformSnapshotV2> = DrawRelayLobbyPlatformSnapshotV2Raw;
export type DrawRelayPlayingPlatformSnapshotV2 = v.InferOutput<typeof DrawRelayPlayingPlatformSnapshotV2Raw>;
export const DrawRelayPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown,DrawRelayPlayingPlatformSnapshotV2> = DrawRelayPlayingPlatformSnapshotV2Raw;
export type DrawRelayFinishedPlatformSnapshotV2 = v.InferOutput<typeof DrawRelayFinishedPlatformSnapshotV2Raw>;
export const DrawRelayFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown,DrawRelayFinishedPlatformSnapshotV2> = DrawRelayFinishedPlatformSnapshotV2Raw;

const IslandOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const IslandRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("ISLAND_SETTLERS") };
const IslandPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(3), v.maxLength(4));
const IslandLobbyRaw = v.pipe(v.strictObject({ ...IslandOuter, room: v.strictObject({ ...IslandRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)) }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const IslandPlayingRaw = v.pipe(v.strictObject({ ...IslandOuter, room: v.strictObject({ ...IslandRoom, phase: v.literal("PLAYING"), players: IslandPlayers }), game: IslandPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.cards.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.developmentCount), v.check(s => Object.values(s.game.privateState.resources).reduce((n, count) => n + count, 0) === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.resourceCount), v.check(s => ISLAND_RESOURCES.every(resource => s.game.privateState.resources[resource] === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.resources[resource])));
const IslandFinishedRaw = v.pipe(v.strictObject({ ...IslandOuter, room: v.strictObject({ ...IslandRoom, phase: v.literal("FINISHED"), players: IslandPlayers }), game: IslandFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.cards.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.developmentCount), v.check(s => Object.values(s.game.privateState.resources).reduce((n, count) => n + count, 0) === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.resourceCount), v.check(s => ISLAND_RESOURCES.every(resource => s.game.privateState.resources[resource] === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.resources[resource])));
export type IslandLobbyPlatformSnapshotV2 = v.InferOutput<typeof IslandLobbyRaw>;
export type IslandPlayingPlatformSnapshotV2 = v.InferOutput<typeof IslandPlayingRaw>;
export type IslandFinishedPlatformSnapshotV2 = v.InferOutput<typeof IslandFinishedRaw>;
export const IslandLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, IslandLobbyPlatformSnapshotV2> = IslandLobbyRaw;
export const IslandPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, IslandPlayingPlatformSnapshotV2> = IslandPlayingRaw;
export const IslandFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, IslandFinishedPlatformSnapshotV2> = IslandFinishedRaw;


import { SplendorSettingsSchema } from "../games/splendor/actions.js";
const SplendorOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const SplendorRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("SPLENDOR") };
const SplendorPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(2), v.maxLength(4));
const SplendorLobbyRaw = v.pipe(v.strictObject({ ...SplendorOuter, room: v.strictObject({ ...SplendorRoom, phase: v.literal("LOBBY"), settings: v.optional(SplendorSettingsSchema),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)) }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const SplendorPlayingRaw = v.pipe(v.strictObject({ ...SplendorOuter, room: v.strictObject({ ...SplendorRoom, phase: v.literal("PLAYING"), players: SplendorPlayers }), game: SplendorPlayingProjectionSchema }),
  v.check(s => splendorProjectionIsConsistent(s.game)),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.reserved.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.reservedCount));
const SplendorFinishedRaw = v.pipe(v.strictObject({ ...SplendorOuter, room: v.strictObject({ ...SplendorRoom, phase: v.literal("FINISHED"), players: SplendorPlayers }), game: SplendorFinishedProjectionSchema }),
  v.check(s => splendorProjectionIsConsistent(s.game)),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.reserved.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.reservedCount));
export type SplendorLobbyPlatformSnapshotV2 = v.InferOutput<typeof SplendorLobbyRaw>;
export type SplendorPlayingPlatformSnapshotV2 = v.InferOutput<typeof SplendorPlayingRaw>;
export type SplendorFinishedPlatformSnapshotV2 = v.InferOutput<typeof SplendorFinishedRaw>;
export const SplendorLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, SplendorLobbyPlatformSnapshotV2> = SplendorLobbyRaw;
export const SplendorPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, SplendorPlayingPlatformSnapshotV2> = SplendorPlayingRaw;
export const SplendorFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, SplendorFinishedPlatformSnapshotV2> = SplendorFinishedRaw;

const SaboteurOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const SaboteurRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("SABOTEUR") };
const SaboteurPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(3), v.maxLength(10));
const SaboteurLobbyRaw = v.pipe(v.strictObject({ ...SaboteurOuter, room: v.strictObject({ ...SaboteurRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)) }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const SaboteurPlayingRaw = v.pipe(v.strictObject({ ...SaboteurOuter, room: v.strictObject({ ...SaboteurRoom, phase: v.literal("PLAYING"), players: SaboteurPlayers }), game: SaboteurPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.hand.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.handCount), v.check(s => saboteurProjectionIsConsistent(s.game)));
const SaboteurFinishedRaw = v.pipe(v.strictObject({ ...SaboteurOuter, room: v.strictObject({ ...SaboteurRoom, phase: v.literal("FINISHED"), players: SaboteurPlayers }), game: SaboteurFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.hand.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.handCount), v.check(s => saboteurProjectionIsConsistent(s.game)));
export type SaboteurLobbyPlatformSnapshotV2 = v.InferOutput<typeof SaboteurLobbyRaw>;
export type SaboteurPlayingPlatformSnapshotV2 = v.InferOutput<typeof SaboteurPlayingRaw>;
export type SaboteurFinishedPlatformSnapshotV2 = v.InferOutput<typeof SaboteurFinishedRaw>;
export const SaboteurLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, SaboteurLobbyPlatformSnapshotV2> = SaboteurLobbyRaw;
export const SaboteurPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, SaboteurPlayingPlatformSnapshotV2> = SaboteurPlayingRaw;
export const SaboteurFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, SaboteurFinishedPlatformSnapshotV2> = SaboteurFinishedRaw;

const JaipurOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const JaipurRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("JAIPUR") };
const JaipurPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.length(2));
const JaipurLobbyRaw = v.pipe(v.strictObject({ ...JaipurOuter, room: v.strictObject({ ...JaipurRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)) }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const JaipurPlayingRaw = v.pipe(v.strictObject({ ...JaipurOuter, room: v.strictObject({ ...JaipurRoom, phase: v.literal("PLAYING"), players: JaipurPlayers }), game: JaipurPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.hand.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.handCount), v.check(s => jaipurProjectionIsConsistent(s.game)));
const JaipurFinishedRaw = v.pipe(v.strictObject({ ...JaipurOuter, room: v.strictObject({ ...JaipurRoom, phase: v.literal("FINISHED"), players: JaipurPlayers }), game: JaipurFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.hand.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.handCount), v.check(s => jaipurProjectionIsConsistent(s.game)));
export type JaipurLobbyPlatformSnapshotV2 = v.InferOutput<typeof JaipurLobbyRaw>;
export type JaipurPlayingPlatformSnapshotV2 = v.InferOutput<typeof JaipurPlayingRaw>;
export type JaipurFinishedPlatformSnapshotV2 = v.InferOutput<typeof JaipurFinishedRaw>;
export const JaipurLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, JaipurLobbyPlatformSnapshotV2> = JaipurLobbyRaw;
export const JaipurPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, JaipurPlayingPlatformSnapshotV2> = JaipurPlayingRaw;
export const JaipurFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, JaipurFinishedPlatformSnapshotV2> = JaipurFinishedRaw;
const LoveLetterOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const LoveLetterRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("LOVE_LETTER") };
const LoveLetterPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(2), v.maxLength(6));
const LoveLetterLobbyRaw = v.pipe(v.strictObject({ ...LoveLetterOuter, room: v.strictObject({ ...LoveLetterRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)) }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const LoveLetterPlayingRaw = v.pipe(v.strictObject({ ...LoveLetterOuter, room: v.strictObject({ ...LoveLetterRoom, phase: v.literal("PLAYING"), players: LoveLetterPlayers }), game: LoveLetterPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.hand.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.handCount), v.check(s => loveLetterProjectionIsConsistent(s.game)));
const LoveLetterFinishedRaw = v.pipe(v.strictObject({ ...LoveLetterOuter, room: v.strictObject({ ...LoveLetterRoom, phase: v.literal("FINISHED"), players: LoveLetterPlayers }), game: LoveLetterFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.hand.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.handCount), v.check(s => loveLetterProjectionIsConsistent(s.game)));
export type LoveLetterLobbyPlatformSnapshotV2 = v.InferOutput<typeof LoveLetterLobbyRaw>;
export type LoveLetterPlayingPlatformSnapshotV2 = v.InferOutput<typeof LoveLetterPlayingRaw>;
export type LoveLetterFinishedPlatformSnapshotV2 = v.InferOutput<typeof LoveLetterFinishedRaw>;
export const LoveLetterLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, LoveLetterLobbyPlatformSnapshotV2> = LoveLetterLobbyRaw;
export const LoveLetterPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, LoveLetterPlayingPlatformSnapshotV2> = LoveLetterPlayingRaw;
export const LoveLetterFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, LoveLetterFinishedPlatformSnapshotV2> = LoveLetterFinishedRaw;
const GuryongtuOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const GuryongtuRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("GURYONGTU") };
const GuryongtuPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.length(2));
const GuryongtuLobbyRaw = v.pipe(v.strictObject({ ...GuryongtuOuter, room: v.strictObject({ ...GuryongtuRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)) }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const GuryongtuPlayingRaw = v.pipe(v.strictObject({ ...GuryongtuOuter, room: v.strictObject({ ...GuryongtuRoom, phase: v.literal("PLAYING"), players: GuryongtuPlayers }), game: GuryongtuPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.hand.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.handCount), v.check(s => guryongtuProjectionIsConsistent(s.game)));
const GuryongtuFinishedRaw = v.pipe(v.strictObject({ ...GuryongtuOuter, room: v.strictObject({ ...GuryongtuRoom, phase: v.literal("FINISHED"), players: GuryongtuPlayers }), game: GuryongtuFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.hand.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.handCount), v.check(s => guryongtuProjectionIsConsistent(s.game)));
export type GuryongtuLobbyPlatformSnapshotV2 = v.InferOutput<typeof GuryongtuLobbyRaw>;
export type GuryongtuPlayingPlatformSnapshotV2 = v.InferOutput<typeof GuryongtuPlayingRaw>;
export type GuryongtuFinishedPlatformSnapshotV2 = v.InferOutput<typeof GuryongtuFinishedRaw>;
export const GuryongtuLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, GuryongtuLobbyPlatformSnapshotV2> = GuryongtuLobbyRaw;
export const GuryongtuPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, GuryongtuPlayingPlatformSnapshotV2> = GuryongtuPlayingRaw;
export const GuryongtuFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, GuryongtuFinishedPlatformSnapshotV2> = GuryongtuFinishedRaw;
const AzulOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const AzulRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("AZUL") };
const AzulPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(2), v.maxLength(4));
const AzulLobbyRaw = v.pipe(v.strictObject({ ...AzulOuter, room: v.strictObject({ ...AzulRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)) }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const AzulPlayingRaw = v.pipe(v.strictObject({ ...AzulOuter, room: v.strictObject({ ...AzulRoom, phase: v.literal("PLAYING"), players: AzulPlayers }), game: AzulPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => azulProjectionIsConsistent(s.game)));
const AzulFinishedRaw = v.pipe(v.strictObject({ ...AzulOuter, room: v.strictObject({ ...AzulRoom, phase: v.literal("FINISHED"), players: AzulPlayers }), game: AzulFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => azulProjectionIsConsistent(s.game)));
export type AzulLobbyPlatformSnapshotV2 = v.InferOutput<typeof AzulLobbyRaw>;
export type AzulPlayingPlatformSnapshotV2 = v.InferOutput<typeof AzulPlayingRaw>;
export type AzulFinishedPlatformSnapshotV2 = v.InferOutput<typeof AzulFinishedRaw>;
export const AzulLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, AzulLobbyPlatformSnapshotV2> = AzulLobbyRaw;
export const AzulPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, AzulPlayingPlatformSnapshotV2> = AzulPlayingRaw;
export const AzulFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, AzulFinishedPlatformSnapshotV2> = AzulFinishedRaw;

const CarcassonneOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const CarcassonneRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("CARCASSONNE") };
const CarcassonnePlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(2), v.maxLength(5));
const CarcassonneLobbyRaw = v.pipe(v.strictObject({ ...CarcassonneOuter, room: v.strictObject({ ...CarcassonneRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)) }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const CarcassonnePlayingRaw = v.pipe(v.strictObject({ ...CarcassonneOuter, room: v.strictObject({ ...CarcassonneRoom, phase: v.literal("PLAYING"), players: CarcassonnePlayers }), game: CarcassonnePlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => carcassonneProjectionIsConsistent(s.game)));
const CarcassonneFinishedRaw = v.pipe(v.strictObject({ ...CarcassonneOuter, room: v.strictObject({ ...CarcassonneRoom, phase: v.literal("FINISHED"), players: CarcassonnePlayers }), game: CarcassonneFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => carcassonneProjectionIsConsistent(s.game)));
export type CarcassonneLobbyPlatformSnapshotV2 = v.InferOutput<typeof CarcassonneLobbyRaw>;
export type CarcassonnePlayingPlatformSnapshotV2 = v.InferOutput<typeof CarcassonnePlayingRaw>;
export type CarcassonneFinishedPlatformSnapshotV2 = v.InferOutput<typeof CarcassonneFinishedRaw>;
export const CarcassonneLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, CarcassonneLobbyPlatformSnapshotV2> = CarcassonneLobbyRaw;
export const CarcassonnePlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, CarcassonnePlayingPlatformSnapshotV2> = CarcassonnePlayingRaw;
export const CarcassonneFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, CarcassonneFinishedPlatformSnapshotV2> = CarcassonneFinishedRaw;

const ClueOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const ClueRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("CLUE") };
const CluePlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(3), v.maxLength(6));
const ClueLobbyRaw = v.pipe(v.strictObject({ ...ClueOuter, room: v.strictObject({ ...ClueRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)) }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const CluePlayingRaw = v.pipe(v.strictObject({ ...ClueOuter, room: v.strictObject({ ...ClueRoom, phase: v.literal("PLAYING"), players: CluePlayers }), game: CluePlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => clueProjectionIsConsistent(s.game)), v.check(s => s.game.privateState.playerId === s.self.playerId));
const ClueFinishedRaw = v.pipe(v.strictObject({ ...ClueOuter, room: v.strictObject({ ...ClueRoom, phase: v.literal("FINISHED"), players: CluePlayers }), game: ClueFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => clueProjectionIsConsistent(s.game)), v.check(s => s.game.privateState.playerId === s.self.playerId));
export type ClueLobbyPlatformSnapshotV2 = v.InferOutput<typeof ClueLobbyRaw>;
export type CluePlayingPlatformSnapshotV2 = v.InferOutput<typeof CluePlayingRaw>;
export type ClueFinishedPlatformSnapshotV2 = v.InferOutput<typeof ClueFinishedRaw>;
export const ClueLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, ClueLobbyPlatformSnapshotV2> = ClueLobbyRaw;
export const CluePlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, CluePlayingPlatformSnapshotV2> = CluePlayingRaw;
export const ClueFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, ClueFinishedPlatformSnapshotV2> = ClueFinishedRaw;

const DuetOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const DuetRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("WORD_DUET") };
const DuetPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.length(2));
const DuetLobbyRaw = v.pipe(v.strictObject({ ...DuetOuter, room: v.strictObject({ ...DuetRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)) }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const DuetPlayingRaw = v.pipe(v.strictObject({ ...DuetOuter, room: v.strictObject({ ...DuetRoom, phase: v.literal("PLAYING"), players: DuetPlayers }), game: DuetPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => duetProjectionIsConsistent(s.game)));
const DuetFinishedRaw = v.pipe(v.strictObject({ ...DuetOuter, room: v.strictObject({ ...DuetRoom, phase: v.literal("FINISHED"), players: DuetPlayers }), game: DuetFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => duetProjectionIsConsistent(s.game)));
export type DuetLobbyPlatformSnapshotV2 = v.InferOutput<typeof DuetLobbyRaw>;
export type DuetPlayingPlatformSnapshotV2 = v.InferOutput<typeof DuetPlayingRaw>;
export type DuetFinishedPlatformSnapshotV2 = v.InferOutput<typeof DuetFinishedRaw>;
export const DuetLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, DuetLobbyPlatformSnapshotV2> = DuetLobbyRaw;
export const DuetPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, DuetPlayingPlatformSnapshotV2> = DuetPlayingRaw;
export const DuetFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, DuetFinishedPlatformSnapshotV2> = DuetFinishedRaw;

const LostCitiesOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const LostCitiesRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("LOST_CITIES"), settings:v.optional(LostCitiesSettingsSchema) };
const LostCitiesPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.length(2));
const LostCitiesLobbyRaw = v.pipe(v.strictObject({ ...LostCitiesOuter, room: v.strictObject({ ...LostCitiesRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)) }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const LostCitiesPlayingRaw = v.pipe(v.strictObject({ ...LostCitiesOuter, room: v.strictObject({ ...LostCitiesRoom, phase: v.literal("PLAYING"), players: LostCitiesPlayers }), game: LostCitiesPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.hand.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.handCount), v.check(s => lostCitiesProjectionIsConsistent(s.game) && (s.room.settings?.mode??"BASE")===(s.game.settings?.mode??"BASE")));
const LostCitiesFinishedRaw = v.pipe(v.strictObject({ ...LostCitiesOuter, room: v.strictObject({ ...LostCitiesRoom, phase: v.literal("FINISHED"), players: LostCitiesPlayers }), game: LostCitiesFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateState.playerId === s.self.playerId), v.check(s => s.game.privateState.hand.length === s.game.playerStates.find(p => p.playerId === s.self.playerId)?.handCount), v.check(s => lostCitiesProjectionIsConsistent(s.game) && (s.room.settings?.mode??"BASE")===(s.game.settings?.mode??"BASE")));
export type LostCitiesLobbyPlatformSnapshotV2 = v.InferOutput<typeof LostCitiesLobbyRaw>;
export type LostCitiesPlayingPlatformSnapshotV2 = v.InferOutput<typeof LostCitiesPlayingRaw>;
export type LostCitiesFinishedPlatformSnapshotV2 = v.InferOutput<typeof LostCitiesFinishedRaw>;
export const LostCitiesLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, LostCitiesLobbyPlatformSnapshotV2> = LostCitiesLobbyRaw;
export const LostCitiesPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, LostCitiesPlayingPlatformSnapshotV2> = LostCitiesPlayingRaw;
export const LostCitiesFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, LostCitiesFinishedPlatformSnapshotV2> = LostCitiesFinishedRaw;

const HalliOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const HalliRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("HALLI_GALLI") };
const HalliPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(2), v.maxLength(6));
const HalliLobbyRaw = v.pipe(v.strictObject({ ...HalliOuter, room: v.strictObject({ ...HalliRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)) }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const HalliPlayingRaw = v.pipe(v.strictObject({ ...HalliOuter, room: v.strictObject({ ...HalliRoom, phase: v.literal("PLAYING"), players: HalliPlayers }), game: HalliPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)));
const HalliFinishedRaw = v.pipe(v.strictObject({ ...HalliOuter, room: v.strictObject({ ...HalliRoom, phase: v.literal("FINISHED"), players: HalliPlayers }), game: HalliFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)));
export type HalliLobbyPlatformSnapshotV2 = v.InferOutput<typeof HalliLobbyRaw>;
export type HalliPlayingPlatformSnapshotV2 = v.InferOutput<typeof HalliPlayingRaw>;
export type HalliFinishedPlatformSnapshotV2 = v.InferOutput<typeof HalliFinishedRaw>;
export const HalliLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, HalliLobbyPlatformSnapshotV2> = HalliLobbyRaw;
export const HalliPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, HalliPlayingPlatformSnapshotV2> = HalliPlayingRaw;
export const HalliFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, HalliFinishedPlatformSnapshotV2> = HalliFinishedRaw;

const WolfOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const WolfRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("WOLF_NIGHT") };
const WolfPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(3), v.maxLength(10));
const WolfLobbyRaw = v.pipe(v.strictObject({ ...WolfOuter, room: v.strictObject({ ...WolfRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)), settings: WolfSettingsSchema }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const WolfPlayingRaw = v.pipe(v.strictObject({ ...WolfOuter, room: v.strictObject({ ...WolfRoom, phase: v.literal("PLAYING"), players: WolfPlayers }), game: WolfPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateView.playerId === s.self.playerId));
const WolfFinishedRaw = v.pipe(v.strictObject({ ...WolfOuter, room: v.strictObject({ ...WolfRoom, phase: v.literal("FINISHED"), players: WolfPlayers }), game: WolfFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)));
export type WolfLobbyPlatformSnapshotV2 = v.InferOutput<typeof WolfLobbyRaw>;
export type WolfPlayingPlatformSnapshotV2 = v.InferOutput<typeof WolfPlayingRaw>;
export type WolfFinishedPlatformSnapshotV2 = v.InferOutput<typeof WolfFinishedRaw>;
export const WolfLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, WolfLobbyPlatformSnapshotV2> = WolfLobbyRaw;
export const WolfPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, WolfPlayingPlatformSnapshotV2> = WolfPlayingRaw;
export const WolfFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, WolfFinishedPlatformSnapshotV2> = WolfFinishedRaw;

const SpyfallOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const SpyfallRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("SPYFALL") };
const SpyfallPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(3), v.maxLength(8));
const SpyfallLobbyRaw = v.pipe(v.strictObject({ ...SpyfallOuter, room: v.strictObject({ ...SpyfallRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)), settings: SpyfallSettingsSchema }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const SpyfallPlayingRaw = v.pipe(v.strictObject({ ...SpyfallOuter, room: v.strictObject({ ...SpyfallRoom, phase: v.literal("PLAYING"), players: SpyfallPlayers }), game: SpyfallPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateView.playerId === s.self.playerId));
const SpyfallFinishedRaw = v.pipe(v.strictObject({ ...SpyfallOuter, room: v.strictObject({ ...SpyfallRoom, phase: v.literal("FINISHED"), players: SpyfallPlayers }), game: SpyfallFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)));
export type SpyfallLobbyPlatformSnapshotV2 = v.InferOutput<typeof SpyfallLobbyRaw>;
export type SpyfallPlayingPlatformSnapshotV2 = v.InferOutput<typeof SpyfallPlayingRaw>;
export type SpyfallFinishedPlatformSnapshotV2 = v.InferOutput<typeof SpyfallFinishedRaw>;
export const SpyfallLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, SpyfallLobbyPlatformSnapshotV2> = SpyfallLobbyRaw;
export const SpyfallPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, SpyfallPlayingPlatformSnapshotV2> = SpyfallPlayingRaw;
export const SpyfallFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, SpyfallFinishedPlatformSnapshotV2> = SpyfallFinishedRaw;

const LiarOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const LiarRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("LIAR_GAME") };
const LiarPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(4), v.maxLength(8));
const LiarLobbyRaw = v.pipe(v.strictObject({ ...LiarOuter, room: v.strictObject({ ...LiarRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)), settings: LiarSettingsSchema }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const LiarPlayingRaw = v.pipe(v.strictObject({ ...LiarOuter, room: v.strictObject({ ...LiarRoom, phase: v.literal("PLAYING"), players: LiarPlayers }), game: LiarPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)), v.check(s => s.game.privateView.playerId === s.self.playerId));
const LiarFinishedRaw = v.pipe(v.strictObject({ ...LiarOuter, room: v.strictObject({ ...LiarRoom, phase: v.literal("FINISHED"), players: LiarPlayers }), game: LiarFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)));
export type LiarLobbyPlatformSnapshotV2 = v.InferOutput<typeof LiarLobbyRaw>;
export type LiarPlayingPlatformSnapshotV2 = v.InferOutput<typeof LiarPlayingRaw>;
export type LiarFinishedPlatformSnapshotV2 = v.InferOutput<typeof LiarFinishedRaw>;
export const LiarLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, LiarLobbyPlatformSnapshotV2> = LiarLobbyRaw;
export const LiarPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, LiarPlayingPlatformSnapshotV2> = LiarPlayingRaw;
export const LiarFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, LiarFinishedPlatformSnapshotV2> = LiarFinishedRaw;

const SneakyOuter = { snapshotVersion: PlatformSnapshotVersionSchema, versions: PlatformSnapshotVersionsV2Schema, serverTime: ServerTimeSchema, self: PlatformSelfViewV2Schema };
const SneakyRoom = { roomId: RoomIdSchema, roomCode: RoomCodeSchema, gameType: v.literal("SNEAKY_LUNCH") };
const SneakyPlayers = v.pipe(v.array(PlatformPlayerViewV2Schema), v.minLength(2), v.maxLength(8));
const SneakyLobbyRaw = v.pipe(v.strictObject({ ...SneakyOuter, room: v.strictObject({ ...SneakyRoom, phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PlatformPlayerViewV2Schema), v.maxLength(10)), settings: SneakySettingsSchema }), game: v.null() }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)));
const SneakyPlayingRaw = v.pipe(v.strictObject({ ...SneakyOuter, room: v.strictObject({ ...SneakyRoom, phase: v.literal("PLAYING"), players: SneakyPlayers }), game: SneakyPlayingProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)));
const SneakyFinishedRaw = v.pipe(v.strictObject({ ...SneakyOuter, room: v.strictObject({ ...SneakyRoom, phase: v.literal("FINISHED"), players: SneakyPlayers }), game: SneakyFinishedProjectionSchema }),
  v.check(s => hasUniqueRoomPlayers(s)), v.check(s => containsSelfPlayer(s)), v.check(s => hasAtMostOneHost(s)), v.check(s => hasMatchingGamePlayers(s)));
export type SneakyLobbyPlatformSnapshotV2 = v.InferOutput<typeof SneakyLobbyRaw>;
export type SneakyPlayingPlatformSnapshotV2 = v.InferOutput<typeof SneakyPlayingRaw>;
export type SneakyFinishedPlatformSnapshotV2 = v.InferOutput<typeof SneakyFinishedRaw>;
export const SneakyLobbyPlatformSnapshotV2Schema: v.GenericSchema<unknown, SneakyLobbyPlatformSnapshotV2> = SneakyLobbyRaw;
export const SneakyPlayingPlatformSnapshotV2Schema: v.GenericSchema<unknown, SneakyPlayingPlatformSnapshotV2> = SneakyPlayingRaw;
export const SneakyFinishedPlatformSnapshotV2Schema: v.GenericSchema<unknown, SneakyFinishedPlatformSnapshotV2> = SneakyFinishedRaw;

export const LobbyPlatformSnapshotV2Schema = v.union([
  IslandLobbyPlatformSnapshotV2Schema,
  SplendorLobbyPlatformSnapshotV2Schema,
  JaipurLobbyPlatformSnapshotV2Schema,
  LoveLetterLobbyPlatformSnapshotV2Schema,
  GuryongtuLobbyPlatformSnapshotV2Schema,
  AzulLobbyPlatformSnapshotV2Schema,
  CarcassonneLobbyPlatformSnapshotV2Schema,
  ClueLobbyPlatformSnapshotV2Schema,
  DuetLobbyPlatformSnapshotV2Schema,
  SaboteurLobbyPlatformSnapshotV2Schema,
  LostCitiesLobbyPlatformSnapshotV2Schema,
  HalliLobbyPlatformSnapshotV2Schema,
  WolfLobbyPlatformSnapshotV2Schema,
  LiarLobbyPlatformSnapshotV2Schema,
  SpyfallLobbyPlatformSnapshotV2Schema,
  SneakyLobbyPlatformSnapshotV2Schema,
  DrawRelayLobbyPlatformSnapshotV2Schema,
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
  IslandPlayingPlatformSnapshotV2Schema,
  SplendorPlayingPlatformSnapshotV2Schema,
  JaipurPlayingPlatformSnapshotV2Schema,
  LoveLetterPlayingPlatformSnapshotV2Schema,
  GuryongtuPlayingPlatformSnapshotV2Schema,
  AzulPlayingPlatformSnapshotV2Schema,
  CarcassonnePlayingPlatformSnapshotV2Schema,
  CluePlayingPlatformSnapshotV2Schema,
  DuetPlayingPlatformSnapshotV2Schema,
  SaboteurPlayingPlatformSnapshotV2Schema,
  LostCitiesPlayingPlatformSnapshotV2Schema,
  HalliPlayingPlatformSnapshotV2Schema,
  WolfPlayingPlatformSnapshotV2Schema,
  LiarPlayingPlatformSnapshotV2Schema,
  SpyfallPlayingPlatformSnapshotV2Schema,
  DrawRelayPlayingPlatformSnapshotV2Schema,
  SneakyPlayingPlatformSnapshotV2Schema,
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
  IslandFinishedPlatformSnapshotV2Schema,
  SplendorFinishedPlatformSnapshotV2Schema,
  JaipurFinishedPlatformSnapshotV2Schema,
  LoveLetterFinishedPlatformSnapshotV2Schema,
  GuryongtuFinishedPlatformSnapshotV2Schema,
  AzulFinishedPlatformSnapshotV2Schema,
  CarcassonneFinishedPlatformSnapshotV2Schema,
  ClueFinishedPlatformSnapshotV2Schema,
  DuetFinishedPlatformSnapshotV2Schema,
  SaboteurFinishedPlatformSnapshotV2Schema,
  LostCitiesFinishedPlatformSnapshotV2Schema,
  HalliFinishedPlatformSnapshotV2Schema,
  WolfFinishedPlatformSnapshotV2Schema,
  LiarFinishedPlatformSnapshotV2Schema,
  SpyfallFinishedPlatformSnapshotV2Schema,
  DrawRelayFinishedPlatformSnapshotV2Schema,
  SneakyFinishedPlatformSnapshotV2Schema,
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
import { DrawRelayPlayingProjectionSchema, DrawRelayFinishedProjectionSchema } from "../games/draw-relay/v2-projection-contracts.js";
import { DrawRelayDrawSecondsSchema } from "../games/draw-relay/settings.js";
import { SneakySettingsSchema } from "../games/sneaky-lunch/contracts.js";
import { SneakyPlayingProjectionSchema, SneakyFinishedProjectionSchema } from "../games/sneaky-lunch/v2-projection-contracts.js";

import { WolfSettingsSchema } from "../games/wolf-night/contracts.js";
import { WolfPlayingProjectionSchema, WolfFinishedProjectionSchema } from "../games/wolf-night/v2-projection-contracts.js";

import { LiarSettingsSchema } from "../games/liar-game/contracts.js";
import { SpyfallSettingsSchema } from "../games/spyfall/contracts.js";
import { LiarPlayingProjectionSchema, LiarFinishedProjectionSchema } from "../games/liar-game/v2-projection-contracts.js";
import { SpyfallPlayingProjectionSchema, SpyfallFinishedProjectionSchema } from "../games/spyfall/v2-projection-contracts.js";
