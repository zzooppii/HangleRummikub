import * as v from "valibot";

import {
  GameIdSchema,
  PlayerIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  TurnIdSchema,
} from "./identifiers.js";
import {
  FinishedStateSnapshotSchema,
  FinishedStateVersionsSchema,
  GameFinishReasonSchema,
  PlayingStateSnapshotSchema,
  PlayingStateVersionsSchema,
  StateSnapshotSchema,
  TurnNumberSchema,
} from "./projections.js";
import {
  BootstrapSessionAckSchema,
  ErrorDtoSchema,
  ProtocolVersionSchema,
  ServerTimeSchema,
  StateVersionsSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema,
  type SessionReplacedNotification,
} from "./protocol.js";
import type {
  GameStartCommand,
  RoomCreateCommand,
  RoomJoinCommand,
  RoomLeaveCommand,
  SessionBootstrapCommand,
  SessionResumeCommand,
  StateSyncCommand,
  TurnDrawCommand,
  TurnPassCommand,
  TurnSubmitCommand,
} from "./protocol.js";

export const UncorrelatedFailureAckSchema = v.strictObject({
  scope: v.literal("UNSCOPED"),
  requestId: v.null(),
  ok: v.literal(false),
  serverTime: ServerTimeSchema,
  error: v.strictObject({
    code: v.literal("INVALID_PAYLOAD"),
    message: ErrorDtoSchema.entries.message,
    recoverable: v.literal(false),
  }),
});
export type UncorrelatedFailureAck = v.InferOutput<
  typeof UncorrelatedFailureAckSchema
>;

export const StateSnapshotDeliveryDataSchema = v.strictObject({
  snapshot: StateSnapshotSchema,
});
export type StateSnapshotDeliveryData = v.InferOutput<
  typeof StateSnapshotDeliveryDataSchema
>;

function createSnapshotCommandAckSchema() {
  return v.union([
    UncorrelatedFailureAckSchema,
    UnscopedAckFailureSchema,
    createRoomScopedAckSchema(StateSnapshotDeliveryDataSchema),
  ]);
}

export const SessionBootstrapAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  BootstrapSessionAckSchema,
]);
export type SessionBootstrapAck = v.InferOutput<
  typeof SessionBootstrapAckSchema
>;

export const RoomCreateAckSchema = createSnapshotCommandAckSchema();
export type RoomCreateAck = v.InferOutput<typeof RoomCreateAckSchema>;

export const RoomJoinAckSchema = createSnapshotCommandAckSchema();
export type RoomJoinAck = v.InferOutput<typeof RoomJoinAckSchema>;

export const RoomLeaveAckDataSchema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  roomClosed: v.boolean(),
});
export type RoomLeaveAckData = v.InferOutput<
  typeof RoomLeaveAckDataSchema
>;

export const RoomLeaveAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema(RoomLeaveAckDataSchema),
]);
export type RoomLeaveAck = v.InferOutput<typeof RoomLeaveAckSchema>;

export const SessionResumeAckSchema = createSnapshotCommandAckSchema();
export type SessionResumeAck = v.InferOutput<typeof SessionResumeAckSchema>;

export const StateSyncAckSchema = createSnapshotCommandAckSchema();
export type StateSyncAck = v.InferOutput<typeof StateSyncAckSchema>;

export const GameStartAckDataSchema = v.strictObject({
  snapshot: PlayingStateSnapshotSchema,
});
export type GameStartAckData = v.InferOutput<
  typeof GameStartAckDataSchema
>;

export const GameStartAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema(GameStartAckDataSchema),
]);
export type GameStartAck = v.InferOutput<typeof GameStartAckSchema>;

export const TurnSubmitAckDataSchema = v.strictObject({
  snapshot: v.union([
    PlayingStateSnapshotSchema,
    FinishedStateSnapshotSchema,
  ]),
});
export type TurnSubmitAckData = v.InferOutput<
  typeof TurnSubmitAckDataSchema
>;

export const TurnSubmitAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema(TurnSubmitAckDataSchema),
]);
export type TurnSubmitAck = v.InferOutput<typeof TurnSubmitAckSchema>;

export const TurnDrawAckDataSchema = v.strictObject({
  snapshot: PlayingStateSnapshotSchema,
});
export type TurnDrawAckData = v.InferOutput<typeof TurnDrawAckDataSchema>;

export const TurnDrawAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema(TurnDrawAckDataSchema),
]);
export type TurnDrawAck = v.InferOutput<typeof TurnDrawAckSchema>;

export const TurnPassAckDataSchema = v.strictObject({
  snapshot: v.union([
    PlayingStateSnapshotSchema,
    FinishedStateSnapshotSchema,
  ]),
});
export type TurnPassAckData = v.InferOutput<typeof TurnPassAckDataSchema>;

export const TurnPassAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema(TurnPassAckDataSchema),
]);
export type TurnPassAck = v.InferOutput<typeof TurnPassAckSchema>;

export const StateSnapshotEventSchema = v.strictObject({
  kind: v.literal("state:snapshot"),
  protocolVersion: ProtocolVersionSchema,
  versions: StateVersionsSchema,
  serverTime: ServerTimeSchema,
  payload: StateSnapshotDeliveryDataSchema,
});
export type StateSnapshotEvent = v.InferOutput<
  typeof StateSnapshotEventSchema
