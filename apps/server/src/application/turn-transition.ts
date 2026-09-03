import {
  GameRevisionSchema,
  ServerTimeSchema,
  TurnNumberSchema,
  type GameId,
  type GameRevision,
  type RoomId,
  type ServerTime,
  type TurnId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import type {
  GameTurn,
  PlayingGameState,
} from "../domain/game/game-state.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type {
  IdGenerator,
  ScheduledTurnDeadline,
  TurnScheduler,
} from "../ports/system.js";

export function incrementGameRevision(
  revision: GameRevision,
): GameRevision {
  return parse(GameRevisionSchema, revision + 1);
}

function addDuration(
  startedAt: ServerTime,
  durationMs: number,
): ServerTime {
  return parse(ServerTimeSchema, startedAt + durationMs);
}

/** Creates the sole successor of the current turn from immutable turnOrder. */
export function createNextTurn(
  game: PlayingGameState,
  startedAt: ServerTime,
  idGenerator: IdGenerator,
): GameTurn {
  const activeIndex = game.turnOrder.indexOf(game.turn.activePlayerId);
  if (activeIndex < 0 || game.turnOrder.length < 2) {
    throw new Error("Canonical turn order is invalid.");
  }

  const activePlayerId =
    game.turnOrder[(activeIndex + 1) % game.turnOrder.length];
  if (activePlayerId === undefined) {
    throw new Error("Canonical turn order has no next Player.");
  }

  return Object.freeze({
    turnId: idGenerator.generateTurnId(),
    turnNumber: parse(TurnNumberSchema, game.turn.turnNumber + 1),
    activePlayerId,
    startedAt,
    deadlineAt: addDuration(startedAt, game.rulesConfig.turnDurationMs),
  });
}

export function toScheduledTurnDeadline(
  roomId: RoomId,
  game: PlayingGameState,
): ScheduledTurnDeadline {
  return Object.freeze({
    roomId,
    gameId: game.gameId,
    turnId: game.turn.turnId,
    expectedGameRevision: game.gameRevision,
    deadlineAt: game.turn.deadlineAt,
  });
}

export type CurrentTurnIdentity = Readonly<{
  roomId: RoomId;
  gameId: GameId;
  gameRevision: GameRevision;
  turnId: TurnId;
}>;

export type TurnSchedulingFailure = CurrentTurnIdentity &
  Readonly<{ reason: "READ_OR_SCHEDULE_FAILED" }>;

export type TurnSchedulingFailureReporter = (
  failure: TurnSchedulingFailure,
) => void;

export const TURN_SCHEDULING_MAX_ATTEMPTS = 2;

function reportSchedulingFailure(
  reporter: TurnSchedulingFailureReporter | undefined,
  identity: CurrentTurnIdentity,
): void {
  if (reporter === undefined) {
    return;
  }
  try {
    reporter({ ...identity, reason: "READ_OR_SCHEDULE_FAILED" });
  } catch {
    // Diagnostics must never change the already-committed command result.
    return;
  }
}

/**
 * Registers only if the committed turn is still current. A failed registration
 * never changes an already-committed command result; the overdue sweeper is the
 * recovery path.
 */
export async function scheduleCurrentTurnBestEffort(
  roomRepository: RoomRepository,
  turnScheduler: TurnScheduler | undefined,
  identity: CurrentTurnIdentity,
  reportFailure?: TurnSchedulingFailureReporter,
): Promise<boolean> {
  if (turnScheduler === undefined) {
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
      game.gameId !== identity.gameId ||
      game.gameRevision !== identity.gameRevision ||
      game.turn.turnId !== identity.turnId
    ) {
      return false;
    }

    const deadline = toScheduledTurnDeadline(room.roomId, game);
    for (
      let attempt = 1;
      attempt <= TURN_SCHEDULING_MAX_ATTEMPTS;
      attempt += 1
    ) {
      try {
        await turnScheduler.scheduleTimeout(deadline);
        return true;
      } catch {
        if (attempt === TURN_SCHEDULING_MAX_ATTEMPTS) {
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
