import * as v from "valibot";
import { PlayerIdSchema } from "../../identifiers.js";

export const ISLAND_RESOURCES = ["WOOD", "BRICK", "WOOL", "GRAIN", "ORE"] as const;
export const IslandResourceSchema = v.picklist(ISLAND_RESOURCES);
export type IslandResource = v.InferOutput<typeof IslandResourceSchema>;
export const IslandCountSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(95));
const ResourceCount = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(19));
export const IslandResourcesSchema = v.strictObject({ WOOD: ResourceCount, BRICK: ResourceCount, WOOL: ResourceCount, GRAIN: ResourceCount, ORE: ResourceCount });
export type IslandResources = v.InferOutput<typeof IslandResourcesSchema>;
export const emptyIslandResources = (): IslandResources => ({ WOOD: 0, BRICK: 0, WOOL: 0, GRAIN: 0, ORE: 0 });
export const islandResourceCount = (resources: IslandResources): number => ISLAND_RESOURCES.reduce((sum, r) => sum + resources[r], 0);
export const IslandVertexIdSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(53));
export const IslandEdgeIdSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(71));
export const IslandHexIdSchema = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(18));
export const IslandCardKindSchema = v.picklist(["KNIGHT", "VICTORY", "ROADS", "PLENTY", "MONOPOLY"]);
export const IslandOpaqueIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
export const IslandHexFaceSchema = v.strictObject({ id: IslandHexIdSchema, resource: v.nullable(IslandResourceSchema), number: v.nullable(v.picklist([2, 3, 4, 5, 6, 8, 9, 10, 11, 12])) });
export const IslandBuildingSchema = v.strictObject({ vertex: IslandVertexIdSchema, playerId: PlayerIdSchema, kind: v.picklist(["SETTLEMENT", "CITY"]) });
export const IslandRoadSchema = v.strictObject({ edge: IslandEdgeIdSchema, playerId: PlayerIdSchema });
export const IslandPortSchema = v.strictObject({ edge: IslandEdgeIdSchema, resource: v.nullable(IslandResourceSchema) });
export const IslandTradeSchema = v.strictObject({
  id: IslandOpaqueIdSchema, proposerId: PlayerIdSchema, give: IslandResourcesSchema, receive: IslandResourcesSchema,
  responses: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, accepted: v.boolean() })), v.maxLength(3)),
});
export type IslandTrade = v.InferOutput<typeof IslandTradeSchema>;
export const IslandStageSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("SETUP_SETTLEMENT") }),
  v.strictObject({ kind: v.literal("SETUP_ROAD"), vertex: IslandVertexIdSchema }),
  v.strictObject({ kind: v.literal("ROLL") }),
  v.strictObject({ kind: v.literal("ACTION") }),
  v.strictObject({ kind: v.literal("DISCARD"), pending: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, count: IslandCountSchema })), v.minLength(1), v.maxLength(4)) }),
  v.strictObject({ kind: v.literal("ROBBER_HEX"), returnTo: v.picklist(["ROLL", "ACTION"]) }),
  v.strictObject({ kind: v.literal("ROBBER_VICTIM"), returnTo: v.picklist(["ROLL", "ACTION"]), candidates: v.pipe(v.array(PlayerIdSchema), v.minLength(1), v.maxLength(3)) }),
  v.strictObject({ kind: v.literal("FREE_ROADS"), returnTo: v.picklist(["ROLL", "ACTION"]), remaining: v.picklist([1, 2]) }),
]);
export type IslandStage = v.InferOutput<typeof IslandStageSchema>;
export const IslandActionSchema = v.variant("type", [
  v.strictObject({ type: v.literal("ROLL") }),
  v.strictObject({ type: v.literal("END_TURN") }),
  v.strictObject({ type: v.literal("BUILD_ROAD"), edge: IslandEdgeIdSchema }),
  v.strictObject({ type: v.literal("BUILD_SETTLEMENT"), vertex: IslandVertexIdSchema }),
  v.strictObject({ type: v.literal("BUILD_CITY"), vertex: IslandVertexIdSchema }),
  v.strictObject({ type: v.literal("BUY_CARD") }),
  v.strictObject({ type: v.literal("PLAY_KNIGHT"), cardId: IslandOpaqueIdSchema }),
  v.strictObject({ type: v.literal("PLAY_ROADS"), cardId: IslandOpaqueIdSchema }),
  v.strictObject({ type: v.literal("PLAY_PLENTY"), cardId: IslandOpaqueIdSchema, resources: IslandResourcesSchema }),
  v.strictObject({ type: v.literal("PLAY_MONOPOLY"), cardId: IslandOpaqueIdSchema, resource: IslandResourceSchema }),
  v.strictObject({ type: v.literal("DISCARD"), resources: IslandResourcesSchema }),
  v.strictObject({ type: v.literal("MOVE_ROBBER"), hex: IslandHexIdSchema }),
  v.strictObject({ type: v.literal("STEAL"), playerId: PlayerIdSchema }),
  v.strictObject({ type: v.literal("BANK_TRADE"), give: IslandResourceSchema, receive: IslandResourceSchema }),
  v.strictObject({ type: v.literal("OFFER_TRADE"), give: IslandResourcesSchema, receive: IslandResourcesSchema }),
  v.strictObject({ type: v.literal("RESPOND_TRADE"), tradeId: IslandOpaqueIdSchema, accepted: v.boolean() }),
  v.strictObject({ type: v.literal("CONFIRM_TRADE"), tradeId: IslandOpaqueIdSchema, playerId: PlayerIdSchema }),
  v.strictObject({ type: v.literal("CANCEL_TRADE"), tradeId: IslandOpaqueIdSchema }),
]);
export type IslandAction = v.InferOutput<typeof IslandActionSchema>;
