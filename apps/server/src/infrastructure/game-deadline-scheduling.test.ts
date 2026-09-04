import assert from "node:assert/strict";
import test from "node:test";

import {
  GameIdSchema,
  RoomIdSchema,
  ServerTimeSchema,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import type { ActiveGameReader } from "../ports/active-game-reader.js";
import type { ScheduledGameDeadline } from "../ports/system.js";
import {
  InProcessGameDeadlineScheduler,
} from "./in-process-game-deadline-scheduler.js";
import type { OneShotTimerDriver } from "./in-process-turn-scheduler.js";
import {
  OVERDUE_GAME_DEADLINE_SWEEP_INTERVAL_MS,
  OverdueGameDeadlineSweeper,
} from "./overdue-game-deadline-sweeper.js";
import type { RepeatingTimerDriver } from "./overdue-turn-sweeper.js";
import { FakeClock } from "./system.js";

function deadline(
  suffix: string,
  deadlineAt: number,
): ScheduledGameDeadline {
  return Object.freeze({
    roomId: parse(RoomIdSchema, `room-${suffix}`),
    gameId: parse(GameIdSchema, `game-${suffix}`),
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
    if (typeof handle === "object" && handle !== null && "cleared" in handle) {
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

class MutableActiveGameReader implements ActiveGameReader {
  deadlines: readonly ScheduledGameDeadline[] = [];

  async listActiveGameDeadlines(): Promise<
    readonly ScheduledGameDeadline[]
  > {
    return this.deadlines.map((entry) => Object.freeze({ ...entry }));
  }
}

test("Game deadline scheduler uses server Clock, deduplicates, and fires once", async () => {
  const clock = new FakeClock(100);
  const timerDriver = new ManualOneShotTimers();
  const fired: ScheduledGameDeadline[] = [];
  const scheduler = new InProcessGameDeadlineScheduler({
    clock,
    timerDriver,
    onDeadline: async (value) => {
      fired.push(value);
    },
  });
  scheduler.start();
  const current = deadline("one", 150);

  await scheduler.scheduleDeadline(current);
  await scheduler.scheduleDeadline(current);
  assert.equal(timerDriver.scheduled.length, 1);
  assert.equal(timerDriver.scheduled[0]?.delayMs, 50);
  assert.equal(scheduler.scheduledCount, 1);

  timerDriver.scheduled[0]?.callback();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(fired, [current]);
  assert.equal(scheduler.scheduledCount, 0);
});

test("Game deadline scheduler replaces changed identity and cancels by Game/Room", async () => {
  const timers = new ManualOneShotTimers();
  const scheduler = new InProcessGameDeadlineScheduler({
    clock: new FakeClock(0),
    timerDriver: timers,
    onDeadline: () => undefined,
  });
  scheduler.start();

  const first = deadline("replace", 10);
  await scheduler.scheduleDeadline(first);
  await scheduler.scheduleDeadline({
    ...first,
    deadlineAt: parse(ServerTimeSchema, 20),
  });
  assert.equal(timers.scheduled.length, 2);
  assert.equal(timers.scheduled[0]?.cleared, true);
  assert.equal(scheduler.scheduledCount, 1);

  await scheduler.scheduleDeadline(deadline("other", 30));
  await scheduler.cancelDeadline(first.gameId);
  assert.equal(scheduler.scheduledCount, 1);
  await scheduler.cancelRoom(parse(RoomIdSchema, "room-other"));
  assert.equal(scheduler.scheduledCount, 0);
});

test("Game deadline scheduler lifecycle contains callback failure", async () => {
  const timers = new ManualOneShotTimers();
  const failures: ScheduledGameDeadline[] = [];
  const scheduler = new InProcessGameDeadlineScheduler({
    clock: new FakeClock(0),
    timerDriver: timers,
    onDeadline: async () => {
      throw new Error("injected callback failure");
    },
    onCallbackFailure: (value) => failures.push(value),
  });
  const current = deadline("lifecycle", 10);
  await assert.rejects(() => scheduler.scheduleDeadline(current));
  scheduler.start();
  await scheduler.scheduleDeadline(current);
  timers.scheduled[0]?.callback();
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(failures, [current]);

  scheduler.stop();
  assert.equal(scheduler.isRunning, false);
  assert.equal(scheduler.scheduledCount, 0);
  await assert.rejects(() => scheduler.scheduleDeadline(current));
});

test("Game deadline sweeper enqueues only overdue identities at the shared 1s cadence", async () => {
  const reader = new MutableActiveGameReader();
  reader.deadlines = [deadline("future", 101), deadline("due", 100)];
  const clock = new FakeClock(100);
  const timer = new ManualRepeatingTimer();
  const enqueued: ScheduledGameDeadline[] = [];
  const sweeper = new OverdueGameDeadlineSweeper({
    activeGameReader: reader,
    clock,
    timerDriver: timer,
    enqueueDeadline: async (value) => {
      enqueued.push(value);
    },
  });
  sweeper.start();
  assert.equal(
    timer.intervalMs,
    OVERDUE_GAME_DEADLINE_SWEEP_INTERVAL_MS,
  );
  assert.equal(await sweeper.sweepOnce(), 1);
  assert.deepEqual(enqueued, [reader.deadlines[1]]);

  clock.advance(1);
  assert.equal(await sweeper.sweepOnce(), 2);
  sweeper.stop();
  assert.equal(timer.cleared, true);
});

test("Game deadline sweeper stop after an in-flight read prevents enqueue", async () => {
  let resolveRead:
    | ((value: readonly ScheduledGameDeadline[]) => void)
    | undefined;
  const reader: ActiveGameReader = {
    listActiveGameDeadlines: () =>
      new Promise((resolve) => {
        resolveRead = resolve;
      }),
  };
  const enqueued: ScheduledGameDeadline[] = [];
  const sweeper = new OverdueGameDeadlineSweeper({
    activeGameReader: reader,
    clock: new FakeClock(100),
    timerDriver: new ManualRepeatingTimer(),
    enqueueDeadline: (value) => {
      enqueued.push(value);
    },
  });
  sweeper.start();
  const inFlight = sweeper.sweepOnce();
  sweeper.stop();
  assert.ok(resolveRead);
  resolveRead([deadline("late", 50)]);
  assert.equal(await inFlight, 0);
  assert.deepEqual(enqueued, []);
});
