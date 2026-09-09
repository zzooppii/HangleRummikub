import assert from "node:assert/strict";
import test from "node:test";
import { createCityCards, getCityTemplate } from "./games/city-role/domain/cardset-v1.js";
import { parseBuildingCardId, parseCityActionId, parseCityGameId, parseCityPlayerId } from "./games/city-role/domain/identity.js";
import { CITY_ROLE_IDS } from "./games/city-role/domain/role.js";
import { applyCityAction, createInitialCityGameState, CityRuleError, type CityAction } from "./games/city-role/domain/rule-engine.js";
import { cityLandmarkDiscount } from "./games/city-role/domain/landmarks-v2.js";
import { assertCityCardConservation } from "./testing/city-role-fixtures.test.js";

/** Seeded, bounded smoke policy, not a competitive balance or hidden-information solver. */
function simulate(count: number, seed: number, rulesVersion: "city-rules-v1" | "city-rules-v2") {
  let randomState = seed;
  const random = () => { randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0; return randomState / 4294967296; };
  function shuffle<T>(values: readonly T[]): T[] {
    const output = [...values];
    for (let i = output.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [output[i], output[j]] = [output[j]!, output[i]!]; }
    return output;
  }
  const cards = createCityCards(Array.from({ length: 60 }, (_, i) => parseBuildingCardId(`balance-card-${i}`)));
  const shuffled = shuffle(cards), players = Array.from({ length: count }, (_, i) => parseCityPlayerId(`balance-player-${i}`));
  let state = createInitialCityGameState({ gameId: parseCityGameId("balance-game"), rulesVersion, cards, playerIds: players, seatOrder: players,
    initialHands: players.map((playerId, i) => ({ playerId, cardIds: shuffled.slice(i * 4, i * 4 + 4).map(c => c.cardId) })),
    deck: shuffled.slice(count * 4).map(c => c.cardId), actionId: parseCityActionId("balance-action-0"), roleOrder: shuffle(CITY_ROLE_IDS) });
  const template = (id: string) => { const card = cards.find(c => c.cardId === id); assert.ok(card); return getCityTemplate(card.templateId); };
  const builds = Array<number>(6).fill(0), activations = Array<number>(6).fill(0);
  let commands = 0;
  for (; state.window !== null && commands < 3000; commands++) {
    const window = state.window, owner = state.players.find(p => p.playerId === window.activePlayerId)!;
    const ownCity = owner.city.map(template), history = state.landmarkHistory?.find(row => row.playerId === owner.playerId);
    const usable = (id: string) => !ownCity.some(c => c.templateId === template(id).templateId);
    const order = (a: string, b: string) => {
      const x = template(a), y = template(b);
      // Alternate landmark-seeking and low-cost city-building policies by seed.
      const priority = (card: typeof x) => card.cost - (seed % 2 === 0 && card.category === "LANDMARK" ? 3 : 0);
      return Number(!usable(a)) - Number(!usable(b)) || priority(x) - priority(y) || a.localeCompare(b);
    };
    let action: CityAction;
    if (window.kind === "ROLE_SELECTION") {
      const preference = ["CR-07", "CR-06", "CR-04", "CR-05", "CR-08", "CR-03", "CR-02", "CR-01"] as const;
      const roleId = preference.find(id => state.round.available.includes(id)); assert.ok(roleId);
      action = { kind: "SELECT_ROLE", roleId };
    } else if (window.acquisition === "PENDING") {
      const id = [...state.pendingChoice!.cards].sort(order)[0]!;
      action = { kind: "CHOOSE_BUILDING_CARD", cardId: id };
    } else if (window.acquisition === "NOT_TAKEN") {
      action = { kind: owner.hand.some(usable) ? "TAKE_INCOME" : "DRAW_BUILDING_CARDS" };
    } else {
      const affordable = [...owner.hand].filter(id => usable(id) &&
        template(id).cost - cityLandmarkDiscount(history, state.round.roundNumber, ownCity, template(id)) <= owner.gold).sort(order)[0];
      const targets = state.players.filter(p => p.playerId !== owner.playerId && !p.forfeited && p.city.length >= 6 && p.city.length < 8 && !state.round.protectedPlayerIds.includes(p.playerId));
      const target = targets.flatMap(p => p.city.map(cardId => ({ p, cardId, cost: Math.max(0, template(cardId).cost - 1) + (rulesVersion === "city-rules-v2" && template(cardId).templateId === "CB-LAN-03" ? 1 : 0) }))).filter(t => t.cost <= owner.gold).sort((a, b) => a.cost - b.cost)[0];
      if (affordable !== undefined && window.buildingsBuilt < (window.activeRoleId === "CR-07" ? 3 : 1)) action = { kind: "BUILD", cardId: affordable };
      else if (window.activeRoleId === "CR-08" && !window.abilityUsed && target !== undefined && seed % 3 === 0)
        action = { kind: "USE_ROLE_ABILITY", ability: { kind: "DESTROY_BUILDING", targetPlayerId: target.p.playerId, cardId: target.cardId } };
      else action = { kind: "END_TURN" };
    }
    const before = state;
    const entropy = { nextActionId: parseCityActionId(`balance-action-${commands + 1}`), nextRoleOrder: shuffle(CITY_ROLE_IDS), discardOrder: shuffle(state.discard) };
    const context = { gameId: state.gameId, actionId: window.actionId, playerId: owner.playerId };
    try { state = applyCityAction(state, context, action, entropy); }
    catch (error) {
      if (!(error instanceof CityRuleError) || error.code !== "EMPTY_SUPPLY" || action.kind !== "DRAW_BUILDING_CARDS") throw error;
      state = applyCityAction(state, context, { kind: "TAKE_INCOME" }, entropy);
    }
    if (action.kind === "BUILD") {
      const card = template(action.cardId);
      if (card.category === "LANDMARK") builds[Number(card.templateId.slice(-2)) - 1]! += 1;
    }
    if (rulesVersion === "city-rules-v2") {
      for (const row of state.landmarkHistory!) {
        const prior = before.landmarkHistory!.find(p => p.playerId === row.playerId)!;
        activations[0]! += Number(row.gardenUsed && !prior.gardenUsed);
        activations[1]! += Number(row.sundialUsed && !prior.sundialUsed);
        activations[3]! += row.staircaseSpent - prior.staircaseSpent;
        assert.ok(row.staircaseSpent <= 3 && row.staircaseRemaining + row.staircaseSpent <= 3);
      }
      if (action.kind === "USE_ROLE_ABILITY" && action.ability.kind === "DESTROY_BUILDING" && template(action.ability.cardId).templateId === "CB-LAN-03") activations[2]! += 1;
    }
    assertCityCardConservation(state);
  }
  assert.ok(state.result !== null, `unfinished ${count}/${seed}/${rulesVersion} after ${commands} commands`);
  assert.equal(state.result.reason, "CITY_COMPLETION_ROUND_END");
  assert.ok(state.round.roundNumber < 100);
  let seventhSum = 0, seventhOwners = 0;
  for (const row of state.result.rankings) {
    const city = state.players.find(p => p.playerId === row.playerId)!.city.map(template);
    if (rulesVersion === "city-rules-v2" && city.some(c => c.templateId === "CB-LAN-05") && new Set(city.filter(c => c.category !== "LANDMARK").map(c => c.category)).size === 3) activations[4]! += 1;
    if (city.some(c => c.templateId === "CB-LAN-06")) { seventhOwners++; seventhSum += row.landmarkBonus ?? 0; if (row.landmarkBonus) activations[5]! += 1; }
  }
  return { round: state.round.roundNumber, winnerScore: state.result.rankings[0]!.score, builds, activations,
    diversity: state.result.rankings.filter(r => r.diversityBonus === 3).length, seventhSum, seventhOwners, commands };
}

