import type { GameFinishReason } from "@hangul-rummikub/shared";

const FINISH_REASON_MESSAGES = {
  RACK_EMPTY: "타일을 모두 사용했습니다.",
  TIME_LIMIT: "25분 제한시간이 종료되었습니다.",
  STALEMATE: "더 이상 진행할 수 없어 게임이 종료되었습니다.",
  LAST_PLAYER_STANDING: "다른 플레이어가 모두 기권했습니다.",
  ALL_PLAYERS_FORFEITED: "모든 플레이어가 기권하여 게임이 종료되었습니다.",
} satisfies Record<GameFinishReason, string>;

export function getFinishReasonMessage(reason: GameFinishReason): string {
  return FINISH_REASON_MESSAGES[reason];
}

export function formatGameScore(score: number): string {
  return `${score > 0 ? "+" : ""}${score}점`;
}
