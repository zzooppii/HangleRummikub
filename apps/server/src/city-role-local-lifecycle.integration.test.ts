import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import {
  CityActionIdSchema, CityRoleFinishedPlatformSnapshotV2Schema, CityRolePlayingPlatformSnapshotV2Schema,
  GameIdSchema, GameRevisionSchema, NicknameSchema, PlayerIdSchema, PresenceVersionSchema,
  RequestIdSchema, RoomCodeSchema, RoomIdSchema, RoomRevisionSchema, ServerTimeSchema, TurnIdSchema,
  type RoomId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { RoomLeaveService } from "./application/room-leave-service.js";
import { CityRoleCommandService } from "./games/city-role/application/city-role-command-service.js";
import { createCityRolePlayerLifecycleActions } from "./games/city-role/application/city-role-player-lifecycle-actions.js";
import { CityRoleTimeoutService } from "./games/city-role/application/city-role-timeout-service.js";
import { projectCityRoleV2Game } from "./games/city-role/compatibility/city-role-v2-game-projector.js";
import type { CityRoleStoredGame } from "./games/city-role/compatibility/city-role-game-state-adapter.js";
import { CITY_BUILDING_TEMPLATES } from "./games/city-role/domain/cardset-v1.js";
import type { CityGameState } from "./games/city-role/domain/game-state.js";
import { CITY_ROLE_IDS, type CityRoleId } from "./games/city-role/domain/role.js";
import { forfeitCityPlayers } from "./games/city-role/domain/rule-engine.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import { InProcessTurnScheduler } from "./infrastructure/in-process-turn-scheduler.js";
import { KeyedSerialExecutor } from "./infrastructure/keyed-serial-executor.js";
import { FakeClock, FakeIdGenerator } from "./infrastructure/system.js";
import { createUnboundSessionRecord } from "./model/persistence.js";
import type { ScheduledTurnDeadline } from "./ports/system.js";
import {
  actCity, assertCityCardConservation, atCityRole, cityCard, cityPlayer, cityPlaying,
  completeCityDraft, createCityFixture, withCityGold, withCityZones,
} from "./testing/city-role-fixtures.test.js";

const authorization = { isCurrent: () => true };

// Fixtures seed a valid private state only in isolated test persistence. Every
// operation under test uses real application/UoW/projector/scheduler code.
async function localLifecycle(t: TestContext, initial: CityGameState) {
  const persistence = new InMemoryPersistence(), clock = new FakeClock(1_000), ids = new FakeIdGenerator();
  const roomId = parse(RoomIdSchema, "city-local-lifecycle");
  const players = initial.players.map((player, index) => ({
    playerId: parse(PlayerIdSchema, player.playerId), nickname: parse(NicknameSchema, `City${index}`), joinOrder: index,
  }));
  const game: CityRoleStoredGame = {
    gameId: parse(GameIdSchema, initial.gameId), gameRevision: parse(GameRevisionSchema, 10),
    startedAt: clock.now(), windowStartedAt: initial.window === null ? null : clock.now(),
    deadlineAt: initial.window === null ? null : parse(ServerTimeSchema, clock.now() + (initial.window.kind === "ROLE_SELECTION" ? 45_000 : 90_000)),
    finishedAt: initial.window === null ? clock.now() : null, entropySeed: "d".repeat(64), entropyCounter: 0, state: initial,
  };
  assert.equal((await persistence.createIfAbsent({ roomId, roomCode: parse(RoomCodeSchema, "BCDFGH"), gameType: "CITY_ROLE",
    phase: initial.window === null ? "FINISHED" : "PLAYING", hostPlayerId: players[0]!.playerId, players, game,
    roomRevision: parse(RoomRevisionSchema, 1), createdAt: clock.now(), updatedAt: clock.now(),
  })).status, "CREATED");
  const sessions = players.map((_, index) => ({ algorithm: "SHA-256" as const, digestHex: (index + 1).toString(16).repeat(64) }));
  for (const [index, player] of players.entries()) {
    assert.equal((await persistence.saveUnbound(createUnboundSessionRecord(sessions[index]!, clock.now()))).status, "SAVED");
    assert.equal((await persistence.promoteUnbound({ verificationData: sessions[index]!, roomId, playerId: player.playerId, now: clock.now() })).status, "PROMOTED");
  }
  const offline = new Set<string>(), timerHandles = new Set<number>();
  let sequence = 0;
  const scheduler = new InProcessTurnScheduler({ clock, onDeadline: async deadline => { await timeout.timeout(deadline); }, timerDriver: {
    set: () => { const handle = ++sequence; timerHandles.add(handle); return handle; },
    clear: handle => { assert.ok(typeof handle === "number"); timerHandles.delete(handle); },
  } });
  scheduler.start(); t.after(() => scheduler.stop());
  const deps = { roomRepository: persistence, idempotencyRepository: persistence, roomUnitOfWork: persistence,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(), clock, idGenerator: ids, turnScheduler: scheduler };
  const service = new CityRoleCommandService(deps);
  const timeout = new CityRoleTimeoutService({ ...deps, presenceLeaseReader: {
    acquirePlayerPresenceLease: async (_roomId, playerId) => ({ connectionStatus: offline.has(playerId) ? "OFFLINE" : "CONNECTED", connectionGeneration: 1, isCurrent: () => true }),
  } });
  const lifecycle = createCityRolePlayerLifecycleActions(ids);
  const leave = new RoomLeaveService({ ...deps, roomCleanupUnitOfWork: persistence, playerLifecycleActions: {
    applyPlayingLeave: input => lifecycle.applyPlayingLeave(input),
    planPresenceRestored: (room, playerId) => {
      const plan = lifecycle.planPresenceRestored(room, playerId);
      return plan.status === "NO_CHANGE" ? plan : { ...plan, gameType: "CITY_ROLE" };
    },
  }, presenceReader: {
    acquireLobbyDisconnectLease: async () => { throw new Error("This fixture is not a Lobby."); },
    acquireRoomPresenceLease: async () => ({ presenceVersion: parse(PresenceVersionSchema, 0),
      connectionStatusByPlayerId: new Map(players.map(player => [player.playerId, "CONNECTED" as const])), isCurrent: () => true }),
  } });
  async function read() {
    const room = await persistence.findById(roomId);
    assert.ok(room?.gameType === "CITY_ROLE" && room.game && room.phase !== "LOBBY");
    return { ...room, phase: room.phase, game: room.game };
  }
  async function deadline(): Promise<ScheduledTurnDeadline> {
    const room = await read(); assert.ok(room.game.state.window && room.game.deadlineAt !== null);
    return { roomId, gameId: room.game.gameId, turnId: parse(TurnIdSchema, room.game.state.window.actionId),
      expectedGameRevision: room.game.gameRevision, deadlineAt: room.game.deadlineAt };
  }
  for (const entry of await persistence.listActiveTurnDeadlines()) await scheduler.scheduleTimeout(entry);
  async function input() {
    const room = await read(); assert.ok(room.game.state.window);
    return { roomId, actorPlayerId: parse(PlayerIdSchema, room.game.state.window.activePlayerId),
      requestId: parse(RequestIdSchema, `city-local-request-${++sequence}`), gameId: room.game.gameId,
      expectedGameRevision: room.game.gameRevision, actionId: parse(CityActionIdSchema, room.game.state.window.actionId), receivedAt: clock.now(), authorization };
  }
  async function snapshot(viewer = initial.players[0]!.playerId) {
    const room = await read();
    const projected = projectCityRoleV2Game({ phase: room.phase, game: room.game, playerIds: players.map(player => player.playerId), selfPlayerId: parse(PlayerIdSchema, viewer) });
    const value = { snapshotVersion: 2, versions: { roomRevision: room.roomRevision, presenceVersion: 0 }, serverTime: clock.now(),
      room: { roomId, roomCode: room.roomCode, gameType: "CITY_ROLE", phase: room.phase,
        players: players.map(player => ({ playerId: player.playerId, nickname: player.nickname, isHost: player.playerId === room.hostPlayerId, connectionStatus: offline.has(player.playerId) ? "OFFLINE" : "CONNECTED" })) },
      self: { playerId: viewer }, game: projected };
    return room.phase === "FINISHED" ? parse(CityRoleFinishedPlatformSnapshotV2Schema, value) : parse(CityRolePlayingPlatformSnapshotV2Schema, value);
  }
  async function assertSchedule() {
    const room = await read(), expected = room.game.state.window === null ? [] : [await deadline()];
    assert.deepEqual(await persistence.listActiveTurnDeadlines(), expected);
    assert.deepEqual(await persistence.listActiveGameDeadlines(), []);
    assert.equal(scheduler.scheduledCount, expected.length);
    assert.equal(timerHandles.size, expected.length);
    assertCityCardConservation(room.game.state);
  }
  async function endRole() {
    const window = (await read()).game.state.window;
    assert.ok(window?.kind === "ROLE_ACTION");
    if (window.acquisition === "NOT_TAKEN") assert.equal((await service.takeIncome(await input())).ok, true);
    assert.equal((await service.endTurn(await input())).ok, true);
    await assertSchedule();
  }
  async function timeoutNow() {
    const current = await deadline(); clock.set(current.deadlineAt);
    assert.equal((await timeout.timeout(current)).status, "APPLIED");
    await assertSchedule();
    return current;
  }
  async function leavePlayer(playerId: string) {
    const room = await read();
    const result = await leave.leave({ roomId, actorPlayerId: parse(PlayerIdSchema, playerId), requestId: parse(RequestIdSchema, `city-local-leave-${++sequence}`),
      expectedRoomRevision: room.roomRevision, expectedGameRevision: room.game.gameRevision, authorization });
    assert.equal(result.ok, true, JSON.stringify(result)); await assertSchedule();
  }
  return { persistence, clock, service, timeout, scheduler, offline, sessions, players, read, input, snapshot, deadline, assertSchedule, endRole, timeoutNow, leavePlayer };
}

function advanceToRole(state: CityGameState, roleId: CityRoleId): CityGameState {
  while (true) {
    const current = cityPlaying(state).window;
    assert.equal(current.kind, "ROLE_ACTION");
    if (current.activeRoleId === roleId) break;
    state = actCity(actCity(state, { kind: "TAKE_INCOME" }), { kind: "END_TURN" });
  }
  const window = cityPlaying(state).window;
  assert.ok(window.kind === "ROLE_ACTION" && window.activeRoleId === roleId);
  return state;
}

for (const [role, templateId] of [
  ["CR-04", "CB-CIV-01"], ["CR-05", "CB-CUL-01"], ["CR-06", "CB-TRA-01"], ["CR-08", "CB-GUA-01"],
] as const) test(`P16 CITY ${role} application entry projects mandatory income once and keeps a single 90-second window`, async t => {
  const picks = CITY_ROLE_IDS.filter(id => id !== "CR-07" && (id !== "CR-08" || role === "CR-08")).slice(0, role === "CR-08" ? 5 : 6);
  if (!picks.includes(role)) picks.push(role);
  let state = completeCityDraft(createCityFixture(3, ["CR-07", ...CITY_ROLE_IDS.filter(id => id !== "CR-07")]), picks);
  state = advanceToRole(state, picks[picks.indexOf(role) - 1]!);
  const actor = state.round.assignments.find(entry => entry.roleId === role)!.playerId;
  state = withCityZones(state, { cities: [{ playerId: actor, cardIds: [cityCard(state, templateId)] }] });
  const beforeGold = cityPlayer(state, actor).gold;
  const h = await localLifecycle(t, state), previousAction = state.window!.actionId;
  await h.endRole();
  const entered = await h.read(), view = (await h.snapshot(actor)).game;
  assert.equal(view.phase, "ROLE_ACTION"); if (view.phase !== "ROLE_ACTION") throw new Error("Expected role action.");
  assert.equal(view.window.activeRoleId, role);
  assert.notEqual(view.window.actionId, previousAction);
  assert.equal(view.window.deadlineAt - view.window.startedAt, 90_000);
  assert.equal(view.playerStates.find(player => player.playerId === String(actor))?.gold, beforeGold + 1);
  assert.equal(view.privateState.action?.acquisition, "NOT_TAKEN");
  if (role === "CR-04") assert.equal(view.leaderPlayerId, actor);
  if (role === "CR-05") assert.ok(view.protectedPlayerIds.includes(parse(PlayerIdSchema, actor)));
  const command = await h.input();
  assert.equal((await h.service.takeIncome(command)).ok, true);
  assert.equal((await h.service.takeIncome(command)).ok, true);
  const acquired = await h.read();
  assert.equal(cityPlayer(acquired.game.state, actor).gold, beforeGold + 1 + (role === "CR-06" ? 3 : 2));
  assert.equal(acquired.game.deadlineAt, entered.game.deadlineAt);
  assert.equal(acquired.game.gameRevision, entered.game.gameRevision + 1);
  await h.assertSchedule();
});

test("P16 CITY CR-07 entry cards are private, have no pending choice, and CR-08 gets a fresh role-local action budget", async t => {
  const picks: readonly CityRoleId[] = ["CR-01", "CR-02", "CR-03", "CR-04", "CR-07", "CR-08"];
  let state = advanceToRole(completeCityDraft(createCityFixture(3, ["CR-06", "CR-05", ...picks]), picks), "CR-04");
  const actor = state.round.assignments.find(entry => entry.roleId === "CR-07")!.playerId;
  state = withCityZones(state, {});
  const expectedCards = state.deck.slice(0, 2), h = await localLifecycle(t, state);
  await h.endRole();
  const entered = await h.read();
  assert.deepEqual(cityPlayer(entered.game.state, actor).hand, expectedCards);
  assert.equal(entered.game.state.pendingChoice, null);
  for (const viewer of state.players) {
    const view = (await h.snapshot(viewer.playerId)).game;
    if (view.phase !== "ROLE_ACTION") throw new Error("Expected role action.");
    assert.equal(view.window.activeRoleId, "CR-07");
    assert.equal(view.privateState.action !== undefined, viewer.playerId === actor);
    if (viewer.playerId === actor) assert.deepEqual(view.privateState.hand.map(card => String(card.cardId)), expectedCards.map(String));
    else for (const card of expectedCards) assert.equal(JSON.stringify(view).includes(JSON.stringify(card)), false);
  }
  await h.endRole();
  const next = await h.read(), nextActor = next.game.state.window!.activePlayerId, view = (await h.snapshot(nextActor)).game;
  if (view.phase !== "ROLE_ACTION") throw new Error("Expected next action.");
  assert.equal(view.window.activeRoleId, "CR-08");
  assert.deepEqual(view.privateState.action, { acquisition: "NOT_TAKEN", abilityUsed: false, buildingsBuilt: 0 });
});

test("P16 CITY CR-01 private mark skips a role without early disclosure and reveals it only after atomic round rollover", async t => {
  const state = atCityRole("CR-01"), actor = state.window!.activePlayerId, h = await localLifecycle(t, state);
  await h.service.takeIncome(await h.input());
  assert.equal((await h.service.useRoleAbility({ ...await h.input(), ability: { ability: "MARK_ROLE_DISABLED", targetRoleId: "CR-06" } })).ok, true);
  for (const viewer of state.players) {
    const view = (await h.snapshot(viewer.playerId)).game;
    assert.deepEqual(view.privateState.marks, viewer.playerId === actor ? [{ kind: "DISABLE", targetRoleId: "CR-06", status: "UNRESOLVED" }] : []);
  }
  let transitions = 0;
  while ((await h.read()).game.state.round.roundNumber === 1) {
    for (const viewer of state.players) assert.equal((await h.snapshot(viewer.playerId)).game.revealedRoles.some(role => role.roleId === "CR-06"), false);
    await h.endRole(); assert.ok(++transitions <= 6);
  }
  const after = await h.read();
  for (const viewer of state.players) {
    const view = (await h.snapshot(viewer.playerId)).game;
    assert.equal(view.phase, "ROLE_SELECTION");
    if (view.phase !== "ROLE_SELECTION") throw new Error("Expected new draft.");
    assert.deepEqual(view.revealedRoles.find(role => role.roleId === "CR-06"), { roundNumber: 1, roleId: "CR-06", playerId: state.round.assignments.find(role => role.roleId === "CR-06")!.playerId, kind: "DISABLED" });
    assert.equal(view.window.deadlineAt - view.window.startedAt, 45_000);
    assert.equal(view.privateState.availableRoleIds !== undefined, viewer.playerId === after.game.state.window!.activePlayerId);
  }
});

test("P16 CITY CR-02 target stays actor-private until resolution, then transfer precedes CR-04 category income", async t => {
  let state = atCityRole("CR-02");
  const source = state.window!.activePlayerId, target = state.round.assignments.find(role => role.roleId === "CR-04")!.playerId;
  state = withCityGold(withCityZones(state, { cities: [{ playerId: target, cardIds: [cityCard(state, "CB-CIV-01"), cityCard(state, "CB-CIV-02")] }] }), target, 7);
  const h = await localLifecycle(t, state);
  await h.service.takeIncome(await h.input());
  assert.equal((await h.service.useRoleAbility({ ...await h.input(), ability: { ability: "MARK_ROLE_GOLD_TRANSFER", targetRoleId: "CR-04" } })).ok, true);
  const sourceGold = cityPlayer((await h.read()).game.state, source).gold;
  assert.deepEqual((await h.snapshot(target)).game.privateState.marks, []);
  await h.endRole(); await h.endRole();
  const view = (await h.snapshot(target)).game;
  if (view.phase !== "ROLE_ACTION") throw new Error("Expected role action.");
  assert.equal(view.window.activeRoleId, "CR-04");
  assert.equal(view.playerStates.find(player => player.playerId === String(target))?.gold, 2);
  assert.equal(view.playerStates.find(player => player.playerId === String(source))?.gold, sourceGold + 7);
  assert.equal(view.privateState.action?.acquisition, "NOT_TAKEN");
  assert.equal((await h.snapshot(source)).game.privateState.marks[0]?.status, "RESOLVED");
});

test("P16 CITY E03 rejection keeps private snapshot and scheduler exact; pending timeout publishes no discarded option", async t => {
  const state = atCityRole("CR-03"), actor = state.window!.activePlayerId, h = await localLifecycle(t, state);
  await h.service.takeIncome(await h.input());
  const before = await h.read(), snapshots = await Promise.all(state.players.map(player => h.snapshot(player.playerId))), deadline = await h.deadline();
  assert.equal((await h.service.useRoleAbility({ ...await h.input(), ability: { ability: "REPLACE_OWN_CARDS", cardIds: [] } })).ok, false);
  assert.deepEqual(await h.read(), before);
  assert.deepEqual(await Promise.all(state.players.map(player => h.snapshot(player.playerId))), snapshots);
  assert.deepEqual(await h.deadline(), deadline); await h.assertSchedule();
  await h.endRole();
  const nextActor = (await h.read()).game.state.window!.activePlayerId;
  assert.equal((await h.service.drawBuildingCards(await h.input())).ok, true);
  const pending = (await h.read()).game.state.pendingChoice!;
  await h.timeoutNow();
  const after = await h.read();
  assert.ok(cityPlayer(after.game.state, nextActor).hand.includes(pending.cards[0]!));
  assert.equal(after.game.state.deck.at(-1), pending.cards[1]);
  assert.equal(after.game.state.pendingChoice, null);
  for (const viewer of state.players.filter(player => player.playerId !== nextActor)) {
    const view = (await h.snapshot(viewer.playerId)).game;
    for (const card of pending.cards) assert.equal(JSON.stringify(view).includes(JSON.stringify(card)), false);
  }
  assert.equal(cityPlayer(after.game.state, actor).forfeited, false);
});

test("P16 CITY E02 last-role third timeout changes 4→3 quota only at next setup and replaces 90s by one private 45s draft", async t => {
  const picks: readonly CityRoleId[] = ["CR-01", "CR-02", "CR-03", "CR-04"];
  let state = advanceToRole(completeCityDraft(createCityFixture(4, ["CR-08", "CR-07", "CR-06", ...picks, "CR-05"]), picks), "CR-04");
  const actor = state.window!.activePlayerId, building = cityCard(state, "CB-CIV-01"), hand = cityCard(state, "CB-CUL-01");
  state = withCityZones(state, { cities: [{ playerId: actor, cardIds: [building] }], hands: [{ playerId: actor, cardIds: [hand] }] });
  state = { ...state, players: state.players.map(player => player.playerId === actor ? { ...player, offlineTimeoutStreak: 2 } : player) };
  const h = await localLifecycle(t, state); h.offline.add(actor);
  const expired = await h.timeoutNow(), after = await h.read();
  assert.equal(after.game.state.round.roundNumber, 2);
  assert.equal(after.game.state.round.rolesPerPlayer, 2);
  assert.equal(after.game.state.round.pickQueue.length, 6);
  assert.equal(after.game.state.round.publicRemoved.length, 0);
  assert.ok(!after.game.state.round.pickQueue.includes(actor));
  assert.notEqual(after.game.state.leaderPlayerId, actor);
  assert.deepEqual(cityPlayer(after.game.state, actor).city, [building]);
  assert.equal(cityPlayer(after.game.state, actor).gold, 0);
  assert.ok(after.game.state.discard.includes(hand));
  const actorIndex = state.players.findIndex(player => player.playerId === actor);
  assert.equal(await h.persistence.findByVerificationData(h.sessions[actorIndex]!), null);
  for (const viewer of state.players) {
    const view = (await h.snapshot(viewer.playerId)).game;
    if (view.phase !== "ROLE_SELECTION") throw new Error("Expected new selection.");
    assert.equal(view.window.deadlineAt - view.window.startedAt, 45_000);
    assert.equal(view.privateState.availableRoleIds !== undefined, viewer.playerId === after.game.state.window!.activePlayerId);
    assert.equal(view.playerStates.find(player => player.playerId === String(actor))?.forfeited, true);
  }
  assert.equal((await h.timeout.timeout(expired)).status, "NO_OP");
  assert.deepEqual(await h.read(), after);
});

test("P16 CITY E01 leave cancels private interference and tombstones unrevealed roles without leaking their ownership", async t => {
  const state = atCityRole("CR-01"), source = state.window!.activePlayerId, h = await localLifecycle(t, state);
  await h.service.takeIncome(await h.input());
  await h.service.useRoleAbility({ ...await h.input(), ability: { ability: "MARK_ROLE_DISABLED", targetRoleId: "CR-06" } });
  const hiddenOwn = state.round.assignments.find(role => role.playerId === source && !role.revealed)!;
  await h.leavePlayer(source);
  const after = await h.read();
  assert.equal(after.game.state.marks[0]?.status, "CANCELLED");
  assert.equal(after.game.state.round.assignments.find(role => role.roleId === hiddenOwn.roleId)?.status, "TOMBSTONED");
  for (const viewer of state.players.filter(player => player.playerId !== source)) {
    const view = (await h.snapshot(viewer.playerId)).game;
    assert.deepEqual(view.privateState.marks, []);
    assert.ok(!view.revealedRoles.some(role => role.roleId === hiddenOwn.roleId));
    assert.ok(!view.privateState.selectedRoleIds.includes(hiddenOwn.roleId));
  }
});

test("P16 CITY LPS leave retains surviving private pending choice but cancels the actual action scheduler", async t => {
  const state = completeCityDraft(createCityFixture(2)), h = await localLifecycle(t, state), actor = state.window!.activePlayerId;
  await h.service.drawBuildingCards(await h.input());
  const pending = (await h.read()).game.state.pendingChoice!, oldDeadline = await h.deadline();
  await h.leavePlayer(state.players.find(player => player.playerId !== actor)!.playerId);
  const after = await h.read();
  assert.equal(after.game.state.result?.reason, "LAST_PLAYER_STANDING");
  assert.deepEqual(after.game.state.pendingChoice, pending);
  for (const viewer of state.players) {
    const view = (await h.snapshot(viewer.playerId)).game;
    assert.equal(view.phase, "FINISHED"); assert.equal("window" in view, false);
    assert.equal("pendingCards" in view.privateState, viewer.playerId === actor);
    if (viewer.playerId !== actor) for (const card of pending.cards) assert.equal(JSON.stringify(view).includes(JSON.stringify(card)), false);
  }
  h.clock.set(oldDeadline.deadlineAt);
  assert.equal((await h.timeout.timeout(oldDeadline)).status, "NO_OP");
  assert.deepEqual(await h.read(), after);
});

test("P16 CITY completion precedes third-timeout forfeit and projects deterministic bonuses with no active deadline", async t => {
  let state = atCityRole("CR-06"); const actor = state.window!.activePlayerId;
  const buildings = CITY_BUILDING_TEMPLATES.slice(0, 8).map(template => cityCard(state, template.templateId));
  state = { ...withCityZones(state, { cities: [{ playerId: actor, cardIds: buildings }] }), firstCompletion: { playerId: actor, roundNumber: 1 } };
  state = { ...state, players: state.players.map(player => player.playerId === actor ? { ...player, offlineTimeoutStreak: 2 } : player) };
  const h = await localLifecycle(t, state); h.offline.add(actor);
  await h.timeoutNow();
  const after = await h.read();
  assert.equal(after.game.state.result?.reason, "CITY_COMPLETION_ROUND_END");
  assert.equal(cityPlayer(after.game.state, actor).forfeited, false);
  assert.equal(cityPlayer(after.game.state, actor).offlineTimeoutStreak, 3);
  for (const viewer of state.players) {
    const view = (await h.snapshot(viewer.playerId)).game;
    if (view.phase !== "FINISHED") throw new Error("Expected finished.");
    const row = view.result.rankings.find(player => player.playerId === String(actor))!;
    assert.equal(row.completionBonus, 4); assert.equal(row.diversityBonus, 0);
    assert.equal(row.score, row.buildingVP + 4);
    assert.equal(row.winner, true); assert.equal(row.forfeited, false);
  }
});

test("P16 CITY NO_ELIGIBLE persisted terminal state projects no winner or new window and rejects stale application actions", async t => {
  // No new public batch-leave command is invented: the approved pure batch
  // terminal result is exercised through the real persistence/projection gate.
  const before = createCityFixture(3), state = forfeitCityPlayers(before, before.seatOrder), h = await localLifecycle(t, state);
  for (const viewer of state.players) {
    const view = (await h.snapshot(viewer.playerId)).game;
    if (view.phase !== "FINISHED") throw new Error("Expected terminal projection.");
    assert.equal(view.result.reason, "NO_ELIGIBLE_PLAYERS");
    assert.ok(view.result.rankings.every(row => row.forfeited && !row.winner));
    assert.deepEqual(view.result.winnerPlayerIds, []); assert.equal("window" in view, false);
  }
  const stored = await h.read();
  assert.equal((await h.service.selectRole({ roomId: stored.roomId, actorPlayerId: stored.players[0]!.playerId,
    requestId: parse(RequestIdSchema, "city-terminal-stale"), gameId: stored.game.gameId, expectedGameRevision: stored.game.gameRevision,
    actionId: parse(CityActionIdSchema, before.window!.actionId), receivedAt: h.clock.now(), authorization, roleId: before.round.available[0]! })).ok, false);
  assert.deepEqual(await h.read(), stored); await h.assertSchedule();
});

for (const count of [3, 5]) test(`P16 CITY ${count}-player application draft and full round retain exact quota and viewer privacy`, async t => {
  const initial = createCityFixture(count), h = await localLifecycle(t, initial);
  const quota = count === 3 ? 2 : 1;
  let picks = 0;
  while ((await h.read()).game.state.window?.kind === "ROLE_SELECTION") {
    const room = await h.read(), actor = room.game.state.window!.activePlayerId;
    for (const viewer of initial.players) {
      const view = (await h.snapshot(viewer.playerId)).game;
      if (view.phase !== "ROLE_SELECTION") throw new Error("Expected selection.");
      assert.equal(view.privateState.availableRoleIds !== undefined, viewer.playerId === actor);
      assert.equal(view.window.deadlineAt - view.window.startedAt, 45_000);
      assert.equal(view.privateState.selectedRoleIds.length, room.game.state.round.assignments.filter(role => role.playerId === viewer.playerId).length);
    }
    assert.equal((await h.service.selectRole({ ...await h.input(), roleId: room.game.state.round.available[0]! })).ok, true);
    await h.assertSchedule(); assert.ok(++picks <= count * quota);
  }
  assert.equal(picks, count * quota);
  let actions = 0;
  while ((await h.read()).game.state.round.roundNumber === 1) {
    const room = await h.read(), view = (await h.snapshot(room.game.state.window!.activePlayerId)).game;
    if (view.phase !== "ROLE_ACTION") throw new Error("Expected action.");
    assert.equal(view.window.deadlineAt - view.window.startedAt, 90_000);
    await h.endRole(); assert.ok(++actions <= picks);
  }
  assert.equal(actions, picks);
  const next = await h.read();
  assert.equal(next.game.state.round.rolesPerPlayer, quota);
  assert.equal(next.game.state.round.pickQueue.length, count * quota);
  assert.equal(next.game.state.round.roundNumber, 2);
  assert.equal(next.game.gameRevision, 10 + picks + actions * 2);
});

test("P16 CITY offline streak 1/2/3 crosses two secret selections and a role action before forfeit", async t => {
  const initial = createCityFixture(3), actor = initial.window!.activePlayerId, h = await localLifecycle(t, initial);
  h.offline.add(actor);
  await h.timeoutNow();
  assert.equal(cityPlayer((await h.read()).game.state, actor).offlineTimeoutStreak, 1);
  let selectionSteps = 0;
  while ((await h.read()).game.state.window?.kind === "ROLE_SELECTION") {
    const room = await h.read();
    if (room.game.state.window!.activePlayerId === actor) {
      await h.timeoutNow();
      assert.equal(cityPlayer((await h.read()).game.state, actor).offlineTimeoutStreak, 2);
    } else {
      assert.equal((await h.service.selectRole({ ...await h.input(), roleId: room.game.state.round.available[0]! })).ok, true);
      await h.assertSchedule();
    }
    assert.ok(++selectionSteps < 6);
  }
  let precedingRoles = 0;
  while ((await h.read()).game.state.window!.activePlayerId !== actor) {
    await h.endRole(); assert.ok(++precedingRoles < 6);
  }
  const before = await h.read();
  assert.equal(cityPlayer(before.game.state, actor).forfeited, false);
  await h.timeoutNow();
  const after = await h.read();
  assert.equal(cityPlayer(after.game.state, actor).offlineTimeoutStreak, 3);
  assert.equal(cityPlayer(after.game.state, actor).forfeited, true);
  assert.equal(after.game.gameRevision, before.game.gameRevision + 1);
  assert.ok(after.game.state.round.assignments.filter(role => role.playerId === actor).every(role => role.status === "TOMBSTONED"));
  assert.equal(await h.persistence.findByVerificationData(h.sessions[0]!), null);
  for (const viewer of initial.players) assert.equal(JSON.stringify((await h.snapshot(viewer.playerId)).game).includes("offlineTimeoutStreak"), false);
});
