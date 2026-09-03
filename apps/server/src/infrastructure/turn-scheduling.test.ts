import assert from "node:assert/strict";
import test from "node:test";

import {
  GameIdSchema,
  GameRevisionSchema,
  RoomIdSchema,
  ServerTimeSchema,
  TurnIdSchema,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  InProcessTurnScheduler,
  type OneShotTimerDriver,
} from "./in-process-turn-scheduler.js";
import {
  OverdueTurnSweeper,
  OVERDUE_TURN_SWEEP_INTERVAL_MS,
  type RepeatingTimerDriver,
} from "./overdue-turn-sweeper.js";
import { FakeClock } from "./system.js";
import type { ActiveTurnReader } from "../ports/active-turn-reader.js";
import type { ScheduledTurnDeadline } from "../ports/system.js";

function deadline(
  suffix: string,
  deadlineAt: number,
  turnId = `turn-${suffix}`,
): ScheduledTurnDeadline {
  return Object.freeze({
    roomId: parse(RoomIdSchema, `room-${suffix}`),
    gameId: parse(GameIdSchema, `game-${suffix}`),
    turnId: parse(TurnIdSchema, turnId),
    expectedGameRevision: parse(GameRevisionSchema, 0),
    deadlineAt: parse(ServerTimeSchema, deadlineAt),
  });
}

class ManualOneShotTimers implements OneShotTimerDriver {
  readonly scheduled: Array<{
    delayMs: number;
    callback: () => void;
    cleared: boolean;
  }> = [];

  set(delayMs: number, callback: () => void): unknown {
    const entry = { delayMs, callback, cleared: false };
    this.scheduled.push(entry);
    return entry;
  }

  clear(handle: unknown): void {
    if (
      typeof handle === "object" &&
      handle !== null &&
      "cleared" in handle
    ) {
      handle.cleared = true;
    }
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

class MutableActiveTurnReader implements ActiveTurnReader {
  deadlines: readonly ScheduledTurnDeadline[] = [];

  async listActiveTurnDeadlines(): Promise<readonly ScheduledTurnDeadline[]> {
    return this.deadlines.map((entry) => Object.freeze({ ...entry }));
  }
}

test("InProcessTurnScheduler schedules by server Clock, deduplicates, and fires once", async () => {
  const clock = new FakeClock(100);
  const timerDriver = new ManualOneShotTimers();
  const fired: ScheduledTurnDeadline[] = [];
  const scheduler = new InProcessTurnScheduler({
    clock,
    timerDriver,
    onDeadline: async (value) => {
      fired.push(value);
    },
  });
  scheduler.start();
  const current = deadline("one", 150);

  await scheduler.scheduleTimeout(current);
  await scheduler.scheduleTimeout(current);
  assert.equal(timerDriver.scheduled.length, 1);
  assert.equal(timerDriver.scheduled[0]?.delayMs, 50);
  assert.equal(scheduler.scheduledCount, 1);

  timerDriver.scheduled[0]?.callback();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(fired, [current]);
  assert.equal(scheduler.scheduledCount, 0);
});

test("same turnId in different Room/Game schedules independently", async () => {
  const timerDriver = new ManualOneShotTimers();
  const scheduler = new InProcessTurnScheduler({
    clock: new FakeClock(0),
    timerDriver,
    onDeadline: () => undefined,
  });
  scheduler.start();

  await scheduler.scheduleTimeout(deadline("a", 10, "shared-turn"));
  await scheduler.scheduleTimeout(deadline("b", 10, "shared-turn"));
  assert.equal(scheduler.scheduledCount, 2);
  assert.equal(timerDriver.scheduled.length, 2);

  await scheduler.cancelTimeout(parse(TurnIdSchema, "shared-turn"));
  assert.equal(scheduler.scheduledCount, 0);
  assert.equal(timerDriver.scheduled.every((entry) => entry.cleared), true);
});

test("scheduler lifecycle rejects scheduling before/after start and contains callback failure", async () => {
  const timerDriver = new ManualOneShotTimers();
  const failures: ScheduledTurnDeadline[] = [];
  const scheduler = new InProcessTurnScheduler({
    clock: new FakeClock(0),
    timerDriver,
    onDeadline: async () => {
      throw new Error("injected callback failure");
    },
    onCallbackFailure: (value) => failures.push(value),
  });
  const current = deadline("lifecycle", 10);
  await assert.rejects(() => scheduler.scheduleTimeout(current));
  scheduler.start();
  await scheduler.scheduleTimeout(current);
  timerDriver.scheduled[0]?.callback();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(failures, [current]);

  await scheduler.scheduleTimeout(deadline("stop", 20));
  scheduler.stop();
  assert.equal(scheduler.isRunning, false);
  assert.equal(scheduler.scheduledCount, 0);
  await assert.rejects(() => scheduler.scheduleTimeout(current));
});

test("OverdueTurnSweeper enqueues only overdue detached identities at 1s cadence", async () => {
  const reader = new MutableActiveTurnReader();
  reader.deadlines = [deadline("future", 101), deadline("due", 100)];
  const clock = new FakeClock(100);
  const timer = new ManualRepeatingTimer();
  const enqueued: ScheduledTurnDeadline[] = [];
  const sweeper = new OverdueTurnSweeper({
    activeTurnReader: reader,
    clock,
    timerDriver: timer,
    enqueueTimeout: async (value) => {
      enqueued.push(value);
    },
  });
  sweeper.start();
  assert.equal(timer.intervalMs, OVERDUE_TURN_SWEEP_INTERVAL_MS);
  assert.equal(await sweeper.sweepOnce(), 1);
  assert.deepEqual(enqueued, [reader.deadlines[1]]);

  clock.advance(1);
  assert.equal(await sweeper.sweepOnce(), 2);
  assert.deepEqual(enqueued, [
    reader.deadlines[1],
    reader.deadlines[0],
    reader.deadlines[1],
  ]);
  sweeper.stop();
  assert.equal(timer.cleared, true);
});

test("sweeper stop after an in-flight read prevents new timeout enqueue", async () => {
  let resolveRead:
    | ((value: readonly ScheduledTurnDeadline[]) => void)
    | undefined;
  const reader: ActiveTurnReader = {
    listActiveTurnDeadlines: () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  };
  const enqueued: ScheduledTurnDeadline[] = [];
  const sweeper = new OverdueTurnSweeper({
    activeTurnReader: reader,
    clock: new FakeClock(100),
    timerDriver: new ManualRepeatingTimer(),
    enqueueTimeout: (value) => {
      enqueued.push(value);
    },
  });
  sweeper.start();
  const inFlight = sweeper.sweepOnce();
  sweeper.stop();
  assert.ok(resolveRead);
  resolveRead([deadline("late-read", 50)]);
  assert.equal(await inFlight, 0);
  assert.deepEqual(enqueued, []);
});
