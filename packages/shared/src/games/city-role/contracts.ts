import * as v from "valibot";
import { OPAQUE_IDENTIFIER_MAX_LENGTH, PlayerIdSchema } from "../../identifiers.js";

export const CITY_ROLE_IDS = Object.freeze(["CR-01", "CR-02", "CR-03", "CR-04", "CR-05", "CR-06", "CR-07", "CR-08"] as const);
export const CITY_ALL_ROLE_IDS = [...CITY_ROLE_IDS, "CR-09"] as const;
export const CityRoleIdSchema = v.picklist(CITY_ALL_ROLE_IDS);
export type CityRoleId = v.InferOutput<typeof CityRoleIdSchema>;
export const CityActionIdSchema = v.pipe(v.string(), v.nonEmpty(), v.maxLength(OPAQUE_IDENTIFIER_MAX_LENGTH), v.brand("CityActionId"));
export type CityActionId = v.InferOutput<typeof CityActionIdSchema>;
export const CityBuildingCardIdSchema = v.pipe(v.string(), v.nonEmpty(), v.maxLength(OPAQUE_IDENTIFIER_MAX_LENGTH), v.brand("BuildingCardId"));
export type CityBuildingCardId = v.InferOutput<typeof CityBuildingCardIdSchema>;
export const CityBuildingTemplateIdSchema = v.pipe(v.string(), v.regex(/^CB-(?:(?:CIV|CUL|TRA|GUA|LAN)-0[1-6]|SP-(?:0[1-9]|[12][0-9]|30))$/u));
export const CityCategorySchema = v.picklist(["CIVIC", "CULTURE", "TRADE", "GUARD", "LANDMARK"]);
export const CityPublicBuildingSchema = v.pipe(v.strictObject({
  cardId: CityBuildingCardIdSchema, templateId: CityBuildingTemplateIdSchema,
  name: v.pipe(v.string(), v.nonEmpty(), v.maxLength(80)), category: CityCategorySchema,
  cost: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(7)),
  victoryPoints: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(7)),
}), v.check(card => card.cost === card.victoryPoints && (card.cost > 0 || card.templateId === "CB-SP-24"), "CITY printed cost and VP must match."));
export type CityPublicBuilding = v.InferOutput<typeof CityPublicBuildingSchema>;
export const CityRoleAbilityPayloadSchema = v.variant("ability", [
  v.strictObject({ ability: v.literal("MARK_ROLE_DISABLED"), targetRoleId: CityRoleIdSchema }),
  v.strictObject({ ability: v.literal("MARK_ROLE_GOLD_TRANSFER"), targetRoleId: CityRoleIdSchema }),
  v.strictObject({ ability: v.literal("EXCHANGE_HANDS"), targetPlayerId: PlayerIdSchema }),
  v.strictObject({ ability: v.literal("REPLACE_OWN_CARDS"), cardIds: v.pipe(v.array(CityBuildingCardIdSchema), v.minLength(1), v.maxLength(68), v.check(ids => new Set(ids).size === ids.length)) }),
  v.strictObject({ ability: v.literal("DESTROY_BUILDING"), targetPlayerId: PlayerIdSchema, cardId: CityBuildingCardIdSchema }),
]);
export type CityRoleAbilityPayload = v.InferOutput<typeof CityRoleAbilityPayloadSchema>;
export const CityFinishReasonSchema = v.picklist(["CITY_COMPLETION_ROUND_END", "LAST_PLAYER_STANDING", "NO_ELIGIBLE_PLAYERS"]);
