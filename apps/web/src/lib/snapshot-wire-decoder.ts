import {
  PLATFORM_SNAPSHOT_VERSION,
  validatePlatformSnapshotV2,
  validateStateSnapshot,
  type CityRoleFinishedPlatformSnapshotV2,
  type CityRoleLobbyPlatformSnapshotV2,
  type CityRolePlayingPlatformSnapshotV2,
  type GemCardFinishedPlatformSnapshotV2,
  type GemCardLobbyPlatformSnapshotV2,
  type GemCardPlayingPlatformSnapshotV2,
  type NumberTileFinishedPlatformSnapshotV2,
  type NumberTileLobbyPlatformSnapshotV2,
  type NumberTilePlayingPlatformSnapshotV2,
  type PlatformSnapshotV2,
  type StateSnapshot,
} from "@hangul-rummikub/shared";

import { adaptPlatformSnapshotV2ToLegacyHangulV1 } from "./platform-snapshot-v2-hangul-adapter.js";

export const WEB_SUPPORTED_SNAPSHOT_VERSIONS = Object.freeze([2, 1] as const);
export const WEB_SUPPORTED_GAME_TYPES = Object.freeze([
  "HANGUL_TILE",
  "NUMBER_TILE",
  "GEM_CARD",
  "CITY_ROLE",
] as const);

export type CityRolePlatformSnapshotV2 =
  | CityRoleLobbyPlatformSnapshotV2
  | CityRolePlayingPlatformSnapshotV2
  | CityRoleFinishedPlatformSnapshotV2;

export type GemCardPlatformSnapshotV2 =
  | GemCardLobbyPlatformSnapshotV2
  | GemCardPlayingPlatformSnapshotV2
  | GemCardFinishedPlatformSnapshotV2;

export type NumberTilePlatformSnapshotV2 =
  | NumberTileLobbyPlatformSnapshotV2
  | NumberTilePlayingPlatformSnapshotV2
  | NumberTileFinishedPlatformSnapshotV2;

export type CompatibleWebSnapshot =
  | Readonly<{
      kind: "PLATFORM_V2_CITY_ROLE";
      snapshotVersion: typeof PLATFORM_SNAPSHOT_VERSION;
      gameType: "CITY_ROLE";
      platformSnapshot: CityRolePlatformSnapshotV2;
    }>
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
    }>
  | Readonly<{
      kind: "PLATFORM_V2_NUMBER_TILE";
      snapshotVersion: typeof PLATFORM_SNAPSHOT_VERSION;
      gameType: "NUMBER_TILE";
      platformSnapshot: NumberTilePlatformSnapshotV2;
    }>
  | Readonly<{
      kind: "PLATFORM_V2_GEM_CARD";
      snapshotVersion: typeof PLATFORM_SNAPSHOT_VERSION;
      gameType: "GEM_CARD";
      platformSnapshot: GemCardPlatformSnapshotV2;
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

function isNumberTilePlatformSnapshot(
  snapshot: PlatformSnapshotV2,
): snapshot is NumberTilePlatformSnapshotV2 {
  return (
    snapshot.room.gameType === "NUMBER_TILE" &&
    (snapshot.game === null || snapshot.game.gameType === "NUMBER_TILE")
  );
}

function isGemCardPlatformSnapshot(
  snapshot: PlatformSnapshotV2,
): snapshot is GemCardPlatformSnapshotV2 {
  return snapshot.room.gameType === "GEM_CARD" &&
    (snapshot.game === null || snapshot.game.gameType === "GEM_CARD");
}

function isCityRolePlatformSnapshot(
  snapshot: PlatformSnapshotV2,
): snapshot is CityRolePlatformSnapshotV2 {
  return snapshot.room.gameType === "CITY_ROLE" &&
    (snapshot.game === null || snapshot.game.gameType === "CITY_ROLE");
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

  if (
    input.room.gameType !== "HANGUL_TILE" &&
    input.room.gameType !== "NUMBER_TILE" &&
    input.room.gameType !== "GEM_CARD" &&
    input.room.gameType !== "CITY_ROLE"
  ) {
    return typeof input.room.gameType === "string"
      ? { kind: "INCOMPATIBLE", reason: "UNSUPPORTED_GAME_TYPE" }
      : { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
  }

  const validation = validatePlatformSnapshotV2(input);
  if (!validation.ok) {
    return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
  }
  if (input.room.gameType === "CITY_ROLE") {
    if (!isCityRolePlatformSnapshot(validation.value)) {
      return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    }
    return {
      kind: "COMPATIBLE",
      value: {
        kind: "PLATFORM_V2_CITY_ROLE",
        snapshotVersion: PLATFORM_SNAPSHOT_VERSION,
        gameType: "CITY_ROLE",
        platformSnapshot: validation.value,
      },
    };
  }
  if (input.room.gameType === "GEM_CARD") {
    if (!isGemCardPlatformSnapshot(validation.value)) {
      return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    }
    return {
      kind: "COMPATIBLE",
      value: {
        kind: "PLATFORM_V2_GEM_CARD",
        snapshotVersion: PLATFORM_SNAPSHOT_VERSION,
        gameType: "GEM_CARD",
        platformSnapshot: validation.value,
      },
    };
  }
  if (input.room.gameType === "NUMBER_TILE") {
    if (!isNumberTilePlatformSnapshot(validation.value)) {
      return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    }

    return {
      kind: "COMPATIBLE",
      value: {
        kind: "PLATFORM_V2_NUMBER_TILE",
        snapshotVersion: PLATFORM_SNAPSHOT_VERSION,
        gameType: "NUMBER_TILE",
        platformSnapshot: validation.value,
      },
    };
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
