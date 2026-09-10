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
    description: "자원을 모아 카드를 사고, 영구 할인을 쌓아 18점을 노리는 전략 게임입니다.",
  }),
  Object.freeze({
    gameType: "CITY_ROLE",
    displayName: "비밀 도시 게임",
    description: "2~6명이 비밀 역할을 고르고, 자원을 모아 도시를 건설하는 라운드형 전략 게임입니다.",
  }),
  Object.freeze({ gameType: "DRAW_RELAY", displayName: "그림 릴레이", description: "3~8명이 그림과 추측을 이어가며 처음 단어가 어떻게 변했는지 함께 보는 파티게임입니다." }),
  Object.freeze({ gameType: "SNEAKY_LUNCH", displayName: "몰래 한입", description: "2~8명이 선생님 눈을 피해 도시락을 비우는 교실 눈치 파티게임입니다." }),
  Object.freeze({ gameType: "WOLF_NIGHT", displayName: "늑대의 밤", description: "3~10명이 단 하룻밤의 비밀을 추리하는 역할 교환·비밀 투표 게임입니다." }),
  Object.freeze({ gameType: "HALLI_GALLI", displayName: "할리갈리", description: "2~6명이 같은 과일 5개를 발견하면 벨을 누르는 스피드 카드 게임입니다." }),
] as const satisfies readonly GameCatalogItem[]);

export const DEFAULT_SELECTED_GAME_TYPE = GAME_CATALOG[0].gameType;
