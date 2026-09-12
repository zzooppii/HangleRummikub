import assert from "node:assert/strict";
import test from "node:test";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { shuffleFrozen } from "./domain/frozen-fisher-yates.js";
import { createSpaceCrewDeck, shuffleSpaceCrewCards, type SpaceCrewCard, type SpaceCrewSuit } from "./games/space-crew/domain/cards.js";
import { createSpaceCrewMissionState, applySpaceCrewMissionAction, parseSpaceCrewMissionState, type SpaceCrewMissionState } from "./games/space-crew/domain/mission.js";
import { spaceCrewTaskPrompt, visibleSpaceCrewTaskIds, type SpaceCrewTaskFace } from "./games/space-crew/domain/tasks.js";
import { legalSpaceCrewCardIds } from "./games/space-crew/domain/trick.js";
import type { RandomSource } from "./ports/system.js";

const roster = Array.from({ length: 5 }, (_, i) => parse(PlayerIdSchema, `p4-player-${i}`));
type Face = readonly [SpaceCrewSuit, number];
function player(seat: number): PlayerId { const id = roster[seat]; assert.ok(id); return id; }
function random(initial = 81): RandomSource {
  let seed = initial;
  return { nextInt(max) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; } };
}
function cards(): readonly SpaceCrewCard[] { let next = 0; return createSpaceCrewDeck(() => `p4-card-${++next}`); }
function findCard(deck: readonly SpaceCrewCard[], suit: SpaceCrewSuit, value: number): SpaceCrewCard {
  const card = deck.find(item => item.suit === suit && item.value === value); assert.ok(card); return card;
}
function id(state: SpaceCrewMissionState, suit: SpaceCrewSuit, value: number): string { return findCard(state.trick.cards, suit, value).cardId; }
function taskDeck(first: readonly Face[] = []): readonly SpaceCrewTaskFace[] {
  const deck = cards().flatMap(card => card.kind === "COLOR" ? [{ id: `p4-task-${card.suit}-${card.value}`, suit: card.suit, value: card.value }] : []);
  const front = first.map(([suit, value]) => { const task = deck.find(item => item.suit === suit && item.value === value); assert.ok(task); return task; });
  const frontIds = new Set(front.map(item => item.id));
  return [...front, ...deck.filter(item => !frontIds.has(item.id))];
}
function fromHands(hands: readonly (readonly SpaceCrewCard[])[]): readonly SpaceCrewCard[] {
  assert.ok(hands.every(hand => hand.length === hands[0]?.length));
  return Array.from({ length: hands[0]?.length ?? 0 }, (_, index) => hands.map(hand => { const card = hand[index]; assert.ok(card); return card; })).flat();
}
function suitDeck(): readonly SpaceCrewCard[] {
  const deck = cards();
  return fromHands((["PINK", "BLUE", "GREEN", "YELLOW"] as const).map((suit, seat) => [
    ...deck.filter(card => card.suit === suit), findCard(deck, "ROCKET", seat === 0 ? 4 : seat),
  ]));
}
function create(missionNumber: number, count = 4, deck = suitDeck(), firstTasks: readonly Face[] = []): SpaceCrewMissionState {
  return createSpaceCrewMissionState({ missionNumber, playerIds: roster.slice(0, count), deck, taskDeck: taskDeck(firstTasks) });
}
function act(state: SpaceCrewMissionState, who: PlayerId, action: Readonly<Record<string, unknown>>): SpaceCrewMissionState {
  const before = structuredClone(state);
  const result = applySpaceCrewMissionAction(state, who, { ...action, expectedRevision: state.revision }, random());
  assert.deepEqual(state, before);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.state.revision, state.revision + 1);
  assert.deepEqual(parseSpaceCrewMissionState(result.state), result.state);
  return result.state;
}
function reject(state: SpaceCrewMissionState, who: PlayerId, action: Readonly<Record<string, unknown>>) {
  const before = structuredClone(state);
  const result = applySpaceCrewMissionAction(state, who, { ...action, expectedRevision: state.revision }, random());
  assert.ok(!result.ok, JSON.stringify(action));
  assert.deepEqual(state, before);
  return result.reason;
}
function oneSetup(state: SpaceCrewMissionState): SpaceCrewMissionState {
  if (state.tasks.phase === "READY") {
    assert.equal(state.special.kind, "NO_COMMUNICATION_PLAYER");
    return act(state, state.trick.commanderId, { kind: "SPECIAL_SELECT", playerId: state.trick.commanderId });
  }
  const prompt = spaceCrewTaskPrompt(state.tasks);
  assert.ok(prompt.activePlayerId);
  if (state.tasks.phase === "CHOOSE") {
    const task = state.tasks.tasks.find(item => item.ownerId === null); assert.ok(task);
    return act(state, prompt.activePlayerId, { kind: "TASK", action: { kind: "CHOOSE", taskId: task.id } });
  }
  if (state.tasks.phase === "RESPOND") return act(state, prompt.activePlayerId, { kind: "TASK", action: { kind: "RESPOND", taskId: prompt.taskId, answer: true } });
  const allowed = state.trick.players.filter(item => state.tasks.mode !== "COMMANDER_DECISION" || item.playerId !== state.trick.commanderId);
  const counts = (who: PlayerId) => state.tasks.tasks.filter(task => task.ownerId === who).length;
  const target = [...allowed].sort((a, b) => counts(a.playerId) - counts(b.playerId))[0]; assert.ok(target);
  return act(state, prompt.activePlayerId, { kind: "TASK", action: { kind: "ASSIGN", taskId: prompt.taskId, toPlayerId: target.playerId } });
}
function ready(initial: SpaceCrewMissionState): SpaceCrewMissionState {
  let state = initial, steps = 0;
  while (state.status === "SETUP") { assert.ok(steps++ < 50); state = oneSetup(state); }
  assert.equal(state.status, "ACTIVE"); return state;
}
function firstPlay(state: SpaceCrewMissionState): SpaceCrewMissionState {
  const who = state.trick.activePlayerId; assert.ok(who);
  const cardId = legalSpaceCrewCardIds(state.trick, who)[0]; assert.ok(cardId);
  return act(state, who, { kind: "PLAY", cardId });
}
function trick(state: SpaceCrewMissionState, faces?: readonly Face[]): SpaceCrewMissionState {
  let next = state;
  for (let i = 0; i < state.trick.players.length; i++) {
    if (!faces) next = firstPlay(next);
    else {
      const who = next.trick.activePlayerId; assert.ok(who);
      const face = faces[roster.indexOf(who)]; assert.ok(face);
      next = act(next, who, { kind: "PLAY", cardId: id(next, face[0], face[1]) });
    }
  }
  return next;
}

