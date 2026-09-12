import assert from "node:assert/strict";
import test from "node:test";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { shuffleFrozen } from "./domain/frozen-fisher-yates.js";
import { createSpaceCrewDeck, shuffleSpaceCrewCards, type SpaceCrewCard, type SpaceCrewSuit } from "./games/space-crew/domain/cards.js";
import { createSpaceCrewMissionState, applySpaceCrewMissionAction, parseSpaceCrewMissionState, type SpaceCrewMissionState } from "./games/space-crew/domain/mission.js";
import { spaceCrewTaskPrompt, type SpaceCrewTaskFace } from "./games/space-crew/domain/tasks.js";
import { legalSpaceCrewCardIds } from "./games/space-crew/domain/trick.js";
import type { RandomSource } from "./ports/system.js";

const players = Array.from({ length: 5 }, (_, i) => parse(PlayerIdSchema, `p5-player-${i}`));
type Face = readonly [SpaceCrewSuit, number];
function player(index: number): PlayerId { const id = players[index]; assert.ok(id); return id; }
function rng(initial = 51): RandomSource {
  let seed = initial;
  return { nextInt(max) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % max; } };
}
function cards(): readonly SpaceCrewCard[] { let next = 0; return createSpaceCrewDeck(() => `p5-card-${++next}`); }
function card(deck: readonly SpaceCrewCard[], suit: SpaceCrewSuit, value: number): SpaceCrewCard {
  const item = deck.find(c => c.suit === suit && c.value === value); assert.ok(item); return item;
}
function id(state: SpaceCrewMissionState, suit: SpaceCrewSuit, value: number): string { return card(state.trick.cards, suit, value).cardId; }
function tasks(front: readonly Face[] = []): readonly SpaceCrewTaskFace[] {
  const deck = cards().flatMap(c => c.kind === "COLOR" ? [{ id: `p5-goal-${c.suit}-${c.value}`, suit: c.suit, value: c.value }] : []);
  const chosen = front.map(([suit, value]) => { const t = deck.find(t => t.suit === suit && t.value === value); assert.ok(t); return t; });
  return [...chosen, ...deck.filter(t => !chosen.some(first => first.id === t.id))];
}
function interleave(hands: readonly (readonly SpaceCrewCard[])[]): readonly SpaceCrewCard[] {
  const length = Math.max(...hands.map(hand => hand.length));
  return Array.from({ length }, (_, i) => hands.flatMap(hand => { const c = hand[i]; return c ? [c] : []; })).flat();
}
function suitDeck(): readonly SpaceCrewCard[] {
  const deck = cards();
  return interleave((["PINK", "BLUE", "GREEN", "YELLOW"] as const).map((suit, seat) => [
    ...deck.filter(c => c.suit === suit), card(deck, "ROCKET", seat === 0 ? 4 : seat),
  ]));
}
function create(missionNumber: number, count = 4, deck = suitDeck(), front: readonly Face[] = []): SpaceCrewMissionState {
  return createSpaceCrewMissionState({ missionNumber, playerIds: players.slice(0, count), deck, taskDeck: tasks(front) });
}
function act(state: SpaceCrewMissionState, who: PlayerId, action: Readonly<Record<string, unknown>>): SpaceCrewMissionState {
  const before = structuredClone(state);
  const result = applySpaceCrewMissionAction(state, who, { ...action, expectedRevision: state.revision }, rng());
  assert.deepEqual(state, before); assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.state.revision, state.revision + 1);
  assert.deepEqual(parseSpaceCrewMissionState(result.state), result.state); return result.state;
}
function reject(state: SpaceCrewMissionState, who: PlayerId, action: Readonly<Record<string, unknown>>) {
  const before = structuredClone(state);
  const result = applySpaceCrewMissionAction(state, who, { ...action, expectedRevision: state.revision }, rng());
  assert.ok(!result.ok, JSON.stringify(action)); assert.deepEqual(state, before); return result.reason;
}
function setupTask(state: SpaceCrewMissionState): SpaceCrewMissionState {
  const prompt = spaceCrewTaskPrompt(state.tasks); assert.ok(prompt.activePlayerId);
  if (state.tasks.phase === "CHOOSE") {
    const task = state.tasks.tasks.find(t => t.ownerId === null); assert.ok(task);
    return act(state, prompt.activePlayerId, { kind: "TASK", action: { kind: "CHOOSE", taskId: task.id } });
  }
  if (state.tasks.phase === "RESPOND") return act(state, prompt.activePlayerId, { kind: "TASK", action: { kind: "RESPOND", taskId: prompt.taskId, answer: true } });
  const candidates = state.trick.players.filter(p => state.tasks.mode !== "COMMANDER_DECISION" || p.playerId !== state.trick.commanderId);
  const count = (who: PlayerId) => state.tasks.tasks.filter(t => t.ownerId === who).length;
  const recipient = [...candidates].sort((a, b) => count(a.playerId) - count(b.playerId))[0]; assert.ok(recipient);
  return act(state, prompt.activePlayerId, { kind: "TASK", action: { kind: "ASSIGN", taskId: prompt.taskId, toPlayerId: recipient.playerId } });
}
function ready(initial: SpaceCrewMissionState, nominee?: PlayerId): SpaceCrewMissionState {
  let state = initial, guard = 0;
  while (state.status === "SETUP") {
    assert.ok(guard++ < 100);
    if (state.tasks.phase !== "READY") { state = setupTask(state); continue; }
    const special = state.special;
    const commanderIndex = state.trick.players.findIndex(p => p.playerId === state.trick.commanderId);
    const seatAfter = (offset: number): PlayerId => { const p = state.trick.players[(commanderIndex + offset) % state.trick.players.length]; assert.ok(p); return p.playerId; };
    if (special.kind === "LIMITED_TRICKS_PLAYER") {
      state = special.phase === "RESPOND"
        ? act(state, seatAfter(special.responses.length + 1), { kind: "SPECIAL_RESPOND", answer: true })
        : act(state, state.trick.commanderId, { kind: "SPECIAL_SELECT", playerId: nominee ?? seatAfter(1) });
    } else if (special.kind === "FINAL_ROLES") {
      if (special.phase === "PREFERENCES") {
        const index = special.preferences.length;
        state = act(state, seatAfter(index), { kind: "SPECIAL_PREFERENCE", preference: index === 0 ? "FIRST_FOUR" : index === 1 ? "LAST" : "MIDDLE" });
      } else if (special.phase === "PROPOSE") {
        state = act(state, state.trick.commanderId, { kind: "SPECIAL_PROPOSE_ROLES", firstFourPlayerId: seatAfter(0), lastPlayerId: seatAfter(1) });
      } else {
        const who = state.trick.players.find(p => !special.votes.some(vote => vote.playerId === p.playerId)); assert.ok(who);
        state = act(state, who.playerId, { kind: "SPECIAL_VOTE_ROLES", accept: true });
      }
    } else throw new Error(`Unexpected pending setup ${special.kind}`);
  }
  assert.equal(state.status, "ACTIVE"); return state;
}
function firstPlay(state: SpaceCrewMissionState): SpaceCrewMissionState {
  const who = state.trick.activePlayerId; assert.ok(who);
  const cardId = legalSpaceCrewCardIds(state.trick, who)[0]; assert.ok(cardId);
  return act(state, who, { kind: "PLAY", cardId });
}
function playTrick(initial: SpaceCrewMissionState, row?: readonly Face[]): SpaceCrewMissionState {
  let state = initial;
  for (let i = 0; i < initial.trick.players.length; i++) {
    if (!row) state = firstPlay(state);
    else {
      const who = state.trick.activePlayerId; assert.ok(who);
      const face = row[players.indexOf(who)]; assert.ok(face);
      state = act(state, who, { kind: "PLAY", cardId: id(state, face[0], face[1]) });
    }
  }
  return state;
}

