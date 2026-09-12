import * as v from "valibot";
import { TileIdSchema } from "../../identifiers.js";
import { BURGUNDY_BOARDS } from "./boards.js";
import { BURGUNDY_EXPANSION_CATALOG } from "./expansion-data.js";
import { BurgundyExpansionActionSchemas } from "./expansion-contracts.js";
export const BURGUNDY_RULES_VERSION = "burgundy-anniversary-2019-v1";
export const BurgundyColorSchema = v.picklist([
  "BUILDING",
  "LIVESTOCK",
  "MINE",
  "SHIP",
  "MONASTERY",
  "CASTLE",
]);
export type BurgundyColor = v.InferOutput<typeof BurgundyColorSchema>;
const BurgundySettingsShapeSchema = v.strictObject({
  turnSeconds: v.picklist([30, 60, 90]),
  boardId: v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(30)),
  extraTiles: v.boolean(),
  whiteCastles: v.boolean(),
  inns: v.boolean(),
  borderPosts: v.boolean(),
  tradeRoutes: v.boolean(),
  shields: v.boolean(),
  extraDuchies: v.boolean(),
});
export type BurgundySettings = v.InferOutput<
  typeof BurgundySettingsShapeSchema
>;
export function burgundySettingsUnavailableReason(
  settings: BurgundySettings,
): string | null {
  const board = BURGUNDY_BOARDS.find((board) => board.id === settings.boardId);
  if (!board) return "공식 배치 데이터가 확인되지 않은 공국입니다.";
  if (settings.boardId > 10 && !settings.extraDuchies && !settings.borderPosts)
    return "추가 공국을 사용하려면 추가 공국 확장을 켜세요.";
  if (settings.borderPosts && board.borderPostGroups?.length !== 3)
    return "국경 초소 확장에는 초소가 표시된 11a–11f 공국이 필요합니다.";
  if (
    settings.tradeRoutes &&
    BURGUNDY_EXPANSION_CATALOG.tradeRoutes.length !== 12
  )
    return "교역로 12장의 공식 구성 데이터가 아직 확인되지 않았습니다.";
  return null;
}
export const BurgundySettingsSchema = v.pipe(
  BurgundySettingsShapeSchema,
  v.check(
    (settings) => burgundySettingsUnavailableReason(settings) === null,
    "사용할 수 없는 공국 또는 확장 설정입니다.",
  ),
);
export const BURGUNDY_DEFAULT_SETTINGS: BurgundySettings = {
  turnSeconds: 60,
  boardId: 1,
  extraTiles: false,
  whiteCastles: false,
  inns: false,
  borderPosts: false,
  tradeRoutes: false,
  shields: false,
  extraDuchies: false,
};
export const BurgundyDieValueSchema = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(1),
  v.maxValue(6),
);
export const BurgundyTileSchema = v.strictObject({
  tileId: TileIdSchema,
  kind: v.pipe(v.string(), v.minLength(1), v.maxLength(60)),
});
export type BurgundyTile = v.InferOutput<typeof BurgundyTileSchema>;
const dieIndex = v.picklist([0, 1]);
const cell = v.pipe(v.string(), v.minLength(1), v.maxLength(30));
const spent = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(0),
  v.maxValue(100),
);
export const BurgundyActionSchema = v.variant("type", [
  ...BurgundyExpansionActionSchemas,
  v.strictObject({
    type: v.literal("TAKE"),
    die: dieIndex,
    value: BurgundyDieValueSchema,
    tileId: TileIdSchema,
    discardTileId: v.optional(TileIdSchema),
  }),
  v.strictObject({
    type: v.literal("PLACE"),
    die: dieIndex,
    value: BurgundyDieValueSchema,
    tileId: TileIdSchema,
    cellId: cell,
  }),
  v.strictObject({
    type: v.literal("SELL"),
    die: dieIndex,
    value: BurgundyDieValueSchema,
  }),
  v.strictObject({ type: v.literal("WORKERS"), die: dieIndex }),
  v.strictObject({
    type: v.literal("BUY"),
    workers: v.optional(v.picklist([0, 1, 2])),
    tileId: TileIdSchema,
    discardTileId: v.optional(TileIdSchema),
  }),
  v.strictObject({ type: v.literal("BUY_WORKERS"), silver: spent }),
  v.strictObject({
    type: v.literal("EFFECT_TAKE"),
    tileId: TileIdSchema,
    value: v.optional(BurgundyDieValueSchema),
    discardTileId: v.optional(TileIdSchema),
  }),
  v.strictObject({
    type: v.literal("EFFECT_PLACE"),
    tileId: TileIdSchema,
    cellId: cell,
    value: v.optional(BurgundyDieValueSchema),
  }),
  v.strictObject({
    type: v.literal("EFFECT_SELL"),
    value: BurgundyDieValueSchema,
  }),
  v.strictObject({ type: v.literal("EFFECT_WORKERS") }),
  v.strictObject({
    type: v.literal("SHIP_GOODS"),
    depot: BurgundyDieValueSchema,
    adjacentDepot: v.optional(BurgundyDieValueSchema),
    shieldType: v.optional(BurgundyDieValueSchema),
    types: v.pipe(v.array(BurgundyDieValueSchema), v.maxLength(3)),
  }),
  v.strictObject({
    type: v.literal("CRANE"),
    building: v.picklist([
      "MARKET",
      "CARPENTER",
      "CHURCH",
      "WAREHOUSE",
      "BOARDING_HOUSE",
      "BANK",
      "TOWN_HALL",
      "WATCHTOWER",
      "WHITE_CASTLE",
    ]),
  }),
  v.strictObject({
    type: v.literal("GEESE"),
    animal: v.picklist(["SHEEP", "PIG", "COW", "GOAT"]),
  }),
  v.strictObject({ type: v.literal("SKIP_EFFECT") }),
  v.strictObject({ type: v.literal("END_TURN") }),
]);
export type BurgundyAction = v.InferOutput<typeof BurgundyActionSchema>;
