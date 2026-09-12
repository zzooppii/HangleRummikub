import * as v from "valibot";
import { PlayerIdSchema, TileIdSchema } from "../../identifiers.js";

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
export const CLUE_BONUS_KINDS = ["EXTRA_SUGGEST", "TELEPORT", "PLUS_SIX", "PUBLIC_REVEAL", "PEEK", "EXTRA_TURN"] as const;
export const ClueBonusKindSchema = v.picklist(CLUE_BONUS_KINDS);
export type ClueBonusKind = v.InferOutput<typeof ClueBonusKindSchema>;
export const CLUE_BONUS_CARDS: Readonly<Record<ClueBonusKind, {title:string;description:string;count:number;symbol:string;immediate:boolean}>> = {
  EXTRA_SUGGEST:{title:"한 번 더 추리합니다",description:"말과 도구를 옮기지 않고 원하는 장소·사람·도구로 지금 추리합니다.",count:3,symbol:"⌕",immediate:true},
  TELEPORT:{title:"원하는 장소로 이동합니다",description:"원하는 방으로 지금 이동합니다. 도착한 방에서 추리할 수 있습니다.",count:3,symbol:"➜",immediate:true},
  PLUS_SIX:{title:"주사위에 6을 더합니다",description:"이동 전에 주사위에 6을 더합니다. 방금 뽑았다면 지금 6칸 더 이동하거나 보관할 수 있습니다.",count:3,symbol:"+6",immediate:false},
  PUBLIC_REVEAL:{title:"다른 사람의 카드 한 장을 공개합니다",description:"한 사람을 정하면, 그 사람이 자기 카드 한 장을 골라 모두에게 보여줍니다. 지금 사용합니다.",count:2,symbol:"◉",immediate:true},
  PEEK:{title:"카드 엿보기",description:"다른 사람에게 반박 카드가 제시되면, 그 카드를 나도 볼 수 있습니다. 필요할 때 사용합니다.",count:3,symbol:"◎",immediate:false},
  EXTRA_TURN:{title:"차례를 한 번 더 진행합니다",description:"내 차례에 사용하면 턴을 마친 뒤 한 차례 더 진행합니다. 지금 사용하거나 보관합니다.",count:3,symbol:"↻",immediate:false},
};
export const ClueActionSchema = v.variant("type", [
  v.strictObject({ type: v.literal("BONUS_SUGGEST"), ...ClueTripleSchema.entries }),
  v.strictObject({ type: v.literal("BONUS_MOVE"), room: ClueRoomSchema }),
  v.strictObject({ type: v.literal("BONUS_TARGET"), playerId: PlayerIdSchema }),
  v.strictObject({ type: v.literal("BONUS_REVEAL"), cardId: TileIdSchema }),
  v.strictObject({ type: v.literal("USE_BONUS"), kind: v.picklist(["PLUS_SIX", "EXTRA_TURN", "PEEK"]) }),
  v.strictObject({ type: v.literal("SKIP_PEEK") }),
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
  KITCHEN: "주방", BALLROOM: "욕실", CONSERVATORY: "침실", DINING: "식당", BILLIARD: "당구실", LIBRARY: "차고", LOUNGE: "거실", HALL: "현관", STUDY: "서재",
};
