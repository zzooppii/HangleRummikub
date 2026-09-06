import {
  SERVER_SUPPORTED_SNAPSHOT_VERSIONS,
  SupportedSnapshotVersionsSchema,
  type SnapshotWireVersion,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

export const SNAPSHOT_NEGOTIATION_ERROR_MESSAGES = Object.freeze({
  MALFORMED_CAPABILITY: "INVALID_SNAPSHOT_CAPABILITY",
  NO_COMMON_VERSION: "INCOMPATIBLE_SNAPSHOT_VERSION",
});

export type SnapshotVersionNegotiationResult =
  | Readonly<{
      ok: true;
      selectedVersion: SnapshotWireVersion;
      mode: "LEGACY_DEFAULT" | "EXPLICIT";
    }>
  | Readonly<{
      ok: false;
      reason: keyof typeof SNAPSHOT_NEGOTIATION_ERROR_MESSAGES;
    }>;

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

/**
 * Missing capability metadata is the deliberate legacy V1 compatibility
 * mode. Explicit malformed/no-common advertisements fail closed.
 */
export function negotiateSnapshotVersion(
  handshakeAuth: unknown,
): SnapshotVersionNegotiationResult {
  if (!isRecord(handshakeAuth)) {
    return { ok: false, reason: "MALFORMED_CAPABILITY" };
  }

  if (
    !Object.prototype.hasOwnProperty.call(
      handshakeAuth,
      "supportedSnapshotVersions",
    )
  ) {
    return {
      ok: true,
      selectedVersion: 1,
      mode: "LEGACY_DEFAULT",
    };
  }

  const parsed = v.safeParse(
    SupportedSnapshotVersionsSchema,
    handshakeAuth.supportedSnapshotVersions,
  );
  if (!parsed.success) {
    return { ok: false, reason: "MALFORMED_CAPABILITY" };
  }

  const advertised = new Set(parsed.output);
  const selectedVersion = SERVER_SUPPORTED_SNAPSHOT_VERSIONS.find(
    (version) => advertised.has(version),
  );
  return selectedVersion === undefined
    ? { ok: false, reason: "NO_COMMON_VERSION" }
    : { ok: true, selectedVersion, mode: "EXPLICIT" };
}
