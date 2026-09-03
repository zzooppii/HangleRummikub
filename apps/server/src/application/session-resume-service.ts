import {
  validateBoundPlayerCredential,
  type ErrorDto,
  type PlayerId,
  type RoomCode,
  type RoomId,
} from "@hangul-rummikub/shared";

import type { RoomRecord } from "../model/persistence.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type { SessionRepository } from "../ports/session-repository.js";
import type { SessionTokenIssuer } from "../ports/system.js";

export type ResumeSessionInput = Readonly<{
  sessionToken: unknown;
  roomCode: unknown;
}>;

export type ResumeSessionContext = Readonly<{
  roomId: RoomId;
  roomCode: RoomCode;
  playerId: PlayerId;
  /** Server-internal canonical state for an immediate player projection. */
  room: RoomRecord;
}>;

export type ResumeSessionResult =
  | Readonly<{ ok: true; data: ResumeSessionContext }>
  | Readonly<{ ok: false; error: ErrorDto }>;

export type SessionResumeServiceDependencies = Readonly<{
  sessionRepository: SessionRepository;
  roomRepository: RoomRepository;
  sessionTokenIssuer: SessionTokenIssuer;
}>;

const SESSION_NOT_FOUND_ERROR: ErrorDto = Object.freeze({
  code: "SESSION_NOT_FOUND",
  message: "Player session was not found.",
  recoverable: false,
});

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

export class SessionResumeService {
  readonly #sessionRepository: SessionRepository;
  readonly #roomRepository: RoomRepository;
  readonly #sessionTokenIssuer: SessionTokenIssuer;

  constructor(dependencies: SessionResumeServiceDependencies) {
    this.#sessionRepository = dependencies.sessionRepository;
    this.#roomRepository = dependencies.roomRepository;
    this.#sessionTokenIssuer = dependencies.sessionTokenIssuer;
  }

  async resumeSession(input: ResumeSessionInput): Promise<ResumeSessionResult> {
    try {
      const credential = validateBoundPlayerCredential({
        sessionToken: input.sessionToken,
        roomCode: input.roomCode,
      });
      if (!credential.ok) {
        return { ok: false, error: SESSION_NOT_FOUND_ERROR };
      }

      const verificationData =
        this.#sessionTokenIssuer.deriveVerificationData(
          credential.value.sessionToken,
        );
      const session = await this.#sessionRepository.findByVerificationData(
        verificationData,
      );
      if (
        session === null ||
        session.state !== "BOUND" ||
        !this.#sessionTokenIssuer.verify(
          credential.value.sessionToken,
          session.verificationData,
        )
      ) {
        return { ok: false, error: SESSION_NOT_FOUND_ERROR };
      }

      const room = await this.#roomRepository.findById(session.roomId);
      if (room === null) {
        return { ok: false, error: ROOM_NOT_FOUND_ERROR };
      }
      if (room.roomCode !== credential.value.roomCode) {
        return { ok: false, error: SESSION_NOT_FOUND_ERROR };
      }
      if (!room.players.some((player) => player.playerId === session.playerId)) {
        return { ok: false, error: SESSION_NOT_FOUND_ERROR };
      }

      return {
        ok: true,
        data: {
          roomId: room.roomId,
          roomCode: room.roomCode,
          playerId: session.playerId,
          room,
        },
      };
    } catch {
      return { ok: false, error: INTERNAL_ERROR };
    }
  }
}

