import { useEffect, useRef, useState } from "react";
import type { ClueProjection } from "@hangul-rummikub/shared";

type ClueStrike = Readonly<{ frequency: number; at: number; duration: number; type: OscillatorType }>;
export type ClueCue = "SELECT" | "MOVE" | "ROLL" | "SUGGEST" | "RESPOND" | "ACCUSE" | "TURN" | "WIN" | "END" | "ERROR";

const note = (frequency: number, at = 0, duration = 0.1, type: OscillatorType = "sine"): ClueStrike => ({ frequency, at, duration, type });

export const CLUE_CUE_SCORE: Readonly<Record<ClueCue, readonly ClueStrike[]>> = {
  SELECT: [note(540, 0, 0.045, "triangle")],
  MOVE: [note(430), note(600, 0.045)],
  ROLL: [note(320, 0, 0.08), note(420, 0.08, 0.08, "triangle"), note(530, 0.15, 0.1)],
  SUGGEST: [note(340), note(420, 0.08), note(520, 0.14, 0.12, "triangle")],
  RESPOND: [note(620, 0, 0.09), note(480, 0.1, 0.09)],
  ACCUSE: [note(220, 0, 0.08), note(523, 0.08, 0.08, "triangle"), note(659, 0.16, 0.16, "triangle")],
  TURN: [note(659.25, 0, 0.15), note(783.99, 0.14, 0.18, "triangle"), note(1046.5, 0.28, 0.2)],
  WIN: [note(523.25, 0, 0.16), note(659.25, 0.15, 0.16, "triangle"), note(783.99, 0.31, 0.16), note(1046.5, 0.48, 0.2)],
  END: [note(392, 0, 0.18), note(330, 0.2, 0.22, "triangle"), note(262, 0.4, 0.24)],
  ERROR: [note(196, 0, 0.11), note(196, 0.14, 0.18, "triangle")],
};

function toNumber(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function clueTransitionCues(previous: ClueProjection | null, next: ClueProjection | null, selfId: string): ClueCue[] {
  if (!next) return [];
  const cues: ClueCue[] = [];
  const sameGame = previous?.gameId === next.gameId;
  if (!previous || !sameGame || next.gameRevision <= previous.gameRevision) {
    if (next.turnPlayerId === selfId && next.phase === "TURN_START") cues.push("TURN");
    return cues;
  }

  const nextLast = next.history.at(-1);
  if (nextLast && next.history.length > previous.history.length) {
    if (nextLast.type === "ROLL") cues.push("ROLL");
    else if (nextLast.type === "MOVE") cues.push("MOVE");
    else if (nextLast.type === "SUGGEST") cues.push("SUGGEST");
    else if (nextLast.type === "ACCUSE") cues.push(nextLast.correct ? "WIN" : "END");
  }

  if (previous.phase !== "FINISHED" && next.phase === "FINISHED") {
    cues.push(next.result.reason === "SOLVED" ? "WIN" : "END");
  }

  if (next.phase === "TURN_START" && next.turnPlayerId === selfId && previous.turnPlayerId !== selfId) {
    cues.push("TURN");
  }

  if (next.phase === "RESPOND" && next.turnPlayerId === selfId && previous.phase !== "RESPOND") {
    cues.push("TURN");
  }

  if (cues.length <= 1) return cues;
  return [...new Set(cues)];
}

const preferenceKey = "hangul-rummikub:clue-sound";

export class ClueAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume = 0.55;
  private lastAt = -1;

  constructor(private readonly createContext: () => AudioContext | null = () => {
    if (typeof window === "undefined") return null;
    return typeof window.AudioContext === "function" ? new window.AudioContext() : null;
  }) {}

  unlock(): void {
    try {
      if (!this.context) {
        const created = this.createContext();
        if (!created) return;
        this.context = created;
        this.master = created.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(created.destination);
      }
      if (this.context.state === "suspended") void this.context.resume().catch(() => undefined);
    } catch {
      this.dispose();
    }
  }

  setVolume(volume: number): void {
    this.volume = Number.isFinite(volume) ? Math.min(1, Math.max(0, volume)) : 0;
    if (this.master && this.context) this.master.gain.setTargetAtTime(this.volume, this.context.currentTime, 0.01);
  }

  play(cues: readonly ClueCue[]): void {
    const context = this.context;
    if (!context || !this.master || context.state !== "running" || this.volume === 0 || cues.length === 0) return;
    if (context.currentTime - this.lastAt < 0.05 && cues.every(cue => cue === "SELECT" || cue === "MOVE")) return;
    this.lastAt = context.currentTime;

    try {
      let start = context.currentTime + 0.012;
      for (const cue of cues) {
        const sequence = CLUE_CUE_SCORE[cue];
        for (const strike of sequence) {
          const oscillator = context.createOscillator();
          const gain = context.createGain();
          const at = start + strike.at;
          oscillator.type = strike.type;
          oscillator.frequency.setValueAtTime(strike.frequency, at);
          gain.gain.setValueAtTime(0.0001, at);
          gain.gain.linearRampToValueAtTime(0.08, at + 0.01);
          gain.gain.exponentialRampToValueAtTime(0.0001, at + strike.duration);
          oscillator.connect(gain);
          gain.connect(this.master);
          oscillator.addEventListener("ended", () => { oscillator.disconnect(); gain.disconnect(); }, { once: true });
          oscillator.start(at);
          oscillator.stop(at + strike.duration + 0.04);
        }
        const maxDuration = sequence.reduce((max, strike) => Math.max(max, strike.at + strike.duration), 0);
        start += Math.max(maxDuration, 0.05) + 0.03;
      }
    } catch {
      this.dispose();
    }
  }

  dispose(): void {
    const context = this.context;
    this.context = null;
    this.master = null;
    if (context && context.state !== "closed") void context.close().catch(() => undefined);
  }
}

export function useClueSound(game: ClueProjection | null, selfId: string, connected: boolean) {
  const [volume, setVolume] = useState<number>(() => {
    try {
      if (typeof window === "undefined") return 60;
      const value = toNumber(window.localStorage.getItem(preferenceKey));
      return value === null ? 60 : Math.min(100, Math.max(0, value));
    } catch { return 60; }
  });

  const audio = useRef<ClueAudio | null>(null);
  const previous = useRef(game);
  const initialized = useRef(false);

  useEffect(() => () => { audio.current?.dispose(); audio.current = null; }, []);

  useEffect(() => {
    const cues = clueTransitionCues(initialized.current ? previous.current : null, game, selfId);
    previous.current = game;
    initialized.current = true;
    if (connected && volume > 0) audio.current?.play(cues);
  }, [game, selfId, connected, volume]);

  function ensure() { if (volume === 0) return; audio.current ??= new ClueAudio(); audio.current.setVolume(volume / 100); audio.current.unlock(); }

  function play(cue: ClueCue) {
    if (volume === 0) return;
    ensure();
    audio.current?.play([cue]);
  }

  function changeVolume(nextVolume: number) {
    const next = Math.min(100, Math.max(0, nextVolume));
    setVolume(next);
    try { if (typeof window !== "undefined") window.localStorage.setItem(preferenceKey, String(next)); }
    catch { /* preference persists best-effort */ }
    audio.current ??= new ClueAudio();
    audio.current.setVolume(next / 100);
    if (next > 0) audio.current.unlock();
  }

  function toggle() {
    const next = volume > 0 ? 0 : 65;
    changeVolume(next);
  }

  return { volume, unlock: ensure, play, changeVolume, toggle };
}
