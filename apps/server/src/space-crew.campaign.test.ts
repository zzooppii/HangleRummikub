import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { mkdtemp, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  advanceSpaceCrewCampaign, beginSpaceCrewCampaignAttempt, claimSpaceCrewCampaign, createSpaceCrewCampaign,
  finishSpaceCrewCampaignAttempt, interruptSpaceCrewCampaignAttempt, parseSpaceCrewCampaignCheckpoint,
  projectSpaceCrewCampaign, recordSpaceCrewCampaignDistress, releaseSpaceCrewCampaign,
  selectSpaceCrewPracticeMission, spaceCrewCampaignDistress,
  prepareSpaceCrewCampaignInterruption, finalizeSpaceCrewCampaignInterruption, cancelSpaceCrewCampaignInterruption,
  type SpaceCrewCampaignCheckpoint, type SpaceCrewCampaignTransition,
} from "./games/space-crew/domain/campaign.js";
import { campaignIdForRecoveryToken, hashSpaceCrewRecoveryToken, verifySpaceCrewRecoveryToken } from "./games/space-crew/infrastructure/campaign-credentials.js";
import { FileSpaceCrewCampaignRepository, InMemorySpaceCrewCampaignRepository } from "./games/space-crew/infrastructure/campaign-repository.js";
import type { SpaceCrewCampaignOperation, SpaceCrewCampaignRepository, SpaceCrewCampaignTransaction, SpaceCrewCampaignTransactionResult } from "./games/space-crew/ports/campaign-repository.js";

const credential = Buffer.alloc(32, 7).toString("base64url");
const otherCredential = Buffer.alloc(32, 8).toString("base64url");
const campaignId = campaignIdForRecoveryToken(credential);
const fingerprint = (value: string) => createHash("sha256").update(value).digest("hex");
const binding = { processId: "process-a", roomId: "room-a" };
function checkpoint(result: SpaceCrewCampaignTransition | SpaceCrewCampaignTransactionResult): SpaceCrewCampaignCheckpoint {
  assert.ok(result.ok, JSON.stringify(result)); return result.checkpoint;
}
function fresh(mode: "CAMPAIGN" | "PRACTICE" = "CAMPAIGN", missionNumber = 1) {
  return createSpaceCrewCampaign({ campaignId, mode, missionNumber, ...binding });
}
function request(state: SpaceCrewCampaignCheckpoint, operation: SpaceCrewCampaignOperation, requestId: string): SpaceCrewCampaignTransaction {
  return { campaignId, operation, requestId, fingerprint: fingerprint(`${operation}:${requestId}`), expectedRevision: state.revision,
    authorization: { kind: "LEASE", processId: state.lease.processId, roomId: state.lease.roomId, generation: state.lease.generation } };
}
const createRequest: SpaceCrewCampaignTransaction = {
  campaignId, operation: "CREATE", requestId: "create-request", fingerprint: fingerprint("create"), expectedRevision: null,
  authorization: { kind: "CREATE", recoveryToken: credential },
};
async function create(repository: SpaceCrewCampaignRepository): Promise<SpaceCrewCampaignCheckpoint> {
  return checkpoint(await repository.transact(createRequest, () => ({ ok: true, checkpoint: fresh() })));
}
async function withDirectory(run: (directory: string) => Promise<void>) {
  const root = await mkdtemp(join(tmpdir(), "space-crew-campaign-"));
  try { await run(join(root, "campaigns")); } finally { await rm(root, { recursive: true, force: true }); }
}

test("campaign credential identity is stable, domain-separated and verified without storing the secret", () => {
  assert.equal(credential.length, 43);
  assert.equal(campaignIdForRecoveryToken(credential), campaignId);
  assert.notEqual(campaignIdForRecoveryToken(otherCredential), campaignId);
  const digest = hashSpaceCrewRecoveryToken(credential);
  assert.equal(verifySpaceCrewRecoveryToken(credential, digest), true);
  assert.equal(verifySpaceCrewRecoveryToken(otherCredential, digest), false);
  assert.equal(verifySpaceCrewRecoveryToken("bad", digest), false);
  assert.equal(verifySpaceCrewRecoveryToken(credential, "bad"), false);
  assert.equal(campaignId.includes(digest.slice(0, 40)), false);
  assert.throws(() => campaignIdForRecoveryToken(`${credential}=`));
});

