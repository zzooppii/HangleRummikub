import type { CityUiCard } from "./city-role-ui.js";

/** Original hand-drawn SVG plates. Public template identity only; never gameplay state. */
export const CITY_TEMPLATE_ART = {
  "CB-CIV-01": { motif: "비표를 보관하는 서가", mass: "M52 35h136v91H52z", detail: "M62 48h116M62 72h116M62 98h116M84 38v82m34-82v82m34-82v82", accent: "M68 53h10v13H68zm30 25h13v15H98zm33-35h12v24h-12zm27 62h13v14h-13z" },
  "CB-CIV-02": { motif: "둥근 연단과 공론 광장", mass: "M44 114 68 72h104l24 42zM104 47h32v34h-32z", detail: "M57 104h126M68 91h104M97 120h46M120 33v14", accent: "M48 64h21v18H48zm123 0h21v18h-21zM91 28h58v9H91z" },
  "CB-CIV-03": { motif: "갈림길의 안내 표지판", mass: "M113 23h14v106h-14zM64 34h97l17 13-17 13H64zM80 72h97v25H80L63 84z", detail: "M0 137 102 107m138 30-101-30M82 47h65M96 84h64", accent: "M27 112 53 78l23 34zM167 120l21-29 24 29z" },
  "CB-CIV-04": { motif: "원탁을 둘러싼 협의뜰", mass: "M65 79q55-38 110 0v17q-55 28-110 0zM79 102v24m82-24v24", detail: "M72 78q48 21 96 0M92 70h56M45 54h22v51H45m130-51h22v51h-22", accent: "M99 40h42v17H99zM34 40h43v9H34zm129 0h43v9h-43z" },
  "CB-CIV-05": { motif: "우편함이 늘어선 아치 회랑", mass: "M35 48h170v78H35z", detail: "M46 125V80q15-26 30 0v45m29 0V80q15-26 30 0v45m29 0V80q15-26 30 0v45M32 42h176", accent: "M91 19h58v32H91z", engraving: "m93 22 27 20 27-20M103 58h34" },
  "CB-CIV-06": { motif: "대칭 기둥의 수평의사당", mass: "M27 61 120 20l93 41zM34 117h172v12H34zM46 68h17v47H46zm43 0h17v47H89zm45 0h17v47h-17zm43 0h17v47h-17z", detail: "M38 61h164M40 111h160M120 29v20", accent: "M111 72h18v44h-18z" },
  "CB-CUL-01": { motif: "종이와 접이식 공방", mass: "M47 58h144v66H47zM35 57l38-27h95l38 27z", detail: "M59 84h123M61 94v24m115-24v24M73 62l22 14 23-14 23 14 23-14", accent: "M96 91 119 77l22 14-22 20zM77 36l20-12 18 12-18 14z" },
  "CB-CUL-02": { motif: "나무 그늘의 펼친 책", mass: "M52 83q34-17 68 0 34-17 68 0v37q-34-15-68 0-34-15-68 0z", detail: "M120 84v35M64 91l38 2m-38 9 38 2m35-13 38-2m-38 13 38-2M40 121V52", accent: "M24 50q-9-36 28-36 29 10 14 37-22 20-42-1z" },
  "CB-CUL-03": { motif: "악보가 흐르는 노래 무대", mass: "M42 45h156v78H42zM33 122h174v9H33z", detail: "M42 45q37 27 19 74m137-74q-37 27-19 74M77 112h86", accent: "M104 98V59l39-8v37l-11 7-8-6 8-8V65l-17 4v25l-12 9-9-6z" },
  "CB-CUL-04": { motif: "나뭇잎 사이 기록석과 책", mass: "M89 30h62v91H89zM79 119h82v10H79z", detail: "M101 44h38m-38 13h38m-38 13h30m-30 13h38M46 114l18-50m115 50-17-50", accent: "M40 66q-5-28 24-24 13 23-9 33zm132-24q29-4 26 24l-17 9q-22-10-9-33zM102 98h36v12h-36z" },
  "CB-CUL-05": { motif: "별을 향한 관측 망원경", mass: "M61 86h118v39H61zM61 83q59-94 118 0z", detail: "M120 97v26m0-15-22 17m22-17 22 17M47 128h146", accent: "m105 79 57-36 10 16-57 36zM44 25l4 9 11 1-8 7 2 11-9-6-9 6 2-11-8-7 11-1z" },
  "CB-CUL-06": { motif: "커튼 사이 이야기 두루마리", mass: "M39 43h162v83H39zM31 35h178v9H31z", detail: "M50 125V73q17-29 34 0v52m72 0V73q17-29 34 0v52", accent: "M97 54h49l-6 11v43H92l8-10V65z", engraving: "M109 70h22m-22 12h22m-22 12h17" },
  "CB-TRA-01": { motif: "거래 광장의 큰 저울", mass: "M115 29h10v91h-10zM89 120h62v9H89z", detail: "M57 52h126M71 53 49 91h44zm98 0-22 38h44z", accent: "M47 92q24 31 48 0zm98 0q24 31 48 0zM110 25l10-12 10 12-10 12z" },
  "CB-TRA-02": { motif: "도로 석재와 포장 공방", mass: "M37 61h94v62H37zM29 60l55-34 55 34z", detail: "M50 78h22v45H50M92 77h24v22H92M144 123l31-52 38 52M159 97h38m-47 14h56m-34-28 7 39", accent: "M95 112h27v15H95zm31-14h27v15h-27zm27 17h27v15h-27zM176 42l15-9 15 9-15 9z" },
  "CB-TRA-03": { motif: "두 천막 사이 교환 상자", mass: "M25 74 47 34l30 40v51H25zm138 0 30-40 22 40v51h-52z", detail: "M25 74h52m86 0h52M92 53h52l-9-9m9 9-9 9M148 76H96l9-9m-9 9 9 9", accent: "M97 100h46v29H97z", engraving: "M120 101v27m-22-27 22 10 22-10" },
  "CB-TRA-04": { motif: "줄무늬 천막의 상인 거리", mass: "M32 67h176v58H32zM24 67l24-34h144l24 34z", detail: "M53 72v47m45-47v47m45-47v47m45-47v47M34 95h171", accent: "M51 34h18L56 67H35zm42 0h18l-3 33H86zm42 0h18l8 33h-23zm42 0h16l22 33h-23z" },
  "CB-TRA-05": { motif: "금화와 거대한 거래 장부", mass: "M57 26h116v96H57zM50 121h130v9H50z", detail: "M73 27v94M88 47h66m-66 14h66m-66 14h66m-66 14h33", accent: "M151 102c0-10 51-10 51 0v21c0 11-51 11-51 0z", engraving: "M152 105q25 13 49 0m-49 10q25 13 49 0" },
  "CB-TRA-06": { motif: "바퀴 달린 운송 수레", mass: "M52 66h131l-10 46H64zM75 40h40v25H75zm43-12h42v37h-42z", detail: "M67 75h102M91 68v40m49-40v40M181 77h31", accent: "M92 119a14 14 0 1 0-28 0 14 14 0 0 0 28 0m77 0a14 14 0 1 0-28 0 14 14 0 0 0 28 0", engraving: "M78 108v22m-11-11h22m66-11v22m-11-11h22" },
  "CB-GUA-01": { motif: "등불을 밝힌 작은 초소", mass: "M75 52h90v75H75zM66 51l54-30 54 30z", detail: "M92 127V89h22v38M143 65v-24h32", accent: "M157 47h28v34h-28z", engraving: "M171 50v29m-12-23h25M185 41l13-7m-7 33h15" },
  "CB-GUA-02": { motif: "길목의 차단문과 대기소", mass: "M29 61h68v65H29zM25 60l38-29 39 29zM179 59h15v69h-15z", detail: "M42 123V85h24v38M99 91h80M99 77h80M114 77v14m30-14v14m20-14v14", accent: "M103 78h74v12h-74zM185 26l25 10-25 10z" },
  "CB-GUA-03": { motif: "봉화와 신호 광장", mass: "M88 65h64l16 62H72zM80 61h80v12H80z", detail: "M91 86h58m-62 17h66M43 121h154M106 116h28", accent: "M95 58q-13-19 8-34-1 18 14 18 9-13 8-29 36 25 19 45z" },
  "CB-GUA-04": { motif: "연속된 방벽 순찰 회랑", mass: "M29 61h182v67H29V41h17v20h20V41h17v20h20V41h17v20h20V41h17v20h20V41h17v20h17z", detail: "M45 129V96q14-24 28 0v33m32 0V96q14-24 28 0v33m32 0V96q14-24 28 0v33", accent: "M109 71h21v14h-21z" },
  "CB-GUA-05": { motif: "지도와 훈련 표적", mass: "M45 32h104v82H45zM56 114v15m82-15v15", detail: "M57 46 78 62l20-14 34 20-26 29-22-14-23 17M178 104v26", accent: "M199 83a22 22 0 1 0-44 0 22 22 0 0 0 44 0", engraving: "M189 83a12 12 0 1 0-24 0 12 12 0 0 0 24 0M171 83h12m-6-6v12" },
  "CB-GUA-06": { motif: "방패를 품은 요새 전당", mass: "M35 49h39v78H35zm131 0h39v78h-39zM72 65h96v62H72zM30 49V29h13v9h13v-9h13v9h12v11m79 0V29h13v9h13v-9h13v9h12v11", detail: "M44 69h20m-20 17h20m111-17h20m-20 17h20M29 128h182", accent: "M90 77 120 67l30 10v24q-5 18-30 28-25-10-30-28z", engraving: "M120 76v40m-19-27h38" },
  "CB-LAN-01": { motif: "빗방울과 연못 정원", mass: "M40 105q80-38 160 0l-9 19q-71 21-142 0z", detail: "M55 111q65-20 130 0M76 93V66m91 25V61", accent: "M58 77q-12-28 20-20 20 15-2 28zm103-19q31-14 26 14l-18 11zM112 26q-25 31 0 32 25-1 0-32zM142 52q-15 20 0 21 15-1 0-21z" },
  "CB-LAN-02": { motif: "빛과 그림자를 가르는 해시계", mass: "M85 77h70l15 47H70zM51 65q69-26 138 0v12q-69 26-138 0z", detail: "M65 70h18m8-12 9 10m35-9-6 10m32-6-13 9M79 123h82", accent: "M108 72 130 26v49zM181 16a13 13 0 1 0 0 26 13 13 0 0 0 0-26", engraving: "M118 74l37 11" },
  "CB-LAN-03": { motif: "층층이 흐르는 돌물결 분수", mass: "M56 105q64 24 128 0v16q-64 25-128 0zM73 74q47 22 94 0v14q-47 24-94 0zM99 44q21 12 42 0v15q-21 13-42 0z", detail: "M108 58v19m25-19v19M89 88v21m63-21v21M120 43V25", accent: "M104 26q16-22 32 0M44 120q13-25 27 0m99 0q13-25 27 0" },
  "CB-LAN-04": { motif: "풍향기와 솟아오르는 계단", mass: "M45 126V108h25V89h25V70h25V51h25V32h27v94z", detail: "M70 108h80M95 89h55m-30-19h30M51 118l106-78", accent: "M159 32V9m0 2 40 9-40 9M43 38q25-14 53 0m-42 15q21-13 41 0" },
  "CB-LAN-05": { motif: "달빛 그림자가 드리운 회랑", mass: "M34 57h172v69H34zM27 48h186v10H27z", detail: "M45 126V84q16-25 32 0v42m27 0V84q16-25 32 0v42m27 0V84q16-25 32 0v42", accent: "M143 12a21 21 0 1 0 18 30 23 23 0 0 1-18-30zM48 128l-17 8h43l15-8m21 0-17 8h43l15-8" },
  "CB-LAN-06": { motif: "일곱 길이 만나는 기념비", mass: "M107 30h26l9 68h-44zM83 98h74v15H83zM71 113h98v13H71z", detail: "M120 31V13M25 136l62-19m-31 19 38-17m-10 17 19-17m17 17v-17m37 17-19-17m47 17-38-17m68 17-62-19", accent: "M120 12l7 10 12 2-9 9 2 12-12-6-12 6 2-12-9-9 12-2z" },
} satisfies Record<string, { motif: string; mass: string; detail: string; accent: string; engraving?: string }>;

