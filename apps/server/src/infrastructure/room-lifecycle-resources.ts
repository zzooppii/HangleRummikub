import type { PlayerId, RoomCode, RoomId } from "@hangul-rummikub/shared";

import type { RoomCleanupResources } from "../application/room-cleanup-service.js";
import type { RoomLeaveResources } from "../application/room-leave-service.js";
import type { RoomPolicyScheduler } from "../ports/room-policy-scheduler.js";
import type {
  AuthenticatedSocketBinding,
  ConnectionRegistry,
} from "./connection-registry.js";

export type RoomClosedAdvisoryListener = (
  roomId: RoomId,
  roomCode: RoomCode,
  connectedBindings: readonly AuthenticatedSocketBinding[],
) => void | Promise<void>;

export type RoomPlayerRemovedListener = (
  roomId: RoomId,
  playerId: PlayerId,
) => void | Promise<void>;

export type RoomTurnTimerCleanup = Readonly<{
  cancelRoom(roomId: RoomId): void | Promise<void>;
}>;

export type RoomLifecycleResourcesOptions = Readonly<{
  connectionRegistry: ConnectionRegistry;
  policyScheduler: RoomPolicyScheduler;
  turnTimerCleanup?: RoomTurnTimerCleanup;
  onRoomClosed?: RoomClosedAdvisoryListener;
  onPlayerRemoved?: RoomPlayerRemovedListener;
}>;

/** Releases process-local state only after a canonical lifecycle commit. */
export class RoomLifecycleResources
  implements RoomCleanupResources, RoomLeaveResources
{
  readonly #options: RoomLifecycleResourcesOptions;

  constructor(options: RoomLifecycleResourcesOptions) {
    this.#options = options;
  }

  async removePlayer(roomId: RoomId, playerId: PlayerId): Promise<void> {
    this.#options.connectionRegistry.removePlayer(roomId, playerId);
    try {
      await this.#options.policyScheduler.cancelLobbyGrace(roomId, playerId);
    } catch {
      // A stale grace callback is generation-safe; continue reconciling
      // retention even when cancelling its process-local timer fails.
    }
    await this.#options.onPlayerRemoved?.(roomId, playerId);
  }

  async cleanupRoom(roomId: RoomId, roomCode: RoomCode): Promise<void> {
    const connectedBindings =
      this.#options.connectionRegistry.listActiveBindings(roomId);
    // The advisory is deliberately sent while bindings are still available.
    try {
      await this.#options.onRoomClosed?.(
        roomId,
        roomCode,
        connectedBindings,
      );
    } catch {
      // Advisory delivery cannot retain already-deleted canonical state.
    }
    this.#options.connectionRegistry.removeRoom(roomId);
    try {
      await this.#options.policyScheduler.cancelRoom(roomId);
    } catch {
      // Keep releasing independent process-local resources.
    }
    try {
      await this.#options.turnTimerCleanup?.cancelRoom(roomId);
    } catch {
      // Canonical cleanup is already committed and remains authoritative.
    }
  }
}
