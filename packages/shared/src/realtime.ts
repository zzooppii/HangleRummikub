import * as v from "valibot";

import {
  GameIdSchema,
  PlayerIdSchema,
  TurnIdSchema,
} from "./identifiers.js";
import {
  FinishedStateSnapshotSchema,
  FinishedStateVersionsSchema,
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
  SessionBootstrapCommand,
  SessionResumeCommand,
  StateSyncCommand,
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

export const GameFinishedEventPayloadSchema = v.strictObject({
  gameId: GameIdSchema,
  reason: v.literal("RACK_EMPTY"),
  winnerPlayerId: PlayerIdSchema,
  gameRevision: FinishedStateVersionsSchema.entries.gameRevision,
});
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
    (event) => event.payload.gameRevision === event.versions.gameRevision,
    "The finished event revision must match its version vector.",
  ),
);
export type GameFinishedEvent = v.InferOutput<
  typeof GameFinishedEventSchema
>;

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
}

export interface ServerToClientEvents {
  "state:snapshot": (event: StateSnapshotEvent) => void;
  "turn:started": (event: TurnStartedEvent) => void;
  "game:finished": (event: GameFinishedEvent) => void;
  "session:replaced": (event: SessionReplacedNotification) => void;
}
