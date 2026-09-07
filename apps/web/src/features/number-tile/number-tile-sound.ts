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
  const audioWindow = window as typeof window & {
    webkitAudioContext?: AudioContextConstructor;
  };
  return window.AudioContext ?? audioWindow.webkitAudioContext ?? null;
}

const CUE_FREQUENCIES: Readonly<Record<NumberTileSoundCue, readonly [number, number]>> = {
  TURN_START: [659, 880],
  SUBMIT_SUCCESS: [523, 784],
  DRAW_SUCCESS: [440, 587],
  PASS_SUCCESS: [392, 440],
};

/** Plays a tiny synthesized cue. Autoplay or device failures are deliberately ignored. */
export function playNumberTileSound(cue: NumberTileSoundCue): void {
  const Constructor = audioContextConstructor();
  if (Constructor === null) {
    return;
  }

  let context: AudioContext;
  try {
    context = new Constructor();
  } catch {
    return;
  }

  const play = async (): Promise<void> => {
    if (context.state === "suspended") {
      await context.resume();
    }
    const [startFrequency, endFrequency] = CUE_FREQUENCIES[cue];
    const startedAt = context.currentTime;
    const duration = cue === "TURN_START" ? 0.22 : 0.14;
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(startFrequency, startedAt);
    oscillator.frequency.exponentialRampToValueAtTime(
      endFrequency,
      startedAt + duration,
    );
    gain.gain.setValueAtTime(0.0001, startedAt);
    gain.gain.exponentialRampToValueAtTime(0.09, startedAt + 0.025);
    gain.gain.exponentialRampToValueAtTime(0.0001, startedAt + duration);
    oscillator.connect(gain);
    gain.connect(context.destination);
    oscillator.addEventListener("ended", () => {
      void context.close().catch(() => undefined);
    }, { once: true });
    oscillator.start(startedAt);
    oscillator.stop(startedAt + duration);
  };

  void play().catch(() => {
    void context.close().catch(() => undefined);
  });
}
