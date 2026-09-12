import * as v from "valibot";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { SPACE_CREW_COLORS, SpaceCrewCardIdSchema, parseSpaceCrewDeck, type SpaceCrewCard } from "./cards.js";
import { parseSpaceCrewTrickState, type SpaceCrewCompletedTrick, type SpaceCrewTrickState } from "./trick.js";

const Id = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
const Count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const TrickNumber = v.pipe(Count, v.minValue(1), v.maxValue(13));
const Mission = v.pipe(Count, v.minValue(1), v.maxValue(50));
const FaceFields = { id: Id, suit: v.picklist(SPACE_CREW_COLORS), value: v.picklist([1, 2, 3, 4, 5, 6, 7, 8, 9]) };
export const SpaceCrewTaskFaceSchema = v.strictObject(FaceFields);
export const SpaceCrewTaskTokenSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("ABSOLUTE"), position: v.picklist([1, 2, 3, 4, 5]) }),
  v.strictObject({ kind: v.literal("RELATIVE"), position: v.picklist([1, 2, 3, 4]) }),
  v.strictObject({ kind: v.literal("LAST") }),
]);
const TaskSchema = v.strictObject({ ...FaceFields, token: v.nullable(SpaceCrewTaskTokenSchema), ownerId: v.nullable(PlayerIdSchema), completedAtTrick: v.nullable(TrickNumber) });
const Modes = v.picklist(["CHOOSE", "COMMANDER_DECISION", "COMMANDER_DISTRIBUTION"]);
const TransferSchema = v.strictObject({ taskId: Id, fromPlayerId: PlayerIdSchema, toPlayerId: PlayerIdSchema });
const StateSchema = v.strictObject({
  missionNumber: Mission,
  playerIds: v.pipe(v.array(PlayerIdSchema), v.minLength(3), v.maxLength(5)),
  commanderId: PlayerIdSchema,
  mode: Modes,
  phase: v.picklist(["CHOOSE", "RESPOND", "ASSIGN", "READY"]),
  revision: Count,
  tasks: v.pipe(v.array(TaskSchema), v.maxLength(10)),
  selectionOrder: v.pipe(v.array(Id), v.maxLength(10)),
  responses: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, answer: v.boolean() })), v.maxLength(4)),
  transfer: v.nullable(TransferSchema),
  tokenEditUsed: v.boolean(),
  completedOrder: v.pipe(v.array(Id), v.maxLength(10)),
  lastEvaluatedTrick: v.pipe(Count, v.maxValue(13)),
});
const SetupSchema = v.strictObject({
  missionNumber: Mission,
  playerIds: StateSchema.entries.playerIds,
  commanderId: PlayerIdSchema,
  mode: Modes,
  taskDeck: v.pipe(v.array(SpaceCrewTaskFaceSchema), v.length(36)),
  taskCount: v.pipe(Count, v.maxValue(10)),
  tokens: v.pipe(v.array(SpaceCrewTaskTokenSchema), v.maxLength(10)),
});
const CommandSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("CHOOSE"), taskId: Id, expectedRevision: Count }),
  v.strictObject({ kind: v.literal("RESPOND"), taskId: v.nullable(Id), answer: v.boolean(), expectedRevision: Count }),
  v.strictObject({ kind: v.literal("ASSIGN"), taskId: v.nullable(Id), toPlayerId: PlayerIdSchema, expectedRevision: Count }),
  v.strictObject({ kind: v.literal("TRANSFER"), taskId: Id, toPlayerId: PlayerIdSchema, expectedRevision: Count }),
  v.strictObject({ kind: v.literal("SWAP_TOKENS"), firstTaskId: Id, secondTaskId: Id, expectedRevision: Count }),
  v.strictObject({ kind: v.literal("MOVE_TOKEN"), fromTaskId: Id, toTaskId: Id, expectedRevision: Count }),
]);
const CompletedTrickSchema = v.strictObject({
  number: TrickNumber, leaderId: PlayerIdSchema, winnerId: PlayerIdSchema,
  plays: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, cardId: SpaceCrewCardIdSchema })), v.minLength(3), v.maxLength(5)),
});

