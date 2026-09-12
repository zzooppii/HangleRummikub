import * as v from "valibot";
import { PlayerIdSchema } from "../../identifiers.js";

export const SpaceCrewCardIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
export const SpaceCrewTaskIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
export const SpaceCrewCampaignIdSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{16,128}$/));
export const SpaceCrewRecoveryTokenSchema = v.pipe(v.string(), v.regex(/^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/));
export const SpaceCrewMissionNumberSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(50));
export const SpaceCrewColorSchema = v.picklist(["PINK", "BLUE", "GREEN", "YELLOW"]);
export const SpaceCrewCardSchema = v.variant("kind", [
  v.strictObject({ cardId: SpaceCrewCardIdSchema, kind: v.literal("COLOR"), suit: SpaceCrewColorSchema, value: v.picklist([1, 2, 3, 4, 5, 6, 7, 8, 9]) }),
  v.strictObject({ cardId: SpaceCrewCardIdSchema, kind: v.literal("ROCKET"), suit: v.literal("ROCKET"), value: v.picklist([1, 2, 3, 4]) }),
]);
export type SpaceCrewCard = v.InferOutput<typeof SpaceCrewCardSchema>;
export const SpaceCrewCommunicationMarkSchema = v.picklist(["HIGHEST", "LOWEST", "ONLY"]);
export const SpaceCrewDirectionSchema = v.picklist(["LEFT", "RIGHT"]);
export const SpaceCrewRolePreferenceSchema = v.picklist(["FIRST_FOUR", "MIDDLE", "LAST"]);
export const SpaceCrewTaskTokenSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("ABSOLUTE"), position: v.picklist([1, 2, 3, 4, 5]) }),
  v.strictObject({ kind: v.literal("RELATIVE"), position: v.picklist([1, 2, 3, 4]) }),
  v.strictObject({ kind: v.literal("LAST") }),
]);

const TaskActionSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("CHOOSE"), taskId: SpaceCrewTaskIdSchema }),
  v.strictObject({ kind: v.literal("RESPOND"), taskId: v.nullable(SpaceCrewTaskIdSchema), answer: v.boolean() }),
  v.strictObject({ kind: v.literal("ASSIGN"), taskId: v.nullable(SpaceCrewTaskIdSchema), toPlayerId: PlayerIdSchema }),
  v.strictObject({ kind: v.literal("TRANSFER"), taskId: SpaceCrewTaskIdSchema, toPlayerId: PlayerIdSchema }),
  v.strictObject({ kind: v.literal("SWAP_TOKENS"), firstTaskId: SpaceCrewTaskIdSchema, secondTaskId: SpaceCrewTaskIdSchema }),
  v.strictObject({ kind: v.literal("MOVE_TOKEN"), fromTaskId: SpaceCrewTaskIdSchema, toTaskId: SpaceCrewTaskIdSchema }),
]);
const DistressActionSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("PROPOSE"), direction: SpaceCrewDirectionSchema }),
  v.strictObject({ kind: v.literal("VOTE"), accept: v.boolean() }),
  v.strictObject({ kind: v.literal("SELECT"), cardId: SpaceCrewCardIdSchema }),
  v.strictObject({ kind: v.literal("SKIP") }),
]);
/** Revision and authenticated actor are supplied by the command envelope/application. */
export const SpaceCrewActionSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("PLAY"), cardId: SpaceCrewCardIdSchema }),
  v.strictObject({ kind: v.literal("COMMUNICATE"), cardId: SpaceCrewCardIdSchema, mark: v.nullable(SpaceCrewCommunicationMarkSchema) }),
  v.strictObject({ kind: v.literal("TASK"), action: TaskActionSchema }),
  v.strictObject({ kind: v.literal("DISTRESS"), action: DistressActionSchema }),
  v.strictObject({ kind: v.literal("SPECIAL_RESPOND"), answer: v.union([v.picklist(["GOOD", "BAD"]), v.boolean()]) }),
  v.strictObject({ kind: v.literal("SPECIAL_SELECT"), playerId: PlayerIdSchema }),
  v.strictObject({ kind: v.literal("SPECIAL_PREFERENCE"), preference: SpaceCrewRolePreferenceSchema }),
  v.strictObject({ kind: v.literal("SPECIAL_PROPOSE_ROLES"), firstFourPlayerId: PlayerIdSchema, lastPlayerId: PlayerIdSchema }),
  v.strictObject({ kind: v.literal("SPECIAL_VOTE_ROLES"), accept: v.boolean() }),
]);
export type SpaceCrewAction = v.InferOutput<typeof SpaceCrewActionSchema>;

export const SpaceCrewStartPayloadSchema = v.variant("kind", [
  v.variant("mode", [
    v.strictObject({ kind: v.literal("NEW"), mode: v.literal("CAMPAIGN"), recoveryToken: SpaceCrewRecoveryTokenSchema }),
    v.strictObject({ kind: v.literal("NEW"), mode: v.literal("PRACTICE"), missionNumber: SpaceCrewMissionNumberSchema, recoveryToken: SpaceCrewRecoveryTokenSchema }),
  ]),
  v.strictObject({ kind: v.literal("RESUME"), campaignId: SpaceCrewCampaignIdSchema, recoveryToken: SpaceCrewRecoveryTokenSchema }),
]);
export type SpaceCrewStartPayload = v.InferOutput<typeof SpaceCrewStartPayloadSchema>;
export const SpaceCrewPracticeSelectionPayloadSchema = v.strictObject({ missionNumber: SpaceCrewMissionNumberSchema });
