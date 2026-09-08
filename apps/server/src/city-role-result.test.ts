import assert from "node:assert/strict";
import test from "node:test";

import { cityCard, completeCityDraft, createCityFixture, withCityZones } from "./testing/city-role-fixtures.test.js";
import type { BuildingTemplateId } from "./games/city-role/domain/cardset-v1.js";
import type { CityGameState } from "./games/city-role/domain/game-state.js";
import { calculateCityResult } from "./games/city-role/domain/result-engine.js";

const COMPLETE_TEMPLATES: readonly BuildingTemplateId[] = [
  "CB-CIV-01", "CB-CIV-02", "CB-CUL-01", "CB-CUL-02", "CB-TRA-01", "CB-GUA-01", "CB-LAN-01", "CB-LAN-02",
];
function scoringFixture(): CityGameState {
  let state = completeCityDraft(createCityFixture());
  const [first, second] = state.seatOrder;
  assert.ok(first && second);
  state = withCityZones(state, { cities: [
    { playerId: first, cardIds: COMPLETE_TEMPLATES.map(template => cityCard(state, template)) },
    { playerId: second, cardIds: COMPLETE_TEMPLATES.map(template => cityCard(state, template, 1)) },
  ] });
  return { ...state, firstCompletion: { playerId: first, roundNumber: state.round.roundNumber } };
}

test("CITY result uses exact VP, mutually exclusive completion 4/2, and diversity 3", () => {
  const state = scoringFixture();
  const before = structuredClone(state);
  const result = calculateCityResult(state, "CITY_COMPLETION_ROUND_END");
  assert.deepEqual(result.rankings.map(row => [row.buildingVP, row.completionBonus, row.diversityBonus, row.score]), [
    [10, 4, 3, 17], [10, 2, 3, 15], [0, 0, 0, 0],
  ]);
  assert.equal(result.rankings[0]?.buildingCount, 8);
  assert.deepEqual(state, before);
});

test("CITY partial city scores only VP and earned diversity without completion", () => {
  let state = scoringFixture();
  const third = state.seatOrder[2];
  assert.ok(third);
  state = withCityZones(state, { cities: [
    ...state.players.slice(0, 2).map(player => ({ playerId: player.playerId, cardIds: player.city })),
    { playerId: third, cardIds: ["CB-CIV-03", "CB-CUL-03", "CB-TRA-03", "CB-GUA-03", "CB-LAN-03"].map(template => {
      const card = state.cards.find(candidate => candidate.templateId === template);
      assert.ok(card);
      return card.cardId;
    }) },
  ] });
  const row = calculateCityResult(state, "CITY_COMPLETION_ROUND_END").rankings.find(entry => entry.playerId === third);
  assert.ok(row);
  assert.equal(row.buildingVP, 12);
  assert.equal(row.completionBonus, 0);
  assert.equal(row.diversityBonus, 3);
  assert.equal(row.score, 15);
});

test("CITY equal top scores produce shared winners and competition ranks 1,1,3", () => {
  let state = scoringFixture();
  const second = state.seatOrder[1];
  assert.ok(second);
  state = withCityZones(state, { cities: state.players.map(player => ({ playerId: player.playerId,
    cardIds: player.playerId === second ? player.city.map(id => id === cityCard(state, "CB-CIV-01", 1) ? cityCard(state, "CB-CIV-04") : id) : player.city,
  })) });
  const result = calculateCityResult(state, "CITY_COMPLETION_ROUND_END");
  assert.deepEqual(result.rankings.map(row => row.rank), [1, 1, 3]);
  assert.deepEqual(result.rankings.map(row => row.winner), [true, true, false]);
  assert.deepEqual(result.rankings.slice(0, 2).map(row => row.playerId), state.seatOrder.slice(0, 2));
});

test("CITY forfeited first completer gets frozen VP only and does not transfer first bonus", () => {
  const initial = scoringFixture();
  const first = initial.seatOrder[0];
  const state = { ...initial, players: initial.players.map(player => player.playerId === first ? { ...player, forfeited: true, gold: 0 } : player) };
  const result = calculateCityResult(state, "CITY_COMPLETION_ROUND_END");
  const forfeited = result.rankings.find(row => row.playerId === first);
  assert.ok(forfeited);
  assert.deepEqual([forfeited.rank, forfeited.score, forfeited.completionBonus, forfeited.diversityBonus, forfeited.winner], [3, 10, 0, 0, false]);
  assert.equal(result.rankings[0]?.completionBonus, 2);
});

