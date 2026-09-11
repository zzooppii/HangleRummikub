import type { SplendorClientCommand } from "./protocol.js";
import type { JaipurClientCommand } from "./protocol.js";
import type { DuetClientCommand } from "./protocol.js";
import type { SaboteurClientCommand } from "./protocol.js";
import type { LostCitiesClientCommand } from "./protocol.js";
import type { IslandClientCommand } from "./protocol.js";
import type { HalliClientCommand } from "./protocol.js";
import type { CityExpansionClientCommand } from "./protocol.js";
import { GemCardPlayingPlatformSnapshotV2Schema, GemCardFinishedPlatformSnapshotV2Schema } from "./platform/platform-snapshot-v2.js";
import type { GemCollectCommand, GemPurchaseCommand, GemReserveCommand, GemYieldCommand } from "./protocol.js";
import * as v from "valibot";
import { GameRevisionSchema } from "./protocol.js";
import type { CitySelectRoleCommand, CityTakeIncomeCommand, CityDrawBuildingCardsCommand, CityChooseBuildingCardCommand, CityUseRoleAbilityCommand, CityBuildCommand, CityEndTurnCommand } from "./protocol.js";

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
  FinishedPlatformSnapshotV2Schema,
  HangulTileFinishedPlatformSnapshotV2Schema,
  HangulTilePlayingPlatformSnapshotV2Schema,
  NumberTileFinishedPlatformSnapshotV2Schema,
  NumberTilePlayingPlatformSnapshotV2Schema,
  PlatformSnapshotV2Schema,
  PlayingPlatformSnapshotV2Schema,
} from "./platform/platform-snapshot-v2.js";
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
  NumberDrawCommand,
  NumberPassCommand,
  NumberRematchCommand,
  NumberSubmitCommand,
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

/** Additive P5B wire union. `StateSnapshot` remains the exact legacy V1 type. */
export const StateSnapshotWirePayloadSchema = v.union([
  StateSnapshotSchema,
  PlatformSnapshotV2Schema,
]);
export type StateSnapshotWirePayload = v.InferOutput<
  typeof StateSnapshotWirePayloadSchema
>;

export const PlayingSnapshotWirePayloadSchema = v.union([
  PlayingStateSnapshotSchema,
  PlayingPlatformSnapshotV2Schema,
]);
export type PlayingSnapshotWirePayload = v.InferOutput<
  typeof PlayingSnapshotWirePayloadSchema
>;

export const PlayingOrFinishedSnapshotWirePayloadSchema = v.union([
  PlayingStateSnapshotSchema,
  FinishedStateSnapshotSchema,
  PlayingPlatformSnapshotV2Schema,
  FinishedPlatformSnapshotV2Schema,
]);
export type PlayingOrFinishedSnapshotWirePayload = v.InferOutput<
  typeof PlayingOrFinishedSnapshotWirePayloadSchema
>;

export const StateSnapshotWireDeliveryDataSchema = v.strictObject({
  snapshot: StateSnapshotWirePayloadSchema,
});
export type StateSnapshotWireDeliveryData = v.InferOutput<
  typeof StateSnapshotWireDeliveryDataSchema
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

function createSnapshotWireCommandAckSchema() {
  return v.union([
    UncorrelatedFailureAckSchema,
    UnscopedAckFailureSchema,
    createRoomScopedAckSchema(StateSnapshotWireDeliveryDataSchema),
  ]);
}

/** Negotiated success-ack contracts. Legacy V1 ack schemas above stay exact. */
export const RoomCreateWireAckSchema = createSnapshotWireCommandAckSchema();
export type RoomCreateWireAck = v.InferOutput<
  typeof RoomCreateWireAckSchema
>;

export const RoomJoinWireAckSchema = createSnapshotWireCommandAckSchema();
export type RoomJoinWireAck = v.InferOutput<typeof RoomJoinWireAckSchema>;

export const SessionResumeWireAckSchema = createSnapshotWireCommandAckSchema();
export type SessionResumeWireAck = v.InferOutput<
  typeof SessionResumeWireAckSchema
>;

export const StateSyncWireAckSchema = createSnapshotWireCommandAckSchema();
export type StateSyncWireAck = v.InferOutput<typeof StateSyncWireAckSchema>;

const PlayingSnapshotWireDeliveryDataSchema = v.strictObject({
  snapshot: PlayingSnapshotWirePayloadSchema,
});
const HangulPlayingSnapshotWireDeliveryDataSchema = v.strictObject({
  snapshot: v.union([
    PlayingStateSnapshotSchema,
    HangulTilePlayingPlatformSnapshotV2Schema,
  ]),
});
const HangulPlayingOrFinishedSnapshotWireDeliveryDataSchema = v.strictObject({
  snapshot: v.union([
    PlayingStateSnapshotSchema,
    FinishedStateSnapshotSchema,
    HangulTilePlayingPlatformSnapshotV2Schema,
    HangulTileFinishedPlatformSnapshotV2Schema,
  ]),
});

