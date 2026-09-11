import { useEffect, useRef, useState } from "react";
import type { VegasProjection } from "@hangul-rummikub/shared";
export type VegasCue = 'PICK' | 'ROLL' | 'PLACE' | 'TIE' | 'PAYOUT' | 'TURN' | 'FINISH' | 'WARNING' | 'ERROR';
export function vegasTransitionCues(previous: VegasProjection | null, next: VegasProjection | null, self: string): VegasCue[] {
    if (!next)
        return [];
    if (!previous || previous.gameId !== next.gameId)
        return next.phase === 'PLAYING' && next.activePlayerId === self ? ['TURN'] : [];
    if (next.gameRevision <= previous.gameRevision)
        return [];
    const cues: VegasCue[] = [];
    if (next.phase === 'FINISHED') {
        return next.result.reason === 'FOUR_ROUNDS' ? ['PAYOUT', 'FINISH'] : [];
    }
    if (next.lastRound && next.lastRound.round > (previous.lastRound?.round ?? 0)) {
        if (next.lastRound.casinos.some(c => c.excludedPlayerIds.length > 0))
            cues.push('TIE');
        cues.push('PAYOUT');
    }
    else if (next.feedback)
        cues.push(next.feedback.kind);
    if (next.activePlayerId === self && (previous.phase !== 'PLAYING' || previous.turnId !== next.turnId))
        cues.push('TURN');
    return cues;
}
/** Short wooden impacts, filtered dice rattle, paper brush and soft lounge chimes. */
export class VegasAudio {
    private context: AudioContext | null = null;
    private master: GainNode | null = null;
    private volume = .6;
    private generation = 0;
    private lastPick = -1;
    constructor(private readonly createContext: () => AudioContext | null = () => typeof window !== 'undefined' && typeof window.AudioContext === 'function' ? new window.AudioContext() : null) { }
    unlock() { try {
        if (!this.context) {
            this.context = this.createContext();
            if (!this.context)
                return;
            this.master = this.context.createGain();
            this.master.gain.value = this.volume * .45;
            this.master.connect(this.context.destination);
        }
        if (this.context.state === 'suspended')
            void this.context.resume().catch(() => undefined);
    }
    catch {
        this.dispose();
    } }
    setVolume(n: number) { this.volume = Number.isFinite(n) ? Math.max(0, Math.min(1, n)) : 0; if (this.context && this.master)
        this.master.gain.setTargetAtTime(this.volume * .45, this.context.currentTime, .02); }
    private tone(hz: number, at: number, duration: number, level = .25) { const c = this.context, m = this.master; if (!c || !m)
        return; const o = c.createOscillator(), gain = c.createGain(); o.type = 'sine'; o.frequency.setValueAtTime(hz, at); o.frequency.exponentialRampToValueAtTime(hz * .985, at + duration); gain.gain.setValueAtTime(.0001, at); gain.gain.linearRampToValueAtTime(level, at + .004); gain.gain.exponentialRampToValueAtTime(.0001, at + duration); o.connect(gain); gain.connect(m); o.onended = () => { o.disconnect(); gain.disconnect(); }; o.start(at); o.stop(at + duration + .01); }
    private brush(at: number, duration: number, hz: number, level: number) { const c = this.context, m = this.master; if (!c || !m)
        return; const buffer = c.createBuffer(1, Math.ceil(c.sampleRate * duration), c.sampleRate), samples = buffer.getChannelData(0); let seed = 93; for (let i = 0; i < samples.length; i++) {
        seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
        samples[i] = (seed / 2147483648 - 1) * Math.exp(-i / (c.sampleRate * duration * .3));
    } const source = c.createBufferSource(), filter = c.createBiquadFilter(), gain = c.createGain(); source.buffer = buffer; filter.type = 'bandpass'; filter.frequency.value = hz; filter.Q.value = .8; gain.gain.value = level; source.connect(filter); filter.connect(gain); gain.connect(m); source.onended = () => { source.disconnect(); filter.disconnect(); gain.disconnect(); }; source.start(at); source.stop(at + duration); }
    play(cues: readonly VegasCue[]) {
        const c = this.context, gen = this.generation;
        if (!c || !this.master || !this.volume)
            return;
        const render = () => {
            if (gen !== this.generation || c.state !== 'running' || !this.volume)
                return;
            if (c.currentTime - this.lastPick < .055 && cues.every(c => c === 'PICK'))
                return;
            this.lastPick = c.currentTime;
            let at = c.currentTime + .01;
            try {
                for (const cue of cues) {
                    if (cue === 'ROLL') {
                        for (let i = 0; i < 9; i++) {
                            const t = at + i * .045 + i * i * .0015;
                            this.brush(t, .07, 1200 + (i % 3) * 450, .38);
                            this.tone(360 + (i % 4) * 95, t, .065, .18);
                        }
                        at += .7;
                    }
                    else if (cue === 'PLACE') {
                        this.brush(at, .09, 700, .32);
                        this.tone(310, at, .12, .32);
                        this.tone(520, at + .035, .08, .15);
                        at += .22;
                    }
                    else if (cue === 'PAYOUT') {
                        this.brush(at, .28, 2800, .24);
                        [880, 1174.66, 1318.51].forEach((n, i) => this.tone(n, at + i * .1, .35, .18));
                        at += .6;
                    }
                    else if (cue === 'FINISH') {
                        [523.25, 659.25, 783.99, 1046.5].forEach((n, i) => this.tone(n, at + i * .14, .7, .22));
                        at += 1.2;
                    }
                    else if (cue === 'TURN') {
                        this.tone(659.25, at, .26, .2);
                        this.tone(987.77, at + .15, .4, .2);
                        at += .6;
                    }
                    else if (cue === 'TIE') {
                        this.tone(440, at, .2, .15);
                        this.tone(329.63, at + .09, .22, .15);
                        at += .35;
                    }
                    else {
                        this.tone(cue === 'ERROR' ? 220 : cue === 'WARNING' ? 830 : 740, at, .11, .15);
                        at += .18;
                    }
                }
            }
            catch {
                return;
            }
        };
        if (c.state === 'suspended')
            void c.resume().then(render).catch(() => undefined);
        else
            render();
    }
    dispose() { this.generation++; const c = this.context; this.context = null; this.master = null; try {
        if (c && c.state !== 'closed')
            void c.close().catch(() => undefined);
    }
    catch {
        return;
    } }
}
const key = 'vegas:sound-volume';
export function useVegasSound(game: VegasProjection | null, self: string, connected: boolean) {
    const [volume, setVolume] = useState(() => { try {
        const stored = localStorage.getItem(key);
        return stored !== null && Number.isFinite(Number(stored)) ? Math.min(100, Math.max(0, Number(stored))) : 60;
    }
    catch {
        return 60;
    } });
    const audio = useRef<VegasAudio | null>(null), previous = useRef(game), wasConnected = useRef(connected);
    useEffect(() => () => { audio.current?.dispose(); audio.current = null; }, []);
    useEffect(() => { const cues = vegasTransitionCues(previous.current, game, self); previous.current = game; if (connected && wasConnected.current)
        audio.current?.play(cues); wasConnected.current = connected; }, [game, self, connected]);
    function unlock() { if (volume === 0)
        return; audio.current ??= new VegasAudio(); audio.current.setVolume(volume / 100); audio.current.unlock(); }
    function play(cue: VegasCue) { unlock(); audio.current?.play([cue]); }
    function changeVolume(n: number) { const next = Number.isFinite(n) ? Math.max(0, Math.min(100, n)) : 0; setVolume(next); try {
        localStorage.setItem(key, String(next));
    }
    catch { /* Stored only for this page when storage is unavailable. */ } audio.current ??= new VegasAudio(); audio.current.setVolume(next / 100); if (next > 0)
        audio.current.unlock(); }
    return { volume, unlock, play, changeVolume };
}
