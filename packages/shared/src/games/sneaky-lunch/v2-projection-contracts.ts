import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import { SneakySettingsSchema, SneakyTeacherStateSchema } from "./contracts.js";
const Nat = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const Player = v.strictObject({ playerId: PlayerIdSchema, status: v.picklist(["ACTIVE", "CAUGHT", "FORFEITED"]), completedBites: v.pipe(Nat, v.maxValue(150)) });
const Base = { gameType: v.literal("SNEAKY_LUNCH"), gameId: GameIdSchema, gameRevision: GameRevisionSchema,
  rulesVersion: v.literal("sneaky-lunch-rules-v1"), settings: SneakySettingsSchema, requiredBites: v.pipe(Nat, v.minValue(30), v.maxValue(150)),
  playerStates: v.pipe(v.array(Player), v.minLength(2), v.maxLength(8)), teacherStateRevision: Nat };
const coherent = (s: { settings: { lunchboxCount: number }; requiredBites: number; playerStates: readonly { playerId: string; completedBites: number }[] }) =>
  s.requiredBites === s.settings.lunchboxCount * 30 && new Set(s.playerStates.map(p => p.playerId)).size === s.playerStates.length && s.playerStates.every(p => p.completedBites <= s.requiredBites);
export const SneakyCountdownProjectionSchema = v.pipe(v.strictObject({ ...Base, phase: v.literal("COUNTDOWN"), countdownEndsAt: ServerTimeSchema }),
  v.check(s => coherent(s)), v.check(s => s.teacherStateRevision === 0 && s.playerStates.every(p => p.completedBites === 0)));
export const SneakyClassroomProjectionSchema = v.pipe(v.strictObject({ ...Base, phase: v.literal("CLASSROOM"), teacherState: SneakyTeacherStateSchema }),
  v.check(s => coherent(s)), v.check(s => s.teacherStateRevision > 0 && s.playerStates.some(p => p.status === "ACTIVE") && s.playerStates.every(p => p.completedBites < s.requiredBites)));
export const SneakyPlayingProjectionSchema = v.union([SneakyCountdownProjectionSchema, SneakyClassroomProjectionSchema]);
export const SneakyFinishedProjectionSchema = v.pipe(v.strictObject({ ...Base, phase: v.literal("FINISHED"),
  result: v.strictObject({ reason: v.picklist(["PLAYER_FINISHED", "TEACHER_WIN"]), winnerPlayerId: v.nullable(PlayerIdSchema) }) }), v.check(s => coherent(s)),
  v.check(s => s.result.reason === "TEACHER_WIN"
    ? s.result.winnerPlayerId === null && s.playerStates.every(p => p.status !== "ACTIVE" && p.completedBites < s.requiredBites)
    : s.playerStates.filter(p => p.completedBites === s.requiredBites).length === 1 && s.playerStates.some(p => p.playerId === s.result.winnerPlayerId && p.status === "ACTIVE" && p.completedBites === s.requiredBites)));
export type SneakyPlayingProjection = v.InferOutput<typeof SneakyPlayingProjectionSchema>;
export type SneakyFinishedProjection = v.InferOutput<typeof SneakyFinishedProjectionSchema>;
