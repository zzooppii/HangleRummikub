import assert from "node:assert/strict";
import test from "node:test";

import { actCity, atCityRole, cityCard, cityContext, cityEntropy, cityPlaying, completeCityDraft, createCityFixture, withCityZones } from "./testing/city-role-fixtures.test.js";
import { cloneCityGameState } from "./games/city-role/domain/game-state.js";
import { parseBuildingCardId, parseCityActionId } from "./games/city-role/domain/identity.js";
import { forfeitCityPlayers } from "./games/city-role/domain/rule-engine.js";
import { assertCityGameState } from "./games/city-role/domain/state-validator.js";

test("CITY whole-state validator accepts every supported initial and completed draft", () => {
  for (const count of [2, 3, 4, 5, 6]) {
    const state = createCityFixture(count);
    assert.doesNotThrow(() => assertCityGameState(state));
    assert.doesNotThrow(() => assertCityGameState(completeCityDraft(state)));
  }
});

test("CITY whole-state validator rejects malformed values, versions, and platform fields", () => {
  const state = createCityFixture();
  for (const value of [null, [], {}, { ...state, rulesVersion: "city-rules-v2" },
    { ...state, cardSetVersion: "gem-cardset-v1" }, { ...state, roleSetVersion: "future-role-set" },
    { ...state, gameId: "" }, { ...state, gameRevision: 1 }, { ...state, sessionToken: "forbidden" }]) {
    assert.throws(() => assertCityGameState(value));
  }
});

test("CITY state validator rejects one/seven players and duplicate or mismatching rosters", () => {
  const state = createCityFixture();
  const first = state.players[0];
  assert.ok(first);
  for (const value of [
    { ...state, players: [first] }, { ...state, players: Array.from({ length: 7 }, () => first) },
    { ...state, players: [first, first, ...state.players.slice(2)] },
    { ...state, seatOrder: state.seatOrder.slice(1) },
    { ...state, seatOrder: [state.seatOrder[0], state.seatOrder[0], state.seatOrder[2]] },
  ]) assert.throws(() => assertCityGameState(value));
});

