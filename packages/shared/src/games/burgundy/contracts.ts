import * as v from "valibot";
import {
  BurgundyExpansionSchema,
  BurgundyPlayerExpansionSchema,
  BurgundyExpansionPendingSchemas,
} from "./expansion-contracts.js";
import {
  GameIdSchema,
  PlayerIdSchema,
  TurnIdSchema,
  TileIdSchema,
} from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import {
  BurgundySettingsSchema,
  BurgundyTileSchema,
  BurgundyColorSchema,
  BurgundyDieValueSchema,
  BURGUNDY_RULES_VERSION,
} from "./actions.js";
export const BurgundyCountSchema = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(0),
  v.maxValue(100000),
);
const sixCounts = v.pipe(v.array(BurgundyCountSchema), v.length(6));
export const BurgundyPlacedTileSchema = v.strictObject({
  cellId: v.string(),
  tile: BurgundyTileSchema,
});
export const BurgundyScoreBreakdownSchema = v.strictObject({
  goodsSales: BurgundyCountSchema,
  animals: BurgundyCountSchema,
  regions: BurgundyCountSchema,
  phaseBonus: BurgundyCountSchema,
  colorBonus: BurgundyCountSchema,
  buildings: BurgundyCountSchema,
  expansion: BurgundyCountSchema,
});
export const BurgundyPlayerSchema = v.strictObject({
  extension: BurgundyPlayerExpansionSchema,
  scoreBreakdown: BurgundyScoreBreakdownSchema,
  playerId: PlayerIdSchema,
  score: BurgundyCountSchema,
  silver: BurgundyCountSchema,
  workers: BurgundyCountSchema,
  boardId: BurgundyCountSchema,
  board: v.pipe(v.array(BurgundyPlacedTileSchema), v.maxLength(37)),
  storage: v.pipe(v.array(BurgundyTileSchema), v.maxLength(182)),
  goods: sixCounts,
  soldGoods: sixCounts,
  soldGoodsCount: BurgundyCountSchema,
  dice: v.tuple([
    v.strictObject({ value: BurgundyDieValueSchema, used: v.boolean() }),
    v.strictObject({ value: BurgundyDieValueSchema, used: v.boolean() }),
  ]),
  shipPosition: BurgundyCountSchema,
  orderStamp: BurgundyCountSchema,
  purchased: v.boolean(),
  bonuses: v.array(v.string()),
});
export type BurgundyPlayer = v.InferOutput<typeof BurgundyPlayerSchema>;
export const BurgundyPendingSchema = v.variant("type", [
  ...BurgundyExpansionPendingSchemas,
  v.strictObject({
    type: v.literal("ACTION"),
    die: v.nullable(BurgundyDieValueSchema),
    source: v.optional(v.literal("CASTLE")),
  }),
  v.strictObject({
    type: v.literal("TAKE"),
    colors: v.array(BurgundyColorSchema),
  }),
  v.strictObject({ type: v.literal("PLACE") }),
  v.strictObject({ type: v.literal("SELL") }),
  v.strictObject({ type: v.literal("SHIP") }),
  v.strictObject({ type: v.literal("CRANE") }),
  v.strictObject({
    type: v.literal("GEESE"),
    tileId: TileIdSchema,
    cellId: v.string(),
  }),
]);
export type BurgundyPending = v.InferOutput<typeof BurgundyPendingSchema>;
export const BurgundyFeedbackSchema = v.strictObject({
  playerId: PlayerIdSchema,
  message: v.string(),
  points: BurgundyCountSchema,
  automatic: v.boolean(),
  at: ServerTimeSchema,
});
export const BurgundyResultSchema = v.strictObject({
  reason: v.picklist(["COMPLETED", "CANCELLED"]),
  winnerPlayerIds: v.array(PlayerIdSchema),
  scores: v.array(
    v.strictObject({
      playerId: PlayerIdSchema,
      earned: BurgundyScoreBreakdownSchema,
      base: BurgundyCountSchema,
      goods: BurgundyCountSchema,
      silver: BurgundyCountSchema,
      workers: BurgundyCountSchema,
      knowledge: BurgundyCountSchema,
      expansion: BurgundyCountSchema,
      total: BurgundyCountSchema,
    }),
  ),
});
const base = {
  expansion: BurgundyExpansionSchema,
  gameType: v.literal("BURGUNDY"),
  gameId: GameIdSchema,
  gameRevision: GameRevisionSchema,
  rulesVersion: v.literal(BURGUNDY_RULES_VERSION),
  settings: BurgundySettingsSchema,
  endingPhase: v.boolean(),
  phaseIndex: v.pipe(BurgundyCountSchema, v.maxValue(4)),
  roundIndex: v.pipe(BurgundyCountSchema, v.maxValue(4)),
  whiteDie: BurgundyDieValueSchema,
  playerStates: v.pipe(
    v.array(BurgundyPlayerSchema),
    v.minLength(2),
    v.maxLength(4),
  ),
  depots: v.pipe(v.array(v.array(BurgundyTileSchema)), v.length(6)),
  blackDepot: v.array(BurgundyTileSchema),
  inns: v.array(BurgundyTileSchema),
  depotGoods: v.pipe(v.array(sixCounts), v.length(6)),
  roundGoods: v.array(BurgundyDieValueSchema),
  supplyCount: BurgundyCountSchema,
  discardCount: BurgundyCountSchema,
  roundOrder: v.array(PlayerIdSchema),
  turnOrder: v.array(PlayerIdSchema),
  pending: v.array(BurgundyPendingSchema),
  colorFinishers: v.record(BurgundyColorSchema, v.array(PlayerIdSchema)),
  feedback: v.nullable(BurgundyFeedbackSchema),
  history: v.pipe(v.array(BurgundyFeedbackSchema), v.maxLength(12)),
};
export const BurgundyPlayingProjectionSchema = v.strictObject({
  ...base,
  phase: v.literal("PLAYING"),
  turnId: TurnIdSchema,
  activePlayerId: PlayerIdSchema,
  turnStartedAt: ServerTimeSchema,
  deadlineAt: ServerTimeSchema,
});
export const BurgundyFinishedProjectionSchema = v.strictObject({
  ...base,
  phase: v.literal("FINISHED"),
  result: BurgundyResultSchema,
});
export type BurgundyPlayingProjection = v.InferOutput<
  typeof BurgundyPlayingProjectionSchema
