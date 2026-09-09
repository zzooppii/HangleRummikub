import * as v from "valibot";
import { DrawRelayDrawSecondsSchema, type DrawRelayDrawSeconds } from "@hangul-rummikub/shared";
import { DrawingSchema, GuessSchema, type Drawing } from "./drawing.js";

const Id = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
const Nat = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const Time = v.nullable(Nat);
export const RelayPageSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("DRAWING"), authorPlayerId: Id, timedOut: v.boolean(), drawing: DrawingSchema }),
  v.strictObject({ kind: v.literal("GUESS"), authorPlayerId: Id, timedOut: v.boolean(), text: GuessSchema }),
]);
export type RelayPage = v.InferOutput<typeof RelayPageSchema>;
const Shape = v.strictObject({
  rulesVersion: v.literal("draw-relay-rules-v1"), promptsVersion: v.literal("draw-relay-prompts-v1"),
  gameId: Id, revision: Nat, promptMode: v.picklist(["EASY", "NORMAL", "MIXED"]),
  drawSeconds: v.optional(DrawRelayDrawSecondsSchema, 90),
  seatOrder: v.pipe(v.array(Id), v.minLength(3), v.maxLength(8)),
  players: v.pipe(v.array(v.strictObject({ playerId: Id, forfeited: v.boolean(), offlineMissStreak: Nat })), v.minLength(3), v.maxLength(8)),
  books: v.pipe(v.array(v.strictObject({ bookId: Id, ownerPlayerId: Id, promptId: Id,
    initialPrompt: GuessSchema, pages: v.pipe(v.array(RelayPageSchema), v.maxLength(8)) })), v.minLength(3), v.maxLength(8)),
  stageIndex: v.pipe(Nat, v.minValue(1), v.maxValue(8)),
  phase: v.picklist(["DRAW", "GUESS", "FINAL_GUESS", "REVEAL", "FINISHED"]),
  stageToken: Id, startedAt: Nat, deadlineAt: Time, finishedAt: Time,
  submissions: v.pipe(v.array(Id), v.maxLength(8)),
  drafts: v.pipe(v.array(v.strictObject({ playerId: Id, revision: Nat, drawing: DrawingSchema })), v.maxLength(8)),
  reveal: v.strictObject({ bookIndex: Nat, pageIndex: v.pipe(v.number(), v.integer(), v.minValue(-1), v.maxValue(8)) }),
});
export type DrawRelayState = v.InferOutput<typeof Shape>;
export const stageCount = (n: number) => n % 2 === 0 ? n : n - 1;
export const stageKind = (n: number, stage: number): "DRAW" | "GUESS" | "FINAL_GUESS" =>
  n % 2 === 0 && stage === n ? "FINAL_GUESS" : stage % 2 === 1 ? "DRAW" : "GUESS";
const isRelay = (state: DrawRelayState) => state.phase !== "REVEAL" && state.phase !== "FINISHED";
const actorAt = (state: DrawRelayState, ownerIndex: number, stage: number) => state.seatOrder[(ownerIndex + stage) % state.seatOrder.length]!;
function invariant(ok: boolean) { if (!ok) throw new Error("Invalid DRAW_RELAY state."); }

/** Parses a detached snapshot and validates exact book/seat/page conservation. */
export function parseDrawRelayState(value: unknown): DrawRelayState {
  const state = v.parse(Shape, value), n = state.seatOrder.length, total = stageCount(n);
  invariant(new Set(state.seatOrder).size === n && state.players.length === n && state.books.length === n);
  invariant(state.players.every((p, i) => p.playerId === state.seatOrder[i]));
  invariant(new Set(state.books.map(b => b.bookId)).size === n && new Set(state.books.map(b => b.initialPrompt)).size === n);
  invariant(new Set(state.books.map(b => b.promptId)).size === n && state.stageIndex <= total);
  invariant(new Set(state.submissions).size === state.submissions.length && state.submissions.every(id => state.seatOrder.includes(id)));
  invariant(new Set(state.drafts.map(d => d.playerId)).size === state.drafts.length);
  invariant(state.drafts.every(d => state.seatOrder.includes(d.playerId) && !state.submissions.includes(d.playerId)));
  invariant(state.phase === "DRAW" || state.drafts.length === 0);
  const relay = isRelay(state);
  invariant(relay ? state.phase === stageKind(n, state.stageIndex) && state.deadlineAt !== null && state.finishedAt === null
    : state.deadlineAt === null && state.stageIndex === total && state.submissions.length === n);
  invariant(state.phase === "FINISHED" ? state.finishedAt !== null : state.finishedAt === null);
  invariant(state.deadlineAt === null || state.deadlineAt === state.startedAt + (state.phase === "DRAW" ? state.drawSeconds * 1000 : 45000));
  state.books.forEach((book, i) => {
    invariant(book.ownerPlayerId === state.seatOrder[i]);
    const expected = relay ? state.stageIndex - 1 + Number(state.submissions.includes(actorAt(state, i, state.stageIndex))) : total;
    invariant(book.pages.length === expected);
    book.pages.forEach((page, j) => {
      invariant(page.authorPlayerId === actorAt(state, i, j + 1));
      invariant(page.kind === (stageKind(n, j + 1) === "DRAW" ? "DRAWING" : "GUESS"));
      if (page.timedOut) invariant(page.kind === "DRAWING" ? page.drawing.strokes.length === 0 : page.text === "모르겠어요");
    });
  });
  invariant(state.reveal.bookIndex < n && state.reveal.pageIndex <= total);
  if (relay) invariant(state.reveal.bookIndex === 0 && state.reveal.pageIndex === -1);
  if (state.phase === "FINISHED") invariant(state.reveal.bookIndex === n - 1 && state.reveal.pageIndex === total);
  return state;
}

