import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { createSpaceCrewDeck, type SpaceCrewCard, type SpaceCrewSuit } from "./games/space-crew/domain/cards.js";
import { createSpaceCrewTaskDeck } from "./games/space-crew/domain/missions.js";
import { createSpaceCrewMissionState, applySpaceCrewMissionAction, parseSpaceCrewMissionState, type SpaceCrewMissionState } from "./games/space-crew/domain/mission.js";
import { spaceCrewTaskPrompt } from "./games/space-crew/domain/tasks.js";

const players = ["crew-a", "crew-b", "crew-c", "crew-d"].map(id => v.parse(PlayerIdSchema, id));
type Face = readonly [SpaceCrewSuit, number];
function player(index: number): PlayerId { const id = players[index]; assert.ok(id); return id; }
function card(state: SpaceCrewMissionState, face: Face): SpaceCrewCard {
  const found = state.trick.cards.find(item => item.suit === face[0] && item.value === face[1]); assert.ok(found); return found;
}
function create(missionNumber: number, priorities: readonly (readonly Face[])[] = [], goals: readonly Face[] = []): SpaceCrewMissionState {
  let serial = 0;
  const cards = createSpaceCrewDeck(() => `physical-${++serial}`);
  const hands = players.map((_, index) => (priorities[index] ?? []).map(face => {
    const found = cards.find(item => item.suit === face[0] && item.value === face[1]); assert.ok(found); return found;
  }));
  const rocket = cards.find(item => item.kind === "ROCKET" && item.value === 4); assert.ok(rocket && hands[0]);
  hands[0].push(rocket);
  const used = new Set(hands.flat().map(item => item.cardId));
  assert.equal(used.size, hands.flat().length);
  for (const item of cards.filter(item => !used.has(item.cardId))) {
    const hand = hands.find(candidate => candidate.length < 10); assert.ok(hand); hand.push(item);
  }
  const deck = Array.from({ length: 10 }, (_, index) => hands.map(hand => { const item = hand[index]; assert.ok(item); return item; })).flat();
  const allTasks = createSpaceCrewTaskDeck(() => `public-task-${++serial}`);
  const firstTasks = goals.map(face => { const task = allTasks.find(item => item.suit === face[0] && item.value === face[1]); assert.ok(task); return task; });
  return createSpaceCrewMissionState({ missionNumber, playerIds: players, deck,
    taskDeck: [...firstTasks, ...allTasks.filter(task => !firstTasks.some(first => first.id === task.id))] });
}
function act(state: SpaceCrewMissionState, actor: PlayerId, action: Record<string, unknown>): SpaceCrewMissionState {
  const before = structuredClone(state);
  const result = applySpaceCrewMissionAction(state, actor, { ...action, expectedRevision: state.revision });
  assert.ok(result.ok, result.ok ? "" : result.reason);
  assert.deepEqual(state, before);
  assert.equal(result.state.revision, state.revision + 1);
  assert.deepEqual(parseSpaceCrewMissionState(result.state), result.state);
  return result.state;
}
function choose(input: SpaceCrewMissionState): SpaceCrewMissionState {
  let state = input;
  while (state.tasks.phase === "CHOOSE") {
    const actor = spaceCrewTaskPrompt(state.tasks).activePlayerId, task = state.tasks.tasks.find(task => task.ownerId === null);
    assert.ok(actor && task);
    state = act(state, actor, { kind: "TASK", action: { kind: "CHOOSE", taskId: task.id } });
  }
  return state;
}
function playFaces(input: SpaceCrewMissionState, faces: readonly Face[]): SpaceCrewMissionState {
  let state = input;
  for (const face of faces) {
    const actor = state.trick.activePlayerId; assert.ok(actor);
    state = act(state, actor, { kind: "PLAY", cardId: card(state, face).cardId });
  }
  return state;
}
function rejected(state: SpaceCrewMissionState, actor: PlayerId, action: Record<string, unknown>, reason: string): void {
  const before = structuredClone(state);
  assert.deepEqual(applySpaceCrewMissionAction(state, actor, { expectedRevision: state.revision, ...action }), { ok: false, reason });
  assert.deepEqual(state, before);
}