test("campaign transitions retain failed and aborted attempts and charge help only once", () => {
  let state = fresh();
  assert.equal(projectSpaceCrewCampaign(state).actualAttempts, 0);
  state = checkpoint(beginSpaceCrewCampaignAttempt(state, { attemptId: "attempt-1", now: 10 }));
  const before = structuredClone(state);
  state = checkpoint(recordSpaceCrewCampaignDistress(state, { attemptId: "attempt-1", active: true,
    history: [{ attemptNumber: 1, kind: "ACTIVATED", direction: null }, { attemptNumber: 1, kind: "EXCHANGED", direction: "LEFT" }] }));
  assert.deepEqual(before.distressEvents, []);
  state = checkpoint(finishSpaceCrewCampaignAttempt(state, { attemptId: "attempt-1", now: 20, outcome: "FAILURE", reason: "WRONG_OWNER", completedTaskCount: 0, totalTaskCount: 1 }));
  assert.equal(state.lease.active, false);
  state = checkpoint(claimSpaceCrewCampaign(state, { ...binding, now: 21 }));
  state = checkpoint(beginSpaceCrewCampaignAttempt(state, { attemptId: "attempt-2", now: 22 }));
  state = checkpoint(interruptSpaceCrewCampaignAttempt(state, { now: 23 }));
  state = checkpoint(claimSpaceCrewCampaign(state, { ...binding, now: 24 }));
  state = checkpoint(beginSpaceCrewCampaignAttempt(state, { attemptId: "attempt-3", now: 25 }));
  state = checkpoint(finishSpaceCrewCampaignAttempt(state, { attemptId: "attempt-3", now: 30, outcome: "SUCCESS", reason: "OBJECTIVES_COMPLETE", completedTaskCount: 1, totalTaskCount: 1 }));
  assert.deepEqual(state.attempts.map(attempt => attempt.status), ["FAILURE", "ABORTED", "SUCCESS"]);
  assert.equal(projectSpaceCrewCampaign(state).recordedAttempts, 4);
  state = checkpoint(claimSpaceCrewCampaign(state, { ...binding, now: 31 }));
  state = checkpoint(advanceSpaceCrewCampaign(state));
  assert.deepEqual(projectSpaceCrewCampaign(state), { campaignId, revision: 0, mode: "CAMPAIGN", missionNumber: 2, actualAttempts: 0, recordedAttempts: 0, completedMissions: [1], distressActive: false });
  assert.equal(state.distressEvents.length, 2);
});

test("practice switches and repeats preserve old attempts while starting independent help and attempt counts", () => {
  let state = checkpoint(beginSpaceCrewCampaignAttempt(fresh("PRACTICE", 40), { attemptId: "practice-1", now: 1 }));
  state = checkpoint(recordSpaceCrewCampaignDistress(state, { attemptId: "practice-1", active: true, history: [{ attemptNumber: 1, kind: "ACTIVATED", direction: null }] }));
  state = checkpoint(finishSpaceCrewCampaignAttempt(state, { attemptId: "practice-1", now: 2, outcome: "SUCCESS", reason: "OBJECTIVES_COMPLETE", completedTaskCount: 8, totalTaskCount: 8 }));
  state = checkpoint(claimSpaceCrewCampaign(state, { ...binding, now: 3 }));
  state = checkpoint(selectSpaceCrewPracticeMission(state, { missionNumber: 2 }));
  state = checkpoint(beginSpaceCrewCampaignAttempt(state, { attemptId: "practice-2", now: 4 }));
  assert.deepEqual(spaceCrewCampaignDistress(state), { active: false, history: [] });
  assert.equal(projectSpaceCrewCampaign(state).actualAttempts, 1);
  state = checkpoint(interruptSpaceCrewCampaignAttempt(state, { now: 5 }));
  state = checkpoint(claimSpaceCrewCampaign(state, { ...binding, now: 6 }));
  state = checkpoint(selectSpaceCrewPracticeMission(state, { missionNumber: 40 }));
  state = checkpoint(beginSpaceCrewCampaignAttempt(state, { attemptId: "practice-3", now: 7 }));
  assert.deepEqual(state.attempts.map(attempt => [attempt.runNumber, attempt.missionNumber, attempt.attemptNumber]), [[1, 40, 1], [2, 2, 1], [3, 40, 1]]);
  assert.deepEqual(state.completedMissions, [40]);
  assert.equal(state.distressEvents.length, 1);
  assert.equal(state.status, "OPEN");
});

