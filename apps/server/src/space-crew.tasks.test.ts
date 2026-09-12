import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { createSpaceCrewDeck, dealSpaceCrewCards, SPACE_CREW_COLORS, type SpaceCrewCard, type SpaceCrewSuit } from "./games/space-crew/domain/cards.js";
import { createSpaceCrewTrickState, legalSpaceCrewCardIds, playSpaceCrewCard, type SpaceCrewCompletedTrick, type SpaceCrewTrickState } from "./games/space-crew/domain/trick.js";
import { applySpaceCrewTaskAction, createSpaceCrewTaskState, evaluateSpaceCrewTaskBatch, parseSpaceCrewTaskState, spaceCrewTaskPrompt, visibleSpaceCrewTaskIds, type SpaceCrewTaskFace, type SpaceCrewTaskSetup, type SpaceCrewTaskState, type SpaceCrewTaskToken } from "./games/space-crew/domain/tasks.js";

const players = Array.from({ length: 5 }, (_, index) => v.parse(PlayerIdSchema, `crew-${index}`));
const outsider = v.parse(PlayerIdSchema, "outsider");
type Face = readonly [SpaceCrewSuit, number];
function player(index: number): PlayerId { const value = players[index]; assert.ok(value); return value; }
function taskDeck(): SpaceCrewTaskFace[] {
  return SPACE_CREW_COLORS.flatMap(suit => Array.from({ length: 9 }, (_, index) => ({ id: `goal-${suit}-${index + 1}`, suit, value: v.parse(v.picklist([1, 2, 3, 4, 5, 6, 7, 8, 9]), index + 1) })));
}
function environment(count = 3): { cards: readonly SpaceCrewCard[]; trick: SpaceCrewTrickState } {
  let serial = 0;
  const cards = [...createSpaceCrewDeck(() => `opaque-${++serial}`)];
  const first = cards[0], last = cards[39];
  assert.ok(first && last);
  cards[0] = last; cards[39] = first;
  return { cards, trick: createSpaceCrewTrickState(dealSpaceCrewCards(cards, players.slice(0, count))) };
}
function create(count = 3, taskCount = 3, mode: SpaceCrewTaskState["mode"] = "CHOOSE", tokens: readonly SpaceCrewTaskToken[] = [], missionNumber = 1) {
  const env = environment(count);
  const setup: SpaceCrewTaskSetup = { missionNumber, playerIds: players.slice(0, count), commanderId: player(0), mode, taskDeck: taskDeck(), taskCount, tokens };
  return { ...env, state: createSpaceCrewTaskState(setup), setup };
}
function taskId(state: SpaceCrewTaskState, index: number): string { const task = state.tasks[index]; assert.ok(task); return task.id; }
function action(state: SpaceCrewTaskState, trick: SpaceCrewTrickState, actor: PlayerId, command: Record<string, unknown>): SpaceCrewTaskState {
  const before = structuredClone(state), beforeTrick = structuredClone(trick);
  const result = applySpaceCrewTaskAction(state, actor, { ...command, expectedRevision: state.revision }, trick);
  assert.ok(result.ok, result.ok ? "" : result.reason);
  assert.deepEqual(state, before); assert.deepEqual(trick, beforeTrick);
  assert.equal(result.state.revision, state.revision + 1);
  return result.state;
}
function chooseAll(input: SpaceCrewTaskState, trick: SpaceCrewTrickState): SpaceCrewTaskState {
  let state = input;
  while (state.phase === "CHOOSE") {
    const next = state.tasks.find(task => task.ownerId === null), actor = spaceCrewTaskPrompt(state).activePlayerId;
    assert.ok(next && actor);
    state = action(state, trick, actor, { kind: "CHOOSE", taskId: next.id });
  }
  return state;
}
function respondAll(input: SpaceCrewTaskState, trick: SpaceCrewTrickState): SpaceCrewTaskState {
  let state = input;
  while (state.phase === "RESPOND") {
    const prompt = spaceCrewTaskPrompt(state); assert.ok(prompt.activePlayerId);
    state = action(state, trick, prompt.activePlayerId, { kind: "RESPOND", taskId: prompt.taskId, answer: false });
  }
  return state;
}
function assignNext(input: SpaceCrewTaskState, trick: SpaceCrewTrickState, recipient: PlayerId): SpaceCrewTaskState {
  const state = respondAll(input, trick);
  return action(state, trick, state.commanderId, { kind: "ASSIGN", taskId: spaceCrewTaskPrompt(state).taskId, toPlayerId: recipient });
}
function batchFixture(faces: readonly Face[], tokens: readonly SpaceCrewTaskToken[] = []) {
  const env = create(5, faces.length, "COMMANDER_DECISION", tokens, 37);
  const ordered = faces.map(([suit, value]) => { const face = env.setup.taskDeck.find(task => task.suit === suit && task.value === value); assert.ok(face); return face; });
  const chosen = new Set(ordered.map(face => face.id));
  const state = createSpaceCrewTaskState({ ...env.setup, taskDeck: [...ordered, ...env.setup.taskDeck.filter(face => !chosen.has(face.id))] });
  return { ...env, state: assignNext(state, env.trick, player(1)) };
}
function completed(cards: readonly SpaceCrewCard[], faces: readonly Face[], number = 1, winner = player(1)): SpaceCrewCompletedTrick {
  return { number, leaderId: player(0), winnerId: winner, plays: faces.map(([suit, value], index) => {
    const card = cards.find(card => card.suit === suit && card.value === value); assert.ok(card);
    return { playerId: player(index), cardId: card.cardId };
  }) };
}
function evaluate(state: SpaceCrewTaskState, trick: SpaceCrewCompletedTrick, cards: readonly SpaceCrewCard[]): SpaceCrewTaskState {
  const before = structuredClone(state), beforeTrick = structuredClone(trick);
  const result = evaluateSpaceCrewTaskBatch(state, trick, cards);
  assert.ok(result.ok, result.ok ? "" : result.reason);
  assert.deepEqual(state, before); assert.deepEqual(trick, beforeTrick);
  assert.equal(result.state.revision, state.revision + 1);
  return result.state;
}

