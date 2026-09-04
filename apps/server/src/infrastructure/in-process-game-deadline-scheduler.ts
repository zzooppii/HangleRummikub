import type { GameId, RoomId } from "@hangul-rummikub/shared";

import type {
  Clock,
  GameDeadlineScheduler,
  ScheduledGameDeadline,
} from "../ports/system.js";
import type { OneShotTimerDriver } from "./in-process-turn-scheduler.js";

const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647;

function createNodeTimerDriver(): OneShotTimerDriver {
  return {
    set(delayMs, callback) {
      const handle = setTimeout(callback, delayMs);
      handle.unref();
      return handle;
    },
    clear(handle) {
      clearTimeout(handle as ReturnType<typeof setTimeout>);
    },
  };
}

export type GameDeadlineCallback = (
  deadline: ScheduledGameDeadline,
) => void | Promise<void>;

export type GameDeadlineCallbackFailureReporter = (
  deadline: ScheduledGameDeadline,
) => void;

export type InProcessGameDeadlineSchedulerOptions = Readonly<{
  clock: Clock;
  onDeadline: GameDeadlineCallback;
  onCallbackFailure?: GameDeadlineCallbackFailureReporter;
  timerDriver?: OneShotTimerDriver;
}>;

type ScheduledTimer = Readonly<{
  roomId: RoomId;
  gameId: GameId;
  identity: string;
  handle: unknown;
}>;

function gameKey(deadline: ScheduledGameDeadline): string {
  return JSON.stringify([deadline.roomId, deadline.gameId]);
}

function deadlineIdentity(deadline: ScheduledGameDeadline): string {
  return JSON.stringify([
    deadline.roomId,
    deadline.gameId,
    deadline.deadlineAt,
  ]);
}

export class InProcessGameDeadlineScheduler
  implements GameDeadlineScheduler
{
  readonly #clock: Clock;
  readonly #onDeadline: GameDeadlineCallback;
  readonly #onCallbackFailure:
    | GameDeadlineCallbackFailureReporter
    | undefined;
  readonly #timerDriver: OneShotTimerDriver;
  readonly #timers = new Map<string, ScheduledTimer>();
  #running = false;

  constructor(options: InProcessGameDeadlineSchedulerOptions) {
    this.#clock = options.clock;
    this.#onDeadline = options.onDeadline;
    this.#onCallbackFailure = options.onCallbackFailure;
    this.#timerDriver = options.timerDriver ?? createNodeTimerDriver();
  }

  get scheduledCount(): number {
    return this.#timers.size;
  }

  get isRunning(): boolean {
    return this.#running;
  }

  start(): void {
    this.#running = true;
  }

  async scheduleDeadline(deadline: ScheduledGameDeadline): Promise<void> {
    if (!this.#running) {
      throw new Error(
        "GameDeadlineScheduler must be started before scheduling.",
      );
    }

    const key = gameKey(deadline);
    const identity = deadlineIdentity(deadline);
    const existing = this.#timers.get(key);
    if (existing?.identity === identity) {
      return;
    }
    if (existing !== undefined) {
      this.#timerDriver.clear(existing.handle);
    }

    const delayMs = Math.min(
      Math.max(0, deadline.deadlineAt - this.#clock.now()),
      MAX_NODE_TIMER_DELAY_MS,
    );
    const handle = this.#timerDriver.set(delayMs, () => {
      void this.#fire(deadline, identity);
    });
    this.#timers.set(key, {
      roomId: deadline.roomId,
      gameId: deadline.gameId,
      identity,
      handle,
    });
  }

  async cancelDeadline(gameId: GameId): Promise<void> {
    for (const [key, current] of this.#timers) {
      if (current.gameId !== gameId) {
        continue;
      }
      this.#timerDriver.clear(current.handle);
      this.#timers.delete(key);
    }
  }

  async cancelRoom(roomId: RoomId): Promise<void> {
    for (const [key, current] of this.#timers) {
      if (current.roomId !== roomId) {
        continue;
      }
      this.#timerDriver.clear(current.handle);
      this.#timers.delete(key);
    }
  }

  stop(): void {
    this.#running = false;
    for (const timer of this.#timers.values()) {
      this.#timerDriver.clear(timer.handle);
    }
    this.#timers.clear();
  }

  async #fire(
    deadline: ScheduledGameDeadline,
    identity: string,
  ): Promise<void> {
    const key = gameKey(deadline);
    const current = this.#timers.get(key);
    if (
      !this.#running ||
      current === undefined ||
      current.identity !== identity
    ) {
      return;
    }
    this.#timers.delete(key);

    try {
      await this.#onDeadline(deadline);
    } catch {
      try {
        this.#onCallbackFailure?.(deadline);
      } catch {
        return;
      }
    }
  }
}