export type SpaceCrewTaskFace = v.InferOutput<typeof SpaceCrewTaskFaceSchema>;
export type SpaceCrewTaskToken = v.InferOutput<typeof SpaceCrewTaskTokenSchema>;
export type SpaceCrewTask = v.InferOutput<typeof TaskSchema>;
export type SpaceCrewTaskState = v.InferOutput<typeof StateSchema>;
export type SpaceCrewTaskSetup = Readonly<Omit<v.InferOutput<typeof SetupSchema>, "playerIds" | "taskDeck" | "tokens"> & {
  playerIds: readonly PlayerId[]; taskDeck: readonly SpaceCrewTaskFace[]; tokens: readonly SpaceCrewTaskToken[];
}>;
export type SpaceCrewTaskError = "INVALID_STATE" | "INVALID_ACTION" | "INVALID_ACTOR" | "STALE_REVISION" | "INVALID_PHASE" | "NOT_YOUR_TURN" | "INVALID_TASK" | "INVALID_RECIPIENT" | "UNBALANCED_DISTRIBUTION" | "TRANSFER_NOT_ALLOWED" | "TOKEN_EDIT_NOT_ALLOWED" | "REVISION_EXHAUSTED";
export type SpaceCrewTaskActionResult = { ok: true; state: SpaceCrewTaskState } | { ok: false; reason: SpaceCrewTaskError };
export type SpaceCrewTaskBatchResult =
  | { ok: true; state: SpaceCrewTaskState; completedTaskIds: string[] }
  | { ok: false; reason: "INVALID_STATE" | "INVALID_TRICK" | "INVALID_PHASE" | "WRONG_OWNER" | "TASK_ORDER" | "REVISION_EXHAUSTED"; taskIds: string[] };

// Only the gold-framed basic-game missions admit the optional five-player transfer.
const TRANSFER_MISSIONS = new Set([25, 27, 28, 30, 31, 32, 35, 36, 37, 38, 39, 40, 42, 43, 45, 47, 48, 49]);

function invalidState(): never { throw new Error("Invalid Space Crew task state."); }
function unique<T>(values: readonly T[]): boolean { return new Set(values).size === values.length; }
function sameFace(a: SpaceCrewTaskFace, b: Pick<SpaceCrewCard, "suit" | "value">): boolean { return a.suit === b.suit && a.value === b.value; }
function seatAfter(state: SpaceCrewTaskState, offset: number): PlayerId {
  const index = state.playerIds.indexOf(state.commanderId);
  const player = state.playerIds[(index + offset) % state.playerIds.length];
  if (index < 0 || !player) return invalidState();
  return player;
}
function taskFor(state: SpaceCrewTaskState, id: string): SpaceCrewTask {
  const task = state.tasks.find(candidate => candidate.id === id);
  if (!task) return invalidState();
  return task;
}
function currentTaskId(state: SpaceCrewTaskState): string | null {
  return state.mode === "COMMANDER_DISTRIBUTION" && state.phase !== "READY"
    ? state.tasks[state.selectionOrder.length]?.id ?? null : null;
}
function originalOwner(state: SpaceCrewTaskState, task: SpaceCrewTask): PlayerId | null {
  return state.transfer?.taskId === task.id ? state.transfer.fromPlayerId : task.ownerId;
}
function distributionCanFinish(state: SpaceCrewTaskState): boolean {
  const counts = state.playerIds.map(id => state.tasks.filter(task => originalOwner(state, task) === id).length);
  const floor = Math.floor(state.tasks.length / counts.length), ceiling = Math.ceil(state.tasks.length / counts.length);
  const remaining = state.tasks.length - state.selectionOrder.length;
  return counts.every(count => count <= ceiling) && counts.reduce((sum, count) => sum + Math.max(0, floor - count), 0) <= remaining;
}
function canAppend(tasks: readonly SpaceCrewTask[], completed: readonly string[], task: SpaceCrewTask): boolean {
  const rank = completed.length + 1;
  const reserved = tasks.find(candidate => candidate.token?.kind === "ABSOLUTE" && candidate.token.position === rank);
  if (reserved && reserved.id !== task.id) return false;
  if (task.token?.kind === "ABSOLUTE" && task.token.position !== rank) return false;
  if (task.token?.kind === "LAST" && rank !== tasks.length) return false;
  if (task.token?.kind === "RELATIVE") {
    const position = task.token.position;
    if (tasks.some(candidate => candidate.token?.kind === "RELATIVE" && candidate.token.position < position && !completed.includes(candidate.id))) return false;
  }
  return true;
}

