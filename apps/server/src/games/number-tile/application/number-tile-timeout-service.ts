import { numberIneligiblePlayers, createNumberPlacementResult } from "../domain/placement-ranking.js";
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
  type RequestId,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import { nextGameRevision } from "../../../domain/game-revision.js";
import {
  notifyGameFinishedBestEffort,
  type GameFinishedPostCommit,
} from "../../../application/game-finish-transition.js";
import type { RoomMutationSerialExecutor } from "../../../application/room-session-service.js";
import {
  scheduleCurrentTurnBestEffort,
  type TurnSchedulingFailureReporter,
} from "../../../application/turn-transition.js";
import type { IdempotencyRepository } from "../../../ports/idempotency-repository.js";
import type { PlayerPresenceLeaseReader } from "../../../ports/player-presence-lease.js";
import type { RoomRepository } from "../../../ports/room-repository.js";
import type {
  RoomUnitOfWork,
  RoomUnitOfWorkResult,
} from "../../../ports/room-unit-of-work.js";
import type {
  Clock,
  IdGenerator,
  RandomSource,
  ScheduledTurnDeadline,
  TurnScheduler,
} from "../../../ports/system.js";
import { drawSelectedNumberTile } from "../domain/draw.js";
import type { PlayingNumberTileGameState } from "../domain/game-state.js";
import {
  createNumberTileLastPlayerStandingResult,
  createNumberTileStalemateResult,
} from "../domain/result-engine.js";
import {
  advanceNumberTileOfflineTimeoutStreak,
  applyNumberTileForfeit,
  evaluateNumberTileFinish,
  recordNumberTileNoPlay,
  resetNumberTileNoPlayTracker,
} from "../domain/stalemate.js";
import { asNumberTilePlayingRoom } from "./number-tile-command-support.js";
import {
  createNextNumberTileTurn,
  createNumberTileFinishedRoomTransition,
} from "./number-tile-turn-transition.js";

const NumberTileTimeoutCommonSchema = v.strictObject({
  roomId: RoomIdSchema,
  gameId: GameIdSchema,
  roomRevision: RoomRevisionSchema,
  gameRevision: GameRevisionSchema,
  timedOutPlayerId: PlayerIdSchema,
  timedOutTurnId: TurnIdSchema,
  drawnTileId: v.nullable(TileIdSchema),
  offlineTimeoutStreak: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(2)),
  timedOutPlayerForfeited: v.boolean(),
});

const NumberTileTimeoutAdvancedDataSchema = v.strictObject({
  ...NumberTileTimeoutCommonSchema.entries,
  outcome: v.literal("ADVANCED"),
  nextTurnId: TurnIdSchema,
  nextTurnNumber: TurnNumberSchema,
});

const NumberTileTimeoutFinishedDataSchema = v.strictObject({
  ...NumberTileTimeoutCommonSchema.entries,
  outcome: v.literal("FINISHED"),
  finishReason: v.picklist(["STALEMATE", "LAST_PLAYER_STANDING"]),
  winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.minLength(1), v.maxLength(4)),
});

export const NumberTileTimeoutAppliedDataSchema = v.variant("outcome", [
  NumberTileTimeoutAdvancedDataSchema,
  NumberTileTimeoutFinishedDataSchema,
]);
export type NumberTileTimeoutAppliedData = v.InferOutput<
  typeof NumberTileTimeoutAppliedDataSchema
>;

export type NumberTileTimeoutNoOpReason =
  | "ROOM_NOT_FOUND"
  | "NOT_PLAYING"
  | "STALE_GAME"
  | "STALE_TURN"
  | "STALE_GAME_REVISION"
  | "STALE_DEADLINE"
  | "PRESENCE_CHANGED"
  | "NOT_DUE";

export type NumberTileTimeoutResult =
  | Readonly<{ status: "APPLIED"; data: NumberTileTimeoutAppliedData }>
  | Readonly<{ status: "NO_OP"; reason: NumberTileTimeoutNoOpReason }>
  | Readonly<{ status: "FAILED"; reason: "INTERNAL_ERROR" }>;

export type NumberTileTimeoutAppliedListener = (
  data: NumberTileTimeoutAppliedData,
) => void | Promise<void>;

export type NumberTileTimeoutServiceDependencies = Readonly<{
  roomRepository: RoomRepository;
  idempotencyRepository: IdempotencyRepository;
  roomUnitOfWork: RoomUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  clock: Clock;
  idGenerator: IdGenerator;
  randomSource: RandomSource;
  presenceLeaseReader: PlayerPresenceLeaseReader;
  turnScheduler?: TurnScheduler;
  onTurnSchedulingFailure?: TurnSchedulingFailureReporter;
  onGameFinished?: GameFinishedPostCommit;
}>;

