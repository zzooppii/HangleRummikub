import assert from "node:assert/strict";
import test from "node:test";

import type { GameFinishReason } from "@hangul-rummikub/shared";

import {
  formatGameScore,
  getFinishReasonMessage,
} from "./finished-result.js";

test("모든 Game 종료 reason을 자연스러운 한국어 안내로 변환한다", () => {
  const expected = new Map<GameFinishReason, string>([
    ["RACK_EMPTY", "타일을 모두 사용했습니다."],
    ["TIME_LIMIT", "25분 제한시간이 종료되었습니다."],
    ["STALEMATE", "더 이상 진행할 수 없어 게임이 종료되었습니다."],
    ["LAST_PLAYER_STANDING", "다른 플레이어가 모두 기권했습니다."],
    [
      "ALL_PLAYERS_FORFEITED",
      "모든 플레이어가 기권하여 게임이 종료되었습니다.",
    ],
  ]);

  assert.equal(expected.size, 5);
  for (const [reason, message] of expected) {
    assert.equal(getFinishReasonMessage(reason), message);
  }
});

test("최종 점수는 양수에만 명시적인 plus 기호를 표시한다", () => {
  assert.equal(formatGameScore(36), "+36점");
  assert.equal(formatGameScore(0), "0점");
  assert.equal(formatGameScore(-32), "-32점");
});
