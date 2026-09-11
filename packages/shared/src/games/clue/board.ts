import { CLUE_ROOMS, type ClueRoom, type ClueSuspect } from "./actions.js";

export const CLUE_MAP_VERSION = "clue-manor-v1";
export const CLUE_BOARD_SIZE = 25;
export type ClueRoomArea = Readonly<{ room: ClueRoom; x: number; y: number; width: number; height: number; doors: readonly string[] }>;
/** Original map. Rectangles are artwork footprints; only explicit doors connect to corridors. */
export const CLUE_ROOM_AREAS: readonly ClueRoomArea[] = [
  {room:"KITCHEN",x:0,y:0,width:6,height:6,doors:["C:6:4"]},
  {room:"BALLROOM",x:8,y:0,width:9,height:7,doors:["C:10:7","C:14:7","C:7:3","C:17:3"]},
  {room:"CONSERVATORY",x:19,y:0,width:6,height:6,doors:["C:18:4"]},
  {room:"DINING",x:0,y:9,width:7,height:7,doors:["C:7:11","C:5:16"]},
  {room:"BILLIARD",x:19,y:8,width:6,height:5,doors:["C:18:10","C:22:13"]},
  {room:"LIBRARY",x:19,y:15,width:6,height:4,doors:["C:18:16","C:21:14"]},
  {room:"LOUNGE",x:0,y:19,width:7,height:6,doors:["C:7:20"]},
  {room:"HALL",x:9,y:18,width:7,height:7,doors:["C:8:20","C:12:17","C:16:20"]},
  {room:"STUDY",x:19,y:21,width:6,height:4,doors:["C:18:22"]},
];
export const CLUE_STARTS: Readonly<Record<ClueSuspect, string>> = {
  SCARLET:"C:7:24", MUSTARD:"C:0:17", PLUM:"C:24:19", GREEN:"C:17:0", WHITE:"C:7:0", PEACOCK:"C:24:6",
};
export const CLUE_PASSAGES: Readonly<Partial<Record<ClueRoom, ClueRoom>>> = {KITCHEN:"STUDY",STUDY:"KITCHEN",CONSERVATORY:"LOUNGE",LOUNGE:"CONSERVATORY"};
export function isClueRoom(location: string): location is ClueRoom { return CLUE_ROOMS.some(room => room === location); }
export function clueCell(x: number, y: number): string { return "C:" + x + ":" + y; }
export function clueCoordinates(location: string): {x:number;y:number} | null {
  if (!/^C:(?:[0-9]|1[0-9]|2[0-4]):(?:[0-9]|1[0-9]|2[0-4])$/.test(location)) return null;
  const parts=location.split(":"); return {x:Number(parts[1]),y:Number(parts[2])};
}
export function isClueCorridor(location: string): boolean {
  const p=clueCoordinates(location); if(!p)return false;
  if(p.x>=9&&p.x<=15&&p.y>=9&&p.y<=14)return false;
  return !CLUE_ROOM_AREAS.some(r=>p.x>=r.x&&p.x<r.x+r.width&&p.y>=r.y&&p.y<r.y+r.height);
}
export const CLUE_CORRIDORS = Array.from({length:625},(_,i)=>clueCell(i%25,Math.floor(i/25))).filter(isClueCorridor);
export function clueNeighbors(location: string): string[] {
  if(isClueRoom(location))return [...(CLUE_ROOM_AREAS.find(r=>r.room===location)?.doors??[])];
  if(!isClueCorridor(location))return [];
  const p=clueCoordinates(location);if(!p)return [];
  return [[p.x-1,p.y],[p.x+1,p.y],[p.x,p.y-1],[p.x,p.y+1]].map(([x,y])=>clueCell(x!,y!)).filter(isClueCorridor)
    .concat(CLUE_ROOM_AREAS.filter(r=>r.doors.includes(location)).map(r=>r.room));
}
/** Public board-only helper. Server recomputes routes; no client route or die value is trusted. */
export function clueReachablePaths(origin: string, steps: number, occupied: readonly string[]): Map<string, string[]> {
  const result=new Map<string,string[]>(), blocked=new Set(occupied.filter(p=>!isClueRoom(p))), visited=new Set([origin]);
  const queue: {location:string;path:string[]}[]=[{location:origin,path:[]}];
  for(let i=0;i<queue.length;i++){
    const entry=queue[i]!;if(entry.path.length>=steps)continue;
    for(const next of clueNeighbors(entry.location)){
      if(blocked.has(next)||visited.has(next))continue;
      visited.add(next);const path=[...entry.path,next];result.set(next,path);
      if(!isClueRoom(next))queue.push({location:next,path});
    }
  }
  return result;
}
