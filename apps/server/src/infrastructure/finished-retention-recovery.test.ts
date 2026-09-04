import assert from "node:assert/strict";
import test from "node:test";

import {
  GameIdSchema,
  NicknameSchema,
  PlayerIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  FINISHED_RETENTION_SCHEDULING_MAX_ATTEMPTS,
  scheduleFinishedRetentionBestEffort,
} from "../application/game-finish-transition.js";
import { RoomCleanupService } from "../application/room-cleanup-service.js";
import { ROOM_RETENTION_MS } from "../application/room-presence-policy-service.js";
import { RoomRetentionService } from "../application/room-retention-service.js";
import { createInitialGameState } from "../domain/game/game-state.js";
import { createTimeLimitResult } from "../domain/game/result-engine.js";
import type { FinishedRoomRetentionReader } from "../ports/finished-room-retention-reader.js";
import type {
  RoomPolicyDeadline,
  RoomPolicyScheduler,
} from "../ports/room-policy-scheduler.js";
import type { RandomSource } from "../ports/system.js";
import { ConnectionRegistry } from "./connection-registry.js";
import { ConnectionRegistryPresenceReader } from "./connection-registry-presence-reader.js";
import { InMemoryPersistence } from "./in-memory-persistence.js";
import { KeyedSerialExecutor } from "./keyed-serial-executor.js";
import {
  OVERDUE_FINISHED_RETENTION_SWEEP_INTERVAL_MS,
  OverdueFinishedRetentionSweeper,
} from "./overdue-finished-retention-sweeper.js";
import type { RepeatingTimerDriver } from "./overdue-turn-sweeper.js";
import { FakeClock, FakeIdGenerator } from "./system.js";

const FINISHED_AT = parse(ServerTimeSchema, 10_000);

class ZeroRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      throw new RangeError("A positive range is required.");
    }
    return 0;
  }
}

class ManualRepeatingTimer implements RepeatingTimerDriver {
  intervalMs: number | null = null;
  callback: (() => void) | null = null;
  cleared = false;

  set(intervalMs: number, callback: () => void): unknown {
    this.intervalMs = intervalMs;
    this.callback = callback;
    this.cleared = false;
    return this;
  }

  clear(): void {
    this.cleared = true;
    this.callback = null;
  }
}

class AlwaysFailingPolicyScheduler implements RoomPolicyScheduler {
  attempts = 0;

  async schedule(_deadline: RoomPolicyDeadline): Promise<void> {
    this.attempts += 1;
    throw new Error("injected primary retention registration failure");
  }

  async cancelLobbyGrace(): Promise<void> {}
  async cancelPlayingAllOffline(): Promise<void> {}
  async cancelRoom(): Promise<void> {}
}

async function createFinishedFixture() {
  const persistence = new InMemoryPersistence();
  const playerIds = [
    parse(PlayerIdSchema, "recovery-player-a"),
    parse(PlayerIdSchema, "recovery-player-b"),
  ] as const;
  const playingGame = createInitialGameState({
    playerIds,
    startedAt: parse(ServerTimeSchema, 1_000),
    idGenerator: new FakeIdGenerator(),
    randomSource: new ZeroRandomSource(),
  });
  const result = createTimeLimitResult({
    playerIds: playingGame.turnOrder,
    racks: playingGame.racks,
    tilesById: playingGame.tilesById,
    forfeitedPlayerIds: playingGame.forfeitedPlayerIds,
    finishedAt: FINISHED_AT,
  });
  const roomId = parse(RoomIdSchema, "room-finished-recovery");
  const roomCode = parse(RoomCodeSchema, "REC234");
  const created = await persistence.createIfAbsent({
    roomId,
    roomCode,
    gameType: "HANGUL_TILE",
    phase: "FINISHED",
    hostPlayerId: playerIds[0],
    players: playerIds.map((playerId, joinOrder) => ({
      playerId,
      nickname: parse(NicknameSchema, `Recover${joinOrder}`),
      joinOrder,
    })),
    game: Object.freeze({ ...playingGame, turn: null, result }),
    roomRevision: parse(RoomRevisionSchema, 1),
    createdAt: parse(ServerTimeSchema, 1_000),
    updatedAt: FINISHED_AT,
  });
  assert.equal(created.status, "CREATED");
  return {
    gameId: playingGame.gameId,
    persistence,
    roomCode,
    roomId,
  };
}

test("FINISHED retention reader returns detached canonical identities only", async () => {
  const fixture = await createFinishedFixture();
  const deadlines = await fixture.persistence.listFinishedRoomRetentions();

  assert.deepEqual(deadlines, [
    {
      roomId: fixture.roomId,
      gameId: fixture.gameId,
      finishedAt: FINISHED_AT,
    },
  ]);
  assert.ok(Object.isFrozen(deadlines));
  assert.ok(Object.isFrozen(deadlines[0]));
});

