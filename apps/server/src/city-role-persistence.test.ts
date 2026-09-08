import assert from "node:assert/strict";
import test from "node:test";
import { GameIdSchema, GameRevisionSchema, NicknameSchema, PlayerIdSchema, RoomCodeSchema, RoomIdSchema, RoomRevisionSchema, ServerTimeSchema } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { CityRoleGameStateAdapter, type CityRoleStoredGame } from "./games/city-role/compatibility/city-role-game-state-adapter.js";
import { forfeitCityPlayers } from "./games/city-role/domain/rule-engine.js";
import { actCity, atCityRole, cityPlaying, completeCityDraft, createCityFixture } from "./testing/city-role-fixtures.test.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import type { CityRoleRoomRecord } from "./model/persistence.js";

const adapter = new CityRoleGameStateAdapter();
function stored(state = createCityFixture()): CityRoleStoredGame {
  return { gameId: parse(GameIdSchema, state.gameId), gameRevision: parse(GameRevisionSchema, 8), startedAt: parse(ServerTimeSchema, 1000),
    windowStartedAt: state.window === null ? null : parse(ServerTimeSchema, 2000), deadlineAt: state.window === null ? null : parse(ServerTimeSchema, state.window.kind === "ROLE_SELECTION" ? 47000 : 92000),
    finishedAt: state.window === null ? parse(ServerTimeSchema, 3000) : null, entropySeed: "b".repeat(64), entropyCounter: 27, state };
}
function room(game: CityRoleStoredGame) {
  return { roomId: parse(RoomIdSchema, "city-store-room"), roomCode: parse(RoomCodeSchema, "BCDFGH"), gameType: "CITY_ROLE" as const, phase: game.state.window === null ? "FINISHED" as const : "PLAYING" as const,
    hostPlayerId: parse(PlayerIdSchema, game.state.players[0]!.playerId), players: game.state.players.map((player, i) => ({ playerId: parse(PlayerIdSchema, player.playerId), nickname: parse(NicknameSchema, `City${i}`), joinOrder: i })), game,
    roomRevision: parse(RoomRevisionSchema, 1), createdAt: parse(ServerTimeSchema, 1000), updatedAt: parse(ServerTimeSchema, 3000) };
}
function mutated(game: CityRoleStoredGame, change: (copy: CityRoleStoredGame) => void) { const copy = structuredClone(game); change(copy); return copy; }
test("CITY adapter round-trips all 2–6 player selection/action states with detached frozen secrets", () => {
  for (const count of [2, 3, 4, 5, 6]) for (const state of [createCityFixture(count), completeCityDraft(createCityFixture(count))]) {
    const game = stored(state), copy = adapter.cloneAndValidate(game);
    assert.deepEqual(copy, game);
    assert.notEqual(copy.state, game.state);
    assert.notEqual(copy.state.players[0]!.hand, game.state.players[0]!.hand);
    assert.notEqual(copy.state.round.hiddenRemoved, game.state.round.hiddenRemoved);
    assert.equal(Object.isFrozen(copy.state.round.assignments), true);
    assert.equal(Object.isFrozen(copy.state.deck), true);
    assert.equal(copy.entropySeed, game.entropySeed);
    assert.equal(copy.entropyCounter, game.entropyCounter);
  }
});
test("CITY adapter preserves pending card order, action identity and exact deadline after JSON round-trip", () => {
  const state = actCity(atCityRole("CR-03"), { kind: "DRAW_BUILDING_CARDS" }), game = stored(state);
  const copy = adapter.cloneAndValidate(JSON.parse(JSON.stringify(game)));
  assert.deepEqual(copy.state.pendingChoice, game.state.pendingChoice);
  assert.notEqual(copy.state.pendingChoice, game.state.pendingChoice);
  assert.equal(copy.state.window?.actionId, game.state.window?.actionId);
  assert.equal(copy.deadlineAt, game.deadlineAt);
  assert.equal(copy.gameRevision, game.gameRevision);
});
test("CITY adapter preserves actor-private marks, ownership partition and disclosure history", () => {
  let state = atCityRole("CR-01");
  state = actCity(state, { kind: "TAKE_INCOME" });
  state = actCity(state, { kind: "USE_ROLE_ABILITY", ability: { kind: "MARK_ROLE_DISABLED", targetRoleId: "CR-06" } });
  const game = stored(state), copy = adapter.cloneAndValidate(game);
  assert.deepEqual(copy.state.marks, state.marks);
  assert.deepEqual(copy.state.round.assignments, state.round.assignments);
  assert.deepEqual(copy.state.revealedRoles, state.revealedRoles);
  assert.notEqual(copy.state.marks, state.marks);
});
test("CITY adapter rejects mismatched game identity, phase deadlines, timestamps and invalid revision", () => {
  const game = stored();
  for (const corrupted of [
    mutated(game, copy => Reflect.set(copy, "gameId", "other-game")),
    mutated(game, copy => Reflect.set(copy, "gameRevision", -1)),
    mutated(game, copy => Reflect.set(copy, "deadlineAt", 92000)),
    mutated(game, copy => Reflect.set(copy, "windowStartedAt", 999)),
    mutated(game, copy => Reflect.set(copy, "finishedAt", 3000)),
    mutated(game, copy => Reflect.set(copy, "windowStartedAt", null)),
  ]) assert.throws(() => adapter.cloneAndValidate(corrupted));
});
test("CITY adapter rejects malformed private entropy checkpoint without regenerating it", () => {
  const game = stored();
  for (const seed of ["", "a".repeat(63), "z".repeat(64), "A".repeat(64)]) assert.throws(() => adapter.cloneAndValidate({ ...game, entropySeed: seed }));
  for (const seed of [["0".repeat(64)], 0, null, undefined, {}, true]) {
    assert.throws(() => adapter.cloneAndValidate(mutated(game, copy => Reflect.set(copy, "entropySeed", seed))));
  }
  for (const counter of [-1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) assert.throws(() => adapter.cloneAndValidate({ ...game, entropyCounter: counter }));
  assert.equal(adapter.cloneAndValidate({ ...game, entropyCounter: 0 }).entropyCounter, 0);
});
test("CITY adapter rejects 60-zone loss/duplication/forgery and malformed eight-role partition", () => {
  const game = stored();
  const corruptions = [
    mutated(game, copy => Reflect.set(copy.state, "deck", copy.state.deck.slice(1))),
    mutated(game, copy => Reflect.set(copy.state, "deck", [copy.state.players[0]!.hand[0], ...copy.state.deck.slice(1)])),
    mutated(game, copy => Reflect.set(copy.state, "deck", ["forged", ...copy.state.deck.slice(1)])),
    mutated(game, copy => Reflect.set(copy.state.round, "available", copy.state.round.available.slice(1))),
    mutated(game, copy => Reflect.set(copy.state.round, "hiddenRemoved", [copy.state.round.available[0]])),
    mutated(game, copy => Reflect.set(copy.state, "rulesVersion", "city-rules-next")),
  ];
  for (const value of corruptions) assert.throws(() => adapter.cloneAndValidate(value));
});
test("CITY adapter lifecycle identifies exactly one selection/action deadline and none after finish", () => {
  for (const state of [createCityFixture(2), completeCityDraft(createCityFixture(2))]) {
    const game = adapter.cloneAndValidate(stored(state)), inspected = adapter.inspectLifecycle(game);
    assert.equal(inspected.lifecycle, "RUNNING");
    if (inspected.lifecycle !== "RUNNING") throw new Error("expected running");
    assert.equal(inspected.activeTurn.turnId, String(state.window?.actionId));
    assert.equal(inspected.activeTurn.deadlineAt, game.deadlineAt);
    assert.equal(inspected.gameRevision, game.gameRevision);
  }
  const state = createCityFixture(2), finished = forfeitCityPlayers(state, [state.players[1]!.playerId]);
  const game = adapter.cloneAndValidate(stored(finished));
  assert.deepEqual(adapter.inspectLifecycle(game), { lifecycle: "FINISHED", gameId: game.gameId, finishedAt: game.finishedAt });
  assert.throws(() => adapter.cloneAndValidate({ ...game, deadlineAt: parse(ServerTimeSchema, 5000) }));
  assert.throws(() => adapter.cloneAndValidate({ ...game, finishedAt: parse(ServerTimeSchema, 999) }));
});
test("CITY actual persistence preserves six-player roster, pending/private state and singular recovery descriptor", async () => {
  const persistence = new InMemoryPersistence();
  let state = completeCityDraft(createCityFixture(6));
  state = actCity(state, { kind: "DRAW_BUILDING_CARDS" });
  const candidate = room(stored(state)), created = await persistence.createIfAbsent(candidate);
  assert.equal(created.status, "CREATED");
  const read = await persistence.findById(candidate.roomId);
  assert.ok(read && read.gameType === "CITY_ROLE" && read.game);
  assert.deepEqual(read.game, candidate.game);
  assert.notEqual(read.game.state.pendingChoice, candidate.game.state.pendingChoice);
  const deadlines = await persistence.listActiveTurnDeadlines();
  assert.equal(deadlines.length, 1);
  assert.equal(deadlines[0]?.turnId, String(cityPlaying(state).window.actionId));
  assert.equal(deadlines[0]?.deadlineAt, candidate.game.deadlineAt);
  assert.equal((await persistence.listActiveGameDeadlines()).length, 0);
});
test("CITY persistence rejects roster/game correlation corruption and keeps previously stored room", async () => {
  const persistence = new InMemoryPersistence(), candidate = room(stored(createCityFixture(4)));
  const created = await persistence.createIfAbsent(candidate);
  assert.equal(created.status, "CREATED");
  if (created.status !== "CREATED") throw new Error("fixture create failed");
  const before = created.room;
  await assert.rejects(() => persistence.replace({ candidate: { ...candidate, players: candidate.players.slice(1) }, expectedRoomRevision: before.roomRevision, expectedStorageRevision: before.storageRevision }));
  const after = await persistence.findById(candidate.roomId);
  assert.deepEqual(after, before);
});
test("CITY finished persistence retains frozen survivor pending and removes active scheduler recovery", async () => {
  const persistence = new InMemoryPersistence();
  let state = actCity(completeCityDraft(createCityFixture(2)), { kind: "DRAW_BUILDING_CARDS" });
  const owner = state.pendingChoice!.ownerPlayerId;
  state = forfeitCityPlayers(state, [state.players.find(player => player.playerId !== owner)!.playerId]);
  const candidate = room(stored(state));
  assert.equal((await persistence.createIfAbsent(candidate)).status, "CREATED");
  const restored = await persistence.findById(candidate.roomId);
  assert.ok(restored?.gameType === "CITY_ROLE" && restored.game);
  const city: CityRoleRoomRecord = restored;
  assert.deepEqual(city.game?.state.pendingChoice, state.pendingChoice);
  assert.equal((await persistence.listActiveTurnDeadlines()).length, 0);
});
