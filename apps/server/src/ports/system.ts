import type {
  GameId,
  GameRevision,
  PlayerId,
  RoomCode,
  RoomId,
  ServerTime,
  SessionToken,
  TileId,
  TurnId,
} from "@hangul-rummikub/shared";

export interface Clock {
  /** Current Unix epoch time in milliseconds. */
  now(): ServerTime;
}

export interface RandomSource {
  nextInt(maxExclusive: number): number;
}

export interface IdGenerator {
  generateRoomId(): RoomId;
  generatePlayerId(): PlayerId;
  generateGameId(): GameId;
  generateTurnId(): TurnId;
  generateTileId(): TileId;
}

export interface RoomCodeGenerator {
  generateCandidate(): RoomCode;
}

export type SessionVerificationData = Readonly<{
  algorithm: "SHA-256";
  digestHex: string;
}>;

export type IssuedSessionToken = Readonly<{
  rawToken: SessionToken;
  verificationData: SessionVerificationData;
}>;

export interface SessionTokenIssuer {
  issue(): IssuedSessionToken;
  deriveVerificationData(rawToken: SessionToken): SessionVerificationData;
  verify(
    rawToken: SessionToken,
    verificationData: SessionVerificationData,
  ): boolean;
}

export interface DictionaryProvider {
  isAllowedWord(normalizedWord: string): Promise<boolean>;
}

export type ScheduledTurnDeadline = Readonly<{
  roomId: RoomId;
  gameId: GameId;
  turnId: TurnId;
  expectedGameRevision: GameRevision;
  /** Unix epoch time in milliseconds. */
  deadlineAt: ServerTime;
}>;

export interface TurnScheduler {
  scheduleTimeout(deadline: ScheduledTurnDeadline): Promise<void>;
  cancelTimeout(turnId: TurnId): Promise<void>;
}
