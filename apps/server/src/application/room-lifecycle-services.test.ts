import assert from "node:assert/strict";
import test from "node:test";

import {
  NicknameSchema,
  PlayerIdSchema,
  RequestIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  type PlayerId,
  type RoomId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { createInitialGameState } from "../domain/game/game-state.js";
import {
  createUnboundSessionRecord,
  type RoomRecord,
} from "../model/persistence.js";
import type {
  RoomPolicyDeadline,
  RoomPolicyScheduler,
} from "../ports/room-policy-scheduler.js";
import type { RoomPresencePolicyReader } from "../ports/room-presence-policy.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type { ScheduledTurnDeadline, TurnScheduler } from "../ports/system.js";
import { ConnectionRegistryPresenceReader } from "../infrastructure/connection-registry-presence-reader.js";
import {
  ConnectionRegistry,
  createSocketId,
  type AuthenticatedSocketBinding,
} from "../infrastructure/connection-registry.js";
import { InMemoryPersistence } from "../infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "../infrastructure/keyed-serial-executor.js";
import { RoomLifecycleResources } from "../infrastructure/room-lifecycle-resources.js";
import { FakeClock, FakeIdGenerator } from "../infrastructure/system.js";
import { LobbyDisconnectGraceService } from "./lobby-disconnect-grace-service.js";
import { RoomCleanupService } from "./room-cleanup-service.js";
import { RoomLeaveService } from "./room-leave-service.js";
import {
  RoomPresencePolicyService,
  ROOM_RETENTION_MS,
} from "./room-presence-policy-service.js";
import { RoomRetentionService } from "./room-retention-service.js";

class RecordingPolicyScheduler implements RoomPolicyScheduler {
  readonly scheduled: RoomPolicyDeadline[] = [];
  readonly cancelledGrace: string[] = [];
  readonly cancelledPlaying: RoomId[] = [];
  readonly cancelledRooms: RoomId[] = [];

  async schedule(deadline: RoomPolicyDeadline): Promise<void> {
    this.scheduled.push(deadline);
  }
  async cancelLobbyGrace(
    roomId: RoomId,
    playerId: PlayerId,
    _resumedConnectionGeneration?: number,
  ): Promise<void> {
    this.cancelledGrace.push(`${roomId}:${playerId}`);
  }
  async cancelPlayingAllOffline(
    roomId: RoomId,
    _currentPresenceVersion?: import("@hangul-rummikub/shared").PresenceVersion,
  ): Promise<void> {
    this.cancelledPlaying.push(roomId);
  }
  async cancelRoom(roomId: RoomId): Promise<void> {
    this.cancelledRooms.push(roomId);
  }
}

class RecordingTurnScheduler implements TurnScheduler {
  readonly deadlines: ScheduledTurnDeadline[] = [];
  readonly cancelledRooms: RoomId[] = [];
  async scheduleTimeout(deadline: ScheduledTurnDeadline): Promise<void> {
    this.deadlines.push(deadline);
  }
  async cancelTimeout(): Promise<void> {}
  async cancelRoom(roomId: RoomId): Promise<void> {
    this.cancelledRooms.push(roomId);
  }
}

function playerId(value: string): PlayerId {
  return parse(PlayerIdSchema, value);
}

type LifecycleHarness = Readonly<{
  persistence: InMemoryPersistence;
  registry: ConnectionRegistry;
  bindings: readonly AuthenticatedSocketBinding[];
  clock: FakeClock;
  scheduler: RecordingPolicyScheduler;
  turnScheduler: RecordingTurnScheduler;
  leaveService: RoomLeaveService;
  graceService: LobbyDisconnectGraceService;
  policyService: RoomPresencePolicyService;
  retentionService: RoomRetentionService;
  room: RoomRecord;
  sessionVerifications: readonly { algorithm: "SHA-256"; digestHex: string }[];
}>;

async function createHarness(playerCount = 2): Promise<LifecycleHarness> {
  const persistence = new InMemoryPersistence();
  const registry = new ConnectionRegistry();
  const presenceReader = new ConnectionRegistryPresenceReader(registry);
  const clock = new FakeClock(1_000);
  const scheduler = new RecordingPolicyScheduler();
  const executor = new KeyedSerialExecutor<RoomId>();
  const players = Array.from({ length: playerCount }, (_, index) => ({
    playerId: playerId(`lifecycle-player-${index}`),
    nickname: parse(NicknameSchema, `Player${index}`),
    joinOrder: index,
  }));
  const host = players[0];
  if (host === undefined) throw new Error("Lifecycle fixture needs a Host.");
  const created = await persistence.createIfAbsent({
    roomId: parse(RoomIdSchema, "room-lifecycle"),
    roomCode: parse(RoomCodeSchema, "ABC234"),
    phase: "LOBBY",
    hostPlayerId: host.playerId,
    players,
    game: null,
    roomRevision: parse(RoomRevisionSchema, 0),
    createdAt: clock.now(),
    updatedAt: clock.now(),
  });
  if (created.status !== "CREATED") throw new Error("Room fixture failed.");

  const sessionVerifications = [];
  const bindings = [];
  for (const [index, player] of players.entries()) {
    const verificationData = {
      algorithm: "SHA-256" as const,
      digestHex: index.toString(16).repeat(64),
    };
    const session = createUnboundSessionRecord(verificationData, clock.now());
    assert.equal((await persistence.saveUnbound(session)).status, "SAVED");
    assert.equal((await persistence.promoteUnbound({
      verificationData,
      roomId: created.room.roomId,
      playerId: player.playerId,
      now: clock.now(),
    })).status, "PROMOTED");
    sessionVerifications.push(verificationData);
    bindings.push(registry.bindPrimary({
      socketId: createSocketId(`lifecycle-socket-${index}`),
      roomId: created.room.roomId,
      playerId: player.playerId,
    }).binding);
  }

  const turnScheduler = new RecordingTurnScheduler();
  const resources = new RoomLifecycleResources({
    connectionRegistry: registry,
    policyScheduler: scheduler,
    turnTimerCleanup: turnScheduler,
  });
  const cleanupService = new RoomCleanupService({
    roomRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor: executor,
    resources,
  });
  const graceService = new LobbyDisconnectGraceService({
    roomRepository: persistence,
    roomUnitOfWork: persistence,
    roomCleanupUnitOfWork: persistence,
    roomMutationExecutor: executor,
    presenceReader,
    clock,
    resources,
  });
  const retentionService = new RoomRetentionService({
    cleanupService,
    roomRepository: persistence,
    presenceReader,
    clock,
  });
  const policyService = new RoomPresencePolicyService({
    roomRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor: executor,
    scheduler,
    roomPresenceReader: presenceReader,
    playerPresenceLeaseReader: presenceReader,
    clock,
    lobbyGraceService: graceService,
    retentionService,
  });
  const leaveService = new RoomLeaveService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomCleanupUnitOfWork: persistence,
    roomMutationExecutor: executor,
    presenceReader,
    clock,
    idGenerator: new FakeIdGenerator(),
    resources,
    turnScheduler,
  });
  return {
    persistence,
    registry,
    bindings,
    clock,
    scheduler,
    turnScheduler,
    leaveService,
    graceService,
    policyService,
    retentionService,
    room: created.room,
    sessionVerifications,
  };
}

