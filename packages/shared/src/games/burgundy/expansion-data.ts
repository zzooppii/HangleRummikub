import type { BurgundyExpansionBonus, BurgundyTradeSpace } from "./expansion-contracts.js";

/** 2019 anniversary rulebook pp.15–16. End scoring is separate from the persistent ability. */
export const BURGUNDY_SHIELDS = [
  { id: 1, points: 12, name: "이어진 목초지", description: "모든 목초지를 하나로 간주해 가축을 계산합니다." },
  { id: 2, points: 12, name: "일꾼 연대", description: "다른 플레이어가 얻는 일꾼 수만큼 일꾼을 얻습니다." },
  { id: 3, points: 12, name: "노역 공물", description: "방패 공물을 은화 대신 일꾼으로 낼 수 있습니다." },
  { id: 4, points: 12, name: "넓은 저장고", description: "타일 저장 공간 제한이 없어집니다." },
  { id: 5, points: 12, name: "상품 수집", description: "배를 놓을 때 한 종류의 상품을 모든 교역소에서 추가로 얻습니다." },
  { id: 6, points: 12, name: "지식 공유", description: "선택한 상대의 수도원 효과를 공유합니다." },
  { id: 7, points: 8, name: "완성 보상", description: "새로 얻는 보너스 타일의 점수를 두 배로 얻습니다." },
  { id: 8, points: 8, name: "광산 수익", description: "광산에서 받는 은화가 두 배가 됩니다." },
  { id: 9, points: 8, name: "상품 수익", description: "상품 한 종류당 은화 1개 대신 상품 타일마다 은화 1개를 얻습니다." },
  { id: 10, points: 8, name: "수도원 후원", description: "종료 시 수도원 점수를 두 배로 계산합니다." },
  { id: 11, points: 8, name: "성의 문장", description: "성을 놓아 얻는 추가 행동으로 방패를 가져올 수 있습니다." },
  { id: 12, points: 8, name: "교역 명성", description: "상품 판매 점수가 두 배가 됩니다." },
  { id: 13, points: 4, name: "문장 수집", description: "종료 시 자신을 포함한 모든 방패 점수를 두 배로 계산합니다." },
  { id: 14, points: 4, name: "영주의 선택", description: "매 단계 종료 시 번호 교역소의 타일 하나를 공국에 직접 놓습니다." },
  { id: 15, points: 4, name: "중앙 선택", description: "매 단계 종료 시 중앙 교역소의 타일 하나를 공국에 직접 놓습니다." },
  { id: 16, points: 4, name: "주사위 조정", description: "자신의 턴에 주사위 하나를 원하는 눈으로 한 번 바꿉니다." },
  { id: 17, points: 4, name: "넓은 영지", description: "완성 구역의 크기 점수를 한 단계 크게 계산합니다." },
  { id: 18, points: 4, name: "자유 정착", description: "기존 타일과 인접하지 않은 공국 칸에도 타일을 놓을 수 있습니다." },
] as const;

export interface BurgundyExpansionCatalog {
  /** Twelve physical three-space route tiles, read left to right. */
  tradeRoutes: readonly (readonly BurgundyTradeSpace[])[];
}
const take = (...colors: ("BUILDING" | "LIVESTOCK" | "MINE" | "SHIP" | "MONASTERY" | "CASTLE")[]): BurgundyExpansionBonus => ({ type: "TAKE", colors });
const building = take("BUILDING"), church = take("CASTLE", "MINE", "MONASTERY"), market = take("SHIP", "LIVESTOCK");
const action: BurgundyExpansionBonus = { type: "ACTION", die: null }, place: BurgundyExpansionBonus = { type: "PLACE" }, sell: BurgundyExpansionBonus = { type: "SELL" };
const workers: BurgundyExpansionBonus = { type: "GAIN", workers: 4, silver: 0, score: 0 }, silver: BurgundyExpansionBonus = { type: "GAIN", workers: 0, silver: 2, score: 0 }, score: BurgundyExpansionBonus = { type: "GAIN", workers: 0, silver: 0, score: 4 };
const space = (die: number, bonus: BurgundyExpansionBonus): BurgundyTradeSpace => ({ die, bonus });
/**
 * 2019 components retain the original Trade Routes expansion faces.
 * Physical front scans: https://boardgamegeek.com/image/3913568 and /image/3913566.
 * Three faces corroborated by publisher rulebook p.12. Goods/dice confirmed
 * by https://boardgamegeek.com/image/5036790 and publisher rulebook p.5:
 * https://product-files.ravensburger.cloud/manuals/664462.pdf
 * Turquoise=1, purple=2, pink=3, red=4, brown=5, orange=6.
 */
export const BURGUNDY_EXPANSION_CATALOG: BurgundyExpansionCatalog = {
  tradeRoutes: [
    [space(2, building), space(4, church), space(1, workers)],
    [space(1, market), space(2, silver), space(5, place)],
    [space(4, action), space(1, score), space(2, market)],
    [space(3, place), space(5, score), space(6, market)],
    [space(6, place), space(4, market), space(3, sell)],
    [space(4, workers), space(1, sell), space(6, building)],
    [space(5, action), space(6, silver), space(1, building)],
    [space(4, place), space(3, church), space(2, workers)],
    [space(1, silver), space(6, action), space(5, building)],
    [space(6, score), space(3, silver), space(4, sell)],
    [space(5, sell), space(2, church), space(3, score)],
    [space(3, workers), space(5, church), space(2, action)],
  ],
};