export function parseSpaceCrewTaskState(input: unknown): SpaceCrewTaskState {
  const result = v.safeParse(StateSchema, input);
  if (!result.success) return invalidState();
  const state = result.output;
  if (!unique(state.playerIds) || !state.playerIds.includes(state.commanderId)) return invalidState();
  if (!unique(state.tasks.map(task => task.id)) || !unique(state.tasks.map(task => `${task.suit}:${task.value}`))) return invalidState();
  const tokens = state.tasks.flatMap(task => task.token ? [task.token] : []);
  if (!unique(tokens.map(token => token.kind === "LAST" ? token.kind : `${token.kind}:${token.position}`))) return invalidState();
  if (tokens.some(token => token.kind === "ABSOLUTE" && token.position > state.tasks.length)) return invalidState();
  const assigned = state.tasks.filter(task => task.ownerId !== null);
  if (state.tasks.some(task => task.ownerId !== null && !state.playerIds.includes(task.ownerId))) return invalidState();
  if (!unique(state.selectionOrder) || state.selectionOrder.length !== assigned.length || state.selectionOrder.some(id => !assigned.some(task => task.id === id))) return invalidState();
  if (state.lastEvaluatedTrick > Math.floor(40 / state.playerIds.length)) return invalidState();
  if (state.phase === "READY" ? assigned.length !== state.tasks.length : assigned.length === state.tasks.length) return invalidState();
  if (state.phase !== "READY" && (state.completedOrder.length > 0 || state.lastEvaluatedTrick !== 0 || state.transfer !== null)) return invalidState();
  if (state.tokenEditUsed && (state.mode !== "CHOOSE" || state.missionNumber !== 23 && state.missionNumber !== 40)) return invalidState();
  if (state.transfer) {
    const transfer = state.transfer;
    if (state.playerIds.length !== 5 || !TRANSFER_MISSIONS.has(state.missionNumber) || transfer.fromPlayerId === transfer.toPlayerId || !state.playerIds.includes(transfer.fromPlayerId) || !state.playerIds.includes(transfer.toPlayerId)) return invalidState();
    if (taskFor(state, transfer.taskId).ownerId !== transfer.toPlayerId) return invalidState();
  }
  if (state.mode === "CHOOSE") {
    if (state.phase !== "CHOOSE" && state.phase !== "READY" || state.responses.length !== 0) return invalidState();
    if (state.selectionOrder.some((id, index) => originalOwner(state, taskFor(state, id)) !== seatAfter(state, index))) return invalidState();
  } else {
    if (state.phase === "CHOOSE") return invalidState();
    if (state.mode === "COMMANDER_DECISION") {
      if (assigned.length !== 0 && assigned.length !== state.tasks.length) return invalidState();
      if (assigned.length > 0) {
        const owner = originalOwner(state, assigned[0] ?? invalidState());
        if (owner === state.commanderId || assigned.some(task => originalOwner(state, task) !== owner)) return invalidState();
      }
    }
    if (state.selectionOrder.some((id, index) => state.tasks[index]?.id !== id)) return invalidState();
    if (state.mode === "COMMANDER_DISTRIBUTION" && !distributionCanFinish(state)) return invalidState();
    if (state.phase === "READY") {
      if (state.responses.length !== 0) return invalidState();
    } else {
      if (state.responses.some((response, index) => response.playerId !== seatAfter(state, index + 1))) return invalidState();
      if (state.phase === "RESPOND" ? state.responses.length >= state.playerIds.length - 1 : state.responses.length !== state.playerIds.length - 1) return invalidState();
    }
  }
  if (!unique(state.completedOrder) || state.completedOrder.length !== state.tasks.filter(task => task.completedAtTrick !== null).length) return invalidState();
  const ordered: string[] = [];
  let previousTrick = 0;
  const batchOwners = new Map<number, PlayerId>();
  const batchSizes = new Map<number, number>();
  for (const id of state.completedOrder) {
    const task = taskFor(state, id);
    if (task.completedAtTrick === null || task.ownerId === null || task.completedAtTrick < previousTrick || task.completedAtTrick > state.lastEvaluatedTrick || !canAppend(state.tasks, ordered, task)) return invalidState();
    const owner = batchOwners.get(task.completedAtTrick);
    if (owner !== undefined && owner !== task.ownerId) return invalidState();
    batchOwners.set(task.completedAtTrick, task.ownerId);
    const batchSize = (batchSizes.get(task.completedAtTrick) ?? 0) + 1;
    if (batchSize > state.playerIds.length) return invalidState();
    batchSizes.set(task.completedAtTrick, batchSize);
    previousTrick = task.completedAtTrick;
    ordered.push(id);
  }
  const assignmentActions = state.mode === "CHOOSE" ? state.selectionOrder.length
    : state.mode === "COMMANDER_DISTRIBUTION" ? state.selectionOrder.length * state.playerIds.length
      : state.selectionOrder.length > 0 ? state.playerIds.length : 0;
  const minimumRevision = assignmentActions + state.responses.length + state.lastEvaluatedTrick
    + Number(state.tokenEditUsed) + Number(state.transfer !== null);
  if (state.revision < minimumRevision) return invalidState();
  return state;
}