test("Lobby disconnect grace는 60초 전 보존하고 만료 시 Host를 lowest connected joinOrder로 이전한다", async () => {
  const harness = await createHarness(3);
  const hostBinding = harness.bindings[0];
  assert.ok(hostBinding);
  harness.registry.disconnect(hostBinding.socketId, hostBinding.connectionGeneration);
  const deadline = harness.policyService.createLobbyGraceDeadline({
    roomId: harness.room.roomId,
    playerId: hostBinding.playerId,
    connectionGeneration: hostBinding.connectionGeneration,
    disconnectedAt: harness.clock.now(),
  });

  harness.clock.set(deadline.deadlineAt - 1);
  assert.deepEqual(await harness.graceService.expire(deadline), {
    status: "NO_OP",
    reason: "NOT_DUE",
  });
  assert.equal((await harness.persistence.findById(harness.room.roomId))?.players.length, 3);

  harness.clock.set(deadline.deadlineAt);
  const expired = await harness.graceService.expire(deadline);
  assert.equal(expired.status, "REMOVED");
  const room = await harness.persistence.findById(harness.room.roomId);
  assert.ok(room);
  assert.equal(room.hostPlayerId, harness.room.players[1]?.playerId);
  assert.deepEqual(room.players.map((player) => player.playerId), [
    harness.room.players[1]?.playerId,
    harness.room.players[2]?.playerId,
  ]);
  assert.equal(
    await harness.persistence.findByVerificationData(harness.sessionVerifications[0]!),
    null,
  );
});

test("Lobby resume은 old grace를 stale로 만들고 hostless Lobby의 connected 최저 joinOrder를 선출한다", async () => {
  const harness = await createHarness(2);
  const [hostBinding, guestBinding] = harness.bindings;
  assert.ok(hostBinding && guestBinding);
  harness.registry.disconnect(hostBinding.socketId, hostBinding.connectionGeneration);
  harness.registry.disconnect(guestBinding.socketId, guestBinding.connectionGeneration);
  const hostDeadline = harness.policyService.createLobbyGraceDeadline({
    roomId: harness.room.roomId,
    playerId: hostBinding.playerId,
    connectionGeneration: hostBinding.connectionGeneration,
    disconnectedAt: harness.clock.now(),
  });
  harness.clock.set(hostDeadline.deadlineAt);
  assert.equal((await harness.graceService.expire(hostDeadline)).status, "REMOVED");
  assert.equal((await harness.persistence.findById(harness.room.roomId))?.hostPlayerId, null);

  harness.registry.bindPrimary({
    socketId: createSocketId("guest-resumed"),
    roomId: harness.room.roomId,
    playerId: guestBinding.playerId,
  });
  await harness.policyService.onResume(harness.room.roomId, guestBinding.playerId);
  assert.equal(
    (await harness.persistence.findById(harness.room.roomId))?.hostPlayerId,
    guestBinding.playerId,
  );
  assert.ok(
    harness.scheduler.cancelledGrace.includes(
      `${harness.room.roomId}:${guestBinding.playerId}`,
    ),
  );
});

