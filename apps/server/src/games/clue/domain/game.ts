import * as v from "valibot";
import {
  CLUE_CARD_KEYS, CLUE_SUSPECTS, CLUE_WEAPONS, CLUE_ROOMS, CLUE_STARTS, CLUE_PASSAGES, CLUE_ROOM_AREAS,
  ClueCardSchema, CluePlayerViewSchema, ClueTokenSchema, ClueWeaponPositionSchema, ClueTripleSchema,
  ClueSuggestionSchema, ClueEvidenceSchema, ClueHistorySchema, ClueResultSchema,
  GameIdSchema, GameRevisionSchema, TurnIdSchema, ServerTimeSchema,
  clueReachablePaths, isClueRoom, isClueCorridor,
  type ClueAction, type ClueCard, type ClueTriple, type ClueSuspect,
  type GameId, type PlayerId, type TurnId, type TileId, type ServerTime,
} from "@hangul-rummikub/shared";
import type { RandomSource } from "../../../ports/system.js";

const PlayerSchema=v.strictObject({...CluePlayerViewSchema.entries,hand:v.array(ClueCardSchema)});
const StateSchema=v.strictObject({
  rulesVersion:v.literal("clue-classic-manor-v1"),gameId:GameIdSchema,revision:GameRevisionSchema,transitionId:TurnIdSchema,
  startedAt:ServerTimeSchema,finishedAt:v.nullable(ServerTimeSchema),phase:v.picklist(["TURN_START","MOVE","SUGGEST","RESPOND","END_TURN","FINISHED"]),
  players:v.pipe(v.array(PlayerSchema),v.minLength(3),v.maxLength(6)),tokens:v.pipe(v.array(ClueTokenSchema),v.length(6)),weapons:v.pipe(v.array(ClueWeaponPositionSchema),v.length(6)),
  envelope:v.pipe(v.array(ClueCardSchema),v.length(3)),solution:ClueTripleSchema,
  turnIndex:v.pipe(v.number(),v.safeInteger(),v.minValue(0),v.maxValue(5)),turnNumber:v.pipe(v.number(),v.safeInteger(),v.minValue(1)),die:v.nullable(v.pipe(v.number(),v.safeInteger(),v.minValue(1),v.maxValue(6))),
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
  const players=input.playerIds.map((playerId,i)=>{const hand=remaining.filter((_,j)=>j%input.playerIds.length===i);return {playerId,suspect:CLUE_SUSPECTS[i]!,hand,cardCount:hand.length,eliminated:false,summoned:false};});
  return parseClueState({rulesVersion:"clue-classic-manor-v1",gameId:input.gameId,revision:0,transitionId:input.turnId,startedAt:input.now,finishedAt:null,phase:"TURN_START",players,envelope,solution,
    tokens:CLUE_SUSPECTS.map(suspect=>({suspect,location:CLUE_STARTS[suspect]})),weapons:CLUE_WEAPONS.map((weapon,i)=>({weapon,room:CLUE_ROOMS[i]!})),turnIndex:0,turnNumber:1,die:null,suggestion:null,evidence:[],history:[],result:null});
}
function token(s:ClueState,suspect:ClueSuspect){const t=s.tokens.find(t=>t.suspect===suspect);if(!t)throw new Error("Missing Clue token.");return t;}
export function matches(card:ClueCard,triple:ClueTriple):boolean{return card.key===triple.suspect||card.key===triple.weapon||card.key===triple.room;}
export function cluePaths(s:ClueState,steps=s.die??0):Map<string,string[]>{const me=s.players[s.turnIndex]!;return clueReachablePaths(token(s,me.suspect).location,steps,s.tokens.filter(t=>t.suspect!==me.suspect).map(t=>t.location));}
function nextTurn(s:ClueState){
  s.players[s.turnIndex]!.summoned=false;
  do{s.turnIndex=(s.turnIndex+1)%s.players.length;}while(s.players[s.turnIndex]!.eliminated);
  s.turnNumber++;s.phase="TURN_START";s.die=null;
}
function finish(s:ClueState,reason:NonNullable<ClueState["result"]>["reason"],now:ServerTime){s.phase="FINISHED";s.finishedAt=now;s.result={reason,winnerPlayerIds:reason==="SOLVED"?[s.players[s.turnIndex]!.playerId]:[]};}
export function cancelClue(s:ClueState,now:ServerTime):ClueState {
  const copy=parseClueState(s);if(copy.phase==="FINISHED")return copy;
  finish(copy,"CANCELLED",now);copy.revision=v.parse(GameRevisionSchema,copy.revision+1);return parseClueState(copy);
}
type Result={ok:true;state:ClueState}|{ok:false;reason:"NOT_YOUR_TURN"|"INVALID_PHASE"|"INVALID_ACTION"};
export function applyClueAction(original:ClueState,actor:PlayerId,action:ClueAction,now:ServerTime,transitionId:TurnId,random:RandomSource):Result {
  if(original.phase==="FINISHED")return {ok:false,reason:"INVALID_PHASE"};
  const active=original.players[original.turnIndex]!;
  const authorized=original.phase==="RESPOND"?original.suggestion?.responderPlayerId:active.playerId;
  if(actor!==authorized)return {ok:false,reason:"NOT_YOUR_TURN"};
  const s=parseClueState(original),me=s.players[s.turnIndex]!,piece=token(s,me.suspect);
  const invalid=():Result=>({ok:false,reason:"INVALID_ACTION"});
  if(s.phase==="RESPOND"){
    const q=s.suggestion,owner=s.players.find(p=>p.playerId===actor);
    if(action.type!=="SHOW_CARD"||!q||!owner)return invalid();
    const card=owner.hand.find(c=>c.cardId===action.cardId);if(!card||!matches(card,q))return invalid();
    const previous=s.evidence.find(e=>e.fromPlayerId===actor&&e.toPlayerId===q.playerId&&e.card.cardId===card.cardId);
    if(previous)previous.suggestionId=q.id;else s.evidence.push({suggestionId:q.id,fromPlayerId:actor,toPlayerId:q.playerId,card:{...card}});
    q.resolved=true;s.history.push({type:"SUGGEST",suggestion:{...q,passedPlayerIds:[...q.passedPlayerIds]}});s.phase="END_TURN";
  } else switch(action.type){
    case "ROLL":
      if(s.phase!=="TURN_START")return invalid();
      s.die=random.nextInt(6)+1;s.phase="MOVE";me.summoned=false;s.history.push({type:"ROLL",playerId:actor,value:s.die});break;
    case "MOVE":{
      if(s.phase!=="MOVE"||!cluePaths(s).has(action.destination))return invalid();
      piece.location=action.destination;me.summoned=false;s.phase=isClueRoom(piece.location)?"SUGGEST":"END_TURN";
      s.history.push({type:"MOVE",playerId:actor,destination:piece.location,passage:false});break;
    }
    case "PASSAGE":{
      if(s.phase!=="TURN_START"||!isClueRoom(piece.location))return invalid();const destination=CLUE_PASSAGES[piece.location];if(!destination)return invalid();
      piece.location=destination;me.summoned=false;s.phase="SUGGEST";s.history.push({type:"MOVE",playerId:actor,destination,passage:true});break;
    }
    case "SUGGEST":{
      if(!isClueRoom(piece.location)||(s.phase!=="SUGGEST"&&!(s.phase==="TURN_START"&&me.summoned)))return invalid();
      const q={id:s.revision+1,playerId:actor,suspect:action.suspect,weapon:action.weapon,room:piece.location,passedPlayerIds:[] as PlayerId[],responderPlayerId:null as PlayerId|null,resolved:false};
      const summoned=token(s,action.suspect),other=s.players.find(p=>p.suspect===action.suspect);
      if(summoned.location!==piece.location&&other&&other.playerId!==actor)other.summoned=true;
      summoned.location=piece.location;s.weapons.find(w=>w.weapon===action.weapon)!.room=piece.location;me.summoned=false;
      for(let i=1;i<s.players.length;i++){const p=s.players[(s.turnIndex+i)%s.players.length]!;if(p.hand.some(c=>matches(c,q))){q.responderPlayerId=p.playerId;break;}q.passedPlayerIds.push(p.playerId);}
      q.resolved=q.responderPlayerId===null;s.suggestion=q;s.phase=q.resolved?"END_TURN":"RESPOND";
      if(q.resolved)s.history.push({type:"SUGGEST",suggestion:{...q,passedPlayerIds:[...q.passedPlayerIds]}});break;
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
    case "SHOW_CARD":return invalid();
  }
  s.revision=v.parse(GameRevisionSchema,s.revision+1);s.transitionId=transitionId;s.history=s.history.slice(-200);
  return {ok:true,state:parseClueState(s)};
}