>;
export type BurgundyFinishedProjection = v.InferOutput<
  typeof BurgundyFinishedProjectionSchema
>;
export type BurgundyProjection =
  BurgundyPlayingProjection | BurgundyFinishedProjection;
export function burgundyProjectionIsConsistent(g: BurgundyProjection): boolean {
  const players = new Set(g.playerStates.map((p) => p.playerId));
  const tiles = [
    ...g.depots.flat(),
    ...g.blackDepot,
    ...g.inns,
    ...g.playerStates.flatMap((p) => [
      ...p.storage,
      ...p.board.map((b) => b.tile),
    ]),
  ];
  return (
    players.size === g.playerStates.length &&
    new Set(tiles.map((t) => t.tileId)).size === tiles.length &&
    g.roundOrder.length === players.size &&
    new Set(g.roundOrder).size === players.size &&
    g.roundOrder.every((id) => players.has(id)) &&
    g.turnOrder.length === players.size &&
    new Set(g.turnOrder).size === players.size &&
    g.turnOrder.every((id) => players.has(id)) &&
    g.playerStates.every(
      (p) =>
        new Set(p.board.map((t) => t.cellId)).size === p.board.length &&
        p.goods.filter((n) => n > 0).length <= 3,
    ) &&
    (g.phase === "FINISHED"
      ? g.result.winnerPlayerIds.every((id) => players.has(id))
      : players.has(g.activePlayerId) &&
        g.deadlineAt === g.turnStartedAt + g.settings.turnSeconds * 1000)
  );
}
