import {
  GameIdSchema,
  GameRevisionSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  TileIdSchema,
  TurnIdSchema,
  TurnNumberSchema,
  type ErrorDto,
  type GameRevision,
  type PlayerId,
  type RequestId,
  type RoomId,
  type ServerTime,
  type TurnId,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type { PlayingGameState } from "../domain/game/game-state.js";
import type { TileSourceBag } from "../domain/game/tile-inventory.js";
import type { RoomRecord, RoomWriteCandidate } from "../model/persistence.js";
import type { IdempotencyRepository } from "../ports/idempotency-repository.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type {
  RoomUnitOfWork,
  RoomUnitOfWorkResult,
} from "../ports/room-unit-of-work.js";
import type { Clock, IdGenerator, TurnScheduler } from "../ports/system.js";
import type { CurrentActorAuthorization } from "./game-start-service.js";
import type { RoomMutationSerialExecutor } from "./room-session-service.js";
import {
  createNextTurn,
  incrementGameRevision,
  scheduleCurrentTurnBestEffort,
  type TurnSchedulingFailureReporter,
} from "./turn-transition.js";

const DrawBagKindSchema = v.picklist(["CONSONANT", "VOWEL"]);

export const TurnDrawSuccessDataSchema = v.strictObject({
  roomId: RoomIdSchema,
  gameId: GameIdSchema,
  roomRevision: RoomRevisionSchema,
  gameRevision: GameRevisionSchema,
  drawnTileId: TileIdSchema,
  bagKind: DrawBagKindSchema,
  nextTurnId: TurnIdSchema,
  nextTurnNumber: TurnNumberSchema,
});

export type TurnDrawSuccessData = v.InferOutput<
  typeof TurnDrawSuccessDataSchema
>;

export type TurnDrawResult =
  | Readonly<{ ok: true; data: TurnDrawSuccessData }>
  | Readonly<{ ok: false; error: ErrorDto }>;

export type TurnDrawInput = Readonly<{
  roomId: RoomId;
  actorPlayerId: PlayerId;
  requestId: RequestId;
  expectedGameRevision: GameRevision;
  turnId: TurnId;
  receivedAt: ServerTime;
  bagKind: TileSourceBag;
  authorization: CurrentActorAuthorization;
}>;

export type TurnDrawServiceDependencies = Readonly<{
  roomRepository: RoomRepository;
  idempotencyRepository: IdempotencyRepository;
  roomUnitOfWork: RoomUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  clock: Clock;
  idGenerator: IdGenerator;
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
    message: "The Room is not accepting turn draws.",
    recoverable: false,
  }),
  UNAUTHENTICATED: Object.freeze({
    code: "UNAUTHENTICATED",
    message: "The command actor is no longer authorized.",
    recoverable: true,
  }),
  NOT_YOUR_TURN: Object.freeze({
    code: "NOT_YOUR_TURN",
    message: "The requested Turn is not the actor's current Turn.",
    recoverable: true,
  }),
  TURN_EXPIRED: Object.freeze({
    code: "TURN_EXPIRED",
    message: "The Turn deadline has passed.",
    recoverable: true,
  }),
  STALE_GAME_REVISION: Object.freeze({
    code: "STALE_GAME_REVISION",
    message: "The Game state is stale.",
    recoverable: true,
  }),
  BAG_EMPTY: Object.freeze({
    code: "BAG_EMPTY",
    message: "The selected Tile bag is empty.",
    recoverable: true,
  }),
  REQUEST_ID_REUSED: Object.freeze({
    code: "REQUEST_ID_REUSED",
    message: "Request ID was already used for a different command payload.",
    recoverable: false,
  }),
  INTERNAL_ERROR: Object.freeze({
    code: "INTERNAL_ERROR",
    message: "An internal error occurred.",
    recoverable: false,
  }),
} satisfies Readonly<Record<string, ErrorDto>>);

function succeeded(data: TurnDrawSuccessData): TurnDrawResult {
  return { ok: true, data };
}

function failed(error: ErrorDto): TurnDrawResult {
  return { ok: false, error };
}

function idempotencyScope(input: TurnDrawInput): string {
  return `room-player:${input.roomId}:${input.actorPlayerId}`;
}

export function createTurnDrawFingerprint(
  expectedGameRevision: GameRevision,
  turnId: TurnId,
  bagKind: TileSourceBag,
): string {
  return JSON.stringify([
    "turn:draw",
    expectedGameRevision,
    turnId,
    bagKind,
  ]);
}

function parseAcceptedResult(terminalResult: unknown): TurnDrawResult {
  const parsed = v.safeParse(TurnDrawSuccessDataSchema, terminalResult);
  return parsed.success ? succeeded(parsed.output) : failed(ERRORS.INTERNAL_ERROR);
}

