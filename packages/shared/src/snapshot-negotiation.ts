import * as v from "valibot";

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
