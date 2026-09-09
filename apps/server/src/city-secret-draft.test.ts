import assert from "node:assert/strict";
import test from "node:test";
import { createInitialCityGameState, timeoutCityWindow, forfeitCityPlayers } from "./games/city-role/domain/rule-engine.js";
import { cloneCityGameState } from "./games/city-role/domain/game-state.js";
import { assertCityGameState } from "./games/city-role/domain/state-validator.js";
import { actCity, createCityFixture, cityContext, cityEntropy, CITY_TEST_ROLE_ORDER } from "./testing/city-role-fixtures.test.js";

function draft(count = 2) {
  const old = createCityFixture(count);
  return createInitialCityGameState({ gameId: old.gameId, playerIds: old.seatOrder, seatOrder: old.seatOrder,
    cards: old.cards, deck: old.deck, initialHands: old.players.map(p => ({ playerId: p.playerId, cardIds: p.hand })),
    actionId: cityContext(old).actionId, roleOrder: CITY_TEST_ROLE_ORDER, rulesVersion: "city-rules-v2", roleDraftVersion: "city-draft-v2" });
}
test("CITY secret draft: 7→5→3→automatic last; four hidden removals and two roles each", () => {
  let s = draft(); const original = JSON.stringify(s);
  assert.equal(s.round.available.length, 7); assert.deepEqual(s.round.publicRemoved, []);
  for (const size of [7, 5, 3]) {
    assert.equal(s.round.available.length, size);
    s = actCity(s, { kind: "SELECT_ROLE", roleId: s.round.available[0]!, discardRoleId: s.round.available[1]! });
    assertCityGameState(s);
  }
  assert.equal(s.round.hiddenRemoved.length, 4); assert.equal(s.round.available.length, 0);
  assert.equal(s.round.selectionCursor, 4); assert.equal(s.window?.kind, "ROLE_ACTION");
  for (const id of s.seatOrder) assert.equal(s.round.assignments.filter(a => a.playerId === id).length, 2);
  assert.equal(JSON.stringify(draft()), original);
});
test("CITY secret draft rejects missing, identical, hidden and unavailable discard without mutation", () => {
  const s = draft(), before = JSON.stringify(s), roleId = s.round.available[0]!;
  for (const discardRoleId of [undefined, roleId, s.round.hiddenRemoved[0]!]) {
    assert.throws(() => actCity(s, { kind: "SELECT_ROLE", roleId, ...(discardRoleId === undefined ? {} : { discardRoleId }) }));
    assert.equal(JSON.stringify(s), before);
  }
});
test("CITY secret draft clone/JSON recovery retains private partition and rejects duplicate action", () => {
  const old = draft(), context = cityContext(old);
  const s = actCity(old, { kind: "SELECT_ROLE", roleId: old.round.available[0]!, discardRoleId: old.round.available[1]! });
  const recovered: unknown = JSON.parse(JSON.stringify(s)); assertCityGameState(recovered);
  assert.deepEqual(cloneCityGameState(recovered), s);
  assert.throws(() => timeoutCityWindow(recovered, context, { offline: false, selectedRoleId: s.round.available[0]!, discardRoleId: s.round.available[1]! }, cityEntropy(s)));
});
test("CITY secret draft timeout consumes distinct entropy choices and automatically assigns final role", () => {
  let s = draft();
  for (let i = 0; i < 3; i++) s = timeoutCityWindow(s, cityContext(s), { offline: false,
    selectedRoleId: s.round.available[0]!, discardRoleId: s.round.available[1]! }, cityEntropy(s));
  assert.equal(s.round.assignments.length, 4); assert.equal(s.round.hiddenRemoved.length, 4);
  assert.equal(s.window?.kind, "ROLE_ACTION");
});
test("CITY secret draft leave and third offline timeout terminate with existing forfeit precedence", () => {
  const initial = draft();
  const left = forfeitCityPlayers(initial, [initial.seatOrder[0]!], cityEntropy(initial));
  assert.equal(left.result?.reason, "LAST_PLAYER_STANDING"); assertCityGameState(left);
  const s = { ...initial, players: initial.players.map((p, i) => i === 0 ? { ...p, offlineTimeoutStreak: 2 } : p) };
  const ended = timeoutCityWindow(s, cityContext(s), { offline: true, selectedRoleId: s.round.available[0]!, discardRoleId: s.round.available[1]! }, cityEntropy(s));
  assert.equal(ended.result?.reason, "LAST_PLAYER_STANDING"); assert.equal(ended.round.hiddenRemoved.length, 2); assertCityGameState(ended);
});
test("CITY three-player draft matches 7→6→5→4→3→2, two rounds of seats and one private remainder", () => {
  let s = draft(3);
  const seats = s.seatOrder, expected = [...seats, ...seats];
  const initialHidden = [...s.round.hiddenRemoved];
  const lastRole = s.round.available.at(-1)!;
  assert.deepEqual(s.round.pickQueue, expected);
  assert.deepEqual(s.round.publicRemoved, []);
  assert.equal(initialHidden.length, 1);
  for (let pick = 0; pick < 6; pick++) {
    assert.equal(s.window?.kind, "ROLE_SELECTION");
    assert.equal(s.window?.activePlayerId, expected[pick]);
    assert.equal(s.round.available.length, 7 - pick);
    const roleId = s.round.available[0]!;
    assert.throws(() => actCity(s, { kind: "SELECT_ROLE", roleId, discardRoleId: s.round.available[1]! }), "three-player does not discard at each pick");
    s = actCity(s, { kind: "SELECT_ROLE", roleId });
    assertCityGameState(s);
    assert.deepEqual(s.round.hiddenRemoved, initialHidden);
    assert.deepEqual(s.round.publicRemoved, []);
  }
  assert.equal(s.window?.kind, "ROLE_ACTION");
  assert.deepEqual(s.round.unselected, [lastRole]);
  assert.deepEqual(s.round.available, []);
  for (const id of seats) assert.equal(s.round.assignments.filter(a => a.playerId === id).length, 2);
  assert.equal(s.round.assignments.some(a => a.roleId === lastRole), false);
});
test("CITY three-player last pick timeout chooses one, privately excludes remainder and survives recovery", () => {
  let s = draft(3);
  for (let i = 0; i < 5; i++) s = actCity(s, { kind: "SELECT_ROLE", roleId: s.round.available[0]! });
  const [remainder, selectedRoleId] = s.round.available;
  assert.ok(selectedRoleId && remainder);
  const context = cityContext(s);
  const next = timeoutCityWindow(s, context, { offline: false, selectedRoleId }, cityEntropy(s));
  assert.equal(next.round.assignments.at(-1)?.roleId, selectedRoleId);
  assert.equal(next.round.assignments.at(-1)?.playerId, s.seatOrder[2]);
  assert.deepEqual(next.round.unselected, [remainder]);
  assert.deepEqual(next.round.publicRemoved, []);
  const restored: unknown = JSON.parse(JSON.stringify(next));
  assertCityGameState(restored);
  assert.deepEqual(cloneCityGameState(restored), next);
  assert.throws(() => timeoutCityWindow(restored, context, { offline: false, selectedRoleId }, cityEntropy(next)));
});
test("CITY legacy persisted draft stays unchanged; new draft leaves 3–6 player math unchanged", () => {
  assert.equal(createCityFixture(2).round.publicRemoved.length, 2);
  for (const count of [3, 4, 5, 6]) {
    const old = createCityFixture(count), current = draft(count);
    assert.deepEqual(current.round, old.round);
    assert.doesNotThrow(() => actCity(current, { kind: "SELECT_ROLE", roleId: current.round.available[0]! }));
  }
});
