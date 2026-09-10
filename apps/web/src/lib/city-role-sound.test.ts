import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { RequestIdSchema } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { CITY_SOUND_CUES, CITY_SOUND_PREFERENCE, cityFeedbackCue, disposeCityAudio, playCitySound, readCitySoundStorage, shouldAnnounceCityRound, shouldAnnounceCityWindow, unlockCityAudio, writeCitySoundStorage } from "../features/city-role/city-role-sound.js";
import { markRequestFeedbackSeen } from "./request-feedback.js";
import { cityImpactSoundEvent, CITY_SOUND_VOLUME, readCitySoundVolume, playCityImpactSound } from "../features/city-role/city-role-sound.js";

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  sampleRate = 44100;
  noiseSources = 0;
  state = "suspended";
  currentTime = 10;
  destination = {};
  blocked = false;
  resumeCalls = 0;
  closeCalls = 0;
  frequencies: number[] = [];
  gains: number[] = [];
  ended: (() => void)[] = [];
  disconnected = 0;
  constructor() { FakeAudioContext.instances.push(this); }
  async resume() { this.resumeCalls++; if (this.blocked) throw new Error("blocked"); this.state = "running"; }
  async close() { this.closeCalls++; this.state = "closed"; }
  createOscillator() { return { type: "sine", frequency: { setValueAtTime: (value: number) => this.frequencies.push(value) }, connect() {}, disconnect: () => { this.disconnected++; }, addEventListener: (_event: string, callback: () => void) => { this.ended.push(callback); }, start() {}, stop() {} }; }
  createBuffer(_channels: number, length: number) { return { getChannelData: () => new Float32Array(length) }; }
  createBufferSource() { this.noiseSources++; return { buffer: null, onended: null, connect() {}, disconnect() {}, start() {}, stop() {} }; }
  createBiquadFilter() { return { type: 'bandpass', frequency: { value: 0 }, connect() {}, disconnect() {} }; }
  createGain() { return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime: (value: number) => { if (value > .0001) this.gains.push(value); } }, connect() {}, disconnect: () => { this.disconnected++; } }; }
}
test("CITY impact mute drops sound immediately without delayed replay", async () => {
  let muted = true;
  await withWindow({ AudioContext: FakeAudioContext, localStorage: { getItem: () => muted ? "false" : "true" } }, async () => {
    unlockCityAudio(); await Promise.resolve();
    const audio = FakeAudioContext.instances[0]!;
    playCityImpactSound("STRIKE"); assert.deepEqual(audio.frequencies, []);
    muted = false; assert.deepEqual(audio.frequencies, []);
    playCityImpactSound("SHIELD"); assert.deepEqual(audio.frequencies, CITY_SOUND_CUES.SHIELD.frequencies);
  });
});
async function withWindow(value: object, run: () => void | Promise<void>) {
  disposeCityAudio();
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value });
  FakeAudioContext.instances = [];
  try { await run(); }
  finally {
    for (const context of FakeAudioContext.instances) context.currentTime = 100;
    disposeCityAudio();
    if (original) Object.defineProperty(globalThis, "window", original); else Reflect.deleteProperty(globalThis, "window");
  }
}
test("CITY own new selection/action cue is once; same window presence or reconnect produces none", () => {
  assert.equal(shouldAnnounceCityWindow("old", "new", "me", "me"), true);
  assert.equal(shouldAnnounceCityWindow("same", "same", "me", "me"), false);
  assert.equal(shouldAnnounceCityWindow(null, "new", "other", "me"), false);
  assert.equal(shouldAnnounceCityWindow("my-previous", "my-future", "me", "me"), true);
  assert.equal(shouldAnnounceCityWindow("my-future", "my-future", "me", "me"), false);
});
test("CITY round cue needs an observed boundary; LPS/zero-eligible are not normal round end", () => {
  assert.equal(shouldAnnounceCityRound(null, 1, null, false), false);
  assert.equal(shouldAnnounceCityRound(1, 1, null, false), false);
  assert.equal(shouldAnnounceCityRound(1, 2, null, false), true);
  assert.equal(shouldAnnounceCityRound(2, 2, "CITY_COMPLETION_ROUND_END", false), true);
  assert.equal(shouldAnnounceCityRound(2, 2, "CITY_COMPLETION_ROUND_END", true), false);
  assert.equal(shouldAnnounceCityRound(2, 2, "LAST_PLAYER_STANDING", false), false);
  assert.equal(shouldAnnounceCityRound(2, 2, "NO_ELIGIBLE_PLAYERS", false), false);
});
test("CITY only canonical successful build feedback chooses build sound; request dedupe remains caller-owned", () => {
  const feedback = { requestId: parse(RequestIdSchema, "req"), kind: "city:build" as const, message: "건설 완료" };
  assert.equal(cityFeedbackCue(feedback), "BUILD_SUCCESS");
  assert.equal(cityFeedbackCue({ ...feedback, kind: "city:takeIncome" }), null);
  const seen = new Set<ReturnType<typeof parse<typeof RequestIdSchema>>>();
  assert.equal(markRequestFeedbackSeen(seen, feedback.requestId), true);
  assert.equal(markRequestFeedbackSeen(seen, feedback.requestId), false);
  assert.equal(markRequestFeedbackSeen(new Set(), feedback.requestId), true);
});
test("CITY first gesture unlocks reusable audio without replaying a blocked earlier cue", async () => {
  await withWindow({ AudioContext: FakeAudioContext }, async () => {
    playCitySound("SELECTION_START");
    assert.equal(FakeAudioContext.instances.length, 0);
    unlockCityAudio(); unlockCityAudio();
    const audio = FakeAudioContext.instances[0]!;
    assert.equal(audio.resumeCalls, 1);
    assert.deepEqual(audio.frequencies, []);
    await Promise.resolve();
    playCitySound("BUILD_SUCCESS");
    assert.deepEqual(audio.frequencies, CITY_SOUND_CUES.BUILD_SUCCESS.frequencies);
    assert.equal(FakeAudioContext.instances.length, 1);
  });
});
test("CITY autoplay failure never queues a delayed cue and later gesture safely retries", async () => {
  await withWindow({ AudioContext: FakeAudioContext }, async () => {
    unlockCityAudio();
    const audio = FakeAudioContext.instances[0]!;
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    audio.state = "suspended"; audio.blocked = true;
    unlockCityAudio();
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    playCitySound("ROLE_START");
    assert.deepEqual(audio.frequencies, []);
    audio.blocked = false;
    unlockCityAudio();
    assert.deepEqual(audio.frequencies, []);
    playCitySound("ROUND_END");
    assert.deepEqual(audio.frequencies, CITY_SOUND_CUES.ROUND_END.frequencies);
  });
});
test("CITY Playing to Finished handoff preserves unlocked context for the immediate round-end cue", async () => {
  await withWindow({ AudioContext: FakeAudioContext }, () => {
    unlockCityAudio();
    const audio = FakeAudioContext.instances[0]!;
    disposeCityAudio(true);
    assert.equal(audio.closeCalls, 0);
    playCitySound("ROUND_END");
    assert.deepEqual(audio.frequencies, CITY_SOUND_CUES.ROUND_END.frequencies);
    assert.equal(FakeAudioContext.instances.length, 1);
    audio.currentTime = 100;
    disposeCityAudio();
    assert.equal(audio.closeCalls, 1);
  });
});
test("CITY four original sine cues are short, distinct and disconnect finished notes", async () => {
  assert.equal(new Set(["SELECTION_START", "ROLE_START", "BUILD_SUCCESS", "ROUND_END"].map(cue => Object.entries(CITY_SOUND_CUES).find(([key]) => key === cue)?.[1].frequencies.join(","))).size, 4);
  assert.equal(new Set(Object.values(CITY_SOUND_CUES).map(cue => cue.frequencies.join(","))).size, 20);
  for (const cue of ["SELECTION_START", "ROLE_START", "BUILD_SUCCESS", "ROUND_END"] as const) await withWindow({ AudioContext: FakeAudioContext }, () => {
    unlockCityAudio();
    const audio = FakeAudioContext.instances[0]!;
    playCitySound(cue);
    assert.deepEqual(audio.frequencies, CITY_SOUND_CUES[cue].frequencies);
    assert.ok(CITY_SOUND_CUES[cue].duration < .3);
    audio.ended.forEach(callback => callback());
    assert.equal(audio.disconnected, audio.frequencies.length * 2);
  });
});
test("CITY missing/blocked audio and storage are nonfatal optional UX", async () => {
  for (const value of [{}, { AudioContext: class { constructor() { throw new Error("denied"); } } }]) await withWindow(value, () => {
    assert.doesNotThrow(unlockCityAudio);
    assert.doesNotThrow(() => playCitySound("BUILD_SUCCESS"));
    assert.doesNotThrow(disposeCityAudio);
  });
  await withWindow({ get localStorage() { throw new Error("denied"); }, get sessionStorage() { throw new Error("denied"); } }, () => {
    assert.equal(readCitySoundStorage("localStorage", CITY_SOUND_PREFERENCE), null);
    assert.doesNotThrow(() => writeCitySoundStorage("sessionStorage", "cue", "seen"));
  });
});
test("CITY mute preference and per-game same-browser cue markers never contain credentials", async () => {
  const values = new Map<string, string>();
  const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => values.set(key, value) };
  await withWindow({ localStorage: storage, sessionStorage: storage }, () => {
    writeCitySoundStorage("localStorage", CITY_SOUND_PREFERENCE, "false");
    assert.equal(readCitySoundStorage("localStorage", CITY_SOUND_PREFERENCE), "false");
    writeCitySoundStorage("sessionStorage", "city-window", "action-1");
    assert.equal(shouldAnnounceCityWindow(readCitySoundStorage("sessionStorage", "city-window"), "action-1", "self", "self"), false);
  });
  const source = readFileSync(new URL("../../src/features/city-role/city-role-sound.ts", import.meta.url), "utf8");
  assert.match(source, /if \(!enabled \|\| sessionReplaced\) return/);
  assert.match(source, /window.removeEventListener\("pointerdown", pointer\)/);
  assert.match(source, /window.removeEventListener\("keydown", keyboard\)/);
  assert.match(source, /seenWindows.current.has/);
  assert.match(source, /city-feedback-cue:/);
  assert.doesNotMatch(source, /sessionToken|credential|\.emit\(|fetch\(|deadlineAt\s*=/);
});

test("CITY coin, card, construction and theft voices schedule distinct sound with physical textures", async () => {
 for (const cue of ['COIN_GAIN','DRAW','BUILD','STEAL'] as const) await withWindow({AudioContext:FakeAudioContext},()=>{
  unlockCityAudio();const audio=FakeAudioContext.instances[0]!;playCityImpactSound(cue);
  assert.deepEqual(audio.frequencies,CITY_SOUND_CUES[cue].frequencies);
  assert.equal(audio.noiseSources,cue==='COIN_GAIN'?0:1);
 });
});
test("CITY volume clamps stored input, scales bystanders and zero volume drops notes",async()=>{
 let volume='100';await withWindow({AudioContext:FakeAudioContext,localStorage:{getItem:(key:string)=>key===CITY_SOUND_VOLUME?volume:'true'}},()=>{
  unlockCityAudio();const audio=FakeAudioContext.instances[0]!;playCityImpactSound('COIN_GAIN',.45);
  assert.ok(audio.gains.every(g=>Math.abs(g-CITY_SOUND_CUES.COIN_GAIN.gain*.45)<1e-10));
  const count=audio.frequencies.length;volume='0';playCityImpactSound('DRAW');assert.equal(audio.frequencies.length,count);
  volume='200';assert.equal(readCitySoundVolume(),100);volume='NaN';assert.equal(readCitySoundVolume(),80);
 });
});
test("CITY combined resource events use the immediate action sound instead of a delayed banner queue",()=>{
 const events=[{id:'gold',cue:'COIN_GAIN' as const,intensity:'medium' as const,message:'gold'},{id:'build',cue:'BUILD' as const,intensity:'medium' as const,message:'build'},{id:'steal',cue:'STEAL' as const,intensity:'medium' as const,message:'steal'}];
 assert.equal(cityImpactSoundEvent(events)?.cue,'STEAL');assert.equal(cityImpactSoundEvent(events.slice(0,2))?.cue,'BUILD');assert.equal(cityImpactSoundEvent([]),undefined);
});
