export const LUNCH_CUES = {
  BITE: [310, 410], SUSPICIOUS: [240, 230], WATCHING: [150, 110], FAKE: [340, 440], CAUGHT: [155, 105, 82],
  BOX: [660, 880], START: [440, 660, 880], VICTORY: [523, 659, 784, 1046], TEACHER_WIN: [740, 554, 370], FINISH: [440, 660],
} as const;
export type LunchCue = keyof typeof LUNCH_CUES;
export class LunchAudio {
  private context: AudioContext | null = null;
  private lastBite = -1;
  enabled = false;
  unlock() {
    if (!this.enabled || typeof window === "undefined" || !window.AudioContext) return;
    try { this.context ??= new AudioContext(); void this.context.resume().catch(() => undefined); } catch { /* Audio is optional; visual feedback remains. */ }
  }
  play(cue: LunchCue) {
    const ctx = this.context;
    if (!this.enabled || ctx?.state !== "running") return;
    if (cue === "BITE" && ctx.currentTime - this.lastBite < .16) return;
    if (cue === "BITE") this.lastBite = ctx.currentTime;
    // Original short foley: a tiny chopstick/crunch, stopped chalk, or desk tap.
    // No teacher timing/outcome is consulted; this runs only for an already public cue.
    if(cue==="BITE"||cue==="SUSPICIOUS"||cue==="WATCHING"||cue==="CAUGHT") {
      const duration=cue==="BITE"?.055:cue==="SUSPICIOUS"?.095:.13;
      const buffer=ctx.createBuffer(1,Math.ceil(ctx.sampleRate*duration),ctx.sampleRate),data=buffer.getChannelData(0);
      let noise=9173;for(let i=0;i<data.length;i++){noise=(noise*16807)%2147483647;data[i]=(noise/1073741823.5-1)*(1-i/data.length);}
      const source=ctx.createBufferSource(),filter=ctx.createBiquadFilter(),gain=ctx.createGain();source.buffer=buffer;
      filter.type="bandpass";filter.frequency.value=cue==="BITE"?1900:cue==="SUSPICIOUS"?3300:430;filter.Q.value=.8;
      gain.gain.setValueAtTime(cue==="BITE"?.018:.035,ctx.currentTime);gain.gain.exponentialRampToValueAtTime(.0001,ctx.currentTime+duration);
      source.connect(filter);filter.connect(gain);gain.connect(ctx.destination);source.start();source.onended=()=>{source.disconnect();filter.disconnect();gain.disconnect();};
    }
    for (const [i, hz] of LUNCH_CUES[cue].entries()) {
      const osc = ctx.createOscillator(), gain = ctx.createGain(), time = ctx.currentTime + i * (cue === "BITE" ? .025 : .085);
      osc.type = cue === "CAUGHT" || cue === "WATCHING" ? "sine" : "triangle";
      osc.frequency.setValueAtTime(hz, time); osc.frequency.exponentialRampToValueAtTime(hz * .8, time + .08);
      gain.gain.setValueAtTime(.0001, time); gain.gain.exponentialRampToValueAtTime(cue === "BITE" ? .008 : .035, time + .008);
      gain.gain.exponentialRampToValueAtTime(.0001, time + .12);
      osc.connect(gain); gain.connect(ctx.destination); osc.start(time); osc.stop(time + .14);
      osc.onended = () => { osc.disconnect(); gain.disconnect(); };
    }
  }
  close() { void this.context?.close().catch(() => undefined); this.context = null; }
}
