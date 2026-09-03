import {
  GameIdSchema,
  GameRevisionSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  TurnIdSchema,
  type ErrorDto,
  type PlayerId,
  type RequestId,
  type RoomId,
  type RoomRevision,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import { createInitialGameState } from "../domain/game/game-state.js";
import type {
  IdempotencyRecord,
  RoomWriteCandidate,
} from "../model/persistence.js";
import type { IdempotencyRepository } from "../ports/idempotency-repository.js";
import type { PlayerPresenceReader } from "../ports/player-presence-reader.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type {
  RoomUnitOfWork,
  RoomUnitOfWorkResult,
} from "../ports/room-unit-of-work.js";
import type { Clock, IdGenerator, RandomSource } from "../ports/system.js";
import type { RoomMutationSerialExecutor } from "./room-session-service.js";

export const GAME_START_MIN_PLAYERS = 2;
export const GAME_START_MAX_PLAYERS = 4;

export const GameStartSuccessDataSchema = v.strictObject({
  roomId: RoomIdSchema,
  gameId: GameIdSchema,
  roomRevision: RoomRevisionSchema,
  gameRevision: GameRevisionSchema,
  turnId: TurnIdSchema,
});

export type GameStartSuccessData = v.InferOutput<
  typeof GameStartSuccessDataSchema
>;

export type GameStartResult =
  | Readonly<{ ok: true; data: GameStartSuccessData }>
  | Readonly<{ ok: false; error: ErrorDto }>;

/** A transport-agnostic lease over the actor identity captured at command entry. */
export interface CurrentActorAuthorization {
  isCurrent(): boolean;
}

export type StartGameInput = Readonly<{
  roomId: RoomId;
  actorPlayerId: PlayerId;
  requestId: RequestId;
  expectedRoomRevision: RoomRevision;
  authorization: CurrentActorAuthorization;
}>;

export type GameStartServiceDependencies = Readonly<{
  roomRepository: RoomRepository;
  idempotencyRepository: IdempotencyRepository;
  roomUnitOfWork: RoomUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  presenceReader: PlayerPresenceReader;
  clock: Clock;
  idGenerator: IdGenerator;
  randomSource: RandomSource;
}>;

const ROOM_NOT_FOUND_ERROR: ErrorDto = Object.freeze({
  code: "ROOM_NOT_FOUND",
  message: "Room was not found.",
  recoverable: false,
});

const INVALID_PHASE_ERROR: ErrorDto = Object.freeze({
  code: "INVALID_PHASE",
  message: "The Room is not in a phase where the Game can start.",
  recoverable: false,
});

const HOST_ONLY_ERROR: ErrorDto = Object.freeze({
  code: "HOST_ONLY",
  message: "Only the Room Host can start the Game.",
  recoverable: false,
});

const NOT_ENOUGH_PLAYERS_ERROR: ErrorDto = Object.freeze({
  code: "NOT_ENOUGH_PLAYERS",
  message: "At least two Players are required to start the Game.",
  recoverable: true,
});

const PLAYERS_NOT_CONNECTED_ERROR: ErrorDto = Object.freeze({
  code: "PLAYERS_NOT_CONNECTED",
  message: "Every registered Player must be connected to start the Game.",
  recoverable: true,
});

const STALE_ROOM_REVISION_ERROR: ErrorDto = Object.freeze({
  code: "STALE_ROOM_REVISION",
  message: "The Room state is stale.",
  recoverable: true,
});

const REQUEST_ID_REUSED_ERROR: ErrorDto = Object.freeze({
  code: "REQUEST_ID_REUSED",
  message: "Request ID was already used for a different command payload.",
  recoverable: false,
});

const UNAUTHENTICATED_ERROR: ErrorDto = Object.freeze({
  code: "UNAUTHENTICATED",
  message: "The command actor is no longer authorized.",
  recoverable: true,
});

const INTERNAL_ERROR: ErrorDto = Object.freeze({
  code: "INTERNAL_ERROR",
  message: "An internal error occurred.",
  recoverable: false,
});

function succeeded(data: GameStartSuccessData): GameStartResult {
  return { ok: true, data };
}

function failed(error: ErrorDto): GameStartResult {
  return { ok: false, error };
}

function idempotencyScope(input: StartGameInput): string {
  return `room-player:${input.roomId}:${input.actorPlayerId}`;
}

function payloadFingerprint(expectedRoomRevision: RoomRevision): string {
  return JSON.stringify(["game:start", expectedRoomRevision]);
}

function parseAcceptedResult(
  terminalResult: IdempotencyRecord["terminalResult"],
): GameStartResult {
  const parsed = v.safeParse(GameStartSuccessDataSchema, terminalResult);
  return parsed.success ? succeeded(parsed.output) : failed(INTERNAL_ERROR);
}

function incrementRoomRevision(revision: RoomRevision): RoomRevision {
  return v.parse(RoomRevisionSchema, revision + 1);
}

