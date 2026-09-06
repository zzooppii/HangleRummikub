import * as v from "valibot";

import {
  GameTypeSchema,
  SUPPORTED_GAME_TYPES,
  type GameType,
} from "./game-type.js";

/** Server preference order for the currently supported snapshot wire formats. */
export const SERVER_SUPPORTED_SNAPSHOT_VERSIONS = [2, 1] as const;
export type SnapshotWireVersion =
  (typeof SERVER_SUPPORTED_SNAPSHOT_VERSIONS)[number];

export const SnapshotWireVersionSchema = v.picklist(
  SERVER_SUPPORTED_SNAPSHOT_VERSIONS,
);

/**
 * A client may advertise future positive versions. The server selects only
 * from its own supported list and therefore never trusts this as authority.
 */
export const AdvertisedSnapshotVersionSchema = v.pipe(
  v.number(),
  v.integer("Snapshot capability versions must be integers."),
  v.safeInteger("Snapshot capability versions must be safe integers."),
  v.minValue(1, "Snapshot capability versions must be positive."),
);

export const SupportedSnapshotVersionsSchema = v.pipe(
  v.array(AdvertisedSnapshotVersionSchema),
  v.minLength(1, "At least one snapshot version must be advertised."),
  v.maxLength(8, "Too many snapshot versions were advertised."),
  v.check(
    (versions) => new Set(versions).size === versions.length,
    "Snapshot capability versions must not contain duplicates.",
  ),
);
export type SupportedSnapshotVersions = v.InferOutput<
  typeof SupportedSnapshotVersionsSchema
>;

export const SnapshotCapabilityMetadataSchema = v.strictObject({
  supportedSnapshotVersions: SupportedSnapshotVersionsSchema,
});
export type SnapshotCapabilityMetadata = v.InferOutput<
  typeof SnapshotCapabilityMetadataSchema
>;

/** Missing game capability metadata is the deliberate Hangul-only legacy mode. */
export const LEGACY_DEFAULT_SUPPORTED_GAME_TYPES = Object.freeze([
  "HANGUL_TILE",
] as const satisfies readonly GameType[]);

export const SupportedGameTypesSchema = v.pipe(
  v.array(GameTypeSchema),
  v.minLength(1, "At least one game type must be advertised."),
  v.maxLength(
    SUPPORTED_GAME_TYPES.length,
    "Too many game types were advertised.",
  ),
  v.check(
    (gameTypes) => new Set(gameTypes).size === gameTypes.length,
    "Game type capabilities must not contain duplicates.",
  ),
);
export type SupportedGameTypes = v.InferOutput<
  typeof SupportedGameTypesSchema
>;

export const GameCapabilityMetadataSchema = v.strictObject({
  supportedGameTypes: SupportedGameTypesSchema,
});
export type GameCapabilityMetadata = v.InferOutput<
  typeof GameCapabilityMetadataSchema
>;

export type SupportedGameTypesCapabilityResolution =
  | Readonly<{
      ok: true;
      mode: "LEGACY_DEFAULT" | "EXPLICIT";
      supportedGameTypes: readonly GameType[];
    }>
  | Readonly<{ ok: false }>;

function isRecord(input: unknown): input is Record<string, unknown> {
  return typeof input === "object" && input !== null && !Array.isArray(input);
}

/**
 * Parses only connection representation metadata. It grants no Room, session,
 * Host, or command authority and never changes the canonical Room game type.
 */
export function resolveSupportedGameTypesCapability(
  handshakeAuth: unknown,
): SupportedGameTypesCapabilityResolution {
  if (!isRecord(handshakeAuth)) {
    return Object.freeze({ ok: false });
  }

  if (
    !Object.prototype.hasOwnProperty.call(handshakeAuth, "supportedGameTypes")
  ) {
    return Object.freeze({
      ok: true,
      mode: "LEGACY_DEFAULT",
      supportedGameTypes: LEGACY_DEFAULT_SUPPORTED_GAME_TYPES,
    });
  }

  const parsed = v.safeParse(
    SupportedGameTypesSchema,
    handshakeAuth.supportedGameTypes,
  );
  if (!parsed.success) {
    return Object.freeze({ ok: false });
  }

  return Object.freeze({
    ok: true,
    mode: "EXPLICIT",
    supportedGameTypes: Object.freeze([...parsed.output]),
  });
}
