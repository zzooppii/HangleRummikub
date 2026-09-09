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
test("CITY legacy persisted draft stays unchanged; new draft leaves 3–6 player math unchanged", () => {
  assert.equal(createCityFixture(2).round.publicRemoved.length, 2);
  for (const count of [3, 4, 5, 6]) {
    const old = createCityFixture(count), current = draft(count);
    assert.deepEqual(current.round, old.round);
    assert.doesNotThrow(() => actCity(current, { kind: "SELECT_ROLE", roleId: current.round.available[0]! }));
  }
});
