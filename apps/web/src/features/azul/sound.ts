import { useEffect, useRef, useState } from "react";
import type { AzulProjection } from "@hangul-rummikub/shared";

export type AzulCue = "PICK" | "PREVIEW" | "PLACE" | "TURN" | "ROUND" | "FINISH" | "WARNING" | "ERROR";
type Strike = Readonly<{ pitch: number; at: number; gain: number; decay: number }>;
/** Inharmonic ceramic resonances, a warm body and a very short contact transient. */
export const AZUL_SOUND_SCORE: Record<AzulCue, readonly Strike[]> = {
  PICK: [{ pitch: 1080, at: 0, gain: .24, decay: .11 }],
  PREVIEW: [{ pitch: 790, at: 0, gain: .20, decay: .10 }],
  PLACE: [{ pitch: 720, at: 0, gain: .34, decay: .15 }, { pitch: 1020, at: .045, gain: .19, decay: .12 }],
  TURN: [{ pitch: 659.25, at: 0, gain: .29, decay: .32 }, { pitch: 987.77, at: .16, gain: .26, decay: .48 }],
  ROUND: [{ pitch: 523.25, at: 0, gain: .25, decay: .27 }, { pitch: 659.25, at: .12, gain: .24, decay: .32 }, { pitch: 783.99, at: .25, gain: .25, decay: .48 }],
  FINISH: [{ pitch: 523.25, at: 0, gain: .25, decay: .35 }, { pitch: 659.25, at: .15, gain: .24, decay: .35 }, { pitch: 783.99, at: .30, gain: .24, decay: .40 }, { pitch: 1046.5, at: .48, gain: .22, decay: .65 }],
  WARNING: [{ pitch: 830.61, at: 0, gain: .21, decay: .14 }, { pitch: 830.61, at: .22, gain: .17, decay: .18 }],
  ERROR: [{ pitch: 349.23, at: 0, gain: .20, decay: .17 }],
};
export function azulTransitionCues(previous: AzulProjection | null, next: AzulProjection | null, selfId: string): AzulCue[] {
  if (!next) return [];
  const same = previous?.gameId === next.gameId;
  const cues: AzulCue[] = [];
  if (same && next.gameRevision > previous.gameRevision) {
    if (next.phase === "FINISHED" && previous.phase !== "FINISHED") cues.push("FINISH");
    else if (next.lastRound && next.lastRound.round > (previous.lastRound?.round ?? 0)) cues.push("ROUND");
    else if (next.feedback && next.feedback !== previous.feedback && (next.feedback.at !== previous.feedback?.at || next.feedback.playerId !== previous.feedback?.playerId || next.gameRevision > previous.gameRevision)) cues.push("PLACE");
  }
  if (next.phase === "PLAYING" && next.activePlayerId === selfId && (!same || previous.phase !== "PLAYING" || previous.turnId !== next.turnId)) cues.push("TURN");
  return cues;
}
const preferenceKey = "azul:sound-volume";
export class AzulAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private room: ConvolverNode | null = null;
  private volume = .65;
  private generation = 0;
  private lastAt = -1;
  constructor(private readonly createContext: () => AudioContext | null = () => typeof window !== "undefined" && typeof window.AudioContext === "function" ? new window.AudioContext() : null) {}
  unlock(): void {
    try {
      if (!this.context) {
        const context = this.createContext();
        if (!context) return;
        this.context = context;
        const master = context.createGain(), room = context.createConvolver(), wet = context.createGain();
        master.gain.value = this.volume * .55;
        wet.gain.value = .12;
        const impulse = context.createBuffer(2, Math.ceil(context.sampleRate * .24), context.sampleRate);
        let seed = 17;
        for (let channel = 0; channel < 2; channel++) {
          const samples = impulse.getChannelData(channel);
          for (let i = 0; i < samples.length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            samples[i] = (seed / 2147483648 - 1) * Math.exp(-i / (context.sampleRate * .045)) * .22;
          }
        }
        room.buffer = impulse; room.connect(wet); wet.connect(master); master.connect(context.destination);
        this.master = master; this.room = room;
      }
      if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
    } catch { this.dispose(); }
  }
  setVolume(volume: number): void {
    this.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume * .55, this.context.currentTime, .015);
  }
  play(cues: readonly AzulCue[]): void {
    const context = this.context, generation = this.generation;
    if (!context || !this.master || !this.room || this.volume === 0) return;
    const render = () => {
      if (generation !== this.generation || context.state !== "running" || !this.master || !this.room || this.volume === 0) return;
      // Prevent rapid pointer repeats from building a loud stack of voices.
      if (context.currentTime - this.lastAt < .035 && cues.every(c => c === "PICK" || c === "PREVIEW")) return;
      this.lastAt = context.currentTime;
      let offset = .008;
      try {
        for (const cue of cues) {
          const score = AZUL_SOUND_SCORE[cue];
          for (const strike of score) this.strike(context, strike, context.currentTime + offset + strike.at);
          offset += Math.max(...score.map(s => s.at + s.decay)) + .06;
        }
      } catch { /* Unavailable audio hardware does not interrupt the game. */ return; }
    };
    if (context.state === "suspended") void context.resume().then(render).catch(() => undefined);
    else render();
  }
  private strike(context: AudioContext, note: Strike, start: number) {
    const partials = [{ ratio: .5, weight: .28, decay: .6 }, { ratio: 1, weight: .55, decay: 1 }, { ratio: 2.76, weight: .13, decay: .32 }, { ratio: 4.94, weight: .04, decay: .13 }];
    for (const partial of partials) {
      const oscillator = context.createOscillator(), envelope = context.createGain();
      oscillator.type = "sine"; oscillator.frequency.value = note.pitch * partial.ratio;
      const duration = note.decay * partial.decay;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(note.gain * partial.weight, start + .002);
      envelope.gain.exponentialRampToValueAtTime(.00001, start + duration);
      oscillator.connect(envelope); envelope.connect(this.master!); envelope.connect(this.room!);
      oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
      oscillator.start(start); oscillator.stop(start + duration + .01);
    }
  }
  dispose(): void {
    this.generation++; const context = this.context;
    this.context = null; this.master = null; this.room = null;
    try { if (context && context.state !== "closed") void context.close().catch(() => undefined); }
    catch { return; }
  }
}
export function useAzulSound(game: AzulProjection | null, selfId: string, connected: boolean) {
  const [volume, setVolume] = useState(() => {
    try { const stored = typeof window === "undefined" ? null : window.localStorage.getItem(preferenceKey); const n = Number(stored); return stored !== null && Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 65; }
    catch { return 65; }
  });
  const audio = useRef<AzulAudio | null>(null), previous = useRef(game);
  useEffect(() => () => { audio.current?.dispose(); audio.current = null; }, []);
  useEffect(() => {
    const cues = azulTransitionCues(previous.current, game, selfId);
    previous.current = game;
    if (connected && volume > 0) audio.current?.play(cues);
  }, [game, selfId, connected, volume]);
  function unlock() { if (volume === 0) return; audio.current ??= new AzulAudio(); audio.current.setVolume(volume / 100); audio.current.unlock(); }
  function play(cue: AzulCue) { if (volume > 0) { unlock(); audio.current?.play([cue]); } }
  function changeVolume(value: number) {
    const next = Math.min(100, Math.max(0, value)); setVolume(next);
    try { window.localStorage.setItem(preferenceKey, String(next)); } catch { /* In-memory preference remains available. */ }
    audio.current ??= new AzulAudio(); audio.current.setVolume(next / 100);
    if (next > 0) audio.current.unlock();
  }
  return { volume, unlock, play, changeVolume };
}
