import * as v from "valibot";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { SpaceCrewCardIdSchema, dealSpaceCrewCards, type SpaceCrewCard } from "./cards.js";
import { communicateSpaceCrew, createSpaceCrewCommunications, parseSpaceCrewCommunications, type SpaceCrewCommunications, type SpaceCrewCommunicationError } from "./communication.js";
import { applySpaceCrewDistress, createSpaceCrewDistressState, parseSpaceCrewDistressState, type SpaceCrewDistressState } from "./distress.js";
import { evaluateSpaceCrewPrimitive } from "./mission-primitives.js";
import { getSpaceCrewMission, type SpaceCrewMissionDefinition } from "./missions.js";
import { applySpaceCrewTaskAction, createSpaceCrewTaskState, evaluateSpaceCrewTaskBatch, parseSpaceCrewTaskState, type SpaceCrewTaskFace, type SpaceCrewTaskState, type SpaceCrewTaskError } from "./tasks.js";
import { createSpaceCrewTrickState, parseSpaceCrewTrickState, playSpaceCrewCard, type SpaceCrewTrickState, type SpaceCrewTrickError } from "./trick.js";

const Count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const Answer = v.picklist(["GOOD", "BAD"]);
const SpecialSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("NONE") }),
  v.strictObject({ kind: v.literal("NO_TRICKS_PLAYER"), phase: v.picklist(["RESPOND", "SELECT", "READY"]),
    responses: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, answer: Answer })), v.maxLength(4)), playerId: v.nullable(PlayerIdSchema) }),
]);
const FailureSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("TASK"), reason: v.picklist(["WRONG_OWNER", "TASK_ORDER"]), taskIds: v.array(v.string()) }),
  v.strictObject({ kind: v.literal("OBJECTIVE"), reason: v.picklist(["OBJECTIVE_NOT_MET", "ROCKET_DID_NOT_WIN", "ROCKET_ORDER", "FORBIDDEN_WIN_VALUE", "TOO_MANY_PLAYER_TRICKS", "UNEXPECTED_PLAYER_TRICK", "REQUIRED_WINNER_MISSED", "FORBIDDEN_PLAYER_ROCKET_WIN", "UNBALANCED_WINS", "WRONG_COLOR_CAPTURER"]) }),
  v.strictObject({ kind: v.literal("EXHAUSTED") }),
]);
const StateSchema = v.strictObject({
  missionNumber: v.pipe(Count, v.minValue(1), v.maxValue(50)), revision: Count,
  status: v.picklist(["SETUP", "ACTIVE", "SUCCESS", "FAILURE"]), failure: v.nullable(FailureSchema),
  trick: v.unknown(), tasks: v.unknown(), communications: v.unknown(), distress: v.unknown(), special: SpecialSchema,
});
const CommandSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("PLAY"), cardId: SpaceCrewCardIdSchema, expectedRevision: Count }),
  v.strictObject({ kind: v.literal("COMMUNICATE"), cardId: SpaceCrewCardIdSchema, mark: v.nullable(v.picklist(["HIGHEST", "LOWEST", "ONLY"])), expectedRevision: Count }),
  v.strictObject({ kind: v.literal("TASK"), action: v.record(v.string(), v.unknown()), expectedRevision: Count }),
  v.strictObject({ kind: v.literal("DISTRESS"), action: v.record(v.string(), v.unknown()), expectedRevision: Count }),
  v.strictObject({ kind: v.literal("SPECIAL_RESPOND"), answer: Answer, expectedRevision: Count }),
  v.strictObject({ kind: v.literal("SPECIAL_SELECT"), playerId: PlayerIdSchema, expectedRevision: Count }),
]);

export type SpaceCrewMissionSpecial = v.InferOutput<typeof SpecialSchema>;
export type SpaceCrewMissionFailure = v.InferOutput<typeof FailureSchema>;
export type SpaceCrewMissionState = Omit<v.InferOutput<typeof StateSchema>, "trick" | "tasks" | "communications" | "distress"> & {
  trick: SpaceCrewTrickState; tasks: SpaceCrewTaskState; communications: SpaceCrewCommunications; distress: SpaceCrewDistressState;
};
export type SpaceCrewMissionSetup = Readonly<{
  missionNumber: number; playerIds: readonly PlayerId[]; deck: readonly SpaceCrewCard[]; taskDeck: readonly SpaceCrewTaskFace[];
  attemptNumber?: number; previousDistress?: Pick<SpaceCrewDistressState, "active" | "history">;
}>;
export type SpaceCrewMissionError = SpaceCrewTaskError | SpaceCrewTrickError | SpaceCrewCommunicationError | "ALREADY_RESPONDED";
export type SpaceCrewMissionResult = { ok: true; state: SpaceCrewMissionState } | { ok: false; reason: SpaceCrewMissionError };

