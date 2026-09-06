import {
  PLATFORM_SNAPSHOT_VERSION,
  validatePlatformSnapshotV2,
  validateStateSnapshot,
  type PlatformSnapshotV2,
  type StateSnapshot,
} from "@hangul-rummikub/shared";

import { adaptPlatformSnapshotV2ToLegacyHangulV1 } from "./platform-snapshot-v2-hangul-adapter.js";

export const WEB_SUPPORTED_SNAPSHOT_VERSIONS = Object.freeze([2, 1] as const);

export type CompatibleWebSnapshot =
  | Readonly<{
      kind: "LEGACY_HANGUL_V1";
      legacySnapshot: StateSnapshot;
    }>
  | Readonly<{
      kind: "PLATFORM_V2_HANGUL_TILE";
      snapshotVersion: typeof PLATFORM_SNAPSHOT_VERSION;
      gameType: "HANGUL_TILE";
      platformSnapshot: PlatformSnapshotV2;
      legacySnapshot: StateSnapshot;
    }>;

export type WebSnapshotIncompatibilityReason =
  | "UNSUPPORTED_SNAPSHOT_VERSION"
  | "UNSUPPORTED_GAME_TYPE"
  | "INVALID_V2_PROJECTION";

export type WebSnapshotDecodeResult =
  | Readonly<{ kind: "COMPATIBLE"; value: CompatibleWebSnapshot }>
  | Readonly<{
      kind: "INCOMPATIBLE";
      reason: WebSnapshotIncompatibilityReason;
    }>
  | Readonly<{ kind: "INVALID_LEGACY_V1" }>;

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

function hasOwn(input: Record<string, unknown>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(input, key);
}

function looksLikeVersionedSnapshot(input: Record<string, unknown>): boolean {
  if (hasOwn(input, "snapshotVersion")) {
    return true;
  }

  return isRecord(input.room) && hasOwn(input.room, "gameType");
}

function decodePlatformSnapshotV2(
  input: Record<string, unknown>,
): WebSnapshotDecodeResult {
  if (input.snapshotVersion !== PLATFORM_SNAPSHOT_VERSION) {
    return typeof input.snapshotVersion === "number" &&
        Number.isInteger(input.snapshotVersion)
      ? { kind: "INCOMPATIBLE", reason: "UNSUPPORTED_SNAPSHOT_VERSION" }
      : { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
  }

  if (!isRecord(input.room)) {
    return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
  }

  if (input.room.gameType !== "HANGUL_TILE") {
    return typeof input.room.gameType === "string"
      ? { kind: "INCOMPATIBLE", reason: "UNSUPPORTED_GAME_TYPE" }
      : { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
  }

  const validation = validatePlatformSnapshotV2(input);
  if (!validation.ok) {
    return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
  }

  let legacySnapshot: StateSnapshot;
  try {
    legacySnapshot = adaptPlatformSnapshotV2ToLegacyHangulV1(
      validation.value,
    );
  } catch {
    return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
  }

  return {
    kind: "COMPATIBLE",
    value: {
      kind: "PLATFORM_V2_HANGUL_TILE",
      snapshotVersion: PLATFORM_SNAPSHOT_VERSION,
      gameType: "HANGUL_TILE",
      platformSnapshot: validation.value,
      legacySnapshot,
    },
  };
}

/**
 * Decodes a raw snapshot before renderer selection. Version and canonical
 * gameType are classified before strict V2 parsing so unsupported future data
 * cannot silently enter the legacy Hangul path.
 */
export function decodeWebSnapshot(input: unknown): WebSnapshotDecodeResult {
  if (isRecord(input) && looksLikeVersionedSnapshot(input)) {
    return decodePlatformSnapshotV2(input);
  }

  const validation = validateStateSnapshot(input);
  return validation.ok
    ? {
        kind: "COMPATIBLE",
        value: {
          kind: "LEGACY_HANGUL_V1",
          legacySnapshot: validation.value,
        },
      }
    : { kind: "INVALID_LEGACY_V1" };
}
