import * as v from 'valibot';
import { PlayerIdSchema } from '../../identifiers.js';
export const SABOTEUR_TOOLS = ['PICKAXE', 'LANTERN', 'CART'] as const;
export const SaboteurToolSchema = v.picklist(SABOTEUR_TOOLS);
export type SaboteurTool = v.InferOutput<typeof SaboteurToolSchema>;
export const SABOTEUR_PATHS = ['NS', 'NSE', 'NESW', 'ES', 'WS', 'NEW', 'EW', 'DEAD_S', 'DEAD_NSW', 'DEAD_ALL', 'DEAD_ES', 'DEAD_WS', 'DEAD_W', 'DEAD_NS', 'DEAD_N', 'DEAD_EW'] as const;
export const SaboteurPathSchema = v.picklist(SABOTEUR_PATHS);
export type SaboteurPath = v.InferOutput<typeof SaboteurPathSchema>;
export const SaboteurCardIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128), v.brand('SaboteurCardId'));
export const SaboteurCardSchema = v.variant('kind', [
    v.strictObject({ kind: v.literal('PATH'), cardId: SaboteurCardIdSchema, path: SaboteurPathSchema }),
    v.strictObject({ kind: v.literal('BREAK'), cardId: SaboteurCardIdSchema, tool: SaboteurToolSchema }),
    v.strictObject({ kind: v.literal('REPAIR'), cardId: SaboteurCardIdSchema, tools: v.pipe(v.array(SaboteurToolSchema), v.minLength(1), v.maxLength(2)) }),
    v.strictObject({ kind: v.literal('MAP'), cardId: SaboteurCardIdSchema }),
    v.strictObject({ kind: v.literal('ROCKFALL'), cardId: SaboteurCardIdSchema }),
]);
export type SaboteurCard = v.InferOutput<typeof SaboteurCardSchema>;
export const SaboteurRotationSchema = v.picklist([0, 180]);
export const SaboteurCoordinateSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(-41), v.maxValue(49));
export const SaboteurGoalIdSchema = v.picklist(['A', 'B', 'C']);
export const SaboteurActionSchema = v.variant('kind', [
    v.strictObject({ kind: v.literal('PLACE'), cardId: SaboteurCardIdSchema, x: SaboteurCoordinateSchema, y: SaboteurCoordinateSchema, rotation: SaboteurRotationSchema }),
    v.strictObject({ kind: v.literal('BREAK'), cardId: SaboteurCardIdSchema, targetPlayerId: PlayerIdSchema }),
    v.strictObject({ kind: v.literal('REPAIR'), cardId: SaboteurCardIdSchema, targetPlayerId: PlayerIdSchema, tool: SaboteurToolSchema }),
    v.strictObject({ kind: v.literal('MAP'), cardId: SaboteurCardIdSchema, goalId: SaboteurGoalIdSchema }),
    v.strictObject({ kind: v.literal('ROCKFALL'), cardId: SaboteurCardIdSchema, x: SaboteurCoordinateSchema, y: SaboteurCoordinateSchema }),
    v.strictObject({ kind: v.literal('DISCARD'), cardId: SaboteurCardIdSchema }),
    v.strictObject({ kind: v.literal('TAKE_GOLD'), cardId: SaboteurCardIdSchema }),
]);
export type SaboteurAction = v.InferOutput<typeof SaboteurActionSchema>;
export const SABOTEUR_DIRECTIONS = ['N', 'E', 'S', 'W'] as const;
export type SaboteurDirection = typeof SABOTEUR_DIRECTIONS[number];
/** Public card geometry; contains no instance identities, deck order or hidden goal data. */
export function saboteurConnections(path: SaboteurPath, rotation: 0 | 180): SaboteurDirection[][] {
    const ends = SABOTEUR_DIRECTIONS.filter(d => (path === 'DEAD_ALL' ? 'NESW' : path.replace('DEAD_', '')).includes(d)).map(d => rotation === 0 ? d : SABOTEUR_DIRECTIONS[(SABOTEUR_DIRECTIONS.indexOf(d) + 2) % 4]!);
    return path.startsWith('DEAD_') ? ends.map(d => [d]) : [ends];
}
