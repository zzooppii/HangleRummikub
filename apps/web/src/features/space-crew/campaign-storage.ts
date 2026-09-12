/** Recovery secrets belong only to this dedicated browser store and explicit exports. */
export const SPACE_CREW_CAMPAIGN_STORAGE_PREFIX = "hangul-rummikub.space-crew-campaign.v1:";
export type SpaceCrewSavedCampaign = Readonly<{
  campaignId: string; recoveryToken: string; mode: "CAMPAIGN" | "PRACTICE"; missionNumber: number; label?: string;
}>;
export type SpaceCrewCampaignStorageError = "STORAGE_UNAVAILABLE" | "CRYPTO_UNAVAILABLE" | "INVALID_DATA" | "INVALID_RECOVERY_TEXT" | "NOT_FOUND";
export type SpaceCrewCampaignStorageResult<T> = { ok: true; value: T } | { ok: false; reason: SpaceCrewCampaignStorageError };
export type SpaceCrewCampaignStoragePort = Pick<Storage, "getItem" | "setItem" | "key" | "length">;
export type SpaceCrewCampaignCryptoPort = Readonly<{
  randomBytes(): Uint8Array;
  sha256(bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer>;
}>;

const TOKEN = /^[A-Za-z0-9_-]{42}[AEIMQUYcgkosw048]$/;
const CAMPAIGN_ID = /^crew_[a-f0-9]{40}$/;
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
class StorageFailure extends Error {
  constructor(readonly reason: SpaceCrewCampaignStorageError) { super("Space Crew recovery operation failed."); }
}
function fail(reason: SpaceCrewCampaignStorageError): never { throw new StorageFailure(reason); }
function object(input: unknown): input is Record<string, unknown> { return typeof input === "object" && input !== null && !Array.isArray(input); }
function keys(input: Record<string, unknown>, allowed: readonly string[]): boolean { return Object.keys(input).every(key => allowed.includes(key)); }
function mission(input: unknown): input is number { return typeof input === "number" && Number.isSafeInteger(input) && input >= 1 && input <= 50; }
function label(input: unknown): input is string | undefined { return input === undefined || typeof input === "string" && input.trim().length > 0 && input.length <= 80; }
function campaign(input: unknown): SpaceCrewSavedCampaign {
  if (!object(input) || !keys(input, ["campaignId", "recoveryToken", "mode", "missionNumber", "label"])
    || typeof input.campaignId !== "string" || !CAMPAIGN_ID.test(input.campaignId)
    || typeof input.recoveryToken !== "string" || !TOKEN.test(input.recoveryToken)
    || input.mode !== "CAMPAIGN" && input.mode !== "PRACTICE" || !mission(input.missionNumber) || !label(input.label)) fail("INVALID_DATA");
  return { campaignId: input.campaignId, recoveryToken: input.recoveryToken, mode: input.mode,
    missionNumber: input.missionNumber, ...(input.label === undefined ? {} : { label: input.label }) };
}
function encodeToken(bytes: Uint8Array): string {
  if (bytes.length !== 32) fail("CRYPTO_UNAVAILABLE");
  let result = "", bits = 0, value = 0;
  for (const byte of bytes) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 6) { bits -= 6; result += ALPHABET[(value >>> bits) & 63]; }
  }
  if (bits > 0) result += ALPHABET[(value << (6 - bits)) & 63];
  return result;
}

/** Dependencies are injected so storage denial and cryptographic failures are testable. */
export class SpaceCrewCampaignStorage {
  constructor(private readonly storage: () => SpaceCrewCampaignStoragePort, private readonly crypto: () => SpaceCrewCampaignCryptoPort) {}

  private async run<T>(operation: () => Promise<T>): Promise<SpaceCrewCampaignStorageResult<T>> {
    try { return { ok: true, value: await operation() }; }
    catch (error) { return { ok: false, reason: error instanceof StorageFailure ? error.reason : "INVALID_DATA" }; }
  }
  private read(key: string): string | null {
    try { return this.storage().getItem(key); } catch { return fail("STORAGE_UNAVAILABLE"); }
  }
  private async identity(recoveryToken: string): Promise<string> {
    try {
      const bytes = new TextEncoder().encode(`space-crew-campaign-id-v1\0${recoveryToken}`);
      const digest = new Uint8Array(await this.crypto().sha256(bytes));
      if (digest.length !== 32) return fail("CRYPTO_UNAVAILABLE");
      return `crew_${Array.from(digest, byte => byte.toString(16).padStart(2, "0")).join("").slice(0, 40)}`;
    } catch { return fail("CRYPTO_UNAVAILABLE"); }
  }
  private async verified(input: unknown): Promise<SpaceCrewSavedCampaign> {
    const record = campaign(input);
    if (record.campaignId !== await this.identity(record.recoveryToken)) fail("INVALID_DATA");
    return record;
  }
  private async load(campaignId: unknown): Promise<SpaceCrewSavedCampaign> {
    if (typeof campaignId !== "string" || !CAMPAIGN_ID.test(campaignId)) fail("INVALID_DATA");
    const raw = this.read(`${SPACE_CREW_CAMPAIGN_STORAGE_PREFIX}${campaignId}`);
    if (raw === null) fail("NOT_FOUND");
    const record = await this.verified(JSON.parse(raw));
    if (record.campaignId !== campaignId) fail("INVALID_DATA");
    return record;
  }
  private save(record: SpaceCrewSavedCampaign): SpaceCrewSavedCampaign {
    const key = `${SPACE_CREW_CAMPAIGN_STORAGE_PREFIX}${record.campaignId}`, serialized = JSON.stringify(record);
    try {
      const storage = this.storage(); storage.setItem(key, serialized);
      if (storage.getItem(key) !== serialized) fail("STORAGE_UNAVAILABLE");
    } catch { return fail("STORAGE_UNAVAILABLE"); }
    return { ...record };
  }

