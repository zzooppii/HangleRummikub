import assert from "node:assert/strict";
import test from "node:test";
import { CityActionIdSchema, GameRevisionSchema, NicknameSchema, PlayerIdSchema, PresenceVersionSchema, RequestIdSchema, RoomCodeSchema, RoomRevisionSchema, ServerTimeSchema, TurnIdSchema, type RoomId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { FakeClock, FakeIdGenerator } from "./infrastructure/system.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "./infrastructure/keyed-serial-executor.js";
import { GameRegistry } from "./games/game-registry.js";
import { createCityRoleRegistration } from "./games/city-role/city-role-registration.js";
import { CityRoleStartService } from "./games/city-role/application/city-role-start-service.js";
import { CityRoleCommandService } from "./games/city-role/application/city-role-command-service.js";
import { CityRoleTimeoutService } from "./games/city-role/application/city-role-timeout-service.js";
import { createCityRolePlayerLifecycleActions } from "./games/city-role/application/city-role-player-lifecycle-actions.js";
import { CityRoleGameStateAdapter, type CityRoleStoredGame } from "./games/city-role/compatibility/city-role-game-state-adapter.js";
import { CITY_BUILDING_TEMPLATES } from "./games/city-role/domain/cardset-v1.js";
import { createInitialCityGameState } from "./games/city-role/domain/rule-engine.js";
import type { CityGameState } from "./games/city-role/domain/game-state.js";
import type { CityRoleId } from "./games/city-role/domain/role.js";
import { createUnboundSessionRecord, type CityRoleRoomRecord } from "./model/persistence.js";
import { RoomLeaveService } from "./application/room-leave-service.js";
import type { ScheduledTurnDeadline } from "./ports/system.js";
import { OverdueTurnSweeper } from "./infrastructure/overdue-turn-sweeper.js";
import { actCity, assertCityCardConservation, cityCard, cityPlayer, completeCityDraft, withCityZones } from "./testing/city-role-fixtures.test.js";

const current = { isCurrent: () => true };
const rid = (value: string) => parse(RequestIdSchema, value);

async function harness(count = 3, autoStart = true) {
  const persistence = new InMemoryPersistence(), ids = new FakeIdGenerator(), clock = new FakeClock(1_000);
  const players = Array.from({ length: count }, (_, index) => ({ playerId: ids.generatePlayerId(), nickname: parse(NicknameSchema, `City${index}`), joinOrder: index }));
  const roomId = ids.generateRoomId();
  const created = await persistence.createIfAbsent({ roomId, roomCode: parse(RoomCodeSchema, "BCDFGH"), gameType: "CITY_ROLE", phase: "LOBBY", hostPlayerId: players[0]!.playerId, players, game: null, roomRevision: parse(RoomRevisionSchema, 0), createdAt: clock.now(), updatedAt: clock.now() });
  assert.equal(created.status, "CREATED");
  const sessionVerifications = players.map((_, index) => ({ algorithm: "SHA-256" as const, digestHex: (index + 1).toString(16).repeat(64) }));
  for (const [index, player] of players.entries()) {
    const verificationData = sessionVerifications[index]!;
    assert.equal((await persistence.saveUnbound(createUnboundSessionRecord(verificationData, clock.now()))).status, "SAVED");
    assert.equal((await persistence.promoteUnbound({ verificationData, roomId, playerId: player.playerId, now: clock.now() })).status, "PROMOTED");
  }
  const scheduled: ScheduledTurnDeadline[] = [];
  let randomCalls = 0, offline = false, leaseCurrent = true, schedulingFails = false;
  const deps = { roomRepository: persistence, idempotencyRepository: persistence, roomUnitOfWork: persistence, roomMutationExecutor: new KeyedSerialExecutor<RoomId>(), clock, idGenerator: ids,
    turnScheduler: { scheduleTimeout: async (deadline: ScheduledTurnDeadline) => { if (schedulingFails) throw new Error("injected schedule failure"); scheduled.push(deadline); }, cancelTimeout: async () => undefined },
  };
  const start = new CityRoleStartService({ ...deps, randomSource: { nextInt: (max: number) => { randomCalls += 1; return max - 1; } }, gameRegistrationReader: new GameRegistry([createCityRoleRegistration()]), presenceLeaseReader: { acquireRoomPresenceLease: async () => ({ presenceVersion: parse(PresenceVersionSchema, 0), connectionStatusByPlayerId: new Map(players.map((player) => [player.playerId, offline ? "OFFLINE" as const : "CONNECTED" as const])), isCurrent: () => leaseCurrent }) } });
  const service = new CityRoleCommandService(deps);
  const lifecycle = createCityRolePlayerLifecycleActions(ids);
  const leave = new RoomLeaveService({ ...deps, roomCleanupUnitOfWork: persistence, playerLifecycleActions: {
    applyPlayingLeave: (input) => lifecycle.applyPlayingLeave(input),
    planPresenceRestored: (room, playerId) => {
      const plan = lifecycle.planPresenceRestored(room, playerId);
      return plan.status === "NO_CHANGE" ? plan : { ...plan, gameType: "CITY_ROLE" };
    },
  }, presenceReader: {
    acquireLobbyDisconnectLease: async () => { throw new Error("Unexpected Lobby leave path in CITY playing fixture."); },
    acquireRoomPresenceLease: async () => ({ presenceVersion: parse(PresenceVersionSchema, 0), connectionStatusByPlayerId: new Map(players.map((player) => [player.playerId, "CONNECTED" as const])), isCurrent: () => true }),
  } });
  const timeout = new CityRoleTimeoutService({ ...deps, presenceLeaseReader: { acquirePlayerPresenceLease: async () => ({ connectionStatus: offline ? "OFFLINE" : "CONNECTED", connectionGeneration: 1, isCurrent: () => leaseCurrent }) } });
  const startInput = { roomId, actorPlayerId: players[0]!.playerId, requestId: rid("city-start"), expectedRoomRevision: parse(RoomRevisionSchema, 0), authorization: current };
  if (autoStart) {
    const result = await start.start(startInput);
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  async function read(): Promise<CityRoleRoomRecord> {
    const room = await persistence.findById(roomId);
    assert.equal(room?.gameType, "CITY_ROLE");
    return room;
  }
  async function playing() {
    const room = await read();
    assert.equal(room.phase, "PLAYING");
    assert.ok(room.game);
    assert.ok(room.game.state.window);
    return { ...room, game: room.game, window: room.game.state.window };
  }
  async function input(request: string) {
    const room = await playing();
    return { roomId, actorPlayerId: parse(PlayerIdSchema, room.window.activePlayerId), requestId: rid(request), gameId: room.game.gameId, expectedGameRevision: room.game.gameRevision, actionId: parse(CityActionIdSchema, room.window.actionId), receivedAt: clock.now(), authorization: current };
  }
  async function deadline(): Promise<ScheduledTurnDeadline> {
    const room = await playing();
    assert.ok(room.game.deadlineAt !== null);
    return { roomId, gameId: room.game.gameId, turnId: parse(TurnIdSchema, room.window.actionId), expectedGameRevision: room.game.gameRevision, deadlineAt: room.game.deadlineAt };
  }
  async function seed(game: CityRoleStoredGame) {
    const room = await read();
    const result = await persistence.replace({ candidate: { ...room, game, phase: game.state.window === null ? "FINISHED" : "PLAYING" }, expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision });
    assert.equal(result.status, "REPLACED");
  }
  async function seedState(state: CityGameState) {
    const room = await playing();
    const duration = state.window?.kind === "ROLE_SELECTION" ? 45_000 : 90_000;
    await seed({ ...room.game, state, windowStartedAt: state.window === null ? null : clock.now(), deadlineAt: state.window === null ? null : parse(ServerTimeSchema, clock.now() + duration), finishedAt: state.window === null ? clock.now() : null });
  }
  async function roleFixture(roleId: CityRoleId, picks: readonly CityRoleId[] = ["CR-01", "CR-02", "CR-03", "CR-04", "CR-05", "CR-06"]) {
    const room = await playing(), state = room.game.state;
    const hidden = (["CR-08", "CR-07", "CR-06", "CR-05", "CR-04", "CR-03", "CR-02", "CR-01"] as const).find((role) => !picks.includes(role))!;
    const roleOrder: readonly CityRoleId[] = [hidden, ...(["CR-01", "CR-02", "CR-03", "CR-04", "CR-05", "CR-06", "CR-07", "CR-08"] as const).filter((id) => id !== hidden)];
    let next = completeCityDraft(createInitialCityGameState({ gameId: state.gameId, playerIds: state.players.map((player) => player.playerId), seatOrder: state.seatOrder, cards: state.cards, deck: state.deck, initialHands: state.players.map((player) => ({ playerId: player.playerId, cardIds: player.hand })), actionId: state.window!.actionId, roleOrder }), picks);
    while (next.window?.kind === "ROLE_ACTION" && next.window.activeRoleId !== roleId) {
      next = actCity(actCity(next, { kind: "TAKE_INCOME" }), { kind: "END_TURN" });
    }
    assert.ok(next.window?.kind === "ROLE_ACTION" && next.window.activeRoleId === roleId);
    await seedState(next);
  }
  return { persistence, ids, clock, players, roomId, scheduled, deps, start, service, timeout, leave, lifecycle, sessionVerifications, startInput, read, playing, input, deadline, seed, seedState, roleFixture,
    randomCalls: () => randomCalls, setOffline: (value: boolean) => { offline = value; }, setLeaseCurrent: (value: boolean) => { leaseCurrent = value; }, setSchedulingFailure: (value: boolean) => { schedulingFails = value; } };
}

for (const count of [2, 3, 4, 5, 6]) test(`CITY ${count}-player start has exact private inventory, initial gold and one 45-second selection deadline`, async () => {
  const h = await harness(count), room = await h.playing();
  assert.equal(room.game.gameRevision, 0);
  assert.equal(room.window.kind, "ROLE_SELECTION");
  assert.equal(room.game.deadlineAt! - room.game.windowStartedAt!, 45_000);
  assert.equal(room.game.state.players.length, count);
  assert.ok(room.game.state.players.every((player) => player.gold === 2 && player.hand.length === 4));
  assert.equal(room.game.state.deck.length, 60 - count * 4);
  assert.equal(room.game.state.round.rolesPerPlayer, count <= 3 ? 2 : 1);
  assertCityCardConservation(room.game.state);
  assert.deepEqual(await h.persistence.listActiveTurnDeadlines(), [await h.deadline()]);
  assert.deepEqual(await h.persistence.listActiveGameDeadlines(), []);
  const randomCalls = h.randomCalls();
  assert.equal((await h.start.start(h.startInput)).ok, true);
  assert.equal(h.randomCalls(), randomCalls);
  assert.deepEqual(await h.read(), roomWithoutWindow(room));
});

function roomWithoutWindow(room: Awaited<ReturnType<Awaited<ReturnType<typeof harness>>["playing"]>>) {
  const { window: _window, ...stored } = room;
  return stored;
}

test("CITY start Host/readiness/stale/current-primary failures consume no game state or start entropy", async () => {
  const h = await harness(3, false), before = await h.read();
  for (const changes of [{ actorPlayerId: h.players[1]!.playerId }, { expectedRoomRevision: parse(RoomRevisionSchema, 9) }, { authorization: { isCurrent: () => false } }]) {
    assert.equal((await h.start.start({ ...h.startInput, ...changes })).ok, false);
    assert.deepEqual(await h.read(), before);
  }
  h.setOffline(true);
  assert.equal((await h.start.start(h.startInput)).ok, false);
  assert.equal(h.randomCalls(), 0);
  assert.equal(h.scheduled.length, 0);
});

test("CITY selection replay and request conflict preserve RNG, action and private ownership", async () => {
  const h = await harness(), before = await h.playing();
  const request = { ...await h.input("pick"), roleId: before.game.state.round.available[0]! };
  const [a, b] = await Promise.all([h.service.selectRole(request), h.service.selectRole(request)]);
  assert.equal(a.ok, true, JSON.stringify(a));
  assert.deepEqual(b, a);
  const after = await h.read();
  assert.equal(after.game?.gameRevision, 1);
  assert.equal(after.game?.state.round.assignments.length, 1);
  const conflict = await h.service.selectRole({ ...request, roleId: before.game.state.round.available[1]! });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.error.code, "REQUEST_ID_REUSED");
  assert.deepEqual(await h.read(), after);
});

test("CITY selection timeout uses available roles only and stale presence/deadline callbacks consume no entropy", async () => {
  const h = await harness(), before = await h.playing(), deadline = await h.deadline();
  assert.deepEqual(await h.timeout.timeout(deadline), { status: "NO_OP", reason: "NOT_DUE" });
  h.clock.set(deadline.deadlineAt); h.setOffline(true); h.setLeaseCurrent(false);
  assert.deepEqual(await h.timeout.timeout(deadline), { status: "NO_OP", reason: "PRESENCE_CHANGED" });
  assert.deepEqual(await h.read(), roomWithoutWindow(before));
  h.setLeaseCurrent(true);
  assert.equal((await h.timeout.timeout(deadline)).status, "APPLIED");
  const after = await h.playing(), assignment = after.game.state.round.assignments[0]!;
  assert.ok(before.game.state.round.available.includes(assignment.roleId));
  assert.equal(assignment.playerId, before.window.activePlayerId);
  assert.equal(cityPlayer(after.game.state, assignment.playerId).offlineTimeoutStreak, 1);
  assert.equal(after.game.gameRevision, before.game.gameRevision + 1);
  assert.ok(after.game.entropyCounter > before.game.entropyCounter);
  assert.equal(after.game.deadlineAt! - after.game.windowStartedAt!, 45_000);
  assert.equal((await h.timeout.timeout(deadline)).status, "NO_OP");
});

test("CITY third offline selection timeout picks then privately tombstones the selected role and removes its session", async () => {
  const h = await harness(), initial = await h.playing(), actor = initial.window.activePlayerId;
  await h.seedState({ ...initial.game.state, players: initial.game.state.players.map((player) => player.playerId === actor ? { ...player, offlineTimeoutStreak: 2 } : player) });
  const deadline = await h.deadline(); h.setOffline(true); h.clock.set(deadline.deadlineAt);
  assert.equal((await h.timeout.timeout(deadline)).status, "APPLIED");
  const after = await h.playing(), assignment = after.game.state.round.assignments[0]!;
  assert.equal(assignment.playerId, actor);
  assert.equal(assignment.status, "TOMBSTONED");
  assert.equal(assignment.revealed, false);
  assert.ok(!after.game.state.round.available.includes(assignment.roleId));
  assert.equal(after.game.state.round.rolesPerPlayer, 2);
  assert.equal(cityPlayer(after.game.state, actor).forfeited, true);
  assert.equal(cityPlayer(after.game.state, actor).offlineTimeoutStreak, 3);
  const actorIndex = h.players.findIndex((player) => String(player.playerId) === String(actor));
  assert.equal(await h.persistence.findByVerificationData(h.sessionVerifications[actorIndex]!), null);
  assertCityCardConservation(after.game.state);
});

test("CITY pending draw replay and multiple same-action commits preserve deadline while refreshing scheduled revision", async () => {
  const h = await harness();
  await h.roleFixture("CR-03");
  const original = await h.playing(), oldDeadline = await h.deadline();
  const request = await h.input("draw");
  assert.equal((await h.service.drawBuildingCards(request)).ok, true);
  const pending = await h.playing();
  assert.equal(pending.game.deadlineAt, original.game.deadlineAt);
  assert.equal(pending.window.actionId, original.window.actionId);
  assert.ok(pending.game.state.pendingChoice);
  assert.equal((await h.service.drawBuildingCards(request)).ok, true);
  assert.deepEqual(await h.read(), roomWithoutWindow(pending));
  const choose = await h.service.chooseBuildingCard({ ...await h.input("choose"), cardId: pending.game.state.pendingChoice.cards[0]! });
  assert.equal(choose.ok, true, JSON.stringify(choose));
  const chosen = await h.playing();
  assert.equal(chosen.game.deadlineAt, original.game.deadlineAt);
  assert.equal(chosen.window.actionId, original.window.actionId);
  assert.equal(chosen.game.gameRevision, original.game.gameRevision + 2);
  assert.deepEqual(h.scheduled.at(-1), await h.deadline());
  assert.deepEqual(await h.persistence.listActiveTurnDeadlines(), [await h.deadline()]);
  h.clock.set(oldDeadline.deadlineAt);
  assert.equal((await h.timeout.timeout(oldDeadline)).status, "NO_OP");
  assert.equal((await h.timeout.timeout(await h.deadline())).status, "APPLIED");
});

test("CITY stale/expired/wrong actor commands and failed UoW leave private state and entropy untouched", async () => {
  const h = await harness();
  await h.roleFixture("CR-03");
  const original = await h.read(), request = await h.input("reject");
  for (const changes of [{ receivedAt: (await h.deadline()).deadlineAt }, { expectedGameRevision: parse(GameRevisionSchema, 99) }, { actorPlayerId: h.players.find((player) => player.playerId !== request.actorPlayerId)!.playerId }, { authorization: { isCurrent: () => false } }]) {
    assert.equal((await h.service.drawBuildingCards({ ...request, ...changes })).ok, false);
    assert.deepEqual(await h.read(), original);
  }
  const rejectedService = new CityRoleCommandService({ ...h.deps, roomUnitOfWork: { commit: (change) => h.persistence.commit(change, { isSatisfied: () => false }) } });
  assert.equal((await rejectedService.drawBuildingCards(request)).ok, false);
  assert.deepEqual(await h.read(), original);
  assert.equal((await h.service.drawBuildingCards(request)).ok, true);
});

test("CITY E03 empty self exchange rejects with no revision, ability, RNG or card movement", async () => {
  const h = await harness();
  await h.roleFixture("CR-03");
  assert.equal((await h.service.takeIncome(await h.input("income"))).ok, true);
  const before = await h.read();
  const result = await h.service.useRoleAbility({ ...await h.input("zero"), ability: { ability: "REPLACE_OWN_CARDS", cardIds: [] } });
  assert.equal(result.ok, false);
  assert.deepEqual(await h.read(), before);
  const nextInput = await h.input("one");
  const ownCard = before.game!.state.players.find((player) => String(player.playerId) === String(nextInput.actorPlayerId))!.hand[0]!;
  assert.equal((await h.service.useRoleAbility({ ...nextInput, ability: { ability: "REPLACE_OWN_CARDS", cardIds: [ownCard] } })).ok, true);
});

test("CITY scheduler failure recovers the current revision at the original deadline exactly once", async () => {
  const h = await harness();
  await h.roleFixture("CR-03");
  h.setSchedulingFailure(true);
  assert.equal((await h.service.drawBuildingCards(await h.input("recover-draw"))).ok, true);
  const pending = await h.playing(), deadline = await h.deadline();
  let failures = 0;
  const sweeper = new OverdueTurnSweeper({ activeTurnReader: h.persistence, clock: h.clock, enqueueTimeout: async (descriptor) => { const result = await h.timeout.timeout(descriptor); if (result.status !== "APPLIED") failures += 1; }, timerDriver: { set: () => 1, clear: () => undefined } });
  sweeper.start();
  h.clock.set(deadline.deadlineAt);
  assert.equal(await sweeper.sweepOnce(), 1);
  assert.equal(await sweeper.sweepOnce(), 0);
  sweeper.stop();
  assert.equal(failures, 0);
  assert.equal((await h.read()).game?.gameRevision, pending.game.gameRevision + 1);
});

test("CITY persisted selected roles/pending/cards survive detached round-trip and reject forged metadata", async () => {
  const h = await harness();
  await h.roleFixture("CR-03");
  await h.service.drawBuildingCards(await h.input("persist-draw"));
  const before = await h.read(), adapter = new CityRoleGameStateAdapter();
  assert.ok(before.game);
  const game = before.game;
  const cloned = adapter.cloneAndValidate(game);
  assert.deepEqual(cloned, before.game);
  assert.notEqual(cloned.state, before.game.state);
  assert.notEqual(cloned.state.deck, before.game.state.deck);
  assert.notEqual(cloned.state.pendingChoice?.cards, before.game.state.pendingChoice?.cards);
  assert.notEqual(cloned.state.round.assignments, before.game.state.round.assignments);
  assert.throws(() => adapter.cloneAndValidate({ ...game, deadlineAt: parse(ServerTimeSchema, game.deadlineAt! + 1) }));
  assert.throws(() => adapter.cloneAndValidate({ ...game, state: { ...game.state, deck: game.state.deck.slice(1) } }));
  assert.throws(() => adapter.cloneAndValidate({ ...game, state: { ...game.state, round: { ...game.state.round, hiddenRemoved: [] } } }));
  assert.deepEqual(await h.read(), before);
});

for (const [sourceRole, targetRole, ability] of [["CR-01", "CR-05", "MARK_ROLE_DISABLED"], ["CR-02", "CR-06", "MARK_ROLE_GOLD_TRANSFER"]] as const) {
  test(`CITY E01 ${sourceRole} explicit leave cancels the private outgoing mark and deletes only its bound session atomically`, async () => {
    const h = await harness();
    await h.roleFixture(sourceRole);
    assert.equal((await h.service.takeIncome(await h.input("mark-income"))).ok, true);
    assert.equal((await h.service.useRoleAbility({ ...await h.input("mark"), ability: { ability, targetRoleId: targetRole } })).ok, true);
    const before = await h.playing(), actor = before.window.activePlayerId;
    const actorIndex = h.players.findIndex((player) => String(player.playerId) === String(actor));
    assert.equal(before.game.state.marks[0]?.status, "UNRESOLVED");
    const request = { roomId: h.roomId, actorPlayerId: h.players[actorIndex]!.playerId, requestId: rid("marked-leave"), expectedRoomRevision: before.roomRevision, expectedGameRevision: before.game.gameRevision, authorization: current };
    const result = await h.leave.leave(request);
    assert.equal(result.ok, true, JSON.stringify(result));
    const after = await h.playing();
    assert.equal(after.game.gameRevision, before.game.gameRevision + 1);
    assert.equal(after.game.state.marks[0]?.status, "CANCELLED");
    assert.equal(cityPlayer(after.game.state, actor).forfeited, true);
    assert.equal(cityPlayer(after.game.state, actor).gold, 0);
    assert.equal(cityPlayer(after.game.state, actor).hand.length, 0);
    assert.equal(await h.persistence.findByVerificationData(h.sessionVerifications[actorIndex]!), null);
    assert.equal(after.players.length, 3, "Canonical historical roster remains complete.");
    assertCityCardConservation(after.game.state);
    assert.equal((await h.leave.leave(request)).ok, true);
    assert.deepEqual(await h.read(), roomWithoutWindow(after));
  });
}

test("CITY explicit leave during pending draw discards all candidates, freezes city and releases the selected roles", async () => {
  const h = await harness();
  await h.roleFixture("CR-04");
  let state = (await h.playing()).game.state;
  const actor = cityPlayer(state).playerId, building = cityCard(state, "CB-CIV-01"), hand = cityCard(state, "CB-CUL-01");
  state = withCityZones(state, { cities: [{ playerId: actor, cardIds: [building] }], hands: [{ playerId: actor, cardIds: [hand] }] });
  await h.seedState(state);
  assert.equal((await h.service.drawBuildingCards(await h.input("leave-pending-draw"))).ok, true);
  const pending = await h.playing(), candidates = pending.game.state.pendingChoice!.cards;
  assert.equal((await h.leave.leave({ roomId: h.roomId, actorPlayerId: parse(PlayerIdSchema, actor), requestId: rid("leave-pending"), expectedRoomRevision: pending.roomRevision, expectedGameRevision: pending.game.gameRevision, authorization: current })).ok, true);
  const after = await h.playing();
  assert.deepEqual(cityPlayer(after.game.state, actor).city, [building]);
  assert.ok([hand, ...candidates].every((card) => after.game.state.discard.includes(card)));
  assert.equal(after.game.state.pendingChoice, null);
  assert.ok(after.game.state.round.assignments.filter((assignment) => assignment.playerId === actor).every((assignment) => assignment.status === "TOMBSTONED"));
  assert.notEqual(after.game.state.leaderPlayerId, actor);
  assertCityCardConservation(after.game.state);
});

test("CITY E02 third offline pending timeout keeps first/bottoms remainder before forfeit in one UoW", async () => {
  const h = await harness();
  await h.roleFixture("CR-03");
  await h.service.drawBuildingCards(await h.input("third-draw"));
  const pending = await h.playing(), actor = pending.window.activePlayerId;
  await h.seedState({ ...pending.game.state, players: pending.game.state.players.map((player) => player.playerId === actor ? { ...player, offlineTimeoutStreak: 2 } : player) });
  const before = await h.playing(), candidates = before.game.state.pendingChoice!.cards, deadline = await h.deadline();
  h.setOffline(true); h.clock.set(deadline.deadlineAt);
  const result = await h.timeout.timeout(deadline);
  assert.equal(result.status, "APPLIED", JSON.stringify(result));
  const after = await h.playing();
  assert.equal(after.game.gameRevision, before.game.gameRevision + 1);
  assert.equal(cityPlayer(after.game.state, actor).offlineTimeoutStreak, 3);
  assert.equal(cityPlayer(after.game.state, actor).forfeited, true);
  assert.ok(after.game.state.discard.includes(candidates[0]!));
  assert.ok(!after.game.state.discard.includes(candidates[1]!));
  assert.equal(after.game.state.deck.at(-1), candidates[1]);
  assert.equal(after.game.state.pendingChoice, null);
  const actorIndex = h.players.findIndex((player) => String(player.playerId) === String(actor));
  assert.equal(await h.persistence.findByVerificationData(h.sessionVerifications[actorIndex]!), null);
  assert.equal((await h.timeout.timeout(deadline)).status, "NO_OP");
  assert.deepEqual(await h.read(), roomWithoutWindow(after));
  assertCityCardConservation(after.game.state);
});

test("CITY E02 terminal-before-third-forfeit preserves eligible winner, bound session and one finish revision", async () => {
  const h = await harness();
  await h.roleFixture("CR-06");
  let state = (await h.playing()).game.state;
  const actor = cityPlayer(state).playerId;
  const buildings = CITY_BUILDING_TEMPLATES.slice(0, 8).map((template) => cityCard(state, template.templateId));
  state = { ...withCityZones(state, { cities: [{ playerId: actor, cardIds: buildings }] }), firstCompletion: { playerId: actor, roundNumber: 1 }, players: state.players.map((player) => ({ ...player, hand: [], city: player.playerId === actor ? buildings : [], offlineTimeoutStreak: player.playerId === actor ? 2 : player.offlineTimeoutStreak })) };
  await h.seedState(state);
  const before = await h.read(), deadline = await h.deadline();
  h.setOffline(true); h.clock.set(deadline.deadlineAt);
  assert.equal((await h.timeout.timeout(deadline)).status, "APPLIED");
  const after = await h.read();
  assert.ok(after.game);
  assert.equal(after.phase, "FINISHED");
  assert.equal(after.game.state.result?.reason, "CITY_COMPLETION_ROUND_END");
  assert.equal(cityPlayer(after.game.state, actor).forfeited, false);
  assert.equal(cityPlayer(after.game.state, actor).offlineTimeoutStreak, 3);
  assert.equal(after.game.gameRevision, before.game!.gameRevision + 1);
  const actorIndex = h.players.findIndex((player) => String(player.playerId) === String(actor));
  assert.equal((await h.persistence.findByVerificationData(h.sessionVerifications[actorIndex]!))?.state, "BOUND");
  assert.deepEqual(await h.persistence.listActiveTurnDeadlines(), []);
  assertCityCardConservation(after.game.state);
});

test("CITY E02 forfeit cleanup precedes next CR-07 entry shuffle and conserves every released card", async () => {
  const h = await harness();
  await h.roleFixture("CR-04", ["CR-01", "CR-02", "CR-03", "CR-04", "CR-07", "CR-08"]);
  let state = (await h.playing()).game.state;
  const actor = cityPlayer(state).playerId, cardIds = state.cards.map((card) => card.cardId);
  state = withCityZones(state, { hands: [{ playerId: actor, cardIds: cardIds.slice(2) }], deck: cardIds.slice(0, 2) });
  state = { ...state, players: state.players.map((player) => player.playerId === actor ? { ...player, offlineTimeoutStreak: 2 } : player) };
  await h.seedState(state);
  assert.equal((await h.service.drawBuildingCards(await h.input("third-before-seven"))).ok, true);
  const before = await h.playing(), deadline = await h.deadline();
  const returnedToDeck = before.game.state.pendingChoice!.cards[1]!;
  h.setOffline(true); h.clock.set(deadline.deadlineAt);
  const result = await h.timeout.timeout(deadline);
  assert.equal(result.status, "APPLIED", JSON.stringify(result));
  const after = await h.playing();
  assert.equal(after.window.kind, "ROLE_ACTION");
  if (after.window.kind === "ROLE_ACTION") assert.equal(after.window.activeRoleId, "CR-07");
  assert.equal(cityPlayer(after.game.state, actor).hand.length, 0);
  assert.equal(cityPlayer(after.game.state).hand.length, 2);
  assert.ok(cityPlayer(after.game.state).hand.includes(returnedToDeck), "The unchosen pending card is bottomed before CR-07 draws and reshuffles released cards.");
  assert.equal(after.game.state.deck.length, 58);
  assert.equal(after.game.state.discard.length, 0);
  assert.ok(after.game.entropyCounter > before.game.entropyCounter);
  assertCityCardConservation(after.game.state);
});

test("CITY connected timeout does not change prior offline streak; resume plan preserves deadline, pending and gameplay revision", async () => {
  const h = await harness();
  await h.roleFixture("CR-03");
  await h.service.drawBuildingCards(await h.input("resume-pending"));
  const pending = await h.playing(), actor = pending.window.activePlayerId;
  await h.seedState({ ...pending.game.state, players: pending.game.state.players.map((player) => player.playerId === actor ? { ...player, offlineTimeoutStreak: 2 } : player) });
  const before = await h.playing(), plan = h.lifecycle.planPresenceRestored(before, parse(PlayerIdSchema, actor));
  assert.equal(plan.status, "RESET");
  if (plan.status !== "RESET") throw new Error("Expected CITY resume streak reset.");
  assert.equal(plan.gameRevision, before.game.gameRevision);
  assert.equal(plan.game.deadlineAt, before.game.deadlineAt);
  assert.deepEqual(plan.game.state.pendingChoice, before.game.state.pendingChoice);
  assert.deepEqual(plan.game.state.window, before.game.state.window);
  assert.equal(cityPlayer(plan.game.state, actor).offlineTimeoutStreak, 0);
  assert.deepEqual(await h.read(), roomWithoutWindow(before), "Planning itself is pure.");
  const deadline = await h.deadline(); h.clock.set(deadline.deadlineAt);
  assert.equal((await h.timeout.timeout(deadline)).status, "APPLIED");
  const after = await h.playing();
  assert.equal(cityPlayer(after.game.state, actor).offlineTimeoutStreak, 2);
  assert.equal(cityPlayer(after.game.state, actor).forfeited, false);
});

test("CITY concrete role ability transport mapping supports whole-hand exchange and building destruction without private identity replacement", async () => {
  const h = await harness();
  await h.roleFixture("CR-03");
  await h.service.takeIncome(await h.input("exchange-income"));
  const original = await h.playing(), actor = original.window.activePlayerId, target = original.game.state.players.find((player) => player.playerId !== actor)!;
  assert.equal((await h.service.useRoleAbility({ ...await h.input("exchange"), ability: { ability: "EXCHANGE_HANDS", targetPlayerId: parse(PlayerIdSchema, target.playerId) } })).ok, true);
  const exchanged = await h.playing();
  assert.deepEqual(cityPlayer(exchanged.game.state, actor).hand, target.hand);
  assert.deepEqual(cityPlayer(exchanged.game.state, target.playerId).hand, cityPlayer(original.game.state, actor).hand);
  const other = await harness();
  await other.roleFixture("CR-08", ["CR-01", "CR-02", "CR-03", "CR-04", "CR-06", "CR-08"]);
  let state = (await other.playing()).game.state;
  const owner = state.players.find((player) => player.playerId !== state.window!.activePlayerId)!;
  const building = cityCard(state, "CB-CIV-01");
  state = withCityZones(state, { cities: [{ playerId: owner.playerId, cardIds: [building] }] });
  await other.seedState(state);
  await other.service.takeIncome(await other.input("destroy-income"));
  assert.equal((await other.service.useRoleAbility({ ...await other.input("destroy"), ability: { ability: "DESTROY_BUILDING", targetPlayerId: parse(PlayerIdSchema, owner.playerId), cardId: building } })).ok, true);
  const destroyed = await other.playing();
  assert.equal(cityPlayer(destroyed.game.state, owner.playerId).city.length, 0);
  assert.ok(destroyed.game.state.discard.includes(building));
  assertCityCardConservation(destroyed.game.state);
});