test("Space Crew tasks: full unique 36-face deck, exact drawn limit and detached setup", () => {
  const env = create(3, 10);
  assert.equal(env.state.tasks.length, 10);
  assert.deepEqual(env.state.tasks.map(task => task.id), env.setup.taskDeck.slice(0, 10).map(task => task.id));
  assert.deepEqual(visibleSpaceCrewTaskIds(env.state), env.state.tasks.map(task => task.id));
  assert.equal(create(3, 0).state.phase, "READY");
  const first = env.setup.taskDeck[0], second = env.setup.taskDeck[1]; assert.ok(first && second);
  for (const invalid of [
    { ...env.setup, taskCount: 11 }, { ...env.setup, taskCount: -1 },
    { ...env.setup, taskDeck: env.setup.taskDeck.slice(1) },
    { ...env.setup, taskDeck: [first, { ...second, id: first.id }, ...env.setup.taskDeck.slice(2)] },
    { ...env.setup, taskDeck: [first, { ...second, suit: first.suit, value: first.value }, ...env.setup.taskDeck.slice(2)] },
    { ...env.setup, commanderId: outsider }, { ...env.setup, playerIds: [player(0), player(0), player(1)] },
    { ...env.setup, taskCount: 0, tokens: [{ kind: "LAST" }] },
  ] satisfies SpaceCrewTaskSetup[]) assert.throws(() => createSpaceCrewTaskState(invalid));
  assert.throws(() => createSpaceCrewTaskState({ ...env.setup, tokens: [{ kind: "LAST" }, { kind: "LAST" }] }));
  assert.throws(() => createSpaceCrewTaskState({ ...env.setup, tokens: [{ kind: "ABSOLUTE", position: 1 }, { kind: "ABSOLUTE", position: 1 }] }));
  const state = createSpaceCrewTaskState(env.setup); const task = state.tasks[0]; assert.ok(task); task.id = "edited-copy";
  assert.equal(env.setup.taskDeck[0]?.id, first.id);
});

