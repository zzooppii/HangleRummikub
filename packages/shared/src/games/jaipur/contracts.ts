import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import { JaipurCardSchema, JaipurGoodSchema, JAIPUR_GOODS } from "./actions.js";

const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const score = v.pipe(count, v.maxValue(300));
export const JaipurBonusSizeSchema = v.picklist([3, 4, 5]);
export const JaipurGoodsTokenSchema = v.strictObject({ type: JaipurGoodSchema, value: v.pipe(count, v.maxValue(7)) });
export const JaipurBonusTokenSchema = v.strictObject({ size: JaipurBonusSizeSchema, value: v.pipe(count, v.maxValue(10)) });
export const JaipurGoodsBankSchema = v.pipe(v.array(v.strictObject({ type: JaipurGoodSchema, values: v.pipe(v.array(v.pipe(count, v.maxValue(7))), v.maxLength(9)) })), v.length(6));
export const JaipurRoundResultSchema = v.strictObject({
  round: v.pipe(count, v.minValue(1)),
  reason: v.picklist(["GOODS_DEPLETED", "DECK_DEPLETED"]),
  winnerPlayerId: v.nullable(PlayerIdSchema),
  scores: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, goodsPoints: score, bonusPoints: score, camelPoints: v.picklist([0, 5]), total: score, goodsTokenCount: count, bonusTokenCount: count, camelCount: v.pipe(count, v.maxValue(11)) })), v.length(2)),
});
export type JaipurRoundResult = v.InferOutput<typeof JaipurRoundResultSchema>;
export const JaipurResultSchema = v.strictObject({ reason: v.picklist(["SEALS", "CANCELLED"]), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(1)) });
export const JaipurFeedbackSchema = v.nullable(v.strictObject({ playerId: PlayerIdSchema, kind: v.picklist(["TAKE_GOOD", "TAKE_CAMELS", "EXCHANGE", "SELL"]), count, at: ServerTimeSchema }));
const Base = {
  gameType: v.literal("JAIPUR"), gameId: GameIdSchema, gameRevision: GameRevisionSchema,
  rulesVersion: v.literal("jaipur-base-v1"), round: v.pipe(count, v.minValue(1)), roundId: TurnIdSchema,
  market: v.pipe(v.array(JaipurCardSchema), v.maxLength(5)), deckCount: v.pipe(count, v.maxValue(55)),
  discardTop: v.nullable(JaipurCardSchema), goodsBank: JaipurGoodsBankSchema,
  bonusBank: v.pipe(v.array(v.strictObject({ size: JaipurBonusSizeSchema, count: v.pipe(count, v.maxValue(7)) })), v.length(3)),
  playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, handCount: v.pipe(count, v.maxValue(7)), seals: v.pipe(count, v.maxValue(2)) })), v.length(2)),
  privateState: v.strictObject({ playerId: PlayerIdSchema, hand: v.pipe(v.array(JaipurCardSchema), v.maxLength(7)), camelCount: v.pipe(count, v.maxValue(11)), goodsTokens: v.pipe(v.array(JaipurGoodsTokenSchema), v.maxLength(38)), bonusTokens: v.pipe(v.array(JaipurBonusTokenSchema), v.maxLength(18)) }),
  roundResults: v.array(JaipurRoundResultSchema), feedback: JaipurFeedbackSchema,
};
export const JaipurPlayingProjectionSchema = v.variant("phase", [
  v.strictObject({ ...Base, phase: v.literal("PLAYING"), turnId: TurnIdSchema, activePlayerId: PlayerIdSchema }),
  v.strictObject({ ...Base, phase: v.literal("ROUND_RESULT"), confirmedPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(1)) }),
]);
export const JaipurFinishedProjectionSchema = v.strictObject({ ...Base, phase: v.literal("FINISHED"), result: JaipurResultSchema });
export type JaipurPlayingProjection = v.InferOutput<typeof JaipurPlayingProjectionSchema>;

export function jaipurProjectionIsConsistent(game: JaipurPlayingProjection | v.InferOutput<typeof JaipurFinishedProjectionSchema>): boolean {
  const players = new Set(game.playerStates.map(p => p.playerId));
  const cards = [...game.market, ...game.privateState.hand];
  if (players.size !== 2 || !players.has(game.privateState.playerId) || new Set(cards.map(c => c.cardId)).size !== cards.length || game.privateState.hand.some(c => c.type === "CAMEL")) return false;
  if (game.goodsBank.length !== JAIPUR_GOODS.length || new Set(game.goodsBank.map(b => b.type)).size !== JAIPUR_GOODS.length || new Set(game.bonusBank.map(b => b.size)).size !== 3) return false;
  if (game.phase === "PLAYING" && (game.market.length !== 5 || !players.has(game.activePlayerId))) return false;
  if (game.phase === "ROUND_RESULT" && game.confirmedPlayerIds.some(id => !players.has(id))) return false;
  if (game.phase === "FINISHED" && game.result.winnerPlayerIds.some(id => !players.has(id))) return false;
  return game.roundResults.every(r => r.scores.length === 2 && new Set(r.scores.map(s => s.playerId)).size === 2 && r.scores.every(s => players.has(s.playerId)) && (r.winnerPlayerId === null || players.has(r.winnerPlayerId)));
}