test("campaign schemas reject private fields, impossible progress and rewritten help history", () => {
  assert.throws(() => createSpaceCrewCampaign({ campaignId, ...binding, mode: "CAMPAIGN", missionNumber: 2 }));
  const state = checkpoint(beginSpaceCrewCampaignAttempt(fresh(), { attemptId: "attempt-1", now: 10 }));
  for (const forged of [{ ...state, cards: [] }, { ...state, recoveryToken: credential }, { ...state, completedMissions: [1] }, { ...state, missionNumber: 3 }, { ...state, lease: { ...state.lease, active: false } }]) {
    assert.throws(() => parseSpaceCrewCampaignCheckpoint(forged));
  }
  assert.equal(beginSpaceCrewCampaignAttempt(state, { attemptId: "attempt-2", now: 11 }).ok, false);
  assert.equal(releaseSpaceCrewCampaign(state).ok, false);
  assert.equal(recordSpaceCrewCampaignDistress(state, { attemptId: "wrong", active: false, history: [] }).ok, false);
  assert.equal(recordSpaceCrewCampaignDistress(state, { attemptId: "attempt-1", active: true, history: [] }).ok, false);
  const active = checkpoint(recordSpaceCrewCampaignDistress(state, { attemptId: "attempt-1", active: true, history: [{ attemptNumber: 1, kind: "ACTIVATED", direction: null }] }));
  assert.deepEqual(recordSpaceCrewCampaignDistress(active, { attemptId: "attempt-1", active: false, history: [] }), { ok: false, reason: "INVALID_DISTRESS" });
});

test("durable receipts prevent duplicate begin, classify payload conflict before stale revision and detach reads", async () => {
  const repository = new InMemorySpaceCrewCampaignRepository();
  const state = await create(repository);
  const command = request(state, "BEGIN_ATTEMPT", "begin-1");
  let calls = 0;
  const prepare = (current: SpaceCrewCampaignCheckpoint | null): SpaceCrewCampaignTransition => {
    assert.ok(current); calls += 1; return beginSpaceCrewCampaignAttempt(current, { attemptId: "attempt-1", now: 1 });
  };
  const first = await repository.transact(command, prepare);
  const replay = await repository.transact(command, prepare);
  assert.equal(calls, 1);
  assert.ok(first.ok && replay.ok); assert.equal(replay.replayed, true);
  assert.equal(replay.checkpoint.attempts.length, 1);
  assert.equal(replay.checkpoint.revision, 1);
  assert.deepEqual(await repository.transact({ ...command, fingerprint: fingerprint("changed") }, prepare), { ok: false, reason: "IDEMPOTENCY_CONFLICT" });
  const detached = await repository.read(campaignId); assert.ok(detached); detached.attempts.length = 0;
  assert.equal((await repository.read(campaignId))?.attempts.length, 1);
});

