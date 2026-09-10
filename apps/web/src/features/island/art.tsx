import { useId } from "react";
import { ISLAND_BOARD, type IslandResource } from "@hangul-rummikub/shared";
export const ISLAND_LABELS: Record<IslandResource, string> = { WOOD: "목재", BRICK: "벽돌", WOOL: "양모", GRAIN: "곡물", ORE: "광석" };
export const ISLAND_COLORS = ["#df6b43", "#5799e5", "#e7bd54", "#b08ce2"] as const;
export const TERRAIN_COLORS: Record<IslandResource | "DESERT", string> = { WOOD: "#337a58", BRICK: "#c5744e", WOOL: "#91b760", GRAIN: "#dbb747", ORE: "#748b96", DESERT: "#d8b890" };

export function ResourceArt({ resource }: { resource: IslandResource }) {
  return <svg viewBox="0 0 48 48" fill="none" aria-hidden="true" className="island-resource-art">
    {resource === "WOOD" ? <><path d="m8 18 20-9 14 8-20 11z" fill="#a57041"/><path d="m8 18 14 10v12L8 31z" fill="#724b31"/><path d="m22 28 20-11v12L22 40z" fill="#bd925b"/><path d="m13 14 14 8m-6-11 14 8m-7 11 9-5" stroke="#d1ad77" strokeWidth="2" strokeLinecap="round"/></> :
    resource === "BRICK" ? <><path d="m5 23 22-9 17 9-22 10z" fill="#df8965"/><path d="m5 23 17 10v10L5 33z" fill="#a94f3c"/><path d="m22 33 22-10v10L22 43z" fill="#bd664d"/><path d="m8 10 19-7 14 8-20 8z" fill="#eda383"/><path d="m8 10 13 9v8L8 19z" fill="#b56045"/><path d="m21 19 20-8v8l-20 8z" fill="#ce7859"/></> :
    resource === "WOOL" ? <><path d="M13 31v10m19-11v11" stroke="#596052" strokeWidth="4" strokeLinecap="round"/><path d="M9 29C1 21 9 11 16 14c3-12 17-10 19 0 12-1 13 17 3 20-5 9-14 6-17 2-8 5-14 0-12-7" fill="#f7f4dc"/><path d="M30 15c8-3 14 2 12 10l-4 7-7-4z" fill="#616557"/><circle cx="37" cy="21" r="1.7" fill="#fff"/><path d="m12 18 3-3m4 12 3-3" stroke="#dedec7" strokeWidth="2" strokeLinecap="round"/></> :
    resource === "GRAIN" ? <><path d="m16 42 16-36M25 41l10-24" stroke="#785c29" strokeWidth="3" strokeLinecap="round"/><path d="M30 15C20 15 17 5 22 3c7 0 9 5 8 12m-4 10c-10 0-14-10-9-12 7 0 10 5 9 12m-4 10c-10 0-14-10-9-12 7 0 10 5 9 12M30 16c1-10 10-15 13-10 0 7-5 10-13 10m-4 10c1-10 10-15 13-10 0 7-5 10-13 10m-4 10c1-10 10-15 13-10 0 7-5 10-13 10" fill="#efd171"/></> :
    <><path d="M4 31 16 13l19 2 10 17-18 11z" fill="#91a7b7"/><path d="m16 13 11 30L4 31z" fill="#596f81"/><path d="m16 13 19 2-10 10z" fill="#c1ced5"/><path d="m25 25 20 7-18 11z" fill="#738ba0"/><path d="m23 6 8-3 9 9-12 2z" fill="#b5c5cc"/></>}
  </svg>;
}
export function BuildingArt({ city = false, color }: { city?: boolean; color: string }) {
  return <g>
    <ellipse cy="9" rx={city ? 15 : 11} ry="5" fill="#14362f" opacity=".3"/>
    {city ? <><path d="M-14-5-6-13 3-8v17h-17zM3-8l7-7 9 6v18H3z" fill={color} stroke="#263c36" strokeWidth="1.3"/><path d="m-14-5 8 5L3-8m0 0 7 5 9-6M-6 0v9M10-3v12" stroke="#fff" strokeOpacity=".35" strokeWidth="1.2"/><path d="M-2 3h3v6h-3m13-8h3v4h-3" fill="#233a36"/></> :
    <><path d="m-11-2 8-11L9-6 13 3v9H-2l-9-5z" fill={color} stroke="#263c36" strokeWidth="1.3"/><path d="M-11-2-2 3 9-6M-2 3v9" stroke="#fff" strokeOpacity=".4"/><path d="M4 6h4v6H4" fill="#263c36"/></>}
  </g>;
}
export function IslandEmblem() {
  const id = useId().replace(/:/g, "");
  return <svg viewBox="0 0 240 210" className="island-emblem" role="img" aria-label="바다 위 지형과 마을">
    <defs><radialGradient id={id}><stop stopColor="#3d9188"/><stop offset="1" stopColor="#163e43"/></radialGradient></defs>
    <ellipse cx="120" cy="114" rx="113" ry="80" fill={"url(#" + id + ")"}/>
    <g transform="translate(120 102) scale(22)">{ISLAND_BOARD.hexes.filter(h => Math.abs(h.q) <= 1 && Math.abs(h.r) <= 1 && Math.abs(h.q + h.r) <= 1).map((h, i) => <polygon key={h.id} points={h.vertices.map(v => ISLAND_BOARD.vertices[v]!.x + "," + ISLAND_BOARD.vertices[v]!.y).join(" ")} fill={Object.values(TERRAIN_COLORS)[i % 6]} stroke="#d7cd91" strokeWidth=".06"/>)}</g>
    <g transform="translate(120 82) scale(1.3)"><BuildingArt color={ISLAND_COLORS[0]}/></g><g transform="translate(160 132)"><BuildingArt color={ISLAND_COLORS[1]} city/></g>
    <path d="M33 164q18-9 33 0m90 12q19-8 38-1M45 52q15-7 30 0" stroke="#c1e4d7" opacity=".5" fill="none" strokeWidth="2" strokeLinecap="round"/>
  </svg>;
}
