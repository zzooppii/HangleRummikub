import type { BurgundyColor, BurgundyTile } from "./actions.js";
import type { BurgundyPlayer } from "./contracts.js";
import { BURGUNDY_BOARDS } from "./boards.js";
import { BURGUNDY_CATALOG } from "./catalog.js";
export const BURGUNDY_NEIGHBORS = [
  [1, 0],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, 1],
  [0, 1],
] as const;
export function burgundyDefinition(tile: BurgundyTile) {
  const definition = BURGUNDY_CATALOG.find((t) => t.kind === tile.kind);
  if (!definition) throw new Error("Unknown Burgundy tile kind.");
  return definition;
}
export function burgundyBoard(id: number) {
  const board = BURGUNDY_BOARDS.find((b) => b.id === id);
  if (!board) throw new Error("Unknown Burgundy board.");
  return board;
}
export function burgundyRegion(boardId: number, cellId: string): string[] {
  const board = burgundyBoard(boardId),
    start = board.cells.find((c) => c.id === cellId);
  if (!start) return [];
  const result = [start.id],
    seen = new Set(result);
  for (let i = 0; i < result.length; i++) {
    const cell = board.cells.find((c) => c.id === result[i])!;
    for (const [q, r] of BURGUNDY_NEIGHBORS) {
      const next = board.cells.find(
        (c) =>
          c.q === cell.q + q && c.r === cell.r + r && c.color === start.color,
      );
      if (next && !seen.has(next.id)) {
        seen.add(next.id);
        result.push(next.id);
      }
    }
  }
  return result;
}
export function burgundyPlacementReason(
  player: BurgundyPlayer,
  tile: BurgundyTile,
  cellId: string,
  knowledge: readonly number[] = [],
): string | null {
  const board = burgundyBoard(player.boardId),
    cell = board.cells.find((c) => c.id === cellId),
    def = burgundyDefinition(tile);
  if (!cell || player.board.some((t) => t.cellId === cellId))
    return "비어 있는 공국 칸을 선택하세요.";
  if (!def.inn && def.color !== cell.color)
    return "타일과 칸의 색이 같아야 합니다.";
  if (
    !player.extension.shields.some((s) => s.shieldId === 18) &&
    !player.board.some((t) => {
      const c = board.cells.find((c) => c.id === t.cellId)!;
      return BURGUNDY_NEIGHBORS.some(
        ([q, r]) => c.q === cell.q + q && c.r === cell.r + r,
      );
    })
  )
    return "기존 타일에 인접해야 합니다.";
  const region = new Set(burgundyRegion(player.boardId, cellId));
  if (
    def.inn &&
    player.board.some(
      (t) => region.has(t.cellId) && burgundyDefinition(t.tile).inn,
    )
  )
    return "구역에는 여관을 하나만 놓을 수 있습니다.";
  if (
    def.building &&
    !knowledge.includes(1) &&
    player.board.some(
      (t) =>
        region.has(t.cellId) &&
        burgundyDefinition(t.tile).building === def.building,
    )
  )
    return "같은 마을에 같은 건물을 두 번 놓을 수 없습니다.";
  return null;
}
export function burgundyWorkerCost(
  from: number,
  to: number,
  double: boolean,
  free: number = 0,
): number {
  const distance = Math.min((from - to + 6) % 6, (to - from + 6) % 6);
  return Math.ceil(Math.max(0, distance - free) / (double ? 2 : 1));
}
export function burgundyPlacementDiscount(
  color: BurgundyColor,
  knowledge: readonly number[],
): number {
  return knowledge.includes(
    color === "BUILDING"
      ? 9
      : color === "SHIP" || color === "LIVESTOCK"
        ? 10
        : 11,
  )
    ? 1
    : 0;
}