test("CITY state validator rejects negative, fractional, infinite, unsafe gold and streaks", () => {
  const state = createCityFixture();
  for (const gold of [-1, 0.1, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => assertCityGameState({ ...state, players: state.players.map((player, index) => index === 0 ? { ...player, gold } : player) }));
  for (const offlineTimeoutStreak of [-1, 0.5, 3, 4])
    assert.throws(() => assertCityGameState({ ...state, players: state.players.map((player, index) => index === 0 ? { ...player, offlineTimeoutStreak } : player) }));
});

test("CITY state validator rejects duplicate, missing, and forged physical card zones", () => {
  const state = createCityFixture();
  const first = state.deck[0];
  assert.ok(first);
  assert.throws(() => assertCityGameState({ ...state, deck: [...state.deck, first] }));
  assert.throws(() => assertCityGameState({ ...state, deck: state.deck.slice(1) }));
  assert.throws(() => assertCityGameState({ ...state, deck: [parseBuildingCardId("not-in-catalog"), ...state.deck.slice(1)] }));
  assert.throws(() => assertCityGameState({ ...state, discard: [first] }));
});

test("CITY state validator rejects registry corruption and duplicate city templates", () => {
  const state = createCityFixture();
  assert.throws(() => assertCityGameState({ ...state, cards: state.cards.slice(1) }));
  assert.throws(() => assertCityGameState({ ...state, cards: state.cards.map((card, index) => index === 0 ? { ...card, templateId: "CB-CIV-02" } : card) }));
  assert.throws(() => assertCityGameState({ ...state, cards: state.cards.map((card, index) => index === 0 ? { ...card, cost: 0 } : card) }));
  const owner = state.seatOrder[0];
  assert.ok(owner);
  const duplicate = withCityZones(state, { cities: [{ playerId: owner, cardIds: [cityCard(state, "CB-CIV-01"), cityCard(state, "CB-CIV-01", 1)] }] });
  assert.throws(() => assertCityGameState(duplicate));
});

test("CITY role partition rejects missing, duplicate, foreign roles and removal-count drift", () => {
  const state = createCityFixture();
  const first = state.round.available[0];
  assert.ok(first);
  for (const round of [
    { ...state.round, available: state.round.available.slice(1) },
    { ...state.round, available: [...state.round.available, first] },
    { ...state.round, available: ["CR-09", ...state.round.available.slice(1)] },
    { ...state.round, hiddenRemoved: [...state.round.hiddenRemoved, first], available: state.round.available.slice(1) },
  ]) assert.throws(() => assertCityGameState({ ...state, round }));
});

test("CITY role draft validator rejects quota, cursor, queue and premature public role state", () => {
  const state = createCityFixture();
  for (const round of [
    { ...state.round, rolesPerPlayer: 1 }, { ...state.round, selectionCursor: 1 },
    { ...state.round, pickQueue: [...state.round.pickQueue].reverse() },
    { ...state.round, resolutionCursor: 1 }, { ...state.round, ended: true },
  ]) assert.throws(() => assertCityGameState({ ...state, round }));
  assert.throws(() => assertCityGameState({ ...state, revealedRoles: [{ roundNumber: 1, roleId: "CR-01", playerId: state.seatOrder[0], kind: "NORMAL" }] }));
});

test("CITY active role and actor must match one revealed assignment and current cursor", () => {
  const state = cityPlaying(atCityRole("CR-01"));
  assert.equal(state.window.kind, "ROLE_ACTION");
  if (state.window.kind !== "ROLE_ACTION") return;
  const other = state.seatOrder.find(id => id !== state.window.activePlayerId);
  assert.ok(other);
  for (const window of [
    { ...state.window, activePlayerId: other }, { ...state.window, activeRoleId: "CR-02" },
    { ...state.window, buildingsBuilt: 2 }, { ...state.window, buildingsBuilt: 1 },
    { ...state.window, abilityUsed: true },
  ]) assert.throws(() => assertCityGameState({ ...state, window }));
  assert.throws(() => assertCityGameState({ ...state, round: { ...state.round, resolutionCursor: 0 } }));
});

test("CITY pending choice owner/action/role and physical zones are correlated", () => {
  const state = cityPlaying(actCity(atCityRole("CR-01"), { kind: "DRAW_BUILDING_CARDS" }));
  const pending = state.pendingChoice;
  assert.ok(pending);
  assert.doesNotThrow(() => assertCityGameState(state));
  const other = state.seatOrder.find(id => id !== pending.ownerPlayerId);
  for (const pendingChoice of [
    { ...pending, ownerPlayerId: other }, { ...pending, actionId: parseCityActionId("stale") },
    { ...pending, roleId: "CR-02" }, { ...pending, cards: [] },
  ]) assert.throws(() => assertCityGameState({ ...state, pendingChoice }));
  assert.throws(() => assertCityGameState({ ...state, window: { ...state.window, acquisition: "COMPLETE" } }));
});

test("CITY mark validation rejects forged source, premature resolution, and early disabled reveal", () => {
  let state = actCity(atCityRole("CR-01"), { kind: "TAKE_INCOME" });
  state = actCity(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_DISABLED", targetRoleId: "CR-05" } });
  const mark = state.marks[0];
  assert.ok(mark);
  assert.doesNotThrow(() => assertCityGameState(state));
  assert.throws(() => assertCityGameState({ ...state, marks: [{ ...mark, status: "RESOLVED" }] }));
  assert.throws(() => assertCityGameState({ ...state, marks: [mark, mark] }));
  assert.throws(() => assertCityGameState({ ...state, marks: [{ ...mark, sourcePlayerId: state.seatOrder.find(id => id !== mark.sourcePlayerId) }] }));
  assert.throws(() => assertCityGameState({ ...state, revealedRoles: [...state.revealedRoles,
    { roundNumber: state.round.roundNumber, roleId: "CR-05", playerId: state.seatOrder[0], kind: "DISABLED" }] }));
});

test("CITY forged forfeit state cannot retain hand/gold or unresolved owned roles", () => {
  const state = completeCityDraft(createCityFixture());
  const target = state.seatOrder.find(id => id !== cityContext(state).playerId);
  assert.ok(target);
  assert.throws(() => assertCityGameState({ ...state, players: state.players.map(player => player.playerId === target ? { ...player, forfeited: true } : player) }));
  const valid = forfeitCityPlayers(state, [target], cityEntropy(state));
  assert.doesNotThrow(() => assertCityGameState(valid));
  assert.throws(() => assertCityGameState({ ...valid, players: valid.players.map(player => player.playerId === target ? { ...player, gold: 1 } : player) }));
});

test("CITY terminal result rejects forged scoring, winner, reason, and a live window", () => {
  const initial = createCityFixture(2);
  const target = initial.seatOrder[1];
  assert.ok(target);
  const state = forfeitCityPlayers(initial, [target]);
  assert.ok(state.result);
  assert.doesNotThrow(() => assertCityGameState(state));
  assert.throws(() => assertCityGameState({ ...state, result: { ...state.result, reason: "NO_ELIGIBLE_PLAYERS" } }));
  assert.throws(() => assertCityGameState({ ...state, result: { ...state.result, rankings: state.result.rankings.map((row, index) => index === 0 ? { ...row, score: row.score + 1 } : row) } }));
  assert.throws(() => assertCityGameState({ ...state, result: { ...state.result, rankings: state.result.rankings.map(row => ({ ...row, winner: false })) } }));
  assert.throws(() => assertCityGameState({ ...state, window: initial.window }));
});

test("CITY validator preserves all secret state and validates detached nested clones", () => {
  const state = actCity(atCityRole("CR-01"), { kind: "DRAW_BUILDING_CARDS" });
  const before = structuredClone(state);
  assertCityGameState(state);
  const cloned = cloneCityGameState(state);
  assertCityGameState(cloned);
  assert.deepEqual(state, before);
  assert.deepEqual(cloned, state);
  assert.notEqual(cloned.players, state.players);
  assert.notEqual(cloned.players[0]?.hand, state.players[0]?.hand);
  assert.notEqual(cloned.round.assignments, state.round.assignments);
  assert.notEqual(cloned.pendingChoice?.cards, state.pendingChoice?.cards);
  assert.ok(Object.isFrozen(cloned) && Object.isFrozen(cloned.pendingChoice?.cards));
});

test("CITY LPS retains surviving pending cards without manufacturing a final choice", () => {
  const state = actCity(atCityRole("CR-01"), { kind: "DRAW_BUILDING_CARDS" });
  const owner = cityContext(state).playerId;
  const finished = forfeitCityPlayers(state, state.seatOrder.filter(id => id !== owner));
  assert.equal(finished.result?.reason, "LAST_PLAYER_STANDING");
  assert.deepEqual(finished.pendingChoice, state.pendingChoice);
  assert.equal(finished.window, null);
  assert.doesNotThrow(() => assertCityGameState(finished));
  assert.throws(() => assertCityGameState({ ...finished, pendingChoice: null }));
  assert.throws(() => assertCityGameState({ ...finished, pendingChoice: { ...finished.pendingChoice, ownerPlayerId: state.seatOrder.find(id => id !== owner) } }));
});

test("CITY validator rejects missing/future completion latch and premature protection", () => {
  const initial = atCityRole("CR-01");
  const owner = cityContext(initial).playerId;
  const templateIds = [...new Set(initial.cards.map(card => card.templateId))].slice(0, 8);
  const state = withCityZones(initial, { cities: [{ playerId: owner, cardIds: templateIds.map(template => cityCard(initial, template)) }] });
  assert.throws(() => assertCityGameState(state));
  const latched = { ...state, firstCompletion: { playerId: owner, roundNumber: state.round.roundNumber } };
  assert.doesNotThrow(() => assertCityGameState(latched));
  assert.throws(() => assertCityGameState({ ...latched, firstCompletion: { playerId: owner, roundNumber: state.round.roundNumber + 1 } }));
  assert.throws(() => assertCityGameState({ ...initial, round: { ...initial.round, protectedPlayerIds: [owner] } }));
});