type TimeoutExecution = Readonly<{
  result: NumberTileTimeoutResult;
  committed: boolean;
}>;

function timeoutRequestId(input: ScheduledTurnDeadline): RequestId {
  return v.parse(
    RequestIdSchema,
    `number-timeout:${input.gameId}:${input.turnId}`,
  );
}

function timeoutScope(input: ScheduledTurnDeadline): string {
  return `room-timeout:${input.roomId}:${input.gameId}`;
}

function timeoutFingerprint(input: ScheduledTurnDeadline): string {
  return JSON.stringify([
    "number:timeout",
    input.gameId,
    input.turnId,
    input.expectedGameRevision,
    input.deadlineAt,
  ]);
}

function parseReplay(terminalResult: unknown): NumberTileTimeoutResult {
  const parsed = v.safeParse(NumberTileTimeoutAppliedDataSchema, terminalResult);
  return parsed.success
    ? { status: "APPLIED", data: parsed.output }
    : { status: "FAILED", reason: "INTERNAL_ERROR" };
}

function selectPoolTile(
  game: PlayingNumberTileGameState,
  randomSource: RandomSource,
) {
  const selectedIndex = randomSource.nextInt(game.pool.length);
  if (
    !Number.isSafeInteger(selectedIndex) ||
    selectedIndex < 0 ||
    selectedIndex >= game.pool.length
  ) {
    throw new RangeError(
      "RandomSource returned an invalid Number Tile timeout draw index.",
    );
  }
  const selectedTileId = game.pool[selectedIndex];
  if (selectedTileId === undefined) {
    throw new Error("Canonical Number Tile timeout draw selection failed.");
  }
  return selectedTileId;
}

export class NumberTileTimeoutService {
  readonly #dependencies: NumberTileTimeoutServiceDependencies;
  readonly #appliedListeners = new Set<NumberTileTimeoutAppliedListener>();

  constructor(dependencies: NumberTileTimeoutServiceDependencies) {
    this.#dependencies = dependencies;
  }

  subscribeApplied(listener: NumberTileTimeoutAppliedListener): () => void {
    this.#appliedListeners.add(listener);
    return () => {
      this.#appliedListeners.delete(listener);
    };
  }

  async timeout(
    input: ScheduledTurnDeadline,
  ): Promise<NumberTileTimeoutResult> {
    let execution: TimeoutExecution;
    try {
      execution = await this.#dependencies.roomMutationExecutor.run(
        input.roomId,
        () => this.#timeoutWithinRoomBoundary(input),
      );
    } catch {
      return { status: "FAILED", reason: "INTERNAL_ERROR" };
    }

