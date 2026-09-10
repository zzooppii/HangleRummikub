import * as v from "valibot";

const Nat = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const Id = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
export const DifficultySchema = v.picklist(["EASY", "NORMAL", "HARD", "NIGHTMARE"]);
export const SettingsSchema = v.strictObject({
  lunchboxCount: v.pipe(Nat, v.minValue(1), v.maxValue(5)), difficulty: DifficultySchema,
});
export type LunchSettings = v.InferOutput<typeof SettingsSchema>;
export type Difficulty = LunchSettings["difficulty"];
export const TeacherSchema = v.picklist(["BOARD", "SUSPICIOUS", "WATCHING", "RETURNING"]);
export type TeacherState = v.InferOutput<typeof TeacherSchema>;
export const BITE_INTERVAL_MS = 150;
export const BITES_PER_BOX = 30;
type Range = readonly [number, number];
type Timing = Readonly<Record<TeacherState, Range> & { fakePercent: number }>;
export const DIFFICULTY_TIMING: Readonly<Record<Difficulty, Timing>> = {
  EASY: { BOARD: [4500, 7500], SUSPICIOUS: [900, 1100], WATCHING: [1600, 2200], RETURNING: [700, 900], fakePercent: 18 },
  NORMAL: { BOARD: [3000, 5500], SUSPICIOUS: [650, 800], WATCHING: [1300, 1900], RETURNING: [550, 700], fakePercent: 30 },
  HARD: { BOARD: [1800, 4000], SUSPICIOUS: [450, 550], WATCHING: [1000, 1500], RETURNING: [450, 550], fakePercent: 43 },
  NIGHTMARE: { BOARD: [700, 5200], SUSPICIOUS: [300, 700], WATCHING: [800, 1500], RETURNING: [350, 650], fakePercent: 58 },
};
const PlanSchema = v.strictObject({ durationMs: v.pipe(Nat, v.minValue(1)), outcome: v.nullable(v.picklist(["FAKE", "REAL"])) });
export type TeacherPlanInput = v.InferOutput<typeof PlanSchema>;
function invariant(ok: boolean): asserts ok { if (!ok) throw new Error("Invalid SNEAKY_LUNCH state or action."); }

/** Samples are supplied by the application; no ambient randomness or clock. */
export function planTeacher(difficulty: Difficulty, teacher: TeacherState, consecutiveFakes: number,
  samples: Readonly<{ duration: number; band: number; outcome: number }>): TeacherPlanInput {
  for (const sample of Object.values(samples)) invariant(Number.isInteger(sample) && sample >= 0 && sample < 10000);
  const config = DIFFICULTY_TIMING[difficulty];
  let range = config[teacher];
  if (difficulty === "NIGHTMARE" && teacher === "BOARD") {
    const bands: readonly Range[] = [[700, 1600], [1601, 3200], [3201, 5200]];
    range = bands[Math.floor(samples.band * 3 / 10000)]!;
  }
  return { durationMs: range[0] + Math.floor(samples.duration * (range[1] - range[0] + 1) / 10000),
    outcome: teacher !== "SUSPICIOUS" ? null : difficulty === "NIGHTMARE" && consecutiveFakes >= 2 ? "REAL"
      : samples.outcome < config.fakePercent * 100 ? "FAKE" : "REAL" };
}
function validatePlan(settings: LunchSettings, teacher: TeacherState, fakes: number, value: TeacherPlanInput) {
  const plan = v.parse(PlanSchema, value), [min, max] = DIFFICULTY_TIMING[settings.difficulty][teacher];
  invariant(plan.durationMs >= min && plan.durationMs <= max);
  invariant(teacher === "SUSPICIOUS" ? plan.outcome !== null : plan.outcome === null);
  if (teacher === "SUSPICIOUS" && settings.difficulty === "NIGHTMARE" && fakes >= 2) invariant(plan.outcome === "REAL");
  return plan;
}
const PlayerSchema = v.strictObject({ playerId: Id, status: v.picklist(["ACTIVE", "CAUGHT", "FORFEITED"]),
  completedBites: Nat, lastAcceptedEatAt: v.nullable(Nat) });
