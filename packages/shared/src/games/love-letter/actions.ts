import * as v from "valibot";
import { PlayerIdSchema } from "../../identifiers.js";
export const LOVE_LETTER_RANKS = [0,1,2,3,4,5,6,7,8,9] as const;
export const LoveLetterRankSchema = v.picklist(LOVE_LETTER_RANKS);
export type LoveLetterRank = v.InferOutput<typeof LoveLetterRankSchema>;
export const LOVE_LETTER_COUNTS: Readonly<Record<LoveLetterRank, number>> = {0:2,1:6,2:2,3:2,4:2,5:2,6:2,7:1,8:1,9:1};
export const LoveLetterCardIdSchema = v.pipe(v.string(),v.minLength(1),v.maxLength(128),v.brand("LoveLetterCardId"));
export const LoveLetterCardSchema = v.strictObject({cardId:LoveLetterCardIdSchema,rank:LoveLetterRankSchema});
export type LoveLetterCard = v.InferOutput<typeof LoveLetterCardSchema>;
export const LoveLetterActionSchema = v.variant("kind",[
  v.strictObject({kind:v.literal("PLAY"),cardId:LoveLetterCardIdSchema,targetPlayerId:v.nullable(PlayerIdSchema),guess:v.nullable(v.picklist([0,2,3,4,5,6,7,8,9]))}),
  v.strictObject({kind:v.literal("CHANCELLOR"),keepCardId:LoveLetterCardIdSchema,returnCardIds:v.pipe(v.array(LoveLetterCardIdSchema),v.minLength(1),v.maxLength(2))}),
]);
export type LoveLetterAction = v.InferOutput<typeof LoveLetterActionSchema>;
export function loveLetterTargetTokens(players:number):number {return players===2?6:players===3?5:players===4?4:3;}
