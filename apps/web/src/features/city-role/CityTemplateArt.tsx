import { CITY_SPECIAL_BUILDINGS } from "@hangul-rummikub/shared";
import type { CityUiCard } from "./city-role-ui.js";

/** Public visual identity only. Original scene prompts/provenance are in the asset manifest. */
export const CITY_TEMPLATE_ART = {
  "CB-CIV-01": { motif: "비표를 보관하는 서가", category: "CIVIC", src: "/city-art/illustrated-v1/cb-civ-01.webp" },
  "CB-CIV-02": { motif: "둥근 연단과 공론 광장", category: "CIVIC", src: "/city-art/illustrated-v1/cb-civ-02.webp" },
  "CB-CIV-03": { motif: "갈림길의 안내 표지판", category: "CIVIC", src: "/city-art/illustrated-v1/cb-civ-03.webp" },
  "CB-CIV-04": { motif: "원탁을 둘러싼 협의뜰", category: "CIVIC", src: "/city-art/illustrated-v1/cb-civ-04.webp" },
  "CB-CIV-05": { motif: "우편함이 늘어선 아치 회랑", category: "CIVIC", src: "/city-art/illustrated-v1/cb-civ-05.webp" },
  "CB-CIV-06": { motif: "대칭 기둥의 수평의사당", category: "CIVIC", src: "/city-art/illustrated-v1/cb-civ-06.webp" },
  "CB-CUL-01": { motif: "종이와 접이식 공방", category: "CULTURE", src: "/city-art/illustrated-v1/cb-cul-01.webp" },
  "CB-CUL-02": { motif: "나무 그늘의 펼친 책", category: "CULTURE", src: "/city-art/illustrated-v1/cb-cul-02.webp" },
  "CB-CUL-03": { motif: "악보가 흐르는 노래 무대", category: "CULTURE", src: "/city-art/illustrated-v1/cb-cul-03.webp" },
  "CB-CUL-04": { motif: "나뭇잎 사이 기록석과 책", category: "CULTURE", src: "/city-art/illustrated-v1/cb-cul-04.webp" },
  "CB-CUL-05": { motif: "별을 향한 관측 망원경", category: "CULTURE", src: "/city-art/illustrated-v1/cb-cul-05.webp" },
  "CB-CUL-06": { motif: "커튼 사이 이야기 두루마리", category: "CULTURE", src: "/city-art/illustrated-v1/cb-cul-06.webp" },
  "CB-TRA-01": { motif: "거래 광장의 큰 저울", category: "TRADE", src: "/city-art/illustrated-v1/cb-tra-01.webp" },
  "CB-TRA-02": { motif: "도로 석재와 포장 공방", category: "TRADE", src: "/city-art/illustrated-v1/cb-tra-02.webp" },
  "CB-TRA-03": { motif: "두 천막 사이 교환 상자", category: "TRADE", src: "/city-art/illustrated-v1/cb-tra-03.webp" },
  "CB-TRA-04": { motif: "줄무늬 천막의 상인 거리", category: "TRADE", src: "/city-art/illustrated-v1/cb-tra-04.webp" },
  "CB-TRA-05": { motif: "금화와 거대한 거래 장부", category: "TRADE", src: "/city-art/illustrated-v1/cb-tra-05.webp" },
  "CB-TRA-06": { motif: "바퀴 달린 운송 수레", category: "TRADE", src: "/city-art/illustrated-v1/cb-tra-06.webp" },
  "CB-GUA-01": { motif: "등불을 밝힌 작은 초소", category: "GUARD", src: "/city-art/illustrated-v1/cb-gua-01.webp" },
  "CB-GUA-02": { motif: "길목의 차단문과 대기소", category: "GUARD", src: "/city-art/illustrated-v1/cb-gua-02.webp" },
  "CB-GUA-03": { motif: "봉화와 신호 광장", category: "GUARD", src: "/city-art/illustrated-v1/cb-gua-03.webp" },
  "CB-GUA-04": { motif: "연속된 방벽 순찰 회랑", category: "GUARD", src: "/city-art/illustrated-v1/cb-gua-04.webp" },
  "CB-GUA-05": { motif: "지도와 훈련 표적", category: "GUARD", src: "/city-art/illustrated-v1/cb-gua-05.webp" },
  "CB-GUA-06": { motif: "방패를 품은 요새 전당", category: "GUARD", src: "/city-art/illustrated-v1/cb-gua-06.webp" },
  "CB-LAN-01": { motif: "빗방울과 연못 정원", category: "LANDMARK", src: "/city-art/illustrated-v1/cb-lan-01.webp" },
  "CB-LAN-02": { motif: "빛과 그림자를 가르는 해시계", category: "LANDMARK", src: "/city-art/illustrated-v1/cb-lan-02.webp" },
  "CB-LAN-03": { motif: "층층이 흐르는 돌물결 분수", category: "LANDMARK", src: "/city-art/illustrated-v1/cb-lan-03.webp" },
  "CB-LAN-04": { motif: "풍향기와 솟아오르는 계단", category: "LANDMARK", src: "/city-art/illustrated-v1/cb-lan-04.webp" },
  "CB-LAN-05": { motif: "달빛 그림자가 드리운 회랑", category: "LANDMARK", src: "/city-art/illustrated-v1/cb-lan-05.webp" },
  "CB-LAN-06": { motif: "일곱 길이 만나는 기념비", category: "LANDMARK", src: "/city-art/illustrated-v1/cb-lan-06.webp" },
} as const;

export function CityTemplateArt({ templateId, category }: Readonly<Pick<CityUiCard, "templateId" | "category">>) {
  const special = CITY_SPECIAL_BUILDINGS.find(b => b.templateId === templateId);
  const plate = special ? { motif: special.name, category: "LANDMARK", src: `/city-art/expanded-v3/${special.templateId.toLowerCase()}.webp` } : Object.entries(CITY_TEMPLATE_ART).find(([id]) => id === templateId)?.[1];
  // Unknown/mismatched catalog entries get no invented building identity.
  return <span className={`city-building-art city-template-art city-art-${category.toLowerCase()}`} data-category-art={category} data-template-art={templateId} data-motif={plate?.motif ?? "도시 건물"} aria-hidden="true">
    {plate?.category === category ? <img src={plate.src} width="512" height="512" alt="" loading="lazy" decoding="async" draggable={false} /> : <span className="city-art-unavailable">그림 준비 중</span>}
  </span>;
}
