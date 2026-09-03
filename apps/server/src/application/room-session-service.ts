import {
  PlayerIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  validateBootstrapCredential,
  validateNickname,
  validateRequestId,
  validateRoomCode,
  type ErrorDto,
  type Nickname,
  type RequestId,
  type RoomCode,
  type RoomId,
  type RoomRevision,
  type ServerTime,
  type SessionToken,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import {
  createUnboundSessionRecord,
  type IdempotencyRecord,
  type RoomWriteCandidate,
} from "../model/persistence.js";
import type { IdempotencyRepository } from "../ports/idempotency-repository.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type {
  RoomUnitOfWork,
  RoomUnitOfWorkFailure,
  RoomUnitOfWorkResult,
} from "../ports/room-unit-of-work.js";
import type { SessionRepository } from "../ports/session-repository.js";
import type {
  Clock,
  IdGenerator,
  RoomCodeGenerator,
  SessionTokenIssuer,
  SessionVerificationData,
} from "../ports/system.js";

export const MAX_ROOM_CODE_ATTEMPTS = 10;
export const MAX_ROOM_PLAYERS = 4;

export const RoomMutationSuccessDataSchema = v.strictObject({
  roomId: RoomIdSchema,
  roomCode: RoomCodeSchema,
  playerId: PlayerIdSchema,
  roomRevision: RoomRevisionSchema,
});

export type RoomMutationSuccessData = v.InferOutput<
  typeof RoomMutationSuccessDataSchema
>;

export type ApplicationResult<TData> =
  | Readonly<{ ok: true; data: TData }>
  | Readonly<{ ok: false; error: ErrorDto }>;

export type BootstrapSessionSuccessData = Readonly<{
  sessionToken: SessionToken;
  issuedAt: ServerTime;
  expiresAt: ServerTime;
}>;

export type BootstrapSessionResult = ApplicationResult<BootstrapSessionSuccessData>;
export type RoomMutationResult = ApplicationResult<RoomMutationSuccessData>;

export type CreateRoomInput = Readonly<{
  sessionToken: unknown;
  requestId: unknown;
  nickname: unknown;
}>;

export type JoinRoomInput = Readonly<{
  sessionToken: unknown;
  requestId: unknown;
  roomCode: unknown;
  nickname: unknown;
}>;

export interface RoomMutationSerialExecutor {
  run<TResult>(
    roomId: RoomId,
    task: () => Promise<TResult>,
  ): Promise<TResult>;
}

export type RoomSessionApplicationDependencies = Readonly<{
  roomRepository: RoomRepository;
  sessionRepository: SessionRepository;
  idempotencyRepository: IdempotencyRepository;
  roomUnitOfWork: RoomUnitOfWork;
  clock: Clock;
  idGenerator: IdGenerator;
  roomCodeGenerator: RoomCodeGenerator;
  sessionTokenIssuer: SessionTokenIssuer;
  roomMutationExecutor: RoomMutationSerialExecutor;
}>;

type PreparedMutation = Readonly<{
  requestId: RequestId;
  verificationData: SessionVerificationData;
  scopeKey: string;
}>;

type IdempotencyPreflight =
  | Readonly<{ status: "MISS" }>
  | Readonly<{ status: "RESULT"; result: RoomMutationResult }>;

const INVALID_BOOTSTRAP_ERROR: ErrorDto = Object.freeze({
  code: "UNAUTHENTICATED",
  message: "Bootstrap credential is invalid or expired.",
  recoverable: false,
});

const REQUEST_ID_REUSED_ERROR: ErrorDto = Object.freeze({
  code: "REQUEST_ID_REUSED",
  message: "Request ID was already used for a different command payload.",
  recoverable: false,
});

const ROOM_NOT_FOUND_ERROR: ErrorDto = Object.freeze({
  code: "ROOM_NOT_FOUND",
  message: "Room was not found.",
  recoverable: true,
});

const ROOM_NOT_JOINABLE_ERROR: ErrorDto = Object.freeze({
  code: "ROOM_NOT_JOINABLE",
  message: "Room is not open for new players.",
  recoverable: false,
});

