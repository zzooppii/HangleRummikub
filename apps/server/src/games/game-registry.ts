import {
  GameTypeSchema,
  type GameType,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

export type GameRegistration = Readonly<{
  gameType: GameType;
}>;

export interface GameRegistrationReader {
  find(gameTypeInput: unknown): GameRegistration | null;
  getRequired(gameTypeInput: unknown): GameRegistration;
}

function parseGameType(input: unknown): GameType | null {
  const parsed = v.safeParse(GameTypeSchema, input);
  return parsed.success ? parsed.output : null;
}

function copyRegistration(
  registration: GameRegistration,
): GameRegistration {
  return Object.freeze({
    gameType: registration.gameType,
  });
}

export class GameRegistry implements GameRegistrationReader {
  readonly #registrationsByGameType: ReadonlyMap<
    GameType,
    GameRegistration
  >;

  constructor(registrations: readonly GameRegistration[]) {
    const registrationsByGameType = new Map<GameType, GameRegistration>();

    for (const registration of registrations) {
      const gameType = parseGameType(registration.gameType);
      if (gameType === null) {
        throw new Error("Game registration has an unsupported gameType.");
      }
      if (registrationsByGameType.has(gameType)) {
        throw new Error(`Duplicate game registration: ${gameType}.`);
      }

      registrationsByGameType.set(
        gameType,
        copyRegistration({ gameType }),
      );
    }

    this.#registrationsByGameType = registrationsByGameType;
    Object.freeze(this);
  }

  find(gameTypeInput: unknown): GameRegistration | null {
    const gameType = parseGameType(gameTypeInput);
    if (gameType === null) {
      return null;
    }

    return this.#registrationsByGameType.get(gameType) ?? null;
  }

  getRequired(gameTypeInput: unknown): GameRegistration {
    const registration = this.find(gameTypeInput);
    if (registration === null) {
      throw new Error("Game registration was not found.");
    }

    return registration;
  }
}
