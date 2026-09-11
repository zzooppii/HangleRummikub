import { GameIdSchema, GameRevisionSchema, ServerTimeSchema, type GameId, type GameRevision, type ServerTime, type TurnId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { parseSaboteurState, type SaboteurState } from "../domain/game.js";
export type SaboteurStoredGame = Readonly<{
    gameId: GameId;
    gameRevision: GameRevision;
    startedAt: ServerTime;
    finishedAt: ServerTime | null;
    state: SaboteurState;
}>;
export type SaboteurLifecycle = Readonly<{
    lifecycle: 'RUNNING';
    gameId: GameId;
    gameRevision: GameRevision;
    activeTurn: Readonly<{turnId: TurnId; deadlineAt: ServerTime}>;
}> | Readonly<{
    lifecycle: 'FINISHED';
    gameId: GameId;
    finishedAt: ServerTime;
}>;
export class SaboteurGameStateAdapter {
    cloneAndValidate(game: SaboteurStoredGame): SaboteurStoredGame {
        const state = parseSaboteurState(game.state), gameId = parse(GameIdSchema, game.gameId), gameRevision = parse(GameRevisionSchema, game.gameRevision), startedAt = parse(ServerTimeSchema, game.startedAt);
        if (state.gameId !== gameId || state.revision !== gameRevision || state.startedAt !== startedAt || state.finishedAt !== game.finishedAt)
            throw new Error('Saboteur stored metadata mismatch.');
        return { gameId, gameRevision, startedAt, finishedAt: state.finishedAt, state };
    }
    inspectLifecycle(game: SaboteurStoredGame): SaboteurLifecycle {
        if (game.state.phase === 'FINISHED') {
            if (game.finishedAt === null)
                throw new Error('Saboteur finish time missing.');
            return { lifecycle: 'FINISHED', gameId: game.gameId, finishedAt: game.finishedAt };
        }
        if (game.state.deadlineAt === null) throw new Error('Saboteur deadline missing.');
        return { lifecycle: 'RUNNING', gameId: game.gameId, gameRevision: game.gameRevision, activeTurn: {turnId:game.state.transitionId, deadlineAt:game.state.deadlineAt} };
    }
}
