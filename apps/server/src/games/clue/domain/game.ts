import * as v from "valibot";
import {
  CLUE_BONUS_KINDS, CLUE_BONUS_CARDS, CLUE_BONUS_CELLS, ClueBonusKindSchema, ClueBonusPendingSchema, CluePublicEvidenceSchema,
  CLUE_CARD_KEYS, CLUE_SUSPECTS, CLUE_WEAPONS, CLUE_ROOMS, CLUE_STARTS, CLUE_PASSAGES, CLUE_ROOM_AREAS,
  ClueCardSchema, CluePlayerViewSchema, ClueTokenSchema, ClueWeaponPositionSchema, ClueTripleSchema,
  ClueSuggestionSchema, ClueEvidenceSchema, ClueHistorySchema, ClueResultSchema,
  PlayerIdSchema as GamePlayerIdSchema, GameIdSchema, GameRevisionSchema, TurnIdSchema, ServerTimeSchema,
  clueReachablePaths, isClueRoom, isClueCorridor,
  type ClueAction, type ClueCard, type ClueTriple, type ClueSuspect,
  type GameId, type PlayerId, type TurnId, type TileId, type ServerTime,
} from "@hangul-rummikub/shared";
import type { RandomSource } from "../../../ports/system.js";

const PlayerSchema=v.strictObject({...CluePlayerViewSchema.entries,bonusHand:v.array(ClueBonusKindSchema),hand:v.array(ClueCardSchema)});
const StateSchema=v.strictObject({
  rulesVersion:v.literal("clue-bonus-manor-v2"),gameId:GameIdSchema,revision:GameRevisionSchema,transitionId:TurnIdSchema,
  startedAt:ServerTimeSchema,finishedAt:v.nullable(ServerTimeSchema),phase:v.picklist(["TURN_START","MOVE","SUGGEST","RESPOND","END_TURN","BONUS","PEEK","FINISHED"]),
  players:v.pipe(v.array(PlayerSchema),v.minLength(3),v.maxLength(6)),tokens:v.pipe(v.array(ClueTokenSchema),v.length(6)),weapons:v.pipe(v.array(ClueWeaponPositionSchema),v.length(6)),
  bonus:v.strictObject({deck:v.array(ClueBonusKindSchema),discard:v.array(ClueBonusKindSchema),pending:ClueBonusPendingSchema,extraTurn:v.boolean(),peekPlayerIds:v.array(GamePlayerIdSchema),publicEvidence:v.array(CluePublicEvidenceSchema),justDrewPlusSix:v.boolean()}),
  envelope:v.pipe(v.array(ClueCardSchema),v.length(3)),solution:ClueTripleSchema,
  turnIndex:v.pipe(v.number(),v.safeInteger(),v.minValue(0),v.maxValue(5)),turnNumber:v.pipe(v.number(),v.safeInteger(),v.minValue(1)),die:v.nullable(v.pipe(v.number(),v.safeInteger(),v.minValue(1),v.maxValue(24))),
  suggestion:v.nullable(ClueSuggestionSchema),evidence:v.array(ClueEvidenceSchema),history:v.pipe(v.array(ClueHistorySchema),v.maxLength(200)),result:v.nullable(ClueResultSchema),
});
export type ClueState=v.InferOutput<typeof StateSchema>;
export function parseClueState(input:unknown):ClueState {
  const s=v.parse(StateSchema,input),player=s.players[s.turnIndex];
  const playerIds=new Set(s.players.map(p=>p.playerId)),all=[...s.envelope,...s.players.flatMap(p=>p.hand)];
  if(!player||playerIds.size!==s.players.length||new Set(s.players.map(p=>p.suspect)).size!==s.players.length)throw new Error("Invalid Clue players.");
  if(all.length!==21||new Set(all.map(c=>c.cardId)).size!==21||new Set(all.map(c=>c.key)).size!==21||!CLUE_CARD_KEYS.every(key=>all.some(c=>c.key===key)))throw new Error("Clue card conservation failed.");
  if(![s.solution.suspect,s.solution.weapon,s.solution.room].every(key=>s.envelope.some(c=>c.key===key)))throw new Error("Clue envelope mismatch.");
  if(s.players.some(p=>p.cardCount!==p.hand.length||p.hand.length!==Math.floor(18/s.players.length)+(s.players.indexOf(p)<18%s.players.length?1:0)))throw new Error("Clue hand count mismatch.");
  if(new Set(s.tokens.map(t=>t.suspect)).size!==6||s.tokens.some(t=>!isClueRoom(t.location)&&!isClueCorridor(t.location)))throw new Error("Invalid Clue token.");
  const occupied=s.tokens.filter(t=>!isClueRoom(t.location));if(new Set(occupied.map(t=>t.location)).size!==occupied.length)throw new Error("Overlapping Clue corridor tokens.");
  if(new Set(s.weapons.map(w=>w.weapon)).size!==6)throw new Error("Missing Clue weapon.");
  if(s.evidence.some(e=>!playerIds.has(e.toPlayerId)||e.fromPlayerId===e.toPlayerId||!s.players.find(p=>p.playerId===e.fromPlayerId)?.hand.some(c=>c.cardId===e.card.cardId&&c.key===e.card.key)))throw new Error("Invalid Clue evidence.");
  if(s.suggestion){const q=s.suggestion;
    if(!playerIds.has(q.playerId)||new Set(q.passedPlayerIds).size!==q.passedPlayerIds.length||q.passedPlayerIds.some(id=>!playerIds.has(id)||id===q.playerId||id===q.responderPlayerId))throw new Error("Invalid Clue suggestion participants.");
    if(q.responderPlayerId!==null&&(!playerIds.has(q.responderPlayerId)||q.responderPlayerId===q.playerId||!s.players.find(p=>p.playerId===q.responderPlayerId)?.hand.some(c=>matches(c,q))))throw new Error("Invalid Clue responder.");
  }
  const bonusCards=[...s.bonus.deck,...s.bonus.discard,...s.players.flatMap(p=>p.bonusHand),...(s.bonus.pending?[s.bonus.pending.kind]:[])];
  if(CLUE_BONUS_KINDS.some(kind=>bonusCards.filter(k=>k===kind).length!==CLUE_BONUS_CARDS[kind].count)||s.players.some(p=>p.bonusHand.some(k=>CLUE_BONUS_CARDS[k].immediate)))throw new Error("Clue bonus conservation failed.");
  if(s.bonus.publicEvidence.some(e=>!s.players.find(p=>p.playerId===e.playerId)?.hand.some(c=>c.cardId===e.card.cardId&&c.key===e.card.key)))throw new Error("Invalid public evidence.");
  if(new Set(s.bonus.peekPlayerIds).size!==s.bonus.peekPlayerIds.length||s.bonus.peekPlayerIds.some(id=>!s.players.some(p=>p.playerId===id&&p.bonusHand.includes("PEEK")&&!p.eliminated)||id===s.suggestion?.playerId||id===s.suggestion?.responderPlayerId))throw new Error("Invalid peek participants.");
  if(s.phase!=="FINISHED"&&((s.phase==="BONUS")!==Boolean(s.bonus.pending)||(s.phase==="PEEK")!==(s.bonus.peekPlayerIds.length>0)))throw new Error("Invalid bonus phase.");
  if(s.bonus.pending?.targetPlayerId!==null&&s.bonus.pending?.targetPlayerId!==undefined&&(!playerIds.has(s.bonus.pending.targetPlayerId)||s.bonus.pending.targetPlayerId===player.playerId||s.bonus.pending.kind!=="PUBLIC_REVEAL"))throw new Error("Invalid reveal target.");
  if(s.phase==="PEEK"&&(!s.suggestion?.resolved||!s.evidence.some(e=>e.suggestionId===s.suggestion?.id&&e.toPlayerId===s.suggestion.playerId)))throw new Error("Missing peek evidence.");
  if(s.phase==="FINISHED"){
    if(s.finishedAt===null||!s.result||(s.result.reason==="SOLVED"?(s.result.winnerPlayerIds.length!==1||s.result.winnerPlayerIds[0]!==player.playerId||player.eliminated):s.result.winnerPlayerIds.length!==0))throw new Error("Invalid Clue result.");
    if(s.result.reason==="ALL_ELIMINATED"&&!s.players.every(p=>p.eliminated))throw new Error("Active Clue investigators remain.");
  } else {
    if(s.finishedAt!==null||s.result!==null||player.eliminated)throw new Error("Invalid active Clue state.");
    if(s.phase==="MOVE"&&s.die===null)throw new Error("Clue move requires die.");
    if(s.phase==="SUGGEST"&&!isClueRoom(token(s,player.suspect).location))throw new Error("Clue suggestion requires room.");
    if(s.phase==="RESPOND"&&(!s.suggestion||s.suggestion.resolved||!s.suggestion.responderPlayerId||s.suggestion.playerId!==player.playerId))throw new Error("Clue response missing.");
    if(s.suggestion&&!s.suggestion.resolved&&s.phase!=="RESPOND")throw new Error("Pending Clue response outside phase.");
  }
  return s;
}
function shuffle<T>(values:readonly T[],random:RandomSource):T[]{const result=[...values];for(let i=result.length-1;i>0;i--){const j=random.nextInt(i+1);[result[i],result[j]]=[result[j]!,result[i]!];}return result;}
export function makeClueCards(id:()=>TileId):ClueCard[]{return CLUE_CARD_KEYS.map(key=>({cardId:id(),key}));}
export function createClueGame(input:{gameId:GameId;playerIds:readonly PlayerId[];cards:readonly ClueCard[];now:ServerTime;turnId:TurnId;random:RandomSource}):ClueState {
  const {cards,random}=input;
  const suspect=CLUE_SUSPECTS[random.nextInt(6)]!,weapon=CLUE_WEAPONS[random.nextInt(6)]!,room=CLUE_ROOMS[random.nextInt(9)]!;
  const solution={suspect,weapon,room},envelope=cards.filter(c=>matches(c,solution)),remaining=shuffle(cards.filter(c=>!matches(c,solution)),random);
  const players=input.playerIds.map((playerId,i)=>{const hand=remaining.filter((_,j)=>j%input.playerIds.length===i);return {bonusHand:[],playerId,suspect:CLUE_SUSPECTS[i]!,hand,cardCount:hand.length,eliminated:false,summoned:false};});
  return parseClueState({rulesVersion:"clue-bonus-manor-v2",gameId:input.gameId,revision:0,transitionId:input.turnId,startedAt:input.now,finishedAt:null,phase:"TURN_START",players,envelope,solution,
    bonus:{deck:shuffle(CLUE_BONUS_KINDS.flatMap(kind=>Array.from({length:CLUE_BONUS_CARDS[kind].count},()=>kind)),random),discard:[],pending:null,extraTurn:false,peekPlayerIds:[],publicEvidence:[],justDrewPlusSix:false},
    tokens:CLUE_SUSPECTS.map(suspect=>({suspect,location:CLUE_STARTS[suspect]})),weapons:CLUE_WEAPONS.map((weapon,i)=>({weapon,room:CLUE_ROOMS[i]!})),turnIndex:0,turnNumber:1,die:null,suggestion:null,evidence:[],history:[],result:null});
}
function token(s:ClueState,suspect:ClueSuspect){const t=s.tokens.find(t=>t.suspect===suspect);if(!t)throw new Error("Missing Clue token.");return t;}
export function matches(card:ClueCard,triple:ClueTriple):boolean{return card.key===triple.suspect||card.key===triple.weapon||card.key===triple.room;}
export function cluePaths(s:ClueState,steps=s.die??0):Map<string,string[]>{const me=s.players[s.turnIndex]!;return clueReachablePaths(token(s,me.suspect).location,steps,s.tokens.filter(t=>t.suspect!==me.suspect).map(t=>t.location));}
function nextTurn(s:ClueState){
  s.players[s.turnIndex]!.summoned=false;
  if(!s.bonus.extraTurn||s.players[s.turnIndex]!.eliminated)do{s.turnIndex=(s.turnIndex+1)%s.players.length;}while(s.players[s.turnIndex]!.eliminated);
  s.bonus.extraTurn=false;s.bonus.justDrewPlusSix=false;
  s.turnNumber++;s.phase="TURN_START";s.die=null;
}
function finish(s:ClueState,reason:NonNullable<ClueState["result"]>["reason"],now:ServerTime){s.phase="FINISHED";s.finishedAt=now;s.result={reason,winnerPlayerIds:reason==="SOLVED"?[s.players[s.turnIndex]!.playerId]:[]};}
export function cancelClue(s:ClueState,now:ServerTime):ClueState {
  const copy=parseClueState(s);if(copy.phase==="FINISHED")return copy;
  finish(copy,"CANCELLED",now);copy.revision=v.parse(GameRevisionSchema,copy.revision+1);return parseClueState(copy);
}
function suggest(s:ClueState,actor:PlayerId,triple:ClueTriple,moveTokens:boolean){
  const me=s.players[s.turnIndex]!;
      const q={id:s.revision+1,playerId:actor,suspect:triple.suspect,weapon:triple.weapon,room:triple.room,passedPlayerIds:[] as PlayerId[],responderPlayerId:null as PlayerId|null,resolved:false};
      if(moveTokens){const summoned=token(s,triple.suspect),other=s.players.find(p=>p.suspect===triple.suspect);
      if(summoned.location!==triple.room&&other&&other.playerId!==actor)other.summoned=true;
      summoned.location=triple.room;s.weapons.find(w=>w.weapon===triple.weapon)!.room=triple.room;}me.summoned=false;
      for(let i=1;i<s.players.length;i++){const p=s.players[(s.turnIndex+i)%s.players.length]!;if(p.hand.some(c=>matches(c,q))){q.responderPlayerId=p.playerId;break;}q.passedPlayerIds.push(p.playerId);}
      q.resolved=q.responderPlayerId===null;s.suggestion=q;s.phase=q.resolved?"END_TURN":"RESPOND";
      if(q.resolved)s.history.push({type:"SUGGEST",suggestion:{...q,passedPlayerIds:[...q.passedPlayerIds]}});
}
function drawBonus(s:ClueState,random:RandomSource){
  if(s.bonus.deck.length===0){s.bonus.deck=shuffle(s.bonus.discard,random);s.bonus.discard=[];}
  const kind=s.bonus.deck.pop();if(!kind)return;
  const me=s.players[s.turnIndex]!;
  s.history.push({type:"BONUS_DRAW",playerId:me.playerId,kind});
  if(kind==="EXTRA_SUGGEST"||kind==="TELEPORT"||kind==="PUBLIC_REVEAL"){
    s.bonus.pending={kind,targetPlayerId:null};s.phase="BONUS";
  }else{me.bonusHand.push(kind);s.bonus.justDrewPlusSix=kind==="PLUS_SIX";}
}
function consumePending(s:ClueState){
  const pending=s.bonus.pending;if(!pending)throw new Error("Missing bonus card.");
  s.bonus.discard.push(pending.kind);s.history.push({type:"BONUS_USE",playerId:s.players[s.turnIndex]!.playerId,kind:pending.kind});s.bonus.pending=null;
}
type Result={ok:true;state:ClueState}|{ok:false;reason:"NOT_YOUR_TURN"|"INVALID_PHASE"|"INVALID_ACTION"};
export function applyClueAction(original:ClueState,actor:PlayerId,action:ClueAction,now:ServerTime,transitionId:TurnId,random:RandomSource):Result {
  if(original.phase==="FINISHED")return {ok:false,reason:"INVALID_PHASE"};
  const active=original.players[original.turnIndex]!;
  const authorized=original.phase==="PEEK"?original.bonus.peekPlayerIds[0]:original.phase==="BONUS"&&original.bonus.pending?.targetPlayerId?original.bonus.pending.targetPlayerId:original.phase==="RESPOND"?original.suggestion?.responderPlayerId:active.playerId;
  if(actor!==authorized)return {ok:false,reason:"NOT_YOUR_TURN"};
  const s=parseClueState(original),me=s.players[s.turnIndex]!,piece=token(s,me.suspect);
  const invalid=():Result=>({ok:false,reason:"INVALID_ACTION"});
  if(s.phase==="PEEK"){
    const owner=s.players.find(p=>p.playerId===actor)!;
    if(action.type!=="SKIP_PEEK"&&(action.type!=="USE_BONUS"||action.kind!=="PEEK"))return invalid();
    if(action.type==="USE_BONUS"){
      const index=owner.bonusHand.indexOf("PEEK");if(index<0)return invalid();
      const originalEvidence=s.evidence.find(e=>e.suggestionId===s.suggestion?.id&&e.toPlayerId===s.suggestion.playerId);if(!originalEvidence)return invalid();
      owner.bonusHand.splice(index,1);s.bonus.discard.push("PEEK");s.history.push({type:"BONUS_USE",playerId:actor,kind:"PEEK"});
      const previous=s.evidence.find(e=>e.fromPlayerId===originalEvidence.fromPlayerId&&e.toPlayerId===actor&&e.card.cardId===originalEvidence.card.cardId);
      if(previous)previous.suggestionId=originalEvidence.suggestionId;else s.evidence.push({...originalEvidence,toPlayerId:actor,card:{...originalEvidence.card}});
    }
    s.bonus.peekPlayerIds.shift();if(s.bonus.peekPlayerIds.length===0)s.phase="END_TURN";
  }else if(s.phase==="BONUS"){
    const pending=s.bonus.pending;if(!pending)return invalid();
    if(pending.kind==="EXTRA_SUGGEST"&&action.type==="BONUS_SUGGEST"){
      consumePending(s);suggest(s,actor,action,false);
    }else if(pending.kind==="TELEPORT"&&action.type==="BONUS_MOVE"){
      consumePending(s);piece.location=action.room;me.summoned=false;s.phase="SUGGEST";
      s.history.push({type:"MOVE",playerId:actor,destination:action.room,passage:false});
    }else if(pending.kind==="PUBLIC_REVEAL"&&!pending.targetPlayerId&&action.type==="BONUS_TARGET"){
      if(action.playerId===actor||!s.players.some(p=>p.playerId===action.playerId))return invalid();
      pending.targetPlayerId=action.playerId;
    }else if(pending.kind==="PUBLIC_REVEAL"&&pending.targetPlayerId===actor&&action.type==="BONUS_REVEAL"){
      const card=s.players.find(p=>p.playerId===actor)?.hand.find(c=>c.cardId===action.cardId);if(!card)return invalid();
      if(!s.bonus.publicEvidence.some(e=>e.card.cardId===card.cardId))s.bonus.publicEvidence.push({playerId:actor,card:{...card}});
      consumePending(s);s.history.push({type:"PUBLIC_REVEAL",playerId:actor,card:{...card}});s.phase="END_TURN";
    }else return invalid();
  }else if(s.phase==="RESPOND"){
    const q=s.suggestion,owner=s.players.find(p=>p.playerId===actor);
    if(action.type!=="SHOW_CARD"||!q||!owner)return invalid();
    const card=owner.hand.find(c=>c.cardId===action.cardId);if(!card||!matches(card,q))return invalid();
    const previous=s.evidence.find(e=>e.fromPlayerId===actor&&e.toPlayerId===q.playerId&&e.card.cardId===card.cardId);
    if(previous)previous.suggestionId=q.id;else s.evidence.push({suggestionId:q.id,fromPlayerId:actor,toPlayerId:q.playerId,card:{...card}});
    q.resolved=true;s.history.push({type:"SUGGEST",suggestion:{...q,passedPlayerIds:[...q.passedPlayerIds]}});s.phase="END_TURN";
    s.bonus.peekPlayerIds=Array.from({length:s.players.length},(_,i)=>s.players[(s.turnIndex+i+1)%s.players.length]!).filter(p=>p.playerId!==q.playerId&&p.playerId!==actor&&!p.eliminated&&p.bonusHand.includes("PEEK")).map(p=>p.playerId);
    if(s.bonus.peekPlayerIds.length)s.phase="PEEK";
  } else switch(action.type){
    case "USE_BONUS":{
      const index=me.bonusHand.indexOf(action.kind);if(index<0||action.kind==="PEEK")return invalid();
      if(action.kind==="PLUS_SIX"){
        if(s.phase==="MOVE"&&s.die!==null&&s.die<=18)s.die+=6;
        else if(s.phase==="END_TURN"&&s.bonus.justDrewPlusSix){s.die=6;s.phase="MOVE";}
        else return invalid();
        s.bonus.justDrewPlusSix=false;
      }else{if(s.bonus.extraTurn)return invalid();s.bonus.extraTurn=true;}
      me.bonusHand.splice(index,1);s.bonus.discard.push(action.kind);s.history.push({type:"BONUS_USE",playerId:actor,kind:action.kind});break;
    }
    case "ROLL":
      if(s.phase!=="TURN_START")return invalid();
      s.die=random.nextInt(6)+1;s.phase="MOVE";me.summoned=false;s.history.push({type:"ROLL",playerId:actor,value:s.die});break;
    case "MOVE":{
      if(s.phase!=="MOVE"||!cluePaths(s).has(action.destination))return invalid();
      piece.location=action.destination;me.summoned=false;s.phase=isClueRoom(piece.location)?"SUGGEST":"END_TURN";
      s.history.push({type:"MOVE",playerId:actor,destination:piece.location,passage:false});s.bonus.justDrewPlusSix=false;
      if(CLUE_BONUS_CELLS.includes(piece.location))drawBonus(s,random);break;
    }
    case "PASSAGE":{
      if(s.phase!=="TURN_START"||!isClueRoom(piece.location))return invalid();const destination=CLUE_PASSAGES[piece.location];if(!destination)return invalid();
      piece.location=destination;me.summoned=false;s.phase="SUGGEST";s.history.push({type:"MOVE",playerId:actor,destination,passage:true});break;
    }
    case "SUGGEST":{
      if(!isClueRoom(piece.location)||(s.phase!=="SUGGEST"&&!(s.phase==="TURN_START"&&me.summoned)))return invalid();
      suggest(s,actor,{suspect:action.suspect,weapon:action.weapon,room:piece.location},true);break;
    }
    case "ACCUSE":{
      const correct=action.suspect===s.solution.suspect&&action.weapon===s.solution.weapon&&action.room===s.solution.room;
      s.history.push({type:"ACCUSE",playerId:actor,suspect:action.suspect,weapon:action.weapon,room:action.room,correct});
      if(correct){finish(s,"SOLVED",now);break;}
      me.eliminated=true;me.summoned=false;
      const door=CLUE_ROOM_AREAS.find(r=>r.doors.includes(piece.location));if(door)piece.location=door.room;
      if(s.players.every(p=>p.eliminated))finish(s,"ALL_ELIMINATED",now);else nextTurn(s);break;
    }
    case "END_TURN":{
      if(s.phase!=="SUGGEST"&&s.phase!=="END_TURN"){
        if(s.phase==="MOVE"&&cluePaths(s).size===0){nextTurn(s);break;}
        if(s.phase==="TURN_START"&&cluePaths(s,6).size===0&&!(isClueRoom(piece.location)&&CLUE_PASSAGES[piece.location])){nextTurn(s);break;}
        return invalid();
      }
      nextTurn(s);break;
    }
    case "SHOW_CARD":case "BONUS_SUGGEST":case "BONUS_MOVE":case "BONUS_TARGET":case "BONUS_REVEAL":case "SKIP_PEEK":return invalid();
  }
  s.revision=v.parse(GameRevisionSchema,s.revision+1);s.transitionId=transitionId;s.history=s.history.slice(-200);
  return {ok:true,state:parseClueState(s)};
}
