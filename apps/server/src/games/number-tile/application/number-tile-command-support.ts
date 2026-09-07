import {
  GameIdSchema,
  GameRevisionSchema,
  PlayerIdSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  TurnIdSchema,
  TurnNumberSchema,
  type ErrorDto,
  type GameRevision,
  type PlayerId,
  type RequestId,
  type RoomId,
  type ServerTime,
  type TurnId,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type { CurrentActorAuthorization } from "../../../application/game-start-service.js";
import type {
  NumberTileRoomRecord,
  RoomRecord,
} from "../../../model/persistence.js";
import type { RoomUnitOfWorkResult } from "../../../ports/room-unit-of-work.js";
import type { PlayingNumberTileGameState } from "../domain/game-state.js";
import { isNumberTileActionBeforeDeadline } from "../domain/game-state.js";

export type NumberTileTurnCommandInput = Readonly<{
  roomId: RoomId;
  actorPlayerId: PlayerId;
  requestId: RequestId;
  expectedGameRevision: GameRevision;
  turnId: TurnId;
  receivedAt: ServerTime;
  authorization: CurrentActorAuthorization;
}>;

export const NumberTileAdvancedDataSchema = v.strictObject({
  roomId: RoomIdSchema,
  gameId: GameIdSchema,
  roomRevision: RoomRevisionSchema,
  gameRevision: GameRevisionSchema,
  outcome: v.literal("ADVANCED"),
  nextTurnId: TurnIdSchema,
  nextTurnNumber: TurnNumberSchema,
});
export type NumberTileAdvancedData = v.InferOutput<
  typeof NumberTileAdvancedDataSchema
>;

export const NumberTileFinishedDataSchema = v.strictObject({
  roomId: RoomIdSchema,
  gameId: GameIdSchema,
  roomRevision: RoomRevisionSchema,
  gameRevision: GameRevisionSchema,
  outcome: v.literal("FINISHED"),
  finishReason: v.picklist([
    "RACK_EMPTY",
    "STALEMATE",
    "LAST_PLAYER_STANDING",
  ]),
  winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.minLength(1), v.maxLength(4)),
});
export type NumberTileFinishedData = v.InferOutput<
  typeof NumberTileFinishedDataSchema
>;

export const NumberTileMutationDataSchema = v.variant("outcome", [
  NumberTileAdvancedDataSchema,
  NumberTileFinishedDataSchema,
]);
export type NumberTileMutationData = v.InferOutput<
  typeof NumberTileMutationDataSchema
>;

export type NumberTileMutationResult =
  | Readonly<{ ok: true; data: NumberTileMutationData }>
  | Readonly<{ ok: false; error: ErrorDto }>;

export const NUMBER_TILE_COMMAND_ERRORS = Object.freeze({
  ROOM_NOT_FOUND: Object.freeze({
    code: "ROOM_NOT_FOUND",
    message: "Room was not found.",
    recoverable: false,
  }),
  INVALID_PHASE: Object.freeze({
    code: "INVALID_PHASE",
    message: "The Room is not accepting this Number Tile action.",
    recoverable: false,
  }),
  UNAUTHENTICATED: Object.freeze({
    code: "UNAUTHENTICATED",
    message: "The command actor is no longer authorized.",
    recoverable: true,
  }),
  NOT_YOUR_TURN: Object.freeze({
    code: "NOT_YOUR_TURN",
    message: "The submitted Turn is not the actor's current Turn.",
    recoverable: true,
  }),
  TURN_EXPIRED: Object.freeze({
    code: "TURN_EXPIRED",
    message: "The Turn deadline has passed.",
    recoverable: true,
  }),
  STALE_GAME_REVISION: Object.freeze({
    code: "STALE_GAME_REVISION",
    message: "The Game state is stale.",
    recoverable: true,
  }),
  REQUEST_ID_REUSED: Object.freeze({
    code: "REQUEST_ID_REUSED",
    message: "Request ID was already used for a different command payload.",
    recoverable: false,
  }),
  INVALID_TILE_ACCESS: Object.freeze({
    code: "INVALID_TILE_ACCESS",
    message: "The proposed Table contains an unavailable Tile.",
    recoverable: true,
  }),
  INVALID_TABLE: Object.freeze({
    code: "INVALID_TABLE",
    message: "The proposed Number Tile Table is invalid.",
    recoverable: true,
  }),
  INVALID_MELD: Object.freeze({
    code: "INVALID_MELD",
    message: "A proposed Number Tile meld is invalid.",
    recoverable: true,
  }),
  INITIAL_MELD_REQUIRED: Object.freeze({
    code: "INITIAL_MELD_REQUIRED",
    message: "The initial meld must use only Tiles from the actor's rack.",
    recoverable: true,
  }),
  INITIAL_MELD_TOO_LOW: Object.freeze({
    code: "INITIAL_MELD_TOO_LOW",
    message: "The initial meld value is below 30.",
    recoverable: true,
  }),
  TABLE_REARRANGEMENT_NOT_ALLOWED: Object.freeze({
    code: "TABLE_REARRANGEMENT_NOT_ALLOWED",
    message: "The existing Table cannot be rearranged before the initial meld.",
    recoverable: true,
  }),
  NO_NEW_RACK_TILE: Object.freeze({
    code: "NO_NEW_RACK_TILE",
    message: "At least one Tile from the actor's rack must be played.",
    recoverable: true,
  }),
  INVALID_JOKER_ASSIGNMENT: Object.freeze({
    code: "INVALID_JOKER_ASSIGNMENT",
    message: "A Joker placement is invalid.",
    recoverable: true,
  }),
  POOL_EMPTY: Object.freeze({
    code: "POOL_EMPTY",
    message: "The Number Tile pool is empty.",
    recoverable: true,
  }),
  PASS_NOT_ALLOWED: Object.freeze({
    code: "PASS_NOT_ALLOWED",
    message: "Pass is allowed only when the Number Tile pool is empty.",
    recoverable: true,
  }),
  INTERNAL_ERROR: Object.freeze({
    code: "INTERNAL_ERROR",
    message: "An internal error occurred.",
    recoverable: false,
  }),
} satisfies Readonly<Record<string, ErrorDto>>);

