import type {
  GameId,
  GameRevision,
  PlayerId,
  ServerTime,
} from "@hangul-rummikub/shared";

import type { PlayingGameState } from "../domain/game/game-state.js";
import {
  createForfeitResult,
  createStalemateResult,
} from "../domain/game/result-engine.js";
import {
  isStalemateCycleComplete,
  pruneNoMoveTurnEnds,
} from "../domain/game/stalemate.js";
import type {
  RoomRecord,
  RoomWriteCandidate,
} from "../model/persistence.js";
import type { IdGenerator } from "../ports/system.js";
import { createFinishedRoomTransition } from "../application/game-finish-transition.js";
import {
  createNextTurn,
  incrementGameRevision,
  type CurrentTurnIdentity,
} from "../application/turn-transition.js";
import { LEGACY_V1_DEFAULT_GAME_TYPE } from "./legacy-hangul-compatibility-registration.js";

export type LegacyHangulPlayingLeaveAdvisory =
  | "NONE"
  | "TURN_STARTED"
  | "GAME_FINISHED";

export type LegacyHangulPlayingLeaveInput = Readonly<{
  room: RoomRecord;
  actorPlayerId: PlayerId;
  occurredAt: ServerTime;
  idGenerator: IdGenerator;
}>;

export type LegacyHangulPlayingLeaveActionResult = Readonly<{
  candidate: RoomWriteCandidate;
  nextTurnIdentity: CurrentTurnIdentity | null;
  finishedGameId: GameId | null;
  advisory: LegacyHangulPlayingLeaveAdvisory;
}>;

export type LegacyHangulPresenceRestoredPlan =
  | Readonly<{ status: "NO_CHANGE" }>
  | Readonly<{
      status: "RESET";
      game: PlayingGameState;
      gameId: GameId;
      gameRevision: GameRevision;
      previousOfflineTimeoutStreak: number;
    }>;

export interface LegacyHangulPlayerLifecycleActionRouting {
  readonly gameType: typeof LEGACY_V1_DEFAULT_GAME_TYPE;
  applyPlayingLeave(
    input: Omit<LegacyHangulPlayingLeaveInput, "idGenerator">,
  ): LegacyHangulPlayingLeaveActionResult;
  planPresenceRestored(
    room: RoomRecord,
    playerId: PlayerId,
  ): LegacyHangulPresenceRestoredPlan;
}

function requireLegacyHangulGameType(room: RoomRecord): void {
  if (room.gameType !== LEGACY_V1_DEFAULT_GAME_TYPE) {
    throw new TypeError(
      "Legacy Hangul player lifecycle action received an unsupported gameType.",
    );
  }
}

function requirePlayingGame(room: RoomRecord): PlayingGameState {
  if (
    room.phase !== "PLAYING" ||
    room.game === null ||
    room.game.turn === null ||
    room.game.result !== null
  ) {
    throw new TypeError(
      "Legacy Hangul Playing leave requires an active GameState.",
    );
  }

  return room.game;
}

/**
 * Produces the Hangul-specific part of an explicit Playing leave without
 * committing storage, deleting a session, or scheduling post-commit work.
 */
