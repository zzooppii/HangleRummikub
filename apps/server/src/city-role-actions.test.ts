import assert from "node:assert/strict";
import test from "node:test";
import { CITY_BUILDING_TEMPLATES, getCityTemplate } from "./games/city-role/domain/cardset-v1.js";
import type { CityGameState } from "./games/city-role/domain/game-state.js";
import { parseBuildingCardId, parseCityActionId, parseCityGameId, parseCityPlayerId } from "./games/city-role/domain/identity.js";
import { applyCityAction, CityRuleError, type CityAction, type CityRuleFailure } from "./games/city-role/domain/rule-engine.js";
import { actCity, assertCityCardConservation, atCityRole, cityCard, cityContext, cityPlayer, cityPlaying, withCityGold, withCityZones } from "./testing/city-role-fixtures.test.js";

function rejects(state: CityGameState, action: CityAction, code?: CityRuleFailure): void {
  const before = structuredClone(state);
  assert.throws(() => actCity(state, action), (error: unknown) => error instanceof CityRuleError && (code === undefined || error.code === code));
  assert.deepEqual(state, before, "rejection preserves the entire input graph");
}

function ready(role: Parameters<typeof atCityRole>[0] = "CR-03"): CityGameState {
  return actCity(atCityRole(role), { kind: "TAKE_INCOME" });
}

function windowOf(state: CityGameState) {
  const window = cityPlaying(state).window;
  assert.equal(window.kind, "ROLE_ACTION");
  if (window.kind !== "ROLE_ACTION") throw new Error("expected action window");
  return { ...window, pendingChoice: state.pendingChoice };
}

test("CITY action guards reject stale game/action and another actor without mutations", () => {
  const state = atCityRole("CR-03"), context = cityContext(state);
  const before = structuredClone(state);
  for (const invalid of [
    { ...context, gameId: parseCityGameId("other-game") },
    { ...context, actionId: parseCityActionId("stale-action") },
    { ...context, playerId: parseCityPlayerId("absent-player") },
    { ...context, playerId: state.players.find((player) => player.playerId !== context.playerId)!.playerId },
  ]) assert.throws(() => applyCityAction(state, invalid, { kind: "TAKE_INCOME" }), CityRuleError);
  assert.deepEqual(state, before);
});

test("CITY acquisition gives exactly gold 2 once without replacing the action identity", () => {
  const state = atCityRole("CR-03"), player = cityPlayer(state);
  const next = actCity(state, { kind: "TAKE_INCOME" });
  assert.equal(cityPlayer(next).gold, player.gold + 2);
  assert.equal(next.window?.actionId, state.window?.actionId);
  assert.equal(windowOf(next).acquisition, "COMPLETE");
  rejects(next, { kind: "TAKE_INCOME" }, "ACQUISITION_TAKEN");
  rejects(next, { kind: "DRAW_BUILDING_CARDS" }, "ACQUISITION_TAKEN");
});

test("CITY draw keeps exact private pending cards; choose returns the unchosen card to deck bottom", () => {
  const state = atCityRole("CR-03"), actor = cityContext(state).playerId;
  const before = structuredClone(state), drawn = state.deck.slice(0, 2);
  const pending = actCity(state, { kind: "DRAW_BUILDING_CARDS" });
  assert.deepEqual(windowOf(pending).pendingChoice, { kind: "DRAW_BUILDING", ownerPlayerId: actor, actionId: state.window?.actionId, roleId: "CR-03", cards: drawn });
  assert.deepEqual(cityPlayer(pending).hand, cityPlayer(state).hand);
  assert.deepEqual(pending.deck, state.deck.slice(2));
  assertCityCardConservation(pending);
  rejects(pending, { kind: "DRAW_BUILDING_CARDS" });
  rejects(pending, { kind: "BUILD", cardId: cityPlayer(state).hand[0]! }, "PENDING_CHOICE");
  rejects(pending, { kind: "END_TURN" }, "PENDING_CHOICE");
  rejects(pending, { kind: "USE_ROLE_ABILITY", ability: { kind: "REPLACE_OWN_CARDS", cardIds: [cityPlayer(state).hand[0]!] } }, "PENDING_CHOICE");
  rejects(pending, { kind: "CHOOSE_BUILDING_CARD", cardId: state.deck[3]! }, "INVALID_CARD");
  const chosen = actCity(pending, { kind: "CHOOSE_BUILDING_CARD", cardId: drawn[1]! });
  assert.deepEqual(cityPlayer(chosen).hand, [...cityPlayer(state).hand, drawn[1]]);
  assert.deepEqual(chosen.deck, [...state.deck.slice(2), drawn[0]]);
  assert.equal(windowOf(chosen).pendingChoice, null);
  assert.equal(windowOf(chosen).acquisition, "COMPLETE");
  assert.equal(chosen.window?.actionId, state.window?.actionId);
  assert.deepEqual(state, before);
  assertCityCardConservation(chosen);
});

