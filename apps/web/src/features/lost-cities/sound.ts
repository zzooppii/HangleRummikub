import { useEffect, useRef, useState } from "react";
import type { LostCitiesProjection } from "@hangul-rummikub/shared";

export type LostCitiesSoundCue = "SELECT" | "PLAY" | "DISCARD" | "DRAW" | "TURN" | "ROUND" | "WIN" | "END" | "ERROR" | "WARNING";
const preferenceKey = "hangul-rummikub:lost-cities-sound";
export const LOST_CITIES_CUES: Record<LostCitiesSoundCue, readonly number[]> = {
  SELECT: [520], PLAY: [390, 590], DISCARD: [310, 240], DRAW: [700, 880],
  TURN: [660, 880, 1100], ROUND: [440, 550, 660], WIN: [523, 659, 784, 1047],
  WARNING: [880, 660], END: [550, 440, 330], ERROR: [220, 185],
};

/** Only new server transitions produce action/result audio; initial snapshots do not replay history. */
export function lostCitiesTransitionCues(previous: LostCitiesProjection | null, next: LostCitiesProjection | null, selfId: string): LostCitiesSoundCue[] {
  if (!next) return [];
  const sameGame = previous?.gameId === next.gameId;
  const cues: LostCitiesSoundCue[] = [];
  if (sameGame && next.gameRevision > previous.gameRevision) {
    if (next.feedback && (next.feedback.at !== previous.feedback?.at || next.feedback.card.cardId !== previous.feedback?.card.cardId || next.feedback.playerId !== previous.feedback?.playerId)) {
      cues.push(next.feedback.kind, "DRAW");
    }
    if (previous.phase !== next.phase) {
      if (next.phase === "ROUND_RESULT") cues.push("ROUND");
      if (next.phase === "FINISHED") cues.push(next.result.winnerPlayerIds.some(id=>id===selfId) ? "WIN" : "END");
    }
  }
  if (next.phase === "PLAYING" && next.activePlayerId === selfId &&
    (!sameGame || previous.phase !== "PLAYING" || previous.turnId !== next.turnId)) cues.push("TURN");
  return cues;
}

/** One context unlocked by gestures survives asynchronous server acknowledgements. */
export class LostCitiesAudio {
  private context: AudioContext | null = null;
  constructor(private readonly createContext: () => AudioContext | null = () => {
    if (typeof window === "undefined") return null;
    return typeof window.AudioContext === "function" ? new window.AudioContext() : null;
  }) {}
  unlock(): void {
    try {
      this.context ??= this.createContext();
      if (this.context && this.context.state !== "running") void this.context.resume().catch(() => undefined);
    } catch { /* Audio is optional, including blocked autoplay and unavailable devices. */ }
  }
  play(cues: readonly LostCitiesSoundCue[]): void {
    const context = this.context;
    if (!context || context.state !== "running") return;
    try {
      let start = context.currentTime;
      for (const cue of cues) {
        const duration = cue === "SELECT" ? 0.055 : 0.105;
        for (const frequency of LOST_CITIES_CUES[cue]) {
          const oscillator = context.createOscillator(), gain = context.createGain();
          oscillator.type = "sine";
          oscillator.frequency.setValueAtTime(frequency, start);
          gain.gain.setValueAtTime(0.0001, start);
          gain.gain.exponentialRampToValueAtTime(cue === "SELECT" ? 0.045 : 0.12, start + 0.012);
          gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
          oscillator.connect(gain); gain.connect(context.destination);
          oscillator.addEventListener("ended", () => { oscillator.disconnect(); gain.disconnect(); }, { once: true });
          oscillator.start(start); oscillator.stop(start + duration);
          start += duration;
        }
        start += 0.04;
      }
    } catch { /* Sound failure must never interrupt a game command. */ }
  }
  dispose(): void {
    const context = this.context;
    this.context = null;
    try { if (context && context.state !== "closed") void context.close().catch(() => undefined); }
    catch { /* Device teardown is best effort. */ }
  }
}

export function useLostCitiesSound(game: LostCitiesProjection | null, selfId: string, connected: boolean) {
  const [enabled, setEnabled] = useState(() => {
    try { return typeof window === "undefined" || window.localStorage.getItem(preferenceKey) !== "false"; }
    catch { return true; }
  });
  const audio = useRef<LostCitiesAudio | null>(null);
  const previous = useRef(game);
  const initialized = useRef(false);
  useEffect(() => () => { audio.current?.dispose(); audio.current = null; }, []);
  useEffect(() => {
    const cues = lostCitiesTransitionCues(initialized.current ? previous.current : null, game, selfId);
    initialized.current = true;
    previous.current = game;
    if (enabled && connected) audio.current?.play(cues);
  }, [game, selfId, enabled, connected]);
  function unlock() {
    if (!enabled) return;
    audio.current ??= new LostCitiesAudio();
    audio.current.unlock();
  }
  function play(cue: LostCitiesSoundCue) { if (enabled) audio.current?.play([cue]); }
  return { enabled, unlock, play, toggle() {
    const next = !enabled;
    try { window.localStorage.setItem(preferenceKey, String(next)); }
    catch { /* Preferences remain usable when browser storage is unavailable. */ }
    setEnabled(next);
    if (next) {
      audio.current ??= new LostCitiesAudio();
      audio.current.unlock();
      audio.current.play(["SELECT"]);
    } else { audio.current?.dispose(); audio.current = null; }
  } };
}
