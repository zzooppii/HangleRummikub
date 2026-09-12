import { CLUE_ROOMS, type ClueRoom, type ClueSuspect } from "./actions.js";

export const CLUE_MAP_VERSION = "clue-bonus-manor-v2";
export const CLUE_BOARD_SIZE = 21;
export const CLUE_CELL_PERCENT = 100 / CLUE_BOARD_SIZE;
export type ClueRoomArea = Readonly<{ room: ClueRoom; x: number; y: number; width: number; height: number; doors: readonly string[] }>;
/** Corridor coordinates transcribed row by row from the user's board photograph.
 * The illustration footprints never determine which cells can be walked on. */
export const CLUE_ROOM_AREAS: readonly ClueRoomArea[] = [
  {room:"CONSERVATORY",x:0,y:2,width:6,height:6,doors:["C:6:4"]},
  {room:"BALLROOM",x:6,y:0,width:4,height:4,doors:["C:8:4"]},
  {room:"STUDY",x:10,y:1,width:4,height:5,doors:["C:9:5"]},
  {room:"KITCHEN",x:14,y:1,width:6,height:7,doors:["C:13:7"]},
  {room:"BILLIARD",x:0,y:8,width:6,height:6,doors:["C:6:10"]},
  {room:"DINING",x:13,y:8,width:7,height:5,doors:["C:12:10"]},
  {room:"LIBRARY",x:0,y:14,width:6,height:6,doors:["C:6:15"]},
  {room:"LOUNGE",x:14,y:13,width:6,height:7,doors:["C:13:14"]},
  {room:"HALL",x:8,y:17,width:4,height:3,doors:["C:9:16","C:10:16"]},
];
/** Explicit edges: walls block both directions; room doors cost one normal step. */
export const CLUE_BLOCKED_EDGES = [{from:"C:9:5",to:"C:9:6",x:9,y:6,width:1,height:0}] as const;
export const CLUE_ROOM_LINKS: readonly {from:ClueRoom;to:ClueRoom;x:number;y:number;width:number;height:number}[] = [
  {from:"KITCHEN",to:"DINING",x:17,y:8,width:1,height:0},
];
export const CLUE_ENVELOPE_AREA = {x:8,y:10,width:4,height:3} as const;
export const CLUE_STAIRS_AREA = {x:7,y:6,width:2,height:2} as const;
export const CLUE_BEDROOM_WING = {x:6,y:6,width:1,height:2} as const;
/** Eight corridor columns. # = wall, room, stairs or outside; . = a walkable cell. */
export const CLUE_CORRIDOR_ORIGIN = {x:6,y:4} as const;
export const CLUE_CORRIDOR_ROWS = [
  "....####", // below the bathroom
  "....####",
  "###.....", // bedroom wing and red stairs occupy the first three columns
  "###.....",
  ".......#",
  ".......#",
  "..####.#", // central envelope occupies four columns, three rows
  "..####.#",
  "..####.#",
  "........", // eight cells across beneath the envelope
  "........",
  "........",
  "##....##", // four cells at the entrance
] as const;
export const CLUE_BONUS_CELLS: readonly string[] = ["C:8:5","C:10:6","C:7:8","C:12:12","C:9:13","C:11:15"];
export const CLUE_STARTS: Readonly<Record<ClueSuspect, string>> = {
  SCARLET:"C:9:16", MUSTARD:"C:6:15", PLUM:"C:13:15", GREEN:"C:10:16", WHITE:"C:8:16", PEACOCK:"C:11:16",
};
export const CLUE_PASSAGES: Readonly<Partial<Record<ClueRoom, ClueRoom>>> = {KITCHEN:"LIBRARY",LIBRARY:"KITCHEN",CONSERVATORY:"LOUNGE",LOUNGE:"CONSERVATORY"};
export function isClueRoom(location: string): location is ClueRoom { return CLUE_ROOMS.some(room => room === location); }
export function clueCell(x: number, y: number): string { return "C:" + x + ":" + y; }
export function clueCoordinates(location: string): {x:number;y:number} | null {
  if (!/^C:(?:[0-9]|1[0-9]|2[0-4]):(?:[0-9]|1[0-9]|2[0-4])$/.test(location)) return null;
  const parts=location.split(":"); return {x:Number(parts[1]),y:Number(parts[2])};
}
export const CLUE_CORRIDORS: readonly string[] = CLUE_CORRIDOR_ROWS.flatMap((row,y)=>
  [...row].flatMap((cell,x)=>cell==="."?[clueCell(x+CLUE_CORRIDOR_ORIGIN.x,y+CLUE_CORRIDOR_ORIGIN.y)]:[]));
const corridorSet: ReadonlySet<string> = new Set(CLUE_CORRIDORS);
export function isClueCorridor(location: string): boolean { return corridorSet.has(location); }
export function clueNeighbors(location: string): string[] {
  if(isClueRoom(location))return [...(CLUE_ROOM_AREAS.find(r=>r.room===location)?.doors??[]),...CLUE_ROOM_LINKS.flatMap(link=>link.from===location?[link.to]:link.to===location?[link.from]:[])];
  if(!isClueCorridor(location))return [];
  const p=clueCoordinates(location);if(!p)return [];
  return [[p.x-1,p.y],[p.x+1,p.y],[p.x,p.y-1],[p.x,p.y+1]].map(([x,y])=>clueCell(x!,y!)).filter(isClueCorridor)
    .filter(next=>!CLUE_BLOCKED_EDGES.some(edge=>edge.from===location&&edge.to===next||edge.to===location&&edge.from===next))
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
