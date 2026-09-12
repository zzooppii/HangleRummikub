import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { PlayerIdSchema } from "@hangul-rummikub/shared";
import { createSpaceCrewDeck } from "./games/space-crew/domain/cards.js";
import { createSpaceCrewTaskState } from "./games/space-crew/domain/tasks.js";
import {
  createSpaceCrewTaskDeck, getSpaceCrewMission, parseSpaceCrewTaskDeck, shuffleSpaceCrewTaskDeck,
} from "./games/space-crew/domain/missions.js";

function deck() {
  let id = 0;
  return createSpaceCrewTaskDeck(() => `objective-${++id}`);
}

test("missions 1–10 match the independently transcribed audited logbook matrix", () => {
  // K pp.4–7, task count / order symbols / communication / end policy.
  const expected = [
    [1, 1, [], "NORMAL", "OBJECTIVES"],
    [2, 2, [], "NORMAL", "OBJECTIVES"],
    [3, 2, ["1", "2"], "NORMAL", "OBJECTIVES"],
    [4, 3, [], "NORMAL", "OBJECTIVES"],
    [5, 0, [], "NORMAL", "EXHAUSTION"],
    [6, 3, [">", ">>"], "DEAD_ZONE", "OBJECTIVES"],
    [7, 3, ["Ω"], "NORMAL", "OBJECTIVES"],
    [8, 3, ["1", "2", "3"], "NORMAL", "OBJECTIVES"],
    [9, 0, [], "NORMAL", "OBJECTIVES"],
    [10, 4, [], "NORMAL", "OBJECTIVES"],
  ];
  const actual = Array.from({ length: 10 }, (_, index) => {
    const definition = getSpaceCrewMission(index + 1);
    assert.equal(definition.taskMode, "CHOOSE");
    return [definition.missionNumber, definition.taskCount,
      definition.tokens.map(token => token.kind === "LAST" ? "Ω" : token.kind === "ABSOLUTE" ? String(token.position) : ">".repeat(token.position)),
      definition.communicationRule.kind, definition.endPolicy];
  });
  assert.deepEqual(actual, expected);
});

test("mission 5 requires a good/bad report and nomination, permits commander, and waits for exhaustion", () => {
  const definition = getSpaceCrewMission(5);
  assert.deepEqual(definition.setup, { kind: "SELECT_NO_TRICKS_PLAYER", answers: ["GOOD", "BAD"], allowCommander: true });
  assert.deepEqual(definition.objective, { kind: "NOMINEE_NO_TRICKS" });
  assert.equal(definition.endPolicy, "EXHAUSTION");
  assert.equal(definition.taskCount, 0);
});

test("mission 9 requires a winning color one and can finish before exhaustion", () => {
  const definition = getSpaceCrewMission(9);
  assert.deepEqual(definition.objective, { kind: "COLOR_VALUE_WINS", value: 1, count: 1 });
  assert.deepEqual(definition.setup, { kind: "NONE" });
  assert.equal(definition.endPolicy, "OBJECTIVES");
  for (const number of [1, 2, 3, 4, 6, 7, 8, 10]) {
    assert.deepEqual(getSpaceCrewMission(number).objective, { kind: "TASKS" });
    assert.deepEqual(getSpaceCrewMission(number).setup, { kind: "NONE" });
  }
});

test("mission lookup rejects unsupported groups and input coercion, returning detached frozen definitions", () => {
  for (const invalid of [0, -1, 11, 50, 1.5, "1", NaN, Infinity, null, undefined, {}, { missionNumber: 1 }]) {
    assert.throws(() => getSpaceCrewMission(invalid));
  }
  const first = getSpaceCrewMission(3), second = getSpaceCrewMission(3);
  assert.deepEqual(first, second);
  assert.notEqual(first, second);
  assert.notEqual(first.tokens, second.tokens);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.tokens));
  assert.ok(first.tokens.every(Object.isFrozen));
  assert.ok(Object.isFrozen(first.communicationRule));
  assert.ok(Object.isFrozen(first.objective));
  assert.ok(Object.isFrozen(first.setup));
  const setup = getSpaceCrewMission(5).setup;
  assert.equal(setup.kind, "SELECT_NO_TRICKS_PLAYER");
  if (setup.kind === "SELECT_NO_TRICKS_PLAYER") assert.ok(Object.isFrozen(setup.answers));
});

