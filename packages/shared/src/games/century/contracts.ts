import * as v from 'valibot';
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from '../../identifiers.js';
import { GameRevisionSchema, ServerTimeSchema } from '../../protocol.js';
import { CenturyCountSchema as count, CenturySpicesSchema, CenturyMerchantSchema, CenturyPointSchema, centurySum } from './actions.js';
export const CenturyMarketSlotSchema = v.strictObject({ card: CenturyMerchantSchema, spices: CenturySpicesSchema });
export const CenturyScoreSchema = v.strictObject({ playerId: PlayerIdSchema, cardPoints: count, coinPoints: count, spicePoints: count, total: count });
export const CenturyResultSchema = v.strictObject({ reason: v.picklist(['POINT_CARDS', 'CANCELLED']), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(1)), scores: v.pipe(v.array(CenturyScoreSchema), v.minLength(2), v.maxLength(5)) });
export const CenturyFeedbackSchema = v.nullable(v.strictObject({ playerId: PlayerIdSchema, kind: v.picklist(['PRODUCE', 'TRADE', 'UPGRADE', 'ACQUIRE', 'REST', 'CLAIM']), spent: CenturySpicesSchema, gained: CenturySpicesSchema, returned: CenturySpicesSchema, at: ServerTimeSchema }));
const base = {
  gameType: v.literal('CENTURY'), rulesVersion: v.literal('century-spice-road-v1'), gameId: GameIdSchema, gameRevision: GameRevisionSchema,
  startingPlayerId: PlayerIdSchema, round: v.pipe(count, v.minValue(1)), finalRound: v.boolean(), targetCount: v.picklist([5, 6]),
  market: v.pipe(v.array(CenturyMarketSlotSchema), v.maxLength(6)), pointMarket: v.pipe(v.array(CenturyPointSchema), v.maxLength(5)),
  merchantDeckCount: v.pipe(count, v.maxValue(43)), pointDeckCount: v.pipe(count, v.maxValue(36)), gold: v.pipe(count, v.maxValue(10)), silver: v.pipe(count, v.maxValue(10)),
  playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, spices: v.pipe(CenturySpicesSchema, v.check(s => centurySum(s) <= 10)), handCount: v.pipe(count, v.maxValue(45)), played: v.pipe(v.array(CenturyMerchantSchema), v.maxLength(45)), pointCount: v.pipe(count, v.maxValue(6)), gold: v.pipe(count, v.maxValue(10)), silver: v.pipe(count, v.maxValue(10)) })), v.minLength(2), v.maxLength(5)),
  privateState: v.strictObject({ playerId: PlayerIdSchema, hand: v.pipe(v.array(CenturyMerchantSchema), v.maxLength(45)), points: v.pipe(v.array(CenturyPointSchema), v.maxLength(6)) }), feedback: CenturyFeedbackSchema,
};
export const CenturyPlayingProjectionSchema = v.strictObject({ ...base, phase: v.literal('PLAYING'), turnId: TurnIdSchema, activePlayerId: PlayerIdSchema });
export const CenturyFinishedProjectionSchema = v.strictObject({ ...base, phase: v.literal('FINISHED'), result: CenturyResultSchema });
export type CenturyPlayingProjection = v.InferOutput<typeof CenturyPlayingProjectionSchema>;
export type CenturyProjection = CenturyPlayingProjection | v.InferOutput<typeof CenturyFinishedProjectionSchema>;
export function centuryProjectionIsConsistent(g: CenturyProjection): boolean {
  const players = new Set(g.playerStates.map(p => p.playerId)), self = g.playerStates.find(p => p.playerId === g.privateState.playerId);
  const cards = [...g.market.map(s => s.card), ...g.pointMarket, ...g.privateState.hand, ...g.privateState.points, ...g.playerStates.flatMap(p => p.played)];
  if (players.size !== g.playerStates.length || !players.has(g.startingPlayerId) || !self || self.handCount !== g.privateState.hand.length || self.pointCount !== g.privateState.points.length || new Set(cards.map(c => c.cardId)).size !== cards.length) return false;
  if (g.targetCount !== (players.size <= 3 ? 6 : 5) || g.finalRound !== g.playerStates.some(p => p.pointCount >= g.targetCount)) return false;
  if (g.gold + g.playerStates.reduce((n,p) => n+p.gold,0) !== players.size*2 || g.silver + g.playerStates.reduce((n,p) => n+p.silver,0) !== players.size*2) return false;
  if (g.market.length < 6 && g.merchantDeckCount > 0 || g.pointMarket.length < 5 && g.pointDeckCount > 0) return false;
  if (g.feedback && !players.has(g.feedback.playerId)) return false;
  if (g.phase === 'PLAYING') return players.has(g.activePlayerId);
  return new Set(g.result.scores.map(s => s.playerId)).size === players.size && g.result.scores.every(s => players.has(s.playerId) && s.total === s.cardPoints+s.coinPoints+s.spicePoints) && (g.result.reason === 'CANCELLED' ? g.result.winnerPlayerIds.length === 0 : g.finalRound && g.result.winnerPlayerIds.length === 1 && players.has(g.result.winnerPlayerIds[0]!));
}
