import {
  validateFinishedStateSnapshot,
  validatePlayingStateSnapshot,
  type FinishedStateSnapshot,
  type PlayingStateSnapshot,
} from "@hangul-rummikub/shared";

export type LegacyHangulRoomView =
  | Readonly<{
      kind: "PLAYING";
      snapshot: PlayingStateSnapshot;
    }>
  | Readonly<{
      kind: "FINISHED";
      snapshot: FinishedStateSnapshot;
    }>
  | Readonly<{
      kind: "LOBBY";
    }>;

/**
 * Preserves the protocol-v1 renderer decision while it is still Hangul-shaped.
 * A snapshot that matches neither legacy game projection falls back to Lobby;
 * P5 will replace that behavior when authoritative game dispatch is available.
 */
export function resolveLegacyHangulRoomView(
  snapshot: unknown,
): LegacyHangulRoomView {
  const playingSnapshot = validatePlayingStateSnapshot(snapshot);
  if (playingSnapshot.ok) {
    return { kind: "PLAYING", snapshot: playingSnapshot.value };
  }

  const finishedSnapshot = validateFinishedStateSnapshot(snapshot);
  if (finishedSnapshot.ok) {
    return { kind: "FINISHED", snapshot: finishedSnapshot.value };
  }

  return { kind: "LOBBY" };
}
