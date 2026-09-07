import type { GameType } from "@hangul-rummikub/shared";

export type GameCatalogItem = Readonly<{
  gameType: GameType;
  displayName: string;
  description: string;
}>;

export const GAME_CATALOG = Object.freeze([
  Object.freeze({
    gameType: "HANGUL_TILE",
    displayName: "한글 타일 게임",
    description: "한글 타일을 조합해 단어를 완성하는 실시간 보드게임입니다.",
  }),
  Object.freeze({
    gameType: "NUMBER_TILE",
    displayName: "숫자 타일 게임",
    description: "숫자를 그룹과 연속 조합으로 맞추는 타일 게임입니다.",
  }),
  Object.freeze({
    gameType: "GEM_CARD",
    displayName: "보석 카드 게임",
    description: "자원을 모아 카드를 구매하고, 생산을 키워 18점을 향해 경쟁하세요.",
  }),
] as const satisfies readonly GameCatalogItem[]);

export const DEFAULT_SELECTED_GAME_TYPE = GAME_CATALOG[0].gameType;