test("CITY partial one-card draw still requires choose, while zero supply rejects and permits gold", () => {
  let state = atCityRole("CR-03");
  const actor = cityContext(state).playerId, ids = state.cards.map((card) => card.cardId);
  state = withCityZones(state, { hands: [{ playerId: actor, cardIds: ids.slice(1) }], deck: ids.slice(0, 1) });
  const pending = actCity(state, { kind: "DRAW_BUILDING_CARDS" });
  assert.deepEqual(windowOf(pending).pendingChoice?.cards, [ids[0]]);
  const chosen = actCity(pending, { kind: "CHOOSE_BUILDING_CARD", cardId: ids[0]! });
  assert.equal(cityPlayer(chosen).hand.length, 60);
  assert.equal(chosen.deck.length, 0);
  const empty = withCityZones(atCityRole("CR-03"), { hands: [{ playerId: actor, cardIds: ids }] });
  rejects(empty, { kind: "DRAW_BUILDING_CARDS" }, "EMPTY_SUPPLY");
  assert.equal(cityPlayer(actCity(empty, { kind: "TAKE_INCOME" })).gold, cityPlayer(empty).gold + 2);
  assertCityCardConservation(chosen);
});

test("CITY draw consumes deck first and reshuffles only the exact supplied discard permutation", () => {
  let state = atCityRole("CR-03");
  const actor = cityContext(state).playerId, ids = state.cards.map((card) => card.cardId);
  state = withCityZones(state, { hands: [{ playerId: actor, cardIds: ids.slice(4) }], deck: [ids[0]!], discard: ids.slice(1, 4) });
  const before = structuredClone(state);
  assert.throws(() => actCity(state, { kind: "DRAW_BUILDING_CARDS" }, {}), CityRuleError);
  assert.throws(() => actCity(state, { kind: "DRAW_BUILDING_CARDS" }, { discardOrder: [ids[1]!, ids[1]!, ids[2]!] }), CityRuleError);
  const pending = actCity(state, { kind: "DRAW_BUILDING_CARDS" }, { discardOrder: [ids[3]!, ids[2]!, ids[1]!] });
  assert.deepEqual(windowOf(pending).pendingChoice?.cards, [ids[0], ids[3]]);
  assert.deepEqual(pending.deck, [ids[2], ids[1]]);
  assert.deepEqual(pending.discard, []);
  assert.deepEqual(state, before);
  assertCityCardConservation(pending);
});

test("CITY build requires acquisition, pays printed cost, transfers one physical card and stops at the default budget", () => {
  let state = atCityRole("CR-03");
  const actor = cityContext(state).playerId, first = cityCard(state, "CB-CIV-01"), second = cityCard(state, "CB-CUL-01");
  state = withCityGold(withCityZones(state, { hands: [{ playerId: actor, cardIds: [first, second] }] }), actor, 10);
  rejects(state, { kind: "BUILD", cardId: first }, "ACQUISITION_REQUIRED");
  state = actCity(state, { kind: "TAKE_INCOME" });
  const built = actCity(state, { kind: "BUILD", cardId: first });
  assert.equal(cityPlayer(built).gold, 11);
  assert.deepEqual(cityPlayer(built).hand, [second]);
  assert.deepEqual(cityPlayer(built).city, [first]);
  assert.equal(windowOf(built).buildingsBuilt, 1);
  assert.equal(built.window?.actionId, state.window?.actionId);
  rejects(built, { kind: "BUILD", cardId: second }, "BUILD_LIMIT");
  assertCityCardConservation(built);
});

