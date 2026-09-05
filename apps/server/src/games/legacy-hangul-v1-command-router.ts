import type { ErrorDto, RoomId } from "@hangul-rummikub/shared";

import type {
  GameStartResult,
  StartGameInput,
} from "../application/game-start-service.js";
import type {
  TurnDrawInput,
  TurnDrawResult,
} from "../application/turn-draw-service.js";
import type {
  TurnPassInput,
  TurnPassResult,
} from "../application/turn-pass-service.js";
import type {
  TurnSubmitInput,
  TurnSubmitResult,
} from "../application/turn-submit-service.js";
import type { RoomRepository } from "../ports/room-repository.js";
import { LEGACY_V1_DEFAULT_GAME_TYPE } from "./legacy-hangul-compatibility-registration.js";

export type LegacyHangulV1CommandCapability = Readonly<{
  gameType: typeof LEGACY_V1_DEFAULT_GAME_TYPE;
  start(input: StartGameInput): Promise<GameStartResult>;
  submit(input: TurnSubmitInput): Promise<TurnSubmitResult>;
  draw(input: TurnDrawInput): Promise<TurnDrawResult>;
  pass(input: TurnPassInput): Promise<TurnPassResult>;
}>;

export type LegacyHangulV1CommandRouterDependencies = Readonly<{
  roomRepository: Pick<RoomRepository, "findById">;
  capability: LegacyHangulV1CommandCapability;
}>;

export interface LegacyHangulV1CommandRouting {
  start(input: StartGameInput): Promise<GameStartResult>;
  submit(input: TurnSubmitInput): Promise<TurnSubmitResult>;
  draw(input: TurnDrawInput): Promise<TurnDrawResult>;
  pass(input: TurnPassInput): Promise<TurnPassResult>;
}

type RouteResolution =
  | Readonly<{ status: "ROOM_NOT_FOUND" }>
  | Readonly<{ status: "UNSUPPORTED_GAME_TYPE" }>
  | Readonly<{
      status: "ROUTED";
      capability: LegacyHangulV1CommandCapability;
    }>;

const ROOM_NOT_FOUND_ERROR: ErrorDto = Object.freeze({
  code: "ROOM_NOT_FOUND",
  message: "Room was not found.",
  recoverable: false,
});

const INTERNAL_ERROR: ErrorDto = Object.freeze({
  code: "INTERNAL_ERROR",
  message: "An internal error occurred.",
  recoverable: false,
});

function isRecord(input: unknown): input is Readonly<Record<string, unknown>> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function isLegacyHangulV1CommandCapability(
  input: unknown,
): input is LegacyHangulV1CommandCapability {
  return (
    isRecord(input) &&
    input.gameType === LEGACY_V1_DEFAULT_GAME_TYPE &&
    typeof input.start === "function" &&
    typeof input.submit === "function" &&
    typeof input.draw === "function" &&
    typeof input.pass === "function"
  );
}

function copyCapability(
  capability: LegacyHangulV1CommandCapability,
): LegacyHangulV1CommandCapability {
  const start = capability.start.bind(capability);
  const submit = capability.submit.bind(capability);
  const draw = capability.draw.bind(capability);
  const pass = capability.pass.bind(capability);

  return Object.freeze({
    gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
    start,
    submit,
    draw,
    pass,
  });
}

function failed(error: ErrorDto): Readonly<{ ok: false; error: ErrorDto }> {
  return { ok: false, error };
}

/**
 * Routes the four legacy v1 command surfaces by canonical Room metadata only.
 * It owns neither authentication nor command/idempotency/gameplay behavior.
 */
export class LegacyHangulV1CommandRouter
  implements LegacyHangulV1CommandRouting
{
  readonly #roomRepository: Pick<RoomRepository, "findById">;
  readonly #capability: LegacyHangulV1CommandCapability;

  constructor(dependencies: LegacyHangulV1CommandRouterDependencies) {
    if (!isLegacyHangulV1CommandCapability(dependencies.capability)) {
      throw new Error(
        "Legacy Hangul v1 command capability is missing or invalid.",
      );
    }

    this.#roomRepository = dependencies.roomRepository;
    this.#capability = copyCapability(dependencies.capability);
    Object.freeze(this);
  }

  async start(input: StartGameInput): Promise<GameStartResult> {
    const route = await this.#resolve(input.roomId);
    if (route.status === "ROOM_NOT_FOUND") {
      return failed(ROOM_NOT_FOUND_ERROR);
    }
    if (route.status === "UNSUPPORTED_GAME_TYPE") {
      return failed(INTERNAL_ERROR);
    }

    return route.capability.start(input);
  }

  async submit(input: TurnSubmitInput): Promise<TurnSubmitResult> {
    const route = await this.#resolve(input.roomId);
    if (route.status === "ROOM_NOT_FOUND") {
      return failed(ROOM_NOT_FOUND_ERROR);
    }
    if (route.status === "UNSUPPORTED_GAME_TYPE") {
      return failed(INTERNAL_ERROR);
    }

    return route.capability.submit(input);
  }

  async draw(input: TurnDrawInput): Promise<TurnDrawResult> {
    const route = await this.#resolve(input.roomId);
    if (route.status === "ROOM_NOT_FOUND") {
      return failed(ROOM_NOT_FOUND_ERROR);
    }
    if (route.status === "UNSUPPORTED_GAME_TYPE") {
      return failed(INTERNAL_ERROR);
    }

    return route.capability.draw(input);
  }

  async pass(input: TurnPassInput): Promise<TurnPassResult> {
    const route = await this.#resolve(input.roomId);
    if (route.status === "ROOM_NOT_FOUND") {
      return failed(ROOM_NOT_FOUND_ERROR);
    }
    if (route.status === "UNSUPPORTED_GAME_TYPE") {
      return failed(INTERNAL_ERROR);
    }

    return route.capability.pass(input);
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
