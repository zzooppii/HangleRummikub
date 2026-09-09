import { GemCollectSelectionSchema, GemPurchaseSourceSchema, GemMarketSourceSchema } from "./games/gem-card/contracts.js";
import * as v from "valibot";

import {
  NicknameSchema,
  PlayerIdSchema,
  RequestIdSchema,
  RoomCodeSchema,
  SessionTokenSchema,
  TurnIdSchema,
  type RequestId,
  type TurnId,
} from "./identifiers.js";
import { GameTypeSchema } from "./game-type.js";
import {
  ProposedBoardSchema,
  TurnDrawBagKindSchema,
} from "./games/hangul-tile/turn-command-contracts.js";
import { NumberTileProposedTableSchema } from "./games/number-tile/turn-command-contracts.js";
import { CityActionIdSchema, CityBuildingCardIdSchema, CityRoleAbilityPayloadSchema, CityRoleIdSchema } from "./games/city-role/contracts.js";
import { GameIdSchema } from "./identifiers.js";

export {
  PROPOSED_ASSIGNED_SYMBOL_MAX_LENGTH,
  PROPOSED_BOARD_MAX_TILE_REFERENCES,
  PROPOSED_BOARD_MAX_WORD_GROUPS,
  PROPOSED_WORD_GROUP_ID_MAX_LENGTH,
  PROPOSED_WORD_GROUP_MAX_SYLLABLES,
  ProposedBoardSchema,
  ProposedBoardSyllableSchema,
  ProposedBoardTilePlacementSchema,
  ProposedWordGroupSchema,
  TurnDrawBagKindSchema,
  type ProposedBoard,
  type ProposedBoardSyllable,
  type ProposedBoardTilePlacement,
  type ProposedWordGroup,
  type TurnDrawBagKind,
} from "./games/hangul-tile/turn-command-contracts.js";

export {
  NUMBER_PROPOSED_MELD_MAX_TILE_REFERENCES,
  NUMBER_PROPOSED_TABLE_MAX_MELDS,
  NUMBER_PROPOSED_TABLE_MAX_TILE_REFERENCES,
  NUMBER_TILE_COLORS,
  NUMBER_TILE_NUMBERS,
  NumberTileColorSchema,
  NumberTileJokerProposedPlacementSchema,
  NumberTileNumberSchema,
  NumberTileOrdinaryProposedPlacementSchema,
  NumberTileProposedGroupSchema,
  NumberTileProposedMeldSchema,
  NumberTileProposedPlacementSchema,
  NumberTileProposedRunSchema,
  NumberTileProposedTableSchema,
  type NumberTileColor,
  type NumberTileJokerProposedPlacement,
  type NumberTileNumber,
  type NumberTileOrdinaryProposedPlacement,
  type NumberTileProposedGroup,
  type NumberTileProposedMeld,
  type NumberTileProposedPlacement,
  type NumberTileProposedRun,
  type NumberTileProposedTable,
} from "./games/number-tile/turn-command-contracts.js";

export const PROTOCOL_VERSION = 1;
export const ProtocolVersionSchema = v.literal(PROTOCOL_VERSION);
export type ProtocolVersion = v.InferOutput<typeof ProtocolVersionSchema>;

export const RevisionSchema = v.pipe(
  v.number(),
  v.integer("Revision must be an integer."),
  v.safeInteger("Revision must be a safe integer."),
  v.minValue(0, "Revision must not be negative."),
);

export const RoomRevisionSchema = v.pipe(
  RevisionSchema,
  v.brand("RoomRevision"),
);
export type RoomRevision = v.InferOutput<typeof RoomRevisionSchema>;

export const GameRevisionSchema = v.pipe(
  RevisionSchema,
  v.brand("GameRevision"),
);
export type GameRevision = v.InferOutput<typeof GameRevisionSchema>;