function invalid(): never { throw new Error("Invalid Space Crew mission state."); }
function ready(state: SpaceCrewMissionState): boolean {
  return state.tasks.phase === "READY" && (state.special.kind === "NONE" || state.special.phase === "READY");
}
function distressPending(state: SpaceCrewMissionState): boolean { return state.distress.phase === "VOTING" || state.distress.phase === "SELECTING"; }
function specialActor(state: SpaceCrewMissionState, responseIndex: number): PlayerId {
  const players = state.trick.players;
  const index = players.findIndex(player => player.playerId === state.trick.commanderId);
  return players[(index + responseIndex + 1) % players.length]?.playerId ?? invalid();
}

type Outcome = { status: SpaceCrewMissionState["status"]; failure: SpaceCrewMissionFailure | null };
function objectiveOutcome(state: SpaceCrewMissionState, definition: SpaceCrewMissionDefinition, tasks: SpaceCrewTaskState, trickCount: number): Outcome {
  if (!ready(state)) return { status: "SETUP", failure: null };
  const exhausted = trickCount === state.trick.totalTricks;
  let satisfied: boolean;
  if (definition.objective.kind === "TASKS") satisfied = tasks.completedOrder.length === tasks.tasks.length;
  else {
    const objective = definition.objective;
    const config = objective.kind === "COLOR_VALUE_WINS"
      ? { type: "COLOR_VALUE_WINS", value: objective.value, count: objective.count }
      : { type: "PLAYER_TRICKS", playerId: state.special.kind === "NO_TRICKS_PLAYER" ? state.special.playerId : null, requirement: { type: "COUNT", count: 0 } };
    const evaluation = evaluateSpaceCrewPrimitive(config, {
      cards: state.trick.cards, playerIds: state.trick.players.map(player => player.playerId), commanderId: state.trick.commanderId,
      totalTricks: state.trick.totalTricks, exhausted, completedTricks: state.trick.completedTricks.slice(0, trickCount),
    });
    if (!evaluation.ok) return invalid();
    if (evaluation.status === "FAILED") return { status: "FAILURE", failure: { kind: "OBJECTIVE", reason: evaluation.failure.reason } };
    satisfied = evaluation.status === "SATISFIED";
  }
  if (satisfied && (definition.endPolicy === "OBJECTIVES" || exhausted)) return { status: "SUCCESS", failure: null };
  if (exhausted) return { status: "FAILURE", failure: { kind: "EXHAUSTED" } };
  return { status: "ACTIVE", failure: null };
}

/** Replays public captures and objectives only; past private hands are never inferred. */
function replayOutcome(state: SpaceCrewMissionState, definition: SpaceCrewMissionDefinition): { outcome: Outcome; tasks: SpaceCrewTaskState } {
  let tasks = parseSpaceCrewTaskState({ ...state.tasks,
    revision: state.tasks.revision - state.tasks.lastEvaluatedTrick, lastEvaluatedTrick: 0, completedOrder: [],
    tasks: state.tasks.tasks.map(task => ({ ...task, completedAtTrick: null })),
  });
  let outcome = objectiveOutcome(state, definition, tasks, 0);
  for (const [index, trick] of state.trick.completedTricks.entries()) {
    if (outcome.status !== "ACTIVE") return invalid();
    const batch = evaluateSpaceCrewTaskBatch(tasks, trick, state.trick.cards);
    if (!batch.ok) {
      if (batch.reason !== "WRONG_OWNER" && batch.reason !== "TASK_ORDER") return invalid();
      outcome = { status: "FAILURE", failure: { kind: "TASK", reason: batch.reason, taskIds: batch.taskIds } };
    } else {
      tasks = batch.state;
      outcome = objectiveOutcome(state, definition, tasks, index + 1);
    }
  }
  if ((outcome.status === "SUCCESS" || outcome.status === "FAILURE") && state.trick.currentTrick.length !== 0) return invalid();
  return { tasks, outcome };
}