    if (
      execution.result.status === "APPLIED" &&
      execution.result.data.outcome === "ADVANCED"
    ) {
      await scheduleCurrentTurnBestEffort(
        this.#dependencies.roomRepository,
        this.#dependencies.turnScheduler,
        {
          roomId: execution.result.data.roomId,
          gameId: execution.result.data.gameId,
          gameRevision: execution.result.data.gameRevision,
          turnId: execution.result.data.nextTurnId,
        },
        this.#dependencies.onTurnSchedulingFailure,
      );
    } else if (
      execution.result.status === "APPLIED" &&
      execution.result.data.outcome === "FINISHED"
    ) {
      await notifyGameFinishedBestEffort(this.#dependencies.onGameFinished, {
        roomId: execution.result.data.roomId,
        gameId: execution.result.data.gameId,
      });
    } else if (
      execution.result.status === "NO_OP" &&
      execution.result.reason === "NOT_DUE"
    ) {
      await scheduleCurrentTurnBestEffort(
        this.#dependencies.roomRepository,
        this.#dependencies.turnScheduler,
        {
          roomId: input.roomId,
          gameId: input.gameId,
          gameRevision: input.expectedGameRevision,
          turnId: input.turnId,
        },
        this.#dependencies.onTurnSchedulingFailure,
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

  async #timeoutWithinRoomBoundary(
    input: ScheduledTurnDeadline,
  ): Promise<TimeoutExecution> {
    const located = await this.#dependencies.roomRepository.findById(
      input.roomId,
    );
    if (located === null) {
      return noOp("ROOM_NOT_FOUND");
    }
    if (located.gameType !== "NUMBER_TILE") {
      return failedExecution();
    }
    const room = asNumberTilePlayingRoom(located);
    if (room === null) {
      return noOp("NOT_PLAYING");
    }
    const game = room.game;
    if (game.gameId !== input.gameId) {
      return noOp("STALE_GAME");
    }
    if (game.turn.turnId !== input.turnId) {
      return noOp("STALE_TURN");
    }
    if (game.gameRevision !== input.expectedGameRevision) {
      return noOp("STALE_GAME_REVISION");
    }
    if (game.turn.deadlineAt !== input.deadlineAt) {
      return noOp("STALE_DEADLINE");
    }
    const committedAt = this.#dependencies.clock.now();
    if (committedAt < game.turn.deadlineAt) {
      return noOp("NOT_DUE");
    }

    const requestId = timeoutRequestId(input);
    const scopeKey = timeoutScope(input);
    const payloadFingerprint = timeoutFingerprint(input);
    const prior = await this.#dependencies.idempotencyRepository.classify(
      scopeKey,
      requestId,
      payloadFingerprint,
    );
    if (prior.status === "REPLAY") {
      return Object.freeze({
        result: parseReplay(prior.record.terminalResult),
        committed: false,
      });
    }
    if (prior.status === "CONFLICT") {
      return failedExecution();
    }

    const presenceLease =
      await this.#dependencies.presenceLeaseReader.acquirePlayerPresenceLease(
        room.roomId,
        game.turn.activePlayerId,
      );
    if (!presenceLease.isCurrent()) {
      return noOp("PRESENCE_CHANGED");
    }

    let pool = game.pool;
    const racks = new Map(game.racks);
    let noPlayPlayerIds = game.noPlayPlayerIds;
    let drawnTileId = null;
    const actorRack = racks.get(game.turn.activePlayerId);
    if (actorRack === undefined) {
      return failedExecution();
    }
    if (pool.length > 0) {
      const selectedTileId = selectPoolTile(
        game,
        this.#dependencies.randomSource,
      );
      const draw = drawSelectedNumberTile(pool, actorRack, selectedTileId);
      pool = draw.poolTileIds;
      racks.set(game.turn.activePlayerId, draw.rackTileIds);
      drawnTileId = draw.drawnTileId;
      noPlayPlayerIds = resetNumberTileNoPlayTracker();
    } else {
      noPlayPlayerIds = recordNumberTileNoPlay({
        turnOrder: game.turnOrder,
        forfeitedPlayerIds: numberIneligiblePlayers(game),
        noPlayPlayerIds,
        actorPlayerId: game.turn.activePlayerId,
        poolTileCount: 0,
      });
    }

    const offlineTimeoutStreakByPlayerId = new Map(
      game.offlineTimeoutStreakByPlayerId,
    );
    let forfeitedPlayerIds = game.forfeitedPlayerIds;
    let timedOutPlayerForfeited = false;
    let offlineTimeoutStreak =
      offlineTimeoutStreakByPlayerId.get(game.turn.activePlayerId) ?? 0;
    if (presenceLease.connectionStatus === "OFFLINE") {
      const streak = advanceNumberTileOfflineTimeoutStreak(
        offlineTimeoutStreak,
      );
      offlineTimeoutStreak = streak.streak;
      offlineTimeoutStreakByPlayerId.set(
        game.turn.activePlayerId,
        streak.streak,
      );
      if (streak.shouldForfeit) {
        const forfeit = applyNumberTileForfeit(
          game.turnOrder,
          game.forfeitedPlayerIds,
          noPlayPlayerIds,
          game.turn.activePlayerId,
        );
        forfeitedPlayerIds = forfeit.forfeitedPlayerIds;
        noPlayPlayerIds = forfeit.noPlayPlayerIds;
        timedOutPlayerForfeited = forfeit.changed;
      }
    } else {
      offlineTimeoutStreak = 0;
      offlineTimeoutStreakByPlayerId.set(game.turn.activePlayerId, 0);
    }

    const gameBase: PlayingNumberTileGameState = Object.freeze({
      ...game,
      pool,
      racks,
      offlineTimeoutStreakByPlayerId,
      forfeitedPlayerIds,
      noPlayPlayerIds,
    });
    const finish = evaluateNumberTileFinish({
      turnOrder: gameBase.turnOrder,
      forfeitedPlayerIds: numberIneligiblePlayers(gameBase),
      noPlayPlayerIds: gameBase.noPlayPlayerIds,
      poolTileCount: gameBase.pool.length,
      rackEmptyPlayerId: null,
    });

    let roomCandidate;
    let terminalResult;
    if (finish !== null) {
      const resultInput = {
        playerIds: gameBase.turnOrder,
        racks: gameBase.racks,
        tilesById: gameBase.tilesById,
        forfeitedPlayerIds: gameBase.forfeitedPlayerIds,
        finishedAt: committedAt,
      } as const;
      const result = gameBase.placementOrder !== undefined
        ? createNumberPlacementResult(gameBase, finish.reason === "STALEMATE" ? "STALEMATE" : "LAST_PLAYER_STANDING", committedAt)
        : finish.reason === "STALEMATE"
          ? createNumberTileStalemateResult(resultInput)
          : createNumberTileLastPlayerStandingResult(resultInput);
      const transition = createNumberTileFinishedRoomTransition(
        room,
        game,
        gameBase,
        result,
        committedAt,
      );
      roomCandidate = transition.roomCandidate;
      terminalResult = Object.freeze({
        roomId: room.roomId,
        gameId: game.gameId,
        roomRevision: transition.roomCandidate.roomRevision,
        gameRevision: transition.finishedGame.gameRevision,
        timedOutPlayerId: game.turn.activePlayerId,
        timedOutTurnId: game.turn.turnId,
        drawnTileId,
        offlineTimeoutStreak,
        timedOutPlayerForfeited,
        outcome: "FINISHED" as const,
        finishReason: result.reason,
        winnerPlayerIds: [...result.winnerPlayerIds],
      });
    } else {
      const gameRevision = nextGameRevision(game.gameRevision);
      const turn = createNextNumberTileTurn(
        game,
        committedAt,
        this.#dependencies.idGenerator,
        forfeitedPlayerIds,
      );
      const nextGame: PlayingNumberTileGameState = Object.freeze({
        ...gameBase,
        gameRevision,
        turn,
      });
      roomCandidate = Object.freeze({
        ...room,
        game: nextGame,
        updatedAt: committedAt,
      });
      terminalResult = Object.freeze({
        roomId: room.roomId,
        gameId: game.gameId,
        roomRevision: room.roomRevision,
        gameRevision,
        timedOutPlayerId: game.turn.activePlayerId,
        timedOutTurnId: game.turn.turnId,
        drawnTileId,
        offlineTimeoutStreak,
        timedOutPlayerForfeited,
        outcome: "ADVANCED" as const,
        nextTurnId: turn.turnId,
        nextTurnNumber: turn.turnNumber,
      });
    }

    const committed = await this.#dependencies.roomUnitOfWork.commit(
      {
        roomMutation: {
          kind: "REPLACE",
          candidate: roomCandidate,
          expectedRoomRevision: room.roomRevision,
          expectedStorageRevision: room.storageRevision,
        },
        sessionMutation: { kind: "NONE" },
        idempotency: {
          scopeKey,
          requestId,
          payloadFingerprint,
          terminalResult,
          createdAt: committedAt,
        },
      },
      { isSatisfied: () => presenceLease.isCurrent() },
    );
    return mapCommit(committed);
  }
}

