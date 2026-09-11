import type { ErrorDto, RoomId } from "@hangul-rummikub/shared";

import type { RoomRepository } from "../ports/room-repository.js";
import type {
  GameStartResult,
  StartGameInput,
} from "./game-start-service.js";

type StartCapability<TGameType extends "HANGUL_TILE" | "NUMBER_TILE" | "GEM_CARD" | "CITY_ROLE" | "DRAW_RELAY" | "SNEAKY_LUNCH" | "WOLF_NIGHT" | "LIAR_GAME" | "SPLENDOR" | "WORD_DUET" | "JAIPUR" | "AZUL" | "SABOTEUR" | "LOST_CITIES" | "HALLI_GALLI" | "ISLAND_SETTLERS"> =
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
  island?: StartCapability<"ISLAND_SETTLERS">;
  splendor?: StartCapability<"SPLENDOR">;
  jaipur?: StartCapability<"JAIPUR">;
  azul?: StartCapability<"AZUL">;
  duet?: StartCapability<"WORD_DUET">;
  saboteur?: StartCapability<"SABOTEUR">;
  lostCities?: StartCapability<"LOST_CITIES">;
  halli?: StartCapability<"HALLI_GALLI">;
  wolf?: StartCapability<"WOLF_NIGHT">;
  liar?: StartCapability<"LIAR_GAME">;
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
  TGameType extends "HANGUL_TILE" | "NUMBER_TILE" | "GEM_CARD" | "CITY_ROLE" | "DRAW_RELAY" | "SNEAKY_LUNCH" | "WOLF_NIGHT" | "LIAR_GAME" | "SPLENDOR" | "WORD_DUET" | "JAIPUR" | "AZUL" | "SABOTEUR" | "LOST_CITIES" | "HALLI_GALLI" | "ISLAND_SETTLERS",
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

function requireCapability<TGameType extends "HANGUL_TILE" | "NUMBER_TILE" | "GEM_CARD" | "CITY_ROLE" | "DRAW_RELAY" | "SNEAKY_LUNCH" | "WOLF_NIGHT" | "LIAR_GAME" | "SPLENDOR" | "WORD_DUET" | "JAIPUR" | "AZUL" | "SABOTEUR" | "LOST_CITIES" | "HALLI_GALLI" | "ISLAND_SETTLERS">(
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
  readonly #island: StartCapability<"ISLAND_SETTLERS"> | undefined;
  readonly #splendor: StartCapability<"SPLENDOR"> | undefined;
  readonly #jaipur: StartCapability<"JAIPUR"> | undefined;
  readonly #azul: StartCapability<"AZUL"> | undefined;
  readonly #duet: StartCapability<"WORD_DUET"> | undefined;
  readonly #saboteur: StartCapability<"SABOTEUR"> | undefined;
  readonly #lostCities: StartCapability<"LOST_CITIES"> | undefined;
  readonly #halli: StartCapability<"HALLI_GALLI"> | undefined;
  readonly #wolf: StartCapability<"WOLF_NIGHT"> | undefined;
  readonly #liar: StartCapability<"LIAR_GAME"> | undefined;
  readonly #sneaky: StartCapability<"SNEAKY_LUNCH"> | undefined;
  readonly #drawRelay: StartCapability<"DRAW_RELAY"> | undefined;

  constructor(dependencies: GameStartRouterDependencies) {
    this.#roomRepository = dependencies.roomRepository;
    this.#island = dependencies.island;
    this.#splendor = dependencies.splendor;
    this.#jaipur = dependencies.jaipur;
    this.#azul = dependencies.azul;
    this.#duet = dependencies.duet;
    this.#saboteur = dependencies.saboteur;
    this.#lostCities = dependencies.lostCities;
    this.#halli = dependencies.halli;
    this.#wolf = dependencies.wolf;
    this.#liar = dependencies.liar;
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
        case "ISLAND_SETTLERS": return this.#island ? await this.#island.start(input) : {ok:false,error:INTERNAL_ERROR};
        case "SPLENDOR": return this.#splendor ? await this.#splendor.start(input) : {ok:false,error:INTERNAL_ERROR};
        case "JAIPUR": return this.#jaipur ? await this.#jaipur.start(input) : {ok:false,error:INTERNAL_ERROR};
        case "AZUL": return this.#azul ? await this.#azul.start(input) : {ok:false,error:INTERNAL_ERROR};
        case "WORD_DUET": return this.#duet ? await this.#duet.start(input) : {ok:false,error:INTERNAL_ERROR};
        case "SABOTEUR": return this.#saboteur ? await this.#saboteur.start(input) : {ok:false,error:INTERNAL_ERROR};
        case "LOST_CITIES": return this.#lostCities ? await this.#lostCities.start(input) : {ok:false,error:INTERNAL_ERROR};
        case "HALLI_GALLI": return this.#halli ? await this.#halli.start(input) : {ok:false,error:INTERNAL_ERROR};
        case "WOLF_NIGHT": return this.#wolf ? await this.#wolf.start(input) : {ok:false,error:INTERNAL_ERROR};
        case "LIAR_GAME": return this.#liar ? await this.#liar.start(input) : {ok:false,error:INTERNAL_ERROR};
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
