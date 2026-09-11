import * as v from 'valibot';
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from '../../identifiers.js';
import { GameRevisionSchema, ServerTimeSchema } from '../../protocol.js';
import { SaboteurCardSchema, SaboteurCardIdSchema, SaboteurPathSchema, SaboteurRotationSchema, SaboteurGoalIdSchema, SaboteurToolSchema, SaboteurCoordinateSchema } from './actions.js';
const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
export const SaboteurRoleSchema = v.picklist(['MINER', 'SABOTEUR']);
export const SaboteurGoldSchema = v.strictObject({ cardId: SaboteurCardIdSchema, value: v.picklist([1, 2, 3]) });
export const SaboteurBoardTileSchema = v.strictObject({ cardId: SaboteurCardIdSchema, path: SaboteurPathSchema, x: SaboteurCoordinateSchema, y: SaboteurCoordinateSchema, rotation: SaboteurRotationSchema, placedBy: PlayerIdSchema });
export const SaboteurGoalSchema = v.strictObject({ goalId: SaboteurGoalIdSchema, x: v.literal(8), y: v.picklist([-2, 0, 2]), face: v.nullable(v.picklist(['GOLD', 'ROCK_NE', 'ROCK_NW'])), rotation: SaboteurRotationSchema });
export const SaboteurRoundResultSchema = v.strictObject({ round: v.pipe(count, v.minValue(1), v.maxValue(3)), winner: v.picklist(['MINERS', 'SABOTEURS', 'NOBODY']), roles: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, role: SaboteurRoleSchema })), v.minLength(3), v.maxLength(10)) });
export const SaboteurResultSchema = v.strictObject({ reason: v.picklist(['THREE_ROUNDS', 'CANCELLED']), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(10)), scores: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, gold: count })), v.maxLength(10)) });
export const SaboteurMessageSchema = v.strictObject({ playerId: PlayerIdSchema, text: v.pipe(v.string(), v.minLength(1), v.maxLength(240)), at: ServerTimeSchema });
export const SaboteurFeedbackSchema = v.nullable(v.strictObject({ playerId: PlayerIdSchema, kind: v.picklist(['PLACE', 'BREAK', 'REPAIR', 'MAP', 'ROCKFALL', 'DISCARD', 'TAKE_GOLD', 'TIMEOUT_DISCARD', 'TIMEOUT_GOLD']), at: ServerTimeSchema, targetPlayerId: v.nullable(PlayerIdSchema), tool: v.nullable(SaboteurToolSchema), position: v.nullable(v.strictObject({ x: SaboteurCoordinateSchema, y: SaboteurCoordinateSchema })) }));
const base = { gameType: v.literal('SABOTEUR'), gameId: GameIdSchema, gameRevision: GameRevisionSchema, rulesVersion: v.literal('saboteur-base-2025-v1'), round: v.pipe(count, v.minValue(1), v.maxValue(3)), roundId: TurnIdSchema, deadlineAt: v.nullable(ServerTimeSchema),
    deckCount: v.pipe(count, v.maxValue(67)), discardCount: v.pipe(count, v.maxValue(67)), board: v.pipe(v.array(SaboteurBoardTileSchema), v.maxLength(40)), goals: v.pipe(v.array(SaboteurGoalSchema), v.length(3)),
    playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, handCount: v.pipe(count, v.maxValue(6)), brokenTools: v.pipe(v.array(SaboteurToolSchema), v.maxLength(3)) })), v.minLength(3), v.maxLength(10)),
    privateState: v.strictObject({ playerId: PlayerIdSchema, role: SaboteurRoleSchema, hand: v.pipe(v.array(SaboteurCardSchema), v.maxLength(6)), gold: v.pipe(v.array(SaboteurGoldSchema), v.maxLength(28)), observations: v.pipe(v.array(v.strictObject({ goalId: SaboteurGoalIdSchema, face: v.picklist(['GOLD', 'ROCK_NE', 'ROCK_NW']) })), v.maxLength(3)), goldChoices: v.pipe(v.array(SaboteurGoldSchema), v.maxLength(7)), chatSequence: count }),
    messages: v.pipe(v.array(SaboteurMessageSchema), v.maxLength(60)), roundResults: v.pipe(v.array(SaboteurRoundResultSchema), v.maxLength(3)), feedback: SaboteurFeedbackSchema };
