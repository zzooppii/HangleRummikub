import {
  GameIdSchema,
  GameRevisionSchema,
  PlayerIdSchema,
  RequestIdSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  TileIdSchema,
  TurnIdSchema,
  TurnNumberSchema,
  type PlayerId,
  type RequestId,
  type ServerTime,
  type TileId,
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
import type {
  Clock,
  IdGenerator,
  RandomSource,
  ScheduledTurnDeadline,
  TurnScheduler,
} from "../ports/system.js";
import type { RoomMutationSerialExecutor } from "./room-session-service.js";
import {
  createNextTurn,
  incrementGameRevision,
  scheduleCurrentTurnBestEffort,
  type TurnSchedulingFailureReporter,
} from "./turn-transition.js";

export const TurnTimeoutAppliedDataSchema = v.strictObject({
  roomId: RoomIdSchema,
  gameId: GameIdSchema,
  roomRevision: RoomRevisionSchema,
  gameRevision: GameRevisionSchema,
  timedOutPlayerId: PlayerIdSchema,
  timedOutTurnId: TurnIdSchema,
  penaltyTileIds: v.array(TileIdSchema),
  nextTurnId: TurnIdSchema,
  nextTurnNumber: TurnNumberSchema,
});

type ParsedTurnTimeoutAppliedData = v.InferOutput<
  typeof TurnTimeoutAppliedDataSchema
>;
export type TurnTimeoutAppliedData = Readonly<
  Omit<ParsedTurnTimeoutAppliedData, "penaltyTileIds"> & {
    penaltyTileIds: readonly TileId[];
  }
>;

export type TurnTimeoutNoOpReason =
  | "ROOM_NOT_FOUND"
  | "NOT_PLAYING"
  | "STALE_GAME"
  | "STALE_TURN"
  | "STALE_GAME_REVISION"
  | "STALE_DEADLINE"
  | "NOT_DUE";

export type TurnTimeoutResult =
  | Readonly<{ status: "APPLIED"; data: TurnTimeoutAppliedData }>
  | Readonly<{ status: "NO_OP"; reason: TurnTimeoutNoOpReason }>
  | Readonly<{ status: "FAILED"; reason: "INTERNAL_ERROR" }>;

export type TurnTimeoutAppliedListener = (
  data: TurnTimeoutAppliedData,
) => void | Promise<void>;

export type TurnTimeoutServiceDependencies = Readonly<{
  roomRepository: RoomRepository;
  idempotencyRepository: IdempotencyRepository;
  roomUnitOfWork: RoomUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  clock: Clock;
  idGenerator: IdGenerator;
  randomSource: RandomSource;
  turnScheduler?: TurnScheduler;
  onTurnSchedulingFailure?: TurnSchedulingFailureReporter;
}>;

type TimeoutExecution = Readonly<{
  result: TurnTimeoutResult;
  committed: boolean;
}>;

function timeoutRequestId(input: ScheduledTurnDeadline): RequestId {
  return v.parse(
    RequestIdSchema,
    `turn-timeout:${input.gameId}:${input.turnId}`,
  );
}

function timeoutScope(input: ScheduledTurnDeadline): string {
  return `room-timeout:${input.roomId}:${input.gameId}`;
}

function timeoutFingerprint(input: ScheduledTurnDeadline): string {
  return JSON.stringify([
    "turn:timeout",
    input.gameId,
    input.turnId,
    input.expectedGameRevision,
    input.deadlineAt,
  ]);
}

function parseAcceptedResult(terminalResult: unknown): TurnTimeoutResult {
  const parsed = v.safeParse(TurnTimeoutAppliedDataSchema, terminalResult);
  return parsed.success
    ? { status: "APPLIED", data: parsed.output }
    : { status: "FAILED", reason: "INTERNAL_ERROR" };
}

function drawPenaltyTiles(
  game: PlayingGameState,
  randomSource: RandomSource,
): Readonly<{
  consonantBag: readonly TileId[];
  vowelBag: readonly TileId[];
  penaltyTileIds: readonly TileId[];
}> {
  const consonantBag = [...game.consonantBag];
  const vowelBag = [...game.vowelBag];
  const penaltyTileIds: TileId[] = [];

  for (
    let drawIndex = 0;
    drawIndex < game.rulesConfig.timeoutPenaltyTileCount;
    drawIndex += 1
  ) {
    let bagKind: TileSourceBag;
    if (consonantBag.length > 0 && vowelBag.length > 0) {
      const selectedBagIndex = randomSource.nextInt(2);
      if (
        !Number.isSafeInteger(selectedBagIndex) ||
        selectedBagIndex < 0 ||
        selectedBagIndex >= 2
      ) {
        throw new RangeError(
          "RandomSource returned an invalid timeout penalty bag index.",
        );
      }
      bagKind = selectedBagIndex === 0 ? "CONSONANT" : "VOWEL";
    } else if (consonantBag.length > 0) {
      bagKind = "CONSONANT";
    } else if (vowelBag.length > 0) {
      bagKind = "VOWEL";
    } else {
      break;
    }

    const selectedBag = bagKind === "CONSONANT" ? consonantBag : vowelBag;
    const tileId = selectedBag.pop();
    if (tileId === undefined) {
      throw new Error("Selected timeout penalty bag was unexpectedly empty.");
    }
    penaltyTileIds.push(tileId);
  }

  return Object.freeze({
    consonantBag: Object.freeze(consonantBag),
    vowelBag: Object.freeze(vowelBag),
    penaltyTileIds: Object.freeze(penaltyTileIds),
  });
}

function createCandidate(
  room: RoomRecord,
  game: PlayingGameState,
  committedAt: ServerTime,
  idGenerator: IdGenerator,
  randomSource: RandomSource,
): Readonly<{
  roomCandidate: RoomWriteCandidate;
  terminalResult: TurnTimeoutAppliedData;
}> {
  const actorPlayerId = game.turn.activePlayerId;
  const actorRack = game.racks.get(actorPlayerId);
  if (actorRack === undefined) {
    throw new Error("Canonical Game is missing the timed-out Player rack.");
  }

  const penalty = drawPenaltyTiles(game, randomSource);
  const racks = new Map<PlayerId, readonly TileId[]>(
    [...game.racks].map(([playerId, rack]) => [
      playerId,
      Object.freeze(
        playerId === actorPlayerId
          ? [...rack, ...penalty.penaltyTileIds]
          : [...rack],
      ),
    ]),
  );
  const gameRevision = incrementGameRevision(game.gameRevision);
  const turn = createNextTurn(game, committedAt, idGenerator);
  const nextGame: PlayingGameState = Object.freeze({
    gameId: game.gameId,
    gameRevision,
    rulesConfig: game.rulesConfig,
    tilesById: game.tilesById,
    consonantBag: penalty.consonantBag,
    vowelBag: penalty.vowelBag,
    racks,
    board: game.board,
    initialMeldCompleted: game.initialMeldCompleted,
    turnOrder: game.turnOrder,
    turn,
    result: null,
    gameStartedAt: game.gameStartedAt,
    gameDeadlineAt: game.gameDeadlineAt,
  });
  const terminalResult: TurnTimeoutAppliedData = Object.freeze({
    roomId: room.roomId,
    gameId: game.gameId,
    roomRevision: room.roomRevision,
    gameRevision,
    timedOutPlayerId: actorPlayerId,
    timedOutTurnId: game.turn.turnId,
    penaltyTileIds: penalty.penaltyTileIds,
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

export class TurnTimeoutService {
  readonly #roomRepository: RoomRepository;
  readonly #idempotencyRepository: IdempotencyRepository;
  readonly #roomUnitOfWork: RoomUnitOfWork;
  readonly #roomMutationExecutor: RoomMutationSerialExecutor;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #randomSource: RandomSource;
  readonly #turnScheduler: TurnScheduler | undefined;
  readonly #onTurnSchedulingFailure: TurnSchedulingFailureReporter | undefined;
  readonly #appliedListeners = new Set<TurnTimeoutAppliedListener>();

  constructor(dependencies: TurnTimeoutServiceDependencies) {
    this.#roomRepository = dependencies.roomRepository;
    this.#idempotencyRepository = dependencies.idempotencyRepository;
    this.#roomUnitOfWork = dependencies.roomUnitOfWork;
    this.#roomMutationExecutor = dependencies.roomMutationExecutor;
    this.#clock = dependencies.clock;
    this.#idGenerator = dependencies.idGenerator;
    this.#randomSource = dependencies.randomSource;
    this.#turnScheduler = dependencies.turnScheduler;
    this.#onTurnSchedulingFailure = dependencies.onTurnSchedulingFailure;
  }

  subscribeApplied(listener: TurnTimeoutAppliedListener): () => void {
    this.#appliedListeners.add(listener);
    return () => {
      this.#appliedListeners.delete(listener);
    };
  }

  async timeout(input: ScheduledTurnDeadline): Promise<TurnTimeoutResult> {
    let execution: TimeoutExecution;
    try {
      execution = await this.#roomMutationExecutor.run(input.roomId, () =>
        this.#timeoutWithinRoomBoundary(input),
      );
    } catch {
      return { status: "FAILED", reason: "INTERNAL_ERROR" };
    }

    if (execution.result.status === "APPLIED") {
      const appliedData = execution.result.data;
      await scheduleCurrentTurnBestEffort(
        this.#roomRepository,
        this.#turnScheduler,
        {
          roomId: appliedData.roomId,
          gameId: appliedData.gameId,
          gameRevision: appliedData.gameRevision,
          turnId: appliedData.nextTurnId,
        },
        this.#onTurnSchedulingFailure,
      );
      if (execution.committed) {
        await Promise.allSettled(
          [...this.#appliedListeners].map((listener) =>
            listener(appliedData),
          ),
        );
      }
    } else if (
      execution.result.status === "NO_OP" &&
      execution.result.reason === "NOT_DUE"
    ) {
      await scheduleCurrentTurnBestEffort(
        this.#roomRepository,
        this.#turnScheduler,
        {
          roomId: input.roomId,
          gameId: input.gameId,
          gameRevision: input.expectedGameRevision,
          turnId: input.turnId,
        },
        this.#onTurnSchedulingFailure,
      );
    }

    return execution.result;
  }

  async #timeoutWithinRoomBoundary(
    input: ScheduledTurnDeadline,
  ): Promise<TimeoutExecution> {
    const room = await this.#roomRepository.findById(input.roomId);
    if (room === null) {
      return {
        result: { status: "NO_OP", reason: "ROOM_NOT_FOUND" },
        committed: false,
      };
    }
    const game = room.game;
    if (
      room.phase !== "PLAYING" ||
      game === null ||
      game.turn === null ||
      game.result !== null
    ) {
      return {
        result: { status: "NO_OP", reason: "NOT_PLAYING" },
        committed: false,
      };
    }
    if (game.gameId !== input.gameId) {
      return {
        result: { status: "NO_OP", reason: "STALE_GAME" },
        committed: false,
      };
    }
    if (game.turn.turnId !== input.turnId) {
      return {
        result: { status: "NO_OP", reason: "STALE_TURN" },
        committed: false,
      };
    }
    if (game.gameRevision !== input.expectedGameRevision) {
      return {
        result: { status: "NO_OP", reason: "STALE_GAME_REVISION" },
        committed: false,
      };
    }
    if (game.turn.deadlineAt !== input.deadlineAt) {
      return {
        result: { status: "NO_OP", reason: "STALE_DEADLINE" },
        committed: false,
      };
    }
    const committedAt = this.#clock.now();
    if (committedAt < game.turn.deadlineAt) {
      return {
        result: { status: "NO_OP", reason: "NOT_DUE" },
        committed: false,
      };
    }

    const requestId = timeoutRequestId(input);
    const scopeKey = timeoutScope(input);
    const fingerprint = timeoutFingerprint(input);
    const prior = await this.#idempotencyRepository.classify(
      scopeKey,
      requestId,
      fingerprint,
    );
    if (prior.status === "REPLAY") {
      return {
        result: parseAcceptedResult(prior.record.terminalResult),
        committed: false,
      };
    }
    if (prior.status === "CONFLICT") {
      return {
        result: { status: "FAILED", reason: "INTERNAL_ERROR" },
        committed: false,
      };
    }

    const candidate = createCandidate(
      room,
      game,
      committedAt,
      this.#idGenerator,
      this.#randomSource,
    );
    const commitResult = await this.#roomUnitOfWork.commit({
      roomMutation: {
        kind: "REPLACE",
        candidate: candidate.roomCandidate,
        expectedRoomRevision: room.roomRevision,
        expectedStorageRevision: room.storageRevision,
      },
      sessionMutation: { kind: "NONE" },
      idempotency: {
        scopeKey,
        requestId,
        payloadFingerprint: fingerprint,
        terminalResult: candidate.terminalResult,
        createdAt: committedAt,
      },
    });
    return this.#mapCommitResult(commitResult);
  }

  #mapCommitResult(result: RoomUnitOfWorkResult): TimeoutExecution {
    switch (result.status) {
      case "COMMITTED":
        return {
          result: parseAcceptedResult(result.idempotency.terminalResult),
          committed: true,
        };
      case "REPLAY":
        return {
          result: parseAcceptedResult(result.idempotency.terminalResult),
          committed: false,
        };
      case "IDEMPOTENCY_CONFLICT":
        return {
          result: { status: "FAILED", reason: "INTERNAL_ERROR" },
          committed: false,
        };
      case "PRECONDITION_FAILED":
        if (
          result.reason === "ROOM_NOT_FOUND" ||
          result.reason === "STALE_ROOM_REVISION" ||
          result.reason === "STALE_STORAGE_REVISION"
        ) {
          return {
            result: { status: "NO_OP", reason: "STALE_GAME_REVISION" },
            committed: false,
          };
        }
        return {
          result: { status: "FAILED", reason: "INTERNAL_ERROR" },
          committed: false,
        };
    }
  }
}
