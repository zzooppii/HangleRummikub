import { useEffect, useId, useState } from "react";
import type { CityRoleId } from "@hangul-rummikub/shared";
import { CITY_CATEGORY_LABELS, CITY_ROLE_HELP, cityRoleOrder, type CityUiCard } from "./city-role-ui.js";

type Category = CityUiCard["category"];
type IconName = "coin" | "cards" | "exchange" | "compass" | "shield" | "market" | "plan" | "hammer" | "mask" | "civic" | "culture" | "landmark" | "hourglass" | "check";
const paths: Record<IconName, string> = {
  coin: "M5 10c0-3 22-3 22 0s-22 3-22 0m0 0v12c0 4 22 4 22 0V10M5 16c0 4 22 4 22 0M16 4v9m-3-7h6",
  cards: "M7 5h18v23H7zM7 8 3 10l3 17M25 7l4 3-2 15M11 10h10M11 14h7M11 22h10",
  exchange: "M5 10h21l-6-6M26 10l-6 6M27 22H6l6-6M6 22l6 6",
  compass: "M16 2v4m0 20v4M2 16h4m20 0h4M16 5a11 11 0 1 0 0 22 11 11 0 0 0 0-22M21 11l-3 7-7 3 3-7z",
  shield: "M16 3 27 8v8c0 7-11 13-11 13S5 23 5 16V8zM16 8v15M10 14h12",
  market: "M4 12 8 4h16l4 8M4 12v4h24v-4M7 16v12h18V16M12 28v-8h8v8M10 5l-2 7m8-7v7m6-7 2 7",
  plan: "M6 4h20v24H6zM10 9h12M10 13h5M10 23l6-8 6 8M16 8v17M12 25h8",
  hammer: "M9 3 5 9l8 5 4-6zM15 12 27 25l-4 4L11 15M18 6l6 3-3 5-5-3",
  mask: "M4 7c7 4 17 4 24 0v10c0 7-12 12-12 12S4 24 4 17zM8 14l5 2-5 2m16-4-5 2 5 2M12 23h8",
  civic: "M3 11 16 3l13 8zM5 28h22M4 24h24M8 13v9m8-9v9m8-9v9",
  culture: "M4 7h24v20H4zM3 4h26M7 8c0 7 5 8 5 8l-5 3v7m18-18c0 7-5 8-5 8l5 3v7M13 26V16h6v10",
  landmark: "M16 3v7M10 7l6-4 6 4M7 13c0 7 18 7 18 0zM16 19v5M4 25c0 5 24 5 24 0z",
  hourglass: "M7 3h18M7 29h18M9 4c0 8 4 10 7 12-3 2-7 4-7 12m14-24c0 8-4 10-7 12 3 2 7 4 7 12M11 24l5-5 5 5z",
  check: "M5 17l7 7L27 7",
};
const roleIcons: Record<CityRoleId, IconName> = { "CR-01": "mask", "CR-02": "coin", "CR-03": "exchange", "CR-04": "compass", "CR-05": "shield", "CR-06": "market", "CR-07": "plan", "CR-08": "hammer" };
const categoryIcons: Record<Category, IconName> = { CIVIC: "civic", CULTURE: "culture", TRADE: "market", GUARD: "shield", LANDMARK: "landmark" };
export const CITY_CATEGORY_HINTS: Readonly<Record<Category, string>> = {
  CIVIC: "길잡이 시작 시, 시정 건물마다 금화 +1",
  CULTURE: "수호꾼 시작 시, 문화 건물마다 금화 +1",
  TRADE: "장터지기 시작 시, 교역 건물마다 금화 +1",
  GUARD: "해체꾼 시작 시, 수비 건물마다 금화 +1",
  LANDMARK: "5분류 다양성을 완성하는 한 분류",
};
export function CityIcon({ name, className = "" }: Readonly<{ name: IconName; className?: string }>) {
  return <svg className={`city-icon ${className}`} viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false"><path d={paths[name]} /></svg>;
}
export function CityCategoryBadge({ category }: Readonly<{ category: Category }>) {
  return <span className={`city-category city-category-${category.toLowerCase()}`}><CityIcon name={categoryIcons[category]} />{CITY_CATEGORY_LABELS[category]}</span>;
}
export function CityRoleEmblem({ roleId }: Readonly<{ roleId: CityRoleId }>) {
  return <span className={`city-role-emblem city-role-${cityRoleOrder(roleId)}`} data-role-art={roleId}><CityIcon name={roleIcons[roleId]} /><b>{cityRoleOrder(roleId)}</b></span>;
}

