import type { LegacyHangulRoomView } from "./legacy-hangul-room-view.js";
import { resolveLegacyHangulRoomView } from "./legacy-hangul-room-view.js";
import type {
  NumberTileFinishedPlatformSnapshotV2,
  NumberTilePlayingPlatformSnapshotV2,
} from "@hangul-rummikub/shared";

import type { CompatibleWebSnapshot } from "./snapshot-wire-decoder.js";

function isNumberTilePlayingSnapshot(
  snapshot: Extract<
    CompatibleWebSnapshot,
    { kind: "PLATFORM_V2_NUMBER_TILE" }
  >["platformSnapshot"],
): snapshot is NumberTilePlayingPlatformSnapshotV2 {
  return (
    snapshot.room.phase === "PLAYING" &&
    snapshot.game !== null &&
    snapshot.game.gameType === "NUMBER_TILE" &&
    "turn" in snapshot.game
  );
}

function isNumberTileFinishedSnapshot(
  snapshot: Extract<
    CompatibleWebSnapshot,
    { kind: "PLATFORM_V2_NUMBER_TILE" }
  >["platformSnapshot"],
): snapshot is NumberTileFinishedPlatformSnapshotV2 {
  return (
    snapshot.room.phase === "FINISHED" &&
    snapshot.game !== null &&
    snapshot.game.gameType === "NUMBER_TILE" &&
    "result" in snapshot.game
  );
}

export type RoomSnapshotView =
  | LegacyHangulRoomView
  | Readonly<{
      kind: "NUMBER_TILE_PLAYING";
      snapshot: NumberTilePlayingPlatformSnapshotV2;
    }>
  | Readonly<{
      kind: "NUMBER_TILE_FINISHED";
      snapshot: NumberTileFinishedPlatformSnapshotV2;
    }>
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

  if (decoded.kind === "PLATFORM_V2_NUMBER_TILE") {
    const snapshot = decoded.platformSnapshot;
    if (
      snapshot.room.gameType !== "NUMBER_TILE" ||
      (snapshot.game !== null && snapshot.game.gameType !== "NUMBER_TILE")
    ) {
      return { kind: "INCOMPATIBLE", reason: "UNSUPPORTED_GAME_TYPE" };
    }

    switch (snapshot.room.phase) {
      case "LOBBY":
        return snapshot.game === null
          ? { kind: "LOBBY" }
          : { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
      case "PLAYING":
        return isNumberTilePlayingSnapshot(snapshot)
          ? { kind: "NUMBER_TILE_PLAYING", snapshot }
          : { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
      case "FINISHED":
        return isNumberTileFinishedSnapshot(snapshot)
          ? { kind: "NUMBER_TILE_FINISHED", snapshot }
          : { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    }
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
