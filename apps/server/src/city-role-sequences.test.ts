import assert from "node:assert/strict";
import test from "node:test";

import { getCityTemplate } from "./games/city-role/domain/cardset-v1.js";
import type { CityGameState } from "./games/city-role/domain/game-state.js";
import { parseCityActionId } from "./games/city-role/domain/identity.js";
import { CITY_ROLE_IDS } from "./games/city-role/domain/role.js";
import { applyCityAction, type CityAction } from "./games/city-role/domain/rule-engine.js";
import { assertCityGameState } from "./games/city-role/domain/state-validator.js";
import { createCityFixture } from "./testing/city-role-fixtures.test.js";

function chooseLegalAction(state: CityGameState, step: number): CityAction {
  const w = state.window;
  assert.ok(w);
  if (w.kind === "ROLE_SELECTION") return { kind: "SELECT_ROLE", roleId: state.round.available[step % state.round.available.length]! };
  if (state.pendingChoice !== null) return { kind: "CHOOSE_BUILDING_CARD", cardId: state.pendingChoice.cards[0]! };
  const player = state.players.find(p => p.playerId === w.activePlayerId)!;
  const template = (id: string) => getCityTemplate(state.cards.find(c => c.cardId === id)!.templateId);
  const available = player.hand.filter(id => !player.city.some(built => template(built).templateId === template(id).templateId));
  if (w.acquisition === "NOT_TAKEN") return { kind: available.length < 2 && state.deck.length + state.discard.length > 0 ? "DRAW_BUILDING_CARDS" : "TAKE_INCOME" };
  const affordable = available.find(id => template(id).cost <= player.gold);
  if (affordable !== undefined && w.buildingsBuilt < (w.activeRoleId === "CR-07" ? 3 : 1)) return { kind: "BUILD", cardId: affordable };
  return { kind: "END_TURN" };
}

for (const count of [2, 3, 4, 5, 6]) {
  test(`CITY ${count}-player deterministic full-game sequence conserves every card/role and freezes every committed graph`, () => {
    let state = createCityFixture(count);
    for (let step = 0; state.result === null && step < 2000; step += 1) {
      const before = JSON.stringify(state);
      const prior = state;
      const offset = step % CITY_ROLE_IDS.length;
      state = applyCityAction(state, {
        gameId: state.gameId, actionId: state.window.actionId, playerId: state.window.activePlayerId,
      }, chooseLegalAction(state, step), {
        nextActionId: parseCityActionId(`sequence-${count}-${step}`),
        nextRoleOrder: [...CITY_ROLE_IDS.slice(offset), ...CITY_ROLE_IDS.slice(0, offset)],
        discardOrder: [...state.discard].reverse(),
      });
      assert.equal(JSON.stringify(prior), before);
      assertCityGameState(state);
      assert.ok(Object.isFrozen(state));
      assert.ok(Object.isFrozen(state.players[0]?.hand));
      assert.ok(Object.isFrozen(state.round.assignments));
      assert.notEqual(state.cards, prior.cards);
      assert.notEqual(state.players, prior.players);
      assert.notEqual(state.round, prior.round);
      assert.notEqual(state.revealedRoles, prior.revealedRoles);
      if (state.pendingChoice !== null) assert.ok(Object.isFrozen(state.pendingChoice.cards));
    }
    assert.equal(state.result?.reason, "CITY_COMPLETION_ROUND_END");
    assert.ok(state.firstCompletion);
    assert.equal(state.round.ended, true);
    assert.ok(state.result.rankings.some(row => row.winner));
    assert.equal(state.result.rankings.length, count);
  });
}
