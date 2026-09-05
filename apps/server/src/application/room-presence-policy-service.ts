import {
  RequestIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  type PlayerId,
  type PresenceVersion,
  type RoomId,
  type ServerTime,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type {
  LegacyHangulPlayerLifecycleActionRouting,
} from "../games/legacy-hangul-player-lifecycle-actions.js";
import type { PlayerPresenceLeaseReader } from "../ports/player-presence-lease.js";
import type { RoomPresencePolicyReader } from "../ports/room-presence-policy.js";
import type { RoomRepository } from "../ports/room-repository.js";
import type {
  LobbyDisconnectGraceDeadline,
  RoomPolicyDeadline,
  RoomPolicyScheduler,
} from "../ports/room-policy-scheduler.js";
import type { RoomUnitOfWork } from "../ports/room-unit-of-work.js";
import type { Clock } from "../ports/system.js";
import type { LobbyDisconnectGraceService } from "./lobby-disconnect-grace-service.js";
import type { RoomMutationSerialExecutor } from "./room-session-service.js";
import type { RoomRetentionService } from "./room-retention-service.js";

export const LOBBY_DISCONNECT_GRACE_MS = 60_000;
export const ROOM_RETENTION_MS = 30 * 60_000;

export type CurrentDisconnectInput = Readonly<{
  roomId: RoomId;
  playerId: PlayerId;
  connectionGeneration: number;
  /** Presence revision returned by this exact disconnect transition. */
  presenceVersion: PresenceVersion;
  disconnectedAt: ServerTime;
}>;

export type RoomPresencePolicyServiceDependencies = Readonly<{
  roomRepository: RoomRepository;
  roomUnitOfWork: RoomUnitOfWork;
  roomMutationExecutor: RoomMutationSerialExecutor;
  scheduler: RoomPolicyScheduler;
  roomPresenceReader: RoomPresencePolicyReader;
  playerPresenceLeaseReader: PlayerPresenceLeaseReader;
  playerLifecycleActions: LegacyHangulPlayerLifecycleActionRouting;
  clock: Clock;
  lobbyGraceService: LobbyDisconnectGraceService;
  retentionService: RoomRetentionService;
  onLobbyHostElected?: (roomId: RoomId) => void | Promise<void>;
}>;

function addDuration(startedAt: ServerTime, durationMs: number): ServerTime {
  return v.parse(ServerTimeSchema, startedAt + durationMs);
}

function incrementRoomRevision(current: import("@hangul-rummikub/shared").RoomRevision) {
  return v.parse(RoomRevisionSchema, current + 1);
}

function requestId(value: string) {
  return v.parse(RequestIdSchema, value);
}

export class RoomPresencePolicyService {
  readonly #dependencies: RoomPresencePolicyServiceDependencies;

  constructor(dependencies: RoomPresencePolicyServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async onCurrentDisconnect(input: CurrentDisconnectInput): Promise<void> {
    const room = await this.#dependencies.roomRepository.findById(input.roomId);
    if (room === null || !room.players.some((player) => player.playerId === input.playerId)) {
      return;
    }
    if (room.phase === "LOBBY") {
      const disconnectLease =
        await this.#dependencies.roomPresenceReader.acquireLobbyDisconnectLease(
          room.roomId,
          input.playerId,
        );
      if (
        disconnectLease.connectionStatus !== "OFFLINE" ||
        disconnectLease.connectionGeneration !== input.connectionGeneration ||
        !disconnectLease.isCurrent()
      ) {
        return;
      }
      await this.#dependencies.scheduler.schedule({
        kind: "LOBBY_DISCONNECT_GRACE",
        roomId: room.roomId,
        playerId: input.playerId,
        connectionGeneration: input.connectionGeneration,
        disconnectedAt: input.disconnectedAt,
        deadlineAt: addDuration(input.disconnectedAt, LOBBY_DISCONNECT_GRACE_MS),
      });
      return;
    }
    if (room.phase === "PLAYING" && room.game !== null) {
      const presence =
        await this.#dependencies.roomPresenceReader.acquireRoomPresenceLease(room.roomId);
      if (
        presence.presenceVersion !== input.presenceVersion ||
        !presence.isCurrent()
      ) {
        return;
      }
      const allOffline = room.players.every(
        (player) =>
          presence.connectionStatusByPlayerId.get(player.playerId) !== "CONNECTED",
      );
      if (!allOffline || !presence.isCurrent()) {
        await this.#dependencies.scheduler.cancelPlayingAllOffline(
          room.roomId,
          presence.presenceVersion,
        );
        return;
      }
      await this.#dependencies.scheduler.schedule({
        kind: "PLAYING_ALL_OFFLINE_RETENTION",
        roomId: room.roomId,
        gameId: room.game.gameId,
        presenceVersion: presence.presenceVersion,
        allOfflineAt: input.disconnectedAt,
        deadlineAt: addDuration(input.disconnectedAt, ROOM_RETENTION_MS),
      });
      return;
    }
    await this.scheduleFinishedRetention(room.roomId);
  }

  async onResume(roomId: RoomId, playerId: PlayerId): Promise<void> {
    const resumeLease =
      await this.#dependencies.playerPresenceLeaseReader.acquirePlayerPresenceLease(
        roomId,
        playerId,
      );
    if (
      resumeLease.connectionStatus !== "CONNECTED" ||
      !resumeLease.isCurrent()
    ) {
      return;
    }
    // The synchronous lease check and scheduler call are adjacent so a newer
    // disconnect cannot have its grace timer cancelled by this stale resume.
    if (!resumeLease.isCurrent()) {
      return;
    }
    await this.#dependencies.scheduler.cancelLobbyGrace(
      roomId,
      playerId,
      resumeLease.connectionGeneration ?? undefined,
    );
    const room = await this.#dependencies.roomRepository.findById(roomId);
    if (room === null || !resumeLease.isCurrent()) {
      return;
    }
    if (room.phase === "LOBBY") {
      await this.electLobbyHostIfNeeded(roomId);
      return;
    }
    if (room.phase === "PLAYING") {
      const roomPresenceLease =
        await this.#dependencies.roomPresenceReader.acquireRoomPresenceLease(
          roomId,
        );
      if (
        !resumeLease.isCurrent() ||
        !roomPresenceLease.isCurrent() ||
        roomPresenceLease.connectionStatusByPlayerId.get(playerId) !==
          "CONNECTED"
      ) {
        return;
      }
      await this.#dependencies.scheduler.cancelPlayingAllOffline(
        roomId,
        roomPresenceLease.presenceVersion,
      );
      if (!resumeLease.isCurrent() || !roomPresenceLease.isCurrent()) {
        return;
      }
      await this.resetOfflineTimeoutStreak(roomId, playerId);
      return;
    }
    await this.scheduleFinishedRetention(roomId);
  }

  /** Reconciles retention after an explicit leave removes a live binding. */
  async onPlayerRemoved(
    roomId: RoomId,
    removedAt: ServerTime = this.#dependencies.clock.now(),
  ): Promise<void> {
    const room = await this.#dependencies.roomRepository.findById(roomId);
    if (room === null) {
      return;
    }
    if (room.phase === "PLAYING" && room.game !== null) {
      const presence =
        await this.#dependencies.roomPresenceReader.acquireRoomPresenceLease(roomId);
      const allOffline = room.players.every(
        (player) =>
          presence.connectionStatusByPlayerId.get(player.playerId) !== "CONNECTED",
      );
      if (!allOffline || !presence.isCurrent()) {
        await this.#dependencies.scheduler.cancelPlayingAllOffline(
          roomId,
          presence.presenceVersion,
        );
        return;
      }
      await this.#dependencies.scheduler.schedule({
        kind: "PLAYING_ALL_OFFLINE_RETENTION",
        roomId,
        gameId: room.game.gameId,
        presenceVersion: presence.presenceVersion,
        allOfflineAt: removedAt,
        deadlineAt: addDuration(removedAt, ROOM_RETENTION_MS),
      });
      return;
    }
    if (room.phase === "FINISHED") {
      await this.scheduleFinishedRetention(roomId);
    }
  }

  /** Also called after binding a newly joined Player into a hostless Lobby. */
  async electLobbyHostIfNeeded(roomId: RoomId): Promise<boolean> {
    const elected = await this.#dependencies.roomMutationExecutor.run(roomId, async () => {
      const room = await this.#dependencies.roomRepository.findById(roomId);
      if (room === null || room.phase !== "LOBBY" || room.hostPlayerId !== null) {
        return false;
      }
      const presence =
        await this.#dependencies.roomPresenceReader.acquireRoomPresenceLease(roomId);
      const successor = [...room.players]
        .filter(
          (player) =>
            presence.connectionStatusByPlayerId.get(player.playerId) === "CONNECTED",
        )
        .sort((left, right) => left.joinOrder - right.joinOrder)[0];
      if (successor === undefined || !presence.isCurrent()) {
        return false;
      }
      const nextRoomRevision = incrementRoomRevision(room.roomRevision);
      const now = this.#dependencies.clock.now();
      const committed = await this.#dependencies.roomUnitOfWork.commit(
        {
          roomMutation: {
            kind: "REPLACE",
            candidate: {
              ...room,
              hostPlayerId: successor.playerId,
              roomRevision: nextRoomRevision,
              updatedAt: now,
            },
            expectedRoomRevision: room.roomRevision,
            expectedStorageRevision: room.storageRevision,
          },
          sessionMutation: { kind: "NONE" },
          idempotency: {
            scopeKey: `room-policy:${room.roomId}:host-election`,
            requestId: requestId(
              `host-election:${room.storageRevision}:${presence.presenceVersion}`,
            ),
            payloadFingerprint: JSON.stringify([
              "lobby-host-election",
              successor.playerId,
              room.roomRevision,
              presence.presenceVersion,
            ]),
            terminalResult: {
              roomId: room.roomId,
              hostPlayerId: successor.playerId,
              roomRevision: nextRoomRevision,
            },
            createdAt: now,
          },
        },
        { isSatisfied: () => presence.isCurrent() },
      );
      return committed.status === "COMMITTED" || committed.status === "REPLAY";
    });
    if (elected) {
      try {
        await this.#dependencies.onLobbyHostElected?.(roomId);
      } catch {
        // Canonical Host election is already committed.
      }
    }
    return elected;
  }

  async resetOfflineTimeoutStreak(
    roomId: RoomId,
    playerId: PlayerId,
  ): Promise<boolean> {
    return this.#dependencies.roomMutationExecutor.run(roomId, async () => {
      const room = await this.#dependencies.roomRepository.findById(roomId);
      if (room === null || room.phase !== "PLAYING" || room.game === null) {
        return false;
      }
      if (
        room.gameType !==
        this.#dependencies.playerLifecycleActions.gameType
      ) {
        return false;
      }
      const plan =
        this.#dependencies.playerLifecycleActions.planPresenceRestored(
          room,
          playerId,
        );
      if (plan.status === "NO_CHANGE") {
        return false;
      }
      const presence =
        await this.#dependencies.playerPresenceLeaseReader.acquirePlayerPresenceLease(
          roomId,
          playerId,
        );
      if (presence.connectionStatus !== "CONNECTED" || !presence.isCurrent()) {
        return false;
      }

      const now = this.#dependencies.clock.now();
      const committed = await this.#dependencies.roomUnitOfWork.commit(
        {
          roomMutation: {
            kind: "REPLACE",
            candidate: { ...room, game: plan.game, updatedAt: now },
            expectedRoomRevision: room.roomRevision,
            expectedStorageRevision: room.storageRevision,
          },
          sessionMutation: { kind: "NONE" },
          idempotency: {
            scopeKey: `room-policy:${room.roomId}:${playerId}`,
            requestId: requestId(
              `resume-streak-reset:${plan.gameId}:${room.storageRevision}`,
            ),
            payloadFingerprint: JSON.stringify([
              "resume-offline-timeout-streak-reset",
              plan.gameRevision,
              plan.previousOfflineTimeoutStreak,
            ]),
            terminalResult: {
              roomId: room.roomId,
              playerId,
              offlineTimeoutStreak: 0,
            },
            createdAt: now,
          },
        },
        { isSatisfied: () => presence.isCurrent() },
      );
      return committed.status === "COMMITTED" || committed.status === "REPLAY";
    });
  }

  async scheduleFinishedRetention(roomId: RoomId): Promise<boolean> {
    const room = await this.#dependencies.roomRepository.findById(roomId);
    if (
      room === null ||
      room.phase !== "FINISHED" ||
      room.game === null ||
      room.game.result === null
    ) {
      return false;
    }
    const finishedAt = room.game.result.finishedAt;
    await this.#dependencies.scheduler.schedule({
      kind: "FINISHED_ROOM_RETENTION",
      roomId: room.roomId,
      gameId: room.game.gameId,
      finishedAt,
      deadlineAt: addDuration(finishedAt, ROOM_RETENTION_MS),
    });
    return true;
  }

  async onDeadline(deadline: RoomPolicyDeadline): Promise<void> {
    if (deadline.kind === "LOBBY_DISCONNECT_GRACE") {
      const result = await this.#dependencies.lobbyGraceService.expire(deadline);
      if (
        result.status === "FAILED" ||
        (result.status === "NO_OP" &&
          result.reason === "RETRYABLE_STATE_CHANGED")
      ) {
        throw new Error("Lobby disconnect grace application must be retried.");
      }
      return;
    }
    const result = await this.#dependencies.retentionService.expire(deadline);
    if (
      result.status === "FAILED" ||
      (result.status === "NO_OP" &&
        (result.reason === "STALE_ROOM" ||
          result.reason === "PRECONDITION_FAILED"))
    ) {
      throw new Error("Room retention cleanup must be retried.");
    }
  }

  createLobbyGraceDeadline(
    input: Omit<CurrentDisconnectInput, "presenceVersion">,
  ): LobbyDisconnectGraceDeadline {
    return Object.freeze({
      kind: "LOBBY_DISCONNECT_GRACE",
      ...input,
      deadlineAt: addDuration(input.disconnectedAt, LOBBY_DISCONNECT_GRACE_MS),
    });
  }
}
