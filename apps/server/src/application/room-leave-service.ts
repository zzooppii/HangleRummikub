import {
  GameRevisionSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  type ErrorDto,
  type GameId,
  type GameRevision,
  type PlayerId,
  type RequestId,
  type RoomId,
  type RoomCode,
  type RoomRevision,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type {
  LegacyHangulPlayerLifecycleActionRouting,
  LegacyHangulPlayingLeaveAdvisory,
} from "../games/legacy-hangul-player-lifecycle-actions.js";
import type {
  IdempotencyRecord,
  RoomWriteCandidate,
} from "../model/persistence.js";
import type { IdempotencyRepository } from "../ports/idempotency-repository.js";
import type { RoomPresencePolicyReader } from "../ports/room-presence-policy.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type {
  RoomCleanupUnitOfWork,
  RoomUnitOfWork,
  RoomUnitOfWorkResult,
} from "../ports/room-unit-of-work.js";
import type { Clock, TurnScheduler } from "../ports/system.js";
import type { CurrentActorAuthorization } from "./game-start-service.js";
import {
  notifyGameFinishedBestEffort,
  type GameFinishedPostCommit,
} from "./game-finish-transition.js";
import type { RoomMutationSerialExecutor } from "./room-session-service.js";
import {
  scheduleCurrentTurnBestEffort,
  type CurrentTurnIdentity,
  type TurnSchedulingFailureReporter,
} from "./turn-transition.js";

export const RoomLeaveSuccessDataSchema = v.strictObject({
  roomId: RoomIdSchema,
  phase: v.picklist(["LOBBY", "PLAYING", "FINISHED"]),
  roomClosed: v.boolean(),
  roomRevision: v.nullable(RoomRevisionSchema),
  gameRevision: v.nullable(GameRevisionSchema),
});
export type RoomLeaveSuccessData = v.InferOutput<typeof RoomLeaveSuccessDataSchema>;

export type RoomLeaveResult =
  | Readonly<{
      ok: true;
      data: RoomLeaveSuccessData;
      gameAdvisory: LegacyHangulPlayingLeaveAdvisory;
    }>
  | Readonly<{ ok: false; error: ErrorDto }>;

export type RoomLeaveInput = Readonly<{
  roomId: RoomId;
  actorPlayerId: PlayerId;
  requestId: RequestId;
  expectedRoomRevision: RoomRevision;
  expectedGameRevision: GameRevision | null;
  authorization: CurrentActorAuthorization;
}>;

export interface RoomLeaveResources {
  removePlayer(roomId: RoomId, playerId: PlayerId): void | Promise<void>;
  cleanupRoom(roomId: RoomId, roomCode: RoomCode): void | Promise<void>;
}

export type RoomLeaveServiceDependencies = Readonly<{
  roomRepository: RoomRepository;
  idempotencyRepository: IdempotencyRepository;
  roomUnitOfWork: RoomUnitOfWork;
  roomCleanupUnitOfWork: RoomCleanupUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  presenceReader: RoomPresencePolicyReader;
  playerLifecycleActions: LegacyHangulPlayerLifecycleActionRouting;
  clock: Clock;
  resources?: RoomLeaveResources;
  turnScheduler?: TurnScheduler;
  onTurnSchedulingFailure?: TurnSchedulingFailureReporter;
  onGameFinished?: GameFinishedPostCommit;
}>;

const ERRORS = Object.freeze({
  ROOM_NOT_FOUND: Object.freeze({ code: "ROOM_NOT_FOUND", message: "Room was not found.", recoverable: false }),
  UNAUTHENTICATED: Object.freeze({ code: "UNAUTHENTICATED", message: "The command actor is no longer authorized.", recoverable: false }),
  STALE_ROOM_REVISION: Object.freeze({ code: "STALE_ROOM_REVISION", message: "The Room state is stale.", recoverable: true }),
  STALE_GAME_REVISION: Object.freeze({ code: "STALE_GAME_REVISION", message: "The Game state is stale.", recoverable: true }),
  REQUEST_ID_REUSED: Object.freeze({ code: "REQUEST_ID_REUSED", message: "Request ID was already used for a different command payload.", recoverable: false }),
  INTERNAL_ERROR: Object.freeze({ code: "INTERNAL_ERROR", message: "An internal error occurred.", recoverable: false }),
} satisfies Readonly<Record<string, ErrorDto>>);

function scope(input: RoomLeaveInput): string {
  return `room-player:${input.roomId}:${input.actorPlayerId}`;
}

function fingerprint(input: RoomLeaveInput): string {
  return JSON.stringify([
    "room:leave",
    input.expectedRoomRevision,
    input.expectedGameRevision,
  ]);
}

function success(
  data: RoomLeaveSuccessData,
  gameAdvisory: LegacyHangulPlayingLeaveAdvisory = "NONE",
): RoomLeaveResult {
  return { ok: true, data, gameAdvisory };
}

function failure(error: ErrorDto): RoomLeaveResult {
  return { ok: false, error };
}

