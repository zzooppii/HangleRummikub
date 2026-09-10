import { GameIdSchema, GameRevisionSchema, ServerTimeSchema, TurnIdSchema, type GameId, type GameRevision, type ServerTime, type TurnId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { cloneCityGameState, type CityGameState } from "../domain/game-state.js";
import { assertCityGameState } from "../domain/state-validator.js";
import { CITY_ACTION_SECONDS, CITY_SELECTION_SECONDS } from "../domain/role.js";

/** CITY-only application metadata; no fake player turn or generic state envelope. */
export type CityRoleStoredGame = Readonly<{
  gameId: GameId;
  gameRevision: GameRevision;
  startedAt: ServerTime;
  windowStartedAt: ServerTime | null;
  deadlineAt: ServerTime | null;
  finishedAt: ServerTime | null;
  /** Private CITY entropy checkpoint; advanced only in the committed candidate. */
  entropySeed: string;
  entropyCounter: number;
  state: CityGameState;
}>;

export type CityRoleGameLifecycleInspection =
  | Readonly<{ lifecycle: "RUNNING"; gameId: GameId; gameRevision: GameRevision; activeTurn: Readonly<{ turnId: TurnId; deadlineAt: ServerTime }> }>
  | Readonly<{ lifecycle: "FINISHED"; gameId: GameId; finishedAt: ServerTime }>;

export interface CityRoleGameStateStorage {
  readonly gameType: "CITY_ROLE";
  cloneAndValidate(game: CityRoleStoredGame): CityRoleStoredGame;
  inspectLifecycle(game: CityRoleStoredGame): CityRoleGameLifecycleInspection;
}

export class CityRoleGameStateAdapter implements CityRoleGameStateStorage {
  readonly gameType = "CITY_ROLE";

  cloneAndValidate(game: CityRoleStoredGame): CityRoleStoredGame {
    assertCityGameState(game.state);
    const gameId = parse(GameIdSchema, game.gameId);
    const gameRevision = parse(GameRevisionSchema, game.gameRevision);
    const startedAt = parse(ServerTimeSchema, game.startedAt);
    if (typeof game.entropySeed !== "string" || !/^[0-9a-f]{64}$/u.test(game.entropySeed) || !Number.isSafeInteger(game.entropyCounter) || game.entropyCounter < 0) throw new Error("CITY entropy checkpoint invalid.");
    const entropy = { entropySeed: game.entropySeed, entropyCounter: game.entropyCounter };
    if (gameId !== String(game.state.gameId)) throw new Error("CITY persisted game identity mismatch.");
    const state = cloneCityGameState(game.state);
    if (state.window === null) {
      const finishedAt = parse(ServerTimeSchema, game.finishedAt);
      if (game.deadlineAt !== null || game.windowStartedAt !== null || finishedAt < startedAt) throw new Error("CITY finished metadata mismatch.");
      return Object.freeze({ gameId, gameRevision, startedAt, state, ...entropy, windowStartedAt: null, deadlineAt: null, finishedAt });
    }
    const windowStartedAt = parse(ServerTimeSchema, game.windowStartedAt);
    const deadlineAt = parse(ServerTimeSchema, game.deadlineAt);
    const duration = state.window.kind === "ROLE_SELECTION" ? (state.expansion?.settings.selectionSeconds ?? CITY_SELECTION_SECONDS) : CITY_ACTION_SECONDS;
    if (game.finishedAt !== null || windowStartedAt < startedAt || deadlineAt !== windowStartedAt + duration * 1000) throw new Error("CITY window metadata mismatch.");
    parse(TurnIdSchema, state.window.actionId);
    return Object.freeze({ gameId, gameRevision, startedAt, state, ...entropy, windowStartedAt, deadlineAt, finishedAt: null });
  }

  inspectLifecycle(game: CityRoleStoredGame): CityRoleGameLifecycleInspection {
    if (game.state.window === null) {
      if (game.finishedAt === null) throw new Error("CITY finished timestamp missing.");
      return Object.freeze({ lifecycle: "FINISHED", gameId: game.gameId, finishedAt: game.finishedAt });
    }
    if (game.deadlineAt === null) throw new Error("CITY window deadline missing.");
    return Object.freeze({ lifecycle: "RUNNING", gameId: game.gameId, gameRevision: game.gameRevision,
      activeTurn: Object.freeze({ turnId: parse(TurnIdSchema, game.state.window.actionId), deadlineAt: game.deadlineAt }) });
  }
}
