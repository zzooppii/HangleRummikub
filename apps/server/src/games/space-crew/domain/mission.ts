import * as v from "valibot";
import type { PlayerId } from "@hangul-rummikub/shared";
import type { RandomSource } from "../../../ports/system.js";
import { SpaceCrewCardIdSchema, dealSpaceCrewCards, type SpaceCrewCard } from "./cards.js";
import { communicateSpaceCrew, createSpaceCrewCommunications, parseSpaceCrewCommunications, type SpaceCrewCommunications, type SpaceCrewCommunicationError, type SpaceCrewCommunicationRule } from "./communication.js";
import { applySpaceCrewDistress, createSpaceCrewDistressState, parseSpaceCrewDistressState, type SpaceCrewDistressState } from "./distress.js";
import { evaluateSpaceCrewPrimitive, type SpaceCrewPrimitive } from "./mission-primitives.js";
import { SpaceCrewMissionExchangeSchema, exchangeSpaceCrewAfterFirstTrick, parseSpaceCrewMissionExchange } from "./mission-exchange.js";
import { SpaceCrewMissionSpecialSchema, SpaceCrewSpecialCommandSchemas, applySpaceCrewMissionSpecial, createSpaceCrewMissionSpecial, parseSpaceCrewMissionSpecial, spaceCrewSpecialRevision } from "./mission-special.js";
export type { SpaceCrewMissionSpecial } from "./mission-special.js";
import { getSpaceCrewMission, type SpaceCrewMissionDefinition } from "./missions.js";
import { applySpaceCrewTaskAction, createSpaceCrewTaskState, evaluateSpaceCrewTaskBatch, parseSpaceCrewTaskState, type SpaceCrewTaskFace, type SpaceCrewTaskState, type SpaceCrewTaskError } from "./tasks.js";
import { createSpaceCrewTrickState, parseSpaceCrewTrickState, playSpaceCrewCard, type SpaceCrewTrickState, type SpaceCrewTrickError } from "./trick.js";

const Count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const FailureSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("TASK"), reason: v.picklist(["WRONG_OWNER", "TASK_ORDER"]), taskIds: v.array(v.string()) }),
  v.strictObject({ kind: v.literal("OBJECTIVE"), reason: v.picklist(["OBJECTIVE_NOT_MET", "ROCKET_DID_NOT_WIN", "ROCKET_ORDER", "FORBIDDEN_WIN_VALUE", "TOO_MANY_PLAYER_TRICKS", "UNEXPECTED_PLAYER_TRICK", "REQUIRED_WINNER_MISSED", "FORBIDDEN_PLAYER_ROCKET_WIN", "UNBALANCED_WINS", "WRONG_COLOR_CAPTURER", "OMEGA_NOT_LAST_TRICK"]) }),
  v.strictObject({ kind: v.literal("EXHAUSTED") }),
]);
const StateSchema = v.strictObject({
  missionNumber: v.pipe(Count, v.minValue(1), v.maxValue(50)), revision: Count,
  status: v.picklist(["SETUP", "ACTIVE", "SUCCESS", "FAILURE"]), failure: v.nullable(FailureSchema),
  trick: v.unknown(), tasks: v.unknown(), communications: v.unknown(), distress: v.unknown(), special: SpaceCrewMissionSpecialSchema,
  exchange: v.nullable(SpaceCrewMissionExchangeSchema),
});
const CommandSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("PLAY"), cardId: SpaceCrewCardIdSchema, expectedRevision: Count }),
  v.strictObject({ kind: v.literal("COMMUNICATE"), cardId: SpaceCrewCardIdSchema, mark: v.nullable(v.picklist(["HIGHEST", "LOWEST", "ONLY"])), expectedRevision: Count }),
  v.strictObject({ kind: v.literal("TASK"), action: v.record(v.string(), v.unknown()), expectedRevision: Count }),
  v.strictObject({ kind: v.literal("DISTRESS"), action: v.record(v.string(), v.unknown()), expectedRevision: Count }),
  ...SpaceCrewSpecialCommandSchemas,
]);