export function createSpaceCrewTaskState(input: SpaceCrewTaskSetup): SpaceCrewTaskState {
  const result = v.safeParse(SetupSchema, input);
  if (!result.success) return invalidState();
  const setup = result.output;
  if (!unique(setup.taskDeck.map(task => task.id)) || !unique(setup.taskDeck.map(task => `${task.suit}:${task.value}`)) || setup.tokens.length > setup.taskCount) return invalidState();
  const tasks = setup.taskDeck.slice(0, setup.taskCount).map((face, index) => ({ ...face, token: setup.tokens[index] ?? null, ownerId: null, completedAtTrick: null }));
  return parseSpaceCrewTaskState({ missionNumber: setup.missionNumber, playerIds: setup.playerIds, commanderId: setup.commanderId, mode: setup.mode,
    phase: setup.taskCount === 0 ? "READY" : setup.mode === "CHOOSE" ? "CHOOSE" : "RESPOND", revision: 0, tasks,
    selectionOrder: [], responses: [], transfer: null, tokenEditUsed: false, completedOrder: [], lastEvaluatedTrick: 0 });
}

/** IDs refer only to public task cards, never private playing-card instances. */
export function visibleSpaceCrewTaskIds(input: SpaceCrewTaskState): readonly string[] {
  const state = parseSpaceCrewTaskState(input);
  if (state.mode === "CHOOSE" || state.phase === "READY") return state.tasks.map(task => task.id);
  if (state.mode === "COMMANDER_DECISION") return [];
  return state.tasks.slice(0, state.selectionOrder.length + 1).map(task => task.id);
}

export function spaceCrewTaskPrompt(input: SpaceCrewTaskState): { taskId: string | null; activePlayerId: PlayerId | null } {
  const state = parseSpaceCrewTaskState(input);
  const activePlayerId = state.phase === "READY" ? null : state.phase === "CHOOSE" ? seatAfter(state, state.selectionOrder.length)
    : state.phase === "ASSIGN" ? state.commanderId : seatAfter(state, state.responses.length + 1);
  return { taskId: currentTaskId(state), activePlayerId };
}

