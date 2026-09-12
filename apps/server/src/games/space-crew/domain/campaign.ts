import * as v from "valibot";
import { SpaceCrewCampaignIdSchema, SpaceCrewCampaignSummarySchema, SpaceCrewMissionNumberSchema, type SpaceCrewCampaignSummary } from "@hangul-rummikub/shared";
import { createSpaceCrewDistressState, type SpaceCrewDistressHistory } from "./distress.js";

export { SpaceCrewCampaignSummarySchema as SpaceCrewCampaignAttachmentSchema };
export type SpaceCrewCampaignAttachment = SpaceCrewCampaignSummary;
const Count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const Positive = v.pipe(Count, v.minValue(1));
const Id = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
const TaskCount = v.pipe(Count, v.maxValue(10));
const ResultSchema = v.strictObject({ reason: v.picklist(["SUCCESS", "OBJECTIVES_COMPLETE", "WRONG_OWNER", "TASK_ORDER", "OBJECTIVE_NOT_MET", "ROCKET_DID_NOT_WIN", "ROCKET_ORDER", "FORBIDDEN_WIN_VALUE", "TOO_MANY_PLAYER_TRICKS", "UNEXPECTED_PLAYER_TRICK", "REQUIRED_WINNER_MISSED", "FORBIDDEN_PLAYER_ROCKET_WIN", "UNBALANCED_WINS", "WRONG_COLOR_CAPTURER", "OMEGA_NOT_LAST_TRICK"]), completedTaskCount: TaskCount, totalTaskCount: TaskCount });
const AttemptSchema = v.strictObject({
  attemptId: Id, runNumber: Positive, missionNumber: SpaceCrewMissionNumberSchema, attemptNumber: Positive,
  status: v.picklist(["ACTIVE", "SUCCESS", "FAILURE", "ABORTED"]), startedAt: Count, endedAt: v.nullable(Count), result: v.nullable(ResultSchema),
});
const DistressEventSchema = v.strictObject({
  runNumber: Positive, missionNumber: SpaceCrewMissionNumberSchema, attemptNumber: Positive,
  kind: v.picklist(["ACTIVATED", "EXCHANGED", "SKIPPED"]), direction: v.nullable(v.picklist(["LEFT", "RIGHT"])),
});
export const SpaceCrewCampaignLeaseSchema = v.strictObject({ processId: Id, roomId: Id, generation: Positive, active: v.boolean() });
export const SpaceCrewCampaignCheckpointSchema = v.strictObject({
  schemaVersion: v.literal(1), rulesVersion: v.literal("space-crew-planet-nine-v1"),
  campaignId: SpaceCrewCampaignIdSchema, revision: Count, mode: v.picklist(["CAMPAIGN", "PRACTICE"]),
  runNumber: Positive, missionNumber: SpaceCrewMissionNumberSchema, status: v.picklist(["OPEN", "COMPLETED"]),
  pendingInterruption: v.nullable(v.strictObject({ requestId: Id, attemptId: v.nullable(Id), now: Count })),
  completedMissions: v.pipe(v.array(SpaceCrewMissionNumberSchema), v.maxLength(50)),
  attempts: v.array(AttemptSchema), distressEvents: v.array(DistressEventSchema), lease: SpaceCrewCampaignLeaseSchema,
});
export type SpaceCrewCampaignCheckpoint = v.InferOutput<typeof SpaceCrewCampaignCheckpointSchema>;
export type SpaceCrewCampaignLease = v.InferOutput<typeof SpaceCrewCampaignLeaseSchema>;
export type SpaceCrewCampaignError = "INVALID_CAMPAIGN" | "INVALID_CREDENTIAL" | "INVALID_LEASE" | "LEASE_CONFLICT" | "STALE_REVISION" | "IDEMPOTENCY_CONFLICT" | "INVALID_PHASE" | "INVALID_ATTEMPT" | "INVALID_DISTRESS" | "REVISION_EXHAUSTED" | "STORAGE_UNAVAILABLE";
export type SpaceCrewCampaignTransition = { ok: true; checkpoint: SpaceCrewCampaignCheckpoint } | { ok: false; reason: SpaceCrewCampaignError };
type Binding = Readonly<{ processId: string; roomId: string }>;