test("Room 조회 중 resume된 stale Lobby disconnect callback은 grace를 뒤늦게 재등록하지 않는다", async () => {
  const harness = await createHarness(2);
  const disconnectedBinding = harness.bindings[1];
  assert.ok(disconnectedBinding);
  const disconnected = harness.registry.disconnect(
    disconnectedBinding.socketId,
    disconnectedBinding.connectionGeneration,
  );
  assert.equal(disconnected.status, "DISCONNECTED");
  if (disconnected.status !== "DISCONNECTED") return;

  let injectResume = true;
  const racingRepository: RoomRepository = {
    findById: async (roomId) => {
      if (injectResume) {
        injectResume = false;
        const resumed = harness.registry.bindPrimary({
          socketId: createSocketId("lobby-race-resumed"),
          roomId,
          playerId: disconnectedBinding.playerId,
        });
        await harness.scheduler.cancelLobbyGrace(
          roomId,
          disconnectedBinding.playerId,
          resumed.binding.connectionGeneration,
        );
      }
      return harness.persistence.findById(roomId);
    },
    findByCode: (roomCode) => harness.persistence.findByCode(roomCode),
    createIfAbsent: (candidate) => harness.persistence.createIfAbsent(candidate),
    replace: (input) => harness.persistence.replace(input),
    delete: (input) => harness.persistence.delete(input),
  };
  const presenceReader = new ConnectionRegistryPresenceReader(harness.registry);
  const policy = new RoomPresencePolicyService({
    roomRepository: racingRepository,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(),
    scheduler: harness.scheduler,
    roomPresenceReader: presenceReader,
    playerPresenceLeaseReader: presenceReader,
    clock: harness.clock,
    lobbyGraceService: harness.graceService,
    retentionService: harness.retentionService,
  });

  await policy.onCurrentDisconnect({
    roomId: harness.room.roomId,
    playerId: disconnectedBinding.playerId,
    connectionGeneration: disconnectedBinding.connectionGeneration,
    presenceVersion: disconnected.presenceVersion,
    disconnectedAt: harness.clock.now(),
  });

  assert.equal(
    harness.registry.getConnectionStatus(
      harness.room.roomId,
      disconnectedBinding.playerId,
    ),
    "CONNECTED",
  );
  assert.equal(
    harness.scheduler.scheduled.some(
      (deadline) =>
        deadline.kind === "LOBBY_DISCONNECT_GRACE" &&
        deadline.playerId === disconnectedBinding.playerId,
    ),
    false,
  );
});

test("Lobby Host explicit leave는 즉시 한 번만 제거하고 connected successor와 session cleanup을 commit한다", async () => {
  const harness = await createHarness(2);
  const host = harness.room.players[0];
  assert.ok(host);
  const input = {
    roomId: harness.room.roomId,
    actorPlayerId: host.playerId,
    requestId: parse(RequestIdSchema, "leave-host"),
    expectedRoomRevision: harness.room.roomRevision,
    expectedGameRevision: null,
    authorization: { isCurrent: () => true },
  } as const;
  const first = await harness.leaveService.leave(input);
  const retry = await harness.leaveService.leave(input);
  assert.deepEqual(retry, first);
  assert.equal(first.ok, true);
  const room = await harness.persistence.findById(harness.room.roomId);
  assert.ok(room);
  assert.equal(room.players.length, 1);
  assert.equal(room.hostPlayerId, harness.room.players[1]?.playerId);
  assert.equal(room.roomRevision, harness.room.roomRevision + 1);
  assert.equal(
    await harness.persistence.findByVerificationData(harness.sessionVerifications[0]!),
    null,
  );
});

test("동시 Host/non-Host grace expiry는 순서와 무관하게 lowest connected successor를 남긴다", async () => {
  for (const expiryOrder of [
    [0, 1],
    [1, 0],
  ] as const) {
    const harness = await createHarness(4);
    const hostBinding = harness.bindings[0];
    const otherOfflineBinding = harness.bindings[1];
    const expectedHost = harness.room.players[2];
    assert.ok(hostBinding && otherOfflineBinding && expectedHost);
    const disconnectedAt = harness.clock.now();
    for (const binding of [hostBinding, otherOfflineBinding]) {
      const disconnected = harness.registry.disconnect(
        binding.socketId,
        binding.connectionGeneration,
      );
      assert.equal(disconnected.status, "DISCONNECTED");
    }
    const deadlines = [hostBinding, otherOfflineBinding].map((binding) =>
      harness.policyService.createLobbyGraceDeadline({
        roomId: harness.room.roomId,
        playerId: binding.playerId,
        connectionGeneration: binding.connectionGeneration,
        disconnectedAt,
      }),
    );
    harness.clock.set(deadlines[0]!.deadlineAt);

    const results = await Promise.all(
      expiryOrder.map((index) => harness.graceService.expire(deadlines[index]!)),
    );
    assert.equal(
      results.every((result) => result.status === "REMOVED"),
      true,
    );
    const room = await harness.persistence.findById(harness.room.roomId);
    assert.ok(room);
    assert.deepEqual(
      room.players.map((player) => player.playerId),
      harness.room.players.slice(2).map((player) => player.playerId),
    );
    assert.equal(room.hostPlayerId, expectedHost.playerId);
    assert.equal(
      room.players.filter((player) => player.playerId === room.hostPlayerId)
        .length,
      1,
    );
    assert.equal(room.roomRevision, harness.room.roomRevision + 2);
    assert.equal(
      await harness.persistence.findByVerificationData(
        harness.sessionVerifications[0]!,
      ),
      null,
    );
    assert.equal(
      await harness.persistence.findByVerificationData(
        harness.sessionVerifications[1]!,
      ),
      null,
    );
  }
});

