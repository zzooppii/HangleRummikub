import * as v from "valibot";
import { TileIdSchema } from "../../identifiers.js";

export const CLUE_SUSPECTS = ["SCARLET", "MUSTARD", "PLUM", "GREEN", "WHITE", "PEACOCK"] as const;
export const CLUE_WEAPONS = ["CANDLESTICK", "ROPE", "WRENCH", "PIPE", "DAGGER", "REVOLVER"] as const;
export const CLUE_ROOMS = ["KITCHEN", "BALLROOM", "CONSERVATORY", "DINING", "BILLIARD", "LIBRARY", "LOUNGE", "HALL", "STUDY"] as const;
export const CLUE_CARD_KEYS = [...CLUE_SUSPECTS, ...CLUE_WEAPONS, ...CLUE_ROOMS] as const;
export const ClueSuspectSchema = v.picklist(CLUE_SUSPECTS);
export const ClueWeaponSchema = v.picklist(CLUE_WEAPONS);
export const ClueRoomSchema = v.picklist(CLUE_ROOMS);
export const ClueCardKeySchema = v.picklist(CLUE_CARD_KEYS);
export type ClueSuspect = v.InferOutput<typeof ClueSuspectSchema>;
export type ClueWeapon = v.InferOutput<typeof ClueWeaponSchema>;
export type ClueRoom = v.InferOutput<typeof ClueRoomSchema>;
export type ClueCardKey = v.InferOutput<typeof ClueCardKeySchema>;
export const ClueCardSchema = v.strictObject({ cardId: TileIdSchema, key: ClueCardKeySchema });
export type ClueCard = v.InferOutput<typeof ClueCardSchema>;
export const ClueLocationSchema = v.union([ClueRoomSchema, v.pipe(v.string(), v.regex(/^C:(?:[0-9]|1[0-9]|2[0-4]):(?:[0-9]|1[0-9]|2[0-4])$/))]);
export const ClueTripleSchema = v.strictObject({ suspect: ClueSuspectSchema, weapon: ClueWeaponSchema, room: ClueRoomSchema });
export type ClueTriple = v.InferOutput<typeof ClueTripleSchema>;
export const ClueActionSchema = v.variant("type", [
  v.strictObject({ type: v.literal("ROLL") }),
  v.strictObject({ type: v.literal("MOVE"), destination: ClueLocationSchema }),
  v.strictObject({ type: v.literal("PASSAGE") }),
  v.strictObject({ type: v.literal("SUGGEST"), suspect: ClueSuspectSchema, weapon: ClueWeaponSchema }),
  v.strictObject({ type: v.literal("SHOW_CARD"), cardId: TileIdSchema }),
  v.strictObject({ type: v.literal("ACCUSE"), ...ClueTripleSchema.entries }),
  v.strictObject({ type: v.literal("END_TURN") }),
]);
export type ClueAction = v.InferOutput<typeof ClueActionSchema>;
export const CLUE_LABELS: Readonly<Record<ClueCardKey, string>> = {
  SCARLET: "스칼렛", MUSTARD: "머스터드", PLUM: "플럼", GREEN: "그린", WHITE: "화이트", PEACOCK: "피콕",
  CANDLESTICK: "촛대", ROPE: "밧줄", WRENCH: "렌치", PIPE: "납 파이프", DAGGER: "단검", REVOLVER: "리볼버",
  KITCHEN: "주방", BALLROOM: "무도회장", CONSERVATORY: "온실", DINING: "식당", BILLIARD: "당구실", LIBRARY: "도서실", LOUNGE: "라운지", HALL: "홀", STUDY: "서재",
};
