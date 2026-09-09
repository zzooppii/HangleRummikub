import test from "node:test";
import assert from "node:assert/strict";
import * as v from "valibot";
import { SneakyClientCommandSchema, SneakyClassroomProjectionSchema, SneakyCountdownProjectionSchema, SneakyFinishedProjectionSchema } from "./index.js";
const base = { gameType: "SNEAKY_LUNCH", gameId: "game-one", gameRevision: 1, rulesVersion: "sneaky-lunch-rules-v1", settings: { lunchboxCount: 3, difficulty: "NORMAL" },
  requiredBites: 90, teacherStateRevision: 1, playerStates: [{ playerId: "p1", status: "ACTIVE", completedBites: 0 }, { playerId: "p2", status: "ACTIVE", completedBites: 0 }] };
test("SNEAKY strict concrete commands prohibit client bite amounts, time and future schedule", () => {
  const eat = { protocolVersion: 1, requestId: "eat-one", gameId: "game-one", kind: "sneaky:eat", teacherStateRevision: 1, payload: {} };
  assert.ok(v.safeParse(SneakyClientCommandSchema, eat).success);
  for (const payload of [{ bites: 30 }, { now: 0 }, { plannedOutcome: "FAKE" }]) assert.equal(v.safeParse(SneakyClientCommandSchema, { ...eat, payload }).success, false);
  for (const value of [-1, 1.5, Infinity]) assert.equal(v.safeParse(SneakyClientCommandSchema, { ...eat, teacherStateRevision: value }).success, false);
  for (const count of [0, 6]) assert.equal(v.safeParse(SneakyClientCommandSchema, { kind: "sneaky:configure", protocolVersion: 1, requestId: "config", expectedRoomRevision: 1, payload: { lunchboxCount: count, difficulty: "NORMAL" } }).success, false);
});
test("SNEAKY snapshots whitelist current state; all hidden plan keys rejected", () => {
  const classroom = { ...base, phase: "CLASSROOM", teacherState: "BOARD" };
  assert.ok(v.safeParse(SneakyClassroomProjectionSchema, classroom).success);
  for (const key of ["nextTransitionAt", "deadlineAt", "plannedOutcome", "seed", "consecutiveFakes", "transitionId", "lastAcceptedEatAt"]) {
    assert.equal(v.safeParse(SneakyClassroomProjectionSchema, { ...classroom, [key]: 123 }).success, false);
  }
  assert.ok(v.safeParse(SneakyCountdownProjectionSchema, { ...base, phase: "COUNTDOWN", teacherStateRevision: 0, countdownEndsAt: 3000 }).success);
  assert.equal(v.safeParse(SneakyCountdownProjectionSchema, { ...base, phase: "COUNTDOWN", teacherStateRevision: 0, countdownEndsAt: 3000, plannedOutcome: "REAL" }).success, false);
});
test("SNEAKY public result rejects false winner and teacher win with active participant", () => {
  const finished = { ...base, phase: "FINISHED", result: { reason: "TEACHER_WIN", winnerPlayerId: null } };
  assert.equal(v.safeParse(SneakyFinishedProjectionSchema, finished).success, false);
  assert.ok(v.safeParse(SneakyFinishedProjectionSchema, { ...finished, playerStates: base.playerStates.map(p => ({ ...p, status: "CAUGHT" })) }).success);
  assert.equal(v.safeParse(SneakyFinishedProjectionSchema, { ...finished, result: { reason: "PLAYER_FINISHED", winnerPlayerId: "p1" } }).success, false);
});
