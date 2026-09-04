import type { PlayerId } from "@hangul-rummikub/shared";

import type { BoardTilePlacement } from "../domain/game/board.js";
import type { GameState } from "../domain/game/game-state.js";
import { JOKER_ALLOWED_SYMBOLS } from "../domain/game/tile-inventory.js";

export type ProjectLegacyHangulV1GameInput = Readonly<{
  phase: "PLAYING" | "FINISHED";
  playerIds: readonly PlayerId[];
  selfPlayerId: PlayerId;
  game: GameState;
}>;

function projectPrivateRack(game: GameState, playerId: PlayerId) {
  const rack = game.racks.get(playerId);
  if (rack === undefined) {
    throw new Error("Snapshot self Player has no canonical rack.");
  }

  return rack.map((tileId) => {
    const tile = game.tilesById.get(tileId);
    if (tile === undefined) {
      throw new Error("Rack contains an unknown Tile.");
    }

    return tile.kind === "JOKER"
      ? {
          tileId: tile.tileId,
          kind: tile.kind,
          physicalType: tile.physicalType,
          sourceBag: tile.sourceBag,
          allowedSymbols: [...JOKER_ALLOWED_SYMBOLS],
        }
      : {
          tileId: tile.tileId,
          kind: tile.kind,
          physicalType: tile.physicalType,
          sourceBag: tile.sourceBag,
          allowedSymbols: [...tile.allowedSymbols],
        };
  });
}

function projectPlayerProgress(
  game: GameState,
  playerIds: readonly PlayerId[],
) {
  return playerIds.map((playerId) => {
    const rack = game.racks.get(playerId);
    const initialMeldCompleted = game.initialMeldCompleted.get(playerId);
    if (rack === undefined || initialMeldCompleted === undefined) {
      throw new Error("GameState is missing a registered Player state.");
    }

    return {
      playerId,
      rackCount: rack.length,
      initialMeldCompleted,
      forfeited: game.forfeitedPlayerIds.has(playerId),
    };
  });
}

function projectBoardPlacement(
  game: GameState,
  placement: BoardTilePlacement,
) {
  const tile = game.tilesById.get(placement.tileId);
  if (tile === undefined) {
    throw new Error("Board contains an unknown Tile.");
  }

  return tile.kind === "JOKER"
    ? {
        tileId: tile.tileId,
        kind: tile.kind,
        physicalType: tile.physicalType,
        assignedSymbol: placement.assignedSymbol,
        allowedSymbols: [...JOKER_ALLOWED_SYMBOLS],
      }
    : {
        tileId: tile.tileId,
        kind: tile.kind,
        physicalType: tile.physicalType,
        assignedSymbol: placement.assignedSymbol,
        allowedSymbols: [...tile.allowedSymbols],
      };
}

function projectPublicBoard(game: GameState) {
  return {
    wordGroups: game.board.wordGroups.map((wordGroup) => ({
      groupId: wordGroup.groupId,
      syllables: wordGroup.syllables.map((syllable) => ({
        choseong: syllable.choseong.map((placement) =>
          projectBoardPlacement(game, placement),
        ),
        jungseong: syllable.jungseong.map((placement) =>
          projectBoardPlacement(game, placement),
        ),
        jongseong: syllable.jongseong.map((placement) =>
          projectBoardPlacement(game, placement),
        ),
      })),
    })),
  };
}

function projectCommonGame(game: GameState) {
  return {
    gameId: game.gameId,
    board: projectPublicBoard(game),
    turnOrder: game.turnOrder,
    bagCounts: {
      consonant: game.consonantBag.length,
      vowel: game.vowelBag.length,
    },
  };
}

/**
 * Owns the Legacy Hangul v1 player-private/public Game projection only.
 * The outer Room projector remains responsible for the platform shell and
 * final StateSnapshot v1 validation.
 */
export function projectLegacyHangulV1Game(
  input: ProjectLegacyHangulV1GameInput,
) {
  const { game } = input;
  if (
    (input.phase === "PLAYING" &&
      (game.turn === null || game.result !== null)) ||
    (input.phase === "FINISHED" &&
      (game.turn !== null || game.result === null))
  ) {
    throw new Error("Room phase and canonical GameState are inconsistent.");
  }

  const commonProjection = {
    gameRevision: game.gameRevision,
    playerProgress: projectPlayerProgress(game, input.playerIds),
    privateRack: projectPrivateRack(game, input.selfPlayerId),
    game: projectCommonGame(game),
  };

  if (input.phase === "PLAYING" && game.turn !== null) {
    return {
      ...commonProjection,
      phase: "PLAYING" as const,
      game: {
        ...commonProjection.game,
        turn: game.turn,
      },
    };
  }

  if (input.phase === "FINISHED" && game.result !== null) {
    return {
      ...commonProjection,
      phase: "FINISHED" as const,
      game: {
        ...commonProjection.game,
        result: {
          reason: game.result.reason,
          winnerPlayerIds: [...game.result.winnerPlayerIds],
          rankings: game.result.rankings.map((entry) => ({ ...entry })),
          finishedAt: game.result.finishedAt,
        },
      },
    };
  }

  throw new Error("Room phase and canonical GameState are inconsistent.");
}

export type LegacyHangulV1GameProjector =
  typeof projectLegacyHangulV1Game;
