import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { createSpaceCrewDeck, type SpaceCrewCard } from "./games/space-crew/domain/cards.js";
import { createSpaceCrewTaskDeck } from "./games/space-crew/domain/missions.js";
import { createSpaceCrewMissionState, applySpaceCrewMissionAction, parseSpaceCrewMissionState, type SpaceCrewMissionState } from "./games/space-crew/domain/mission.js";
import { projectSpaceCrewCommunications } from "./games/space-crew/domain/communication.js";
import { spaceCrewTaskPrompt } from "./games/space-crew/domain/tasks.js";
import type { RandomSource } from "./ports/system.js";

const seats = ["exchange-a", "exchange-b", "exchange-c", "exchange-d"].map(id => v.parse(PlayerIdSchema, id));
function seat(index: number): PlayerId { const value = seats[index]; assert.ok(value); return value; }
function face(state: SpaceCrewMissionState, suit: string, value: number): SpaceCrewCard {
  const card = state.trick.cards.find(item => item.suit === suit && item.value === value);
  assert.ok(card); return card;
}
function act(state: SpaceCrewMissionState, actor: PlayerId, action: Record<string, unknown>, random?: RandomSource) {
  const before = structuredClone(state);
  const result = applySpaceCrewMissionAction(state, actor, { ...action, expectedRevision: state.revision }, random);
  assert.deepEqual(state, before);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.state.revision, state.revision + 1);
  assert.deepEqual(parseSpaceCrewMissionState(result.state), result.state);
  return result.state;
}
function initial(failFirst = false): SpaceCrewMissionState {
  let sequence = 0;
  const cards = createSpaceCrewDeck(() => `exchange-card-${++sequence}`);
  const suits = ["PINK", "BLUE", "GREEN", "YELLOW"];
  const hands = suits.map((suit, index) => {
    const rocket = cards.find(card => card.suit === "ROCKET" && card.value === (index === 0 ? 4 : index));
    assert.ok(rocket);
    return [...cards.filter(card => card.suit === suit), rocket];
  });
  const deck = Array.from({ length: 10 }, (_, index) => hands.map(hand => {
    const card = hand[index]; assert.ok(card); return card;
  })).flat();
  const tasks = createSpaceCrewTaskDeck(() => `exchange-goal-${++sequence}`);
  const first = suits.map((suit, index) => {
    const task = tasks.find(item => item.suit === suit && item.value === (failFirst && index === 1 ? 2 : 9));
    assert.ok(task); return task;
  });
  let state = createSpaceCrewMissionState({ missionNumber: 12, playerIds: seats, deck,
    taskDeck: [...first, ...tasks.filter(item => !first.some(goal => goal.id === item.id))] });
  while (state.tasks.phase !== "READY") {
    const actor = spaceCrewTaskPrompt(state.tasks).activePlayerId;
    const task = state.tasks.tasks.find(item => item.ownerId === null);
    assert.ok(actor && task);
    state = act(state, actor, { kind: "TASK", action: { kind: "CHOOSE", taskId: task.id } });
  }
  return state;
}
function opening(input: SpaceCrewMissionState, count: number, random?: RandomSource) {
  let state = input;
  for (const [index, suit] of ["PINK", "BLUE", "GREEN", "YELLOW"].slice(0, count).entries()) {
    state = act(state, seat(index), { kind: "PLAY", cardId: face(state, suit, 2).cardId }, random);
  }
  return state;
}

test("SPACE_CREW mission 12: simultaneous exchange includes rockets and preserves commander and leader", () => {
  let state = initial();
  const initialHands = state.trick.players.map(player => [...player.hand]);
  let calls = 0;
  const random = { nextInt(max: number) { calls += 1; return max - 1; } };
  state = opening(state, 3, random);
  assert.equal(calls, 0);
  state = act(state, seat(3), { kind: "PLAY", cardId: face(state, "YELLOW", 2).cardId }, random);
  assert.equal(calls, 4);
  assert.equal(state.status, "ACTIVE");
  assert.equal(state.trick.commanderId, seat(0));
  assert.equal(state.trick.leaderId, seat(0));
  assert.equal(state.trick.activePlayerId, seat(0));
  assert.ok(state.exchange);
  assert.equal(state.exchange.moves.length, 4);
  for (let source = 0; source < 4; source++) {
    const outgoing = face(state, "ROCKET", source === 0 ? 4 : source).cardId;
    const move: { fromPlayerId: PlayerId; cardId: string } | undefined = state.exchange.moves[source];
    assert.deepEqual(move, { fromPlayerId: seat(source), cardId: outgoing });
    const receiver = state.trick.players[(source + 1) % 4];
    assert.ok(receiver);
    assert.ok(receiver.hand.includes(outgoing));
    assert.ok(initialHands[source]?.includes(outgoing));
    assert.equal(state.trick.players[source]?.hand.includes(outgoing), false);
  }
  const after = structuredClone(state.exchange);
  state = act(state, seat(0), { kind: "PLAY", cardId: face(state, "PINK", 3).cardId }, random);
  assert.equal(calls, 4, "later commands must not draw again");
  assert.deepEqual(state.exchange, after);
});

