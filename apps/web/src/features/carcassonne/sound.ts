import { useEffect, useRef, useState } from "react";
import type { CarcassonneProjection } from "@hangul-rummikub/shared";

export type CarcassonneCue =
  | "PICK"
  | "ROTATE"
  | "PLACE"
  | "TURN"
  | "SCORE"
  | "FINISH"
  | "WARNING"
  | "ERROR"
  | "MEEPLE";
type Strike = Readonly<{
  pitch: number;
  at: number;
  gain: number;
  decay: number;
}>;
/** Original wood contact, plucked-string intervals and gentle bell tails. */
export const CARCASSONNE_SOUND_SCORE: Record<
  CarcassonneCue,
  readonly Strike[]
> = {
  MEEPLE: [{ pitch: 440, at: 0, gain: 0.25, decay: 0.11 }],
  PICK: [{ pitch: 520, at: 0, gain: 0.24, decay: 0.11 }],
  ROTATE: [{ pitch: 380, at: 0, gain: 0.2, decay: 0.1 }],
  PLACE: [
    { pitch: 240, at: 0, gain: 0.34, decay: 0.15 },
    { pitch: 360, at: 0.045, gain: 0.19, decay: 0.12 },
  ],
  TURN: [
    { pitch: 659.25, at: 0, gain: 0.29, decay: 0.32 },
    { pitch: 987.77, at: 0.16, gain: 0.26, decay: 0.48 },
  ],
  SCORE: [
    { pitch: 523.25, at: 0, gain: 0.25, decay: 0.27 },
    { pitch: 659.25, at: 0.12, gain: 0.24, decay: 0.32 },
    { pitch: 783.99, at: 0.25, gain: 0.25, decay: 0.48 },
  ],
  FINISH: [
    { pitch: 523.25, at: 0, gain: 0.25, decay: 0.35 },
    { pitch: 659.25, at: 0.15, gain: 0.24, decay: 0.35 },
    { pitch: 783.99, at: 0.3, gain: 0.24, decay: 0.4 },
    { pitch: 1046.5, at: 0.48, gain: 0.22, decay: 0.65 },
  ],
  WARNING: [
    { pitch: 830.61, at: 0, gain: 0.21, decay: 0.14 },
    { pitch: 830.61, at: 0.22, gain: 0.17, decay: 0.18 },
  ],
  ERROR: [{ pitch: 349.23, at: 0, gain: 0.2, decay: 0.17 }],
};
export function carcassonneTransitionCues(
  previous: CarcassonneProjection | null,
  next: CarcassonneProjection | null,
  selfId: string,
): CarcassonneCue[] {
  if (
    !previous ||
    !next ||
    previous.gameId !== next.gameId ||
    next.gameRevision <= previous.gameRevision
  )
    return [];
  const cues: CarcassonneCue[] = [];
  if (next.phase === "FINISHED" && previous.phase !== "FINISHED")
    cues.push("FINISH");
  else {
    if (next.feedback?.tile.tileId !== previous.feedback?.tile.tileId)
      cues.push("PLACE");
    if (next.feedback?.scoring.some((s) => s.points > 0)) cues.push("SCORE");
    if (
      next.phase === "PLAYING" &&
      next.activePlayerId === selfId &&
      (previous.phase !== "PLAYING" || previous.turnId !== next.turnId)
    )
      cues.push("TURN");
  }
  return cues;
}
const preferenceKey = "carcassonne:sound-volume";
export class CarcassonneAudio {
  private context: AudioContext | null = null;
  private master: GainNode | null = null;
  private room: ConvolverNode | null = null;
  private volume = 0.65;
  private generation = 0;
  private lastAt = -1;
  constructor(
    private readonly createContext: () => AudioContext | null = () =>
      typeof window !== "undefined" && typeof window.AudioContext === "function"
        ? new window.AudioContext()
        : null,
  ) {}
  unlock(): void {
    try {
      if (!this.context) {
        const context = this.createContext();
        if (!context) return;
        this.context = context;
        const master = context.createGain(),
          room = context.createConvolver(),
          wet = context.createGain();
        master.gain.value = this.volume * 0.55;
        wet.gain.value = 0.08;
        const impulse = context.createBuffer(
          2,
          Math.ceil(context.sampleRate * 0.24),
          context.sampleRate,
        );
        let seed = 17;
        for (let channel = 0; channel < 2; channel++) {
          const samples = impulse.getChannelData(channel);
          for (let i = 0; i < samples.length; i++) {
            seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
            samples[i] =
              (seed / 2147483648 - 1) *
              Math.exp(-i / (context.sampleRate * 0.045)) *
              0.22;
          }
        }
        room.buffer = impulse;
        room.connect(wet);
        wet.connect(master);
        master.connect(context.destination);
        this.master = master;
        this.room = room;
      }
      if (this.context.state === "suspended")
        void this.context.resume().catch(() => undefined);
    } catch {
      this.dispose();
    }
  }
  setVolume(volume: number): void {
    this.volume = Number.isFinite(volume)
      ? Math.min(1, Math.max(0, volume))
      : 0;
    if (this.master && this.context)
      this.master.gain.setTargetAtTime(
        this.volume * 0.55,
        this.context.currentTime,
        0.015,
      );
  }
  play(cues: readonly CarcassonneCue[]): void {
    const context = this.context,
      generation = this.generation;
    if (!context || !this.master || !this.room || this.volume === 0) return;
    const render = () => {
      if (
        generation !== this.generation ||
        context.state !== "running" ||
        !this.master ||
        !this.room ||
        this.volume === 0
      )
        return;
      // Prevent rapid pointer repeats from building a loud stack of voices.
      if (
        context.currentTime - this.lastAt < 0.035 &&
        cues.every((c) => c === "PICK" || c === "ROTATE")
      )
        return;
      this.lastAt = context.currentTime;
      let offset = 0.008;
      try {
        for (const cue of cues) {
          const score = CARCASSONNE_SOUND_SCORE[cue];
          for (const strike of score)
            this.strike(
              context,
              strike,
              context.currentTime + offset + strike.at,
            );
          offset += Math.max(...score.map((s) => s.at + s.decay)) + 0.06;
        }
      } catch {
        /* Unavailable audio hardware does not interrupt the game. */ return;
      }
    };
    if (context.state === "suspended")
      void context
        .resume()
        .then(render)
        .catch(() => undefined);
    else render();
  }
  private strike(context: AudioContext, note: Strike, start: number) {
    const partials = [
      { ratio: 0.5, weight: 0.28, decay: 0.6 },
      { ratio: 1, weight: 0.55, decay: 1 },
      { ratio: 2.01, weight: 0.13, decay: 0.32 },
      { ratio: 3.98, weight: 0.04, decay: 0.13 },
    ];
    for (const partial of partials) {
      const oscillator = context.createOscillator(),
        envelope = context.createGain();
      oscillator.type = "sine";
      oscillator.frequency.value = note.pitch * partial.ratio;
      const duration = note.decay * partial.decay;
      envelope.gain.setValueAtTime(0, start);
      envelope.gain.linearRampToValueAtTime(
        note.gain * partial.weight,
        start + 0.002,
      );
      envelope.gain.exponentialRampToValueAtTime(0.00001, start + duration);
      oscillator.connect(envelope);
      envelope.connect(this.master!);
      envelope.connect(this.room!);
      oscillator.onended = () => {
        oscillator.disconnect();
        envelope.disconnect();
      };
      oscillator.start(start);
      oscillator.stop(start + duration + 0.01);
    }
  }
  dispose(): void {
    this.generation++;
    const context = this.context;
    this.context = null;
    this.master = null;
    this.room = null;
    try {
      if (context && context.state !== "closed")
        void context.close().catch(() => undefined);
    } catch {
      return;
    }
  }
}
export function useCarcassonneSound(
  game: CarcassonneProjection | null,
  selfId: string,
  connected: boolean,
) {
  const [volume, setVolume] = useState(() => {
    try {
      const stored =
        typeof window === "undefined"
          ? null
          : window.localStorage.getItem(preferenceKey);
      const n = Number(stored);
      return stored !== null && Number.isFinite(n)
        ? Math.min(100, Math.max(0, n))
        : 65;
    } catch {
      return 65;
    }
  });
  const audio = useRef<CarcassonneAudio | null>(null),
    previous = useRef(game);
  useEffect(
    () => () => {
      audio.current?.dispose();
      audio.current = null;
    },
    [],
  );
  useEffect(() => {
    const cues = carcassonneTransitionCues(previous.current, game, selfId);
    previous.current = game;
    if (connected && volume > 0) audio.current?.play(cues);
  }, [game, selfId, connected, volume]);
  function unlock() {
    if (volume === 0) return;
    audio.current ??= new CarcassonneAudio();
    audio.current.setVolume(volume / 100);
    audio.current.unlock();
  }
  function play(cue: CarcassonneCue) {
    if (volume > 0) {
      unlock();
      audio.current?.play([cue]);
    }
  }
  function changeVolume(value: number) {
    const next = Math.min(100, Math.max(0, value));
    setVolume(next);
    try {
      window.localStorage.setItem(preferenceKey, String(next));
    } catch {
      /* In-memory preference remains available. */
    }
    audio.current ??= new CarcassonneAudio();
    audio.current.setVolume(next / 100);
    if (next > 0) audio.current.unlock();
  }
  return { volume, unlock, play, changeVolume };
}