export class GameStartService {
  readonly #roomRepository: RoomRepository;
  readonly #idempotencyRepository: IdempotencyRepository;
  readonly #roomUnitOfWork: RoomUnitOfWork;
  readonly #roomMutationExecutor: RoomMutationSerialExecutor;
  readonly #presenceReader: PlayerPresenceReader;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #randomSource: RandomSource;

  constructor(dependencies: GameStartServiceDependencies) {
    this.#roomRepository = dependencies.roomRepository;
    this.#idempotencyRepository = dependencies.idempotencyRepository;
    this.#roomUnitOfWork = dependencies.roomUnitOfWork;
    this.#roomMutationExecutor = dependencies.roomMutationExecutor;
    this.#presenceReader = dependencies.presenceReader;
    this.#clock = dependencies.clock;
    this.#idGenerator = dependencies.idGenerator;
    this.#randomSource = dependencies.randomSource;
  }

  async start(input: StartGameInput): Promise<GameStartResult> {
    try {
      return await this.#roomMutationExecutor.run(input.roomId, () =>
        this.#startWithinRoomBoundary(input),
      );
    } catch {
      return failed(INTERNAL_ERROR);
    }
  }

  async #startWithinRoomBoundary(
    input: StartGameInput,
  ): Promise<GameStartResult> {
    const scopeKey = idempotencyScope(input);
    const fingerprint = payloadFingerprint(input.expectedRoomRevision);
    const prior = await this.#idempotencyRepository.classify(
      scopeKey,
      input.requestId,
      fingerprint,
    );

    if (prior.status === "REPLAY") {
      return parseAcceptedResult(prior.record.terminalResult);
    }
    if (prior.status === "CONFLICT") {
      return failed(REQUEST_ID_REUSED_ERROR);
    }

    const room = await this.#roomRepository.findById(input.roomId);
    if (room === null) {
      return failed(ROOM_NOT_FOUND_ERROR);
    }
    if (room.phase !== "LOBBY" || room.game !== null) {
      return failed(INVALID_PHASE_ERROR);
    }
    if (room.hostPlayerId !== input.actorPlayerId) {
      return failed(HOST_ONLY_ERROR);
    }
    if (room.players.length < GAME_START_MIN_PLAYERS) {
      return failed(NOT_ENOUGH_PLAYERS_ERROR);
    }
    if (room.players.length > GAME_START_MAX_PLAYERS) {
      return failed(INVALID_PHASE_ERROR);
    }
    if (room.roomRevision !== input.expectedRoomRevision) {
      return failed(STALE_ROOM_REVISION_ERROR);
    }

    const presence = await this.#presenceReader.readRoomPresence(room.roomId);
    const allPlayersConnected = room.players.every(
      (player) =>
        presence.connectionStatusByPlayerId.get(player.playerId) ===
        "CONNECTED",
    );
    if (!allPlayersConnected) {
      return failed(PLAYERS_NOT_CONNECTED_ERROR);
    }

    const startedAt = this.#clock.now();
    const game = createInitialGameState({
      playerIds: room.players.map((player) => player.playerId),
      startedAt,
      idGenerator: this.#idGenerator,
      randomSource: this.#randomSource,
    });
    const roomRevision = incrementRoomRevision(room.roomRevision);
    const terminalResult: GameStartSuccessData = {
      roomId: room.roomId,
      gameId: game.gameId,
      roomRevision,
      gameRevision: game.gameRevision,
      turnId: game.turn.turnId,
    };
    const candidate: RoomWriteCandidate = {
      roomId: room.roomId,
      roomCode: room.roomCode,
      phase: "PLAYING",
      hostPlayerId: room.hostPlayerId,
      players: room.players,
      game,
      roomRevision,
      createdAt: room.createdAt,
      updatedAt: startedAt,
    };
    const result = await this.#roomUnitOfWork.commit(
      {
        roomMutation: {
          kind: "REPLACE",
          candidate,
          expectedRoomRevision: room.roomRevision,
          expectedStorageRevision: room.storageRevision,
        },
        sessionMutation: { kind: "NONE" },
        idempotency: {
          scopeKey,
          requestId: input.requestId,
          payloadFingerprint: fingerprint,
          terminalResult,
          createdAt: startedAt,
        },
      },
      { isSatisfied: () => input.authorization.isCurrent() },
    );

    return this.#mapCommitResult(result);
  }

  #mapCommitResult(result: RoomUnitOfWorkResult): GameStartResult {
    switch (result.status) {
      case "COMMITTED":
      case "REPLAY":
        return parseAcceptedResult(result.idempotency.terminalResult);
      case "IDEMPOTENCY_CONFLICT":
        return failed(REQUEST_ID_REUSED_ERROR);
      case "PRECONDITION_FAILED":
        if (result.reason === "COMMIT_PRECONDITION_FAILED") {
          return failed(UNAUTHENTICATED_ERROR);
        }
        if (
          result.reason === "ROOM_NOT_FOUND" ||
          result.reason === "STALE_ROOM_REVISION" ||
          result.reason === "STALE_STORAGE_REVISION"
        ) {
          return failed(STALE_ROOM_REVISION_ERROR);
        }
        return failed(INTERNAL_ERROR);
    }
  }
}
