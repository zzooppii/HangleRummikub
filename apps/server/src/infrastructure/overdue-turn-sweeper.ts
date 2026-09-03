import type { ActiveTurnReader } from "../ports/active-turn-reader.js";
import type { Clock, ScheduledTurnDeadline } from "../ports/system.js";

export const OVERDUE_TURN_SWEEP_INTERVAL_MS = 1_000;

export interface RepeatingTimerDriver {
  set(intervalMs: number, callback: () => void): unknown;
  clear(handle: unknown): void;
}

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

export type OverdueTurnEnqueuer = (
  deadline: ScheduledTurnDeadline,
) => void | Promise<void>;

export type OverdueSweepFailure =
  | Readonly<{ kind: "READ_FAILED" }>
  | Readonly<{
      kind: "ENQUEUE_FAILED";
      deadline: ScheduledTurnDeadline;
    }>;

export type OverdueTurnSweeperOptions = Readonly<{
  activeTurnReader: ActiveTurnReader;
  clock: Clock;
  enqueueTimeout: OverdueTurnEnqueuer;
  intervalMs?: number;
  timerDriver?: RepeatingTimerDriver;
  onFailure?: (failure: OverdueSweepFailure) => void;
}>;

export class OverdueTurnSweeper {
  readonly #activeTurnReader: ActiveTurnReader;
  readonly #clock: Clock;
  readonly #enqueueTimeout: OverdueTurnEnqueuer;
  readonly #intervalMs: number;
  readonly #timerDriver: RepeatingTimerDriver;
  readonly #onFailure: ((failure: OverdueSweepFailure) => void) | undefined;
  #intervalHandle: unknown | null = null;
  #inFlight: Promise<number> | null = null;
  #accepting = false;
  #generation = 0;

  constructor(options: OverdueTurnSweeperOptions) {
    if (
      !Number.isSafeInteger(
        options.intervalMs ?? OVERDUE_TURN_SWEEP_INTERVAL_MS,
      )
    ) {
      throw new RangeError("Sweep interval must be a safe integer.");
    }
    const intervalMs = options.intervalMs ?? OVERDUE_TURN_SWEEP_INTERVAL_MS;
    if (intervalMs <= 0) {
      throw new RangeError("Sweep interval must be positive.");
    }

    this.#activeTurnReader = options.activeTurnReader;
    this.#clock = options.clock;
    this.#enqueueTimeout = options.enqueueTimeout;
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
    let deadlines: readonly ScheduledTurnDeadline[];
    try {
      deadlines = await this.#activeTurnReader.listActiveTurnDeadlines();
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
        await this.#enqueueTimeout(deadline);
        enqueued += 1;
      } catch {
        this.#reportFailure({ kind: "ENQUEUE_FAILED", deadline });
      }
    }
    return enqueued;
  }

  #reportFailure(failure: OverdueSweepFailure): void {
    try {
      this.#onFailure?.(failure);
    } catch {
      return;
    }
  }
}
