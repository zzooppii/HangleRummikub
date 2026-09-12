import type { IslandLobbyPlatformSnapshotV2, IslandPlayingPlatformSnapshotV2, IslandFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { SplendorLobbyPlatformSnapshotV2, SplendorPlayingPlatformSnapshotV2, SplendorFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { TrainLobbyPlatformSnapshotV2, TrainPlayingPlatformSnapshotV2, TrainFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { CenturyLobbyPlatformSnapshotV2, CenturyPlayingPlatformSnapshotV2, CenturyFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { JaipurLobbyPlatformSnapshotV2, JaipurPlayingPlatformSnapshotV2, JaipurFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { LoveLetterLobbyPlatformSnapshotV2, LoveLetterPlayingPlatformSnapshotV2, LoveLetterFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { GuryongtuLobbyPlatformSnapshotV2, GuryongtuPlayingPlatformSnapshotV2, GuryongtuFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { AzulLobbyPlatformSnapshotV2, AzulPlayingPlatformSnapshotV2, AzulFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { VegasLobbyPlatformSnapshotV2, VegasPlayingPlatformSnapshotV2, VegasFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { CarcassonneLobbyPlatformSnapshotV2, CarcassonnePlayingPlatformSnapshotV2, CarcassonneFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { ClueLobbyPlatformSnapshotV2, CluePlayingPlatformSnapshotV2, ClueFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { DuetLobbyPlatformSnapshotV2, DuetPlayingPlatformSnapshotV2, DuetFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { SaboteurLobbyPlatformSnapshotV2, SaboteurPlayingPlatformSnapshotV2, SaboteurFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { LostCitiesLobbyPlatformSnapshotV2, LostCitiesPlayingPlatformSnapshotV2, LostCitiesFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { HalliLobbyPlatformSnapshotV2, HalliPlayingPlatformSnapshotV2, HalliFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { WolfLobbyPlatformSnapshotV2, WolfPlayingPlatformSnapshotV2, WolfFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { LiarLobbyPlatformSnapshotV2, LiarPlayingPlatformSnapshotV2, LiarFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { SpyfallLobbyPlatformSnapshotV2, SpyfallPlayingPlatformSnapshotV2, SpyfallFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { DrawRelayLobbyPlatformSnapshotV2, DrawRelayPlayingPlatformSnapshotV2, DrawRelayFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import type { SneakyLobbyPlatformSnapshotV2, SneakyPlayingPlatformSnapshotV2, SneakyFinishedPlatformSnapshotV2 } from "@hangul-rummikub/shared";
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
  "DRAW_RELAY",
  "SNEAKY_LUNCH",
  "WOLF_NIGHT",
  "HALLI_GALLI",
  "ISLAND_SETTLERS",
  "SPLENDOR",
  "TRAIN",
  "CENTURY",
  "JAIPUR",
  "LOVE_LETTER",
  "GURYONGTU",
  "WORD_DUET",
  "LOST_CITIES",
  "SABOTEUR",
  "LIAR_GAME",
  "SPYFALL",
  "AZUL",
  "VEGAS",
  "CARCASSONNE",
  "CLUE",
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

export type DrawRelayWebSnapshot = DrawRelayLobbyPlatformSnapshotV2 | DrawRelayPlayingPlatformSnapshotV2 | DrawRelayFinishedPlatformSnapshotV2;
export type IslandWebSnapshot = IslandLobbyPlatformSnapshotV2 | IslandPlayingPlatformSnapshotV2 | IslandFinishedPlatformSnapshotV2;
export type SplendorWebSnapshot = SplendorLobbyPlatformSnapshotV2 | SplendorPlayingPlatformSnapshotV2 | SplendorFinishedPlatformSnapshotV2;
export type TrainWebSnapshot = TrainLobbyPlatformSnapshotV2 | TrainPlayingPlatformSnapshotV2 | TrainFinishedPlatformSnapshotV2;
export type CenturyWebSnapshot = CenturyLobbyPlatformSnapshotV2 | CenturyPlayingPlatformSnapshotV2 | CenturyFinishedPlatformSnapshotV2;
export type JaipurWebSnapshot = JaipurLobbyPlatformSnapshotV2 | JaipurPlayingPlatformSnapshotV2 | JaipurFinishedPlatformSnapshotV2;
export type LoveLetterWebSnapshot = LoveLetterLobbyPlatformSnapshotV2 | LoveLetterPlayingPlatformSnapshotV2 | LoveLetterFinishedPlatformSnapshotV2;
export type GuryongtuWebSnapshot = GuryongtuLobbyPlatformSnapshotV2 | GuryongtuPlayingPlatformSnapshotV2 | GuryongtuFinishedPlatformSnapshotV2;
export type AzulWebSnapshot = AzulLobbyPlatformSnapshotV2 | AzulPlayingPlatformSnapshotV2 | AzulFinishedPlatformSnapshotV2;
export type VegasWebSnapshot = VegasLobbyPlatformSnapshotV2 | VegasPlayingPlatformSnapshotV2 | VegasFinishedPlatformSnapshotV2;
export type CarcassonneWebSnapshot = CarcassonneLobbyPlatformSnapshotV2 | CarcassonnePlayingPlatformSnapshotV2 | CarcassonneFinishedPlatformSnapshotV2;
export type ClueWebSnapshot = ClueLobbyPlatformSnapshotV2 | CluePlayingPlatformSnapshotV2 | ClueFinishedPlatformSnapshotV2;
export type DuetWebSnapshot = DuetLobbyPlatformSnapshotV2 | DuetPlayingPlatformSnapshotV2 | DuetFinishedPlatformSnapshotV2;
export type SaboteurWebSnapshot = SaboteurLobbyPlatformSnapshotV2 | SaboteurPlayingPlatformSnapshotV2 | SaboteurFinishedPlatformSnapshotV2;
export type LostCitiesWebSnapshot = LostCitiesLobbyPlatformSnapshotV2 | LostCitiesPlayingPlatformSnapshotV2 | LostCitiesFinishedPlatformSnapshotV2;
export type HalliWebSnapshot = HalliLobbyPlatformSnapshotV2 | HalliPlayingPlatformSnapshotV2 | HalliFinishedPlatformSnapshotV2;
export type WolfWebSnapshot = WolfLobbyPlatformSnapshotV2 | WolfPlayingPlatformSnapshotV2 | WolfFinishedPlatformSnapshotV2;
export type LiarWebSnapshot = LiarLobbyPlatformSnapshotV2 | LiarPlayingPlatformSnapshotV2 | LiarFinishedPlatformSnapshotV2;
export type SpyfallWebSnapshot = SpyfallLobbyPlatformSnapshotV2 | SpyfallPlayingPlatformSnapshotV2 | SpyfallFinishedPlatformSnapshotV2;
export type SneakyWebSnapshot = SneakyLobbyPlatformSnapshotV2 | SneakyPlayingPlatformSnapshotV2 | SneakyFinishedPlatformSnapshotV2;
export type CompatibleWebSnapshot =
  | Readonly<{kind: "PLATFORM_V2_ISLAND_SETTLERS"; snapshotVersion: 2; gameType: "ISLAND_SETTLERS"; platformSnapshot: IslandWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_SPLENDOR"; snapshotVersion: 2; gameType: "SPLENDOR"; platformSnapshot: SplendorWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_TRAIN"; snapshotVersion: 2; gameType: "TRAIN"; platformSnapshot: TrainWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_CENTURY"; snapshotVersion: 2; gameType: "CENTURY"; platformSnapshot: CenturyWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_JAIPUR"; snapshotVersion: 2; gameType: "JAIPUR"; platformSnapshot: JaipurWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_LOVE_LETTER"; snapshotVersion: 2; gameType: "LOVE_LETTER"; platformSnapshot: LoveLetterWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_GURYONGTU"; snapshotVersion: 2; gameType: "GURYONGTU"; platformSnapshot: GuryongtuWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_AZUL"; snapshotVersion: 2; gameType: "AZUL"; platformSnapshot: AzulWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_VEGAS"; snapshotVersion: 2; gameType: "VEGAS"; platformSnapshot: VegasWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_CARCASSONNE"; snapshotVersion: 2; gameType: "CARCASSONNE"; platformSnapshot: CarcassonneWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_CLUE"; snapshotVersion: 2; gameType: "CLUE"; platformSnapshot: ClueWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_WORD_DUET"; snapshotVersion: 2; gameType: "WORD_DUET"; platformSnapshot: DuetWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_SABOTEUR"; snapshotVersion: 2; gameType: "SABOTEUR"; platformSnapshot: SaboteurWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_LOST_CITIES"; snapshotVersion: 2; gameType: "LOST_CITIES"; platformSnapshot: LostCitiesWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_HALLI_GALLI"; snapshotVersion: 2; gameType: "HALLI_GALLI"; platformSnapshot: HalliWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_WOLF_NIGHT"; snapshotVersion: 2; gameType: "WOLF_NIGHT"; platformSnapshot: WolfWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_LIAR_GAME"; snapshotVersion: 2; gameType: "LIAR_GAME"; platformSnapshot: LiarWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_SPYFALL"; snapshotVersion: 2; gameType: "SPYFALL"; platformSnapshot: SpyfallWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_SNEAKY_LUNCH"; snapshotVersion: 2; gameType: "SNEAKY_LUNCH"; platformSnapshot: SneakyWebSnapshot }>
  | Readonly<{kind: "PLATFORM_V2_DRAW_RELAY"; snapshotVersion: 2; gameType: "DRAW_RELAY"; platformSnapshot: DrawRelayWebSnapshot }>
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
    input.room.gameType !== "CITY_ROLE" && input.room.gameType !== "DRAW_RELAY" && input.room.gameType !== "SNEAKY_LUNCH" && input.room.gameType !== "WOLF_NIGHT" && input.room.gameType !== "LIAR_GAME" && input.room.gameType !== "SPYFALL" && input.room.gameType !== "WORD_DUET" && input.room.gameType !== "TRAIN" && input.room.gameType !== "CENTURY" && input.room.gameType !== "JAIPUR" && input.room.gameType !== "LOVE_LETTER" && input.room.gameType !== "GURYONGTU" && input.room.gameType !== "AZUL" && input.room.gameType !== "VEGAS" && input.room.gameType !== "CARCASSONNE" && input.room.gameType !== "CLUE" && input.room.gameType !== "SABOTEUR" && input.room.gameType !== "LOST_CITIES" && input.room.gameType !== "SPLENDOR" && input.room.gameType !== "HALLI_GALLI" && input.room.gameType !== "ISLAND_SETTLERS"
  ) {
    return typeof input.room.gameType === "string"
      ? { kind: "INCOMPATIBLE", reason: "UNSUPPORTED_GAME_TYPE" }
      : { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
  }

  const validation = validatePlatformSnapshotV2(input);
  if (!validation.ok) {
    return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
  }
  if (input.room.gameType === "DRAW_RELAY") {
    const snapshot = validation.value;
    if (!isDrawSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_DRAW_RELAY", snapshotVersion: 2, gameType: "DRAW_RELAY", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "ISLAND_SETTLERS") {
    const snapshot = validation.value;
    if (!isIslandSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_ISLAND_SETTLERS", snapshotVersion: 2, gameType: "ISLAND_SETTLERS", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "SPLENDOR") {
    const snapshot = validation.value;
    if (!isSplendorSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_SPLENDOR", snapshotVersion: 2, gameType: "SPLENDOR", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "TRAIN") {
    const snapshot = validation.value;
    if (!isTrainSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_TRAIN", snapshotVersion: 2, gameType: "TRAIN", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "CENTURY") {
    const snapshot = validation.value;
    if (!isCenturySnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_CENTURY", snapshotVersion: 2, gameType: "CENTURY", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "JAIPUR") {
    const snapshot = validation.value;
    if (!isJaipurSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_JAIPUR", snapshotVersion: 2, gameType: "JAIPUR", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "LOVE_LETTER") {
    const snapshot = validation.value;
    if (!isLoveLetterSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_LOVE_LETTER", snapshotVersion: 2, gameType: "LOVE_LETTER", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "GURYONGTU") {
    const snapshot = validation.value;
    if (!isGuryongtuSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_GURYONGTU", snapshotVersion: 2, gameType: "GURYONGTU", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "AZUL") {
    const snapshot = validation.value;
    if (!isAzulSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_AZUL", snapshotVersion: 2, gameType: "AZUL", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "VEGAS") {
    const snapshot = validation.value;
    if (!isVegasSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_VEGAS", snapshotVersion: 2, gameType: "VEGAS", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "CARCASSONNE") {
    const snapshot = validation.value;
    if (!isCarcassonneSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_CARCASSONNE", snapshotVersion: 2, gameType: "CARCASSONNE", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "CLUE") {
    const snapshot = validation.value;
    if (!isClueSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_CLUE", snapshotVersion: 2, gameType: "CLUE", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "WORD_DUET") {
    const snapshot = validation.value;
    if (!isDuetSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_WORD_DUET", snapshotVersion: 2, gameType: "WORD_DUET", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "SABOTEUR") {
    const snapshot = validation.value;
    if (!isSaboteurSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_SABOTEUR", snapshotVersion: 2, gameType: "SABOTEUR", platformSnapshot: snapshot } };
  }

  if (input.room.gameType === "LOST_CITIES") {
    const snapshot = validation.value;
    if (!isLostCitiesSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_LOST_CITIES", snapshotVersion: 2, gameType: "LOST_CITIES", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "HALLI_GALLI") {
    const snapshot = validation.value;
    if (!isHalliSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_HALLI_GALLI", snapshotVersion: 2, gameType: "HALLI_GALLI", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "WOLF_NIGHT") {
    const snapshot = validation.value;
    if (!isWolfSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_WOLF_NIGHT", snapshotVersion: 2, gameType: "WOLF_NIGHT", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "SPYFALL") {
    const snapshot = validation.value;
    if (!isSpyfallSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_SPYFALL", snapshotVersion: 2, gameType: "SPYFALL", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "LIAR_GAME") {
    const snapshot = validation.value;
    if (!isLiarSnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_LIAR_GAME", snapshotVersion: 2, gameType: "LIAR_GAME", platformSnapshot: snapshot } };
  }
  if (input.room.gameType === "SNEAKY_LUNCH") {
    const snapshot = validation.value;
    if (!isSneakySnapshot(snapshot)) return { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" };
    return { kind: "COMPATIBLE", value: { kind: "PLATFORM_V2_SNEAKY_LUNCH", snapshotVersion: 2, gameType: "SNEAKY_LUNCH", platformSnapshot: snapshot } };
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

function isDrawSnapshot(s: PlatformSnapshotV2): s is DrawRelayWebSnapshot { return s.room.gameType === "DRAW_RELAY" && (s.game === null || s.game.gameType === "DRAW_RELAY"); }
function isSneakySnapshot(s: PlatformSnapshotV2): s is SneakyWebSnapshot { return s.room.gameType === "SNEAKY_LUNCH" && (s.game === null || s.game.gameType === "SNEAKY_LUNCH"); }

function isIslandSnapshot(s: PlatformSnapshotV2): s is IslandWebSnapshot { return s.room.gameType === "ISLAND_SETTLERS" && (s.game === null || s.game.gameType === "ISLAND_SETTLERS"); }
function isSplendorSnapshot(s: PlatformSnapshotV2): s is SplendorWebSnapshot { return s.room.gameType === "SPLENDOR" && (s.game === null || s.game.gameType === "SPLENDOR"); }
function isTrainSnapshot(s: PlatformSnapshotV2): s is TrainWebSnapshot { return s.room.gameType === "TRAIN" && (s.game === null || s.game.gameType === "TRAIN"); }
function isCenturySnapshot(s: PlatformSnapshotV2): s is CenturyWebSnapshot { return s.room.gameType === "CENTURY" && (s.game === null || s.game.gameType === "CENTURY"); }
function isJaipurSnapshot(s: PlatformSnapshotV2): s is JaipurWebSnapshot { return s.room.gameType === "JAIPUR" && (s.game === null || s.game.gameType === "JAIPUR"); }
function isLoveLetterSnapshot(s: PlatformSnapshotV2): s is LoveLetterWebSnapshot { return s.room.gameType === "LOVE_LETTER" && (s.game === null || s.game.gameType === "LOVE_LETTER"); }
function isGuryongtuSnapshot(s: PlatformSnapshotV2): s is GuryongtuWebSnapshot { return s.room.gameType === "GURYONGTU" && (s.game === null || s.game.gameType === "GURYONGTU"); }
function isAzulSnapshot(s: PlatformSnapshotV2): s is AzulWebSnapshot { return s.room.gameType === "AZUL" && (s.game === null || s.game.gameType === "AZUL"); }
function isVegasSnapshot(s: PlatformSnapshotV2): s is VegasWebSnapshot { return s.room.gameType === "VEGAS" && (s.game === null || s.game.gameType === "VEGAS"); }
function isCarcassonneSnapshot(s: PlatformSnapshotV2): s is CarcassonneWebSnapshot { return s.room.gameType === "CARCASSONNE" && (s.game === null || s.game.gameType === "CARCASSONNE"); }
function isClueSnapshot(s: PlatformSnapshotV2): s is ClueWebSnapshot { return s.room.gameType === "CLUE" && (s.game === null || s.game.gameType === "CLUE"); }
function isDuetSnapshot(s: PlatformSnapshotV2): s is DuetWebSnapshot { return s.room.gameType === "WORD_DUET" && (s.game === null || s.game.gameType === "WORD_DUET"); }
function isSaboteurSnapshot(s: PlatformSnapshotV2): s is SaboteurWebSnapshot { return s.room.gameType === "SABOTEUR" && (s.game === null || s.game.gameType === "SABOTEUR"); }
function isLostCitiesSnapshot(s: PlatformSnapshotV2): s is LostCitiesWebSnapshot { return s.room.gameType === "LOST_CITIES" && (s.game === null || s.game.gameType === "LOST_CITIES"); }
function isHalliSnapshot(s: PlatformSnapshotV2): s is HalliWebSnapshot { return s.room.gameType === "HALLI_GALLI" && (s.game === null || s.game.gameType === "HALLI_GALLI"); }
function isWolfSnapshot(s: PlatformSnapshotV2): s is WolfWebSnapshot { return s.room.gameType === "WOLF_NIGHT" && (s.game === null || s.game.gameType === "WOLF_NIGHT"); }
function isLiarSnapshot(s: PlatformSnapshotV2): s is LiarWebSnapshot { return s.room.gameType === "LIAR_GAME" && (s.game === null || s.game.gameType === "LIAR_GAME"); }
function isSpyfallSnapshot(s: PlatformSnapshotV2): s is SpyfallWebSnapshot { return s.room.gameType === "SPYFALL" && (s.game === null || s.game.gameType === "SPYFALL"); }
