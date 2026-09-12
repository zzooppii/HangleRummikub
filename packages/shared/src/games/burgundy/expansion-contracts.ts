import * as v from "valibot";
import { PlayerIdSchema, TileIdSchema } from "../../identifiers.js";

const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(100000));
const die = v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(6));
const shield = v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(18));
const text = v.pipe(v.string(), v.minLength(1), v.maxLength(40));
const colors = v.array(v.picklist(["BUILDING", "LIVESTOCK", "MINE", "SHIP", "MONASTERY", "CASTLE"]));
export const BurgundyExpansionBonusSchema = v.variant("type", [
  v.strictObject({ type: v.literal("ACTION"), die: v.nullable(die) }),
  v.strictObject({ type: v.literal("TAKE"), colors }),
  v.strictObject({ type: v.literal("PLACE") }),
  v.strictObject({ type: v.literal("SELL") }),
  v.strictObject({ type: v.literal("GAIN"), workers: count, silver: count, score: count }),
  v.strictObject({ type: v.literal("TAKE_BLACK") }),
]);
export type BurgundyExpansionBonus = v.InferOutput<typeof BurgundyExpansionBonusSchema>;
export const BurgundyTradeSpaceSchema = v.strictObject({ die, bonus: BurgundyExpansionBonusSchema });
export type BurgundyTradeSpace = v.InferOutput<typeof BurgundyTradeSpaceSchema>;
export const BurgundyPlayerExpansionSchema = v.strictObject({
  shields: v.array(v.strictObject({ shieldId: shield, castleCellId: text, copiedPlayerId: v.nullable(PlayerIdSchema) })),
  shield16Used: v.boolean(),
  tradeRoute: v.pipe(v.array(BurgundyTradeSpaceSchema), v.maxLength(15)),
  tradeRouteFilled: count,
  tradeRouteGoods: v.pipe(v.array(die), v.maxLength(15)),
  borderConnections: v.array(text),
});
export type BurgundyPlayerExpansion = v.InferOutput<typeof BurgundyPlayerExpansionSchema>;
export const BurgundyExpansionSchema = v.strictObject({
  shieldDepots: v.pipe(v.array(v.array(shield)), v.length(6)),
  borderFinishers: v.pipe(v.array(PlayerIdSchema), v.maxLength(2)),
});
export type BurgundyExpansion = v.InferOutput<typeof BurgundyExpansionSchema>;
export const BurgundyExpansionPendingSchemas = [
  v.strictObject({ type: v.literal("TRADE_FILL"), value: die, remaining: count }),
  v.strictObject({ type: v.literal("GAIN"), workers: count, silver: count, score: count }),
  v.strictObject({ type: v.literal("TAKE_BLACK") }),
  v.strictObject({ type: v.literal("SHIELD_TRIBUTE"), playerId: PlayerIdSchema }),
  v.strictObject({ type: v.literal("SHIELD_PLACE"), black: v.boolean() }),
] as const;
export const BurgundyExpansionActionSchemas = [
  v.strictObject({ type: v.literal("TAKE_SHIELD"), value: die, shieldId: shield, castleCellId: text }),
  v.strictObject({ type: v.literal("SHIELD_COPY"), playerId: PlayerIdSchema }),
  v.strictObject({ type: v.literal("SHIELD_DIE"), die: v.picklist([0, 1]), value: die }),
  v.strictObject({ type: v.literal("SHIELD_TRIBUTE"), keepShieldIds: v.array(shield), workers: count }),
  v.strictObject({ type: v.literal("SHIELD_PLACE"), tileId: TileIdSchema, cellId: text }),
] as const;