const Shape = v.strictObject({
  rulesVersion: v.picklist(["sneaky-lunch-rules-v1", "sneaky-lunch-rules-v2"]),
  placementOrder: v.optional(v.array(Id)), gameId: Id, revision: Nat, settings: SettingsSchema,
  players: v.pipe(v.array(PlayerSchema), v.minLength(2), v.maxLength(8)), requiredBites: Nat,
  phase: v.picklist(["COUNTDOWN", "CLASSROOM", "FINISHED"]),
  teacherState: v.nullable(TeacherSchema), teacherStateRevision: Nat,
  transitionId: Id, startedAt: Nat, phaseStartedAt: Nat, nextTransitionAt: v.nullable(Nat),
  plannedOutcome: v.nullable(v.picklist(["FAKE", "REAL"])), consecutiveFakes: Nat,
  finishedAt: v.nullable(Nat), result: v.nullable(v.strictObject({
    reason: v.picklist(["PLAYER_FINISHED", "TEACHER_WIN", "PLACEMENT_COMPLETE", "LAST_PLAYER_STANDING"]), winnerPlayerId: v.nullable(Id),
  })),
});
export type SneakyLunchState = v.InferOutput<typeof Shape>;

/** Strict detached validation, including derived progress and terminal coherence. */
export function parseSneakyLunchState(value: unknown): SneakyLunchState {
  const s = v.parse(Shape, value);
  invariant(new Set(s.players.map(p => p.playerId)).size === s.players.length);
  const modern = s.rulesVersion === "sneaky-lunch-rules-v2", placed = s.placementOrder ?? [];
  invariant(modern ? s.placementOrder !== undefined : s.placementOrder === undefined);
  invariant(new Set(placed).size === placed.length && placed.every(id => s.players.some(p => p.playerId === id && p.status === "ACTIVE")));
  if (modern) {
    invariant(s.players.every(p => p.completedBites !== s.requiredBites || placed.includes(p.playerId)));
    invariant(placed.every((id, i) => s.players.find(p => p.playerId === id)!.completedBites === s.requiredBites || s.phase === "FINISHED" && i === placed.length - 1));
    if (s.phase !== "FINISHED") invariant(s.players.filter(p => p.status === "ACTIVE" && !placed.includes(p.playerId)).length >= 2);
    if (s.phase === "COUNTDOWN") invariant(placed.length === 0);
  }
  invariant(s.requiredBites === s.settings.lunchboxCount * BITES_PER_BOX);
  invariant(s.revision >= s.teacherStateRevision && s.phaseStartedAt >= s.startedAt);
  invariant(s.players.every(p => p.completedBites <= s.requiredBites &&
    (p.completedBites === 0 ? p.lastAcceptedEatAt === null : p.lastAcceptedEatAt !== null && p.lastAcceptedEatAt >= s.startedAt + 3000)));
  if (s.settings.difficulty === "NIGHTMARE") invariant(s.consecutiveFakes <= 2);
  if (s.phase === "FINISHED") {
    invariant(s.finishedAt !== null && s.finishedAt >= s.phaseStartedAt && s.nextTransitionAt === null && s.plannedOutcome === null && s.result !== null);
    if (modern) {
      invariant(s.players.every(p => p.status !== "ACTIVE" || placed.includes(p.playerId)));
      invariant(s.result.winnerPlayerId === (placed[0] ?? null));
      invariant(placed.length === 0 ? s.result.reason === "TEACHER_WIN" : s.result.reason === "PLACEMENT_COMPLETE" || s.result.reason === "LAST_PLAYER_STANDING");
    } else if (s.result.reason === "TEACHER_WIN") invariant(s.result.winnerPlayerId === null && s.players.every(p => p.status !== "ACTIVE" && p.completedBites < s.requiredBites));
    else invariant(s.players.filter(p => p.completedBites === s.requiredBites).length === 1 && s.players.some(p =>
      p.playerId === s.result!.winnerPlayerId && p.status === "ACTIVE" && p.completedBites === s.requiredBites) && s.result.reason === "PLAYER_FINISHED");
  } else {
    invariant(s.result === null && s.finishedAt === null && s.nextTransitionAt !== null && s.nextTransitionAt > s.phaseStartedAt);
    invariant(s.players.some(p => p.status === "ACTIVE") && (modern || s.players.every(p => p.completedBites < s.requiredBites)));
    if (s.phase === "COUNTDOWN") {
      invariant(s.teacherState === null && s.teacherStateRevision === 0 && s.plannedOutcome === null && s.consecutiveFakes === 0);
      invariant(s.phaseStartedAt === s.startedAt && s.nextTransitionAt === s.startedAt + 3000 && s.players.every(p => p.completedBites === 0));
    } else {
      invariant(s.teacherState !== null && s.teacherStateRevision > 0);
      validatePlan(s.settings, s.teacherState, s.consecutiveFakes, { durationMs: s.nextTransitionAt - s.phaseStartedAt, outcome: s.plannedOutcome });
    }
  }
  return s;
}
export function createSneakyLunch(input: Readonly<{ gameId: string; playerIds: readonly string[]; settings: LunchSettings; now: number; transitionId: string; rulesVersion?: "sneaky-lunch-rules-v1" | "sneaky-lunch-rules-v2" }>): SneakyLunchState {
  const rulesVersion = input.rulesVersion ?? "sneaky-lunch-rules-v2";
  return parseSneakyLunchState({ rulesVersion, ...(rulesVersion === "sneaky-lunch-rules-v2" ? { placementOrder: [] } : {}), gameId: input.gameId, revision: 0, settings: input.settings,
    players: input.playerIds.map(playerId => ({ playerId, status: "ACTIVE", completedBites: 0, lastAcceptedEatAt: null })),
    requiredBites: input.settings.lunchboxCount * BITES_PER_BOX, phase: "COUNTDOWN", teacherState: null, teacherStateRevision: 0,
    transitionId: input.transitionId, startedAt: input.now, phaseStartedAt: input.now, nextTransitionAt: input.now + 3000,
    plannedOutcome: null, consecutiveFakes: 0, finishedAt: null, result: null });
}
export function nextTeacherState(s: SneakyLunchState): TeacherState {
  invariant(s.phase !== "FINISHED");
  if (s.phase === "COUNTDOWN" || s.teacherState === "RETURNING" || s.teacherState === "SUSPICIOUS" && s.plannedOutcome === "FAKE") return "BOARD";
  if (s.teacherState === "BOARD") return "SUSPICIOUS";
  if (s.teacherState === "SUSPICIOUS") return "WATCHING";
  return "RETURNING";
}
export function transitionTeacher(previous: SneakyLunchState, token: string, now: number, nextToken: string, plan: TeacherPlanInput): SneakyLunchState {
  const s = parseSneakyLunchState(previous);
  invariant(s.phase !== "FINISHED" && token === s.transitionId && nextToken !== token && s.nextTransitionAt !== null && now >= s.nextTransitionAt);
  const teacher = nextTeacherState(s);
  if (s.teacherState === "SUSPICIOUS") s.consecutiveFakes = s.plannedOutcome === "FAKE" ? s.consecutiveFakes + 1 : 0;
  const valid = validatePlan(s.settings, teacher, s.consecutiveFakes, plan);
  s.phase = "CLASSROOM"; s.teacherState = teacher; s.teacherStateRevision++; s.revision++;
  s.transitionId = nextToken; s.phaseStartedAt = now; s.nextTransitionAt = now + valid.durationMs; s.plannedOutcome = valid.outcome;
  return parseSneakyLunchState(s);
}
function finish(s: SneakyLunchState, now: number, winner: string | null) {
  s.phase = "FINISHED"; s.finishedAt = now; s.nextTransitionAt = null; s.plannedOutcome = null;
  s.result = { reason: winner === null ? "TEACHER_WIN" : "PLAYER_FINISHED", winnerPlayerId: winner };
}
/** Rank is immutable; placed participants remain spectators, not forfeits. */
function settlePlacements(s: SneakyLunchState, now: number, elimination: boolean) {
  const placed = s.placementOrder;
  invariant(placed !== undefined);
  const remaining = s.players.filter(p => p.status === "ACTIVE" && !placed.includes(p.playerId));
  if (remaining.length > 1) return;
  if (remaining[0]) placed.push(remaining[0].playerId);
  finish(s, now, placed[0] ?? null);
  if (placed.length) s.result!.reason = elimination ? "LAST_PLAYER_STANDING" : "PLACEMENT_COMPLETE";
}
export type EatOutcome = "ACCEPTED" | "CAUGHT" | "STALE" | "RATE_LIMITED" | "NOT_ACTIVE" | "INVALID_PHASE";
export function eatLunch(previous: SneakyLunchState, actor: string, teacherRevision: number, now: number): Readonly<{ state: SneakyLunchState; outcome: EatOutcome }> {
  const s = parseSneakyLunchState(previous);
  v.parse(Nat, now);
  if (s.phase !== "CLASSROOM") return { state: s, outcome: "INVALID_PHASE" };
  const player = s.players.find(p => p.playerId === actor);
  if (!player || player.status !== "ACTIVE" || s.placementOrder?.includes(actor)) return { state: s, outcome: "NOT_ACTIVE" };
  if (teacherRevision !== s.teacherStateRevision || now < s.phaseStartedAt) return { state: s, outcome: "STALE" };
  if (s.teacherState === "WATCHING" || s.teacherState === "RETURNING") {
    player.status = "CAUGHT"; s.revision++;
    if (s.placementOrder) settlePlacements(s, now, true);
    else if (s.players.every(p => p.status !== "ACTIVE")) finish(s, now, null);
    return { state: parseSneakyLunchState(s), outcome: "CAUGHT" };
  }
  if (player.lastAcceptedEatAt !== null && now - player.lastAcceptedEatAt < BITE_INTERVAL_MS) return { state: s, outcome: "RATE_LIMITED" };
  player.completedBites++; player.lastAcceptedEatAt = now; s.revision++;
  if (player.completedBites === s.requiredBites) {
    if (s.placementOrder) { s.placementOrder.push(actor); settlePlacements(s, now, false); }
    else finish(s, now, player.playerId);
  }
  return { state: parseSneakyLunchState(s), outcome: "ACCEPTED" };
}
export function forfeitLunch(previous: SneakyLunchState, actor: string, now: number): SneakyLunchState {
  const s = parseSneakyLunchState(previous), player = s.players.find(p => p.playerId === actor);
  invariant(player !== undefined && Number.isSafeInteger(now) && now >= s.phaseStartedAt);
  if (s.phase === "FINISHED" || player.status !== "ACTIVE" || s.placementOrder?.includes(actor)) return s;
  player.status = "FORFEITED"; s.revision++;
  if (s.placementOrder) settlePlacements(s, now, true);
  else if (s.players.every(p => p.status !== "ACTIVE")) finish(s, now, null);
  return parseSneakyLunchState(s);
}

/** One presence sweep is one atomic elimination batch, not a fictitious offline survivor. */
export function forfeitLunchBatch(previous: SneakyLunchState, actors: readonly string[], now: number): SneakyLunchState {
  if (previous.rulesVersion === "sneaky-lunch-rules-v1") return actors.reduce((s, id) => forfeitLunch(s, id, now), previous);
  const s = parseSneakyLunchState(previous);
  invariant(Number.isSafeInteger(now) && now >= s.phaseStartedAt && actors.every(id => s.players.some(p => p.playerId === id)));
  if (s.phase === "FINISHED") return s;
  const affected = s.players.filter(p => actors.includes(p.playerId) && p.status === "ACTIVE" && !s.placementOrder?.includes(p.playerId));
  if (!affected.length) return s;
  affected.forEach(p => { p.status = "FORFEITED"; });
  s.revision++; settlePlacements(s, now, true);
  return parseSneakyLunchState(s);
}