test("Space Crew tasks: ordinary choices start with commander and keep card/token pairs", () => {
  for (const count of [3, 4, 5]) {
    const env = create(count, 8, "CHOOSE", [{ kind: "ABSOLUTE", position: 1 }]);
    let state = env.state;
    const selected: string[] = [];
    for (let index = 0; index < 8; index += 1) {
      const task = state.tasks.filter(task => task.ownerId === null).at(-1); assert.ok(task);
      assert.equal(spaceCrewTaskPrompt(state).activePlayerId, player(index % count));
      selected.push(task.id);
      state = action(state, env.trick, player(index % count), { kind: "CHOOSE", taskId: task.id });
      assert.equal(state.tasks.find(candidate => candidate.id === task.id)?.ownerId, player(index % count));
    }
    assert.equal(state.phase, "READY"); assert.deepEqual(state.selectionOrder, selected);
    assert.deepEqual(state.tasks[0]?.token, { kind: "ABSOLUTE", position: 1 });
  }
});

test("Space Crew tasks: hidden commander decision asks only others and can select a no responder", () => {
  const env = create(4, 3, "COMMANDER_DECISION", [], 20);
  let state = env.state;
  assert.deepEqual(visibleSpaceCrewTaskIds(state), []);
  assert.deepEqual(spaceCrewTaskPrompt(state), { taskId: null, activePlayerId: player(1) });
  assert.deepEqual(applySpaceCrewTaskAction(state, player(0), { kind: "RESPOND", taskId: null, answer: true, expectedRevision: 0 }, env.trick), { ok: false, reason: "NOT_YOUR_TURN" });
  assert.deepEqual(applySpaceCrewTaskAction(state, player(1), { kind: "RESPOND", taskId: taskId(state, 0), answer: true, expectedRevision: 0 }, env.trick), { ok: false, reason: "INVALID_TASK" });
  state = respondAll(state, env.trick);
  assert.equal(state.phase, "ASSIGN"); assert.equal(state.responses.length, 3);
  assert.deepEqual(visibleSpaceCrewTaskIds(state), []);
  assert.deepEqual(applySpaceCrewTaskAction(state, player(0), { kind: "ASSIGN", taskId: null, toPlayerId: player(0), expectedRevision: state.revision }, env.trick), { ok: false, reason: "INVALID_RECIPIENT" });
  state = action(state, env.trick, player(0), { kind: "ASSIGN", taskId: null, toPlayerId: player(2) });
  assert.equal(state.phase, "READY"); assert.ok(state.tasks.every(task => task.ownerId === player(2)));
  assert.deepEqual(visibleSpaceCrewTaskIds(state), state.tasks.map(task => task.id)); assert.deepEqual(state.responses, []);
});

test("Space Crew tasks: commander distribution reveals one at a time and balances at completion", () => {
  const env = create(3, 6, "COMMANDER_DISTRIBUTION", [{ kind: "ABSOLUTE", position: 1 }, { kind: "ABSOLUTE", position: 2 }], 24);
  let state = env.state;
  assert.deepEqual(visibleSpaceCrewTaskIds(state), [taskId(state, 0)]);
  state = assignNext(state, env.trick, player(0));
  assert.deepEqual(visibleSpaceCrewTaskIds(state), [taskId(state, 0), taskId(state, 1)]);
  state = assignNext(state, env.trick, player(0));
  assert.deepEqual(state.tasks.map(task => task.ownerId), [player(0), player(0), null, null, null, null]);
  const prompted = respondAll(state, env.trick), before = structuredClone(prompted);
  assert.deepEqual(applySpaceCrewTaskAction(prompted, player(0), { kind: "ASSIGN", taskId: taskId(state, 2), toPlayerId: player(0), expectedRevision: prompted.revision }, env.trick), { ok: false, reason: "UNBALANCED_DISTRIBUTION" });
  assert.deepEqual(prompted, before);
  for (const recipient of [player(1), player(1), player(2), player(2)]) state = assignNext(state, env.trick, recipient);
  assert.equal(state.phase, "READY");
  assert.deepEqual(players.slice(0, 3).map(id => state.tasks.filter(task => task.ownerId === id).length), [2, 2, 2]);
  assert.deepEqual(state.tasks[0]?.token, { kind: "ABSOLUTE", position: 1 });
  assert.deepEqual(state.tasks[1]?.token, { kind: "ABSOLUTE", position: 2 });
});

