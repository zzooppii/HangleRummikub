import type { RoomId } from "@hangul-rummikub/shared";

import type { RoomPresencePolicyReader } from "../ports/room-presence-policy.js";
import type {
  FinishedRoomRetentionDeadline,
  PlayingAllOfflineDeadline,
} from "../ports/room-policy-scheduler.js";
import type { Clock } from "../ports/system.js";
import {
  RoomCleanupService,
  type RoomCleanupResult,
} from "./room-cleanup-service.js";

export type RoomRetentionDeadline =
  | PlayingAllOfflineDeadline
  | FinishedRoomRetentionDeadline;

export type RoomRetentionResult =
  | RoomCleanupResult
  | Readonly<{
      status: "NO_OP";
      reason:
        | "NOT_DUE"
        | "ROOM_NOT_FOUND"
        | "STALE_POLICY"
        | "PLAYER_CONNECTED";
    }>;

export type RoomRetentionServiceDependencies = Readonly<{
  cleanupService: RoomCleanupService;
  roomRepository: import("../ports/room-repository.js").RoomRepository;
  presenceReader: RoomPresencePolicyReader;
  clock: Clock;
}>;

export class RoomRetentionService {
  readonly #dependencies: RoomRetentionServiceDependencies;

  constructor(dependencies: RoomRetentionServiceDependencies) {
    this.#dependencies = dependencies;
  }

  async expire(deadline: RoomRetentionDeadline): Promise<RoomRetentionResult> {
    if (this.#dependencies.clock.now() < deadline.deadlineAt) {
      return { status: "NO_OP", reason: "NOT_DUE" };
    }
    const room = await this.#dependencies.roomRepository.findById(deadline.roomId);
    if (room === null) {
      return { status: "NO_OP", reason: "ROOM_NOT_FOUND" };
    }

    if (deadline.kind === "PLAYING_ALL_OFFLINE_RETENTION") {
      if (
        room.phase !== "PLAYING" ||
        room.game === null ||
        room.game.gameId !== deadline.gameId
      ) {
        return { status: "NO_OP", reason: "STALE_POLICY" };
      }
      const presenceLease =
        await this.#dependencies.presenceReader.acquireRoomPresenceLease(room.roomId);
      if (
        presenceLease.presenceVersion !== deadline.presenceVersion ||
        !presenceLease.isCurrent()
      ) {
        return { status: "NO_OP", reason: "STALE_POLICY" };
      }
      if (
        room.players.some(
          (player) =>
            presenceLease.connectionStatusByPlayerId.get(player.playerId) ===
            "CONNECTED",
        )
      ) {
        return { status: "NO_OP", reason: "PLAYER_CONNECTED" };
      }
      return this.#dependencies.cleanupService.cleanup({
        roomId: room.roomId,
        reason: "PLAYING_ALL_OFFLINE_RETENTION",
        expectedRoomRevision: room.roomRevision,
        expectedStorageRevision: room.storageRevision,
        precondition: { isSatisfied: () => presenceLease.isCurrent() },
      });
    }

    if (
      room.phase !== "FINISHED" ||
      room.game === null ||
      room.game.gameId !== deadline.gameId ||
      ((room.gameType === "CITY_ROLE" || room.gameType === "DRAW_RELAY" || room.gameType === "SNEAKY_LUNCH" || room.gameType === "WOLF_NIGHT" || room.gameType === "LIAR_GAME" || room.gameType === "WORD_DUET" || room.gameType === "JAIPUR" || room.gameType === "GURYONGTU" || room.gameType === "AZUL" || room.gameType === "CLUE" || room.gameType === "SABOTEUR" || room.gameType === "LOST_CITIES" || room.gameType === "SPLENDOR" || room.gameType === "HALLI_GALLI" || room.gameType === "ISLAND_SETTLERS") ? room.game.finishedAt !== deadline.finishedAt : room.game.result?.finishedAt !== deadline.finishedAt)
    ) {
      return { status: "NO_OP", reason: "STALE_POLICY" };
    }
    return this.#dependencies.cleanupService.cleanup({
      roomId: room.roomId,
      reason: "FINISHED_RETENTION",
      expectedRoomRevision: room.roomRevision,
      expectedStorageRevision: room.storageRevision,
    });
  }
}

export type RoomPolicyRoomClosedListener = (
  roomId: RoomId,
) => void | Promise<void>;