export function applyLegacyHangulPlayingLeave(
  input: LegacyHangulPlayingLeaveInput,
): LegacyHangulPlayingLeaveActionResult {
  requireLegacyHangulGameType(input.room);
  const game = requirePlayingGame(input.room);

  if (game.forfeitedPlayerIds.has(input.actorPlayerId)) {
    return Object.freeze({
      candidate: { ...input.room, updatedAt: input.occurredAt },
      nextTurnIdentity: null,
      finishedGameId: null,
      advisory: "NONE",
    });
  }

  const forfeitedPlayerIds = new Set(game.forfeitedPlayerIds);
  forfeitedPlayerIds.add(input.actorPlayerId);
  const actorWasCurrent = game.turn.activePlayerId === input.actorPlayerId;
  const gameRevision = incrementGameRevision(game.gameRevision);
  const noMoveTurnEndPlayerIds = pruneNoMoveTurnEnds(
    game.turnOrder,
    forfeitedPlayerIds,
    game.noMoveTurnEndPlayerIds,
  );
  const gameBase: PlayingGameState = Object.freeze({
    ...game,
    gameRevision,
    forfeitedPlayerIds: Object.freeze(forfeitedPlayerIds),
    noMoveTurnEndPlayerIds,
  });
  const resultInput = {
    playerIds: game.turnOrder,
    racks: game.racks,
    tilesById: game.tilesById,
    forfeitedPlayerIds,
    finishedAt: input.occurredAt,
  } as const;
  const forfeitResult = createForfeitResult(resultInput);
  const result =
    forfeitResult ??
    (isStalemateCycleComplete(
      game.turnOrder,
      forfeitedPlayerIds,
      noMoveTurnEndPlayerIds,
    )
      ? createStalemateResult(resultInput)
      : null);

  if (result !== null) {
    const transition = createFinishedRoomTransition(
      input.room,
      game,
      result,
      input.occurredAt,
      gameBase,
    );
    return Object.freeze({
      candidate: transition.roomCandidate,
      nextTurnIdentity: null,
      finishedGameId: game.gameId,
      advisory: "GAME_FINISHED",
    });
  }

  const nextTurn = actorWasCurrent
    ? createNextTurn(
        game,
        input.occurredAt,
        input.idGenerator,
        forfeitedPlayerIds,
      )
    : game.turn;
  const nextGame: PlayingGameState = Object.freeze({
    ...gameBase,
    turn: nextTurn,
  });

  return Object.freeze({
    candidate: {
      ...input.room,
      game: nextGame,
      updatedAt: input.occurredAt,
    },
    nextTurnIdentity: {
      roomId: input.room.roomId,
      gameId: game.gameId,
      gameRevision,
      turnId: nextTurn.turnId,
    },
    finishedGameId: null,
    advisory: actorWasCurrent ? "TURN_STARTED" : "NONE",
  });
}

/**
 * Plans only the Hangul offline-timeout streak reset caused by restored
 * presence. The caller remains responsible for leases, Room serialization,
 * timestamps, idempotency, and the atomic storage commit.
 */
export function planLegacyHangulPresenceRestored(
  room: RoomRecord,
  playerId: PlayerId,
): LegacyHangulPresenceRestoredPlan {
  requireLegacyHangulGameType(room);
  if (
    room.phase !== "PLAYING" ||
    room.game === null ||
    room.game.turn === null ||
    room.game.result !== null
  ) {
    return Object.freeze({ status: "NO_CHANGE" });
  }

  const currentStreak = room.game.offlineTimeoutStreakByPlayerId.get(playerId);
  if (currentStreak === undefined || currentStreak === 0) {
    return Object.freeze({ status: "NO_CHANGE" });
  }

  const offlineTimeoutStreakByPlayerId = new Map(
    room.game.offlineTimeoutStreakByPlayerId,
  );
  offlineTimeoutStreakByPlayerId.set(playerId, 0);
  const game: PlayingGameState = Object.freeze({
    ...room.game,
    offlineTimeoutStreakByPlayerId,
  });

  return Object.freeze({
    status: "RESET",
    game,
    gameId: game.gameId,
    gameRevision: game.gameRevision,
    previousOfflineTimeoutStreak: currentStreak,
  });
}

/** Creates one immutable compatibility capability for explicit wiring. */
export function createLegacyHangulPlayerLifecycleActions(
  idGenerator: IdGenerator,
): LegacyHangulPlayerLifecycleActionRouting {
  return Object.freeze({
    gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
    applyPlayingLeave: (
      input: Omit<LegacyHangulPlayingLeaveInput, "idGenerator">,
    ) => applyLegacyHangulPlayingLeave({ ...input, idGenerator }),
    planPresenceRestored: planLegacyHangulPresenceRestored,
  });
}
