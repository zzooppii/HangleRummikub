import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema } from "../../protocol.js";
import { CLUE_SUSPECTS, CLUE_WEAPONS, ClueCardSchema, ClueLocationSchema, ClueSuspectSchema, ClueWeaponSchema, ClueRoomSchema, ClueTripleSchema } from "./actions.js";
import { isClueRoom, isClueCorridor } from "./board.js";
const count=v.pipe(v.number(),v.safeInteger(),v.minValue(0));
export const CluePlayerViewSchema=v.strictObject({playerId:PlayerIdSchema,suspect:ClueSuspectSchema,eliminated:v.boolean(),summoned:v.boolean(),cardCount:v.pipe(count,v.maxValue(6))});
export const ClueTokenSchema=v.strictObject({suspect:ClueSuspectSchema,location:ClueLocationSchema});
export const ClueWeaponPositionSchema=v.strictObject({weapon:ClueWeaponSchema,room:ClueRoomSchema});
export const ClueSuggestionSchema=v.strictObject({id:count,playerId:PlayerIdSchema,...ClueTripleSchema.entries,passedPlayerIds:v.array(PlayerIdSchema),responderPlayerId:v.nullable(PlayerIdSchema),resolved:v.boolean()});
export const ClueEvidenceSchema=v.strictObject({suggestionId:count,fromPlayerId:PlayerIdSchema,toPlayerId:PlayerIdSchema,card:ClueCardSchema});
export const ClueHistorySchema=v.variant("type",[
  v.strictObject({type:v.literal("ROLL"),playerId:PlayerIdSchema,value:v.pipe(count,v.minValue(1),v.maxValue(6))}),
  v.strictObject({type:v.literal("MOVE"),playerId:PlayerIdSchema,destination:ClueLocationSchema,passage:v.boolean()}),
  v.strictObject({type:v.literal("SUGGEST"),suggestion:ClueSuggestionSchema}),
  v.strictObject({type:v.literal("ACCUSE"),playerId:PlayerIdSchema,...ClueTripleSchema.entries,correct:v.boolean()}),
]);
export const ClueResultSchema=v.strictObject({reason:v.picklist(["SOLVED","ALL_ELIMINATED","CANCELLED"]),winnerPlayerIds:v.array(PlayerIdSchema)});
const Base={gameType:v.literal("CLUE"),gameId:GameIdSchema,gameRevision:GameRevisionSchema,rulesVersion:v.literal("clue-classic-manor-v1"),
  playerStates:v.pipe(v.array(CluePlayerViewSchema),v.minLength(3),v.maxLength(6)),tokens:v.pipe(v.array(ClueTokenSchema),v.length(6)),weapons:v.pipe(v.array(ClueWeaponPositionSchema),v.length(6)),
  turnPlayerId:PlayerIdSchema,turnNumber:count,die:v.nullable(v.pipe(count,v.minValue(1),v.maxValue(6))),suggestion:v.nullable(ClueSuggestionSchema),history:v.pipe(v.array(ClueHistorySchema),v.maxLength(200)),
  privateState:v.strictObject({playerId:PlayerIdSchema,hand:v.pipe(v.array(ClueCardSchema),v.minLength(3),v.maxLength(6)),evidence:v.array(ClueEvidenceSchema),caseFile:v.nullable(ClueTripleSchema)}),
};
export const CluePlayingProjectionSchema=v.strictObject({...Base,phase:v.picklist(["TURN_START","MOVE","SUGGEST","RESPOND","END_TURN"]),turnId:TurnIdSchema});
export const ClueFinishedProjectionSchema=v.strictObject({...Base,phase:v.literal("FINISHED"),result:ClueResultSchema,solution:ClueTripleSchema,revealedHands:v.array(v.strictObject({playerId:PlayerIdSchema,hand:v.array(ClueCardSchema)}))});
export type CluePlayingProjection=v.InferOutput<typeof CluePlayingProjectionSchema>;
export type ClueFinishedProjection=v.InferOutput<typeof ClueFinishedProjectionSchema>;
export type ClueProjection=CluePlayingProjection|ClueFinishedProjection;
export type ClueSuggestion=v.InferOutput<typeof ClueSuggestionSchema>;
export function clueProjectionIsConsistent(g:ClueProjection):boolean {
  const ids=new Set(g.playerStates.map(p=>p.playerId)),self=g.playerStates.find(p=>p.playerId===g.privateState.playerId);
  if(!self||ids.size!==g.playerStates.length||!ids.has(g.turnPlayerId)||new Set(g.playerStates.map(p=>p.suspect)).size!==ids.size)return false;
  if(g.tokens.length!==6||new Set(g.tokens.map(t=>t.suspect)).size!==6||!CLUE_SUSPECTS.every(s=>g.tokens.some(t=>t.suspect===s))||g.tokens.some(t=>!isClueRoom(t.location)&&!isClueCorridor(t.location)))return false;
  const corridors=g.tokens.filter(t=>!isClueRoom(t.location)).map(t=>t.location);if(new Set(corridors).size!==corridors.length)return false;
  if(new Set(g.weapons.map(w=>w.weapon)).size!==6||!CLUE_WEAPONS.every(w=>g.weapons.some(p=>p.weapon===w)))return false;
  if(g.playerStates.reduce((n,p)=>n+p.cardCount,0)!==18||self.cardCount!==g.privateState.hand.length||new Set(g.privateState.hand.map(c=>c.key)).size!==self.cardCount||new Set(g.privateState.hand.map(c=>c.cardId)).size!==self.cardCount)return false;
  if(g.privateState.evidence.some(e=>!ids.has(e.fromPlayerId)||!ids.has(e.toPlayerId)||e.fromPlayerId===e.toPlayerId||(e.fromPlayerId!==self.playerId&&e.toPlayerId!==self.playerId)))return false;
  if(g.suggestion&&(!ids.has(g.suggestion.playerId)||g.suggestion.responderPlayerId!==null&&(!ids.has(g.suggestion.responderPlayerId)||g.suggestion.playerId===g.suggestion.responderPlayerId)||new Set(g.suggestion.passedPlayerIds).size!==g.suggestion.passedPlayerIds.length||g.suggestion.passedPlayerIds.some(id=>!ids.has(id)||id===g.suggestion?.playerId||id===g.suggestion?.responderPlayerId)))return false;
  if(g.phase!=="FINISHED")return (!g.privateState.caseFile||self.eliminated)&&Boolean(g.privateState.caseFile)===self.eliminated&&!g.playerStates.find(p=>p.playerId===g.turnPlayerId)?.eliminated&&(g.phase!=="MOVE"||g.die!==null)&&(g.phase!=="RESPOND"||Boolean(g.suggestion&&!g.suggestion.resolved&&g.suggestion.responderPlayerId&&g.suggestion.playerId===g.turnPlayerId));
  if(g.revealedHands.length!==ids.size||new Set(g.revealedHands.map(p=>p.playerId)).size!==ids.size||g.revealedHands.some(p=>!ids.has(p.playerId)||p.hand.length!==g.playerStates.find(s=>s.playerId===p.playerId)?.cardCount))return false;
  const cards=g.revealedHands.flatMap(p=>p.hand),keys=cards.map(c=>c.key);
  return new Set(cards.map(c=>c.cardId)).size===18&&new Set([...keys,g.solution.suspect,g.solution.weapon,g.solution.room]).size===21&&JSON.stringify(g.privateState.caseFile)===JSON.stringify(g.solution)&&(g.result.reason==="SOLVED"?g.result.winnerPlayerIds.length===1&&g.result.winnerPlayerIds[0]===g.turnPlayerId:g.result.winnerPlayerIds.length===0);
}
