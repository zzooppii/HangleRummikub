import { mkdir, open, readFile, rename, rm, stat } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { resolve, join, parse as parsePath } from "node:path";
import * as v from "valibot";
import { SpaceCrewCampaignIdSchema } from "@hangul-rummikub/shared";
import { KeyedSerialExecutor } from "../../../infrastructure/keyed-serial-executor.js";
import { parseSpaceCrewCampaignCheckpoint, projectSpaceCrewCampaign, SpaceCrewCampaignAttachmentSchema, type SpaceCrewCampaignCheckpoint, type SpaceCrewCampaignTransition } from "../domain/campaign.js";
import type { SpaceCrewCampaignRepository, SpaceCrewCampaignTransaction, SpaceCrewCampaignTransactionResult } from "../ports/campaign-repository.js";
import { campaignIdForRecoveryToken, hashSpaceCrewRecoveryToken, verifySpaceCrewRecoveryToken } from "./campaign-credentials.js";

const Count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const Id = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
const Operation = v.picklist(["CREATE", "RESUME", "BEGIN_ATTEMPT", "DISTRESS", "RESULT", "INTERRUPT", "RELEASE", "NEXT_MISSION", "SELECT_PRACTICE", "PREPARE_INTERRUPT", "FINALIZE_INTERRUPT", "CANCEL_INTERRUPT"]);
const RequestSchema = v.strictObject({
  campaignId: SpaceCrewCampaignIdSchema, expectedRevision: v.nullable(Count), requestId: Id,
  fingerprint: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)), operation: Operation,
  authorization: v.variant("kind", [
    v.strictObject({ kind: v.picklist(["CREATE", "RECOVER"]), recoveryToken: v.string() }),
    v.strictObject({ kind: v.literal("LEASE"), processId: Id, roomId: Id, generation: v.pipe(Count, v.minValue(1)) }),
  ]),
});
const ReceiptSchema = v.strictObject({
  requestId: Id, fingerprint: RequestSchema.entries.fingerprint, operation: Operation,
  authorizationScope: v.pipe(v.string(), v.maxLength(512)), committedRevision: Count,
  attachment: SpaceCrewCampaignAttachmentSchema,
});
const RecordSchema = v.strictObject({
  checkpoint: v.unknown(), recoveryDigest: v.pipe(v.string(), v.regex(/^[a-f0-9]{64}$/)), receipts: v.array(ReceiptSchema),
});
type StoredRecord = Omit<v.InferOutput<typeof RecordSchema>, "checkpoint"> & { checkpoint: SpaceCrewCampaignCheckpoint };
const MAX_CHECKPOINT_BYTES = 16 * 1024 * 1024;

function storageError(): Error { return new Error("Space Crew campaign storage is unavailable."); }
function decode(input: unknown): StoredRecord {
  const parsed = v.parse(RecordSchema, input);
  const checkpoint = parseSpaceCrewCampaignCheckpoint(parsed.checkpoint);
  if (new Set(parsed.receipts.map(receipt => receipt.requestId)).size !== parsed.receipts.length) throw storageError();
  let previousRevision = -1;
  for (const receipt of parsed.receipts) {
    if (receipt.committedRevision !== previousRevision + 1 || receipt.committedRevision > checkpoint.revision
      || receipt.attachment.campaignId !== checkpoint.campaignId || receipt.attachment.revision !== receipt.committedRevision) throw storageError();
    previousRevision = receipt.committedRevision;
  }
  if (previousRevision !== checkpoint.revision) throw storageError();
  return { ...parsed, checkpoint };
}
function scope(request: SpaceCrewCampaignTransaction): string {
  return request.authorization.kind === "LEASE" ? JSON.stringify(request.authorization) : "RECOVERY";
}
function bindingMatches(checkpoint: SpaceCrewCampaignCheckpoint, request: SpaceCrewCampaignTransaction): boolean {
  const authorization = request.authorization;
  return authorization.kind === "LEASE" && checkpoint.lease.processId === authorization.processId
    && checkpoint.lease.roomId === authorization.roomId && checkpoint.lease.generation === authorization.generation;
}
function historyPreserved(before: SpaceCrewCampaignCheckpoint, after: SpaceCrewCampaignCheckpoint): boolean {
  if (before.campaignId !== after.campaignId || before.mode !== after.mode || after.attempts.length < before.attempts.length
    || after.distressEvents.length < before.distressEvents.length || after.completedMissions.length < before.completedMissions.length
    || after.lease.generation < before.lease.generation || after.lease.generation > before.lease.generation + 1
    || after.runNumber < before.runNumber || after.runNumber > before.runNumber + 1) return false;
  if (JSON.stringify(after.distressEvents.slice(0, before.distressEvents.length)) !== JSON.stringify(before.distressEvents)
    || JSON.stringify(after.completedMissions.slice(0, before.completedMissions.length)) !== JSON.stringify(before.completedMissions)) return false;
  return before.attempts.every((attempt, index) => {
    const next = after.attempts[index];
    if (!next) return false;
    return attempt.status === "ACTIVE"
      ? next.attemptId === attempt.attemptId && next.missionNumber === attempt.missionNumber && next.runNumber === attempt.runNumber
        && next.attemptNumber === attempt.attemptNumber && next.startedAt === attempt.startedAt
      : JSON.stringify(next) === JSON.stringify(attempt);
  });
}

