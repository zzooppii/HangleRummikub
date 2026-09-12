import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import { SpaceCrewCampaignStorage, SPACE_CREW_CAMPAIGN_STORAGE_PREFIX,
  type SpaceCrewCampaignStoragePort, type SpaceCrewCampaignCryptoPort, type SpaceCrewCampaignStorageResult } from "../features/space-crew/campaign-storage.js";

class MemoryStorage implements SpaceCrewCampaignStoragePort {
  readonly entries = new Map<string, string>();
  get length() { return this.entries.size; }
  getItem(key: string) { return this.entries.get(key) ?? null; }
  setItem(key: string, value: string) { this.entries.set(key, value); }
  key(index: number) { return [...this.entries.keys()][index] ?? null; }
}
const take = <T>(result: SpaceCrewCampaignStorageResult<T>): T => { assert.ok(result.ok); return result.value; };
const crypto: SpaceCrewCampaignCryptoPort = {
  randomBytes: () => Uint8Array.from({ length: 32 }, (_, i) => i),
  sha256: async bytes => Uint8Array.from(createHash("sha256").update(bytes).digest()).buffer,
};
function fixture(port: SpaceCrewCampaignCryptoPort = crypto) {
  const memory = new MemoryStorage();
  return { memory, storage: new SpaceCrewCampaignStorage(() => memory, () => port) };
}

test("campaign creation uses all 32 random bytes, matches server identity and persists before returning", async () => {
  const { memory, storage } = fixture(), created = take(await storage.create({ mode: "CAMPAIGN", label: "우리 원정대" }));
  const token = Buffer.from(crypto.randomBytes()).toString("base64url");
  const expectedId = `crew_${createHash("sha256").update("space-crew-campaign-id-v1\0").update(token).digest("hex").slice(0, 40)}`;
  assert.equal(created.recoveryToken, token); assert.equal(token.length, 43);
  assert.equal(created.campaignId, expectedId); assert.equal(created.missionNumber, 1);
  assert.deepEqual(JSON.parse(memory.getItem(`${SPACE_CREW_CAMPAIGN_STORAGE_PREFIX}${expectedId}`) ?? "null"), created);
  assert.deepEqual(take(await storage.list()), [created]);
  assert.equal(memory.length, 1); assert.ok([...memory.entries.keys()].every(key => key.startsWith(SPACE_CREW_CAMPAIGN_STORAGE_PREFIX)));
});

test("campaign recovery export/import is portable and validates identity instead of trusting metadata", async () => {
  const a = fixture(), b = fixture(), record = take(await a.storage.create({ mode: "PRACTICE", missionNumber: 46 }));
  const text = take(await a.storage.exportRecoveryText(record.campaignId));
  assert.deepEqual(take(await b.storage.importRecoveryText(text)), record);
  const updated = take(await b.storage.updateMetadata(record.campaignId, { missionNumber: 50, label: "마지막 미션" }));
  assert.equal(updated.missionNumber, 50); assert.equal(updated.recoveryToken, record.recoveryToken);
  assert.equal(updated.label, "마지막 미션");
  const bad: unknown = { format: "space-crew-recovery", version: 1, campaign: { ...record, campaignId: `crew_${"0".repeat(40)}` } };
  assert.deepEqual(await b.storage.importRecoveryText(JSON.stringify(bad)), { ok: false, reason: "INVALID_RECOVERY_TEXT" });
  assert.deepEqual(take(await b.storage.list()), [updated]);
});

