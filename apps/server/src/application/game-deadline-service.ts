import {
  GameIdSchema,
  GameRevisionSchema,
  PlayerIdSchema,
  RequestIdSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  type RequestId,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type { FinishedGameState } from "../domain/game/game-state.js";
import { createTimeLimitResult } from "../domain/game/result-engine.js";
import type { RoomWriteCandidate } from "../model/persistence.js";
import type { IdempotencyRepository } from "../ports/idempotency-repository.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type {
  RoomUnitOfWork,
  RoomUnitOfWorkResult,
} from "../ports/room-unit-of-work.js";
import type {
  Clock,
  GameDeadlineScheduler,
  ScheduledGameDeadline,
} from "../ports/system.js";
import {
  scheduleGameDeadlineBestEffort,
  type GameDeadlineSchedulingFailureReporter,
} from "./game-deadline-transition.js";
import type { RoomMutationSerialExecutor } from "./room-session-service.js";

export const GameDeadlineAppliedDataSchema = v.strictObject({
  roomId: RoomIdSchema,
  gameId: GameIdSchema,
  roomRevision: RoomRevisionSchema,
  gameRevision: GameRevisionSchema,
  reason: v.literal("TIME_LIMIT"),
  winnerPlayerIds: v.array(PlayerIdSchema),
});

export type GameDeadlineAppliedData = v.InferOutput<
  typeof GameDeadlineAppliedDataSchema
>;

export type GameDeadlineNoOpReason =
  | "ROOM_NOT_FOUND"
  | "NOT_PLAYING"
  | "STALE_GAME"
  | "STALE_DEADLINE"
  | "NOT_DUE";

export type GameDeadlineResult =
  | Readonly<{ status: "APPLIED"; data: GameDeadlineAppliedData }>
  | Readonly<{ status: "NO_OP"; reason: GameDeadlineNoOpReason }>
  | Readonly<{ status: "FAILED"; reason: "INTERNAL_ERROR" }>;

export type GameDeadlineAppliedListener = (
  data: GameDeadlineAppliedData,
) => void | Promise<void>;

export type GameDeadlineServiceDependencies = Readonly<{
  roomRepository: RoomRepository;
  idempotencyRepository: IdempotencyRepository;
  roomUnitOfWork: RoomUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  clock: Clock;
  gameDeadlineScheduler?: GameDeadlineScheduler;
  onGameDeadlineSchedulingFailure?: GameDeadlineSchedulingFailureReporter;
}>;

type DeadlineExecution = Readonly<{
  result: GameDeadlineResult;
  committed: boolean;
}>;

function deadlineRequestId(input: ScheduledGameDeadline): RequestId {
  return v.parse(
    RequestIdSchema,
    `game-deadline:${input.gameId}:${input.deadlineAt}`,
  );
}

function deadlineScope(input: ScheduledGameDeadline): string {
  return `room-game-deadline:${input.roomId}:${input.gameId}`;
}

function deadlineFingerprint(input: ScheduledGameDeadline): string {
  return JSON.stringify([
    "game:deadline",
    input.gameId,
    input.deadlineAt,
  ]);
}

function parseAppliedResult(terminalResult: unknown): GameDeadlineResult {
  const parsed = v.safeParse(GameDeadlineAppliedDataSchema, terminalResult);
  return parsed.success
    ? { status: "APPLIED", data: parsed.output }
    : { status: "FAILED", reason: "INTERNAL_ERROR" };
}

function incrementRoomRevision(
  revision: import("@hangul-rummikub/shared").RoomRevision,
) {
  return v.parse(RoomRevisionSchema, revision + 1);
}

function incrementGameRevision(
  revision: import("@hangul-rummikub/shared").GameRevision,
) {
  return v.parse(GameRevisionSchema, revision + 1);
}

export class GameDeadlineService {
  readonly #dependencies: GameDeadlineServiceDependencies;
  readonly #appliedListeners = new Set<GameDeadlineAppliedListener>();

  constructor(dependencies: GameDeadlineServiceDependencies) {
    this.#dependencies = dependencies;
  }

  subscribeApplied(listener: GameDeadlineAppliedListener): () => void {
    this.#appliedListeners.add(listener);
    return () => {
      this.#appliedListeners.delete(listener);
    };
  }

  async expire(input: ScheduledGameDeadline): Promise<GameDeadlineResult> {
    let execution: DeadlineExecution;
    try {
      execution = await this.#dependencies.roomMutationExecutor.run(
        input.roomId,
        () => this.#expireWithinRoomBoundary(input),
      );
    } catch {
      return { status: "FAILED", reason: "INTERNAL_ERROR" };
    }

