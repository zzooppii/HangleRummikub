import assert from "node:assert/strict";
import test from "node:test";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { shuffleFrozen } from "./domain/frozen-fisher-yates.js";
import { createSpaceCrewDeck, shuffleSpaceCrewCards, type SpaceCrewCard } from "./games/space-crew/domain/cards.js";
import { projectSpaceCrewCommunications } from "./games/space-crew/domain/communication.js";
import { createSpaceCrewMissionState, applySpaceCrewMissionAction, parseSpaceCrewMissionState, type SpaceCrewMissionState } from "./games/space-crew/domain/mission.js";
import { spaceCrewTaskPrompt, type SpaceCrewTaskFace } from "./games/space-crew/domain/tasks.js";
import { legalSpaceCrewCardIds } from "./games/space-crew/domain/trick.js";
import type { RandomSource } from "./ports/system.js";

const allPlayers = Array.from({ length: 5 }, (_, seat) => parse(PlayerIdSchema, `integration-player-${seat}`));
function player(seat: number): PlayerId {
  const id = allPlayers[seat];
  assert.ok(id);
  return id;
}
function random(initial: number): RandomSource {
  let seed = initial;
  return { nextInt(max) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; } };
}
function cards(): readonly SpaceCrewCard[] {
  let sequence = 0;
  return createSpaceCrewDeck(() => `integration-card-${++sequence}`);
}
function tasks(deck: readonly SpaceCrewCard[]): SpaceCrewTaskFace[] {
  return deck.flatMap(card => card.kind === "COLOR" ? [{ id: `task-${card.suit}-${card.value}`, suit: card.suit, value: card.value }] : []);
}
function face(state: SpaceCrewMissionState, suit: string, value: number): string {
  const card = state.trick.cards.find(item => item.suit === suit && item.value === value);
  assert.ok(card);
  return card.cardId;
}
function seeded(missionNumber: number, count: number, seed: number): SpaceCrewMissionState {
  const deck = cards();
  return createSpaceCrewMissionState({ missionNumber, playerIds: allPlayers.slice(0, count), deck: shuffleSpaceCrewCards(deck, random(seed)), taskDeck: shuffleFrozen(tasks(deck), random(seed + 91)) });
}

/** Four suit-pure hands: P0 wins every trick if all play 1–9 then their rocket. */
function suitDeck(): readonly SpaceCrewCard[] {
  const deck = cards();
  const hands = ["PINK", "BLUE", "GREEN", "YELLOW"].map((suit, seat) => {
    const rocketValue = seat === 0 ? 4 : seat;
    const rocket = deck.find(card => card.kind === "ROCKET" && card.value === rocketValue);
    assert.ok(rocket);
    return [...deck.filter(card => card.suit === suit), rocket];
  });
  return Array.from({ length: 10 }, (_, index) => hands.map(hand => {
    const card = hand[index];
    assert.ok(card);
    return card;
  })).flat();
}
function controlled(missionNumber: number): SpaceCrewMissionState {
  const deck = suitDeck();
  return createSpaceCrewMissionState({ missionNumber, playerIds: allPlayers.slice(0, 4), deck, taskDeck: tasks(cards()) });
}
function act(state: SpaceCrewMissionState, actor: PlayerId, action: Readonly<Record<string, unknown>>): SpaceCrewMissionState {
  const before = structuredClone(state);
  const result = applySpaceCrewMissionAction(state, actor, { ...action, expectedRevision: state.revision });
  assert.deepEqual(state, before);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.state.revision, state.revision + 1);
  assert.deepEqual(parseSpaceCrewMissionState(result.state), result.state);
  return result.state;
}
function reject(state: SpaceCrewMissionState, actor: PlayerId, action: Readonly<Record<string, unknown>>, revision = state.revision) {
  const before = structuredClone(state);
  const result = applySpaceCrewMissionAction(state, actor, { ...action, expectedRevision: revision });
  assert.ok(!result.ok, JSON.stringify(action));
  assert.deepEqual(state, before);
  return result;
}
function ready(initial: SpaceCrewMissionState, nominee?: PlayerId): SpaceCrewMissionState {
  let state = initial;
  while (state.tasks.phase !== "READY") {
    const who = spaceCrewTaskPrompt(state.tasks).activePlayerId;
    const task = state.tasks.tasks.find(item => item.ownerId === null);
    assert.ok(who && task);
    state = act(state, who, { kind: "TASK", action: { kind: "CHOOSE", taskId: task.id } });
  }
  if (state.special.kind === "NO_TRICKS_PLAYER") {
    const roster = state.trick.players.map(item => item.playerId);
    const commanderSeat = roster.indexOf(state.trick.commanderId);
    for (let offset = 1; offset < roster.length; offset++) {
      const id = roster[(commanderSeat + offset) % roster.length];
      assert.ok(id);
      state = act(state, id, { kind: "SPECIAL_RESPOND", answer: "GOOD" });
    }
    state = act(state, state.trick.commanderId, { kind: "SPECIAL_SELECT", playerId: nominee ?? roster.find(id => id !== state.trick.commanderId) });
  }
  assert.equal(state.status, "ACTIVE");
  return state;
}
function playFirst(state: SpaceCrewMissionState): SpaceCrewMissionState {
  const actor = state.trick.activePlayerId;
  assert.ok(actor);
  const cardId = legalSpaceCrewCardIds(state.trick, actor)[0];
  assert.ok(cardId);
  return act(state, actor, { kind: "PLAY", cardId });
}

