import * as v from "valibot";
import { GameIdSchema,PlayerIdSchema,TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema } from "../../protocol.js";
import { LoveLetterCardSchema,LoveLetterRankSchema,LOVE_LETTER_COUNTS } from "./actions.js";
const count=v.pipe(v.number(),v.safeInteger(),v.minValue(0));
export const LoveLetterNoteSchema=v.strictObject({turn:count,subjectPlayerId:PlayerIdSchema,rank:LoveLetterRankSchema,source:v.picklist(["PRIEST","BARON"])});
export const LoveLetterEventSchema=v.strictObject({sequence:count,actorPlayerId:PlayerIdSchema,rank:LoveLetterRankSchema,targetPlayerId:v.nullable(PlayerIdSchema),guess:v.nullable(LoveLetterRankSchema),outcome:v.picklist(["PLAYED","MISS","HIT","LOOK","COMPARE","PROTECTED","REDRAW","CHOOSE","RETURNED","SWAP","NO_TARGET","ELIMINATED"]),eliminatedPlayerIds:v.array(PlayerIdSchema)});
export const LoveLetterRoundResultSchema=v.strictObject({round:count,reason:v.picklist(["LAST_PLAYER","DECK_EMPTY"]),winnerPlayerIds:v.array(PlayerIdSchema),spyPlayerId:v.nullable(PlayerIdSchema),reveals:v.array(v.strictObject({playerId:PlayerIdSchema,rank:LoveLetterRankSchema}))});
export const LoveLetterResultSchema=v.strictObject({reason:v.picklist(["TOKENS","CANCELLED"]),winnerPlayerIds:v.array(PlayerIdSchema)});
export const LoveLetterPlayerViewSchema=v.strictObject({playerId:PlayerIdSchema,handCount:v.pipe(count,v.maxValue(3)),tokens:count,eliminated:v.boolean(),protected:v.boolean(),discards:v.pipe(v.array(LoveLetterCardSchema),v.maxLength(21))});
const Base={gameType:v.literal("LOVE_LETTER"),gameId:GameIdSchema,gameRevision:GameRevisionSchema,rulesVersion:v.literal("love-letter-21-v1"),round:v.pipe(count,v.minValue(1)),roundId:TurnIdSchema,turnNumber:count,targetTokens:count,
 deckCount:v.pipe(count,v.maxValue(21)),setAsideCount:v.picklist([0,1]),faceUp:v.pipe(v.array(LoveLetterCardSchema),v.maxLength(3)),
 playerStates:v.pipe(v.array(LoveLetterPlayerViewSchema),v.minLength(2),v.maxLength(6)),
 privateState:v.strictObject({playerId:PlayerIdSchema,hand:v.pipe(v.array(LoveLetterCardSchema),v.maxLength(3)),notes:v.pipe(v.array(LoveLetterNoteSchema),v.maxLength(64))}),
 history:v.pipe(v.array(LoveLetterEventSchema),v.maxLength(64)),roundResults:v.pipe(v.array(LoveLetterRoundResultSchema),v.maxLength(30))};
export const LoveLetterPlayingProjectionSchema=v.variant("phase",[
 v.strictObject({...Base,phase:v.literal("PLAYING"),stage:v.picklist(["PLAY_CARD","CHANCELLOR"]),turnId:TurnIdSchema,activePlayerId:PlayerIdSchema}),
 v.strictObject({...Base,phase:v.literal("ROUND_RESULT")})]);
export const LoveLetterFinishedProjectionSchema=v.strictObject({...Base,phase:v.literal("FINISHED"),result:LoveLetterResultSchema});
export type LoveLetterPlayingProjection=v.InferOutput<typeof LoveLetterPlayingProjectionSchema>;
export type LoveLetterProjection=LoveLetterPlayingProjection|v.InferOutput<typeof LoveLetterFinishedProjectionSchema>;
export function loveLetterProjectionIsConsistent(g:LoveLetterProjection):boolean {
 const ids=new Set(g.playerStates.map(p=>p.playerId));
 if(ids.size!==g.playerStates.length||!ids.has(g.privateState.playerId))return false;
 const cards=[...g.faceUp,...g.playerStates.flatMap(p=>p.discards),...g.privateState.hand];
 if(new Set(cards.map(c=>c.cardId)).size!==cards.length)return false;
 for(const r of [0,1,2,3,4,5,6,7,8,9] as const)if(cards.filter(c=>c.rank===r).length>LOVE_LETTER_COUNTS[r])return false;
 if(g.deckCount+g.setAsideCount+g.faceUp.length+g.playerStates.reduce((n,p)=>n+p.handCount+p.discards.length,0)!==21)return false;
 if(g.playerStates.some(p=>p.eliminated&&(p.handCount!==0||p.protected)))return false;
 if(g.phase==='PLAYING'){
  const active=g.playerStates.find(p=>p.playerId===g.activePlayerId);
  if(!active||active.eliminated||active.protected||active.handCount<(g.stage==='PLAY_CARD'?2:2)||active.handCount>(g.stage==='PLAY_CARD'?2:3))return false;
  if(g.playerStates.some(p=>!p.eliminated&&p!==active&&p.handCount!==1))return false;
 }
 if(g.privateState.notes.some(n=>!ids.has(n.subjectPlayerId)))return false;
 if(g.history.some(e=>!ids.has(e.actorPlayerId)||(e.targetPlayerId!==null&&!ids.has(e.targetPlayerId))||e.eliminatedPlayerIds.some(id=>!ids.has(id))))return false;
 if(g.roundResults.some(r=>r.winnerPlayerIds.length===0||r.winnerPlayerIds.some(id=>!ids.has(id))||(r.spyPlayerId!==null&&!ids.has(r.spyPlayerId))||r.reveals.some(x=>!ids.has(x.playerId))))return false;
 return g.phase!=='FINISHED'||g.result.winnerPlayerIds.every(id=>ids.has(id));
}