/** A complete legal 3-player hand with explicit winners and rocket four left in P0's hand. */
function plannedThree(winners: readonly number[], lastColor?: SpaceCrewSuit) {
  const deck = cards(), groups: Face[][] = [];
  for (const suit of ["PINK", "BLUE", "GREEN", "YELLOW"] as const) for (const start of [1, 4, 7]) groups.push([[suit, start], [suit, start + 1], [suit, start + 2]]);
  groups.push([["ROCKET", 1], ["ROCKET", 2], ["ROCKET", 3]]);
  if (lastColor) {
    const index = groups.findIndex(group => group[0]?.[0] === lastColor && group[0]?.[1] === 7);
    const last = groups.splice(index, 1)[0]; assert.ok(last); groups.push(last);
  }
  const rows = groups.map((group, index) => {
    const win = winners[index]; assert.ok(win !== undefined && win >= 0 && win <= 2);
    const low = [...group.slice(0, 2)], high = group[2]; assert.ok(high);
    return [0, 1, 2].map(seat => { const face = seat === win ? high : low.shift(); assert.ok(face); return face; });
  });
  const hands = [0, 1, 2].map(seat => rows.map(row => { const f = row[seat]; assert.ok(f); return card(deck, f[0], f[1]); }));
  const first = hands[0]; assert.ok(first); first.push(card(deck, "ROCKET", 4));
  return { deck: interleave(hands), rows };
}

