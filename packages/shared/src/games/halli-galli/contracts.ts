import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
export const HALLI_FRUITS = ["STRAWBERRY", "BANANA", "LIME", "PLUM"] as const;
export const HalliFruitSchema = v.picklist(HALLI_FRUITS);
export const HalliCardFaceSchema = v.strictObject({ fruit: HalliFruitSchema, count: v.picklist([1, 2, 3, 4, 5]) });
export type HalliCardFace = v.InferOutput<typeof HalliCardFaceSchema>;
const Count = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(56));
export const HalliFeedbackSchema = v.nullable(v.strictObject({ playerId: PlayerIdSchema, kind: v.picklist(["FLIP", "CORRECT", "WRONG", "AUTO"]), cards: Count, at: ServerTimeSchema }));
export const HalliResultSchema = v.strictObject({ reason: v.picklist(["FINAL_BELL", "LAST_PLAYER", "TIME_LIMIT", "CANCELLED"]), winnerPlayerIds: v.array(PlayerIdSchema), scores: v.array(v.strictObject({ playerId: PlayerIdSchema, cards: Count })) });
const Base = { gameType: v.literal("HALLI_GALLI"), gameId: GameIdSchema, gameRevision: GameRevisionSchema, rulesVersion: v.literal("halli-galli-v1"),
 playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, deckCount: Count, discardCount: Count, topCard: v.nullable(HalliCardFaceSchema), eliminated: v.boolean() })), v.minLength(2), v.maxLength(6)), feedback: HalliFeedbackSchema };
export const HalliPlayingProjectionSchema = v.strictObject({ ...Base, phase: v.literal("PLAYING"), turnId: TurnIdSchema, activePlayerId: PlayerIdSchema, flipAvailableAt: ServerTimeSchema, deadlineAt: ServerTimeSchema, gameDeadlineAt: ServerTimeSchema });
export const HalliFinishedProjectionSchema = v.strictObject({ ...Base, phase: v.literal("FINISHED"), result: HalliResultSchema });