abstract class CampaignRepositoryBase implements SpaceCrewCampaignRepository {
  constructor(private readonly serial: KeyedSerialExecutor<string>) {}
  protected abstract load(campaignId: string): Promise<StoredRecord | null>;
  protected abstract save(campaignId: string, record: StoredRecord): Promise<void>;

  async read(campaignId: string): Promise<SpaceCrewCampaignCheckpoint | null> {
    if (!v.safeParse(SpaceCrewCampaignIdSchema, campaignId).success) return null;
    return this.serial.run(campaignId, async () => {
      try {
        const record = await this.load(campaignId);
        if (record && record.checkpoint.campaignId !== campaignId) throw storageError();
        return record ? parseSpaceCrewCampaignCheckpoint(record.checkpoint) : null;
      }
      catch { throw storageError(); }
    });
  }

  async transact(input: SpaceCrewCampaignTransaction, prepare: (current: SpaceCrewCampaignCheckpoint | null) => SpaceCrewCampaignTransition): Promise<SpaceCrewCampaignTransactionResult> {
    const parsed = v.safeParse(RequestSchema, input);
    if (!parsed.success) return { ok: false, reason: "INVALID_CAMPAIGN" };
    const request = parsed.output;
    return this.serial.run(request.campaignId, async () => {
      let current: StoredRecord | null;
      try {
        current = await this.load(request.campaignId);
        if (current && current.checkpoint.campaignId !== request.campaignId) throw storageError();
      } catch { return { ok: false, reason: "STORAGE_UNAVAILABLE" }; }
      const previous = current?.receipts.find(receipt => receipt.requestId === request.requestId);
      let recoveryDigest: string;
      if (request.authorization.kind === "LEASE") {
        if (!current || !bindingMatches(current.checkpoint, request) && previous?.authorizationScope !== scope(request)) return { ok: false, reason: "INVALID_LEASE" };
        recoveryDigest = current.recoveryDigest;
      } else {
        try {
          if (request.authorization.kind === "CREATE" && campaignIdForRecoveryToken(request.authorization.recoveryToken) !== request.campaignId) return { ok: false, reason: "INVALID_CREDENTIAL" };
          if (current ? !verifySpaceCrewRecoveryToken(request.authorization.recoveryToken, current.recoveryDigest) : request.authorization.kind !== "CREATE") return { ok: false, reason: "INVALID_CREDENTIAL" };
          recoveryDigest = current?.recoveryDigest ?? hashSpaceCrewRecoveryToken(request.authorization.recoveryToken);
        } catch { return { ok: false, reason: "INVALID_CREDENTIAL" }; }
      }
      if (previous && current) {
        if (previous.fingerprint !== request.fingerprint || previous.operation !== request.operation) return { ok: false, reason: "IDEMPOTENCY_CONFLICT" };
        // A prior rename may have succeeded before directory fsync failed. Confirm the
        // exact saved envelope durably again before acknowledging any replay.
        try { await this.save(request.campaignId, current); } catch { return { ok: false, reason: "STORAGE_UNAVAILABLE" }; }
        return { ok: true, replayed: true, checkpoint: parseSpaceCrewCampaignCheckpoint(current.checkpoint), attachment: projectSpaceCrewCampaign(current.checkpoint) };
      }
      if (request.authorization.kind === "LEASE" && current && !bindingMatches(current.checkpoint, request)) return { ok: false, reason: "INVALID_LEASE" };
      if ((current?.checkpoint.revision ?? null) !== request.expectedRevision) return { ok: false, reason: "STALE_REVISION" };
      if (current?.checkpoint.revision === Number.MAX_SAFE_INTEGER) return { ok: false, reason: "REVISION_EXHAUSTED" };
      let checkpoint: SpaceCrewCampaignCheckpoint;
      try {
        const candidate = prepare(current ? parseSpaceCrewCampaignCheckpoint(current.checkpoint) : null);
        if (!candidate.ok) return candidate;
        checkpoint = parseSpaceCrewCampaignCheckpoint({ ...candidate.checkpoint, revision: current ? current.checkpoint.revision + 1 : 0 });
        if (checkpoint.campaignId !== request.campaignId || current && !historyPreserved(current.checkpoint, checkpoint)) return { ok: false, reason: "INVALID_CAMPAIGN" };
      } catch { return { ok: false, reason: "INVALID_CAMPAIGN" }; }
      try {
        const attachment = projectSpaceCrewCampaign(checkpoint);
        const record = decode({ checkpoint, recoveryDigest, receipts: [...(current?.receipts ?? []), {
          requestId: request.requestId, fingerprint: request.fingerprint, operation: request.operation,
          authorizationScope: scope(request), committedRevision: checkpoint.revision, attachment,
        }] });
        await this.save(request.campaignId, record);
        return { ok: true, replayed: false, checkpoint, attachment };
      } catch { return { ok: false, reason: "STORAGE_UNAVAILABLE" }; }
    });
  }
}