test("Lobby leave 중 successor presence lease 경합은 UNAUTHENTICATED가 아닌 retryable stale state다", async () => {
  const harness = await createHarness(2);
  const host = harness.room.players[0];
  const guestBinding = harness.bindings[1];
  assert.ok(host && guestBinding);
  const before = await harness.persistence.findById(harness.room.roomId);
  assert.ok(before);
  const delegate = new ConnectionRegistryPresenceReader(harness.registry);
  let invalidatePresenceLease = true;
  const racingPresenceReader: RoomPresencePolicyReader = {
    acquireLobbyDisconnectLease: (roomId, playerId) =>
      delegate.acquireLobbyDisconnectLease(roomId, playerId),
    acquireRoomPresenceLease: async (roomId) => {
      const lease = await delegate.acquireRoomPresenceLease(roomId);
      if (invalidatePresenceLease) {
        invalidatePresenceLease = false;
        harness.registry.disconnect(
          guestBinding.socketId,
          guestBinding.connectionGeneration,
        );
      }
      return lease;
    },
  };
  const racingLeaveService = new RoomLeaveService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomCleanupUnitOfWork: harness.persistence,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(),
    presenceReader: racingPresenceReader,
    clock: harness.clock,
    idGenerator: new FakeIdGenerator(),
  });
  const input = {
    roomId: harness.room.roomId,
    actorPlayerId: host.playerId,
    requestId: parse(RequestIdSchema, "leave-presence-race"),
    expectedRoomRevision: harness.room.roomRevision,
    expectedGameRevision: null,
    authorization: { isCurrent: () => true },
  } as const;

  const raced = await racingLeaveService.leave(input);
  assert.equal(raced.ok, false);
  if (raced.ok) return;
  assert.equal(raced.error.code, "STALE_ROOM_REVISION");
  assert.equal(raced.error.recoverable, true);
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    before,
  );
  assert.notEqual(
    await harness.persistence.findByVerificationData(
      harness.sessionVerifications[0]!,
    ),
    null,
  );

  const retry = await harness.leaveService.leave(input);
  assert.equal(retry.ok, true);
});

