import * as v from "valibot";
export const SPLENDOR_COLORS = [
  "WHITE",
  "BLUE",
  "GREEN",
  "RED",
  "BLACK",
] as const;
export const SPLENDOR_TOKENS = [...SPLENDOR_COLORS, "GOLD"] as const;
export const SplendorColorSchema = v.picklist(SPLENDOR_COLORS);
export type SplendorColor = v.InferOutput<typeof SplendorColorSchema>;
export type SplendorToken = (typeof SPLENDOR_TOKENS)[number];
const Count = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(0),
  v.maxValue(10),
);
export const SplendorCostSchema = v.strictObject({
  WHITE: Count,
  BLUE: Count,
  GREEN: Count,
  RED: Count,
  BLACK: Count,
});
export const SplendorTokensSchema = v.strictObject({
  ...SplendorCostSchema.entries,
  GOLD: Count,
});
export type SplendorTokens = v.InferOutput<typeof SplendorTokensSchema>;
export type SplendorCost = v.InferOutput<typeof SplendorCostSchema>;
export const SplendorCardIdSchema = v.pipe(
  v.string(),
  v.minLength(1),
  v.maxLength(128),
  v.brand("SplendorCardId"),
);
export const SplendorTierSchema = v.picklist([1, 2, 3]);
export const SplendorNobleIdSchema = v.pipe(
  v.string(),
  v.regex(/^SPN-[0-9]$/u),
);
export const SplendorSettingsSchema = v.strictObject({ mode: v.picklist(["BASE", "CITIES"]) });
export type SplendorSettings = v.InferOutput<typeof SplendorSettingsSchema>;
export const SplendorCityIdSchema = v.pipe(v.string(), v.regex(/^SPC-[1-7]-[AB]$/u));
const Resolution = {
  cityId: v.optional(v.nullable(SplendorCityIdSchema)),
  returns: SplendorTokensSchema,
  nobleId: v.nullable(SplendorNobleIdSchema),
};
export const SplendorActionSchema = v.variant("kind", [
  v.strictObject({
    kind: v.literal("TAKE"),
    tokens: SplendorTokensSchema,
    ...Resolution,
  }),
  v.strictObject({
    kind: v.literal("BUY"),
    cardId: SplendorCardIdSchema,
    payment: SplendorTokensSchema,
    ...Resolution,
  }),
  v.strictObject({
    kind: v.literal("RESERVE"),
    cardId: SplendorCardIdSchema,
    ...Resolution,
  }),
  v.strictObject({
    kind: v.literal("RESERVE_DECK"),
    tier: SplendorTierSchema,
    ...Resolution,
  }),
  v.strictObject({ kind: v.literal("PASS"), ...Resolution }),
]);
export type SplendorAction = v.InferOutput<typeof SplendorActionSchema>;
