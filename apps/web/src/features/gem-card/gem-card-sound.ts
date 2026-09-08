import type { PlayerId, RequestId, TurnId } from "@hangul-rummikub/shared";
import { useEffect, useRef, useState } from "react";
import { markRequestFeedbackSeen } from "../../lib/request-feedback.js";
import type { GemCardActionKind, GemCardActionFeedback } from "./gem-card-actions.js";

export type { GemCardActionKind, GemCardActionFeedback } from "./gem-card-actions.js";
type GemSoundCue = "TURN_START" | GemCardActionKind;
const PREFERENCE = "hangul-rummikub:gem-card-sound-enabled";

/** Storage property access itself may throw in privacy-restricted browsers. */
export function readGemSoundStorage(kind: "localStorage" | "sessionStorage", key: string): string | null {
  try { return typeof window === "undefined" ? null : window[kind].getItem(key); }
  catch { return null; }
}
export function writeGemSoundStorage(kind: "localStorage" | "sessionStorage", key: string, value: string): void {
  try { if (typeof window !== "undefined") window[kind].setItem(key, value); }
  catch { /* Optional sound persistence must never affect gameplay. */ }
}

export function shouldAnnounceGemTurn(lastTurn: string | null, turnId: TurnId, active: PlayerId, self: PlayerId): boolean {
  return active === self && lastTurn !== turnId;
}
export function markGemFeedback(seen: Set<RequestId>, requestId: RequestId): boolean {
  return markRequestFeedbackSeen(seen, requestId);
}

/** Original, short sine sweeps, synthesized locally without assets/dependencies. */
export function playGemSound(cue: GemSoundCue): void {
  if (typeof window === "undefined" || typeof window.AudioContext !== "function") return;
  let context: AudioContext;
  try { context = new window.AudioContext(); }
  catch { return; }
  const frequencies: Record<GemSoundCue, readonly [number, number]> = {
    TURN_START: [620, 740], COLLECT: [420, 490], PURCHASE: [520, 690], RESERVE: [380, 450], YIELD: [330, 340],
  };
  // Do not queue a blocked autoplay cue to play much later after a stale turn.
  if (context.state !== "running") { void context.close().catch(() => undefined); return; }
  try {
    const [from, to] = frequencies[cue];
    const oscillator = context.createOscillator();
    const gain = context.createGain();
    const now = context.currentTime;
    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(from, now);
    oscillator.frequency.exponentialRampToValueAtTime(to, now + 0.16);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(0.055, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
    oscillator.connect(gain); gain.connect(context.destination);
    oscillator.addEventListener("ended", () => { void context.close().catch(() => undefined); }, { once: true });
    oscillator.start(now); oscillator.stop(now + 0.18);
  } catch { void context.close().catch(() => undefined); }
}

export function useGemActionSound(scope: string, feedback: GemCardActionFeedback | null) {
  const [enabled, setEnabled] = useState(() => readGemSoundStorage("localStorage", PREFERENCE) !== "false");
  const seen = useRef(new Set<RequestId>());
  useEffect(() => {
    if (feedback === null || !markGemFeedback(seen.current, feedback.requestId)) return;
    const key = `hangul-rummikub:gem-card-feedback:${scope}`;
    if (readGemSoundStorage("sessionStorage", key) === feedback.requestId) return;
    writeGemSoundStorage("sessionStorage", key, feedback.requestId);
    if (enabled) playGemSound(feedback.kind);
  }, [enabled, feedback, scope]);
  return {
    enabled,
    toggle() {
      const next = !enabled;
      writeGemSoundStorage("localStorage", PREFERENCE, String(next));
      setEnabled(next);
    },
  };
}
