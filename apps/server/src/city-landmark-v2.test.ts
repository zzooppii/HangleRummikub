import assert from "node:assert/strict";
import test from "node:test";
import { GameIdSchema, GameRevisionSchema, PlayerIdSchema, ServerTimeSchema } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { getCityTemplate, type BuildingTemplateId } from "./games/city-role/domain/cardset-v1.js";
import { cloneCityGameState, type CityGameState } from "./games/city-role/domain/game-state.js";
import { initialCityLandmarkHistory, cityLandmarkScoring } from "./games/city-role/domain/landmarks-v2.js";
import { assertCityGameState } from "./games/city-role/domain/state-validator.js";
import { calculateCityResult } from "./games/city-role/domain/result-engine.js";
import { forfeitCityPlayers } from "./games/city-role/domain/rule-engine.js";
import { CityRoleGameStateAdapter } from "./games/city-role/compatibility/city-role-game-state-adapter.js";
import { projectCityRoleV2Game } from "./games/city-role/compatibility/city-role-v2-game-projector.js";
import { actCity, atCityRole, cityCard, cityPlayer, cityContext, withCityGold, withCityZones, assertCityCardConservation, completeCityDraft } from "./testing/city-role-fixtures.test.js";

function ready(role: Parameters<typeof atCityRole>[0] = "CR-07"): CityGameState {
  const state = actCity(atCityRole(role), { kind: "TAKE_INCOME" });
  return { ...state, rulesVersion: "city-rules-v2", cardSetVersion: "city-cardset-v2",
    landmarkHistory: state.players.map(p => initialCityLandmarkHistory(p.playerId)) };
}
function hand(state: CityGameState, ids: readonly BuildingTemplateId[], gold = 30): CityGameState {
  const actor = cityContext(state).playerId;
  return withCityGold(withCityZones(state, { hands: [{ playerId: actor, cardIds: ids.map(id => cityCard(state, id)) }] }), actor, gold);
}
function build(state: CityGameState, id: BuildingTemplateId, copy = 0) {
  return actCity(state, { kind: "BUILD", cardId: cityCard(state, id, copy) }, { discardOrder: [...state.discard].reverse() });
}
function history(state: CityGameState, id = cityContext(state).playerId) {
  const row = state.landmarkHistory?.find(row => row.playerId === id);
  assert.ok(row); return row;
}
function stored(state: CityGameState) {
  return { state, gameId: parse(GameIdSchema, state.gameId), gameRevision: parse(GameRevisionSchema, 8),
    startedAt: parse(ServerTimeSchema, 1000), windowStartedAt: state.window ? parse(ServerTimeSchema, 2000) : null,
    deadlineAt: state.window ? parse(ServerTimeSchema, state.window.kind === "ROLE_ACTION" ? 92000 : 47000) : null,
    finishedAt: state.window ? null : parse(ServerTimeSchema, 3000), entropySeed: "b".repeat(64), entropyCounter: 10 };
}