test("CITY build rejects another hand, forged identity, insufficient gold and a physical duplicate of a built template", () => {
  let state = ready();
  const actor = cityContext(state).playerId, first = cityCard(state, "CB-CIV-01"), copy = cityCard(state, "CB-CIV-01", 1), expensive = cityCard(state, "CB-CIV-06");
  state = withCityGold(withCityZones(state, { hands: [{ playerId: actor, cardIds: [copy, expensive] }], cities: [{ playerId: actor, cardIds: [first] }] }), actor, 0);
  rejects(state, { kind: "BUILD", cardId: copy }, "DUPLICATE_TEMPLATE");
  rejects(state, { kind: "BUILD", cardId: expensive }, "INSUFFICIENT_GOLD");
  rejects(state, { kind: "BUILD", cardId: state.deck[0]! }, "INVALID_CARD");
  rejects(state, { kind: "BUILD", cardId: parseBuildingCardId("forged-card") }, "INVALID_CARD");
});

test("CITY CR-07 builds at most three, latches the eighth city card and permits ninth/tenth before round end", () => {
  let state = ready("CR-07");
  const actor = cityContext(state).playerId;
  const distinct = CITY_BUILDING_TEMPLATES.slice(0, 11).map((template) => cityCard(state, template.templateId));
  state = withCityGold(withCityZones(state, { cities: [{ playerId: actor, cardIds: distinct.slice(0, 7) }], hands: [{ playerId: actor, cardIds: distinct.slice(7) }] }), actor, 100);
  for (const [index, id] of distinct.slice(7, 10).entries()) {
    state = actCity(state, { kind: "BUILD", cardId: id });
    assert.equal(cityPlayer(state).city.length, 8 + index);
    assert.deepEqual(state.firstCompletion, { playerId: actor, roundNumber: 1 });
    assert.equal(state.result, null);
  }
  rejects(state, { kind: "BUILD", cardId: distinct[10]! }, "BUILD_LIMIT");
  assert.equal(windowOf(state).buildingsBuilt, 3);
  assertCityCardConservation(state);
});

test("CITY optional abilities cannot precede acquisition and a different role cannot execute them", () => {
  const state = atCityRole("CR-03");
  rejects(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "REPLACE_OWN_CARDS", cardIds: [cityPlayer(state).hand[0]!] } }, "ACQUISITION_REQUIRED");
  rejects(ready("CR-04"), { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_DISABLED", targetRoleId: "CR-08" } }, "ABILITY_UNAVAILABLE");
  rejects(state, { kind: "END_TURN" }, "ACQUISITION_REQUIRED");
});

for (const role of ["CR-01", "CR-02"] as const) {
  test(`CITY ${role} marks higher role without an ownership oracle and uses its once budget`, () => {
    const state = ready(role), kind = role === "CR-01" ? "MARK_ROLE_DISABLED" : "MARK_ROLE_GOLD_TRANSFER";
    const targets = ["CR-04", "CR-07", "CR-08"] as const;
    for (const targetRoleId of targets) {
      const marked = actCity(state, { kind: "USE_ROLE_ABILITY", ability: { kind, targetRoleId } });
      assert.equal(marked.marks.at(-1)?.targetRoleId, targetRoleId);
      assert.equal(marked.marks.at(-1)?.status, "UNRESOLVED");
      assert.equal(windowOf(marked).abilityUsed, true);
      rejects(marked, { kind: "USE_ROLE_ABILITY", ability: { kind, targetRoleId: "CR-08" } }, "ABILITY_UNAVAILABLE");
    }
    rejects(state, { kind: "USE_ROLE_ABILITY", ability: { kind, targetRoleId: role } }, "INVALID_TARGET");
    rejects(state, { kind: "USE_ROLE_ABILITY", ability: { kind, targetRoleId: "CR-01" } }, "INVALID_TARGET");
  });
}

