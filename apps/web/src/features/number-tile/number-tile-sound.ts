import type { PlayerId, RequestId, RoomId, TurnId } from "@hangul-rummikub/shared";

export type NumberTileSoundCue =
  | "TURN_START"
  | "SUBMIT_SUCCESS"
  | "DRAW_SUCCESS"
  | "PASS_SUCCESS";

export type NumberTileActionFeedbackKind = "SUBMIT" | "DRAW" | "PASS";

export type NumberTileActionFeedback = Readonly<{
  kind: NumberTileActionFeedbackKind;
  requestId: RequestId;
  message: string;
}>;

export const NUMBER_TILE_SOUND_PREFERENCE_KEY =
  "hangul-rummikub:number-tile-sound-enabled";

export function numberTileTurnSoundStorageKey(
  roomId: RoomId,
  playerId: PlayerId,
): string {
  return `hangul-rummikub:number-tile-turn-sound:${roomId}:${playerId}`;
}

export function shouldAnnounceNumberTileTurn(
  lastAnnouncedTurnId: TurnId | null,
  currentTurnId: TurnId,
  activePlayerId: PlayerId,
  selfPlayerId: PlayerId,
): boolean {
  return activePlayerId === selfPlayerId && lastAnnouncedTurnId !== currentTurnId;
}

export function markNumberTileActionFeedback(
  seenRequestIds: Set<RequestId>,
  requestId: RequestId,
): boolean {
  if (seenRequestIds.has(requestId)) {
    return false;
  }
  seenRequestIds.add(requestId);
  return true;
}

export function numberTileActionSoundCue(
  kind: NumberTileActionFeedbackKind,
): NumberTileSoundCue {
  switch (kind) {
    case "SUBMIT": return "SUBMIT_SUCCESS";
    case "DRAW": return "DRAW_SUCCESS";
    case "PASS": return "PASS_SUCCESS";
  }
}

export function readNumberTileSoundEnabled(storage: Storage): boolean {
  try {
    return storage.getItem(NUMBER_TILE_SOUND_PREFERENCE_KEY) !== "false";
  } catch {
    return true;
  }
}

export function writeNumberTileSoundEnabled(
  storage: Storage,
  enabled: boolean,
): void {
  try {
    storage.setItem(NUMBER_TILE_SOUND_PREFERENCE_KEY, String(enabled));
  } catch {
    // Storage availability must never affect gameplay.
  }
}

export function readLastAnnouncedNumberTileTurn(
  storage: Storage,
  key: string,
): TurnId | null {
  try {
    return storage.getItem(key) as TurnId | null;
  } catch {
    return null;
  }
}

export function writeLastAnnouncedNumberTileTurn(
  storage: Storage,
  key: string,
  turnId: TurnId,
): void {
  try {
    storage.setItem(key, turnId);
  } catch {
    // A blocked sessionStorage only disables cross-refresh sound de-duplication.
  }
}

export function formatNumberTileCountdown(remainingSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(remainingSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

type AudioContextConstructor = new () => AudioContext;

function audioContextConstructor(): AudioContextConstructor | null {
  if (typeof window === "undefined") return null;
  const audioWindow = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

/** Original, Number-only note envelopes; gains do not change OS/device volume. */
export const NUMBER_TILE_AUDIO_CUES: Readonly<Record<NumberTileSoundCue, Readonly<{
  frequencies: readonly number[]; duration: number; gain: number;
}>>> = {
  TURN_START: { frequencies: [659, 880], duration: 0.42, gain: 0.24 },
  SUBMIT_SUCCESS: { frequencies: [523, 659, 1047], duration: 0.45, gain: 0.23 },
  DRAW_SUCCESS: { frequencies: [440, 587], duration: 0.18, gain: 0.095 },
  PASS_SUCCESS: { frequencies: [440, 392], duration: 0.14, gain: 0.055 },
};

// Reuse the context unlocked by a real gesture; an ack arrives after activation expires.
let numberAudioContext: AudioContext | null = null;
const cueEndsAt = new WeakMap<AudioContext, number>();

function numberAudio(): AudioContext | null {
  if (numberAudioContext !== null && numberAudioContext.state !== "closed") return numberAudioContext;
  const Constructor = audioContextConstructor();
  if (Constructor === null) return null;
  try {
    numberAudioContext = new Constructor();
    return numberAudioContext;
  } catch {
    return null;
  }
}

/** Pointer/keyboard gesture only. Never queues a missed cue for later playback. */
export function unlockNumberTileAudio(): void {
  try {
    const context = numberAudio();
    if (context !== null && context.state !== "running") void context.resume().catch(() => undefined);
  } catch { /* Unsupported/blocked audio never blocks an interaction. */ }
}

export function disposeNumberTileAudio(): void {
  const context = numberAudioContext;
  numberAudioContext = null;
  if (context === null) return;
  const close = () => {
    try { if (context.state !== "closed") void context.close().catch(() => undefined); }
    catch { /* Device teardown is best effort. */ }
  };
  // A rack-empty accepted Submit may unmount Playing immediately. Let its short
  // already-started cue finish; never schedule or replay a new sound on teardown.
  const remaining = (cueEndsAt.get(context) ?? 0) - context.currentTime;
  if (remaining > 0) setTimeout(close, Math.ceil(remaining * 1000) + 20);
  else close();
}

/** Caller owns accepted-command/turn deduplication. No delayed or autoplay replay. */
export function playNumberTileSound(cue: NumberTileSoundCue): void {
  const context = numberAudio();
  if (context === null || context.state !== "running") return;
  try {
    const { frequencies, duration, gain: peak } = NUMBER_TILE_AUDIO_CUES[cue];
    cueEndsAt.set(context, Math.max(cueEndsAt.get(context) ?? 0, context.currentTime + duration));
    const noteDuration = duration / frequencies.length;
    frequencies.forEach((frequency, index) => {
      const startedAt = context.currentTime + index * noteDuration;
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, startedAt);
      gain.gain.setValueAtTime(0.0001, startedAt);
      gain.gain.exponentialRampToValueAtTime(peak, startedAt + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + noteDuration);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.addEventListener("ended", () => { oscillator.disconnect(); gain.disconnect(); }, { once: true });
      oscillator.start(startedAt);
      oscillator.stop(startedAt + noteDuration);
    });
  } catch { /* A sound failure must not escape into command handling. */ }
}