test("campaign storage rejects unavailable writes, readback and crypto without exposing secrets", async () => {
  const secretMessage = "secret-credential-in-browser-exception";
  const unavailable = new SpaceCrewCampaignStorage(() => { throw new Error(secretMessage); }, () => crypto);
  for (const result of [await unavailable.list(), await unavailable.create({ mode: "CAMPAIGN" })]) {
    assert.deepEqual(result, { ok: false, reason: "STORAGE_UNAVAILABLE" }); assert.equal(JSON.stringify(result).includes(secretMessage), false);
  }
  const fake: SpaceCrewCampaignStoragePort = { length: 0, key: () => null, getItem: () => null, setItem: () => {} };
  assert.deepEqual(await new SpaceCrewCampaignStorage(() => fake, () => crypto).create({ mode: "CAMPAIGN" }), { ok: false, reason: "STORAGE_UNAVAILABLE" });
  for (const failing of [
    { ...crypto, randomBytes: () => { throw new Error(secretMessage); } },
    { ...crypto, randomBytes: () => new Uint8Array(31) },
    { ...crypto, sha256: async () => { throw new Error(secretMessage); } },
    { ...crypto, sha256: async () => new ArrayBuffer(12) },
  ]) {
    const { memory, storage } = fixture(failing);
    assert.deepEqual(await storage.create({ mode: "CAMPAIGN" }), { ok: false, reason: "CRYPTO_UNAVAILABLE" });
    assert.equal(memory.length, 0);
  }
});

test("campaign import strictly rejects extra fields, noncanonical token encodings and malformed text", async () => {
  const { storage, memory } = fixture(), record = take(await storage.create({ mode: "CAMPAIGN" }));
  const before = [...memory.entries];
  const wrap = (campaign: unknown) => JSON.stringify({ format: "space-crew-recovery", version: 1, campaign });
  for (const text of ["{", record.recoveryToken, wrap({ ...record, recoveryToken: `${record.recoveryToken}=` }),
    wrap({ ...record, recoveryToken: "_".repeat(43) }), wrap({ ...record, missionNumber: 51 }),
    wrap({ ...record, roomCode: "ABCDEF" }), wrap({ ...record, mode: "UNKNOWN" }),
    JSON.stringify({ format: "space-crew-recovery", version: 2, campaign: record }), "x".repeat(4097)]) {
    const result = await storage.importRecoveryText(text);
    assert.deepEqual(result, { ok: false, reason: "INVALID_RECOVERY_TEXT" });
    assert.equal(JSON.stringify(result).includes(record.recoveryToken), false);
  }
  assert.deepEqual([...memory.entries], before);
  for (const options of [{ mode: "PRACTICE" }, { mode: "CAMPAIGN", missionNumber: 2 }, { mode: "CAMPAIGN", recoveryToken: record.recoveryToken }]) {
    assert.deepEqual(await storage.create(options), { ok: false, reason: "INVALID_DATA" });
  }
});

test("campaign keys avoid cross-tab lost updates and ignore other browser stores", async () => {
  const memory = new MemoryStorage(); memory.setItem("hangul-rummikub.saved-game.v1", "unrelated");
  const a = new SpaceCrewCampaignStorage(() => memory, () => crypto);
  const b = new SpaceCrewCampaignStorage(() => memory, () => ({ ...crypto, randomBytes: () => new Uint8Array(32).fill(255) }));
  const records = await Promise.all([a.create({ mode: "CAMPAIGN" }), b.create({ mode: "PRACTICE", missionNumber: 12 })]);
  assert.equal(records.every(record => record.ok), true); assert.equal(take(await a.list()).length, 2);
  assert.equal(memory.getItem("hangul-rummikub.saved-game.v1"), "unrelated");
  assert.deepEqual(await a.create({ mode: "CAMPAIGN" }), { ok: false, reason: "INVALID_DATA" });
  assert.equal(take(await a.list()).length, 2);
});

test("corrupted recovery storage is reported without deletion or unsafe replacement", async () => {
  const { storage, memory } = fixture(), record = take(await storage.create({ mode: "CAMPAIGN" }));
  const key = `${SPACE_CREW_CAMPAIGN_STORAGE_PREFIX}${record.campaignId}`;
  memory.setItem(key, "{private-invalid-json");
  assert.deepEqual(await storage.list(), { ok: false, reason: "INVALID_DATA" });
  assert.equal(memory.getItem(key), "{private-invalid-json");
  assert.deepEqual(await storage.exportRecoveryText(`crew_${"0".repeat(40)}`), { ok: false, reason: "NOT_FOUND" });
});
