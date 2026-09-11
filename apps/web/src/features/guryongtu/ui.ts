import type { GuryongtuProjection, TileId } from "@hangul-rummikub/shared";
export function guryongtuSelection(g: GuryongtuProjection, selfId: string, tileId: TileId | null) {
  if (g.phase !== "PLAYING" || g.activePlayerId !== selfId || tileId === null) return null;
  return g.privateState.hand.find(t => t.tileId === tileId) ?? null;
}
export function guryongtuInstruction(g: GuryongtuProjection, selfId: string): string {
  if (g.phase === "FINISHED") return g.result.reason === "CANCELLED" ? "대결이 취소되었습니다" : "마지막 승부가 끝났습니다";
  if (g.phase === "ROUND_RESULT") return g.roundResults.at(-1)?.winnerPlayerId ? "한 판이 끝났습니다" : "동률입니다. 승수를 유지하고 다시 겨룹니다";
  if (g.activePlayerId !== selfId) return g.stage === "ATTACK" ? "상대가 첫 수를 고르고 있습니다" : "상대가 응수할 타일을 고르고 있습니다";
  return g.stage === "ATTACK" ? "먼저 낼 타일을 골라주세요" : `상대는 ${g.submitted?.parity === "ODD" ? "홀수" : "짝수"}. 어떤 수로 응수할까요?`;
}
export function guryongtuScope(g: GuryongtuProjection): string {
  return `${g.gameId}:${g.roundId}:${g.phase}:${g.phase === "PLAYING" ? g.turnId : ""}`;
}
