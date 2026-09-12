import { TrainActionSchema } from "./games/train/actions.js";
import { CenturyActionSchema } from "./games/century/actions.js";
import { SaboteurActionSchema } from "./games/saboteur/actions.js";
import { JaipurActionSchema } from "./games/jaipur/actions.js";
import { LoveLetterActionSchema } from "./games/love-letter/actions.js";
import { GuryongtuActionSchema } from "./games/guryongtu/actions.js";
import { AzulActionSchema } from "./games/azul/actions.js";
import { VegasActionSchema } from "./games/vegas/actions.js";
import { BurgundyActionSchema, BurgundySettingsSchema } from "./games/burgundy/actions.js";
import { CarcassonneActionSchema } from "./games/carcassonne/actions.js";
import { ClueActionSchema } from "./games/clue/actions.js";
import { DuetActionSchema } from "./games/word-duet/actions.js";
import { LostCitiesSettingsSchema, LostCitiesActionSchema } from "./games/lost-cities/actions.js";
import { SplendorActionSchema, SplendorSettingsSchema } from "./games/splendor/actions.js";
import { IslandActionSchema } from "./games/island/actions.js";
import { CityExpansionSettingsSchema, CityExpansionActionSchema } from "./games/city-role/expansion-contracts.js";
import { GemCollectSelectionSchema, GemPurchaseSourceSchema, GemMarketSourceSchema } from "./games/gem-card/contracts.js";
import { DrawRelayDrawSecondsSchema } from "./games/draw-relay/settings.js";
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

const DrawIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, stageToken: TurnIdSchema };
export const DrawDraftSaveCommandSchema = v.strictObject({ ...DrawIdentity, kind: v.literal("draw:draftSave"),
  payload: v.strictObject({ drawing: DrawingSchema, expectedDraftRevision: v.pipe(v.number(),v.safeInteger(),v.minValue(0)) }) });
export const DrawSubmitDrawingCommandSchema = v.strictObject({ ...DrawIdentity, kind: v.literal("draw:submitDrawing"), payload: v.strictObject({ drawing: DrawingSchema }) });
export const DrawSubmitGuessCommandSchema = v.strictObject({ ...DrawIdentity, kind: v.literal("draw:submitGuess"), payload: v.strictObject({ text: GuessSchema }) });
export const DrawRevealNextCommandSchema = v.strictObject({ ...DrawIdentity, kind: v.literal("draw:revealNext"), expectedGameRevision: GameRevisionSchema, payload: v.strictObject({}) });
export const DrawRematchCommandSchema = v.strictObject({ ...DrawIdentity, kind: v.literal("draw:rematch"), expectedGameRevision: GameRevisionSchema, expectedRoomRevision: RoomRevisionSchema, payload: v.strictObject({}) });
export const DrawConfigureCommandSchema = v.strictObject({ kind: v.literal("draw:configure"), protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema,
  expectedRoomRevision: RoomRevisionSchema, payload: v.strictObject({ promptMode: v.picklist(["EASY","NORMAL","MIXED"]), drawSeconds: v.optional(DrawRelayDrawSecondsSchema) }) });
export const DrawClientCommandSchema = v.variant("kind",[DrawDraftSaveCommandSchema,DrawSubmitDrawingCommandSchema,DrawSubmitGuessCommandSchema,DrawRevealNextCommandSchema,DrawRematchCommandSchema,DrawConfigureCommandSchema]);
export type DrawClientCommand = v.InferOutput<typeof DrawClientCommandSchema>;

const JaipurIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
const LoveLetterIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
const GuryongtuIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
const AzulIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
const VegasIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
const BurgundyIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
const CarcassonneIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
const ClueIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
const DuetIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
const LostCitiesIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
export const JaipurActCommandSchema = v.strictObject({ ...JaipurIdentity, kind: v.literal("jaipur:act"), turnId: TurnIdSchema, payload: JaipurActionSchema });
export const LoveLetterActCommandSchema = v.strictObject({ ...LoveLetterIdentity, kind: v.literal("loveLetter:act"), turnId: TurnIdSchema, payload: LoveLetterActionSchema });
export const GuryongtuActCommandSchema = v.strictObject({ ...GuryongtuIdentity, kind: v.literal("guryongtu:act"), turnId: TurnIdSchema, payload: GuryongtuActionSchema });
export const AzulActCommandSchema = v.strictObject({ ...AzulIdentity, kind: v.literal("azul:act"), turnId: TurnIdSchema, payload: AzulActionSchema });
export const VegasActCommandSchema = v.strictObject({ ...VegasIdentity, kind: v.literal("vegas:act"), turnId: TurnIdSchema, payload: VegasActionSchema });
export const BurgundyActCommandSchema = v.strictObject({ ...BurgundyIdentity, kind: v.literal("burgundy:act"), turnId: TurnIdSchema, payload: BurgundyActionSchema });
export const CarcassonneActCommandSchema = v.strictObject({ ...CarcassonneIdentity, kind: v.literal("carcassonne:act"), turnId: TurnIdSchema, payload: CarcassonneActionSchema });
export const ClueActCommandSchema = v.strictObject({ ...ClueIdentity, kind: v.literal("clue:act"), turnId: TurnIdSchema, payload: ClueActionSchema });
export const DuetActCommandSchema = v.strictObject({ ...DuetIdentity, kind: v.literal("duet:act"), turnId: TurnIdSchema, payload: DuetActionSchema });
export const LostCitiesActCommandSchema = v.strictObject({ ...LostCitiesIdentity, kind: v.literal("lostCities:act"), turnId: TurnIdSchema, payload: LostCitiesActionSchema });
export const JaipurNextRoundCommandSchema = v.strictObject({ ...JaipurIdentity, kind: v.literal("jaipur:nextRound"), roundId: TurnIdSchema, payload: v.strictObject({}) });
export const LoveLetterNextRoundCommandSchema = v.strictObject({ ...LoveLetterIdentity, kind: v.literal("loveLetter:nextRound"), roundId: TurnIdSchema, payload: v.strictObject({}) });
export const GuryongtuNextRoundCommandSchema = v.strictObject({ ...GuryongtuIdentity, kind: v.literal("guryongtu:nextRound"), roundId: TurnIdSchema, payload: v.strictObject({}) });
export const LostCitiesNextRoundCommandSchema = v.strictObject({ ...LostCitiesIdentity, kind: v.literal("lostCities:nextRound"), roundId: TurnIdSchema, payload: v.strictObject({}) });
export const JaipurClientCommandSchema = v.variant("kind", [JaipurActCommandSchema, JaipurNextRoundCommandSchema]);
export const LoveLetterClientCommandSchema = v.variant("kind", [LoveLetterActCommandSchema, LoveLetterNextRoundCommandSchema]);
export const GuryongtuClientCommandSchema = v.variant("kind", [GuryongtuActCommandSchema, GuryongtuNextRoundCommandSchema]);
export const LostCitiesConfigureCommandSchema = v.strictObject({kind:v.literal("lostCities:configure"),protocolVersion:ProtocolVersionSchema,requestId:RequestIdSchema,expectedRoomRevision:RoomRevisionSchema,payload:LostCitiesSettingsSchema});
export const LostCitiesClientCommandSchema = v.variant("kind", [LostCitiesConfigureCommandSchema, LostCitiesActCommandSchema, LostCitiesNextRoundCommandSchema]);
export type JaipurClientCommand = v.InferOutput<typeof JaipurClientCommandSchema>;
export type LoveLetterClientCommand = v.InferOutput<typeof LoveLetterClientCommandSchema>;
export type GuryongtuClientCommand = v.InferOutput<typeof GuryongtuClientCommandSchema>;
export const AzulClientCommandSchema = AzulActCommandSchema;
export const VegasClientCommandSchema = VegasActCommandSchema;
export const BurgundyConfigureCommandSchema = v.strictObject({protocolVersion:ProtocolVersionSchema,requestId:RequestIdSchema,kind:v.literal("burgundy:configure"),expectedRoomRevision:RoomRevisionSchema,payload:BurgundySettingsSchema});
export const BurgundyClientCommandSchema = v.variant("kind",[BurgundyActCommandSchema,BurgundyConfigureCommandSchema]);
export const CarcassonneClientCommandSchema = CarcassonneActCommandSchema;
export const ClueClientCommandSchema = ClueActCommandSchema;
export type AzulClientCommand = v.InferOutput<typeof AzulClientCommandSchema>;
export type VegasClientCommand = v.InferOutput<typeof VegasClientCommandSchema>;
export type BurgundyClientCommand = v.InferOutput<typeof BurgundyClientCommandSchema>;
export type CarcassonneClientCommand = v.InferOutput<typeof CarcassonneClientCommandSchema>;
export type ClueClientCommand = v.InferOutput<typeof ClueClientCommandSchema>;
export type LostCitiesClientCommand = v.InferOutput<typeof LostCitiesClientCommandSchema>;

const SplendorIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
export const SplendorActCommandSchema = v.strictObject({ ...SplendorIdentity, kind: v.literal("splendor:act"), turnId: TurnIdSchema, payload: SplendorActionSchema });
export const SplendorRematchCommandSchema = v.strictObject({ ...SplendorIdentity, kind: v.literal("splendor:rematch"), expectedRoomRevision: RoomRevisionSchema, payload: v.strictObject({}) });
export const SplendorConfigureCommandSchema = v.strictObject({ kind: v.literal("splendor:configure"), protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, expectedRoomRevision: RoomRevisionSchema, payload: SplendorSettingsSchema });
export const SplendorClientCommandSchema = v.variant("kind", [SplendorConfigureCommandSchema, SplendorActCommandSchema, SplendorRematchCommandSchema]);
export type SplendorClientCommand = v.InferOutput<typeof SplendorClientCommandSchema>;

const HalliIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
export const HalliFlipCommandSchema = v.strictObject({ ...HalliIdentity, kind: v.literal("halli:flip"), turnId: TurnIdSchema, payload: v.strictObject({}) });
export const HalliBellCommandSchema = v.strictObject({ ...HalliIdentity, kind: v.literal("halli:bell"), payload: v.strictObject({}) });
export const HalliRematchCommandSchema = v.strictObject({ ...HalliIdentity, kind: v.literal("halli:rematch"), expectedRoomRevision: RoomRevisionSchema, payload: v.strictObject({}) });
export const HalliClientCommandSchema = v.variant("kind", [HalliFlipCommandSchema, HalliBellCommandSchema, HalliRematchCommandSchema]);
export type HalliClientCommand = v.InferOutput<typeof HalliClientCommandSchema>;


const LiarIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema };
const LiarGameIdentity = { ...LiarIdentity, gameId: GameIdSchema, phaseId: TurnIdSchema };
export const LiarConfigureCommandSchema = v.strictObject({ ...LiarIdentity, kind: v.literal("liar:configure"), expectedRoomRevision: RoomRevisionSchema, payload: LiarSettingsSchema });
export const LiarClueCommandSchema = v.strictObject({ ...LiarGameIdentity, kind: v.literal("liar:clue"), payload: v.strictObject({ text: LiarClueSchema }) });
export const LiarVoteCommandSchema = v.strictObject({ ...LiarGameIdentity, kind: v.literal("liar:vote"), payload: v.strictObject({ playerId: PlayerIdSchema }) });
export const LiarSayCommandSchema = v.strictObject({ ...LiarGameIdentity, kind: v.literal("liar:say"), payload: v.strictObject({ text: LiarTextSchema }) });
export const LiarGuessCommandSchema = v.strictObject({ ...LiarGameIdentity, kind: v.literal("liar:guess"), payload: v.strictObject({ text: LiarClueSchema }) });
export const LiarClientCommandSchema = v.variant("kind", [LiarConfigureCommandSchema, LiarClueCommandSchema, LiarVoteCommandSchema, LiarSayCommandSchema, LiarGuessCommandSchema]);
export type LiarClientCommand = v.InferOutput<typeof LiarClientCommandSchema>;
const SpyfallIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema };
const SpyfallGameIdentity = { ...SpyfallIdentity, gameId: GameIdSchema, phaseId: TurnIdSchema };
export const SpyfallConfigureCommandSchema = v.strictObject({ ...SpyfallIdentity, kind: v.literal("spyfall:configure"), expectedRoomRevision: RoomRevisionSchema, payload: SpyfallSettingsSchema });
export const SpyfallAskCommandSchema = v.strictObject({ ...SpyfallGameIdentity, kind: v.literal("spyfall:ask"), payload: v.strictObject({ playerId: PlayerIdSchema }) });
export const SpyfallAnswerCommandSchema = v.strictObject({ ...SpyfallGameIdentity, kind: v.literal("spyfall:answer"), payload: v.strictObject({}) });
export const SpyfallAccuseCommandSchema = v.strictObject({ ...SpyfallGameIdentity, kind: v.literal("spyfall:accuse"), payload: v.strictObject({ playerId: PlayerIdSchema }) });
export const SpyfallVoteCommandSchema = v.strictObject({ ...SpyfallGameIdentity, kind: v.literal("spyfall:vote"), payload: v.strictObject({ agree: v.boolean() }) });
export const SpyfallSkipCommandSchema = v.strictObject({ ...SpyfallGameIdentity, kind: v.literal("spyfall:skip"), payload: v.strictObject({}) });
export const SpyfallRevealCommandSchema = v.strictObject({ ...SpyfallGameIdentity, kind: v.literal("spyfall:reveal"), payload: v.strictObject({}) });
export const SpyfallGuessCommandSchema = v.strictObject({ ...SpyfallGameIdentity, kind: v.literal("spyfall:guess"), payload: v.strictObject({ location: SpyfallLocationSchema }) });
export const SpyfallClientCommandSchema = v.variant("kind", [SpyfallConfigureCommandSchema, SpyfallAskCommandSchema, SpyfallAnswerCommandSchema, SpyfallAccuseCommandSchema, SpyfallVoteCommandSchema, SpyfallSkipCommandSchema, SpyfallRevealCommandSchema, SpyfallGuessCommandSchema]);
export type SpyfallClientCommand = v.InferOutput<typeof SpyfallClientCommandSchema>;

const WolfIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema };
const WolfGameIdentity = { ...WolfIdentity, gameId: GameIdSchema, phaseId: TurnIdSchema };
export const WolfConfigureCommandSchema = v.strictObject({ ...WolfIdentity, kind: v.literal("wolf:configure"), expectedRoomRevision: RoomRevisionSchema, payload: WolfSettingsSchema });
export const WolfActCommandSchema = v.strictObject({ ...WolfGameIdentity, kind: v.literal("wolf:act"), expectedActionRevision: v.pipe(v.number(), v.safeInteger(), v.minValue(0)), payload: WolfActionSchema });
export const WolfVoteCommandSchema = v.strictObject({ ...WolfGameIdentity, kind: v.literal("wolf:vote"), payload: v.strictObject({ playerId: PlayerIdSchema }) });
export const WolfSayCommandSchema = v.strictObject({ ...WolfGameIdentity, kind: v.literal("wolf:say"), payload: v.strictObject({ text: WolfTextSchema }) });
export const WolfRematchCommandSchema = v.strictObject({ ...WolfIdentity, kind: v.literal("wolf:rematch"), gameId: GameIdSchema, expectedRoomRevision: RoomRevisionSchema, expectedGameRevision: GameRevisionSchema, payload: v.strictObject({}) });
export const WolfClientCommandSchema = v.variant("kind", [WolfConfigureCommandSchema, WolfActCommandSchema, WolfVoteCommandSchema, WolfSayCommandSchema, WolfRematchCommandSchema]);
export type WolfClientCommand = v.InferOutput<typeof WolfClientCommandSchema>;

const SneakyIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema };
export const SneakyConfigureCommandSchema = v.strictObject({ ...SneakyIdentity, kind: v.literal("sneaky:configure"), expectedRoomRevision: RoomRevisionSchema, payload: SneakySettingsSchema });
export const SneakyEatCommandSchema = v.strictObject({ ...SneakyIdentity, kind: v.literal("sneaky:eat"), gameId: GameIdSchema,
  teacherStateRevision: v.pipe(v.number(), v.safeInteger(), v.minValue(0)), payload: v.strictObject({}) });
export const SneakyRematchCommandSchema = v.strictObject({ ...SneakyIdentity, kind: v.literal("sneaky:rematch"), gameId: GameIdSchema,
  expectedRoomRevision: RoomRevisionSchema, expectedGameRevision: GameRevisionSchema, payload: v.strictObject({}) });
