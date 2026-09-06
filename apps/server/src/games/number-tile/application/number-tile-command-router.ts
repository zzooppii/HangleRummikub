import type { ErrorDto, RoomId } from "@hangul-rummikub/shared";

import type { RoomRepository } from "../../../ports/room-repository.js";
import { NUMBER_TILE_GAME_TYPE } from "../number-tile-registration.js";
import type {
  NumberTileDrawInput,
  NumberTileDrawResult,
} from "./number-tile-draw-service.js";
import type {
  NumberTilePassInput,
  NumberTilePassResult,
} from "./number-tile-pass-service.js";
import type {
  NumberTileSubmitInput,
  NumberTileSubmitResult,
} from "./number-tile-submit-service.js";

export type NumberTileCommandCapability = Readonly<{
  gameType: typeof NUMBER_TILE_GAME_TYPE;
  submit(input: NumberTileSubmitInput): Promise<NumberTileSubmitResult>;
  draw(input: NumberTileDrawInput): Promise<NumberTileDrawResult>;
  pass(input: NumberTilePassInput): Promise<NumberTilePassResult>;
}>;

export interface NumberTileCommandRouting {
  submit(input: NumberTileSubmitInput): Promise<NumberTileSubmitResult>;
  draw(input: NumberTileDrawInput): Promise<NumberTileDrawResult>;
  pass(input: NumberTilePassInput): Promise<NumberTilePassResult>;
}

export type NumberTileCommandRouterDependencies = Readonly<{
  roomRepository: Pick<RoomRepository, "findById">;
  capability: NumberTileCommandCapability;
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

function copyCapability(
  capability: NumberTileCommandCapability,
): NumberTileCommandCapability {
  if (
    capability.gameType !== NUMBER_TILE_GAME_TYPE ||
    typeof capability.submit !== "function" ||
    typeof capability.draw !== "function" ||
    typeof capability.pass !== "function"
  ) {
    throw new Error("Number Tile command capability is missing or invalid.");
  }
  return Object.freeze({
    gameType: NUMBER_TILE_GAME_TYPE,
    submit: capability.submit.bind(capability),
    draw: capability.draw.bind(capability),
    pass: capability.pass.bind(capability),
  });
}

function failure(error: ErrorDto): Readonly<{
  ok: false;
  error: ErrorDto;
}> {
  return { ok: false, error };
}

export class NumberTileCommandRouter implements NumberTileCommandRouting {
  readonly #roomRepository: Pick<RoomRepository, "findById">;
  readonly #capability: NumberTileCommandCapability;

  constructor(dependencies: NumberTileCommandRouterDependencies) {
    this.#roomRepository = dependencies.roomRepository;
    this.#capability = copyCapability(dependencies.capability);
    Object.freeze(this);
  }

  async submit(input: NumberTileSubmitInput): Promise<NumberTileSubmitResult> {
    const error = await this.#routingError(input.roomId);
    return error === null
      ? this.#capability.submit(input)
      : failure(error);
  }

  async draw(input: NumberTileDrawInput): Promise<NumberTileDrawResult> {
    const error = await this.#routingError(input.roomId);
    return error === null ? this.#capability.draw(input) : failure(error);
  }

  async pass(input: NumberTilePassInput): Promise<NumberTilePassResult> {
    const error = await this.#routingError(input.roomId);
    return error === null ? this.#capability.pass(input) : failure(error);
  }

  async #routingError(roomId: RoomId): Promise<ErrorDto | null> {
    try {
      const room = await this.#roomRepository.findById(roomId);
      if (room === null) {
        return ROOM_NOT_FOUND_ERROR;
      }
      return room.gameType === this.#capability.gameType
        ? null
        : INTERNAL_ERROR;
    } catch {
      return INTERNAL_ERROR;
    }
  }
}
