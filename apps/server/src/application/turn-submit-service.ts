import {
  GameIdSchema,
  GameRevisionSchema,
  PlayerIdSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  TurnIdSchema,
  TurnNumberSchema,
  type ErrorDto,
  type GameRevision,
  type PlayerId,
  type ProposedBoard,
  type RequestId,
  type RoomId,
  type RoomRevision,
  type ServerTime,
  type TileId,
  type TurnId,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type { Board } from "../domain/game/board.js";
import type {
  FinishedGameState,
  GameResult,
  GameScoreEntry,
  GameTurn,
  PlayingGameState,
} from "../domain/game/game-state.js";
import {
  validateProposedBoard,
  type BoardValidationError,
  type BoardValidationResult,
  type ValidateBoardInput,
} from "../domain/game/rule-engine.js";
import type { RoomRecord, RoomWriteCandidate } from "../model/persistence.js";
import type { IdempotencyRepository } from "../ports/idempotency-repository.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type {
  RoomUnitOfWork,
  RoomUnitOfWorkResult,
} from "../ports/room-unit-of-work.js";
import type {
  Clock,
  DictionaryProvider,
  IdGenerator,
} from "../ports/system.js";
import type { CurrentActorAuthorization } from "./game-start-service.js";
import type { RoomMutationSerialExecutor } from "./room-session-service.js";

const TurnSubmitAdvancedDataSchema = v.strictObject({
  roomId: RoomIdSchema,
  gameId: GameIdSchema,
  roomRevision: RoomRevisionSchema,
  gameRevision: GameRevisionSchema,
  outcome: v.literal("ADVANCED"),
  nextTurnId: TurnIdSchema,
  nextTurnNumber: TurnNumberSchema,
});

const TurnSubmitFinishedDataSchema = v.strictObject({
  roomId: RoomIdSchema,
  gameId: GameIdSchema,
  roomRevision: RoomRevisionSchema,
  gameRevision: GameRevisionSchema,
  outcome: v.literal("FINISHED"),
  finishReason: v.literal("RACK_EMPTY"),
  winnerPlayerId: PlayerIdSchema,
});

export const TurnSubmitSuccessDataSchema = v.variant("outcome", [
  TurnSubmitAdvancedDataSchema,
  TurnSubmitFinishedDataSchema,
]);

export type TurnSubmitSuccessData = v.InferOutput<
  typeof TurnSubmitSuccessDataSchema
>;

export type TurnSubmitResult =
  | Readonly<{ ok: true; data: TurnSubmitSuccessData }>
  | Readonly<{ ok: false; error: ErrorDto }>;

export type TurnSubmitInput = Readonly<{
  roomId: RoomId;
  actorPlayerId: PlayerId;
  requestId: RequestId;
  expectedGameRevision: GameRevision;
  turnId: TurnId;
  receivedAt: ServerTime;
  proposedBoard: ProposedBoard;
  authorization: CurrentActorAuthorization;
}>;

export type TurnSubmitCheckpoint =
  | "AFTER_RULE_VALIDATION"
  | "AFTER_CANDIDATE_CREATED"
  | "BEFORE_COMMIT";

export type TurnSubmitServiceDependencies = Readonly<{
  roomRepository: RoomRepository;
  idempotencyRepository: IdempotencyRepository;
  roomUnitOfWork: RoomUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  clock: Clock;
  idGenerator: IdGenerator;
  dictionaryProvider: DictionaryProvider;
  validateBoard?: (
    input: ValidateBoardInput,
  ) => Promise<BoardValidationResult>;
  onCheckpoint?: (checkpoint: TurnSubmitCheckpoint) => void;
}>;

