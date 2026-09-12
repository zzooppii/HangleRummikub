import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import * as v from "valibot";
import { SpaceCrewCardIdSchema } from "./cards.js";
import {
  parseSpaceCrewCommunications, type SpaceCrewCommunications,
} from "./communication.js";
import { parseSpaceCrewTrickState, type SpaceCrewTrickState } from "./trick.js";

const integer = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const attemptNumber = v.pipe(integer, v.minValue(1));
const DirectionSchema = v.picklist(["LEFT", "RIGHT"]);
const VoteSchema = v.strictObject({ playerId: PlayerIdSchema, accept: v.boolean() });
const SelectionSchema = v.strictObject({ playerId: PlayerIdSchema, cardId: SpaceCrewCardIdSchema });
const EventSchema = v.strictObject({
  attemptNumber,
  kind: v.picklist(["ACTIVATED", "EXCHANGED", "SKIPPED"]),
  direction: v.nullable(DirectionSchema),
});
const StateSchema = v.strictObject({
  active: v.boolean(),
  attemptNumber,
  phase: v.picklist(["UNDECIDED", "VOTING", "SELECTING", "SKIPPED", "EXCHANGED"]),
  direction: v.nullable(DirectionSchema),
  votes: v.pipe(v.array(VoteSchema), v.maxLength(5)),
  selections: v.pipe(v.array(SelectionSchema), v.maxLength(5)),
  history: v.array(EventSchema),
});
const CommandSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("PROPOSE"), direction: DirectionSchema, expectedRevision: integer }),
  v.strictObject({ kind: v.literal("VOTE"), accept: v.boolean(), expectedRevision: integer }),
  v.strictObject({ kind: v.literal("SELECT"), cardId: SpaceCrewCardIdSchema, expectedRevision: integer }),
  v.strictObject({ kind: v.literal("SKIP"), expectedRevision: integer }),
]);
export type SpaceCrewDistressState = v.InferOutput<typeof StateSchema>;
export type SpaceCrewDistressHistory = SpaceCrewDistressState["history"];
export type SpaceCrewDistressContext = Readonly<{
  trick: SpaceCrewTrickState;
  communications: SpaceCrewCommunications;
  assignmentComplete: boolean;
  distress: SpaceCrewDistressState;
}>;
type Result = { ok: true; trick: SpaceCrewTrickState; distress: SpaceCrewDistressState }
  | { ok: false; reason: "INVALID_STATE" | "INVALID_ACTION" | "INVALID_ACTOR" | "STALE_REVISION"
    | "INVALID_PHASE" | "INVALID_CARD" | "ALREADY_RESPONDED" | "REVISION_EXHAUSTED" };

function invalid(): never { throw new Error("Invalid Space Crew distress state."); }

function validateHistory(state: Pick<SpaceCrewDistressState, "active" | "history" | "attemptNumber">): Set<number> {
  if (state.history.some(event => event.attemptNumber > state.attemptNumber)) return invalid();
  const activations = state.history.filter(event => event.kind === "ACTIVATED");
  if (activations.length !== Number(state.active)) return invalid();
  let lastAttempt = 0;
  let activated = false;
  const exchangedAttempts = new Set<number>();
  for (const event of state.history) {
    if (event.attemptNumber < lastAttempt || exchangedAttempts.has(event.attemptNumber)) return invalid();
    lastAttempt = event.attemptNumber;
    if (event.kind === "ACTIVATED") {
      if (event.direction !== null) return invalid();
      activated = true;
    }
    if (event.kind === "EXCHANGED") {
      if (!activated || event.direction === null || exchangedAttempts.has(event.attemptNumber)) return invalid();
      exchangedAttempts.add(event.attemptNumber);
    }
    if (event.kind === "SKIPPED" && event.direction !== null) return invalid();
  }
  return exchangedAttempts;
}

