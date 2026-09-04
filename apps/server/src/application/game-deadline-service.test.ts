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
  type RoomId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { createInitialGameState } from "../domain/game/game-state.js";
import { InMemoryPersistence } from "../infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "../infrastructure/keyed-serial-executor.js";
import { OverdueGameDeadlineSweeper } from "../infrastructure/overdue-game-deadline-sweeper.js";
import { FakeClock, FakeIdGenerator } from "../infrastructure/system.js";
import type { RoomWriteCandidate } from "../model/persistence.js";
import type {
  GameDeadlineScheduler,
  RandomSource,
  ScheduledGameDeadline,
} from "../ports/system.js";
import { GameDeadlineService } from "./game-deadline-service.js";
import { scheduleGameDeadlineBestEffort } from "./game-deadline-transition.js";

const PLAYER_A = parse(PlayerIdSchema, "deadline-player-a");
const PLAYER_B = parse(PlayerIdSchema, "deadline-player-b");

class ZeroRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      throw new RangeError("A positive range is required.");
    }
    return 0;
  }
}

class RecordingGameDeadlineScheduler implements GameDeadlineScheduler {
  readonly deadlines: ScheduledGameDeadline[] = [];
  failuresRemaining = 0;

  async scheduleDeadline(deadline: ScheduledGameDeadline): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("injected Game deadline schedule failure");
    }
    this.deadlines.push(Object.freeze({ ...deadline }));
  }

  async cancelDeadline(): Promise<void> {
    return;
  }
}

type Harness = Readonly<{
  persistence: InMemoryPersistence;
  clock: FakeClock;
  scheduler: RecordingGameDeadlineScheduler;
  service: GameDeadlineService;
  deadline: ScheduledGameDeadline;
  roomId: RoomId;
}>;

async function createHarness(): Promise<Harness> {
  const startedAt = parse(ServerTimeSchema, 1_000);
  const game = createInitialGameState({
    playerIds: [PLAYER_A, PLAYER_B],
    startedAt,
    idGenerator: new FakeIdGenerator(),
    randomSource: new ZeroRandomSource(),
  });
  const roomId = parse(RoomIdSchema, "room-game-deadline");
  const candidate: RoomWriteCandidate = Object.freeze({
    roomId,
    roomCode: parse(RoomCodeSchema, "ABCDEF"),
    gameType: "HANGUL_TILE",
    phase: "PLAYING",
    hostPlayerId: PLAYER_A,
    players: Object.freeze([
      Object.freeze({
        playerId: PLAYER_A,
        nickname: parse(NicknameSchema, "PlayerA"),
        joinOrder: 0,
      }),
      Object.freeze({
        playerId: PLAYER_B,
        nickname: parse(NicknameSchema, "PlayerB"),
        joinOrder: 1,
      }),
    ]),
    game,
    roomRevision: parse(RoomRevisionSchema, 7),
    createdAt: startedAt,
    updatedAt: startedAt,
  });
  const persistence = new InMemoryPersistence();
  const created = await persistence.createIfAbsent(candidate);
  assert.equal(created.status, "CREATED");
  const clock = new FakeClock(game.gameDeadlineAt);
  const scheduler = new RecordingGameDeadlineScheduler();
  const service = new GameDeadlineService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(),
    clock,
    gameDeadlineScheduler: scheduler,
  });
  return Object.freeze({
    persistence,
    clock,
    scheduler,
    service,
    roomId,
    deadline: Object.freeze({
      roomId,
      gameId: game.gameId,
      deadlineAt: game.gameDeadlineAt,
    }),
  });
}

test("Game deadline is not authority before its exact canonical timestamp", async () => {
  const harness = await createHarness();
  harness.clock.set(harness.deadline.deadlineAt - 1);
  const before = await harness.persistence.findById(harness.roomId);

  const result = await harness.service.expire(harness.deadline);

  assert.deepEqual(result, { status: "NO_OP", reason: "NOT_DUE" });
  assert.deepEqual(await harness.persistence.findById(harness.roomId), before);
  assert.deepEqual(harness.scheduler.deadlines, [harness.deadline]);
});