const ROOM_FULL_ERROR: ErrorDto = Object.freeze({
  code: "ROOM_FULL",
  message: "Room is full.",
  recoverable: false,
});

const NICKNAME_TAKEN_ERROR: ErrorDto = Object.freeze({
  code: "NICKNAME_TAKEN",
  message: "Nickname is already in use in this Room.",
  recoverable: true,
});

const ROOM_CODE_EXHAUSTED_ERROR: ErrorDto = Object.freeze({
  code: "ROOM_CODE_EXHAUSTED",
  message: "A unique Room code could not be allocated.",
  recoverable: true,
});

const TEMPORARILY_UNAVAILABLE_ERROR: ErrorDto = Object.freeze({
  code: "TEMPORARILY_UNAVAILABLE",
  message: "The operation could not be completed right now.",
  recoverable: true,
});

const INTERNAL_ERROR: ErrorDto = Object.freeze({
  code: "INTERNAL_ERROR",
  message: "An internal error occurred.",
  recoverable: false,
});

function succeeded<TData>(data: TData): ApplicationResult<TData> {
  return { ok: true, data };
}

function failed<TData>(error: ErrorDto): ApplicationResult<TData> {
  return { ok: false, error };
}

function bootstrapScopeKey(
  verificationData: SessionVerificationData,
): string {
  return `bootstrap:${verificationData.algorithm}:${verificationData.digestHex}`;
}

function createRoomFingerprint(nickname: Nickname): string {
  return JSON.stringify(["room:create", nickname]);
}

function joinRoomFingerprint(
  roomCode: RoomCode,
  nickname: Nickname,
): string {
  return JSON.stringify(["room:join", roomCode, nickname]);
}

function initialRoomRevision(): RoomRevision {
  return v.parse(RoomRevisionSchema, 0);
}

function nextRoomRevision(current: RoomRevision): RoomRevision {
  return v.parse(RoomRevisionSchema, current + 1);
}

function parseAcceptedResult(
  terminalResult: IdempotencyRecord["terminalResult"],
): RoomMutationResult {
  const parsed = v.safeParse(RoomMutationSuccessDataSchema, terminalResult);
  return parsed.success
    ? succeeded(parsed.output)
    : failed(INTERNAL_ERROR);
}

function isCredentialPreconditionFailure(
  reason: RoomUnitOfWorkFailure,
): boolean {
  return (
    reason === "SESSION_NOT_FOUND" ||
    reason === "SESSION_ALREADY_BOUND" ||
    reason === "SESSION_EXPIRED"
  );
}

export class RoomSessionApplicationService {
  readonly #roomRepository: RoomRepository;
  readonly #sessionRepository: SessionRepository;
  readonly #idempotencyRepository: IdempotencyRepository;
  readonly #roomUnitOfWork: RoomUnitOfWork;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #roomCodeGenerator: RoomCodeGenerator;
  readonly #sessionTokenIssuer: SessionTokenIssuer;
  readonly #roomMutationExecutor: RoomMutationSerialExecutor;

  constructor(dependencies: RoomSessionApplicationDependencies) {
    this.#roomRepository = dependencies.roomRepository;
    this.#sessionRepository = dependencies.sessionRepository;
    this.#idempotencyRepository = dependencies.idempotencyRepository;
    this.#roomUnitOfWork = dependencies.roomUnitOfWork;
    this.#clock = dependencies.clock;
    this.#idGenerator = dependencies.idGenerator;
    this.#roomCodeGenerator = dependencies.roomCodeGenerator;
    this.#sessionTokenIssuer = dependencies.sessionTokenIssuer;
    this.#roomMutationExecutor = dependencies.roomMutationExecutor;
  }

  async bootstrapSession(): Promise<BootstrapSessionResult> {
    try {
      const issuedAt = this.#clock.now();
      const issued = this.#sessionTokenIssuer.issue();
      const session = createUnboundSessionRecord(
        issued.verificationData,
        issuedAt,
      );
      const saved = await this.#sessionRepository.saveUnbound(session);

      if (saved.status !== "SAVED") {
        return failed(INTERNAL_ERROR);
      }

      return succeeded({
        sessionToken: issued.rawToken,
        issuedAt: saved.session.issuedAt,
        expiresAt: saved.session.expiresAt,
      });
    } catch {
      return failed(INTERNAL_ERROR);
    }
  }

