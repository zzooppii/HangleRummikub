import { createHash } from "node:crypto";
import type { RoomId } from "@hangul-rummikub/shared";
import type { SpaceCrewRoomRecord } from "../../../model/persistence.js";
import type { RoomMutationSerialExecutor } from "../../../application/room-session-service.js";
import { prepareSpaceCrewCampaignInterruption, finalizeSpaceCrewCampaignInterruption, cancelSpaceCrewCampaignInterruption, type SpaceCrewCampaignAttachment, type SpaceCrewCampaignCheckpoint } from "../domain/campaign.js";
import type { SpaceCrewCampaignRepository, SpaceCrewCampaignTransaction } from "../ports/campaign-repository.js";

const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
type Reservation = { before: SpaceCrewCampaignCheckpoint; reserved: SpaceCrewCampaignCheckpoint; requestId: string; decision: boolean | null; transaction: SpaceCrewCampaignTransaction | null };
export type SpaceCrewFinalization = { attachment: SpaceCrewCampaignAttachment | null; finalize(committed: boolean): Promise<void> };

/** Bridges the durable checkpoint and ephemeral room commit without claiming two-store atomicity. */
export class SpaceCrewCampaignFinalizer {
  private readonly reservations = new Map<RoomId, Reservation>();
  private timer: ReturnType<typeof setInterval> | undefined;
  constructor(private readonly deps: {
    campaigns: SpaceCrewCampaignRepository; processId: string; roomMutationExecutor: RoomMutationSerialExecutor;
    rolledBack(roomId: RoomId, before: SpaceCrewCampaignCheckpoint, after: SpaceCrewCampaignCheckpoint): void;
  }) {}

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      for (const roomId of this.reservations.keys()) {
        void this.deps.roomMutationExecutor.run(roomId, () => this.flush(roomId)).catch(() => console.error("SPACE_CREW campaign finalization will retry."));
      }
    }, 1000);
    this.timer.unref();
  }
  stop(): void { if (this.timer) clearInterval(this.timer); this.timer = undefined; }

  /** The caller already owns the room lane. False blocks new commands until compensation succeeds. */
  async flush(roomId: RoomId): Promise<boolean> {
    const pending = this.reservations.get(roomId);
    if (!pending) return true;
    if (pending.decision === null) return false;
    try {
      if (pending.transaction) {
        const saved = await this.deps.campaigns.transact(pending.transaction, checkpoint => checkpoint
          ? prepareSpaceCrewCampaignInterruption(checkpoint, { requestId: pending.requestId, now: pending.reserved.pendingInterruption?.now ?? 0 })
          : { ok: false, reason: "INVALID_CAMPAIGN" });
        if (!saved.ok) return false;
        pending.reserved = saved.checkpoint; pending.transaction = null;
      }
      const current = await this.deps.campaigns.read(pending.reserved.campaignId);
      if (!current) return false;
      const sameOwner = current.lease.processId === pending.reserved.lease.processId && current.lease.roomId === pending.reserved.lease.roomId
        && current.lease.generation === pending.reserved.lease.generation;
      if (!sameOwner && pending.decision) { this.reservations.delete(roomId); return true; }
      if (!sameOwner) return false;
      const saved = await this.deps.campaigns.transact({ campaignId: current.campaignId, expectedRevision: pending.reserved.revision,
        requestId: digest([pending.requestId, pending.decision ? "release" : "rollback"]), fingerprint: digest(["finalize", pending.requestId, pending.decision]),
        operation: pending.decision ? "FINALIZE_INTERRUPT" : "CANCEL_INTERRUPT", authorization: { kind: "LEASE", processId: current.lease.processId, roomId: current.lease.roomId, generation: current.lease.generation } }, checkpoint => {
        if (!checkpoint) return { ok: false, reason: "INVALID_CAMPAIGN" };
        return pending.decision ? finalizeSpaceCrewCampaignInterruption(checkpoint, { requestId: pending.requestId })
          : cancelSpaceCrewCampaignInterruption(checkpoint, { requestId: pending.requestId });
      });
      if (!saved.ok) return false;
      if (!pending.decision) this.deps.rolledBack(roomId, pending.before, saved.checkpoint);
      this.reservations.delete(roomId);
      return true;
    } catch { return false; }
  }

  async prepare(room: SpaceCrewRoomRecord, requestIdentity: string, at: number): Promise<SpaceCrewFinalization> {
    if (!await this.flush(room.roomId)) throw new Error("Space Crew campaign reconciliation is pending.");
    const game = room.game;
    if (!game) return { attachment: null, finalize: async () => {} };
    const before = await this.deps.campaigns.read(game.state.campaign.campaignId);
    if (!before) throw new Error("Space Crew campaign is unavailable.");
    const sameOwner = before.lease.processId === this.deps.processId && before.lease.roomId === room.roomId;
    if (!sameOwner && room.phase === "FINISHED") return { attachment: null, finalize: async () => {} };
    if (!sameOwner) throw new Error("Space Crew campaign lease is unavailable.");
    if (room.phase === "FINISHED" && !before.lease.active) return { attachment: null, finalize: async () => {} };
    const requestId = digest([requestIdentity, before.revision, "reserve"]);
    const transaction: SpaceCrewCampaignTransaction = { campaignId: before.campaignId, expectedRevision: before.revision,
      requestId, fingerprint: digest(["reserve", requestIdentity, before.revision, room.phase]),
      operation: "PREPARE_INTERRUPT", authorization: { kind: "LEASE", processId: this.deps.processId, roomId: room.roomId, generation: before.lease.generation } };
    const prepared = prepareSpaceCrewCampaignInterruption(before, { requestId, now: at });
    if (!prepared.ok) throw new Error("Space Crew campaign reservation is invalid.");
    const reservation: Reservation = { before, reserved: prepared.checkpoint, requestId, decision: false, transaction };
    // Remember before I/O: a failed acknowledgement may still have persisted the intent.
    this.reservations.set(room.roomId, reservation);
    const saved = await this.deps.campaigns.transact(transaction, () => prepared);
    if (!saved.ok) {
      if (saved.reason !== "STORAGE_UNAVAILABLE") this.reservations.delete(room.roomId);
      throw new Error("Space Crew campaign reservation could not be saved.");
    }
    reservation.reserved = saved.checkpoint; reservation.transaction = null; reservation.decision = null;
    return { attachment: saved.attachment, finalize: async committed => {
      reservation.decision = committed;
      const finished = await this.flush(room.roomId);
      // The accepted room change already has its durable interruption intent.
      // A failed release remains queued; a failed rollback blocks further commands.
      if (!finished && !committed) throw new Error("Space Crew campaign rollback is pending.");
    } };
  }
}
