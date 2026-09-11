import type { SplendorStoredGame } from "../games/splendor/compatibility/adapter.js";
import type { JaipurStoredGame } from "../games/jaipur/compatibility/adapter.js";
import type { GuryongtuStoredGame } from "../games/guryongtu/compatibility/adapter.js";
import type { AzulStoredGame } from "../games/azul/compatibility/adapter.js";
import type { DuetStoredGame } from "../games/word-duet/compatibility/adapter.js";
import type { SaboteurStoredGame } from "../games/saboteur/compatibility/adapter.js";
import type { LostCitiesStoredGame } from "../games/lost-cities/compatibility/adapter.js";
import type { IslandStoredGame } from "../games/island/compatibility/adapter.js";
import type { HalliStoredGame } from "../games/halli-galli/compatibility/adapter.js";
import type { WolfStoredGame } from "../games/wolf-night/compatibility/adapter.js";
import type { LiarStoredGame } from "../games/liar-game/compatibility/adapter.js";
import type { SneakyLunchStoredGame } from "../games/sneaky-lunch/compatibility/adapter.js";
import type { DrawRelayStoredGame } from "../games/draw-relay/compatibility/adapter.js";
import type { PlayingGemGameState } from "../games/gem-card/domain/game-state.js";
import type { CityRoleStoredGame } from "../games/city-role/compatibility/city-role-game-state-adapter.js";
import {
  ServerTimeSchema,
  TurnIdSchema,
  TurnNumberSchema,
  type GameId,
  type GameRevision,
  type PlayerId,
  type RoomId,
  type ServerTime,
  type TurnId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import type {
  GameTurn,
  PlayingGameState,
} from "../games/hangul-tile/domain/game-state.js";
import type { PlayingNumberTileGameState } from "../games/number-tile/domain/game-state.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type {
  IdGenerator,
  ScheduledTurnDeadline,
  TurnScheduler,
} from "../ports/system.js";

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
  forfeitedPlayerIds: ReadonlySet<PlayerId> = game.forfeitedPlayerIds,
): GameTurn {
  const activeIndex = game.turnOrder.indexOf(game.turn.activePlayerId);
  if (activeIndex < 0 || game.turnOrder.length === 0) {
    throw new Error("Canonical turn order is invalid.");
  }

  let activePlayerId: PlayerId | undefined;
  for (let offset = 1; offset <= game.turnOrder.length; offset += 1) {
    const candidate =
      game.turnOrder[(activeIndex + offset) % game.turnOrder.length];
    if (candidate !== undefined && !forfeitedPlayerIds.has(candidate)) {
      activePlayerId = candidate;
      break;
    }
  }
  if (activePlayerId === undefined) {
    throw new Error("Canonical turn order has no non-forfeited Player.");
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
  game: PlayingGameState | PlayingNumberTileGameState | PlayingGemGameState | CityRoleStoredGame | DrawRelayStoredGame | SneakyLunchStoredGame | WolfStoredGame | LiarStoredGame | DuetStoredGame | JaipurStoredGame | GuryongtuStoredGame | AzulStoredGame | SaboteurStoredGame | LostCitiesStoredGame | SplendorStoredGame | HalliStoredGame | IslandStoredGame,
): ScheduledTurnDeadline {
  if ("state" in game && !("windowStartedAt" in game)) {
    if (game.state.rulesVersion === "duet-2025-ko-v1") throw new Error("Duet has no turn deadline.");
    if (game.state.rulesVersion === "jaipur-base-v1") throw new Error("Jaipur has no turn deadline.");
    if (game.state.rulesVersion === "guryongtu-base-v1") throw new Error("Guryongtu has no turn deadline.");
    if (game.state.rulesVersion === "azul-base-v1") {
      if (game.state.deadlineAt === null) throw new Error("Azul deadline missing.");
      return {roomId,gameId:game.gameId,expectedGameRevision:game.gameRevision,turnId:game.state.transitionId,deadlineAt:game.state.deadlineAt};
    }
    if (game.state.rulesVersion === "saboteur-base-2025-v1") {
      if (game.state.deadlineAt === null) throw new Error("Saboteur deadline missing.");
      return {roomId,gameId:game.gameId,expectedGameRevision:game.gameRevision,turnId:game.state.transitionId,deadlineAt:game.state.deadlineAt};
    }
    if ("startingPlayerId" in game.state) throw new Error("LostCities has no turn deadline.");
    if ("turnId" in game.state) return { roomId, gameId: game.gameId, expectedGameRevision: game.gameRevision, turnId: game.state.turnId, deadlineAt: game.state.deadlineAt };
    if ("nextTransitionAt" in game.state) return {roomId,gameId:game.gameId,expectedGameRevision:game.gameRevision,turnId:parse(TurnIdSchema,game.state.transitionId),deadlineAt:parse(ServerTimeSchema,game.state.nextTransitionAt)};
    if(game.state.deadlineAt===null)throw new Error("DRAW has no deadline.");
    return {roomId,gameId:game.gameId,expectedGameRevision:game.gameRevision,turnId:parse(TurnIdSchema,game.state.stageToken),deadlineAt:parse(ServerTimeSchema,game.state.deadlineAt)};
  }
  if ("windowStartedAt" in game) {
    if (game.state.window === null || game.deadlineAt === null) throw new Error("CITY has no scheduled window.");
    return Object.freeze({ roomId, gameId: game.gameId, turnId: parse(TurnIdSchema, game.state.window.actionId), expectedGameRevision: game.gameRevision, deadlineAt: game.deadlineAt });
  }
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
      game.gameId !== identity.gameId ||
      game.gameRevision !== identity.gameRevision
    ) {
      return false;
    }

    if ("state" in game && !("windowStartedAt" in game)) {
      if (game.state.rulesVersion === "duet-2025-ko-v1") return false;
      if (game.state.rulesVersion === "jaipur-base-v1") return false;
      if (game.state.rulesVersion === "guryongtu-base-v1") return false;
      if (game.state.rulesVersion === "saboteur-base-2025-v1" || game.state.rulesVersion === "azul-base-v1") {
        if (game.state.deadlineAt === null || game.state.transitionId !== identity.turnId) return false;
      } else if ("startingPlayerId" in game.state) return false;
      else if ("turnId" in game.state) {
        if (game.state.turnId !== identity.turnId) return false;
      } else if ("nextTransitionAt" in game.state) {
        if (game.state.nextTransitionAt === null || game.state.transitionId !== identity.turnId) return false;
      } else if(game.state.deadlineAt===null||game.state.stageToken!==identity.turnId)return false;
    } else if ("windowStartedAt" in game) {
      if (game.state.window === null || String(game.state.window.actionId) !== identity.turnId) return false;
    } else if (game.turn === null || game.result !== null || game.turn.turnId !== identity.turnId) return false;

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
