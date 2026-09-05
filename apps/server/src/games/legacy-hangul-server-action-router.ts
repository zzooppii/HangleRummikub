import type { RoomId } from "@hangul-rummikub/shared";

import type { GameDeadlineResult } from "../application/game-deadline-service.js";
import type { TurnTimeoutResult } from "../application/turn-timeout-service.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type {
  ScheduledGameDeadline,
  ScheduledTurnDeadline,
} from "../ports/system.js";
import { LEGACY_V1_DEFAULT_GAME_TYPE } from "./legacy-hangul-compatibility-registration.js";

export type LegacyHangulServerActionCapability = Readonly<{
  gameType: typeof LEGACY_V1_DEFAULT_GAME_TYPE;
  handleTurnTimeout(input: ScheduledTurnDeadline): Promise<TurnTimeoutResult>;
  handleGameDeadline(
    input: ScheduledGameDeadline,
  ): Promise<GameDeadlineResult>;
}>;

export interface LegacyHangulServerActionRouting {
  handleTurnTimeout(input: ScheduledTurnDeadline): Promise<TurnTimeoutResult>;
  handleGameDeadline(
    input: ScheduledGameDeadline,
  ): Promise<GameDeadlineResult>;
}

export type LegacyHangulServerActionRouterDependencies = Readonly<{
  roomRepository: Pick<RoomRepository, "findById">;
  capability: LegacyHangulServerActionCapability;
}>;

type RouteResolution =
  | Readonly<{ status: "ROOM_NOT_FOUND" }>
  | Readonly<{ status: "UNSUPPORTED_GAME_TYPE" }>
  | Readonly<{
      status: "ROUTED";
      capability: LegacyHangulServerActionCapability;
    }>;

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isLegacyHangulServerActionCapability(
  input: unknown,
): input is LegacyHangulServerActionCapability {
  return (
    isRecord(input) &&
    input.gameType === LEGACY_V1_DEFAULT_GAME_TYPE &&
    typeof input.handleTurnTimeout === "function" &&
    typeof input.handleGameDeadline === "function"
  );
}

function copyCapability(
  capability: LegacyHangulServerActionCapability,
): LegacyHangulServerActionCapability {
  return Object.freeze({
    gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
    handleTurnTimeout: capability.handleTurnTimeout.bind(capability),
    handleGameDeadline: capability.handleGameDeadline.bind(capability),
  });
}

function failedTurnTimeout(): TurnTimeoutResult {
  return { status: "FAILED", reason: "INTERNAL_ERROR" };
}

function failedGameDeadline(): GameDeadlineResult {
  return { status: "FAILED", reason: "INTERNAL_ERROR" };
}

/**
 * Routes detached timer work by immutable canonical Room metadata. The routed
 * Hangul services retain the Room lane, identity/deadline checks, idempotency,
 * mutation, and post-commit effects.
 */
export class LegacyHangulServerActionRouter
  implements LegacyHangulServerActionRouting
{
  readonly #roomRepository: Pick<RoomRepository, "findById">;
  readonly #capability: LegacyHangulServerActionCapability;

  constructor(dependencies: LegacyHangulServerActionRouterDependencies) {
    if (!isLegacyHangulServerActionCapability(dependencies.capability)) {
      throw new Error(
        "Legacy Hangul server-action capability is missing or invalid.",
      );
    }

    this.#roomRepository = dependencies.roomRepository;
    this.#capability = copyCapability(dependencies.capability);
    Object.freeze(this);
  }

  async handleTurnTimeout(
    input: ScheduledTurnDeadline,
  ): Promise<TurnTimeoutResult> {
    try {
      const route = await this.#resolve(input.roomId);
      if (route.status === "ROOM_NOT_FOUND") {
        return { status: "NO_OP", reason: "ROOM_NOT_FOUND" };
      }
      if (route.status === "UNSUPPORTED_GAME_TYPE") {
        return failedTurnTimeout();
      }

      return await route.capability.handleTurnTimeout(input);
    } catch {
      return failedTurnTimeout();
    }
  }

  async handleGameDeadline(
    input: ScheduledGameDeadline,
  ): Promise<GameDeadlineResult> {
    try {
      const route = await this.#resolve(input.roomId);
      if (route.status === "ROOM_NOT_FOUND") {
        return { status: "NO_OP", reason: "ROOM_NOT_FOUND" };
      }
      if (route.status === "UNSUPPORTED_GAME_TYPE") {
        return failedGameDeadline();
      }

      return await route.capability.handleGameDeadline(input);
    } catch {
      return failedGameDeadline();
    }
  }

  async #resolve(roomId: RoomId): Promise<RouteResolution> {
    const room = await this.#roomRepository.findById(roomId);
    if (room === null) {
      return { status: "ROOM_NOT_FOUND" };
    }
    if (room.gameType !== this.#capability.gameType) {
      return { status: "UNSUPPORTED_GAME_TYPE" };
    }

    return { status: "ROUTED", capability: this.#capability };
  }
}
