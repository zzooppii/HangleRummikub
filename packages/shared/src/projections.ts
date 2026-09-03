import * as v from "valibot";

import {
  GameIdSchema,
  NicknameSchema,
  PlayerIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  TileIdSchema,
  TurnIdSchema,
} from "./identifiers.js";
import {
  GameRevisionSchema,
  PresenceVersionSchema,
  ProtocolVersionSchema,
  RoomPhaseSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
} from "./protocol.js";

const NonEmptyWireStringSchema = v.pipe(
  v.string(),
  v.nonEmpty("Wire string must not be empty."),
);

const CHOSEONG_SYMBOLS = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const;
const SINGLE_JUNGSEONG_SYMBOLS = [
  "ㅏ",
  "ㅐ",
  "ㅑ",
  "ㅒ",
  "ㅓ",
  "ㅔ",
  "ㅕ",
  "ㅖ",
  "ㅗ",
  "ㅛ",
  "ㅜ",
  "ㅠ",
  "ㅡ",
  "ㅣ",
] as const;
const SINGLE_JONGSEONG_SYMBOLS = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
] as const;
const CHOSEONG_SYMBOL_SET = new Set<string>(CHOSEONG_SYMBOLS);
const SINGLE_JUNGSEONG_SYMBOL_SET = new Set<string>(
  SINGLE_JUNGSEONG_SYMBOLS,
);
const SINGLE_JONGSEONG_SYMBOL_SET = new Set<string>(
  SINGLE_JONGSEONG_SYMBOLS,
);
const COMPOUND_JUNGSEONG_COMPONENTS = new Set([
  "ㅗㅏ",
  "ㅗㅐ",
  "ㅗㅣ",
  "ㅜㅓ",
  "ㅜㅔ",
  "ㅜㅣ",
  "ㅡㅣ",
]);
const CLUSTER_JONGSEONG_COMPONENTS = new Set([
  "ㄱㅅ",
  "ㄴㅈ",
  "ㄴㅎ",
  "ㄹㄱ",
  "ㄹㅁ",
  "ㄹㅂ",
  "ㄹㅅ",
  "ㄹㅌ",
  "ㄹㅍ",
  "ㄹㅎ",
  "ㅂㅅ",
]);
const ONE_POSITION_ASSIGNED_SYMBOLS = [
  ...CHOSEONG_SYMBOLS,
  ...SINGLE_JUNGSEONG_SYMBOLS,
] as const;
const OnePositionAssignedSymbolSchema = v.picklist(
  ONE_POSITION_ASSIGNED_SYMBOLS,
);
const TileAllowedSymbolsSchema = v.pipe(
  v.array(OnePositionAssignedSymbolSchema),
  v.minLength(1),
  v.check(
    (symbols) => new Set(symbols).size === symbols.length,
    "Tile allowedSymbols must not contain duplicates.",
  ),
);

export const TileCountSchema = v.pipe(
  v.number(),
  v.integer("Tile count must be an integer."),
  v.safeInteger("Tile count must be a safe integer."),
  v.minValue(0, "Tile count must not be negative."),
);
export type TileCount = v.InferOutput<typeof TileCountSchema>;

export const TurnNumberSchema = v.pipe(
  v.number(),
  v.integer("Turn number must be an integer."),
  v.safeInteger("Turn number must be a safe integer."),
  v.minValue(1, "Turn number must be at least one."),
);
export type TurnNumber = v.InferOutput<typeof TurnNumberSchema>;

export const TileSourceBagSchema = v.picklist(["CONSONANT", "VOWEL"]);
export type TileSourceBag = v.InferOutput<typeof TileSourceBagSchema>;

export const ConnectionStatusSchema = v.picklist(["CONNECTED", "OFFLINE"]);
export type ConnectionStatus = v.InferOutput<typeof ConnectionStatusSchema>;

export const PublicPlayerViewSchema = v.strictObject({
  playerId: PlayerIdSchema,
  nickname: NicknameSchema,
  isHost: v.boolean(),
  connectionStatus: ConnectionStatusSchema,
});
export type PublicPlayerView = v.InferOutput<typeof PublicPlayerViewSchema>;

export const PlayingPublicPlayerViewSchema = v.strictObject({
  ...PublicPlayerViewSchema.entries,
  rackCount: TileCountSchema,
  initialMeldCompleted: v.boolean(),
});
export type PlayingPublicPlayerView = v.InferOutput<
  typeof PlayingPublicPlayerViewSchema
>;