function isSamePlayingGame(
  latest: RoomRecord,
  original: RoomRecord,
  originalGame: PlayingGameState,
): latest is RoomRecord & Readonly<{ game: PlayingGameState }> {
  return (
    latest.phase === "PLAYING" &&
    latest.game !== null &&
    latest.game.turn !== null &&
    latest.game.result === null &&
    latest.game.gameId === originalGame.gameId &&
    latest.game.gameRevision === originalGame.gameRevision &&
    latest.game.turn.turnId === originalGame.turn.turnId &&
    latest.roomRevision === original.roomRevision &&
    latest.storageRevision === original.storageRevision
  );
}

function createCandidate(
  room: RoomRecord,
  game: PlayingGameState,
  input: TurnDrawInput,
  committedAt: ServerTime,
  idGenerator: IdGenerator,
): Readonly<{
  roomCandidate: RoomWriteCandidate;
  terminalResult: TurnDrawSuccessData;
}> {
  const consonantBag = [...game.consonantBag];
  const vowelBag = [...game.vowelBag];
  const selectedBag = input.bagKind === "CONSONANT" ? consonantBag : vowelBag;
  const drawnTileId = selectedBag.pop();
  if (drawnTileId === undefined) {
    throw new Error("The selected canonical Tile bag is empty.");
  }

  const actorRack = game.racks.get(input.actorPlayerId);
  if (actorRack === undefined) {
    throw new Error("Canonical Game is missing the actor rack.");
  }
  const racks = new Map(
    [...game.racks].map(([playerId, rack]) => [
      playerId,
      Object.freeze(
        playerId === input.actorPlayerId
          ? [...rack, drawnTileId]
          : [...rack],
      ),
    ] as const),
  );
  const gameRevision = incrementGameRevision(game.gameRevision);
  const turn = createNextTurn(game, committedAt, idGenerator);
  const nextGame: PlayingGameState = Object.freeze({
    gameId: game.gameId,
    gameRevision,
    rulesConfig: game.rulesConfig,
    tilesById: game.tilesById,
    consonantBag: Object.freeze(consonantBag),
    vowelBag: Object.freeze(vowelBag),
    racks,
    board: game.board,
    initialMeldCompleted: game.initialMeldCompleted,
    offlineTimeoutStreakByPlayerId: game.offlineTimeoutStreakByPlayerId,
    forfeitedPlayerIds: game.forfeitedPlayerIds,
    turnOrder: game.turnOrder,
    turn,
    result: null,
    gameStartedAt: game.gameStartedAt,
    gameDeadlineAt: game.gameDeadlineAt,
  });
  const terminalResult: TurnDrawSuccessData = Object.freeze({
    roomId: room.roomId,
    gameId: game.gameId,
    roomRevision: room.roomRevision,
    gameRevision,
    drawnTileId,
    bagKind: input.bagKind,
    nextTurnId: turn.turnId,
    nextTurnNumber: turn.turnNumber,
  });

  return Object.freeze({
    roomCandidate: Object.freeze({
      roomId: room.roomId,
      roomCode: room.roomCode,
      phase: "PLAYING",
      hostPlayerId: room.hostPlayerId,
      players: room.players,
      game: nextGame,
      roomRevision: room.roomRevision,
      createdAt: room.createdAt,
      updatedAt: committedAt,
    }),
    terminalResult,
  });
}

export class TurnDrawService {
  readonly #roomRepository: RoomRepository;
  readonly #idempotencyRepository: IdempotencyRepository;
  readonly #roomUnitOfWork: RoomUnitOfWork;
  readonly #roomMutationExecutor: RoomMutationSerialExecutor;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #turnScheduler: TurnScheduler | undefined;
  readonly #onTurnSchedulingFailure: TurnSchedulingFailureReporter | undefined;

  constructor(dependencies: TurnDrawServiceDependencies) {
    this.#roomRepository = dependencies.roomRepository;
    this.#idempotencyRepository = dependencies.idempotencyRepository;
    this.#roomUnitOfWork = dependencies.roomUnitOfWork;
    this.#roomMutationExecutor = dependencies.roomMutationExecutor;
    this.#clock = dependencies.clock;
    this.#idGenerator = dependencies.idGenerator;
    this.#turnScheduler = dependencies.turnScheduler;
    this.#onTurnSchedulingFailure = dependencies.onTurnSchedulingFailure;
  }