export function numberTileCommandScope(
  input: Pick<NumberTileTurnCommandInput, "roomId" | "actorPlayerId">,
): string {
  return `room-player:${input.roomId}:${input.actorPlayerId}`;
}

export function asNumberTilePlayingRoom(
  room: RoomRecord,
): (NumberTileRoomRecord & Readonly<{ game: PlayingNumberTileGameState }>) | null {
  const game = room.gameType === "NUMBER_TILE" ? room.game : null;
  if (
    room.gameType !== "NUMBER_TILE" ||
    room.phase !== "PLAYING" ||
    game === null ||
    game.turn === null ||
    game.result !== null
  ) {
    return null;
  }
  return Object.freeze({ ...room, game });
}

export function isSameNumberTileTurn(
  latest: RoomRecord,
  original: NumberTileRoomRecord,
  originalGame: PlayingNumberTileGameState,
): latest is NumberTileRoomRecord & Readonly<{ game: PlayingNumberTileGameState }> {
  const playing = asNumberTilePlayingRoom(latest);
  return (
    playing !== null &&
    playing.game.gameId === originalGame.gameId &&
    playing.game.gameRevision === originalGame.gameRevision &&
    playing.game.turn.turnId === originalGame.turn.turnId &&
    playing.roomRevision === original.roomRevision &&
    playing.storageRevision === original.storageRevision
  );
}

export function validateNumberTileTurnAuthority(
  input: NumberTileTurnCommandInput,
  game: PlayingNumberTileGameState,
): ErrorDto | null {
  if (!input.authorization.isCurrent()) {
    return NUMBER_TILE_COMMAND_ERRORS.UNAUTHENTICATED;
  }
  if (
    game.turn.activePlayerId !== input.actorPlayerId ||
    game.turn.turnId !== input.turnId
  ) {
    return NUMBER_TILE_COMMAND_ERRORS.NOT_YOUR_TURN;
  }
  if (!isNumberTileActionBeforeDeadline(input.receivedAt, game.turn.deadlineAt)) {
    return NUMBER_TILE_COMMAND_ERRORS.TURN_EXPIRED;
  }
  if (game.gameRevision !== input.expectedGameRevision) {
    return NUMBER_TILE_COMMAND_ERRORS.STALE_GAME_REVISION;
  }
  return null;
}

export function mapNumberTileCommitFailure(
  result: Exclude<RoomUnitOfWorkResult, { status: "COMMITTED" | "REPLAY" }>,
): ErrorDto {
  if (result.status === "IDEMPOTENCY_CONFLICT") {
    return NUMBER_TILE_COMMAND_ERRORS.REQUEST_ID_REUSED;
  }
  if (result.reason === "COMMIT_PRECONDITION_FAILED") {
    return NUMBER_TILE_COMMAND_ERRORS.UNAUTHENTICATED;
  }
  if (
    result.reason === "ROOM_NOT_FOUND" ||
    result.reason === "STALE_ROOM_REVISION" ||
    result.reason === "STALE_STORAGE_REVISION"
  ) {
    return NUMBER_TILE_COMMAND_ERRORS.STALE_GAME_REVISION;
  }
  return NUMBER_TILE_COMMAND_ERRORS.INTERNAL_ERROR;
}

export function success(
  data: NumberTileMutationData,
): NumberTileMutationResult {
  return { ok: true, data };
}

export function failure(error: ErrorDto): NumberTileMutationResult {
  return { ok: false, error };
}

export function parseNumberTileMutationReplay(
  terminalResult: unknown,
): NumberTileMutationResult {
  const parsed = v.safeParse(NumberTileMutationDataSchema, terminalResult);
  return parsed.success
    ? success(parsed.output)
    : failure(NUMBER_TILE_COMMAND_ERRORS.INTERNAL_ERROR);
}