function invalid(): never { throw new Error("Invalid Space Crew campaign checkpoint."); }
function currentAttempts(checkpoint: SpaceCrewCampaignCheckpoint) { return checkpoint.attempts.filter(attempt => attempt.runNumber === checkpoint.runNumber && attempt.missionNumber === checkpoint.missionNumber); }
function activeAttempt(checkpoint: SpaceCrewCampaignCheckpoint) { return checkpoint.attempts.find(attempt => attempt.status === "ACTIVE"); }

export function spaceCrewCampaignDistress(checkpoint: SpaceCrewCampaignCheckpoint): { active: boolean; history: SpaceCrewDistressHistory } {
  const history = checkpoint.distressEvents.filter(event => event.runNumber === checkpoint.runNumber && event.missionNumber === checkpoint.missionNumber)
    .map(({ attemptNumber, kind, direction }) => ({ attemptNumber, kind, direction }));
  return { active: history.some(event => event.kind === "ACTIVATED"), history };
}

/** No cards, hands, sessions, RNG state, or recovery credentials belong to this schema. */
export function parseSpaceCrewCampaignCheckpoint(input: unknown): SpaceCrewCampaignCheckpoint {
  const checkpoint = v.parse(SpaceCrewCampaignCheckpointSchema, input);
  if (new Set(checkpoint.completedMissions).size !== checkpoint.completedMissions.length
    || new Set(checkpoint.attempts.map(attempt => attempt.attemptId)).size !== checkpoint.attempts.length) return invalid();
  if (checkpoint.mode === "CAMPAIGN") {
    if (checkpoint.runNumber !== 1 || checkpoint.completedMissions.some((number, index) => number !== index + 1)
      || checkpoint.missionNumber !== Math.min(50, checkpoint.completedMissions.length + 1)
        && checkpoint.missionNumber !== checkpoint.completedMissions.length) return invalid();
  }
  const counts = new Map<string, number>();
  const succeededRuns = new Set<string>();
  const runMissions = new Map<number, number>();
  const successes: number[] = [];
  let previousRun = 0, previousMission = 0;
  for (const [index, attempt] of checkpoint.attempts.entries()) {
    const key = `${attempt.runNumber}:${attempt.missionNumber}`;
    const expected = (counts.get(key) ?? 0) + 1;
    if (attempt.attemptNumber !== expected || attempt.runNumber < previousRun || attempt.runNumber > checkpoint.runNumber || succeededRuns.has(key)) return invalid();
    if (checkpoint.mode === "CAMPAIGN" ? attempt.runNumber !== 1 || attempt.missionNumber < previousMission || attempt.missionNumber > checkpoint.missionNumber
      : runMissions.has(attempt.runNumber) && runMissions.get(attempt.runNumber) !== attempt.missionNumber
        || attempt.runNumber === checkpoint.runNumber && attempt.missionNumber !== checkpoint.missionNumber) return invalid();
    counts.set(key, expected); runMissions.set(attempt.runNumber, attempt.missionNumber);
    previousRun = attempt.runNumber; previousMission = attempt.missionNumber;
    if (attempt.status === "ACTIVE") {
      if (index !== checkpoint.attempts.length - 1 || attempt.runNumber !== checkpoint.runNumber || attempt.missionNumber !== checkpoint.missionNumber
        || attempt.endedAt !== null || attempt.result !== null || !checkpoint.lease.active) return invalid();
    } else {
      if (attempt.endedAt === null || attempt.endedAt < attempt.startedAt) return invalid();
      if (attempt.status === "ABORTED" ? attempt.result !== null : attempt.result === null) return invalid();
    }
    if (attempt.result && attempt.result.completedTaskCount > attempt.result.totalTaskCount) return invalid();
    if (attempt.status === "SUCCESS") { succeededRuns.add(key); if (!successes.includes(attempt.missionNumber)) successes.push(attempt.missionNumber); }
  }
  if (JSON.stringify(successes) !== JSON.stringify(checkpoint.completedMissions)) return invalid();
  const finished = checkpoint.mode === "PRACTICE" ? succeededRuns.has(`${checkpoint.runNumber}:${checkpoint.missionNumber}`) : successes.length === 50;
  if ((checkpoint.status === "COMPLETED") !== finished) return invalid();
  let lastRun = 0, lastMission = 0;
  for (const event of checkpoint.distressEvents) {
    if (event.runNumber < lastRun || event.runNumber === lastRun && event.missionNumber < lastMission
      || event.attemptNumber > (counts.get(`${event.runNumber}:${event.missionNumber}`) ?? 0)) return invalid();
    lastRun = event.runNumber; lastMission = event.missionNumber;
  }
  for (const [key, count] of counts) {
    const history = checkpoint.distressEvents.filter(event => `${event.runNumber}:${event.missionNumber}` === key)
      .map(({ attemptNumber, kind, direction }) => ({ attemptNumber, kind, direction }));
    createSpaceCrewDistressState(count + 1, { history, active: history.some(event => event.kind === "ACTIVATED") });
  }
  const reservation = checkpoint.pendingInterruption;
  if (reservation && (!checkpoint.lease.active || reservation.attemptId !== (activeAttempt(checkpoint)?.attemptId ?? null)
    || reservation.now < (activeAttempt(checkpoint)?.startedAt ?? 0))) return invalid();
  return checkpoint;
}

