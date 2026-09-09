import { numberIneligiblePlayers, createNumberPlacementResult } from "../domain/placement-ranking.js";
import type { GameRevision, TurnId } from "@hangul-rummikub/shared";

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
import type { RoomRepository } from "../../../ports/room-repository.js";
import type {
  RoomUnitOfWork,
  RoomUnitOfWorkResult,
} from "../../../ports/room-unit-of-work.js";
import type { Clock, IdGenerator, TurnScheduler } from "../../../ports/system.js";
import {
  createNumberTileLastPlayerStandingResult,
  createNumberTileStalemateResult,
} from "../domain/result-engine.js";
import {
  canNumberTilePass,
  evaluateNumberTileFinish,
  recordNumberTileNoPlay,
} from "../domain/stalemate.js";
import {
  NUMBER_TILE_COMMAND_ERRORS,
  asNumberTilePlayingRoom,
  failure,
  isSameNumberTileTurn,
  mapNumberTileCommitFailure,
  numberTileCommandScope,
  parseNumberTileMutationReplay,
  validateNumberTileTurnAuthority,
  type NumberTileMutationResult,
  type NumberTileTurnCommandInput,
} from "./number-tile-command-support.js";
import {
  createNextNumberTileTurn,
  createNumberTileFinishedRoomTransition,
} from "./number-tile-turn-transition.js";

export type NumberTilePassInput = NumberTileTurnCommandInput;
export type NumberTilePassResult = NumberTileMutationResult;

export type NumberTilePassServiceDependencies = Readonly<{
  roomRepository: RoomRepository;
  idempotencyRepository: IdempotencyRepository;
  roomUnitOfWork: RoomUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  clock: Clock;
  idGenerator: IdGenerator;
  turnScheduler?: TurnScheduler;
  onTurnSchedulingFailure?: TurnSchedulingFailureReporter;
  onGameFinished?: GameFinishedPostCommit;
}>;

export function createNumberTilePassFingerprint(
  expectedGameRevision: GameRevision,
  turnId: TurnId,
): string {
  return JSON.stringify(["number:pass", expectedGameRevision, turnId]);
}

export class NumberTilePassService {
  readonly #dependencies: NumberTilePassServiceDependencies;

