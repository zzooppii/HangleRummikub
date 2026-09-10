import { JaipurCardIdSchema, type JaipurCardType, type JaipurCard, type JaipurGood } from "@hangul-rummikub/shared";
import { parse } from "valibot";

export const JAIPUR_CARD_COUNTS: Readonly<Record<JaipurCardType, number>> = { DIAMOND: 6, GOLD: 6, SILVER: 6, CLOTH: 8, SPICE: 8, LEATHER: 10, CAMEL: 11 };
export const JAIPUR_GOODS_VALUES: Readonly<Record<JaipurGood, readonly number[]>> = {
  DIAMOND: [7, 7, 5, 5, 5], GOLD: [6, 6, 5, 5, 5], SILVER: [5, 5, 5, 5, 5],
  CLOTH: [5, 3, 3, 2, 2, 1, 1], SPICE: [5, 3, 3, 2, 2, 1, 1], LEATHER: [4, 3, 2, 1, 1, 1, 1, 1, 1],
};
export const JAIPUR_BONUS_VALUES = [
  { size: 3, values: [1, 1, 2, 2, 2, 3, 3] },
  { size: 4, values: [4, 4, 5, 5, 6, 6] },
  { size: 5, values: [8, 8, 9, 10, 10] },
] as const;
export function makeJaipurCards(id: () => string): JaipurCard[] {
  const cards: JaipurCard[] = [];
  for (const type of Object.keys(JAIPUR_CARD_COUNTS)) {
    // The keys originate in the closed catalog; validate before using them.
    if (!(type === "DIAMOND" || type === "GOLD" || type === "SILVER" || type === "CLOTH" || type === "SPICE" || type === "LEATHER" || type === "CAMEL")) throw new Error("Invalid Jaipur catalog.");
    for (let n = 0; n < JAIPUR_CARD_COUNTS[type]; n++) cards.push({ cardId: parse(JaipurCardIdSchema, id()), type });
  }
  return cards;
}