export const PresenceVersionSchema = v.pipe(
  RevisionSchema,
  v.brand("PresenceVersion"),
);
export type PresenceVersion = v.InferOutput<typeof PresenceVersionSchema>;

export const StateVersionsSchema = v.strictObject({
  roomRevision: RoomRevisionSchema,
  gameRevision: v.nullable(GameRevisionSchema),
  presenceVersion: PresenceVersionSchema,
});
export type StateVersions = v.InferOutput<typeof StateVersionsSchema>;

export const ServerTimeSchema = v.pipe(
  v.number(),
  v.integer("Server time must be an integer."),
  v.safeInteger("Server time must be a safe integer."),
  v.minValue(0, "Server time must not be negative."),
  v.brand("ServerTime"),
);
export type ServerTime = v.InferOutput<typeof ServerTimeSchema>;

export const RoomPhaseSchema = v.picklist(["LOBBY", "PLAYING", "FINISHED"]);
export type RoomPhase = v.InferOutput<typeof RoomPhaseSchema>;

export const PROTOCOL_ERROR_CODES = [
  "INVALID_PAYLOAD",
  "INCOMPATIBLE_PROTOCOL",
  "INCOMPATIBLE_GAME_CAPABILITY",
  "UNAUTHENTICATED",
  "SESSION_NOT_FOUND",
  "ROOM_NOT_FOUND",
  "ROOM_FULL",
  "ROOM_NOT_JOINABLE",
  "HOST_ONLY",
  "INVALID_PHASE",
  "NOT_ENOUGH_PLAYERS",
  "PLAYERS_NOT_CONNECTED",
  "NOT_YOUR_TURN",
  "TURN_EXPIRED",
  "GAME_EXPIRED",
  "BAG_EMPTY",
  "POOL_EMPTY",
  "PASS_NOT_ALLOWED",
  "STALE_ROOM_REVISION",
  "STALE_GAME_REVISION",
  "REQUEST_ID_REUSED",
  "NICKNAME_INVALID",
  "NICKNAME_TAKEN",
  "ROOM_CODE_INVALID",
  "ROOM_CODE_EXHAUSTED",
  "INVALID_TILE_ACCESS",
  "INVALID_BOARD",
  "INVALID_TABLE",
  "INVALID_MELD",
  "INVALID_HANGUL_COMPOSITION",
  "INITIAL_MELD_REQUIRED",
  "INITIAL_MELD_TOO_LOW",
  "TABLE_REARRANGEMENT_NOT_ALLOWED",
  "NO_NEW_RACK_TILE",
  "INVALID_JOKER_ASSIGNMENT",
  "INVALID_JOKER_RECOVERY",
  "WORD_NOT_ALLOWED",
  "RULE_VIOLATION",
  "TEMPORARILY_UNAVAILABLE",
  "RESOURCE_SUPPLY_EMPTY",
  "RESOURCE_LIMIT_EXCEEDED",
  "CARD_NOT_AVAILABLE",
  "INSUFFICIENT_RESOURCES",
  "RESERVE_LIMIT_REACHED",
  "YIELD_NOT_ALLOWED",
  "INTERNAL_ERROR",
] as const;

export const ProtocolErrorCodeSchema = v.picklist(PROTOCOL_ERROR_CODES);
export type ProtocolErrorCode = v.InferOutput<
  typeof ProtocolErrorCodeSchema
>;

export const ErrorDtoSchema = v.strictObject({
  code: ProtocolErrorCodeSchema,
  message: v.pipe(v.string(), v.nonEmpty("Error message must not be empty.")),
  recoverable: v.boolean(),
});
export type ErrorDto = v.InferOutput<typeof ErrorDtoSchema>;

export const BootstrapCredentialSchema = v.strictObject({
  sessionToken: SessionTokenSchema,
});
export type BootstrapCredential = v.InferOutput<
  typeof BootstrapCredentialSchema
>;

