import {
  RoomRevisionSchema,
  type ErrorDto,
} from "@hangul-rummikub/shared";
import { parse, safeParse } from "valibot";

import type {
  GameStartResult,
  GameStartSuccessData,
  StartGameInput,
} from "../../../application/game-start-service.js";
import { GameStartSuccessDataSchema } from "../../../application/game-start-service.js";
import { scheduleCurrentTurnBestEffort } from "../../../application/turn-transition.js";
import type { TurnSchedulingFailureReporter } from "../../../application/turn-transition.js";
import type { GameRegistrationReader } from "../../game-registry.js";
import type { IdempotencyRecord } from "../../../model/persistence.js";
import type { IdempotencyRepository } from "../../../ports/idempotency-repository.js";
import type { RoomRepository } from "../../../ports/room-repository.js";
import type {
  RoomPresenceLease,
  RoomPresencePolicyReader,
} from "../../../ports/room-presence-policy.js";
import type {
  RoomUnitOfWork,
  RoomUnitOfWorkResult,
} from "../../../ports/room-unit-of-work.js";
import type {
  Clock,
  IdGenerator,
  RandomSource,
  TurnScheduler,
} from "../../../ports/system.js";
import type { RoomMutationSerialExecutor } from "../../../application/room-session-service.js";
import { createInitialNumberTileGameState } from "../domain/game-state.js";
import { NUMBER_TILE_GAME_TYPE } from "../number-tile-registration.js";

export type NumberTileStartServiceDependencies = Readonly<{
  roomRepository: RoomRepository;
  idempotencyRepository: IdempotencyRepository;
  roomUnitOfWork: RoomUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  presenceLeaseReader: Pick<
    RoomPresencePolicyReader,
    "acquireRoomPresenceLease"
  >;
  clock: Clock;
  idGenerator: IdGenerator;
  randomSource: RandomSource;
  gameRegistrationReader: GameRegistrationReader;
  turnScheduler?: TurnScheduler;
  onTurnSchedulingFailure?: TurnSchedulingFailureReporter;
}>;

const ERRORS = Object.freeze({
  ROOM_NOT_FOUND: Object.freeze({
    code: "ROOM_NOT_FOUND",
    message: "Room was not found.",
    recoverable: false,
  }),
  INVALID_PHASE: Object.freeze({
    code: "INVALID_PHASE",
    message: "The Room is not in a phase where the Game can start.",
    recoverable: false,
  }),
  HOST_ONLY: Object.freeze({
    code: "HOST_ONLY",
    message: "Only the Room Host can start the Game.",
    recoverable: false,
  }),
  NOT_ENOUGH_PLAYERS: Object.freeze({
    code: "NOT_ENOUGH_PLAYERS",
    message: "At least two Players are required to start the Game.",
    recoverable: true,
  }),
  PLAYERS_NOT_CONNECTED: Object.freeze({
    code: "PLAYERS_NOT_CONNECTED",
    message: "Every registered Player must be connected to start the Game.",
    recoverable: true,
  }),
  STALE_ROOM_REVISION: Object.freeze({
    code: "STALE_ROOM_REVISION",
    message: "The Room state is stale.",
    recoverable: true,
  }),
  REQUEST_ID_REUSED: Object.freeze({
    code: "REQUEST_ID_REUSED",
    message: "Request ID was already used for a different command payload.",
    recoverable: false,
  }),
  UNAUTHENTICATED: Object.freeze({
    code: "UNAUTHENTICATED",
    message: "The command actor is no longer authorized.",
    recoverable: true,
  }),
  INTERNAL_ERROR: Object.freeze({
    code: "INTERNAL_ERROR",
    message: "An internal error occurred.",
    recoverable: false,
  }),
} satisfies Readonly<Record<string, ErrorDto>>);

function succeeded(data: GameStartSuccessData): GameStartResult {
  return { ok: true, data };
}

function failed(error: ErrorDto): GameStartResult {
  return { ok: false, error };
}

function scope(input: StartGameInput): string {
  return `room-player:${input.roomId}:${input.actorPlayerId}`;
}

function fingerprint(input: StartGameInput): string {
  return JSON.stringify(["game:start", input.expectedRoomRevision]);
}

function parseReplay(
  terminalResult: IdempotencyRecord["terminalResult"],
): GameStartResult {
  const parsed = safeParse(GameStartSuccessDataSchema, terminalResult);
  return parsed.success
    ? succeeded(parsed.output)
    : failed(ERRORS.INTERNAL_ERROR);
}

export class NumberTileStartService {
  readonly #dependencies: NumberTileStartServiceDependencies;

  constructor(dependencies: NumberTileStartServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async start(input: StartGameInput): Promise<GameStartResult> {
    let result: GameStartResult;
    try {
      result = await this.#dependencies.roomMutationExecutor.run(
        input.roomId,
        () => this.#startWithinRoomBoundary(input),
      );
    } catch {
      return failed(ERRORS.INTERNAL_ERROR);
    }

    if (result.ok) {
      await scheduleCurrentTurnBestEffort(
        this.#dependencies.roomRepository,
        this.#dependencies.turnScheduler,
        {
          roomId: result.data.roomId,
          gameId: result.data.gameId,
          gameRevision: result.data.gameRevision,
          turnId: result.data.turnId,
        },
        this.#dependencies.onTurnSchedulingFailure,
      );
    }
    return result;
  }