test("SPACE_CREW missions 26–50 run seeded attempts for 3, 4 and 5 players without losing cards", () => {
  for (let missionNumber = 26; missionNumber <= 50; missionNumber++) for (const count of [3, 4, 5]) {
    const deck = cards();
    let state = ready(createSpaceCrewMissionState({ missionNumber, playerIds: players.slice(0, count), deck: shuffleSpaceCrewCards(deck, rng(71 + missionNumber)), taskDeck: shuffleFrozen(tasks(), rng(94)) }));
    let submissions = 0;
    while (state.status === "ACTIVE") {
      assert.ok(submissions++ < 40, `mission ${missionNumber}, count ${count}`);
      state = firstPlay(state);
      const zones = [...state.trick.players.flatMap(p => p.hand), ...state.trick.currentTrick.map(p => p.cardId), ...state.trick.completedTricks.flatMap(t => t.plays.map(p => p.cardId))];
      assert.equal(zones.length, 40); assert.equal(new Set(zones).size, 40);
    }
    assert.ok(state.status === "SUCCESS" || state.status === "FAILURE"); assert.equal(state.trick.currentTrick.length, 0);
  }
});

test("SPACE_CREW mission 26 needs two different winning color ones", () => {
  let state = ready(create(26));
  state = playTrick(state, [["PINK", 1], ["BLUE", 2], ["GREEN", 1], ["YELLOW", 1]]);
  assert.equal(state.status, "ACTIVE", "captured ones do not count as winning ones");
  state = playTrick(state, [["PINK", 2], ["ROCKET", 1], ["GREEN", 2], ["YELLOW", 2]]);
  assert.equal(state.status, "ACTIVE");
  state = playTrick(state, [["PINK", 3], ["BLUE", 1], ["GREEN", 3], ["YELLOW", 3]]);
  assert.equal(state.status, "SUCCESS"); assert.equal(state.trick.completedTricks.length, 3);
});

test("SPACE_CREW mission 29 checks every prefix, and mission 34 additionally requires commander first and last", () => {
  for (const mission of [29, 34]) {
    let failed = ready(create(mission)); failed = playTrick(failed); assert.equal(failed.status, "ACTIVE");
    failed = playTrick(failed); assert.equal(failed.status, "FAILURE");
    assert.deepEqual(failed.failure, { kind: "OBJECTIVE", reason: "UNBALANCED_WINS" });
    const plan = plannedThree(Array.from({ length: 13 }, (_, i) => i % 3));
    let state = ready(create(mission, 3, plan.deck));
    for (const [i, row] of plan.rows.entries()) { state = playTrick(state, row); assert.equal(state.status, i === 12 ? "SUCCESS" : "ACTIVE"); }
    assert.equal(state.trick.players.flatMap(p => p.hand).length, 1);
  }
  const missedLast = plannedThree([...Array.from({ length: 12 }, (_, i) => i % 3), 1]);
  let state = ready(create(34, 3, missedLast.deck));
  for (const row of missedLast.rows) state = playTrick(state, row);
  assert.equal(state.status, "FAILURE"); assert.deepEqual(state.failure, { kind: "OBJECTIVE", reason: "REQUIRED_WINNER_MISSED" });
  const first = playTrick(ready(create(34)), [["PINK", 1], ["ROCKET", 1], ["GREEN", 1], ["YELLOW", 1]]);
  assert.equal(first.status, "FAILURE"); assert.deepEqual(first.failure, { kind: "OBJECTIVE", reason: "REQUIRED_WINNER_MISSED" });
});

