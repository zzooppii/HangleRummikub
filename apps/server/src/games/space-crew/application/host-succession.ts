import * as v from "valibot";
import { RequestIdSchema, RoomRevisionSchema, type PlayerId, type RoomId, type ServerTime } from "@hangul-rummikub/shared";
import type { SpaceCrewDependencies } from "./service.js";

/** Existing finished-room host succession policy; never schedules or submits a game action. */
export class SpaceCrewHostSuccession {
  readonly offline = new Map<RoomId, Map<PlayerId, ServerTime>>();
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(private readonly deps: SpaceCrewDependencies, private readonly notify: (roomId: RoomId) => Promise<void>) {}
  disconnected(roomId: RoomId, playerId: PlayerId, at: ServerTime): void {
    const players = this.offline.get(roomId) ?? new Map<PlayerId, ServerTime>();
    if (!players.has(playerId)) players.set(playerId, at);
    this.offline.set(roomId, players);
  }
  resumed(roomId: RoomId, playerId: PlayerId): void {
    this.offline.get(roomId)?.delete(playerId);
    void this.evaluate(roomId).catch(() => console.error("SPACE_CREW host policy reconciliation failed."));
  }
  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      for (const roomId of this.offline.keys()) void this.evaluate(roomId).catch(() => console.error("SPACE_CREW host policy retry failed."));
    }, 1000);
    this.timer.unref();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  async evaluate(roomId: RoomId): Promise<boolean> {
    const d = this.deps;
    const changed = await d.roomMutationExecutor.run(roomId, async () => {
      const room = await d.roomRepository.findById(roomId);
      if (room?.gameType !== "SPACE_CREW") { this.offline.delete(roomId); return false; }
      const host = room.hostPlayerId;
      const since = host === null ? undefined : this.offline.get(roomId)?.get(host);
      if (!host || since === undefined || d.clock.now() - since < 60_000 || !room.game || room.phase !== "FINISHED") return false;
      const lease = await d.presence.acquireRoomPresenceLease(roomId);
      if (!lease.isCurrent() || lease.connectionStatusByPlayerId.get(host) === "CONNECTED") return false;
      const next = [...room.players].sort((a, b) => a.joinOrder - b.joinOrder).find(player => player.playerId !== host
        && !room.departedPlayerIds?.includes(player.playerId) && lease.connectionStatusByPlayerId.get(player.playerId) === "CONNECTED");
      if (!next) return false;
      const now = d.clock.now();
      const result = await d.roomUnitOfWork.commit({
        roomMutation: { kind: "REPLACE", candidate: { ...room, hostPlayerId: next.playerId, roomRevision: v.parse(RoomRevisionSchema, room.roomRevision + 1), updatedAt: now }, expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision },
        sessionMutation: { kind: "NONE" },
        idempotency: { scopeKey: `room-timeout:${roomId}:host`, requestId: v.parse(RequestIdSchema, `host:${room.roomRevision}:${since}`),
          payloadFingerprint: JSON.stringify([host, next.playerId, since]), terminalResult: { hostTransferred: true }, createdAt: now },
      }, { isSatisfied: () => lease.isCurrent() && this.offline.get(roomId)?.get(host) === since });
      return result.status === "COMMITTED";
    });
    if (changed) await this.notify(roomId);
    return changed;
  }
}