test("Space Crew mission: wrong owner commits the completed trick and atomic mission failure", () => {
  let state = choose(create(1, [[["PINK", 2]], [["PINK", 9]], [["PINK", 1]], [["PINK", 3]]], [["PINK", 1]]));
  state = playFaces(state, [["PINK", 2], ["PINK", 9], ["PINK", 1]]);
  assert.equal(state.status, "ACTIVE"); assert.equal(state.trick.completedTricks.length, 0);
  const before = structuredClone(state);
  state = playFaces(state, [["PINK", 3]]);
  assert.equal(state.status, "FAILURE");
  assert.deepEqual(state.failure, { kind: "TASK", reason: "WRONG_OWNER", taskIds: state.tasks.tasks.map(task => task.id) });
  assert.equal(state.trick.completedTricks.length, 1);
  assert.equal(state.trick.currentTrick.length, 0);
  assert.deepEqual(state.tasks, before.tasks);
  assert.equal(state.tasks.lastEvaluatedTrick, 0);
  for (const action of [{ kind: "PLAY", cardId: "absent" }, { kind: "COMMUNICATE", cardId: "absent", mark: "ONLY" }]) rejected(state, player(0), action, "INVALID_PHASE");
  const evidence = JSON.stringify(state.failure);
  assert.equal(evidence.includes("physical-"), false);
});

test("Space Crew mission: an absolute-order violation is a committed task failure", () => {
  let state = choose(create(3, [[["BLUE", 2]], [["BLUE", 9]], [["BLUE", 1]], [["BLUE", 3]]], [["PINK", 1], ["BLUE", 1]]));
  state = playFaces(state, [["BLUE", 2], ["BLUE", 9], ["BLUE", 1], ["BLUE", 3]]);
  assert.equal(state.status, "FAILURE");
  assert.deepEqual(state.failure, { kind: "TASK", reason: "TASK_ORDER", taskIds: [state.tasks.tasks[1]?.id] });
  assert.equal(state.tasks.completedOrder.length, 0);
  assert.equal(state.trick.completedTricks[0]?.winnerId, player(1));
  assert.throws(() => parseSpaceCrewMissionState({ ...state, status: "ACTIVE", failure: null }));
});

test("Space Crew mission: LAST is the last task and allows mission seven success after three tricks", () => {
  let state = choose(create(7, [
    [["BLUE", 2], ["GREEN", 3], ["PINK", 9]],
    [["BLUE", 9], ["GREEN", 2], ["PINK", 1]],
    [["BLUE", 1], ["GREEN", 9], ["PINK", 2]],
    [["BLUE", 3], ["GREEN", 1], ["PINK", 3]],
  ], [["PINK", 1], ["BLUE", 1], ["GREEN", 1]]));
  state = playFaces(state, [["BLUE", 2], ["BLUE", 9], ["BLUE", 1], ["BLUE", 3]]);
  assert.equal(state.status, "ACTIVE");
  state = playFaces(state, [["GREEN", 2], ["GREEN", 9], ["GREEN", 1], ["GREEN", 3]]);
  assert.equal(state.status, "ACTIVE");
  state = playFaces(state, [["PINK", 2], ["PINK", 3], ["PINK", 9], ["PINK", 1]]);
  assert.equal(state.status, "SUCCESS"); assert.equal(state.failure, null);
  assert.equal(state.trick.completedTricks.length, 3);
  assert.equal(state.trick.phase, "BETWEEN_TRICKS");
  assert.equal(state.tasks.completedOrder.at(-1), state.tasks.tasks[0]?.id);
  rejected(state, player(0), { kind: "PLAY", cardId: "absent" }, "INVALID_PHASE");
});