test("Space Crew tasks: distribution rejects assignments that make eventual balance impossible", () => {
  const env = create(3, 7, "COMMANDER_DISTRIBUTION", [], 32);
  let state = env.state;
  for (const recipient of [player(0), player(0), player(0), player(1), player(1)]) state = assignNext(state, env.trick, recipient);
  state = respondAll(state, env.trick);
  assert.deepEqual(applySpaceCrewTaskAction(state, player(0), { kind: "ASSIGN", taskId: taskId(state, 5), toPlayerId: player(1), expectedRevision: state.revision }, env.trick), { ok: false, reason: "UNBALANCED_DISTRIBUTION" });
});

test("Space Crew tasks: response actor, current task, strict shape and revision are enforced", () => {
  const env = create(3, 3, "COMMANDER_DISTRIBUTION", [], 24), state = env.state, before = structuredClone(state);
  const command = { kind: "RESPOND", taskId: taskId(state, 0), answer: true, expectedRevision: 0 };
  const cases: readonly [PlayerId, unknown, string][] = [
    [outsider, command, "INVALID_ACTOR"], [player(2), command, "NOT_YOUR_TURN"],
    [player(1), { ...command, expectedRevision: 1 }, "STALE_REVISION"],
    [player(1), { ...command, taskId: taskId(state, 1) }, "INVALID_TASK"],
    [player(1), { ...command, detail: "my hand" }, "INVALID_ACTION"],
    [player(1), { ...command, answer: "YES" }, "INVALID_ACTION"],
    [player(1), { ...command, expectedRevision: 0.5 }, "INVALID_ACTION"],
    [player(1), { kind: "ASSIGN", taskId: taskId(state, 0), toPlayerId: player(1), expectedRevision: 0 }, "INVALID_PHASE"],
  ];
  for (const [actor, input, reason] of cases) { assert.deepEqual(applySpaceCrewTaskAction(state, actor, input, env.trick), { ok: false, reason }); assert.deepEqual(state, before); }
  const responded = action(state, env.trick, player(1), command);
  assert.deepEqual(applySpaceCrewTaskAction(responded, player(1), { ...command, expectedRevision: responded.revision }, env.trick), { ok: false, reason: "NOT_YOUR_TURN" });
});

test("Space Crew tasks: optional gold transfer once, including 27/37, preserves attached token", () => {
  for (const mission of [25, 27, 37]) {
    const env = create(5, 4, mission === 25 ? "CHOOSE" : "COMMANDER_DECISION", [{ kind: "LAST" }], mission);
    const assigned = mission === 25 ? chooseAll(env.state, env.trick) : assignNext(env.state, env.trick, player(1));
    const task = assigned.tasks[0]; assert.ok(task?.ownerId);
    const target = task.ownerId === player(0) ? player(1) : player(0);
    const moved = action(assigned, env.trick, task.ownerId, { kind: "TRANSFER", taskId: task.id, toPlayerId: target });
    assert.equal(moved.tasks[0]?.ownerId, target); assert.deepEqual(moved.tasks[0]?.token, { kind: "LAST" });
    assert.equal(moved.tasks.length, assigned.tasks.length); assert.ok(moved.transfer);
    assert.deepEqual(applySpaceCrewTaskAction(moved, target, { kind: "TRANSFER", taskId: task.id, toPlayerId: task.ownerId, expectedRevision: moved.revision }, env.trick), { ok: false, reason: "TRANSFER_NOT_ALLOWED" });
  }
});

