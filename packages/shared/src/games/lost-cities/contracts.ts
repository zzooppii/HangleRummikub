import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import { LostCitiesCardSchema, LostCitiesSuitSchema, lostCitiesSuits, lostCitiesRulesVersion, LostCitiesSettingsSchema, type LostCitiesCard } from "./actions.js";

const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const points = v.pipe(v.number(), v.safeInteger(), v.minValue(-1440), v.maxValue(2808));
const round = v.pipe(count, v.minValue(1), v.maxValue(3));
export const LostCitiesExpeditionScoreSchema = v.strictObject({
  suit: LostCitiesSuitSchema, cardCount: v.pipe(count, v.maxValue(12)), sum: v.pipe(count, v.maxValue(54)),
  cost: v.picklist([0, 20]), multiplier: v.picklist([1, 2, 3, 4]), bonus: v.picklist([0, 20]), total: points,
});
export type LostCitiesExpeditionScore = v.InferOutput<typeof LostCitiesExpeditionScoreSchema>;
export const LostCitiesRoundResultSchema = v.strictObject({
  round, scores: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema,
    expeditions: v.pipe(v.array(LostCitiesExpeditionScoreSchema), v.minLength(5), v.maxLength(6)), total: points, cumulative: points })), v.length(2)),
});
export type LostCitiesRoundResult = v.InferOutput<typeof LostCitiesRoundResultSchema>;
export const LostCitiesResultSchema = v.strictObject({ reason: v.picklist(["THREE_ROUNDS", "CANCELLED"]), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(2)) });
export const LostCitiesFeedbackSchema = v.nullable(v.strictObject({
  playerId: PlayerIdSchema, kind: v.picklist(["PLAY", "DISCARD"]), card: LostCitiesCardSchema,
  draw: v.variant("kind", [v.strictObject({kind:v.literal("DECK")}), v.strictObject({kind:v.literal("DISCARD"),card:LostCitiesCardSchema})]), at: ServerTimeSchema,
}));
const Base = {
  gameType: v.literal("LOST_CITIES"), gameId: GameIdSchema, gameRevision: GameRevisionSchema,
  settings: v.optional(LostCitiesSettingsSchema), rulesVersion: v.picklist(["lost-cities-base-v1", "lost-cities-six-v1"]), round, roundId: TurnIdSchema, deckCount: v.pipe(count, v.maxValue(56)),
  discards: v.pipe(v.array(v.strictObject({ suit: LostCitiesSuitSchema, count: v.pipe(count, v.maxValue(12)), top: v.nullable(LostCitiesCardSchema) })), v.minLength(5), v.maxLength(6)),
  playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, handCount: v.literal(8), cumulative: points,
    expeditions: v.pipe(v.array(v.strictObject({ suit: LostCitiesSuitSchema, cards: v.pipe(v.array(LostCitiesCardSchema), v.maxLength(12)), score: LostCitiesExpeditionScoreSchema })), v.minLength(5), v.maxLength(6)),
  })), v.length(2)),
  privateState: v.strictObject({ playerId: PlayerIdSchema, hand: v.pipe(v.array(LostCitiesCardSchema), v.length(8)) }),
  roundResults: v.pipe(v.array(LostCitiesRoundResultSchema), v.maxLength(3)), feedback: LostCitiesFeedbackSchema,
};
export const LostCitiesPlayingProjectionSchema = v.variant("phase", [
  v.strictObject({ ...Base, phase: v.literal("PLAYING"), turnId: TurnIdSchema, activePlayerId: PlayerIdSchema, deadlineAt: ServerTimeSchema }),
  v.strictObject({ ...Base, phase: v.literal("ROUND_RESULT"), confirmedPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(1)) }),
]);
export const LostCitiesFinishedProjectionSchema = v.strictObject({ ...Base, phase: v.literal("FINISHED"), result: LostCitiesResultSchema });
export type LostCitiesPlayingProjection = v.InferOutput<typeof LostCitiesPlayingProjectionSchema>;
export type LostCitiesProjection = LostCitiesPlayingProjection | v.InferOutput<typeof LostCitiesFinishedProjectionSchema>;
function uniqueSuits(values: readonly {suit:string}[], suits: readonly string[]):boolean { return values.length===suits.length && new Set(values.map(x=>x.suit)).size===suits.length && values.every(x=>suits.includes(x.suit)); }
export function lostCitiesCardsAreOrdered(cards: readonly LostCitiesCard[], suit: string): boolean {
  let last = 0;
  return cards.every(c => {if(c.suit!==suit)return false;if(c.kind==='INVESTMENT')return last===0;if(c.value<=last)return false;last=c.value;return true;});
}
export function lostCitiesProjectionIsConsistent(g: LostCitiesProjection): boolean {
  const mode=g.settings?.mode??"BASE", suits=lostCitiesSuits(mode);
  if(g.rulesVersion!==lostCitiesRulesVersion(mode))return false;
  const players = new Set(g.playerStates.map(p=>p.playerId));
  if(players.size!==2||!players.has(g.privateState.playerId)||!uniqueSuits(g.discards,suits))return false;
  const visible = [...g.privateState.hand, ...g.discards.flatMap(d=>d.top?[d.top]:[]), ...g.playerStates.flatMap(p=>p.expeditions.flatMap(e=>e.cards))];
  if(visible.some(c=>!suits.includes(c.suit)))return false;
  if(new Set(visible.map(c=>c.cardId)).size!==visible.length)return false;
  if(g.deckCount+16+g.discards.reduce((n,d)=>n+d.count,0)+g.playerStates.reduce((n,p)=>n+p.expeditions.reduce((m,e)=>m+e.cards.length,0),0)!==suits.length*12)return false;
  if(g.discards.some(d=>(d.count===0)!==(d.top===null)||(d.top!==null&&d.top.suit!==d.suit)))return false;
  for(const p of g.playerStates) {
    if(!uniqueSuits(p.expeditions,suits)||p.cumulative!==g.roundResults.reduce((n,r)=>n+(r.scores.find(s=>s.playerId===p.playerId)?.total??0),0))return false;
    for(const e of p.expeditions) {
      if(!lostCitiesCardsAreOrdered(e.cards,e.suit))return false;
      const sum=e.cards.reduce((n,c)=>n+(c.kind==='NUMBER'?c.value:0),0),mult=1+e.cards.filter(c=>c.kind==='INVESTMENT').length,cost=e.cards.length?20:0,bonus=e.cards.length>=8?20:0;
      if(e.score.suit!==e.suit||e.score.cardCount!==e.cards.length||e.score.sum!==sum||e.score.cost!==cost||e.score.multiplier!==mult||e.score.bonus!==bonus||e.score.total!==(sum-cost)*mult+bonus)return false;
    }
  }
  if(g.phase==='PLAYING'&&(g.deckCount===0||!players.has(g.activePlayerId)||g.roundResults.length!==g.round-1))return false;
  if(g.phase==='ROUND_RESULT'&&(g.deckCount!==0||g.round===3||g.roundResults.length!==g.round||g.confirmedPlayerIds.some(id=>!players.has(id))))return false;
  if(g.phase==='FINISHED') {
    if(new Set(g.result.winnerPlayerIds).size!==g.result.winnerPlayerIds.length||g.result.winnerPlayerIds.some(id=>!players.has(id)))return false;
    if(g.result.reason==='CANCELLED'&&(g.result.winnerPlayerIds.length!==0||![g.round-1,g.round].includes(g.roundResults.length)))return false;
    if(g.result.reason==='THREE_ROUNDS') {
      const best=Math.max(...g.playerStates.map(p=>p.cumulative));
      const winners=g.playerStates.filter(p=>p.cumulative===best);
      if(g.round!==3||g.deckCount!==0||g.roundResults.length!==3||winners.length!==g.result.winnerPlayerIds.length||winners.some(p=>!g.result.winnerPlayerIds.includes(p.playerId)))return false;
    }
  }
  if(g.feedback&&(!players.has(g.feedback.playerId)||!visible.some(c=>c.cardId===g.feedback?.card.cardId)))return false;
  return g.roundResults.every((r,i)=>r.round===i+1&&new Set(r.scores.map(s=>s.playerId)).size===2&&r.scores.every(s=>players.has(s.playerId)&&uniqueSuits(s.expeditions,suits)&&s.total===s.expeditions.reduce((n,e)=>n+e.total,0)&&s.cumulative===g.roundResults.slice(0,i+1).reduce((n,p)=>n+(p.scores.find(x=>x.playerId===s.playerId)?.total??0),0)&&s.expeditions.every(e=>suits.includes(e.suit)&&e.total===(e.sum-e.cost)*e.multiplier+e.bonus)));
}