test("concurrent recovery claims permit one room, and a new owner fences the old room", async () => {
  const repository = new InMemorySpaceCrewCampaignRepository();
  let state = await create(repository);
  state = checkpoint(await repository.transact(request(state, "RELEASE", "release"), current => { assert.ok(current); return releaseSpaceCrewCampaign(current); }));
  const previousLease = { ...state.lease };
  const recover = (roomId: string) => repository.transact({ campaignId, operation: "RESUME", expectedRevision: state.revision,
    requestId: `recover-${roomId}`, fingerprint: fingerprint(roomId), authorization: { kind: "RECOVER", recoveryToken: credential } },
  current => { assert.ok(current); return claimSpaceCrewCampaign(current, { processId: "process-a", roomId, now: 1 }); });
  const results = await Promise.all([recover("room-b"), recover("room-c")]);
  assert.equal(results.filter(result => result.ok).length, 1);
  assert.equal(results.filter(result => !result.ok && result.reason === "STALE_REVISION").length, 1);
  const latest = await repository.read(campaignId); assert.ok(latest);
  assert.equal(latest.lease.active, true); assert.equal(latest.lease.generation, 2);
  assert.deepEqual(await repository.transact({ ...request(latest, "BEGIN_ATTEMPT", "old-room"), authorization: { kind: "LEASE", processId: previousLease.processId, roomId: previousLease.roomId, generation: previousLease.generation } }, () => { throw new Error("must not run"); }), { ok: false, reason: "INVALID_LEASE" });
});

test("terminal release permits same-room reclaim and duplicate result replay", async () => {
  const repository = new InMemorySpaceCrewCampaignRepository();
  let state = await create(repository);
  state = checkpoint(await repository.transact(request(state, "BEGIN_ATTEMPT", "begin"), current => { assert.ok(current); return beginSpaceCrewCampaignAttempt(current, { attemptId: "attempt-1", now: 1 }); }));
  const command = request(state, "RESULT", "finish");
  const finish = (current: SpaceCrewCampaignCheckpoint | null): SpaceCrewCampaignTransition => { assert.ok(current); return finishSpaceCrewCampaignAttempt(current, { attemptId: "attempt-1", now: 2, outcome: "FAILURE", reason: "WRONG_OWNER", completedTaskCount: 0, totalTaskCount: 1 }); };
  state = checkpoint(await repository.transact(command, finish));
  assert.equal(state.lease.active, false);
  const replay = await repository.transact(command, finish); assert.ok(replay.ok); assert.equal(replay.replayed, true);
  state = checkpoint(await repository.transact(request(state, "BEGIN_ATTEMPT", "retry"), current => {
    assert.ok(current); return beginSpaceCrewCampaignAttempt(checkpoint(claimSpaceCrewCampaign(current, { ...binding, now: 3 })), { attemptId: "attempt-2", now: 4 });
  }));
  assert.equal(state.attempts.length, 2); assert.equal(state.lease.active, true); assert.equal(state.lease.generation, 2);
});

test("file repository is lazy, restricts permissions, stores no secrets and reopens receipts after restart", async () => withDirectory(async directory => {
  const repository = new FileSpaceCrewCampaignRepository({ directory });
  await assert.rejects(stat(directory));
  let state = await create(repository);
  const command = request(state, "BEGIN_ATTEMPT", "begin");
  state = checkpoint(await repository.transact(command, current => { assert.ok(current); return beginSpaceCrewCampaignAttempt(current, { attemptId: "attempt-1", now: 1 }); }));
  const filename = join(directory, `${campaignId}.json`);
  assert.equal((await stat(filename)).mode & 0o777, 0o600);
  assert.equal((await stat(directory)).mode & 0o777, 0o700);
  const text = await readFile(filename, "utf8");
  assert.equal(text.includes(credential), false);
  for (const key of ["cardId", "hand", "sessionToken", "recoveryToken", "randomSource", "communications"]) assert.equal(text.includes(`"${key}"`), false);
  const restarted = new FileSpaceCrewCampaignRepository({ directory });
  const replay = await restarted.transact(command, () => { throw new Error("must not rerun begin"); });
  assert.ok(replay.ok); assert.equal(replay.replayed, true); assert.equal(replay.checkpoint.attempts.length, 1);
  assert.deepEqual(await readdir(directory), [`${campaignId}.json`]);
  const recovered = checkpoint(await restarted.transact({ campaignId, operation: "RESUME", expectedRevision: state.revision, requestId: "recover",
    fingerprint: fingerprint("recover"), authorization: { kind: "RECOVER", recoveryToken: credential } }, current => {
    assert.ok(current); return claimSpaceCrewCampaign(current, { processId: "process-b", roomId: "room-b", now: 2, takeover: true });
  }));
  assert.equal(recovered.attempts[0]?.status, "ABORTED");
  assert.equal(recovered.attempts.length, 1);
  assert.equal(projectSpaceCrewCampaign(recovered).actualAttempts, 1);
}));

