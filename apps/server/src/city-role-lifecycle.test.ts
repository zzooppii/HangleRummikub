import assert from "node:assert/strict";
import test from "node:test";
import { CITY_BUILDING_TEMPLATES } from "./games/city-role/domain/cardset-v1.js";
import type { CityGameState } from "./games/city-role/domain/game-state.js";
import { parseCityActionId } from "./games/city-role/domain/identity.js";
import { CITY_ROLE_IDS, type CityRoleId } from "./games/city-role/domain/role.js";
import { CityRuleError, forfeitCityPlayers, resetCityOfflineStreak, timeoutCityWindow } from "./games/city-role/domain/rule-engine.js";
import { actCity, assertCityCardConservation, atCityRole, cityCard, cityContext, cityEntropy, cityPlayer, cityPlaying, completeCityDraft, createCityFixture, withCityGold, withCityZones } from "./testing/city-role-fixtures.test.js";

const SIX_ROLES: readonly CityRoleId[] = ["CR-01", "CR-02", "CR-03", "CR-04", "CR-05", "CR-06"];
const NO_EIGHT: readonly CityRoleId[] = ["CR-08", ...SIX_ROLES, "CR-07"];

function roleOf(state: CityGameState): CityRoleId {
  const window = cityPlaying(state).window;
  assert.equal(window.kind, "ROLE_ACTION");
  if (window.kind !== "ROLE_ACTION") throw new Error("expected role action");
  return window.activeRoleId;
}

function endCityRole(state: CityGameState): CityGameState {
  const window = cityPlaying(state).window;
  assert.equal(window.kind, "ROLE_ACTION");
  if (window.kind !== "ROLE_ACTION") throw new Error("expected role action");
  let next = state;
  if (window.acquisition === "NOT_TAKEN") next = actCity(next, { kind: "TAKE_INCOME" });
  return actCity(next, { kind: "END_TURN" });
}

function advanceToRole(state: CityGameState, roleId: CityRoleId): CityGameState {
  let next = state;
  for (let steps = 0; steps < 8 && roleOf(next) !== roleId; steps += 1) next = endCityRole(next);
  assert.equal(roleOf(next), roleId);
  return next;
}

function withStreak(state: CityGameState, streak: number): CityGameState {
  const actor = cityContext(state).playerId;
  return { ...state, players: state.players.map((player) => player.playerId === actor ? { ...player, offlineTimeoutStreak: streak } : player) };
}

for (const [count, quota, publicRemoved] of [[2, 2, 2], [3, 2, 0], [4, 1, 2], [5, 1, 1], [6, 1, 0]] as const) {
  test(`CITY ${count}-player setup/draft preserves approved quota, role partition and chooser order`, () => {
    let state = createCityFixture(count), old = structuredClone(state);
    assert.equal(state.players.length, count);
    assert.equal(state.leaderPlayerId, state.seatOrder[0]);
    assert.equal(state.deck.length, 60 - count * 4);
    assert.equal(state.rulesVersion, "city-rules-v1");
    assert.equal(state.cardSetVersion, "city-cardset-v1");
    assert.equal(state.roleSetVersion, "city-roles-v1");
    assert.ok(state.players.every((player) => player.gold === 2 && player.hand.length === 4 && player.city.length === 0));
    assert.equal(state.round.rolesPerPlayer, quota);
    assert.equal(state.round.hiddenRemoved.length, 1);
    assert.equal(state.round.publicRemoved.length, publicRemoved);
    const expectedQueue = quota === 2 ? [...state.seatOrder, ...state.seatOrder] : state.seatOrder;
    assert.deepEqual(state.round.pickQueue, expectedQueue);
    const chosen: CityRoleId[] = [];
    for (const playerId of expectedQueue) {
      assert.equal(state.window?.activePlayerId, playerId);
      const selected = state.round.available[0]!;
      chosen.push(selected);
      const previous = state, token = state.window?.actionId;
      state = actCity(state, { kind: "SELECT_ROLE", roleId: selected });
      assert.deepEqual(previous, old);
      assert.notEqual(state.window?.actionId, token);
      old = structuredClone(state);
      assertCityCardConservation(state);
    }
    assert.equal(state.round.assignments.length, count * quota);
    assert.equal(state.round.unselected.length, 1);
    assert.deepEqual(state.round.available, []);
    for (const playerId of state.seatOrder) assert.equal(state.round.assignments.filter((assignment) => assignment.playerId === playerId).length, quota);
    const partition = [...state.round.hiddenRemoved, ...state.round.publicRemoved, ...state.round.unselected, ...state.round.assignments.map((assignment) => assignment.roleId)];
    assert.deepEqual([...partition].sort(), [...CITY_ROLE_IDS]);
    assert.equal(new Set(partition).size, 8);
    assert.equal(roleOf(state), [...chosen].sort()[0]);
  });
}

