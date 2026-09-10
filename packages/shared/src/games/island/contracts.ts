import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import { IslandCountSchema, IslandResourcesSchema, IslandOpaqueIdSchema, IslandCardKindSchema, IslandHexFaceSchema, IslandBuildingSchema, IslandRoadSchema, IslandPortSchema, IslandHexIdSchema, IslandStageSchema, IslandTradeSchema, IslandEdgeIdSchema, IslandVertexIdSchema } from "./actions.js";
export const IslandLogSchema = v.strictObject({ revision: GameRevisionSchema, playerId: v.nullable(PlayerIdSchema), text: v.pipe(v.string(), v.maxLength(160)), automatic: v.boolean() });
export const IslandPrivateSchema = v.strictObject({
  playerId: PlayerIdSchema, resources: IslandResourcesSchema,
  cards: v.pipe(v.array(v.strictObject({ id: IslandOpaqueIdSchema, kind: IslandCardKindSchema, playable: v.boolean() })), v.maxLength(25)),
  totalPoints: IslandCountSchema,
});
const Base = {
  gameType: v.literal("ISLAND_SETTLERS"), gameId: GameIdSchema, gameRevision: GameRevisionSchema, rulesVersion: v.literal("island-v1"),
  hexes: v.pipe(v.array(IslandHexFaceSchema), v.length(19)), ports: v.pipe(v.array(IslandPortSchema), v.length(9)),
  buildings: v.pipe(v.array(IslandBuildingSchema), v.maxLength(36)), roads: v.pipe(v.array(IslandRoadSchema), v.maxLength(60)),
  robber: IslandHexIdSchema, bank: IslandResourcesSchema, developmentCount: v.pipe(IslandCountSchema, v.maxValue(25)),
  playerStates: v.pipe(v.array(v.strictObject({
    playerId: PlayerIdSchema, resourceCount: IslandCountSchema, developmentCount: v.pipe(IslandCountSchema, v.maxValue(25)),
    knights: v.pipe(IslandCountSchema, v.maxValue(14)), roadLength: v.pipe(IslandCountSchema, v.maxValue(15)), publicPoints: IslandCountSchema,
    remainingRoads: v.pipe(IslandCountSchema, v.maxValue(15)), remainingSettlements: v.pipe(IslandCountSchema, v.maxValue(5)), remainingCities: v.pipe(IslandCountSchema, v.maxValue(4)),
  })), v.minLength(3), v.maxLength(4)),
  longestRoadPlayerId: v.nullable(PlayerIdSchema), largestArmyPlayerId: v.nullable(PlayerIdSchema),
  dice: v.nullable(v.tuple([v.picklist([1, 2, 3, 4, 5, 6]), v.picklist([1, 2, 3, 4, 5, 6])])),
  log: v.pipe(v.array(IslandLogSchema), v.maxLength(24)), privateState: IslandPrivateSchema,
};
export const IslandPlayingProjectionSchema = v.strictObject({
  ...Base, phase: v.literal("PLAYING"), activePlayerId: PlayerIdSchema, turnId: TurnIdSchema, turnNumber: v.pipe(v.number(), v.safeInteger(), v.minValue(0)),
  deadlineAt: ServerTimeSchema, stage: IslandStageSchema, trade: v.nullable(IslandTradeSchema),
  legalActions: v.strictObject({
    roadEdges: v.pipe(v.array(IslandEdgeIdSchema), v.maxLength(72)), settlementVertices: v.pipe(v.array(IslandVertexIdSchema), v.maxLength(54)),
    cityVertices: v.pipe(v.array(IslandVertexIdSchema), v.maxLength(54)), robberHexes: v.pipe(v.array(IslandHexIdSchema), v.maxLength(18)),
    bankRates: v.strictObject({ WOOD: v.picklist([2, 3, 4]), BRICK: v.picklist([2, 3, 4]), WOOL: v.picklist([2, 3, 4]), GRAIN: v.picklist([2, 3, 4]), ORE: v.picklist([2, 3, 4]) }),
    canBuyCard: v.boolean(), canPlayCard: v.boolean(),
  }),
});
export const IslandFinishedProjectionSchema = v.strictObject({
  ...Base, phase: v.literal("FINISHED"), result: v.strictObject({
    reason: v.picklist(["VICTORY", "CANCELLED"]), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(1)),
    scores: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, points: IslandCountSchema })), v.minLength(3), v.maxLength(4)),
  }),
});