test("SPACE_CREW missions 1–10: seeded 3/4/5-player attempts terminate with conserved inventory", () => {
  for (const count of [3, 4, 5]) for (let mission = 1; mission <= 10; mission++) for (const seed of [5, 43]) {
    let state = ready(seeded(mission, count, seed));
    let submissions = 0;
    while (state.status === "ACTIVE") {
      assert.ok(submissions++ < 40, `mission ${mission}, players ${count}, seed ${seed}`);
      state = playFirst(state);
      const ids = [...state.trick.players.flatMap(item => item.hand), ...state.trick.currentTrick.map(item => item.cardId), ...state.trick.completedTricks.flatMap(item => item.plays.map(play => play.cardId))];
      assert.equal(ids.length, 40);
      assert.equal(new Set(ids).size, 40);
    }
    assert.ok(state.status === "SUCCESS" || state.status === "FAILURE");
    assert.equal(state.trick.currentTrick.length, 0, "mission outcome is resolved after a complete trick");
    if (state.trick.phase === "EXHAUSTED") assert.equal(state.trick.players.flatMap(item => item.hand).length, count === 3 ? 1 : 0);
    reject(state, state.trick.commanderId, { kind: "PLAY", cardId: state.trick.cards[0]?.cardId });
  }
});

test("SPACE_CREW task assignment blocks playing, communication and distress until complete", () => {
  const initial = controlled(1), commander = initial.trick.commanderId;
  assert.equal(initial.status, "SETUP");
  reject(initial, commander, { kind: "PLAY", cardId: face(initial, "PINK", 1) });
  reject(initial, commander, { kind: "COMMUNICATE", cardId: face(initial, "PINK", 9), mark: "HIGHEST" });
  reject(initial, commander, { kind: "DISTRESS", action: { kind: "PROPOSE", direction: "LEFT" } });
  const active = ready(initial);
  assert.equal(active.tasks.tasks[0]?.ownerId, commander);
  const communicated = act(active, commander, { kind: "COMMUNICATE", cardId: face(active, "PINK", 9), mark: "HIGHEST" });
  reject(communicated, commander, { kind: "DISTRESS", action: { kind: "PROPOSE", direction: "LEFT" } });
  reject(communicated, commander, { kind: "TASK", action: { kind: "CHOOSE", taskId: active.tasks.tasks[0]?.id } });
  const special = controlled(5);
  reject(special, special.trick.commanderId, { kind: "PLAY", cardId: face(special, "PINK", 1) });
  reject(special, special.trick.commanderId, { kind: "COMMUNICATE", cardId: face(special, "PINK", 9), mark: "HIGHEST" });
  reject(special, special.trick.commanderId, { kind: "DISTRESS", action: { kind: "PROPOSE", direction: "LEFT" } });
});

