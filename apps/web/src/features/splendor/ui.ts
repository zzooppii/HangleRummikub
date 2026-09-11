import {
  SPLENDOR_COLORS,
  SPLENDOR_TOKENS,
  type SplendorCard,
  type SplendorCity,
  type SplendorTokens,
  type SplendorCost,
} from "@hangul-rummikub/shared";
export const TOKEN_LABELS = {
  WHITE: "다이아몬드",
  BLUE: "사파이어",
  GREEN: "에메랄드",
  RED: "루비",
  BLACK: "오닉스",
  GOLD: "황금",
};
export const zeroTokens = (): SplendorTokens => ({
  WHITE: 0,
  BLUE: 0,
  GREEN: 0,
  RED: 0,
  BLACK: 0,
  GOLD: 0,
});
export const tokenTotal = (t: SplendorTokens) =>
  SPLENDOR_TOKENS.reduce((n, k) => n + t[k], 0);
export function effectiveCost(
  card: SplendorCard,
  bonus: SplendorCost,
): SplendorCost {
  return {
    WHITE: Math.max(0, card.cost.WHITE - bonus.WHITE),
    BLUE: Math.max(0, card.cost.BLUE - bonus.BLUE),
    GREEN: Math.max(0, card.cost.GREEN - bonus.GREEN),
    RED: Math.max(0, card.cost.RED - bonus.RED),
    BLACK: Math.max(0, card.cost.BLACK - bonus.BLACK),
  };
}
export function paymentPreview(
  card: SplendorCard,
  bonus: SplendorCost,
  held: SplendorTokens,
  chosen?: SplendorTokens,
) {
  const cost = effectiveCost(card, bonus),
    payment = zeroTokens();
  for (const k of SPLENDOR_COLORS) {
    payment[k] = chosen ? chosen[k] : Math.min(cost[k], held[k]);
    payment.GOLD += cost[k] - payment[k];
  }
  const can =
    SPLENDOR_COLORS.every(
      (k) => payment[k] >= 0 && payment[k] <= cost[k] && payment[k] <= held[k],
    ) &&
    payment.GOLD >= 0 &&
    payment.GOLD <= held.GOLD;
  return {
    cost,
    payment,
    can,
    shortage: Math.max(0, payment.GOLD - held.GOLD),
  };
}
export function validTake(t: SplendorTokens, bank: SplendorTokens): boolean {
  const keys = SPLENDOR_COLORS.filter((k) => t[k] > 0),
    available = SPLENDOR_COLORS.filter((k) => bank[k] > 0).length;
  return (
    t.GOLD === 0 &&
    keys.every((k) => Number.isInteger(t[k]) && t[k] <= bank[k]) &&
    ((keys.length === 1 && t[keys[0]!] === 2 && bank[keys[0]!] >= 4) ||
      (keys.length === Math.min(3, available) &&
        keys.length > 0 &&
        keys.every((k) => t[k] === 1)))
  );
}
export function cardLabel(c: SplendorCard): string {
  return `${c.tier}단계, ${c.points}점, ${TOKEN_LABELS[c.bonus]} 영구 할인 1. 비용 ${SPLENDOR_COLORS.filter(
    (k) => c.cost[k] > 0,
  )
    .map((k) => `${TOKEN_LABELS[k]} ${c.cost[k]}`)
    .join(", ")}`;
}

export function cityLabel(c: SplendorCity): string {
  const colors = SPLENDOR_COLORS.filter(k => c.cost[k] > 0)
    .map(k => `${TOKEN_LABELS[k]} 영구 할인 ${c.cost[k]}개`);
  if (c.sameColor) colors.push(`${colors.length ? "지정 색 이외의 " : ""}한 가지 색 영구 할인 ${c.sameColor}개`);
  return `도시 ${c.tile}, 명성 ${c.points}점 이상${colors.length ? `, ${colors.join(", ")}` : ""}`;
}
export function cityRemaining(c: SplendorCity, score: number, bonus: SplendorCost) {
  const fixed = SPLENDOR_COLORS.reduce((n,k) => n + Math.max(0, c.cost[k] - bonus[k]), 0);
  const same = c.sameColor === 0 ? 0 : Math.min(...SPLENDOR_COLORS.filter(k => c.cost[k] === 0).map(k => Math.max(0, c.sameColor - bonus[k])));
  return {points: Math.max(0, c.points - score), cards: fixed + same};
}
