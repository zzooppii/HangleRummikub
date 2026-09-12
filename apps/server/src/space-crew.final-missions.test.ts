import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { createSpaceCrewDeck, type SpaceCrewCard } from "./games/space-crew/domain/cards.js";
import { createSpaceCrewTaskDeck } from "./games/space-crew/domain/missions.js";
import { applySpaceCrewMissionAction, createSpaceCrewMissionState, parseSpaceCrewMissionState, type SpaceCrewMissionState } from "./games/space-crew/domain/mission.js";

const players = Array.from({ length: 5 }, (_, i) => v.parse(PlayerIdSchema, `final-${i}`));
function player(index: number): PlayerId { const id = players[index]; assert.ok(id); return id; }
function inventory() { let id = 0; return createSpaceCrewDeck(() => `final-card-${++id}`); }
function find(cards: readonly SpaceCrewCard[], suit: string, value: number): SpaceCrewCard {
  const card = cards.find(item => item.suit === suit && item.value === value); assert.ok(card); return card;
}
function create(missionNumber: number, hands: readonly (readonly SpaceCrewCard[])[]): SpaceCrewMissionState {
  const deck: SpaceCrewCard[] = [];
  for (let index = 0; index < Math.max(...hands.map(hand => hand.length)); index++) {
    for (const hand of hands) { const card = hand[index]; if (card) deck.push(card); }
  }
  let id = 0;
  return createSpaceCrewMissionState({ missionNumber, playerIds: players.slice(0, hands.length), deck,
    taskDeck: createSpaceCrewTaskDeck(() => `final-goal-${++id}`) });
}
function act(state: SpaceCrewMissionState, actor: PlayerId, action: Record<string, unknown>): SpaceCrewMissionState {
  const before = structuredClone(state);
  const result = applySpaceCrewMissionAction(state, actor, { ...action, expectedRevision: state.revision });
  assert.deepEqual(state, before);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.state.revision, state.revision + 1);
  assert.deepEqual(parseSpaceCrewMissionState(result.state), result.state);
  return result.state;
}
function play(state: SpaceCrewMissionState, suit: string, value: number): SpaceCrewMissionState {
  const actor = state.trick.activePlayerId; assert.ok(actor);
  return act(state, actor, { kind: "PLAY", cardId: find(state.trick.cards, suit, value).cardId });
}
function pinkMission() {
  const cards = inventory();
  return create(46, ["PINK", "BLUE", "GREEN", "YELLOW"].map((suit, index) => [
    ...cards.filter(card => card.suit === suit), find(cards, "ROCKET", index === 1 ? 4 : index === 0 ? 1 : index),
  ]));
}
function finalMission() {
  const cards = inventory();
  const hands: SpaceCrewCard[][] = [
    [4, 3, 2, 1].map(value => find(cards, "ROCKET", value)).concat([
      find(cards, "PINK", 1), find(cards, "GREEN", 1), find(cards, "YELLOW", 1), find(cards, "BLUE", 2),
    ]),
  ];
  for (let index = 1; index < 5; index++) {
    const first = ["PINK", "BLUE", "GREEN", "YELLOW"].map(suit => find(cards, suit, index + 4));
    const value = index === 2 ? 9 : index === 1 ? 2 : index;
    hands.push([...first, find(cards, "PINK", value), find(cards, "GREEN", value), find(cards, "YELLOW", value),
      find(cards, "BLUE", index === 1 ? 9 : index === 2 ? 1 : index)]);
  }
  return create(50, hands);
}
function preferences(input: SpaceCrewMissionState) {
  let state = input;
  for (let index = 0; index < 5; index++) state = act(state, player(index), {
    kind: "SPECIAL_PREFERENCE", preference: index === 0 ? "LAST" : index === 1 ? "FIRST_FOUR" : "MIDDLE",
  });
  return state;
}
function agreed(input: SpaceCrewMissionState) {
  let state = preferences(input);
  state = act(state, player(3), { kind: "SPECIAL_PROPOSE_ROLES", firstFourPlayerId: player(0), lastPlayerId: player(1) });
  for (const index of [0, 1, 2, 4]) state = act(state, player(index), { kind: "SPECIAL_VOTE_ROLES", accept: true });
  assert.equal(state.status, "ACTIVE");
  return state;
}

test("SPACE_CREW mission 46: the initial pink-nine holder fixes the collector before distress", () => {
  let state = pinkMission();
  assert.equal(state.special.kind, "PINK_COLLECTOR");
  if (state.special.kind !== "PINK_COLLECTOR") assert.fail();
  assert.equal(state.special.initialPinkNineHolderId, player(0));
  assert.equal(state.special.playerId, player(1));
  const initialSpecial = structuredClone(state.special);
  state = act(state, player(0), { kind: "DISTRESS", action: { kind: "PROPOSE", direction: "LEFT" } });
  for (const index of [1, 2, 3]) state = act(state, player(index), { kind: "DISTRESS", action: { kind: "VOTE", accept: true } });
  for (const [index, suit] of ["PINK", "BLUE", "GREEN", "YELLOW"].entries()) state = act(state, player(index), {
    kind: "DISTRESS", action: { kind: "SELECT", cardId: find(state.trick.cards, suit, index === 0 ? 9 : 1).cardId },
  });
  assert.deepEqual(state.special, initialSpecial);
  assert.ok(state.trick.players[1]?.hand.includes(find(state.trick.cards, "PINK", 9).cardId));
  assert.throws(() => parseSpaceCrewMissionState({ ...state, special: { ...state.special, playerId: player(2) } }));
});

