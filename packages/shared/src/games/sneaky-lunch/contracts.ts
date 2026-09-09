import * as v from "valibot";
export const SneakyDifficultySchema = v.picklist(["EASY", "NORMAL", "HARD", "NIGHTMARE"]);
export const SneakySettingsSchema = v.strictObject({ lunchboxCount: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(5)), difficulty: SneakyDifficultySchema });
export type SneakySettings = v.InferOutput<typeof SneakySettingsSchema>;
export const SneakyTeacherStateSchema = v.picklist(["BOARD", "SUSPICIOUS", "WATCHING", "RETURNING"]);
