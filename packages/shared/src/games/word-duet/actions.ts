import * as v from "valibot";
export const DuetCardIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128), v.brand("DuetCardId"));
export type DuetCardId = v.InferOutput<typeof DuetCardIdSchema>;
export const DuetRoleSchema = v.picklist(["AGENT", "BYSTANDER", "ASSASSIN"]);
export type DuetRole = v.InferOutput<typeof DuetRoleSchema>;
export const DuetClueWordSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(20), v.regex(/^[\p{L}\p{N}]+$/u));
export const DuetClueNumberSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(9));
export const DuetActionSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("GIVE_CLUE"), word: DuetClueWordSchema, number: DuetClueNumberSchema }),
  v.strictObject({ kind: v.literal("GUESS"), cardId: DuetCardIdSchema }),
  v.strictObject({ kind: v.literal("END_GUESSES") }),
  v.strictObject({ kind: v.literal("PASS_CLUES") }),
]);
export type DuetAction = v.InferOutput<typeof DuetActionSchema>;
