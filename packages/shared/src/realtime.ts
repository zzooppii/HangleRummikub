import * as v from "valibot";

import { StateSnapshotSchema } from "./projections.js";
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
  RoomCreateCommand,
  RoomJoinCommand,
  SessionBootstrapCommand,
  SessionResumeCommand,
  StateSyncCommand,
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
}

export interface ServerToClientEvents {
  "state:snapshot": (event: StateSnapshotEvent) => void;
  "session:replaced": (event: SessionReplacedNotification) => void;
}