test("SPACE_CREW missions 33/41 use boolean responses and exclude commander from nomination", () => {
  for (const mission of [33, 41]) {
    let state = create(mission);
    reject(state, player(1), { kind: "SPECIAL_RESPOND", answer: "GOOD" });
    reject(state, player(0), { kind: "SPECIAL_RESPOND", answer: true });
    for (const seat of [1, 2, 3]) state = act(state, player(seat), { kind: "SPECIAL_RESPOND", answer: seat !== 2 });
    reject(state, player(0), { kind: "SPECIAL_SELECT", playerId: player(0) });
    state = act(state, player(0), { kind: "SPECIAL_SELECT", playerId: player(1) });
    assert.equal(state.status, "ACTIVE");
    state = playTrick(state, [["PINK", 1], ["ROCKET", 1], ["GREEN", 1], ["YELLOW", 1]]);
    assert.equal(state.status, "FAILURE"); assert.deepEqual(state.failure, { kind: "OBJECTIVE", reason: "FORBIDDEN_PLAYER_ROCKET_WIN" });
  }
});

test("SPACE_CREW mission 33 requires exactly one ordinary win and waits for exhaustion", () => {
  const plan = plannedThree([1, ...Array.from({ length: 12 }, () => 0)]);
  let state = ready(create(33, 3, plan.deck), player(1));
  for (const [i, row] of plan.rows.entries()) { state = playTrick(state, row); assert.equal(state.status, i === 12 ? "SUCCESS" : "ACTIVE"); }
  const excess = plannedThree([1, 1, ...Array.from({ length: 11 }, () => 0)]);
  let failed = ready(create(33, 3, excess.deck), player(1));
  for (const row of excess.rows.slice(0, 2)) failed = playTrick(failed, row);
  assert.equal(failed.status, "FAILURE"); assert.deepEqual(failed.failure, { kind: "OBJECTIVE", reason: "TOO_MANY_PLAYER_TRICKS" });
  let none = ready(create(33, 3, plan.deck), player(2));
  for (const row of plan.rows) none = playTrick(none, row);
  assert.equal(none.status, "FAILURE"); assert.deepEqual(none.failure, { kind: "OBJECTIVE", reason: "OBJECTIVE_NOT_MET" });
});

test("SPACE_CREW mission 41 permits nominee wins only on first and last tricks", () => {
  const plan = plannedThree([1, ...Array.from({ length: 11 }, () => 0), 1], "YELLOW");
  let state = ready(create(41, 3, plan.deck), player(1));
  for (const [i, row] of plan.rows.entries()) { state = playTrick(state, row); assert.equal(state.status, i === 12 ? "SUCCESS" : "ACTIVE"); }
  const excess = plannedThree([1, 1, ...Array.from({ length: 11 }, () => 0)]);
  let failed = ready(create(41, 3, excess.deck), player(1));
  for (const row of excess.rows.slice(0, 2)) failed = playTrick(failed, row);
  assert.equal(failed.status, "FAILURE"); assert.deepEqual(failed.failure, { kind: "OBJECTIVE", reason: "UNEXPECTED_PLAYER_TRICK" });
  const missed = playTrick(ready(create(41), player(1)));
  assert.equal(missed.status, "FAILURE"); assert.deepEqual(missed.failure, { kind: "OBJECTIVE", reason: "REQUIRED_WINNER_MISSED" });
});

test("SPACE_CREW mission 40 moves one token onto an unmarked task once before selection", () => {
  let state = create(40); const from = state.tasks.tasks[0], occupied = state.tasks.tasks[1], to = state.tasks.tasks[3]; assert.ok(from?.token && occupied && to);
  const action = { kind: "TASK", action: { kind: "MOVE_TOKEN", fromTaskId: from.id, toTaskId: to.id } };
  reject(state, player(1), action);
  reject(state, player(0), { kind: "TASK", action: { kind: "MOVE_TOKEN", fromTaskId: from.id, toTaskId: occupied.id } });
  state = act(state, player(0), action);
  assert.equal(state.tasks.tasks[0]?.token, null); assert.deepEqual(state.tasks.tasks[3]?.token, from.token);
  reject(state, player(0), action);
  const chosen = setupTask(create(40)); reject(chosen, player(0), action);
  assert.equal(ready(state).status, "ACTIVE");
});

