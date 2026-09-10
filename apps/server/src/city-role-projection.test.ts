import assert from "node:assert/strict";
import test from "node:test";
import { CityRolePlayingPlatformSnapshotV2Schema, CityRoleFinishedPlatformSnapshotV2Schema, GameIdSchema, GameRevisionSchema, PlayerIdSchema, ServerTimeSchema } from "@hangul-rummikub/shared";
import { parse, safeParse } from "valibot";
import { projectCityRoleV2Game } from "./games/city-role/compatibility/city-role-v2-game-projector.js";
import { CityRoleGameStateAdapter, type CityRoleStoredGame } from "./games/city-role/compatibility/city-role-game-state-adapter.js";
import type { CityGameState } from "./games/city-role/domain/game-state.js";
import { forfeitCityPlayers } from "./games/city-role/domain/rule-engine.js";
import { actCity, atCityRole, cityEntropy, cityPlaying, completeCityDraft, createCityFixture } from "./testing/city-role-fixtures.test.js";

function stored(state: CityGameState): CityRoleStoredGame {
  const time = (value: number) => parse(ServerTimeSchema, value);
  return new CityRoleGameStateAdapter().cloneAndValidate({ gameId: parse(GameIdSchema, state.gameId), gameRevision: parse(GameRevisionSchema, 7), startedAt: time(1000),
    windowStartedAt: state.window === null ? null : time(2000), deadlineAt: state.window === null ? null : time(state.window.kind === "ROLE_SELECTION" ? 47000 : 92000),
    finishedAt: state.window === null ? time(3000) : null, entropySeed: "a".repeat(64), entropyCounter: 2, state });
}
function project(state: CityGameState, viewer = state.players[0]!.playerId) {
  const playerIds = state.players.map(player => parse(PlayerIdSchema, player.playerId));
  return projectCityRoleV2Game({ phase: state.window === null ? "FINISHED" : "PLAYING", game: stored(state), playerIds, selfPlayerId: parse(PlayerIdSchema, viewer) });
}
function snapshot(state: CityGameState, viewer = state.players[0]!.playerId) {
  return { snapshotVersion: 2, versions: { roomRevision: 1, presenceVersion: 2 }, serverTime: 3000,
    room: { roomId: "city-projection-room", roomCode: "BCDFGH", gameType: "CITY_ROLE", phase: state.window === null ? "FINISHED" : "PLAYING",
      players: state.players.map((player, index) => ({ playerId: player.playerId, nickname: `City${index}`, isHost: index === 0, connectionStatus: "CONNECTED" })) },
    self: { playerId: viewer }, game: project(state, viewer) };
}
test("CITY actual projector: every 2–6-player selection viewer gets only own hand/roles and chooser choices", () => {
  for (const count of [2, 3, 4, 5, 6]) {
    let state = createCityFixture(count);
    state = actCity(state, { kind: "SELECT_ROLE", roleId: state.round.available[0]! });
    for (const viewer of state.players) {
      const value = project(state, viewer.playerId);
      assert.equal(value.phase, "ROLE_SELECTION");
      if (value.phase !== "ROLE_SELECTION") throw new Error("expected selection");
      assert.deepEqual(value.selectionOrder, { playerIds: state.round.pickQueue, currentIndex: state.round.selectionCursor });
      assert.deepEqual(value.privateState.hand.map(card => String(card.cardId)), viewer.hand.map(String));
      assert.deepEqual(value.privateState.selectedRoleIds, state.round.assignments.filter(role => role.playerId === viewer.playerId).map(role => role.roleId));
      assert.equal(value.privateState.availableRoleIds !== undefined, cityPlaying(state).window.activePlayerId === viewer.playerId);
      assert.equal(safeParse(CityRolePlayingPlatformSnapshotV2Schema, snapshot(state, viewer.playerId)).success, true);
      for (const other of state.players.filter(player => player.playerId !== viewer.playerId)) for (const hidden of other.hand) assert.equal(JSON.stringify(value).includes(JSON.stringify(hidden)), false);
    }
  }
});
test("CITY projector discloses no deck, removal, entropy, storage, credential or timeout internals", () => {
  const state = createCityFixture(6), value = project(state);
  for (const field of ["deck", "discard", "hiddenRemoved", "assignments", "entropySeed", "entropyCounter", "storageRevision", "offlineTimeoutStreak", "sessionToken", "requestId", "rack"]) assert.equal(JSON.stringify(value).includes(`"${field}"`), false);
  for (const cardId of state.deck) assert.equal(JSON.stringify(value).includes(`"${cardId}"`), false);
  for (const roleId of state.round.hiddenRemoved) assert.equal(JSON.stringify(value).includes(`"${roleId}"`), false);
});
test("CITY actual action projector exposes role budget only to actor; other player rows remain public", () => {
  const state = completeCityDraft(createCityFixture(6));
  const window = cityPlaying(state).window;
  assert.equal(window.kind, "ROLE_ACTION");
  for (const viewer of state.players) {
    const value = project(state, viewer.playerId);
    assert.equal(value.phase, "ROLE_ACTION");
    if (value.phase !== "ROLE_ACTION") throw new Error("expected action");
    assert.equal(value.privateState.action !== undefined, viewer.playerId === window.activePlayerId);
    assert.equal(value.window.deadlineAt - value.window.startedAt, 90000);
    assert.equal(safeParse(CityRolePlayingPlatformSnapshotV2Schema, snapshot(state, viewer.playerId)).success, true);
    for (const row of value.playerStates) assert.deepEqual(Object.keys(row).sort(), ["builtBuildings", "forfeited", "gold", "handCount", "playerId", "scorePreview"].sort());
  }
});
test("CITY actual pending draw projector is owner-only and repeated projection restores same options/order", () => {
  const state = actCity(atCityRole("CR-03"), { kind: "DRAW_BUILDING_CARDS" });
  assert.ok(state.pendingChoice);
  for (const viewer of state.players) {
    const value = project(state, viewer.playerId);
    if (value.phase !== "ROLE_ACTION") throw new Error("expected action");
    assert.equal(value.window.waitingFor, "DRAW_BUILDING_CHOICE");
    const owns: boolean = viewer.playerId === state.pendingChoice.ownerPlayerId;
    assert.equal(value.privateState.pendingCards !== undefined, owns);
    if (owns) assert.deepEqual(value.privateState.pendingCards?.map(card => String(card.cardId)), state.pendingChoice.cards.map(String));
    else for (const hidden of state.pendingChoice.cards) assert.equal(JSON.stringify(value).includes(JSON.stringify(hidden)), false);
    assert.deepEqual(project(state, viewer.playerId), value);
    assert.equal(safeParse(CityRolePlayingPlatformSnapshotV2Schema, snapshot(state, viewer.playerId)).success, true);
  }
});
test("CITY private interference target is visible only to source before resolution", () => {
  let state = atCityRole("CR-01");
  const owner = cityPlaying(state).window.activePlayerId;
  state = actCity(state, { kind: "TAKE_INCOME" });
  state = actCity(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_DISABLED", targetRoleId: "CR-06" } });
  for (const viewer of state.players) {
    const value = project(state, viewer.playerId);
    assert.deepEqual(value.privateState.marks, viewer.playerId === owner ? [{ kind: "DISABLE", targetRoleId: "CR-06", status: "UNRESOLVED" }] : []);
    assert.equal(safeParse(CityRolePlayingPlatformSnapshotV2Schema, snapshot(state, viewer.playerId)).success, true);
  }
});
test("CITY forfeited secret assignments stay owner-private and immediate finish adds no hidden reveal", () => {
  let state = createCityFixture(3);
  const leaving = cityPlaying(state).window.activePlayerId;
  const role = state.round.available[0]!;
  state = actCity(state, { kind: "SELECT_ROLE", roleId: role });
  state = forfeitCityPlayers(state, [leaving], cityEntropy(state));
  assert.equal(state.round.assignments.find(entry => entry.roleId === role)?.status, "TOMBSTONED");
  for (const viewer of state.players) {
    const value = project(state, viewer.playerId);
    assert.equal(value.privateState.selectedRoleIds.includes(role), viewer.playerId === leaving);
    assert.deepEqual(value.revealedRoles, []);
  }
  const nextLeaving = state.players.find(player => !player.forfeited && player.playerId !== cityPlaying(state).window.activePlayerId)!.playerId;
  state = forfeitCityPlayers(state, [nextLeaving], cityEntropy(state));
  assert.equal(state.result?.reason, "LAST_PLAYER_STANDING");
  for (const viewer of state.players) {
    const value = project(state, viewer.playerId);
    assert.equal(value.phase, "FINISHED");
    assert.deepEqual(value.revealedRoles, []);
    assert.equal(safeParse(CityRoleFinishedPlatformSnapshotV2Schema, snapshot(state, viewer.playerId)).success, true);
  }
});
test("CITY disabled owner is revealed only at normal round end and retained after next setup", () => {
  let state = atCityRole("CR-01");
  state = actCity(state, { kind: "TAKE_INCOME" });
  state = actCity(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_DISABLED", targetRoleId: "CR-06" } });
  const disabledOwner = state.round.assignments.find(role => role.roleId === "CR-06")!.playerId;
  state = actCity(state, { kind: "END_TURN" });
  while (state.round.roundNumber === 1) {
    assert.equal(project(state).revealedRoles.some(role => role.roleId === "CR-06"), false);
    state = actCity(state, { kind: "TAKE_INCOME" });
    state = actCity(state, { kind: "END_TURN" });
  }
  for (const viewer of state.players) assert.deepEqual(project(state, viewer.playerId).revealedRoles.find(role => role.roleId === "CR-06"), { roundNumber: 1, roleId: "CR-06", playerId: disabledOwner, kind: "DISABLED" });
});
test("CITY LPS preserves surviving pending only for its owner and has no stale action window", () => {
  let state = completeCityDraft(createCityFixture(2));
  state = actCity(state, { kind: "DRAW_BUILDING_CARDS" });
  const owner = state.pendingChoice!.ownerPlayerId;
  state = forfeitCityPlayers(state, [state.players.find(player => player.playerId !== owner)!.playerId]);
  for (const viewer of state.players) {
    const value = project(state, viewer.playerId);
    assert.equal(value.phase, "FINISHED");
    assert.equal("window" in value, false);
    assert.equal("pendingCards" in value.privateState, viewer.playerId === owner);
    assert.equal(safeParse(CityRoleFinishedPlatformSnapshotV2Schema, snapshot(state, viewer.playerId)).success, true);
  }
});
test("CITY actual projector fails closed for outside viewer, wrong roster and phase", () => {
  const state = createCityFixture(3), game = stored(state), playerIds = state.players.map(player => parse(PlayerIdSchema, player.playerId));
  assert.throws(() => projectCityRoleV2Game({ phase: "PLAYING", game, playerIds, selfPlayerId: parse(PlayerIdSchema, "outside") }));
  assert.throws(() => projectCityRoleV2Game({ phase: "PLAYING", game, playerIds: playerIds.slice(1), selfPlayerId: playerIds[1]! }));
  assert.throws(() => projectCityRoleV2Game({ phase: "FINISHED", game, playerIds, selfPlayerId: playerIds[0]! }));
});
test("CITY actual shell decoder rejects same projection delivered to another viewer or changed hand count", () => {
  const state = createCityFixture(3), value = snapshot(state);
  assert.equal(safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, self: { playerId: state.players[1]!.playerId } }).success, false);
  assert.equal(safeParse(CityRolePlayingPlatformSnapshotV2Schema, { ...value, game: { ...value.game, playerStates: value.game.playerStates.map(player => ({ ...player, handCount: player.handCount + 1 })) } }).success, false);
});


test("CITY selection order survives restore and identifies the second pick without publishing chosen roles", () => {
  let state=createCityFixture(3);
  for(let step=0;step<4;step++) state=actCity(state,{kind:"SELECT_ROLE",roleId:state.round.available[0]!});
  const restored=new CityRoleGameStateAdapter().cloneAndValidate(JSON.parse(JSON.stringify(stored(state))));
  for(const player of state.players){
    const view=project(restored.state,player.playerId);assert.ok(view.phase==='ROLE_SELECTION');
    assert.deepEqual(view.selectionOrder,{playerIds:[...state.seatOrder,...state.seatOrder],currentIndex:4});
    assert.deepEqual(Object.keys(view.selectionOrder!).sort(),['currentIndex','playerIds']);
  }
  const ended=project(completeCityDraft(createCityFixture(3)));
  assert.equal('selectionOrder' in ended,false);
});