test("SPACE_CREW mission 6 uses dead-zone communication without accepting a relationship override", () => {
  const state = ready(controlled(6));
  reject(state, player(0), { kind: "COMMUNICATE", cardId: face(state, "PINK", 9), mark: "HIGHEST" });
  const next = act(state, player(0), { kind: "COMMUNICATE", cardId: face(state, "PINK", 9), mark: null });
  assert.equal(projectSpaceCrewCommunications(next.trick, next.communications)[0]?.mark, null);
  assert.equal(next.communications[0]?.used, true);
});

test("SPACE_CREW global revision rejects cross-component stale and nested revisions atomically", () => {
  const initial = controlled(1), active = ready(initial), commander = active.trick.commanderId;
  assert.equal(reject(active, commander, { kind: "PLAY", cardId: face(active, "PINK", 1) }, initial.revision).reason, "STALE_REVISION");
  const oldRevision = active.revision;
  const communicated = act(active, commander, { kind: "COMMUNICATE", cardId: face(active, "PINK", 9), mark: "HIGHEST" });
  assert.equal(reject(communicated, commander, { kind: "PLAY", cardId: face(active, "PINK", 1) }, oldRevision).reason, "STALE_REVISION");
  assert.equal(reject(communicated, commander, { kind: "DISTRESS", action: { kind: "SKIP" } }, oldRevision).reason, "STALE_REVISION");
  assert.equal(reject(communicated, commander, { kind: "TASK", action: { kind: "CHOOSE", taskId: active.tasks.tasks[0]?.id } }, oldRevision).reason, "STALE_REVISION");
  const proposed = act(active, commander, { kind: "DISTRESS", action: { kind: "PROPOSE", direction: "LEFT" } });
  assert.equal(reject(proposed, commander, { kind: "TASK", action: { kind: "CHOOSE", taskId: active.tasks.tasks[0]?.id } }, oldRevision).reason, "STALE_REVISION");
  reject(active, commander, { kind: "DISTRESS", action: { kind: "SKIP", expectedRevision: active.distress.attemptNumber } });
  reject(active, commander, { kind: "PLAY", cardId: face(active, "PINK", 1), assignmentComplete: true });
  reject(active, parse(PlayerIdSchema, "outsider"), { kind: "PLAY", cardId: face(active, "PINK", 1) });
});

test("SPACE_CREW distress votes and pending selections block other components until simultaneous exchange", () => {
  let state = ready(controlled(1));
  const commander = state.trick.commanderId;
  state = act(state, commander, { kind: "DISTRESS", action: { kind: "PROPOSE", direction: "LEFT" } });
  reject(state, commander, { kind: "PLAY", cardId: face(state, "PINK", 1) });
  reject(state, player(1), { kind: "COMMUNICATE", cardId: face(state, "BLUE", 9), mark: "HIGHEST" });
  for (const seat of [1, 2, 3]) state = act(state, player(seat), { kind: "DISTRESS", action: { kind: "VOTE", accept: true } });
  const beforeHands = structuredClone(state.trick.players);
  for (const [seat, suit] of ["PINK", "BLUE", "GREEN", "YELLOW"].entries()) {
    state = act(state, player(seat), { kind: "DISTRESS", action: { kind: "SELECT", cardId: face(state, suit, 1) } });
    if (seat < 3) {
      assert.deepEqual(state.trick.players, beforeHands);
      reject(state, commander, { kind: "PLAY", cardId: face(state, "PINK", 2) });
      reject(state, commander, { kind: "COMMUNICATE", cardId: face(state, "PINK", 9), mark: "HIGHEST" });
    }
  }
  assert.equal(state.distress.phase, "EXCHANGED");
  state = act(state, commander, { kind: "COMMUNICATE", cardId: face(state, "PINK", 9), mark: "HIGHEST" });
  assert.equal(state.communications.find(item => item.playerId === commander)?.used, true);
  assert.equal(playFirst(state).trick.currentTrick.length, 1);
});

