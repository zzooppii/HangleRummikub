import * as v from "valibot";

// Values are supplied by the caller; this domain never generates identifiers.
const CityOpaqueIdentitySchema = v.pipe(v.string(), v.nonEmpty(), v.maxLength(128));

export const CityPlayerIdSchema = v.pipe(CityOpaqueIdentitySchema, v.brand("CityPlayerId"));
export const CityGameIdSchema = v.pipe(CityOpaqueIdentitySchema, v.brand("CityGameId"));
export const CityActionIdSchema = v.pipe(CityOpaqueIdentitySchema, v.brand("CityActionId"));
export const BuildingCardIdSchema = v.pipe(CityOpaqueIdentitySchema, v.brand("BuildingCardId"));

export type CityPlayerId = v.InferOutput<typeof CityPlayerIdSchema>;
export type CityGameId = v.InferOutput<typeof CityGameIdSchema>;
export type CityActionId = v.InferOutput<typeof CityActionIdSchema>;
export type BuildingCardId = v.InferOutput<typeof BuildingCardIdSchema>;

export function parseCityPlayerId(value: unknown): CityPlayerId {
  return v.parse(CityPlayerIdSchema, value);
}

export function parseCityGameId(value: unknown): CityGameId {
  return v.parse(CityGameIdSchema, value);
}

export function parseCityActionId(value: unknown): CityActionId {
  return v.parse(CityActionIdSchema, value);
}

export function parseBuildingCardId(value: unknown): BuildingCardId {
  return v.parse(BuildingCardIdSchema, value);
}