test("CITY forfeited subgroup competition ranks use eligible count offset", () => {
  let state = completeCityDraft(createCityFixture(5));
  const [first, , , fourth, fifth] = state.seatOrder;
  assert.ok(first && fourth && fifth);
  state = withCityZones(state, { cities: [
    { playerId: first, cardIds: COMPLETE_TEMPLATES.map(template => cityCard(state, template)) },
    { playerId: fourth, cardIds: [cityCard(state, "CB-CIV-06")] },
    { playerId: fifth, cardIds: [cityCard(state, "CB-CIV-06", 1)] },
  ] });
  state = { ...state, firstCompletion: { playerId: first, roundNumber: 1 }, players: state.players.map(player =>
    player.playerId === fourth || player.playerId === fifth ? { ...player, gold: 0, forfeited: true } : player) };
  const rows = calculateCityResult(state, "CITY_COMPLETION_ROUND_END").rankings;
  assert.deepEqual(rows.map(row => row.rank), [1, 2, 2, 4, 4]);
  assert.deepEqual(rows.slice(3).map(row => row.score), [6, 6]);
});

test("CITY last survivor wins regardless of forfeited city VP", () => {
  const initial = scoringFixture();
  const survivor = initial.seatOrder[2];
  const state = { ...initial, players: initial.players.map(player => ({ ...player, gold: 0, forfeited: player.playerId !== survivor })) };
  const rows = calculateCityResult(state, "LAST_PLAYER_STANDING").rankings;
  assert.equal(rows[0]?.playerId, survivor);
  assert.equal(rows[0]?.score, 0);
  assert.equal(rows[0]?.winner, true);
  assert.ok(rows.slice(1).every(row => row.score > 0 && !row.winner));
});

test("CITY zero eligible result includes everyone but has no winner", () => {
  const initial = scoringFixture();
  const state = { ...initial, players: initial.players.map(player => ({ ...player, gold: 0, forfeited: true })) };
  const rows = calculateCityResult(state, "NO_ELIGIBLE_PLAYERS").rankings;
  assert.equal(rows.length, 3);
  assert.ok(rows.every(row => !row.winner && row.completionBonus === 0 && row.diversityBonus === 0));
  assert.deepEqual(rows.map(row => row.rank), [1, 1, 3]);
});

test("CITY result rejects reason/eligible and missing completion-latch mismatches", () => {
  const initial = createCityFixture();
  assert.throws(() => calculateCityResult(initial, "LAST_PLAYER_STANDING"));
  assert.throws(() => calculateCityResult(initial, "NO_ELIGIBLE_PLAYERS"));
  assert.throws(() => calculateCityResult(initial, "CITY_COMPLETION_ROUND_END"));
});

test("CITY result rejects duplicate physical cards and duplicate city templates", () => {
  const state = scoringFixture();
  const first = state.players[0];
  assert.ok(first);
  const firstCard = first.city[0];
  assert.ok(firstCard);
  assert.throws(() => calculateCityResult({ ...state, players: [
    { ...first, city: [...first.city, firstCard] }, ...state.players.slice(1),
  ] }, "CITY_COMPLETION_ROUND_END"));
  assert.throws(() => calculateCityResult({ ...state, players: [
    { ...first, city: [...first.city, cityCard(state, "CB-CIV-01", 1)] }, ...state.players.slice(1),
  ] }, "CITY_COMPLETION_ROUND_END"));
});

test("CITY calculated result and nested rankings are detached and frozen", () => {
  const state = scoringFixture();
  const result = calculateCityResult(state, "CITY_COMPLETION_ROUND_END");
  assert.ok(Object.isFrozen(result) && Object.isFrozen(result.rankings));
  assert.ok(result.rankings.every(Object.isFrozen));
  assert.notEqual(result.rankings, state.players);
  assert.throws(() => Object.assign(result.rankings[0]!, { score: 999 }));
});
