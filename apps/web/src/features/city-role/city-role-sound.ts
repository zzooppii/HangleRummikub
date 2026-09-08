import type { CityClientCommand, CityRoleFinishedPlatformSnapshotV2, CityRolePlayingPlatformSnapshotV2, RequestId } from "@hangul-rummikub/shared";
import { useEffect, useRef, useState } from "react";
import { markRequestFeedbackSeen } from "../../lib/request-feedback.js";

export type CitySoundCue = "SELECTION_START" | "ROLE_START" | "BUILD_SUCCESS" | "ROUND_END";
export type CitySoundFeedback = Readonly<{ requestId: RequestId; kind: CityClientCommand["kind"]; message: string }>;
export const CITY_SOUND_PREFERENCE = "hangul-rummikub:preferences:city-sound-enabled";
export const CITY_SOUND_CUES: Readonly<Record<CitySoundCue, Readonly<{ frequencies: readonly number[]; duration: number; gain: number }>>> = Object.freeze({
  SELECTION_START: Object.freeze({ frequencies: Object.freeze([510, 680]), duration: 0.22, gain: 0.055 }),
  ROLE_START: Object.freeze({ frequencies: Object.freeze([440, 660, 780]), duration: 0.27, gain: 0.06 }),
  BUILD_SUCCESS: Object.freeze({ frequencies: Object.freeze([520, 650]), duration: 0.20, gain: 0.05 }),
  ROUND_END: Object.freeze({ frequencies: Object.freeze([600, 480]), duration: 0.24, gain: 0.04 }),
});
export function readCitySoundStorage(kind: "localStorage" | "sessionStorage", key: string): string | null {
  try { return typeof window === "undefined" ? null : window[kind].getItem(key); }
  catch { return null; }
}
export function writeCitySoundStorage(kind: "localStorage" | "sessionStorage", key: string, value: string): void {
  try { if (typeof window !== "undefined") window[kind].setItem(key, value); }
  catch { /* Optional sound preference/bookkeeping cannot affect gameplay. */ }
}
export function shouldAnnounceCityWindow(last: string | null, current: string, active: string, self: string): boolean {
  return active === self && current !== last;
}
export function shouldAnnounceCityRound(lastRound: number | null, round: number, finishedReason: string | null, finishedSeen: boolean): boolean {
  return lastRound !== null && (round > lastRound || finishedReason === "CITY_COMPLETION_ROUND_END" && !finishedSeen);
}
export function cityFeedbackCue(feedback: CitySoundFeedback): CitySoundCue | null {
  return feedback.kind === "city:build" ? "BUILD_SUCCESS" : null;
}

let context: AudioContext | null = null;
let resuming: Promise<void> | null = null;
let latestEnd = 0;
let disposalTimer: ReturnType<typeof setTimeout> | null = null;
function obtainContext(): AudioContext | null {
  if (context?.state === "closed") context = null;
  if (context !== null) return context;
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return null;
  try { context = new window.AudioContext(); return context; }
  catch { return null; }
}
/** Called from a real pointer/keyboard gesture; never queues a gameplay cue. */
export function unlockCityAudio(): void {
  if (disposalTimer !== null) { clearTimeout(disposalTimer); disposalTimer = null; }
  const audio = obtainContext();
  if (audio === null || audio.state === "running" || resuming !== null) return;
  try { resuming = audio.resume().catch(() => undefined).finally(() => { resuming = null; }); }
  catch { resuming = null; }
}
/** Short original sine notes. A blocked or absent device drops this cue now. */
export function playCitySound(cue: CitySoundCue): void {
  const audio = context;
  if (audio === null || audio.state !== "running") return;
  if (disposalTimer !== null) { clearTimeout(disposalTimer); disposalTimer = null; }
  try {
    const config = CITY_SOUND_CUES[cue], start = audio.currentTime;
    const noteLength = config.duration / config.frequencies.length;
    for (const [index, frequency] of config.frequencies.entries()) {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      const at = start + index * noteLength;
      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(config.gain, at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + noteLength);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.addEventListener("ended", () => { oscillator.disconnect(); gain.disconnect(); }, { once: true });
      oscillator.start(at); oscillator.stop(at + noteLength);
    }
    latestEnd = start + config.duration;
  } catch { /* Device/audio failures must not interrupt the UI. */ }
}
export function disposeCityAudio(screenChanging = false): void {
  const audio = context;
  if (audio === null) return;
  if (disposalTimer !== null) clearTimeout(disposalTimer);
  const close = () => {
    if (context !== audio) return;
    context = null; resuming = null; latestEnd = 0; disposalTimer = null;
    void audio.close().catch(() => undefined);
  };
  const remaining = Math.max(0, latestEnd - audio.currentTime);
  // Let an immediately mounted CITY Finished screen emit its round-end cue.
  // This delays resource cleanup only; gameplay sounds are never queued.
  if ((remaining > 0 || screenChanging) && audio.state === "running") disposalTimer = setTimeout(close, remaining * 1000 + 30);
  else close();
}