  async createRoom(input: CreateRoomInput): Promise<RoomMutationResult> {
    try {
      const nickname = validateNickname(input.nickname);
      if (!nickname.ok) {
        return failed(nickname.error);
      }

      const prepared = this.#prepareMutation(input.sessionToken, input.requestId);
      if (!prepared.ok) {
        return prepared.result;
      }

      const fingerprint = createRoomFingerprint(nickname.value);
      const prior = await this.#idempotencyPreflight(
        prepared.value,
        fingerprint,
      );
      if (prior.status === "RESULT") {
        return prior.result;
      }

      if (!(await this.#isValidUnboundSession(prepared.value))) {
        return await this.#rejectAfterIdempotencyRecheck(
          prepared.value,
          fingerprint,
          INVALID_BOOTSTRAP_ERROR,
        );
      }

      return await this.#createRoom(
        prepared.value,
        nickname.value,
        fingerprint,
      );
    } catch {
      return failed(INTERNAL_ERROR);
    }
  }

  async joinRoom(input: JoinRoomInput): Promise<RoomMutationResult> {
    try {
      const nickname = validateNickname(input.nickname);
      if (!nickname.ok) {
        return failed(nickname.error);
      }

      const roomCode = validateRoomCode(input.roomCode);
      if (!roomCode.ok) {
        return failed(roomCode.error);
      }

      const prepared = this.#prepareMutation(input.sessionToken, input.requestId);
      if (!prepared.ok) {
        return prepared.result;
      }

      const fingerprint = joinRoomFingerprint(
        roomCode.value,
        nickname.value,
      );
      const prior = await this.#idempotencyPreflight(
        prepared.value,
        fingerprint,
      );
      if (prior.status === "RESULT") {
        return prior.result;
      }

      if (!(await this.#isValidUnboundSession(prepared.value))) {
        return await this.#rejectAfterIdempotencyRecheck(
          prepared.value,
          fingerprint,
          INVALID_BOOTSTRAP_ERROR,
        );
      }

      const locatedRoom = await this.#roomRepository.findByCode(roomCode.value);
      if (locatedRoom === null) {
        return await this.#rejectAfterIdempotencyRecheck(
          prepared.value,
          fingerprint,
          ROOM_NOT_FOUND_ERROR,
        );
      }

      return await this.#roomMutationExecutor.run(locatedRoom.roomId, () =>
        this.#joinRoomInSerializationBoundary(
          prepared.value,
          roomCode.value,
          nickname.value,
          fingerprint,
          locatedRoom.roomId,
        ),
      );
    } catch {
      return failed(INTERNAL_ERROR);
    }
  }

  #prepareMutation(
    rawSessionToken: unknown,
    rawRequestId: unknown,
  ):
    | Readonly<{ ok: true; value: PreparedMutation }>
    | Readonly<{ ok: false; result: RoomMutationResult }> {
    const requestId = validateRequestId(rawRequestId);
    if (!requestId.ok) {
      return { ok: false, result: failed(requestId.error) };
    }

    const credential = validateBootstrapCredential({
      sessionToken: rawSessionToken,
    });
    if (!credential.ok) {
      return { ok: false, result: failed(INVALID_BOOTSTRAP_ERROR) };
    }

    const verificationData =
      this.#sessionTokenIssuer.deriveVerificationData(
        credential.value.sessionToken,
      );

    return {
      ok: true,
      value: {
        requestId: requestId.value,
        verificationData,
        scopeKey: bootstrapScopeKey(verificationData),
      },
    };
  }

  async #idempotencyPreflight(
    prepared: PreparedMutation,
    fingerprint: string,
  ): Promise<IdempotencyPreflight> {
    const existing = await this.#idempotencyRepository.classify(
      prepared.scopeKey,
      prepared.requestId,
      fingerprint,
    );

    switch (existing.status) {
      case "MISS":
        return { status: "MISS" };
      case "REPLAY":
        return {
          status: "RESULT",
          result: parseAcceptedResult(existing.record.terminalResult),
        };
      case "CONFLICT":
        return {
          status: "RESULT",
          result: failed(REQUEST_ID_REUSED_ERROR),
        };
    }
  }

  async #isValidUnboundSession(
    prepared: PreparedMutation,
  ): Promise<boolean> {
    const session = await this.#sessionRepository.findByVerificationData(
      prepared.verificationData,
    );

    return (
      session !== null &&
      session.state === "UNBOUND" &&
      this.#clock.now() < session.expiresAt
    );
  }

  async #rejectAfterIdempotencyRecheck(
    prepared: PreparedMutation,
    fingerprint: string,
    fallbackError: ErrorDto,
  ): Promise<RoomMutationResult> {
    const lateResult = await this.#idempotencyPreflight(
      prepared,
      fingerprint,
    );
    return lateResult.status === "RESULT"
      ? lateResult.result
      : failed(fallbackError);
  }

  async #createRoom(
    prepared: PreparedMutation,
    nickname: Nickname,
    fingerprint: string,
  ): Promise<RoomMutationResult> {
    const roomId = this.#idGenerator.generateRoomId();
    const playerId = this.#idGenerator.generatePlayerId();
    const createdAt = this.#clock.now();
    const roomRevision = initialRoomRevision();

    for (
      let attempt = 0;
      attempt < MAX_ROOM_CODE_ATTEMPTS;
      attempt += 1
    ) {
      const roomCode = this.#roomCodeGenerator.generateCandidate();
      const terminalResult: RoomMutationSuccessData = {
        roomId,
        roomCode,
        playerId,
        roomRevision,
      };
      const now = this.#clock.now();
      const result = await this.#roomUnitOfWork.commit({
        roomMutation: {
          kind: "CREATE",
          candidate: {
            roomId,
            roomCode,
            phase: "LOBBY",
            hostPlayerId: playerId,
            players: [{ playerId, nickname, joinOrder: 0 }],
            game: null,
            roomRevision,
            createdAt,
            updatedAt: createdAt,
          },
        },
        sessionMutation: {
          kind: "PROMOTE_UNBOUND",
          verificationData: prepared.verificationData,
          roomId,
          playerId,
          now,
        },
        idempotency: this.#idempotencyRecord(
          prepared,
          fingerprint,
          terminalResult,
          now,
        ),
      });

      if (
        result.status === "PRECONDITION_FAILED" &&
        result.reason === "ROOM_CODE_CONFLICT"
      ) {
        continue;
      }

      return this.#mapCreateCommitResult(result);
    }

    const lateResult = await this.#idempotencyPreflight(
      prepared,
      fingerprint,
    );
    if (lateResult.status === "RESULT") {
      return lateResult.result;
    }

    return failed(ROOM_CODE_EXHAUSTED_ERROR);
  }

  async #joinRoomInSerializationBoundary(
    prepared: PreparedMutation,
    roomCode: RoomCode,
    nickname: Nickname,
    fingerprint: string,
    roomId: RoomId,
  ): Promise<RoomMutationResult> {
    const prior = await this.#idempotencyPreflight(prepared, fingerprint);
    if (prior.status === "RESULT") {
      return prior.result;
    }

    if (!(await this.#isValidUnboundSession(prepared))) {
      return await this.#rejectAfterIdempotencyRecheck(
        prepared,
        fingerprint,
        INVALID_BOOTSTRAP_ERROR,
      );
    }

    const room = await this.#roomRepository.findById(roomId);
    if (room === null || room.roomCode !== roomCode) {
      return await this.#rejectAfterIdempotencyRecheck(
        prepared,
        fingerprint,
        ROOM_NOT_FOUND_ERROR,
      );
    }
    if (room.phase !== "LOBBY") {
      return await this.#rejectAfterIdempotencyRecheck(
        prepared,
        fingerprint,
        ROOM_NOT_JOINABLE_ERROR,
      );
    }
    if (room.players.length >= MAX_ROOM_PLAYERS) {
      return await this.#rejectAfterIdempotencyRecheck(
        prepared,
        fingerprint,
        ROOM_FULL_ERROR,
      );
    }
    if (room.players.some((player) => player.nickname === nickname)) {
      return await this.#rejectAfterIdempotencyRecheck(
        prepared,
        fingerprint,
        NICKNAME_TAKEN_ERROR,
      );
    }

    const playerId = this.#idGenerator.generatePlayerId();
    const nextJoinOrder =
      room.players.reduce(
        (maximum, player) => Math.max(maximum, player.joinOrder),
        -1,
      ) + 1;
    const roomRevision = nextRoomRevision(room.roomRevision);
    const now = this.#clock.now();
    const terminalResult: RoomMutationSuccessData = {
      roomId: room.roomId,
      roomCode: room.roomCode,
      playerId,
      roomRevision,
    };
    const candidate: RoomWriteCandidate = {
      roomId: room.roomId,
      roomCode: room.roomCode,
      phase: room.phase,
      hostPlayerId: room.hostPlayerId,
      players: [
        ...room.players,
        { playerId, nickname, joinOrder: nextJoinOrder },
      ],
      game: room.game,
      roomRevision,
      createdAt: room.createdAt,
      updatedAt: now,
    };

    const result = await this.#roomUnitOfWork.commit({
      roomMutation: {
        kind: "REPLACE",
        candidate,
        expectedRoomRevision: room.roomRevision,
        expectedStorageRevision: room.storageRevision,
      },
      sessionMutation: {
        kind: "PROMOTE_UNBOUND",
        verificationData: prepared.verificationData,
        roomId: room.roomId,
        playerId,
        now,
      },
      idempotency: this.#idempotencyRecord(
        prepared,
        fingerprint,
        terminalResult,
        now,
      ),
    });

    return this.#mapJoinCommitResult(result);
  }

  #idempotencyRecord(
    prepared: PreparedMutation,
    fingerprint: string,
    terminalResult: RoomMutationSuccessData,
    createdAt: ServerTime,
  ): IdempotencyRecord {
    return {
      scopeKey: prepared.scopeKey,
      requestId: prepared.requestId,
      payloadFingerprint: fingerprint,
      terminalResult,
      createdAt,
    };
  }

  #mapCreateCommitResult(result: RoomUnitOfWorkResult): RoomMutationResult {
    switch (result.status) {
      case "COMMITTED":
      case "REPLAY":
        return parseAcceptedResult(result.idempotency.terminalResult);
      case "IDEMPOTENCY_CONFLICT":
        return failed(REQUEST_ID_REUSED_ERROR);
      case "PRECONDITION_FAILED":
        if (isCredentialPreconditionFailure(result.reason)) {
          return failed(INVALID_BOOTSTRAP_ERROR);
        }
        if (result.reason === "ROOM_ID_CONFLICT") {
          return failed(TEMPORARILY_UNAVAILABLE_ERROR);
        }
        return failed(INTERNAL_ERROR);
    }
  }

  #mapJoinCommitResult(result: RoomUnitOfWorkResult): RoomMutationResult {
    switch (result.status) {
      case "COMMITTED":
      case "REPLAY":
        return parseAcceptedResult(result.idempotency.terminalResult);
      case "IDEMPOTENCY_CONFLICT":
        return failed(REQUEST_ID_REUSED_ERROR);
      case "PRECONDITION_FAILED":
        if (isCredentialPreconditionFailure(result.reason)) {
          return failed(INVALID_BOOTSTRAP_ERROR);
        }
        if (result.reason === "ROOM_NOT_FOUND") {
          return failed(ROOM_NOT_FOUND_ERROR);
        }
        if (
          result.reason === "STALE_ROOM_REVISION" ||
          result.reason === "STALE_STORAGE_REVISION"
        ) {
          return failed(TEMPORARILY_UNAVAILABLE_ERROR);
        }
        return failed(INTERNAL_ERROR);
    }
  }
}