export const SaboteurPlayingProjectionSchema = v.variant('phase', [
    v.strictObject({ ...base, phase: v.literal('PLAYING'), turnId: TurnIdSchema, activePlayerId: PlayerIdSchema }),
    v.strictObject({ ...base, phase: v.literal('GOLD_SELECTION'), turnId: TurnIdSchema, activePlayerId: PlayerIdSchema }),
    v.strictObject({ ...base, phase: v.literal('ROUND_RESULT'), confirmedPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(9)) }),
]);
export const SaboteurFinishedProjectionSchema = v.strictObject({ ...base, phase: v.literal('FINISHED'), result: SaboteurResultSchema });
export type SaboteurProjection = v.InferOutput<typeof SaboteurPlayingProjectionSchema> | v.InferOutput<typeof SaboteurFinishedProjectionSchema>;
export function saboteurProjectionIsConsistent(g: SaboteurProjection): boolean {
    if ((g.phase === 'FINISHED') !== (g.deadlineAt === null)) return false;
    const ids = new Set(g.playerStates.map(p => p.playerId)), self = g.playerStates.find(p => p.playerId === g.privateState.playerId);
    if (ids.size !== g.playerStates.length || !self || self.handCount !== g.privateState.hand.length)
        return false;
    if (g.goals.some((p, i) => p.goalId !== ['A', 'B', 'C'][i] || p.y !== [-2, 0, 2][i] || p.face === null && p.rotation !== 0))
        return false;
    if (new Set(g.board.map(t => `${t.x},${t.y}`)).size !== g.board.length || g.board.some(t => t.x === 0 && t.y === 0 || g.goals.some(goal => goal.x === t.x && goal.y === t.y) || !ids.has(t.placedBy)))
        return false;
    const visible = [...g.board, ...g.privateState.hand, ...g.privateState.gold, ...g.privateState.goldChoices];
    if (new Set(visible.map(c => c.cardId)).size !== visible.length || g.playerStates.some(p => new Set(p.brokenTools).size !== p.brokenTools.length))
        return false;
    if (g.deckCount + g.discardCount + g.board.length + g.playerStates.reduce((n, p) => n + p.handCount + p.brokenTools.length, 0) !== 67)
        return false;
    if (g.privateState.goldChoices.length > 0 && (g.phase !== 'GOLD_SELECTION' || g.activePlayerId !== self.playerId))
        return false;
    if ((g.phase === 'PLAYING' || g.phase === 'GOLD_SELECTION') && !ids.has(g.activePlayerId))
        return false;
    if (g.phase === 'PLAYING' && g.roundResults.length !== g.round - 1)
        return false;
    if ((g.phase === 'GOLD_SELECTION' || g.phase === 'ROUND_RESULT') && g.roundResults.length !== g.round)
        return false;
    if (g.phase === 'ROUND_RESULT' && (g.round === 3 || new Set(g.confirmedPlayerIds).size !== g.confirmedPlayerIds.length || g.confirmedPlayerIds.some(id => !ids.has(id))))
        return false;
    if (g.messages.some(m => !ids.has(m.playerId)) || g.feedback && !ids.has(g.feedback.playerId))
        return false;
    if (g.roundResults.some((r, i) => r.round !== i + 1 || r.roles.length !== ids.size || new Set(r.roles.map(p => p.playerId)).size !== ids.size || r.roles.some(p => !ids.has(p.playerId))))
        return false;
    if (g.phase === 'FINISHED') {
        if (g.result.reason === 'CANCELLED')
            return g.result.winnerPlayerIds.length === 0 && g.result.scores.length === 0;
        const scores = g.result.scores, best = Math.max(...scores.map(s => s.gold));
        if (g.round !== 3 || g.roundResults.length !== 3 || scores.length !== ids.size || new Set(scores.map(s => s.playerId)).size !== ids.size || scores.some(s => !ids.has(s.playerId)))
            return false;
        const winners = scores.filter(s => s.gold === best).map(s => s.playerId);
        if (new Set(g.result.winnerPlayerIds).size !== winners.length || g.result.winnerPlayerIds.length !== winners.length || winners.some(id => !g.result.winnerPlayerIds.includes(id)))
            return false;
    }
    return true;
}