export function projectSpaceCrewCampaign(input: SpaceCrewCampaignCheckpoint): SpaceCrewCampaignAttachment {
  const checkpoint = parseSpaceCrewCampaignCheckpoint(input);
  const actualAttempts = currentAttempts(checkpoint).length;
  const distressActive = spaceCrewCampaignDistress(checkpoint).active;
  return v.parse(SpaceCrewCampaignSummarySchema, {
    campaignId: checkpoint.campaignId, revision: checkpoint.revision, mode: checkpoint.mode,
    missionNumber: checkpoint.missionNumber, actualAttempts, recordedAttempts: actualAttempts + Number(distressActive),
    completedMissions: checkpoint.completedMissions, distressActive,
  });
}

/** Repository owns revision increments; pure transition helpers preserve the input revision. */
export function createSpaceCrewCampaign(input: Readonly<Binding & { campaignId: string; mode: "CAMPAIGN" | "PRACTICE"; missionNumber?: number }>): SpaceCrewCampaignCheckpoint {
  if (input.mode === "CAMPAIGN" && input.missionNumber !== undefined && input.missionNumber !== 1) return invalid();
  return parseSpaceCrewCampaignCheckpoint({ schemaVersion: 1, rulesVersion: "space-crew-planet-nine-v1", campaignId: input.campaignId,
    revision: 0, mode: input.mode, runNumber: 1, missionNumber: input.mode === "CAMPAIGN" ? 1 : input.missionNumber,
    status: "OPEN", pendingInterruption: null, completedMissions: [], attempts: [], distressEvents: [], lease: { processId: input.processId, roomId: input.roomId, generation: 1, active: true } });
}

function transition(input: SpaceCrewCampaignCheckpoint, change: (checkpoint: SpaceCrewCampaignCheckpoint) => SpaceCrewCampaignError | void, allowPending = false): SpaceCrewCampaignTransition {
  try {
    const checkpoint = parseSpaceCrewCampaignCheckpoint(input);
    if (checkpoint.pendingInterruption && !allowPending) return { ok: false, reason: "INVALID_PHASE" };
    const reason = change(checkpoint);
    return reason ? { ok: false, reason } : { ok: true, checkpoint: parseSpaceCrewCampaignCheckpoint(checkpoint) };
  } catch { return { ok: false, reason: "INVALID_CAMPAIGN" }; }
}

