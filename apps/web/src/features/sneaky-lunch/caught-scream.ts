/** Original, deterministic voiced “악!”-like sting; no OS voice or downloaded audio. */
export const CAUGHT_SCREAM_SECONDS = .68;
export function createCaughtScreamSamples(sampleRate: number): Float32Array {
  if (!Number.isInteger(sampleRate) || sampleRate < 8000 || sampleRate > 192000) throw new Error("Invalid audio sample rate.");
  const samples = new Float32Array(Math.ceil(sampleRate * CAUGHT_SCREAM_SECONDS));
  let phase = 0, seed = 19373, peak = 0;
  for (let i = 0; i < samples.length; i++) {
    const t = i / sampleRate, position = t / CAUGHT_SCREAM_SECONDS;
    // Fast rising cry, falling rasp, then a clipped consonant-like ending.
    const pitch = (t < .085 ? 215 + t * 3300 : 495 - (t - .085) * 430) * (1 + .026 * Math.sin(t * 91));
    phase += 2 * Math.PI * pitch / sampleRate;
    let voice = 0;
    for (let harmonic = 1; harmonic <= 22 && harmonic * pitch < sampleRate * .45; harmonic++) {
      const frequency = harmonic * pitch;
      const weight = .12 / harmonic + Math.exp(-(((frequency - 850) / 230) ** 2))
        + .72 * Math.exp(-(((frequency - 1450) / 320) ** 2)) + .27 * Math.exp(-(((frequency - 2900) / 480) ** 2));
      voice += Math.sin(phase * harmonic) * weight;
    }
    seed = seed * 16807 % 2147483647;
    const breath = (seed / 1073741823.5 - 1) * .18;
    const envelope = Math.min(1, t / .006) * Math.min(1, (CAUGHT_SCREAM_SECONDS - t) / .075)
      * (1 - .24 * position);
    const value = Math.tanh(voice * 1.4 + breath) * envelope;
    samples[i] = value; peak = Math.max(peak, Math.abs(value));
  }
  // Near-full-scale transient, without digital clipping or changing device volume.
  if (peak) for (let i = 0; i < samples.length; i++) samples[i] = samples[i]! * .96 / peak;
  samples[samples.length - 1] = 0;
  return samples;
}
