import type {
  GameId,
  GameRevision,
  ServerTime,
  TurnId,
} from "@hangul-rummikub/shared";

import {
  cloneGameState,
  type GameState,
} from "../domain/game/game-state.js";
import { LEGACY_V1_DEFAULT_GAME_TYPE } from "./legacy-hangul-compatibility-registration.js";

export type LegacyHangulGameLifecycleInspection =
  | Readonly<{
      lifecycle: "RUNNING";
      gameId: GameId;
      gameRevision: GameRevision;
      activeTurn: Readonly<{
        turnId: TurnId;
        deadlineAt: ServerTime;
      }>;
      gameDeadlineAt: ServerTime;
    }>
  | Readonly<{
      lifecycle: "FINISHED";
      gameId: GameId;
      finishedAt: ServerTime;
    }>;

/**
 * The in-memory storage boundary for the existing Hangul state. It deliberately
 * exposes neither Hangul collections nor command/scheduler behavior.
 */
export interface LegacyHangulGameStateStorage {
  readonly gameType: typeof LEGACY_V1_DEFAULT_GAME_TYPE;
  cloneAndValidate(state: GameState): GameState;
  inspectLifecycle(state: GameState): LegacyHangulGameLifecycleInspection;
}

export class LegacyHangulGameStateAdapter
  implements LegacyHangulGameStateStorage
{
  readonly gameType = LEGACY_V1_DEFAULT_GAME_TYPE;

  constructor() {
    Object.freeze(this);
  }

  cloneAndValidate(state: GameState): GameState {
    return cloneGameState(state);
  }

  inspectLifecycle(state: GameState): LegacyHangulGameLifecycleInspection {
    if (state.turn === null) {
      if (state.result === null) {
        throw new TypeError("Legacy Hangul GameState lifecycle is invalid.");
      }

      return Object.freeze({
        lifecycle: "FINISHED",
        gameId: state.gameId,
        finishedAt: state.result.finishedAt,
      });
    }

    if (state.result !== null) {
      throw new TypeError("Legacy Hangul GameState lifecycle is invalid.");
    }

    return Object.freeze({
      lifecycle: "RUNNING",
      gameId: state.gameId,
      gameRevision: state.gameRevision,
      activeTurn: Object.freeze({
        turnId: state.turn.turnId,
        deadlineAt: state.turn.deadlineAt,
      }),
      gameDeadlineAt: state.gameDeadlineAt,
    });
  }
}
