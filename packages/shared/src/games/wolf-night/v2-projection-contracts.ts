import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import { WolfDeckSchema, WolfRoleSchema, WolfSettingsSchema, WolfStageSchema, WolfTextSchema } from "./contracts.js";
const Nat = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
export const WolfObservationSchema = v.strictObject({ label: v.picklist(["COPY", "WOLVES", "MASONS", "SEEN", "SWAPPED", "PASSED", "AUTO"]),
  playerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(10)), cards: v.pipe(v.array(v.strictObject({ location: v.string(), role: WolfRoleSchema })), v.maxLength(2)) });
export const WolfResultSchema = v.strictObject({ reason: v.picklist(["VOTED", "CANCELLED"]),
  eliminatedPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(10)), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(10)),
  villageWins: v.boolean(), wolvesWin: v.boolean(), tannerWins: v.boolean(),
  players: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, originalRole: WolfRoleSchema, finalRole: WolfRoleSchema, effectiveRole: WolfRoleSchema, votedFor: v.nullable(PlayerIdSchema), votesReceived: Nat })), v.minLength(3), v.maxLength(10)),
  center: v.tuple([WolfRoleSchema, WolfRoleSchema, WolfRoleSchema]) });
const Base = { gameType: v.literal("WOLF_NIGHT"), gameId: GameIdSchema, gameRevision: GameRevisionSchema,
  rulesVersion: v.literal("wolf-night-v1"), settings: WolfSettingsSchema, deck: WolfDeckSchema,
  playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema })), v.minLength(3), v.maxLength(10)),
  messages: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, text: WolfTextSchema, at: ServerTimeSchema })), v.maxLength(100)) };
export const WolfPlayingProjectionSchema = v.strictObject({ ...Base, phase: v.literal("PLAYING"), stage: v.pipe(WolfStageSchema, v.check(s => s !== "FINISHED")),
  phaseId: TurnIdSchema, deadlineAt: ServerTimeSchema,
  privateView: v.strictObject({ playerId: PlayerIdSchema, originalRole: WolfRoleSchema, copiedRole: v.nullable(WolfRoleSchema),
    actionRole: v.nullable(WolfRoleSchema), actionRevision: Nat, canPass: v.boolean(), loneWolf: v.boolean(),
    observations: v.pipe(v.array(WolfObservationSchema), v.maxLength(30)), votedFor: v.nullable(PlayerIdSchema) }) });
export const WolfFinishedProjectionSchema = v.strictObject({ ...Base, phase: v.literal("FINISHED"), result: WolfResultSchema });
export type WolfPlayingProjection = v.InferOutput<typeof WolfPlayingProjectionSchema>;
export type WolfFinishedProjection = v.InferOutput<typeof WolfFinishedProjectionSchema>;
