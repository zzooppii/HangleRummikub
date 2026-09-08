import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { HomeScreen } from "../features/lobby/HomeScreen.js";

import {
  DEFAULT_SELECTED_GAME_TYPE,
  GAME_CATALOG,
} from "../features/game-catalog/game-catalog.js";

test("Web game catalog는 구현 완료된 Hangul/Number/GEM/CITY 네 게임을 같은 계층으로 공개한다", () => {
  assert.equal(Object.isFrozen(GAME_CATALOG), true);
  assert.equal(GAME_CATALOG.length, 4);
  assert.deepEqual(GAME_CATALOG, [
    {
      gameType: "HANGUL_TILE",
      displayName: "한글 타일 게임",
      description: "한글 타일을 조합해 단어를 완성하는 실시간 보드게임입니다.",
    },
    {
      gameType: "NUMBER_TILE",
      displayName: "숫자 타일 게임",
      description: "숫자를 그룹과 연속 조합으로 맞추는 타일 게임입니다.",
    },
    {
      gameType: "GEM_CARD",
      displayName: "보석 카드 게임",
      description: "자원을 모아 카드를 사고, 영구 할인을 쌓아 18점을 노리는 전략 게임입니다.",
    },
    {
      gameType: "CITY_ROLE",
      displayName: "비밀 도시 게임",
      description: "2~6명이 비밀 역할을 고르고, 자원을 모아 도시를 건설하는 라운드형 전략 게임입니다.",
    },
  ]);
  assert.equal(Object.isFrozen(GAME_CATALOG[0]), true);
  assert.equal(Object.isFrozen(GAME_CATALOG[1]), true);
  assert.equal(DEFAULT_SELECTED_GAME_TYPE, GAME_CATALOG[0].gameType);
  assert.equal(Object.isFrozen(GAME_CATALOG[2]), true);
  assert.equal(Object.isFrozen(GAME_CATALOG[3]), true);
  assert.doesNotMatch(JSON.stringify(GAME_CATALOG), /준비중|COMING_SOON/u);
});

test("Home renders exactly four playable game choices including the approved CITY title and capacity", () => {
  const html = renderToStaticMarkup(createElement(HomeScreen, {
    nickname: "", roomCodeInput: "", invitationRoomCode: null, routeErrorMessage: null,
    busyLabel: null, connectionLabel: "연결됨", connectionTone: "connected", errorMessage: null,
    onNicknameChange() {}, onRoomCodeChange() {}, onCreateRoom() {}, onJoinRoom() {}, onGoHome() {},
  }));
  assert.equal((html.match(/class="game-option(?: selected)?"/gu) ?? []).length, 4);
  for (const game of GAME_CATALOG) assert.ok(html.includes(game.displayName));
  assert.match(html, /2~6명이 비밀 역할을 고르고/u);
  assert.doesNotMatch(html, /COMING_SOON|준비중/u);
});
