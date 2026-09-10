import type { ErrorDto, RoomId } from "@hangul-rummikub/shared";

import type { RoomRepository } from "../ports/room-repository.js";
import type {
  GameStartResult,
  StartGameInput,
} from "./game-start-service.js";

type StartCapability<TGameType extends "HANGUL_TILE" | "NUMBER_TILE" | "GEM_CARD" | "CITY_ROLE" | "DRAW_RELAY" | "SNEAKY_LUNCH" | "WOLF_NIGHT"> =
  Readonly<{
    gameType: TGameType;
    start(input: StartGameInput): Promise<GameStartResult>;
  }>;

export type HangulGameStartCapability = StartCapability<"HANGUL_TILE">;
export type GemCardGameStartCapability = StartCapability<"GEM_CARD">;
export type CityRoleGameStartCapability = StartCapability<"CITY_ROLE">;
export type NumberTileGameStartCapability = StartCapability<"NUMBER_TILE">;

export type GameStartRouterDependencies = Readonly<{
  roomRepository: Pick<RoomRepository, "findById">;
  hangul: HangulGameStartCapability;
  numberTile: NumberTileGameStartCapability;
  gemCard: GemCardGameStartCapability;
  cityRole: CityRoleGameStartCapability;
  wolf?: StartCapability<"WOLF_NIGHT">;
  sneaky?: StartCapability<"SNEAKY_LUNCH">;
  drawRelay?: StartCapability<"DRAW_RELAY">;
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
  TGameType extends "HANGUL_TILE" | "NUMBER_TILE" | "GEM_CARD" | "CITY_ROLE" | "DRAW_RELAY" | "SNEAKY_LUNCH" | "WOLF_NIGHT",
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

function requireCapability<TGameType extends "HANGUL_TILE" | "NUMBER_TILE" | "GEM_CARD" | "CITY_ROLE" | "DRAW_RELAY" | "SNEAKY_LUNCH" | "WOLF_NIGHT">(
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
  readonly #gemCard: GemCardGameStartCapability;
  readonly #cityRole: CityRoleGameStartCapability;
  readonly #wolf: StartCapability<"WOLF_NIGHT"> | undefined;
  readonly #sneaky: StartCapability<"SNEAKY_LUNCH"> | undefined;
  readonly #drawRelay: StartCapability<"DRAW_RELAY"> | undefined;

  constructor(dependencies: GameStartRouterDependencies) {
    this.#roomRepository = dependencies.roomRepository;
    this.#wolf = dependencies.wolf;
    this.#sneaky = dependencies.sneaky;
    this.#drawRelay = dependencies.drawRelay;
    this.#hangul = requireCapability(dependencies.hangul, "HANGUL_TILE");
    this.#numberTile = requireCapability(
      dependencies.numberTile,
      "NUMBER_TILE",
    );
    this.#gemCard = requireCapability(dependencies.gemCard, "GEM_CARD");
    this.#cityRole = requireCapability(dependencies.cityRole, "CITY_ROLE");
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
        case "GEM_CARD":
          return await this.#gemCard.start(input);
        case "WOLF_NIGHT": return this.#wolf ? await this.#wolf.start(input) : {ok:false,error:INTERNAL_ERROR};
        case "SNEAKY_LUNCH": return this.#sneaky ? await this.#sneaky.start(input) : {ok:false,error:INTERNAL_ERROR};
        case "DRAW_RELAY": return this.#drawRelay ? await this.#drawRelay.start(input) : {ok:false,error:INTERNAL_ERROR};
        case "CITY_ROLE":
          return await this.#cityRole.start(input);
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