export class InMemorySpaceCrewCampaignRepository extends CampaignRepositoryBase {
  private readonly records = new Map<string, string>();
  constructor() { super(new KeyedSerialExecutor<string>()); }
  protected async load(campaignId: string): Promise<StoredRecord | null> {
    const text = this.records.get(campaignId); return text === undefined ? null : decode(JSON.parse(text));
  }
  protected async save(campaignId: string, record: StoredRecord): Promise<void> { this.records.set(campaignId, JSON.stringify(record)); }
}

// File storage is a single-server-process adapter. Instances for one directory share its lane.
const directoryLanes = new Map<string, KeyedSerialExecutor<string>>();
function directoryLane(directory: string): KeyedSerialExecutor<string> {
  let lane = directoryLanes.get(directory);
  if (!lane) { lane = new KeyedSerialExecutor<string>(); directoryLanes.set(directory, lane); }
  return lane;
}

export class FileSpaceCrewCampaignRepository extends CampaignRepositoryBase {
  private readonly directory: string;
  constructor(options: Readonly<{ directory: string }>) {
    const directory = resolve(options.directory);
    if (directory === parsePath(directory).root) throw storageError();
    super(directoryLane(directory)); this.directory = directory;
  }
  protected async load(campaignId: string): Promise<StoredRecord | null> {
    const filename = join(this.directory, `${campaignId}.json`);
    try {
      const info = await stat(filename);
      if (!info.isFile() || info.size > MAX_CHECKPOINT_BYTES) throw storageError();
      return decode(JSON.parse(await readFile(filename, "utf8")));
    } catch (error) {
      if (error instanceof Error && "code" in error && error.code === "ENOENT") return null;
      throw storageError();
    }
  }
  protected async save(campaignId: string, record: StoredRecord): Promise<void> {
    const text = JSON.stringify(record);
    if (Buffer.byteLength(text) > MAX_CHECKPOINT_BYTES) throw storageError();
    await this.writeText(join(this.directory, `${campaignId}.json`), text);
  }
  /** A narrow override seam permits real-file failure/uncertain-ack regression tests. */
  protected async writeText(filename: string, contents: string): Promise<void> {
    await mkdir(this.directory, { recursive: true, mode: 0o700 });
    const temporary = join(this.directory, `.campaign-${randomUUID()}.tmp`);
    let renamed = false;
    try {
      const handle = await open(temporary, "wx", 0o600);
      try { await handle.writeFile(contents, "utf8"); await handle.sync(); } finally { await handle.close(); }
      await rename(temporary, filename); renamed = true;
      const directory = await open(this.directory, "r");
      try { await directory.sync(); } finally { await directory.close(); }
    } finally {
      if (!renamed) await rm(temporary, { force: true }).catch(() => undefined);
    }
  }
}
