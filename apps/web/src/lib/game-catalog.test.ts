import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SELECTED_GAME_TYPE,
  GAME_CATALOG,
} from "../features/game-catalog/game-catalog.js";

test("Web game catalog는 구현 완료된 Hangul/Number 두 게임만 같은 계층으로 공개한다", () => {
  assert.equal(Object.isFrozen(GAME_CATALOG), true);
  assert.equal(GAME_CATALOG.length, 2);
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
  ]);
  assert.equal(Object.isFrozen(GAME_CATALOG[0]), true);
  assert.equal(Object.isFrozen(GAME_CATALOG[1]), true);
  assert.equal(DEFAULT_SELECTED_GAME_TYPE, GAME_CATALOG[0].gameType);
  assert.doesNotMatch(JSON.stringify(GAME_CATALOG), /GEM_CARD/u);
});