test("CITY setup rejects one/seven players; two-player draft has no extra Classic discard between picks", () => {
  for (const count of [1, 7]) assert.throws(() => createCityFixture(count), CityRuleError);
  let state = createCityFixture(2);
  assert.equal(state.round.available.length, 5);
  for (let remaining = 4; remaining >= 1; remaining -= 1) {
    state = actCity(state, { kind: "SELECT_ROLE", roleId: state.round.available[0]! });
    assert.equal(state.round.hiddenRemoved.length, 1);
    assert.equal(state.round.publicRemoved.length, 2);
    assert.equal(state.round.available.length + state.round.unselected.length, remaining);
  }
  assert.equal(state.round.assignments.length, 4);
});

test("CITY selection rejects duplicate/unavailable roles and requires supplied fresh window identity", () => {
  const state = createCityFixture(), before = structuredClone(state), roleId = state.round.available[0]!;
  assert.throws(() => actCity(state, { kind: "SELECT_ROLE", roleId: state.round.hiddenRemoved[0]! }), CityRuleError);
  assert.throws(() => actCity(state, { kind: "SELECT_ROLE", roleId }, {}), CityRuleError);
  assert.throws(() => actCity(state, { kind: "SELECT_ROLE", roleId }, { nextActionId: state.window!.actionId }), CityRuleError);
  const next = actCity(state, { kind: "SELECT_ROLE", roleId });
  assert.throws(() => actCity(next, { kind: "SELECT_ROLE", roleId }), CityRuleError);
  assert.deepEqual(state, before);
});

test("CITY resolution follows role order, not draft/seat order, and two roles share one player's assets", () => {
  let state = completeCityDraft(createCityFixture(3, NO_EIGHT), ["CR-06", "CR-01", "CR-04", "CR-03", "CR-02", "CR-05"]);
  const ownerOne = state.round.assignments.find((assignment) => assignment.roleId === "CR-01")!.playerId;
  assert.equal(roleOf(state), "CR-01");
  const before = cityPlayer(state, ownerOne).gold;
  state = endCityRole(state);
  assert.equal(roleOf(state), "CR-02");
  assert.equal(cityContext(state).playerId, ownerOne);
  assert.equal(cityPlayer(state, ownerOne).gold, before + 2);
  const observed = ["CR-01", "CR-02"];
  for (const nextRole of ["CR-03", "CR-04", "CR-05", "CR-06"]) {
    state = endCityRole(state);
    observed.push(roleOf(state));
    assert.equal(roleOf(state), nextRole);
  }
  const newLeader = state.round.assignments.find((assignment) => assignment.roleId === "CR-04")!.playerId;
  state = endCityRole(state);
  assert.equal(state.round.roundNumber, 2);
  assert.equal(state.window?.kind, "ROLE_SELECTION");
  assert.equal(state.window?.activePlayerId, newLeader);
  assert.equal(state.round.rolesPerPlayer, 2);
  assert.deepEqual(observed, SIX_ROLES);
  assert.deepEqual(state.marks, []);
});

