import { CLUE_CARD_KEYS, CLUE_PASSAGES, clueReachablePaths, isClueRoom, type ClueCardKey, type ClueProjection } from "@hangul-rummikub/shared";
export const CLUE_COLORS = {SCARLET:"#c75c62",MUSTARD:"#d6ad48",PLUM:"#a081bc",GREEN:"#65a68b",WHITE:"#e1ddcd",PEACOCK:"#579fbe"};
export function clueControls(g:ClueProjection,viewer:string){
  const player=g.playerStates.find(p=>p.playerId===viewer),location=g.tokens.find(t=>t.suspect===player?.suspect)?.location??"";
  const mine=g.phase!=="FINISHED"&&g.turnPlayerId===viewer&&!player?.eliminated;
  const paths=clueReachablePaths(location,g.phase==="MOVE"?g.die??0:6,g.tokens.filter(t=>t.suspect!==player?.suspect).map(t=>t.location));
  const passage=isClueRoom(location)?CLUE_PASSAGES[location]:undefined;
  return {location,paths,roll:mine&&g.phase==="TURN_START",move:mine&&g.phase==="MOVE",passage:mine&&g.phase==="TURN_START"?passage:undefined,
    suggest:mine&&isClueRoom(location)&&(g.phase==="SUGGEST"||g.phase==="TURN_START"&&Boolean(player?.summoned)),
    respond:g.phase==="RESPOND"&&g.suggestion?.responderPlayerId===viewer,
    accuse:mine&&g.phase!=="RESPOND",end:mine&&(g.phase==="SUGGEST"||g.phase==="END_TURN"||(g.phase==="MOVE"||g.phase==="TURN_START"&&!passage)&&paths.size===0)};
}
export type ClueNoteMark="?"|"×"|"✓";
export type ClueNotes={marks:Record<string,ClueNoteMark>;text:string};
export function parseClueNotes(raw:unknown,playerIds:readonly string[]):ClueNotes {
  if(typeof raw!=="object"||raw===null||!("marks" in raw)||!("text" in raw)||typeof raw.text!=="string"||typeof raw.marks!=="object"||raw.marks===null)return {marks:{},text:""};
  const allowed=new Set(CLUE_CARD_KEYS.flatMap(key=>playerIds.map(id=>key+":"+id))),marks:Record<string,ClueNoteMark>={};
  for(const [key,value] of Object.entries(raw.marks))if(allowed.has(key)&&(value==="?"||value==="×"||value==="✓"))marks[key]=value;
  return {marks,text:raw.text.slice(0,2000)};
}
export function clueKnownOwner(g:ClueProjection,key:ClueCardKey):string|null {
  if(g.privateState.hand.some(c=>c.key===key))return g.privateState.playerId;
  return g.privateState.evidence.find(e=>e.toPlayerId===g.privateState.playerId&&e.card.key===key)?.fromPlayerId??null;
}
export function clueNoteStorageKey(gameId:string,playerId:string):string{return "clue-notes:v1:"+gameId+":"+playerId;}
