import {
  GEM_BASIC_RESOURCE_IDS,
  type GemCardPlayingProjectionV2,
  type GemCardFinishedProjectionV2,
  type GemCollectSelectionDto,
  type GemPurchaseSourceDto,
} from "@hangul-rummikub/shared";

export type GemUiPlayer = GemCardPlayingProjectionV2["playerStates"][number];
export type GemUiCard = GemUiPlayer["purchasedCards"][number];
export type GemBasicResource = typeof GEM_BASIC_RESOURCE_IDS[number];
export type GemResource = GemBasicResource | "PRISM";
export const GEM_RESOURCE_IDS = [...GEM_BASIC_RESOURCE_IDS, "PRISM"] as const;
export const GEM_RESOURCE_LABELS: Readonly<Record<GemResource, string>> = {
  DAWN: "새벽", TIDE: "물결", GROVE: "숲", EMBER: "불씨", ECHO: "울림", PRISM: "프리즘",
};
export const GEM_RESOURCE_MARKERS: Readonly<Record<GemResource, string>> = {
  DAWN: "D", TIDE: "T", GROVE: "G", EMBER: "E", ECHO: "C", PRISM: "P",
};
export const GEM_TIER_LABELS: Readonly<Record<1 | 2 | 3, string>> = {
  1: "기초", 2: "성장", 3: "도약",
};

export function gemResourceTotal(resources: GemUiPlayer["resources"]): number {
  return GEM_RESOURCE_IDS.reduce((sum, resource) => sum + resources[resource], 0);
}

/** Selection-only convenience; supply, cap and all final legality remain server-owned. */
export function toggleGemCollectSelection(
  selection: GemCollectSelectionDto | null,
  resource: GemResource,
): GemCollectSelectionDto | null {
  if (resource === "PRISM") return selection?.kind === "PRISM" ? null : { kind: "PRISM" };
  const current = selection?.kind === "BASIC" ? selection.resources : [];
  if (current.includes(resource)) {
    const remaining = current.filter(value => value !== resource);
    return remaining.length === 0 ? null : { kind: "BASIC", resources: remaining };
  }
  if (current.length === 2) return selection;
  return { kind: "BASIC", resources: [...current, resource] };
}

export function gemCollectPreview(
  selection: GemCollectSelectionDto | null,
  resources: GemUiPlayer["resources"],
  supply: GemUiPlayer["resources"],
): Readonly<{ canCollect: boolean; count: number; message: string }> {
  const total = gemResourceTotal(resources);
  if (selection === null) return { canCollect: false, count: 0, message: total >= 9 ? "보유 한도 9개입니다. 카드를 구매해 자원을 사용하세요." : "서로 다른 기본 자원 1~2개 또는 프리즘 1개를 선택하세요." };
  const selected: readonly GemResource[] = selection.kind === "PRISM" ? ["PRISM"] : selection.resources;
  if (total + selected.length > 9) return { canCollect: false, count: selected.length, message: `받으면 ${total + selected.length}개가 되어 보유 한도 9개를 초과합니다.` };
  if (selected.some(resource => supply[resource] === 0)) return { canCollect: false, count: selected.length, message: "선택한 자원의 공용 공급이 부족합니다." };
  return { canCollect: true, count: selected.length, message: `${selected.map(resource => GEM_RESOURCE_LABELS[resource]).join(" + ")} 받기 · 이후 ${total + selected.length} / 9개` };
}

/** Snapshot-derived preview only; no payment plan is ever sent to the server. */
export function gemPaymentPreview(card: GemUiCard, player: GemUiPlayer) {
  const effective = { DAWN: 0, TIDE: 0, GROVE: 0, EMBER: 0, ECHO: 0 };
  const basicPayment = { ...effective };
  const missing = { ...effective };
  let prismRequired = 0;
  for (const resource of GEM_BASIC_RESOURCE_IDS) {
    effective[resource] = Math.max(0, card.cost[resource] - player.production[resource]);
    basicPayment[resource] = Math.min(effective[resource], player.resources[resource]);
    missing[resource] = effective[resource] - basicPayment[resource];
    prismRequired += missing[resource];
  }
  return { effective, basicPayment, missing, prismRequired, prismOwned: player.resources.PRISM,
    canAfford: prismRequired <= player.resources.PRISM,
    isFree: GEM_BASIC_RESOURCE_IDS.every(resource => effective[resource] === 0) };
}