  async #startWithinRoomBoundary(
    input: StartGameInput,
  ): Promise<GameStartResult> {
    const scopeKey = scope(input);
    const payloadFingerprint = fingerprint(input);
    const prior = await this.#dependencies.idempotencyRepository.classify(
      scopeKey,
      input.requestId,
      payloadFingerprint,
    );
    if (prior.status === "REPLAY") {
      return parseReplay(prior.record.terminalResult);
    }
    if (prior.status === "CONFLICT") {
      return failed(ERRORS.REQUEST_ID_REUSED);
    }

    const room = await this.#dependencies.roomRepository.findById(
      input.roomId,
    );
    if (room === null) {
      return failed(ERRORS.ROOM_NOT_FOUND);
    }
    if (room.gameType !== NUMBER_TILE_GAME_TYPE) {
      return failed(ERRORS.INTERNAL_ERROR);
    }
    this.#dependencies.gameRegistrationReader.getRequired(room.gameType);
    if (room.phase !== "LOBBY" || room.game !== null) {
      return failed(ERRORS.INVALID_PHASE);
    }
    if (room.hostPlayerId !== input.actorPlayerId) {
      return failed(ERRORS.HOST_ONLY);
    }
    if (room.players.length < 2) {
      return failed(ERRORS.NOT_ENOUGH_PLAYERS);
    }
    if (room.players.length > 4) {
      return failed(ERRORS.INVALID_PHASE);
    }
    if (room.roomRevision !== input.expectedRoomRevision) {
      return failed(ERRORS.STALE_ROOM_REVISION);
    }

    const presenceLease =
      await this.#dependencies.presenceLeaseReader.acquireRoomPresenceLease(
        room.roomId,
      );
    if (
      !room.players.every(
        (player) =>
          presenceLease.connectionStatusByPlayerId.get(player.playerId) ===
          "CONNECTED",
      )
    ) {
      return failed(ERRORS.PLAYERS_NOT_CONNECTED);
    }
    if (!presenceLease.isCurrent()) {
      return failed(ERRORS.PLAYERS_NOT_CONNECTED);
    }

    const startedAt = this.#dependencies.clock.now();
    const game = createInitialNumberTileGameState({
      playerIds: room.players.map((player) => player.playerId),
      idGenerator: this.#dependencies.idGenerator,
      randomSource: this.#dependencies.randomSource,
      clock: { now: () => startedAt },
    });
    const roomRevision = parse(
      RoomRevisionSchema,
      room.roomRevision + 1,
    );
    const terminalResult: GameStartSuccessData = Object.freeze({
      roomId: room.roomId,
      gameId: game.gameId,
      roomRevision,
      gameRevision: game.gameRevision,
      turnId: game.turn.turnId,
    });
    const committed = await this.#dependencies.roomUnitOfWork.commit(
      {
        roomMutation: {
          kind: "REPLACE",
          candidate: {
            roomId: room.roomId,
            roomCode: room.roomCode,
            gameType: NUMBER_TILE_GAME_TYPE,
            phase: "PLAYING",
            hostPlayerId: room.hostPlayerId,
            players: room.players,
            game,
            roomRevision,
            createdAt: room.createdAt,
            updatedAt: startedAt,
          },
          expectedRoomRevision: room.roomRevision,
          expectedStorageRevision: room.storageRevision,
        },
        sessionMutation: { kind: "NONE" },
        idempotency: {
          scopeKey,
          requestId: input.requestId,
          payloadFingerprint,
          terminalResult,
          createdAt: startedAt,
        },
      },
      {
        isSatisfied: () =>
          input.authorization.isCurrent() && presenceLease.isCurrent(),
      },
    );
    return this.#mapCommit(committed, input, presenceLease);
  }

  #mapCommit(
    result: RoomUnitOfWorkResult,
    input: StartGameInput,
    presenceLease: RoomPresenceLease,
  ): GameStartResult {
    switch (result.status) {
      case "COMMITTED":
      case "REPLAY":
        return parseReplay(result.idempotency.terminalResult);
      case "IDEMPOTENCY_CONFLICT":
        return failed(ERRORS.REQUEST_ID_REUSED);
      case "PRECONDITION_FAILED":
        if (result.reason === "COMMIT_PRECONDITION_FAILED") {
          if (
            input.authorization.isCurrent() &&
            !presenceLease.isCurrent()
          ) {
            return failed(ERRORS.PLAYERS_NOT_CONNECTED);
          }
          return failed(ERRORS.UNAUTHENTICATED);
        }
        if (
          result.reason === "ROOM_NOT_FOUND" ||
          result.reason === "STALE_ROOM_REVISION" ||
          result.reason === "STALE_STORAGE_REVISION"
        ) {
          return failed(ERRORS.STALE_ROOM_REVISION);
        }
        return failed(ERRORS.INTERNAL_ERROR);
    }
  }
}