test("SPACE_CREW missions 11–25 complete seeded 3/4/5-player attempts with canonical conservation", () => {
  for (let missionNumber = 11; missionNumber <= 25; missionNumber++) for (const count of [3, 4, 5]) {
    const deck = cards();
    let state = ready(createSpaceCrewMissionState({ missionNumber, playerIds: roster.slice(0, count), deck: shuffleSpaceCrewCards(deck, random(27 + missionNumber)), taskDeck: shuffleFrozen(taskDeck(), random(93)) }));
    let played = 0;
    while (state.status === "ACTIVE") {
      assert.ok(played++ < 40, `mission ${missionNumber}, count ${count}`);
      state = firstPlay(state);
      const zones = [...state.trick.players.flatMap(item => item.hand), ...state.trick.currentTrick.map(item => item.cardId), ...state.trick.completedTricks.flatMap(item => item.plays.map(play => play.cardId))];
      assert.equal(zones.length, 40); assert.equal(new Set(zones).size, 40);
    }
    assert.ok(state.status === "SUCCESS" || state.status === "FAILURE");
    assert.equal(state.trick.currentTrick.length, 0);
  }
});

test("SPACE_CREW mission 11 allows commander self-selection but only the selected player loses communication", () => {
  let state = create(11);
  reject(state, player(1), { kind: "SPECIAL_SELECT", playerId: player(0) });
  state = act(state, player(0), { kind: "SPECIAL_SELECT", playerId: player(0) });
  assert.equal(state.status, "SETUP", "target assignment remains required");
  reject(state, player(0), { kind: "PLAY", cardId: id(state, "PINK", 1) });
  state = ready(state);
  assert.equal(reject(state, player(0), { kind: "COMMUNICATE", cardId: id(state, "PINK", 9), mark: "HIGHEST" }), "COMMUNICATION_FORBIDDEN");
  state = act(state, player(1), { kind: "COMMUNICATE", cardId: id(state, "BLUE", 9), mark: "HIGHEST" });
  assert.equal(state.communications[1]?.used, true);
  reject(state, player(0), { kind: "SPECIAL_SELECT", playerId: player(2) });
});

