import type { SpaceCrewProjection } from "@hangul-rummikub/shared";

export type SpaceCrewSound = "SELECT" | "CARD" | "TRICK" | "COMMUNICATION" | "SIGNAL" | "DEAL" | "SUCCESS" | "FAILURE";
export type SpaceCrewAudioSettings = { muted: boolean; volume: number };
const SETTINGS_KEY = "space-crew:audio:v1";

export function readSpaceCrewAudioSettings(): SpaceCrewAudioSettings {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(SETTINGS_KEY) ?? "null");
    if (value && typeof value === "object" && "muted" in value && typeof value.muted === "boolean"
      && "volume" in value && typeof value.volume === "number" && Number.isFinite(value.volume) && value.volume >= 0 && value.volume <= 1) {
      return { muted: value.muted, volume: value.volume };
    }
  } catch { /* Sound preferences cannot prevent a game from loading. */ }
  return { muted: false, volume: 0.25 };
}
export function saveSpaceCrewAudioSettings(settings: SpaceCrewAudioSettings): void {
  try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings)); }
  catch { /* The current session still uses the chosen volume. */ }
}

/** Only adjacent live snapshots produce effects; loading/reconnecting never replays old events. */
export function spaceCrewTransitionSound(before: SpaceCrewProjection | null, after: SpaceCrewProjection | null): SpaceCrewSound | null {
  if (!before || !after || before.gameId !== after.gameId || after.gameRevision !== before.gameRevision + 1) return null;
  if (before.attemptId !== after.attemptId) return "DEAL";
  if (before.phase !== "FINISHED" && after.phase === "FINISHED") return after.result.outcome === "SUCCESS" ? "SUCCESS" : "FAILURE";
  if (after.completedTrickCount > before.completedTrickCount) return "TRICK";
  if (after.communications.some(entry => entry.used && !before.communications.find(old => old.playerId === entry.playerId)?.used)) return "COMMUNICATION";
  if (after.distress.phase === "EXCHANGED" && before.distress.phase !== "EXCHANGED") return "SIGNAL";
  if (after.currentTrick.length > before.currentTrick.length) return "CARD";
  return "SELECT";
}

/** Original short synthesized sounds, unlocked solely by a user gesture. No audio asset or network dependency. */
export class SpaceCrewAudio {
  private context: AudioContext | null = null;
  private settings: SpaceCrewAudioSettings;
  constructor(settings: SpaceCrewAudioSettings) { this.settings = settings; }
  configure(settings: SpaceCrewAudioSettings): void { this.settings = settings; }
  async unlock(): Promise<void> {
    try {
      if (!this.context && typeof AudioContext !== "undefined") this.context = new AudioContext();
      if (this.context?.state === "suspended") await this.context.resume();
    } catch { /* Unsupported or denied audio never affects commands. */ }
  }
  play(cue: SpaceCrewSound): void {
    const context = this.context;
    if (!context || context.state !== "running" || this.settings.muted || this.settings.volume <= 0) return;
    const notes: Record<SpaceCrewSound, readonly number[]> = {
      SELECT: [420], CARD: [180, 260], TRICK: [440, 660], COMMUNICATION: [880, 660, 880],
      SIGNAL: [440, 550, 660], DEAL: [220, 330, 440], SUCCESS: [440, 554, 659, 880], FAILURE: [330, 277, 220],
    };
    try {
      notes[cue].forEach((frequency, index) => {
        const oscillator = context.createOscillator(), envelope = context.createGain();
        const start = context.currentTime + index * 0.075;
        oscillator.type = cue === "CARD" ? "triangle" : "sine";
        oscillator.frequency.setValueAtTime(frequency, start);
        envelope.gain.setValueAtTime(0, start);
        envelope.gain.linearRampToValueAtTime(this.settings.volume * 0.14, start + 0.009);
        envelope.gain.exponentialRampToValueAtTime(0.001, start + 0.14);
        oscillator.connect(envelope); envelope.connect(context.destination);
        oscillator.start(start); oscillator.stop(start + 0.16);
        oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      });
    } catch { /* Audio loss must not suppress visual feedback or game actions. */ }
  }
  dispose(): void { const context = this.context; this.context = null; if (context) void context.close().catch(() => undefined); }
}
