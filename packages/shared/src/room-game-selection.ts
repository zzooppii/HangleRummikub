import * as v from "valibot";
import { GameIdSchema, RequestIdSchema } from "./identifiers.js";
import { GameTypeSchema } from "./game-type.js";
import { GameRevisionSchema, ProtocolVersionSchema, RoomRevisionSchema } from "./protocol.js";

const identity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, expectedRoomRevision: RoomRevisionSchema };
export const RoomSelectGameCommandSchema = v.strictObject({
  ...identity, kind: v.literal("room:selectGame"),
  expectedGameRevision: v.nullable(GameRevisionSchema),
  payload: v.strictObject({ gameType: GameTypeSchema, gameId: v.nullable(GameIdSchema) }),
});
export const RoomReadyCommandSchema = v.strictObject({
  ...identity, kind: v.literal("room:ready"), payload: v.strictObject({ ready: v.boolean() }),
});
export const RoomPreparationCommandSchema = v.union([RoomSelectGameCommandSchema, RoomReadyCommandSchema]);
export type RoomSelectGameCommand = v.InferOutput<typeof RoomSelectGameCommandSchema>;
export type RoomReadyCommand = v.InferOutput<typeof RoomReadyCommandSchema>;
export type RoomPreparationCommand = v.InferOutput<typeof RoomPreparationCommandSchema>;
