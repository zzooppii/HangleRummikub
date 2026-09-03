import {
  RequestIdSchema,
  RoomRevisionSchema,
  type PlayerId,
  type RoomId,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type { RoomPresencePolicyReader } from "../ports/room-presence-policy.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type { LobbyDisconnectGraceDeadline } from "../ports/room-policy-scheduler.js";
import type {
  RoomCleanupUnitOfWork,
  RoomUnitOfWork,
} from "../ports/room-unit-of-work.js";
import type { Clock } from "../ports/system.js";
import type { RoomCleanupResources } from "./room-cleanup-service.js";
import type { RoomLeaveResources } from "./room-leave-service.js";
import type { RoomMutationSerialExecutor } from "./room-session-service.js";

export type LobbyGraceExpiryResult =
  | Readonly<{
      status: "REMOVED";
      roomId: RoomId;
      playerId: PlayerId;
      roomClosed: boolean;
    }>
  | Readonly<{
      status: "NO_OP";
      reason:
        | "NOT_DUE"
        | "ROOM_NOT_FOUND"
        | "NOT_LOBBY"
        | "PLAYER_NOT_FOUND"
        | "STALE_DISCONNECT"
        | "RETRYABLE_STATE_CHANGED";
    }>
  | Readonly<{ status: "FAILED"; reason: "INTERNAL_ERROR" }>;

export type LobbyDisconnectGraceServiceDependencies = Readonly<{
  roomRepository: RoomRepository;
  roomUnitOfWork: RoomUnitOfWork;
  roomCleanupUnitOfWork: RoomCleanupUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  presenceReader: RoomPresencePolicyReader;
  clock: Clock;
  resources?: RoomLeaveResources & RoomCleanupResources;
  onRemovalApplied?: (
    result: Extract<LobbyGraceExpiryResult, { status: "REMOVED" }>,
  ) => void | Promise<void>;
}>;

function incrementRoomRevision(current: import("@hangul-rummikub/shared").RoomRevision) {
  return v.parse(RoomRevisionSchema, current + 1);
}

function internalRequestId(deadline: LobbyDisconnectGraceDeadline) {
  return v.parse(
    RequestIdSchema,
    `lobby-grace:${deadline.playerId}:${deadline.connectionGeneration}:${deadline.disconnectedAt}`,
  );
}

export class LobbyDisconnectGraceService {
  readonly #dependencies: LobbyDisconnectGraceServiceDependencies;

  constructor(dependencies: LobbyDisconnectGraceServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async expire(
    deadline: LobbyDisconnectGraceDeadline,
  ): Promise<LobbyGraceExpiryResult> {
    const postCommitState: {
      value:
        | Readonly<{ kind: "PLAYER" }>
        | Readonly<{
            kind: "ROOM";
            roomCode: import("@hangul-rummikub/shared").RoomCode;
          }>
        | null;
    } = { value: null };
    try {
      const result = await this.#dependencies.roomMutationExecutor.run(
        deadline.roomId,
        async (): Promise<LobbyGraceExpiryResult> => {
          if (this.#dependencies.clock.now() < deadline.deadlineAt) {
            return { status: "NO_OP", reason: "NOT_DUE" };
          }
          const room = await this.#dependencies.roomRepository.findById(deadline.roomId);
          if (room === null) {
            return { status: "NO_OP", reason: "ROOM_NOT_FOUND" };
          }
          if (room.phase !== "LOBBY") {
            return { status: "NO_OP", reason: "NOT_LOBBY" };
          }
          if (!room.players.some((player) => player.playerId === deadline.playerId)) {
            return { status: "NO_OP", reason: "PLAYER_NOT_FOUND" };
          }

          const disconnectLease =
            await this.#dependencies.presenceReader.acquireLobbyDisconnectLease(
              room.roomId,
              deadline.playerId,
            );
          if (
            disconnectLease.connectionStatus !== "OFFLINE" ||
            disconnectLease.connectionGeneration !== deadline.connectionGeneration ||
            !disconnectLease.isCurrent()
          ) {
            return { status: "NO_OP", reason: "STALE_DISCONNECT" };
          }

          const remainingPlayers = room.players.filter(
            (player) => player.playerId !== deadline.playerId,
          );
          if (remainingPlayers.length === 0) {
            const committed = await this.#dependencies.roomCleanupUnitOfWork.cleanup(
              {
                roomMutation: {
                  kind: "DELETE",
                  roomId: room.roomId,
                  expectedRoomRevision: room.roomRevision,
                  expectedStorageRevision: room.storageRevision,
                },
                sessionMutation: { kind: "DELETE_BY_ROOM", roomId: room.roomId },
              },
              { isSatisfied: () => disconnectLease.isCurrent() },
            );
            if (committed.status !== "COMMITTED") {
              return {
                status: "NO_OP",
                reason: disconnectLease.isCurrent()
                  ? "RETRYABLE_STATE_CHANGED"
                  : "STALE_DISCONNECT",
              };
            }
            postCommitState.value = { kind: "ROOM", roomCode: room.roomCode };
            return {
              status: "REMOVED",
              roomId: room.roomId,
              playerId: deadline.playerId,
              roomClosed: true,
            };
          }

          const roomPresenceLease =
            await this.#dependencies.presenceReader.acquireRoomPresenceLease(room.roomId);
          let hostPlayerId = room.hostPlayerId;
          if (hostPlayerId === deadline.playerId || hostPlayerId === null) {
            hostPlayerId =
              [...remainingPlayers]
                .filter(
                  (player) =>
                    roomPresenceLease.connectionStatusByPlayerId.get(player.playerId) ===
                    "CONNECTED",
                )
                .sort((left, right) => left.joinOrder - right.joinOrder)[0]?.playerId ??
              null;
          }
          const roomRevision = incrementRoomRevision(room.roomRevision);
          const now = this.#dependencies.clock.now();
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
                playerId: deadline.playerId,
              },
              idempotency: {
                scopeKey: `room-policy:${room.roomId}:${deadline.playerId}`,
                requestId: internalRequestId(deadline),
                payloadFingerprint: JSON.stringify([
                  "lobby-grace-expired",
                  deadline.connectionGeneration,
                  deadline.disconnectedAt,
                  deadline.deadlineAt,
                ]),
                terminalResult: {
                  roomId: room.roomId,
                  playerId: deadline.playerId,
                  roomRevision,
                },
                createdAt: now,
              },
            },
            {
              isSatisfied: () =>
                disconnectLease.isCurrent() && roomPresenceLease.isCurrent(),
            },
          );
          if (committed.status !== "COMMITTED") {
            return {
              status: "NO_OP",
              reason: disconnectLease.isCurrent()
                ? "RETRYABLE_STATE_CHANGED"
                : "STALE_DISCONNECT",
            };
          }
          postCommitState.value = { kind: "PLAYER" };
          return {
            status: "REMOVED",
            roomId: room.roomId,
            playerId: deadline.playerId,
            roomClosed: false,
          };
        },
      );

      if (result.status === "REMOVED") {
        const postCommit = postCommitState.value;
        try {
          if (postCommit?.kind === "ROOM") {
            await this.#dependencies.resources?.cleanupRoom(
              result.roomId,
              postCommit.roomCode,
            );
          } else if (postCommit?.kind === "PLAYER") {
            await this.#dependencies.resources?.removePlayer(
              result.roomId,
              result.playerId,
            );
          }
        } catch {
          // Canonical expiry already committed.
        }
        try {
          await this.#dependencies.onRemovalApplied?.(result);
        } catch {
          // Snapshot/advisory delivery cannot roll back canonical removal.
        }
      }
      return result;
    } catch {
      return { status: "FAILED", reason: "INTERNAL_ERROR" };
    }
  }
}
