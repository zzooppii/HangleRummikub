import test from "node:test";
import assert from "node:assert/strict";
import { createDrawRelay, applyRelayAction, timeoutRelay, leaveRelay, resumeRelay, revealNext, parseDrawRelayState, relayPrivateAssignment, relayRevealedBooks, stageCount } from "../games/draw-relay/domain/game.js";
import { parseDrawing } from "../games/draw-relay/domain/drawing.js";
const empty = { strokes: [] };
const drawing = { strokes: [{ strokeId: "one", tool: "PEN", color: "#202838", width: 4, points: [{ x: 10, y: 20 }] }] };
function initial(n = 4) {
  return createDrawRelay({ gameId: "relay", seatOrder: Array.from({ length: n }, (_, i) => "p" + i),
    bookIds: Array.from({ length: n }, (_, i) => "book" + i), prompts: Array.from({ length: n }, (_, i) => ({ id: "prompt" + i, text: "제시어" + i })),
    stageToken: "first", now: 0, promptMode: "MIXED" });
}
for (const n of [3, 4, 5, 6, 7, 8]) test(`DRAW_RELAY ${n} seats conserve books, hide owners, end in guess and reveal incrementally`, () => {
  let state = initial(n);
  for (let stage = 1; stage <= stageCount(n); stage++) {
    assert.equal(state.stageIndex, stage);
    for (const actor of state.seatOrder) {
      const view = relayPrivateAssignment(state, actor)!;
      assert.deepEqual(Object.keys(view).sort(), ["draft", "draftRevision", "source", "submitted"]);
      if (stage === 1) assert.notEqual(view.source.kind === "TEXT" ? view.source.text : null, state.books.find(b => b.ownerPlayerId === actor)!.initialPrompt);
      const before = JSON.stringify(state), revision = state.revision;
      const next = applyRelayAction(state, actor, state.stageToken, state.phase === "DRAW" ? { kind: "DRAW", drawing } : { kind: "GUESS", text: "  그림   추측 " }, 1, "next" + stage);
      assert.equal(JSON.stringify(state), before); assert.equal(next.revision, revision + 1); state = next;
    }
  }
  assert.equal(state.phase, "REVEAL");
  for (const book of state.books) { assert.equal(book.pages.length, stageCount(n)); assert.equal(book.pages.at(-1)!.kind, "GUESS"); }
  assert.equal(relayRevealedBooks(state)[0]!.initialPrompt, null);
  state = revealNext(state, 2); assert.equal(relayRevealedBooks(state)[0]!.pages.length, 0);
  while (state.phase !== "FINISHED") state = revealNext(state, 3);
  assert.equal(relayRevealedBooks(state).length, n); assert.equal(state.finishedAt, 3);
});
test("DRAW_RELAY partial barrier and duplicate submit never append twice", () => {
  const state = initial(3), next = applyRelayAction(state, "p0", "first", { kind: "DRAW", drawing: empty }, 2, "next");
  assert.equal(next.stageIndex, 1); assert.equal(next.submissions.length, 1);
  assert.throws(() => applyRelayAction(next, "p0", "first", { kind: "DRAW", drawing: empty }, 3, "next"));
  assert.throws(() => applyRelayAction(next, "p1", "wrong", { kind: "DRAW", drawing: empty }, 3, "next"));
  assert.throws(() => applyRelayAction(next, "p1", "first", { kind: "DRAW", drawing: empty }, 90000, "next"));
});
test("DRAW_RELAY drawing schema bounds, finite numbers, palette and IDs", () => {
  assert.deepEqual(parseDrawing(drawing), drawing);
  const stroke = drawing.strokes[0]!;
  for (const bad of [NaN, Infinity, -1, 1001]) assert.throws(() => parseDrawing({ strokes: [{ ...stroke, points: [{ x: bad, y: 0 }] }] }));
  for (const patch of [{ color: "red" }, { width: 100 }, { tool: "TEXT" }, { points: [] }]) assert.throws(() => parseDrawing({ strokes: [{ ...stroke, ...patch }] }));
  assert.throws(() => parseDrawing({ strokes: [stroke, stroke] }));
  assert.throws(() => parseDrawing({ strokes: Array.from({ length: 251 }, (_, i) => ({ ...stroke, strokeId: String(i) })) }));
  assert.throws(() => parseDrawing({ strokes: [{ ...stroke, points: Array.from({ length: 1001 }, () => ({ x: 0, y: 0 })) }] }));
  assert.throws(() => parseDrawing({ strokes: Array.from({ length: 13 }, (_, i) => ({ ...stroke, strokeId: String(i), points: Array.from({ length: 1000 }, () => ({ x: 0, y: 0 })) })) }));
});
test("DRAW_RELAY acknowledged draft survives detached persistence and submission locks it", () => {
  const saved = applyRelayAction(initial(), "p0", "first", { kind: "SAVE", drawing, expectedDraftRevision: 0 }, 1, "unused");
  const recovered = parseDrawRelayState(JSON.parse(JSON.stringify(saved)));
  assert.deepEqual(relayPrivateAssignment(recovered, "p0")!.draft, drawing);
  assert.deepEqual(relayPrivateAssignment(recovered, "p1")!.draft, empty);
  assert.throws(() => applyRelayAction(recovered, "p0", "first", { kind: "SAVE", drawing, expectedDraftRevision: 0 }, 1, "unused"));
  const submitted = applyRelayAction(recovered, "p0", "first", { kind: "DRAW", drawing }, 2, "unused");
  assert.throws(() => applyRelayAction(submitted, "p0", "first", { kind: "SAVE", drawing: empty, expectedDraftRevision: 1 }, 3, "unused"));
  recovered.drafts[0]!.drawing.strokes[0]!.points[0]!.x = 90;
  assert.equal(saved.drafts[0]!.drawing.strokes[0]!.points[0]!.x, 10);
});
test("DRAW_RELAY timeouts use canonical defaults, preserve submissions and apply offline streak", () => {
  let state = applyRelayAction(initial(6), "p0", "first", { kind: "DRAW", drawing }, 1, "next");
  state = timeoutRelay(state, state.stageToken, state.deadlineAt!, new Set(["p1"]), "s2");
  assert.equal(state.stageIndex, 2); assert.equal(state.players[1]!.offlineMissStreak, 1);
  assert.equal(state.players[0]!.offlineMissStreak, 0);
  assert.equal(state.books.flatMap(b => b.pages).filter(p => p.timedOut).length, 5);
  state = timeoutRelay(state, state.stageToken, state.deadlineAt!, new Set(["p1"]), "s3");
  assert.ok(state.books.every(b => b.pages[1]!.kind === "GUESS" && b.pages[1]!.text === "모르겠어요"));
  const resumed = resumeRelay(state, "p1"); assert.equal(resumed.players[1]!.offlineMissStreak, 0);
  state = timeoutRelay(state, state.stageToken, state.deadlineAt!, new Set(["p1"]), "s4");
  assert.equal(state.players[1]!.forfeited, true); assert.ok(state.submissions.includes("p1"));
});
test("DRAW_RELAY all leave terminates relay without removing seats, books or looping", () => {
  let state = initial(8);
  for (const actor of state.seatOrder) state = leaveRelay(state, actor, 2, "leave");
  assert.equal(state.phase, "REVEAL"); assert.equal(state.books.length, 8);
  assert.equal(state.books.every(b => b.pages.length === 8), true);
});
test("DRAW_RELAY validator rejects routing/page/version tampering", () => {
  const state = initial();
  assert.throws(() => parseDrawRelayState({ ...state, rulesVersion: "next" }));
  assert.throws(() => parseDrawRelayState({ ...state, seatOrder: ["p0", "p0", "p2", "p3"] }));
  assert.throws(() => parseDrawRelayState({ ...state, books: state.books.slice(1) }));
  assert.throws(() => parseDrawRelayState({ ...state, deadlineAt: 45000 }));
});