export function parseSpaceCrewMissionState(input: unknown): SpaceCrewMissionState {
  const envelope = v.safeParse(StateSchema, input);
  if (!envelope.success) return invalid();
  const definition = getSpaceCrewMission(envelope.output.missionNumber);
  const trick = parseSpaceCrewTrickState(envelope.output.trick);
  const tasks = parseSpaceCrewTaskState(envelope.output.tasks);
  const communications = parseSpaceCrewCommunications(envelope.output.communications, trick);
  const distress = parseSpaceCrewDistressState(envelope.output.distress, trick);
  const state: SpaceCrewMissionState = { ...envelope.output, trick, tasks, communications, distress };
  const players = trick.players.map(player => player.playerId);
  if (tasks.missionNumber !== state.missionNumber || tasks.commanderId !== trick.commanderId || tasks.playerIds.length !== players.length || tasks.playerIds.some((id, index) => players[index] !== id)) return invalid();
  if (tasks.tasks.length !== definition.taskCount || tasks.mode !== definition.taskMode || tasks.transfer !== null || tasks.tokenEditUsed) return invalid();
  if (tasks.tasks.some((task, index) => JSON.stringify(task.token) !== JSON.stringify(definition.tokens[index] ?? null))) return invalid();
  if (communications.some(item => item.used && (definition.communicationRule.kind === "DEAD_ZONE" ? item.mark !== null : item.mark === null))) return invalid();
  if (definition.setup.kind === "NONE" ? state.special.kind !== "NONE" : state.special.kind !== "NO_TRICKS_PLAYER") return invalid();
  if (state.special.kind === "NO_TRICKS_PLAYER") {
    const special = state.special;
    if (special.responses.some((response, index) => response.playerId !== specialActor(state, index))) return invalid();
    if (special.phase === "RESPOND" ? special.responses.length >= players.length - 1 : special.responses.length !== players.length - 1) return invalid();
    if (special.phase === "READY" ? special.playerId === null || !players.includes(special.playerId) : special.playerId !== null) return invalid();
  }
  if (!ready(state) && (trick.currentTrick.length > 0 || trick.completedTricks.length > 0 || communications.some(item => item.used) || distress.phase !== "UNDECIDED")) return invalid();
  if (distressPending(state) && communications.some(item => item.used)) return invalid();
  const specialRevision = state.special.kind === "NONE" ? 0 : state.special.responses.length + Number(state.special.phase === "READY");
  const revision = trick.revision + tasks.revision - tasks.lastEvaluatedTrick + specialRevision;
  if (!Number.isSafeInteger(revision) || state.revision !== revision) return invalid();
  const replay = replayOutcome(state, definition);
  if (JSON.stringify(replay.tasks) !== JSON.stringify(tasks) || replay.outcome.status !== state.status || JSON.stringify(replay.outcome.failure) !== JSON.stringify(state.failure)) return invalid();
  return state;
}

/** Both decks are already ordered by injected server-side randomness. */
export function createSpaceCrewMissionState(input: SpaceCrewMissionSetup): SpaceCrewMissionState {
  const definition = getSpaceCrewMission(input.missionNumber);
  const trick = createSpaceCrewTrickState(dealSpaceCrewCards(input.deck, input.playerIds));
  const tasks = createSpaceCrewTaskState({ missionNumber: definition.missionNumber, playerIds: input.playerIds, commanderId: trick.commanderId,
    taskDeck: input.taskDeck, taskCount: definition.taskCount, tokens: definition.tokens, mode: definition.taskMode });
  const special: SpaceCrewMissionSpecial = definition.setup.kind === "NONE" ? { kind: "NONE" }
    : { kind: "NO_TRICKS_PLAYER", phase: "RESPOND", responses: [], playerId: null };
  return parseSpaceCrewMissionState({ missionNumber: definition.missionNumber, revision: 0,
    status: tasks.phase === "READY" && special.kind === "NONE" ? "ACTIVE" : "SETUP", failure: null,
    trick, tasks, special, communications: createSpaceCrewCommunications(input.playerIds),
    distress: createSpaceCrewDistressState(input.attemptNumber ?? 1, input.previousDistress) });
}