test("Space Crew tasks: transfer does not reimpose even distribution", () => {
  const env = create(5, 6, "COMMANDER_DISTRIBUTION", [], 43);
  let state = env.state;
  for (const recipient of [player(0), player(0), player(1), player(2), player(3), player(4)]) state = assignNext(state, env.trick, recipient);
  state = action(state, env.trick, player(1), { kind: "TRANSFER", taskId: taskId(state, 2), toPlayerId: player(0) });
  assert.deepEqual(players.map(id => state.tasks.filter(task => task.ownerId === id).length), [3, 0, 1, 1, 1]);
  assert.doesNotThrow(() => parseSpaceCrewTaskState(state));
});

test("Space Crew tasks: transfer rejects non-gold missions, other owners, self and after first card", () => {
  for (const [count, mission] of [[3, 25], [4, 25], [5, 24], [5, 26], [5, 29], [5, 46]]) {
    assert.ok(count !== undefined && mission !== undefined);
    const env = create(count, 3, "CHOOSE", [], mission), state = chooseAll(env.state, env.trick);
    assert.deepEqual(applySpaceCrewTaskAction(state, player(0), { kind: "TRANSFER", taskId: taskId(state, 0), toPlayerId: player(1), expectedRevision: state.revision }, env.trick), { ok: false, reason: "TRANSFER_NOT_ALLOWED" });
  }
  const env = create(5, 3, "CHOOSE", [], 25), state = chooseAll(env.state, env.trick);
  assert.deepEqual(applySpaceCrewTaskAction(state, player(1), { kind: "TRANSFER", taskId: taskId(state, 0), toPlayerId: player(2), expectedRevision: state.revision }, env.trick), { ok: false, reason: "INVALID_TASK" });
  for (const toPlayerId of [player(0), outsider]) assert.deepEqual(applySpaceCrewTaskAction(state, player(0), { kind: "TRANSFER", taskId: taskId(state, 0), toPlayerId, expectedRevision: state.revision }, env.trick), { ok: false, reason: "INVALID_RECIPIENT" });
  const cardId = legalSpaceCrewCardIds(env.trick, player(0))[0]; assert.ok(cardId);
  const played = playSpaceCrewCard(env.trick, player(0), { cardId, expectedRevision: 0 }); assert.ok(played.ok);
  assert.deepEqual(applySpaceCrewTaskAction(state, player(0), { kind: "TRANSFER", taskId: taskId(state, 0), toPlayerId: player(1), expectedRevision: state.revision }, played.state), { ok: false, reason: "INVALID_PHASE" });
});

test("Space Crew tasks: mission23 swaps two tokens once before any selection", () => {
  const env = create(3, 5, "CHOOSE", [{ kind: "ABSOLUTE", position: 1 }, { kind: "ABSOLUTE", position: 2 }, { kind: "ABSOLUTE", position: 3 }, { kind: "ABSOLUTE", position: 4 }, { kind: "ABSOLUTE", position: 5 }], 23);
  const command = { kind: "SWAP_TOKENS", firstTaskId: taskId(env.state, 0), secondTaskId: taskId(env.state, 4) };
  const swapped = action(env.state, env.trick, player(0), command);
  assert.deepEqual(swapped.tasks[0]?.token, { kind: "ABSOLUTE", position: 5 });
  assert.deepEqual(swapped.tasks[4]?.token, { kind: "ABSOLUTE", position: 1 });
  assert.deepEqual(applySpaceCrewTaskAction(swapped, player(0), { ...command, expectedRevision: swapped.revision }, env.trick), { ok: false, reason: "TOKEN_EDIT_NOT_ALLOWED" });
  const selected = action(env.state, env.trick, player(0), { kind: "CHOOSE", taskId: taskId(env.state, 0) });
  assert.deepEqual(applySpaceCrewTaskAction(selected, player(0), { ...command, expectedRevision: selected.revision }, env.trick), { ok: false, reason: "TOKEN_EDIT_NOT_ALLOWED" });
  assert.equal(chooseAll(env.state, env.trick).tokenEditUsed, false);
});