/** Informational copy only; never used to enable/disable or dispatch a command. */
export function gemCurrentActionHint(game: GemCardPlayingProjectionV2, player: GemUiPlayer): string {
  if (player.reservedCards.some(card => gemPaymentPreview(card, player).canAfford)) return "예약한 카드를 구매할 수 있습니다.";
  if (game.market.some(tier => tier.slots.some(card => card !== null && gemPaymentPreview(card, player).canAfford)))
    return player.purchasedCards.length === 0 ? "구매 가능한 카드가 생겼습니다. 카드를 사면 영구 할인이 쌓입니다." : "지금 구매 가능한 카드가 있습니다.";
  if (gemResourceTotal(player.resources) === 0 && player.purchasedCards.length === 0 && player.reservedCards.length === 0) return "먼저 자원을 모아보세요.";
  return "자원 받기 · 카드 구매 · 카드 예약 중 행동 하나를 선택하세요.";
}

/** Only controls the explanatory hint/disabled state; the server verifies YIELD independently. */
export function gemHasMainActionHint(game: GemCardPlayingProjectionV2, player: GemUiPlayer): boolean {
  if (gemResourceTotal(player.resources) < 9 && GEM_RESOURCE_IDS.some(resource => game.supply[resource] > 0)) return true;
  const cards = game.market.flatMap(tier => tier.slots.filter(card => card !== null));
  if (player.reservedCards.length < 2 && cards.length > 0) return true;
  return [...cards, ...player.reservedCards].some(card => gemPaymentPreview(card, player).canAfford);
}

export function resolveGemSelectedCard(
  game: GemCardPlayingProjectionV2,
  player: GemUiPlayer,
  selected: Readonly<{ source: GemPurchaseSourceDto; cardId: GemUiCard["cardId"] }> | null,
): GemUiCard | null {
  if (selected === null) return null;
  const source = selected.source;
  const card = source.kind === "MARKET"
    ? game.market.find(tier => tier.tier === source.tier)?.slots[source.slotIndex]
    : player.reservedCards.find(candidate => candidate.cardId === source.cardId);
  return card?.cardId === selected.cardId ? card : null;
}

export function gemCardAccessibleLabel(card: GemUiCard): string {
  const costs = GEM_BASIC_RESOURCE_IDS.filter(resource => card.cost[resource] > 0)
    .map(resource => `${GEM_RESOURCE_LABELS[resource]} 비용 ${card.cost[resource]}`).join(", ");
  return `${card.tier}단계 카드, 승점 ${card.victoryPoints}점, ${costs || "기본 비용 없음"}, ${GEM_RESOURCE_LABELS[card.productionResource]} 영구 할인 +1`;
}

export function gemFinishReasonLabel(reason: GemCardFinishedProjectionV2["result"]["reason"]): string {
  switch (reason) {
    case "SCORE_THRESHOLD_ROUND_END": return "목표 점수 라운드 종료";
    case "MARKET_EXHAUSTED_ROUND_END": return "시장 소진 라운드 종료";
    case "NO_PROGRESS": return "더 이상 진행할 수 없음";
    case "LAST_PLAYER_STANDING": return "마지막 남은 플레이어";
  }
}

export function gemFairRoundLabel(reason: NonNullable<GemCardPlayingProjectionV2["fairRound"]>["reason"]): string {
  return reason === "SCORE_THRESHOLD_ROUND_END"
    ? "최종 라운드 진행 중 · 18점 이상인 플레이어가 나왔습니다. 현재 순서의 남은 차례까지 진행합니다."
    : "시장 종료 라운드 진행 중 · 시장의 카드가 모두 소진되었습니다. 현재 순서의 남은 차례까지 진행합니다.";
}

export function formatGemCountdown(seconds: number): string {
  const value = Math.max(0, Math.floor(seconds));
  return `${String(Math.floor(value / 60)).padStart(2, "0")}:${String(value % 60).padStart(2, "0")}`;
}
