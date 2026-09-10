import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { CityClientCommandSchema, CityActionWireAckSchema, CityRoleLobbyPlatformSnapshotV2Schema, CityRolePlayingPlatformSnapshotV2Schema,
  CityRoleFinishedPlatformSnapshotV2Schema, PlatformSnapshotV2Schema, StateSnapshotSchema, GameTypeSchema,
  CityRoleAbilityPayloadSchema, validateCityClientCommand, resolveSupportedGameTypesCapability,
  validateCitySelectRoleCommand, validateCityTakeIncomeCommand, validateCityDrawBuildingCardsCommand,
  validateCityChooseBuildingCardCommand, validateCityUseRoleAbilityCommand, validateCityBuildCommand, validateCityEndTurnCommand } from "./index.js";

const envelope = { protocolVersion: 1, requestId: "city-request", gameId: "city-game", expectedGameRevision: 0, actionId: "city-action" };
const commands = [
  { ...envelope, kind: "city:selectRole", payload: { roleId: "CR-03" } },
  { ...envelope, kind: "city:takeIncome", payload: {} },
  { ...envelope, kind: "city:drawBuildingCards", payload: {} },
  { ...envelope, kind: "city:chooseBuildingCard", payload: { cardId: "physical-card-A" } },
  { ...envelope, kind: "city:useRoleAbility", payload: { ability: "MARK_ROLE_DISABLED", targetRoleId: "CR-07" } },
  { ...envelope, kind: "city:build", payload: { cardId: "physical-card-A" } },
  { ...envelope, kind: "city:endTurn", payload: {} },
] as const;
const validators = [validateCitySelectRoleCommand, validateCityTakeIncomeCommand, validateCityDrawBuildingCardsCommand, validateCityChooseBuildingCardCommand, validateCityUseRoleAbilityCommand, validateCityBuildCommand, validateCityEndTurnCommand];
function lobby(count = 2) {
  return { snapshotVersion: 2, versions: { roomRevision: 0, presenceVersion: 0 }, serverTime: 1000,
    room: { roomId: "city-room", roomCode: "BCDFGH", gameType: "CITY_ROLE", phase: "LOBBY", players: Array.from({ length: count }, (_, i) => ({ playerId: `P${i}`, nickname: `P${i}`, isHost: i === 0, connectionStatus: "CONNECTED" })) }, self: { playerId: "P0" }, game: null };
}
function card(id = "physical-card-A") { return { cardId: id, templateId: "CB-CIV-01", name: "비표보관소", category: "CIVIC", cost: 1, victoryPoints: 1 }; }
function selection(count = 2) {
  const outer = lobby(count);
  return { ...outer, room: { ...outer.room, phase: "PLAYING" }, game: {
    gameType: "CITY_ROLE", gameId: "city-game", gameRevision: 0, rulesVersion: "city-rules-v1", cardSetVersion: "city-cardset-v1", roleSetVersion: "city-roles-v1",
    phase: "ROLE_SELECTION", roundNumber: 1, rolesPerPlayer: count <= 3 ? 2 : 1, seatOrder: outer.room.players.map(p => p.playerId), leaderPlayerId: "P0",
    playerStates: outer.room.players.map((p, i) => ({ playerId: p.playerId, gold: 2, handCount: i === 0 ? 1 : 4, builtBuildings: [], scorePreview: 0, forfeited: false })),
    publicRemovedRoleIds: ["CR-08"], revealedRoles: [], protectedPlayerIds: [], firstCompletion: null,
    window: { actionId: "city-action", activePlayerId: "P0", startedAt: 1000, deadlineAt: 46000 },
    privateState: { hand: [card()], selectedRoleIds: [], marks: [], availableRoleIds: ["CR-01", "CR-02", "CR-03", "CR-04", "CR-05"] },
  } };
}
function action(pending = false) {
  const value = selection();
  const { availableRoleIds: _choices, ...privateBase } = value.game.privateState;
  return { ...value, game: { ...value.game, phase: "ROLE_ACTION", publicRemovedRoleIds: [],
    revealedRoles: [{ roundNumber: 1, roleId: "CR-03", playerId: "P0", kind: "NORMAL" }],
    window: { ...value.game.window, deadlineAt: 91000, activeRoleId: "CR-03", waitingFor: pending ? "DRAW_BUILDING_CHOICE" : "ACTION" },
    privateState: { ...privateBase, selectedRoleIds: ["CR-03"], action: { acquisition: pending ? "PENDING" : "COMPLETE", abilityUsed: false, buildingsBuilt: 0 },
      ...(pending ? { pendingCards: [card("pending-A"), card("pending-B")] } : {}) },
  } };
}
function finished() {
  const value = action();
  const { window: _window, privateState, ...common } = value.game;
  const { action: _budget, ...privateBase } = privateState;
  return { ...value, room: { ...value.room, phase: "FINISHED" }, game: { ...common, phase: "FINISHED", privateState: privateBase,
    playerStates: common.playerStates.map(p => p.playerId === "P1" ? { ...p, forfeited: true, gold: 0, handCount: 0 } : p),
    result: { reason: "LAST_PLAYER_STANDING", finishedAt: 10000, winnerPlayerIds: ["P0"], rankings: common.playerStates.map((p, i) => ({ playerId: p.playerId, rank: i + 1, score: 0, buildingVP: 0, completionBonus: 0, diversityBonus: 0, buildingCount: 0, forfeited: i === 1, winner: i === 0 })) },
  } };
}