export function createDrawRelay(input: Readonly<{
  gameId: string; seatOrder: readonly string[]; prompts: readonly Readonly<{ id: string; text: string }>[];
  bookIds: readonly string[]; stageToken: string; now: number; promptMode: DrawRelayState["promptMode"];
  drawSeconds?: DrawRelayDrawSeconds;
}>): DrawRelayState {
  const n = input.seatOrder.length;
  invariant(input.prompts.length === n && input.bookIds.length === n);
  return parseDrawRelayState({
    rulesVersion: "draw-relay-rules-v1", promptsVersion: "draw-relay-prompts-v1", gameId: input.gameId, revision: 0, promptMode: input.promptMode, drawSeconds: input.drawSeconds ?? 90,
    seatOrder: [...input.seatOrder], players: input.seatOrder.map(playerId => ({ playerId, forfeited: false, offlineMissStreak: 0 })),
    books: input.seatOrder.map((ownerPlayerId, i) => ({ bookId: input.bookIds[i], ownerPlayerId, promptId: input.prompts[i]!.id, initialPrompt: input.prompts[i]!.text, pages: [] })),
    stageIndex: 1, phase: "DRAW", stageToken: input.stageToken, startedAt: input.now, deadlineAt: input.now + (input.drawSeconds ?? 90) * 1000,
    finishedAt: null, submissions: [], drafts: [], reveal: { bookIndex: 0, pageIndex: -1 },
  });
}

function bookFor(state: DrawRelayState, actor: string) {
  const seat = state.seatOrder.indexOf(actor); invariant(seat >= 0);
  return state.books[(seat - state.stageIndex + state.seatOrder.length) % state.seatOrder.length]!;
}
function requireOpen(state: DrawRelayState, actor: string, token: string, now: number) {
  invariant(isRelay(state) && state.stageToken === token && state.deadlineAt !== null && now < state.deadlineAt);
  invariant(state.players.some(p => p.playerId === actor && !p.forfeited) && !state.submissions.includes(actor));
}
function appendDefault(state: DrawRelayState, actor: string) {
  if (state.submissions.includes(actor)) return;
  const page: RelayPage = state.phase === "DRAW"
    ? { kind: "DRAWING", authorPlayerId: actor, timedOut: true, drawing: { strokes: [] } }
    : { kind: "GUESS", authorPlayerId: actor, timedOut: true, text: "모르겠어요" };
  bookFor(state, actor).pages.push(page); state.submissions.push(actor);
  state.drafts = state.drafts.filter(d => d.playerId !== actor);
}
/** Bounded by at most eight stages even when everybody has left. */
function advanceBarrier(state: DrawRelayState, now: number, nextToken: string) {
  while (isRelay(state) && state.submissions.length === state.players.length) {
    state.drafts = [];
    if (state.stageIndex === stageCount(state.seatOrder.length)) {
      state.phase = "REVEAL"; state.deadlineAt = null; return;
    }
    state.stageIndex++; state.phase = stageKind(state.seatOrder.length, state.stageIndex);
    state.stageToken = nextToken + ":" + state.stageIndex; state.startedAt = now;
    state.deadlineAt = now + (state.phase === "DRAW" ? state.drawSeconds * 1000 : 45000); state.submissions = [];
    for (const player of state.players) if (player.forfeited) appendDefault(state, player.playerId);
  }
}
export type RelayAction =
  | { kind: "SAVE"; drawing: unknown; expectedDraftRevision: number }
  | { kind: "DRAW"; drawing: unknown }
  | { kind: "GUESS"; text: string };