export type SpaceCrewMissionFailure = v.InferOutput<typeof FailureSchema>;
export type SpaceCrewMissionState = Omit<v.InferOutput<typeof StateSchema>, "trick" | "tasks" | "communications" | "distress"> & {
  trick: SpaceCrewTrickState; tasks: SpaceCrewTaskState; communications: SpaceCrewCommunications; distress: SpaceCrewDistressState;
};
export type SpaceCrewMissionSetup = Readonly<{
  missionNumber: number; playerIds: readonly PlayerId[]; deck: readonly SpaceCrewCard[]; taskDeck: readonly SpaceCrewTaskFace[];
  attemptNumber?: number; previousDistress?: Pick<SpaceCrewDistressState, "active" | "history">;
}>;
export type SpaceCrewMissionError = SpaceCrewTaskError | SpaceCrewTrickError | SpaceCrewCommunicationError | "ALREADY_RESPONDED" | "INVALID_RANDOM";
export type SpaceCrewMissionResult = { ok: true; state: SpaceCrewMissionState } | { ok: false; reason: SpaceCrewMissionError };

function invalid(): never { throw new Error("Invalid Space Crew mission state."); }
function ready(state: SpaceCrewMissionState): boolean {
  return state.tasks.phase === "READY" && (state.special.kind === "NONE" || state.special.phase === "READY");
}
function distressPending(state: SpaceCrewMissionState): boolean { return state.distress.phase === "VOTING" || state.distress.phase === "SELECTING"; }
type Outcome = { status: SpaceCrewMissionState["status"]; failure: SpaceCrewMissionFailure | null };
function primitivesForObjective(state: SpaceCrewMissionState, definition: SpaceCrewMissionDefinition): readonly SpaceCrewPrimitive[] {
  const objective = definition.objective;
  switch (objective.kind) {
    case "TASKS":
    case "TASKS_LAST_TRICK_OMEGA": return [];
    case "COLOR_VALUE_WINS": return [{ type: "COLOR_VALUE_WINS", value: objective.value, count: objective.count }];
    case "ROCKET_WINS": return [{ type: "ROCKET_WINS", ascending: objective.ascending }];
    case "FORBID_WIN_VALUE":
    case "TASKS_WITH_FORBID_WIN_VALUE": return [{ type: "FORBID_WIN_VALUE", value: objective.value }];
    case "NOMINEE_NO_TRICKS": {
      if (state.special.kind !== "NO_TRICKS_PLAYER" || state.special.playerId === null) return invalid();
      return [{ type: "PLAYER_TRICKS", playerId: state.special.playerId, requirement: { type: "COUNT", count: 0 } }];
    }
    case "BALANCED_WINS": return [{ type: "BALANCED_WINS", maxDifference: objective.maxDifference }];
    case "BALANCED_WITH_COMMANDER_FIRST_LAST": return [
      { type: "BALANCED_WINS", maxDifference: objective.maxDifference },
      { type: "REQUIRED_WINNERS", indices: [1, "LAST"], allowedPlayerIds: [state.trick.commanderId] },
    ];
    case "NOMINEE_SINGLE_TRICK_NO_ROCKET":
    case "NOMINEE_FIRST_LAST_NO_ROCKET": {
      if (state.special.kind !== "LIMITED_TRICKS_PLAYER" || state.special.playerId === null) return invalid();
      return [
        { type: "PLAYER_TRICKS", playerId: state.special.playerId, requirement: objective.kind === "NOMINEE_SINGLE_TRICK_NO_ROCKET" ? { type: "COUNT", count: 1 } : { type: "EXACT_INDICES", indices: [1, "LAST"] } },
        { type: "FORBID_PLAYER_ROCKET_WIN", playerId: state.special.playerId },
      ];
    }
    case "FIXED_PLAYER_CAPTURE_PINK": {
      if (state.special.kind !== "PINK_COLLECTOR") return invalid();
      return [{ type: "CAPTURE_COLOR", playerId: state.special.playerId, color: "PINK" }];
    }
    case "ASSIGNED_TRICK_ROLES": {
      if (state.special.kind !== "FINAL_ROLES" || state.special.proposal === null) return invalid();
      const { firstFourPlayerId, lastPlayerId } = state.special.proposal;
      return [
        { type: "PLAYER_TRICKS", playerId: firstFourPlayerId, requirement: { type: "EXACT_INDICES", indices: [1, 2, 3, 4] } },
        { type: "PLAYER_TRICKS", playerId: lastPlayerId, requirement: { type: "EXACT_INDICES", indices: ["LAST"] } },
        { type: "REQUIRED_WINNERS", indices: Array.from({ length: state.trick.totalTricks - 5 }, (_, index) => index + 5), allowedPlayerIds: state.trick.players.map(player => player.playerId).filter(id => id !== firstFourPlayerId && id !== lastPlayerId) },
      ];
    }
  }
}

