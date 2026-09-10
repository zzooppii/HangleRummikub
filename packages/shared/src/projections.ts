import * as v from "valibot";

import {
  FinishedPublicGameViewSchema,
  PlayingPrivatePlayerViewSchema,
  PublicGameViewSchema,
  TileCountSchema,
  boardTileIds,
} from "./games/hangul-tile/v1-projection-contracts.js";
import {
  NicknameSchema,
  PlayerIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
} from "./identifiers.js";
import {
  GameRevisionSchema,
  PresenceVersionSchema,
  ProtocolVersionSchema,
  RoomPhaseSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
} from "./protocol.js";

export {
  FinishedPublicGameViewSchema,
  GameFinishReasonSchema,
  GameRankSchema,
  GameResultSchema,
  GameScoreSchema,
  JokerPrivateRackTileViewSchema,
  OrdinaryPrivateRackTileViewSchema,
  PlayingPrivatePlayerViewSchema,
  PrivateRackTileViewSchema,
  PublicBagCountsSchema,
  PublicBoardSyllableSchema,
  PublicBoardTilePlacementSchema,
  PublicBoardViewSchema,
  PublicGameRankingEntrySchema,
  PublicGameViewSchema,
  PublicTurnViewSchema,
  PublicWordGroupSchema,
  TileCountSchema,
  TileSourceBagSchema,
  TurnNumberSchema,
  type FinishedPublicGameView,
  type GameFinishReason,
  type GameRank,
  type GameResult,
  type GameScore,
  type JokerPrivateRackTileView,
  type OrdinaryPrivateRackTileView,
  type PlayingPrivatePlayerView,
  type PrivateRackTileView,
  type PublicBagCounts,
  type PublicBoardSyllable,
  type PublicBoardTilePlacement,
  type PublicBoardView,
  type PublicGameRankingEntry,
  type PublicGameView,
  type PublicTurnView,
  type PublicWordGroup,
  type TileCount,
  type TileSourceBag,
  type TurnNumber,
} from "./games/hangul-tile/v1-projection-contracts.js";

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
  forfeited: v.boolean(),
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
  players: v.pipe(v.array(PublicPlayerViewSchema), v.maxLength(10)),
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

export const PrivatePlayerViewSchema = v.strictObject({
  playerId: PlayerIdSchema,
});
export type PrivatePlayerView = v.InferOutput<typeof PrivatePlayerViewSchema>;

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
  v.check(
    (snapshot) =>
      snapshot.game.result.rankings.every((entry) => {
        const player = snapshot.room.players.find(
          (candidate) => candidate.playerId === entry.playerId,
        );
        return (
          player !== undefined &&
          player.rackCount === entry.remainingRackCount &&
          player.forfeited === entry.forfeited
        );
      }),
    "Finished result metadata must match the public Player summary.",
  ),
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
