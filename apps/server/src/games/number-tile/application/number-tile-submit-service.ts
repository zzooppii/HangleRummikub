import type {
  ErrorDto,
  GameRevision,
  NumberTileProposedTable,
  TurnId,
} from "@hangul-rummikub/shared";

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
import { createNumberTileRackEmptyResult } from "../domain/result-engine.js";
import {
  validateNumberTileSubmit,
  type NumberTileRuleFailure,
} from "../domain/rule-engine.js";
import { resetNumberTileNoPlayTracker } from "../domain/stalemate.js";
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

export type NumberTileSubmitInput = NumberTileTurnCommandInput &
  Readonly<{ proposedTable: NumberTileProposedTable }>;

export type NumberTileSubmitResult = NumberTileMutationResult;

export type NumberTileSubmitServiceDependencies = Readonly<{
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

export function createNumberTileSubmitFingerprint(
  expectedGameRevision: GameRevision,
  turnId: TurnId,
  proposedTable: NumberTileProposedTable,
): string {
  return JSON.stringify([
    "number:submit",
    expectedGameRevision,
    turnId,
    proposedTable.melds.map((meld) => [
      meld.kind,
      meld.tiles.map((tile) => [tile.tileId, tile.kind]),
    ]),
  ]);
}

function mapRuleFailure(error: NumberTileRuleFailure): ErrorDto {
  switch (error.code) {
    case "INVALID_TILE_ACCESS":
    case "DUPLICATE_TILE_REFERENCE":
    case "TILE_CONSERVATION_FAILED":
      return NUMBER_TILE_COMMAND_ERRORS.INVALID_TILE_ACCESS;
    case "INVALID_MELD":
      return NUMBER_TILE_COMMAND_ERRORS.INVALID_MELD;
    case "INITIAL_MELD_REQUIRED":
      return NUMBER_TILE_COMMAND_ERRORS.INITIAL_MELD_REQUIRED;
    case "INITIAL_MELD_TOO_LOW":
      return NUMBER_TILE_COMMAND_ERRORS.INITIAL_MELD_TOO_LOW;
    case "TABLE_REARRANGEMENT_NOT_ALLOWED":
      return NUMBER_TILE_COMMAND_ERRORS.TABLE_REARRANGEMENT_NOT_ALLOWED;
    case "NO_NEW_RACK_TILE":
      return NUMBER_TILE_COMMAND_ERRORS.NO_NEW_RACK_TILE;
    case "INVALID_JOKER_ASSIGNMENT":
      return NUMBER_TILE_COMMAND_ERRORS.INVALID_JOKER_ASSIGNMENT;
  }
}

export class NumberTileSubmitService {
  readonly #dependencies: NumberTileSubmitServiceDependencies;

  constructor(dependencies: NumberTileSubmitServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async submit(input: NumberTileSubmitInput): Promise<NumberTileSubmitResult> {
    let result: NumberTileSubmitResult;
    try {
      result = await this.#dependencies.roomMutationExecutor.run(
        input.roomId,
        () => this.#submitWithinRoomBoundary(input),
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

  async #submitWithinRoomBoundary(
    input: NumberTileSubmitInput,
  ): Promise<NumberTileSubmitResult> {
    const scopeKey = numberTileCommandScope(input);
    const payloadFingerprint = createNumberTileSubmitFingerprint(
      input.expectedGameRevision,
      input.turnId,
      input.proposedTable,
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

    const actorRack = room.game.racks.get(input.actorPlayerId);
    const initialMeldCompleted = room.game.initialMeldCompleted.get(
      input.actorPlayerId,
    );
    if (actorRack === undefined || initialMeldCompleted === undefined) {
      return failure(NUMBER_TILE_COMMAND_ERRORS.INTERNAL_ERROR);
    }
    const validation = validateNumberTileSubmit({
      canonicalTable: room.game.table,
      proposedTable: input.proposedTable,
      tilesById: room.game.tilesById,
      actorRackTileIds: actorRack,
      initialMeldCompleted,
    });
    if (!validation.ok) {
      return failure(mapRuleFailure(validation.error));
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

    const committedAt = this.#dependencies.clock.now();
    const racks = new Map(latest.game.racks);
    racks.set(
      input.actorPlayerId,
      Object.freeze([...validation.value.remainingRackTileIds]),
    );
    const initialMeldState = new Map(latest.game.initialMeldCompleted);
    if (validation.value.completesInitialMeld) {
      initialMeldState.set(input.actorPlayerId, true);
    }
    const gameBase = Object.freeze({
      ...latest.game,
      racks,
      table: validation.value.table,
      initialMeldCompleted: initialMeldState,
      noPlayPlayerIds: resetNumberTileNoPlayTracker(),
    });

    let terminalResult;
    let candidate;
    if (validation.value.remainingRackTileIds.length === 0) {
      const result = createNumberTileRackEmptyResult(
        {
          playerIds: gameBase.turnOrder,
          racks: gameBase.racks,
          tilesById: gameBase.tilesById,
          forfeitedPlayerIds: gameBase.forfeitedPlayerIds,
          finishedAt: committedAt,
        },
        input.actorPlayerId,
      );
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
        finishReason: "RACK_EMPTY" as const,
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

  #mapCommit(result: RoomUnitOfWorkResult): NumberTileSubmitResult {
    if (result.status === "COMMITTED" || result.status === "REPLAY") {
      return parseNumberTileMutationReplay(result.idempotency.terminalResult);
    }
    return failure(mapNumberTileCommitFailure(result));
  }
}