class FaultyFileRepository extends FileSpaceCrewCampaignRepository {
  fault: "BEFORE" | "AFTER" | null = null;
  protected override async writeText(filename: string, text: string): Promise<void> {
    if (this.fault === "BEFORE") throw new Error("private storage diagnostic");
    await super.writeText(filename, text);
    if (this.fault === "AFTER") throw new Error("private storage diagnostic");
  }
}

test("failed file write leaves durable attempt and receipt unchanged, retry performs it once", async () => withDirectory(async directory => {
  const repository = new FaultyFileRepository({ directory });
  const state = await create(repository);
  const command = request(state, "BEGIN_ATTEMPT", "begin");
  const prepare = (current: SpaceCrewCampaignCheckpoint | null): SpaceCrewCampaignTransition => { assert.ok(current); return beginSpaceCrewCampaignAttempt(current, { attemptId: "attempt-1", now: 1 }); };
  repository.fault = "BEFORE";
  assert.deepEqual(await repository.transact(command, prepare), { ok: false, reason: "STORAGE_UNAVAILABLE" });
  assert.deepEqual(await repository.read(campaignId), state);
  repository.fault = null;
  assert.equal(checkpoint(await repository.transact(command, prepare)).attempts.length, 1);
}));

test("an uncertain acknowledgement after atomic save replays CREATE without duplicating the campaign", async () => withDirectory(async directory => {
  const repository = new FaultyFileRepository({ directory }); repository.fault = "AFTER";
  assert.deepEqual(await repository.transact(createRequest, () => ({ ok: true, checkpoint: fresh() })), { ok: false, reason: "STORAGE_UNAVAILABLE" });
  const restarted = new FileSpaceCrewCampaignRepository({ directory });
  const result = await restarted.transact(createRequest, () => { throw new Error("already durably created"); });
  assert.ok(result.ok); assert.equal(result.replayed, true); assert.equal(result.checkpoint.revision, 0);
  assert.deepEqual(await readdir(directory), [`${campaignId}.json`]);
}));

test("unknown campaign and wrong recovery key return the same error without paths or credential values", async () => {
  const repository = new InMemorySpaceCrewCampaignRepository(); await create(repository);
  const recover: SpaceCrewCampaignTransaction = { campaignId, operation: "RESUME", expectedRevision: 0,
    requestId: "recover", fingerprint: fingerprint("recover"), authorization: { kind: "RECOVER", recoveryToken: otherCredential } };
  const prepare = (): SpaceCrewCampaignTransition => { throw new Error("must not execute"); };
  assert.deepEqual(await repository.transact(recover, prepare), { ok: false, reason: "INVALID_CREDENTIAL" });
  assert.deepEqual(await repository.transact({ ...recover, campaignId: campaignIdForRecoveryToken(otherCredential) }, prepare), { ok: false, reason: "INVALID_CREDENTIAL" });
  assert.equal(await repository.read("../../private"), null);
});

test("file parser rejects corrupt checkpoints instead of resetting campaign progress", async () => withDirectory(async directory => {
  const repository = new FileSpaceCrewCampaignRepository({ directory }); const state = await create(repository);
  await writeFile(join(directory, `${campaignId}.json`), '{"checkpoint":{"hand":[]}}', { mode: 0o600 });
  await assert.rejects(repository.read(campaignId), { message: "Space Crew campaign storage is unavailable." });
  assert.deepEqual(await repository.transact(request(state, "BEGIN_ATTEMPT", "begin"), () => { throw new Error("must not run"); }), { ok: false, reason: "STORAGE_UNAVAILABLE" });
}));


