import type { CityClientCommand, CityRoleFinishedPlatformSnapshotV2, CityRolePlayingPlatformSnapshotV2, RequestId } from "@hangul-rummikub/shared";
import { useEffect, useRef, useState } from "react";
import { markRequestFeedbackSeen } from "../../lib/request-feedback.js";
import type { CityImpact, CityImpactCue } from "./city-impact.js";

export type CitySoundCue = "SELECTION_START" | "ROLE_START" | "BUILD_SUCCESS" | "ROUND_END" | CityImpactCue;
export type CitySoundFeedback = Readonly<{ requestId: RequestId; kind: CityClientCommand["kind"]; message: string }>;
export const CITY_SOUND_VOLUME = "hangul-rummikub:preferences:city-sound-volume";
export const CITY_SOUND_PREFERENCE = "hangul-rummikub:preferences:city-sound-enabled";
export const CITY_SOUND_CUES: Readonly<Record<CitySoundCue, Readonly<{ frequencies: readonly number[]; duration: number; gain: number; wave?: OscillatorType }>>> = Object.freeze({
  STEAL: { frequencies: [1760, 1175, 587], duration: .38, gain: .06, wave: "triangle" },
  STRIKE: { frequencies: [280, 90], duration: .24, gain: .065, wave: "sawtooth" },
  COIN_GAIN: { frequencies: [1320, 1760, 2093], duration: .32, gain: .055, wave: "triangle" },
  COIN_LOSS: { frequencies: [1100, 640, 220], duration: .3, gain: .055, wave: "triangle" },
  SHUFFLE: { frequencies: [180, 270, 150, 230], duration: .3, gain: .035, wave: "triangle" },
  DRAW: { frequencies: [390, 580], duration: .26, gain: .045 },
  BUILD: { frequencies: [130, 220, 520], duration: .3, gain: .045, wave: "triangle" },
  BREAK: { frequencies: [190, 110, 60], duration: .34, gain: .065, wave: "sawtooth" },
  SHIELD: { frequencies: [350, 700, 1050], duration: .3, gain: .045, wave: "triangle" },
  LEADER: { frequencies: [440, 550, 660], duration: .45, gain: .045 },
  WATER: { frequencies: [700, 1050, 1400], duration: .3, gain: .035 },
  TICK: { frequencies: [1300, 650], duration: .16, gain: .035, wave: "triangle" },
  WIND: { frequencies: [320, 480, 720], duration: .32, gain: .035 },
  MOON: { frequencies: [520, 780, 1040], duration: .48, gain: .035 },
  BELL: { frequencies: [660, 880, 660], duration: .48, gain: .045 },
  VICTORY: { frequencies: [440, 550, 660, 880], duration: .65, gain: .06 },
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
export function playCitySound(cue: CitySoundCue, scale = 1): void {
  const audio = context;
  if (audio === null || audio.state !== "running") return;
  if (disposalTimer !== null) { clearTimeout(disposalTimer); disposalTimer = null; }
  try {
    const config = CITY_SOUND_CUES[cue], start = audio.currentTime;
    const level = readCitySoundVolume() / 100 * Math.max(0, Math.min(1, scale));
    if (level === 0) return;
    const noteLength = config.duration / config.frequencies.length;
    for (const [index, frequency] of config.frequencies.entries()) {
      const oscillator = audio.createOscillator(), gain = audio.createGain();
      const at = start + index * noteLength;
      oscillator.type = config.wave ?? "sine";
      oscillator.frequency.setValueAtTime(frequency, at);
      gain.gain.setValueAtTime(0.0001, at);
      gain.gain.exponentialRampToValueAtTime(Math.max(.0001, config.gain * level), at + 0.012);
      gain.gain.exponentialRampToValueAtTime(0.0001, at + noteLength);
      oscillator.connect(gain); gain.connect(audio.destination);
      oscillator.addEventListener("ended", () => { oscillator.disconnect(); gain.disconnect(); }, { once: true });
      oscillator.start(at); oscillator.stop(at + noteLength);
    }
    latestEnd = Math.max(latestEnd, start + config.duration);
    if (cue === "DRAW" || cue === "SHUFFLE" || cue === "BUILD" || cue === "BREAK" || cue === "STEAL") {
      // Original filtered noise: paper flutter / wooden or stone contact, not a recording.
      const length = Math.ceil(audio.sampleRate * .16), buffer = audio.createBuffer(1, length, audio.sampleRate);
      const samples = buffer.getChannelData(0);
      let seed = 17;
      for (let i = 0; i < length; i++) { seed = (seed * 16807) % 2147483647; samples[i] = (seed / 2147483647 * 2 - 1); }
      const source = audio.createBufferSource(), filter = audio.createBiquadFilter(), envelope = audio.createGain();
      source.buffer = buffer; filter.type = "bandpass"; filter.frequency.value = cue === "DRAW" || cue === "SHUFFLE" || cue === "STEAL" ? 2200 : 450;
      envelope.gain.setValueAtTime(Math.max(.0001, .12 * level), start); envelope.gain.exponentialRampToValueAtTime(.0001, start + .16);
      source.connect(filter); filter.connect(envelope); envelope.connect(audio.destination);
      source.onended = () => { source.disconnect(); filter.disconnect(); envelope.disconnect(); };
      source.start(start); source.stop(start + .16);
    }
  } catch { /* Device/audio failures must not interrupt the UI. */ }
}
export function readCitySoundVolume(): number {
  const stored = readCitySoundStorage("localStorage", CITY_SOUND_VOLUME);
  const value = stored === null ? 80 : Number(stored);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 80;
}
export function playCityImpactSound(cue: CityImpactCue, scale = 1): void {
  if (readCitySoundStorage("localStorage", CITY_SOUND_PREFERENCE) !== "false") playCitySound(cue, scale);
}
/** Play the most meaningful confirmed effect now, independent of the text banner queue. */
export function cityImpactSoundEvent(events: readonly CityImpact[]): CityImpact | undefined {
  const priorities: Partial<Record<CityImpactCue, number>> = { STEAL: 8, VICTORY: 7, BREAK: 6, BUILD: 5, COIN_GAIN: 4, COIN_LOSS: 4, DRAW: 3, SHUFFLE: 3 };
  const priority = (event: CityImpact) => (priorities[event.cue] ?? 1) + (event.intensity === "small" ? 0 : 10);
  return events.reduce<CityImpact | undefined>((best, event) => !best || priority(event) > priority(best) ? event : best, undefined);
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

export function useCitySound(snapshot: CityRolePlayingPlatformSnapshotV2 | CityRoleFinishedPlatformSnapshotV2, feedback: CitySoundFeedback | null, sessionReplaced: boolean, presentationOwnsCues = false) {
  const [enabled, setEnabled] = useState(() => readCitySoundStorage("localStorage", CITY_SOUND_PREFERENCE) !== "false");
  const [volume, setVolume] = useState(readCitySoundVolume);
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
    if (presentationOwnsCues || sessionReplaced || game.phase === "FINISHED") return;
    const key = `hangul-rummikub:city-window-cue:${scope}`;
    const identity = `${scope}:${game.window.actionId}`;
    if (!shouldAnnounceCityWindow(readCitySoundStorage("sessionStorage", key), game.window.actionId, game.window.activePlayerId, snapshot.self.playerId) || seenWindows.current.has(identity)) return;
    seenWindows.current.add(identity);
    writeCitySoundStorage("sessionStorage", key, game.window.actionId);
    if (enabled) playCitySound(game.phase === "ROLE_SELECTION" ? "SELECTION_START" : "ROLE_START");
  }, [game, snapshot.self.playerId, scope, enabled, sessionReplaced, presentationOwnsCues]);
  useEffect(() => {
    if (presentationOwnsCues || sessionReplaced) return;
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
  }, [game, scope, enabled, sessionReplaced, presentationOwnsCues]);
  useEffect(() => {
    if (presentationOwnsCues || sessionReplaced || feedback === null || !markRequestFeedbackSeen(seenFeedback.current, feedback.requestId)) return;
    const key = `hangul-rummikub:city-feedback-cue:${scope}:${feedback.requestId}`;
    if (readCitySoundStorage("sessionStorage", key) === "seen") return;
    writeCitySoundStorage("sessionStorage", key, "seen");
    const cue = cityFeedbackCue(feedback);
    if (cue !== null && enabled) playCitySound(cue);
  }, [feedback, scope, enabled, sessionReplaced, presentationOwnsCues]);
  return { enabled, volume, changeVolume(value: number) {
    const next = Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 80;
    writeCitySoundStorage("localStorage", CITY_SOUND_VOLUME, String(next)); setVolume(next);
    if (enabled && !sessionReplaced && next > 0) unlockCityAudio();
  }, toggle() {
    const next = !enabled;
    writeCitySoundStorage("localStorage", CITY_SOUND_PREFERENCE, String(next));
    setEnabled(next);
    if (next && !sessionReplaced) unlockCityAudio();
    else disposeCityAudio();
  } };
}
