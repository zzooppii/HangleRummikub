import assert from "node:assert/strict";
import test from "node:test";
import {
  CityActionIdSchema, CityRoleFinishedPlatformSnapshotV2Schema, CityRolePlayingPlatformSnapshotV2Schema,
  NicknameSchema, PlayerIdSchema, PresenceVersionSchema, RequestIdSchema, RoomCodeSchema, RoomRevisionSchema,
  TurnIdSchema, type CityPublicBuilding, type CityRolePlayingPlatformSnapshotV2, type CityRoleId, type PlayerId, type RoomId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { PlatformSnapshotV2Projector } from "./application/platform-snapshot-v2-projector.js";
import { LobbyStateSnapshotProjector } from "./application/lobby-state-snapshot-projector.js";
import { projectLegacyHangulV1Game } from "./games/hangul-tile/compatibility/legacy-hangul-v1-game-projector.js";
import { projectNumberTileV2Game } from "./games/number-tile/compatibility/number-tile-v2-game-projector.js";
import { projectGemCardV2Game } from "./games/gem-card/compatibility/gem-card-v2-game-projector.js";
import { GameRegistry } from "./games/game-registry.js";
import { createCityRoleRegistration } from "./games/city-role/city-role-registration.js";
import { CityRoleStartService } from "./games/city-role/application/city-role-start-service.js";
import { CityRoleCommandService, type CityActionInput, type CityMutationResult } from "./games/city-role/application/city-role-command-service.js";
import { CityRoleTimeoutService } from "./games/city-role/application/city-role-timeout-service.js";
import { CityRoleGameStateAdapter } from "./games/city-role/compatibility/city-role-game-state-adapter.js";
import { getCityTemplate, type CityBuildingTemplate } from "./games/city-role/domain/cardset-v1.js";
import type { CityPlayerState } from "./games/city-role/domain/game-state.js";
import { FakeClock, FakeIdGenerator } from "./infrastructure/system.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import { InProcessTurnScheduler, type OneShotTimerDriver } from "./infrastructure/in-process-turn-scheduler.js";
import { KeyedSerialExecutor } from "./infrastructure/keyed-serial-executor.js";
import { createUnboundSessionRecord, type CityRoleRoomRecord } from "./model/persistence.js";
import type { RoomUnitOfWork } from "./ports/room-unit-of-work.js";
import { assertCityCardConservation } from "./testing/city-role-fixtures.test.js";

/** Real scheduler, with a controllable clock driver instead of real-time waits. */
class FullGameTimers implements OneShotTimerDriver {
  readonly live = new Set<unknown>();
  readonly callbacks: Array<() => void> = [];
  set(delayMs: number, callback: () => void): unknown {
    assert.ok(delayMs > 0 && delayMs <= 90_000);
    const handle = Object.freeze({ callback });
    this.callbacks.push(callback);
    this.live.add(handle);
    return handle;
  }
  clear(handle: unknown): void { this.live.delete(handle); }
}

type BotMove =
  | Readonly<{ kind: "SELECT"; roleId: CityRoleId; discardRoleId?: CityRoleId }>
  | Readonly<{ kind: "INCOME" | "DRAW" | "END" }>
  | Readonly<{ kind: "CHOOSE" | "BUILD"; card: CityPublicBuilding }>;

async function fullGameHarness(count: 2 | 4 | 6) {
  const persistence = new InMemoryPersistence(), clock = new FakeClock(1000), ids = new FakeIdGenerator();
  const roomId = ids.generateRoomId();
  const players = Array.from({ length: count }, (_, index) => ({ playerId: ids.generatePlayerId(), nickname: parse(NicknameSchema, `FullCity${index}`), joinOrder: index }));
  const host = players[0];
  assert.ok(host);
  assert.equal((await persistence.createIfAbsent({ roomId, roomCode: parse(RoomCodeSchema, "BCDFGH"), gameType: "CITY_ROLE", phase: "LOBBY", hostPlayerId: host.playerId,
    players, game: null, roomRevision: parse(RoomRevisionSchema, 0), createdAt: clock.now(), updatedAt: clock.now() })).status, "CREATED");
  for (const [index, player] of players.entries()) {
    const verificationData = { algorithm: "SHA-256" as const, digestHex: String(index + 1).repeat(64) };
    assert.equal((await persistence.saveUnbound(createUnboundSessionRecord(verificationData, clock.now()))).status, "SAVED");
    assert.equal((await persistence.promoteUnbound({ verificationData, roomId, playerId: player.playerId, now: clock.now() })).status, "PROMOTED");
  }
  const presence = { presenceVersion: parse(PresenceVersionSchema, 0), connectionStatusByPlayerId: new Map(players.map(player => [player.playerId, "CONNECTED" as const])) };
  const presenceReader = { readRoomPresence: async () => presence };
  const projector = new PlatformSnapshotV2Projector({ clock, presenceReader,
    legacyHangulSnapshotProjector: new LobbyStateSnapshotProjector({ clock, presenceReader, legacyHangulV1GameProjector: projectLegacyHangulV1Game }),
    numberTileGameProjector: projectNumberTileV2Game, gemCardGameProjector: projectGemCardV2Game });
  const timers = new FullGameTimers();
  let timeout: CityRoleTimeoutService | null = null;
  let commits = 0, callbackFailures = 0, finishNotifications = 0;
  const scheduler = new InProcessTurnScheduler({ clock, timerDriver: timers,
    onDeadline: async descriptor => { assert.ok(timeout); await timeout.timeout(descriptor); },
    onCallbackFailure: () => { callbackFailures += 1; } });
  scheduler.start();
  const unitOfWork: RoomUnitOfWork = { commit: async (change, precondition) => {
    const result = await persistence.commit(change, precondition);
    if (result.status === "COMMITTED") commits += 1;
    return result;
  } };
  const deps = { roomRepository: persistence, idempotencyRepository: persistence, roomUnitOfWork: unitOfWork,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(), clock, idGenerator: ids, turnScheduler: scheduler,
    onTurnSchedulingFailure: () => { callbackFailures += 1; },
    onGameFinished: async () => { finishNotifications += 1; },
  };
  timeout = new CityRoleTimeoutService({ ...deps, presenceLeaseReader: { acquirePlayerPresenceLease: async () => ({ connectionStatus: "CONNECTED", connectionGeneration: 1, isCurrent: () => true }) } });
  const service = new CityRoleCommandService(deps);
  const start = new CityRoleStartService({ ...deps, randomSource: { nextInt: max => max - 1 },
    gameRegistrationReader: new GameRegistry([createCityRoleRegistration()]),
    presenceLeaseReader: { acquireRoomPresenceLease: async () => ({ ...presence, isCurrent: () => true }) },
  });
  const result = await start.start({ roomId, actorPlayerId: host.playerId, requestId: parse(RequestIdSchema, "full-game-start"),
    expectedRoomRevision: parse(RoomRevisionSchema, 0), authorization: { isCurrent: () => true } });
  assert.equal(result.ok, true, JSON.stringify(result));
  async function read() {
    const room = await persistence.findById(roomId);
    assert.ok(room?.gameType === "CITY_ROLE" && room.game !== null && room.phase !== "LOBBY");
    return { ...room, game: room.game };
  }
  async function viewer(room: CityRoleRoomRecord, playerId: PlayerId) {
    const snapshot = await projector.project({ room, selfPlayerId: playerId });
    return room.phase === "FINISHED" ? parse(CityRoleFinishedPlatformSnapshotV2Schema, snapshot) : parse(CityRolePlayingPlatformSnapshotV2Schema, snapshot);
  }
  let requests = 0;
  function input(room: Awaited<ReturnType<typeof read>>): CityActionInput {
    const window = room.game.state.window;
    assert.ok(window);
    return { roomId, actorPlayerId: parse(PlayerIdSchema, window.activePlayerId), requestId: parse(RequestIdSchema, `full-game-${++requests}`),
      gameId: room.game.gameId, expectedGameRevision: room.game.gameRevision, actionId: parse(CityActionIdSchema, window.actionId),
      receivedAt: clock.now(), authorization: { isCurrent: () => true } };
  }
  function invoke(command: CityActionInput, move: BotMove): Promise<CityMutationResult> {
    switch (move.kind) {
      case "SELECT": return service.selectRole({ ...command, roleId: move.roleId, ...(move.discardRoleId === undefined ? {} : { discardRoleId: move.discardRoleId }) });
      case "INCOME": return service.takeIncome(command);
      case "DRAW": return service.drawBuildingCards(command);
      case "CHOOSE": return service.chooseBuildingCard({ ...command, cardId: move.card.cardId });
      case "BUILD": return service.build({ ...command, cardId: move.card.cardId });
      case "END": return service.endTurn(command);
    }
  }
  return { count, persistence, clock, players, projector, timers, scheduler, service, timeout, read, viewer, input, invoke,
    commits: () => commits, callbackFailures: () => callbackFailures, finishNotifications: () => finishNotifications };
}

test("CITY corrected two-player timeout service handles all four selection windows and ignores replay", async t => {
  const h = await fullGameHarness(2); t.after(() => h.scheduler.stop());
  for (let step = 0; step < 4; step++) {
    const before = await h.read(); const deadline = (await h.persistence.listActiveTurnDeadlines())[0]!;
    assert.equal(before.game.state.round.available.length, [7, 6, 4, 2][step]);
    assert.equal(before.game.deadlineAt! - before.game.windowStartedAt!, 20_000);
    const projected = await h.viewer(before, parse(PlayerIdSchema, before.game.state.window!.activePlayerId));
    assert.equal(projected.game.draftDiscardRequired, step > 0);
    assert.ok(projected.game.phase === "ROLE_SELECTION");
    assert.deepEqual(projected.game.selectionOrder, { playerIds: before.game.state.round.pickQueue, currentIndex: step });
    h.clock.set(deadline.deadlineAt);
    assert.equal((await h.timeout.timeout(deadline)).status, "APPLIED");
    const after = await h.read();
    assert.equal(after.game.gameRevision, before.game.gameRevision + 1);
    assert.equal(after.game.state.round.hiddenRemoved.length, step + 1);
    assert.equal(new Set([...after.game.state.round.hiddenRemoved, ...after.game.state.round.assignments.map(a => a.roleId)]).size, (step + 1) * 2);
    assert.equal((await h.timeout.timeout(deadline)).status, "NO_OP");
    assert.deepEqual(await h.read(), after);
    assert.deepEqual(new CityRoleGameStateAdapter().cloneAndValidate(JSON.parse(JSON.stringify(after.game))), after.game);
  }
  const final = await h.read(); assert.equal(final.game.state.round.assignments.length, 4);
  assert.equal(final.game.state.window?.kind, "ROLE_ACTION");
  assert.equal(final.game.deadlineAt! - final.game.windowStartedAt!, 90_000);
});

/** Simple legal strategy based only on the actor's public/private viewer data. */
function chooseMove(snapshot: CityRolePlayingPlatformSnapshotV2, hasDrawn: boolean): BotMove {
  const { game, self } = snapshot;
  const player = game.playerStates.find(row => row.playerId === self.playerId);
  assert.ok(player);
  if (game.phase === "ROLE_SELECTION") {
    const available = game.privateState.availableRoleIds;
    assert.ok(available && available.length > 0);
    const preference: readonly CityRoleId[] = ["CR-07", "CR-06", "CR-04", "CR-05", "CR-08", "CR-03", "CR-02", "CR-01"];
    const roleId = preference.find(role => available.includes(role));
    assert.ok(roleId);
    return { kind: "SELECT", roleId, ...(game.draftDiscardRequired ? { discardRoleId: available.find(role => role !== roleId)! } : {}) };
  }
  const action = game.privateState.action;
  assert.ok(action);
  const usable = (card: CityPublicBuilding) => !player.builtBuildings.some(built => built.templateId === card.templateId);
  const costOrder = (left: CityPublicBuilding, right: CityPublicBuilding) => Number(!usable(left)) - Number(!usable(right)) || left.cost - right.cost || left.cardId.localeCompare(right.cardId);
  if (action.acquisition === "PENDING") {
    const choice = [...game.privateState.pendingCards ?? []].sort(costOrder)[0];
    assert.ok(choice);
    return { kind: "CHOOSE", card: choice };
  }
  if (action.acquisition === "NOT_TAKEN") return !hasDrawn || !game.privateState.hand.some(usable) ? { kind: "DRAW" } : { kind: "INCOME" };
  const affordable = [...game.privateState.hand].filter(card => usable(card) && card.cost <= player.gold).sort(costOrder)[0];
  if (affordable !== undefined && action.buildingsBuilt < (game.window.activeRoleId === "CR-07" ? 3 : 1)) return { kind: "BUILD", card: affordable };
  return { kind: "END" };
}

for (const count of [2, 4, 6] as const) test(`CITY ${count}-player complete application game reaches city completion with private viewer projections and one scheduler window`, async t => {
  const h = await fullGameHarness(count);
  t.after(() => h.scheduler.stop());
  const adapter = new CityRoleGameStateAdapter();
  let accepted = 0, rejectedDraws = 0, maxSnapshotBytes = 0, maxStoredBytes = 0, snapshotChecks = 0, hasDrawn = false;
  let completionRound: number | null = null;
  const kinds = new Map<BotMove["kind"], number>();
  const roles = new Set<CityRoleId>();
  const completedDraftRounds = new Set<number>();
  let lastAccepted: Readonly<{ command: CityActionInput; move: BotMove; result: CityMutationResult }> | null = null;
  const beginning = await h.read();
  assert.equal(beginning.game.state.rulesVersion, "city-rules-v3");
  assert.equal(beginning.game.state.cardSetVersion, "city-cardset-v3");
  assert.equal(beginning.game.state.roleSetVersion, "city-roles-v2");
  const expectedCards = beginning.game.state.cards.map(card => card.cardId);
  const seatOrder = beginning.game.state.seatOrder;

  async function audit(room: Awaited<ReturnType<typeof h.read>>) {
    const { game } = room, state = game.state;
    assertCityCardConservation(state);
    assert.deepEqual(state.cards.map(card => card.cardId), expectedCards);
    assert.deepEqual(state.seatOrder, seatOrder);
    assert.deepEqual(adapter.cloneAndValidate(JSON.parse(JSON.stringify(game))), game);
    maxStoredBytes = Math.max(maxStoredBytes, Buffer.byteLength(JSON.stringify(room)));
    assert.ok(state.players.every(player => !player.forfeited && player.offlineTimeoutStreak === 0));
    assert.deepEqual(await h.persistence.listActiveGameDeadlines(), []);
    const deadlines = await h.persistence.listActiveTurnDeadlines();
    assert.equal(h.scheduler.scheduledCount, state.window === null ? 0 : 1);
    assert.equal(h.timers.live.size, state.window === null ? 0 : 1);
    assert.equal(deadlines.length, state.window === null ? 0 : 1);
    if (state.window !== null) {
      assert.deepEqual(deadlines[0], { roomId: room.roomId, gameId: game.gameId, turnId: parse(TurnIdSchema, state.window.actionId),
        expectedGameRevision: game.gameRevision, deadlineAt: game.deadlineAt });
      assert.ok(game.windowStartedAt !== null && game.deadlineAt !== null);
      assert.equal(game.deadlineAt - game.windowStartedAt, state.window.kind === "ROLE_SELECTION" ? 20_000 : 90_000);
      if (state.window.kind === "ROLE_ACTION") {
        roles.add(state.window.activeRoleId);
        completedDraftRounds.add(state.round.roundNumber);
        assert.equal(state.round.assignments.length, count * (count <= 3 ? 2 : 1));
        assert.equal(state.round.assignments.length + state.round.publicRemoved.length + state.round.hiddenRemoved.length + state.round.unselected.length, 8);
        for (const player of state.players) assert.equal(state.round.assignments.filter(assignment => assignment.playerId === player.playerId).length, count <= 3 ? 2 : 1);
      }
    }
    if (state.firstCompletion !== null) {
      completionRound ??= state.firstCompletion.roundNumber;
      assert.equal(state.round.roundNumber, completionRound, "No extra round after the first-completion latch.");
    }
    for (const participant of h.players) {
      const snapshot = await h.viewer(room, participant.playerId);
      const visible = snapshot.game, serialized = JSON.stringify(snapshot);
      const own = state.players.find(player => String(player.playerId) === participant.playerId);
      assert.ok(own);
      snapshotChecks += 1;
      maxSnapshotBytes = Math.max(maxSnapshotBytes, Buffer.byteLength(serialized));
      assert.deepEqual(JSON.parse(serialized), snapshot);
      assert.equal(snapshot.self.playerId, participant.playerId);
      assert.equal(snapshot.room.players.length, count);
      assert.deepEqual(visible.privateState.hand.map(card => String(card.cardId)), own.hand.map(String));
      assert.deepEqual(visible.privateState.selectedRoleIds, state.round.assignments.filter(assignment => assignment.playerId === own.playerId).map(assignment => assignment.roleId));
      assert.deepEqual(visible.privateState.marks, state.marks.filter(mark => mark.sourcePlayerId === own.playerId).map(({ kind, targetRoleId, status }) => ({ kind, targetRoleId, status })));
      assert.deepEqual(visible.revealedRoles, state.revealedRoles);
      assert.deepEqual(visible.publicRemovedRoleIds, state.round.publicRemoved);
      for (const row of visible.playerStates) assert.deepEqual(Object.keys(row).sort(), ["builtBuildings", "forfeited", "gold", "handCount", "playerId", "scorePreview"]);
      for (const field of ["deck", "discard", "hiddenRemoved", "unselected", "assignments", "entropySeed", "entropyCounter", "offlineTimeoutStreak", "storageRevision", "sessionToken", "requestId", "rack"])
        assert.equal(serialized.includes(`"${field}"`), false, `Unexpected private field ${field}`);
      const hiddenCards = [...state.deck, ...state.discard, ...state.players.filter(player => player.playerId !== own.playerId).flatMap(player => player.hand),
        ...(state.pendingChoice !== null && state.pendingChoice.ownerPlayerId !== own.playerId ? state.pendingChoice.cards : [])];
      for (const id of hiddenCards) assert.equal(serialized.includes(JSON.stringify(id)), false, "A non-public physical card was projected.");
      if (visible.phase === "ROLE_SELECTION") {
        assert.deepEqual(visible.selectionOrder, { playerIds: state.round.pickQueue, currentIndex: state.round.selectionCursor });
        assert.equal(visible.privateState.availableRoleIds !== undefined, state.window?.activePlayerId === own.playerId);
        if (visible.privateState.availableRoleIds !== undefined) assert.deepEqual(visible.privateState.availableRoleIds, state.round.available);
      } else if (visible.phase === "ROLE_ACTION") {
        assert.equal(visible.privateState.action !== undefined, state.window?.activePlayerId === own.playerId);
        assert.equal(visible.privateState.pendingCards !== undefined, state.pendingChoice?.ownerPlayerId === own.playerId);
        if (visible.privateState.pendingCards !== undefined) assert.deepEqual(visible.privateState.pendingCards.map(card => String(card.cardId)), state.pendingChoice?.cards.map(String));
      }
    }
  }

  await audit(beginning);
  for (let attempt = 0; attempt < 1800; attempt += 1) {
    const before = await h.read();
    if (before.game.state.window === null) break;
    assert.ok(before.game.state.round.roundNumber <= 100, "Deterministic legal strategy did not reach completion.");
    const actorId = parse(PlayerIdSchema, before.game.state.window.activePlayerId);
    const view = parse(CityRolePlayingPlatformSnapshotV2Schema, await h.viewer(before, actorId));
    let move = chooseMove(view, hasDrawn);
    h.clock.advance(10);
    let command = h.input(before);
    let result: CityMutationResult;
    if (count === 6 && accepted === 0) {
      const concurrent = await Promise.all(Array.from({ length: 6 }, () => h.invoke(command, move)));
      result = concurrent[0]!;
      for (const receipt of concurrent) assert.deepEqual(receipt, result);
    } else result = await h.invoke(command, move);
    if (!result.ok && move.kind === "DRAW") {
      // The client has no deck/discard availability oracle. A genuine empty
      // supply may reject; the legal alternative is the already approved gold.
      assert.equal(result.error.code, "RULE_VIOLATION");
      assert.deepEqual(await h.read(), before);
      rejectedDraws += 1;
      move = { kind: "INCOME" }; command = h.input(before); result = await h.invoke(command, move);
    }
    assert.equal(result.ok, true, JSON.stringify({ count, attempt, move, result }));
    accepted += 1;
    kinds.set(move.kind, (kinds.get(move.kind) ?? 0) + 1);
    if (move.kind === "DRAW") hasDrawn = true;
    const after = await h.read();
    assert.equal(after.game.gameRevision, before.game.gameRevision + 1);
    assert.equal(h.commits(), accepted + 1, "Each new command commits once, including its replay record.");
    if (after.game.state.window?.actionId === before.game.state.window.actionId) {
      assert.equal(after.game.windowStartedAt, before.game.windowStartedAt);
      assert.equal(after.game.deadlineAt, before.game.deadlineAt);
    }
    if (accepted % 17 === 0) {
      const again = await h.invoke(command, move);
      assert.deepEqual(again, result);
      assert.deepEqual(await h.read(), after);
      assert.equal(h.commits(), accepted + 1);
    }
    lastAccepted = { command, move, result };
    await audit(after);
  }
  const finished = await h.read(), state = finished.game.state;
  assert.equal(finished.phase, "FINISHED");
  assert.ok(state.window === null && state.result !== null && state.firstCompletion !== null);
  assert.equal(state.result.reason, "CITY_COMPLETION_ROUND_END");
  assert.equal(state.round.ended, true);
  assert.equal(state.round.roundNumber, completionRound);
  assert.equal(completedDraftRounds.size, state.round.roundNumber);
  assert.ok(state.round.assignments.every(assignment => assignment.status === "RESOLVED"));
  assert.ok(state.players.some(player => player.city.length >= 8));
  assert.ok((kinds.get("CHOOSE") ?? 0) >= 1);
  assert.equal(h.callbackFailures(), 0);
  assert.ok(h.finishNotifications() >= 1);
  assert.equal(h.scheduler.scheduledCount, 0);
  assert.equal(h.timers.live.size, 0);
  // This is a generous serialization-regression sanity bound, not a wire limit
  // or a latency/performance benchmark for real devices/networks.
  assert.ok(maxSnapshotBytes < 256_000);
  for (const entry of state.result.rankings) {
    const player: CityPlayerState | undefined = state.players.find(candidate => candidate.playerId === entry.playerId);
    assert.ok(player);
    const templates: readonly CityBuildingTemplate[] = player.city.map(id => {
      const card = state.cards.find(candidate => candidate.cardId === id);
      assert.ok(card);
      return getCityTemplate(card.templateId);
    });
    const buildingVP: number = templates.reduce((sum, template) => sum + template.victoryPoints, 0);
    const completionBonus: number = state.firstCompletion.playerId === player.playerId ? 4 : player.city.length >= 8 ? 2 : 0;
    const has = (id: string) => templates.some(t => t.templateId === id);
    const alternatives: Array<{ diversity: number; special: number }> = ['LANDMARK','CIVIC','CULTURE','TRADE','GUARD'].map((haunted): { diversity: number; special: number } => {
      const categories = templates.map(t => t.templateId === 'CB-SP-09' ? haunted : t.category);
      return { diversity: new Set(categories).size === 5 ? 3 : 0,
        special: (has('CB-SP-04') ? 2 : 0) + (has('CB-SP-10') ? player.gold : 0) + (has('CB-SP-15') ? player.hand.length : 0) + (has('CB-SP-27') && state.leaderPlayerId === player.playerId ? 5 : 0) + (has('CB-SP-30') ? categories.filter(c=>c==='LANDMARK').length : 0) };
    }).sort((a,b)=>(b.diversity+b.special)-(a.diversity+a.special));
    const diversityBonus: number = alternatives[0]!.diversity, landmarkBonus: number = alternatives[0]!.special;
    assert.equal(entry.landmarkBonus, landmarkBonus);
    assert.equal(entry.score, buildingVP + completionBonus + diversityBonus + landmarkBonus);
    assert.equal(entry.buildingVP, buildingVP);
    assert.equal(entry.completionBonus, completionBonus);
    assert.equal(entry.diversityBonus, diversityBonus);
    assert.equal(entry.rank, 1 + state.result.rankings.filter(other => other.score > entry.score).length);
    assert.equal(entry.winner, entry.rank === 1);
  }
  assert.ok(lastAccepted);
  assert.deepEqual(await h.invoke(lastAccepted.command, lastAccepted.move), lastAccepted.result);
  assert.deepEqual(await h.read(), finished, "Terminal replay does not mutate the result or state.");
  h.timers.callbacks[0]?.();
  await new Promise<void>(resolve => setImmediate(resolve));
  assert.deepEqual(await h.read(), finished, "An obsolete callback cannot revive a completed game.");
  assert.equal(h.scheduler.scheduledCount, 0);
  t.diagnostic(JSON.stringify({ players: count, rounds: state.round.roundNumber, acceptedActions: accepted,
    commandCounts: Object.fromEntries(kinds), rejectedEmptyDraws: rejectedDraws, revealedRoleKinds: [...roles].sort(),
    viewerSnapshotsChecked: snapshotChecks, maximumSnapshotBytes: maxSnapshotBytes, maximumStoredRoomBytes: maxStoredBytes,
    highestScore: state.result.rankings[0]?.score, finalCitySizes: state.players.map(player => player.city.length) }));
});
