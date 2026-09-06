import {
  GameTypeSchema,
  LobbyPlatformSnapshotV2Schema,
  PlayingPlatformSnapshotV2Schema,
  FinishedPlatformSnapshotV2Schema,
  type FinishedStateSnapshot,
  type LobbyStateSnapshot,
  type PlayingStateSnapshot,
  type PlayingOrFinishedSnapshotWirePayload,
  type SnapshotWireVersion,
  type StateSnapshot,
  type StateSnapshotWirePayload,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import { mapLegacyStateSnapshotV1ToPlatformSnapshotV2 } from "../application/platform-snapshot-v2-mapper.js";

type SnapshotSelectionInput<TSnapshot extends StateSnapshot> = Readonly<{
  selectedVersion: SnapshotWireVersion;
  canonicalGameType: unknown;
  legacySnapshot: TSnapshot;
}>;

export function selectSnapshotWirePayload(
  input: SnapshotSelectionInput<LobbyStateSnapshot>,
): LobbyStateSnapshot | import("@hangul-rummikub/shared").LobbyPlatformSnapshotV2;
export function selectSnapshotWirePayload(
  input: SnapshotSelectionInput<PlayingStateSnapshot>,
): PlayingStateSnapshot | import("@hangul-rummikub/shared").PlayingPlatformSnapshotV2;
export function selectSnapshotWirePayload(
  input: SnapshotSelectionInput<FinishedStateSnapshot>,
): FinishedStateSnapshot | import("@hangul-rummikub/shared").FinishedPlatformSnapshotV2;
export function selectSnapshotWirePayload(
  input: SnapshotSelectionInput<PlayingStateSnapshot | FinishedStateSnapshot>,
): PlayingOrFinishedSnapshotWirePayload;
export function selectSnapshotWirePayload(
  input: SnapshotSelectionInput<StateSnapshot>,
): StateSnapshotWirePayload;
export function selectSnapshotWirePayload(
  input: SnapshotSelectionInput<StateSnapshot>,
): StateSnapshotWirePayload {
  const gameType = v.parse(GameTypeSchema, input.canonicalGameType);
  if (gameType !== "HANGUL_TILE") {
    throw new Error("Legacy Hangul snapshot delivery requires HANGUL_TILE.");
  }

  if (input.selectedVersion === 1) {
    return input.legacySnapshot;
  }

  const mapped = mapLegacyStateSnapshotV1ToPlatformSnapshotV2({
    canonicalGameType: gameType,
    snapshot: input.legacySnapshot,
  });
  switch (input.legacySnapshot.room.phase) {
    case "LOBBY":
      return v.parse(LobbyPlatformSnapshotV2Schema, mapped);
    case "PLAYING":
      return v.parse(PlayingPlatformSnapshotV2Schema, mapped);
    case "FINISHED":
      return v.parse(FinishedPlatformSnapshotV2Schema, mapped);
  }
}