test("overdue FINISHED retention sweeper uses finishedAt, shared cadence, and lifecycle guards", async () => {
  const identity = Object.freeze({
    roomId: parse(RoomIdSchema, "room-sweeper"),
    gameId: parse(GameIdSchema, "game-sweeper"),
    finishedAt: FINISHED_AT,
  });
  const reader: FinishedRoomRetentionReader = {
    listFinishedRoomRetentions: async () => Object.freeze([identity]),
  };
  const clock = new FakeClock(FINISHED_AT + ROOM_RETENTION_MS - 1);
  const timer = new ManualRepeatingTimer();
  const applied: RoomPolicyDeadline[] = [];
  const sweeper = new OverdueFinishedRetentionSweeper({
    finishedRoomRetentionReader: reader,
    clock,
    retentionMs: ROOM_RETENTION_MS,
    timerDriver: timer,
    enqueueRetention: async (deadline) => {
      applied.push(deadline);
    },
  });

  sweeper.start();
  assert.equal(timer.intervalMs, OVERDUE_FINISHED_RETENTION_SWEEP_INTERVAL_MS);
  assert.equal(await sweeper.sweepOnce(), 0);
  clock.advance(1);
  assert.equal(await sweeper.sweepOnce(), 1);
  assert.deepEqual(applied, [
    {
      kind: "FINISHED_ROOM_RETENTION",
      ...identity,
      deadlineAt: FINISHED_AT + ROOM_RETENTION_MS,
    },
  ]);

  sweeper.stop();
  assert.equal(timer.cleared, true);
  assert.equal(await sweeper.sweepOnce(), 0);
});

test("stopping the FINISHED retention sweeper during a read prevents late cleanup enqueue", async () => {
  let resolveRead:
    | ((
        identities: Awaited<
          ReturnType<FinishedRoomRetentionReader["listFinishedRoomRetentions"]>
        >,
      ) => void)
    | undefined;
  const reader: FinishedRoomRetentionReader = {
    listFinishedRoomRetentions: () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  };
  let enqueueCount = 0;
  const sweeper = new OverdueFinishedRetentionSweeper({
    finishedRoomRetentionReader: reader,
    clock: new FakeClock(FINISHED_AT + ROOM_RETENTION_MS),
    retentionMs: ROOM_RETENTION_MS,
    timerDriver: new ManualRepeatingTimer(),
    enqueueRetention: () => {
      enqueueCount += 1;
    },
  });
  sweeper.start();
  const inFlight = sweeper.sweepOnce();
  sweeper.stop();

  assert.ok(resolveRead);
  resolveRead([
    Object.freeze({
      roomId: parse(RoomIdSchema, "room-late-read"),
      gameId: parse(GameIdSchema, "game-late-read"),
      finishedAt: FINISHED_AT,
    }),
  ]);
  assert.equal(await inFlight, 0);
  assert.equal(enqueueCount, 0);
});

test("primary registration exhaustion is recovered from canonical finishedAt and cleans exactly once", async () => {
  const fixture = await createFinishedFixture();
  const failingScheduler = new AlwaysFailingPolicyScheduler();
  assert.equal(
    await scheduleFinishedRetentionBestEffort(
      fixture.persistence,
      failingScheduler,
      { roomId: fixture.roomId, gameId: fixture.gameId },
    ),
    false,
  );
  assert.equal(
    failingScheduler.attempts,
    FINISHED_RETENTION_SCHEDULING_MAX_ATTEMPTS,
  );
  assert.ok(await fixture.persistence.findById(fixture.roomId));

  let resourceCleanupCount = 0;
  const cleanupService = new RoomCleanupService({
    roomRepository: fixture.persistence,
    roomUnitOfWork: fixture.persistence,
    roomMutationExecutor: new KeyedSerialExecutor(),
    resources: {
      cleanupRoom: () => {
        resourceCleanupCount += 1;
      },
    },
  });
  const clock = new FakeClock(FINISHED_AT + ROOM_RETENTION_MS);
  const retentionService = new RoomRetentionService({
    cleanupService,
    roomRepository: fixture.persistence,
    presenceReader: new ConnectionRegistryPresenceReader(
      new ConnectionRegistry(),
    ),
    clock,
  });
  const sweeper = new OverdueFinishedRetentionSweeper({
    finishedRoomRetentionReader: fixture.persistence,
    clock,
    retentionMs: ROOM_RETENTION_MS,
    timerDriver: new ManualRepeatingTimer(),
    enqueueRetention: async (deadline) => {
      const result = await retentionService.expire(deadline);
      if (result.status === "FAILED") {
        throw new Error("retention cleanup failed");
      }
    },
  });
  sweeper.start();

  assert.equal(await sweeper.sweepOnce(), 1);
  assert.equal(await fixture.persistence.findById(fixture.roomId), null);
  assert.equal(await fixture.persistence.findByCode(fixture.roomCode), null);
  assert.equal(resourceCleanupCount, 1);

  assert.equal(await sweeper.sweepOnce(), 0);
  assert.equal(resourceCleanupCount, 1);
  sweeper.stop();
});