test("SPACE_CREW mission 13 succeeds after four distinct rocket wins and fails when rockets share a trick", () => {
  const deck = cards(), rockets = deck.filter(card => card.kind === "ROCKET"), colors = deck.filter(card => card.kind === "COLOR");
  const prepared = fromHands([[...rockets, ...colors.slice(0, 6)], colors.slice(6, 16), colors.slice(16, 26), colors.slice(26, 36)]);
  let state = ready(create(13, 4, prepared));
  for (let i = 0; i < 3; i++) { state = trick(state); assert.equal(state.status, "ACTIVE"); }
  state = trick(state); assert.equal(state.status, "SUCCESS"); assert.equal(state.trick.completedTricks.length, 4);
  assert.notEqual(state.trick.phase, "EXHAUSTED");
  const loss = trick(ready(create(13)), [["ROCKET", 4], ["ROCKET", 1], ["ROCKET", 2], ["ROCKET", 3]]);
  assert.equal(loss.status, "FAILURE"); assert.deepEqual(loss.failure, { kind: "OBJECTIVE", reason: "ROCKET_DID_NOT_WIN" });
});

test("SPACE_CREW mission 16 forbids winning nines but permits all four nines captured under rocket four", () => {
  const deck = cards();
  const rows: readonly (readonly Face[])[] = [
    [["ROCKET", 1], ["PINK", 5], ["PINK", 6], ["PINK", 7], ["BLUE", 5]],
    [["ROCKET", 2], ["BLUE", 6], ["BLUE", 7], ["GREEN", 5], ["GREEN", 6]],
    [["ROCKET", 3], ["GREEN", 7], ["YELLOW", 5], ["YELLOW", 6], ["YELLOW", 7]],
    [["PINK", 8], ["PINK", 1], ["PINK", 2], ["PINK", 3], ["PINK", 4]],
    [["BLUE", 8], ["BLUE", 1], ["BLUE", 2], ["BLUE", 3], ["BLUE", 4]],
    [["GREEN", 8], ["GREEN", 1], ["GREEN", 2], ["GREEN", 3], ["GREEN", 4]],
    [["YELLOW", 8], ["YELLOW", 1], ["YELLOW", 2], ["YELLOW", 3], ["YELLOW", 4]],
    [["ROCKET", 4], ["PINK", 9], ["BLUE", 9], ["GREEN", 9], ["YELLOW", 9]],
  ];
  let state = ready(create(16, 5, rows.flatMap(row => row.map(([suit, value]) => findCard(deck, suit, value)))));
  for (const row of rows.slice(0, 7)) { state = trick(state, row); assert.equal(state.status, "ACTIVE"); }
  const final = rows[7]; assert.ok(final); state = trick(state, final);
  assert.equal(state.status, "SUCCESS"); assert.equal(state.trick.phase, "EXHAUSTED");
  const loss = trick(ready(create(16)), [["PINK", 9], ["BLUE", 1], ["GREEN", 1], ["YELLOW", 1]]);
  assert.equal(loss.status, "FAILURE"); assert.equal(loss.trick.completedTricks.length, 1);
  assert.deepEqual(loss.failure, { kind: "OBJECTIVE", reason: "FORBIDDEN_WIN_VALUE" });
});

test("SPACE_CREW mission 17 succeeds as soon as both tasks complete without requiring hand exhaustion", () => {
  let state = ready(create(17, 4, suitDeck(), [["PINK", 1], ["BLUE", 2]]));
  state = trick(state, [["PINK", 1], ["BLUE", 1], ["GREEN", 1], ["YELLOW", 1]]);
  assert.equal(state.status, "ACTIVE");
  state = trick(state, [["PINK", 2], ["ROCKET", 1], ["GREEN", 2], ["YELLOW", 2]]);
  assert.equal(state.status, "ACTIVE");
  state = trick(state, [["PINK", 3], ["BLUE", 2], ["GREEN", 3], ["YELLOW", 3]]);
  assert.equal(state.status, "SUCCESS"); assert.equal(state.tasks.completedOrder.length, 2);
  assert.equal(state.trick.completedTricks.length, 3); assert.notEqual(state.trick.phase, "EXHAUSTED");
});

test("SPACE_CREW missions 18/19 unlock communication before exactly trick two/three", () => {
  for (const [mission, fromTrick] of [[18, 2], [19, 3]] as const) {
    let state = ready(create(mission, 4, suitDeck(), [["PINK", 7], ["PINK", 8], ["PINK", 9], ["BLUE", 7], ["BLUE", 8]]));
    for (let completed = 0; completed < fromTrick - 1; completed++) {
      assert.equal(reject(state, player(0), { kind: "COMMUNICATE", cardId: id(state, "PINK", 9), mark: "HIGHEST" }), "COMMUNICATION_FORBIDDEN");
      state = trick(state);
    }
    state = act(state, player(0), { kind: "COMMUNICATE", cardId: id(state, "PINK", 9), mark: "HIGHEST" });
    assert.equal(state.communications[0]?.used, true); assert.equal(state.trick.currentTrick.length, 0);
  }
});

