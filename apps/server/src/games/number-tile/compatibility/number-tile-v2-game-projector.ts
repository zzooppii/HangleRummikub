import {
  NumberTileFinishedProjectionV2Schema,
  NumberTilePlayingProjectionV2Schema,
  type NumberTileFinishedProjectionV2,
  type NumberTilePlayingProjectionV2,
  type PlayerId,
  type TileId,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type {
  FinishedNumberTileGameState,
  NumberTileGameState,
  PlayingNumberTileGameState,
} from "../domain/game-state.js";
import type { NumberTileGameResult } from "../domain/result-engine.js";
import type { NumberTilePlacement } from "../domain/table.js";

type ProjectNumberTileV2GameBase = Readonly<{
  playerIds: readonly PlayerId[];
  selfPlayerId: PlayerId;
}>;

export type ProjectNumberTilePlayingV2GameInput =
  ProjectNumberTileV2GameBase &
    Readonly<{
      phase: "PLAYING";
      game: PlayingNumberTileGameState;
    }>;

export type ProjectNumberTileFinishedV2GameInput =
  ProjectNumberTileV2GameBase &
    Readonly<{
      phase: "FINISHED";
      game: FinishedNumberTileGameState;
    }>;

export type ProjectNumberTileV2GameInput = ProjectNumberTileV2GameBase &
  Readonly<{
    phase: "PLAYING" | "FINISHED";
    game: NumberTileGameState;
  }>;

function projectPhysicalTile(game: NumberTileGameState, tileId: TileId) {
  const tile = game.tilesById.get(tileId);
  if (tile === undefined) {
    throw new Error("Number Tile projection references an unknown Tile.");
  }
  return tile.kind === "JOKER"
    ? { tileId: tile.tileId, kind: tile.kind }
    : {
        tileId: tile.tileId,
        kind: tile.kind,
        number: tile.number,
        color: tile.color,
      };
}

function projectTablePlacement(
  game: NumberTileGameState,
  placement: NumberTilePlacement,
) {
  const tile = game.tilesById.get(placement.tileId);
  if (tile === undefined) {
    throw new Error(
      "Number Tile Table placement does not match its canonical physical Tile.",
    );
  }
  if (placement.kind === "JOKER") {
    if (tile.kind !== "JOKER") {
      throw new Error(
        "Number Tile Table placement does not match its canonical physical Tile.",
      );
    }
    return {
      tileId: placement.tileId,
      kind: placement.kind,
    };
  }
  if (tile.kind !== "ORDINARY") {
    throw new Error(
      "Number Tile Table placement does not match its canonical physical Tile.",
    );
  }
  return {
    tileId: tile.tileId,
    kind: tile.kind,
    number: tile.number,
    color: tile.color,
  };
}

function projectTable(game: NumberTileGameState) {
  return {
    melds: game.table.melds.map((meld) => ({
      kind: meld.kind,
      tiles: meld.tiles.map((placement) =>
        projectTablePlacement(game, placement),
      ),
    })),
  };
}

function projectPlayerStates(
  game: NumberTileGameState,
  playerIds: readonly PlayerId[],
) {
  if (
    playerIds.length !== game.turnOrder.length ||
    new Set(playerIds).size !== playerIds.length ||
    game.turnOrder.some((playerId) => !playerIds.includes(playerId))
  ) {
    throw new Error(
      "Number Tile projection Players do not match the canonical Game.",
    );
  }

  return playerIds.map((playerId) => {
    const rack = game.racks.get(playerId);
    const initialMeldCompleted = game.initialMeldCompleted.get(playerId);
    if (rack === undefined || initialMeldCompleted === undefined) {
      throw new Error(
        "Number Tile projection is missing registered Player state.",
      );
    }
    return {
      playerId,
      rackCount: rack.length,
      initialMeldCompleted,
      forfeited: game.forfeitedPlayerIds.has(playerId),
    };
  });
}

function projectPrivateState(
  game: NumberTileGameState,
  selfPlayerId: PlayerId,
) {
  const rack = game.racks.get(selfPlayerId);
  if (rack === undefined) {
    throw new Error("Number Tile snapshot self Player has no canonical rack.");
  }
  return {
    rack: rack.map((tileId) => projectPhysicalTile(game, tileId)),
  };
}

function projectResult(result: NumberTileGameResult) {
  if ("rankingMode" in result) return { ...result, rankings: result.rankings.map(entry => ({ ...entry })), winnerPlayerIds: [...result.winnerPlayerIds] };
  return result.reason === "STALEMATE"
    ? {
        reason: result.reason,
        finishedAt: result.finishedAt,
        winnerPlayerIds: [...result.winnerPlayerIds],
        rankings: result.rankings.map((entry) => ({ ...entry })),
      }
    : {
        reason: result.reason,
        finishedAt: result.finishedAt,
        winnerPlayerIds: [...result.winnerPlayerIds],
        playerResults: result.playerResults.map((entry) => ({ ...entry })),
      };
}

function projectCommon(input: ProjectNumberTileV2GameInput) {
  return {
    gameType: "NUMBER_TILE" as const,
    gameId: input.game.gameId,
    gameRevision: input.game.gameRevision,
    ...(input.game.placementOrder === undefined ? {} : { placementOrder: [...input.game.placementOrder] }),
    remainingPoolCount: input.game.pool.length,
    table: projectTable(input.game),
    playerStates: projectPlayerStates(input.game, input.playerIds),
    privateState: projectPrivateState(input.game, input.selfPlayerId),
  };
}

export function projectNumberTileV2Game(
  input: ProjectNumberTilePlayingV2GameInput,
): NumberTilePlayingProjectionV2;
export function projectNumberTileV2Game(
  input: ProjectNumberTileFinishedV2GameInput,
): NumberTileFinishedProjectionV2;
export function projectNumberTileV2Game(
  input: ProjectNumberTileV2GameInput,
): NumberTilePlayingProjectionV2 | NumberTileFinishedProjectionV2;
export function projectNumberTileV2Game(
  input: ProjectNumberTileV2GameInput,
): NumberTilePlayingProjectionV2 | NumberTileFinishedProjectionV2 {
  if (input.phase === "PLAYING") {
    if (input.game.turn === null || input.game.result !== null) {
      throw new Error(
        "PLAYING Number Tile Room requires an active canonical Turn.",
      );
    }
    return v.parse(NumberTilePlayingProjectionV2Schema, {
      ...projectCommon(input),
      turn: { ...input.game.turn },
    });
  }

  if (input.game.turn !== null || input.game.result === null) {
    throw new Error(
      "FINISHED Number Tile Room requires a canonical terminal Result.",
    );
  }
  return v.parse(NumberTileFinishedProjectionV2Schema, {
    ...projectCommon(input),
    result: projectResult(input.game.result),
  });
}

export type NumberTileV2GameProjector = typeof projectNumberTileV2Game;