export const BoundPlayerCredentialSchema = v.strictObject({
  roomCode: RoomCodeSchema,
  sessionToken: SessionTokenSchema,
});
export type BoundPlayerCredential = v.InferOutput<
  typeof BoundPlayerCredentialSchema
>;

export const BrowserStoredPlayerSessionSchema = v.strictObject({
  protocolVersion: ProtocolVersionSchema,
  playerId: PlayerIdSchema,
  credential: BoundPlayerCredentialSchema,
});
export type BrowserStoredPlayerSession = v.InferOutput<
  typeof BrowserStoredPlayerSessionSchema
>;

export const BootstrapSessionDataSchema = v.strictObject({
  credential: BootstrapCredentialSchema,
  expiresAt: ServerTimeSchema,
});
export type BootstrapSessionData = v.InferOutput<
  typeof BootstrapSessionDataSchema
>;

export type ClientCommand<
  TPayload,
  TKind extends string = string,
> = {
  kind: TKind;
  protocolVersion: ProtocolVersion;
  requestId: RequestId;
  payload: TPayload;
};

export type RoomVersionedClientCommand<
  TPayload,
  TKind extends string = string,
> = ClientCommand<TPayload, TKind> & {
  expectedRoomRevision: RoomRevision;
};

export type GameVersionedClientCommand<
  TPayload,
  TKind extends string = string,
> = ClientCommand<TPayload, TKind> & {
  expectedGameRevision: GameRevision;
};

export type TurnClientCommand<
  TPayload,
  TKind extends string = string,
> = GameVersionedClientCommand<TPayload, TKind> & {
  turnId: TurnId;
};

