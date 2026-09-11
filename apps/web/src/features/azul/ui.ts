import { AZUL_FLOOR_PENALTIES, type AzulAction, type AzulColor, type AzulDestination, type AzulPlayerView, type AzulProjection, type AzulSource } from "@hangul-rummikub/shared";
export const AZUL_LABELS: Record<AzulColor, string> = { BLUE: "코발트", YELLOW: "골드", RED: "산호", BLACK: "오닉스", WHITE: "백자" };
export type AzulSelection = { source: AzulSource; color: AzulColor };
export function azulSourceKey(source: AzulSource): string { return source.kind === "CENTER" ? "center" : `factory-${source.index}`; }
export function azulLineReason(player: AzulPlayerView, color: AzulColor, row: number): string | null {
  const line = player.patternLines[row], wall = player.wall[row];
  if (!line || !wall) return "준비 줄을 선택해주세요.";
  if (line.length === row + 1) return "이미 완성한 줄입니다.";
  if (line.some(t => t.color !== color)) return "다른 색을 모으고 있는 줄입니다.";
  if (wall.some(t => t?.color === color)) return "이 벽 줄에는 같은 색이 있습니다.";
  return null;
}
export function previewAzul(g: AzulProjection, playerId: string, selection: AzulSelection | null, destination: AzulDestination | null) {
  const player = g.playerStates.find(p => p.playerId === playerId);
  const selectedTiles = selection ? (selection.source.kind === "CENTER" ? g.center : g.factories[selection.source.index] ?? []).filter(t => t.color === selection.color) : [];
  const count = selectedTiles.length;
  const takesFirst = selection?.source.kind === "CENTER" && g.firstPlayerId === null && count > 0;
  let reason = !selection || !count ? "공장이나 가운데에서 타일을 골라주세요." : destination === null ? "타일을 놓을 준비 줄을 골라주세요." : "";
  if (!player) reason = "내 보드를 확인할 수 없습니다.";
  if (player && selection && destination !== null && destination !== "FLOOR") reason = azulLineReason(player, selection.color, destination) ?? reason;
  const placed = !reason && player && destination !== null && destination !== "FLOOR" ? Math.min(count, destination + 1 - player.patternLines[destination]!.length) : 0;
  const dropped = !reason ? count - placed : 0;
  const beforeFloor = player?.floor.length ?? 0;
  const afterFloor = Math.min(7, beforeFloor + (takesFirst ? 1 : 0) + dropped);
  const penalty = AZUL_FLOOR_PENALTIES.slice(beforeFloor, afterFloor).reduce((sum, n) => sum + n, 0);
  const action: AzulAction | null = !reason && selection && destination !== null ? { ...selection, destination } : null;
  return { action, reason, count, placed, dropped, takesFirst, penalty, selectedTiles, completes: destination !== null && destination !== "FLOOR" && player !== undefined && placed + player.patternLines[destination]!.length === destination + 1 };
}
