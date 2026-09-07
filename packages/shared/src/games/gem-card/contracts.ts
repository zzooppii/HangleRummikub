import * as v from "valibot";
export const GEM_BASIC_RESOURCE_IDS = Object.freeze(["DAWN", "TIDE", "GROVE", "EMBER", "ECHO"] as const);
export const GemBasicResourceSchema = v.picklist(GEM_BASIC_RESOURCE_IDS);
export const GemCardWireIdSchema = v.pipe(v.string(), v.regex(/^GC-T[123]-(?:0[1-9]|1[0-5])$/u), v.brand("GemCardId"));
export const GemCardTierSchema = v.picklist([1, 2, 3]);
const Count = v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(45));
export const GemBasicCountsSchema = v.strictObject({ DAWN: Count, TIDE: Count, GROVE: Count, EMBER: Count, ECHO: Count });
export const GemResourceCountsSchema = v.strictObject({ ...GemBasicCountsSchema.entries, PRISM: Count });
export const GemPublicCardSchema = v.pipe(v.strictObject({
  cardId: GemCardWireIdSchema,
  tier: GemCardTierSchema,
  cost: GemBasicCountsSchema,
  productionResource: GemBasicResourceSchema,
  victoryPoints: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)),
}), v.check(card => card.cardId.startsWith(`GC-T${card.tier}-`), "Card tier must match its identity."));
export const GemCollectSelectionSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("BASIC"), resources: v.pipe(v.array(GemBasicResourceSchema), v.minLength(1), v.maxLength(2), v.check(values => new Set(values).size === values.length)) }),
  v.strictObject({ kind: v.literal("PRISM") }),
]);
export const GemMarketSourceSchema = v.strictObject({ tier: GemCardTierSchema, slotIndex: v.picklist([0, 1, 2]) });
export const GemPurchaseSourceSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("MARKET"), ...GemMarketSourceSchema.entries }),
  v.strictObject({ kind: v.literal("RESERVED"), cardId: GemCardWireIdSchema }),
]);
export const GemFinishReasonSchema = v.picklist(["SCORE_THRESHOLD_ROUND_END", "MARKET_EXHAUSTED_ROUND_END", "NO_PROGRESS", "LAST_PLAYER_STANDING"]);
export type GemCollectSelectionDto = v.InferOutput<typeof GemCollectSelectionSchema>;
export type GemPurchaseSourceDto = v.InferOutput<typeof GemPurchaseSourceSchema>;
export type GemMarketSourceDto = v.InferOutput<typeof GemMarketSourceSchema>;