export const GameStartWireAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema(PlayingSnapshotWireDeliveryDataSchema),
]);
export type GameStartWireAck = v.InferOutput<
  typeof GameStartWireAckSchema
>;

export const TurnSubmitWireAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema(
    HangulPlayingOrFinishedSnapshotWireDeliveryDataSchema,
  ),
]);
export type TurnSubmitWireAck = v.InferOutput<
  typeof TurnSubmitWireAckSchema
>;

export const TurnDrawWireAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema(HangulPlayingSnapshotWireDeliveryDataSchema),
]);
export type TurnDrawWireAck = v.InferOutput<typeof TurnDrawWireAckSchema>;

export const TurnPassWireAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema(
    HangulPlayingOrFinishedSnapshotWireDeliveryDataSchema,
  ),
]);
export type TurnPassWireAck = v.InferOutput<typeof TurnPassWireAckSchema>;

const NumberTilePlayingSnapshotDeliveryDataSchema = v.strictObject({
  snapshot: NumberTilePlayingPlatformSnapshotV2Schema,
});
const NumberTilePlayingOrFinishedSnapshotDeliveryDataSchema = v.strictObject({
  snapshot: v.union([
    NumberTilePlayingPlatformSnapshotV2Schema,
    NumberTileFinishedPlatformSnapshotV2Schema,
  ]),
});

export const NumberSubmitWireAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema(
    NumberTilePlayingOrFinishedSnapshotDeliveryDataSchema,
  ),
]);
export type NumberSubmitWireAck = v.InferOutput<
  typeof NumberSubmitWireAckSchema
>;

export const NumberDrawWireAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema(NumberTilePlayingSnapshotDeliveryDataSchema),
]);
export type NumberDrawWireAck = v.InferOutput<
  typeof NumberDrawWireAckSchema
>;

export const NumberPassWireAckSchema = v.union([
  UncorrelatedFailureAckSchema,
  UnscopedAckFailureSchema,
  createRoomScopedAckSchema(
    NumberTilePlayingOrFinishedSnapshotDeliveryDataSchema,
  ),
]);
export type NumberPassWireAck = v.InferOutput<
  typeof NumberPassWireAckSchema
>;

const GemSnapshotDeliveryDataSchema = v.strictObject({ snapshot: v.union([GemCardPlayingPlatformSnapshotV2Schema, GemCardFinishedPlatformSnapshotV2Schema]) });
export const GemCollectWireAckSchema = v.union([UncorrelatedFailureAckSchema, UnscopedAckFailureSchema, createRoomScopedAckSchema(GemSnapshotDeliveryDataSchema)]);
export type GemCollectWireAck = v.InferOutput<typeof GemCollectWireAckSchema>;
export const GemPurchaseWireAckSchema = v.union([UncorrelatedFailureAckSchema, UnscopedAckFailureSchema, createRoomScopedAckSchema(GemSnapshotDeliveryDataSchema)]);
export type GemPurchaseWireAck = v.InferOutput<typeof GemPurchaseWireAckSchema>;
export const GemReserveWireAckSchema = v.union([UncorrelatedFailureAckSchema, UnscopedAckFailureSchema, createRoomScopedAckSchema(GemSnapshotDeliveryDataSchema)]);
export type GemReserveWireAck = v.InferOutput<typeof GemReserveWireAckSchema>;
export const GemYieldWireAckSchema = v.union([UncorrelatedFailureAckSchema, UnscopedAckFailureSchema, createRoomScopedAckSchema(GemSnapshotDeliveryDataSchema)]);
export type GemYieldWireAck = v.InferOutput<typeof GemYieldWireAckSchema>;

export const CityActionAckDataSchema = v.strictObject({ gameId: GameIdSchema, committedGameRevision: GameRevisionSchema });
export type CityActionAckData = v.InferOutput<typeof CityActionAckDataSchema>;
export const CityActionWireAckSchema = v.union([UncorrelatedFailureAckSchema, UnscopedAckFailureSchema, createRoomScopedAckSchema(CityActionAckDataSchema)]);
export type CityActionWireAck = v.InferOutput<typeof CityActionWireAckSchema>;
export const CitySelectRoleWireAckSchema = CityActionWireAckSchema;
export type CitySelectRoleWireAck = CityActionWireAck;
export const CityTakeIncomeWireAckSchema = CityActionWireAckSchema;
export type CityTakeIncomeWireAck = CityActionWireAck;
export const CityDrawBuildingCardsWireAckSchema = CityActionWireAckSchema;
export type CityDrawBuildingCardsWireAck = CityActionWireAck;
export const CityChooseBuildingCardWireAckSchema = CityActionWireAckSchema;
export type CityChooseBuildingCardWireAck = CityActionWireAck;
export const CityUseRoleAbilityWireAckSchema = CityActionWireAckSchema;
export type CityUseRoleAbilityWireAck = CityActionWireAck;
export const CityBuildWireAckSchema = CityActionWireAckSchema;
export type CityBuildWireAck = CityActionWireAck;
export const CityEndTurnWireAckSchema = CityActionWireAckSchema;
export type CityEndTurnWireAck = CityActionWireAck;

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