/** A single global revision guards every domain action; component revisions are server supplied. */
export function applySpaceCrewMissionAction(input: SpaceCrewMissionState, actor: PlayerId, commandInput: unknown): SpaceCrewMissionResult {
  let state: SpaceCrewMissionState;
  try { state = parseSpaceCrewMissionState(input); } catch { return { ok: false, reason: "INVALID_STATE" }; }
  const parsed = v.safeParse(CommandSchema, commandInput);
  if (!parsed.success) return { ok: false, reason: "INVALID_ACTION" };
  const command = parsed.output;
  if ((command.kind === "TASK" || command.kind === "DISTRESS") && Object.hasOwn(command.action, "expectedRevision")) return { ok: false, reason: "INVALID_ACTION" };
  if (!state.trick.players.some(player => player.playerId === actor)) return { ok: false, reason: "INVALID_ACTOR" };
  if (command.expectedRevision !== state.revision) return { ok: false, reason: "STALE_REVISION" };
  if (state.status === "SUCCESS" || state.status === "FAILURE") return { ok: false, reason: "INVALID_PHASE" };
  if (state.revision === Number.MAX_SAFE_INTEGER) return { ok: false, reason: "REVISION_EXHAUSTED" };
  const definition = getSpaceCrewMission(state.missionNumber);
  switch (command.kind) {
    case "TASK": {
      if (distressPending(state)) return { ok: false, reason: "INVALID_PHASE" };
      const result = applySpaceCrewTaskAction(state.tasks, actor, { ...command.action, expectedRevision: state.tasks.revision }, state.trick);
      if (!result.ok) return result;
      state.tasks = result.state;
      break;
    }
    case "DISTRESS": {
      const result = applySpaceCrewDistress({ trick: state.trick, communications: state.communications, distress: state.distress, assignmentComplete: ready(state) }, actor,
        { ...command.action, expectedRevision: state.trick.revision });
      if (!result.ok) return result;
      state.trick = result.trick; state.distress = result.distress;
      break;
    }
    case "COMMUNICATE": {
      if (!ready(state) || distressPending(state)) return { ok: false, reason: "INVALID_PHASE" };
      const result = communicateSpaceCrew({ trick: state.trick, communications: state.communications, assignmentComplete: ready(state), rule: definition.communicationRule }, actor,
        { cardId: command.cardId, mark: command.mark, expectedRevision: state.trick.revision });
      if (!result.ok) return result;
      state.trick = result.trick; state.communications = result.communications;
      break;
    }
    case "PLAY": {
      if (!ready(state) || distressPending(state)) return { ok: false, reason: "INVALID_PHASE" };
      const result = playSpaceCrewCard(state.trick, actor, { cardId: command.cardId, expectedRevision: state.trick.revision });
      if (!result.ok) return result;
      state.trick = result.state;
      const completed = state.trick.completedTricks.at(-1);
      if (completed && completed.number > state.tasks.lastEvaluatedTrick) {
        const batch = evaluateSpaceCrewTaskBatch(state.tasks, completed, state.trick.cards);
        if (batch.ok) state.tasks = batch.state;
        else if (batch.reason === "WRONG_OWNER" || batch.reason === "TASK_ORDER") {
          state.status = "FAILURE"; state.failure = { kind: "TASK", reason: batch.reason, taskIds: batch.taskIds };
        } else return { ok: false, reason: "INVALID_STATE" };
      }
      break;
    }
    case "SPECIAL_RESPOND": {
      if (state.special.kind !== "NO_TRICKS_PLAYER" || state.special.phase !== "RESPOND") return { ok: false, reason: "INVALID_PHASE" };
      if (actor !== specialActor(state, state.special.responses.length)) return { ok: false, reason: "NOT_YOUR_TURN" };
      state.special.responses.push({ playerId: actor, answer: command.answer });
      if (state.special.responses.length === state.trick.players.length - 1) state.special.phase = "SELECT";
      break;
    }
    case "SPECIAL_SELECT": {
      if (state.special.kind !== "NO_TRICKS_PLAYER" || state.special.phase !== "SELECT") return { ok: false, reason: "INVALID_PHASE" };
      if (actor !== state.trick.commanderId) return { ok: false, reason: "NOT_YOUR_TURN" };
      if (!state.trick.players.some(player => player.playerId === command.playerId)) return { ok: false, reason: "INVALID_RECIPIENT" };
      state.special.playerId = command.playerId; state.special.phase = "READY";
      break;
    }
  }
  state.revision += 1;
  if (state.status !== "FAILURE") Object.assign(state, objectiveOutcome(state, definition, state.tasks, state.trick.completedTricks.length));
  try { return { ok: true, state: parseSpaceCrewMissionState(state) }; }
  catch { return { ok: false, reason: "INVALID_STATE" }; }
}