test("SPACE_CREW mission 12: displayed communication cards are excluded without altering marks", () => {
  let state = initial();
  state = act(state, seat(0), { kind: "COMMUNICATE", cardId: face(state, "PINK", 1).cardId, mark: "LOWEST" });
  state = act(state, seat(1), { kind: "COMMUNICATE", cardId: face(state, "BLUE", 9).cardId, mark: "HIGHEST" });
  const declarations = structuredClone(state.communications);
  const bounds: number[] = [];
  state = opening(state, 4, { nextInt(max) { bounds.push(max); return 0; } });
  assert.deepEqual(bounds, [8, 8, 9, 9]);
  assert.deepEqual(state.communications, declarations);
  assert.ok(state.exchange);
  assert.deepEqual([...state.exchange.protectedCardIds].sort(), [face(state, "PINK", 1).cardId, face(state, "BLUE", 9).cardId].sort());
  for (const id of state.exchange.protectedCardIds) assert.equal(state.exchange.moves.some(move => move.cardId === id), false);
  const displayed = projectSpaceCrewCommunications(state.trick, state.communications);
  assert.equal(displayed.find(item => item.playerId === seat(0))?.mark, "LOWEST");
  assert.equal(displayed.find(item => item.playerId === seat(1))?.mark, "HIGHEST");
});

test("SPACE_CREW mission 12: invalid randomness rejects the entire final play atomically", () => {
  const state = opening(initial(), 3);
  const randoms: (RandomSource | undefined)[] = [undefined,
    { nextInt: () => -1 }, { nextInt: max => max }, { nextInt: () => 0.5 },
    { nextInt: () => Number.NaN }, { nextInt() { throw new Error("private RNG diagnostic"); } },
  ];
  for (const random of randoms) {
    const before = structuredClone(state);
    const result = applySpaceCrewMissionAction(state, seat(3), {
      kind: "PLAY", cardId: face(state, "YELLOW", 2).cardId, expectedRevision: state.revision,
    }, random);
    assert.deepEqual(result, { ok: false, reason: "INVALID_RANDOM" });
    assert.deepEqual(state, before);
  }
});

test("SPACE_CREW mission 12: first-trick failure does not consume RNG or exchange any card", () => {
  let calls = 0;
  const state = opening(initial(true), 4, { nextInt() { calls += 1; throw new Error("must not run"); } });
  assert.equal(calls, 0);
  assert.equal(state.status, "FAILURE");
  assert.equal(state.exchange, null);
  assert.equal(state.trick.completedTricks.length, 1);
  assert.equal(state.failure?.kind, "TASK");
});

test("SPACE_CREW mission 12: private exchange record is verified without rerolling", () => {
  const state = opening(initial(), 4, { nextInt: max => max - 1 });
  assert.ok(state.exchange);
  assert.throws(() => parseSpaceCrewMissionState({ ...state, exchange: null }));
  const duplicate = structuredClone(state);
  assert.ok(duplicate.exchange?.moves[0] && duplicate.exchange.moves[1]);
  duplicate.exchange.moves[1].cardId = duplicate.exchange.moves[0].cardId;
  assert.throws(() => parseSpaceCrewMissionState(duplicate));
  const played = structuredClone(state);
  assert.ok(played.exchange?.moves[0]);
  played.exchange.moves[0].cardId = face(state, "PINK", 2).cardId;
  assert.throws(() => parseSpaceCrewMissionState(played));
  const protectedMove = structuredClone(state);
  assert.ok(protectedMove.exchange?.moves[0]);
  protectedMove.exchange.protectedCardIds.push(protectedMove.exchange.moves[0].cardId);
  assert.throws(() => parseSpaceCrewMissionState(protectedMove));
});
