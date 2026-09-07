import type {
  GameType,
  SnapshotWireVersion,
} from "@hangul-rummikub/shared";

/**
 * Per-connection representation capabilities used only at Room admission.
 * They are deliberately not persisted as Room, Player, or Session authority.
 */
export type RoomAdmissionCapabilities = Readonly<{
  selectedSnapshotVersion: SnapshotWireVersion;
  supportedGameTypes: readonly GameType[];
}>;

/** Missing supportedGameTypes is the pre-P7B Hangul-only compatibility mode. */
export const LEGACY_ROOM_ADMISSION_CAPABILITIES: RoomAdmissionCapabilities =
  Object.freeze({
    selectedSnapshotVersion: 1 as const,
    supportedGameTypes: Object.freeze(["HANGUL_TILE"] as const),
  });

export function isRoomAdmissionCompatible(
  gameType: GameType,
  capabilities: RoomAdmissionCapabilities,
): boolean {
  if (!capabilities.supportedGameTypes.includes(gameType)) {
    return false;
  }

  // Number and GEM have no Legacy StateSnapshot V1 representation.
  return gameType === "HANGUL_TILE" || capabilities.selectedSnapshotVersion === 2;
}
