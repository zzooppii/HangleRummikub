import {
  createHash,
  randomBytes,
  randomInt,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";

import {
  GameIdSchema,
  PlayerIdSchema,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RoomIdSchema,
  ServerTimeSchema,
  SessionTokenSchema,
  TileIdSchema,
  TurnIdSchema,
  validateRoomCode,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import type {
  Clock,
  IdGenerator,
  IssuedSessionToken,
  RandomSource,
  RoomCodeGenerator,
  SessionTokenIssuer,
  SessionVerificationData,
} from "../ports/system.js";

const MAX_CRYPTO_RANDOM_RANGE = 2 ** 48 - 1;
const SESSION_TOKEN_BYTES = 32;
const SESSION_TOKEN_HASH_ALGORITHM = "SHA-256";
const SESSION_TOKEN_HASH_PATTERN = /^[0-9a-f]{64}$/u;

function requireNonNegativeSafeInteger(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative safe integer.`);
  }
}

function requireRandomUpperBound(maxExclusive: number): void {
  if (
    !Number.isSafeInteger(maxExclusive) ||
    maxExclusive <= 0 ||
    maxExclusive > MAX_CRYPTO_RANDOM_RANGE
  ) {
    throw new RangeError(
      `maxExclusive must be an integer between 1 and ${MAX_CRYPTO_RANDOM_RANGE}.`,
    );
  }
}

export class SystemClock implements Clock {
  now() {
    return parse(ServerTimeSchema, Date.now());
  }
}

export class FakeClock implements Clock {
  private currentTime;

  constructor(initialTimeMs = 0) {
    requireNonNegativeSafeInteger(initialTimeMs, "initialTimeMs");
    this.currentTime = parse(ServerTimeSchema, initialTimeMs);
  }

  now() {
    return this.currentTime;
  }

  set(timeMs: number): void {
    requireNonNegativeSafeInteger(timeMs, "timeMs");
    this.currentTime = parse(ServerTimeSchema, timeMs);
  }

  advance(durationMs: number): void {
    requireNonNegativeSafeInteger(durationMs, "durationMs");

    const nextTimeMs = this.currentTime + durationMs;
    requireNonNegativeSafeInteger(nextTimeMs, "resulting time");
    this.currentTime = parse(ServerTimeSchema, nextTimeMs);
  }
}

export class CryptoRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    requireRandomUpperBound(maxExclusive);
    return randomInt(maxExclusive);
  }
}

export class FakeRandomSource implements RandomSource {
  private readonly values: readonly number[];
  private cursor = 0;

  constructor(values: readonly number[]) {
    this.values = [...values];
  }

  nextInt(maxExclusive: number): number {
    requireRandomUpperBound(maxExclusive);

    const value = this.values[this.cursor];
    if (value === undefined) {
      throw new Error("FakeRandomSource has no remaining values.");
    }
    if (!Number.isSafeInteger(value) || value < 0 || value >= maxExclusive) {
      throw new RangeError(
        "FakeRandomSource value must be within the requested integer range.",
      );
    }

    this.cursor += 1;
    return value;
  }
}

export class NodeCryptoIdGenerator implements IdGenerator {
  generateRoomId() {
    return parse(RoomIdSchema, `room_${randomUUID()}`);
  }

  generatePlayerId() {
    return parse(PlayerIdSchema, `player_${randomUUID()}`);
  }

  generateGameId() {
    return parse(GameIdSchema, `game_${randomUUID()}`);
  }

  generateTurnId() {
    return parse(TurnIdSchema, `turn_${randomUUID()}`);
  }

  generateTileId() {
    return parse(TileIdSchema, `tile_${randomUUID()}`);
  }
}

export class FakeIdGenerator implements IdGenerator {
  private roomSequence = 0;
  private playerSequence = 0;
  private gameSequence = 0;
  private turnSequence = 0;
  private tileSequence = 0;

  generateRoomId() {
    this.roomSequence += 1;
    return parse(RoomIdSchema, `test-room-${this.roomSequence}`);
  }

  generatePlayerId() {
    this.playerSequence += 1;
    return parse(PlayerIdSchema, `test-player-${this.playerSequence}`);
  }

  generateGameId() {
    this.gameSequence += 1;
    return parse(GameIdSchema, `test-game-${this.gameSequence}`);
  }

  generateTurnId() {
    this.turnSequence += 1;
    return parse(TurnIdSchema, `test-turn-${this.turnSequence}`);
  }

  generateTileId() {
    this.tileSequence += 1;
    return parse(TileIdSchema, `test-tile-${this.tileSequence}`);
  }
}

export class RandomRoomCodeGenerator implements RoomCodeGenerator {
  constructor(private readonly randomSource: RandomSource) {}

  generateCandidate() {
    let candidate = "";

    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      const alphabetIndex = this.randomSource.nextInt(
        ROOM_CODE_ALPHABET.length,
      );

      if (
        !Number.isSafeInteger(alphabetIndex) ||
        alphabetIndex < 0 ||
        alphabetIndex >= ROOM_CODE_ALPHABET.length
      ) {
        throw new RangeError(
          "RandomSource returned an index outside the Room code alphabet.",
        );
      }

      candidate += ROOM_CODE_ALPHABET.charAt(alphabetIndex);
    }

    const validation = validateRoomCode(candidate);
    if (!validation.ok) {
      throw new Error("Generated Room code candidate violated its policy.");
    }

    return validation.value;
  }
}

export class NodeCryptoSessionTokenIssuer implements SessionTokenIssuer {
  issue(): IssuedSessionToken {
    const rawToken = parse(
      SessionTokenSchema,
      randomBytes(SESSION_TOKEN_BYTES).toString("base64url"),
    );

    return Object.freeze({
      rawToken,
      verificationData: this.deriveVerificationData(rawToken),
    });
  }

  deriveVerificationData(
    rawToken: IssuedSessionToken["rawToken"],
  ): SessionVerificationData {
    return Object.freeze({
      algorithm: SESSION_TOKEN_HASH_ALGORITHM,
      digestHex: createHash("sha256").update(rawToken, "utf8").digest("hex"),
    });
  }

  verify(
    rawToken: IssuedSessionToken["rawToken"],
    verificationData: SessionVerificationData,
  ): boolean {
    if (
      verificationData.algorithm !== SESSION_TOKEN_HASH_ALGORITHM ||
      !SESSION_TOKEN_HASH_PATTERN.test(verificationData.digestHex)
    ) {
      return false;
    }

    const derived = this.deriveVerificationData(rawToken);
    const suppliedDigest = Buffer.from(verificationData.digestHex, "utf8");
    const derivedDigest = Buffer.from(derived.digestHex, "utf8");

    return (
      suppliedDigest.length === derivedDigest.length &&
      timingSafeEqual(suppliedDigest, derivedDigest)
    );
  }
}