export function parseSpaceCrewDistressState(input: unknown, trick: SpaceCrewTrickState): SpaceCrewDistressState {
  const result = v.safeParse(StateSchema, input);
  if (!result.success) return invalid();
  const state = result.output;
  trick = parseSpaceCrewTrickState(trick);
  const players = new Set(trick.players.map(p => p.playerId));
  if (new Set(state.votes.map(vote => vote.playerId)).size !== state.votes.length
    || new Set(state.selections.map(selection => selection.playerId)).size !== state.selections.length
    || state.votes.some(vote => !players.has(vote.playerId))
    || state.selections.some(selection => !players.has(selection.playerId))) return invalid();
  const exchangedAttempts = validateHistory(state);
  const currentEvents = state.history.filter(event => event.attemptNumber === state.attemptNumber);
  if (state.phase === "UNDECIDED" && currentEvents.length > 0) return invalid();
  if (state.phase === "SKIPPED" && currentEvents.at(-1)?.kind !== "SKIPPED") return invalid();
  if (currentEvents.some(event => event.kind === "ACTIVATED")
    && state.phase !== "SELECTING" && state.phase !== "EXCHANGED") return invalid();
  if (state.phase === "VOTING" || state.phase === "SELECTING") {
    if (trick.phase !== "BETWEEN_TRICKS" || trick.completedTricks.length !== 0
      || state.direction === null || state.votes.length === 0 || state.votes.some(vote => !vote.accept)) return invalid();
    if (state.phase === "VOTING" && (state.selections.length !== 0 || state.votes.length >= players.size)) return invalid();
    if (state.phase === "SELECTING") {
      if (!state.active || state.votes.length !== players.size || state.selections.length >= players.size) return invalid();
      for (const selection of state.selections) {
        const player = trick.players.find(p => p.playerId === selection.playerId);
        const card = trick.cards.find(c => c.cardId === selection.cardId);
        if (!player?.hand.includes(selection.cardId) || card?.kind !== "COLOR") return invalid();
      }
    }
  } else if (state.direction !== null || state.votes.length !== 0 || state.selections.length !== 0) return invalid();
  if ((state.phase === "EXCHANGED") !== exchangedAttempts.has(state.attemptNumber)) return invalid();
  return state;
}

/** Retry keeps mission help history but starts with no vote or selected card. */
export function createSpaceCrewDistressState(
  currentAttempt: number,
  previous: Pick<SpaceCrewDistressState, "active" | "history"> = { active: false, history: [] },
): SpaceCrewDistressState {
  const parsed = v.parse(StateSchema, {
    active: previous.active, history: previous.history, attemptNumber: currentAttempt,
    phase: "UNDECIDED", direction: null, votes: [], selections: [],
  });
  validateHistory(parsed);
  if (parsed.history.some(event => event.attemptNumber >= currentAttempt)) return invalid();
  return parsed;
}

export function spaceCrewRecordedAttempts(actualAttempts: number, distressActive: boolean): number {
  const actual = v.parse(attemptNumber, actualAttempts);
  const active = v.parse(v.boolean(), distressActive);
  return v.parse(attemptNumber, actual + Number(active));
}

function finishSkip(state: SpaceCrewDistressState): void {
  state.phase = "SKIPPED";
  state.direction = null;
  state.votes = [];
  state.selections = [];
  state.history.push({ attemptNumber: state.attemptNumber, kind: "SKIPPED", direction: null });
}

