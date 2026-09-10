import test from "node:test";
import assert from "node:assert/strict";
import { createSneakyLunch, parseSneakyLunchState, planTeacher, nextTeacherState, transitionTeacher,
  eatLunch, forfeitLunch, DIFFICULTY_TIMING, type Difficulty, type SneakyLunchState } from "../games/sneaky-lunch/domain/game.js";

function initial(n = 2, boxes = 3, difficulty: Difficulty = "NORMAL") {
  // Persisted v1 retains its original terminal semantics; v2 has separate regression coverage.
  return createSneakyLunch({ rulesVersion: "sneaky-lunch-rules-v1", gameId: "lunch", playerIds: Array.from({ length: n }, (_, i) => `p${i}`),
    settings: { lunchboxCount: boxes, difficulty }, now: 0, transitionId: "countdown" });
}
function advance(s: SneakyLunchState, fake = false) {
  return transitionTeacher(s, s.transitionId, s.nextTransitionAt!, `transition-${s.revision + 1}`,
    planTeacher(s.settings.difficulty, nextTeacherState(s), s.consecutiveFakes, { duration: 5000, band: 5000, outcome: fake ? 0 : 9999 }));
}
for (const n of [2, 3, 4, 5, 6, 7, 8]) test(`SNEAKY ${n} players / all lunchbox sizes / detached countdown`, () => {
  for (let boxes = 1; boxes <= 5; boxes++) {
    const s = initial(n, boxes); assert.equal(s.requiredBites, boxes * 30); assert.equal(s.nextTransitionAt, 3000);
    assert.equal(s.phase, "COUNTDOWN"); assert.equal(eatLunch(s, "p0", 0, 1).outcome, "INVALID_PHASE");
    const clone = parseSneakyLunchState(s); clone.players[0]!.status = "CAUGHT"; assert.equal(s.players[0]!.status, "ACTIVE");
  }
});
test("SNEAKY rejects invalid counts, settings and versions", () => {
  for (const n of [1, 9]) assert.throws(() => initial(n));
  for (const boxes of [0, 6, 1.5]) assert.throws(() => initial(2, boxes));
  assert.throws(() => parseSneakyLunchState({ ...initial(), rulesVersion: "future" }));
  assert.throws(() => parseSneakyLunchState({ ...initial(), settings: { lunchboxCount: 3, difficulty: "IMPOSSIBLE" } }));
});
for (const difficulty of ["EASY", "NORMAL", "HARD", "NIGHTMARE"] as const) test(`SNEAKY ${difficulty} bounded deterministic teacher plans`, () => {
  for (const teacher of ["BOARD", "SUSPICIOUS", "WATCHING", "RETURNING"] as const) {
    for (const roll of [0, 3333, 6666, 9999]) {
      const p = planTeacher(difficulty, teacher, 0, { duration: roll, band: roll, outcome: roll });
      const [min, max] = DIFFICULTY_TIMING[difficulty][teacher]; assert.ok(p.durationMs >= min && p.durationMs <= max);
      assert.equal(p.outcome !== null, teacher === "SUSPICIOUS");
    }
  }
  let s = initial(2, 1, difficulty);
  for (let i = 0; i < 100; i++) { s = advance(s, i % 3 !== 0); assert.ok(s.nextTransitionAt! > s.phaseStartedAt); }
  assert.equal(s.teacherStateRevision, 100);
});
test("SNEAKY nightmare forces real after two fakes; mixed bands and invalid plan rejected", () => {
  let s = advance(initial(2, 1, "NIGHTMARE"));
  for (let i = 0; i < 2; i++) { s = advance(s, true); assert.equal(s.plannedOutcome, "FAKE"); s = advance(s); }
  assert.equal(s.consecutiveFakes, 2); s = advance(s, true); assert.equal(s.plannedOutcome, "REAL");
  s = advance(s); assert.equal(s.teacherState, "WATCHING"); assert.equal(s.consecutiveFakes, 0);
  assert.throws(() => planTeacher("EASY", "BOARD", 0, { duration: 10000, band: 0, outcome: 0 }));
  assert.throws(() => transitionTeacher(s, s.transitionId, s.nextTransitionAt!, "other", { durationMs: 1, outcome: null }));
});
test("SNEAKY safe bites, exact 150ms cap and immutable no-op revisions", () => {
  const s = advance(initial()), before = JSON.stringify(s), first = eatLunch(s, "p0", 1, 3000);
  assert.equal(first.outcome, "ACCEPTED"); assert.equal(first.state.players[0]!.completedBites, 1); assert.equal(first.state.revision, s.revision + 1);
  assert.equal(JSON.stringify(s), before);
  const fast = eatLunch(first.state, "p0", 1, 3149); assert.equal(fast.outcome, "RATE_LIMITED"); assert.deepEqual(fast.state, first.state);
  assert.equal(eatLunch(first.state, "p0", 1, 3150).state.players[0]!.completedBites, 2);
  const suspicious = advance(first.state, true); assert.equal(eatLunch(suspicious, "p0", suspicious.teacherStateRevision, suspicious.phaseStartedAt).outcome, "ACCEPTED");
});
test("SNEAKY stale safe tap never catches; danger checks precede rate limit", () => {
  let s = advance(advance(advance(initial()))); assert.equal(s.teacherState, "WATCHING");
  const stale = eatLunch(s, "p0", s.teacherStateRevision - 1, s.phaseStartedAt); assert.equal(stale.outcome, "STALE"); assert.deepEqual(stale.state, s);
  s.players[0]!.completedBites = 1; s.players[0]!.lastAcceptedEatAt = s.phaseStartedAt - 1;
  const caught = eatLunch(s, "p0", s.teacherStateRevision, s.phaseStartedAt); assert.equal(caught.outcome, "CAUGHT");
  assert.equal(caught.state.players[0]!.completedBites, 1); assert.equal(caught.state.nextTransitionAt, s.nextTransitionAt);
  assert.equal(caught.state.phase, "CLASSROOM"); assert.equal(eatLunch(caught.state, "p0", s.teacherStateRevision, s.phaseStartedAt).outcome, "NOT_ACTIVE");
});
test("SNEAKY same window multiple catches, no survivor victory, all eliminated teacher win", () => {
  let s = advance(advance(advance(initial(3))));
  for (const id of ["p0", "p1"]) { s = eatLunch(s, id, s.teacherStateRevision, s.phaseStartedAt).state; assert.equal(s.phase, "CLASSROOM"); }
  s = eatLunch(s, "p2", s.teacherStateRevision, s.phaseStartedAt).state;
  assert.deepEqual(s.result, { reason: "TEACHER_WIN", winnerPlayerId: null }); assert.equal(s.nextTransitionAt, null);
});
test("SNEAKY RETURNING remains dangerous, then BOARD safe", () => {
  let s = advance(advance(advance(advance(initial())))); assert.equal(s.teacherState, "RETURNING");
  assert.equal(eatLunch(s, "p0", s.teacherStateRevision, s.phaseStartedAt).outcome, "CAUGHT");
  s = advance(s); assert.equal(s.teacherState, "BOARD"); assert.equal(eatLunch(s, "p0", s.teacherStateRevision, s.phaseStartedAt).outcome, "ACCEPTED");
});
test("SNEAKY final bite unique winner and later serialized tap rejected without score", () => {
  let s = advance(initial(2, 1, "EASY"));
  for (let i = 0; i < 29; i++) for (const id of ["p0", "p1"]) s = eatLunch(s, id, s.teacherStateRevision, 3000 + i * 150).state;
  const old = JSON.stringify(s); s = eatLunch(s, "p1", 1, 7350).state;
  assert.equal(s.result?.winnerPlayerId, "p1"); assert.equal(s.phase, "FINISHED"); assert.equal(s.nextTransitionAt, null);
  const late = eatLunch(s, "p0", 1, 7350); assert.equal(late.outcome, "INVALID_PHASE"); assert.deepEqual(late.state, s); assert.notEqual(JSON.stringify(s), old);
  assert.equal(s.players[0]!.completedBites, 29);
});
test("SNEAKY forfeit and terminal preservation, countdown elimination", () => {
  let s = initial(); s = forfeitLunch(s, "p0", 0); assert.equal(s.phase, "COUNTDOWN");
  s = forfeitLunch(s, "p1", 0); assert.equal(s.result?.reason, "TEACHER_WIN");
  assert.deepEqual(forfeitLunch(s, "p0", 1), s);
});
test("SNEAKY persistence plan exact, stale/early callbacks rejected, recovery advances once", () => {
  const s = advance(advance(initial(), true), true), restored = parseSneakyLunchState(JSON.parse(JSON.stringify(s)));
  assert.deepEqual(restored, s); assert.equal(restored.plannedOutcome, "FAKE");
  assert.throws(() => transitionTeacher(restored, "old", restored.nextTransitionAt!, "next", { durationMs: 3000, outcome: null }));
  assert.throws(() => transitionTeacher(restored, restored.transitionId, restored.nextTransitionAt! - 1, "next", { durationMs: 3000, outcome: null }));
  const next = advance(restored); assert.equal(next.teacherState, "BOARD"); assert.equal(next.revision, restored.revision + 1);
});
test("SNEAKY validator rejects negative/excess progress, duplicates and incoherent terminals", () => {
  const s = advance(initial());
  for (const bites of [-1, 91, 1.5]) assert.throws(() => parseSneakyLunchState({ ...s, players: [{ ...s.players[0], completedBites: bites }, s.players[1]] }));
  assert.throws(() => parseSneakyLunchState({ ...s, players: [s.players[0], s.players[0]] }));
  assert.throws(() => parseSneakyLunchState({ ...s, phase: "FINISHED" }));
  assert.throws(() => parseSneakyLunchState({ ...s, teacherStateRevision: -1 }));
  assert.throws(() => parseSneakyLunchState({ ...s, teacherState: "SAFE" }));
  assert.throws(() => parseSneakyLunchState({ ...s, phase: "FINISHED", nextTransitionAt: null, finishedAt: 3000, result: { reason: "TEACHER_WIN", winnerPlayerId: null } }));
  assert.throws(() => parseSneakyLunchState({ ...s, phase: "FINISHED", nextTransitionAt: null, finishedAt: 3000,
    players: [{ ...s.players[0], status: "CAUGHT", completedBites: 90, lastAcceptedEatAt: 3000 }, s.players[1]], result: { reason: "PLAYER_FINISHED", winnerPlayerId: "p0" } }));
});
