import type {
  GameId,
  GameRevision,
  PlayerId,
  ServerTime,
} from "@hangul-rummikub/shared";

import { nextGameRevision } from "../../../domain/game-revision.js";
import type { CurrentTurnIdentity } from "../../../application/turn-transition.js";
import type {
  NumberTileRoomRecord,
  RoomRecord,
  RoomWriteCandidate,
} from "../../../model/persistence.js";
import type { IdGenerator } from "../../../ports/system.js";
import type { PlayingNumberTileGameState } from "../domain/game-state.js";
import {
  createNumberTileLastPlayerStandingResult,
  createNumberTileStalemateResult,
} from "../domain/result-engine.js";
import {
  applyNumberTileForfeit,
  evaluateNumberTileFinish,
  resetNumberTileOfflineTimeoutStreak,
} from "../domain/stalemate.js";
import { NUMBER_TILE_GAME_TYPE } from "../number-tile-registration.js";
import {
  createNextNumberTileTurn,
  createNumberTileFinishedRoomTransition,
} from "./number-tile-turn-transition.js";

export type NumberTilePlayingLeaveActionResult = Readonly<{
  candidate: RoomWriteCandidate;
  nextTurnIdentity: CurrentTurnIdentity | null;
  finishedGameId: GameId | null;
  /** Number uses authoritative snapshots and deliberately emits no advisory. */
  advisory: "NONE";
}>;

export type NumberTilePresenceRestoredPlan =
  | Readonly<{ status: "NO_CHANGE" }>
  | Readonly<{
      status: "RESET";
      game: PlayingNumberTileGameState;
      gameId: GameId;
      gameRevision: GameRevision;
      previousOfflineTimeoutStreak: number;
    }>;

export type NumberTilePlayingLeaveActionInput = Readonly<{
  room: RoomRecord;
  actorPlayerId: PlayerId;
  occurredAt: ServerTime;
}>;

export interface NumberTilePlayerLifecycleActionRouting {
  readonly gameType: typeof NUMBER_TILE_GAME_TYPE;
  applyPlayingLeave(
    input: NumberTilePlayingLeaveActionInput,
  ): NumberTilePlayingLeaveActionResult;
  planPresenceRestored(
    room: RoomRecord,
    playerId: PlayerId,
  ): NumberTilePresenceRestoredPlan;
}

function requirePlayingNumberRoom(
  room: RoomRecord,
): NumberTileRoomRecord & Readonly<{ game: PlayingNumberTileGameState }> {
  const game = room.gameType === NUMBER_TILE_GAME_TYPE ? room.game : null;
  if (
    room.gameType !== NUMBER_TILE_GAME_TYPE ||
    room.phase !== "PLAYING" ||
    game === null ||
    game.turn === null ||
    game.result !== null
  ) {
    throw new TypeError(
      "Number Tile player lifecycle action requires an active Number game.",
    );
  }
  return Object.freeze({ ...room, game });
}

