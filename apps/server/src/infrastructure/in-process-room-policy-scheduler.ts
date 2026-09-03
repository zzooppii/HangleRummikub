import type {
  PlayerId,
  PresenceVersion,
  RoomId,
} from "@hangul-rummikub/shared";

import type {
  RoomPolicyDeadline,
  RoomPolicyScheduler,
} from "../ports/room-policy-scheduler.js";
import type { Clock } from "../ports/system.js";

const MAX_NODE_TIMER_DELAY_MS = 2_147_483_647;
export const ROOM_POLICY_CALLBACK_MAX_ATTEMPTS = 3;
export const ROOM_POLICY_CALLBACK_RETRY_DELAY_MS = 1_000;

export interface RoomPolicyTimerDriver {
  set(delayMs: number, callback: () => void): unknown;
  clear(handle: unknown): void;
}

function createNodeTimerDriver(): RoomPolicyTimerDriver {
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

export type RoomPolicyDeadlineCallback = (
  deadline: RoomPolicyDeadline,
) => void | Promise<void>;

export type RoomPolicyCallbackFailureReporter = (
  deadline: RoomPolicyDeadline,
) => void;

export type InProcessRoomPolicySchedulerOptions = Readonly<{
  clock: Clock;
  onDeadline: RoomPolicyDeadlineCallback;
  onCallbackFailure?: RoomPolicyCallbackFailureReporter;
  timerDriver?: RoomPolicyTimerDriver;
}>;

type ScheduledPolicyTimer = Readonly<{
  roomId: RoomId;
  identity: string;
  handle: unknown;
  attempt: number;
  deadline: RoomPolicyDeadline;
}>;

function lobbyGraceKey(roomId: RoomId, playerId: PlayerId): string {
  return `lobby:${roomId}:${playerId}`;
}

function policyKey(deadline: RoomPolicyDeadline): string {
  switch (deadline.kind) {
    case "LOBBY_DISCONNECT_GRACE":
      return lobbyGraceKey(deadline.roomId, deadline.playerId);
    case "PLAYING_ALL_OFFLINE_RETENTION":
      return `playing:${deadline.roomId}`;
    case "FINISHED_ROOM_RETENTION":
      return `finished:${deadline.roomId}`;
  }
}

function policyIdentity(deadline: RoomPolicyDeadline): string {
  switch (deadline.kind) {
    case "LOBBY_DISCONNECT_GRACE":
      return JSON.stringify([
        deadline.kind,
        deadline.roomId,
        deadline.playerId,
        deadline.connectionGeneration,
        deadline.disconnectedAt,
        deadline.deadlineAt,
      ]);
    case "PLAYING_ALL_OFFLINE_RETENTION":
      return JSON.stringify([
        deadline.kind,
        deadline.roomId,
        deadline.gameId,
        deadline.presenceVersion,
        deadline.allOfflineAt,
        deadline.deadlineAt,
      ]);
    case "FINISHED_ROOM_RETENTION":
      return JSON.stringify([
        deadline.kind,
        deadline.roomId,
        deadline.gameId,
        deadline.finishedAt,
        deadline.deadlineAt,
      ]);
  }
}

export class InProcessRoomPolicyScheduler implements RoomPolicyScheduler {
  readonly #clock: Clock;
  readonly #onDeadline: RoomPolicyDeadlineCallback;
  readonly #onCallbackFailure: RoomPolicyCallbackFailureReporter | undefined;
  readonly #timerDriver: RoomPolicyTimerDriver;
  readonly #timers = new Map<string, ScheduledPolicyTimer>();
  #running = false;

  constructor(options: InProcessRoomPolicySchedulerOptions) {
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

  async schedule(deadline: RoomPolicyDeadline): Promise<void> {
    if (!this.#running) {
      throw new Error("RoomPolicyScheduler must be started before scheduling.");
    }

    const key = policyKey(deadline);
    const existing = this.#timers.get(key);
    let effectiveDeadline = deadline;
    if (
      existing?.deadline.kind === "LOBBY_DISCONNECT_GRACE" &&
      deadline.kind === "LOBBY_DISCONNECT_GRACE" &&
      existing.deadline.connectionGeneration >= deadline.connectionGeneration
    ) {
      // Disconnect callbacks can finish out of order. Never let an obsolete
      // generation replace the current offline generation's grace timer.
      return;
    }
    if (
      existing?.deadline.kind === "PLAYING_ALL_OFFLINE_RETENTION" &&
      deadline.kind === "PLAYING_ALL_OFFLINE_RETENTION" &&
      existing.deadline.gameId === deadline.gameId
    ) {
      if (existing.deadline.presenceVersion > deadline.presenceVersion) {
        // A callback observing an older presence snapshot cannot replace the
        // retention window created for a later all-offline transition.
        return;
      }
      if (existing.deadline.presenceVersion === deadline.presenceVersion) {
        effectiveDeadline = Object.freeze({
          ...deadline,
          allOfflineAt:
            existing.deadline.allOfflineAt >= deadline.allOfflineAt
              ? existing.deadline.allOfflineAt
              : deadline.allOfflineAt,
          deadlineAt:
            existing.deadline.deadlineAt >= deadline.deadlineAt
              ? existing.deadline.deadlineAt
              : deadline.deadlineAt,
        });
      }
    }
    const identity = policyIdentity(effectiveDeadline);
    if (existing?.identity === identity) {
      return;
    }
    if (existing !== undefined) {
      this.#timerDriver.clear(existing.handle);
    }

    const delayMs = Math.min(
      Math.max(0, effectiveDeadline.deadlineAt - this.#clock.now()),
      MAX_NODE_TIMER_DELAY_MS,
    );
    this.#setTimer(key, identity, effectiveDeadline, 1, delayMs);
  }

  async cancelLobbyGrace(
    roomId: RoomId,
    playerId: PlayerId,
    resumedConnectionGeneration?: number,
  ): Promise<void> {
    const key = lobbyGraceKey(roomId, playerId);
    const timer = this.#timers.get(key);
    if (
      timer === undefined ||
      (resumedConnectionGeneration !== undefined &&
        (timer.deadline.kind !== "LOBBY_DISCONNECT_GRACE" ||
          timer.deadline.connectionGeneration >= resumedConnectionGeneration))
    ) {
      return;
    }
    this.#cancelKey(key);
  }

  async cancelPlayingAllOffline(
    roomId: RoomId,
    currentPresenceVersion?: PresenceVersion,
  ): Promise<void> {
    const key = `playing:${roomId}`;
    const timer = this.#timers.get(key);
    if (
      timer === undefined ||
      (currentPresenceVersion !== undefined &&
        (timer.deadline.kind !== "PLAYING_ALL_OFFLINE_RETENTION" ||
          timer.deadline.presenceVersion >= currentPresenceVersion))
    ) {
      return;
    }
    this.#cancelKey(key);
  }

  async cancelRoom(roomId: RoomId): Promise<void> {
    for (const [key, timer] of this.#timers) {
      if (timer.roomId === roomId) {
        this.#timerDriver.clear(timer.handle);
        this.#timers.delete(key);
      }
    }
  }

  stop(): void {
    this.#running = false;
    for (const timer of this.#timers.values()) {
      this.#timerDriver.clear(timer.handle);
    }
    this.#timers.clear();
  }

  #cancelKey(key: string): void {
    const timer = this.#timers.get(key);
    if (timer !== undefined) {
      this.#timerDriver.clear(timer.handle);
      this.#timers.delete(key);
    }
  }

  #setTimer(
    key: string,
    identity: string,
    deadline: RoomPolicyDeadline,
    attempt: number,
    delayMs: number,
  ): void {
    const handle = this.#timerDriver.set(delayMs, () => {
      void this.#fire(key, identity, deadline, attempt);
    });
    this.#timers.set(key, {
      roomId: deadline.roomId,
      identity,
      handle,
      attempt,
      deadline,
    });
  }

  async #fire(
    key: string,
    identity: string,
    deadline: RoomPolicyDeadline,
    attempt: number,
  ): Promise<void> {
    const current = this.#timers.get(key);
    if (
      !this.#running ||
      current === undefined ||
      current.identity !== identity ||
      current.attempt !== attempt
    ) {
      return;
    }
    if (this.#clock.now() < deadline.deadlineAt) {
      // Node timers are advisory. A callback can arrive early after a clock
      // adjustment, so retain the same policy identity and wait for the
      // canonical injected Clock deadline instead of losing the cleanup.
      const remainingDelayMs = Math.min(
        deadline.deadlineAt - this.#clock.now(),
        MAX_NODE_TIMER_DELAY_MS,
      );
      this.#setTimer(
        key,
        identity,
        deadline,
        attempt,
        remainingDelayMs,
      );
      return;
    }
    this.#timers.delete(key);

    try {
      await this.#onDeadline(deadline);
    } catch {
      // A policy application can lose a CAS/precondition race or encounter a
      // transient infrastructure failure after the timer fires. Retry is
      // bounded so a permanent failure cannot create a hot loop. A newer
      // policy registered while the callback was running always wins.
      if (
        this.#running &&
        !this.#timers.has(key) &&
        attempt < ROOM_POLICY_CALLBACK_MAX_ATTEMPTS
      ) {
        this.#setTimer(
          key,
          identity,
          deadline,
          attempt + 1,
          ROOM_POLICY_CALLBACK_RETRY_DELAY_MS,
        );
        return;
      }
      try {
        this.#onCallbackFailure?.(deadline);
      } catch {
        return;
      }
    }
  }
}