    if (
      execution.result.status === "NO_OP" &&
      execution.result.reason === "NOT_DUE"
    ) {
      await scheduleGameDeadlineBestEffort(
        this.#dependencies.roomRepository,
        this.#dependencies.gameDeadlineScheduler,
        { roomId: input.roomId, gameId: input.gameId },
        this.#dependencies.onGameDeadlineSchedulingFailure,
      );
    }
    if (execution.result.status === "APPLIED" && execution.committed) {
      const appliedData = execution.result.data;
      await Promise.allSettled(
        [...this.#appliedListeners].map((listener) =>
          listener(appliedData),
        ),
      );
    }
    return execution.result;
  }

  async #expireWithinRoomBoundary(
    input: ScheduledGameDeadline,
  ): Promise<DeadlineExecution> {
    const room = await this.#dependencies.roomRepository.findById(input.roomId);
    if (room === null) {
      return noOp("ROOM_NOT_FOUND");
    }
    const game = room.game;
    if (
      room.phase !== "PLAYING" ||
      game === null ||
      game.turn === null ||
      game.result !== null
    ) {
      return noOp("NOT_PLAYING");
    }
    if (game.gameId !== input.gameId) {
      return noOp("STALE_GAME");
    }
    if (game.gameDeadlineAt !== input.deadlineAt) {
      return noOp("STALE_DEADLINE");
    }
    const finishedAt = this.#dependencies.clock.now();
    if (finishedAt < game.gameDeadlineAt) {
      return noOp("NOT_DUE");
    }

    const scopeKey = deadlineScope(input);
    const requestId = deadlineRequestId(input);
    const fingerprint = deadlineFingerprint(input);
    const prior = await this.#dependencies.idempotencyRepository.classify(
      scopeKey,
      requestId,
      fingerprint,
    );
    if (prior.status === "REPLAY") {
      return {
        result: parseAppliedResult(prior.record.terminalResult),
        committed: false,
      };
    }
    if (prior.status === "CONFLICT") {
      return failedExecution();
    }

    const gameRevision = incrementGameRevision(game.gameRevision);
    const roomRevision = incrementRoomRevision(room.roomRevision);
    const result = createTimeLimitResult({
      playerIds: game.turnOrder,
      racks: game.racks,
      tilesById: game.tilesById,
      forfeitedPlayerIds: game.forfeitedPlayerIds,
      finishedAt,
    });
    const finishedGame: FinishedGameState = Object.freeze({
      ...game,
      gameRevision,
      turn: null,
      result,
    });
    const terminalResult: GameDeadlineAppliedData = Object.freeze({
      roomId: room.roomId,
      gameId: game.gameId,
      roomRevision,
      gameRevision,
      reason: "TIME_LIMIT",
      winnerPlayerIds: [...result.winnerPlayerIds],
    });
    const candidate: RoomWriteCandidate = Object.freeze({
      roomId: room.roomId,
      roomCode: room.roomCode,
      phase: "FINISHED",
      hostPlayerId: room.hostPlayerId,
      players: room.players,
      game: finishedGame,
      roomRevision,
      createdAt: room.createdAt,
      updatedAt: finishedAt,
    });
    const commitResult = await this.#dependencies.roomUnitOfWork.commit({
      roomMutation: {
        kind: "REPLACE",
        candidate,
        expectedRoomRevision: room.roomRevision,
        expectedStorageRevision: room.storageRevision,
      },
      sessionMutation: { kind: "NONE" },
      idempotency: {
        scopeKey,
        requestId,
        payloadFingerprint: fingerprint,
        terminalResult,
        createdAt: finishedAt,
      },
    });
    return this.#mapCommitResult(commitResult);
  }

  #mapCommitResult(result: RoomUnitOfWorkResult): DeadlineExecution {
    switch (result.status) {
      case "COMMITTED":
        return {
          result: parseAppliedResult(result.idempotency.terminalResult),
          committed: true,
        };
      case "REPLAY":
        return {
          result: parseAppliedResult(result.idempotency.terminalResult),
          committed: false,
        };
      case "IDEMPOTENCY_CONFLICT":
        return failedExecution();
      case "PRECONDITION_FAILED":
        if (
          result.reason === "ROOM_NOT_FOUND" ||
          result.reason === "STALE_ROOM_REVISION" ||
          result.reason === "STALE_STORAGE_REVISION"
        ) {
          return noOp("NOT_PLAYING");
        }
        return failedExecution();
    }
  }
}

function noOp(reason: GameDeadlineNoOpReason): DeadlineExecution {
  return { result: { status: "NO_OP", reason }, committed: false };
}

function failedExecution(): DeadlineExecution {
  return {
    result: { status: "FAILED", reason: "INTERNAL_ERROR" },
    committed: false,
  };
}