export const PublicRoomViewSchema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: RoomPhaseSchema,
  players: v.pipe(v.array(PublicPlayerViewSchema), v.maxLength(4)),
});
export type PublicRoomView = v.InferOutput<typeof PublicRoomViewSchema>;

export const LobbyPublicRoomViewSchema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("LOBBY"),
  players: v.pipe(v.array(PublicPlayerViewSchema), v.maxLength(4)),
});
export type LobbyPublicRoomView = v.InferOutput<
  typeof LobbyPublicRoomViewSchema
>;

export const PlayingPublicRoomViewSchema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("PLAYING"),
  players: v.pipe(
    v.array(PlayingPublicPlayerViewSchema),
    v.minLength(2),
    v.maxLength(4),
  ),
});
export type PlayingPublicRoomView = v.InferOutput<
  typeof PlayingPublicRoomViewSchema
>;

export const FinishedPublicRoomViewSchema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  phase: v.literal("FINISHED"),
  players: v.pipe(
    v.array(PlayingPublicPlayerViewSchema),
    v.minLength(2),
    v.maxLength(4),
  ),
});
export type FinishedPublicRoomView = v.InferOutput<
  typeof FinishedPublicRoomViewSchema
>;

const OrdinaryPublicBoardTilePlacementSchema = v.strictObject({
  tileId: TileIdSchema,
  kind: v.literal("ORDINARY"),
  physicalType: NonEmptyWireStringSchema,
  assignedSymbol: NonEmptyWireStringSchema,
  allowedSymbols: TileAllowedSymbolsSchema,
});

const JokerPublicBoardTilePlacementSchema = v.strictObject({
  tileId: TileIdSchema,
  kind: v.literal("JOKER"),
  physicalType: v.literal("JOKER"),
  assignedSymbol: NonEmptyWireStringSchema,
  allowedSymbols: TileAllowedSymbolsSchema,
});

const PublicBoardTilePlacementVariantSchema = v.variant("kind", [
  OrdinaryPublicBoardTilePlacementSchema,
  JokerPublicBoardTilePlacementSchema,
]);

export type PublicBoardTilePlacement = v.InferOutput<
  typeof PublicBoardTilePlacementVariantSchema
>;

export const PublicBoardTilePlacementSchema = v.pipe(
  PublicBoardTilePlacementVariantSchema,
  v.check(
    (placement) =>
      placement.allowedSymbols.some(
        (allowedSymbol) => allowedSymbol === placement.assignedSymbol,
      ),
    "A Board Tile assignment must belong to allowedSymbols.",
  ),
);

const ChoseongPlacementSequenceSchema: v.BaseSchema<
  unknown,
  PublicBoardTilePlacement[],
  v.BaseIssue<unknown>
> = v.pipe(
  v.array(PublicBoardTilePlacementSchema),
  v.length(1, "A syllable must contain exactly one choseong component."),
  v.check(
    (components) =>
      components.every((component) =>
        CHOSEONG_SYMBOL_SET.has(component.assignedSymbol),
      ),
    "A choseong component must contain a supported consonant symbol.",
  ),
);
const JungseongPlacementSequenceSchema: v.BaseSchema<
  unknown,
  PublicBoardTilePlacement[],
  v.BaseIssue<unknown>
> = v.pipe(
  v.array(PublicBoardTilePlacementSchema),
  v.minLength(1, "A syllable must contain a jungseong component."),
  v.maxLength(2, "A syllable may contain at most two jungseong components."),
  v.check(
    (components) =>
      components.every((component) =>
        SINGLE_JUNGSEONG_SYMBOL_SET.has(component.assignedSymbol),
      ) &&
      (components.length === 1 ||
        COMPOUND_JUNGSEONG_COMPONENTS.has(
          components.map((component) => component.assignedSymbol).join(""),
        )),
    "Two jungseong components must form a supported compound vowel.",
  ),
);
const JongseongPlacementSequenceSchema: v.BaseSchema<
  unknown,
  PublicBoardTilePlacement[],
  v.BaseIssue<unknown>
> = v.pipe(
  v.array(PublicBoardTilePlacementSchema),
  v.maxLength(2, "A syllable may contain at most two jongseong components."),
  v.check(
    (components) =>
      components.every((component) =>
        SINGLE_JONGSEONG_SYMBOL_SET.has(component.assignedSymbol),
      ) &&
      (components.length < 2 ||
        CLUSTER_JONGSEONG_COMPONENTS.has(
          components.map((component) => component.assignedSymbol).join(""),
        )),
    "Two jongseong components must form a supported final cluster.",
  ),
);