  async draw(input: TurnDrawInput): Promise<TurnDrawResult> {
    let result: TurnDrawResult;
    try {
      result = await this.#roomMutationExecutor.run(input.roomId, () =>
        this.#drawWithinRoomBoundary(input),
      );
    } catch {
      return failed(ERRORS.INTERNAL_ERROR);
    }

    if (result.ok) {
      await scheduleCurrentTurnBestEffort(
        this.#roomRepository,
        this.#turnScheduler,
        {
          roomId: result.data.roomId,
          gameId: result.data.gameId,
          gameRevision: result.data.gameRevision,
          turnId: result.data.nextTurnId,
        },
        this.#onTurnSchedulingFailure,
      );
    }
    return result;
  }

  async #drawWithinRoomBoundary(
    input: TurnDrawInput,
  ): Promise<TurnDrawResult> {
    const scopeKey = idempotencyScope(input);
    const fingerprint = createTurnDrawFingerprint(
      input.expectedGameRevision,
      input.turnId,
      input.bagKind,
    );
    const prior = await this.#idempotencyRepository.classify(
      scopeKey,
      input.requestId,
      fingerprint,
    );
    if (prior.status === "REPLAY") {
      return parseAcceptedResult(prior.record.terminalResult);
    }
    if (prior.status === "CONFLICT") {
      return failed(ERRORS.REQUEST_ID_REUSED);
    }

    const room = await this.#roomRepository.findById(input.roomId);
    if (room === null) {
      return failed(ERRORS.ROOM_NOT_FOUND);
    }
    const game = room.game;
    if (
      room.phase !== "PLAYING" ||
      game === null ||
      game.turn === null ||
      game.result !== null
    ) {
      return failed(ERRORS.INVALID_PHASE);
    }
    if (!input.authorization.isCurrent()) {
      return failed(ERRORS.UNAUTHENTICATED);
    }
    if (
      game.turn.activePlayerId !== input.actorPlayerId ||
      game.turn.turnId !== input.turnId
    ) {
      return failed(ERRORS.NOT_YOUR_TURN);
    }
    if (input.receivedAt >= game.turn.deadlineAt) {
      return failed(ERRORS.TURN_EXPIRED);
    }
    if (game.gameRevision !== input.expectedGameRevision) {
      return failed(ERRORS.STALE_GAME_REVISION);
    }
    const selectedBag =
      input.bagKind === "CONSONANT" ? game.consonantBag : game.vowelBag;
    if (selectedBag.length === 0) {
      return failed(ERRORS.BAG_EMPTY);
    }

    if (!input.authorization.isCurrent()) {
      return failed(ERRORS.UNAUTHENTICATED);
    }
    const latest = await this.#roomRepository.findById(room.roomId);
    if (latest === null) {
      return failed(ERRORS.ROOM_NOT_FOUND);
    }
    if (latest.phase !== "PLAYING" || latest.game === null) {
      return failed(ERRORS.INVALID_PHASE);
    }
    if (!isSamePlayingGame(latest, room, game)) {
      return failed(ERRORS.STALE_GAME_REVISION);
    }

    const committedAt = this.#clock.now();
    const candidate = createCandidate(
      latest,
      latest.game,
      input,
      committedAt,
      this.#idGenerator,
    );
    const commitResult = await this.#roomUnitOfWork.commit(
      {
        roomMutation: {
          kind: "REPLACE",
          candidate: candidate.roomCandidate,
          expectedRoomRevision: latest.roomRevision,
          expectedStorageRevision: latest.storageRevision,
        },
        sessionMutation: { kind: "NONE" },
        idempotency: {
          scopeKey,
          requestId: input.requestId,
          payloadFingerprint: fingerprint,
          terminalResult: candidate.terminalResult,
          createdAt: committedAt,
        },
      },
      { isSatisfied: () => input.authorization.isCurrent() },
    );

    return this.#mapCommitResult(commitResult);
  }

  #mapCommitResult(result: RoomUnitOfWorkResult): TurnDrawResult {
    switch (result.status) {
      case "COMMITTED":
      case "REPLAY":
        return parseAcceptedResult(result.idempotency.terminalResult);
      case "IDEMPOTENCY_CONFLICT":
        return failed(ERRORS.REQUEST_ID_REUSED);
      case "PRECONDITION_FAILED":
        if (result.reason === "COMMIT_PRECONDITION_FAILED") {
          return failed(ERRORS.UNAUTHENTICATED);
        }
        if (
          result.reason === "ROOM_NOT_FOUND" ||
          result.reason === "STALE_ROOM_REVISION" ||
          result.reason === "STALE_STORAGE_REVISION"
        ) {
          return failed(ERRORS.STALE_GAME_REVISION);
        }
        return failed(ERRORS.INTERNAL_ERROR);
    }
  }
}