/** All proposed cards are checked against the old hands before any card moves. */
export function applySpaceCrewDistress(
  input: SpaceCrewDistressContext, actor: PlayerId, command: unknown,
): Result {
  let trick: SpaceCrewTrickState;
  let state: SpaceCrewDistressState;
  let communications: SpaceCrewCommunications;
  try {
    trick = parseSpaceCrewTrickState(input.trick);
    communications = parseSpaceCrewCommunications(input.communications, trick);
    state = parseSpaceCrewDistressState(input.distress, trick);
    if (typeof input.assignmentComplete !== "boolean") return { ok: false, reason: "INVALID_STATE" };
  } catch { return { ok: false, reason: "INVALID_STATE" }; }
  const action = v.safeParse(CommandSchema, command);
  if (!action.success) return { ok: false, reason: "INVALID_ACTION" };
  const a = action.output;
  if (!trick.players.some(p => p.playerId === actor)) return { ok: false, reason: "INVALID_ACTOR" };
  if (a.expectedRevision !== trick.revision) return { ok: false, reason: "STALE_REVISION" };
  if (!input.assignmentComplete || trick.phase !== "BETWEEN_TRICKS" || trick.completedTricks.length !== 0
    || communications.some(c => c.used) || state.phase === "EXCHANGED") return { ok: false, reason: "INVALID_PHASE" };
  if (trick.revision === Number.MAX_SAFE_INTEGER) return { ok: false, reason: "REVISION_EXHAUSTED" };
  switch (a.kind) {
    case "PROPOSE":
      if (state.phase !== "UNDECIDED" && state.phase !== "SKIPPED") return { ok: false, reason: "INVALID_PHASE" };
      state.phase = "VOTING";
      state.direction = a.direction;
      state.votes = [{ playerId: actor, accept: true }];
      break;
    case "VOTE":
      if (state.phase !== "VOTING") return { ok: false, reason: "INVALID_PHASE" };
      if (state.votes.some(vote => vote.playerId === actor)) return { ok: false, reason: "ALREADY_RESPONDED" };
      if (!a.accept) finishSkip(state);
      else {
        state.votes.push({ playerId: actor, accept: true });
        if (state.votes.length === trick.players.length) {
          state.phase = "SELECTING";
          if (!state.active) {
            state.active = true;
            state.history.push({ attemptNumber: state.attemptNumber, kind: "ACTIVATED", direction: null });
          }
        }
      }
      break;
    case "SKIP":
      if (state.phase !== "UNDECIDED") return { ok: false, reason: "INVALID_PHASE" };
      finishSkip(state);
      break;
    case "SELECT": {
      if (state.phase !== "SELECTING") return { ok: false, reason: "INVALID_PHASE" };
      if (state.selections.some(selection => selection.playerId === actor)) return { ok: false, reason: "ALREADY_RESPONDED" };
      const player = trick.players.find(p => p.playerId === actor);
      const card = trick.cards.find(c => c.cardId === a.cardId);
      if (!player?.hand.includes(a.cardId) || card?.kind !== "COLOR") return { ok: false, reason: "INVALID_CARD" };
      state.selections.push({ playerId: actor, cardId: a.cardId });
      if (state.selections.length === trick.players.length) {
        const direction = state.direction;
        if (!direction) return { ok: false, reason: "INVALID_STATE" };
        const beforeHands = trick.players.map(p => [...p.hand]);
        for (const [index, recipient] of trick.players.entries()) {
          // The next clockwise seat is the left neighbour of a player facing the table.
          const sourceIndex = (index + (direction === "LEFT" ? -1 : 1) + trick.players.length) % trick.players.length;
          const source = trick.players[sourceIndex];
          const incoming = state.selections.find(selection => selection.playerId === source?.playerId);
          const outgoing = state.selections.find(selection => selection.playerId === recipient.playerId);
          const oldHand = beforeHands[index];
          if (!incoming || !outgoing || !oldHand) return { ok: false, reason: "INVALID_STATE" };
          recipient.hand = [...oldHand.filter(id => id !== outgoing.cardId), incoming.cardId];
        }
        state.history.push({ attemptNumber: state.attemptNumber, kind: "EXCHANGED", direction });
        state.phase = "EXCHANGED";
        state.direction = null;
        state.votes = [];
        state.selections = [];
      }
      break;
    }
  }
  trick.revision += 1;
  return { ok: true, trick: parseSpaceCrewTrickState(trick), distress: parseSpaceCrewDistressState(state, trick) };
}

/** Pending selection identities are public; the selected cards never are. */
export function projectSpaceCrewDistress(state: SpaceCrewDistressState) {
  return {
    active: state.active,
    phase: state.phase,
    direction: state.direction,
    votes: state.votes.map(vote => ({ ...vote })),
    selectedPlayerIds: state.selections.map(selection => selection.playerId),
  };
}
