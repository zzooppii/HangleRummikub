import type { ActiveGameReader } from "../ports/active-game-reader.js";
import type { Clock, ScheduledGameDeadline } from "../ports/system.js";
import {
  OVERDUE_TURN_SWEEP_INTERVAL_MS,
  type RepeatingTimerDriver,
} from "./overdue-turn-sweeper.js";

export const OVERDUE_GAME_DEADLINE_SWEEP_INTERVAL_MS =
  OVERDUE_TURN_SWEEP_INTERVAL_MS;

function createNodeRepeatingTimerDriver(): RepeatingTimerDriver {
  return {
    set(intervalMs, callback) {
      const handle = setInterval(callback, intervalMs);
      handle.unref();
      return handle;
    },
    clear(handle) {
      clearInterval(handle as ReturnType<typeof setInterval>);
    },
  };
}

export type OverdueGameDeadlineEnqueuer = (
  deadline: ScheduledGameDeadline,
) => void | Promise<void>;

export type OverdueGameDeadlineSweepFailure =
  | Readonly<{ kind: "READ_FAILED" }>
  | Readonly<{
      kind: "ENQUEUE_FAILED";
      deadline: ScheduledGameDeadline;
    }>;

export type OverdueGameDeadlineSweeperOptions = Readonly<{
  activeGameReader: ActiveGameReader;
  clock: Clock;
  enqueueDeadline: OverdueGameDeadlineEnqueuer;
  intervalMs?: number;
  timerDriver?: RepeatingTimerDriver;
  onFailure?: (failure: OverdueGameDeadlineSweepFailure) => void;
}>;

export class OverdueGameDeadlineSweeper {
  readonly #activeGameReader: ActiveGameReader;
  readonly #clock: Clock;
  readonly #enqueueDeadline: OverdueGameDeadlineEnqueuer;
  readonly #intervalMs: number;
  readonly #timerDriver: RepeatingTimerDriver;
  readonly #onFailure:
    | ((failure: OverdueGameDeadlineSweepFailure) => void)
    | undefined;
  #intervalHandle: unknown | null = null;
  #inFlight: Promise<number> | null = null;
  #accepting = false;
  #generation = 0;

  constructor(options: OverdueGameDeadlineSweeperOptions) {
    const intervalMs =
      options.intervalMs ?? OVERDUE_GAME_DEADLINE_SWEEP_INTERVAL_MS;
    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
      throw new RangeError("Sweep interval must be a positive safe integer.");
    }
    this.#activeGameReader = options.activeGameReader;
    this.#clock = options.clock;
    this.#enqueueDeadline = options.enqueueDeadline;
    this.#intervalMs = intervalMs;
    this.#timerDriver = options.timerDriver ?? createNodeRepeatingTimerDriver();
    this.#onFailure = options.onFailure;
  }

  get isRunning(): boolean {
    return this.#intervalHandle !== null;
  }

  start(): void {
    if (this.#intervalHandle !== null) {
      return;
    }
    this.#accepting = true;
    this.#generation += 1;
    this.#intervalHandle = this.#timerDriver.set(this.#intervalMs, () => {
      void this.sweepOnce();
    });
  }

  stop(): void {
    this.#accepting = false;
    this.#generation += 1;
    if (this.#intervalHandle !== null) {
      this.#timerDriver.clear(this.#intervalHandle);
      this.#intervalHandle = null;
    }
  }

  sweepOnce(): Promise<number> {
    if (!this.#accepting) {
      return Promise.resolve(0);
    }
    if (this.#inFlight !== null) {
      return this.#inFlight;
    }
    const generation = this.#generation;
    const inFlight = this.#performSweep(generation)
      .catch(() => {
        this.#reportFailure({ kind: "READ_FAILED" });
        return 0;
      })
      .finally(() => {
        if (this.#inFlight === inFlight) {
          this.#inFlight = null;
        }
      });
    this.#inFlight = inFlight;
    return inFlight;
  }

  async #performSweep(generation: number): Promise<number> {
    let deadlines: readonly ScheduledGameDeadline[];
    try {
      deadlines = await this.#activeGameReader.listActiveGameDeadlines();
    } catch {
      this.#reportFailure({ kind: "READ_FAILED" });
      return 0;
    }
    if (!this.#accepting || this.#generation !== generation) {
      return 0;
    }

    const now = this.#clock.now();
    let enqueued = 0;
    for (const deadline of deadlines) {
      if (!this.#accepting || this.#generation !== generation) {
        break;
      }
      if (deadline.deadlineAt > now) {
        continue;
      }
      try {
        await this.#enqueueDeadline(deadline);
        enqueued += 1;
      } catch {
        this.#reportFailure({ kind: "ENQUEUE_FAILED", deadline });
      }
    }
    return enqueued;
  }

  #reportFailure(failure: OverdueGameDeadlineSweepFailure): void {
    try {
      this.#onFailure?.(failure);
    } catch {
      return;
    }
  }
}
