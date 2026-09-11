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
  Object.freeze({ gameType: "ISLAND_SETTLERS", displayName: "섬 개척", description: "3~4명이 자원을 교환하고 도로와 도시를 건설하는 섬 전략 게임입니다. 차례마다 2분!" }),
  Object.freeze({ gameType: "SPLENDOR", displayName: "스플렌더", description: "보석을 모아 카드를 사고, 귀족의 후원을 얻는 2~4인 전략 게임입니다." }),
  Object.freeze({ gameType: "JAIPUR", displayName: "자이푸르", description: "2명이 시장에서 상품을 교환하고 판매하며 인장 2개를 겨루는 카드 게임입니다." }),
  Object.freeze({ gameType: "GURYONGTU", displayName: "구룡투", description: "흑백 타일에 숨긴 아홉 개의 숫자. 상대의 수를 읽고 2승을 먼저 거두는 2인 심리전입니다." }),
  Object.freeze({ gameType: "WORD_DUET", displayName: "코드네임 듀엣", description: "둘만의 비밀 작전. 한 단어의 힌트로 서로를 이끌어 15명의 요원을 찾는 2인 협동 게임입니다." }),
  Object.freeze({ gameType: "LOST_CITIES", displayName: "로스트시티", description: "일반판·확장판을 골라 탐험에 투자하고, 3라운드 합계 점수를 겨루는 2인 카드 게임입니다." }),
  Object.freeze({ gameType: "SABOTEUR", displayName: "사보타지", description: "3~10명이 비밀 역할을 숨기고 광산의 길을 잇거나 방해하는 3라운드 보드게임입니다." }),
  Object.freeze({ gameType: "LIAR_GAME", displayName: "라이어게임", description: "4~8명이 설명 속 거짓말을 찾아내는 비밀 제시어·토론·투표 게임입니다." }),
  Object.freeze({ gameType: "SPYFALL", displayName: "스파이폴", description: "3~8명, 질문 속에 숨은 스파이를 찾아라. 비밀 장소와 첩보 테이블에서 펼치는 대화 추리 게임." }),
  Object.freeze({ gameType: "AZUL", displayName: "아줄", description: "아름다운 타일로 나만의 벽을 완성하는 2~4인 전략 게임입니다." }),
  Object.freeze({ gameType: "CLUE", displayName: "클루", description: "저택을 탐색하고 비밀 단서를 모아 사건을 해결하는 3~6인 추리 보드게임입니다." }),
] as const satisfies readonly GameCatalogItem[]);

export const DEFAULT_SELECTED_GAME_TYPE = GAME_CATALOG[0].gameType;
