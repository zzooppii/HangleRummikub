import assert from "node:assert/strict";
import { createCityCards, type BuildingTemplateId } from "../games/city-role/domain/cardset-v1.js";
import type { CityGameState, CityPlayerState, PlayingCityGameState } from "../games/city-role/domain/game-state.js";
import { parseBuildingCardId, parseCityActionId, parseCityGameId, parseCityPlayerId, type BuildingCardId, type CityPlayerId } from "../games/city-role/domain/identity.js";
import { CITY_ROLE_IDS, type CityRoleId } from "../games/city-role/domain/role.js";
import { applyCityAction, createInitialCityGameState, type CityAction, type CityEntropy } from "../games/city-role/domain/rule-engine.js";

export const CITY_TEST_ROLE_ORDER: readonly CityRoleId[] = ["CR-08", "CR-07", "CR-06", "CR-05", "CR-04", "CR-03", "CR-02", "CR-01"];

export function createCityFixture(playerCount = 3, roleOrder: readonly CityRoleId[] = CITY_TEST_ROLE_ORDER): CityGameState {
  const playerIds = Array.from({ length: playerCount }, (_, index) => parseCityPlayerId(`city-player-${index + 1}`));
  const cards = createCityCards(Array.from({ length: 60 }, (_, index) => parseBuildingCardId(`opaque-city-card-${index + 1}`)));
  return createInitialCityGameState({
    gameId: parseCityGameId("city-fixture-game"), playerIds, seatOrder: playerIds,
    cards, deck: cards.slice(playerCount * 4).map((card) => card.cardId),
    initialHands: playerIds.map((playerId, index) => ({ playerId, cardIds: cards.slice(index * 4, index * 4 + 4).map((card) => card.cardId) })),
    actionId: parseCityActionId("city-action-0"), roleOrder,
  });
}

export function cityPlaying(state: CityGameState): PlayingCityGameState {
  assert.notEqual(state.window, null, "fixture must still be playing");
  if (state.window === null) throw new Error("fixture unexpectedly finished");
  return state;
}

export function cityContext(state: CityGameState) {
  const playing = cityPlaying(state);
  return { gameId: playing.gameId, actionId: playing.window.actionId, playerId: playing.window.activePlayerId };
}

export function cityEntropy(state: CityGameState): CityEntropy {
  const window = cityPlaying(state).window;
  const sequence = Number(window.actionId.split("-").at(-1));
  return { nextActionId: parseCityActionId(`city-action-${sequence + 1}`), nextRoleOrder: CITY_TEST_ROLE_ORDER };
}

export function actCity(state: CityGameState, action: CityAction, entropy: CityEntropy = cityEntropy(state)): CityGameState {
  return applyCityAction(state, cityContext(state), action, entropy);
}

export function completeCityDraft(state: CityGameState, picks?: readonly CityRoleId[]): CityGameState {
  let current = state;
  let index = 0;
  while (cityPlaying(current).window.kind === "ROLE_SELECTION") {
    const roleId = picks?.[index] ?? current.round.available[0];
    assert.ok(roleId, "draft requires a supplied or available role");
    current = actCity(current, { kind: "SELECT_ROLE", roleId });
    index += 1;
  }
  return current;
}

export function atCityRole(roleId: CityRoleId): CityGameState {
  const hidden = CITY_ROLE_IDS.find((role) => role !== roleId && role === "CR-08") ?? "CR-01";
  const roleOrder = [hidden, ...CITY_ROLE_IDS.filter((role) => role !== hidden)];
  const selected: CityRoleId[] = CITY_ROLE_IDS.filter((role) => role !== hidden && role !== roleId).slice(0, 5);
  selected.push(roleId);
  selected.sort();
  let state = completeCityDraft(createCityFixture(3, roleOrder), selected);
  while (true) {
    const window = cityPlaying(state).window;
    if (window.kind === "ROLE_ACTION" && window.activeRoleId === roleId) break;
    state = actCity(state, { kind: "TAKE_INCOME" });
    state = actCity(state, { kind: "END_TURN" });
  }
  return state;
}

export function cityPlayer(state: CityGameState, playerId = cityContext(state).playerId): CityPlayerState {
  const player = state.players.find((candidate) => candidate.playerId === playerId);
  assert.ok(player);
  return player;
}

export function cityCard(state: CityGameState, templateId: BuildingTemplateId, copy = 0): BuildingCardId {
  const card = state.cards.filter((candidate) => candidate.templateId === templateId)[copy];
  assert.ok(card);
  return card.cardId;
}

type CityZone = Readonly<{ playerId: CityPlayerId; cardIds: readonly BuildingCardId[] }>;

/** Explicit fixture zones; all remaining physical cards stay exactly once in the deck. */
export function withCityZones(state: CityGameState, zones: Readonly<{ hands?: readonly CityZone[]; cities?: readonly CityZone[]; discard?: readonly BuildingCardId[]; deck?: readonly BuildingCardId[] }>): CityGameState {
  const players = state.players.map((player) => ({ ...player, hand: zones.hands?.find((zone) => zone.playerId === player.playerId)?.cardIds ?? [], city: zones.cities?.find((zone) => zone.playerId === player.playerId)?.cardIds ?? [] }));
  const discard = zones.discard ?? [];
  const assigned = [...players.flatMap((player) => [...player.hand, ...player.city]), ...discard];
  assert.equal(new Set(assigned).size, assigned.length, "fixture zones cannot duplicate physical cards");
  const assignedSet = new Set(assigned);
  const remaining = state.cards.filter((card) => !assignedSet.has(card.cardId)).map((card) => card.cardId);
  const deck = zones.deck ?? remaining;
  assert.deepEqual([...deck].sort(), [...remaining].sort(), "explicit deck must contain precisely the remaining cards");
  return { ...state, players, deck, discard };
}

export function withCityGold(state: CityGameState, playerId: CityPlayerId, gold: number): CityGameState {
  return { ...state, players: state.players.map((player) => player.playerId === playerId ? { ...player, gold } : player) };
}

export function assertCityCardConservation(state: CityGameState): void {
  const pending = state.pendingChoice?.cards ?? [];
  const zones = [...state.deck, ...state.discard, ...pending, ...state.players.flatMap((player) => [...player.hand, ...player.city])];
  assert.equal(zones.length, state.cards.length);
  assert.equal(new Set(zones).size, state.cards.length);
  assert.deepEqual([...zones].sort(), state.cards.map((card) => card.cardId).sort());
}