test("CITY CR-03 hand exchange swaps only hands, including an empty hand, and shares the once budget", () => {
  let state = ready();
  const actor = cityContext(state).playerId, target = state.players.find((player) => player.playerId !== actor)!.playerId;
  state = withCityZones(state, { hands: [{ playerId: actor, cardIds: [state.cards[0]!.cardId, state.cards[1]!.cardId] }] });
  const old = structuredClone(state), swapped = actCity(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "EXCHANGE_HANDS", targetPlayerId: target } });
  assert.deepEqual(cityPlayer(swapped, actor).hand, []);
  assert.deepEqual(cityPlayer(swapped, target).hand, cityPlayer(state, actor).hand);
  assert.equal(cityPlayer(swapped, actor).gold, cityPlayer(state, actor).gold);
  assert.deepEqual(swapped.round, state.round);
  rejects(swapped, { kind: "USE_ROLE_ABILITY", ability: { kind: "REPLACE_OWN_CARDS", cardIds: [] } }, "ABILITY_UNAVAILABLE");
  rejects(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "EXCHANGE_HANDS", targetPlayerId: actor } }, "INVALID_TARGET");
  assert.deepEqual(state, old);
  assertCityCardConservation(swapped);
});

test("CITY E03 zero-card self replacement consumes no state/ability/entropy and a valid follow-up succeeds", () => {
  const state = ready(), before = structuredClone(state);
  let entropyReads = 0;
  assert.throws(() => actCity(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "REPLACE_OWN_CARDS", cardIds: [] } }, {
    get discardOrder() { entropyReads += 1; return []; },
  }), (error: unknown) => error instanceof CityRuleError && error.code === "INVALID_CARD");
  assert.equal(entropyReads, 0);
  assert.deepEqual(state, before);
  assert.equal(windowOf(state).abilityUsed, false);
  const id = cityPlayer(state).hand[0]!, replaced = actCity(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "REPLACE_OWN_CARDS", cardIds: [id] } });
  assert.equal(windowOf(replaced).abilityUsed, true);
  assert.ok(replaced.discard.includes(id));
  assert.equal(cityPlayer(replaced).hand.length, cityPlayer(state).hand.length);
});

test("CITY CR-03 replacement rejects duplicate/foreign cards and permits its discarded card to return after exhaustion", () => {
  let state = ready();
  const actor = cityContext(state).playerId, ids = state.cards.map((card) => card.cardId);
  state = withCityZones(state, { hands: [{ playerId: actor, cardIds: ids }] });
  rejects(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "REPLACE_OWN_CARDS", cardIds: [ids[0]!, ids[0]!] } }, "INVALID_CARD");
  rejects(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "REPLACE_OWN_CARDS", cardIds: [parseBuildingCardId("foreign")] } }, "INVALID_CARD");
  const replaced = actCity(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "REPLACE_OWN_CARDS", cardIds: [ids[0]!] } }, { discardOrder: [ids[0]!] });
  assert.ok(cityPlayer(replaced).hand.includes(ids[0]!));
  assert.equal(replaced.discard.length, 0);
  assert.equal(replaced.deck.length, 0);
  assertCityCardConservation(replaced);
});

test("CITY CR-06 mandatory acquisition bonus is exactly one on gold and draw completion", () => {
  const state = atCityRole("CR-06"), before = cityPlayer(state).gold;
  assert.equal(cityPlayer(actCity(state, { kind: "TAKE_INCOME" })).gold, before + 3);
  const pending = actCity(state, { kind: "DRAW_BUILDING_CARDS" });
  assert.equal(cityPlayer(pending).gold, before);
  const chosen = actCity(pending, { kind: "CHOOSE_BUILDING_CARD", cardId: windowOf(pending).pendingChoice!.cards[0]! });
  assert.equal(cityPlayer(chosen).gold, before + 1);
  rejects(chosen, { kind: "TAKE_INCOME" });
});

