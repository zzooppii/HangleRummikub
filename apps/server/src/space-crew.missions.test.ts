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

test("missions 11–25 match audited counts, token graphics, communication and assignment modes", () => {
  // K pp.7–12, separately transcribed from the audited mission table.
  const expected = [
    [11, 4, ["1"], "FORBIDDEN_NOMINEE", "CHOOSE", "OBJECTIVES"],
    [12, 4, ["Ω"], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [13, 0, [], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [14, 4, [">", ">>", ">>>"], "DEAD_ZONE", "CHOOSE", "OBJECTIVES"],
    [15, 4, ["1", "2", "3", "4"], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [16, 0, [], "NORMAL", "CHOOSE", "EXHAUSTION"],
    [17, 2, [], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [18, 5, [], "D2", "CHOOSE", "OBJECTIVES"],
    [19, 5, ["1"], "D3", "CHOOSE", "OBJECTIVES"],
    [20, 2, [], "NORMAL", "COMMANDER_DECISION", "OBJECTIVES"],
    [21, 5, ["1", "2"], "DEAD_ZONE", "CHOOSE", "OBJECTIVES"],
    [22, 5, [">", ">>", ">>>", ">>>>"], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [23, 5, ["1", "2", "3", "4", "5"], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [24, 6, [], "NORMAL", "COMMANDER_DISTRIBUTION", "OBJECTIVES"],
    [25, 6, [">", ">>"], "DEAD_ZONE", "CHOOSE", "OBJECTIVES"],
  ];
  const actual = Array.from({ length: 15 }, (_, index) => {
    const definition = getSpaceCrewMission(index + 11);
    return [definition.missionNumber, definition.taskCount,
      definition.tokens.map(token => token.kind === "LAST" ? "Ω" : token.kind === "ABSOLUTE" ? String(token.position) : ">".repeat(token.position)),
      definition.communicationRule.kind === "DISRUPTION" ? `D${definition.communicationRule.fromTrick}` : definition.communicationRule.kind,
      definition.taskMode, definition.endPolicy];
  });
  assert.deepEqual(actual, expected);
});

test("missions 26–50 match the remaining audited logbook matrix", () => {
  // K pp.12–21. Ω is a task order marker; mission 48 adds a last-trick condition.
  const expected = [
    [26, 0, [], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [27, 3, [], "NORMAL", "COMMANDER_DECISION", "OBJECTIVES"],
    [28, 6, ["1", "Ω"], "D3", "CHOOSE", "OBJECTIVES"],
    [29, 0, [], "DEAD_ZONE", "CHOOSE", "EXHAUSTION"],
    [30, 6, [">", ">>", ">>>"], "D2", "CHOOSE", "OBJECTIVES"],
    [31, 6, ["1", "2", "3"], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [32, 7, [], "NORMAL", "COMMANDER_DISTRIBUTION", "OBJECTIVES"],
    [33, 0, [], "NORMAL", "CHOOSE", "EXHAUSTION"],
    [34, 0, [], "NORMAL", "CHOOSE", "EXHAUSTION"],
    [35, 7, [">", ">>", ">>>"], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [36, 7, ["1", "2"], "NORMAL", "COMMANDER_DISTRIBUTION", "OBJECTIVES"],
    [37, 4, [], "NORMAL", "COMMANDER_DECISION", "OBJECTIVES"],
    [38, 8, [], "D3", "CHOOSE", "OBJECTIVES"],
    [39, 8, [">", ">>", ">>>"], "DEAD_ZONE", "CHOOSE", "OBJECTIVES"],
    [40, 8, ["1", "2", "3"], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [41, 0, [], "NORMAL", "CHOOSE", "EXHAUSTION"],
    [42, 9, [], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [43, 9, [], "NORMAL", "COMMANDER_DISTRIBUTION", "OBJECTIVES"],
    [44, 0, [], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [45, 9, [">", ">>", ">>>"], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [46, 0, [], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [47, 10, [], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [48, 3, ["Ω"], "NORMAL", "CHOOSE", "EXHAUSTION"],
    [49, 10, [">", ">>", ">>>"], "NORMAL", "CHOOSE", "OBJECTIVES"],
    [50, 0, [], "NORMAL", "CHOOSE", "EXHAUSTION"],
  ];
  const actual = Array.from({ length: 25 }, (_, index) => {
    const definition = getSpaceCrewMission(index + 26);
    return [definition.missionNumber, definition.taskCount,
      definition.tokens.map(token => token.kind === "LAST" ? "Ω" : token.kind === "ABSOLUTE" ? String(token.position) : ">".repeat(token.position)),
      definition.communicationRule.kind === "DISRUPTION" ? `D${definition.communicationRule.fromTrick}` : definition.communicationRule.kind,
      definition.taskMode, definition.endPolicy];
  });
  assert.deepEqual(actual, expected);
});

test("missions 33 and 41 use readiness answers, exclude commander and prohibit rocket wins separately", () => {
  for (const number of [33, 41]) {
    const definition = getSpaceCrewMission(number);
    assert.deepEqual(definition.setup, { kind: "SELECT_RESTRICTED_TRICKS_PLAYER", answers: ["YES", "NO"], allowCommander: false });
    assert.equal(definition.endPolicy, "EXHAUSTION");
    assert.equal(definition.taskCount, 0);
    assert.ok(Object.isFrozen(definition.setup));
    if (definition.setup.kind === "SELECT_RESTRICTED_TRICKS_PLAYER") assert.ok(Object.isFrozen(definition.setup.answers));
  }
  assert.deepEqual(getSpaceCrewMission(33).objective, { kind: "NOMINEE_SINGLE_TRICK_NO_ROCKET" });
  assert.deepEqual(getSpaceCrewMission(41).objective, { kind: "NOMINEE_FIRST_LAST_NO_ROCKET" });
});

test("missions 26, 29, 34 and 44 preserve distinct wins, prefix balance and ascending rockets", () => {
  assert.deepEqual(getSpaceCrewMission(26).objective, { kind: "COLOR_VALUE_WINS", value: 1, count: 2 });
  assert.deepEqual(getSpaceCrewMission(29).objective, { kind: "BALANCED_WINS", maxDifference: 1 });
  assert.deepEqual(getSpaceCrewMission(34).objective, { kind: "BALANCED_WITH_COMMANDER_FIRST_LAST", maxDifference: 1 });
  assert.deepEqual(getSpaceCrewMission(44).objective, { kind: "ROCKET_WINS", ascending: true });
});

test("missions 46 and 50 expose only their concrete setup facts and allowed role preferences", () => {
  const pink = getSpaceCrewMission(46);
  assert.deepEqual(pink.setup, { kind: "REVEAL_PINK_NINE_HOLDER" });
  assert.deepEqual(pink.objective, { kind: "FIXED_PLAYER_CAPTURE_PINK" });
  assert.equal(pink.endPolicy, "OBJECTIVES");
  const roles = getSpaceCrewMission(50);
  assert.deepEqual(roles.setup, { kind: "ASSIGN_TRICK_ROLES", preferences: ["FIRST_FOUR", "MIDDLE", "LAST"] });
  assert.deepEqual(roles.objective, { kind: "ASSIGNED_TRICK_ROLES" });
  assert.equal(roles.endPolicy, "EXHAUSTION");
  assert.ok(Object.isFrozen(roles.setup));
  if (roles.setup.kind === "ASSIGN_TRICK_ROLES") assert.ok(Object.isFrozen(roles.setup.preferences));
});

test("mission 48 adds the final trick requirement rather than treating Omega as an ordinary last task", () => {
  assert.deepEqual(getSpaceCrewMission(48).objective, { kind: "TASKS_LAST_TRICK_OMEGA" });
  assert.equal(getSpaceCrewMission(48).endPolicy, "EXHAUSTION");
  for (const number of [7, 12, 28]) {
    assert.deepEqual(getSpaceCrewMission(number).objective, { kind: "TASKS" });
    assert.equal(getSpaceCrewMission(number).endPolicy, "OBJECTIVES");
  }
});

test("all fifty missions are present with the exact exhaustion and gold-framed task groups", () => {
  const definitions = Array.from({ length: 50 }, (_, index) => getSpaceCrewMission(index + 1));
  assert.deepEqual(definitions.map(definition => definition.missionNumber), Array.from({ length: 50 }, (_, index) => index + 1));
  assert.deepEqual(definitions.filter(definition => definition.endPolicy === "EXHAUSTION").map(definition => definition.missionNumber), [5, 16, 29, 33, 34, 41, 48, 50]);
  assert.deepEqual(definitions.filter(definition => definition.missionNumber >= 25 && definition.taskCount > 0).map(definition => definition.missionNumber),
    [25, 27, 28, 30, 31, 32, 35, 36, 37, 38, 39, 40, 42, 43, 45, 47, 48, 49]);
  for (const number of [27, 28, 30, 31, 32, 35, 36, 37, 38, 39, 40, 42, 43, 45, 47, 49]) {
    assert.deepEqual(getSpaceCrewMission(number).objective, { kind: "TASKS" });
    assert.deepEqual(getSpaceCrewMission(number).setup, { kind: "NONE" });
  }
});

test("mission 11 appoints a crew member including the commander without inventing a response step", () => {
  const definition = getSpaceCrewMission(11);
  assert.deepEqual(definition.setup, { kind: "SELECT_NO_COMMUNICATION_PLAYER", allowCommander: true });
  assert.deepEqual(definition.communicationRule, { kind: "FORBIDDEN_NOMINEE" });
  assert.deepEqual(definition.objective, { kind: "TASKS" });
  assert.ok(Object.isFrozen(definition.setup));
});

test("missions 13, 16 and 17 distinguish immediate rocket completion from continuous forbidden-nine conditions", () => {
  assert.deepEqual(getSpaceCrewMission(13).objective, { kind: "ROCKET_WINS", ascending: false });
  assert.equal(getSpaceCrewMission(13).endPolicy, "OBJECTIVES");
  assert.deepEqual(getSpaceCrewMission(16).objective, { kind: "FORBID_WIN_VALUE", value: 9 });
  assert.equal(getSpaceCrewMission(16).endPolicy, "EXHAUSTION");
  assert.deepEqual(getSpaceCrewMission(17).objective, { kind: "TASKS_WITH_FORBID_WIN_VALUE", value: 9 });
  assert.equal(getSpaceCrewMission(17).endPolicy, "OBJECTIVES");
  for (let number = 12; number <= 25; number += 1) assert.deepEqual(getSpaceCrewMission(number).setup, { kind: "NONE" });
  for (const number of [12, 14, 15, 18, 19, 20, 21, 22, 23, 24, 25]) assert.deepEqual(getSpaceCrewMission(number).objective, { kind: "TASKS" });
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
  for (const invalid of [0, -1, 51, 100, 1.5, "1", NaN, Infinity, null, undefined, {}, { missionNumber: 1 }]) {
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
  for (let number = 1; number <= 50; number += 1) {
    const definition = getSpaceCrewMission(number);
    const state = createSpaceCrewTaskState({ missionNumber: number, taskDeck, playerIds, commanderId,
      taskCount: definition.taskCount, tokens: definition.tokens, mode: definition.taskMode });
    assert.deepEqual(state.tasks.map(task => task.id), taskDeck.slice(0, definition.taskCount).map(task => task.id));
    assert.deepEqual(state.tasks.map(task => task.token), state.tasks.map((_, index) => definition.tokens[index] ?? null));
    assert.equal(state.phase, definition.taskCount === 0 ? "READY" : definition.taskMode === "CHOOSE" ? "CHOOSE" : "RESPOND");
  }
});
