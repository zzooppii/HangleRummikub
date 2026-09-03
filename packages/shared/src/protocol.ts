import * as v from "valibot";

import {
  NicknameSchema,
  PlayerIdSchema,
  RequestIdSchema,
  RoomCodeSchema,
  SessionTokenSchema,
  TileIdSchema,
  TurnIdSchema,
  type RequestId,
  type TurnId,
} from "./identifiers.js";

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
  "BAG_EMPTY",
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
  "INVALID_HANGUL_COMPOSITION",
  "WORD_NOT_ALLOWED",
  "RULE_VIOLATION",
  "TEMPORARILY_UNAVAILABLE",
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

/** Transport resource limits, not gameplay acceptance rules. */
export const PROPOSED_BOARD_MAX_TILE_REFERENCES = 156;
export const PROPOSED_BOARD_MAX_WORD_GROUPS = 156;
export const PROPOSED_WORD_GROUP_MAX_SYLLABLES = 156;
export const PROPOSED_WORD_GROUP_ID_MAX_LENGTH = 128;
export const PROPOSED_ASSIGNED_SYMBOL_MAX_LENGTH = 8;

export const ProposedBoardTilePlacementSchema = v.strictObject({
  tileId: TileIdSchema,
  assignedSymbol: v.pipe(
    v.string(),
    v.nonEmpty("A proposed Tile assignment must not be empty."),
    v.maxLength(
      PROPOSED_ASSIGNED_SYMBOL_MAX_LENGTH,
      "A proposed Tile assignment is too long.",
    ),
  ),
});
export type ProposedBoardTilePlacement = v.InferOutput<
  typeof ProposedBoardTilePlacementSchema
>;

export const ProposedBoardSyllableSchema = v.strictObject({
  choseong: v.pipe(
    v.array(ProposedBoardTilePlacementSchema),
    v.length(1, "A proposed syllable must contain one choseong component."),
  ),
  jungseong: v.pipe(
    v.array(ProposedBoardTilePlacementSchema),
    v.minLength(1, "A proposed syllable must contain a jungseong component."),
    v.maxLength(2, "A proposed syllable may contain two jungseong components."),
  ),
  jongseong: v.pipe(
    v.array(ProposedBoardTilePlacementSchema),
    v.maxLength(2, "A proposed syllable may contain two jongseong components."),
  ),
});
export type ProposedBoardSyllable = v.InferOutput<
  typeof ProposedBoardSyllableSchema
>;

export const ProposedWordGroupSchema = v.strictObject({
  groupId: v.pipe(
    v.string(),
    v.nonEmpty("A proposed WordGroup identifier must not be empty."),
    v.maxLength(
      PROPOSED_WORD_GROUP_ID_MAX_LENGTH,
      "A proposed WordGroup identifier is too long.",
    ),
  ),
  // Empty groups are structurally safe; the RuleEngine owns that rejection.
  syllables: v.pipe(
    v.array(ProposedBoardSyllableSchema),
    v.maxLength(
      PROPOSED_WORD_GROUP_MAX_SYLLABLES,
      "A proposed WordGroup contains too many syllables.",
    ),
  ),
});
export type ProposedWordGroup = v.InferOutput<
  typeof ProposedWordGroupSchema
>;

function proposedBoardTileReferenceCount(
  board: Readonly<{ wordGroups: readonly ProposedWordGroup[] }>,
): number {
  let count = 0;

  for (const group of board.wordGroups) {
    for (const syllable of group.syllables) {
      count +=
        syllable.choseong.length +
        syllable.jungseong.length +
        syllable.jongseong.length;
    }
  }

  return count;
}

const ProposedBoardObjectSchema = v.strictObject({
  wordGroups: v.pipe(
    v.array(ProposedWordGroupSchema),
    v.maxLength(
      PROPOSED_BOARD_MAX_WORD_GROUPS,
      "A proposed Board contains too many WordGroups.",
    ),
  ),
});

export const ProposedBoardSchema = v.pipe(
  ProposedBoardObjectSchema,
  v.check(
    (board) =>
      proposedBoardTileReferenceCount(board) <=
      PROPOSED_BOARD_MAX_TILE_REFERENCES,
    "A proposed Board contains too many physical Tile references.",
  ),
);
export type ProposedBoard = v.InferOutput<typeof ProposedBoardSchema>;

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

export const TurnDrawBagKindSchema = v.picklist(["CONSONANT", "VOWEL"]);
export type TurnDrawBagKind = v.InferOutput<
  typeof TurnDrawBagKindSchema
>;

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
  TurnSubmitCommandSchema,
  TurnDrawCommandSchema,
  TurnPassCommandSchema,
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
