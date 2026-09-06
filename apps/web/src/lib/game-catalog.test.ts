import assert from "node:assert/strict";
import test from "node:test";

import {
  DEFAULT_SELECTED_GAME_TYPE,
  GAME_CATALOG,
} from "../features/game-catalog/game-catalog.js";

test("생성 가능한 Web game catalog는 최소 metadata의 HANGUL_TILE 한 항목만 공개한다", () => {
  assert.equal(Object.isFrozen(GAME_CATALOG), true);
  assert.equal(GAME_CATALOG.length, 1);
  assert.deepEqual(GAME_CATALOG, [
    {
      gameType: "HANGUL_TILE",
      displayName: "한글 타일 게임",
      description: "한글 타일을 조합해 단어를 완성하는 실시간 보드게임입니다.",
    },
  ]);
  assert.equal(Object.isFrozen(GAME_CATALOG[0]), true);
  assert.equal(DEFAULT_SELECTED_GAME_TYPE, GAME_CATALOG[0].gameType);
  assert.doesNotMatch(JSON.stringify(GAME_CATALOG), /NUMBER_TILE|GEM_CARD/u);
});