test("Space Crew tasks: mission40 moves one token only onto an unmarked task", () => {
  const env = create(3, 8, "CHOOSE", [{ kind: "ABSOLUTE", position: 1 }, { kind: "ABSOLUTE", position: 2 }, { kind: "ABSOLUTE", position: 3 }], 40);
  const moved = action(env.state, env.trick, player(0), { kind: "MOVE_TOKEN", fromTaskId: taskId(env.state, 0), toTaskId: taskId(env.state, 7) });
  assert.equal(moved.tasks[0]?.token, null); assert.deepEqual(moved.tasks[7]?.token, { kind: "ABSOLUTE", position: 1 });
  assert.deepEqual(applySpaceCrewTaskAction(env.state, player(0), { kind: "MOVE_TOKEN", fromTaskId: taskId(env.state, 0), toTaskId: taskId(env.state, 1), expectedRevision: 0 }, env.trick), { ok: false, reason: "INVALID_TASK" });
  const other = create(3, 8, "CHOOSE", [{ kind: "ABSOLUTE", position: 1 }], 38);
  assert.deepEqual(applySpaceCrewTaskAction(other.state, player(0), { kind: "MOVE_TOKEN", fromTaskId: taskId(other.state, 0), toTaskId: taskId(other.state, 7), expectedRevision: 0 }, other.trick), { ok: false, reason: "TOKEN_EDIT_NOT_ALLOWED" });
});

test("Space Crew task batch: five consecutive absolutes can complete in reversed play order", () => {
  const tokens: SpaceCrewTaskToken[] = [{ kind: "ABSOLUTE", position: 1 }, { kind: "ABSOLUTE", position: 2 }, { kind: "ABSOLUTE", position: 3 }, { kind: "ABSOLUTE", position: 4 }, { kind: "ABSOLUTE", position: 5 }];
  const env = batchFixture([["PINK", 1], ["PINK", 2], ["PINK", 3], ["PINK", 4], ["PINK", 5]], tokens);
  const trick = completed(env.cards, [["PINK", 4], ["PINK", 5], ["PINK", 3], ["PINK", 2], ["PINK", 1]]);
  const state = evaluate(env.state, trick, env.cards);
  assert.deepEqual(state.completedOrder, env.state.tasks.map(task => task.id));
  assert.ok(state.tasks.every(task => task.completedAtTrick === 1));
});

test("Space Crew task batch: pending absolute rank is reserved even when its card is absent", () => {
  const env = batchFixture([["BLUE", 1], ["PINK", 1]], [{ kind: "ABSOLUTE", position: 1 }]);
  const trick = completed(env.cards, [["PINK", 1], ["ROCKET", 4], ["GREEN", 1], ["YELLOW", 1], ["PINK", 2]]);
  const before = structuredClone(env.state);
  assert.deepEqual(evaluateSpaceCrewTaskBatch(env.state, trick, env.cards), { ok: false, reason: "TASK_ORDER", taskIds: [taskId(env.state, 1)] });
  assert.deepEqual(env.state, before);
});

test("Space Crew task batch: absolute one and three cannot skip pending two", () => {
  const env = batchFixture([["PINK", 1], ["BLUE", 1], ["GREEN", 1], ["YELLOW", 1]], [{ kind: "ABSOLUTE", position: 1 }, { kind: "ABSOLUTE", position: 2 }, { kind: "ABSOLUTE", position: 3 }]);
  const trick = completed(env.cards, [["PINK", 1], ["ROCKET", 4], ["GREEN", 1], ["YELLOW", 1], ["PINK", 2]]);
  const before = structuredClone(env.state), result = evaluateSpaceCrewTaskBatch(env.state, trick, env.cards);
  assert.ok(!result.ok); assert.equal(result.reason, "TASK_ORDER"); assert.deepEqual(env.state, before);
});

test("Space Crew task batch: unmarked tasks do not consume relative positions", () => {
  const env = batchFixture([["BLUE", 1], ["GREEN", 1], ["PINK", 1]], [{ kind: "RELATIVE", position: 1 }, { kind: "RELATIVE", position: 2 }]);
  let state = evaluate(env.state, completed(env.cards, [["PINK", 1], ["ROCKET", 4], ["YELLOW", 1], ["YELLOW", 2], ["PINK", 2]]), env.cards);
  assert.deepEqual(state.completedOrder, [taskId(state, 2)]);
  state = evaluate(state, completed(env.cards, [["GREEN", 1], ["ROCKET", 3], ["BLUE", 1], ["YELLOW", 3], ["PINK", 3]], 2), env.cards);
  assert.deepEqual(state.completedOrder, [taskId(state, 2), taskId(state, 0), taskId(state, 1)]);
});

