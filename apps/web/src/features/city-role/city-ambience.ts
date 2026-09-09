import { useEffect, useState } from "react";
import { readCitySoundStorage, writeCitySoundStorage } from "./city-role-sound.js";

export const CITY_MUSIC_PREFERENCE = "hangul-rummikub:preferences:city-music-enabled";
// Original quiet chamber progression; no recordings, imported melodies or gameplay state.
export const CITY_MUSIC_CHORDS = [[146.83, 220, 293.66], [130.81, 196, 261.63], [174.61, 220, 349.23], [164.81, 246.94, 329.63]] as const;

export function useCityAmbience(inactive: boolean) {
  const [enabled, setEnabled] = useState(() => readCitySoundStorage("localStorage", CITY_MUSIC_PREFERENCE) === "true");
  useEffect(() => {
    if (!enabled || inactive) return;
    let audio: AudioContext | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;
    let bar = 0;
    let disposed = false;
    function stop() {
      if (timer !== null) clearInterval(timer);
      timer = null;
      const old = audio; audio = null;
      if (old !== null) void old.close().catch(() => undefined);
    }
    function chord() {
      if (!audio || audio.state !== "running") return;
      const notes = CITY_MUSIC_CHORDS[bar++ % CITY_MUSIC_CHORDS.length]!;
      try {
        for (const [i, hz] of notes.entries()) {
          const oscillator = audio.createOscillator(), gain = audio.createGain();
          const at = audio.currentTime + i * .13;
          oscillator.type = "sine"; oscillator.frequency.value = hz;
          gain.gain.setValueAtTime(.0001, at);
          gain.gain.exponentialRampToValueAtTime(.018, at + .45);
          gain.gain.exponentialRampToValueAtTime(.0001, at + 3.8);
          oscillator.connect(gain); gain.connect(audio.destination);
          oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
          oscillator.start(at); oscillator.stop(at + 3.9);
        }
      } catch { stop(); /* Audio failure cannot change a game. */ }
    }
    async function start() {
      if (disposed || document.hidden || audio !== null || typeof window.AudioContext !== "function") return;
      try {
        const next = new window.AudioContext(); audio = next;
        await next.resume();
        if (disposed || audio !== next || document.hidden) { stop(); return; }
        chord(); timer = setInterval(chord, 4000);
      } catch { stop(); }
    }
    const gesture = () => { void start(); };
    const visibility = () => { if (document.hidden) stop(); }; // Return silently until a gesture.
    window.addEventListener("pointerdown", gesture, { passive: true });
    window.addEventListener("keydown", gesture);
    document.addEventListener("visibilitychange", visibility);
    // Toggle gesture may have preceded mounting; blocked autoplay simply waits for another gesture.
    void start();
    return () => { disposed = true; stop(); window.removeEventListener("pointerdown", gesture); window.removeEventListener("keydown", gesture); document.removeEventListener("visibilitychange", visibility); };
  }, [enabled, inactive]);
  return { enabled, toggle() { const next = !enabled; writeCitySoundStorage("localStorage", CITY_MUSIC_PREFERENCE, String(next)); setEnabled(next); } };
}