test("SPACE_CREW mission 46: collecting all pink cards succeeds immediately with rockets still in hand", () => {
  let state = pinkMission();
  for (let value = 1; value <= 9; value++) {
    for (const suit of ["BLUE", "GREEN", "YELLOW", "PINK"]) state = play(state, suit, value);
    assert.equal(state.status, value === 9 ? "SUCCESS" : "ACTIVE");
  }
  assert.equal(state.trick.completedTricks.length, 9);
  assert.equal(state.trick.phase, "BETWEEN_TRICKS");
  assert.equal(state.trick.players.reduce((total, owner) => total + owner.hand.length, 0), 4);
});

test("SPACE_CREW mission 46: a pink-nine leftover in a three-player deal is failure, never success", () => {
  const cards = inventory();
  const first = [...cards.filter(card => card.suit === "PINK"), ...cards.filter(card => card.suit === "GREEN" && card.value <= 5)];
  const second = cards.filter(card => card.suit === "BLUE" || card.suit === "ROCKET");
  const used = new Set([...first, ...second].map(card => card.cardId));
  let state = create(46, [first, second, cards.filter(card => !used.has(card.cardId))]);
  for (let trick = 1; trick <= 13; trick++) {
    state = play(state, trick <= 9 ? "BLUE" : "ROCKET", trick <= 9 ? trick : trick - 9);
    const third = state.trick.players[2]?.hand[0]; assert.ok(third);
    state = act(state, player(2), { kind: "PLAY", cardId: third });
    state = play(state, trick <= 8 ? "PINK" : "GREEN", trick <= 8 ? trick : trick - 8);
  }
  assert.equal(state.status, "FAILURE");
  assert.equal(state.trick.phase, "EXHAUSTED");
  assert.deepEqual(state.trick.players[0]?.hand, [find(state.trick.cards, "PINK", 9).cardId]);
  assert.equal(state.failure?.kind, "OBJECTIVE");
});

test("SPACE_CREW mission 50: rejected proposals preserve preferences and cannot reuse prior votes", () => {
  let state = preferences(finalMission());
  const special = structuredClone(state.special);
  state = act(state, player(0), { kind: "SPECIAL_PROPOSE_ROLES", firstFourPlayerId: player(0), lastPlayerId: player(1) });
  const oldRevision = state.revision;
  state = act(state, player(1), { kind: "SPECIAL_VOTE_ROLES", accept: false });
  assert.equal(state.special.kind, "FINAL_ROLES");
  if (state.special.kind !== "FINAL_ROLES" || special.kind !== "FINAL_ROLES") assert.fail();
  assert.equal(state.special.phase, "PROPOSE");
  assert.deepEqual(state.special.preferences, special.preferences);
  assert.deepEqual(state.special.votes, []);
  assert.equal(state.special.proposal, null);
  state = act(state, player(2), { kind: "SPECIAL_PROPOSE_ROLES", firstFourPlayerId: player(0), lastPlayerId: player(1) });
  const before = structuredClone(state);
  assert.deepEqual(applySpaceCrewMissionAction(state, player(1), {
    kind: "SPECIAL_VOTE_ROLES", accept: true, expectedRevision: oldRevision,
  }), { ok: false, reason: "STALE_REVISION" });
  assert.deepEqual(state, before);
  assert.equal(applySpaceCrewMissionAction(state, player(0), {
    kind: "PLAY", cardId: find(state.trick.cards, "ROCKET", 4).cardId, expectedRevision: state.revision,
  }).ok, false);
});

test("SPACE_CREW mission 50: agreed roles may differ from preferences and middle players need not all win", () => {
  let state = agreed(finalMission());
  for (let trick = 0; trick < 4; trick++) {
    state = play(state, "ROCKET", 4 - trick);
    const suit = ["PINK", "BLUE", "GREEN", "YELLOW"][trick]; assert.ok(suit);
    for (let index = 1; index < 5; index++) state = play(state, suit, index + 4);
    assert.equal(state.status, "ACTIVE");
  }
  for (const suit of ["PINK", "GREEN", "YELLOW", "BLUE"]) {
    for (let offset = 0; offset < 5; offset++) {
      const actor = state.trick.activePlayerId; assert.ok(actor);
      const owner = state.trick.players.find(item => item.playerId === actor); assert.ok(owner);
      const card = state.trick.cards.find(item => item.suit === suit && owner.hand.includes(item.cardId)); assert.ok(card);
      state = act(state, actor, { kind: "PLAY", cardId: card.cardId });
    }
  }
  assert.equal(state.status, "SUCCESS");
  assert.deepEqual(state.trick.completedTricks.map(trick => trick.winnerId), [0, 0, 0, 0, 2, 2, 2, 1].map(player));
  assert.equal(state.trick.completedTricks.some(trick => trick.winnerId === player(3) || trick.winnerId === player(4)), false);
});
