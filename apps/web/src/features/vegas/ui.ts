import { VEGAS_FACES, vegasPayout, type PlayerId, type VegasFace, type VegasProjection } from "@hangul-rummikub/shared";
export const VEGAS_NAMES = ['골든 오르빗', '제이드 팰리스', '선버스트', '그랜드 오로라', '블루 팜', '로즈 리비에라'];
export const VEGAS_MARKS = ['●', '▲', '◆', '■', '✦'];
export const vegasMoney = (amount: number) => `$${amount.toLocaleString('en-US')}`;
export function vegasGroups(g: VegasProjection) { return VEGAS_FACES.map(face => ({ face, count: g.phase === 'PLAYING' ? g.rolled.filter(n => n === face).length : 0 })).filter(p => p.count > 0); }
export function previewVegas(g: VegasProjection, self: PlayerId, face: VegasFace | null) {
    const own = g.playerStates.findIndex(p => p.playerId === self);
    const count = g.phase === 'PLAYING' && g.activePlayerId === self && face !== null ? g.rolled.filter(n => n === face).length : 0;
    return g.casinos.map((notes, i) => { const counts = g.playerStates.map(p => p.casinoDice[i]!); if (own >= 0 && face === i + 1)
        counts[own]! += count; return { ...vegasPayout(counts, notes), counts, added: face === i + 1 ? count : 0 }; });
}
