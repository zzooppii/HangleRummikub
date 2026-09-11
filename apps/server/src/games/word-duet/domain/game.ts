import * as v from "valibot";
import { DuetCardViewSchema, DuetRoleSchema, DuetClueSchema, DuetHistorySchema, DuetResultSchema, GameIdSchema, PlayerIdSchema, GameRevisionSchema, TurnIdSchema, ServerTimeSchema, type DuetAction, type DuetRole, type DuetResult, type GameId, type PlayerId, type ServerTime, type TurnId } from "@hangul-rummikub/shared";
const StateSchema = v.strictObject({
  gameId: GameIdSchema, revision: GameRevisionSchema, rulesVersion: v.literal("duet-2025-ko-v1"), startedAt: ServerTimeSchema, finishedAt: v.nullable(ServerTimeSchema),
  phase: v.picklist(["CLUE", "GUESS", "SUDDEN_DEATH", "FINISHED"]), transitionId: TurnIdSchema,
  players: v.tuple([PlayerIdSchema, PlayerIdSchema]), passed: v.pipe(v.array(PlayerIdSchema), v.maxLength(2)),
  cards: v.pipe(v.array(v.strictObject({ ...DuetCardViewSchema.entries, roles: v.tuple([DuetRoleSchema, DuetRoleSchema]) })), v.length(25)),
  tokensRemaining: v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(9)),
  clueGiverId: v.nullable(PlayerIdSchema), currentClue: v.nullable(DuetClueSchema), guessesThisTurn: v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(25)),
  history: v.pipe(v.array(DuetHistorySchema), v.maxLength(110)), result: v.nullable(DuetResultSchema),
});
export type DuetState = v.InferOutput<typeof StateSchema>;
export const DUET_ROLE_PAIRS: readonly (readonly [DuetRole, DuetRole])[] = [
  ...Array.from({length:3},():[DuetRole,DuetRole]=>["AGENT","AGENT"]),
  ...Array.from({length:5},():[DuetRole,DuetRole]=>["AGENT","BYSTANDER"]), ["AGENT","ASSASSIN"],
  ...Array.from({length:5},():[DuetRole,DuetRole]=>["BYSTANDER","AGENT"]),
  ...Array.from({length:7},():[DuetRole,DuetRole]=>["BYSTANDER","BYSTANDER"]), ["BYSTANDER","ASSASSIN"],
  ["ASSASSIN","AGENT"], ["ASSASSIN","BYSTANDER"], ["ASSASSIN","ASSASSIN"],
];
function side(s:DuetState,id:PlayerId):0|1 { if(s.players[0]===id)return 0;if(s.players[1]===id)return 1;throw new Error("Unknown Duet player."); }
export function remainingClues(s:DuetState,id:PlayerId):number {return s.cards.filter(c=>c.foundBy===null&&c.roles[side(s,id)]==="AGENT").length;}
const other=(s:DuetState,id:PlayerId)=>s.players[side(s,id)===0?1:0];
const canClue=(s:DuetState,id:PlayerId)=>!s.passed.includes(id)&&remainingClues(s,id)>0;
export function parseDuetState(input:unknown):DuetState {
  const s=v.parse(StateSchema,input),ids=new Set(s.cards.map(c=>c.cardId));
  if(s.players[0]===s.players[1]||ids.size!==25||new Set(s.cards.map(c=>c.word)).size!==25)throw new Error("Invalid Duet board or roster.");
  const pairs=(xs:readonly (readonly [DuetRole,DuetRole])[])=>xs.map(x=>x.join('/')).sort().join(',');
  if(pairs(s.cards.map(c=>c.roles))!==pairs(DUET_ROLE_PAIRS))throw new Error("Invalid Duet key distribution.");
  if(new Set(s.passed).size!==s.passed.length||s.passed.some(id=>!s.players.includes(id)))throw new Error("Invalid passed players.");
  for(const c of s.cards){
    if(c.foundBy!==null&&(!s.players.includes(c.foundBy)||c.roles[side(s,other(s,c.foundBy))]!=="AGENT"))throw new Error("Invalid agent reveal.");
    if(new Set(c.bystanderFor).size!==c.bystanderFor.length||c.bystanderFor.some(id=>!s.players.includes(id)||c.roles[side(s,other(s,id))]!=="BYSTANDER"))throw new Error("Invalid bystander direction.");
  }
  if(s.clueGiverId!==null&&!s.players.includes(s.clueGiverId)||s.currentClue&&!s.players.includes(s.currentClue.playerId))throw new Error("Invalid clue actor.");
  if(s.history.some(h=>!s.players.includes(h.playerId)||h.kind==='GUESS'&&!ids.has(h.cardId)))throw new Error("Invalid Duet history.");
  const spent=s.history.filter(h=>h.kind==='END'||h.kind==='GUESS'&&h.outcome==='BYSTANDER').length;
  const suddenMiss=s.result?.reason==='SUDDEN_DEATH_MISS'&&s.history.at(-1)?.kind==='GUESS'&&s.history.filter(h=>h.kind==='GUESS').at(-1)?.outcome==='BYSTANDER'?1:0;
  if(s.tokensRemaining!==9-spent+suddenMiss)throw new Error("Duet token conservation failed.");
  if(s.phase==='FINISHED'){
    if(s.finishedAt===null||s.result===null)throw new Error("Missing Duet result.");
    if(s.result.reason==='ALL_AGENTS'?(s.cards.filter(c=>c.foundBy!==null).length!==15||s.result.winnerPlayerIds.length!==2||!s.players.every(id=>s.result!.winnerPlayerIds.includes(id))):s.result.winnerPlayerIds.length!==0)throw new Error("Invalid cooperative result.");
  }else{
    if(s.finishedAt!==null||s.result!==null||s.cards.filter(c=>c.foundBy!==null).length>=15)throw new Error("Invalid running Duet state.");
    if(s.phase!=='SUDDEN_DEATH'&&s.tokensRemaining===0)throw new Error("Missing sudden death.");
    if(s.phase==='CLUE'&&s.clueGiverId!==null&&!canClue(s,s.clueGiverId))throw new Error("Invalid clue phase.");
    if(s.phase==='GUESS'&&(s.clueGiverId===null||s.currentClue?.playerId!==s.clueGiverId))throw new Error("Missing current clue.");
  }
  return s;
}
export function createDuetGame(input:Readonly<{gameId:GameId;playerIds:readonly PlayerId[];cards:DuetState['cards'];now:ServerTime;transitionId:TurnId}>):DuetState {
  return parseDuetState({gameId:input.gameId,revision:0,rulesVersion:'duet-2025-ko-v1',startedAt:input.now,finishedAt:null,phase:'CLUE',transitionId:input.transitionId,players:input.playerIds,passed:[],cards:input.cards,tokensRemaining:9,clueGiverId:null,currentClue:null,guessesThisTurn:0,history:[],result:null});
}
function finish(s:DuetState,reason:DuetResult['reason'],now:ServerTime){s.phase='FINISHED';s.finishedAt=now;s.result={reason,winnerPlayerIds:reason==='ALL_AGENTS'?[...s.players]:[]};}
function nextClue(s:DuetState,preferred:PlayerId){
  s.guessesThisTurn=0;
  const giver=[preferred,other(s,preferred)].find(id=>canClue(s,id));
  if(s.tokensRemaining===0||giver===undefined){s.phase='SUDDEN_DEATH';s.clueGiverId=null;}
  else{s.phase='CLUE';s.clueGiverId=giver;}
}
export function applyDuetAction(state:DuetState,actor:PlayerId,action:DuetAction,now:ServerTime,nextId:TurnId):{ok:true;state:DuetState}|{ok:false;reason:'INVALID_PHASE'|'NOT_YOUR_TURN'|'RULE_VIOLATION'} {
  const fail=(reason:'INVALID_PHASE'|'NOT_YOUR_TURN'|'RULE_VIOLATION')=>({ok:false as const,reason});
  if(state.phase==='FINISHED')return fail('INVALID_PHASE');
  if(!state.players.includes(actor))return fail('NOT_YOUR_TURN');
  const s=structuredClone(state);
  if(action.kind==='GIVE_CLUE'||action.kind==='PASS_CLUES'){
    if(s.phase!=='CLUE')return fail('INVALID_PHASE');
    if(s.clueGiverId!==null&&s.clueGiverId!==actor||!canClue(s,actor))return fail('NOT_YOUR_TURN');
    if(action.kind==='PASS_CLUES'){
      s.passed.push(actor);s.history.push({kind:'PASS',playerId:actor});nextClue(s,other(s,actor));
    }else{
      const word=action.word.normalize('NFC');
      if(s.cards.some(c=>c.foundBy===null&&c.word.toLocaleLowerCase()===word.toLocaleLowerCase()))return fail('RULE_VIOLATION');
      s.clueGiverId=actor;s.currentClue={playerId:actor,word,number:action.number};s.phase='GUESS';s.guessesThisTurn=0;s.history.push({kind:'CLUE',...s.currentClue});
    }
  }else{
    if(s.phase!=='GUESS'&&s.phase!=='SUDDEN_DEATH')return fail('INVALID_PHASE');
    if(s.phase==='GUESS'&&actor===s.clueGiverId)return fail('NOT_YOUR_TURN');
    if(s.phase==='SUDDEN_DEATH'&&remainingClues(s,other(s,actor))===0)return fail('NOT_YOUR_TURN');
    if(action.kind==='END_GUESSES'){
      if(s.phase!=='GUESS'||s.guessesThisTurn===0)return fail('RULE_VIOLATION');
      s.tokensRemaining--;s.history.push({kind:'END',playerId:actor});nextClue(s,actor);
    }else{
      const card=s.cards.find(c=>c.cardId===action.cardId);
      if(!card||card.foundBy!==null||card.bystanderFor.includes(actor))return fail('RULE_VIOLATION');
      const outcome=card.roles[side(s,other(s,actor))];s.history.push({kind:'GUESS',playerId:actor,cardId:card.cardId,outcome});s.guessesThisTurn++;
      if(outcome==='AGENT'){
        card.foundBy=actor;
        if(s.cards.filter(c=>c.foundBy!==null).length===15)finish(s,'ALL_AGENTS',now);
        // A completed key may still be followed by optional guesses. The guesser ends the turn.
      }else if(s.phase==='SUDDEN_DEATH')finish(s,'SUDDEN_DEATH_MISS',now);
      else if(outcome==='ASSASSIN')finish(s,'ASSASSIN',now);
      else{card.bystanderFor.push(actor);s.tokensRemaining--;nextClue(s,actor);}
    }
  }
  s.revision=v.parse(GameRevisionSchema,s.revision+1);s.transitionId=nextId;
  return {ok:true,state:parseDuetState(s)};
}
export function cancelDuet(state:DuetState,now:ServerTime):DuetState {
  const s=structuredClone(state);if(s.phase==='FINISHED')return s;finish(s,'CANCELLED',now);s.revision=v.parse(GameRevisionSchema,s.revision+1);return parseDuetState(s);
}
