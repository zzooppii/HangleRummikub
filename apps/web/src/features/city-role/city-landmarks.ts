import { CITY_SPECIAL_BUILDINGS } from "@hangul-rummikub/shared";
/** Versioned public card text. This catalog never decides a server transition. */
export const CITY_LANDMARK_TEXT: Readonly<Record<string, Readonly<{ short: string; detail: string }>>> = {
  "CB-LAN-01": { short: "처음 지으면 금화 1 환급", detail: "비용 전액을 먼저 지불합니다. 플레이어당 게임 전체 1회이며, 파괴 후 재건설하거나 다른 카드를 지어도 다시 지급되지 않습니다." },
  "CB-LAN-02": { short: "처음 지으면 카드 최대 1장", detail: "덱 위에서 자동으로 받습니다. 덱이 비면 버린 카드를 섞고, 공급이 없으면 0장입니다. 플레이어당 게임 전체 1회, 재건설 보상 없음." },
  "CB-LAN-03": { short: "이 건물 해체 비용 +1", detail: "이 건물의 해체 비용은 금화 2입니다. 완성 도시와 수호꾼의 보호는 그대로 유지됩니다. 다른 건물을 보호하지 않습니다." },
  "CB-LAN-04": { short: "일반 건설 −1 · 라운드당 1회", detail: "각 라운드 첫 비용 2 이상 일반 건설에 자동 적용합니다. 금화 지불 최소 1, 게임 전체 최대 3회. 명소에는 적용되지 않고, 파괴·기권 시 남은 횟수 소멸. 재건설해도 충전되지 않습니다." },
  "CB-LAN-05": { short: "다양성의 빠진 일반 분류 1종 보완", detail: "종료 시 다양성 +3 판정에만 적용합니다. 일반 분류가 실제 3종 이상이어야 합니다. 수입·실제 건물·일곱길기념뜰 점수에는 가상 분류가 포함되지 않습니다." },
  "CB-LAN-06": { short: "종료 때 실제 일반 분류마다 +1점", detail: "교역·시정·문화·수비 중 실제 지은 분류마다 1점, 최대 4점입니다. 달그림회랑의 가상 분류는 제외하며, 기권 시 특수 보너스는 없습니다." },
};
export function cityLandmarkText(version: string, templateId: string) {
  if (version === "city-rules-v3") { const b = CITY_SPECIAL_BUILDINGS.find(b => b.templateId === templateId); return b ? { short: b.text, detail: b.text } : undefined; }
  return version === "city-rules-v2" ? CITY_LANDMARK_TEXT[templateId] : undefined;
}
export const CITY_LANDMARK_NAMES: Readonly<Record<string, string>> = {
  "CB-LAN-01": "빗물정원", "CB-LAN-02": "작은해시계", "CB-LAN-03": "돌물결마당",
  "CB-LAN-04": "바람계단", "CB-LAN-05": "달그림회랑", "CB-LAN-06": "일곱길기념뜰",
};
