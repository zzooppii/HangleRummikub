import type { IslandWebSnapshot } from "./snapshot-wire-decoder.js";
import type { SplendorWebSnapshot } from "./snapshot-wire-decoder.js";
import type { JaipurWebSnapshot } from "./snapshot-wire-decoder.js";
import type { GuryongtuWebSnapshot } from "./snapshot-wire-decoder.js";
import type { AzulWebSnapshot } from "./snapshot-wire-decoder.js";
import type { ClueWebSnapshot } from "./snapshot-wire-decoder.js";
import type { DuetWebSnapshot } from "./snapshot-wire-decoder.js";
import type { SaboteurWebSnapshot } from "./snapshot-wire-decoder.js";
import type { LostCitiesWebSnapshot } from "./snapshot-wire-decoder.js";
import type { HalliWebSnapshot } from "./snapshot-wire-decoder.js";
import type { WolfWebSnapshot } from "./snapshot-wire-decoder.js";
import type { LiarWebSnapshot } from "./snapshot-wire-decoder.js";
import type { SpyfallWebSnapshot } from "./snapshot-wire-decoder.js";
import type { DrawRelayWebSnapshot, SneakyWebSnapshot } from "./snapshot-wire-decoder.js";
import type { LegacyHangulRoomView } from "./legacy-hangul-room-view.js";
import { resolveLegacyHangulRoomView } from "./legacy-hangul-room-view.js";
import type {
  CityRoleFinishedPlatformSnapshotV2,
  CityRolePlayingPlatformSnapshotV2,
  GemCardFinishedPlatformSnapshotV2,
  GemCardPlayingPlatformSnapshotV2,
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
  | Readonly<{ kind: "ISLAND_SETTLERS"; snapshot: IslandWebSnapshot }>
  | Readonly<{ kind: "SPLENDOR"; snapshot: SplendorWebSnapshot }>
  | Readonly<{ kind: "JAIPUR"; snapshot: JaipurWebSnapshot }>
  | Readonly<{ kind: "GURYONGTU"; snapshot: GuryongtuWebSnapshot }>
  | Readonly<{ kind: "AZUL"; snapshot: AzulWebSnapshot }>
  | Readonly<{ kind: "CLUE"; snapshot: ClueWebSnapshot }>
  | Readonly<{ kind: "WORD_DUET"; snapshot: DuetWebSnapshot }>
  | Readonly<{ kind: "SABOTEUR"; snapshot: SaboteurWebSnapshot }>
  | Readonly<{ kind: "LOST_CITIES"; snapshot: LostCitiesWebSnapshot }>
  | Readonly<{ kind: "HALLI_GALLI"; snapshot: HalliWebSnapshot }>
  | Readonly<{ kind: "WOLF_NIGHT"; snapshot: WolfWebSnapshot }>
  | Readonly<{ kind: "LIAR_GAME"; snapshot: LiarWebSnapshot }>
  | Readonly<{ kind: "SPYFALL"; snapshot: SpyfallWebSnapshot }>
  | Readonly<{ kind: "SNEAKY_LUNCH"; snapshot: SneakyWebSnapshot }>
  | Readonly<{ kind: "DRAW_RELAY"; snapshot: DrawRelayWebSnapshot }>
  | LegacyHangulRoomView
  | Readonly<{
      kind: "CITY_ROLE_PLAYING";
      snapshot: CityRolePlayingPlatformSnapshotV2;
    }>
  | Readonly<{
      kind: "CITY_ROLE_FINISHED";
      snapshot: CityRoleFinishedPlatformSnapshotV2;
    }>
  | Readonly<{
      kind: "GEM_CARD_PLAYING";
      snapshot: GemCardPlayingPlatformSnapshotV2;
    }>
  | Readonly<{
      kind: "GEM_CARD_FINISHED";
      snapshot: GemCardFinishedPlatformSnapshotV2;
    }>
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
  if (decoded.kind === "PLATFORM_V2_DRAW_RELAY") return { kind: "DRAW_RELAY", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_ISLAND_SETTLERS") return { kind: "ISLAND_SETTLERS", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_SPLENDOR") return { kind: "SPLENDOR", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_JAIPUR") return { kind: "JAIPUR", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_GURYONGTU") return { kind: "GURYONGTU", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_AZUL") return { kind: "AZUL", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_CLUE") return { kind: "CLUE", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_WORD_DUET") return { kind: "WORD_DUET", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_SABOTEUR") return { kind: "SABOTEUR", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_LOST_CITIES") return { kind: "LOST_CITIES", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_HALLI_GALLI") return { kind: "HALLI_GALLI", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_WOLF_NIGHT") return { kind: "WOLF_NIGHT", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_LIAR_GAME") return { kind: "LIAR_GAME", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_SPYFALL") return { kind: "SPYFALL", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "PLATFORM_V2_SNEAKY_LUNCH") return { kind: "SNEAKY_LUNCH", snapshot: decoded.platformSnapshot };
  if (decoded.kind === "LEGACY_HANGUL_V1") {
    return resolveLegacyHangulRoomView(decoded.legacySnapshot);
  }

  if (decoded.kind === "PLATFORM_V2_CITY_ROLE") {
    const snapshot = decoded.platformSnapshot;
    if (snapshot.room.gameType !== "CITY_ROLE" ||
      (snapshot.game !== null && snapshot.game.gameType !== "CITY_ROLE")) {
      return { kind: "INCOMPATIBLE", reason: "UNSUPPORTED_GAME_TYPE" };
    }
    if (snapshot.room.phase === "LOBBY" && snapshot.game === null) {
      return { kind: "LOBBY" };
    }
    if (isCityPlayingSnapshot(snapshot)) return { kind: "CITY_ROLE_PLAYING", snapshot };
    if (isCityFinishedSnapshot(snapshot)) return { kind: "CITY_ROLE_FINISHED", snapshot };
    return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
  }

  if (decoded.kind === "PLATFORM_V2_GEM_CARD") {
    const snapshot = decoded.platformSnapshot;
    if (snapshot.room.gameType !== "GEM_CARD" ||
      (snapshot.game !== null && snapshot.game.gameType !== "GEM_CARD")) {
      return { kind: "INCOMPATIBLE", reason: "UNSUPPORTED_GAME_TYPE" };
    }
    if (snapshot.room.phase === "LOBBY" && snapshot.game === null) {
      return { kind: "LOBBY" };
    }
    if (isGemPlayingSnapshot(snapshot)) {
      return { kind: "GEM_CARD_PLAYING", snapshot };
    }
    if (isGemFinishedSnapshot(snapshot)) {
      return { kind: "GEM_CARD_FINISHED", snapshot };
    }
    return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
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

function isGemPlayingSnapshot(
  snapshot: Extract<CompatibleWebSnapshot, { kind: "PLATFORM_V2_GEM_CARD" }>["platformSnapshot"],
): snapshot is GemCardPlayingPlatformSnapshotV2 {
  return snapshot.room.phase === "PLAYING" && snapshot.game !== null &&
    "turn" in snapshot.game;
}

function isCityPlayingSnapshot(
  snapshot: Extract<CompatibleWebSnapshot, { kind: "PLATFORM_V2_CITY_ROLE" }>["platformSnapshot"],
): snapshot is CityRolePlayingPlatformSnapshotV2 {
  return snapshot.room.phase === "PLAYING" && snapshot.game !== null &&
    (snapshot.game.phase === "ROLE_SELECTION" || snapshot.game.phase === "ROLE_ACTION");
}

function isCityFinishedSnapshot(
  snapshot: Extract<CompatibleWebSnapshot, { kind: "PLATFORM_V2_CITY_ROLE" }>["platformSnapshot"],
): snapshot is CityRoleFinishedPlatformSnapshotV2 {
  return snapshot.room.phase === "FINISHED" && snapshot.game !== null && snapshot.game.phase === "FINISHED";
}

function isGemFinishedSnapshot(
  snapshot: Extract<CompatibleWebSnapshot, { kind: "PLATFORM_V2_GEM_CARD" }>["platformSnapshot"],
): snapshot is GemCardFinishedPlatformSnapshotV2 {
  return snapshot.room.phase === "FINISHED" && snapshot.game !== null &&
    "result" in snapshot.game;
}