test("CITY Landmark v2 versions require public history and reject silent v1/mixed interpretation", () => {
  const base = selection();
  const landmarkHistory = base.game.playerStates.map(p => ({ playerId: p.playerId, gardenUsed: false, sundialUsed: false,
    staircaseInitialized: false, staircaseRemaining: 0, staircaseSpent: 0, lastDiscountRound: null }));
  const game = { ...base.game, rulesVersion: "city-rules-v2", cardSetVersion: "city-cardset-v2", landmarkHistory };
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game }).success, true);
  for (const invalid of [ { ...base.game, rulesVersion: "city-rules-v2" }, { ...base.game, landmarkHistory },
    { ...game, cardSetVersion: "city-cardset-v1" }, { ...game, landmarkHistory: [] },
    { ...game, landmarkHistory: landmarkHistory.map(row => ({ ...row, staircaseRemaining: 3 })) },
    { ...game, landmarkHistory: landmarkHistory.map(row => ({ ...row, hiddenRole: "CR-01" })) } ])
    assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: invalid }).success, false);
});
test("CITY Landmark v2 result requires a bounded explicit bonus; v1 refuses the new bonus field", () => {
  const base = finished();
  const landmarkHistory = base.game.playerStates.map(p => ({ playerId: p.playerId, gardenUsed: false, sundialUsed: false,
    staircaseInitialized: false, staircaseRemaining: 0, staircaseSpent: 0, lastDiscountRound: null }));
  const game = { ...base.game, rulesVersion: "city-rules-v2", cardSetVersion: "city-cardset-v2", landmarkHistory,
    result: { ...base.game.result, rankings: base.game.result.rankings.map(row => ({ ...row, landmarkBonus: 0 })) } };
  assert.equal(v.safeParse(CityRoleFinishedPlatformSnapshotV2Schema, { ...base, game }).success, true);
  assert.equal(v.safeParse(CityRoleFinishedPlatformSnapshotV2Schema, { ...base, game: { ...game, result: base.game.result } }).success, false);
  assert.equal(v.safeParse(CityRoleFinishedPlatformSnapshotV2Schema, { ...base, game: { ...base.game, result: game.result } }).success, false);
  assert.equal(v.safeParse(CityRoleFinishedPlatformSnapshotV2Schema, { ...base, game: { ...game, result: { ...game.result,
    rankings: game.result.rankings.map(row => ({ ...row, landmarkBonus: 5, score: 5 })) } } }).success, false);
});

