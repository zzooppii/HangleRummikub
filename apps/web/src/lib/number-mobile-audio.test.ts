import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { disposeNumberTileAudio, NUMBER_TILE_AUDIO_CUES, playNumberTileSound, unlockNumberTileAudio } from "../features/number-tile/number-tile-sound.js";

class FakeAudioContext {
  static instances: FakeAudioContext[] = [];
  state = "suspended";
  currentTime = 10;
  destination = {};
  resumeCalls = 0;
  closeCalls = 0;
  blocked = false;
  frequencies: number[] = [];
  peaks: number[] = [];
  stops: number[] = [];
  ended: (() => void)[] = [];
  disconnected = 0;
  constructor() { FakeAudioContext.instances.push(this); }
  async resume() { this.resumeCalls++; if (this.blocked) throw new Error("autoplay blocked"); this.state = "running"; }
  async close() { this.closeCalls++; this.state = "closed"; }
  createOscillator() {
    return {
      type: "sine",
      frequency: { setValueAtTime: (value: number) => { this.frequencies.push(value); } },
      connect() {}, disconnect: () => { this.disconnected++; },
      addEventListener: (_event: string, listener: () => void) => { this.ended.push(listener); },
      start() {}, stop: (at: number) => { this.stops.push(at); },
    };
  }
  createGain() {
    return {
      gain: { setValueAtTime() {}, exponentialRampToValueAtTime: (value: number) => { if (value > 0.0001) this.peaks.push(value); } },
      connect() {}, disconnect: () => { this.disconnected++; },
    };
  }
}

async function withAudio(run: () => void | Promise<void>, audioWindow: object = { AudioContext: FakeAudioContext }) {
  disposeNumberTileAudio();
  const original = Object.getOwnPropertyDescriptor(globalThis, "window");
  Object.defineProperty(globalThis, "window", { configurable: true, value: audioWindow });
  FakeAudioContext.instances = [];
  try { await run(); }
  finally {
    disposeNumberTileAudio();
    if (original) Object.defineProperty(globalThis, "window", original);
    else Reflect.deleteProperty(globalThis, "window");
  }
}

test("Number audio first gesture unlocks one reused context; blocked earlier cue is never replayed", async () => {
  await withAudio(() => {
    playNumberTileSound("TURN_START");
    const context = FakeAudioContext.instances[0]!;
    assert.deepEqual(context.frequencies, []);
    assert.equal(context.resumeCalls, 0);
    unlockNumberTileAudio();
    unlockNumberTileAudio();
    assert.equal(context.resumeCalls, 1);
    assert.deepEqual(context.frequencies, []);
    playNumberTileSound("DRAW_SUCCESS");
    assert.deepEqual(context.frequencies, [...NUMBER_TILE_AUDIO_CUES.DRAW_SUCCESS.frequencies]);
    assert.equal(FakeAudioContext.instances.length, 1);
  });
});

test("Number autoplay resume rejection is safe and a later gesture can unlock without delayed feedback", async () => {
  await withAudio(async () => {
    playNumberTileSound("TURN_START");
    const context = FakeAudioContext.instances[0]!;
    context.blocked = true;
    unlockNumberTileAudio();
    await Promise.resolve();
    playNumberTileSound("SUBMIT_SUCCESS");
    assert.deepEqual(context.frequencies, []);
    context.blocked = false;
    unlockNumberTileAudio();
    assert.deepEqual(context.frequencies, []);
    playNumberTileSound("PASS_SUCCESS");
    assert.deepEqual(context.frequencies, [...NUMBER_TILE_AUDIO_CUES.PASS_SUCCESS.frequencies]);
  });
});

test("Number original cues distinguish TURN/SUBMIT from DRAW/PASS and disconnect each finished note", async () => {
  assert.ok(NUMBER_TILE_AUDIO_CUES.TURN_START.gain >= NUMBER_TILE_AUDIO_CUES.SUBMIT_SUCCESS.gain);
  assert.ok(NUMBER_TILE_AUDIO_CUES.SUBMIT_SUCCESS.gain > NUMBER_TILE_AUDIO_CUES.DRAW_SUCCESS.gain);
  assert.ok(NUMBER_TILE_AUDIO_CUES.DRAW_SUCCESS.gain > NUMBER_TILE_AUDIO_CUES.PASS_SUCCESS.gain);
  for (const cue of ["TURN_START", "SUBMIT_SUCCESS", "DRAW_SUCCESS", "PASS_SUCCESS"] as const) {
    await withAudio(() => {
      unlockNumberTileAudio();
      const context = FakeAudioContext.instances[0]!;
      playNumberTileSound(cue);
      const config = NUMBER_TILE_AUDIO_CUES[cue];
      assert.deepEqual(context.frequencies, [...config.frequencies]);
      assert.deepEqual(context.peaks, config.frequencies.map(() => config.gain));
      assert.ok(Math.abs(context.stops.at(-1)! - (10 + config.duration)) < 0.00001);
      context.ended.forEach(listener => listener());
      assert.equal(context.disconnected, config.frequencies.length * 2);
      context.currentTime += config.duration + 1;
      disposeNumberTileAudio();
      assert.equal(context.closeCalls, 1);
    });
  }
});

test("terminal Submit unmount lets an already-started cue finish, then closes the device", async () => {
  await withAudio(async () => {
    unlockNumberTileAudio();
    const context = FakeAudioContext.instances[0]!;
    playNumberTileSound("SUBMIT_SUCCESS");
    disposeNumberTileAudio();
    assert.equal(context.closeCalls, 0);
    await new Promise(resolve => setTimeout(resolve, 500));
    assert.equal(context.closeCalls, 1);
    assert.deepEqual(context.frequencies, [...NUMBER_TILE_AUDIO_CUES.SUBMIT_SUCCESS.frequencies]);
  });
});

test("unsupported or construction-failing Web Audio never escapes into gameplay", async () => {
  for (const audioWindow of [{}, { AudioContext: class { constructor() { throw new Error("device unavailable"); } } }]) {
    await withAudio(() => {
      assert.doesNotThrow(() => unlockNumberTileAudio());
      assert.doesNotThrow(() => playNumberTileSound("SUBMIT_SUCCESS"));
      assert.doesNotThrow(() => disposeNumberTileAudio());
    }, audioWindow);
  }
});

test("sound preference gates gesture unlock; accepted-current ack and request dedupe remain feedback owners", () => {
  const screen = readFileSync(new URL("../../src/features/number-tile/NumberTilePlayingScreen.tsx", import.meta.url), "utf8");
  const app = readFileSync(new URL("../../src/app/use-lobby-app.ts", import.meta.url), "utf8");
  assert.match(screen, /onPointerDownCapture=\{\(\) => \{ if \(soundEnabled\) unlockNumberTileAudio\(\)/);
  assert.match(screen, /onKeyDownCapture=[\s\S]*?soundEnabled[\s\S]*?"Enter"[\s\S]*?unlockNumberTileAudio/);
  assert.match(screen, /disposeNumberTileAudio\(\)/);
  assert.match(app, /markNumberTileActionFeedback/);
  assert.match(app, /readNumberTileSoundEnabled\(window.localStorage\)/);
  assert.match(app, /if \(application === "CURRENT"\) \{\s+setErrorMessage\(null\);\s+publishNumberActionFeedback\("SUBMIT", command.requestId\)/);
  assert.match(app, /if \(!acknowledgement.ok\) \{/);
});
