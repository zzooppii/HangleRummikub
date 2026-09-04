import type { GameId, RoomId } from "@hangul-rummikub/shared";

import type { RoomRepository } from "../ports/room-repository.js";
import type {
  GameDeadlineScheduler,
  ScheduledGameDeadline,
} from "../ports/system.js";

export type CurrentGameIdentity = Readonly<{
  roomId: RoomId;
  gameId: GameId;
}>;

export type GameDeadlineSchedulingFailure = CurrentGameIdentity &
  Readonly<{ reason: "READ_OR_SCHEDULE_FAILED" }>;

export type GameDeadlineSchedulingFailureReporter = (
  failure: GameDeadlineSchedulingFailure,
) => void;

export const GAME_DEADLINE_SCHEDULING_MAX_ATTEMPTS = 2;

export function toScheduledGameDeadline(
  roomId: RoomId,
  game: Readonly<{
    gameId: GameId;
    gameDeadlineAt: ScheduledGameDeadline["deadlineAt"];
  }>,
): ScheduledGameDeadline {
  return Object.freeze({
    roomId,
    gameId: game.gameId,
    deadlineAt: game.gameDeadlineAt,
  });
}

function reportSchedulingFailure(
  reporter: GameDeadlineSchedulingFailureReporter | undefined,
  identity: CurrentGameIdentity,
): void {
  if (reporter === undefined) {
    return;
  }
  try {
    reporter({ ...identity, reason: "READ_OR_SCHEDULE_FAILED" });
  } catch {
    // Diagnostics cannot change an already-committed Game transition.
  }
}

/**
 * Registers only a still-current PLAYING Game. Failure never rolls back the
 * canonical transition; the overdue Game sweeper is the recovery path.
 */
export async function scheduleGameDeadlineBestEffort(
  roomRepository: RoomRepository,
  scheduler: GameDeadlineScheduler | undefined,
  identity: CurrentGameIdentity,
  reportFailure?: GameDeadlineSchedulingFailureReporter,
): Promise<boolean> {
  if (scheduler === undefined) {
    return false;
  }
  try {
    const room = await roomRepository.findById(identity.roomId);
    const game = room?.game;
    if (
      room?.phase !== "PLAYING" ||
      game === null ||
      game === undefined ||
      game.turn === null ||
      game.result !== null ||
      game.gameId !== identity.gameId
    ) {
      return false;
    }
    const deadline = toScheduledGameDeadline(room.roomId, game);
    for (
      let attempt = 1;
      attempt <= GAME_DEADLINE_SCHEDULING_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        await scheduler.scheduleDeadline(deadline);
        return true;
      } catch {
        if (attempt === GAME_DEADLINE_SCHEDULING_MAX_ATTEMPTS) {
          reportSchedulingFailure(reportFailure, identity);
        }
      }
    }
    return false;
  } catch {
    reportSchedulingFailure(reportFailure, identity);
    return false;
  }
}