export const StateSnapshotWireEventSchema = v.strictObject({
  kind: v.literal("state:snapshot"),
  protocolVersion: ProtocolVersionSchema,
  versions: StateVersionsSchema,
  serverTime: ServerTimeSchema,
  payload: StateSnapshotWireDeliveryDataSchema,
});
export type StateSnapshotWireEvent = v.InferOutput<
  typeof StateSnapshotWireEventSchema
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
  reason: v.union([GameFinishReasonSchema, v.literal("PLACEMENT_COMPLETE")]),
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
      payload.reason === "PLACEMENT_COMPLETE" ||
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

/**
 * Runtime event maps used by the P5B server and Web. The legacy maps above
 * remain available to compile old V1-only clients without changing their API.
 */
export interface SnapshotWireClientToServerEvents {
  "room:selectGame": (command: import("./room-game-selection.js").RoomSelectGameCommand, ack: SocketAcknowledgement<StateSyncWireAck>) => void;
  "room:ready": (command: import("./room-game-selection.js").RoomReadyCommand, ack: SocketAcknowledgement<StateSyncWireAck>) => void;
  "city:configure": (command: Extract<CityExpansionClientCommand, { kind: "city:configure" }>, ack: (result: StateSyncWireAck) => void) => void;
  "city:expansionAction": (command: Extract<CityExpansionClientCommand, { kind: "city:expansionAction" }>, ack: (result: StateSyncWireAck) => void) => void;