export function applySpaceCrewTaskAction(input: SpaceCrewTaskState, actor: PlayerId, commandInput: unknown, trickInput: SpaceCrewTrickState): SpaceCrewTaskActionResult {
  let state: SpaceCrewTaskState;
  let trick: SpaceCrewTrickState;
  try { state = parseSpaceCrewTaskState(input); trick = parseSpaceCrewTrickState(trickInput); }
  catch { return { ok: false, reason: "INVALID_STATE" }; }
  if (state.commanderId !== trick.commanderId || state.playerIds.length !== trick.players.length || state.playerIds.some((id, index) => id !== trick.players[index]?.playerId)) return { ok: false, reason: "INVALID_STATE" };
  const parsed = v.safeParse(CommandSchema, commandInput);
  if (!parsed.success) return { ok: false, reason: "INVALID_ACTION" };
  const command = parsed.output;
  if (!state.playerIds.includes(actor)) return { ok: false, reason: "INVALID_ACTOR" };
  if (command.expectedRevision !== state.revision) return { ok: false, reason: "STALE_REVISION" };
  if (trick.currentTrick.length !== 0 || trick.completedTricks.length !== 0 || state.lastEvaluatedTrick !== 0) return { ok: false, reason: "INVALID_PHASE" };
  if (state.revision === Number.MAX_SAFE_INTEGER) return { ok: false, reason: "REVISION_EXHAUSTED" };
  if (command.kind === "CHOOSE") {
    if (state.phase !== "CHOOSE") return { ok: false, reason: "INVALID_PHASE" };
    if (actor !== seatAfter(state, state.selectionOrder.length)) return { ok: false, reason: "NOT_YOUR_TURN" };
    const task = state.tasks.find(task => task.id === command.taskId && task.ownerId === null);
    if (!task) return { ok: false, reason: "INVALID_TASK" };
    task.ownerId = actor;
    state.selectionOrder.push(task.id);
    if (state.selectionOrder.length === state.tasks.length) state.phase = "READY";
  } else if (command.kind === "RESPOND") {
    if (state.phase !== "RESPOND") return { ok: false, reason: "INVALID_PHASE" };
    if (command.taskId !== currentTaskId(state)) return { ok: false, reason: "INVALID_TASK" };
    if (actor !== seatAfter(state, state.responses.length + 1)) return { ok: false, reason: "NOT_YOUR_TURN" };
    state.responses.push({ playerId: actor, answer: command.answer });
    if (state.responses.length === state.playerIds.length - 1) state.phase = "ASSIGN";
  } else if (command.kind === "ASSIGN") {
    if (state.phase !== "ASSIGN") return { ok: false, reason: "INVALID_PHASE" };
    if (actor !== state.commanderId) return { ok: false, reason: "NOT_YOUR_TURN" };
    if (command.taskId !== currentTaskId(state)) return { ok: false, reason: "INVALID_TASK" };
    if (!state.playerIds.includes(command.toPlayerId) || state.mode === "COMMANDER_DECISION" && command.toPlayerId === state.commanderId) return { ok: false, reason: "INVALID_RECIPIENT" };
    const tasks = state.mode === "COMMANDER_DECISION" ? state.tasks : state.tasks.filter(task => task.id === command.taskId);
    for (const task of tasks) { task.ownerId = command.toPlayerId; state.selectionOrder.push(task.id); }
    if (state.mode === "COMMANDER_DISTRIBUTION" && !distributionCanFinish(state)) return { ok: false, reason: "UNBALANCED_DISTRIBUTION" };
    state.responses = [];
    state.phase = state.selectionOrder.length === state.tasks.length ? "READY" : "RESPOND";
  } else if (command.kind === "TRANSFER") {
    if (state.phase !== "READY") return { ok: false, reason: "INVALID_PHASE" };
    if (state.playerIds.length !== 5 || !TRANSFER_MISSIONS.has(state.missionNumber) || state.transfer !== null) return { ok: false, reason: "TRANSFER_NOT_ALLOWED" };
    const task = state.tasks.find(task => task.id === command.taskId && task.ownerId === actor);
    if (!task) return { ok: false, reason: "INVALID_TASK" };
    if (command.toPlayerId === actor || !state.playerIds.includes(command.toPlayerId)) return { ok: false, reason: "INVALID_RECIPIENT" };
    state.transfer = { taskId: task.id, fromPlayerId: actor, toPlayerId: command.toPlayerId };
    task.ownerId = command.toPlayerId;
  } else {
    if (state.phase !== "CHOOSE" || state.selectionOrder.length !== 0 || state.tokenEditUsed) return { ok: false, reason: "TOKEN_EDIT_NOT_ALLOWED" };
    if (actor !== state.commanderId) return { ok: false, reason: "NOT_YOUR_TURN" };
    if (command.kind === "SWAP_TOKENS") {
      if (state.missionNumber !== 23) return { ok: false, reason: "TOKEN_EDIT_NOT_ALLOWED" };
      const first = state.tasks.find(task => task.id === command.firstTaskId), second = state.tasks.find(task => task.id === command.secondTaskId);
      if (!first?.token || !second?.token || first.id === second.id) return { ok: false, reason: "INVALID_TASK" };
      [first.token, second.token] = [second.token, first.token];
    } else {
      if (state.missionNumber !== 40) return { ok: false, reason: "TOKEN_EDIT_NOT_ALLOWED" };
      const from = state.tasks.find(task => task.id === command.fromTaskId), to = state.tasks.find(task => task.id === command.toTaskId);
      if (!from?.token || !to || to.token !== null || from.id === to.id) return { ok: false, reason: "INVALID_TASK" };
      to.token = from.token; from.token = null;
    }
    state.tokenEditUsed = true;
  }
  state.revision += 1;
  return { ok: true, state: parseSpaceCrewTaskState(state) };
}

