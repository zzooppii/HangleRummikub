import type { ErrorDto, RoomId } from "@hangul-rummikub/shared";

import type { RoomRepository } from "../ports/room-repository.js";
import type {
  GameStartResult,
  StartGameInput,
} from "./game-start-service.js";

type StartCapability<TGameType extends "HANGUL_TILE" | "NUMBER_TILE"> =
  Readonly<{
    gameType: TGameType;
    start(input: StartGameInput): Promise<GameStartResult>;
  }>;

export type HangulGameStartCapability = StartCapability<"HANGUL_TILE">;
export type NumberTileGameStartCapability = StartCapability<"NUMBER_TILE">;

export type GameStartRouterDependencies = Readonly<{
  roomRepository: Pick<RoomRepository, "findById">;
  hangul: HangulGameStartCapability;
  numberTile: NumberTileGameStartCapability;
}>;

export interface GameStartRouting {
  start(input: StartGameInput): Promise<GameStartResult>;
}

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

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isStartCapability<
  TGameType extends "HANGUL_TILE" | "NUMBER_TILE",
>(
  value: unknown,
  gameType: TGameType,
): value is StartCapability<TGameType> {
  return (
    isRecord(value) &&
    value.gameType === gameType &&
    typeof value.start === "function"
  );
}

function requireCapability<TGameType extends "HANGUL_TILE" | "NUMBER_TILE">(
  value: unknown,
  gameType: TGameType,
): StartCapability<TGameType> {
  if (!isStartCapability(value, gameType)) {
    throw new Error(`Missing ${gameType} start capability.`);
  }

  return Object.freeze({
    gameType,
    start: value.start.bind(value),
  });
}

/** Routes only the shared game:start command by immutable canonical Room type. */
export class GameStartRouter implements GameStartRouting {
  readonly #roomRepository: Pick<RoomRepository, "findById">;
  readonly #hangul: HangulGameStartCapability;
  readonly #numberTile: NumberTileGameStartCapability;

  constructor(dependencies: GameStartRouterDependencies) {
    this.#roomRepository = dependencies.roomRepository;
    this.#hangul = requireCapability(dependencies.hangul, "HANGUL_TILE");
    this.#numberTile = requireCapability(
      dependencies.numberTile,
      "NUMBER_TILE",
    );
    Object.freeze(this);
  }

  async start(input: StartGameInput): Promise<GameStartResult> {
    try {
      const room = await this.#findRoom(input.roomId);
      if (room === null) {
        return { ok: false, error: ROOM_NOT_FOUND_ERROR };
      }

      switch (room.gameType) {
        case "HANGUL_TILE":
          return await this.#hangul.start(input);
        case "NUMBER_TILE":
          return await this.#numberTile.start(input);
      }
    } catch {
      return { ok: false, error: INTERNAL_ERROR };
    }
  }

  async #findRoom(roomId: RoomId) {
    return this.#roomRepository.findById(roomId);
  }
}