export function useCitySound(snapshot: CityRolePlayingPlatformSnapshotV2 | CityRoleFinishedPlatformSnapshotV2, feedback: CitySoundFeedback | null, sessionReplaced: boolean) {
  const [enabled, setEnabled] = useState(() => readCitySoundStorage("localStorage", CITY_SOUND_PREFERENCE) !== "false");
  const seenFeedback = useRef(new Set<RequestId>());
  const seenWindows = useRef(new Set<string>());
  const seenRounds = useRef(new Map<string, number>());
  const seenFinished = useRef(new Set<string>());
  const game = snapshot.game;
  const scope = `${snapshot.room.roomId}:${game.gameId}:${snapshot.self.playerId}`;
  useEffect(() => {
    if (!enabled || sessionReplaced) return;
    const pointer = () => unlockCityAudio();
    const keyboard = (event: KeyboardEvent) => { if (event.key === "Enter" || event.key === " ") unlockCityAudio(); };
    window.addEventListener("pointerdown", pointer, { passive: true });
    window.addEventListener("keydown", keyboard);
    return () => { window.removeEventListener("pointerdown", pointer); window.removeEventListener("keydown", keyboard); };
  }, [enabled, sessionReplaced]);
  useEffect(() => () => disposeCityAudio(true), []);
  useEffect(() => {
    if (sessionReplaced || game.phase === "FINISHED") return;
    const key = `hangul-rummikub:city-window-cue:${scope}`;
    const identity = `${scope}:${game.window.actionId}`;
    if (!shouldAnnounceCityWindow(readCitySoundStorage("sessionStorage", key), game.window.actionId, game.window.activePlayerId, snapshot.self.playerId) || seenWindows.current.has(identity)) return;
    seenWindows.current.add(identity);
    writeCitySoundStorage("sessionStorage", key, game.window.actionId);
    if (enabled) playCitySound(game.phase === "ROLE_SELECTION" ? "SELECTION_START" : "ROLE_START");
  }, [game, snapshot.self.playerId, scope, enabled, sessionReplaced]);
  useEffect(() => {
    if (sessionReplaced) return;
    const key = `hangul-rummikub:city-round-cue:${scope}`;
    const persisted = readCitySoundStorage("sessionStorage", key);
    const parsed = persisted !== null && /^[1-9][0-9]*$/u.test(persisted) ? Number(persisted) : null;
    const previous = seenRounds.current.get(scope) ?? parsed;
    const finishedKey = `${key}:finished`;
    const finishedSeen = seenFinished.current.has(scope) || readCitySoundStorage("sessionStorage", finishedKey) === "true";
    const cue = shouldAnnounceCityRound(previous, game.roundNumber, game.phase === "FINISHED" ? game.result.reason : null, finishedSeen);
    seenRounds.current.set(scope, game.roundNumber);
    writeCitySoundStorage("sessionStorage", key, String(game.roundNumber));
    if (game.phase === "FINISHED") { seenFinished.current.add(scope); writeCitySoundStorage("sessionStorage", finishedKey, "true"); }
    if (cue && enabled) playCitySound("ROUND_END");
  }, [game, scope, enabled, sessionReplaced]);
  useEffect(() => {
    if (sessionReplaced || feedback === null || !markRequestFeedbackSeen(seenFeedback.current, feedback.requestId)) return;
    const key = `hangul-rummikub:city-feedback-cue:${scope}:${feedback.requestId}`;
    if (readCitySoundStorage("sessionStorage", key) === "seen") return;
    writeCitySoundStorage("sessionStorage", key, "seen");
    const cue = cityFeedbackCue(feedback);
    if (cue !== null && enabled) playCitySound(cue);
  }, [feedback, scope, enabled, sessionReplaced]);
  return { enabled, toggle() {
    const next = !enabled;
    writeCitySoundStorage("localStorage", CITY_SOUND_PREFERENCE, String(next));
    setEnabled(next);
    if (next && !sessionReplaced) unlockCityAudio();
    else disposeCityAudio();
  } };
}