function noOp(reason: NumberTileTimeoutNoOpReason): TimeoutExecution {
  return Object.freeze({
    result: Object.freeze({ status: "NO_OP", reason }),
    committed: false,
  });
}

function failedExecution(): TimeoutExecution {
  return Object.freeze({
    result: Object.freeze({ status: "FAILED", reason: "INTERNAL_ERROR" }),
    committed: false,
  });
}

function mapCommit(result: RoomUnitOfWorkResult): TimeoutExecution {
  switch (result.status) {
    case "COMMITTED":
      return Object.freeze({
        result: parseReplay(result.idempotency.terminalResult),
        committed: true,
      });
    case "REPLAY":
      return Object.freeze({
        result: parseReplay(result.idempotency.terminalResult),
        committed: false,
      });
    case "IDEMPOTENCY_CONFLICT":
      return failedExecution();
    case "PRECONDITION_FAILED":
      if (result.reason === "COMMIT_PRECONDITION_FAILED") {
        return noOp("PRESENCE_CHANGED");
      }
      if (
        result.reason === "ROOM_NOT_FOUND" ||
        result.reason === "STALE_ROOM_REVISION" ||
        result.reason === "STALE_STORAGE_REVISION"
      ) {
        return noOp("STALE_GAME_REVISION");
      }
      return failedExecution();
  }
}