export function applyRelayAction(previous: DrawRelayState, actor: string, token: string, action: RelayAction, now: number, nextToken: string): DrawRelayState {
  const state = parseDrawRelayState(previous); requireOpen(state, actor, token, now);
  if (action.kind === "SAVE") {
    invariant(state.phase === "DRAW");
    const draft = state.drafts.find(d => d.playerId === actor);
    invariant((draft?.revision ?? 0) === action.expectedDraftRevision);
    const drawing = v.parse(DrawingSchema, action.drawing);
    state.drafts = [...state.drafts.filter(d => d.playerId !== actor), { playerId: actor, revision: action.expectedDraftRevision + 1, drawing }];
  } else {
    let page: RelayPage;
    if (action.kind === "DRAW") {
      invariant(state.phase === "DRAW");
      page = { kind: "DRAWING", authorPlayerId: actor, timedOut: false, drawing: v.parse(DrawingSchema, action.drawing) };
    } else {
      invariant(state.phase === "GUESS" || state.phase === "FINAL_GUESS");
      page = { kind: "GUESS", authorPlayerId: actor, timedOut: false, text: v.parse(GuessSchema, action.text) };
    }
    bookFor(state, actor).pages.push(page); state.submissions.push(actor);
    state.drafts = state.drafts.filter(d => d.playerId !== actor);
    advanceBarrier(state, now, nextToken);
  }
  state.revision++; return parseDrawRelayState(state);
}
export function timeoutRelay(previous: DrawRelayState, token: string, now: number, offline: ReadonlySet<string>, nextToken: string): DrawRelayState {
  const state = parseDrawRelayState(previous);
  invariant(isRelay(state) && state.stageToken === token && state.deadlineAt !== null && now >= state.deadlineAt);
  for (const player of state.players) {
    if (state.submissions.includes(player.playerId)) continue;
    if (offline.has(player.playerId) && !player.forfeited) { player.offlineMissStreak++; player.forfeited = player.offlineMissStreak >= 3; }
    appendDefault(state, player.playerId);
  }
  advanceBarrier(state, now, nextToken); state.revision++; return parseDrawRelayState(state);
}
export function leaveRelay(previous: DrawRelayState, actor: string, now: number, nextToken: string): DrawRelayState {
  const state = parseDrawRelayState(previous), player = state.players.find(p => p.playerId === actor);
  invariant(player !== undefined && state.phase !== "FINISHED");
  if (!player) throw new Error("Invalid participant.");
  player.forfeited = true;
  if (isRelay(state)) { appendDefault(state, actor); advanceBarrier(state, now, nextToken); }
  state.revision++; return parseDrawRelayState(state);
}
export function resumeRelay(previous: DrawRelayState, actor: string): DrawRelayState {
  const state = parseDrawRelayState(previous), player = state.players.find(p => p.playerId === actor);
  invariant(player !== undefined);
  if (player) player.offlineMissStreak = 0;
  state.revision++; return parseDrawRelayState(state);
}
export function revealNext(previous: DrawRelayState, now: number): DrawRelayState {
  const state = parseDrawRelayState(previous); invariant(state.phase === "REVEAL");
  if (state.reveal.pageIndex < stageCount(state.seatOrder.length)) state.reveal.pageIndex++;
  else if (state.reveal.bookIndex < state.books.length - 1) { state.reveal.bookIndex++; state.reveal.pageIndex = -1; }
  else { state.phase = "FINISHED"; state.finishedAt = now; }
  state.revision++; return parseDrawRelayState(state);
}
/** Explicit projection helpers: no book IDs, source author, or owner during play. */
export function relayPrivateAssignment(state: DrawRelayState, actor: string): Readonly<{
  source: { kind: "TEXT"; text: string } | { kind: "DRAWING"; drawing: Drawing };
  draft: Drawing; draftRevision: number; submitted: boolean;
}> | null {
  if (!isRelay(state) || !state.seatOrder.includes(actor)) return null;
  const book = bookFor(state, actor), previous = book.pages[state.stageIndex - 2];
  const source = state.stageIndex === 1 ? { kind: "TEXT" as const, text: book.initialPrompt }
    : previous?.kind === "GUESS" ? { kind: "TEXT" as const, text: previous.text }
    : previous?.kind === "DRAWING" ? { kind: "DRAWING" as const, drawing: v.parse(DrawingSchema, previous.drawing) } : null;
  invariant(source !== null);
  if (!source) throw new Error("Missing immediate source.");
  const draft = state.drafts.find(d => d.playerId === actor);
  return { source, draft: v.parse(DrawingSchema, draft?.drawing ?? { strokes: [] }), draftRevision: draft?.revision ?? 0, submitted: state.submissions.includes(actor) };
}
export function relayRevealedBooks(state: DrawRelayState) {
  if (isRelay(state)) return [];
  return state.books.slice(0, state.reveal.bookIndex + 1).map((book, index) => {
    const cursor = index < state.reveal.bookIndex || state.phase === "FINISHED" ? stageCount(state.seatOrder.length) : state.reveal.pageIndex;
    return { ownerPlayerId: book.ownerPlayerId, initialPrompt: cursor >= 0 ? book.initialPrompt : null,
      pages: book.pages.slice(0, Math.max(0, cursor)).map(page => v.parse(RelayPageSchema, page)) };
  });
}