test("CITY is the fourth explicit capability while absent capability remains Hangul-only", () => {
  assert.equal(v.safeParse(GameTypeSchema, "CITY_ROLE").success, true);
  assert.deepEqual(resolveSupportedGameTypesCapability({}), { ok: true, mode: "LEGACY_DEFAULT", supportedGameTypes: ["HANGUL_TILE"] });
  assert.deepEqual(resolveSupportedGameTypesCapability({ supportedGameTypes: ["CITY_ROLE"] }), { ok: true, mode: "EXPLICIT", supportedGameTypes: ["CITY_ROLE"] });
});
test("all seven CITY events validate concrete identity and per-event validators", () => {
  commands.forEach((command, i) => { assert.equal(v.safeParse(CityClientCommandSchema, command).success, true); assert.equal(validateCityClientCommand(command).ok, true); assert.equal(validators[i]?.(command).ok, true); });
});
test("CITY command envelopes reject missing/stale-shape identity and client authority fields", () => {
  for (const key of ["gameId", "actionId", "requestId", "expectedGameRevision"]) {
    const value: Record<string, unknown> = { ...commands[0] }; delete value[key];
    assert.equal(v.safeParse(CityClientCommandSchema, value).success, false);
  }
  for (const extra of [{ turnId: "fake" }, { playerId: "P1" }, { deadlineAt: 90000 }, { gameRevision: 0 }]) assert.equal(v.safeParse(CityClientCommandSchema, { ...commands[0], ...extra }).success, false);
  for (const revision of [-1, 0.5, NaN]) assert.equal(v.safeParse(CityClientCommandSchema, { ...commands[0], expectedGameRevision: revision }).success, false);
  assert.equal(validateCityClientCommand({ ...commands[0], kind: "gem:yield" }).ok, false);
});
test("CITY ability is a closed five-variant payload and zero/duplicate self replacement fails", () => {
  for (const payload of [{ ability: "MARK_ROLE_DISABLED", targetRoleId: "CR-08" }, { ability: "MARK_ROLE_GOLD_TRANSFER", targetRoleId: "CR-07" }, { ability: "EXCHANGE_HANDS", targetPlayerId: "P1" }, { ability: "REPLACE_OWN_CARDS", cardIds: ["card1"] }, { ability: "DESTROY_BUILDING", targetPlayerId: "P1", cardId: "card1" }]) assert.equal(v.safeParse(CityRoleAbilityPayloadSchema, payload).success, true);
  for (const payload of [{ ability: "REPLACE_OWN_CARDS", cardIds: [] }, { ability: "REPLACE_OWN_CARDS", cardIds: ["a", "a"] }, { ability: "ARBITRARY" }, { ability: "MARK_ROLE_DISABLED", targetRoleId: "CR-10" }, { ability: "EXCHANGE_HANDS", targetPlayerId: "P1", gold: 2 }]) assert.equal(v.safeParse(CityRoleAbilityPayloadSchema, payload).success, false);
});
test("CITY ACK contains committed identity only and no private replay snapshot", () => {
  const ack = { scope: "ROOM", requestId: "request", ok: true, serverTime: 1000, versions: { roomRevision: 0, presenceVersion: 0, gameRevision: 2 }, data: { gameId: "city-game", committedGameRevision: 2 } };
  assert.equal(v.safeParse(CityActionWireAckSchema, ack).success, true);
  assert.equal(v.safeParse(CityActionWireAckSchema, { ...ack, data: { ...ack.data, snapshot: selection() } }).success, false);
});
test("CITY V2 Lobby supports six but not seven and legacy V1 rejects CITY", () => {
  for (const count of [1, 2, 3, 4, 5, 6]) assert.equal(v.safeParse(CityRoleLobbyPlatformSnapshotV2Schema, lobby(count)).success, true);
  assert.equal(v.safeParse(CityRoleLobbyPlatformSnapshotV2Schema, lobby(7)).success, false);
  assert.equal(v.safeParse(StateSnapshotSchema, lobby()).success, false);
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...lobby(), snapshotVersion: 1 }).success, false);
});
test("CITY selection supports exact 2–6 roster with one private chooser", () => {
  for (const count of [2, 3, 4, 5, 6]) assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, selection(count)).success, true);
  const value = selection();
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, self: { playerId: "P1" } }).success, false);
});
test("CITY chooser list is absent for non-chooser rather than empty or stale", () => {
  const value = selection(), { availableRoleIds: _choices, ...privateBase } = value.game.privateState;
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, game: { ...value.game, privateState: privateBase } }).success, false);
  const other = { ...value, self: { playerId: "P1" }, game: { ...value.game, privateState: { ...privateBase, hand: [] }, playerStates: value.game.playerStates.map(p => p.playerId === "P1" ? { ...p, handCount: 0 } : p) } };
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, other).success, true);
});
test("CITY strict projection rejects server secrets at every exposed shell", () => {
  const value = selection();
  for (const extra of [{ hiddenRemoved: ["CR-07"] }, { deck: ["future"] }, { discard: [] }, { rng: 1 }, { storageRevision: 1 }, { offlineTimeoutStreak: 1 }, { assignments: [] }]) assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, game: { ...value.game, ...extra } }).success, false);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, game: { ...value.game, playerStates: value.game.playerStates.map(p => ({ ...p, hand: [] })) } }).success, false);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, self: { ...value.self, sessionToken: "secret" } }).success, false);
});
test("CITY rejects duplicate roster, missing self and private hand count mismatch", () => {
  const value = selection();
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, self: { playerId: "unknown" } }).success, false);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, game: { ...value.game, seatOrder: ["P0", "P0"] } }).success, false);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, game: { ...value.game, privateState: { ...value.game.privateState, hand: [] } } }).success, false);
});
test("CITY visible physical cards cannot overlap hand, city or pending", () => {
  const value = action(true);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, value).success, true);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, game: { ...value.game, privateState: { ...value.game.privateState, pendingCards: [card()] } } }).success, false);
});
test("CITY pending choice and action budget belong only to active viewer", () => {
  const value = action(true);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, value).success, true);
  const { action: _budget, pendingCards: _pending, ...privateBase } = value.game.privateState;
  const other = { ...value, self: { playerId: "P1" }, game: { ...value.game, privateState: { ...privateBase, hand: [], selectedRoleIds: [] }, playerStates: value.game.playerStates.map(p => p.playerId === "P1" ? { ...p, handCount: 0 } : p) } };
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, other).success, true);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...other, game: { ...other.game, privateState: { ...other.game.privateState, pendingCards: [card("leaked")] } } }).success, false);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...other, game: { ...other.game, window: { ...other.game.window, candidateCount: 2 } } }).success, false);
});
test("CITY deadlines are phase-specific and private pending never creates another window", () => {
  const s = selection(), a = action();
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...s, game: { ...s.game, window: { ...s.game.window, deadlineAt: 91000 } } }).success, false);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...a, game: { ...a.game, window: { ...a.game.window, deadlineAt: 46000 } } }).success, false);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...a, game: { ...a.game, privateState: { ...a.game.privateState, pendingActionId: "fresh" } } }).success, false);
});
test("CITY role action must match public reveal and private role ownership", () => {
  const value = action();
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, value).success, true);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, game: { ...value.game, revealedRoles: [] } }).success, false);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, game: { ...value.game, revealedRoles: [{ roundNumber: 1, roleId: "CR-03", playerId: "P1", kind: "NORMAL" }] } }).success, false);
});
test("CITY no fake rack and no cross-game projection correlation", () => {
  const value = action();
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...value, room: { ...value.room, gameType: "GEM_CARD" } }).success, false);
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, { ...value, game: { ...value.game, privateState: { ...value.game.privateState, rack: [] } } }).success, false);
});
test("CITY finished result preserves private hand and rejects score/winner forgery", () => {
  const value = finished();
  assert.equal(v.safeParse(CityRoleFinishedPlatformSnapshotV2Schema, value).success, true);
  assert.equal(v.safeParse(CityRoleFinishedPlatformSnapshotV2Schema, { ...value, game: { ...value.game, result: { ...value.game.result, winnerPlayerIds: ["P1"] } } }).success, false);
  assert.equal(v.safeParse(CityRoleFinishedPlatformSnapshotV2Schema, { ...value, game: { ...value.game, result: { ...value.game.result, rankings: value.game.result.rankings.map(row => ({ ...row, score: 10 })) } } }).success, false);
});
test("CITY no-eligible finished result has no winners and no leaked pending cards", () => {
  const value = finished();
  const game = { ...value.game, privateState: { hand: [], selectedRoleIds: [], marks: [] }, playerStates: value.game.playerStates.map(p => ({ ...p, forfeited: true, gold: 0, handCount: 0 })),
    result: { ...value.game.result, reason: "NO_ELIGIBLE_PLAYERS", winnerPlayerIds: [], rankings: value.game.result.rankings.map(row => ({ ...row, rank: 1, forfeited: true, winner: false })) } };
  assert.equal(v.safeParse(CityRoleFinishedPlatformSnapshotV2Schema, { ...value, game }).success, true);
  assert.equal(v.safeParse(CityRoleFinishedPlatformSnapshotV2Schema, { ...value, game: { ...game, privateState: { ...game.privateState, pendingCards: [card()] } } }).success, false);
});

