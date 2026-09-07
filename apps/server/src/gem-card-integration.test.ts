import assert from "node:assert/strict";
import test from "node:test";
import { GemCardFinishedPlatformSnapshotV2Schema, GemCardPlayingPlatformSnapshotV2Schema, GameRevisionSchema, NicknameSchema, PlayerIdSchema, PresenceVersionSchema, RequestIdSchema, RoomCodeSchema, RoomRevisionSchema, type RoomId } from "@hangul-rummikub/shared";
import { parse, safeParse } from "valibot";
import { FakeClock, FakeIdGenerator } from "./infrastructure/system.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "./infrastructure/keyed-serial-executor.js";
import { GameRegistry } from "./games/game-registry.js";
import { createGemCardRegistration } from "./games/gem-card/gem-card-registration.js";
import { GemCardStartService } from "./games/gem-card/application/gem-card-start-service.js";
import { GemCardCommandService, asGemPlayingRoom, type GemTurnInput } from "./games/gem-card/application/gem-card-command-service.js";
import { GemCardCommandRouter } from "./games/gem-card/application/gem-card-command-router.js";
import { GemCardTimeoutService } from "./games/gem-card/application/gem-card-timeout-service.js";
import { createGemCardPlayerLifecycleActions } from "./games/gem-card/application/gem-card-player-lifecycle-actions.js";
import { GemCardGameStateAdapter } from "./games/gem-card/compatibility/gem-card-game-state-adapter.js";
import { projectGemCardV2Game } from "./games/gem-card/compatibility/gem-card-v2-game-projector.js";
import type { GemGameState, PlayingGemGameState } from "./games/gem-card/domain/game-state.js";
import { GEM_CARDSET_V1 } from "./games/gem-card/domain/cardset-v1.js";
import { createGemMarket } from "./games/gem-card/domain/market.js";
import { createGemPlayerState } from "./games/gem-card/domain/player-state.js";
import { calculateGemPayment, hasAnyGemLegalMainAction } from "./games/gem-card/domain/actions.js";
import { createGemGameResult } from "./games/gem-card/domain/result-engine.js";
import { GEM_INITIAL_RESOURCE_TOTALS, GEM_RESOURCES } from "./games/gem-card/domain/resource.js";
import type { GemCardRoomRecord } from "./model/persistence.js";
import { toScheduledTurnDeadline } from "./application/turn-transition.js";
import type { ScheduledTurnDeadline } from "./ports/system.js";
import { OverdueTurnSweeper } from "./infrastructure/overdue-turn-sweeper.js";
import { RoomRetentionService } from "./application/room-retention-service.js";
import { RoomCleanupService } from "./application/room-cleanup-service.js";
import { createApplicationRuntime } from "./composition-root.js";
import { createLegacyHangulCompatibilityRegistration } from "./games/hangul-tile/compatibility/legacy-hangul-compatibility-registration.js";
import { createNumberTileRegistration } from "./games/number-tile/number-tile-registration.js";
const current = { isCurrent: () => true };
const rid = (s: string) => parse(RequestIdSchema, s);
async function harness(count = 2, autoStart = true) {
  const persistence = new InMemoryPersistence();
  const ids = new FakeIdGenerator();
  const clock = new FakeClock(1000);
  const players = Array.from({ length: count }, (_, i) => ({ playerId: ids.generatePlayerId(), nickname: parse(NicknameSchema, `Gem${i}`), joinOrder: i }));
  const roomId = ids.generateRoomId();
  const created = await persistence.createIfAbsent({ roomId, roomCode: parse(RoomCodeSchema, "BCDFGH"), gameType: "GEM_CARD", phase: "LOBBY", hostPlayerId: players[0]!.playerId, players, game: null, roomRevision: parse(RoomRevisionSchema, 0), createdAt: clock.now(), updatedAt: clock.now() });
  assert.equal(created.status, "CREATED");
  const scheduled: ScheduledTurnDeadline[] = [];
  let rngCalls = 0;
  let offline = false;
  let leaseCurrent = true;
  const deps = { roomRepository: persistence, idempotencyRepository: persistence, roomUnitOfWork: persistence, roomMutationExecutor: new KeyedSerialExecutor<RoomId>(), clock, idGenerator: ids,
    turnScheduler: { scheduleTimeout: async (deadline: ScheduledTurnDeadline) => { scheduled.push(deadline); }, cancelTimeout: async () => undefined } };
  const start = new GemCardStartService({ ...deps, randomSource: { nextInt: max => { rngCalls++; return max - 1; } }, gameRegistrationReader: new GameRegistry([createGemCardRegistration()]), presenceLeaseReader: { acquireRoomPresenceLease: async () => ({ presenceVersion: parse(PresenceVersionSchema, 0), connectionStatusByPlayerId: new Map(players.map(p => [p.playerId, offline ? "OFFLINE" as const : "CONNECTED" as const])), isCurrent: () => leaseCurrent }) } });
  const service = new GemCardCommandService(deps);
  const router = new GemCardCommandRouter({ roomRepository: persistence, capability: { gameType: "GEM_CARD", collect: i => service.collect(i), purchase: i => service.purchase(i), reserve: i => service.reserve(i), yield: i => service.yield(i) } });
  const timeout = new GemCardTimeoutService({ ...deps, presenceLeaseReader: { acquirePlayerPresenceLease: async () => ({ connectionStatus: offline ? "OFFLINE" : "CONNECTED", connectionGeneration: 1, isCurrent: () => leaseCurrent }) } });
  const startInput = { roomId, actorPlayerId: players[0]!.playerId, requestId: rid("gem-start"), expectedRoomRevision: parse(RoomRevisionSchema, 0), authorization: current };
  if (autoStart) {
    const result = await start.start(startInput);
    assert.equal(result.ok, true, JSON.stringify(result));
  }
  async function read(): Promise<GemCardRoomRecord> { const room = await persistence.findById(roomId); assert.equal(room?.gameType, "GEM_CARD"); return room; }
  async function playing() { const room = asGemPlayingRoom(await read()); assert.ok(room); return room; }
  async function input(id: string): Promise<GemTurnInput> { const room = await playing(); return { roomId, actorPlayerId: room.game.turn.activePlayerId, requestId: rid(id), expectedGameRevision: room.game.gameRevision, turnId: room.game.turn.turnId, receivedAt: clock.now(), authorization: current }; }
  async function seed(game: GemGameState) { const room = await read(); const changed = await persistence.replace({ candidate: { ...room, game, phase: game.turn ? "PLAYING" : "FINISHED" }, expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision }); assert.equal(changed.status, "REPLACED"); }
  return { deps, persistence, ids, clock, players, roomId, scheduled, start, startInput, service, router, timeout, read, playing, input, seed, rngCalls: () => rngCalls, setOffline: (v: boolean) => { offline = v; }, setLeaseCurrent: (v: boolean) => { leaseCurrent = v; } };
}
type Harness = Awaited<ReturnType<typeof harness>>;
async function expire(h: Harness) { const room = await h.playing(); h.clock.set(room.game.turn.deadlineAt); return h.timeout.timeout(toScheduledTurnDeadline(h.roomId, room.game)); }
/** Exact canonical inventory fixture redistribution, never a production debug path. */
function reallocate(game: PlayingGemGameState, players: PlayingGemGameState["players"]): PlayingGemGameState {
  const owned = new Set(players.flatMap(p => [...p.purchasedCardIds, ...p.reservedCardIds]));
  const market = createGemMarket(([1, 2, 3] as const).map(tier => {
    const remaining = game.cards.filter(c => c.tier === tier && !owned.has(c.cardId)).map(c => c.cardId);
    return { tier, deck: remaining.slice(3), slots: [remaining[0] ?? null, remaining[1] ?? null, remaining[2] ?? null] };
  }));
  const supply = { ...GEM_INITIAL_RESOURCE_TOTALS };
  for (const p of players)
    for (const r of GEM_RESOURCES)
      supply[r] -= p.resources[r];
  return { ...game, players, supply, market };
}
test("GEM UoW commit precondition rollback includes idempotency, revision, cards/resources and scheduling", async () => {
  const h = await harness();
  const before = await h.playing();
  const input = { ...await h.input("rollback"), selection: { kind: "PRISM" as const } };
  const scheduleCount = h.scheduled.length;
  const service = new GemCardCommandService({ ...h.deps, roomUnitOfWork: { commit: (change) => h.persistence.commit(change, { isSatisfied: () => false }) } });
  const rejected = await service.collect(input);
  assert.equal(rejected.ok, false);
  if (!rejected.ok)
    assert.equal(rejected.error.code, "UNAUTHENTICATED");
  assert.deepEqual(await h.read(), before);
  assert.equal(h.scheduled.length, scheduleCount);
  assert.equal((await h.router.collect(input)).ok, true);
  assert.equal((await h.playing()).game.gameRevision, 1);
});
test("GEM storage CAS and immutable gameType reject stale/cross-game writes", async () => {
  const h = await harness();
  const before = await h.playing();
  await h.router.collect({ ...await h.input("cas"), selection: { kind: "PRISM" } });
  const currentRoom = await h.read();
  const stale = await h.persistence.replace({ candidate: before, expectedRoomRevision: before.roomRevision, expectedStorageRevision: before.storageRevision });
  assert.notEqual(stale.status, "REPLACED");
  const changedType = await h.persistence.replace({ candidate: { ...currentRoom, gameType: "NUMBER_TILE", game: null, phase: "LOBBY" }, expectedRoomRevision: currentRoom.roomRevision, expectedStorageRevision: currentRoom.storageRevision });
  assert.notEqual(changedType.status, "REPLACED");
  assert.deepEqual(await h.read(), currentRoom);
  assert.deepEqual(await h.persistence.listActiveTurnDeadlines(), [toScheduledTurnDeadline(h.roomId, (await h.playing()).game)]);
  assert.deepEqual(await h.persistence.listActiveGameDeadlines(), []);
});
test("GEM timeout vs command lane has one canonical winner; changed presence lease cannot commit", async () => {
  const h = await harness();
  const before = await h.playing();
  const deadline = toScheduledTurnDeadline(h.roomId, before.game);
  const input = { ...await h.input("race"), selection: { kind: "PRISM" as const } };
  h.clock.set(deadline.deadlineAt);
  h.setLeaseCurrent(false);
  assert.deepEqual(await h.timeout.timeout(deadline), { status: "NO_OP", reason: "PRESENCE_CHANGED" });
  assert.deepEqual(await h.read(), before);
  h.setLeaseCurrent(true);
  const [command, timeout] = await Promise.all([h.router.collect(input), h.timeout.timeout(deadline)]);
  assert.equal(Number(command.ok) + Number(timeout.status === "APPLIED"), 1);
  assert.equal((await h.playing()).game.gameRevision, 1);
});
test("GEM router preserves input identity/exact receivedAt and freezes all four delegates", async () => {
  const h = await harness();
  const calls: unknown[] = [];
  const result = { ok: false as const, error: { code: "YIELD_NOT_ALLOWED" as const, message: "fixture", recoverable: true } };
  const capability = { gameType: "GEM_CARD" as const, collect: async (input: unknown) => { calls.push(input); return result; }, purchase: async (input: unknown) => { calls.push(input); return result; }, reserve: async (input: unknown) => { calls.push(input); return result; }, yield: async (input: unknown) => { calls.push(input); return result; } };
  const router = new GemCardCommandRouter({ roomRepository: h.persistence, capability });
  capability.collect = async () => { throw new Error("must not replace frozen registration"); };
  const input = await h.input("delegate");
  const collect = { ...input, selection: { kind: "PRISM" as const } };
  const reserve = { ...input, source: { tier: 1 as const, slotIndex: 0 as const } };
  const purchase = { ...input, source: { kind: "MARKET" as const, tier: 1 as const, slotIndex: 0 as const } };
  assert.equal(await router.collect(collect), result);
  assert.equal(await router.purchase(purchase), result);
  assert.equal(await router.reserve(reserve), result);
  assert.equal(await router.yield(input), result);
  for (const [i, expected] of [collect, purchase, reserve, input].entries())
    assert.equal(calls[i], expected);
  const wrong = new GemCardCommandRouter({ roomRepository: { findById: async () => ({ ...await h.read(), gameType: "HANGUL_TILE", phase: "LOBBY", game: null }) }, capability: { ...capability, collect: async (i) => { calls.push(i); return result; } } });
  assert.equal((await wrong.collect(collect)).ok, false);
  assert.equal(calls.length, 4);
});
test("production composition requires all three identity registrations including GEM", () => {
  assert.throws(() => createApplicationRuntime({ gameRegistrations: [createLegacyHangulCompatibilityRegistration(), createNumberTileRegistration()] }));
});
test("GEM overdue recovery is at-least-once safe and stops without a timer leak", async () => {
  const h = await harness();
  const before = await h.playing();
  let timers = 0;
  const sweeper = new OverdueTurnSweeper({ activeTurnReader: h.persistence, clock: h.clock, enqueueTimeout: async (deadline) => { await h.timeout.timeout(deadline); }, timerDriver: { set: () => ++timers, clear: () => { timers--; } } });
  sweeper.start();
  sweeper.start();
  assert.equal(timers, 1);
  h.clock.set(before.game.turn.deadlineAt);
  assert.equal(await sweeper.sweepOnce(), 1);
  assert.equal(await sweeper.sweepOnce(), 0);
  assert.equal((await h.playing()).game.gameRevision, 1);
  sweeper.stop();
  assert.equal(timers, 0);
  assert.equal(await sweeper.sweepOnce(), 0);
});
test("GEM platform retention cancels all-offline cleanup on reconnect; finished retention is fixed and frees code", async () => {
  const h = await harness();
  const before = await h.playing();
  let connected = true;
  let released = 0;
  const cleanup = new RoomCleanupService({ roomRepository: h.persistence, roomUnitOfWork: h.persistence, roomMutationExecutor: h.deps.roomMutationExecutor, resources: { cleanupRoom: () => { released++; } } });
  const retention = new RoomRetentionService({ cleanupService: cleanup, roomRepository: h.persistence, clock: h.clock, presenceReader: {
      acquireLobbyDisconnectLease: async () => ({ connectionStatus: "OFFLINE", connectionGeneration: 1, isCurrent: () => true }),
      acquireRoomPresenceLease: async () => ({ presenceVersion: parse(PresenceVersionSchema, 1), connectionStatusByPlayerId: new Map(h.players.map(p => [p.playerId, connected ? "CONNECTED" as const : "OFFLINE" as const])), isCurrent: () => true }),
    } });
  h.clock.set(1801000);
  const offline = { kind: "PLAYING_ALL_OFFLINE_RETENTION" as const, roomId: h.roomId, gameId: before.game.gameId, presenceVersion: parse(PresenceVersionSchema, 1), allOfflineAt: before.createdAt, deadlineAt: h.clock.now() };
  assert.deepEqual(await retention.expire(offline), { status: "NO_OP", reason: "PLAYER_CONNECTED" });
  assert.deepEqual(await h.read(), before);
  const leave = createGemCardPlayerLifecycleActions(h.ids).applyPlayingLeave({ room: before, actorPlayerId: h.players[1]!.playerId, occurredAt: h.clock.now() });
  assert.equal(leave.candidate.gameType, "GEM_CARD");
  assert.ok(leave.candidate.game);
  await h.seed(leave.candidate.game);
  const finish = (await h.persistence.listFinishedRoomRetentions())[0]!;
  h.clock.set(finish.finishedAt + 1800000);
  const deadline = { ...finish, kind: "FINISHED_ROOM_RETENTION" as const, deadlineAt: h.clock.now() };
  // Connected players cannot extend the fixed FINISHED retention window.
  assert.equal((await retention.expire(deadline)).status, "CLEANED");
  assert.equal(released, 1);
  assert.equal(await h.persistence.findById(h.roomId), null);
  assert.equal(await h.persistence.findByCode(before.roomCode), null);
  assert.equal((await retention.expire(deadline)).status, "NO_OP");
  const offlineGame = await harness();
  const offlineRoom = await offlineGame.playing();
  connected = false;
  const copied = await h.persistence.createIfAbsent({ ...offlineRoom, roomId: h.roomId });
  assert.equal(copied.status, "CREATED");
  assert.equal((await retention.expire({ ...offline, gameId: offlineRoom.game.gameId })).status, "CLEANED");
});
for (const size of [2, 3, 4])
  test(`GEM start ${size} players: immutable order, 45s, 9 face-up, 36 private, exact RNG/replay`, async () => {
    const h = await harness(size);
    const room = await h.playing();
    assert.equal(room.game.gameRevision, 0);
    assert.deepEqual(room.game.turnOrder, h.players.map(p => p.playerId));
    assert.equal(room.game.turn.deadlineAt - room.game.turn.startedAt, 45000);
    assert.ok(room.game.market.every(t => t.deck.length === 12 && t.slots.every(Boolean)));
    assert.deepEqual(room.game.supply, GEM_INITIAL_RESOURCE_TOTALS);
    assert.ok(room.game.players.every(p => Object.values(p.resources).every(n => n === 0)));
    assert.equal(h.rngCalls(), size - 1 + 42);
    assert.ok(Object.isFrozen(room.game.turnOrder));
    assert.equal((await h.start.start(h.startInput)).ok, true);
    assert.equal(h.rngCalls(), size - 1 + 42);
    assert.deepEqual(await h.read(), room);
    assert.equal(h.scheduled[0]?.deadlineAt, room.game.turn.deadlineAt);
    assert.equal("gameDeadlineAt" in room.game, false);
  });
