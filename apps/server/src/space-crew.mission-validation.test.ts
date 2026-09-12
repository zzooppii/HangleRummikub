import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { PlayerIdSchema } from "@hangul-rummikub/shared";
import { createSpaceCrewDeck } from "./games/space-crew/domain/cards.js";
import {
  createSpaceCrewMissionState, parseSpaceCrewMissionState, applySpaceCrewMissionAction,
} from "./games/space-crew/domain/mission.js";
import type { SpaceCrewTaskFace } from "./games/space-crew/domain/tasks.js";

function initial(missionNumber = 1) {
  let serial = 0;
  const deck = createSpaceCrewDeck(() => `physical-${++serial}`);
  const taskDeck: SpaceCrewTaskFace[] = deck.flatMap(card => card.kind === "COLOR"
    ? [{ id: `goal-${++serial}`, suit: card.suit, value: card.value }] : []);
  return createSpaceCrewMissionState({ missionNumber, deck, taskDeck,
    playerIds: ["a", "b", "c"].map(id => v.parse(PlayerIdSchema, id)) });
}

test("SPACE_CREW mission validation: detached parser and canonical mission configuration", () => {
  const state = initial(3);
  const before = structuredClone(state);
  const parsed = parseSpaceCrewMissionState(state);
  parsed.trick.players[0]?.hand.pop();
  assert.deepEqual(state, before);
  assert.throws(() => parseSpaceCrewMissionState({ ...state, missionNumber: 2 }));
  assert.throws(() => parseSpaceCrewMissionState({ ...state, missionNumber: 51 }));
  assert.throws(() => parseSpaceCrewMissionState({ ...state, rules: { taskCount: 0 } }));
});

test("SPACE_CREW mission validation: forged terminal states and unrelated seat sets reject", () => {
  const state = initial();
  for (const status of ["ACTIVE", "SUCCESS", "FAILURE"]) {
    assert.throws(() => parseSpaceCrewMissionState({ ...state, status }));
  }
  const swapped = structuredClone(state);
  swapped.tasks.playerIds.reverse();
  assert.throws(() => parseSpaceCrewMissionState(swapped));
  const forged = structuredClone(state);
  forged.tasks.missionNumber = 2;
  assert.throws(() => parseSpaceCrewMissionState(forged));
});

test("SPACE_CREW mission validation: global revision cannot be forged independently", () => {
  const state = initial(9);
  assert.throws(() => parseSpaceCrewMissionState({ ...state, revision: 1 }));
  const trickOnly = structuredClone(state);
  trickOnly.trick.revision += 1;
  assert.throws(() => parseSpaceCrewMissionState(trickOnly));
});

test("SPACE_CREW mission validation: failed commands do not mutate any component", () => {
  const state = initial();
  const actor = state.trick.commanderId;
  const goal = state.tasks.tasks[0];
  assert.ok(goal);
  const actions: unknown[] = [
    null,
    { kind: "TASK", action: { kind: "CHOOSE", taskId: goal.id, expectedRevision: 0 }, expectedRevision: 0 },
    { kind: "TASK", action: { kind: "CHOOSE", taskId: goal.id }, expectedRevision: 1 },
    { kind: "PLAY", cardId: "missing", expectedRevision: 0 },
    { kind: "DISTRESS", action: { kind: "PROPOSE", direction: "LEFT" }, expectedRevision: 0 },
    { kind: "COMMUNICATE", cardId: "missing", mark: "ONLY", assignmentComplete: true, expectedRevision: 0 },
  ];
  for (const action of actions) {
    const before = structuredClone(state);
    assert.equal(applySpaceCrewMissionAction(state, actor, action).ok, false);
    assert.deepEqual(state, before);
  }
});

test("SPACE_CREW mission validation: mission five special choice cannot be silently skipped", () => {
  const state = initial(5);
  assert.throws(() => parseSpaceCrewMissionState({ ...state, special: { kind: "NONE" } }));
  assert.throws(() => parseSpaceCrewMissionState({ ...state, status: "ACTIVE" }));
  const result = applySpaceCrewMissionAction(state, state.trick.commanderId, {
    kind: "SPECIAL_SELECT", playerId: state.trick.commanderId, expectedRevision: state.revision,
  });
  assert.equal(result.ok, false, "responses must finish before the commander selects");
});