export function claimSpaceCrewCampaign(input: SpaceCrewCampaignCheckpoint, options: Readonly<Binding & { now: number; takeover?: boolean }>): SpaceCrewCampaignTransition {
  return transition(input, checkpoint => {
    const same = checkpoint.lease.processId === options.processId && checkpoint.lease.roomId === options.roomId;
    if (same && checkpoint.pendingInterruption) return "INVALID_PHASE";
    if (checkpoint.lease.active && !same && !options.takeover) return "LEASE_CONFLICT";
    if (!same || !checkpoint.lease.active) {
      if (checkpoint.lease.generation === Number.MAX_SAFE_INTEGER) return "REVISION_EXHAUSTED";
      const attempt = activeAttempt(checkpoint);
      if (attempt) { attempt.status = "ABORTED"; attempt.endedAt = options.now; }
      checkpoint.pendingInterruption = null;
      checkpoint.lease = { processId: options.processId, roomId: options.roomId, generation: checkpoint.lease.generation + 1, active: true };
    }
  }, true);
}

export function beginSpaceCrewCampaignAttempt(input: SpaceCrewCampaignCheckpoint, options: Readonly<{ attemptId: string; now: number }>): SpaceCrewCampaignTransition {
  return transition(input, checkpoint => {
    if (!checkpoint.lease.active) return "INVALID_LEASE";
    if (checkpoint.status === "COMPLETED" || checkpoint.mode === "CAMPAIGN" && checkpoint.completedMissions.includes(checkpoint.missionNumber) || activeAttempt(checkpoint)) return "INVALID_PHASE";
    if (checkpoint.attempts.some(attempt => attempt.attemptId === options.attemptId)) return "INVALID_ATTEMPT";
    checkpoint.attempts.push({ attemptId: options.attemptId, runNumber: checkpoint.runNumber, missionNumber: checkpoint.missionNumber,
      attemptNumber: currentAttempts(checkpoint).length + 1, status: "ACTIVE", startedAt: options.now, endedAt: null, result: null });
  });
}

export function recordSpaceCrewCampaignDistress(input: SpaceCrewCampaignCheckpoint, options: Readonly<{ attemptId: string; active: boolean; history: SpaceCrewDistressHistory }>): SpaceCrewCampaignTransition {
  return transition(input, checkpoint => {
    const attempt = activeAttempt(checkpoint);
    if (!checkpoint.lease.active) return "INVALID_LEASE";
    if (!attempt || attempt.attemptId !== options.attemptId) return "INVALID_ATTEMPT";
    const previous = spaceCrewCampaignDistress(checkpoint);
    if (options.history.length < previous.history.length || JSON.stringify(options.history.slice(0, previous.history.length)) !== JSON.stringify(previous.history)) return "INVALID_DISTRESS";
    try { createSpaceCrewDistressState(attempt.attemptNumber + 1, options); } catch { return "INVALID_DISTRESS"; }
    if (options.history.slice(previous.history.length).some(event => event.attemptNumber !== attempt.attemptNumber)) return "INVALID_DISTRESS";
    checkpoint.distressEvents.push(...options.history.slice(previous.history.length).map(event => ({ runNumber: checkpoint.runNumber, missionNumber: checkpoint.missionNumber, ...event })));
  });
}

export function finishSpaceCrewCampaignAttempt(input: SpaceCrewCampaignCheckpoint, options: Readonly<{ attemptId: string; now: number; outcome: "SUCCESS" | "FAILURE"; reason: string; completedTaskCount: number; totalTaskCount: number }>): SpaceCrewCampaignTransition {
  return transition(input, checkpoint => {
    const attempt = activeAttempt(checkpoint);
    if (!checkpoint.lease.active) return "INVALID_LEASE";
    if (!attempt || attempt.attemptId !== options.attemptId) return "INVALID_ATTEMPT";
    attempt.status = options.outcome; attempt.endedAt = options.now;
    attempt.result = v.parse(ResultSchema, { reason: options.reason, completedTaskCount: options.completedTaskCount, totalTaskCount: options.totalTaskCount });
    if (options.outcome === "SUCCESS") {
      if (!checkpoint.completedMissions.includes(checkpoint.missionNumber)) checkpoint.completedMissions.push(checkpoint.missionNumber);
      if (checkpoint.mode === "PRACTICE" || checkpoint.missionNumber === 50) checkpoint.status = "COMPLETED";
    }
    checkpoint.lease.active = false;
  });
}

