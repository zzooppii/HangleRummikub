import { RequestIdSchema, RoomRevisionSchema, TurnIdSchema, type PlayerId, type RoomId, type ServerTime } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import type { SneakyLunchRoomRecord } from "../../../model/persistence.js";
import { forfeitLunch } from "../domain/game.js";
import { transitionSneaky, type SneakyLunchService } from "./service.js";

/** Process-local continuous offline intervals; same lifetime as connection authority. */
export class SneakyLunchPresence {
  readonly offline = new Map<RoomId, Map<PlayerId, ServerTime>>();
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(private readonly service: SneakyLunchService) {}
  disconnected(roomId: RoomId, playerId: PlayerId, at: ServerTime) {
    const players = this.offline.get(roomId) ?? new Map<PlayerId, ServerTime>();
    if (!players.has(playerId)) players.set(playerId, at);
    this.offline.set(roomId, players);
  }
  resumed(roomId: RoomId, playerId: PlayerId) {
    this.offline.get(roomId)?.delete(playerId);
    void this.evaluate(roomId).catch(() => console.error("SNEAKY presence reconciliation failed."));
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => { for (const roomId of this.offline.keys()) void this.evaluate(roomId).catch(() => console.error("SNEAKY presence retry failed.")); }, 1000);
    this.timer.unref();
  }
  stop() { if (this.timer) clearInterval(this.timer); this.timer = undefined; }
  async evaluate(roomId: RoomId): Promise<boolean> {
    const d = this.service.deps;
    const applied = await d.roomMutationExecutor.run(roomId, async () => {
      const room = await d.roomRepository.findById(roomId);
      if (room?.gameType !== "SNEAKY_LUNCH") { this.offline.delete(roomId); return false; }
      const intervals = this.offline.get(roomId);
      if (!intervals?.size || !room.game) return false;
      const lease = await d.presence.acquireRoomPresenceLease(roomId), now = d.clock.now();
      if (!lease.isCurrent()) return false;
      let candidate: Omit<SneakyLunchRoomRecord, "storageRevision"> = room;
      const guarded = new Map<PlayerId, ServerTime>();
      if (room.phase === "PLAYING") {
        let state = room.game.state;
        for (const p of room.players) {
          const since = intervals.get(p.playerId);
          if (since === undefined || now - since < 30000 || room.departedPlayerIds?.includes(p.playerId) || lease.connectionStatusByPlayerId.get(p.playerId) === "CONNECTED" ||
            !state.players.some(g => g.playerId === p.playerId && g.status === "ACTIVE")) continue;
          guarded.set(p.playerId, since); state = forfeitLunch(state, p.playerId, now);
        }
        if (state.revision !== room.game.gameRevision) candidate = transitionSneaky(room, state, now);
      } else if (room.phase === "FINISHED" && room.hostPlayerId) {
        const host = room.hostPlayerId, since = intervals.get(host);
        if (since !== undefined && now - since >= 60000 && lease.connectionStatusByPlayerId.get(host) !== "CONNECTED") {
          const next = [...room.players].sort((a, b) => a.joinOrder - b.joinOrder).find(p => p.playerId !== host && !room.departedPlayerIds?.includes(p.playerId) && lease.connectionStatusByPlayerId.get(p.playerId) === "CONNECTED");
          if (next) { guarded.set(host, since); candidate = { ...room, hostPlayerId: next.playerId, roomRevision: parse(RoomRevisionSchema, room.roomRevision + 1), updatedAt: now }; }
        }
      }
      if (candidate === room) return false;
      const committed = await d.roomUnitOfWork.commit({ roomMutation: { kind: "REPLACE", candidate, expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision },
        sessionMutation: { kind: "NONE" }, idempotency: { scopeKey: `sneaky-presence:${roomId}:${room.game.gameId}`, requestId: parse(RequestIdSchema, `presence:${room.storageRevision}`),
          payloadFingerprint: JSON.stringify([...guarded]), terminalResult: { applied: true }, createdAt: now } },
        { isSatisfied: () => lease.isCurrent() && [...guarded].every(([id, since]) => this.offline.get(roomId)?.get(id) === since) });
      if (committed.status !== "COMMITTED") return false;
      if (candidate.phase === "FINISHED") await d.turnScheduler.cancelTimeout(parse(TurnIdSchema, room.game.state.transitionId));
      return true;
    });
    if (applied) await this.service.notify(roomId);
    return applied;
  }
}