function parseReplay(record: IdempotencyRecord): RoomLeaveResult {
  const parsed = v.safeParse(RoomLeaveSuccessDataSchema, record.terminalResult);
  return parsed.success ? success(parsed.output) : failure(ERRORS.INTERNAL_ERROR);
}

function incrementRoomRevision(revision: RoomRevision): RoomRevision {
  return v.parse(RoomRevisionSchema, revision + 1);
}

function mapCommit(
  result: RoomUnitOfWorkResult,
  preconditionFailureError: ErrorDto = ERRORS.UNAUTHENTICATED,
  gameAdvisory: LegacyHangulPlayingLeaveAdvisory = "NONE",
): RoomLeaveResult {
  switch (result.status) {
    case "COMMITTED":
    case "REPLAY": {
      const replay = parseReplay(result.idempotency);
      return replay.ok ? success(replay.data, gameAdvisory) : replay;
    }
    case "IDEMPOTENCY_CONFLICT":
      return failure(ERRORS.REQUEST_ID_REUSED);
    case "PRECONDITION_FAILED":
      if (result.reason === "COMMIT_PRECONDITION_FAILED") {
        return failure(preconditionFailureError);
      }
      if (result.reason === "STALE_ROOM_REVISION" || result.reason === "STALE_STORAGE_REVISION") {
        return failure(ERRORS.STALE_ROOM_REVISION);
      }
      return failure(ERRORS.INTERNAL_ERROR);
  }
}

export class RoomLeaveService {
  readonly #dependencies: RoomLeaveServiceDependencies;

