import {
  burgundyDefinition,
  burgundyWorkerCost,
  burgundyPlacementDiscount,
  type BurgundyTile,
  type BurgundyColor,
  type BurgundyPlayer,
  type BurgundyProjection,
  type BurgundyPending,
} from "@hangul-rummikub/shared";
export const BURGUNDY_COLOR_LABELS: Record<BurgundyColor, string> = {
  CASTLE: "성",
  SHIP: "배",
  LIVESTOCK: "동물",
  MONASTERY: "지식",
  MINE: "은광",
  BUILDING: "건물",
};
export const BURGUNDY_COLOR_HEX: Record<BurgundyColor, string> = {
  CASTLE: "#3b8064",
  SHIP: "#538da5",
  LIVESTOCK: "#8aab51",
  MONASTERY: "#d8b947",
  MINE: "#999cad",
  BUILDING: "#c8a06b",
};
export const BURGUNDY_NAMES: Record<string, string> = {
  CASTLE: "성",
  SHIP: "배",
  MINE: "은광",
  SHEEP: "양",
  COW: "소",
  PIG: "돼지",
  GOAT: "염소",
  GEESE: "거위",
  MARKET: "시장",
  CARPENTER: "목공소",
  CHURCH: "교회",
  WAREHOUSE: "창고",
  BOARDING_HOUSE: "숙소",
  BANK: "은행",
  TOWN_HALL: "시청",
  WATCHTOWER: "망루",
  WHITE_CASTLE: "하얀 성",
  CRANE: "크레인",
  INN: "여관",
};
export const BURGUNDY_KNOWLEDGE_TEXT = [
  "",
  "같은 마을에 동일 건물을 여러 개 배치할 수 있습니다.",
  "시대 종료 시 은광마다 일꾼 1명도 받습니다.",
  "상품 판매 시 은화를 1개 대신 2개 받습니다.",
  "상품 판매 시 일꾼 1명도 받습니다.",
  "배를 놓으면 선택한 시장과 인접 시장의 상품도 가져올 수 있습니다.",
  "일반·검은 시장 타일을 은화와 일꾼 합계 2개로 구매할 수 있습니다. 차례당 구매 한 번 제한을 공유합니다.",
  "동물 점수 계산에 포함된 타일마다 1점을 추가합니다.",
  "일꾼 한 명으로 주사위를 최대 2칸 보정합니다.",
  "건물 배치 시 주사위를 1칸 무료 보정합니다.",
  "배·동물 배치 시 주사위를 1칸 무료 보정합니다.",
  "성·은광·지식 배치 시 주사위를 1칸 무료 보정합니다.",
  "시장 타일 획득 시 주사위를 1칸 무료 보정합니다.",
  "일꾼 획득 행동 시 은화 1개도 받습니다.",
  "일꾼 획득 행동 시 2명 대신 4명을 받습니다.",
  "종료 시 판매한 상품 종류마다 2점.",
  "종료 시 목공소마다 4점.",
  "종료 시 망루마다 4점.",
  "종료 시 숙소마다 4점.",
  "종료 시 교회마다 4점.",
  "종료 시 시장마다 4점.",
  "종료 시 시청마다 4점.",
  "종료 시 은행마다 4점.",
  "종료 시 창고마다 4점.",
  "종료 시 배치한 동물 종류마다 4점.",
  "종료 시 판매한 상품 타일마다 1점.",
  "종료 시 획득한 보너스 타일마다 3점.",
  "같은 순서 칸에서는 항상 가장 위에 놓습니다.",
  "은화 1개로 일꾼 2명을 살 수 있습니다.",
  "종료 시 하얀 성마다 4점.",
] as const;
export function burgundyTileName(tile: BurgundyTile): string {
  const d = burgundyDefinition(tile);
  return d.knowledge
    ? `지식 ${d.knowledge}`
    : d.animal
      ? `${BURGUNDY_NAMES[d.animal]} ${d.animals}`
      : (BURGUNDY_NAMES[d.building ?? (d.inn ? "INN" : d.color)] ?? d.kind);
}
export function burgundyTileText(tile: BurgundyTile): string {
  const d = burgundyDefinition(tile);
  if (d.knowledge) return BURGUNDY_KNOWLEDGE_TEXT[d.knowledge] ?? "";
  if (d.animal)
    return "배치한 동물과 같은 목초지의 같은 동물 수만큼 점수를 얻습니다.";
  if (d.inn)
    return "어떤 색에도 배치 가능. 지역마다 하나, 완성 지역 크기를 1 늘립니다.";
  if (d.whiteCastle)
    return "흰 주사위 눈으로 추가 행동을 합니다. 일꾼 보정이 가능합니다.";
  const texts: Record<string, string> = {
    CASTLE: "원하는 주사위 눈으로 즉시 추가 행동을 합니다.",
    SHIP: "시장을 골라 상품을 가져오고 다음 라운드의 순서를 앞당깁니다.",
    MINE: "시대가 끝날 때마다 은화 1개를 받습니다.",
    MARKET: "일반 시장에서 배 또는 동물 타일을 가져옵니다.",
    CARPENTER: "일반 시장에서 건물 타일을 가져옵니다.",
    CHURCH: "일반 시장에서 성·은광·지식 타일을 가져옵니다.",
    WAREHOUSE: "상품 한 종류를 즉시 판매합니다.",
    BOARDING_HOUSE: "일꾼 4명을 받습니다.",
    BANK: "은화 2개를 받습니다.",
    TOWN_HALL: "보관함의 타일 하나를 추가 배치합니다.",
    WATCHTOWER: "즉시 4점을 얻습니다.",
    CRANE: "기본 건물 하나의 효과를 골라 사용합니다.",
  };
  return texts[d.building ?? d.color] ?? "";
}
export function burgundySprite(tile: BurgundyTile): number {
  const d = burgundyDefinition(tile);
  if (d.knowledge) return 7;
  if (d.animal)
    return { SHEEP: 2, COW: 3, PIG: 4, GOAT: 5, GEESE: 5 }[d.animal];
  if (d.inn) return 12;
  if (d.whiteCastle) return 0;
  return (
    (
      {
        CASTLE: 0,
        SHIP: 1,
        MINE: 6,
        MARKET: 8,
        CARPENTER: 9,
        CHURCH: 10,
        WAREHOUSE: 11,
        BOARDING_HOUSE: 12,
        BANK: 13,
        TOWN_HALL: 14,
        WATCHTOWER: 15,
        CRANE: 9,
      } as Record<string, number>
    )[d.building ?? d.color] ?? 7
  );
}
export function burgundyKnowledge(
  game: BurgundyProjection,
  player: BurgundyPlayer,
): number[] {
  const own = player.board
    .map((p) => burgundyDefinition(p.tile).knowledge)
    .filter((n): n is number => n !== undefined);
  const copy = player.extension.shields.find(
    (s) => s.shieldId === 6,
  )?.copiedPlayerId;
  const other = game.playerStates.find((p) => p.playerId === copy);
  return [
    ...new Set([
      ...own,
      ...(other?.board
        .map((p) => burgundyDefinition(p.tile).knowledge)
        .filter((n): n is number => n !== undefined) ?? []),
    ]),
  ];
}
export function burgundyPreviewWorkers(
  game: BurgundyProjection,
  p: BurgundyPlayer,
  die: 0 | 1,
  value: number,
  mode: "TAKE" | "PLACE" | "SELL",
  tile?: BurgundyTile,
): number {
  const k = burgundyKnowledge(game, p);
  const free =
    mode === "TAKE" && k.includes(12)
      ? 1
      : mode === "PLACE" && tile
        ? burgundyDefinition(tile).inn
          ? 0
          : burgundyPlacementDiscount(burgundyDefinition(tile).color, k)
        : 0;
  return burgundyWorkerCost(
    game.pending[0]?.type === "ACTION" && game.pending[0].die !== null
      ? game.pending[0].die
      : p.dice[die].value,
    value,
    k.includes(8),
    free,
  );
}
export function burgundyPendingLabel(p: BurgundyPending | undefined): string {
  if (!p) return "주사위와 행동을 선택하세요";
  const labels: Record<BurgundyPending["type"], string> = {
    GAIN: "보너스를 처리합니다",
    TRADE_FILL: "무역로 보너스를 처리합니다",
    ACTION:
      p.type === "ACTION" && p.die
        ? `추가 행동 · 주사위 ${p.die}`
        : "원하는 눈으로 추가 행동",
    TAKE: "추가로 가져올 타일 선택",
    PLACE: "보관함에서 추가 배치",
    SELL: "즉시 판매할 상품 선택",
    SHIP: "상품을 가져올 시장 선택",
    CRANE: "크레인으로 사용할 건물 효과",
    GEESE: "거위와 함께 점수를 얻을 동물 선택",
    TAKE_BLACK: "검은 시장에서 추가 획득",
    SHIELD_TRIBUTE: "문장 유지 비용 선택",
    SHIELD_PLACE: "문장 효과로 타일 직접 배치",
  };
  return labels[p.type];
}