test("SPACE_CREW mission 1 succeeds only on completed target trick, mission 2 fails on wrong target owner", () => {
  let one = ready(controlled(1));
  for (let index = 0; index < 3; index++) {
    one = playFirst(one);
    assert.equal(one.status, "ACTIVE");
  }
  one = playFirst(one);
  assert.equal(one.status, "SUCCESS");
  assert.equal(one.trick.completedTricks.length, 1);
  let two = ready(controlled(2));
  for (let index = 0; index < 4; index++) two = playFirst(two);
  assert.equal(two.status, "ACTIVE");
  for (let index = 0; index < 4; index++) two = playFirst(two);
  assert.equal(two.status, "FAILURE");
  assert.equal(two.trick.completedTricks.length, 2);
});

test("SPACE_CREW mission 5 keeps zero-win objective pending until all hands are exhausted", () => {
  let state = ready(controlled(5), player(1));
  for (let index = 0; index < 39; index++) {
    state = playFirst(state);
    assert.equal(state.status, "ACTIVE", `premature result after card ${index + 1}`);
  }
  state = playFirst(state);
  assert.equal(state.status, "SUCCESS");
  assert.equal(state.trick.phase, "EXHAUSTED");
  assert.equal(state.trick.completedTricks.length, 10);
  assert.ok(state.trick.completedTricks.every(trick => trick.winnerId === player(0)));
  let doomed = ready(controlled(5), player(0));
  for (let index = 0; index < 4; index++) doomed = playFirst(doomed);
  assert.equal(doomed.status, "FAILURE");
  assert.equal(doomed.trick.completedTricks.length, 1);
});

test("SPACE_CREW mission 9 succeeds immediately when a color one wins without exhausting hands", () => {
  let state = ready(controlled(9));
  for (let index = 0; index < 3; index++) {
    state = playFirst(state);
    assert.equal(state.status, "ACTIVE");
  }
  state = playFirst(state);
  assert.equal(state.status, "SUCCESS");
  assert.equal(state.trick.completedTricks.length, 1);
  assert.notEqual(state.trick.phase, "EXHAUSTED");
  assert.equal(state.trick.players.flatMap(item => item.hand).length, 36);
});

test("SPACE_CREW communication remains spent through trick changes and resets only for a new attempt", () => {
  let state = ready(controlled(5), player(1));
  state = act(state, player(0), { kind: "COMMUNICATE", cardId: face(state, "PINK", 1), mark: "LOWEST" });
  for (let index = 0; index < 4; index++) state = playFirst(state);
  assert.deepEqual(projectSpaceCrewCommunications(state.trick, state.communications)[0], { playerId: player(0), used: true, card: null, mark: null });
  reject(state, player(0), { kind: "COMMUNICATE", cardId: face(state, "PINK", 9), mark: "HIGHEST" });
  while (state.status === "ACTIVE") state = playFirst(state);
  const retry = createSpaceCrewMissionState({ missionNumber: 5, playerIds: allPlayers.slice(0, 4), deck: suitDeck(), taskDeck: tasks(cards()), attemptNumber: 2, previousDistress: state.distress });
  assert.ok(retry.communications.every(item => !item.used && item.cardId === null && item.mark === null));
  assert.equal(retry.distress.attemptNumber, 2);
  const readyRetry = ready(retry, player(1));
  assert.ok(act(readyRetry, player(0), { kind: "COMMUNICATE", cardId: face(readyRetry, "PINK", 1), mark: "LOWEST" }).communications[0]?.used);
});
