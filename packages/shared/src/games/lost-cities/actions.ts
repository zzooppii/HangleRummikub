import * as v from "valibot";

export const LOST_CITIES_SUITS = ["DESERT", "JUNGLE", "OCEAN", "VOLCANO", "SNOW"] as const;
export const LostCitiesSuitSchema = v.picklist(LOST_CITIES_SUITS);
export type LostCitiesSuit = v.InferOutput<typeof LostCitiesSuitSchema>;
export const LostCitiesCardIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128), v.brand("LostCitiesCardId"));
export const LostCitiesCardSchema = v.variant("kind", [
  v.strictObject({ cardId: LostCitiesCardIdSchema, suit: LostCitiesSuitSchema, kind: v.literal("INVESTMENT") }),
  v.strictObject({ cardId: LostCitiesCardIdSchema, suit: LostCitiesSuitSchema, kind: v.literal("NUMBER"), value: v.pipe(v.number(), v.safeInteger(), v.minValue(2), v.maxValue(10)) }),
]);
export type LostCitiesCard = v.InferOutput<typeof LostCitiesCardSchema>;
export const LostCitiesDrawSourceSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("DECK") }),
  v.strictObject({ kind: v.literal("DISCARD"), suit: LostCitiesSuitSchema }),
]);
export const LostCitiesActionSchema = v.strictObject({
  kind: v.picklist(["PLAY", "DISCARD"]), cardId: LostCitiesCardIdSchema, draw: LostCitiesDrawSourceSchema,
});
export type LostCitiesAction = v.InferOutput<typeof LostCitiesActionSchema>;
