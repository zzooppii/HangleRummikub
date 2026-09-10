import { useId, useState } from "react";
import { ISLAND_BOARD, type IslandPlayingPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import { BuildingArt, ISLAND_COLORS, ISLAND_LABELS, TERRAIN_COLORS } from "./art.js";
type Game = IslandPlayingPlatformSnapshotV2["game"];
export type IslandTarget = Readonly<{ kind: "edge" | "vertex" | "hex"; id: number }>;
type Props = Readonly<{ game: Pick<Game, "hexes" | "ports" | "buildings" | "roads" | "robber" | "dice" | "playerStates">; targets?: readonly IslandTarget[]; selected?: IslandTarget | null; onSelect?(target: IslandTarget): void; enabled?: boolean }>;
const scale = 68, cx = 370, cy = 335;
const point = (x: number, y: number) => [cx + x * scale, cy + y * scale] as const;
export function IslandBoard({ game, targets = [], selected = null, onSelect, enabled = false }: Props) {
  const uid = useId().replace(/:/g, ""), [zoom, setZoom] = useState(false);
  const color = (id: string) => ISLAND_COLORS[Math.max(0, game.playerStates.findIndex(p => p.playerId === id)) % 4]!;
  const rolled = game.dice ? game.dice[0] + game.dice[1] : null;
  const polygons = ISLAND_BOARD.hexes.map(h => h.vertices.map(i => { const v = ISLAND_BOARD.vertices[i]!; return point(v.x, v.y).join(","); }).join(" "));
  function targetXY(t: IslandTarget) {
    if (t.kind === "hex") { const h = ISLAND_BOARD.hexes[t.id]!; return point(h.x, h.y); }
    if (t.kind === "vertex") { const v = ISLAND_BOARD.vertices[t.id]!; return point(v.x, v.y); }
    const e = ISLAND_BOARD.edges[t.id]!, a = ISLAND_BOARD.vertices[e.a]!, b = ISLAND_BOARD.vertices[e.b]!;
    return point((a.x + b.x) / 2, (a.y + b.y) / 2);
  }
  return <section className={"island-board-surface" + (zoom ? " zoomed" : "")} aria-label="섬 보드">
    <div className="island-board-toolbar"><span>THE ISLAND <span>공유 보드</span></span><button type="button" onClick={() => setZoom(!zoom)} aria-pressed={zoom}>{zoom ? "축소 보기" : "확대해서 보기"}</button></div>
    <div className="island-map-scroll">
      <div className="island-map-inner">
        <svg viewBox="0 0 740 660" className="island-map-svg" role="img" aria-label="자원 지형 19개와 도로, 마을, 항구를 표시하는 보드">
          <defs>
            <radialGradient id={uid + "-sea"}><stop stopColor="#378a81"/><stop offset=".75" stopColor="#1e5c60"/><stop offset="1" stopColor="#183f47"/></radialGradient>
            <filter id={uid + "-shadow"} x="-30%" y="-30%" width="160%" height="170%"><feDropShadow dx="0" dy="9" stdDeviation="7" floodColor="#082d32" floodOpacity=".4"/></filter>
            <pattern id={uid + "-water"} width="65" height="40" patternUnits="userSpaceOnUse"><path d="M10 18q10-5 20 0m17 17q7-4 14 0" fill="none" stroke="#a0d2c3" strokeWidth="1" opacity=".12"/></pattern>
            {game.hexes.map(h => <clipPath id={uid + "-h" + h.id} key={h.id}><polygon points={polygons[h.id]}/></clipPath>)}
          </defs>
          <rect width="740" height="660" fill={"url(#" + uid + "-sea)"}/><rect width="740" height="660" fill={"url(#" + uid + "-water)"}/>
          <g opacity=".4" fill="none" stroke="#a9d5c4"><ellipse cx="370" cy="335" rx="323" ry="306" strokeDasharray="1 12"/><path d="M41 105h22m-11-11v22M681 544h16m-8-8v16"/></g>
          <g filter={"url(#" + uid + "-shadow)"}>{game.hexes.map(h => <polygon key={h.id} points={polygons[h.id]} transform="translate(0 5)" fill="#877e53" stroke="#dfcda0" strokeWidth="9" strokeLinejoin="round"/>)}</g>
          {game.hexes.map(h => {
            const geo = ISLAND_BOARD.hexes[h.id]!, [x, y] = point(geo.x, geo.y), resource = h.resource;
            const produced = rolled === h.number && game.robber !== h.id;
            return <g key={h.id}>
              <polygon points={polygons[h.id]} fill={TERRAIN_COLORS[resource ?? "DESERT"]} stroke="#d8cd96" strokeWidth="3" strokeLinejoin="round"/>
              <g clipPath={"url(#" + uid + "-h" + h.id + ")"} opacity=".48">
                {resource === "WOOD" ? Array.from({ length: 7 }, (_, i) => <g key={i} transform={"translate(" + (x - 43 + i % 4 * 29) + " " + (y - 38 + Math.floor(i / 4) * 68) + ")"}><path d="m0 0-11 19h7l-10 14h28L4 19h7z" fill="#164f3e"/><path d="M0 33v9" stroke="#c3bb72" strokeWidth="3"/></g>) :
                  resource === "ORE" ? <><path d={"M" + (x - 75) + " " + (y + 52) + "l42-84 45 84 24-60 37 71z"} fill="#3e6470"/><path d={"m" + (x - 33) + " " + (y - 32) + "-12 24 12-5 11 5z"} fill="#eef0d6"/></> :
                  resource === "GRAIN" ? Array.from({ length: 7 }, (_, i) => <path key={i} d={"M" + (x - 87 + i * 26) + " " + (y + 72) + "l70-143"} stroke={i % 2 ? "#8a6d2a" : "#f3d97a"} strokeWidth="9"/>) :
                  resource === "BRICK" ? <><path d={"M" + (x - 65) + " " + (y + 42) + "q22-64 49-10t76-33v80h-125z"} fill="#964c38"/><path d={"M" + (x - 65) + " " + (y + 27) + "q35-15 51 0t69-19"} fill="none" stroke="#e9a875" strokeWidth="5"/></> :
                  resource === "WOOL" ? <><path d={"M" + (x - 65) + " " + (y + 35) + "q39-29 78-9t68-8v70h-156z"} fill="#5e934e"/>{[-36, 35].map((dx, i) => <g key={dx} transform={"translate(" + (x + dx) + " " + (y - 36 + i * 75) + ")"}><ellipse rx="9" ry="6" fill="#fff6d6"/><circle cx="8" cy="2" r="4" fill="#355b42"/></g>)}</> :
                  <><path d={"M" + (x - 74) + " " + (y + 20) + "q55-65 140 10M" + (x - 65) + " " + (y + 48) + "q55-47 130-2"} stroke="#a78558" strokeWidth="14" fill="none"/></>}
              </g>
              {produced && <polygon points={polygons[h.id]} fill="none" stroke="#ffed9c" strokeWidth="5" className="island-produced"/>}
              {h.number !== null ? <g transform={"translate(" + x + " " + (y + 2) + ")"}><circle cy="3" r="24" fill="#533f2b" opacity=".25"/><circle r="24" fill="#fff0c8" stroke="#cbb687" strokeWidth="2"/><text textAnchor="middle" y="4" className={h.number === 6 || h.number === 8 ? "island-number red" : "island-number"}>{h.number}</text><text textAnchor="middle" y="16" fill="#8b7250" fontSize="12" letterSpacing="1">{Array.from({ length: 6 - Math.abs(7 - h.number) }, () => "•").join("")}</text></g> : null}
              {game.robber === h.id && <g transform={"translate(" + (x + (h.number ? 30 : 0)) + " " + (y - 5) + ")"}><ellipse cy="23" rx="16" ry="5" fill="#203b34" opacity=".35"/><path d="M-13 22-8 5h16l5 17z" fill="#21343b" stroke="#d2c4a0" strokeWidth="1.5"/><circle cy="-4" r="10" fill="#2c4148" stroke="#d2c4a0" strokeWidth="1.5"/><path d="M-7-5h14" stroke="#d2c4a0" strokeWidth="2"/></g>}
              <title>{(resource ? ISLAND_LABELS[resource] : "사막") + (h.number ? " · " + h.number : "") + (game.robber === h.id ? " · 도둑" : "")}</title>
            </g>;
          })}
          {game.ports.map(p => { const e = ISLAND_BOARD.edges[p.edge]!, a = ISLAND_BOARD.vertices[e.a]!, b = ISLAND_BOARD.vertices[e.b]!, mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2; const [x, y] = point(mx * 1.15, my * 1.15), [tx, ty] = point(mx, my);
            return <g key={p.edge}><path d={"M" + tx + " " + ty + "L" + x + " " + y} stroke="#d6c7a0" strokeWidth="4" strokeDasharray="5 3"/><rect x={x - 28} y={y - 17} width="56" height="34" rx="10" fill="#173f44" stroke="#77ada5"/><text x={x} y={y - 1} textAnchor="middle" fill="#f6e5be" fontSize="13" fontWeight="700">{p.resource ? ISLAND_LABELS[p.resource] : "항구"}</text><text x={x} y={y + 12} textAnchor="middle" fill="#b9d7cf" fontSize="12">{p.resource ? "2:1" : "3:1"}</text></g>;
          })}
          {game.roads.map(road => { const edge = ISLAND_BOARD.edges[road.edge]!, a = ISLAND_BOARD.vertices[edge.a]!, b = ISLAND_BOARD.vertices[edge.b]!, [x1, y1] = point(a.x, a.y), [x2, y2] = point(b.x, b.y); return <g key={road.edge}><line x1={x1} y1={y1 + 3} x2={x2} y2={y2 + 3} stroke="#273d35" strokeWidth="11" strokeLinecap="round"/><line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color(road.playerId)} strokeWidth="9" strokeLinecap="round"/><line x1={x1} y1={y1 - 2} x2={x2} y2={y2 - 2} stroke="#fff" opacity=".22" strokeWidth="2"/></g>; })}
          {game.buildings.map(b => { const vertex = ISLAND_BOARD.vertices[b.vertex]!, [x, y] = point(vertex.x, vertex.y); return <g key={b.vertex} transform={"translate(" + x + " " + y + ") scale(1.1)"}><BuildingArt city={b.kind === "CITY"} color={color(b.playerId)}/></g>; })}
          {selected && (() => { const [x, y] = targetXY(selected); return <g transform={"translate(" + x + " " + y + ")"}><circle r="25" stroke="#fff4bb" fill="#ffffff22" strokeWidth="3" strokeDasharray="5 3"/><circle r="4" fill="#fff4bb"/></g>; })()}
        </svg>
        {targets.map(t => { const [x, y] = targetXY(t), chosen = selected?.kind === t.kind && selected.id === t.id;
          return <button key={t.kind + t.id} type="button" className={"island-map-target " + t.kind + (chosen ? " selected" : "")} style={{ left: x / 740 * 100 + "%", top: y / 660 * 100 + "%" }}
            disabled={!enabled} onClick={() => onSelect?.(t)} aria-label={(t.kind === "edge" ? "도로 " : t.kind === "vertex" ? "교차점 " : "지형 ") + (t.id + 1) + " 선택"} aria-pressed={chosen}><span>{chosen ? "✓" : "+"}</span></button>;
        })}
      </div>
    </div>
    <div className="island-board-caption"><span>● 6 · 8은 생산 확률이 높은 숫자</span><span>도로는 변에 · 마을은 꼭짓점에</span></div>
  </section>;
}
