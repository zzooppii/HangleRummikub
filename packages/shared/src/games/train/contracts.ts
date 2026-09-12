import * as v from 'valibot';
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from '../../identifiers.js';
import { GameRevisionSchema, ServerTimeSchema } from '../../protocol.js';
import { TrainCountSchema as count, TrainCardSchema, TrainTicketCardSchema } from './actions.js';
import { TRAIN_ROUTES, TRAIN_TICKETS, TRAIN_RULES_VERSION, TRAIN_ROUTE_POINTS } from './catalog.js';
export const TrainClaimSchema = v.strictObject({ routeId: v.string(), playerId: PlayerIdSchema });
export const TrainTicketViewSchema = v.strictObject({ ...TrainTicketCardSchema.entries, completed: v.boolean() });
export const TrainScoreSchema = v.strictObject({ playerId: PlayerIdSchema, routePoints: count, ticketPoints: v.pipe(v.number(), v.safeInteger()), longestLength: count, longestBonus: v.picklist([0, 10]), completedCount: count, total: v.pipe(v.number(), v.safeInteger()), tickets: v.pipe(v.array(TrainTicketViewSchema), v.maxLength(30)) });
export const TrainResultSchema = v.strictObject({ reason: v.picklist(['TRAINS', 'STALEMATE', 'CANCELLED']), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(5)), scores: v.pipe(v.array(TrainScoreSchema), v.minLength(2), v.maxLength(5)) });
export const TrainFeedbackSchema = v.nullable(v.strictObject({ playerId: PlayerIdSchema, kind: v.picklist(['DRAW_DECK', 'DRAW_MARKET', 'CLAIM_ROUTE', 'DRAW_TICKETS', 'KEEP_TICKETS', 'PASS']), routeId: v.nullable(v.string()), at: ServerTimeSchema }));
const base = { gameType: v.literal('TRAIN'), rulesVersion: v.literal(TRAIN_RULES_VERSION), gameId: GameIdSchema, gameRevision: GameRevisionSchema,
    startingPlayerId: PlayerIdSchema, round: v.pipe(count, v.minValue(1)), finalTurnsRemaining: v.nullable(v.pipe(count, v.maxValue(5))), finalTriggerPlayerId: v.nullable(PlayerIdSchema),
    market: v.pipe(v.array(TrainCardSchema), v.maxLength(5)), deckCount: v.pipe(count, v.maxValue(110)), discardCount: v.pipe(count, v.maxValue(110)), ticketDeckCount: v.pipe(count, v.maxValue(30)),
    claims: v.pipe(v.array(TrainClaimSchema), v.maxLength(100)),
    playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, trains: v.pipe(count, v.maxValue(45)), routePoints: count, handCount: v.pipe(count, v.maxValue(110)), ticketCount: v.pipe(count, v.maxValue(30)), pendingTicketCount: v.pipe(count, v.maxValue(3)) })), v.minLength(2), v.maxLength(5)),
    privateState: v.strictObject({ playerId: PlayerIdSchema, hand: v.pipe(v.array(TrainCardSchema), v.maxLength(110)), tickets: v.pipe(v.array(TrainTicketViewSchema), v.maxLength(30)), pendingTickets: v.pipe(v.array(TrainTicketCardSchema), v.maxLength(3)), minimumKeep: v.picklist([0, 1, 2]) }), feedback: TrainFeedbackSchema };
export const TrainPlayingProjectionSchema = v.strictObject({ ...base, phase: v.literal('PLAYING'), turnId: TurnIdSchema, activePlayerId: PlayerIdSchema, step: v.picklist(['SETUP', 'TURN', 'DRAW_SECOND', 'CHOOSE_TICKETS']) });
export const TrainFinishedProjectionSchema = v.strictObject({ ...base, phase: v.literal('FINISHED'), result: TrainResultSchema });
export type TrainPlayingProjection = v.InferOutput<typeof TrainPlayingProjectionSchema>;
export type TrainProjection = TrainPlayingProjection | v.InferOutput<typeof TrainFinishedProjectionSchema>;
export function trainProjectionIsConsistent(g: TrainProjection): boolean {
    const players = new Set(g.playerStates.map(p => p.playerId)), self = g.playerStates.find(p => p.playerId === g.privateState.playerId);
    if (players.size !== g.playerStates.length || !players.has(g.startingPlayerId) || !self || self.handCount !== g.privateState.hand.length || self.ticketCount !== g.privateState.tickets.length || self.pendingTicketCount !== g.privateState.pendingTickets.length)
        return false;
    if (g.deckCount + g.discardCount + g.market.length + g.playerStates.reduce((n, p) => n + p.handCount, 0) !== 110 || g.ticketDeckCount + g.playerStates.reduce((n, p) => n + p.ticketCount + p.pendingTicketCount, 0) !== 30)
        return false;
    const visible = [...g.market, ...g.privateState.hand, ...g.privateState.tickets, ...g.privateState.pendingTickets];
    if (new Set(visible.map(c => c.cardId)).size !== visible.length || [...g.privateState.tickets, ...g.privateState.pendingTickets].some(c => !TRAIN_TICKETS.some(t => t.ticketId === c.ticketId)))
        return false;
    if (new Set(g.claims.map(c => c.routeId)).size !== g.claims.length || g.claims.some(c => !players.has(c.playerId) || !TRAIN_ROUTES.some(r => r.routeId === c.routeId)))
        return false;
    for (const p of g.playerStates) {
        const owned = TRAIN_ROUTES.filter(r => g.claims.some(c => c.routeId === r.routeId && c.playerId === p.playerId));
        if (p.trains !== 45 - owned.reduce((n, r) => n + r.length, 0) || p.routePoints !== owned.reduce((n, r) => n + (TRAIN_ROUTE_POINTS[r.length] ?? 0), 0))
            return false;
    }
    for (const c of g.claims) {
        const route = TRAIN_ROUTES.find(r => r.routeId === c.routeId)!;
        if (g.claims.some(other => other.routeId !== c.routeId && TRAIN_ROUTES.find(r => r.routeId === other.routeId)?.group === route.group && (players.size < 4 || other.playerId === c.playerId)))
            return false;
    }
    if ((g.finalTriggerPlayerId === null) !== (g.finalTurnsRemaining === null) || g.finalTriggerPlayerId !== null && (!players.has(g.finalTriggerPlayerId) || g.finalTurnsRemaining! > players.size))
        return false;
    if (g.feedback && !players.has(g.feedback.playerId))
        return false;
    if (g.phase === 'PLAYING')
        return players.has(g.activePlayerId) && g.finalTurnsRemaining !== 0 && g.privateState.minimumKeep === (g.privateState.pendingTickets.length ? (g.step === 'SETUP' ? 2 : 1) : 0);
    return new Set(g.result.scores.map(s => s.playerId)).size === players.size && g.result.scores.every(s => players.has(s.playerId) && s.total === s.routePoints + s.ticketPoints + s.longestBonus) && g.result.winnerPlayerIds.every(id => players.has(id)) && (g.result.reason === 'CANCELLED' ? g.result.winnerPlayerIds.length === 0 : g.result.winnerPlayerIds.length > 0);
}