test("GEM start Host/readiness/stale/authorization gates reject without RNG or mutation", async () => {
  const h = await harness(2, false);
  const original = await h.read();
  for (const [changes, code] of [[{ actorPlayerId: h.players[1]!.playerId }, "HOST_ONLY"], [{ expectedRoomRevision: parse(RoomRevisionSchema, 2) }, "STALE_ROOM_REVISION"], [{ authorization: { isCurrent: () => false } }, "UNAUTHENTICATED"]] as const) {
    const r = await h.start.start({ ...h.startInput, ...changes });
    assert.equal(r.ok, false);
    if (!r.ok)
      assert.equal(r.error.code, code);
  }
  h.setOffline(true);
  const r = await h.start.start(h.startInput);
  assert.equal(r.ok, false);
  if (!r.ok)
    assert.equal(r.error.code, "PLAYERS_NOT_CONNECTED");
  assert.equal(h.rngCalls(), 0);
  assert.deepEqual(await h.read(), original);
});
test("GEM collect/replay/canonical resource-set fingerprint and concurrent stale turn", async () => {
  const h = await harness();
  const command = { ...await h.input("collect"), selection: { kind: "BASIC" as const, resources: ["DAWN", "TIDE"] as [
        "DAWN",
        "TIDE"
      ] } };
  const [a, b] = await Promise.all([h.router.collect(command), h.router.collect(command)]);
  assert.equal(a.ok, true);
  assert.deepEqual(a, b);
  const room = await h.playing();
  assert.equal(room.game.gameRevision, 1);
  assert.equal(room.game.supply.DAWN, 6);
  assert.equal(room.game.supply.TIDE, 6);
  assert.deepEqual(await h.router.collect({ ...command, selection: { kind: "BASIC", resources: ["TIDE", "DAWN"] } }), a);
  const conflict = await h.router.collect({ ...command, selection: { kind: "PRISM" } });
  assert.equal(conflict.ok, false);
  if (!conflict.ok)
    assert.equal(conflict.error.code, "REQUEST_ID_REUSED");
  const stale = await h.router.collect({ ...command, requestId: rid("late") });
  assert.equal(stale.ok, false);
  assert.deepEqual(await h.read(), room);
});
test("GEM authority preserves exact receivedAt < deadline and rejects boundary/stale/replaced actor", async () => {
  const h = await harness();
  const before = await h.playing();
  const input = await h.input("authority");
  for (const [changes, code] of [[{ receivedAt: before.game.turn.deadlineAt }, "TURN_EXPIRED"], [{ expectedGameRevision: parse(GameRevisionSchema, 8) }, "STALE_GAME_REVISION"], [{ actorPlayerId: h.players[1]!.playerId }, "NOT_YOUR_TURN"], [{ authorization: { isCurrent: () => false } }, "UNAUTHENTICATED"]] as const) {
    const r = await h.router.collect({ ...input, ...changes, selection: { kind: "PRISM" } });
    assert.equal(r.ok, false);
    if (!r.ok)
      assert.equal(r.error.code, code);
    assert.deepEqual(await h.read(), before);
  }
  h.clock.set(before.game.turn.deadlineAt + 1000);
  assert.equal((await h.router.collect({ ...input, selection: { kind: "PRISM" } })).ok, true);
});
test("GEM reserve is public/no reward/same-slot refill; purchase basic-first then PRISM returns supply", async () => {
  const h = await harness();
  const before = await h.playing();
  const target = before.game.market[0].slots[0]!;
  const refill = before.game.market[0].deck[0]!;
  const reserve = await h.router.reserve({ ...await h.input("reserve"), source: { tier: 1, slotIndex: 0 } });
  assert.equal(reserve.ok, true);
  let room = await h.playing();
  assert.deepEqual(room.game.players[0]!.reservedCardIds, [target]);
  assert.equal(room.game.market[0].slots[0], refill);
  assert.deepEqual(room.game.supply, before.game.supply);
  await expire(h);
  room = await h.playing();
  const card = room.game.cards.find(c => c.cardId === target)!;
  const resources = { ...card.cost, PRISM: 1 };
  const required = GEM_RESOURCES.find(r => r !== "PRISM" && resources[r] > 0)!;
  resources[required]--;
  await h.seed(reallocate(room.game, room.game.players.map((p, i) => i === 0 ? createGemPlayerState({ ...p, resources }) : p)));
  const funded = await h.playing();
  const result = await h.router.purchase({ ...await h.input("purchase-reserved"), source: { kind: "RESERVED", cardId: target } });
  assert.equal(result.ok, true, JSON.stringify(result));
  room = await h.playing();
  assert.ok(room.game.players[0]!.purchasedCardIds.includes(target));
  assert.equal(room.game.players[0]!.reservedCardIds.length, 0);
  assert.equal(room.game.players[0]!.resources.PRISM, 0);
  assert.equal(room.game.supply.PRISM, funded.game.supply.PRISM + 1);
});
test("GEM unavailable reserved probe is normalized; cap/limit/yield rejection is atomic", async () => {
  const h = await harness();
  const room = await h.playing();
  const r = await h.router.purchase({ ...await h.input("probe"), source: { kind: "RESERVED", cardId: GEM_CARDSET_V1[0]!.cardId } });
  assert.equal(r.ok, false);
  if (!r.ok)
    assert.equal(r.error.code, "CARD_NOT_AVAILABLE");
  assert.equal((await h.router.yield(await h.input("illegal-yield"))).ok, false);
  assert.deepEqual(await h.read(), room);
  const resources = { DAWN: 7, TIDE: 1, GROVE: 0, EMBER: 0, ECHO: 0, PRISM: 0 };
  await h.seed(reallocate(room.game, room.game.players.map((p, i) => i === 0 ? createGemPlayerState({ ...p, resources }) : p)));
  const capped = await h.read();
  const cap = await h.router.collect({ ...await h.input("cap"), selection: { kind: "BASIC", resources: ["GROVE", "EMBER"] } });
  assert.equal(cap.ok, false);
  if (!cap.ok)
    assert.equal(cap.error.code, "RESOURCE_LIMIT_EXCEEDED");
  assert.deepEqual(await h.read(), capped);
  assert.equal((await h.router.collect({ ...await h.input("cap-single"), selection: { kind: "PRISM" } })).ok, true);
});
test("GEM connected and offline timeout: third action then forfeit, resources frozen; resume is revision-neutral", async () => {
  const h = await harness(3);
  assert.equal((await h.router.collect({ ...await h.input("held"), selection: { kind: "PRISM" } })).ok, true);
  h.setOffline(true);
  for (let i = 0; i < 2; i++)
    await expire(h);
  let room = await h.playing();
  const a = room.game.turn.activePlayerId;
  assert.equal((await expire(h)).status, "APPLIED");
  room = await h.playing();
  assert.equal(room.game.players.find(p => p.playerId === a)!.offlineTimeoutStreak, 1);
  const actions = createGemCardPlayerLifecycleActions(h.ids);
  const plan = actions.planPresenceRestored(room, a);
  assert.equal(plan.status, "RESET");
  if (plan.status !== "RESET")
    throw new Error("Expected streak reset");
  assert.equal(plan.game.gameRevision, room.game.gameRevision);
  await h.seed(plan.game);
  h.setOffline(false);
  await expire(h);
  await expire(h);
  await expire(h);
  room = await h.playing();
  assert.equal(room.game.players.find(p => p.playerId === a)!.offlineTimeoutStreak, 0);
  h.setOffline(true);
  for (let i = 0; i < 9 && (await h.read()).phase === "PLAYING"; i++)
    await expire(h);
  const end = await h.read();
  assert.ok(end.game);
  const forfeited = end.game.players.filter(p => p.forfeited);
  assert.ok(forfeited.length >= 1);
  assert.ok(end.game.players.some(p => p.resources.PRISM === 1));
  assert.equal(end.game.supply.PRISM, 4);
});
test("GEM timeout duplicates/stale identity/early callback cannot commit twice or fanout twice", async () => {
  const h = await harness();
  let notifications = 0;
  h.timeout.subscribeApplied(() => { notifications++; });
  const before = await h.playing();
  const deadline = toScheduledTurnDeadline(h.roomId, before.game);
  assert.equal((await h.timeout.timeout(deadline)).status, "NO_OP");
  h.clock.set(deadline.deadlineAt);
  const [a, b] = await Promise.all([h.timeout.timeout(deadline), h.timeout.timeout(deadline)]);
  assert.deepEqual([a.status, b.status], ["APPLIED", "NO_OP"]);
  assert.equal(notifications, 1);
  assert.equal((await h.playing()).game.gameRevision, 1);
  assert.equal((await h.persistence.listActiveGameDeadlines()).length, 0);
});
test("GEM explicit leave returns resources then immediate LPS and frozen reserve; no postterminal leave", async () => {
  const h = await harness();
  await h.router.collect({ ...await h.input("held"), selection: { kind: "PRISM" } });
  await expire(h);
  await h.router.reserve({ ...await h.input("reserved"), source: { tier: 1, slotIndex: 0 } });
  const room = await h.playing();
  const actions = createGemCardPlayerLifecycleActions(h.ids);
  const leave = actions.applyPlayingLeave({ room, actorPlayerId: h.players[0]!.playerId, occurredAt: h.clock.now() });
  assert.equal(leave.advisory, "NONE");
  assert.equal(leave.candidate.gameType, "GEM_CARD");
  assert.ok(leave.candidate.game);
  const game = leave.candidate.game;
  assert.equal(game.result?.reason, "LAST_PLAYER_STANDING");
  assert.equal(game.supply.PRISM, 5);
  assert.equal(game.players[0]!.resources.PRISM, 0);
  assert.equal(game.players[0]!.reservedCardIds.length, 1);
  await h.seed(game);
  assert.throws(() => actions.applyPlayingLeave({ room: { ...room, ...leave.candidate }, actorPlayerId: h.players[1]!.playerId, occurredAt: h.clock.now() }));
});
test("GEM clone detaches public/private arrays; rejects conservation, versions, forged result and invalid pending", async () => {
  const h = await harness();
  const game = (await h.playing()).game;
  const adapter = new GemCardGameStateAdapter();
  const copy = adapter.cloneAndValidate(game);
  assert.deepEqual(copy, game);
  assert.notEqual(copy, game);
  assert.notEqual(copy.market[0].deck, game.market[0].deck);
  assert.notEqual(copy.cards[0]!.cost, game.cards[0]!.cost);
  assert.notEqual(copy.players[0]!.resources, game.players[0]!.resources);
  const wrongVersion = structuredClone(game);
  Reflect.set(wrongVersion, "cardSetVersion", "gem-cardset-next");
  assert.throws(() => adapter.cloneAndValidate(wrongVersion));
  const swappedDefinitions = game.cards.map((card, i) => i < 2 ? { ...game.cards[1 - i]!, cardId: card.cardId } : card);
  assert.throws(() => adapter.cloneAndValidate({ ...game, cards: swappedDefinitions }));
  assert.throws(() => adapter.cloneAndValidate({ ...game, supply: { ...game.supply, PRISM: 4 } }));
  assert.throws(() => adapter.cloneAndValidate({ ...game, market: createGemMarket(game.market.map((t, i) => i === 0 ? { ...t, deck: t.deck.slice(1) } : t)) }));
  assert.throws(() => adapter.cloneAndValidate({ ...game, noProgressPlayerIds: [parse(PlayerIdSchema, "unknown")] }));
  assert.throws(() => adapter.cloneAndValidate({ ...game, pendingFairRound: { reason: "SCORE_THRESHOLD_ROUND_END", remainingPlayerIds: game.turnOrder } }));
});
test("GEM V2 has no fake rack/private state and never leaks deck IDs/order or lifecycle internals", async () => {
  const h = await harness();
  const room = await h.playing();
  const projection = projectGemCardV2Game({ phase: "PLAYING", game: room.game, playerIds: room.game.turnOrder, selfPlayerId: room.game.turnOrder[0]! });
  const shell = { snapshotVersion: 2, versions: { roomRevision: room.roomRevision, presenceVersion: 0 }, serverTime: h.clock.now(), room: { roomId: room.roomId, roomCode: room.roomCode, gameType: "GEM_CARD", phase: "PLAYING", players: room.players.map(p => ({ playerId: p.playerId, nickname: p.nickname, isHost: p.playerId === room.hostPlayerId, connectionStatus: "CONNECTED" })) }, self: { playerId: room.players[0]!.playerId }, game: projection };
  assert.equal(safeParse(GemCardPlayingPlatformSnapshotV2Schema, shell).success, true);
  for (const hidden of room.game.market.flatMap(t => t.deck))
    assert.equal(JSON.stringify(shell).includes(hidden), false);
  for (const field of ["privateState", "rack", "offlineTimeoutStreak", "noProgressPlayerIds", "storageRevision", "deck", "pendingFairRound"])
    assert.equal(JSON.stringify(shell).includes(`"${field}"`), false);
  for (const field of ["privateState", "rack"])
    assert.equal(safeParse(GemCardPlayingPlatformSnapshotV2Schema, { ...shell, game: { ...projection, [field]: [] } }).success, false);
});
for (const actorIndex of [0, 1, 2])
  test(`GEM threshold fair-round actor ${actorIndex}: immutable remainder only, no extra wrap`, async () => {
    const h = await harness(3);
    let game = (await h.playing()).game;
    const actor = game.players[actorIndex]!;
    const acquired: typeof game.cards[number][] = [];
    let score = 0;
    for (const card of game.cards.filter(c => c.tier >= 2).sort((a, b) => b.victoryPoints - a.victoryPoints))
      if (score + card.victoryPoints <= 17) {
        acquired.push(card);
        score += card.victoryPoints;
      }
    assert.equal(score, 17);
    const target = game.cards.find(c => c.tier === 1 && c.victoryPoints === 1)!;
    const players = game.players.map(p => p.playerId === actor.playerId ? createGemPlayerState({ ...p, purchasedCardIds: acquired.map(c => c.cardId), reservedCardIds: [target.cardId], resources: { DAWN: 0, TIDE: 0, GROVE: 0, EMBER: 0, ECHO: 0, PRISM: 5 } }) : p);
    game = { ...reallocate(game, players), turn: { ...game.turn, activePlayerId: actor.playerId } };
    await h.seed(game);
    const result = await h.router.purchase({ ...await h.input("threshold"), source: { kind: "RESERVED", cardId: target.cardId } });
    assert.equal(result.ok, true, JSON.stringify(result));
    for (let i = actorIndex + 1; i < 3; i++) {
      const currentRoom = await h.playing();
      assert.equal(currentRoom.game.turn.activePlayerId, h.players[i]!.playerId);
      assert.equal(currentRoom.game.pendingFairRound?.reason, "SCORE_THRESHOLD_ROUND_END");
      await expire(h);
    }
    const end = await h.read();
    assert.equal(end.phase, "FINISHED");
    assert.equal(end.game?.result?.reason, "SCORE_THRESHOLD_ROUND_END");
    assert.deepEqual(end.game?.result?.winnerPlayerIds, [actor.playerId]);
    assert.equal(end.game?.gameRevision, 3 - actorIndex);
  });