test("Space Crew mission: setup gates, global revision and canonical dead-zone communication", () => {
  let state = create(6);
  const target = state.trick.cards.filter(item => item.kind === "COLOR" && state.trick.players[0]?.hand.includes(item.cardId) && item.suit === "PINK").sort((a, b) => b.value - a.value)[0]; assert.ok(target);
  rejected(state, player(0), { kind: "PLAY", cardId: target.cardId }, "INVALID_PHASE");
  rejected(state, player(0), { kind: "COMMUNICATE", cardId: target.cardId, mark: null }, "INVALID_PHASE");
  state = choose(state);
  assert.equal(state.revision, 3); assert.equal(state.trick.revision, 0);
  rejected(state, player(0), { kind: "COMMUNICATE", cardId: target.cardId, mark: null, expectedRevision: 0 }, "STALE_REVISION");
  rejected(state, player(0), { kind: "COMMUNICATE", cardId: target.cardId, mark: "HIGHEST" }, "INVALID_MARK");
  state = act(state, player(0), { kind: "COMMUNICATE", cardId: target.cardId, mark: null });
  assert.equal(state.revision, 4); assert.equal(state.trick.revision, 1);
  const forged = structuredClone(state);
  const declaration = forged.communications.map(item => item.playerId === player(0) ? { ...item, mark: "HIGHEST" } : item);
  assert.throws(() => parseSpaceCrewMissionState({ ...forged, communications: declaration }));
  rejected(state, player(0), { kind: "DISTRESS", action: { kind: "PROPOSE", direction: "LEFT" } }, "INVALID_PHASE");
});

test("Space Crew mission: distress voting and private selection block play and communication until exchange", () => {
  let state = create(9);
  const originalHands = state.trick.players.map(item => [...item.hand]);
  state = act(state, player(0), { kind: "DISTRESS", action: { kind: "PROPOSE", direction: "LEFT" } });
  for (const action of [{ kind: "PLAY", cardId: "absent" }, { kind: "COMMUNICATE", cardId: "absent", mark: "ONLY" }]) rejected(state, player(0), action, "INVALID_PHASE");
  for (const actor of players.slice(1)) state = act(state, actor, { kind: "DISTRESS", action: { kind: "VOTE", accept: true } });
  assert.equal(state.distress.phase, "SELECTING");
  const selections = state.trick.players.map(owner => {
    const selected = state.trick.cards.find(item => item.kind === "COLOR" && owner.hand.includes(item.cardId)); assert.ok(selected); return selected.cardId;
  });
  for (const [index, actor] of players.entries()) {
    state = act(state, actor, { kind: "DISTRESS", action: { kind: "SELECT", cardId: selections[index] } });
    if (index < 3) {
      assert.deepEqual(state.trick.players.map(item => item.hand), originalHands);
      rejected(state, player(0), { kind: "PLAY", cardId: "absent" }, "INVALID_PHASE");
    }
  }
  assert.equal(state.distress.phase, "EXCHANGED"); assert.equal(state.distress.active, true);
  for (const [index, owner] of state.trick.players.entries()) {
    assert.equal(owner.hand.includes(selections[(index + 3) % 4] ?? "absent"), true);
    assert.equal(owner.hand.includes(selections[index] ?? "absent"), false);
  }
  const rocket = card(state, ["ROCKET", 4]);
  state = act(state, player(0), { kind: "PLAY", cardId: rocket.cardId });
  assert.equal(state.trick.currentTrick.length, 1);
});

test("Space Crew mission: mission five permits self nomination despite others' GOOD replies", () => {
  let state = create(5);
  rejected(state, player(0), { kind: "SPECIAL_RESPOND", answer: "GOOD" }, "NOT_YOUR_TURN");
  rejected(state, player(0), { kind: "DISTRESS", action: { kind: "PROPOSE", direction: "LEFT" } }, "INVALID_PHASE");
  for (const actor of players.slice(1)) state = act(state, actor, { kind: "SPECIAL_RESPOND", answer: "GOOD" });
  rejected(state, player(1), { kind: "SPECIAL_SELECT", playerId: player(0) }, "NOT_YOUR_TURN");
  state = act(state, player(0), { kind: "SPECIAL_SELECT", playerId: player(0) });
  assert.equal(state.status, "ACTIVE");
  const faces: Face[] = [["ROCKET", 4]];
  for (const owner of state.trick.players.slice(1)) {
    const rockets = state.trick.cards.filter(item => item.kind === "ROCKET" && owner.hand.includes(item.cardId));
    const found = rockets[0] ?? state.trick.cards.find(item => owner.hand.includes(item.cardId)); assert.ok(found); faces.push([found.suit, found.value]);
  }
  state = playFaces(state, faces);
  assert.equal(state.status, "FAILURE"); assert.equal(state.trick.completedTricks.length, 1);
  assert.deepEqual(state.failure, { kind: "OBJECTIVE", reason: "TOO_MANY_PLAYER_TRICKS" });
  assert.equal(state.tasks.lastEvaluatedTrick, 1);
});
