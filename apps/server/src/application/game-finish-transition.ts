import {
  RoomRevisionSchema,
  ServerTimeSchema,
  type GameId,
  type RoomId,
  type ServerTime,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type {
  FinishedGameState,
  GameResult,
  PlayingGameState,
} from "../domain/game/game-state.js";
import type { RoomRecord, RoomWriteCandidate } from "../model/persistence.js";
import type { RoomPolicyScheduler } from "../ports/room-policy-scheduler.js";
import type { RoomRepository } from "../ports/room-repository.js";
import { ROOM_RETENTION_MS } from "./room-presence-policy-service.js";
import { incrementGameRevision } from "./turn-transition.js";

export type GameFinishedPostCommitData = Readonly<{
  roomId: RoomId;
  gameId: GameId;
}>;

export type GameFinishedPostCommit = (
  data: GameFinishedPostCommitData,
) => void | Promise<void>;

export type FinishedRetentionSchedulingFailure = GameFinishedPostCommitData &
  Readonly<{ reason: "READ_OR_SCHEDULE_FAILED" }>;

export type FinishedRetentionSchedulingFailureReporter = (
  failure: FinishedRetentionSchedulingFailure,
) => void;

export const FINISHED_RETENTION_SCHEDULING_MAX_ATTEMPTS = 2;

export type FinishedRoomTransition = Readonly<{
  roomCandidate: RoomWriteCandidate;
  finishedGame: FinishedGameState;
}>;

function reportFinishedRetentionSchedulingFailure(
  reporter: FinishedRetentionSchedulingFailureReporter | undefined,
  identity: GameFinishedPostCommitData,
): void {
  if (reporter === undefined) {
    return;
  }
  try {
    reporter({ ...identity, reason: "READ_OR_SCHEDULE_FAILED" });
  } catch {
    // Diagnostics cannot change an already-committed terminal transition.
  }
}

/**
 * Registers retention only for the still-current FINISHED Game. Registration
 * is a bounded post-commit follow-up and therefore can never roll back the
 * canonical result. Both attempts reuse the result's absolute retention
 * deadline instead of extending it from retry time.
 */
export async function scheduleFinishedRetentionBestEffort(
  roomRepository: RoomRepository,
  scheduler: RoomPolicyScheduler | undefined,
  identity: GameFinishedPostCommitData,
  reportFailure?: FinishedRetentionSchedulingFailureReporter,
): Promise<boolean> {
  if (scheduler === undefined) {
    return false;
  }

  try {
    const room = await roomRepository.findById(identity.roomId);
    const game = room?.game;
    if (
      room?.phase !== "FINISHED" ||
      game === null ||
      game === undefined ||
      game.result === null ||
      game.gameId !== identity.gameId
    ) {
      return false;
    }

    const finishedAt = game.result.finishedAt;
    const deadline = Object.freeze({
      kind: "FINISHED_ROOM_RETENTION" as const,
      roomId: room.roomId,
      gameId: game.gameId,
      finishedAt,
      deadlineAt: v.parse(
        ServerTimeSchema,
        finishedAt + ROOM_RETENTION_MS,
      ),
    });
    for (
      let attempt = 1;
      attempt <= FINISHED_RETENTION_SCHEDULING_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        await scheduler.schedule(deadline);
        return true;
      } catch {
        if (attempt === FINISHED_RETENTION_SCHEDULING_MAX_ATTEMPTS) {
          reportFinishedRetentionSchedulingFailure(reportFailure, identity);
        }
      }
    }
    return false;
  } catch {
    reportFinishedRetentionSchedulingFailure(reportFailure, identity);
    return false;
  }
}

/** Builds the single atomic Room/Game terminal candidate. */
export function createFinishedRoomTransition(
  room: RoomRecord,
  game: PlayingGameState,
  result: GameResult,
  updatedAt: ServerTime,
  gameBase: PlayingGameState = game,
): FinishedRoomTransition {
  const gameRevision = incrementGameRevision(game.gameRevision);
  const roomRevision = v.parse(RoomRevisionSchema, room.roomRevision + 1);
  const finishedGame: FinishedGameState = Object.freeze({
    ...gameBase,
    gameRevision,
    turn: null,
    result,
  });

  return Object.freeze({
    finishedGame,
    roomCandidate: Object.freeze({
      roomId: room.roomId,
      roomCode: room.roomCode,
      gameType: room.gameType,
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

/** Operational follow-up failures cannot roll back a committed result. */
export async function notifyGameFinishedBestEffort(
  listener: GameFinishedPostCommit | undefined,
  data: GameFinishedPostCommitData,
): Promise<void> {
  if (listener === undefined) {
    return;
  }
  try {
    await listener(data);
  } catch {
    // The canonical FINISHED transition is already committed.
  }
}