test("GEM existing market-exhaustion fair round stays authoritative through scores/timeout and ends at boundary", async () => {
  const h = await harness();
  let game = (await h.playing()).game;
  game = reallocate(game, game.players.map((p, i) => createGemPlayerState({ ...p, purchasedCardIds: game.cards.slice(i === 0 ? 0 : 22, i === 0 ? 22 : 45).map(c => c.cardId) })));
  game = { ...game, pendingFairRound: { reason: "MARKET_EXHAUSTED_ROUND_END", remainingPlayerIds: [...game.turnOrder] } };
  await h.seed(game);
  await expire(h);
  assert.equal((await h.playing()).game.pendingFairRound?.reason, "MARKET_EXHAUSTED_ROUND_END");
  await expire(h);
  const end = await h.read();
  assert.equal(end.game?.result?.reason, "MARKET_EXHAUSTED_ROUND_END");
});
test("GEM verified YIELD full eligible cycle ends NO_PROGRESS with concrete ranks and strict FINISHED V2", async () => {
  const h = await harness();
  let game = (await h.playing()).game;
  const holdings = [{ DAWN: 7, TIDE: 2, GROVE: 0, EMBER: 0, ECHO: 0, PRISM: 0 }, { DAWN: 0, TIDE: 0, GROVE: 7, EMBER: 2, ECHO: 0, PRISM: 0 }];
  const used = new Set<string>();
  const players = game.players.map((p, i) => {
    const held = createGemPlayerState({ ...p, resources: holdings[i]! });
    const reservedCardIds = game.cards.filter(c => !used.has(c.cardId) && !calculateGemPayment(held, c.cardId, game.cards).ok).slice(0, 2).map(c => c.cardId);
    for (const id of reservedCardIds)
      used.add(id);
    return createGemPlayerState({ ...held, reservedCardIds });
  });
  game = reallocate(game, players);
  const market = createGemMarket(game.market.map(t => {
    const remaining = [...t.slots.filter(id => id !== null), ...t.deck];
    const unavailable = remaining.filter(id => players.every(p => !calculateGemPayment(p, id, game.cards).ok)).slice(0, 3);
    assert.equal(unavailable.length, 3);
    return { tier: t.tier, slots: [unavailable[0]!, unavailable[1]!, unavailable[2]!], deck: remaining.filter(id => !unavailable.includes(id)) };
  }));
  game = { ...game, market };
  assert.ok(players.every(player => !hasAnyGemLegalMainAction({ ...game, player })));
  await h.seed(game);
  assert.equal((await h.router.yield(await h.input("yield-a"))).ok, true);
  const second = await h.router.yield(await h.input("yield-b"));
  assert.equal(second.ok, true, JSON.stringify(second));
  const end = await h.read();
  assert.ok(end.game?.result);
  assert.equal(end.game.result.reason, "NO_PROGRESS");
  assert.deepEqual(end.game.result.rankings.map(p => p.rank), [1, 1]);
  const projection = projectGemCardV2Game({ phase: "FINISHED", game: end.game, playerIds: end.game.turnOrder, selfPlayerId: end.game.turnOrder[0]! });
  const snapshot = { snapshotVersion: 2, versions: { roomRevision: end.roomRevision, presenceVersion: 0 }, serverTime: h.clock.now(), self: { playerId: end.players[0]!.playerId }, room: { roomId: end.roomId, roomCode: end.roomCode, gameType: "GEM_CARD", phase: "FINISHED", players: end.players.map(p => ({ playerId: p.playerId, nickname: p.nickname, isHost: p.playerId === end.hostPlayerId, connectionStatus: "CONNECTED" })) }, game: projection };
  assert.equal(safeParse(GemCardFinishedPlatformSnapshotV2Schema, snapshot).success, true);
  const result = createGemGameResult({ players: end.game.players, cards: end.game.cards, reason: "NO_PROGRESS", finishedAt: h.clock.now() });
  assert.deepEqual(result, end.game.result);
});
