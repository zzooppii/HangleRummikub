import { ServerTimeSchema } from "@hangul-rummikub/shared";
import * as v from "valibot";

import type {
  FinishedRoomRetentionIdentity,
  FinishedRoomRetentionReader,
} from "../ports/finished-room-retention-reader.js";
import type { FinishedRoomRetentionDeadline } from "../ports/room-policy-scheduler.js";
import type { Clock } from "../ports/system.js";
import {
  OVERDUE_TURN_SWEEP_INTERVAL_MS,
  type RepeatingTimerDriver,
} from "./overdue-turn-sweeper.js";

export const OVERDUE_FINISHED_RETENTION_SWEEP_INTERVAL_MS =
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

export type FinishedRetentionRecoveryEnqueuer = (
  deadline: FinishedRoomRetentionDeadline,
) => void | Promise<void>;

export type FinishedRetentionRecoveryFailure =
  | Readonly<{ kind: "READ_FAILED" }>
  | Readonly<{
      kind: "ENQUEUE_FAILED";
      identity: FinishedRoomRetentionIdentity;
    }>;

export type OverdueFinishedRetentionSweeperOptions = Readonly<{
  finishedRoomRetentionReader: FinishedRoomRetentionReader;
  clock: Clock;
  retentionMs: number;
  enqueueRetention: FinishedRetentionRecoveryEnqueuer;
  intervalMs?: number;
  timerDriver?: RepeatingTimerDriver;
  onFailure?: (failure: FinishedRetentionRecoveryFailure) => void;
}>;

export class OverdueFinishedRetentionSweeper {
  readonly #finishedRoomRetentionReader: FinishedRoomRetentionReader;
  readonly #clock: Clock;
  readonly #retentionMs: number;
  readonly #enqueueRetention: FinishedRetentionRecoveryEnqueuer;
  readonly #intervalMs: number;
  readonly #timerDriver: RepeatingTimerDriver;
  readonly #onFailure:
    | ((failure: FinishedRetentionRecoveryFailure) => void)
    | undefined;
  #intervalHandle: unknown | null = null;
  #inFlight: Promise<number> | null = null;
  #accepting = false;
  #generation = 0;

  constructor(options: OverdueFinishedRetentionSweeperOptions) {
    const intervalMs =
      options.intervalMs ?? OVERDUE_FINISHED_RETENTION_SWEEP_INTERVAL_MS;
    if (!Number.isSafeInteger(intervalMs) || intervalMs <= 0) {
      throw new RangeError("Sweep interval must be a positive safe integer.");
    }
    if (!Number.isSafeInteger(options.retentionMs) || options.retentionMs <= 0) {
      throw new RangeError("Retention duration must be a positive safe integer.");
    }
    this.#finishedRoomRetentionReader = options.finishedRoomRetentionReader;
    this.#clock = options.clock;
    this.#retentionMs = options.retentionMs;
    this.#enqueueRetention = options.enqueueRetention;
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
    let identities: readonly FinishedRoomRetentionIdentity[];
    try {
      identities =
        await this.#finishedRoomRetentionReader.listFinishedRoomRetentions();
    } catch {
      this.#reportFailure({ kind: "READ_FAILED" });
      return 0;
    }
    if (!this.#accepting || this.#generation !== generation) {
      return 0;
    }

    const now = this.#clock.now();
    let enqueued = 0;
    for (const identity of identities) {
      if (!this.#accepting || this.#generation !== generation) {
        break;
      }
      const deadlineAt = v.parse(
        ServerTimeSchema,
        identity.finishedAt + this.#retentionMs,
      );
      if (deadlineAt > now) {
        continue;
      }
      try {
        await this.#enqueueRetention(
          Object.freeze({
            kind: "FINISHED_ROOM_RETENTION",
            ...identity,
            deadlineAt,
          }),
        );
        enqueued += 1;
      } catch {
        this.#reportFailure({ kind: "ENQUEUE_FAILED", identity });
      }
    }
    return enqueued;
  }

  #reportFailure(failure: FinishedRetentionRecoveryFailure): void {
    try {
      this.#onFailure?.(failure);
    } catch {
      return;
    }
  }
}