/** Original vector scenes, shared by category. Art never encodes private state or card effects. */
export function CityBuildingArt({ category }: Readonly<{ category: Category }>) {
  const id = useId();
  const palette: Record<Category, readonly [string, string, string]> = {
    CIVIC: ["#ddeaf1", "#547a97", "#b8cbd0"], CULTURE: ["#eee2ed", "#815777", "#d2a79d"],
    TRADE: ["#f6e7c8", "#b77535", "#dabb87"], GUARD: ["#f0ded5", "#a5574c", "#b7b4a0"], LANDMARK: ["#dcece0", "#4c816b", "#a5c5ad"],
  };
  const [sky, roof, trees] = palette[category];
  return <svg className="city-building-art" data-category-art={category} viewBox="0 0 240 140" aria-hidden="true" focusable="false">
    <defs><linearGradient id={id} x2="0" y2="1"><stop stopColor={sky}/><stop offset="1" stopColor="#fff7e5"/></linearGradient></defs>
    <path fill={`url(#${id})`} d="M0 0h240v140H0z"/><circle cx="191" cy="27" r="17" fill="#fff7d9"/>
    <path d="M0 89 40 53 72 82 104 63 162 97 209 62 240 80v60H0" fill={trees} opacity=".35"/>
    <path d="M0 120q70-26 130-4t110-5v29H0" fill={trees}/><ellipse cx="123" cy="129" rx="87" ry="9" fill="#40524a" opacity=".14"/>
    <g stroke="#594f42" strokeWidth="1.3" strokeLinejoin="round">
      {category === "TRADE" ? <>
        <path d="M45 73h149v52H45z" fill="#eddbb5"/><path d="m37 73 23-35h123l20 35z" fill={roof}/>
        <path d="m62 39-8 34m33-34-3 34m28-34v34m27-34 4 34m22-34 9 34" stroke="#ffe7bc" strokeWidth="12"/>
        <path d="M40 74h159v9H40z" fill="#f6e5c6"/><path d="M101 85h36v40h-36z" fill="#755438"/>
        <path d="M52 103h39v22H52zM149 100h38v25h-38z" fill="#be8a4d"/><path d="M55 111h34m63-3h32M70 104v20m98-22v23"/>
        <path d="M62 31h108" strokeWidth="3"/><path d="M112 22h39v13h-39z" fill="#e4c274"/>
      </> : category === "CIVIC" ? <>
        <path d="M46 73h146v52H46z" fill="#eadfc6"/><path d="m37 74 82-43 83 43z" fill={roof}/>
        <path d="M87 45V30q32-43 64 0v15z" fill={roof}/><path d="M94 45V32h49v13" fill="#f8ebce"/>
        {[61, 91, 136, 166].map(x => <path key={x} d={`M${x} 80h10v39h-10z`} fill="#fff0d3"/>)}
        <path d="M106 125V93q13-20 26 0v32" fill="#4a6574"/><path d="M41 125h157v6H41z" fill="#ded1b5"/><path d="M119 7v-6m-5 6h10"/>
      </> : category === "CULTURE" ? <>
        <path d="M45 58h150v68H45z" fill="#e8d5bd"/><path d="M36 59 67 34h105l33 25z" fill={roof}/>
        <path d="M76 125V78q44-38 88 0v47" fill="#594751"/><path d="M79 72q14 29 5 51h25l-8-40m60-11q-14 29-5 51h-25l8-40" fill={roof}/>
        <path d="M46 123h149v8H46z" fill="#c0a78c"/>{[54,176].map(x => <path key={x} d={`M${x} 73h10v42h-10z`} fill="#f8e6bd"/>)}
        <path d="M106 48h28M99 39h42" stroke="#f8e6bd" strokeWidth="3"/>
      </> : category === "GUARD" ? <>
        <path d="M48 58h144v68H48z" fill="#c7bca5"/><path d="M41 48h38v78H41zM164 48h36v78h-36z" fill="#ded0b2"/>
        <path d="m36 49 24-28 25 28zm122 0 24-28 24 28z" fill={roof}/><path d="M88 124V95q32-37 64 0v29z" fill="#4b5550"/>
        <path d="M53 66h12v19H53zM176 66h12v19h-12z" fill="#646d65"/><path d="M80 65h13V54h13v11h24V54h13v11h19" fill="#ded0b2"/>
        <path d="M51 101h26m-26 12h26m88-12h29m-29 12h29M60 21V7l21 6-21 6" fill={roof}/>
      </> : <>
        <path d="m95 126 11-52h29l12 52" fill="#e6dcc2"/><path d="M79 76q40 29 81 0z" fill="#86b7ae"/>
        <path d="M114 75V43h12v32" fill="#e9e0c8"/><path d="M100 44q20 16 40 0z" fill="#79aaa8"/>
        <path d="M120 42V24m0 3q-22-10-25 6m25-6q22-10 25 6" fill="none" stroke="#77aaaa" strokeWidth="3"/>
        <ellipse cx="120" cy="126" rx="69" ry="9" fill="#bcd6cd"/><path d="M65 119q55 10 111 0" fill="none" stroke="#fff3ce" strokeWidth="4"/>
        <path d="M38 115V69h26v46M177 115V69h26v46M34 69q18-40 35 0m104 0q18-40 35 0" fill={roof}/>
      </>}
    </g>
    {[20,220].map((x, i) => <g key={x}><path d={`M${x} 119v-30`} stroke="#7a6950" strokeWidth="4"/><circle cx={x} cy={83-i*8} r="17" fill={trees}/><circle cx={x-7} cy={94-i*8} r="13" fill={roof} opacity=".45"/></g>)}
    <path d="M0 137h240" stroke="#fff7e5" strokeWidth="4"/>
  </svg>;
}
export function CitySkyline() {
  return <svg className="city-skyline" viewBox="0 0 600 100" aria-hidden="true" focusable="false"><path d="M0 98V78h32V56l18-24 18 24v42h22V67h32V42l24-22 24 22v56h25V70l18-13 18 13v28h25V43h14V22l16-22 16 22v21h14v55h28V58l23-24 23 24v40h23V72h28V53l19-24 19 24v45h32V73l25-21 25 21v25h35V52l16-22 16 22v46h26" fill="currentColor"/></svg>;
}
export function CityCategoryGuide() {
  const [expanded, setExpanded] = useState(false);
  useEffect(() => {
    const viewport = window.matchMedia("(min-width: 1024px)");
    const update = () => setExpanded(viewport.matches);
    update();
    viewport.addEventListener("change", update);
    return () => viewport.removeEventListener("change", update);
  }, []);
  return <aside className="city-category-guide" aria-label="건물 카테고리"><details open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}><summary>건물 카테고리 <span>5분류 알아보기</span></summary><div className="city-category-rows">{(Object.keys(CITY_CATEGORY_LABELS) as Category[]).map(category => <div className={`city-category-row city-category-${category.toLowerCase()}`} key={category}><div><CityCategoryBadge category={category}/><p>{CITY_CATEGORY_HINTS[category]}</p></div><CityBuildingArt category={category}/></div>)}</div><p className="city-helper">최종 도시에 5분류를 모두 지으면 다양성 +3점. 건물 자체에는 특수 능력이 없습니다.</p></details></aside>;
}
export function CityRoleLegend() {
  return <div className="city-guide-role-grid">{(Object.keys(CITY_ROLE_HELP) as CityRoleId[]).map(roleId => <div key={roleId}><CityRoleEmblem roleId={roleId}/><div><strong>{CITY_ROLE_HELP[roleId].name}</strong><p>{CITY_ROLE_HELP[roleId].summary}</p></div></div>)}</div>;
}