  "draw:draftSave": (command: Extract<DrawClientCommand,{kind:"draw:draftSave"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "draw:submitDrawing": (command: Extract<DrawClientCommand,{kind:"draw:submitDrawing"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "draw:submitGuess": (command: Extract<DrawClientCommand,{kind:"draw:submitGuess"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "draw:revealNext": (command: Extract<DrawClientCommand,{kind:"draw:revealNext"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "draw:rematch": (command: Extract<DrawClientCommand,{kind:"draw:rematch"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "draw:configure": (command: Extract<DrawClientCommand,{kind:"draw:configure"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "island:act": (command: Extract<IslandClientCommand,{kind:"island:act"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "island:rematch": (command: Extract<IslandClientCommand,{kind:"island:rematch"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "splendor:act": (command: Extract<SplendorClientCommand,{kind:"splendor:act"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "jaipur:act": (command: Extract<JaipurClientCommand,{kind:"jaipur:act"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "duet:act": (command: Extract<DuetClientCommand,{kind:"duet:act"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "saboteur:act": (command: Extract<SaboteurClientCommand,{kind:"saboteur:act"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "lostCities:configure": (command: Extract<LostCitiesClientCommand,{kind:"lostCities:configure"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "lostCities:act": (command: Extract<LostCitiesClientCommand,{kind:"lostCities:act"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "splendor:rematch": (command: Extract<SplendorClientCommand,{kind:"splendor:rematch"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "jaipur:nextRound": (command: Extract<JaipurClientCommand,{kind:"jaipur:nextRound"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "saboteur:say": (command: Extract<SaboteurClientCommand,{kind:"saboteur:say"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "saboteur:nextRound": (command: Extract<SaboteurClientCommand,{kind:"saboteur:nextRound"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "lostCities:nextRound": (command: Extract<LostCitiesClientCommand,{kind:"lostCities:nextRound"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "halli:flip": (command: Extract<HalliClientCommand,{kind:"halli:flip"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "halli:bell": (command: Extract<HalliClientCommand,{kind:"halli:bell"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "halli:rematch": (command: Extract<HalliClientCommand,{kind:"halli:rematch"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "liar:configure": (command: Extract<LiarClientCommand,{kind:"liar:configure"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "liar:clue": (command: Extract<LiarClientCommand,{kind:"liar:clue"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "liar:vote": (command: Extract<LiarClientCommand,{kind:"liar:vote"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "liar:say": (command: Extract<LiarClientCommand,{kind:"liar:say"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "liar:guess": (command: Extract<LiarClientCommand,{kind:"liar:guess"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "wolf:configure": (command: Extract<WolfClientCommand,{kind:"wolf:configure"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "wolf:act": (command: Extract<WolfClientCommand,{kind:"wolf:act"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "wolf:vote": (command: Extract<WolfClientCommand,{kind:"wolf:vote"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "wolf:say": (command: Extract<WolfClientCommand,{kind:"wolf:say"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "wolf:rematch": (command: Extract<WolfClientCommand,{kind:"wolf:rematch"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "sneaky:configure": (command: Extract<SneakyClientCommand,{kind:"sneaky:configure"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "sneaky:eat": (command: Extract<SneakyClientCommand,{kind:"sneaky:eat"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "sneaky:rematch": (command: Extract<SneakyClientCommand,{kind:"sneaky:rematch"}>, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
  "city:selectRole": (command: CitySelectRoleCommand, acknowledge: SocketAcknowledgement<CitySelectRoleWireAck>) => void;
  "city:takeIncome": (command: CityTakeIncomeCommand, acknowledge: SocketAcknowledgement<CityTakeIncomeWireAck>) => void;
  "city:drawBuildingCards": (command: CityDrawBuildingCardsCommand, acknowledge: SocketAcknowledgement<CityDrawBuildingCardsWireAck>) => void;
  "city:chooseBuildingCard": (command: CityChooseBuildingCardCommand, acknowledge: SocketAcknowledgement<CityChooseBuildingCardWireAck>) => void;
  "city:useRoleAbility": (command: CityUseRoleAbilityCommand, acknowledge: SocketAcknowledgement<CityUseRoleAbilityWireAck>) => void;
  "city:build": (command: CityBuildCommand, acknowledge: SocketAcknowledgement<CityBuildWireAck>) => void;
  "city:endTurn": (command: CityEndTurnCommand, acknowledge: SocketAcknowledgement<CityEndTurnWireAck>) => void;
  "session:bootstrap": (
    command: SessionBootstrapCommand,
    acknowledge: SocketAcknowledgement<SessionBootstrapAck>,
  ) => void;
  "room:create": (
    command: RoomCreateCommand,
    acknowledge: SocketAcknowledgement<RoomCreateWireAck>,
  ) => void;
  "room:join": (
    command: RoomJoinCommand,
    acknowledge: SocketAcknowledgement<RoomJoinWireAck>,
  ) => void;
  "room:leave": (
    command: RoomLeaveCommand,
    acknowledge: SocketAcknowledgement<RoomLeaveAck>,
  ) => void;
  "session:resume": (
    command: SessionResumeCommand,
    acknowledge: SocketAcknowledgement<SessionResumeWireAck>,
  ) => void;
  "state:sync": (
    command: StateSyncCommand,
    acknowledge: SocketAcknowledgement<StateSyncWireAck>,
  ) => void;
  "game:start": (
    command: GameStartCommand,
    acknowledge: SocketAcknowledgement<GameStartWireAck>,
  ) => void;
  "turn:submit": (
    command: TurnSubmitCommand,
    acknowledge: SocketAcknowledgement<TurnSubmitWireAck>,
  ) => void;
  "turn:draw": (
    command: TurnDrawCommand,
    acknowledge: SocketAcknowledgement<TurnDrawWireAck>,
  ) => void;
  "turn:pass": (
    command: TurnPassCommand,
    acknowledge: SocketAcknowledgement<TurnPassWireAck>,
  ) => void;
  "gem:collect": (command: GemCollectCommand, acknowledge: SocketAcknowledgement<GemCollectWireAck>) => void;
  "gem:purchase": (command: GemPurchaseCommand, acknowledge: SocketAcknowledgement<GemPurchaseWireAck>) => void;
  "gem:reserve": (command: GemReserveCommand, acknowledge: SocketAcknowledgement<GemReserveWireAck>) => void;
  "gem:yield": (command: GemYieldCommand, acknowledge: SocketAcknowledgement<GemYieldWireAck>) => void;
  "number:submit": (
    command: NumberSubmitCommand,
    acknowledge: SocketAcknowledgement<NumberSubmitWireAck>,
  ) => void;
  "number:draw": (
    command: NumberDrawCommand,
    acknowledge: SocketAcknowledgement<NumberDrawWireAck>,
  ) => void;
  "number:pass": (
    command: NumberPassCommand,
    acknowledge: SocketAcknowledgement<NumberPassWireAck>,
  ) => void;
  "number:rematch": (command: NumberRematchCommand, acknowledge: SocketAcknowledgement<StateSyncWireAck>) => void;
}

export type SnapshotWireServerToClientEvents = Omit<
  ServerToClientEvents,
  "state:snapshot"
> & {
  "state:snapshot": (event: StateSnapshotWireEvent) => void;
};
import type { DrawClientCommand } from "./protocol.js";
import type { SneakyClientCommand } from "./protocol.js";

import type { WolfClientCommand } from "./protocol.js";

import type { LiarClientCommand } from "./protocol.js";