export const SneakyClientCommandSchema = v.variant("kind", [SneakyConfigureCommandSchema, SneakyEatCommandSchema, SneakyRematchCommandSchema]);
export type SneakyClientCommand = v.InferOutput<typeof SneakyClientCommandSchema>;

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
export const CityConfigureCommandSchema = v.strictObject({ protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, kind: v.literal("city:configure"), expectedRoomRevision: RoomRevisionSchema, payload: CityExpansionSettingsSchema });
export const CityExpansionCommandSchema = v.strictObject({ ...CityCommandEnvelope, kind: v.literal("city:expansionAction"), payload: CityExpansionActionSchema });
export const CityExpansionClientCommandSchema = v.variant("kind", [CityConfigureCommandSchema, CityExpansionCommandSchema]);
export type CityExpansionClientCommand = v.InferOutput<typeof CityExpansionClientCommandSchema>;
export const CitySelectRoleCommandSchema = v.strictObject({ ...CityCommandEnvelope, kind: v.literal("city:selectRole"), payload: v.strictObject({ roleId: CityRoleIdSchema, discardRoleId: v.optional(CityRoleIdSchema) }) });
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
  LiarConfigureCommandSchema, LiarClueCommandSchema, LiarVoteCommandSchema, LiarSayCommandSchema, LiarGuessCommandSchema,
  SpyfallConfigureCommandSchema, SpyfallAskCommandSchema, SpyfallAnswerCommandSchema, SpyfallAccuseCommandSchema, SpyfallVoteCommandSchema, SpyfallSkipCommandSchema, SpyfallRevealCommandSchema, SpyfallGuessCommandSchema,
  WolfConfigureCommandSchema, WolfActCommandSchema, WolfVoteCommandSchema, WolfSayCommandSchema, WolfRematchCommandSchema,
  SneakyConfigureCommandSchema, SneakyEatCommandSchema, SneakyRematchCommandSchema,
  DrawDraftSaveCommandSchema, DrawSubmitDrawingCommandSchema, DrawSubmitGuessCommandSchema, DrawRevealNextCommandSchema, DrawRematchCommandSchema, DrawConfigureCommandSchema,
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
import { DrawingSchema, GuessSchema } from "./games/draw-relay/drawing-contracts.js";
import { SneakySettingsSchema } from "./games/sneaky-lunch/contracts.js";

import { WolfSettingsSchema, WolfActionSchema, WolfTextSchema } from "./games/wolf-night/contracts.js";

const IslandIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
export const IslandActCommandSchema = v.strictObject({ ...IslandIdentity, kind: v.literal("island:act"), turnId: TurnIdSchema, payload: IslandActionSchema });
export const IslandRematchCommandSchema = v.strictObject({ ...IslandIdentity, kind: v.literal("island:rematch"), expectedRoomRevision: RoomRevisionSchema, payload: v.strictObject({}) });
export const IslandClientCommandSchema = v.variant("kind", [IslandActCommandSchema, IslandRematchCommandSchema]);
export type IslandClientCommand = v.InferOutput<typeof IslandClientCommandSchema>;

const SaboteurIdentity = {protocolVersion:ProtocolVersionSchema,requestId:RequestIdSchema,gameId:GameIdSchema};
export const SaboteurActCommandSchema=v.strictObject({...SaboteurIdentity,kind:v.literal('saboteur:act'),expectedGameRevision:GameRevisionSchema,turnId:TurnIdSchema,payload:SaboteurActionSchema});
export const SaboteurNextRoundCommandSchema=v.strictObject({...SaboteurIdentity,kind:v.literal('saboteur:nextRound'),expectedGameRevision:GameRevisionSchema,roundId:TurnIdSchema,payload:v.strictObject({})});
export const SaboteurSayCommandSchema=v.strictObject({...SaboteurIdentity,kind:v.literal('saboteur:say'),roundId:TurnIdSchema,payload:v.strictObject({text:v.pipe(v.string(),v.minLength(1),v.maxLength(240)),sequence:v.pipe(v.number(),v.safeInteger(),v.minValue(0))})});
export const SaboteurClientCommandSchema=v.variant('kind',[SaboteurActCommandSchema,SaboteurNextRoundCommandSchema,SaboteurSayCommandSchema]);
export type SaboteurClientCommand=v.InferOutput<typeof SaboteurClientCommandSchema>;

import { LiarSettingsSchema, LiarClueSchema, LiarTextSchema } from "./games/liar-game/contracts.js";

export const DuetClientCommandSchema = DuetActCommandSchema;
export type DuetClientCommand = v.InferOutput<typeof DuetClientCommandSchema>;

import { SpyfallSettingsSchema, SpyfallLocationSchema } from "./games/spyfall/contracts.js";

const TrainIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
const CenturyIdentity = { protocolVersion: ProtocolVersionSchema, requestId: RequestIdSchema, gameId: GameIdSchema, expectedGameRevision: GameRevisionSchema };
export const TrainActCommandSchema = v.strictObject({ ...TrainIdentity, kind: v.literal('train:act'), turnId: TurnIdSchema, payload: TrainActionSchema });
export const CenturyActCommandSchema = v.strictObject({ ...CenturyIdentity, kind: v.literal('century:act'), turnId: TurnIdSchema, payload: CenturyActionSchema });
export const TrainClientCommandSchema = TrainActCommandSchema;
export const CenturyClientCommandSchema = CenturyActCommandSchema;
export type TrainClientCommand = v.InferOutput<typeof TrainClientCommandSchema>;
export type CenturyClientCommand = v.InferOutput<typeof CenturyClientCommandSchema>;