const ERRORS = Object.freeze({
  ROOM_NOT_FOUND: Object.freeze({
    code: "ROOM_NOT_FOUND",
    message: "Room was not found.",
    recoverable: false,
  }),
  INVALID_PHASE: Object.freeze({
    code: "INVALID_PHASE",
    message: "The Room is not accepting turn submissions.",
    recoverable: false,
  }),
  UNAUTHENTICATED: Object.freeze({
    code: "UNAUTHENTICATED",
    message: "The command actor is no longer authorized.",
    recoverable: true,
  }),
  NOT_YOUR_TURN: Object.freeze({
    code: "NOT_YOUR_TURN",
    message: "The submitted Turn is not the actor's current Turn.",
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
  REQUEST_ID_REUSED: Object.freeze({
    code: "REQUEST_ID_REUSED",
    message: "Request ID was already used for a different command payload.",
    recoverable: false,
  }),
  INVALID_TILE_ACCESS: Object.freeze({
    code: "INVALID_TILE_ACCESS",
    message: "The proposed Board contains an unavailable Tile.",
    recoverable: true,
  }),
  INVALID_BOARD: Object.freeze({
    code: "INVALID_BOARD",
    message: "The proposed Board is invalid.",
    recoverable: true,
  }),
  INVALID_HANGUL_COMPOSITION: Object.freeze({
    code: "INVALID_HANGUL_COMPOSITION",
    message: "A WordGroup cannot be composed as modern Hangul.",
    recoverable: true,
  }),
  WORD_NOT_ALLOWED: Object.freeze({
    code: "WORD_NOT_ALLOWED",
    message: "A composed word is not allowed by this Game's dictionary.",
    recoverable: true,
  }),
  RULE_VIOLATION: Object.freeze({
    code: "RULE_VIOLATION",
    message: "The proposed Board violates a Game rule.",
    recoverable: true,
  }),
  TEMPORARILY_UNAVAILABLE: Object.freeze({
    code: "TEMPORARILY_UNAVAILABLE",
    message: "Word validation is temporarily unavailable.",
    recoverable: true,
  }),
  INTERNAL_ERROR: Object.freeze({
    code: "INTERNAL_ERROR",
    message: "An internal error occurred.",
    recoverable: false,
  }),
} satisfies Readonly<Record<string, ErrorDto>>);

function succeeded(data: TurnSubmitSuccessData): TurnSubmitResult {
  return { ok: true, data };
}

function failed(error: ErrorDto): TurnSubmitResult {
  return { ok: false, error };
}

function idempotencyScope(input: TurnSubmitInput): string {
  return `room-player:${input.roomId}:${input.actorPlayerId}`;
}

/** Stable over wire-object property ordering and intentionally preserves Board order. */
export function createTurnSubmitFingerprint(
  expectedGameRevision: GameRevision,
  turnId: TurnId,
  proposedBoard: ProposedBoard,
): string {
  return JSON.stringify([
    "turn:submit",
    expectedGameRevision,
    turnId,
    proposedBoard.wordGroups.map((group) => [
      group.groupId,
      group.syllables.map((syllable) => [
        syllable.choseong.map((component) => [
          component.tileId,
          component.assignedSymbol,
        ]),
        syllable.jungseong.map((component) => [
          component.tileId,
          component.assignedSymbol,
        ]),
        syllable.jongseong.map((component) => [
          component.tileId,
          component.assignedSymbol,
        ]),
      ]),
    ]),
  ]);
}

function toDomainBoard(proposedBoard: ProposedBoard): Board {
  const cloneComponents = (
    components: ProposedBoard["wordGroups"][number]["syllables"][number]["choseong"],
  ) =>
    Object.freeze(
      components.map((component) =>
        Object.freeze({
          tileId: component.tileId,
          assignedSymbol: component.assignedSymbol,
        }),
      ),
    );

  return Object.freeze({
    wordGroups: Object.freeze(
      proposedBoard.wordGroups.map((group) =>
        Object.freeze({
          groupId: group.groupId,
          syllables: Object.freeze(
            group.syllables.map((syllable) =>
              Object.freeze({
                choseong: cloneComponents(syllable.choseong),
                jungseong: cloneComponents(syllable.jungseong),
                jongseong: cloneComponents(syllable.jongseong),
              }),
            ),
          ),
        }),
      ),
    ),
  });
}

function incrementGameRevision(revision: GameRevision): GameRevision {
  return v.parse(GameRevisionSchema, revision + 1);
}

function incrementRoomRevision(revision: RoomRevision): RoomRevision {
  return v.parse(RoomRevisionSchema, revision + 1);
}

function addDuration(startedAt: ServerTime, durationMs: number): ServerTime {
  return v.parse(ServerTimeSchema, startedAt + durationMs);
}

function parseAcceptedResult(terminalResult: unknown): TurnSubmitResult {
  const parsed = v.safeParse(TurnSubmitSuccessDataSchema, terminalResult);
  return parsed.success ? succeeded(parsed.output) : failed(ERRORS.INTERNAL_ERROR);
}

function mapRuleError(error: BoardValidationError): ErrorDto {
  switch (error.code) {
    case "INVALID_TILE_REFERENCE":
    case "TILE_NOT_OWNED":
      return ERRORS.INVALID_TILE_ACCESS;
    case "INVALID_BOARD":
    case "INVALID_TILE_ASSIGNMENT":
    case "TILE_CONSERVATION_VIOLATION":
      return ERRORS.INVALID_BOARD;
    case "INVALID_HANGUL_COMPOSITION":
      return ERRORS.INVALID_HANGUL_COMPOSITION;
    case "WORD_NOT_ALLOWED":
      return ERRORS.WORD_NOT_ALLOWED;
    case "DICTIONARY_UNAVAILABLE":
      return ERRORS.TEMPORARILY_UNAVAILABLE;
    case "WORD_TOO_SHORT":
    case "INITIAL_MELD_VIOLATION":
    case "REARRANGEMENT_VIOLATION":
    case "JOKER_RULE_VIOLATION":
      return ERRORS.RULE_VIOLATION;
  }
}

function cloneBoard(board: Board): Board {
  return Object.freeze({
    wordGroups: Object.freeze(
      board.wordGroups.map((group) =>
        Object.freeze({
          groupId: group.groupId,
          syllables: Object.freeze(
            group.syllables.map((syllable) =>
              Object.freeze({
                choseong: Object.freeze(
                  syllable.choseong.map((component) =>
                    Object.freeze({ ...component }),
                  ),
                ),
                jungseong: Object.freeze(
                  syllable.jungseong.map((component) =>
                    Object.freeze({ ...component }),
                  ),
                ),
                jongseong: Object.freeze(
                  syllable.jongseong.map((component) =>
                    Object.freeze({ ...component }),
                  ),
                ),
              }),
            ),
          ),
        }),
      ),
    ),
  });
}

function nextTurn(
  game: PlayingGameState,
  startedAt: ServerTime,
  idGenerator: IdGenerator,
): GameTurn {
  const activeIndex = game.turnOrder.indexOf(game.turn.activePlayerId);
  if (activeIndex < 0 || game.turnOrder.length < 2) {
    throw new Error("Canonical turn order is invalid.");
  }
  const activePlayerId = game.turnOrder[(activeIndex + 1) % game.turnOrder.length];
  if (activePlayerId === undefined) {
    throw new Error("Canonical turn order has no next Player.");
  }

  return Object.freeze({
    turnId: idGenerator.generateTurnId(),
    turnNumber: v.parse(TurnNumberSchema, game.turn.turnNumber + 1),
    activePlayerId,
    startedAt,
    deadlineAt: addDuration(startedAt, game.rulesConfig.turnDurationMs),
  });
}

function removeUsedRackTiles(
  rack: readonly TileId[],
  usedTileIds: readonly TileId[],
): readonly TileId[] {
  const used = new Set(usedTileIds);
  if (used.size !== usedTileIds.length) {
    throw new Error("RuleEngine returned duplicate newly-used Tile IDs.");
  }
  for (const tileId of used) {
    if (!rack.includes(tileId)) {
      throw new Error("RuleEngine returned a Tile outside the actor rack.");
    }
  }
  return Object.freeze(rack.filter((tileId) => !used.has(tileId)));
}

function createGameResult(
  game: PlayingGameState,
  racks: ReadonlyMap<PlayerId, readonly TileId[]>,
  winnerPlayerId: PlayerId,
  finishedAt: ServerTime,
): GameResult {
  let winnerScore = 0;
  const scores: GameScoreEntry[] = [];

  for (const playerId of game.turnOrder) {
    const rack = racks.get(playerId);
    if (rack === undefined) {
      throw new Error("Canonical Game is missing a Player rack.");
    }
    if (playerId === winnerPlayerId) {
      continue;
    }

    let penalty = 0;
    for (const tileId of rack) {
      const tile = game.tilesById.get(tileId);
      if (tile === undefined) {
        throw new Error("Canonical rack references an unknown Tile.");
      }
      penalty += tile.kind === "JOKER" ? 30 : 1;
    }
    winnerScore += penalty;
    scores.push(
      Object.freeze({
        playerId,
        score: -penalty,
        remainingRackTileCount: rack.length,
      }),
    );
  }

  const orderedScores = game.turnOrder.map((playerId) => {
    if (playerId === winnerPlayerId) {
      return Object.freeze({
        playerId,
        score: winnerScore,
        remainingRackTileCount: 0,
      });
    }
    const score = scores.find((entry) => entry.playerId === playerId);
    if (score === undefined) {
      throw new Error("Game score derivation missed a Player.");
    }
    return score;
  });

  return Object.freeze({
    reason: "RACK_EMPTY",
    winnerPlayerId,
    scores: Object.freeze(orderedScores),
    finishedAt,
  });
}

type CandidateResult = Readonly<{
  roomCandidate: RoomWriteCandidate;
  terminalResult: TurnSubmitSuccessData;
}>;

function createCandidate(
  room: RoomRecord,
  game: PlayingGameState,
  proposedBoard: Board,
  newlyUsedRackTileIds: readonly TileId[],
  completesInitialMeld: boolean,
  actorPlayerId: PlayerId,
  committedAt: ServerTime,
  idGenerator: IdGenerator,
): CandidateResult {
  const actorRack = game.racks.get(actorPlayerId);
  if (actorRack === undefined) {
    throw new Error("Canonical Game is missing the actor rack.");
  }
  const nextActorRack = removeUsedRackTiles(actorRack, newlyUsedRackTileIds);
  const racks = new Map<PlayerId, readonly TileId[]>(
    [...game.racks].map(([playerId, rack]) => [
      playerId,
      playerId === actorPlayerId
        ? nextActorRack
        : Object.freeze([...rack]),
    ]),
  );
  const initialMeldCompleted = new Map(game.initialMeldCompleted);
  if (completesInitialMeld) {
    initialMeldCompleted.set(actorPlayerId, true);
  }
  const gameRevision = incrementGameRevision(game.gameRevision);
  const baseGame = {
    gameId: game.gameId,
    gameRevision,
    rulesConfig: game.rulesConfig,
    tilesById: game.tilesById,
    consonantBag: game.consonantBag,
    vowelBag: game.vowelBag,
    racks,
    board: cloneBoard(proposedBoard),
    initialMeldCompleted,
    turnOrder: Object.freeze([...game.turnOrder]),
    gameStartedAt: game.gameStartedAt,
    gameDeadlineAt: game.gameDeadlineAt,
  };

  if (nextActorRack.length === 0) {
    const roomRevision = incrementRoomRevision(room.roomRevision);
    const result = createGameResult(game, racks, actorPlayerId, committedAt);
    const finishedGame: FinishedGameState = Object.freeze({
      ...baseGame,
      turn: null,
      result,
    });
    return {
      roomCandidate: Object.freeze({
        roomId: room.roomId,
        roomCode: room.roomCode,
        phase: "FINISHED",
        hostPlayerId: room.hostPlayerId,
        players: room.players,
        game: finishedGame,
        roomRevision,
        createdAt: room.createdAt,
        updatedAt: committedAt,
      }),
      terminalResult: Object.freeze({
        roomId: room.roomId,
        gameId: game.gameId,
        roomRevision,
        gameRevision,
        outcome: "FINISHED",
        finishReason: "RACK_EMPTY",
        winnerPlayerId: actorPlayerId,
      }),
    };
  }

  const turn = nextTurn(game, committedAt, idGenerator);
  const activeGame: PlayingGameState = Object.freeze({
    ...baseGame,
    turn,
    result: null,
  });
  return {
    roomCandidate: Object.freeze({
      roomId: room.roomId,
      roomCode: room.roomCode,
      phase: "PLAYING",
      hostPlayerId: room.hostPlayerId,
      players: room.players,
      game: activeGame,
      roomRevision: room.roomRevision,
      createdAt: room.createdAt,
      updatedAt: committedAt,
    }),
    terminalResult: Object.freeze({
      roomId: room.roomId,
      gameId: game.gameId,
      roomRevision: room.roomRevision,
      gameRevision,
      outcome: "ADVANCED",
      nextTurnId: turn.turnId,
      nextTurnNumber: turn.turnNumber,
    }),
  };
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

export class TurnSubmitService {
  readonly #roomRepository: RoomRepository;
  readonly #idempotencyRepository: IdempotencyRepository;
  readonly #roomUnitOfWork: RoomUnitOfWork;
  readonly #roomMutationExecutor: RoomMutationSerialExecutor;
  readonly #clock: Clock;
  readonly #idGenerator: IdGenerator;
  readonly #dictionaryProvider: DictionaryProvider;
  readonly #validateBoard: (
    input: ValidateBoardInput,
  ) => Promise<BoardValidationResult>;
  readonly #onCheckpoint: ((checkpoint: TurnSubmitCheckpoint) => void) | undefined;

  constructor(dependencies: TurnSubmitServiceDependencies) {
    this.#roomRepository = dependencies.roomRepository;
    this.#idempotencyRepository = dependencies.idempotencyRepository;
    this.#roomUnitOfWork = dependencies.roomUnitOfWork;
    this.#roomMutationExecutor = dependencies.roomMutationExecutor;
    this.#clock = dependencies.clock;
    this.#idGenerator = dependencies.idGenerator;
    this.#dictionaryProvider = dependencies.dictionaryProvider;
    this.#validateBoard = dependencies.validateBoard ?? validateProposedBoard;
    this.#onCheckpoint = dependencies.onCheckpoint;
  }

  async submit(input: TurnSubmitInput): Promise<TurnSubmitResult> {
    try {
      return await this.#roomMutationExecutor.run(input.roomId, () =>
        this.#submitWithinRoomBoundary(input),
      );
    } catch {
      return failed(ERRORS.INTERNAL_ERROR);
    }
  }

  async #submitWithinRoomBoundary(
    input: TurnSubmitInput,
  ): Promise<TurnSubmitResult> {
    const scopeKey = idempotencyScope(input);
    const fingerprint = createTurnSubmitFingerprint(
      input.expectedGameRevision,
      input.turnId,
      input.proposedBoard,
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
    if (game.turn.activePlayerId !== input.actorPlayerId) {
      return failed(ERRORS.NOT_YOUR_TURN);
    }
    if (game.turn.turnId !== input.turnId) {
      return failed(ERRORS.NOT_YOUR_TURN);
    }
    if (input.receivedAt >= game.turn.deadlineAt) {
      return failed(ERRORS.TURN_EXPIRED);
    }
    if (game.gameRevision !== input.expectedGameRevision) {
      return failed(ERRORS.STALE_GAME_REVISION);
    }
    if (
      this.#dictionaryProvider.dictionaryVersion !==
      game.rulesConfig.dictionaryVersion
    ) {
      // A Game must keep using the dictionary snapshot selected at game:start.
      // Treat composition/runtime misconfiguration as an opaque server failure;
      // never validate against a different word set.
      return failed(ERRORS.INTERNAL_ERROR);
    }

    const proposedBoard = toDomainBoard(input.proposedBoard);
    const actorRack = game.racks.get(input.actorPlayerId);
    const initialMeldCompleted = game.initialMeldCompleted.get(
      input.actorPlayerId,
    );
    if (actorRack === undefined || initialMeldCompleted === undefined) {
      return failed(ERRORS.INTERNAL_ERROR);
    }
    const validation = await this.#validateBoard({
      canonicalBoard: game.board,
      proposedBoard,
      tilesById: game.tilesById,
      actorRackTileIds: new Set(actorRack),
      initialMeldCompleted,
      dictionaryProvider: this.#dictionaryProvider,
      policy: {
        minimumWordSyllables: game.rulesConfig.initialMeld.minimumWordSyllables,
        initialMeldMinimumTileCount:
          game.rulesConfig.initialMeld.minimumTileCount,
      },
    });
    if (!validation.ok) {
      return failed(mapRuleError(validation.error));
    }
    this.#onCheckpoint?.("AFTER_RULE_VALIDATION");

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
      proposedBoard,
      validation.value.newlyUsedRackTileIds,
      validation.value.completesInitialMeld,
      input.actorPlayerId,
      committedAt,
      this.#idGenerator,
    );
    this.#onCheckpoint?.("AFTER_CANDIDATE_CREATED");
    this.#onCheckpoint?.("BEFORE_COMMIT");

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

  #mapCommitResult(result: RoomUnitOfWorkResult): TurnSubmitResult {
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