test("CITY CR-01 self-owned later role is a no-op before disable, while another owner's role skips", () => {
  let state = completeCityDraft(createCityFixture(3, NO_EIGHT), SIX_ROLES);
  const owner = cityContext(state).playerId;
  state = actCity(actCity(state, { kind: "TAKE_INCOME" }), { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_DISABLED", targetRoleId: "CR-04" } });
  state = advanceToRole(endCityRole(state), "CR-04");
  assert.equal(cityContext(state).playerId, owner);
  assert.equal(state.round.assignments.find((assignment) => assignment.roleId === "CR-04")?.status, "ACTIVE");
  assert.equal(state.marks[0]?.status, "RESOLVED");
  let other = completeCityDraft(createCityFixture(3, NO_EIGHT), SIX_ROLES);
  other = actCity(actCity(other, { kind: "TAKE_INCOME" }), { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_DISABLED", targetRoleId: "CR-05" } });
  other = advanceToRole(endCityRole(other), "CR-06");
  const disabled = other.round.assignments.find((assignment) => assignment.roleId === "CR-05");
  assert.equal(disabled?.status, "DISABLED");
  assert.equal(disabled?.revealed, false);
  assert.ok(!other.round.protectedPlayerIds.includes(disabled!.playerId));
});

test("CITY disabled CR-04 does not acquire leader or category income", () => {
  let state = completeCityDraft(createCityFixture(3, NO_EIGHT), ["CR-01", "CR-04", "CR-02", "CR-03", "CR-05", "CR-06"]);
  const leader = state.leaderPlayerId, target = state.round.assignments.find((assignment) => assignment.roleId === "CR-04")!.playerId;
  state = withCityZones(state, { cities: [{ playerId: target, cardIds: [cityCard(state, "CB-CIV-01")] }] });
  state = actCity(actCity(state, { kind: "TAKE_INCOME" }), { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_DISABLED", targetRoleId: "CR-04" } });
  const gold = cityPlayer(state, target).gold;
  state = advanceToRole(endCityRole(state), "CR-05");
  assert.equal(state.leaderPlayerId, leader);
  assert.equal(cityPlayer(state, target).gold, gold);
  assert.equal(state.round.assignments.find((assignment) => assignment.roleId === "CR-04")?.status, "DISABLED");
});

test("CITY CR-02 transfers all target gold before its category income and self-target remains no-op", () => {
  let state = completeCityDraft(createCityFixture(3, NO_EIGHT), SIX_ROLES);
  state = advanceToRole(state, "CR-02");
  const source = cityContext(state).playerId, target = state.round.assignments.find((assignment) => assignment.roleId === "CR-04")!.playerId;
  state = withCityGold(withCityZones(state, { cities: [{ playerId: target, cardIds: [cityCard(state, "CB-CIV-01"), cityCard(state, "CB-CIV-02")] }] }), target, 7);
  state = actCity(actCity(state, { kind: "TAKE_INCOME" }), { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_GOLD_TRANSFER", targetRoleId: "CR-04" } });
  const sourceGold = cityPlayer(state, source).gold;
  state = advanceToRole(endCityRole(state), "CR-04");
  assert.equal(cityPlayer(state, source).gold, sourceGold + 7);
  assert.equal(cityPlayer(state, target).gold, 2, "income follows transfer, not precedes it");
  assert.equal(state.leaderPlayerId, target);
  let self = atCityRole("CR-02");
  const own = cityContext(self).playerId;
  self = actCity(actCity(self, { kind: "TAKE_INCOME" }), { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_GOLD_TRANSFER", targetRoleId: "CR-05" } });
  const ownGold = cityPlayer(self, own).gold;
  self = advanceToRole(endCityRole(self), "CR-05");
  assert.equal(cityContext(self).playerId, own);
  assert.equal(cityPlayer(self, own).gold, ownGold);
});

test("CITY CR-02 accepts an already disabled hidden target and resolves without gold transfer", () => {
  let state = completeCityDraft(createCityFixture(3, NO_EIGHT), SIX_ROLES);
  state = actCity(actCity(state, { kind: "TAKE_INCOME" }), { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_DISABLED", targetRoleId: "CR-06" } });
  state = endCityRole(state);
  const source = cityContext(state).playerId;
  state = actCity(actCity(state, { kind: "TAKE_INCOME" }), { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_GOLD_TRANSFER", targetRoleId: "CR-06" } });
  const sourceGold = cityPlayer(state, source).gold;
  state = advanceToRole(endCityRole(state), "CR-05");
  state = endCityRole(state);
  assert.equal(state.round.roundNumber, 2);
  assert.equal(cityPlayer(state, source).gold, sourceGold + 2, "only the source's later CR-05 acquisition adds gold");
});

for (const [role, category, templateId] of [
  ["CR-04", "CIVIC", "CB-CIV-01"], ["CR-05", "CULTURE", "CB-CUL-01"],
  ["CR-06", "TRADE", "CB-TRA-01"], ["CR-08", "GUARD", "CB-GUA-01"],
] as const) {
  test(`CITY ${role} mandatory ${category} income is computed once at entry`, () => {
    const selected = ["CR-01", "CR-02", "CR-03", "CR-04", "CR-05", role] as CityRoleId[];
    const picks = [...new Set(selected)];
    for (const id of CITY_ROLE_IDS) if (picks.length < 6 && id !== "CR-07" && !picks.includes(id)) picks.push(id);
    picks.sort();
    let state = completeCityDraft(createCityFixture(3, ["CR-07", ...CITY_ROLE_IDS.filter((id) => id !== "CR-07")]), picks);
    const previous = picks[picks.indexOf(role) - 1]!;
    state = advanceToRole(state, previous);
    const target = state.round.assignments.find((assignment) => assignment.roleId === role)!.playerId;
    state = withCityZones(state, { cities: [{ playerId: target, cardIds: [cityCard(state, templateId)] }] });
    const gold = cityPlayer(state, target).gold;
    const sameActor = cityContext(state).playerId === target;
    state = endCityRole(state);
    assert.equal(roleOf(state), role);
    assert.equal(cityPlayer(state, target).gold, gold + 1 + (sameActor ? 2 : 0));
    const entryGold = cityPlayer(state, target).gold;
    state = actCity(state, { kind: "TAKE_INCOME" });
    assert.equal(cityPlayer(state, target).gold, entryGold + (role === "CR-06" ? 3 : 2));
    if (role === "CR-05") assert.ok(state.round.protectedPlayerIds.includes(target));
  });
}

test("CITY CR-07 bonus takes up to two cards at entry without pending choice and has a role-local budget", () => {
  const selected: readonly CityRoleId[] = ["CR-01", "CR-02", "CR-03", "CR-04", "CR-07", "CR-08"];
  let state = completeCityDraft(createCityFixture(3, ["CR-06", "CR-05", ...selected]), selected);
  state = advanceToRole(state, "CR-04");
  const target = state.round.assignments.find((assignment) => assignment.roleId === "CR-07")!.playerId;
  const holder = state.players.find((player) => player.playerId !== target)!.playerId;
  const ids = state.cards.map((card) => card.cardId);
  state = withCityZones(state, { hands: [{ playerId: holder, cardIds: ids.slice(1) }], deck: [ids[0]!] });
  state = endCityRole(state);
  assert.equal(roleOf(state), "CR-07");
  assert.deepEqual(cityPlayer(state, target).hand, [ids[0]]);
  assert.equal(state.pendingChoice, null);
  assert.equal(state.deck.length, 0);
  state = endCityRole(state);
  assert.equal(roleOf(state), "CR-08");
  const window = cityPlaying(state).window;
  assert.ok(window.kind === "ROLE_ACTION" && window.buildingsBuilt === 0 && !window.abilityUsed);
  assertCityCardConservation(state);
});

test("CITY selection timeout consumes only the supplied available role and adds offline streak", () => {
  const state = createCityFixture(), actor = cityContext(state).playerId;
  const roleId = state.round.available.at(-1)!;
  const next = timeoutCityWindow(state, cityContext(state), { offline: true, selectedRoleId: roleId }, cityEntropy(state));
  assert.equal(next.round.assignments[0]?.roleId, roleId);
  assert.equal(next.round.assignments[0]?.playerId, actor);
  assert.equal(cityPlayer(next, actor).offlineTimeoutStreak, 1);
  assert.throws(() => timeoutCityWindow(state, cityContext(state), { offline: true }, cityEntropy(state)), CityRuleError);
  assert.throws(() => timeoutCityWindow(state, cityContext(state), { offline: true, selectedRoleId: state.round.hiddenRemoved[0]! }, cityEntropy(state)), CityRuleError);
  assert.equal(cityPlayer(state, actor).offlineTimeoutStreak, 0);
});

test("CITY connected action timeout takes default gold without building or changing offline streak", () => {
  const state = withStreak(atCityRole("CR-06"), 2), actor = cityContext(state).playerId;
  const before = cityPlayer(state, actor), next = timeoutCityWindow(state, cityContext(state), { offline: false }, cityEntropy(state));
  assert.equal(cityPlayer(next, actor).gold, before.gold + 3);
  assert.equal(cityPlayer(next, actor).offlineTimeoutStreak, 2);
  assert.equal(cityPlayer(next, actor).forfeited, false);
  assert.deepEqual(cityPlayer(next, actor).city, before.city);
  assert.deepEqual(cityPlayer(next, actor).hand, before.hand);
});

test("CITY timeout after acquisition takes no second income and pending timeout keeps first/bottoms the rest", () => {
  let state = actCity(atCityRole("CR-03"), { kind: "TAKE_INCOME" });
  const actor = cityContext(state).playerId, gold = cityPlayer(state).gold;
  state = timeoutCityWindow(state, cityContext(state), { offline: false }, cityEntropy(state));
  assert.equal(cityPlayer(state, actor).gold, gold);
  let pending = actCity(atCityRole("CR-03"), { kind: "DRAW_BUILDING_CARDS" });
  const owner = cityContext(pending).playerId, candidates = pending.pendingChoice!.cards;
  const hand = cityPlayer(pending, owner).hand;
  pending = timeoutCityWindow(pending, cityContext(pending), { offline: false }, cityEntropy(pending));
  assert.deepEqual(cityPlayer(pending, owner).hand, [...hand, candidates[0]]);
  assert.equal(pending.deck.at(-1), candidates[1]);
  assert.equal(pending.pendingChoice, null);
  assertCityCardConservation(pending);
});

test("CITY resume resets only the offline streak and preserves current action and pending cards", () => {
  const pending = withStreak(actCity(atCityRole("CR-03"), { kind: "DRAW_BUILDING_CARDS" }), 2);
  const actor = cityContext(pending).playerId, next = resetCityOfflineStreak(pending, actor);
  assert.equal(cityPlayer(next, actor).offlineTimeoutStreak, 0);
  assert.deepEqual(next.window, pending.window);
  assert.deepEqual(next.pendingChoice, pending.pendingChoice);
  assert.deepEqual(next.deck, pending.deck);
  assert.deepEqual(next.players.map((player) => ({ ...player, offlineTimeoutStreak: 0 })), pending.players.map((player) => ({ ...player, offlineTimeoutStreak: 0 })));
});

for (const [sourceRole, targetRole, kind] of [["CR-01", "CR-05", "MARK_ROLE_DISABLED"], ["CR-02", "CR-06", "MARK_ROLE_GOLD_TRANSFER"]] as const) {
  test(`CITY E01 forfeiting ${sourceRole} source cancels unresolved marks before target entry`, () => {
    let state = atCityRole(sourceRole), source = cityContext(state).playerId;
    state = actCity(actCity(state, { kind: "TAKE_INCOME" }), { kind: "USE_ROLE_ABILITY", ability: { kind, targetRoleId: targetRole } });
    state = forfeitCityPlayers(state, [source], cityEntropy(state));
    assert.equal(state.marks[0]?.status, "CANCELLED");
    state = advanceToRole(state, targetRole);
    assert.equal(roleOf(state), targetRole);
    assert.equal(cityPlayer(state, source).gold, 0);
    assert.equal(cityPlayer(state, source).forfeited, true);
    assert.ok(cityPlayer(state).gold > 0);
    assertCityCardConservation(state);
  });
}

test("CITY E01 resolved interference is not rolled back when its source later forfeits", () => {
  let state = atCityRole("CR-02"), source = cityContext(state).playerId;
  const target = state.round.assignments.find((assignment) => assignment.roleId === "CR-04")!.playerId;
  state = actCity(actCity(state, { kind: "TAKE_INCOME" }), { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_GOLD_TRANSFER", targetRoleId: "CR-04" } });
  state = advanceToRole(endCityRole(state), "CR-04");
  assert.equal(cityPlayer(state, target).gold, 0);
  assert.equal(state.marks[0]?.status, "RESOLVED");
  state = forfeitCityPlayers(state, [source]);
  assert.equal(cityPlayer(state, target).gold, 0);
  assert.equal(state.marks[0]?.status, "RESOLVED");
});

test("CITY explicit leave discards hand and every pending card, freezes city, zeroes gold and transfers leader", () => {
  let state = atCityRole("CR-04");
  const actor = cityContext(state).playerId, building = cityCard(state, "CB-CIV-01");
  state = withCityZones(state, { cities: [{ playerId: actor, cardIds: [building] }], hands: [{ playerId: actor, cardIds: [state.cards[10]!.cardId] }] });
  state = actCity(state, { kind: "DRAW_BUILDING_CARDS" });
  const candidates = state.pendingChoice!.cards, hand = cityPlayer(state).hand;
  const next = forfeitCityPlayers(state, [actor], cityEntropy(state));
  assert.equal(cityPlayer(next, actor).gold, 0);
  assert.deepEqual(cityPlayer(next, actor).hand, []);
  assert.deepEqual(cityPlayer(next, actor).city, [building]);
  assert.ok([...hand, ...candidates].every((id) => next.discard.includes(id)));
  assert.equal(next.pendingChoice, null);
  assert.notEqual(next.leaderPlayerId, actor);
  assert.ok(next.round.assignments.filter((assignment) => assignment.playerId === actor).every((assignment) => assignment.status === "TOMBSTONED"));
  assertCityCardConservation(next);
});

test("CITY leave keeps current-round quota and private selected tombstone, skipping future picks", () => {
  let state = createCityFixture(3, NO_EIGHT), actor = cityContext(state).playerId;
  const selected = state.round.available[0]!;
  state = actCity(state, { kind: "SELECT_ROLE", roleId: selected });
  const currentActionId = state.window?.actionId;
  state = forfeitCityPlayers(state, [actor]);
  assert.equal(state.window?.actionId, currentActionId);
  assert.equal(state.round.rolesPerPlayer, 2);
  assert.equal(state.round.assignments[0]?.status, "TOMBSTONED");
  assert.equal(state.round.assignments[0]?.revealed, false);
  assert.ok(!state.round.available.includes(selected));
  state = completeCityDraft(state);
  assert.equal(state.round.assignments.length, 5);
  assert.equal(state.round.unselected.length, 2);
  assert.ok(state.round.assignments.filter((assignment) => assignment.playerId !== actor).every((assignment) => assignment.status !== "TOMBSTONED"));
});

test("CITY E02 third offline timeout resolves pending first, then discards only kept hand on forfeit", () => {
  const state = withStreak(actCity(atCityRole("CR-03"), { kind: "DRAW_BUILDING_CARDS" }), 2);
  const actor = cityContext(state).playerId, candidates = state.pendingChoice!.cards;
  const next = timeoutCityWindow(state, cityContext(state), { offline: true }, cityEntropy(state));
  assert.equal(cityPlayer(next, actor).forfeited, true);
  assert.equal(cityPlayer(next, actor).offlineTimeoutStreak, 3);
  assert.ok(next.discard.includes(candidates[0]!));
  assert.ok(!next.discard.includes(candidates[1]!));
  assert.equal(next.deck.at(-1), candidates[1]);
  assert.equal(next.pendingChoice, null);
  assertCityCardConservation(next);
});

test("CITY E02 last-role third timeout forfeits before next-round 4→3 player quota calculation", () => {
  let state = completeCityDraft(createCityFixture(4, ["CR-08", "CR-07", "CR-06", "CR-01", "CR-02", "CR-03", "CR-04", "CR-05"]), ["CR-01", "CR-02", "CR-03", "CR-04"]);
  state = withStreak(advanceToRole(state, "CR-04"), 2);
  const actor = cityContext(state).playerId;
  const next = timeoutCityWindow(state, cityContext(state), { offline: true }, cityEntropy(state));
  assert.equal(cityPlayer(next, actor).forfeited, true);
  assert.equal(next.round.roundNumber, 2);
  assert.equal(next.round.rolesPerPlayer, 2);
  assert.equal(next.round.eligibleAtSetup.length, 3);
  assert.equal(next.round.pickQueue.length, 6);
  assert.equal(next.round.publicRemoved.length, 0);
  assert.ok(!next.round.pickQueue.includes(actor));
});

test("CITY E02 third timeout checks completion before forfeit and refuses every post-terminal action", () => {
  let state = withStreak(atCityRole("CR-06"), 2);
  const actor = cityContext(state).playerId;
  const buildings = CITY_BUILDING_TEMPLATES.slice(0, 8).map((template) => cityCard(state, template.templateId));
  state = { ...withCityZones(state, { cities: [{ playerId: actor, cardIds: buildings }] }), firstCompletion: { playerId: actor, roundNumber: 1 } };
  const next = timeoutCityWindow(state, cityContext(state), { offline: true });
  assert.equal(next.result?.reason, "CITY_COMPLETION_ROUND_END");
  assert.equal(cityPlayer(next, actor).forfeited, false);
  assert.equal(cityPlayer(next, actor).offlineTimeoutStreak, 3);
  assert.equal(next.round.roundNumber, 1);
  assert.equal(next.window, null);
  assert.throws(() => forfeitCityPlayers(next, [actor]), CityRuleError);
  assert.throws(() => resetCityOfflineStreak(next, actor), CityRuleError);
  assertCityCardConservation(next);
});

test("CITY pending candidates remain conserved when another player's leave causes immediate LPS", () => {
  let state = completeCityDraft(createCityFixture(2));
  state = actCity(state, { kind: "DRAW_BUILDING_CARDS" });
  const actor = cityContext(state).playerId, other = state.players.find((player) => player.playerId !== actor)!.playerId;
  const next = forfeitCityPlayers(state, [other]);
  assert.equal(next.result?.reason, "LAST_PLAYER_STANDING");
  assert.equal(next.window, null);
  assert.deepEqual(next.pendingChoice, state.pendingChoice);
  assert.deepEqual(cityPlayer(next, actor).hand, cityPlayer(state, actor).hand);
  assertCityCardConservation(next);
});

test("CITY batched forfeit supports zero eligible without winner or invented new round", () => {
  const state = createCityFixture(), next = forfeitCityPlayers(state, state.seatOrder);
  assert.equal(next.result?.reason, "NO_ELIGIBLE_PLAYERS");
  assert.equal(next.window, null);
  assert.ok(next.result?.rankings.every((ranking) => ranking.forfeited && !ranking.winner));
  assert.equal(next.round.roundNumber, 1);
  assertCityCardConservation(next);
});

test("CITY unused shuffle input is never read; fresh action token is consumed only at window change", () => {
  const state = atCityRole("CR-03");
  let reads = 0;
  const next = actCity(state, { kind: "TAKE_INCOME" }, {
    get nextActionId() { reads += 1; return parseCityActionId("unused"); },
    get nextRoleOrder() { reads += 1; return []; },
    get discardOrder() { reads += 1; return []; },
  });
  assert.equal(reads, 0);
  assert.equal(next.window?.actionId, state.window?.actionId);
});

test("CITY normal round end preserves disabled-owner disclosure after the atomic next-round setup", () => {
  let state = completeCityDraft(createCityFixture(3, NO_EIGHT), SIX_ROLES);
  const owner = state.round.assignments.find((assignment) => assignment.roleId === "CR-05")!.playerId;
  state = actCity(actCity(state, { kind: "TAKE_INCOME" }), { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_DISABLED", targetRoleId: "CR-05" } });
  state = advanceToRole(endCityRole(state), "CR-06");
  assert.ok(!state.revealedRoles.some((reveal) => reveal.roleId === "CR-05"));
  state = endCityRole(state);
  assert.equal(state.round.roundNumber, 2);
  assert.deepEqual(state.revealedRoles.find((reveal) => reveal.roleId === "CR-05"), { roundNumber: 1, roleId: "CR-05", playerId: owner, kind: "DISABLED" });
  assert.deepEqual(state.marks, []);
  assert.deepEqual(state.round.protectedPlayerIds, []);
});

test("CITY disabled owner forfeiting before round end remains an unrevealed tombstone", () => {
  let state = completeCityDraft(createCityFixture(3, NO_EIGHT), SIX_ROLES);
  const owner = state.round.assignments.find((assignment) => assignment.roleId === "CR-05")!.playerId;
  state = actCity(actCity(state, { kind: "TAKE_INCOME" }), { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_DISABLED", targetRoleId: "CR-05" } });
  state = advanceToRole(endCityRole(state), "CR-06");
  state = forfeitCityPlayers(state, [owner]);
  const tombstone = state.round.assignments.find((assignment) => assignment.roleId === "CR-05");
  assert.equal(tombstone?.status, "TOMBSTONED");
  assert.equal(tombstone?.revealed, false);
  state = endCityRole(state);
  assert.equal(state.round.roundNumber, 2);
  assert.ok(!state.revealedRoles.some((reveal) => reveal.roundNumber === 1 && reveal.roleId === "CR-05"));
});

test("CITY immediate LPS does not perform normal round-end disabled-owner disclosure", () => {
  let state = completeCityDraft(createCityFixture(3, NO_EIGHT), SIX_ROLES);
  const owner = state.round.assignments.find((assignment) => assignment.roleId === "CR-05")!.playerId;
  state = actCity(actCity(state, { kind: "TAKE_INCOME" }), { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_DISABLED", targetRoleId: "CR-05" } });
  state = advanceToRole(endCityRole(state), "CR-06");
  const others = state.players.filter((player) => player.playerId !== owner).map((player) => player.playerId);
  const terminal = forfeitCityPlayers(state, others);
  assert.equal(terminal.result?.reason, "LAST_PLAYER_STANDING");
  assert.equal(terminal.round.assignments.find((assignment) => assignment.roleId === "CR-05")?.revealed, false);
  assert.ok(!terminal.revealedRoles.some((reveal) => reveal.roleId === "CR-05"));
});

test("CITY E02 third timeout cleans the source hand before the next CR-07 bonus draws from that discard", () => {
  const picks: readonly CityRoleId[] = ["CR-01", "CR-02", "CR-03", "CR-04", "CR-07", "CR-08"];
  let state = completeCityDraft(createCityFixture(3, ["CR-06", "CR-05", ...picks]), picks);
  state = withStreak(advanceToRole(state, "CR-04"), 2);
  const actor = cityContext(state).playerId, ids = state.cards.map((card) => card.cardId);
  const nextOwner = state.round.assignments.find((assignment) => assignment.roleId === "CR-07")!.playerId;
  state = withCityZones(state, { hands: [{ playerId: actor, cardIds: ids }] });
  const shuffled = [...ids].reverse();
  const next = timeoutCityWindow(state, cityContext(state), { offline: true }, { ...cityEntropy(state), discardOrder: shuffled });
  assert.equal(cityPlayer(next, actor).forfeited, true);
  assert.equal(roleOf(next), "CR-07");
  assert.deepEqual(cityPlayer(next, nextOwner).hand, shuffled.slice(0, 2));
  assert.deepEqual(next.deck, shuffled.slice(2));
  assert.deepEqual(next.discard, []);
  assertCityCardConservation(next);
});

test("CITY third selection timeout picks first, tombstones that role, and only then enters resolution", () => {
  let state = createCityFixture(3, NO_EIGHT);
  for (const roleId of SIX_ROLES.slice(0, 5)) state = actCity(state, { kind: "SELECT_ROLE", roleId });
  state = withStreak(state, 2);
  const actor = cityContext(state).playerId;
  const next = timeoutCityWindow(state, cityContext(state), { offline: true, selectedRoleId: "CR-07" }, cityEntropy(state));
  assert.equal(cityPlayer(next, actor).forfeited, true);
  assert.equal(next.round.assignments.find((assignment) => assignment.roleId === "CR-07")?.status, "TOMBSTONED");
  assert.equal(next.round.assignments.find((assignment) => assignment.roleId === "CR-07")?.revealed, false);
  assert.equal(roleOf(next), "CR-01");
  assert.deepEqual(next.round.unselected, ["CR-06"]);
  assertCityCardConservation(next);
});

test("CITY selection and role timeouts accumulate one offline streak before the third forfeit", () => {
  let state = createCityFixture(3, NO_EIGHT);
  const actor = cityContext(state).playerId;
  state = timeoutCityWindow(state, cityContext(state), { offline: true, selectedRoleId: "CR-01" }, cityEntropy(state));
  state = actCity(state, { kind: "SELECT_ROLE", roleId: "CR-02" });
  state = actCity(state, { kind: "SELECT_ROLE", roleId: "CR-03" });
  state = timeoutCityWindow(state, cityContext(state), { offline: true, selectedRoleId: "CR-04" }, cityEntropy(state));
  assert.equal(cityPlayer(state, actor).offlineTimeoutStreak, 2);
  assert.equal(cityPlayer(state, actor).forfeited, false);
  state = actCity(state, { kind: "SELECT_ROLE", roleId: "CR-05" });
  state = actCity(state, { kind: "SELECT_ROLE", roleId: "CR-06" });
  assert.equal(roleOf(state), "CR-01");
  state = timeoutCityWindow(state, cityContext(state), { offline: true }, cityEntropy(state));
  assert.equal(cityPlayer(state, actor).offlineTimeoutStreak, 3);
  assert.equal(cityPlayer(state, actor).forfeited, true);
  assert.equal(state.round.assignments.find((assignment) => assignment.roleId === "CR-04")?.status, "TOMBSTONED");
  assert.equal(roleOf(state), "CR-02");
});

test("CITY CR-07 three-build budget does not carry to the same player's later CR-08 role", () => {
  const picks: readonly CityRoleId[] = ["CR-01", "CR-02", "CR-07", "CR-03", "CR-04", "CR-08"];
  let state = completeCityDraft(createCityFixture(3, ["CR-06", "CR-05", ...picks]), picks);
  state = advanceToRole(state, "CR-07");
  const actor = cityContext(state).playerId;
  const ids = CITY_BUILDING_TEMPLATES.slice(0, 5).map((template) => cityCard(state, template.templateId));
  state = withCityGold(withCityZones(state, { hands: [{ playerId: actor, cardIds: ids }] }), actor, 100);
  state = actCity(state, { kind: "TAKE_INCOME" });
  for (const id of ids.slice(0, 3)) state = actCity(state, { kind: "BUILD", cardId: id });
  state = endCityRole(state);
  assert.equal(roleOf(state), "CR-08");
  assert.equal(cityContext(state).playerId, actor);
  state = actCity(state, { kind: "TAKE_INCOME" });
  state = actCity(state, { kind: "BUILD", cardId: ids[3]! });
  assert.throws(() => actCity(state, { kind: "BUILD", cardId: ids[4]! }), (error: unknown) => error instanceof CityRuleError && error.code === "BUILD_LIMIT");
  assert.equal(cityPlayer(state, actor).city.length, 4);
  assertCityCardConservation(state);
});
