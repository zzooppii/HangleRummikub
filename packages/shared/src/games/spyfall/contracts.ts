import * as v from "valibot";

export const SPYFALL_LOCATION_IDS = ["HOSPITAL", "SCHOOL", "AIRPORT", "HOTEL", "RESTAURANT", "CINEMA", "LIBRARY", "BEACH", "BANK", "CIRCUS", "MUSEUM", "THEATER", "TRAIN", "CRUISE", "SPACE", "SUBMARINE", "FARM", "SKI", "FIRE_STATION", "POLICE", "ZOO", "GARDEN", "TV_STUDIO", "DIG_SITE"] as const;
export const SpyfallLocationSchema = v.picklist(SPYFALL_LOCATION_IDS);
export type SpyfallLocation = v.InferOutput<typeof SpyfallLocationSchema>;
export const SPYFALL_LOCATION_LABELS: Readonly<Record<SpyfallLocation, string>> = {
  HOSPITAL: "병원", SCHOOL: "학교", AIRPORT: "공항", HOTEL: "호텔", RESTAURANT: "레스토랑", CINEMA: "영화관",
  LIBRARY: "도서관", BEACH: "해변", BANK: "은행", CIRCUS: "서커스", MUSEUM: "박물관", THEATER: "극장",
  TRAIN: "기차", CRUISE: "크루즈", SPACE: "우주 정거장", SUBMARINE: "잠수함", FARM: "농장", SKI: "스키장",
  FIRE_STATION: "소방서", POLICE: "경찰서", ZOO: "동물원", GARDEN: "식물원", TV_STUDIO: "방송국", DIG_SITE: "유적 발굴지",
};
export const SpyfallSettingsSchema = v.strictObject({ roundSeconds: v.picklist([360, 480, 600]), useRoles: v.boolean(), locationPack: v.picklist(["EVERYDAY", "ALL"]) });
export type SpyfallSettings = v.InferOutput<typeof SpyfallSettingsSchema>;
export const SPYFALL_DEFAULT_SETTINGS: SpyfallSettings = { roundSeconds: 480, useRoles: false, locationPack: "ALL" };
export function spyfallLocations(pack: SpyfallSettings["locationPack"]): readonly SpyfallLocation[] { return pack === "EVERYDAY" ? SPYFALL_LOCATION_IDS.slice(0, 12) : SPYFALL_LOCATION_IDS; }
export const SpyfallStageSchema = v.picklist(["REVEAL", "QUESTION", "ANSWER", "ACCUSATION", "FINAL_ACCUSATION", "GUESS"]);
export type SpyfallStage = v.InferOutput<typeof SpyfallStageSchema>;
export const SpyfallRoleLabelSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(40));