function communicationRule(state: SpaceCrewMissionState, definition: SpaceCrewMissionDefinition): SpaceCrewCommunicationRule {
  if (definition.communicationRule.kind !== "FORBIDDEN_NOMINEE") return definition.communicationRule;
  if (state.special.kind === "NO_COMMUNICATION_PLAYER" && state.special.playerId !== null) return { kind: "FORBIDDEN_PLAYER", playerId: state.special.playerId };
  return { kind: "NORMAL" };
}

function objectiveOutcome(state: SpaceCrewMissionState, definition: SpaceCrewMissionDefinition, tasks: SpaceCrewTaskState, trickCount: number): Outcome {
  if (!ready(state)) return { status: "SETUP", failure: null };
  const exhausted = trickCount === state.trick.totalTricks;
  let satisfied = tasks.completedOrder.length === tasks.tasks.length;
  if (definition.objective.kind === "TASKS_LAST_TRICK_OMEGA" && tasks.tasks.some(task => task.token?.kind === "LAST" && task.completedAtTrick !== null && task.completedAtTrick !== state.trick.totalTricks)) {
    return { status: "FAILURE", failure: { kind: "OBJECTIVE", reason: "OMEGA_NOT_LAST_TRICK" } };
  }
  for (const config of primitivesForObjective(state, definition)) {
    const evaluation = evaluateSpaceCrewPrimitive(config, {
      cards: state.trick.cards, playerIds: state.trick.players.map(player => player.playerId), commanderId: state.trick.commanderId,
      totalTricks: state.trick.totalTricks, exhausted, completedTricks: state.trick.completedTricks.slice(0, trickCount),
    });
    if (!evaluation.ok) return invalid();
    if (evaluation.status === "FAILED") return { status: "FAILURE", failure: { kind: "OBJECTIVE", reason: evaluation.failure.reason } };
    satisfied = satisfied && evaluation.status === "SATISFIED";
  }
  if (satisfied && (definition.endPolicy === "OBJECTIVES" || exhausted)) return { status: "SUCCESS", failure: null };
  if (exhausted) return { status: "FAILURE", failure: { kind: "EXHAUSTED" } };
  return { status: "ACTIVE", failure: null };
}

function validateTaskDefinition(state: SpaceCrewMissionState, definition: SpaceCrewMissionDefinition): void {
  const tasks = state.tasks;
  if (tasks.tasks.length !== definition.taskCount || tasks.mode !== definition.taskMode) return invalid();
  const token = (index: number) => JSON.stringify(tasks.tasks[index]?.token ?? null);
  const originalToken = (index: number) => JSON.stringify(definition.tokens[index] ?? null);
  const changed = tasks.tasks.flatMap((_, index) => token(index) !== originalToken(index) ? [index] : []);
  if (!tasks.tokenEditUsed) { if (changed.length !== 0) return invalid(); return; }
  if (changed.length !== 2) return invalid();
  const first = changed[0], second = changed[1];
  if (first === undefined || second === undefined) return invalid();
  if (state.missionNumber === 23) {
    if (token(first) !== originalToken(second) || token(second) !== originalToken(first)) return invalid();
  } else if (state.missionNumber === 40) {
    const source = changed.find(index => originalToken(index) !== "null" && token(index) === "null");
    const target = changed.find(index => originalToken(index) === "null" && token(index) !== "null");
    if (source === undefined || target === undefined || token(target) !== originalToken(source)) return invalid();
  } else return invalid();
}

