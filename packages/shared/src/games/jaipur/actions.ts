import * as v from "valibot";

export const JAIPUR_GOODS = ["DIAMOND", "GOLD", "SILVER", "CLOTH", "SPICE", "LEATHER"] as const;
export const JaipurGoodSchema = v.picklist(JAIPUR_GOODS);
export const JaipurCardTypeSchema = v.picklist([...JAIPUR_GOODS, "CAMEL"]);
export const JaipurCardIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128), v.brand("JaipurCardId"));
export type JaipurGood = v.InferOutput<typeof JaipurGoodSchema>;
export type JaipurCardType = v.InferOutput<typeof JaipurCardTypeSchema>;
export const JaipurCardSchema = v.strictObject({ cardId: JaipurCardIdSchema, type: JaipurCardTypeSchema });
export type JaipurCard = v.InferOutput<typeof JaipurCardSchema>;
const ids = (max: number) => v.pipe(v.array(JaipurCardIdSchema), v.maxLength(max));
export const JaipurActionSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("TAKE_GOOD"), cardId: JaipurCardIdSchema }),
  v.strictObject({ kind: v.literal("TAKE_CAMELS") }),
  v.strictObject({ kind: v.literal("EXCHANGE"), marketCardIds: ids(5), handCardIds: ids(7), camelCount: v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(11)) }),
  v.strictObject({ kind: v.literal("SELL"), cardIds: ids(7) }),
]);
export type JaipurAction = v.InferOutput<typeof JaipurActionSchema>;