export type PublicBoardSyllable = {
  choseong: PublicBoardTilePlacement[];
  jungseong: PublicBoardTilePlacement[];
  jongseong: PublicBoardTilePlacement[];
};

export const PublicBoardSyllableSchema: v.BaseSchema<
  unknown,
  PublicBoardSyllable,
  v.BaseIssue<unknown>
> = v.strictObject({
  choseong: ChoseongPlacementSequenceSchema,
  jungseong: JungseongPlacementSequenceSchema,
  jongseong: JongseongPlacementSequenceSchema,
});

export type PublicWordGroup = {
  groupId: string;
  syllables: PublicBoardSyllable[];
};

export const PublicWordGroupSchema: v.BaseSchema<
  unknown,
  PublicWordGroup,
  v.BaseIssue<unknown>
> = v.strictObject({
  groupId: NonEmptyWireStringSchema,
  syllables: v.pipe(
    v.array(PublicBoardSyllableSchema),
    v.minLength(1, "A WordGroup must contain at least one syllable."),
  ),
});

export type PublicBoardView = {
  wordGroups: PublicWordGroup[];
};

const PublicBoardViewObjectSchema: v.BaseSchema<
  unknown,
  PublicBoardView,
  v.BaseIssue<unknown>
> = v.strictObject({
  wordGroups: v.array(PublicWordGroupSchema),
});

function boardTileIds(
  board: PublicBoardView,
): readonly string[] {
  return board.wordGroups.flatMap((group) =>
    group.syllables.flatMap((syllable) => [
      ...syllable.choseong.map((component) => component.tileId),
      ...syllable.jungseong.map((component) => component.tileId),
      ...syllable.jongseong.map((component) => component.tileId),
    ]),
  );
}

export const PublicBoardViewSchema: v.BaseSchema<
  unknown,
  PublicBoardView,
  v.BaseIssue<unknown>
> = v.pipe(
  PublicBoardViewObjectSchema,
  v.check(
    (board) =>
      new Set(board.wordGroups.map((group) => group.groupId)).size ===
      board.wordGroups.length,
    "Board WordGroup identifiers must be unique.",
  ),
  v.check((board) => {
    const tileIds = boardTileIds(board);
    return new Set(tileIds).size === tileIds.length;
  }, "A physical Tile may appear only once on the Board."),
);

const PublicTurnViewObjectSchema = v.strictObject({
  turnId: TurnIdSchema,
  turnNumber: TurnNumberSchema,
  activePlayerId: PlayerIdSchema,
  startedAt: ServerTimeSchema,
  deadlineAt: ServerTimeSchema,
});

export const PublicTurnViewSchema = v.pipe(
  PublicTurnViewObjectSchema,
  v.check(
    (turn) => turn.deadlineAt >= turn.startedAt,
    "Turn deadline must not precede its start time.",
  ),
);
export type PublicTurnView = v.InferOutput<typeof PublicTurnViewSchema>;

export const PublicBagCountsSchema = v.strictObject({
  consonant: TileCountSchema,
  vowel: TileCountSchema,
});
export type PublicBagCounts = v.InferOutput<typeof PublicBagCountsSchema>;

const PublicGameViewObjectSchema = v.strictObject({
  gameId: GameIdSchema,
  board: PublicBoardViewSchema,
  turnOrder: v.pipe(
    v.array(PlayerIdSchema),
    v.minLength(2),
    v.maxLength(4),
  ),
  turn: PublicTurnViewSchema,
  bagCounts: PublicBagCountsSchema,
});

export const PublicGameViewSchema = v.pipe(
  PublicGameViewObjectSchema,
  v.check(
    (game) => new Set(game.turnOrder).size === game.turnOrder.length,
    "Turn order must not contain duplicate players.",
  ),
  v.check(
    (game) => game.turnOrder.includes(game.turn.activePlayerId),
    "The active player must be present in turn order.",
  ),
);
export type PublicGameView = v.InferOutput<typeof PublicGameViewSchema>;

export const GameScoreSchema = v.pipe(
  v.number(),
  v.integer("A Game score must be an integer."),
  v.safeInteger("A Game score must be a safe integer."),
);
export type GameScore = v.InferOutput<typeof GameScoreSchema>;

export const PublicGameScoreEntrySchema = v.strictObject({
  playerId: PlayerIdSchema,
  score: GameScoreSchema,
});
export type PublicGameScoreEntry = v.InferOutput<
  typeof PublicGameScoreEntrySchema
>;

const RackEmptyGameResultObjectSchema = v.strictObject({
  reason: v.literal("RACK_EMPTY"),
  winnerPlayerId: PlayerIdSchema,
  scores: v.pipe(
    v.array(PublicGameScoreEntrySchema),
    v.minLength(2),
    v.maxLength(4),
  ),
  finishedAt: ServerTimeSchema,
});