test("SPACE_CREW mission 20 hides all tasks during responses and cannot assign them to commander", () => {
  let state = create(20);
  assert.equal(state.tasks.mode, "COMMANDER_DECISION");
  while (state.tasks.phase === "RESPOND") {
    assert.deepEqual(visibleSpaceCrewTaskIds(state.tasks), []);
    assert.equal(spaceCrewTaskPrompt(state.tasks).taskId, null);
    state = oneSetup(state);
  }
  assert.deepEqual(visibleSpaceCrewTaskIds(state.tasks), []);
  reject(state, player(0), { kind: "TASK", action: { kind: "ASSIGN", taskId: null, toPlayerId: player(0) } });
  state = act(state, player(0), { kind: "TASK", action: { kind: "ASSIGN", taskId: null, toPlayerId: player(1) } });
  assert.equal(state.status, "ACTIVE"); assert.ok(state.tasks.tasks.every(task => task.ownerId === player(1)));
  assert.equal(visibleSpaceCrewTaskIds(state.tasks).length, 2);
});

test("SPACE_CREW mission 23 swaps two tokens once before any task choice", () => {
  let state = create(23);
  const first = state.tasks.tasks[0], second = state.tasks.tasks[1]; assert.ok(first && second);
  const action = { kind: "TASK", action: { kind: "SWAP_TOKENS", firstTaskId: first.id, secondTaskId: second.id } };
  reject(state, player(1), action);
  state = act(state, player(0), action);
  assert.deepEqual(state.tasks.tasks[0]?.token, second.token); assert.deepEqual(state.tasks.tasks[1]?.token, first.token);
  reject(state, player(0), action);
  let chosen = create(23); chosen = oneSetup(chosen);
  reject(chosen, player(0), action);
  assert.equal(ready(state).status, "ACTIVE");
});

test("SPACE_CREW mission 24 reveals one new task at a time and preserves balanced distribution", () => {
  let state = create(24);
  assert.equal(state.tasks.mode, "COMMANDER_DISTRIBUTION");
  assert.equal(visibleSpaceCrewTaskIds(state.tasks).length, 1);
  while (state.status === "SETUP") {
    const priorAssigned = state.tasks.selectionOrder.length;
    assert.equal(visibleSpaceCrewTaskIds(state.tasks).length, Math.min(priorAssigned + 1, 6));
    if (state.tasks.phase === "ASSIGN" && state.tasks.tasks.filter(task => task.ownerId === player(0)).length === 2) {
      reject(state, player(0), { kind: "TASK", action: { kind: "ASSIGN", taskId: spaceCrewTaskPrompt(state.tasks).taskId, toPlayerId: player(0) } });
    }
    state = oneSetup(state);
  }
  const counts = roster.slice(0, 4).map(who => state.tasks.tasks.filter(task => task.ownerId === who).length);
  assert.deepEqual(counts, [2, 2, 1, 1]); assert.equal(visibleSpaceCrewTaskIds(state.tasks).length, 6);
});

test("SPACE_CREW mission 25 permits exactly one five-player task transfer, preserving token and total", () => {
  let state = ready(create(25, 5, cards()));
  const task = state.tasks.tasks.find(item => item.ownerId === state.trick.commanderId); assert.ok(task?.ownerId);
  const recipient = state.trick.players.find(item => item.playerId !== task.ownerId); assert.ok(recipient);
  const count = state.tasks.tasks.length, token = structuredClone(task.token);
  state = act(state, task.ownerId, { kind: "TASK", action: { kind: "TRANSFER", taskId: task.id, toPlayerId: recipient.playerId } });
  const transferred = state.tasks.tasks.find(item => item.id === task.id);
  assert.equal(transferred?.ownerId, recipient.playerId); assert.deepEqual(transferred?.token, token);
  assert.equal(state.tasks.tasks.length, count);
  reject(state, recipient.playerId, { kind: "TASK", action: { kind: "TRANSFER", taskId: task.id, toPlayerId: task.ownerId } });
  const four = ready(create(25));
  const owned = four.tasks.tasks.find(item => item.ownerId === four.trick.commanderId); assert.ok(owned?.ownerId);
  reject(four, owned.ownerId, { kind: "TASK", action: { kind: "TRANSFER", taskId: owned.id, toPlayerId: player(1) } });
});
