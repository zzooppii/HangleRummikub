import type { TurnId } from "@hangul-rummikub/shared";
import type { RoomId } from "@hangul-rummikub/shared";

import type {
  Clock,
  ScheduledTurnDeadline,
  TurnScheduler,
} from "../ports/system.js";

const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647;

export interface OneShotTimerDriver {
  set(delayMs: number, callback: () => void): unknown;
  clear(handle: unknown): void;
}

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

export type TurnDeadlineCallback = (
  deadline: ScheduledTurnDeadline,
) => void | Promise<void>;

export type SchedulerCallbackFailureReporter = (
  deadline: ScheduledTurnDeadline,
) => void;

export type InProcessTurnSchedulerOptions = Readonly<{
  clock: Clock;
  onDeadline: TurnDeadlineCallback;
  onCallbackFailure?: SchedulerCallbackFailureReporter;
  timerDriver?: OneShotTimerDriver;
}>;

type ScheduledTimer = Readonly<{
  roomId: RoomId;
  turnId: TurnId;
  identity: string;
  handle: unknown;
}>;

function turnKey(deadline: ScheduledTurnDeadline): string {
  return JSON.stringify([deadline.roomId, deadline.gameId, deadline.turnId]);
}

function deadlineIdentity(deadline: ScheduledTurnDeadline): string {
  return JSON.stringify([
    deadline.roomId,
    deadline.gameId,
    deadline.turnId,
    deadline.expectedGameRevision,
    deadline.deadlineAt,
  ]);
}

export class InProcessTurnScheduler implements TurnScheduler {
  readonly #clock: Clock;
  readonly #onDeadline: TurnDeadlineCallback;
  readonly #onCallbackFailure: SchedulerCallbackFailureReporter | undefined;
  readonly #timerDriver: OneShotTimerDriver;
  readonly #timers = new Map<string, ScheduledTimer>();
  #running = false;

  constructor(options: InProcessTurnSchedulerOptions) {
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

  async scheduleTimeout(deadline: ScheduledTurnDeadline): Promise<void> {
    if (!this.#running) {
      throw new Error("TurnScheduler must be started before scheduling.");
    }

    const key = turnKey(deadline);
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
      turnId: deadline.turnId,
      identity,
      handle,
    });
  }

  async cancelTimeout(turnId: TurnId): Promise<void> {
    for (const [key, current] of this.#timers) {
      if (current.turnId !== turnId) {
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
    deadline: ScheduledTurnDeadline,
    identity: string,
  ): Promise<void> {
    const key = turnKey(deadline);
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