/** Rocket 4 establishes the original commander; mission 12 can subsequently move it. */
function validateInitialCommander(state: SpaceCrewMissionState): void {
  const rocket = state.trick.cards.find(card => card.kind === "ROCKET" && card.value === 4);
  if (!rocket) return invalid();
  const moved = state.exchange?.moves.find(move => move.cardId === rocket.cardId);
  const plays = [...state.trick.completedTricks.flatMap(trick => trick.plays), ...state.trick.currentTrick];
  const originalOwner = moved?.fromPlayerId
    ?? state.trick.players.find(player => player.hand.includes(rocket.cardId))?.playerId
    ?? plays.find(play => play.cardId === rocket.cardId)?.playerId;
  if (originalOwner !== state.trick.commanderId) return invalid();
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
  const special = parseSpaceCrewMissionSpecial(envelope.output.special, definition, trick, distress.phase === "EXCHANGED");
  const state: SpaceCrewMissionState = { ...envelope.output, trick, tasks, communications, distress, special };
  const players = trick.players.map(player => player.playerId);
  if (tasks.missionNumber !== state.missionNumber || tasks.commanderId !== trick.commanderId || tasks.playerIds.length !== players.length || tasks.playerIds.some((id, index) => players[index] !== id)) return invalid();
  validateTaskDefinition(state, definition);
  const rule = communicationRule(state, definition);
  if (communications.some(item => item.used && (rule.kind === "DEAD_ZONE" ? item.mark !== null : item.mark === null))) return invalid();
  if (rule.kind === "FORBIDDEN_PLAYER" && communications.some(item => item.playerId === rule.playerId && item.used)) return invalid();
  if (rule.kind === "DISRUPTION" && trick.completedTricks.length + 1 < rule.fromTrick && communications.some(item => item.used)) return invalid();
  if (!ready(state) && (trick.currentTrick.length > 0 || trick.completedTricks.length > 0 || communications.some(item => item.used) || distress.phase !== "UNDECIDED")) return invalid();
  if (distressPending(state) && communications.some(item => item.used)) return invalid();
  const revision = trick.revision + tasks.revision - tasks.lastEvaluatedTrick + spaceCrewSpecialRevision(state.special);
  if (!Number.isSafeInteger(revision) || state.revision !== revision) return invalid();
  const replay = replayOutcome(state, definition);
  if (JSON.stringify(replay.tasks) !== JSON.stringify(tasks) || replay.outcome.status !== state.status || JSON.stringify(replay.outcome.failure) !== JSON.stringify(state.failure)) return invalid();
  const exchanged = state.missionNumber === 12 && trick.completedTricks.length > 0
    && !(trick.completedTricks.length === 1 && (state.status === "FAILURE" || state.status === "SUCCESS"));
  if (exchanged !== (state.exchange !== null)) return invalid();
  if (state.exchange !== null) state.exchange = parseSpaceCrewMissionExchange(state.exchange, trick, communications);
  validateInitialCommander(state);
  return state;
}

/** Both decks are already ordered by injected server-side randomness. */
export function createSpaceCrewMissionState(input: SpaceCrewMissionSetup): SpaceCrewMissionState {
  const definition = getSpaceCrewMission(input.missionNumber);
  const trick = createSpaceCrewTrickState(dealSpaceCrewCards(input.deck, input.playerIds));
  const tasks = createSpaceCrewTaskState({ missionNumber: definition.missionNumber, playerIds: input.playerIds, commanderId: trick.commanderId,
    taskDeck: input.taskDeck, taskCount: definition.taskCount, tokens: definition.tokens, mode: definition.taskMode });
  const special = createSpaceCrewMissionSpecial(definition, trick);
  return parseSpaceCrewMissionState({ missionNumber: definition.missionNumber, revision: 0,
    status: tasks.phase === "READY" && (special.kind === "NONE" || special.phase === "READY") ? "ACTIVE" : "SETUP", failure: null,
    trick, tasks, special, exchange: null, communications: createSpaceCrewCommunications(input.playerIds),
    distress: createSpaceCrewDistressState(input.attemptNumber ?? 1, input.previousDistress) });
}

/** A single global revision guards every domain action; component revisions are server supplied. */
export function applySpaceCrewMissionAction(input: SpaceCrewMissionState, actor: PlayerId, commandInput: unknown, randomSource?: RandomSource): SpaceCrewMissionResult {
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
      const result = communicateSpaceCrew({ trick: state.trick, communications: state.communications, assignmentComplete: ready(state), rule: communicationRule(state, definition) }, actor,
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
    default: {
      const result = applySpaceCrewMissionSpecial(state.special, state.trick, actor, command);
      if (!result.ok) return result;
      state.special = result.special;
      break;
    }
  }
  state.revision += 1;
  if (state.status !== "FAILURE") Object.assign(state, objectiveOutcome(state, definition, state.tasks, state.trick.completedTricks.length));
  if (state.missionNumber === 12 && state.status === "ACTIVE" && state.trick.completedTricks.length === 1 && state.exchange === null) {
    const result = exchangeSpaceCrewAfterFirstTrick(state.trick, state.communications, randomSource);
    if (!result.ok) return result;
    state.trick = result.trick; state.exchange = result.exchange;
  }
  try { return { ok: true, state: parseSpaceCrewMissionState(state) }; }
  catch { return { ok: false, reason: "INVALID_STATE" }; }
}
