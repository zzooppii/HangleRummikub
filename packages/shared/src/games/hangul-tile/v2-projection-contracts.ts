import * as v from "valibot";

import { PlayerIdSchema } from "../../identifiers.js";
import { GameRevisionSchema } from "../../protocol.js";
import {
  FinishedPublicGameViewSchema,
  PrivateRackTileViewSchema,
  PublicGameViewSchema,
  TileCountSchema,
  boardTileIds,
} from "./v1-projection-contracts.js";

export const HangulTilePlayerStateV2Schema = v.strictObject({
  playerId: PlayerIdSchema,
  rackCount: TileCountSchema,
  initialMeldCompleted: v.boolean(),
  forfeited: v.boolean(),
});
export type HangulTilePlayerStateV2 = v.InferOutput<
  typeof HangulTilePlayerStateV2Schema
>;

export const HangulTilePrivateStateV2Schema = v.strictObject({
  rack: v.array(PrivateRackTileViewSchema),
});
export type HangulTilePrivateStateV2 = v.InferOutput<
  typeof HangulTilePrivateStateV2Schema
>;

const HangulTilePlayerStatesV2Schema = v.pipe(
  v.array(HangulTilePlayerStateV2Schema),
  v.minLength(2),
  v.maxLength(4),
);

const HangulTilePlayingProjectionV2ObjectSchema = v.strictObject({
  gameType: v.literal("HANGUL_TILE"),
  gameRevision: GameRevisionSchema,
  publicState: PublicGameViewSchema,
  playerStates: HangulTilePlayerStatesV2Schema,
  privateState: HangulTilePrivateStateV2Schema,
});

export const HangulTilePlayingProjectionV2Schema = v.pipe(
  HangulTilePlayingProjectionV2ObjectSchema,
  v.check(
    (projection) =>
      new Set(projection.playerStates.map((player) => player.playerId)).size ===
      projection.playerStates.length,
    "Hangul player states must not contain duplicate players.",
  ),
  v.check((projection) => {
    const playerIds = new Set(
      projection.playerStates.map((player) => player.playerId),
    );
    return (
      projection.publicState.turnOrder.length === playerIds.size &&
      projection.publicState.turnOrder.every((playerId) =>
        playerIds.has(playerId)
      )
    );
  }, "Hangul turn order must contain every game player exactly once."),
  v.check(
    (projection) =>
      new Set(projection.privateState.rack.map((tile) => tile.tileId)).size ===
      projection.privateState.rack.length,
    "The private Hangul rack must not contain duplicate Tiles.",
  ),
  v.check((projection) => {
    const publicBoardTileIds = new Set(
      boardTileIds(projection.publicState.board),
    );
    return projection.privateState.rack.every(
      (tile) => !publicBoardTileIds.has(tile.tileId),
    );
  }, "A physical Tile cannot appear on both the Hangul Board and private rack."),
);
export type HangulTilePlayingProjectionV2 = v.InferOutput<
  typeof HangulTilePlayingProjectionV2Schema
>;

const HangulTileFinishedProjectionV2ObjectSchema = v.strictObject({
  gameType: v.literal("HANGUL_TILE"),
  gameRevision: GameRevisionSchema,
  publicState: FinishedPublicGameViewSchema,
  playerStates: HangulTilePlayerStatesV2Schema,
  privateState: HangulTilePrivateStateV2Schema,
});

export const HangulTileFinishedProjectionV2Schema = v.pipe(
  HangulTileFinishedProjectionV2ObjectSchema,
  v.check(
    (projection) =>
      new Set(projection.playerStates.map((player) => player.playerId)).size ===
      projection.playerStates.length,
    "Hangul player states must not contain duplicate players.",
  ),
  v.check((projection) => {
    const playerIds = new Set(
      projection.playerStates.map((player) => player.playerId),
    );
    return (
      projection.publicState.turnOrder.length === playerIds.size &&
      projection.publicState.turnOrder.every((playerId) =>
        playerIds.has(playerId)
      )
    );
  }, "Hangul turn order must contain every game player exactly once."),
  v.check(
    (projection) =>
      new Set(projection.privateState.rack.map((tile) => tile.tileId)).size ===
      projection.privateState.rack.length,
    "The private Hangul rack must not contain duplicate Tiles.",
  ),
  v.check((projection) => {
    const publicBoardTileIds = new Set(
      boardTileIds(projection.publicState.board),
    );
    return projection.privateState.rack.every(
      (tile) => !publicBoardTileIds.has(tile.tileId),
    );
  }, "A physical Tile cannot appear on both the Hangul Board and private rack."),
  v.check(
    (projection) =>
      projection.publicState.result.rankings.every((entry) => {
        const playerState = projection.playerStates.find(
          (candidate) => candidate.playerId === entry.playerId,
        );
        return (
          playerState !== undefined &&
          playerState.rackCount === entry.remainingRackCount &&
          playerState.forfeited === entry.forfeited
        );
      }),
    "Finished Hangul result metadata must match the player game state.",
  ),
);
export type HangulTileFinishedProjectionV2 = v.InferOutput<
  typeof HangulTileFinishedProjectionV2Schema
>;