test("CITY expanded deck accepts a 66-card v2 hand and replacement, but rejects overflow", () => {
  const base = selection();
  const hand = Array.from({ length: 66 }, (_, i) => card(`expanded-${i}`));
  const snapshot = { ...base, game: { ...base.game, rulesVersion: "city-rules-v2", cardSetVersion: "city-cardset-v2",
    landmarkHistory: base.game.playerStates.map(p => ({ playerId: p.playerId, gardenUsed: false, sundialUsed: false,
      staircaseInitialized: false, staircaseRemaining: 0, staircaseSpent: 0, lastDiscountRound: null })),
    playerStates: base.game.playerStates.map((p, i) => ({ ...p, handCount: i === 0 ? 66 : 0 })),
    privateState: { ...base.game.privateState, hand },
  } };
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, snapshot).success, true);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot,
    game: { ...snapshot.game, privateState: { ...snapshot.game.privateState, hand: [...hand, card("overflow")] } },
  }).success, false);
  assert.equal(v.safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot,
    game: { ...snapshot.game, rulesVersion: "city-rules-v1", cardSetVersion: "city-cardset-v1", landmarkHistory: undefined },
  }).success, false);
  const payload = { ability: "REPLACE_OWN_CARDS", cardIds: hand.map(c => c.cardId) };
  assert.equal(v.safeParse(CityRoleAbilityPayloadSchema, payload).success, true);
  assert.equal(v.safeParse(CityRoleAbilityPayloadSchema, { ...payload, cardIds: [...payload.cardIds, "extra-67", "extra-68", "overflow-69"] }).success, false);
});
