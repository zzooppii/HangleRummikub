import { GameIdSchema, GameRevisionSchema, ServerTimeSchema, TurnIdSchema, type GameId, type GameRevision, type ServerTime, type TurnId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { parseLiarState, type LiarState } from "../domain/game.js";
export type LiarStoredGame = Readonly<{ gameId: GameId; gameRevision: GameRevision; startedAt: ServerTime; finishedAt: ServerTime | null; state: LiarState }>;
export type LiarLifecycle =
  | Readonly<{ lifecycle: "RUNNING"; gameId: GameId; gameRevision: GameRevision; activeTurn: Readonly<{ turnId: TurnId; deadlineAt: ServerTime }> }>
  | Readonly<{ lifecycle: "FINISHED"; gameId: GameId; finishedAt: ServerTime }>;
export class LiarGameStateAdapter {
  cloneAndValidate(game: LiarStoredGame): LiarStoredGame {
    const state = parseLiarState(game.state), gameId = parse(GameIdSchema, game.gameId), gameRevision = parse(GameRevisionSchema, game.gameRevision), startedAt = parse(ServerTimeSchema, game.startedAt);
    if (state.gameId !== gameId || state.revision !== gameRevision || state.startedAt !== startedAt || state.finishedAt !== game.finishedAt) throw new Error("LIAR stored metadata mismatch.");
    return { gameId, gameRevision, startedAt, finishedAt: state.finishedAt === null ? null : parse(ServerTimeSchema, state.finishedAt), state };
  }
  inspectLifecycle(game: LiarStoredGame): LiarLifecycle {
    if (game.state.phase === "FINISHED") {
      if (game.finishedAt === null) throw new Error("LIAR missing finish time.");
      return { lifecycle: "FINISHED", gameId: game.gameId, finishedAt: game.finishedAt };
    }
    return { lifecycle: "RUNNING", gameId: game.gameId, gameRevision: game.gameRevision,
      activeTurn: { turnId: parse(TurnIdSchema, game.state.transitionId), deadlineAt: parse(ServerTimeSchema, game.state.nextTransitionAt) } };
  }
}