test("Space Crew task batch: relative predecessor missing fails without partial completion", () => {
  const env = batchFixture([["BLUE", 1], ["PINK", 1]], [{ kind: "RELATIVE", position: 1 }, { kind: "RELATIVE", position: 2 }]);
  const result = evaluateSpaceCrewTaskBatch(env.state, completed(env.cards, [["PINK", 1], ["ROCKET", 4], ["GREEN", 1], ["YELLOW", 1], ["PINK", 2]]), env.cards);
  assert.ok(!result.ok); assert.equal(result.reason, "TASK_ORDER"); assert.ok(env.state.tasks.every(task => task.completedAtTrick === null));
});

test("Space Crew task batch: LAST can share the final batch, never an earlier batch", () => {
  const env = batchFixture([["PINK", 1], ["BLUE", 1]], [{ kind: "LAST" }]);
  const first = completed(env.cards, [["PINK", 1], ["ROCKET", 4], ["GREEN", 1], ["YELLOW", 1], ["PINK", 2]]);
  const failed = evaluateSpaceCrewTaskBatch(env.state, first, env.cards); assert.ok(!failed.ok); assert.equal(failed.reason, "TASK_ORDER");
  const state = evaluate(env.state, completed(env.cards, [["PINK", 1], ["ROCKET", 4], ["BLUE", 1], ["YELLOW", 1], ["PINK", 2]]), env.cards);
  assert.deepEqual(state.completedOrder, [taskId(state, 1), taskId(state, 0)]);
});

test("Space Crew task batch: wrong owner rejects the entire batch with only public task IDs", () => {
  const env = create(3, 2), state = chooseAll(env.state, env.trick), before = structuredClone(state);
  const trick = completed(env.cards, [["PINK", 1], ["ROCKET", 4], ["PINK", 2]]);
  const result = evaluateSpaceCrewTaskBatch(state, trick, env.cards);
  assert.deepEqual(result, { ok: false, reason: "WRONG_OWNER", taskIds: [taskId(state, 0)] });
  assert.deepEqual(state, before); assert.equal(JSON.stringify(result).includes("opaque-"), false);
});

test("Space Crew task batch: empty capture advances sequence, duplicate evaluation is rejected", () => {
  const env = batchFixture([["BLUE", 1]]);
  const trick = completed(env.cards, [["PINK", 1], ["ROCKET", 4], ["GREEN", 1], ["YELLOW", 1], ["PINK", 2]]);
  const state = evaluate(env.state, trick, env.cards);
  assert.equal(state.lastEvaluatedTrick, 1); assert.deepEqual(state.completedOrder, []);
  assert.deepEqual(evaluateSpaceCrewTaskBatch(state, trick, env.cards), { ok: false, reason: "INVALID_TRICK", taskIds: [] });
  const empty = create(5, 0);
  assert.equal(evaluate(empty.state, trick, empty.cards).lastEvaluatedTrick, 1);
});

test("Space Crew task batch: forged trick winner, seats, cards, number and repeated completed task fail", () => {
  const env = batchFixture([["PINK", 1]]), trick = completed(env.cards, [["PINK", 1], ["ROCKET", 4], ["GREEN", 1], ["YELLOW", 1], ["PINK", 2]]);
  const first = trick.plays[0]; assert.ok(first);
  for (const invalid of [{ ...trick, winnerId: player(0) }, { ...trick, number: 2 }, { ...trick, plays: [...trick.plays].reverse() }, { ...trick, plays: [{ ...first, cardId: "absent" }, ...trick.plays.slice(1)] }, { ...trick, plays: [first, first, ...trick.plays.slice(2)] }]) {
    assert.deepEqual(evaluateSpaceCrewTaskBatch(env.state, invalid, env.cards), { ok: false, reason: "INVALID_TRICK", taskIds: [] });
  }
  const state = evaluate(env.state, trick, env.cards);
  assert.deepEqual(evaluateSpaceCrewTaskBatch(state, { ...trick, number: 2 }, env.cards), { ok: false, reason: "INVALID_TRICK", taskIds: [] });
});