const palettes = {
  TRADE: ["#f6dda5", "#c47a32", "#ffcf68", "#593921"],
  CIVIC: ["#d5e5ee", "#728da9", "#ead7a2", "#2d4660"],
  CULTURE: ["#eddaef", "#946790", "#e8bba7", "#533653"],
  GUARD: ["#e9d4c7", "#997265", "#df8b54", "#4f3935"],
  LANDMARK: ["#dce8d5", "#7b9b86", "#e7cb76", "#304f49"],
} satisfies Record<CityUiCard["category"], readonly string[]>;

export function CityTemplateArt({ templateId, category }: Readonly<Pick<CityUiCard, "templateId" | "category">>) {
  const plate = Object.entries(CITY_TEMPLATE_ART).find(([id]) => id === templateId)?.[1];
  const [sky, stone, accent, ink] = palettes[category];
  return <svg className={`city-building-art city-template-art city-art-${category.toLowerCase()}`} data-category-art={category} data-template-art={templateId} data-motif={plate?.motif ?? "도시 건물"} viewBox="0 0 240 150" aria-hidden="true" focusable="false">
    <path fill={sky} d="M0 0h240v150H0z" />
    <circle cx="193" cy="30" r="24" fill="#fff6d9" opacity=".7" />
    <path d="M0 132 54 115l60 15 66-19 60 21v18H0" fill={stone} opacity=".3" />
    {category === "TRADE" ? <path d="M0 8q30 24 60 0 30 24 60 0 30 24 60 0 30 24 60 0" fill="none" stroke={stone} strokeWidth="5" /> : category === "GUARD" ? <path d="M0 45h13V30h13v15h13v85H0m240-85h-13V30h-13v15h-13v85h39" fill={stone} opacity=".35" /> : category === "CULTURE" ? <path d="M0 0h24q-13 72-24 85m240-85h-24q13 72 24 85" fill={stone} opacity=".55" /> : category === "CIVIC" ? <path d="M10 15h12v110H10zm208 0h12v110h-12z" fill={stone} opacity=".4" /> : <path d="M11 119q24-45 5-83m-1 48q-17-10-9-26m10 47q21-9 17-27m196 41q-24-45-5-83m1 48q17-10 9-26m-10 47q-21-9-17-27" fill="none" stroke={stone} strokeWidth="4" />}
    <g stroke={ink} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round">
      <path d={plate?.mass ?? "M63 65 120 29l57 36v64H63z"} fill={stone} />
      <path d={plate?.detail} fill="none" />
      <path d={plate?.accent} fill={accent} />
      {plate && "engraving" in plate ? <path d={plate.engraving} fill="none" /> : null}
    </g>
    <path d="M8 142h224" stroke={ink} opacity=".35" />
  </svg>;
}
