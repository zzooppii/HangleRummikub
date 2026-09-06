import type { LegacyHangulRoomView } from "./legacy-hangul-room-view.js";
import { resolveLegacyHangulRoomView } from "./legacy-hangul-room-view.js";
import type { CompatibleWebSnapshot } from "./snapshot-wire-decoder.js";

export type RoomSnapshotView =
  | LegacyHangulRoomView
  | Readonly<{
      kind: "INCOMPATIBLE";
      reason: "UNSUPPORTED_GAME_TYPE" | "INVALID_V2_PROJECTION";
    }>;

/**
 * Keeps the characterized V1 renderer decision intact. V2 must first carry the
 * canonical HANGUL_TILE discriminator and then agree with the adapted phase;
 * it never inherits the legacy malformed-projection Lobby fallback.
 */
export function resolveRoomSnapshotView(
  decoded: CompatibleWebSnapshot,
): RoomSnapshotView {
  if (decoded.kind === "LEGACY_HANGUL_V1") {
    return resolveLegacyHangulRoomView(decoded.legacySnapshot);
  }

  if (
    decoded.gameType !== "HANGUL_TILE" ||
    decoded.platformSnapshot.room.gameType !== "HANGUL_TILE"
  ) {
    return { kind: "INCOMPATIBLE", reason: "UNSUPPORTED_GAME_TYPE" };
  }

  if (
    decoded.legacySnapshot.room.phase !==
    decoded.platformSnapshot.room.phase
  ) {
    return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
  }

  const legacyView = resolveLegacyHangulRoomView(decoded.legacySnapshot);
  if (legacyView.kind !== decoded.platformSnapshot.room.phase) {
    return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
  }

  return legacyView;
}
