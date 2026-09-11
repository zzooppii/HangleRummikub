import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import { LiarCategorySchema, LiarClueSchema, LiarSettingsSchema, LiarStageSchema, LiarTextSchema } from "./contracts.js";
const PlayerIds = v.pipe(v.array(PlayerIdSchema), v.maxLength(8), v.check(ids => new Set(ids).size === ids.length));
export const LiarVoteRecordSchema = v.strictObject({ playerId: PlayerIdSchema, votedFor: v.nullable(PlayerIdSchema) });
export const LiarResultSchema = v.strictObject({ reason: v.picklist(["MISIDENTIFIED", "NO_VOTES", "TIE", "GUESS_CORRECT", "GUESS_WRONG", "GUESS_TIMEOUT", "CANCELLED"]),
  winnerPlayerIds: PlayerIds, liarPlayerId: PlayerIdSchema, word: LiarClueSchema, guess: v.nullable(LiarClueSchema),
  voteRounds: v.pipe(v.array(v.pipe(v.array(LiarVoteRecordSchema), v.minLength(4), v.maxLength(8))), v.maxLength(2)) });
export type LiarResult = v.InferOutput<typeof LiarResultSchema>;
const Base = { gameType: v.literal("LIAR_GAME"), gameId: GameIdSchema, gameRevision: GameRevisionSchema, rulesVersion: v.literal("liar-game-v1"),
  settings: LiarSettingsSchema, category: LiarCategorySchema,
  playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, clue: v.nullable(LiarClueSchema), clueDone: v.boolean() })), v.minLength(4), v.maxLength(8)),
  messages: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, text: LiarTextSchema, at: ServerTimeSchema })), v.maxLength(100)) };
const PrivateBase = { playerId: PlayerIdSchema, votedFor: v.nullable(PlayerIdSchema) };
export const LiarPrivateViewSchema = v.variant("role", [
  v.strictObject({ ...PrivateBase, role: v.literal("CITIZEN"), word: LiarClueSchema }),
  v.strictObject({ ...PrivateBase, role: v.literal("LIAR") }),
]);
export const LiarPlayingProjectionSchema = v.strictObject({ ...Base, phase: v.literal("PLAYING"), stage: LiarStageSchema,
  phaseId: TurnIdSchema, deadlineAt: ServerTimeSchema, activePlayerId: v.nullable(PlayerIdSchema), voteCandidates: PlayerIds,
  privateView: LiarPrivateViewSchema });
export const LiarFinishedProjectionSchema = v.strictObject({ ...Base, phase: v.literal("FINISHED"), result: LiarResultSchema });
export type LiarPlayingProjection = v.InferOutput<typeof LiarPlayingProjectionSchema>;
export type LiarFinishedProjection = v.InferOutput<typeof LiarFinishedProjectionSchema>;