export function interruptSpaceCrewCampaignAttempt(input: SpaceCrewCampaignCheckpoint, options: Readonly<{ now: number }>): SpaceCrewCampaignTransition {
  return transition(input, checkpoint => {
    const attempt = activeAttempt(checkpoint);
    if (attempt) { attempt.status = "ABORTED"; attempt.endedAt = options.now; }
    checkpoint.lease.active = false;
  });
}

export function releaseSpaceCrewCampaign(input: SpaceCrewCampaignCheckpoint): SpaceCrewCampaignTransition {
  return transition(input, checkpoint => {
    if (activeAttempt(checkpoint)) return "INVALID_PHASE";
    checkpoint.lease.active = false;
  });
}

export function advanceSpaceCrewCampaign(input: SpaceCrewCampaignCheckpoint): SpaceCrewCampaignTransition {
  return transition(input, checkpoint => {
    if (!checkpoint.lease.active) return "INVALID_LEASE";
    if (checkpoint.mode !== "CAMPAIGN" || checkpoint.status === "COMPLETED" || !checkpoint.completedMissions.includes(checkpoint.missionNumber)) return "INVALID_PHASE";
    checkpoint.missionNumber += 1;
  });
}

export function selectSpaceCrewPracticeMission(input: SpaceCrewCampaignCheckpoint, options: Readonly<{ missionNumber: number }>): SpaceCrewCampaignTransition {
  return transition(input, checkpoint => {
    if (!checkpoint.lease.active) return "INVALID_LEASE";
    if (checkpoint.mode !== "PRACTICE" || activeAttempt(checkpoint)) return "INVALID_PHASE";
    if (checkpoint.runNumber === Number.MAX_SAFE_INTEGER) return "REVISION_EXHAUSTED";
    checkpoint.runNumber += 1; checkpoint.missionNumber = options.missionNumber; checkpoint.status = "OPEN";
  });
}

/** Durable intent bridges a room commit; an uncommitted attempt is never rewritten as terminal. */
export function prepareSpaceCrewCampaignInterruption(input: SpaceCrewCampaignCheckpoint, options: Readonly<{ requestId: string; now: number }>): SpaceCrewCampaignTransition {
  return transition(input, checkpoint => {
    if (!checkpoint.lease.active) return "INVALID_LEASE";
    checkpoint.pendingInterruption = { requestId: options.requestId, attemptId: activeAttempt(checkpoint)?.attemptId ?? null, now: options.now };
  });
}

export function finalizeSpaceCrewCampaignInterruption(input: SpaceCrewCampaignCheckpoint, options: Readonly<{ requestId: string }>): SpaceCrewCampaignTransition {
  return transition(input, checkpoint => {
    const reservation = checkpoint.pendingInterruption;
    if (!reservation || reservation.requestId !== options.requestId) return "INVALID_PHASE";
    const attempt = activeAttempt(checkpoint);
    if (attempt) { attempt.status = "ABORTED"; attempt.endedAt = reservation.now; }
    checkpoint.pendingInterruption = null; checkpoint.lease.active = false;
  }, true);
}

export function cancelSpaceCrewCampaignInterruption(input: SpaceCrewCampaignCheckpoint, options: Readonly<{ requestId: string }>): SpaceCrewCampaignTransition {
  return transition(input, checkpoint => {
    if (!checkpoint.pendingInterruption || checkpoint.pendingInterruption.requestId !== options.requestId) return "INVALID_PHASE";
    checkpoint.pendingInterruption = null;
  }, true);
}
