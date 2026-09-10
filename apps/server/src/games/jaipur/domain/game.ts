import * as v from "valibot";
import { GameIdSchema, GameRevisionSchema, PlayerIdSchema, ServerTimeSchema, TurnIdSchema, JaipurCardSchema, JaipurCardIdSchema, JaipurActionSchema, JaipurGoodsBankSchema, JaipurGoodsTokenSchema, JaipurBonusTokenSchema, JaipurBonusSizeSchema, JaipurRoundResultSchema, JaipurResultSchema, JaipurFeedbackSchema, JAIPUR_GOODS, type JaipurCard, type JaipurAction, type JaipurRoundResult, type PlayerId } from "@hangul-rummikub/shared";
import { JAIPUR_CARD_COUNTS, JAIPUR_GOODS_VALUES, JAIPUR_BONUS_VALUES } from "./catalog.js";

const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const ids = v.array(JaipurCardIdSchema);
const BonusBank = v.pipe(v.array(v.strictObject({ size: JaipurBonusSizeSchema, values: v.array(v.pipe(count, v.maxValue(10))) })), v.length(3));
const State = v.strictObject({
  gameId: GameIdSchema, rulesVersion: v.literal("jaipur-base-v1"), revision: GameRevisionSchema,
  phase: v.picklist(["PLAYING", "ROUND_RESULT", "FINISHED"]), startedAt: ServerTimeSchema, finishedAt: v.nullable(ServerTimeSchema),
  round: v.pipe(count, v.minValue(1)), roundId: TurnIdSchema, transitionId: TurnIdSchema, activePlayerId: PlayerIdSchema, startingPlayerId: PlayerIdSchema,
  cards: v.pipe(v.array(JaipurCardSchema), v.length(55)), deck: ids, market: v.pipe(ids, v.maxLength(5)), discard: ids,
  goodsBank: JaipurGoodsBankSchema, bonusBank: BonusBank,
  players: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, hand: v.pipe(ids, v.maxLength(7)), herd: v.pipe(ids, v.maxLength(11)), goodsTokens: v.array(JaipurGoodsTokenSchema), bonusTokens: v.array(JaipurBonusTokenSchema), seals: v.pipe(count, v.maxValue(2)) })), v.length(2)),
  confirmedPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(1)), roundResults: v.array(JaipurRoundResultSchema),
  result: v.nullable(JaipurResultSchema), feedback: JaipurFeedbackSchema,
});
export type JaipurState = v.InferOutput<typeof State>;
export type JaipurRoundSetup = { cards: JaipurCard[]; bonusBank: v.InferOutput<typeof BonusBank> };
type Identity = { gameId: JaipurState["gameId"]; playerIds: PlayerId[]; now: JaipurState["startedAt"]; transitionId: JaipurState["transitionId"]; starter: number };
const sum = (numbers: readonly number[]) => numbers.reduce((a, b) => a + b, 0);
const sameValues = (a: readonly number[], b: readonly number[]) => a.length === b.length && [...a].sort((x,y)=>x-y).every((n,i)=>n === [...b].sort((x,y)=>x-y)[i]);
export function jaipurCard(s: Pick<JaipurState, "cards">, id: string): JaipurCard {
  const card = s.cards.find(c => c.cardId === id);
  if (!card) throw new Error("Invalid Jaipur card reference.");
  return card;
}
export function parseJaipurState(input: unknown): JaipurState {
  const s = v.parse(State, input), players = new Set(s.players.map(p=>p.playerId));
  if (players.size !== 2 || !players.has(s.activePlayerId) || !players.has(s.startingPlayerId) || s.confirmedPlayerIds.some(id=>!players.has(id))) throw new Error("Invalid Jaipur players.");
  const cards = new Map(s.cards.map(c=>[c.cardId,c]));
  const zones = [...s.deck,...s.market,...s.discard,...s.players.flatMap(p=>[...p.hand,...p.herd])];
  if (cards.size !== 55 || zones.length !== 55 || new Set(zones).size !== 55 || zones.some(id=>!cards.has(id))) throw new Error("Jaipur card conservation failed.");
  for (const [type, n] of Object.entries(JAIPUR_CARD_COUNTS)) if (s.cards.filter(c=>c.type===type).length !== n) throw new Error("Invalid Jaipur inventory.");
  for (const p of s.players) if (p.hand.some(id=>jaipurCard(s,id).type === "CAMEL") || p.herd.some(id=>jaipurCard(s,id).type !== "CAMEL")) throw new Error("Invalid Jaipur hand or herd.");
  for (const type of JAIPUR_GOODS) {
    const stacks=s.goodsBank.filter(b=>b.type===type);
    if(stacks.length!==1) throw new Error("Invalid Jaipur goods bank.");
    const values=stacks[0]!.values;
    if(values.some((n,i)=>i>0 && n>values[i-1]!)) throw new Error("Unordered Jaipur tokens.");
    const earned=s.players.flatMap(p=>p.goodsTokens.filter(t=>t.type===type).map(t=>t.value));
    if(!sameValues([...values,...earned],JAIPUR_GOODS_VALUES[type])) throw new Error("Jaipur goods token conservation failed.");
  }
  for (const base of JAIPUR_BONUS_VALUES) {
    const stacks=s.bonusBank.filter(b=>b.size===base.size);
    if(stacks.length!==1 || !sameValues([...stacks[0]!.values,...s.players.flatMap(p=>p.bonusTokens.filter(t=>t.size===base.size).map(t=>t.value))],base.values)) throw new Error("Jaipur bonus conservation failed.");
  }
  if ((s.phase === "FINISHED") !== (s.finishedAt !== null && s.result !== null) || (s.phase !== "FINISHED" && (s.finishedAt !== null || s.result !== null))) throw new Error("Invalid Jaipur finish.");
  if(s.finishedAt !== null && s.finishedAt<s.startedAt) throw new Error("Invalid Jaipur time.");
  if(s.phase === "PLAYING" && (s.market.length!==5 || s.confirmedPlayerIds.length!==0)) throw new Error("Invalid Jaipur playing phase.");
  if(s.result?.reason==='CANCELLED' ? ![s.round-1,s.round].includes(s.roundResults.length) : s.roundResults.length !== s.round-(s.phase==='ROUND_RESULT' || s.result?.reason==='SEALS'?0:1)) throw new Error("Invalid Jaipur round history.");
  for(const [index,result] of s.roundResults.entries()) {
    if(result.round!==index+1)throw new Error("Invalid Jaipur round number.");
    if(result.scores.length!==2 || new Set(result.scores.map(p=>p.playerId)).size!==2 || result.scores.some(p=>!players.has(p.playerId)||p.total!==p.goodsPoints+p.bonusPoints+p.camelPoints) || (result.winnerPlayerId!==null&&!players.has(result.winnerPlayerId))) throw new Error("Invalid Jaipur round result.");
  }
  if(s.players.some(p=>p.seals!==s.roundResults.filter(r=>r.winnerPlayerId===p.playerId).length)) throw new Error("Invalid Jaipur seals.");
  if(s.players.some(p=>p.seals===2)!==(s.result?.reason==='SEALS'))throw new Error("Invalid Jaipur winning phase.");
  if(s.phase==='PLAYING'&&s.goodsBank.filter(b=>b.values.length===0).length>=3)throw new Error("Jaipur round must be settled.");
  if(s.result?.reason==='SEALS' && (s.result.winnerPlayerIds.length!==1 || !s.players.some(p=>p.playerId===s.result?.winnerPlayerIds[0]&&p.seals===2))) throw new Error("Invalid Jaipur match winner.");
  if(s.result?.reason==='CANCELLED' && s.result.winnerPlayerIds.length!==0) throw new Error("Invalid Jaipur cancellation.");
  return s;
}
function deal(s: JaipurState, setup: JaipurRoundSetup): void {
  s.cards=structuredClone(setup.cards); s.bonusBank=structuredClone(setup.bonusBank);
  s.market=s.cards.filter(c=>c.type==='CAMEL').slice(0,3).map(c=>c.cardId);
  s.deck=s.cards.filter(c=>!s.market.includes(c.cardId)).map(c=>c.cardId); s.discard=[];
  s.goodsBank=JAIPUR_GOODS.map(type=>({type,values:[...JAIPUR_GOODS_VALUES[type]]}));
  for(const p of s.players) {
    const drawn=s.deck.splice(0,5); p.hand=drawn.filter(id=>jaipurCard(s,id).type!=='CAMEL');p.herd=drawn.filter(id=>jaipurCard(s,id).type==='CAMEL');p.goodsTokens=[];p.bonusTokens=[];
  }
  s.market.push(...s.deck.splice(0,2));
}
export function createJaipurGame(input: Identity & JaipurRoundSetup): JaipurState {
  if(input.playerIds.length!==2 || new Set(input.playerIds).size!==2 || ![0,1].includes(input.starter)) throw new Error("Jaipur requires two players.");
  const starter=input.playerIds[input.starter]!;
  const s: JaipurState={gameId:input.gameId,rulesVersion:'jaipur-base-v1',revision:v.parse(GameRevisionSchema,0),phase:'PLAYING',startedAt:input.now,finishedAt:null,round:1,roundId:input.transitionId,transitionId:input.transitionId,activePlayerId:starter,startingPlayerId:starter,cards:[],deck:[],market:[],discard:[],goodsBank:[],bonusBank:[],players:input.playerIds.map(playerId=>({playerId,hand:[],herd:[],goodsTokens:[],bonusTokens:[],seals:0})),confirmedPlayerIds:[],roundResults:[],result:null,feedback:null};
  deal(s,input); return parseJaipurState(s);
}
export function scoreJaipurRound(s: JaipurState, reason: JaipurRoundResult['reason']): JaipurRoundResult {
  const mostCamels=Math.max(...s.players.map(p=>p.herd.length));
  const camelWinner=s.players.filter(p=>p.herd.length===mostCamels);
  const scores=s.players.map(p=>{const goodsPoints=sum(p.goodsTokens.map(t=>t.value)),bonusPoints=sum(p.bonusTokens.map(t=>t.value)),camelPoints:0|5=camelWinner.length===1&&camelWinner[0]?.playerId===p.playerId?5:0;return {playerId:p.playerId,goodsPoints,bonusPoints,camelPoints,total:goodsPoints+bonusPoints+camelPoints,goodsTokenCount:p.goodsTokens.length,bonusTokenCount:p.bonusTokens.length,camelCount:p.herd.length};});
  const sorted=[...scores].sort((a,b)=>b.total-a.total||b.bonusTokenCount-a.bonusTokenCount||b.goodsTokenCount-a.goodsTokenCount);
  const a=sorted[0]!,b=sorted[1]!;
  return {round:s.round,reason,scores,winnerPlayerId:a.total===b.total&&a.bonusTokenCount===b.bonusTokenCount&&a.goodsTokenCount===b.goodsTokenCount?null:a.playerId};
}
function endRound(s: JaipurState, reason: JaipurRoundResult['reason'], now: JaipurState['startedAt']): void {
  const result=scoreJaipurRound(s,reason); s.roundResults.push(result); s.phase='ROUND_RESULT';
  const winner=s.players.find(p=>p.playerId===result.winnerPlayerId); if(winner) winner.seals++;
  if(winner?.seals===2){s.phase='FINISHED';s.finishedAt=now;s.result={reason:'SEALS',winnerPlayerIds:[winner.playerId]};}
}
type Outcome={ok:true;state:JaipurState}|{ok:false;reason:'INVALID_ACTION'|'NOT_YOUR_TURN'|'INVALID_PHASE'};
export function applyJaipurAction(input: JaipurState, actor: PlayerId, actionInput: unknown, now: JaipurState['startedAt'], nextId: JaipurState['transitionId']): Outcome {
  if(input.phase!=='PLAYING') return {ok:false,reason:'INVALID_PHASE'};
  if(input.activePlayerId!==actor) return {ok:false,reason:'NOT_YOUR_TURN'};
  const parsed=v.safeParse(JaipurActionSchema,actionInput);if(!parsed.success)return {ok:false,reason:'INVALID_ACTION'};
  const a:JaipurAction=parsed.output,s=structuredClone(input),p=s.players.find(p=>p.playerId===actor)!;
  const fail:Outcome={ok:false,reason:'INVALID_ACTION'};
  let refill=false,amount=0;
  const unique=(ids:readonly string[])=>new Set(ids).size===ids.length;
  if(a.kind==='TAKE_GOOD') {
    if(!s.market.includes(a.cardId)||jaipurCard(s,a.cardId).type==='CAMEL'||p.hand.length===7) return fail;
    s.market=s.market.filter(id=>id!==a.cardId);p.hand.push(a.cardId);refill=true;amount=1;
  } else if(a.kind==='TAKE_CAMELS') {
    const camels=s.market.filter(id=>jaipurCard(s,id).type==='CAMEL');if(camels.length===0)return fail;
    p.herd.push(...camels);s.market=s.market.filter(id=>!camels.includes(id));refill=true;amount=camels.length;
  } else if(a.kind==='EXCHANGE') {
    if(a.marketCardIds.length<2||!unique(a.marketCardIds)||!unique(a.handCardIds)||a.marketCardIds.length!==a.handCardIds.length+a.camelCount||a.camelCount>p.herd.length||a.marketCardIds.some(id=>!s.market.includes(id))||a.handCardIds.some(id=>!p.hand.includes(id)))return fail;
    const take=a.marketCardIds.map(id=>jaipurCard(s,id).type),give=a.handCardIds.map(id=>jaipurCard(s,id).type);
    if(take.includes('CAMEL')||take.some(t=>give.includes(t))||p.hand.length-a.handCardIds.length+a.marketCardIds.length>7)return fail;
    const offered=[...a.handCardIds,...p.herd.splice(0,a.camelCount)];
    s.market=s.market.map(id=>a.marketCardIds.includes(id)?offered.shift()!:id);
    p.hand=p.hand.filter(id=>!a.handCardIds.includes(id));p.hand.push(...a.marketCardIds);amount=a.marketCardIds.length;
  } else {
    if(a.cardIds.length===0||!unique(a.cardIds)||a.cardIds.some(id=>!p.hand.includes(id)))return fail;
    const type=jaipurCard(s,a.cardIds[0]!).type;
    if(type==='CAMEL'||a.cardIds.some(id=>jaipurCard(s,id).type!==type)||(['DIAMOND','GOLD','SILVER'].includes(type)&&a.cardIds.length<2))return fail;
    p.hand=p.hand.filter(id=>!a.cardIds.includes(id));s.discard.push(...a.cardIds);amount=a.cardIds.length;
    const bank=s.goodsBank.find(b=>b.type===type)!;
    for(const value of bank.values.splice(0,amount))p.goodsTokens.push({type,value});
    if(amount>=3){const size=amount>=5?5:amount===4?4:3,bank=s.bonusBank.find(b=>b.size===size)!,value=bank.values.shift();if(value!==undefined)p.bonusTokens.push({size,value});}
  }
  if(refill)s.market.push(...s.deck.splice(0,5-s.market.length));
  s.revision=v.parse(GameRevisionSchema,s.revision+1);s.transitionId=nextId;s.feedback={playerId:actor,kind:a.kind,count:amount,at:now};
  if(s.goodsBank.filter(b=>b.values.length===0).length>=3)endRound(s,'GOODS_DEPLETED',now);
  else if(s.market.length<5)endRound(s,'DECK_DEPLETED',now);
  else s.activePlayerId=s.players.find(q=>q.playerId!==actor)!.playerId;
  return {ok:true,state:parseJaipurState(s)};
}
export function confirmJaipurRound(input: JaipurState, actor: PlayerId, setup: JaipurRoundSetup | null, nextId: JaipurState['transitionId']): Outcome {
  if(input.phase!=='ROUND_RESULT'||!input.players.some(p=>p.playerId===actor)||input.confirmedPlayerIds.includes(actor))return {ok:false,reason:'INVALID_PHASE'};
  const s=structuredClone(input);s.revision=v.parse(GameRevisionSchema,s.revision+1);
  if(s.confirmedPlayerIds.length===0)s.confirmedPlayerIds.push(actor);
  else {
    if(setup===null)return {ok:false,reason:'INVALID_ACTION'};
    const last=s.roundResults.at(-1)!;
    s.startingPlayerId=s.players.find(p=>p.playerId!==(last.winnerPlayerId??s.startingPlayerId))!.playerId;
    s.activePlayerId=s.startingPlayerId;s.round++;s.roundId=nextId;s.transitionId=nextId;s.phase='PLAYING';s.confirmedPlayerIds=[];s.feedback=null;deal(s,setup);
  }
  return {ok:true,state:parseJaipurState(s)};
}
export function cancelJaipur(input: JaipurState, now: JaipurState['startedAt']): JaipurState {
  if(input.phase==='FINISHED')return parseJaipurState(input);
  const s=structuredClone(input);s.revision=v.parse(GameRevisionSchema,s.revision+1);s.phase='FINISHED';s.finishedAt=now;s.result={reason:'CANCELLED',winnerPlayerIds:[]};s.confirmedPlayerIds=[];
  return parseJaipurState(s);
}
