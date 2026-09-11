import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import { SpyfallSettingsSchema, SpyfallLocationSchema, SpyfallStageSchema, SpyfallRoleLabelSchema, spyfallLocations } from "./contracts.js";
const Ids = v.pipe(v.array(PlayerIdSchema), v.maxLength(8), v.check(ids => new Set<string>(ids).size === ids.length));
export const SpyfallBallotSchema = v.strictObject({ playerId: PlayerIdSchema, agree: v.nullable(v.boolean()) });
export const SpyfallVoteRecordSchema = v.strictObject({ accuserId: PlayerIdSchema, suspectId: PlayerIdSchema, final: v.boolean(), convicted: v.boolean(), ballots: v.pipe(v.array(SpyfallBallotSchema), v.minLength(3), v.maxLength(8)) });
export const SpyfallHistorySchema = v.strictObject({ questionerId: PlayerIdSchema, respondentId: v.nullable(PlayerIdSchema), completed: v.boolean() });
export const SpyfallResultSchema = v.strictObject({ reason: v.picklist(["SPY_CAUGHT", "MISIDENTIFIED", "ESCAPED", "GUESS_CORRECT", "GUESS_WRONG", "GUESS_TIMEOUT", "CANCELLED"]), winnerPlayerIds: Ids, spyPlayerId: PlayerIdSchema, location: SpyfallLocationSchema, guess: v.nullable(SpyfallLocationSchema), voteRounds: v.pipe(v.array(SpyfallVoteRecordSchema), v.maxLength(16)) });
export type SpyfallResult = v.InferOutput<typeof SpyfallResultSchema>;
const Base = { gameType: v.literal("SPYFALL"), gameId: GameIdSchema, gameRevision: GameRevisionSchema, rulesVersion: v.literal("spyfall-v1"), settings: SpyfallSettingsSchema,
  playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, accusationUsed: v.boolean() })), v.minLength(3), v.maxLength(8)),
  history: v.pipe(v.array(SpyfallHistorySchema), v.maxLength(100)) };
const PrivateBase = { playerId: PlayerIdSchema, vote: v.nullable(v.boolean()) };
export const SpyfallPrivateViewSchema = v.variant("role", [v.strictObject({ ...PrivateBase, role: v.literal("CITIZEN"), location: SpyfallLocationSchema, job: v.nullable(SpyfallRoleLabelSchema) }), v.strictObject({ ...PrivateBase, role: v.literal("SPY") })]);
const SpyfallPlayingRaw = v.strictObject({ ...Base, phase: v.literal("PLAYING"), stage: SpyfallStageSchema,
  phaseId: TurnIdSchema, deadlineAt: ServerTimeSchema, roundDeadlineAt: v.nullable(ServerTimeSchema), remainingMs: v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(600_000)),
  questionerId: PlayerIdSchema, previousQuestionerId: v.nullable(PlayerIdSchema), respondentId: v.nullable(PlayerIdSchema),
  accuserId: v.nullable(PlayerIdSchema), suspectId: v.nullable(PlayerIdSchema), finalAccuserId: v.nullable(PlayerIdSchema), revealedSpyId: v.nullable(PlayerIdSchema),
  privateView: SpyfallPrivateViewSchema });
const SpyfallFinishedRaw = v.strictObject({ ...Base, phase: v.literal("FINISHED"), result: SpyfallResultSchema });
export type SpyfallPlayingProjection = v.InferOutput<typeof SpyfallPlayingRaw>;
export type SpyfallFinishedProjection = v.InferOutput<typeof SpyfallFinishedRaw>;
export type SpyfallProjection = SpyfallPlayingProjection | SpyfallFinishedProjection;

export function spyfallProjectionConsistent(s: SpyfallProjection): boolean {
  const ids = s.playerStates.map(p => p.playerId), members = new Set<string>(ids);
  const belongs = (id: string | null) => id === null || members.has(id);
  if (ids.length !== members.size || s.history.some(h => !members.has(h.questionerId) || !belongs(h.respondentId) || h.questionerId === h.respondentId || h.completed && h.respondentId === null)) return false;
  if (s.phase === "FINISHED") {
    const r = s.result, citizenWin = ["SPY_CAUGHT", "GUESS_WRONG", "GUESS_TIMEOUT"].includes(r.reason);
    const expected = r.reason === "CANCELLED" ? [] : citizenWin ? ids.filter(id => id !== r.spyPlayerId) : [r.spyPlayerId];
    return members.has(r.spyPlayerId) && spyfallLocations(s.settings.locationPack).includes(r.location) &&
      JSON.stringify(r.winnerPlayerIds) === JSON.stringify(expected) &&
      ((r.reason === "GUESS_CORRECT" || r.reason === "GUESS_WRONG") === (r.guess !== null)) &&
      (r.guess === null || spyfallLocations(s.settings.locationPack).includes(r.guess)) &&
      (r.reason !== "GUESS_CORRECT" || r.guess === r.location) && (r.reason !== "GUESS_WRONG" || r.guess !== r.location) &&
      r.voteRounds.every(round => members.has(round.accuserId) && members.has(round.suspectId) && round.accuserId !== round.suspectId &&
        round.ballots.length === ids.length && round.ballots.every((b, i) => b.playerId === ids[i] && (b.playerId !== round.suspectId || b.agree === null) && (b.playerId !== round.accuserId || b.agree === true)) &&
        round.convicted === round.ballots.filter(b => b.playerId !== round.suspectId).every(b => b.agree === true));
  }
  const active = s.stage === "QUESTION" || s.stage === "ANSWER";
  if (!members.has(s.privateView.playerId) || !members.has(s.questionerId) ||
    ![s.previousQuestionerId, s.respondentId, s.accuserId, s.suspectId, s.finalAccuserId, s.revealedSpyId].every(belongs) ||
    s.questionerId === s.previousQuestionerId || s.respondentId !== null && (s.respondentId === s.questionerId || s.respondentId === s.previousQuestionerId) ||
    active !== (s.roundDeadlineAt !== null) || active && s.deadlineAt > s.roundDeadlineAt! ||
    s.stage === "QUESTION" && s.respondentId !== null || s.stage === "ANSWER" && s.respondentId === null ||
    (s.stage === "GUESS") !== (s.revealedSpyId !== null) ||
    s.stage === "GUESS" && (s.privateView.role === "SPY") !== (s.revealedSpyId === s.privateView.playerId) ||
    s.stage === "FINAL_ACCUSATION" && s.finalAccuserId === null ||
    s.stage !== "ACCUSATION" && s.stage !== "FINAL_ACCUSATION" && s.finalAccuserId !== null ||
    s.stage === "ACCUSATION" && (s.accuserId === null || s.suspectId === null || s.accuserId === s.suspectId ||
      s.privateView.playerId === s.accuserId && s.privateView.vote !== true || s.privateView.playerId === s.suspectId && s.privateView.vote !== null) ||
    s.stage !== "ACCUSATION" && (s.accuserId !== null || s.suspectId !== null || s.privateView.vote !== null) ||
    s.privateView.role === "CITIZEN" && (!spyfallLocations(s.settings.locationPack).includes(s.privateView.location) || (s.privateView.job !== null) !== s.settings.useRoles)) return false;
  return true;
}
export const SpyfallPlayingProjectionSchema = v.pipe(SpyfallPlayingRaw, v.check(s => spyfallProjectionConsistent(s)));
export const SpyfallFinishedProjectionSchema = v.pipe(SpyfallFinishedRaw, v.check(s => spyfallProjectionConsistent(s)));