test("SPACE_CREW mission 44 enforces ascending rocket wins and succeeds immediately after rocket four", () => {
  const deck = cards(), colors = deck.filter(c => c.kind === "COLOR");
  const prepared = interleave([[...deck.filter(c => c.kind === "ROCKET"), ...colors.slice(0, 6)], colors.slice(6, 16), colors.slice(16, 26), colors.slice(26)]);
  let state = ready(create(44, 4, prepared));
  for (let i = 0; i < 4; i++) { state = playTrick(state); assert.equal(state.status, i === 3 ? "SUCCESS" : "ACTIVE"); }
  assert.notEqual(state.trick.phase, "EXHAUSTED");
  let failed = ready(create(44, 4, prepared));
  failed = act(failed, player(0), { kind: "PLAY", cardId: id(failed, "ROCKET", 2) });
  for (let i = 0; i < 3; i++) failed = firstPlay(failed);
  assert.equal(failed.status, "FAILURE"); assert.deepEqual(failed.failure, { kind: "OBJECTIVE", reason: "ROCKET_ORDER" });
});

test("SPACE_CREW mission 48 requires omega on the actual final trick, not merely after other tasks", () => {
  const winners = Array.from({ length: 13 }, () => 0);
  // Removing the third pink group shifts blue's first group to index 2, green's to index 5.
  winners[2] = 1; winners[5] = 2;
  const plan = plannedThree(winners, "PINK");
  const front: readonly Face[] = [["PINK", 9], ["BLUE", 3], ["GREEN", 3]];
  let state = ready(create(48, 3, plan.deck, front));
  for (const [i, row] of plan.rows.entries()) { state = playTrick(state, row); assert.equal(state.status, i === 12 ? "SUCCESS" : "ACTIVE"); }
  assert.equal(state.tasks.completedOrder.length, 3);
  let early = ready(create(48, 4, suitDeck(), [["PINK", 9], ["BLUE", 1], ["GREEN", 1]]));
  const rows: readonly (readonly Face[])[] = [
    [["PINK", 1], ["ROCKET", 1], ["GREEN", 2], ["YELLOW", 1]],
    [["PINK", 2], ["BLUE", 1], ["GREEN", 3], ["YELLOW", 2]],
    [["PINK", 3], ["BLUE", 2], ["ROCKET", 2], ["YELLOW", 3]],
    [["PINK", 4], ["BLUE", 3], ["GREEN", 1], ["YELLOW", 4]],
    [["ROCKET", 4], ["BLUE", 4], ["GREEN", 4], ["YELLOW", 5]],
  ];
  for (const row of rows) { early = playTrick(early, row); assert.equal(early.status, "ACTIVE"); }
  assert.equal(early.tasks.completedOrder.length, 2);
  early = playTrick(early, [["PINK", 9], ["BLUE", 5], ["GREEN", 5], ["YELLOW", 6]]);
  assert.equal(early.status, "FAILURE"); assert.equal(early.trick.completedTricks.length, 6);
  assert.deepEqual(early.failure, { kind: "OBJECTIVE", reason: "OMEGA_NOT_LAST_TRICK" });
});

test("SPACE_CREW missions 27/37 permit a five-player transfer after commander decision", () => {
  for (const mission of [27, 37]) {
    let state = ready(create(mission, 5, cards()));
    assert.equal(state.tasks.mode, "COMMANDER_DECISION");
    const first = state.tasks.tasks[0]; assert.ok(first?.ownerId);
    assert.notEqual(first.ownerId, state.trick.commanderId);
    assert.ok(state.tasks.tasks.every(task => task.ownerId === first.ownerId));
    const count = state.tasks.tasks.length;
    state = act(state, first.ownerId, { kind: "TASK", action: { kind: "TRANSFER", taskId: first.id, toPlayerId: state.trick.commanderId } });
    assert.equal(state.tasks.tasks.find(task => task.id === first.id)?.ownerId, state.trick.commanderId);
    assert.equal(state.tasks.tasks.length, count);
    reject(state, state.trick.commanderId, { kind: "TASK", action: { kind: "TRANSFER", taskId: first.id, toPlayerId: first.ownerId } });
    const four = ready(create(mission)), task = four.tasks.tasks[0]; assert.ok(task?.ownerId);
    reject(four, task.ownerId, { kind: "TASK", action: { kind: "TRANSFER", taskId: task.id, toPlayerId: four.trick.commanderId } });
  }
});