  constructor(dependencies: NumberTilePassServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async pass(input: NumberTilePassInput): Promise<NumberTilePassResult> {
    let result: NumberTilePassResult;
    try {
      result = await this.#dependencies.roomMutationExecutor.run(
        input.roomId,
        () => this.#passWithinRoomBoundary(input),
      );
    } catch {
      return failure(NUMBER_TILE_COMMAND_ERRORS.INTERNAL_ERROR);
    }

    if (result.ok && result.data.outcome === "ADVANCED") {
      await scheduleCurrentTurnBestEffort(
        this.#dependencies.roomRepository,
        this.#dependencies.turnScheduler,
        {
          roomId: result.data.roomId,
          gameId: result.data.gameId,
          gameRevision: result.data.gameRevision,
          turnId: result.data.nextTurnId,
        },
        this.#dependencies.onTurnSchedulingFailure,
      );
    } else if (result.ok) {
      await notifyGameFinishedBestEffort(this.#dependencies.onGameFinished, {
        roomId: result.data.roomId,
        gameId: result.data.gameId,
      });
    }
    return result;
  }

  async #passWithinRoomBoundary(
    input: NumberTilePassInput,
  ): Promise<NumberTilePassResult> {
    const scopeKey = numberTileCommandScope(input);
    const payloadFingerprint = createNumberTilePassFingerprint(
      input.expectedGameRevision,
      input.turnId,
    );
    const prior = await this.#dependencies.idempotencyRepository.classify(
      scopeKey,
      input.requestId,
      payloadFingerprint,
    );
    if (prior.status === "REPLAY") {
      return parseNumberTileMutationReplay(prior.record.terminalResult);
    }
    if (prior.status === "CONFLICT") {
      return failure(NUMBER_TILE_COMMAND_ERRORS.REQUEST_ID_REUSED);
    }

    const located = await this.#dependencies.roomRepository.findById(
      input.roomId,
    );
    if (located === null) {
      return failure(NUMBER_TILE_COMMAND_ERRORS.ROOM_NOT_FOUND);
    }
    const room = asNumberTilePlayingRoom(located);
    if (room === null) {
      return failure(
        located.gameType === "NUMBER_TILE"
          ? NUMBER_TILE_COMMAND_ERRORS.INVALID_PHASE
          : NUMBER_TILE_COMMAND_ERRORS.INTERNAL_ERROR,
      );
    }
    const authorityError = validateNumberTileTurnAuthority(input, room.game);
    if (authorityError !== null) {
      return failure(authorityError);
    }
    if (!canNumberTilePass(room.game.pool.length)) {
      return failure(NUMBER_TILE_COMMAND_ERRORS.PASS_NOT_ALLOWED);
    }

    if (!input.authorization.isCurrent()) {
      return failure(NUMBER_TILE_COMMAND_ERRORS.UNAUTHENTICATED);
    }
    const latest = await this.#dependencies.roomRepository.findById(
      room.roomId,
    );
    if (latest === null) {
      return failure(NUMBER_TILE_COMMAND_ERRORS.ROOM_NOT_FOUND);
    }
    if (!isSameNumberTileTurn(latest, room, room.game)) {
      return failure(NUMBER_TILE_COMMAND_ERRORS.STALE_GAME_REVISION);
    }
    if (!canNumberTilePass(latest.game.pool.length)) {
      return failure(NUMBER_TILE_COMMAND_ERRORS.PASS_NOT_ALLOWED);
    }

    const committedAt = this.#dependencies.clock.now();
    const noPlayPlayerIds = recordNumberTileNoPlay({
      turnOrder: latest.game.turnOrder,
      forfeitedPlayerIds: numberIneligiblePlayers(latest.game),
      noPlayPlayerIds: latest.game.noPlayPlayerIds,
      actorPlayerId: input.actorPlayerId,
      poolTileCount: latest.game.pool.length,
    });
    const gameBase = Object.freeze({
      ...latest.game,
      noPlayPlayerIds,
    });
    const finish = evaluateNumberTileFinish({
      turnOrder: gameBase.turnOrder,
      forfeitedPlayerIds: numberIneligiblePlayers(gameBase),
      noPlayPlayerIds: gameBase.noPlayPlayerIds,
      poolTileCount: gameBase.pool.length,
      rackEmptyPlayerId: null,
    });

    let candidate;
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
        latest,
        latest.game,
        gameBase,
        result,
        committedAt,
      );
      candidate = transition.roomCandidate;
      terminalResult = Object.freeze({
        roomId: latest.roomId,
        gameId: latest.game.gameId,
        roomRevision: transition.roomCandidate.roomRevision,
        gameRevision: transition.finishedGame.gameRevision,
        outcome: "FINISHED" as const,
        finishReason: result.reason,
        winnerPlayerIds: [...result.winnerPlayerIds],
      });
    } else {
      const gameRevision = nextGameRevision(
        latest.game.gameRevision,
      );
      const turn = createNextNumberTileTurn(
        latest.game,
        committedAt,
        this.#dependencies.idGenerator,
      );
      const game = Object.freeze({
        ...gameBase,
        gameRevision,
        turn,
      });
      candidate = Object.freeze({
        ...latest,
        game,
        updatedAt: committedAt,
      });
      terminalResult = Object.freeze({
        roomId: latest.roomId,
        gameId: latest.game.gameId,
        roomRevision: latest.roomRevision,
        gameRevision,
        outcome: "ADVANCED" as const,
        nextTurnId: turn.turnId,
        nextTurnNumber: turn.turnNumber,
      });
    }

    const committed = await this.#dependencies.roomUnitOfWork.commit(
      {
        roomMutation: {
          kind: "REPLACE",
          candidate,
          expectedRoomRevision: latest.roomRevision,
          expectedStorageRevision: latest.storageRevision,
        },
        sessionMutation: { kind: "NONE" },
        idempotency: {
          scopeKey,
          requestId: input.requestId,
          payloadFingerprint,
          terminalResult,
          createdAt: committedAt,
        },
      },
      { isSatisfied: () => input.authorization.isCurrent() },
    );
    return this.#mapCommit(committed);
  }

  #mapCommit(result: RoomUnitOfWorkResult): NumberTilePassResult {
    if (result.status === "COMMITTED" || result.status === "REPLAY") {
      return parseNumberTileMutationReplay(result.idempotency.terminalResult);
    }
    return failure(mapNumberTileCommitFailure(result));
  }
}
