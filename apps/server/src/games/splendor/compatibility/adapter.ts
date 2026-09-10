import {
  GameIdSchema,
  GameRevisionSchema,
  ServerTimeSchema,
  TurnIdSchema,
  type GameId,
  type GameRevision,
  type ServerTime,
  type TurnId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { parseSplendorState, type SplendorState } from "../domain/game.js";
export type SplendorStoredGame = Readonly<{
  gameId: GameId;
  gameRevision: GameRevision;
  startedAt: ServerTime;
  finishedAt: ServerTime | null;
  state: SplendorState;
}>;
export type SplendorLifecycle =
  | Readonly<{
      lifecycle: "RUNNING";
      gameId: GameId;
      gameRevision: GameRevision;
      activeTurn: Readonly<{ turnId: TurnId; deadlineAt: ServerTime }>;
    }>
  | Readonly<{ lifecycle: "FINISHED"; gameId: GameId; finishedAt: ServerTime }>;
export class SplendorGameStateAdapter {
  cloneAndValidate(game: SplendorStoredGame): SplendorStoredGame {
    const state = parseSplendorState(game.state),
      gameId = parse(GameIdSchema, game.gameId),
      gameRevision = parse(GameRevisionSchema, game.gameRevision),
      startedAt = parse(ServerTimeSchema, game.startedAt);
    if (
      state.gameId !== gameId ||
      state.revision !== gameRevision ||
      state.startedAt !== startedAt ||
      state.finishedAt !== game.finishedAt
    )
      throw new Error("SPLENDOR stored metadata mismatch.");
    return {
      gameId,
      gameRevision,
      startedAt,
      finishedAt:
        state.finishedAt === null
          ? null
          : parse(ServerTimeSchema, state.finishedAt),
      state,
    };
  }
  inspectLifecycle(game: SplendorStoredGame): SplendorLifecycle {
    if (game.state.phase === "FINISHED") {
      if (game.finishedAt === null)
        throw new Error("SPLENDOR missing finish time.");
      return {
        lifecycle: "FINISHED",
        gameId: game.gameId,
        finishedAt: game.finishedAt,
      };
    }
    return {
      lifecycle: "RUNNING",
      gameId: game.gameId,
      gameRevision: game.gameRevision,
      activeTurn: {
        turnId: parse(TurnIdSchema, game.state.transitionId),
        deadlineAt: parse(ServerTimeSchema, game.state.nextTransitionAt),
      },
    };
  }
}