export const RackEmptyGameResultSchema = v.pipe(
  RackEmptyGameResultObjectSchema,
  v.check(
    (result) =>
      new Set(result.scores.map((entry) => entry.playerId)).size ===
      result.scores.length,
    "Game result scores must not contain duplicate players.",
  ),
  v.check(
    (result) =>
      result.scores.some((entry) => entry.playerId === result.winnerPlayerId),
    "The rack-empty winner must have a score entry.",
  ),
);
export type RackEmptyGameResult = v.InferOutput<
  typeof RackEmptyGameResultSchema
>;

export const GameResultSchema = RackEmptyGameResultSchema;
export type GameResult = v.InferOutput<typeof GameResultSchema>;

const FinishedPublicGameViewObjectSchema = v.strictObject({
  gameId: GameIdSchema,
  board: PublicBoardViewSchema,
  turnOrder: v.pipe(
    v.array(PlayerIdSchema),
    v.minLength(2),
    v.maxLength(4),
  ),
  bagCounts: PublicBagCountsSchema,
  result: GameResultSchema,
});

export const FinishedPublicGameViewSchema = v.pipe(
  FinishedPublicGameViewObjectSchema,
  v.check(
    (game) => new Set(game.turnOrder).size === game.turnOrder.length,
    "Turn order must not contain duplicate players.",
  ),
  v.check(
    (game) =>
      game.result.scores.length === game.turnOrder.length &&
      game.result.scores.every(
        (entry, index) => entry.playerId === game.turnOrder[index],
      ),
    "Game result scores must follow the complete turn order.",
  ),
);
export type FinishedPublicGameView = v.InferOutput<
  typeof FinishedPublicGameViewSchema
>;

export const OrdinaryPrivateRackTileViewSchema = v.strictObject({
  tileId: TileIdSchema,
  kind: v.literal("ORDINARY"),
  physicalType: NonEmptyWireStringSchema,
  sourceBag: TileSourceBagSchema,
  allowedSymbols: TileAllowedSymbolsSchema,
});
export type OrdinaryPrivateRackTileView = v.InferOutput<
  typeof OrdinaryPrivateRackTileViewSchema
>;

export const JokerPrivateRackTileViewSchema = v.strictObject({
  tileId: TileIdSchema,
  kind: v.literal("JOKER"),
  physicalType: v.literal("JOKER"),
  sourceBag: TileSourceBagSchema,
  allowedSymbols: TileAllowedSymbolsSchema,
});
export type JokerPrivateRackTileView = v.InferOutput<
  typeof JokerPrivateRackTileViewSchema
>;

export const PrivateRackTileViewSchema = v.variant("kind", [
  OrdinaryPrivateRackTileViewSchema,
  JokerPrivateRackTileViewSchema,
]);
export type PrivateRackTileView = v.InferOutput<
  typeof PrivateRackTileViewSchema
>;

export const PrivatePlayerViewSchema = v.strictObject({
  playerId: PlayerIdSchema,
});
export type PrivatePlayerView = v.InferOutput<typeof PrivatePlayerViewSchema>;

export const PlayingPrivatePlayerViewSchema = v.strictObject({
  playerId: PlayerIdSchema,
  rack: v.array(PrivateRackTileViewSchema),
});
export type PlayingPrivatePlayerView = v.InferOutput<
  typeof PlayingPrivatePlayerViewSchema
>;

export const LobbyStateVersionsSchema = v.strictObject({
  roomRevision: RoomRevisionSchema,
  gameRevision: v.null(),
  presenceVersion: PresenceVersionSchema,
});
export type LobbyStateVersions = v.InferOutput<
  typeof LobbyStateVersionsSchema
>;

export const PlayingStateVersionsSchema = v.strictObject({
  roomRevision: RoomRevisionSchema,
  gameRevision: GameRevisionSchema,
  presenceVersion: PresenceVersionSchema,
});
export type PlayingStateVersions = v.InferOutput<
  typeof PlayingStateVersionsSchema
>;

export const FinishedStateVersionsSchema = PlayingStateVersionsSchema;
export type FinishedStateVersions = v.InferOutput<
  typeof FinishedStateVersionsSchema
>;

export const LobbyStateSnapshotSchema = v.strictObject({
  protocolVersion: ProtocolVersionSchema,
  versions: LobbyStateVersionsSchema,
  serverTime: ServerTimeSchema,
  room: LobbyPublicRoomViewSchema,
  self: PrivatePlayerViewSchema,
});
export type LobbyStateSnapshot = v.InferOutput<
  typeof LobbyStateSnapshotSchema