test("durable interruption reservation cancels without rewriting history and finalizes only its exact intent", async () => {
  const repository = new InMemorySpaceCrewCampaignRepository();
  let state = await create(repository);
  state = checkpoint(await repository.transact(request(state, "BEGIN_ATTEMPT", "begin"), current => {
    assert.ok(current); return beginSpaceCrewCampaignAttempt(current, { attemptId: "attempt-1", now: 1 });
  }));
  const originalAttempt = structuredClone(state.attempts[0]);
  state = checkpoint(await repository.transact(request(state, "PREPARE_INTERRUPT", "reserve-1"), current => {
    assert.ok(current); return prepareSpaceCrewCampaignInterruption(current, { requestId: "intent-1", now: 2 });
  }));
  assert.deepEqual(state.attempts[0], originalAttempt);
  assert.equal(state.lease.active, true);
  assert.equal(releaseSpaceCrewCampaign(state).ok, false);
  assert.equal(interruptSpaceCrewCampaignAttempt(state, { now: 3 }).ok, false);
  assert.equal(finalizeSpaceCrewCampaignInterruption(state, { requestId: "wrong" }).ok, false);
  assert.equal(beginSpaceCrewCampaignAttempt(state, { attemptId: "attempt-2", now: 3 }).ok, false);
  state = checkpoint(await repository.transact(request(state, "CANCEL_INTERRUPT", "cancel"), current => {
    assert.ok(current); return cancelSpaceCrewCampaignInterruption(current, { requestId: "intent-1" });
  }));
  assert.deepEqual(state.attempts[0], originalAttempt);
  assert.equal(state.pendingInterruption, null);
  state = checkpoint(await repository.transact(request(state, "PREPARE_INTERRUPT", "reserve-2"), current => {
    assert.ok(current); return prepareSpaceCrewCampaignInterruption(current, { requestId: "intent-2", now: 4 });
  }));
  state = checkpoint(await repository.transact(request(state, "FINALIZE_INTERRUPT", "finalize"), current => {
    assert.ok(current); return finalizeSpaceCrewCampaignInterruption(current, { requestId: "intent-2" });
  }));
  assert.equal(state.attempts[0]?.status, "ABORTED");
  assert.equal(state.attempts[0]?.endedAt, 4);
  assert.equal(state.pendingInterruption, null);
  assert.equal(state.lease.active, false);
});

test("restart recovery clears a pending room intent and records the unfinished attempt once", async () => withDirectory(async directory => {
  const repository = new FileSpaceCrewCampaignRepository({ directory });
  let state = await create(repository);
  state = checkpoint(await repository.transact(request(state, "BEGIN_ATTEMPT", "begin"), current => {
    assert.ok(current); return beginSpaceCrewCampaignAttempt(current, { attemptId: "attempt-1", now: 1 });
  }));
  state = checkpoint(await repository.transact(request(state, "PREPARE_INTERRUPT", "reserve"), current => {
    assert.ok(current); return prepareSpaceCrewCampaignInterruption(current, { requestId: "intent", now: 2 });
  }));
  const restarted = new FileSpaceCrewCampaignRepository({ directory });
  state = checkpoint(await restarted.transact({ ...request(state, "RESUME", "recover"), authorization: { kind: "RECOVER", recoveryToken: credential } }, current => {
    assert.ok(current); return claimSpaceCrewCampaign(current, { processId: "new-process", roomId: "new-room", now: 3, takeover: true });
  }));
  assert.equal(state.pendingInterruption, null);
  assert.equal(state.attempts.length, 1);
  assert.equal(state.attempts[0]?.status, "ABORTED");
  assert.equal(state.lease.active, true);
}));

test("receipt replay must complete another durable flush before acknowledging an uncertain save", async () => withDirectory(async directory => {
  const repository = new FaultyFileRepository({ directory });
  repository.fault = "AFTER";
  assert.deepEqual(await repository.transact(createRequest, () => ({ ok: true, checkpoint: fresh() })), { ok: false, reason: "STORAGE_UNAVAILABLE" });
  repository.fault = "BEFORE";
  const forbiddenPrepare = (): SpaceCrewCampaignTransition => { throw new Error("receipt must prevent a duplicate create"); };
  assert.deepEqual(await repository.transact(createRequest, forbiddenPrepare), { ok: false, reason: "STORAGE_UNAVAILABLE" });
  repository.fault = null;
  const saved = await repository.transact(createRequest, forbiddenPrepare);
  assert.ok(saved.ok); assert.equal(saved.replayed, true); assert.equal(saved.checkpoint.revision, 0);
}));
