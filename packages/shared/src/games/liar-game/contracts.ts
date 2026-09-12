import * as v from "valibot";

export const LIAR_CATEGORIES = ["FOOD", "ANIMAL", "PLACE", "OBJECT", "JOB", "HOBBY"] as const;
export const LiarCategorySchema = v.picklist(LIAR_CATEGORIES);
export type LiarCategory = v.InferOutput<typeof LiarCategorySchema>;
export const LIAR_CATEGORY_LABELS: Readonly<Record<LiarCategory | "RANDOM", string>> = {
  RANDOM: "무작위", FOOD: "음식", ANIMAL: "동물", PLACE: "장소", OBJECT: "물건", JOB: "직업", HOBBY: "취미",
};
export const LiarSettingsSchema = v.strictObject({ category: v.picklist(["RANDOM", ...LIAR_CATEGORIES]), discussionSeconds: v.picklist([60, 90, 120]) });
export type LiarSettings = v.InferOutput<typeof LiarSettingsSchema>;
export const LIAR_DEFAULT_SETTINGS: LiarSettings = { category: "RANDOM", discussionSeconds: 90 };
export const LiarStageSchema = v.picklist(["REVEAL", "CLUE", "DISCUSSION", "VOTE", "REVOTE", "GUESS"]);
export type LiarStage = v.InferOutput<typeof LiarStageSchema>;
export const LiarClueSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(40));
export const LiarTextSchema = v.pipe(v.string(), v.trim(), v.minLength(1), v.maxLength(200));

export const LIAR_TOTAL_ROUNDS = 10;
