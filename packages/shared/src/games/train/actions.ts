import * as v from 'valibot';
import { TRAIN_COLORS } from './catalog.js';
export const TrainCountSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
export const TrainCardIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128), v.brand('TrainCardId'));
export type TrainCardId = v.InferOutput<typeof TrainCardIdSchema>;
export const TrainColorSchema = v.picklist(TRAIN_COLORS);
export const TrainCardSchema = v.strictObject({ cardId: TrainCardIdSchema, color: TrainColorSchema });
export const TrainTicketCardSchema = v.strictObject({ cardId: TrainCardIdSchema, ticketId: v.pipe(v.string(), v.minLength(1), v.maxLength(64)) });
export type TrainCard = v.InferOutput<typeof TrainCardSchema>;
export type TrainTicketCard = v.InferOutput<typeof TrainTicketCardSchema>;
export const TrainActionSchema = v.variant('kind', [
    v.strictObject({ kind: v.literal('DRAW_DECK') }),
    v.strictObject({ kind: v.literal('DRAW_MARKET'), cardId: TrainCardIdSchema }),
    v.strictObject({ kind: v.literal('CLAIM_ROUTE'), routeId: v.pipe(v.string(), v.minLength(1), v.maxLength(128)), cardIds: v.pipe(v.array(TrainCardIdSchema), v.minLength(1), v.maxLength(6)) }),
    v.strictObject({ kind: v.literal('DRAW_TICKETS') }),
    v.strictObject({ kind: v.literal('KEEP_TICKETS'), keepCardIds: v.pipe(v.array(TrainCardIdSchema), v.minLength(1), v.maxLength(3)), returnCardIds: v.pipe(v.array(TrainCardIdSchema), v.maxLength(2)) }),
    v.strictObject({ kind: v.literal('PASS') }),
]);
export type TrainAction = v.InferOutput<typeof TrainActionSchema>;