test("CITY CR-08 destroys another eligible unprotected building, paying cost minus one into the bank", () => {
  let state = ready("CR-08");
  const actor = cityContext(state).playerId;
  const target = state.players.find((player) => player.playerId !== actor && !state.round.protectedPlayerIds.includes(player.playerId))!.playerId;
  const id = cityCard(state, "CB-CIV-05");
  state = withCityGold(withCityZones(state, { cities: [{ playerId: target, cardIds: [id] }] }), actor, 10);
  const destroyed = actCity(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "DESTROY_BUILDING", targetPlayerId: target, cardId: id } });
  assert.equal(cityPlayer(destroyed, actor).gold, 10 - (getCityTemplate("CB-CIV-05").cost - 1));
  assert.deepEqual(cityPlayer(destroyed, target).city, []);
  assert.ok(destroyed.discard.includes(id));
  assert.equal(windowOf(destroyed).abilityUsed, true);
  assertCityCardConservation(destroyed);
});

test("CITY CR-08 rejects self, protected/completed city, wrong card and insufficient destruction funds", () => {
  const base = ready("CR-08"), actor = cityContext(base).playerId;
  const protectedId = base.round.protectedPlayerIds.find((id) => id !== actor)!;
  const other = base.players.find((player) => player.playerId !== actor && player.playerId !== protectedId)!.playerId;
  const cards = CITY_BUILDING_TEMPLATES.slice(0, 10).map((template) => cityCard(base, template.templateId));
  let state = withCityZones(base, { cities: [{ playerId: actor, cardIds: [cards[0]!] }, { playerId: protectedId, cardIds: [cards[1]!] }, { playerId: other, cardIds: cards.slice(2) }] });
  state = { ...state, firstCompletion: { playerId: other, roundNumber: 1 } };
  for (const [targetPlayerId, cardId] of [[actor, cards[0]!], [protectedId, cards[1]!], [other, cards[2]!]] as const) {
    rejects(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "DESTROY_BUILDING", targetPlayerId, cardId } }, "INVALID_TARGET");
  }
  const poor = withCityGold(withCityZones(base, { cities: [{ playerId: other, cardIds: [cityCard(base, "CB-CIV-06")] }] }), actor, 0);
  rejects(poor, { kind: "USE_ROLE_ABILITY", ability: { kind: "DESTROY_BUILDING", targetPlayerId: other, cardId: cityCard(base, "CB-CIV-06") } }, "INSUFFICIENT_GOLD");
  rejects(poor, { kind: "USE_ROLE_ABILITY", ability: { kind: "DESTROY_BUILDING", targetPlayerId: other, cardId: parseBuildingCardId("forged") } }, "INVALID_CARD");
});

test("CITY accepted action detaches nested hands, cities, roles, cards, marks and deck", () => {
  const state = atCityRole("CR-03"), before = structuredClone(state);
  const next = actCity(state, { kind: "DRAW_BUILDING_CARDS" });
  assert.notEqual(next, state);
  assert.notEqual(next.players, state.players);
  assert.notEqual(next.players[0], state.players[0]);
  assert.notEqual(next.players[0]?.hand, state.players[0]?.hand);
  assert.notEqual(next.players[0]?.city, state.players[0]?.city);
  assert.notEqual(next.cards, state.cards);
  assert.notEqual(next.cards[0], state.cards[0]);
  assert.notEqual(next.deck, state.deck);
  assert.notEqual(next.round, state.round);
  assert.notEqual(next.round.assignments, state.round.assignments);
  assert.notEqual(next.round.assignments[0], state.round.assignments[0]);
  assert.notEqual(next.marks, state.marks);
  assert.deepEqual(state, before);
  assertCityCardConservation(next);
});
