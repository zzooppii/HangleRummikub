import { createHash, timingSafeEqual } from "node:crypto";
import * as v from "valibot";
import { SpaceCrewRecoveryTokenSchema } from "@hangul-rummikub/shared";

function token(input: unknown): string {
  const parsed = v.safeParse(SpaceCrewRecoveryTokenSchema, input);
  if (!parsed.success) throw new Error("Invalid Space Crew recovery credential.");
  return parsed.output;
}

/** Deterministic creation key makes a lost CREATE acknowledgement retryable after restart. */
export function campaignIdForRecoveryToken(input: unknown): string {
  return `crew_${createHash("sha256").update("space-crew-campaign-id-v1\0").update(token(input)).digest("hex").slice(0, 40)}`;
}

export function hashSpaceCrewRecoveryToken(input: unknown): string {
  return createHash("sha256").update("space-crew-recovery-v1\0").update(token(input)).digest("hex");
}

export function verifySpaceCrewRecoveryToken(input: unknown, digestHex: string): boolean {
  if (!/^[a-f0-9]{64}$/.test(digestHex)) return false;
  try {
    return timingSafeEqual(Buffer.from(hashSpaceCrewRecoveryToken(input), "hex"), Buffer.from(digestHex, "hex"));
  } catch { return false; }
}
