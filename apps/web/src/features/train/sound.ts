import { useEffect, useRef, useState } from 'react';
import type { TrainProjection } from '@hangul-rummikub/shared';
export type TrainCue = 'PICK' | 'DRAW_DECK' | 'DRAW_MARKET' | 'CLAIM_ROUTE' | 'DRAW_TICKETS' | 'KEEP_TICKETS' | 'PASS' | 'TURN' | 'FINISH' | 'ERROR' | 'COMPLETE';
export function trainTransitionCues(previous: TrainProjection | null, next: TrainProjection | null, self: string): TrainCue[] {
    if (!previous || !next || previous.gameId !== next.gameId || next.gameRevision <= previous.gameRevision)
        return [];
    if (next.phase === 'FINISHED')
        return next.result.reason === 'CANCELLED' ? [] : ['FINISH'];
    const cues: TrainCue[] = next.feedback ? [next.feedback.kind] : [];
    if (next.privateState.tickets.some(t => t.completed && previous.privateState.tickets.some(p => p.cardId === t.cardId && !p.completed)))
        cues.push('COMPLETE');
    if (next.activePlayerId === self && (previous.phase !== 'PLAYING' || previous.activePlayerId !== self))
        cues.push('TURN');
    return cues;
}
/** Paper cards, rhythmic wheel clicks, a soft two-note steam whistle and station bells. */
export class TrainAudio {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private volume = .55;
    private lastPick = -1;
    constructor(private readonly factory: () => AudioContext | null = () => typeof window !== 'undefined' && typeof window.AudioContext === 'function' ? new AudioContext() : null) { }
    unlock() { try {
        if (!this.context) {
            this.context = this.factory();
            if (!this.context)
                return;
            this.master = this.context.createGain();
            this.master.gain.value = this.volume * .35;
            this.master.connect(this.context.destination);
        }
        if (this.context.state === 'suspended')
            void this.context.resume().catch(() => undefined);
    }
    catch {
        this.dispose();
    } }
    setVolume(volume: number) { this.volume = Number.isFinite(volume) ? Math.max(0, Math.min(1, volume)) : 0; if (this.context && this.master)
        this.master.gain.setTargetAtTime(this.volume * .35, this.context.currentTime, .02); }
    private tone(hz: number, at: number, duration: number, level = .25) { const c = this.context, m = this.master; if (!c || !m)
        return; const tone = c.createOscillator(), gain = c.createGain(); tone.type = 'triangle'; tone.frequency.setValueAtTime(hz, at); gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(level, at + .004); gain.gain.exponentialRampToValueAtTime(.0001, at + duration); tone.connect(gain); gain.connect(m); tone.onended = () => { tone.disconnect(); gain.disconnect(); }; tone.start(at); tone.stop(at + duration + .01); }
    private paper(at: number) { const c = this.context, m = this.master; if (!c || !m)
        return; const b = c.createBuffer(1, Math.ceil(c.sampleRate * .18), c.sampleRate), samples = b.getChannelData(0); let seed = 17; for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = (seed / 2147483648 - 1) * Math.sin(Math.PI * i / samples.length) * .22;
    } const source = c.createBufferSource(), filter = c.createBiquadFilter(); source.buffer = b; filter.type = 'bandpass'; filter.frequency.value = 1700; source.connect(filter); filter.connect(m); source.onended = () => { source.disconnect(); filter.disconnect(); }; source.start(at); source.stop(at + .2); }
    play(cues: readonly TrainCue[]) {
        const c = this.context;
        if (!c || c.state !== 'running' || !this.volume)
            return;
        if (cues.every(cue => cue === 'PICK') && c.currentTime - this.lastPick < .06)
            return;
        this.lastPick = c.currentTime;
        let at = c.currentTime + .01;
        for (const cue of cues) {
            if (cue === 'DRAW_DECK' || cue === 'DRAW_MARKET' || cue === 'DRAW_TICKETS' || cue === 'KEEP_TICKETS') {
                this.paper(at);
                at += .35;
            }
            else if (cue === 'COMPLETE') {
                [1046.5, 1568, 2093].forEach((hz, i) => this.tone(hz, at + i * .07, .4, .15));
                at += .5;
            }
            else if (cue === 'CLAIM_ROUTE') {
                [180, 220, 180, 240].forEach((hz, i) => this.tone(hz, at + i * .09, .09, .3));
                [523.25, 698.46].forEach(hz => this.tone(hz, at + .38, .65, .12));
                at += 1;
            }
            else if (cue === 'FINISH') {
                [392, 493.88, 587.33, 783.99].forEach((hz, i) => this.tone(hz, at + i * .15, .65));
                at += 1;
            }
            else if (cue === 'TURN') {
                this.tone(587.33, at, .22, .16);
                this.tone(783.99, at + .13, .35, .16);
                at += .5;
            }
            else if (cue === 'PASS') {
                [280, 420, 330].forEach((hz, i) => this.tone(hz, at + i * .07, .075, .3));
                at += .3;
            }
            else {
                this.tone(cue === 'ERROR' ? 196 : 640, at, .07, .15);
                at += .15;
            }
        }
    }
    dispose() { const c = this.context; this.context = null; this.master = null; if (c && c.state !== 'closed')
        void c.close().catch(() => undefined); }
}
const key = 'train:sound-volume';
export function useTrainSound(game: TrainProjection | null, self: string, connected: boolean) {
    const [volume, setVolume] = useState(() => { try {
        const value = localStorage.getItem(key);
        return value !== null && Number.isFinite(Number(value)) ? Math.max(0, Math.min(100, Number(value))) : 55;
    }
    catch {
        return 55;
    } });
    const audio = useRef<TrainAudio | null>(null), previous = useRef(game), online = useRef(connected);
    useEffect(() => () => { audio.current?.dispose(); audio.current = null; }, []);
    useEffect(() => { const cues = trainTransitionCues(previous.current, game, self); previous.current = game; if (connected && online.current)
        audio.current?.play(cues); online.current = connected; }, [game, self, connected]);
    function unlock() { if (volume === 0)
        return; audio.current ??= new TrainAudio(); audio.current.setVolume(volume / 100); audio.current.unlock(); }
    function play(cue: TrainCue) { unlock(); audio.current?.play([cue]); }
    function changeVolume(n: number) { const next = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; setVolume(next); try {
        localStorage.setItem(key, String(next));
    }
    catch { /* Volume remains in memory when browser storage is unavailable. */ } audio.current ??= new TrainAudio(); audio.current.setVolume(next / 100); if (next > 0)
        audio.current.unlock(); }
    return { volume, changeVolume, unlock, play };
}