for (const offset of [0, 1] as const) {
  test(`Game deadline finishes with TIME_LIMIT at deadline + ${offset}ms`, async () => {
    const harness = await createHarness();
    harness.clock.set(harness.deadline.deadlineAt + offset);
    const before = await harness.persistence.findById(harness.roomId);
    assert.ok(before?.game?.turn);
    const applied = new Array<string>();
    harness.service.subscribeApplied((data) => {
      applied.push(data.reason);
    });

    const result = await harness.service.expire(harness.deadline);

    assert.equal(result.status, "APPLIED");
    const after = await harness.persistence.findById(harness.roomId);
    assert.equal(after?.phase, "FINISHED");
    assert.equal(after?.roomRevision, (before?.roomRevision ?? 0) + 1);
    assert.equal(after?.storageRevision, (before?.storageRevision ?? 0) + 1);
    assert.equal(
      after?.game?.gameRevision,
      (before?.game?.gameRevision ?? 0) + 1,
    );
    assert.equal(after?.game?.turn, null);
    assert.equal(after?.game?.result?.reason, "TIME_LIMIT");
    assert.equal(after?.game?.result?.finishedAt, harness.clock.now());
    assert.deepEqual(after?.game?.board, before?.game?.board);
    assert.deepEqual(after?.game?.racks, before?.game?.racks);
    assert.deepEqual(applied, ["TIME_LIMIT"]);

    const replay = await harness.service.expire(harness.deadline);
    assert.deepEqual(replay, { status: "NO_OP", reason: "NOT_PLAYING" });
    assert.deepEqual(await harness.persistence.findById(harness.roomId), after);
    assert.deepEqual(applied, ["TIME_LIMIT"]);
  });
}

test("Game deadline rejects stale Game and deadline identities", async () => {
  const harness = await createHarness();
  const staleGame = await harness.service.expire({
    ...harness.deadline,
    gameId: parse(GameIdSchema, "stale-game"),
  });
  assert.deepEqual(staleGame, { status: "NO_OP", reason: "STALE_GAME" });

  const staleDeadline = await harness.service.expire({
    ...harness.deadline,
    deadlineAt: parse(ServerTimeSchema, harness.deadline.deadlineAt + 1),
  });
  assert.deepEqual(staleDeadline, {
    status: "NO_OP",
    reason: "STALE_DEADLINE",
  });
});

test("In-memory recovery reader exposes only current PLAYING Game deadlines", async () => {
  const harness = await createHarness();
  assert.deepEqual(
    await harness.persistence.listActiveGameDeadlines(),
    [harness.deadline],
  );
  await harness.service.expire(harness.deadline);
  assert.deepEqual(await harness.persistence.listActiveGameDeadlines(), []);
});

test("best-effort registration retries and reports without changing canonical Game", async () => {
  const harness = await createHarness();
  const before = await harness.persistence.findById(harness.roomId);
  harness.scheduler.failuresRemaining = 2;
  const failures: string[] = [];

  const scheduled = await scheduleGameDeadlineBestEffort(
    harness.persistence,
    harness.scheduler,
    {
      roomId: harness.deadline.roomId,
      gameId: harness.deadline.gameId,
    },
    (failure) => failures.push(failure.reason),
  );

  assert.equal(scheduled, false);
  assert.deepEqual(failures, ["READ_OR_SCHEDULE_FAILED"]);
  assert.deepEqual(await harness.persistence.findById(harness.roomId), before);
});

test("overdue sweeper recovers an unscheduled Game deadline exactly once", async () => {
  const harness = await createHarness();
  const before = await harness.persistence.findById(harness.roomId);
  let appliedCount = 0;
  harness.service.subscribeApplied(() => {
    appliedCount += 1;
  });
  const sweeper = new OverdueGameDeadlineSweeper({
    activeGameReader: harness.persistence,
    clock: harness.clock,
    enqueueDeadline: async (deadline) => {
      await harness.service.expire(deadline);
    },
  });
  sweeper.start();

  assert.equal(await sweeper.sweepOnce(), 1);
  assert.equal(await sweeper.sweepOnce(), 0);
  sweeper.stop();

  const after = await harness.persistence.findById(harness.roomId);
  assert.equal(after?.phase, "FINISHED");
  assert.equal(after?.game?.result?.reason, "TIME_LIMIT");
  assert.equal(
    after?.game?.gameRevision,
    (before?.game?.gameRevision ?? 0) + 1,
  );
  assert.equal(after?.roomRevision, (before?.roomRevision ?? 0) + 1);
  assert.equal(after?.storageRevision, (before?.storageRevision ?? 0) + 1);
  assert.equal(appliedCount, 1);
});
