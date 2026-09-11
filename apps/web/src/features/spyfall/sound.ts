import { useEffect, useRef, useState } from "react";
import type { SpyfallProjection } from "@hangul-rummikub/shared";
export type SpyfallCue = "CARD" | "SELECT" | "TURN" | "VOTE" | "WARNING" | "WIN" | "LOSE";
type Note = Readonly<{ frequency: number; at: number; duration: number; type: OscillatorType }>;
const note = (frequency: number, at = 0, duration = .12, type: OscillatorType = "sine"): Note => ({ frequency, at, duration, type });
export const SPYFALL_SCORE: Readonly<Record<SpyfallCue, readonly Note[]>> = {
  CARD: [note(180, 0, .055, "triangle"), note(320, .04, .09, "triangle")],
  SELECT: [note(540, 0, .055, "triangle")],
  TURN: [note(587, 0, .18), note(880, .15, .3)],
  VOTE: [note(220, 0, .18, "triangle"), note(207.65, .18, .3, "triangle")],
  WARNING: [note(740, 0, .09), note(740, .2, .09)],
  WIN: [note(392, 0, .22), note(493.88, .14, .22), note(587.33, .28, .22), note(783.99, .43, .48)],
  LOSE: [note(293.66, 0, .25, "triangle"), note(220, .22, .45, "triangle")],
};
export function spyfallTransitionCue(previous: SpyfallProjection | null, next: SpyfallProjection | null, self: string): SpyfallCue | null {
  if (!previous || !next || previous.gameId !== next.gameId || next.gameRevision <= previous.gameRevision) return null;
  if (previous.phase === "PLAYING" && next.phase === "FINISHED") return next.result.reason === "CANCELLED" ? null : next.result.winnerPlayerIds.some(id => id === self) ? "WIN" : "LOSE";
  if (previous.phase !== "PLAYING" || next.phase !== "PLAYING" || previous.phaseId === next.phaseId) return null;
  if (next.stage === "ACCUSATION" || next.stage === "GUESS") return "VOTE";
  const actor = next.stage === "QUESTION" ? next.questionerId : next.stage === "ANSWER" ? next.respondentId : next.stage === "FINAL_ACCUSATION" ? next.finalAccuserId : null;
  return actor === self ? "TURN" : null;
}
export class SpyfallAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = .35;
  private lastAt = -1;
  constructor(private readonly createContext: () => AudioContext | null = () => typeof window !== "undefined" && typeof window.AudioContext === "function" ? new window.AudioContext() : null) {}
  unlock(): void {
    try {
      if (!this.context) { const ctx = this.createContext(); if (!ctx) return; this.context = ctx; this.master = ctx.createGain(); this.master.gain.value = this.volume * .16; this.master.connect(ctx.destination); }
      if (this.context.state === "suspended") void this.context.resume().catch(() => { this.dispose(); });
    } catch { this.dispose(); }
  }
  setVolume(volume: number) { this.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0; if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume * .16, this.context.currentTime, .008); }
  play(cue: SpyfallCue): void {
    const ctx = this.context, master = this.master;
    if (!ctx || !master || ctx.state !== "running" || this.volume === 0) return;
    if (ctx.currentTime - this.lastAt < .045 && (cue === "SELECT" || cue === "CARD")) return;
    this.lastAt = ctx.currentTime;
    try {
      for (const n of SPYFALL_SCORE[cue]) {
        const oscillator = ctx.createOscillator(), envelope = ctx.createGain(), at = ctx.currentTime + .012 + n.at;
        oscillator.type = n.type; oscillator.frequency.setValueAtTime(n.frequency, at);
        envelope.gain.setValueAtTime(.0001, at); envelope.gain.linearRampToValueAtTime(.5, at + .008); envelope.gain.exponentialRampToValueAtTime(.0001, at + n.duration);
        oscillator.connect(envelope); envelope.connect(master); oscillator.onended = () => { oscillator.disconnect(); envelope.disconnect(); };
        oscillator.start(at); oscillator.stop(at + n.duration + .02);
      }
    } catch { this.dispose(); }
  }
  dispose() { const ctx = this.context; this.context = null; this.master = null; if (ctx && ctx.state !== "closed") void ctx.close().catch(() => { /* No remaining audio resources are retained. */ }); }
}
const preference = "spyfall:sound-volume";
export function useSpyfallSound(game: SpyfallProjection | null, self: string, connected: boolean, seconds: number) {
  const [volume, setVolume] = useState(() => { try { const value = window.localStorage.getItem(preference); return value !== null && Number.isFinite(Number(value)) ? Math.min(100, Math.max(0, Number(value))) : 35; } catch { return 35; } });
  const audio = useRef<SpyfallAudio | null>(null), previous = useRef({ game, connected }), warned = useRef("");
  const phaseKey = game?.phase === "PLAYING" ? `${game.gameId}:${game.phaseId}` : "";
  useEffect(() => () => { audio.current?.dispose(); audio.current = null; }, []);
  useEffect(() => {
    const cue = spyfallTransitionCue(previous.current.game, game, self);
    if (cue && connected && previous.current.connected && !document.hidden) audio.current?.play(cue);
    previous.current = { game, connected };
  }, [game, self, connected]);
  useEffect(() => {
    if (seconds <= 10 && phaseKey && warned.current !== phaseKey) {
      warned.current = phaseKey;
      if (seconds > 0 && connected && !document.hidden) audio.current?.play("WARNING");
    }
  }, [seconds, phaseKey, connected]);
  function unlock() { if (!volume) return; audio.current ??= new SpyfallAudio(); audio.current.setVolume(volume / 100); audio.current.unlock(); }
  function play(cue: SpyfallCue) { if (!document.hidden && volume > 0) { unlock(); audio.current?.play(cue); } }
  function changeVolume(value: number) {
    const next = Math.min(100, Math.max(0, value)); setVolume(next);
    try { window.localStorage.setItem(preference, String(next)); } catch { /* Preference still works for this visit. */ }
    audio.current ??= new SpyfallAudio(); audio.current.setVolume(next / 100); if (next) audio.current.unlock();
  }
  return { volume, changeVolume, play, unlock };
}
