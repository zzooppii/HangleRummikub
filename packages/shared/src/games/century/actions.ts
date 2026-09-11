import * as v from 'valibot';
export const CenturyCountSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
export const CenturySpicesSchema = v.tuple([CenturyCountSchema, CenturyCountSchema, CenturyCountSchema, CenturyCountSchema]);
export type CenturySpices = v.InferOutput<typeof CenturySpicesSchema>;
export const CenturyColorSchema = v.picklist([0, 1, 2, 3]);
export type CenturyColor = v.InferOutput<typeof CenturyColorSchema>;
export const CenturyCardIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128), v.brand('CenturyCardId'));
export type CenturyCardId = v.InferOutput<typeof CenturyCardIdSchema>;
export const CenturyMerchantSchema = v.variant('kind', [
  v.strictObject({ cardId: CenturyCardIdSchema, kind: v.literal('PRODUCE'), gain: CenturySpicesSchema }),
  v.strictObject({ cardId: CenturyCardIdSchema, kind: v.literal('TRADE'), cost: CenturySpicesSchema, gain: CenturySpicesSchema }),
  v.strictObject({ cardId: CenturyCardIdSchema, kind: v.literal('UPGRADE'), steps: v.picklist([2, 3]) }),
]);
export type CenturyMerchant = v.InferOutput<typeof CenturyMerchantSchema>;
export const CenturyPointSchema = v.strictObject({ cardId: CenturyCardIdSchema, cost: CenturySpicesSchema, points: v.pipe(CenturyCountSchema, v.minValue(6), v.maxValue(20)) });
export type CenturyPoint = v.InferOutput<typeof CenturyPointSchema>;
const returned = { returned: CenturySpicesSchema };
export const CenturyActionSchema = v.variant('kind', [
  v.strictObject({ kind: v.literal('PRODUCE'), cardId: CenturyCardIdSchema, ...returned }),
  v.strictObject({ kind: v.literal('TRADE'), cardId: CenturyCardIdSchema, times: v.pipe(CenturyCountSchema, v.minValue(1), v.maxValue(10)), ...returned }),
  v.strictObject({ kind: v.literal('UPGRADE'), cardId: CenturyCardIdSchema, upgrades: v.pipe(v.array(v.picklist([0, 1, 2])), v.maxLength(3)), ...returned }),
  v.strictObject({ kind: v.literal('ACQUIRE'), cardId: CenturyCardIdSchema, payment: v.pipe(v.array(v.strictObject({ cardId: CenturyCardIdSchema, color: CenturyColorSchema })), v.maxLength(5)), ...returned }),
  v.strictObject({ kind: v.literal('REST'), ...returned }),
  v.strictObject({ kind: v.literal('CLAIM'), cardId: CenturyCardIdSchema, ...returned }),
]);
export type CenturyAction = v.InferOutput<typeof CenturyActionSchema>;
export const CENTURY_COLORS = [0, 1, 2, 3] as const;
export const centurySum = (spices: readonly number[]): number => spices.reduce((a, b) => a + b, 0);