test("Landmark v2 garden refunds exactly one after full payment; failed build has no effect", () => {
  const state = hand(ready(), ["CB-LAN-01"], 1), before = structuredClone(state);
  const next = build(state, "CB-LAN-01");
  assert.equal(cityPlayer(next).gold, 1); assert.equal(history(next).gardenUsed, true);
  assert.equal(next.window?.actionId, state.window?.actionId); assertCityCardConservation(next);
  const poor = withCityGold(state, cityContext(state).playerId, 0);
  assert.throws(() => build(poor, "CB-LAN-01"), /INSUFFICIENT_GOLD/);
  assert.equal(history(poor).gardenUsed, false); assert.deepEqual(state, before);
});
for (const id of ["CB-LAN-01", "CB-LAN-02"] as const) test(`Landmark v2 ${id} rebuild with a second physical copy never farms reward`, () => {
  let state = build(hand(ready(), [id]), id);
  const actor = cityContext(state).playerId, original = cityCard(state, id), copy = cityCard(state, id, 1);
  // Explicit post-destruction fixture preserves public activation history.
  state = withCityZones(state, { hands: [{ playerId: actor, cardIds: [copy] }], discard: [original] });
  assert.ok(state.window?.kind === "ROLE_ACTION");
  state = { ...state, result: null, window: { ...state.window, buildingsBuilt: 0 } };
  const before = cityPlayer(state), next = actCity(state, { kind: "BUILD", cardId: copy });
  assert.equal(cityPlayer(next).gold, before.gold - getCityTemplate(id).cost);
  assert.equal(cityPlayer(next).hand.length, 0); assertCityCardConservation(next);
});
test("Landmark v2 sundial draws canonical top once without a choice and preserves supply", () => {
  const state = hand(ready(), ["CB-LAN-02"]), top = state.deck[0], next = build(state, "CB-LAN-02");
  assert.deepEqual(cityPlayer(next).hand, [top]); assert.equal(next.pendingChoice, null);
  assert.equal(history(next).sundialUsed, true); assertCityCardConservation(next);
});
for (const discardCount of [0, 1, 3]) test(`Landmark v2 sundial empty deck with ${discardCount} discarded cards`, () => {
  let state = ready(); const actor = cityContext(state).playerId, card = cityCard(state, "CB-LAN-02");
  const others = state.cards.map(c => c.cardId).filter(id => id !== card), discard = others.slice(0, discardCount);
  state = withCityGold(withCityZones(state, { hands: [{ playerId: actor, cardIds: [card, ...others.slice(discardCount)] }], discard, deck: [] }), actor, 10);
  const next = build(state, "CB-LAN-02");
  assert.equal(cityPlayer(next).hand.length, 59 - discardCount + Math.min(1, discardCount));
  if (discardCount) assert.equal(cityPlayer(next).hand.at(-1), discard.at(-1));
  assert.equal(history(next).sundialUsed, true); assert.equal(next.pendingChoice, null); assertCityCardConservation(next);
});
test("Landmark v2 sundial invalid reshuffle leaves build, gold and once history untouched", () => {
  let state = ready(); const actor = cityContext(state).playerId, card = cityCard(state, "CB-LAN-02");
  const others = state.cards.map(c => c.cardId).filter(id => id !== card);
  state = withCityZones(state, { hands: [{ playerId: actor, cardIds: [card, ...others.slice(1)] }], discard: others.slice(0, 1), deck: [] });
  const before = structuredClone(state);
  assert.throws(() => actCity(state, { kind: "BUILD", cardId: card }, { discardOrder: [] }), /INVALID_ENTROPY/);
  assert.deepEqual(state, before);
});
test("Landmark v2 stone destruction costs two and insufficient gold does not consume ability", () => {
  let state = ready("CR-08"); const actor = cityContext(state).playerId, target = state.players.find(p => p.playerId !== actor && !state.round.protectedPlayerIds.includes(p.playerId))!.playerId;
  const cardId = cityCard(state, "CB-LAN-03");
  state = withCityGold(withCityZones(state, { cities: [{ playerId: target, cardIds: [cardId] }] }), actor, 1);
  const action = { kind: "USE_ROLE_ABILITY", ability: { kind: "DESTROY_BUILDING", targetPlayerId: target, cardId } } as const;
  const before = structuredClone(state); assert.throws(() => actCity(state, action), /INSUFFICIENT_GOLD/); assert.deepEqual(state, before);
  const next = actCity(withCityGold(state, actor, 2), action);
  assert.equal(cityPlayer(next).gold, 0); assert.deepEqual(cityPlayer(next, target).city, []); assert.ok(next.discard.includes(cardId));
});
test("Landmark v2 stone never bypasses CR05 or completed-city protection", () => {
  const original = ready("CR-08"), actor = cityContext(original).playerId;
  const protectedId = original.round.protectedPlayerIds[0]; assert.ok(protectedId);
  const stone = cityCard(original, "CB-LAN-03");
  const protectedState = withCityZones(original, { cities: [{ playerId: protectedId, cardIds: [stone] }] });
  assert.throws(() => actCity(protectedState, { kind: "USE_ROLE_ABILITY", ability: { kind: "DESTROY_BUILDING", targetPlayerId: protectedId, cardId: stone } }), /INVALID_TARGET/);
  const target = original.players.find(p => p.playerId !== actor && p.playerId !== protectedId)!.playerId;
  const cards = [stone, ...original.cards.filter(c => c.templateId.startsWith("CB-CIV") && c.cardId === cityCard(original, c.templateId)).map(c => c.cardId), cityCard(original, "CB-TRA-01")];
  const completed = { ...withCityZones(original, { cities: [{ playerId: target, cardIds: cards }] }), firstCompletion: { playerId: target, roundNumber: 1 } };
  assert.throws(() => actCity(completed, { kind: "USE_ROLE_ABILITY", ability: { kind: "DESTROY_BUILDING", targetPlayerId: target, cardId: stone } }), /INVALID_TARGET/);
});
test("Landmark v2 staircase discounts first qualifying CR07 build only, never cost1 or Landmark", () => {
  let state = hand(ready(), ["CB-LAN-04", "CB-CIV-02", "CB-CUL-03"]);
  state = build(state, "CB-LAN-04"); state = build(state, "CB-CIV-02"); state = build(state, "CB-CUL-03");
  assert.equal(cityPlayer(state).gold, 30 - 4 - 1 - 3); assert.equal(history(state).staircaseRemaining, 2);
  assert.equal(history(state).staircaseSpent, 1); assert.equal(history(state).lastDiscountRound, 1);
  for (const id of ["CB-CIV-01", "CB-LAN-03"] as const) {
    const initial = build(hand(ready(), ["CB-LAN-04", id]), "CB-LAN-04");
    const next = build(initial, id);
    assert.equal(cityPlayer(next).gold, 26 - getCityTemplate(id).cost); assert.equal(history(next).staircaseRemaining, 3);
  }
});
test("Landmark v2 staircase failed build consumes neither a charge nor round marker", () => {
  let state = build(hand(ready(), ["CB-LAN-04", "CB-CIV-06"], 4), "CB-LAN-04");
  const before = structuredClone(state); assert.throws(() => build(state, "CB-CIV-06"), /INSUFFICIENT_GOLD/); assert.deepEqual(state, before);
  state = withCityGold(state, cityContext(state).playerId, 5);
  const next = build(state, "CB-CIV-06"); assert.equal(cityPlayer(next).gold, 0); assert.equal(history(next).staircaseRemaining, 2);
});
test("Landmark v2 staircase round and lifetime markers survive clone; three uses is the hard cap", () => {
  let state = build(hand(ready(), ["CB-LAN-04"]), "CB-LAN-04");
  const actor = cityContext(state).playerId, staircase = cityCard(state, "CB-LAN-04");
  for (const round of [1, 2, 3, 4]) {
    const card = cityCard(state, "CB-CIV-02");
    state = withCityZones(state, { cities: [{ playerId: actor, cardIds: [staircase] }], hands: [{ playerId: actor, cardIds: [card] }] });
    assert.ok(state.window?.kind === "ROLE_ACTION");
    state = { ...state, result: null, round: { ...state.round, roundNumber: round }, revealedRoles: state.revealedRoles.map(r => ({ ...r, roundNumber: round })), window: { ...state.window, buildingsBuilt: 0 } };
    const before = cityPlayer(state).gold; state = cloneCityGameState(build(state, "CB-CIV-02"));
    assert.equal(before - cityPlayer(state).gold, round <= 3 ? 1 : 2);
  }
  assert.equal(history(state).staircaseSpent, 3); assert.equal(history(state).staircaseRemaining, 0);
});
test("Landmark v2 forfeit burns unspent staircase charges while preserving initialized history", () => {
  const state = build(hand(ready(), ["CB-LAN-04"]), "CB-LAN-04"), actor = cityContext(state).playerId;
  const next = forfeitCityPlayers(state, state.players.filter(p => p.playerId !== actor).map(p => p.playerId));
  assert.equal(history(next, actor).staircaseRemaining, 3);
  const forfeited = forfeitCityPlayers(state, state.players.map(p => p.playerId));
  assert.equal(history(forfeited, actor).staircaseRemaining, 0); assert.equal(history(forfeited, actor).staircaseInitialized, true);
});
test("Landmark v2 actual destruction followed by another-copy rebuild never restores staircase charges", () => {
  let state = ready("CR-08"); const actor = cityContext(state).playerId;
  const target = state.players.find(p => p.playerId !== actor && !state.round.protectedPlayerIds.includes(p.playerId))!.playerId;
  const cardId = cityCard(state, "CB-LAN-04"), copy = cityCard(state, "CB-LAN-04", 1);
  state = withCityGold(withCityZones(state, { cities: [{ playerId: target, cardIds: [cardId] }] }), actor, 10);
  state = { ...state, landmarkHistory: state.landmarkHistory!.map(row => row.playerId === target ? { ...row, staircaseInitialized: true, staircaseRemaining: 2, staircaseSpent: 1, lastDiscountRound: 1 } : row) };
  state = actCity(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "DESTROY_BUILDING", targetPlayerId: target, cardId } });
  assert.equal(history(state, target).staircaseRemaining, 0);
  state = actCity(state, { kind: "END_TURN" });
  for (let i = 0; i < 24; i++) {
    if (state.window?.kind === "ROLE_SELECTION") state = completeCityDraft(state);
    assert.ok(state.window?.kind === "ROLE_ACTION");
    state = actCity(state, { kind: "TAKE_INCOME" });
    if (state.window?.activePlayerId === target) break;
    state = actCity(state, { kind: "END_TURN" });
  }
  assert.equal(cityContext(state).playerId, target);
  state = withCityGold(withCityZones(state, { hands: [{ playerId: target, cardIds: [copy] }], discard: [cardId] }), target, 10);
  state = actCity(state, { kind: "BUILD", cardId: copy });
  assert.equal(history(state, target).staircaseRemaining, 0); assert.equal(history(state, target).staircaseSpent, 1);
  assertCityCardConservation(state);
});
for (const count of [0, 1, 2, 3, 4]) test(`Landmark v2 seventh garden uses ${count} actual ordinary categories only`, () => {
  const ordinary = ["CB-CIV-01", "CB-CUL-01", "CB-TRA-01", "CB-GUA-01"] as const;
  const city = [...ordinary.slice(0, count), "CB-LAN-05", "CB-LAN-06"].map(id => getCityTemplate(id as BuildingTemplateId));
  assert.deepEqual(cityLandmarkScoring(city, false), { diversityBonus: count >= 3 ? 3 : 0, landmarkBonus: count });
  assert.deepEqual(cityLandmarkScoring(city, true), { diversityBonus: 0, landmarkBonus: 0 });
});
test("Landmark v2 combined scoring yields one diversity bonus and competition ties", () => {
  let state = ready(); const ids: BuildingTemplateId[] = ["CB-CIV-01", "CB-CUL-01", "CB-TRA-01", "CB-LAN-05", "CB-LAN-06"];
  const [a, b, c] = state.players; assert.ok(a && b && c);
  state = withCityZones(state, { cities: [a, b].map((p, copy) => ({ playerId: p.playerId, cardIds: ids.map(id => cityCard(state, id, copy)) })) });
  state = { ...state, firstCompletion: { playerId: c.playerId, roundNumber: 1 } };
  const result = calculateCityResult(state, "CITY_COMPLETION_ROUND_END");
  assert.deepEqual(result.rankings.slice(0, 2).map(r => [r.rank, r.diversityBonus, r.landmarkBonus, r.score]), [[1, 3, 3, 18], [1, 3, 3, 18]]);
  assert.equal(result.rankings.filter(r => r.winner).length, 2);
});
test("Landmark v2 moon corridor never creates virtual category income on role entry", () => {
  let state = ready("CR-04");
  const target = state.round.assignments.find(role => role.roleId === "CR-05")!.playerId;
  const ids: BuildingTemplateId[] = ["CB-LAN-05", "CB-CIV-01", "CB-TRA-01", "CB-GUA-01"];
  state = withCityZones(state, { cities: [{ playerId: target, cardIds: ids.map(id => cityCard(state, id)) }] });
  const before = cityPlayer(state, target).gold;
  const next = actCity(state, { kind: "END_TURN" });
  assert.ok(next.window?.kind === "ROLE_ACTION" && next.window.activeRoleId === "CR-05");
  assert.equal(cityPlayer(next, target).gold, before);
});
test("Landmark v2 persistence/projector restore exact public history without exposing deck or foreign hand", () => {
  let state = build(hand(ready(), ["CB-LAN-04", "CB-CIV-02", "CB-LAN-02"]), "CB-LAN-04");
  state = build(state, "CB-CIV-02"); state = build(state, "CB-LAN-02");
  const game = stored(state), copy = new CityRoleGameStateAdapter().cloneAndValidate(JSON.parse(JSON.stringify(game)));
  assert.deepEqual(copy, game); assert.notEqual(copy.state.landmarkHistory, state.landmarkHistory);
  const ids = state.players.map(p => parse(PlayerIdSchema, p.playerId));
  for (const id of ids) {
    const projected = projectCityRoleV2Game({ phase: "PLAYING", game: copy, playerIds: ids, selfPlayerId: id });
    assert.deepEqual(projected.landmarkHistory, state.landmarkHistory);
    assert.deepEqual(projected.privateState.hand.map(c => c.cardId), state.players.find(p => p.playerId === String(id))!.hand);
    assert.equal("deck" in projected, false); assert.equal("entropySeed" in projected, false);
  }
});
test("Landmark version validation refuses silent v1 reinterpretation, mixed versions and missing budgets", () => {
  const v1 = atCityRole("CR-03"), v2 = ready(); assertCityGameState(v1); assertCityGameState(v2);
  for (const corrupted of [ { ...v1, rulesVersion: "city-rules-v2" }, { ...v1, rulesVersion: "city-rules-v2", cardSetVersion: "city-cardset-v2" },
    { ...v1, landmarkHistory: v2.landmarkHistory }, { ...v2, cardSetVersion: "city-cardset-v1" },
    { ...v2, landmarkHistory: [] }, { ...v2, landmarkHistory: v2.landmarkHistory?.map(row => ({ ...row, staircaseRemaining: 4 })) } ]) assert.throws(() => assertCityGameState(corrupted));
  const plain = hand(actCity(v1, { kind: "TAKE_INCOME" }), ["CB-LAN-01"], 1);
  assert.equal(cityPlayer(build(plain, "CB-LAN-01")).gold, 0);
});
