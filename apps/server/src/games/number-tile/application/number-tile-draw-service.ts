import type {
  GameRevision,
  TurnId,
} from "@hangul-rummikub/shared";

import { nextGameRevision } from "../../../domain/game-revision.js";
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
import type {
  Clock,
  IdGenerator,
  RandomSource,
  TurnScheduler,
} from "../../../ports/system.js";
import { drawSelectedNumberTile } from "../domain/draw.js";
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
} from "./number-tile-turn-transition.js";

export type NumberTileDrawInput = NumberTileTurnCommandInput;
export type NumberTileDrawResult = NumberTileMutationResult;

export type NumberTileDrawServiceDependencies = Readonly<{
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

export function createNumberTileDrawFingerprint(
  expectedGameRevision: GameRevision,
  turnId: TurnId,
): string {
  return JSON.stringify(["number:draw", expectedGameRevision, turnId]);
}

function selectPoolTileIndex(
  poolSize: number,
  randomSource: RandomSource,
): number {
  const selected = randomSource.nextInt(poolSize);
  if (
    !Number.isSafeInteger(selected) ||
    selected < 0 ||
    selected >= poolSize
  ) {
    throw new RangeError(
      "RandomSource returned an invalid Number Tile pool index.",
    );
  }
  return selected;
}

export class NumberTileDrawService {
  readonly #dependencies: NumberTileDrawServiceDependencies;

  constructor(dependencies: NumberTileDrawServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async draw(input: NumberTileDrawInput): Promise<NumberTileDrawResult> {
    let result: NumberTileDrawResult;
    try {
      result = await this.#dependencies.roomMutationExecutor.run(
        input.roomId,
        () => this.#drawWithinRoomBoundary(input),
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
    }
    return result;
  }

  async #drawWithinRoomBoundary(
    input: NumberTileDrawInput,
  ): Promise<NumberTileDrawResult> {
    const scopeKey = numberTileCommandScope(input);
    const payloadFingerprint = createNumberTileDrawFingerprint(
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
    if (room.game.pool.length === 0) {
      return failure(NUMBER_TILE_COMMAND_ERRORS.POOL_EMPTY);
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
    if (latest.game.pool.length === 0) {
      return failure(NUMBER_TILE_COMMAND_ERRORS.POOL_EMPTY);
    }

    const actorRack = latest.game.racks.get(input.actorPlayerId);
    if (actorRack === undefined) {
      return failure(NUMBER_TILE_COMMAND_ERRORS.INTERNAL_ERROR);
    }
    // Randomness is consumed only after idempotency, authority, and latest
    // canonical identity checks have all passed.
    const selectedIndex = selectPoolTileIndex(
      latest.game.pool.length,
      this.#dependencies.randomSource,
    );
    const selectedTileId = latest.game.pool[selectedIndex];
    if (selectedTileId === undefined) {
      throw new Error("Canonical Number Tile pool selection failed.");
    }
    const draw = drawSelectedNumberTile(
      latest.game.pool,
      actorRack,
      selectedTileId,
    );
    const committedAt = this.#dependencies.clock.now();
    const gameRevision = nextGameRevision(
      latest.game.gameRevision,
    );
    const turn = createNextNumberTileTurn(
      latest.game,
      committedAt,
      this.#dependencies.idGenerator,
    );
    const racks = new Map(latest.game.racks);
    racks.set(input.actorPlayerId, draw.rackTileIds);
    const game = Object.freeze({
      ...latest.game,
      gameRevision,
      pool: draw.poolTileIds,
      racks,
      noPlayPlayerIds: resetNumberTileNoPlayTracker(),
      turn,
    });
    const terminalResult = Object.freeze({
      roomId: latest.roomId,
      gameId: latest.game.gameId,
      roomRevision: latest.roomRevision,
      gameRevision,
      outcome: "ADVANCED" as const,
      nextTurnId: turn.turnId,
      nextTurnNumber: turn.turnNumber,
    });
    const committed = await this.#dependencies.roomUnitOfWork.commit(
      {
        roomMutation: {
          kind: "REPLACE",
          candidate: {
            ...latest,
            game,
            updatedAt: committedAt,
          },
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

  #mapCommit(result: RoomUnitOfWorkResult): NumberTileDrawResult {
    if (result.status === "COMMITTED" || result.status === "REPLAY") {
      return parseNumberTileMutationReplay(result.idempotency.terminalResult);
    }
    return failure(mapNumberTileCommitFailure(result));
  }
}