export const SessionBootstrapCommandSchema = v.strictObject({
  kind: v.literal("session:bootstrap"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  payload: v.strictObject({}),
});
export type SessionBootstrapCommand = v.InferOutput<
  typeof SessionBootstrapCommandSchema
>;

export const RoomCreateCommandSchema = v.strictObject({
  kind: v.literal("room:create"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  payload: v.strictObject({
    bootstrapCredential: BootstrapCredentialSchema,
    nickname: NicknameSchema,
    gameType: v.optional(GameTypeSchema),
  }),
});
export type RoomCreateCommand = v.InferOutput<typeof RoomCreateCommandSchema>;

export const RoomJoinCommandSchema = v.strictObject({
  kind: v.literal("room:join"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  payload: v.strictObject({
    bootstrapCredential: BootstrapCredentialSchema,
    nickname: NicknameSchema,
    roomCode: RoomCodeSchema,
  }),
});
export type RoomJoinCommand = v.InferOutput<typeof RoomJoinCommandSchema>;

export const RoomLeaveCommandSchema = v.strictObject({
  kind: v.literal("room:leave"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  expectedRoomRevision: RoomRevisionSchema,
  expectedGameRevision: v.nullable(GameRevisionSchema),
  payload: v.strictObject({}),
});
export type RoomLeaveCommand = v.InferOutput<typeof RoomLeaveCommandSchema>;

export const SessionResumeCommandSchema = v.strictObject({
  kind: v.literal("session:resume"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  payload: v.strictObject({
    credential: BoundPlayerCredentialSchema,
    lastSeenVersions: v.nullable(StateVersionsSchema),
  }),
});
export type SessionResumeCommand = v.InferOutput<
  typeof SessionResumeCommandSchema
>;

export const StateSyncCommandSchema = v.strictObject({
  kind: v.literal("state:sync"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  payload: v.strictObject({}),
});
export type StateSyncCommand = v.InferOutput<typeof StateSyncCommandSchema>;

export const GameStartCommandSchema = v.strictObject({
  kind: v.literal("game:start"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  expectedRoomRevision: RoomRevisionSchema,
  payload: v.strictObject({}),
});
export type GameStartCommand = v.InferOutput<typeof GameStartCommandSchema>;

export const TurnSubmitCommandSchema = v.strictObject({
  kind: v.literal("turn:submit"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  expectedGameRevision: GameRevisionSchema,
  turnId: TurnIdSchema,
  payload: v.strictObject({
    proposedBoard: ProposedBoardSchema,
  }),
});
export type TurnSubmitCommand = v.InferOutput<typeof TurnSubmitCommandSchema>;

export const TurnDrawCommandSchema = v.strictObject({
  kind: v.literal("turn:draw"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  expectedGameRevision: GameRevisionSchema,
  turnId: TurnIdSchema,
  payload: v.strictObject({
    bagKind: TurnDrawBagKindSchema,
  }),
});
export type TurnDrawCommand = v.InferOutput<typeof TurnDrawCommandSchema>;

export const TurnPassCommandSchema = v.strictObject({
  kind: v.literal("turn:pass"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  expectedGameRevision: GameRevisionSchema,
  turnId: TurnIdSchema,
  payload: v.strictObject({}),
});
export type TurnPassCommand = v.InferOutput<typeof TurnPassCommandSchema>;

export const NumberSubmitCommandSchema = v.strictObject({
  kind: v.literal("number:submit"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  expectedGameRevision: GameRevisionSchema,
  turnId: TurnIdSchema,
  payload: v.strictObject({
    proposedTable: NumberTileProposedTableSchema,
  }),
});
export type NumberSubmitCommand = v.InferOutput<
  typeof NumberSubmitCommandSchema
>;

export const NumberDrawCommandSchema = v.strictObject({
  kind: v.literal("number:draw"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  expectedGameRevision: GameRevisionSchema,
  turnId: TurnIdSchema,
  payload: v.strictObject({}),
});
export type NumberDrawCommand = v.InferOutput<typeof NumberDrawCommandSchema>;

export const NumberPassCommandSchema = v.strictObject({
  kind: v.literal("number:pass"),
  protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema,
  expectedGameRevision: GameRevisionSchema,
  turnId: TurnIdSchema,
  payload: v.strictObject({}),
});
export type NumberPassCommand = v.InferOutput<typeof NumberPassCommandSchema>;

export const NumberRematchCommandSchema = v.strictObject({ kind: v.literal("number:rematch"), protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema, expectedRoomRevision: RoomRevisionSchema, expectedGameRevision: GameRevisionSchema,
  payload: v.strictObject({ gameId: GameIdSchema }) });
export type NumberRematchCommand = v.InferOutput<typeof NumberRematchCommandSchema>;

export const GemCollectCommandSchema = v.strictObject({
  kind: v.literal("gem:collect"), protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema, expectedGameRevision: GameRevisionSchema, turnId: TurnIdSchema,
  payload: v.strictObject({ selection: GemCollectSelectionSchema }),
});
export type GemCollectCommand = v.InferOutput<typeof GemCollectCommandSchema>;

export const GemPurchaseCommandSchema = v.strictObject({
  kind: v.literal("gem:purchase"), protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema, expectedGameRevision: GameRevisionSchema, turnId: TurnIdSchema,
  payload: v.strictObject({ source: GemPurchaseSourceSchema }),
});
export type GemPurchaseCommand = v.InferOutput<typeof GemPurchaseCommandSchema>;

export const GemReserveCommandSchema = v.strictObject({
  kind: v.literal("gem:reserve"), protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema, expectedGameRevision: GameRevisionSchema, turnId: TurnIdSchema,
  payload: v.strictObject({ source: GemMarketSourceSchema }),
});
export type GemReserveCommand = v.InferOutput<typeof GemReserveCommandSchema>;

export const GemYieldCommandSchema = v.strictObject({
  kind: v.literal("gem:yield"), protocolVersion: ProtocolVersionSchema,
  requestId: RequestIdSchema, expectedGameRevision: GameRevisionSchema, turnId: TurnIdSchema,
  payload: v.strictObject({}),
});
export type GemYieldCommand = v.InferOutput<typeof GemYieldCommandSchema>;

const CityCommandEnvelope = {
  protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema,
  gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema, actionId: CityActionIdSchema,
};
export const CitySelectRoleCommandSchema = v.strictObject({ ...CityCommandEnvelope, kind: v.literal("city:selectRole"), payload: v.strictObject({ roleId: CityRoleIdSchema }) });
export type CitySelectRoleCommand = v.InferOutput<typeof CitySelectRoleCommandSchema>;
export const CityTakeIncomeCommandSchema = v.strictObject({ ...CityCommandEnvelope, kind: v.literal("city:takeIncome"), payload: v.strictObject({}) });
export type CityTakeIncomeCommand = v.InferOutput<typeof CityTakeIncomeCommandSchema>;
export const CityDrawBuildingCardsCommandSchema = v.strictObject({ ...CityCommandEnvelope, kind: v.literal("city:drawBuildingCards"), payload: v.strictObject({}) });
export type CityDrawBuildingCardsCommand = v.InferOutput<typeof CityDrawBuildingCardsCommandSchema>;
export const CityChooseBuildingCardCommandSchema = v.strictObject({ ...CityCommandEnvelope, kind: v.literal("city:chooseBuildingCard"), payload: v.strictObject({ cardId: CityBuildingCardIdSchema }) });
export type CityChooseBuildingCardCommand = v.InferOutput<typeof CityChooseBuildingCardCommandSchema>;
export const CityUseRoleAbilityCommandSchema = v.strictObject({ ...CityCommandEnvelope, kind: v.literal("city:useRoleAbility"), payload: CityRoleAbilityPayloadSchema });
export type CityUseRoleAbilityCommand = v.InferOutput<typeof CityUseRoleAbilityCommandSchema>;
export const CityBuildCommandSchema = v.strictObject({ ...CityCommandEnvelope, kind: v.literal("city:build"), payload: v.strictObject({ cardId: CityBuildingCardIdSchema }) });
export type CityBuildCommand = v.InferOutput<typeof CityBuildCommandSchema>;
export const CityEndTurnCommandSchema = v.strictObject({ ...CityCommandEnvelope, kind: v.literal("city:endTurn"), payload: v.strictObject({}) });
export type CityEndTurnCommand = v.InferOutput<typeof CityEndTurnCommandSchema>;
export type CityClientCommand = CitySelectRoleCommand | CityTakeIncomeCommand | CityDrawBuildingCardsCommand | CityChooseBuildingCardCommand | CityUseRoleAbilityCommand | CityBuildCommand | CityEndTurnCommand;
export const CityClientCommandSchema = v.variant("kind", [CitySelectRoleCommandSchema, CityTakeIncomeCommandSchema, CityDrawBuildingCardsCommandSchema, CityChooseBuildingCardCommandSchema, CityUseRoleAbilityCommandSchema, CityBuildCommandSchema, CityEndTurnCommandSchema]);

export const Phase2ClientCommandSchema = v.variant("kind", [
  SessionBootstrapCommandSchema,
  RoomCreateCommandSchema,
  RoomJoinCommandSchema,
  SessionResumeCommandSchema,
  StateSyncCommandSchema,
]);
export type Phase2ClientCommand = v.InferOutput<
  typeof Phase2ClientCommandSchema
>;

export const ClientCommandSchema = v.variant("kind", [
  SessionBootstrapCommandSchema,
  RoomCreateCommandSchema,
  RoomJoinCommandSchema,
  SessionResumeCommandSchema,
  StateSyncCommandSchema,
  GameStartCommandSchema,
  RoomLeaveCommandSchema,
  TurnSubmitCommandSchema,
  TurnDrawCommandSchema,
  TurnPassCommandSchema,
  NumberSubmitCommandSchema,
  NumberDrawCommandSchema,
  NumberPassCommandSchema,
  NumberRematchCommandSchema,
  GemCollectCommandSchema,
  GemPurchaseCommandSchema,
  GemReserveCommandSchema,
  GemYieldCommandSchema,
  CitySelectRoleCommandSchema,
  CityTakeIncomeCommandSchema,
  CityDrawBuildingCardsCommandSchema,
  CityChooseBuildingCardCommandSchema,
  CityUseRoleAbilityCommandSchema,
  CityBuildCommandSchema,
  CityEndTurnCommandSchema,
]);
export type KnownClientCommand = v.InferOutput<typeof ClientCommandSchema>;

type AckSuccess<TData> = {
  requestId: RequestId;
  ok: true;
  serverTime: ServerTime;
  data: TData;
};

type AckFailure = {
  requestId: RequestId;
  ok: false;
  serverTime: ServerTime;
  error: ErrorDto;
};

export type UnscopedAck<TData> =
  | ({ scope: "UNSCOPED" } & AckSuccess<TData>)
  | ({ scope: "UNSCOPED" } & AckFailure);

export type RoomScopedAck<TData> =
  | ({ scope: "ROOM"; versions: StateVersions } & AckSuccess<TData>)
  | ({ scope: "ROOM"; versions: StateVersions } & AckFailure);

export type CommandAck<TData> = UnscopedAck<TData> | RoomScopedAck<TData>;

export const UnscopedAckFailureSchema = v.strictObject({
  scope: v.literal("UNSCOPED"),
  requestId: RequestIdSchema,
  ok: v.literal(false),
  serverTime: ServerTimeSchema,
  error: ErrorDtoSchema,
});
export type UnscopedAckFailure = v.InferOutput<
  typeof UnscopedAckFailureSchema
>;

export const RoomScopedAckFailureSchema = v.strictObject({
  scope: v.literal("ROOM"),
  requestId: RequestIdSchema,
  ok: v.literal(false),
  serverTime: ServerTimeSchema,
  versions: StateVersionsSchema,
  error: ErrorDtoSchema,
});
export type RoomScopedAckFailure = v.InferOutput<
  typeof RoomScopedAckFailureSchema
>;

type WireDataSchema = v.BaseSchema<
  unknown,
  unknown,
  v.BaseIssue<unknown>
>;

export function createUnscopedAckSchema<
  const TDataSchema extends WireDataSchema,
>(dataSchema: TDataSchema) {
  const successSchema = v.strictObject({
    scope: v.literal("UNSCOPED"),
    requestId: RequestIdSchema,
    ok: v.literal(true),
    serverTime: ServerTimeSchema,
    data: dataSchema,
  });

  return v.variant("ok", [successSchema, UnscopedAckFailureSchema]);
}

export function createRoomScopedAckSchema<
  const TDataSchema extends WireDataSchema,
>(dataSchema: TDataSchema) {
  const successSchema = v.strictObject({
    scope: v.literal("ROOM"),
    requestId: RequestIdSchema,
    ok: v.literal(true),
    serverTime: ServerTimeSchema,
    versions: StateVersionsSchema,
    data: dataSchema,
  });

  return v.variant("ok", [successSchema, RoomScopedAckFailureSchema]);
}

export function createCommandAckSchema<
  const TDataSchema extends WireDataSchema,
>(dataSchema: TDataSchema) {
  return v.variant("scope", [
    createUnscopedAckSchema(dataSchema),
    createRoomScopedAckSchema(dataSchema),
  ]);
}

export const BootstrapSessionAckSchema = createUnscopedAckSchema(
  BootstrapSessionDataSchema,
);
export type BootstrapSessionAck = v.InferOutput<
  typeof BootstrapSessionAckSchema
>;

export const SessionReplacedNotificationSchema = v.strictObject({
  kind: v.literal("session:replaced"),
  protocolVersion: ProtocolVersionSchema,
  serverTime: ServerTimeSchema,
  reason: v.literal("NEW_PRIMARY_CONNECTION"),
});
export type SessionReplacedNotification = v.InferOutput<
  typeof SessionReplacedNotificationSchema
>;
