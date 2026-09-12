import { useEffect, useRef, useState } from "react";
import type { BurgundyProjection } from "@hangul-rummikub/shared";
export type BurgundyCue =
  | "SELECT"
  | "PLACE"
  | "COINS"
  | "SCORE"
  | "TURN"
  | "ROUND"
  | "FINISH"
  | "ERROR";
export function burgundySoundCues(
  before: BurgundyProjection | null,
  after: BurgundyProjection | null,
  self: string,
): BurgundyCue[] {
  if (
    !before ||
    !after ||
    before.gameId !== after.gameId ||
    after.gameRevision <= before.gameRevision
  )
    return [];
  if (after.phase === "FINISHED")
    return after.result.reason === "CANCELLED" ? [] : ["FINISH"];
  const result: BurgundyCue[] = [];
  if (
    after.playerStates.some(
      (p) =>
        p.board.length >
        (before.playerStates.find((b) => b.playerId === p.playerId)?.board
          .length ?? 0),
    )
  )
    result.push("PLACE");
  else if (
    after.playerStates.some(
      (p) =>
        p.silver >
        (before.playerStates.find((b) => b.playerId === p.playerId)?.silver ??
          0),
    )
  )
    result.push("COINS");
  if (
    after.playerStates.some(
      (p) =>
        p.score >
        (before.playerStates.find((b) => b.playerId === p.playerId)?.score ??
          0),
    )
  )
    result.push("SCORE");
  if (
    before.roundIndex !== after.roundIndex ||
    before.phaseIndex !== after.phaseIndex
  )
    result.push("ROUND");
  if (
    after.activePlayerId === self &&
    (before.phase !== "PLAYING" || before.turnId !== after.turnId)
  )
    result.push("TURN");
  return result;
}
export class BurgundyAudio {
  private context: AudioContext | null = null;
  private gain: GainNode | null = null;
  private volume = 0.5;
  constructor(
    private readonly factory: () => AudioContext | null = () =>
      typeof window !== "undefined" && typeof window.AudioContext === "function"
        ? new AudioContext()
        : null,
  ) {}
  unlock() {
    try {
      if (!this.context) {
        this.context = this.factory();
        if (!this.context) return;
        this.gain = this.context.createGain();
        this.gain.gain.value = this.volume * 0.2;
        this.gain.connect(this.context.destination);
      }
      if (this.context.state === "suspended")
        void this.context.resume().catch(() => undefined);
    } catch {
      this.dispose();
    }
  }
  setVolume(value: number) {
    this.volume = Number.isFinite(value) ? Math.min(1, Math.max(0, value)) : 0;
    if (this.gain && this.context)
      this.gain.gain.setTargetAtTime(
        this.volume * 0.2,
        this.context.currentTime,
        0.02,
      );
  }
  play(cues: readonly BurgundyCue[]) {
    const c = this.context,
      g = this.gain;
    if (!c || !g || c.state !== "running" || this.volume === 0) return;
    const sequences: Record<BurgundyCue, number[]> = {
      SELECT: [540],
      PLACE: [190, 145],
      COINS: [1700, 2300],
      SCORE: [523, 659, 784],
      TURN: [587, 784],
      ROUND: [196, 247, 294],
      FINISH: [392, 494, 587, 784],
      ERROR: [185, 165],
    };
    let offset = 0;
    for (const cue of cues) {
      for (const [index, hz] of sequences[cue].entries()) {
        const at = c.currentTime + offset + index * 0.075,
          osc = c.createOscillator(),
          env = c.createGain();
        osc.type = cue === "PLACE" ? "sine" : "triangle";
        osc.frequency.setValueAtTime(hz, at);
        osc.frequency.exponentialRampToValueAtTime(
          hz * (cue === "PLACE" ? 0.55 : 1),
          at + 0.12,
        );
        env.gain.setValueAtTime(0.0001, at);
        env.gain.linearRampToValueAtTime(0.4, at + 0.005);
        env.gain.exponentialRampToValueAtTime(
          0.0001,
          at + (cue === "SELECT" ? 0.06 : 0.35),
        );
        osc.connect(env);
        env.connect(g);
        osc.onended = () => {
          osc.disconnect();
          env.disconnect();
        };
        osc.start(at);
        osc.stop(at + 0.4);
      }
      offset += 0.3;
    }
  }
  dispose() {
    const c = this.context;
    this.context = null;
    this.gain = null;
    if (c && c.state !== "closed") void c.close().catch(() => undefined);
  }
}
export function useBurgundySound(
  game: BurgundyProjection | null,
  self: string,
  connected: boolean,
) {
  const [volume, setVolume] = useState(() => {
    try {
      const v = localStorage.getItem("burgundy:sound");
      return v !== null && Number.isFinite(Number(v))
        ? Math.min(100, Math.max(0, Number(v)))
        : 50;
    } catch {
      return 50;
    }
  });
  const audio = useRef<BurgundyAudio | null>(null),
    before = useRef(game),
    online = useRef(connected);
  useEffect(() => () => audio.current?.dispose(), []);
  useEffect(() => {
    if (connected && online.current)
      audio.current?.play(burgundySoundCues(before.current, game, self));
    before.current = game;
    online.current = connected;
  }, [game, self, connected]);
  function unlock() {
    if (!volume) return;
    audio.current ??= new BurgundyAudio();
    audio.current.setVolume(volume / 100);
    audio.current.unlock();
  }
  function changeVolume(v: number) {
    const n = Number.isFinite(v) ? Math.min(100, Math.max(0, v)) : 0;
    setVolume(n);
    try {
      localStorage.setItem("burgundy:sound", String(n));
    } catch {
      /* Keep in-memory preference when storage is unavailable. */
    }
    audio.current ??= new BurgundyAudio();
    audio.current.setVolume(n / 100);
    if (n) audio.current.unlock();
  }
  return {
    volume,
    changeVolume,
    unlock,
    play: (cue: BurgundyCue) => {
      unlock();
      audio.current?.play([cue]);
    },
  };
}