test("Space Crew tasks: parser rejects inconsistent owner, prompt, completion and transfer metadata", () => {
  const env = create(3, 3), first = env.state.tasks[0]; assert.ok(first);
  for (const input of [
    { ...env.state, extra: true }, { ...env.state, commanderId: outsider },
    { ...env.state, phase: "READY" }, { ...env.state, selectionOrder: [first.id] },
    { ...env.state, tasks: [{ ...first, ownerId: outsider }, ...env.state.tasks.slice(1)] },
    { ...env.state, completedOrder: [first.id] },
    { ...env.state, responses: [{ playerId: player(1), answer: true }] },
    { ...env.state, tokenEditUsed: true },
    { ...env.state, transfer: { taskId: first.id, fromPlayerId: player(0), toPlayerId: player(1) } },
  ]) assert.throws(() => parseSpaceCrewTaskState(input));
  const selected = chooseAll(env.state, env.trick);
  assert.throws(() => parseSpaceCrewTaskState({ ...selected, tasks: selected.tasks.map(task => ({ ...task, completedAtTrick: 1 })), completedOrder: selected.tasks.map(task => task.id), lastEvaluatedTrick: 1 }));
  const decision = create(3, 2, "COMMANDER_DECISION", [], 20);
  assert.throws(() => parseSpaceCrewTaskState({ ...decision.state, responses: [{ playerId: player(0), answer: true }] }));
});

test("Space Crew tasks: successful candidates do not alias tokens; exhausted revision is atomic", () => {
  const env = create(3, 2, "CHOOSE", [{ kind: "ABSOLUTE", position: 1 }]);
  const before = structuredClone(env.state);
  const selected = action(env.state, env.trick, player(0), { kind: "CHOOSE", taskId: taskId(env.state, 0) });
  const token = selected.tasks[0]?.token; assert.ok(token && token.kind === "ABSOLUTE"); token.position = 2;
  assert.deepEqual(env.state, before);
  const atLimit = { ...env.state, revision: Number.MAX_SAFE_INTEGER };
  assert.deepEqual(applySpaceCrewTaskAction(atLimit, player(0), { kind: "CHOOSE", taskId: taskId(atLimit, 0), expectedRevision: atLimit.revision }, env.trick), { ok: false, reason: "REVISION_EXHAUSTED" });
  assert.deepEqual(atLimit, { ...before, revision: Number.MAX_SAFE_INTEGER });
});

test("Space Crew tasks: every setup mode requires revisions for responses, assignment and evaluated tricks", () => {
  for (const mode of ["CHOOSE", "COMMANDER_DECISION", "COMMANDER_DISTRIBUTION"] satisfies SpaceCrewTaskState["mode"][]) {
    const env = create(3, 1, mode);
    const ready = mode === "CHOOSE" ? chooseAll(env.state, env.trick) : assignNext(env.state, env.trick, player(1));
    assert.doesNotThrow(() => parseSpaceCrewTaskState(ready));
    assert.throws(() => parseSpaceCrewTaskState({ ...ready, revision: ready.revision - 1 }));
    assert.throws(() => parseSpaceCrewTaskState({ ...ready, lastEvaluatedTrick: 13 }));
    assert.doesNotThrow(() => parseSpaceCrewTaskState({ ...ready, lastEvaluatedTrick: 13, revision: ready.revision + 13 }));
    if (mode !== "CHOOSE") {
      const responded = action(env.state, env.trick, player(1), { kind: "RESPOND", taskId: spaceCrewTaskPrompt(env.state).taskId, answer: true });
      assert.throws(() => parseSpaceCrewTaskState({ ...responded, revision: 0 }));
    }
  }
});