  list(): Promise<SpaceCrewCampaignStorageResult<readonly SpaceCrewSavedCampaign[]>> {
    return this.run(async () => {
      const ids = new Set<string>();
      try {
        const storage = this.storage();
        for (let index = 0; index < storage.length; index++) {
          const key = storage.key(index);
          if (key?.startsWith(SPACE_CREW_CAMPAIGN_STORAGE_PREFIX)) ids.add(key.slice(SPACE_CREW_CAMPAIGN_STORAGE_PREFIX.length));
        }
      } catch { return fail("STORAGE_UNAVAILABLE"); }
      return Promise.all([...ids].sort().map(id => this.load(id)));
    });
  }

  /** A successful result guarantees the secret was written and read back before sending NEW. */
  create(input: unknown): Promise<SpaceCrewCampaignStorageResult<SpaceCrewSavedCampaign>> {
    return this.run(async () => {
      if (!object(input) || !keys(input, ["mode", "missionNumber", "label"]) || !label(input.label)
        || input.mode !== "CAMPAIGN" && input.mode !== "PRACTICE"
        || input.mode === "CAMPAIGN" && input.missionNumber !== undefined && input.missionNumber !== 1
        || input.mode === "PRACTICE" && !mission(input.missionNumber)) fail("INVALID_DATA");
      let token: string;
      try { token = encodeToken(this.crypto().randomBytes()); } catch { return fail("CRYPTO_UNAVAILABLE"); }
      const record = await this.verified({ campaignId: await this.identity(token), recoveryToken: token, mode: input.mode,
        missionNumber: input.mode === "CAMPAIGN" ? 1 : input.missionNumber, ...(input.label === undefined ? {} : { label: input.label }) });
      // A generated identity must never overwrite an existing saved campaign.
      if (this.read(`${SPACE_CREW_CAMPAIGN_STORAGE_PREFIX}${record.campaignId}`) !== null) fail("INVALID_DATA");
      return this.save(record);
    });
  }

  importRecoveryText(text: unknown): Promise<SpaceCrewCampaignStorageResult<SpaceCrewSavedCampaign>> {
    return this.run(async () => {
      if (typeof text !== "string" || text.length > 4096) fail("INVALID_RECOVERY_TEXT");
      let record: SpaceCrewSavedCampaign;
      try {
        const parsed: unknown = JSON.parse(text);
        if (!object(parsed) || !keys(parsed, ["format", "version", "campaign"]) || parsed.format !== "space-crew-recovery" || parsed.version !== 1) fail("INVALID_RECOVERY_TEXT");
        record = await this.verified(parsed.campaign);
      } catch (error) {
        if (error instanceof StorageFailure && error.reason === "CRYPTO_UNAVAILABLE") throw error;
        return fail("INVALID_RECOVERY_TEXT");
      }
      return this.save(record);
    });
  }

  exportRecoveryText(campaignId: unknown): Promise<SpaceCrewCampaignStorageResult<string>> {
    return this.run(async () => JSON.stringify({ format: "space-crew-recovery", version: 1, campaign: await this.load(campaignId) }, null, 2));
  }

  updateMetadata(campaignId: unknown, input: unknown): Promise<SpaceCrewCampaignStorageResult<SpaceCrewSavedCampaign>> {
    return this.run(async () => {
      if (!object(input) || !keys(input, ["missionNumber", "label"]) || !mission(input.missionNumber) || !label(input.label)) fail("INVALID_DATA");
      const record = await this.load(campaignId);
      return this.save({ ...record, missionNumber: input.missionNumber, ...(input.label === undefined ? {} : { label: input.label }) });
    });
  }
}

/** No fallback to Math.random, memory-only storage, URL parameters or the seat-session store. */
export function createBrowserSpaceCrewCampaignStorage(): SpaceCrewCampaignStorage {
  return new SpaceCrewCampaignStorage(() => window.localStorage, () => ({
    randomBytes: () => globalThis.crypto.getRandomValues(new Uint8Array(32)),
    sha256: bytes => globalThis.crypto.subtle.digest("SHA-256", bytes),
  }));
}
