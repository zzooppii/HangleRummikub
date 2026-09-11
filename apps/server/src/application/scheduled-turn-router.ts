import type { RoomRepository } from "../ports/room-repository.js";
import type { ScheduledTurnDeadline } from "../ports/system.js";

export type ScheduledTurnDispatchResult =
  | Readonly<{ status: "APPLIED" }>
  | Readonly<{ status: "NO_OP" }>
  | Readonly<{ status: "FAILED" }>;

type ScheduledTurnCapability<
  TGameType extends "HANGUL_TILE" | "NUMBER_TILE" | "GEM_CARD" | "CITY_ROLE" | "DRAW_RELAY" | "SNEAKY_LUNCH" | "WOLF_NIGHT" | "LIAR_GAME" | "SPLENDOR" | "HALLI_GALLI" | "ISLAND_SETTLERS" | "SABOTEUR",
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
  saboteur?: ScheduledTurnCapability<"SABOTEUR">;
  island?: ScheduledTurnCapability<"ISLAND_SETTLERS">;
  splendor?: ScheduledTurnCapability<"SPLENDOR">;
  halli?: ScheduledTurnCapability<"HALLI_GALLI">;
  wolf?: ScheduledTurnCapability<"WOLF_NIGHT">;
  liar?: ScheduledTurnCapability<"LIAR_GAME">;
  sneaky?: ScheduledTurnCapability<"SNEAKY_LUNCH">;
  drawRelay?: ScheduledTurnCapability<"DRAW_RELAY">;
}>;

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isCapability<
  TGameType extends "HANGUL_TILE" | "NUMBER_TILE" | "GEM_CARD" | "CITY_ROLE" | "DRAW_RELAY" | "SNEAKY_LUNCH" | "WOLF_NIGHT" | "LIAR_GAME" | "SPLENDOR" | "HALLI_GALLI" | "ISLAND_SETTLERS" | "SABOTEUR",
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
  TGameType extends "HANGUL_TILE" | "NUMBER_TILE" | "GEM_CARD" | "CITY_ROLE" | "DRAW_RELAY" | "SNEAKY_LUNCH" | "WOLF_NIGHT" | "LIAR_GAME" | "SPLENDOR" | "HALLI_GALLI" | "ISLAND_SETTLERS" | "SABOTEUR",
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
  readonly #saboteur: ScheduledTurnCapability<"SABOTEUR"> | undefined;
  readonly #island: ScheduledTurnCapability<"ISLAND_SETTLERS"> | undefined;
  readonly #splendor: ScheduledTurnCapability<"SPLENDOR"> | undefined;
  readonly #halli: ScheduledTurnCapability<"HALLI_GALLI"> | undefined;
  readonly #wolf: ScheduledTurnCapability<"WOLF_NIGHT"> | undefined;
  readonly #liar: ScheduledTurnCapability<"LIAR_GAME"> | undefined;
  readonly #sneaky: ScheduledTurnCapability<"SNEAKY_LUNCH"> | undefined;
  readonly #drawRelay: ScheduledTurnCapability<"DRAW_RELAY"> | undefined;

  constructor(dependencies: ScheduledTurnRouterDependencies) {
    this.#roomRepository = dependencies.roomRepository;
    this.#saboteur = dependencies.saboteur;
    this.#island = dependencies.island;
    this.#splendor = dependencies.splendor;
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

  async handleTurnTimeout(
    input: ScheduledTurnDeadline,
  ): Promise<ScheduledTurnDispatchResult> {
    try {
      const room = await this.#roomRepository.findById(input.roomId);
      if (room === null) {
        return { status: "NO_OP" };
      }
      switch (room.gameType) {
        case "JAIPUR": return { status: "NO_OP" };
        case "WORD_DUET": return { status: "NO_OP" };
        case "SABOTEUR": return this.#saboteur ? await this.#saboteur.handleTurnTimeout(input) : {status:"FAILED"};
        case "LOST_CITIES": return { status: "NO_OP" };
        case "HANGUL_TILE":
          return await this.#hangul.handleTurnTimeout(input);
        case "GEM_CARD":
          return await this.#gemCard.handleTurnTimeout(input);
        case "ISLAND_SETTLERS": return this.#island ? await this.#island.handleTurnTimeout(input) : {status:"FAILED"};
        case "SPLENDOR": return this.#splendor ? await this.#splendor.handleTurnTimeout(input) : {status:"FAILED"};
        case "HALLI_GALLI": return this.#halli ? await this.#halli.handleTurnTimeout(input) : {status:"FAILED"};
        case "WOLF_NIGHT": return this.#wolf ? await this.#wolf.handleTurnTimeout(input) : {status:"FAILED"};
        case "LIAR_GAME": return this.#liar ? await this.#liar.handleTurnTimeout(input) : {status:"FAILED"};
        case "SNEAKY_LUNCH": return this.#sneaky ? await this.#sneaky.handleTurnTimeout(input) : {status:"FAILED"};
        case "DRAW_RELAY": return this.#drawRelay ? await this.#drawRelay.handleTurnTimeout(input) : {status:"FAILED"};
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
