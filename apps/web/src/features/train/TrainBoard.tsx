import { useRef, useState, type PointerEvent } from 'react';
import { TRAIN_CITIES, TRAIN_ROUTES, trainCityName, type TrainProjection, type TrainRoute } from '@hangul-rummikub/shared';
import { TRAIN_PAINT, TRAIN_SYMBOLS, TRAIN_PLAYER_PAINT, TRAIN_LABELS } from './ui.js';
const bends: Record<string, number> = { 'calgary--vancouver': -42, 'calgary--winnipeg': -20, 'helena--seattle': -20, 'portland--san-francisco': 35, 'los-angeles--san-francisco': 18, 'el-paso--los-angeles': 52, 'el-paso--houston': 48, 'miami--new-orleans': -42, 'atlanta--miami': 28, 'duluth--toronto': 45, 'montreal--sault-st-marie': -30, 'montreal--new-york': -24, 'denver--phoenix': -35, 'helena--omaha': -15 };
export function trainRouteGeometry(r: TrainRoute) { const a = TRAIN_CITIES.find(c => c.cityId === r.a)!, b = TRAIN_CITIES.find(c => c.cityId === r.b)!, dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy), parallel = TRAIN_ROUTES.filter(x => x.group === r.group).length > 1, offset = parallel ? (r.lane === 0 ? -8 : 8) : 0, bend = bends[r.group] ?? 0, nx = -dy / d, ny = dx / d; const ax = a.x + nx * offset, ay = a.y + ny * offset, bx = b.x + nx * offset, by = b.y + ny * offset, cx = (ax + bx) / 2 + nx * bend, cy = (ay + by) / 2 + ny * bend; return { path: `M ${ax} ${ay} Q ${cx} ${cy} ${bx} ${by}`, segments: Array.from({ length: r.length }, (_, i) => { const t = (i + .5) / r.length, u = 1 - t; return { x: u * u * ax + 2 * u * t * cx + t * t * bx, y: u * u * ay + 2 * u * t * cy + t * t * by, angle: Math.atan2(2 * u * (cy - ay) + 2 * t * (by - cy), 2 * u * (cx - ax) + 2 * t * (bx - cx)) * 180 / Math.PI, width: Math.min(38, Math.max(12, (d - 20) / r.length - 5)) }; }) }; }
export function TrainBoard({ game: g, selected, onSelect, highlight = [], names }: {
    game: TrainProjection;
    selected: string | null;
    onSelect(id: string): void;
    highlight?: string[];
    names: Readonly<Record<string, string>>;
}) {
    const [zoom, setZoom] = useState(1), [pan, setPan] = useState({ x: 0, y: 0 });
    const svg = useRef<SVGSVGElement | null>(null), points = useRef(new Map<number, {
        x: number;
        y: number;
    }>()), gesture = useRef<{
        x: number;
        y: number;
        pan: {
            x: number;
            y: number;
        };
        distance: number;
        zoom: number;
    } | null>(null), moved = useRef(false);
    function begin(e: PointerEvent<SVGSVGElement>) { if (e.pointerType === 'mouse' && e.button !== 0)
        return; points.current.set(e.pointerId, { x: e.clientX, y: e.clientY }); const all = [...points.current.values()]; gesture.current = { x: e.clientX, y: e.clientY, pan: { ...pan }, distance: all.length === 2 ? Math.hypot(all[0]!.x - all[1]!.x, all[0]!.y - all[1]!.y) : 0, zoom }; moved.current = false; }
    function move(e: PointerEvent<SVGSVGElement>) {
        if (!points.current.has(e.pointerId) || !gesture.current)
            return;
        points.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
        const start = gesture.current, all = [...points.current.values()], rect = svg.current?.getBoundingClientRect();
        if (!rect)
            return;
        if (all.length === 2 && start.distance > 0) {
            moved.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setZoom(Math.max(1, Math.min(3.5, start.zoom * Math.hypot(all[0]!.x - all[1]!.x, all[0]!.y - all[1]!.y) / start.distance)));
        }
        else if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > 5) {
            moved.current = true;
            e.currentTarget.setPointerCapture(e.pointerId);
            setPan({ x: Math.max(-500, Math.min(500, start.pan.x + (e.clientX - start.x) * 1200 / rect.width / zoom)), y: Math.max(-320, Math.min(320, start.pan.y + (e.clientY - start.y) * 800 / rect.height / zoom)) });
        }
    }
    function end(e: PointerEvent<SVGSVGElement>) { points.current.delete(e.pointerId); gesture.current = null; if (e.currentTarget.hasPointerCapture(e.pointerId))
        e.currentTarget.releasePointerCapture(e.pointerId); }
    const w = 1200 / zoom, h = 800 / zoom;
    return <div className="tr-map-shell"><div className="tr-map-toolbar"><span>북아메리카 철도 지도</span><div><button aria-label="지도 축소" disabled={zoom <= 1} onClick={() => setZoom(z => Math.max(1, z - .4))}>−</button><button onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>전체 보기</button><button aria-label="지도 확대" disabled={zoom >= 3.5} onClick={() => setZoom(z => Math.min(3.5, z + .4))}>+</button></div></div>
 <svg className="tr-map" ref={svg} viewBox={`${(1200 - w) / 2 - pan.x} ${(800 - h) / 2 - pan.y} ${w} ${h}`} aria-label="미국판 36개 도시와 100개 노선. 노선을 눌러 비용을 확인하세요." onPointerDown={begin} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>
  <defs><pattern id="tr-paper" width="32" height="32" patternUnits="userSpaceOnUse"><path d="M0 16H32M16 0V32" stroke="#807858" strokeOpacity=".045"/></pattern><linearGradient id="tr-land" x2="1" y2="1"><stop stopColor="#f1e7cb"/><stop offset="1" stopColor="#ded7b9"/></linearGradient><filter id="tr-piece-shadow" x="-30%" y="-50%" width="160%" height="220%"><feDropShadow dx="0" dy="2" stdDeviation="1.2" floodOpacity=".35"/></filter></defs>
  <rect x="-1500" y="-1500" width="4200" height="3800" fill="#bdcfcb"/>
  <path d="M70 40L1120 40 1164 132 1140 210 1150 300 1130 400 1110 475 1142 580 1130 720 1095 760 1060 700 1020 657 927 645 870 710 765 735 680 709 574 719 484 714 360 704 274 725 206 684 146 656 98 561 53 480 54 387 35 317 55 227 64 144Z" fill="url(#tr-land)" stroke="#889d90" strokeWidth="3"/>
  <rect x="0" y="0" width="1200" height="800" fill="url(#tr-paper)"/>
  <g fill="none" stroke="#a99d7e" strokeWidth="1.5" opacity=".32">{Array.from({ length: 16 }, (_, i) => { const x = 220 + (i % 3) * 44, y = 150 + i * 25; return <path key={i} d={`M${x - 20} ${y + 24}l20 -32 24 32M${x - 5} ${y}l5 -8 6 9`}/>; })}<path d="M725 230Q710 370 750 440T800 610L842 680" stroke="#6c9ea4" strokeWidth="6"/><path d="M845 140q-55 55 10 74t55 20q-28 -42 -8 -57" fill="#bdcfcb" stroke="#829b93"/></g>
  <g fill="#61796f" opacity=".7" fontFamily="Georgia,serif" fontStyle="italic"><text x="415" y="54" fontSize="16">C A N A D A</text><text x="400" y="768" fontSize="16">M E X I C O</text><text transform="translate(29 560) rotate(-78)" fontSize="18">Pacific Ocean</text><text transform="translate(1171 476) rotate(80)" fontSize="18">Atlantic Ocean</text><text x="685" y="775" fontSize="15">Gulf of Mexico</text></g>
  {TRAIN_ROUTES.map(r => {
            const geometry = trainRouteGeometry(r), claim = g.claims.find(c => c.routeId === r.routeId), seat = g.playerStates.findIndex(p => p.playerId === claim?.playerId), paint = claim ? TRAIN_PLAYER_PAINT[seat] : TRAIN_PAINT[r.color], active = selected === r.routeId;
            return <g key={r.routeId} className={`tr-route ${active ? 'tr-selected' : ''} ${claim ? 'tr-owned' : ''}`} role="button" tabIndex={0} aria-label={`${trainCityName(r.a)} – ${trainCityName(r.b)}, ${TRAIN_LABELS[r.color]} ${r.length}칸${claim ? `, ${names[claim.playerId] ?? '플레이어'} 점유` : ''}`} onClick={() => { if (!moved.current)
                onSelect(r.routeId); }} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelect(r.routeId);
            } }}>
    <title>{trainCityName(r.a)} ↔ {trainCityName(r.b)} · {TRAIN_LABELS[r.color]} {r.length}칸</title>
    <path d={geometry.path} fill="none" stroke={active ? '#a87122' : '#62594a'} strokeWidth={active ? 20 : 12} opacity={active ? .7 : .35}/>
    {geometry.segments.map((p, i) => <g key={i} transform={`translate(${p.x} ${p.y}) rotate(${p.angle})`} className={g.feedback?.kind === 'CLAIM_ROUTE' && g.feedback.routeId === r.routeId ? 'tr-new-piece' : ''} style={{ animationDelay: `${i * 65}ms` }}>
     <rect x={-p.width / 2} y="-5" width={p.width} height="10" rx={claim ? 3 : 1} fill={paint} stroke={claim ? '#faf1ce' : '#786e56'} strokeWidth={claim ? 1.7 : 1} filter={claim ? 'url(#tr-piece-shadow)' : undefined}/>
     {claim ? <><path d={`M${-p.width / 2 + 4} -2h${Math.max(3, p.width - 8)}`} stroke="#ffffff" strokeOpacity=".7" strokeWidth="2"/><circle cx={-p.width / 2 + 4} cy="5" r="2" fill="#34312e"/><circle cx={p.width / 2 - 4} cy="5" r="2" fill="#34312e"/></> : <text y="3" textAnchor="middle" fontSize="8" fill={r.color === 'BLACK' ? '#fff0c9' : '#332d26'}>{TRAIN_SYMBOLS[r.color]}</text>}
    </g>)}<path d={geometry.path} fill="none" stroke="transparent" strokeWidth="22"/>
   </g>;
        })}
  {TRAIN_CITIES.map(c => <g key={c.cityId} className={highlight.includes(c.cityId) ? 'tr-highlight-city' : ''} pointerEvents="none"><circle cx={c.x} cy={c.y} r={highlight.includes(c.cityId) ? 17 : 7} fill={highlight.includes(c.cityId) ? '#f4cb65' : '#923c31'} stroke="#fff9de" strokeWidth="3"/><circle cx={c.x} cy={c.y} r="3" fill="#fff3c2"/><text x={c.x + (c.x > 1110 ? -12 : c.x < 110 ? 12 : 0)} y={c.y - 13} textAnchor={c.x > 1110 ? 'end' : c.x < 110 ? 'start' : 'middle'} fontSize="14" fontWeight="700" fill="#302e25" stroke="#f6efd7" strokeWidth="4" paintOrder="stroke">{c.label}</text></g>)}
  <g transform="translate(170 350)" fill="#8b7956" opacity=".55"><path d="M0 -34L6 -6 25 0 6 6 0 34 -6 6 -25 0 -6 -6Z"/><text y="-42" textAnchor="middle" fontSize="13">N</text></g>
 </svg><div className="tr-map-caption">노선 선택으로 비용 확인 · 드래그로 이동 · 손가락 두 개로 확대</div></div>;
}