test("current Player explicit leave는 penalty 없이 forfeit하고 next eligible Turn을 schedule한다", async () => {
  const harness = await createHarness(2);
  const initial = await harness.persistence.findById(harness.room.roomId);
  assert.ok(initial);
  const game = createInitialGameState({
    playerIds: initial.players.map((player) => player.playerId),
    startedAt: harness.clock.now(),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const playing = await harness.persistence.replace({
    candidate: {
      ...initial,
      phase: "PLAYING",
      game,
      roomRevision: parse(RoomRevisionSchema, initial.roomRevision + 1),
    },
    expectedRoomRevision: initial.roomRevision,
    expectedStorageRevision: initial.storageRevision,
  });
  assert.equal(playing.status, "REPLACED");
  if (playing.status !== "REPLACED" || playing.room.game === null) return;
  const activePlayerId = playing.room.game.turn?.activePlayerId;
  assert.ok(activePlayerId);
  const beforeRack = playing.room.game.racks.get(activePlayerId);
  const result = await harness.leaveService.leave({
    roomId: playing.room.roomId,
    actorPlayerId: activePlayerId,
    requestId: parse(RequestIdSchema, "leave-playing-current"),
    expectedRoomRevision: playing.room.roomRevision,
    expectedGameRevision: playing.room.game.gameRevision,
    authorization: { isCurrent: () => true },
  });
  assert.equal(result.ok, true);
  const room = await harness.persistence.findById(playing.room.roomId);
  assert.ok(room?.game?.turn);
  assert.equal(room.game.forfeitedPlayerIds.has(activePlayerId), true);
  assert.deepEqual(room.game.racks.get(activePlayerId), beforeRack);
  assert.notEqual(room.game.turn.activePlayerId, activePlayerId);
  assert.equal(room.game.gameRevision, playing.room.game.gameRevision + 1);
});

test("non-current Playing leave는 current Turn/deadline을 보존하고 새 gameRevision identity로 재등록한다", async () => {
  const harness = await createHarness(3);
  const initial = await harness.persistence.findById(harness.room.roomId);
  assert.ok(initial);
  const game = createInitialGameState({
    playerIds: initial.players.map((player) => player.playerId),
    startedAt: harness.clock.now(),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const started = await harness.persistence.replace({
    candidate: {
      ...initial,
      phase: "PLAYING",
      game,
      roomRevision: parse(RoomRevisionSchema, initial.roomRevision + 1),
    },
    expectedRoomRevision: initial.roomRevision,
    expectedStorageRevision: initial.storageRevision,
  });
  assert.equal(started.status, "REPLACED");
  if (started.status !== "REPLACED" || started.room.game === null) return;
  const nonCurrent = started.room.players.find(
    (player) => player.playerId !== started.room.game?.turn?.activePlayerId,
  );
  assert.ok(nonCurrent && started.room.game.turn);
  const oldTurn = started.room.game.turn;
  const result = await harness.leaveService.leave({
    roomId: started.room.roomId,
    actorPlayerId: nonCurrent.playerId,
    requestId: parse(RequestIdSchema, "leave-playing-non-current"),
    expectedRoomRevision: started.room.roomRevision,
    expectedGameRevision: started.room.game.gameRevision,
    authorization: { isCurrent: () => true },
  });
  assert.equal(result.ok, true);
  const room = await harness.persistence.findById(started.room.roomId);
  assert.ok(room?.game?.turn);
  assert.equal(room.game.turn.turnId, oldTurn.turnId);
  assert.equal(room.game.turn.deadlineAt, oldTurn.deadlineAt);
  assert.equal(room.game.gameRevision, started.room.game.gameRevision + 1);
  assert.equal(room.game.forfeitedPlayerIds.has(nonCurrent.playerId), true);
  assert.equal(harness.turnScheduler.deadlines.at(-1)?.turnId, oldTurn.turnId);
  assert.equal(
    harness.turnScheduler.deadlines.at(-1)?.expectedGameRevision,
    room.game.gameRevision,
  );
});

test("이미 forfeited인 Playing Player leave는 session만 정리하고 gameplay revision을 다시 변경하지 않는다", async () => {
  const harness = await createHarness(3);
  const initial = await harness.persistence.findById(harness.room.roomId);
  assert.ok(initial);
  const game = createInitialGameState({
    playerIds: initial.players.map((player) => player.playerId),
    startedAt: harness.clock.now(),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const forfeitedPlayerId = game.turnOrder.find(
    (candidate) => candidate !== game.turn.activePlayerId,
  );
  assert.ok(forfeitedPlayerId);
  const started = await harness.persistence.replace({
    candidate: {
      ...initial,
      phase: "PLAYING",
      game: {
        ...game,
        forfeitedPlayerIds: new Set([forfeitedPlayerId]),
      },
      roomRevision: parse(RoomRevisionSchema, initial.roomRevision + 1),
    },
    expectedRoomRevision: initial.roomRevision,
    expectedStorageRevision: initial.storageRevision,
  });
  assert.equal(started.status, "REPLACED");
  if (started.status !== "REPLACED" || started.room.game === null) return;
  const before = started.room;
  const beforeGame = started.room.game;
  const playerIndex = before.players.findIndex(
    (player) => player.playerId === forfeitedPlayerId,
  );
  assert.notEqual(playerIndex, -1);

  const result = await harness.leaveService.leave({
    roomId: before.roomId,
    actorPlayerId: forfeitedPlayerId,
    requestId: parse(RequestIdSchema, "leave-already-forfeited"),
    expectedRoomRevision: before.roomRevision,
    expectedGameRevision: beforeGame.gameRevision,
    authorization: { isCurrent: () => true },
  });
  assert.equal(result.ok, true);
  const after = await harness.persistence.findById(before.roomId);
  assert.ok(after?.game?.turn && beforeGame.turn);
  assert.equal(after.roomRevision, before.roomRevision);
  assert.equal(after.game.gameRevision, beforeGame.gameRevision);
  assert.equal(after.game.turn.turnId, beforeGame.turn.turnId);
  assert.deepEqual(after.game.forfeitedPlayerIds, beforeGame.forfeitedPlayerIds);
  assert.equal(after.storageRevision, before.storageRevision + 1);
  assert.equal(
    await harness.persistence.findByVerificationData(
      harness.sessionVerifications[playerIndex]!,
    ),
    null,
  );
});

test("마지막 non-forfeit Playing Player leave는 Phase 16 전까지 structured rejection으로 state를 보존한다", async () => {
  const harness = await createHarness(2);
  const initial = await harness.persistence.findById(harness.room.roomId);
  assert.ok(initial);
  const game = createInitialGameState({
    playerIds: initial.players.map((player) => player.playerId),
    startedAt: harness.clock.now(),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const otherPlayerId = game.turnOrder.find(
    (candidate) => candidate !== game.turn.activePlayerId,
  );
  assert.ok(otherPlayerId);
  const started = await harness.persistence.replace({
    candidate: {
      ...initial,
      phase: "PLAYING",
      game: {
        ...game,
        forfeitedPlayerIds: new Set([otherPlayerId]),
      },
      roomRevision: parse(RoomRevisionSchema, initial.roomRevision + 1),
    },
    expectedRoomRevision: initial.roomRevision,
    expectedStorageRevision: initial.storageRevision,
  });
  assert.equal(started.status, "REPLACED");
  if (started.status !== "REPLACED" || started.room.game === null) return;
  const before = started.room;
  const beforeGame = started.room.game;
  const beforeTurn = beforeGame.turn;
  assert.ok(beforeTurn);

  const result = await harness.leaveService.leave({
    roomId: before.roomId,
    actorPlayerId: beforeTurn.activePlayerId,
    requestId: parse(RequestIdSchema, "leave-zero-survivor"),
    expectedRoomRevision: before.roomRevision,
    expectedGameRevision: beforeGame.gameRevision,
    authorization: { isCurrent: () => true },
  });
  assert.equal(result.ok, false);
  if (result.ok) return;
  assert.equal(result.error.code, "INVALID_PHASE");
  assert.deepEqual(await harness.persistence.findById(before.roomId), before);
});

test("last connected Playing leave 후 onPlayerRemoved는 새 30분 all-offline retention window를 등록한다", async () => {
  const harness = await createHarness(2);
  const initial = await harness.persistence.findById(harness.room.roomId);
  assert.ok(initial);
  const game = createInitialGameState({
    playerIds: initial.players.map((player) => player.playerId),
    startedAt: harness.clock.now(),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const playing = await harness.persistence.replace({
    candidate: {
      ...initial,
      phase: "PLAYING",
      game,
      roomRevision: parse(RoomRevisionSchema, initial.roomRevision + 1),
    },
    expectedRoomRevision: initial.roomRevision,
    expectedStorageRevision: initial.storageRevision,
  });
  assert.equal(playing.status, "REPLACED");
  const first = harness.bindings[0];
  const second = harness.bindings[1];
  assert.ok(first && second);
  harness.registry.disconnect(first.socketId, first.connectionGeneration);
  harness.registry.removePlayer(playing.status === "REPLACED" ? playing.room.roomId : initial.roomId, second.playerId);

  const removedAt = parse(ServerTimeSchema, 5_000);
  await harness.policyService.onPlayerRemoved(initial.roomId, removedAt);
  const deadline = harness.scheduler.scheduled.at(-1);
  assert.equal(deadline?.kind, "PLAYING_ALL_OFFLINE_RETENTION");
  if (deadline?.kind === "PLAYING_ALL_OFFLINE_RETENTION") {
    assert.equal(deadline.allOfflineAt, removedAt);
    assert.equal(deadline.deadlineAt, removedAt + ROOM_RETENTION_MS);
  }
});

test("single-Player Lobby leave는 Room/code/session/idempotency 없이 atomic cleanup한다", async () => {
  const harness = await createHarness(1);
  const host = harness.room.players[0];
  assert.ok(host);
  const result = await harness.leaveService.leave({
    roomId: harness.room.roomId,
    actorPlayerId: host.playerId,
    requestId: parse(RequestIdSchema, "leave-last-lobby-player"),
    expectedRoomRevision: harness.room.roomRevision,
    expectedGameRevision: null,
    authorization: { isCurrent: () => true },
  });
  assert.equal(result.ok, true);
  assert.equal(result.ok && result.data.roomClosed, true);
  assert.equal(await harness.persistence.findById(harness.room.roomId), null);
  assert.equal(await harness.persistence.findByCode(harness.room.roomCode), null);
  assert.equal(
    await harness.persistence.findByVerificationData(harness.sessionVerifications[0]!),
    null,
  );
  assert.equal(harness.registry.listActiveBindings(harness.room.roomId).length, 0);
  assert.deepEqual(harness.scheduler.cancelledRooms, [harness.room.roomId]);
  assert.deepEqual(harness.turnScheduler.cancelledRooms, [harness.room.roomId]);
});

test("resume은 PLAYING offline timeout streak만 storage-only reset하고 public revisions/Turn을 보존한다", async () => {
  const harness = await createHarness(2);
  const initial = await harness.persistence.findById(harness.room.roomId);
  assert.ok(initial);
  const baseGame = createInitialGameState({
    playerIds: initial.players.map((player) => player.playerId),
    startedAt: harness.clock.now(),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const resumedPlayerId = initial.players[0]!.playerId;
  const streaks = new Map(baseGame.offlineTimeoutStreakByPlayerId);
  streaks.set(resumedPlayerId, 1);
  const started = await harness.persistence.replace({
    candidate: {
      ...initial,
      phase: "PLAYING",
      game: { ...baseGame, offlineTimeoutStreakByPlayerId: streaks },
      roomRevision: parse(RoomRevisionSchema, initial.roomRevision + 1),
    },
    expectedRoomRevision: initial.roomRevision,
    expectedStorageRevision: initial.storageRevision,
  });
  assert.equal(started.status, "REPLACED");
  if (started.status !== "REPLACED" || started.room.game === null) return;
  const before = started.room;
  const beforeGame = started.room.game;

  await harness.policyService.onResume(before.roomId, resumedPlayerId);
  const after = await harness.persistence.findById(before.roomId);
  assert.ok(after?.game?.turn && beforeGame.turn);
  assert.equal(after.game.offlineTimeoutStreakByPlayerId.get(resumedPlayerId), 0);
  assert.equal(after.game.gameRevision, beforeGame.gameRevision);
  assert.equal(after.roomRevision, before.roomRevision);
  assert.equal(after.game.turn.turnId, beforeGame.turn.turnId);
  assert.equal(after.storageRevision, before.storageRevision + 1);
});

test("PLAYING all-offline retention은 exact 30분에 Room을 cleanup하고 resume은 window를 cancel한다", async () => {
  const harness = await createHarness(2);
  const initial = await harness.persistence.findById(harness.room.roomId);
  assert.ok(initial);
  const game = createInitialGameState({
    playerIds: initial.players.map((player) => player.playerId),
    startedAt: harness.clock.now(),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const started = await harness.persistence.replace({
    candidate: {
      ...initial,
      phase: "PLAYING",
      game,
      roomRevision: parse(RoomRevisionSchema, initial.roomRevision + 1),
    },
    expectedRoomRevision: initial.roomRevision,
    expectedStorageRevision: initial.storageRevision,
  });
  assert.equal(started.status, "REPLACED");
  if (started.status !== "REPLACED") return;

  for (const binding of harness.bindings) {
    const disconnected = harness.registry.disconnect(
      binding.socketId,
      binding.connectionGeneration,
    );
    assert.equal(disconnected.status, "DISCONNECTED");
    if (disconnected.status !== "DISCONNECTED") return;
    await harness.policyService.onCurrentDisconnect({
      roomId: started.room.roomId,
      playerId: binding.playerId,
      connectionGeneration: binding.connectionGeneration,
      presenceVersion: disconnected.presenceVersion,
      disconnectedAt: harness.clock.now(),
    });
  }
  const deadline = [...harness.scheduler.scheduled].reverse().find(
    (candidate) => candidate.kind === "PLAYING_ALL_OFFLINE_RETENTION",
  );
  assert.equal(deadline?.kind, "PLAYING_ALL_OFFLINE_RETENTION");
  if (deadline?.kind !== "PLAYING_ALL_OFFLINE_RETENTION") return;
  harness.clock.set(deadline.deadlineAt - 1);
  await harness.policyService.onDeadline(deadline);
  assert.ok(await harness.persistence.findById(started.room.roomId));
  harness.clock.set(deadline.deadlineAt);
  await harness.policyService.onDeadline(deadline);
  assert.equal(await harness.persistence.findById(started.room.roomId), null);
  assert.equal(await harness.persistence.findByCode(started.room.roomCode), null);
});

test("지연된 첫 PLAYING disconnect callback은 마지막 disconnect의 30분 window를 앞당기지 않는다", async () => {
  const harness = await createHarness(2);
  const initial = await harness.persistence.findById(harness.room.roomId);
  assert.ok(initial);
  const game = createInitialGameState({
    playerIds: initial.players.map((player) => player.playerId),
    startedAt: harness.clock.now(),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const started = await harness.persistence.replace({
    candidate: {
      ...initial,
      phase: "PLAYING",
      game,
      roomRevision: parse(RoomRevisionSchema, initial.roomRevision + 1),
    },
    expectedRoomRevision: initial.roomRevision,
    expectedStorageRevision: initial.storageRevision,
  });
  assert.equal(started.status, "REPLACED");
  if (started.status !== "REPLACED") return;
  const [firstBinding, lastBinding] = harness.bindings;
  assert.ok(firstBinding && lastBinding);

  harness.clock.set(parse(ServerTimeSchema, 10_000));
  const firstDisconnectedAt = harness.clock.now();
  const firstDisconnect = harness.registry.disconnect(
    firstBinding.socketId,
    firstBinding.connectionGeneration,
  );
  assert.equal(firstDisconnect.status, "DISCONNECTED");
  if (firstDisconnect.status !== "DISCONNECTED") return;

  harness.clock.set(parse(ServerTimeSchema, 30_000));
  const lastDisconnectedAt = harness.clock.now();
  const lastDisconnect = harness.registry.disconnect(
    lastBinding.socketId,
    lastBinding.connectionGeneration,
  );
  assert.equal(lastDisconnect.status, "DISCONNECTED");
  if (lastDisconnect.status !== "DISCONNECTED") return;

  await harness.policyService.onCurrentDisconnect({
    roomId: started.room.roomId,
    playerId: firstBinding.playerId,
    connectionGeneration: firstBinding.connectionGeneration,
    presenceVersion: firstDisconnect.presenceVersion,
    disconnectedAt: firstDisconnectedAt,
  });
  assert.equal(
    harness.scheduler.scheduled.some(
      (deadline) => deadline.kind === "PLAYING_ALL_OFFLINE_RETENTION",
    ),
    false,
  );

  await harness.policyService.onCurrentDisconnect({
    roomId: started.room.roomId,
    playerId: lastBinding.playerId,
    connectionGeneration: lastBinding.connectionGeneration,
    presenceVersion: lastDisconnect.presenceVersion,
    disconnectedAt: lastDisconnectedAt,
  });
  const deadline = harness.scheduler.scheduled.at(-1);
  assert.equal(deadline?.kind, "PLAYING_ALL_OFFLINE_RETENTION");
  if (deadline?.kind === "PLAYING_ALL_OFFLINE_RETENTION") {
    assert.equal(deadline.presenceVersion, lastDisconnect.presenceVersion);
    assert.equal(deadline.allOfflineAt, lastDisconnectedAt);
    assert.equal(deadline.deadlineAt, lastDisconnectedAt + ROOM_RETENTION_MS);
  }
});

test("PLAYING resume은 all-offline window를 취소하고 다시 전원 OFFLINE일 때 새 30분 window를 시작한다", async () => {
  const harness = await createHarness(2);
  const initial = await harness.persistence.findById(harness.room.roomId);
  assert.ok(initial);
  const game = createInitialGameState({
    playerIds: initial.players.map((player) => player.playerId),
    startedAt: harness.clock.now(),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const started = await harness.persistence.replace({
    candidate: {
      ...initial,
      phase: "PLAYING",
      game,
      roomRevision: parse(RoomRevisionSchema, initial.roomRevision + 1),
    },
    expectedRoomRevision: initial.roomRevision,
    expectedStorageRevision: initial.storageRevision,
  });
  assert.equal(started.status, "REPLACED");
  if (started.status !== "REPLACED") return;

  for (const binding of harness.bindings) {
    const disconnected = harness.registry.disconnect(
      binding.socketId,
      binding.connectionGeneration,
    );
    assert.equal(disconnected.status, "DISCONNECTED");
    if (disconnected.status !== "DISCONNECTED") return;
    await harness.policyService.onCurrentDisconnect({
      roomId: started.room.roomId,
      playerId: binding.playerId,
      connectionGeneration: binding.connectionGeneration,
      presenceVersion: disconnected.presenceVersion,
      disconnectedAt: harness.clock.now(),
    });
  }
  const firstWindow = [...harness.scheduler.scheduled].reverse().find(
    (candidate) => candidate.kind === "PLAYING_ALL_OFFLINE_RETENTION",
  );
  assert.equal(firstWindow?.kind, "PLAYING_ALL_OFFLINE_RETENTION");

  harness.clock.set(parse(ServerTimeSchema, 601_000));
  const resumed = harness.registry.bindPrimary({
    socketId: createSocketId("playing-retention-resume"),
    roomId: started.room.roomId,
    playerId: harness.bindings[0]!.playerId,
  }).binding;
  await harness.policyService.onResume(started.room.roomId, resumed.playerId);
  assert.ok(harness.scheduler.cancelledPlaying.includes(started.room.roomId));

  harness.clock.set(parse(ServerTimeSchema, 701_000));
  const disconnectedAgain = harness.registry.disconnect(
    resumed.socketId,
    resumed.connectionGeneration,
  );
  assert.equal(disconnectedAgain.status, "DISCONNECTED");
  if (disconnectedAgain.status !== "DISCONNECTED") return;
  await harness.policyService.onCurrentDisconnect({
    roomId: started.room.roomId,
    playerId: resumed.playerId,
    connectionGeneration: resumed.connectionGeneration,
    presenceVersion: disconnectedAgain.presenceVersion,
    disconnectedAt: harness.clock.now(),
  });
  const secondWindow = harness.scheduler.scheduled.at(-1);
  assert.equal(secondWindow?.kind, "PLAYING_ALL_OFFLINE_RETENTION");
  if (secondWindow?.kind === "PLAYING_ALL_OFFLINE_RETENTION") {
    assert.equal(secondWindow.allOfflineAt, harness.clock.now());
    assert.equal(secondWindow.deadlineAt, harness.clock.now() + ROOM_RETENTION_MS);
    assert.notEqual(secondWindow.deadlineAt, firstWindow?.deadlineAt);
  }
});

test("FINISHED retention은 connected resume에도 finishedAt 기준 deadline을 연장하지 않는다", async () => {
  const harness = await createHarness(2);
  const initial = await harness.persistence.findById(harness.room.roomId);
  assert.ok(initial);
  const playingGame = createInitialGameState({
    playerIds: initial.players.map((player) => player.playerId),
    startedAt: harness.clock.now(),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const winner = initial.players[0]!.playerId;
  const finishedAt = parse(ServerTimeSchema, 9_000);
  const finishedRacks = new Map(playingGame.racks);
  finishedRacks.set(winner, Object.freeze([]));
  const penaltyByPlayerId = new Map<PlayerId, number>();
  for (const playerId of playingGame.turnOrder) {
    const penalty = (finishedRacks.get(playerId) ?? []).reduce(
      (sum, tileId) =>
        sum + (playingGame.tilesById.get(tileId)?.kind === "JOKER" ? 30 : 1),
      0,
    );
    penaltyByPlayerId.set(playerId, penalty);
  }
  const winnerScore = [...penaltyByPlayerId]
    .filter(([playerId]) => playerId !== winner)
    .reduce((sum, [, penalty]) => sum + penalty, 0);
  const finished = await harness.persistence.replace({
    candidate: {
      ...initial,
      phase: "FINISHED",
      game: {
        ...playingGame,
        racks: finishedRacks,
        turn: null,
        result: {
          reason: "RACK_EMPTY",
          winnerPlayerId: winner,
          scores: playingGame.turnOrder.map((playerId) => ({
            playerId,
            score:
              playerId === winner
                ? winnerScore
                : -(penaltyByPlayerId.get(playerId) ?? 0),
            remainingRackTileCount:
              finishedRacks.get(playerId)?.length ?? 0,
          })),
          finishedAt,
        },
      },
      roomRevision: parse(RoomRevisionSchema, initial.roomRevision + 1),
    },
    expectedRoomRevision: initial.roomRevision,
    expectedStorageRevision: initial.storageRevision,
  });
  assert.equal(finished.status, "REPLACED");
  if (finished.status !== "REPLACED") return;

  assert.equal(await harness.policyService.scheduleFinishedRetention(finished.room.roomId), true);
  harness.clock.set(parse(ServerTimeSchema, 50_000));
  await harness.policyService.onResume(finished.room.roomId, winner);
  const deadlines = harness.scheduler.scheduled.filter(
    (candidate) => candidate.kind === "FINISHED_ROOM_RETENTION",
  );
  assert.equal(deadlines.length, 2);
  assert.equal(deadlines[0]?.deadlineAt, finishedAt + ROOM_RETENTION_MS);
  assert.equal(deadlines[1]?.deadlineAt, deadlines[0]?.deadlineAt);
  const fixedDeadline = deadlines[1];
  assert.ok(fixedDeadline);
  harness.clock.set(parse(ServerTimeSchema, fixedDeadline.deadlineAt - 1));
  await harness.policyService.onDeadline(fixedDeadline);
  assert.ok(await harness.persistence.findById(finished.room.roomId));

  harness.clock.set(fixedDeadline.deadlineAt);
  await harness.policyService.onDeadline(fixedDeadline);
  assert.equal(await harness.persistence.findById(finished.room.roomId), null);
  assert.equal(await harness.persistence.findByCode(finished.room.roomCode), null);
});

test("stale resume은 concurrent leave가 새로 등록한 PLAYING all-offline retention을 취소하지 않는다", async () => {
  const harness = await createHarness(2);
  const initial = await harness.persistence.findById(harness.room.roomId);
  assert.ok(initial);
  const game = createInitialGameState({
    playerIds: initial.players.map((player) => player.playerId),
    startedAt: harness.clock.now(),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const started = await harness.persistence.replace({
    candidate: {
      ...initial,
      phase: "PLAYING",
      game,
      roomRevision: parse(RoomRevisionSchema, initial.roomRevision + 1),
    },
    expectedRoomRevision: initial.roomRevision,
    expectedStorageRevision: initial.storageRevision,
  });
  assert.equal(started.status, "REPLACED");
  if (started.status !== "REPLACED") return;
  const resumedBinding = harness.bindings[0];
  const otherBinding = harness.bindings[1];
  assert.ok(resumedBinding && otherBinding);
  harness.registry.disconnect(otherBinding.socketId, otherBinding.connectionGeneration);

  let injectLeave = true;
  const racingRepository: RoomRepository = {
    findById: async (roomId) => {
      if (injectLeave) {
        injectLeave = false;
        harness.registry.removePlayer(roomId, resumedBinding.playerId);
        harness.scheduler.scheduled.push({
          kind: "PLAYING_ALL_OFFLINE_RETENTION",
          roomId,
          gameId: game.gameId,
          presenceVersion: harness.registry.getPresenceVersion(roomId),
          allOfflineAt: harness.clock.now(),
          deadlineAt: parse(
            ServerTimeSchema,
            harness.clock.now() + ROOM_RETENTION_MS,
          ),
        });
      }
      return harness.persistence.findById(roomId);
    },
    findByCode: (roomCode) => harness.persistence.findByCode(roomCode),
    createIfAbsent: (candidate) => harness.persistence.createIfAbsent(candidate),
    replace: (input) => harness.persistence.replace(input),
    delete: (input) => harness.persistence.delete(input),
  };
  const presenceReader = new ConnectionRegistryPresenceReader(harness.registry);
  const policy = new RoomPresencePolicyService({
    roomRepository: racingRepository,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(),
    scheduler: harness.scheduler,
    roomPresenceReader: presenceReader,
    playerPresenceLeaseReader: presenceReader,
    clock: harness.clock,
    lobbyGraceService: harness.graceService,
    retentionService: harness.retentionService,
  });

  await policy.onResume(started.room.roomId, resumedBinding.playerId);
  assert.equal(harness.scheduler.cancelledPlaying.length, 0);
  assert.equal(
    harness.scheduler.scheduled.some(
      (deadline) => deadline.kind === "PLAYING_ALL_OFFLINE_RETENTION",
    ),
    true,
  );
});