>;

export const TurnStartedEventPayloadSchema = v.strictObject({
  gameId: GameIdSchema,
  turnId: TurnIdSchema,
  turnNumber: TurnNumberSchema,
  activePlayerId: PlayerIdSchema,
  deadlineAt: ServerTimeSchema,
});
export type TurnStartedEventPayload = v.InferOutput<
  typeof TurnStartedEventPayloadSchema
>;

export const TurnStartedEventSchema = v.strictObject({
  kind: v.literal("turn:started"),
  protocolVersion: ProtocolVersionSchema,
  versions: PlayingStateVersionsSchema,
  serverTime: ServerTimeSchema,
  payload: TurnStartedEventPayloadSchema,
});
export type TurnStartedEvent = v.InferOutput<typeof TurnStartedEventSchema>;

const GameFinishedEventPayloadObjectSchema = v.strictObject({
  gameId: GameIdSchema,
  reason: GameFinishReasonSchema,
  winnerPlayerIds: v.pipe(
    v.array(PlayerIdSchema),
    v.maxLength(4),
  ),
  finalGameRevision: FinishedStateVersionsSchema.entries.gameRevision,
  finishedAt: ServerTimeSchema,
});
export const GameFinishedEventPayloadSchema = v.pipe(
  GameFinishedEventPayloadObjectSchema,
  v.check(
    (payload) =>
      new Set(payload.winnerPlayerIds).size === payload.winnerPlayerIds.length,
    "Finished event winners must not contain duplicates.",
  ),
  v.check(
    (payload) =>
      payload.reason === "ALL_PLAYERS_FORFEITED"
        ? payload.winnerPlayerIds.length === 0
        : payload.winnerPlayerIds.length > 0,
    "Only an all-players-forfeited event may omit winners.",
  ),
  v.check(
    (payload) =>
      payload.reason === "RACK_EMPTY" ||
      payload.reason === "LAST_PLAYER_STANDING"
        ? payload.winnerPlayerIds.length === 1
        : true,
    "Rack-empty and last-player-standing events require one winner.",
  ),
);
export type GameFinishedEventPayload = v.InferOutput<
  typeof GameFinishedEventPayloadSchema
>;

const GameFinishedEventObjectSchema = v.strictObject({
  kind: v.literal("game:finished"),
  protocolVersion: ProtocolVersionSchema,
  versions: FinishedStateVersionsSchema,
  serverTime: ServerTimeSchema,
  payload: GameFinishedEventPayloadSchema,
});

export const GameFinishedEventSchema = v.pipe(
  GameFinishedEventObjectSchema,
  v.check(
    (event) =>
      event.payload.finalGameRevision === event.versions.gameRevision,
    "The finished event revision must match its version vector.",
  ),
);
export type GameFinishedEvent = v.InferOutput<
  typeof GameFinishedEventSchema
>;

export const RoomClosedEventSchema = v.strictObject({
  kind: v.literal("room:closed"),
  protocolVersion: ProtocolVersionSchema,
  serverTime: ServerTimeSchema,
  payload: v.strictObject({
    roomId: RoomIdSchema,
    roomCode: RoomCodeSchema,
  }),
});
export type RoomClosedEvent = v.InferOutput<typeof RoomClosedEventSchema>;

export type SocketAcknowledgement<TAck> = (ack: TAck) => void;

export interface ClientToServerEvents {
  "session:bootstrap": (
    command: SessionBootstrapCommand,
    acknowledge: SocketAcknowledgement<SessionBootstrapAck>,
  ) => void;
  "room:create": (
    command: RoomCreateCommand,
    acknowledge: SocketAcknowledgement<RoomCreateAck>,
  ) => void;
  "room:join": (
    command: RoomJoinCommand,
    acknowledge: SocketAcknowledgement<RoomJoinAck>,
  ) => void;
  "room:leave": (
    command: RoomLeaveCommand,
    acknowledge: SocketAcknowledgement<RoomLeaveAck>,
  ) => void;
  "session:resume": (
    command: SessionResumeCommand,
    acknowledge: SocketAcknowledgement<SessionResumeAck>,
  ) => void;
  "state:sync": (
    command: StateSyncCommand,
    acknowledge: SocketAcknowledgement<StateSyncAck>,
  ) => void;
  "game:start": (
    command: GameStartCommand,
    acknowledge: SocketAcknowledgement<GameStartAck>,
  ) => void;
  "turn:submit": (
    command: TurnSubmitCommand,
    acknowledge: SocketAcknowledgement<TurnSubmitAck>,
  ) => void;
  "turn:draw": (
    command: TurnDrawCommand,
    acknowledge: SocketAcknowledgement<TurnDrawAck>,
  ) => void;
  "turn:pass": (
    command: TurnPassCommand,
    acknowledge: SocketAcknowledgement<TurnPassAck>,
  ) => void;
}

export interface ServerToClientEvents {
  "state:snapshot": (event: StateSnapshotEvent) => void;
  "turn:started": (event: TurnStartedEvent) => void;
  "game:finished": (event: GameFinishedEvent) => void;
  "room:closed": (event: RoomClosedEvent) => void;
  "session:replaced": (event: SessionReplacedNotification) => void;
}
