import {
  RoomRevisionSchema,
  ServerTimeSchema,
  TurnNumberSchema,
  type GameId,
  type GameRevision,
  type RoomId,
  type ServerTime,
  type TurnId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { nextGameRevision } from "../../../domain/game-revision.js";
import type {
  FinishedNumberTileGameState,
  NumberTileGameState,
  NumberTileTurn,
  PlayingNumberTileGameState,
} from "../domain/game-state.js";
import { NUMBER_TILE_RULES } from "../domain/game-state.js";
import type { NumberTileGameResult } from "../domain/result-engine.js";
import { nextEligibleNumberTilePlayer } from "../domain/stalemate.js";
import type {
  NumberTileRoomRecord,
  RoomWriteCandidate,
} from "../../../model/persistence.js";
import type { IdGenerator } from "../../../ports/system.js";

export type NumberTileCurrentTurnIdentity = Readonly<{
  roomId: RoomId;
  gameId: GameId;
  gameRevision: GameRevision;
  turnId: TurnId;
}>;

export type NumberTileFinishedRoomTransition = Readonly<{
  roomCandidate: RoomWriteCandidate;
  finishedGame: FinishedNumberTileGameState;
}>;

function addTurnDuration(startedAt: ServerTime): ServerTime {
  return parse(
    ServerTimeSchema,
    startedAt + NUMBER_TILE_RULES.turnDurationMs,
  );
}

export function createNextNumberTileTurn(
  game: PlayingNumberTileGameState,
  startedAt: ServerTime,
  idGenerator: Pick<IdGenerator, "generateTurnId">,
  forfeitedPlayerIds = game.forfeitedPlayerIds,
): NumberTileTurn {
  const activePlayerId = nextEligibleNumberTilePlayer(
    game.turnOrder,
    forfeitedPlayerIds,
    game.turn.activePlayerId,
  );
  if (activePlayerId === null) {
    throw new Error("Number Tile has no eligible next Player.");
  }

  return Object.freeze({
    turnId: idGenerator.generateTurnId(),
    turnNumber: parse(TurnNumberSchema, game.turn.turnNumber + 1),
    activePlayerId,
    startedAt: parse(ServerTimeSchema, startedAt),
    deadlineAt: addTurnDuration(startedAt),
  });
}

/**
 * Builds one Number-owned terminal candidate. The supplied game base must
 * still carry the pre-command revision so this boundary increments exactly
 * once for the canonical terminal mutation.
 */
export function createNumberTileFinishedRoomTransition(
  room: NumberTileRoomRecord,
  originalGame: PlayingNumberTileGameState,
  gameBase: PlayingNumberTileGameState,
  result: NumberTileGameResult,
  updatedAt: ServerTime,
): NumberTileFinishedRoomTransition {
  if (
    gameBase.gameId !== originalGame.gameId ||
    gameBase.gameRevision !== originalGame.gameRevision
  ) {
    throw new Error(
      "Number Tile terminal state base must retain the current game identity.",
    );
  }
  if (result.finishedAt !== updatedAt) {
    throw new Error(
      "Number Tile terminal result time must match the Room transition time.",
    );
  }

  const finishedGame: FinishedNumberTileGameState = Object.freeze({
    ...gameBase,
    gameRevision: nextGameRevision(originalGame.gameRevision),
    turn: null,
    result,
  });
  const roomRevision = parse(RoomRevisionSchema, room.roomRevision + 1);

  return Object.freeze({
    finishedGame,
    roomCandidate: Object.freeze({
      roomId: room.roomId,
      roomCode: room.roomCode,
      gameType: "NUMBER_TILE",
      phase: "FINISHED",
      hostPlayerId: room.hostPlayerId,
      players: room.players,
      game: finishedGame,
      roomRevision,
      createdAt: room.createdAt,
      updatedAt,
    }),
  });
}

export function isPlayingNumberTileGame(
  game: NumberTileGameState,
): game is PlayingNumberTileGameState {
  return game.turn !== null && game.result === null;
}
