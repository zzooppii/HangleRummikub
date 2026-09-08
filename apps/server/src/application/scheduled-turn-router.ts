import type { RoomRepository } from "../ports/room-repository.js";
import type { ScheduledTurnDeadline } from "../ports/system.js";

export type ScheduledTurnDispatchResult =
  | Readonly<{ status: "APPLIED" }>
  | Readonly<{ status: "NO_OP" }>
  | Readonly<{ status: "FAILED" }>;

type ScheduledTurnCapability<
  TGameType extends "HANGUL_TILE" | "NUMBER_TILE" | "GEM_CARD" | "CITY_ROLE",
> = Readonly<{
  gameType: TGameType;
  handleTurnTimeout(
    input: ScheduledTurnDeadline,
  ): Promise<ScheduledTurnDispatchResult>;
}>;

export type HangulScheduledTurnCapability =
  ScheduledTurnCapability<"HANGUL_TILE">;
export type GemCardScheduledTurnCapability = ScheduledTurnCapability<"GEM_CARD">;
export type CityRoleScheduledTurnCapability = ScheduledTurnCapability<"CITY_ROLE">;
export type NumberTileScheduledTurnCapability =
  ScheduledTurnCapability<"NUMBER_TILE">;

export type ScheduledTurnRouterDependencies = Readonly<{
  roomRepository: Pick<RoomRepository, "findById">;
  hangul: HangulScheduledTurnCapability;
  numberTile: NumberTileScheduledTurnCapability;
  gemCard: GemCardScheduledTurnCapability;
  cityRole: CityRoleScheduledTurnCapability;
}>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCapability<
  TGameType extends "HANGUL_TILE" | "NUMBER_TILE" | "GEM_CARD" | "CITY_ROLE",
>(
  value: unknown,
  gameType: TGameType,
): value is ScheduledTurnCapability<TGameType> {
  return (
    isRecord(value) &&
    value.gameType === gameType &&
    typeof value.handleTurnTimeout === "function"
  );
}

function requireCapability<
  TGameType extends "HANGUL_TILE" | "NUMBER_TILE" | "GEM_CARD" | "CITY_ROLE",
>(
  value: unknown,
  gameType: TGameType,
): ScheduledTurnCapability<TGameType> {
  if (!isCapability(value, gameType)) {
    throw new Error(`Missing ${gameType} scheduled-turn capability.`);
  }
  return Object.freeze({
    gameType,
    handleTurnTimeout: value.handleTurnTimeout.bind(value),
  });
}

/** Dispatches the shared timer mechanism without generalizing game timeout rules. */
export class ScheduledTurnRouter {
  readonly #roomRepository: Pick<RoomRepository, "findById">;
  readonly #hangul: HangulScheduledTurnCapability;
  readonly #numberTile: NumberTileScheduledTurnCapability;
  readonly #gemCard: GemCardScheduledTurnCapability;
  readonly #cityRole: CityRoleScheduledTurnCapability;

  constructor(dependencies: ScheduledTurnRouterDependencies) {
    this.#roomRepository = dependencies.roomRepository;
    this.#hangul = requireCapability(dependencies.hangul, "HANGUL_TILE");
    this.#numberTile = requireCapability(
      dependencies.numberTile,
      "NUMBER_TILE",
    );
    this.#gemCard = requireCapability(dependencies.gemCard, "GEM_CARD");
    this.#cityRole = requireCapability(dependencies.cityRole, "CITY_ROLE");
    Object.freeze(this);
  }

  async handleTurnTimeout(
    input: ScheduledTurnDeadline,
  ): Promise<ScheduledTurnDispatchResult> {
    try {
      const room = await this.#roomRepository.findById(input.roomId);
      if (room === null) {
        return { status: "NO_OP" };
      }
      switch (room.gameType) {
        case "HANGUL_TILE":
          return await this.#hangul.handleTurnTimeout(input);
        case "GEM_CARD":
          return await this.#gemCard.handleTurnTimeout(input);
        case "CITY_ROLE":
          return await this.#cityRole.handleTurnTimeout(input);
        case "NUMBER_TILE":
          return await this.#numberTile.handleTurnTimeout(input);
      }
    } catch {
      return { status: "FAILED" };
    }
  }
}
