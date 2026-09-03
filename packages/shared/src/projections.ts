import * as v from "valibot";

import {
  NicknameSchema,
  PlayerIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
} from "./identifiers.js";
import {
  ProtocolVersionSchema,
  RoomPhaseSchema,
  ServerTimeSchema,
  StateVersionsSchema,
} from "./protocol.js";

export const ConnectionStatusSchema = v.picklist(["CONNECTED", "OFFLINE"]);
export type ConnectionStatus = v.InferOutput<typeof ConnectionStatusSchema>;

export const PublicPlayerViewSchema = v.strictObject({
  playerId: PlayerIdSchema,
  nickname: NicknameSchema,
  isHost: v.boolean(),
  connectionStatus: ConnectionStatusSchema,
});
export type PublicPlayerView = v.InferOutput<typeof PublicPlayerViewSchema>;

export const PublicRoomViewSchema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: RoomPhaseSchema,
  players: v.pipe(v.array(PublicPlayerViewSchema), v.maxLength(4)),
});
export type PublicRoomView = v.InferOutput<typeof PublicRoomViewSchema>;

export const PrivatePlayerViewSchema = v.strictObject({
  playerId: PlayerIdSchema,
});
export type PrivatePlayerView = v.InferOutput<typeof PrivatePlayerViewSchema>;

export const StateSnapshotSchema = v.strictObject({
  protocolVersion: ProtocolVersionSchema,
  versions: StateVersionsSchema,
  serverTime: ServerTimeSchema,
  room: PublicRoomViewSchema,
  self: PrivatePlayerViewSchema,
});
export type StateSnapshot = v.InferOutput<typeof StateSnapshotSchema>;

