export type RelayCue = "PENCIL" | "SUBMIT" | "PASS" | "WARNING" | "REVEAL" | "FLIP" | "FINISH";
export const RELAY_CUES: Record<RelayCue, readonly number[]> = { PENCIL: [260], SUBMIT: [660, 880], PASS: [440, 620], WARNING: [880, 660], REVEAL: [520, 780, 1040], FLIP: [240, 360], FINISH: [440, 550, 660, 880] };
export class RelayAudio {
  private context: AudioContext | null = null;
  enabled = false;
  unlock() {
    if (!this.enabled || typeof window === "undefined" || !window.AudioContext) return;
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => undefined); } catch { /* Optional device unavailable. */ }
  }
  play(cue: RelayCue) {
    const ctx = this.context; if (!this.enabled || ctx?.state !== "running") return;
    const notes = RELAY_CUES[cue];
    for (const [i, hz] of notes.entries()) {
      const oscillator = ctx.createOscillator(), gain = ctx.createGain(), time = ctx.currentTime + i * .09;
      oscillator.type = "triangle"; oscillator.frequency.value = hz;
      gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(cue === "PENCIL" ? .008 : .035, time + .01);
      gain.gain.exponentialRampToValueAtTime(.0001, time + .12);
      oscillator.connect(gain); gain.connect(ctx.destination); oscillator.start(time); oscillator.stop(time + .14);
      oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
    }
  }
  close() { void this.context?.close().catch(() => undefined); this.context = null; }
}