>;

const PlayingStateSnapshotObjectSchema = v.strictObject({
  protocolVersion: ProtocolVersionSchema,
  versions: PlayingStateVersionsSchema,
  serverTime: ServerTimeSchema,
  room: PlayingPublicRoomViewSchema,
  game: PublicGameViewSchema,
  self: PlayingPrivatePlayerViewSchema,
});

export const PlayingStateSnapshotSchema = v.pipe(
  PlayingStateSnapshotObjectSchema,
  v.check((snapshot) => {
    const roomPlayerIds = snapshot.room.players.map(
      (player) => player.playerId,
    );

    return new Set(roomPlayerIds).size === roomPlayerIds.length;
  }, "Room players must not contain duplicate players."),
  v.check((snapshot) => {
    const roomPlayerIds = new Set(
      snapshot.room.players.map((player) => player.playerId),
    );

    return (
      snapshot.game.turnOrder.length === roomPlayerIds.size &&
      snapshot.game.turnOrder.every((playerId) => roomPlayerIds.has(playerId))
    );
  }, "Turn order must contain each Room player exactly once."),
  v.check((snapshot) => {
    const selfPublicView = snapshot.room.players.find(
      (player) => player.playerId === snapshot.self.playerId,
    );

    return (
      selfPublicView !== undefined &&
      selfPublicView.rackCount === snapshot.self.rack.length
    );
  }, "The private rack must match the self public rack count."),
  v.check(
    (snapshot) =>
      new Set(snapshot.self.rack.map((tile) => tile.tileId)).size ===
      snapshot.self.rack.length,
    "The private rack must not contain duplicate Tiles.",
  ),
  v.check((snapshot) => {
    const publicBoardTileIds = new Set(boardTileIds(snapshot.game.board));
    return snapshot.self.rack.every(
      (tile) => !publicBoardTileIds.has(tile.tileId),
    );
  }, "A physical Tile cannot appear on both the Board and the private rack."),
);
export type PlayingStateSnapshot = v.InferOutput<
  typeof PlayingStateSnapshotSchema
>;

const FinishedStateSnapshotObjectSchema = v.strictObject({
  protocolVersion: ProtocolVersionSchema,
  versions: FinishedStateVersionsSchema,
  serverTime: ServerTimeSchema,
  room: FinishedPublicRoomViewSchema,
  game: FinishedPublicGameViewSchema,
  self: PlayingPrivatePlayerViewSchema,
});

export const FinishedStateSnapshotSchema = v.pipe(
  FinishedStateSnapshotObjectSchema,
  v.check((snapshot) => {
    const roomPlayerIds = snapshot.room.players.map(
      (player) => player.playerId,
    );

    return new Set(roomPlayerIds).size === roomPlayerIds.length;
  }, "Room players must not contain duplicate players."),
  v.check((snapshot) => {
    const roomPlayerIds = new Set(
      snapshot.room.players.map((player) => player.playerId),
    );

    return (
      snapshot.game.turnOrder.length === roomPlayerIds.size &&
      snapshot.game.turnOrder.every((playerId) => roomPlayerIds.has(playerId))
    );
  }, "Turn order must contain each Room player exactly once."),
  v.check((snapshot) => {
    const selfPublicView = snapshot.room.players.find(
      (player) => player.playerId === snapshot.self.playerId,
    );

    return (
      selfPublicView !== undefined &&
      selfPublicView.rackCount === snapshot.self.rack.length
    );
  }, "The private rack must match the self public rack count."),
  v.check(
    (snapshot) =>
      new Set(snapshot.self.rack.map((tile) => tile.tileId)).size ===
      snapshot.self.rack.length,
    "The private rack must not contain duplicate Tiles.",
  ),
  v.check((snapshot) => {
    const publicBoardTileIds = new Set(boardTileIds(snapshot.game.board));
    return snapshot.self.rack.every(
      (tile) => !publicBoardTileIds.has(tile.tileId),
    );
  }, "A physical Tile cannot appear on both the Board and the private rack."),
);
export type FinishedStateSnapshot = v.InferOutput<
  typeof FinishedStateSnapshotSchema
>;

export const StateSnapshotSchema = v.union([
  LobbyStateSnapshotSchema,
  PlayingStateSnapshotSchema,
  FinishedStateSnapshotSchema,
]);
export type StateSnapshot = v.InferOutput<typeof StateSnapshotSchema>;