test("task deck contains all 36 independently identified color faces and no playing-card references", () => {
  let id = 0;
  const generateId = () => `opaque-${++id}`;
  const cards = createSpaceCrewDeck(generateId);
  const tasks = createSpaceCrewTaskDeck(generateId);
  assert.equal(id, 76);
  assert.equal(tasks.length, 36);
  assert.equal(new Set(tasks.map(task => task.id)).size, 36);
  for (const suit of ["PINK", "BLUE", "GREEN", "YELLOW"]) {
    assert.deepEqual(tasks.filter(task => task.suit === suit).map(task => task.value), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  }
  const playingIds = new Set(cards.map(card => card.cardId));
  assert.ok(tasks.every(task => !playingIds.has(task.id)));
  assert.ok(tasks.every(task => Object.keys(task).sort().join(",") === "id,suit,value"));
  assert.ok(Object.isFrozen(tasks));
  assert.ok(tasks.every(Object.isFrozen));
});

test("task deck parser rejects duplicate faces/IDs, missing faces, rockets and extra private fields", () => {
  const tasks = deck();
  const first = tasks[0];
  assert.ok(first);
  const second = tasks[1];
  assert.ok(second);
  for (const invalid of [
    tasks.slice(1), [...tasks, first],
    [{ ...first, id: second.id }, ...tasks.slice(1)],
    [{ ...first, suit: second.suit, value: second.value }, ...tasks.slice(1)],
    [{ ...first, suit: "ROCKET" }, ...tasks.slice(1)],
    [{ ...first, value: 10 }, ...tasks.slice(1)],
    [{ ...first, id: "" }, ...tasks.slice(1)],
    [{ ...first, cardId: "private-card" }, ...tasks.slice(1)],
  ]) assert.throws(() => parseSpaceCrewTaskDeck(invalid));
  assert.throws(() => createSpaceCrewTaskDeck(() => "reused"));
  const parsed = parseSpaceCrewTaskDeck(tasks);
  assert.deepEqual(parsed, tasks);
  assert.notEqual(parsed, tasks);
  assert.notEqual(parsed[0], tasks[0]);
});

test("task shuffle uses its injected RNG, preserves independent identities and leaves input unchanged", () => {
  const tasks = deck();
  const before = structuredClone(tasks);
  const ranges: number[] = [];
  const shuffled = shuffleSpaceCrewTaskDeck(tasks, { nextInt: max => { ranges.push(max); return 0; } });
  assert.deepEqual(ranges, Array.from({ length: 35 }, (_, index) => 36 - index));
  assert.deepEqual(shuffled.map(task => task.id), [...tasks.slice(1), tasks[0]].map(task => task?.id));
  assert.deepEqual(tasks, before);
  assert.deepEqual(new Set(shuffled.map(task => task.id)), new Set(tasks.map(task => task.id)));
  assert.ok(Object.isFrozen(shuffled));
  assert.ok(shuffled.every(Object.isFrozen));
  for (const value of [-1, 36, 0.5, NaN]) assert.throws(() => shuffleSpaceCrewTaskDeck(tasks, { nextInt: () => value }));
});

test("each definition creates the audited task prefix with order tokens on the first corresponding cards", () => {
  const taskDeck = deck();
  const playerIds = ["mission-a", "mission-b", "mission-c"].map(id => v.parse(PlayerIdSchema, id));
  const commanderId = playerIds[0];
  assert.ok(commanderId);
  for (let number = 1; number <= 10; number += 1) {
    const definition = getSpaceCrewMission(number);
    const state = createSpaceCrewTaskState({ missionNumber: number, taskDeck, playerIds, commanderId,
      taskCount: definition.taskCount, tokens: definition.tokens, mode: definition.taskMode });
    assert.deepEqual(state.tasks.map(task => task.id), taskDeck.slice(0, definition.taskCount).map(task => task.id));
    assert.deepEqual(state.tasks.map(task => task.token), state.tasks.map((_, index) => definition.tokens[index] ?? null));
    assert.equal(state.phase, definition.taskCount === 0 ? "READY" : "CHOOSE");
  }
});