for (const count of [2, 4, 6]) test(`Landmark balance paired v1/v2 deterministic ${count}-player games terminate with bounded budgets`, t => {
  for (const version of ["city-rules-v1", "city-rules-v2"] as const) {
    const runs = Array.from({ length: 8 }, (_, i) => simulate(count, 1701 + i, version));
    const mean = (values: number[]) => Number((values.reduce((a, b) => a + b, 0) / values.length).toFixed(3));
    const owners = runs.reduce((sum, r) => sum + r.seventhOwners, 0);
    t.diagnostic(JSON.stringify({ count, version, seeds: "1701..1708", games: runs.length,
      meanEndRound: mean(runs.map(r => r.round)), meanWinnerScore: mean(runs.map(r => r.winnerScore)),
      meanLandmarkBuilds: mean(runs.map(r => r.builds.reduce((a, b) => a + b, 0))),
      meanActivations: Array.from({ length: 6 }, (_, i) => mean(runs.map(r => r.activations[i]!))),
      meanStaircaseDiscounts: mean(runs.map(r => r.activations[3]!)), diversityFrequency: mean(runs.map(r => r.diversity / count)),
      meanSeventhBonusPerBuiltOwner: owners ? Number((runs.reduce((sum, r) => sum + r.seventhSum, 0) / owners).toFixed(3)) : 0,
      maxCommands: Math.max(...runs.map(r => r.commands)) }));
  }
});
