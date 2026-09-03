import assert from "node:assert/strict";
import test from "node:test";

import {
  GameIdSchema,
  PlayerIdSchema,
  PresenceVersionSchema,
  RoomIdSchema,
  ServerTimeSchema,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import type { LobbyDisconnectGraceDeadline } from "../ports/room-policy-scheduler.js";
import {
  InProcessRoomPolicyScheduler,
  ROOM_POLICY_CALLBACK_MAX_ATTEMPTS,
  ROOM_POLICY_CALLBACK_RETRY_DELAY_MS,
  type RoomPolicyTimerDriver,
} from "./in-process-room-policy-scheduler.js";
import { FakeClock } from "./system.js";

class ManualTimerDriver implements RoomPolicyTimerDriver {
  readonly pending = new Map<object, () => void>();
  readonly delays: number[] = [];

  set(delayMs: number, callback: () => void): object {
    const handle = {};
    this.delays.push(delayMs);
    this.pending.set(handle, callback);
    return handle;
  }

  clear(handle: unknown): void {
    this.pending.delete(handle as object);
  }

  fireAll(): void {
    const callbacks = [...this.pending.entries()];
    for (const [handle, callback] of callbacks) {
      this.pending.delete(handle);
      callback();
    }
  }

  fireNext(): void {
    const next = this.pending.entries().next();
    if (next.done) {
      throw new Error("No pending policy timer is available.");
    }
    const [handle, callback] = next.value;
    this.pending.delete(handle);
    callback();
  }
}

async function flushPolicyCallback(): Promise<void> {
  await new Promise<void>((resolve) => setImmediate(resolve));
}

function grace(generation = 1): LobbyDisconnectGraceDeadline {
  return {
    kind: "LOBBY_DISCONNECT_GRACE",
    roomId: parse(RoomIdSchema, "room-policy"),
    playerId: parse(PlayerIdSchema, "player-policy"),
    connectionGeneration: generation,
    disconnectedAt: parse(ServerTimeSchema, 1_000),
    deadlineAt: parse(ServerTimeSchema, 61_000),
  };
}

test("Room policy scheduler는 identity dedupe, generation replacement와 cancel을 지원한다", async () => {
  const driver = new ManualTimerDriver();
  const callbacks: LobbyDisconnectGraceDeadline[] = [];
  const clock = new FakeClock(1_000);
  const scheduler = new InProcessRoomPolicyScheduler({
    clock,
    timerDriver: driver,
    onDeadline: (deadline) => {
      if (deadline.kind === "LOBBY_DISCONNECT_GRACE") callbacks.push(deadline);
    },
  });
  scheduler.start();

  await scheduler.schedule(grace());
  await scheduler.schedule(grace());
  assert.equal(scheduler.scheduledCount, 1);
  assert.deepEqual(driver.delays, [60_000]);

  await scheduler.schedule(grace(2));
  assert.equal(scheduler.scheduledCount, 1);
  assert.equal(driver.pending.size, 1);
  clock.set(grace(2).deadlineAt);
  driver.fireAll();
  await Promise.resolve();
  assert.equal(callbacks.length, 1);
  assert.equal(callbacks[0]?.connectionGeneration, 2);

  await scheduler.schedule(grace(4));
  await scheduler.schedule(grace(3));
  assert.equal(scheduler.scheduledCount, 1);
  driver.fireAll();
  await flushPolicyCallback();
  assert.equal(callbacks.at(-1)?.connectionGeneration, 4);

  await scheduler.schedule(grace(5));
  await scheduler.cancelLobbyGrace(grace().roomId, grace().playerId);
  assert.equal(scheduler.scheduledCount, 0);
});

test("Room policy scheduler는 Room 단위 cancel과 shutdown으로 모든 retention timer를 정리한다", async () => {
  const driver = new ManualTimerDriver();
  const clock = new FakeClock(10_000);
  const scheduler = new InProcessRoomPolicyScheduler({
    clock,
    timerDriver: driver,
    onDeadline: () => undefined,
  });
  scheduler.start();
  const roomId = parse(RoomIdSchema, "room-retention");
  await scheduler.schedule({
    kind: "PLAYING_ALL_OFFLINE_RETENTION",
    roomId,
    gameId: parse(GameIdSchema, "game-retention"),
    presenceVersion: parse(PresenceVersionSchema, 4),
    allOfflineAt: clock.now(),
    deadlineAt: parse(ServerTimeSchema, clock.now() + 1_800_000),
  });
  await scheduler.schedule({
    kind: "FINISHED_ROOM_RETENTION",
    roomId,
    gameId: parse(GameIdSchema, "game-retention"),
    finishedAt: clock.now(),
    deadlineAt: parse(ServerTimeSchema, clock.now() + 1_800_000),
  });
  assert.equal(scheduler.scheduledCount, 2);
  await scheduler.cancelRoom(roomId);
  assert.equal(scheduler.scheduledCount, 0);

  await scheduler.schedule(grace());
  scheduler.stop();
  assert.equal(scheduler.isRunning, false);
  assert.equal(driver.pending.size, 0);
});

test("resume marker는 이전 policy timer만 취소하고 더 새로운 disconnect timer를 보존한다", async () => {
  const driver = new ManualTimerDriver();
  const clock = new FakeClock(1_000);
  const scheduler = new InProcessRoomPolicyScheduler({
    clock,
    timerDriver: driver,
    onDeadline: () => undefined,
  });
  scheduler.start();

  await scheduler.schedule(grace(1));
  await scheduler.cancelLobbyGrace(grace().roomId, grace().playerId, 2);
  assert.equal(scheduler.scheduledCount, 0);

  await scheduler.schedule(grace(2));
  await scheduler.cancelLobbyGrace(grace().roomId, grace().playerId, 2);
  assert.equal(scheduler.scheduledCount, 1);
  await scheduler.cancelLobbyGrace(grace().roomId, grace().playerId);

  const roomId = parse(RoomIdSchema, "room-generation-safe-retention");
  const gameId = parse(GameIdSchema, "game-generation-safe-retention");
  await scheduler.schedule({
    kind: "PLAYING_ALL_OFFLINE_RETENTION",
    roomId,
    gameId,
    presenceVersion: parse(PresenceVersionSchema, 4),
    allOfflineAt: clock.now(),
    deadlineAt: parse(ServerTimeSchema, clock.now() + 1_800_000),
  });
  await scheduler.cancelPlayingAllOffline(
    roomId,
    parse(PresenceVersionSchema, 5),
  );
  assert.equal(scheduler.scheduledCount, 0);

  await scheduler.schedule({
    kind: "PLAYING_ALL_OFFLINE_RETENTION",
    roomId,
    gameId,
    presenceVersion: parse(PresenceVersionSchema, 5),
    allOfflineAt: clock.now(),
    deadlineAt: parse(ServerTimeSchema, clock.now() + 1_800_000),
  });
  await scheduler.cancelPlayingAllOffline(
    roomId,
    parse(PresenceVersionSchema, 5),
  );
  assert.equal(scheduler.scheduledCount, 1);
});

test("out-of-order Playing disconnect callback은 final all-offline retention을 앞당기지 않는다", async () => {
  const driver = new ManualTimerDriver();
  const clock = new FakeClock(1_000);
  const applied: Array<{
    allOfflineAt: number;
    deadlineAt: number;
  }> = [];
  const scheduler = new InProcessRoomPolicyScheduler({
    clock,
    timerDriver: driver,
    onDeadline: (deadline) => {
      if (deadline.kind === "PLAYING_ALL_OFFLINE_RETENTION") {
        applied.push({
          allOfflineAt: deadline.allOfflineAt,
          deadlineAt: deadline.deadlineAt,
        });
      }
    },
  });
  scheduler.start();
  const roomId = parse(RoomIdSchema, "room-out-of-order-disconnect");
  const gameId = parse(GameIdSchema, "game-out-of-order-disconnect");
  const presenceVersion = parse(PresenceVersionSchema, 7);
  const finalAllOfflineAt = parse(ServerTimeSchema, 3_000);
  const delayedEarlierDisconnectAt = parse(ServerTimeSchema, 1_000);

  await scheduler.schedule({
    kind: "PLAYING_ALL_OFFLINE_RETENTION",
    roomId,
    gameId,
    presenceVersion,
    allOfflineAt: finalAllOfflineAt,
    deadlineAt: parse(ServerTimeSchema, finalAllOfflineAt + 1_800_000),
  });
  await scheduler.schedule({
    kind: "PLAYING_ALL_OFFLINE_RETENTION",
    roomId,
    gameId,
    presenceVersion,
    allOfflineAt: delayedEarlierDisconnectAt,
    deadlineAt: parse(
      ServerTimeSchema,
      delayedEarlierDisconnectAt + 1_800_000,
    ),
  });

  assert.equal(scheduler.scheduledCount, 1);
  clock.set(parse(ServerTimeSchema, finalAllOfflineAt + 1_800_000));
  driver.fireAll();
  await flushPolicyCallback();
  assert.deepEqual(applied, [
    {
      allOfflineAt: finalAllOfflineAt,
      deadlineAt: finalAllOfflineAt + 1_800_000,
    },
  ]);
});

test("policy callback transient failure는 bounded retry하고 마지막 실패만 진단한다", async () => {
  const driver = new ManualTimerDriver();
  const clock = new FakeClock(61_000);
  let successfulCalls = 0;
  const recovered = new InProcessRoomPolicyScheduler({
    clock,
    timerDriver: driver,
    onDeadline: () => {
      successfulCalls += 1;
      if (successfulCalls < ROOM_POLICY_CALLBACK_MAX_ATTEMPTS) {
        throw new Error("transient policy failure");
      }
    },
  });
  recovered.start();
  await recovered.schedule(grace());
  for (let attempt = 1; attempt <= ROOM_POLICY_CALLBACK_MAX_ATTEMPTS; attempt += 1) {
    driver.fireNext();
    await flushPolicyCallback();
  }
  assert.equal(successfulCalls, ROOM_POLICY_CALLBACK_MAX_ATTEMPTS);
  assert.equal(recovered.scheduledCount, 0);
  assert.deepEqual(driver.delays, [
    0,
    ROOM_POLICY_CALLBACK_RETRY_DELAY_MS,
    ROOM_POLICY_CALLBACK_RETRY_DELAY_MS,
  ]);

  const failingDriver = new ManualTimerDriver();
  let failedCalls = 0;
  let diagnostics = 0;
  const exhausted = new InProcessRoomPolicyScheduler({
    clock,
    timerDriver: failingDriver,
    onDeadline: () => {
      failedCalls += 1;
      throw new Error("persistent policy failure");
    },
    onCallbackFailure: () => {
      diagnostics += 1;
    },
  });
  exhausted.start();
  await exhausted.schedule(grace());
  for (let attempt = 1; attempt <= ROOM_POLICY_CALLBACK_MAX_ATTEMPTS; attempt += 1) {
    failingDriver.fireNext();
    await flushPolicyCallback();
  }
  assert.equal(failedCalls, ROOM_POLICY_CALLBACK_MAX_ATTEMPTS);
  assert.equal(diagnostics, 1);
  assert.equal(exhausted.scheduledCount, 0);
  assert.equal(failingDriver.pending.size, 0);
});

test("canonical deadline보다 이른 timer callback은 cleanup을 유실하지 않고 다시 기다린다", async () => {
  const driver = new ManualTimerDriver();
  const clock = new FakeClock(1_000);
  let callbacks = 0;
  const scheduler = new InProcessRoomPolicyScheduler({
    clock,
    timerDriver: driver,
    onDeadline: () => {
      callbacks += 1;
    },
  });
  scheduler.start();
  const deadline = grace();
  await scheduler.schedule(deadline);

  driver.fireNext();
  await flushPolicyCallback();
  assert.equal(callbacks, 0);
  assert.equal(scheduler.scheduledCount, 1);
  assert.equal(driver.pending.size, 1);
  assert.deepEqual(driver.delays, [60_000, 60_000]);

  clock.set(deadline.deadlineAt);
  driver.fireNext();
  await flushPolicyCallback();
  assert.equal(callbacks, 1);
  assert.equal(scheduler.scheduledCount, 0);
  assert.equal(driver.pending.size, 0);
});