export function applyNumberTilePlayingLeave(input: {
  room: RoomRecord;
  actorPlayerId: PlayerId;
  occurredAt: ServerTime;
  idGenerator: IdGenerator;
}): NumberTilePlayingLeaveActionResult {
  const room = requirePlayingNumberRoom(input.room);
  const game = room.game;
  const forfeit = applyNumberTileForfeit(
    game.turnOrder,
    game.forfeitedPlayerIds,
    game.noPlayPlayerIds,
    input.actorPlayerId,
  );
  if (!forfeit.changed) {
    return Object.freeze({
      candidate: { ...room, updatedAt: input.occurredAt },
      nextTurnIdentity: null,
      finishedGameId: null,
      advisory: "NONE",
    });
  }

  const gameBase: PlayingNumberTileGameState = Object.freeze({
    ...game,
    forfeitedPlayerIds: forfeit.forfeitedPlayerIds,
    noPlayPlayerIds: forfeit.noPlayPlayerIds,
  });
  const finish = evaluateNumberTileFinish({
    turnOrder: gameBase.turnOrder,
    forfeitedPlayerIds: gameBase.forfeitedPlayerIds,
    noPlayPlayerIds: gameBase.noPlayPlayerIds,
    poolTileCount: gameBase.pool.length,
    rackEmptyPlayerId: null,
  });
  if (finish !== null) {
    const resultInput = {
      playerIds: gameBase.turnOrder,
      racks: gameBase.racks,
      tilesById: gameBase.tilesById,
      forfeitedPlayerIds: gameBase.forfeitedPlayerIds,
      finishedAt: input.occurredAt,
    } as const;
    const result =
      finish.reason === "STALEMATE"
        ? createNumberTileStalemateResult(resultInput)
        : createNumberTileLastPlayerStandingResult(resultInput);
    const transition = createNumberTileFinishedRoomTransition(
      room,
      game,
      gameBase,
      result,
      input.occurredAt,
    );
    return Object.freeze({
      candidate: transition.roomCandidate,
      nextTurnIdentity: null,
      finishedGameId: game.gameId,
      advisory: "NONE",
    });
  }

  const gameRevision = nextGameRevision(game.gameRevision);
  const turn =
    game.turn.activePlayerId === input.actorPlayerId
      ? createNextNumberTileTurn(
          game,
          input.occurredAt,
          input.idGenerator,
          forfeit.forfeitedPlayerIds,
        )
      : game.turn;
  const nextGame: PlayingNumberTileGameState = Object.freeze({
    ...gameBase,
    gameRevision,
    turn,
  });

  return Object.freeze({
    candidate: Object.freeze({
      ...room,
      game: nextGame,
      updatedAt: input.occurredAt,
    }),
    nextTurnIdentity: Object.freeze({
      roomId: room.roomId,
      gameId: game.gameId,
      gameRevision,
      turnId: turn.turnId,
    }),
    finishedGameId: null,
    advisory: "NONE",
  });
}

export function planNumberTilePresenceRestored(
  room: RoomRecord,
  playerId: PlayerId,
): NumberTilePresenceRestoredPlan {
  if (room.gameType !== NUMBER_TILE_GAME_TYPE) {
    throw new TypeError(
      "Number Tile presence restoration received an unsupported gameType.",
    );
  }
  if (
    room.phase !== "PLAYING" ||
    room.game === null ||
    room.game.turn === null ||
    room.game.result !== null
  ) {
    return Object.freeze({ status: "NO_CHANGE" });
  }
  const previousOfflineTimeoutStreak =
    room.game.offlineTimeoutStreakByPlayerId.get(playerId);
  if (
    previousOfflineTimeoutStreak === undefined ||
    previousOfflineTimeoutStreak === 0
  ) {
    return Object.freeze({ status: "NO_CHANGE" });
  }

  const offlineTimeoutStreakByPlayerId = new Map(
    room.game.offlineTimeoutStreakByPlayerId,
  );
  offlineTimeoutStreakByPlayerId.set(
    playerId,
    resetNumberTileOfflineTimeoutStreak(),
  );
  const game: PlayingNumberTileGameState = Object.freeze({
    ...room.game,
    offlineTimeoutStreakByPlayerId,
  });
  return Object.freeze({
    status: "RESET",
    game,
    gameId: game.gameId,
    gameRevision: game.gameRevision,
    previousOfflineTimeoutStreak,
  });
}

export function createNumberTilePlayerLifecycleActions(
  idGenerator: IdGenerator,
): NumberTilePlayerLifecycleActionRouting {
  return Object.freeze({
    gameType: NUMBER_TILE_GAME_TYPE,
    applyPlayingLeave: (input: NumberTilePlayingLeaveActionInput) =>
      applyNumberTilePlayingLeave({ ...input, idGenerator }),
    planPresenceRestored: planNumberTilePresenceRestored,
  });
}