function orderedBatch(tasks: readonly SpaceCrewTask[], previous: readonly string[], pending: readonly SpaceCrewTask[]): string[] | null {
  if (pending.length === 0) return [];
  for (const task of pending) {
    if (!canAppend(tasks, previous, task)) continue;
    const rest = orderedBatch(tasks, [...previous, task.id], pending.filter(candidate => candidate.id !== task.id));
    if (rest !== null) return [task.id, ...rest];
  }
  return null;
}

export function evaluateSpaceCrewTaskBatch(input: SpaceCrewTaskState, trickInput: SpaceCrewCompletedTrick, inventory: readonly SpaceCrewCard[]): SpaceCrewTaskBatchResult {
  let state: SpaceCrewTaskState;
  let cards: readonly SpaceCrewCard[];
  try { state = parseSpaceCrewTaskState(input); cards = parseSpaceCrewDeck(inventory); }
  catch { return { ok: false, reason: "INVALID_STATE", taskIds: [] }; }
  if (state.phase !== "READY") return { ok: false, reason: "INVALID_PHASE", taskIds: [] };
  const parsed = v.safeParse(CompletedTrickSchema, trickInput);
  if (!parsed.success) return { ok: false, reason: "INVALID_TRICK", taskIds: [] };
  const trick = parsed.output;
  const leaderIndex = state.playerIds.indexOf(trick.leaderId);
  if (trick.number !== state.lastEvaluatedTrick + 1 || trick.number > Math.floor(40 / state.playerIds.length) || leaderIndex < 0 || trick.plays.length !== state.playerIds.length || !unique(trick.plays.map(play => play.cardId)) || trick.plays.some((play, index) => play.playerId !== state.playerIds[(leaderIndex + index) % state.playerIds.length])) return { ok: false, reason: "INVALID_TRICK", taskIds: [] };
  const playedCards: SpaceCrewCard[] = [];
  for (const play of trick.plays) {
    const card = cards.find(card => card.cardId === play.cardId);
    if (!card) return { ok: false, reason: "INVALID_TRICK", taskIds: [] };
    playedCards.push(card);
  }
  const first = playedCards[0];
  if (!first) return { ok: false, reason: "INVALID_TRICK", taskIds: [] };
  const rockets = playedCards.filter(card => card.kind === "ROCKET");
  const eligible = rockets.length > 0 ? rockets : playedCards.filter(card => card.suit === first.suit);
  const winningCard = [...eligible].sort((a, b) => b.value - a.value)[0];
  if (!winningCard || trick.plays.find(play => play.cardId === winningCard.cardId)?.playerId !== trick.winnerId) return { ok: false, reason: "INVALID_TRICK", taskIds: [] };
  const captured = state.tasks.filter(task => playedCards.some(card => sameFace(task, card)));
  if (captured.some(task => task.completedAtTrick !== null)) return { ok: false, reason: "INVALID_TRICK", taskIds: [] };
  const wrongOwners = captured.filter(task => task.ownerId !== trick.winnerId);
  if (wrongOwners.length > 0) return { ok: false, reason: "WRONG_OWNER", taskIds: wrongOwners.map(task => task.id) };
  const order = orderedBatch(state.tasks, state.completedOrder, captured);
  if (order === null) return { ok: false, reason: "TASK_ORDER", taskIds: captured.map(task => task.id) };
  if (state.revision === Number.MAX_SAFE_INTEGER) return { ok: false, reason: "REVISION_EXHAUSTED", taskIds: [] };
  for (const id of order) taskFor(state, id).completedAtTrick = trick.number;
  state.completedOrder.push(...order);
  state.lastEvaluatedTrick = trick.number;
  state.revision += 1;
  return { ok: true, state: parseSpaceCrewTaskState(state), completedTaskIds: order };
}