  constructor(dependencies: RoomLeaveServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async leave(input: RoomLeaveInput): Promise<RoomLeaveResult> {
    let postCommit:
      | Readonly<{
          roomClosed: boolean;
          roomCode: RoomCode;
          nextTurnIdentity: CurrentTurnIdentity | null;
          finishedGameId: import("@hangul-rummikub/shared").GameId | null;
        }>
      | undefined;
    try {
      const result = await this.#dependencies.roomMutationExecutor.run(
        input.roomId,
        async () => {
          const scopeKey = scope(input);
          const payloadFingerprint = fingerprint(input);
          const existing = await this.#dependencies.idempotencyRepository.classify(
            scopeKey,
            input.requestId,
            payloadFingerprint,
          );
          if (existing.status === "REPLAY") {
            return parseReplay(existing.record);
          }
          if (existing.status === "CONFLICT") {
            return failure(ERRORS.REQUEST_ID_REUSED);
          }
          if (!input.authorization.isCurrent()) {
            return failure(ERRORS.UNAUTHENTICATED);
          }

          const room = await this.#dependencies.roomRepository.findById(input.roomId);
          if (room === null || !room.players.some((player) => player.playerId === input.actorPlayerId)) {
            return failure(ERRORS.ROOM_NOT_FOUND);
          }
          if (room.roomRevision !== input.expectedRoomRevision) {
            return failure(ERRORS.STALE_ROOM_REVISION);
          }
          const canonicalGameRevision = room.game?.gameRevision ?? null;
          if (canonicalGameRevision !== input.expectedGameRevision) {
            return failure(ERRORS.STALE_GAME_REVISION);
          }

          const now = this.#dependencies.clock.now();
          if (room.phase === "LOBBY") {
            const remainingPlayers = room.players.filter(
              (player) => player.playerId !== input.actorPlayerId,
            );
            if (remainingPlayers.length === 0) {
              const cleaned = await this.#dependencies.roomCleanupUnitOfWork.cleanup(
                {
                  roomMutation: {
                    kind: "DELETE",
                    roomId: room.roomId,
                    expectedRoomRevision: room.roomRevision,
                    expectedStorageRevision: room.storageRevision,
                  },
                  sessionMutation: { kind: "DELETE_BY_ROOM", roomId: room.roomId },
                },
                { isSatisfied: () => input.authorization.isCurrent() },
              );
              if (cleaned.status !== "COMMITTED") {
                return failure(
                  cleaned.reason === "COMMIT_PRECONDITION_FAILED"
                    ? ERRORS.UNAUTHENTICATED
                    : ERRORS.INTERNAL_ERROR,
                );
              }
              postCommit = {
                roomClosed: true,
                roomCode: room.roomCode,
                nextTurnIdentity: null,
                finishedGameId: null,
              };
              return success({
                roomId: room.roomId,
                phase: room.phase,
                roomClosed: true,
                roomRevision: null,
                gameRevision: null,
              });
            }

            const presenceLease =
              await this.#dependencies.presenceReader.acquireRoomPresenceLease(room.roomId);
            let hostPlayerId = room.hostPlayerId;
            if (hostPlayerId === input.actorPlayerId || hostPlayerId === null) {
              hostPlayerId =
                [...remainingPlayers]
                  .filter(
                    (player) =>
                      presenceLease.connectionStatusByPlayerId.get(player.playerId) === "CONNECTED",
                  )
                  .sort((left, right) => left.joinOrder - right.joinOrder)[0]?.playerId ?? null;
            }
            const roomRevision = incrementRoomRevision(room.roomRevision);
            const terminalResult: RoomLeaveSuccessData = {
              roomId: room.roomId,
              phase: room.phase,
              roomClosed: false,
              roomRevision,
              gameRevision: null,
            };
            const committed = await this.#dependencies.roomUnitOfWork.commit(
              {
                roomMutation: {
                  kind: "REPLACE",
                  candidate: {
                    ...room,
                    hostPlayerId,
                    players: remainingPlayers,
                    roomRevision,
                    updatedAt: now,
                  },
                  expectedRoomRevision: room.roomRevision,
                  expectedStorageRevision: room.storageRevision,
                },
                sessionMutation: {
                  kind: "DELETE_BOUND_PLAYER",
                  roomId: room.roomId,
                  playerId: input.actorPlayerId,
                },
                idempotency: {
                  scopeKey,
                  requestId: input.requestId,
                  payloadFingerprint,
                  terminalResult,
                  createdAt: now,
                },
              },
              { isSatisfied: () => input.authorization.isCurrent() && presenceLease.isCurrent() },
            );
            const mapped = mapCommit(
              committed,
              input.authorization.isCurrent()
                ? ERRORS.STALE_ROOM_REVISION
                : ERRORS.UNAUTHENTICATED,
            );
            if (mapped.ok) {
              postCommit = {
                roomClosed: false,
                roomCode: room.roomCode,
                nextTurnIdentity: null,
                finishedGameId: null,
              };
            }
            return mapped;
          }

          let candidate: RoomWriteCandidate;
          let terminalResult: RoomLeaveSuccessData;
          let nextTurnIdentity: CurrentTurnIdentity | null = null;
          let finishedGameId: GameId | null = null;
          let gameAdvisory: LegacyHangulPlayingLeaveAdvisory = "NONE";
          if (room.phase === "PLAYING" && room.game !== null) {
            if (
              room.gameType !==
              this.#dependencies.playerLifecycleActions.gameType
            ) {
              return failure(ERRORS.INTERNAL_ERROR);
            }
            const playing =
              this.#dependencies.playerLifecycleActions.applyPlayingLeave({
                room,
                actorPlayerId: input.actorPlayerId,
                occurredAt: now,
              });
            candidate = playing.candidate;
            nextTurnIdentity = playing.nextTurnIdentity;
            finishedGameId = playing.finishedGameId;
            gameAdvisory = playing.advisory;
            terminalResult = {
              roomId: room.roomId,
              phase: candidate.phase,
              roomClosed: false,
              roomRevision: candidate.roomRevision,
              gameRevision: candidate.game?.gameRevision ?? null,
            };
          } else if (
            room.phase === "FINISHED" &&
            room.game !== null &&
            room.game.result !== null
          ) {
            candidate = { ...room, updatedAt: now };
            finishedGameId = room.game.gameId;
            gameAdvisory = "GAME_FINISHED";
            terminalResult = {
              roomId: room.roomId,
              phase: room.phase,
              roomClosed: false,
              roomRevision: room.roomRevision,
              gameRevision: room.game.gameRevision,
            };
          } else {
            return failure(ERRORS.INTERNAL_ERROR);
          }

          const committed = await this.#dependencies.roomUnitOfWork.commit(
            {
              roomMutation: {
                kind: "REPLACE",
                candidate,
                expectedRoomRevision: room.roomRevision,
                expectedStorageRevision: room.storageRevision,
              },
              sessionMutation: {
                kind: "DELETE_BOUND_PLAYER",
                roomId: room.roomId,
                playerId: input.actorPlayerId,
              },
              idempotency: {
                scopeKey,
                requestId: input.requestId,
                payloadFingerprint,
                terminalResult,
                createdAt: now,
              },
            },
            { isSatisfied: () => input.authorization.isCurrent() },
          );
          const mapped = mapCommit(
            committed,
            ERRORS.UNAUTHENTICATED,
            gameAdvisory,
          );
          if (mapped.ok) {
            postCommit = {
              roomClosed: false,
              roomCode: room.roomCode,
              nextTurnIdentity,
              finishedGameId,
            };
          }
          return mapped;
        },
      );

      if (result.ok && postCommit !== undefined) {
        try {
          if (postCommit.roomClosed) {
            await this.#dependencies.resources?.cleanupRoom(
              input.roomId,
              postCommit.roomCode,
            );
          } else {
            await this.#dependencies.resources?.removePlayer(
              input.roomId,
              input.actorPlayerId,
            );
          }
        } catch {
          // The canonical leave is already committed.
        }
        if (postCommit.nextTurnIdentity !== null) {
          await scheduleCurrentTurnBestEffort(
            this.#dependencies.roomRepository,
            this.#dependencies.turnScheduler,
            postCommit.nextTurnIdentity,
            this.#dependencies.onTurnSchedulingFailure,
          );
        }
        if (postCommit.finishedGameId !== null) {
          await notifyGameFinishedBestEffort(
            this.#dependencies.onGameFinished,
            {
              roomId: input.roomId,
              gameId: postCommit.finishedGameId,
            },
          );
        }
      }
      return result;
    } catch {
      return failure(ERRORS.INTERNAL_ERROR);
    }
  }
}
