import assert from "node:assert/strict";
import test from "node:test";

import { getPlayingLiveRegionMessage } from "./playing-status.js";

test("timeout transition은 초 단위 countdown을 읽지 않고 한 번 알릴 수 있는 live status를 만든다", () => {
  assert.equal(
    getPlayingLiveRegionMessage({
      countdownExpired: true,
      noticeMessage: null,
      editErrorMessage: null,
      connectionLabel: "서버 연결됨",
    }),
    "시간 종료 처리 중...",
  );
});

test("playing live status는 draft feedback과 connection 상태를 안정적인 우선순위로 선택한다", () => {
  assert.equal(
    getPlayingLiveRegionMessage({
      countdownExpired: false,
      noticeMessage: "편집 내용이 초기화되었습니다.",
      editErrorMessage: "편집 오류",
      connectionLabel: "서버 연결됨",
    }),
    "편집 내용이 초기화되었습니다.",
  );
  assert.equal(
    getPlayingLiveRegionMessage({
      countdownExpired: false,
      noticeMessage: null,
      editErrorMessage: "편집 오류",
      connectionLabel: "서버 연결됨",
    }),
    "편집 오류",
  );
  assert.equal(
    getPlayingLiveRegionMessage({
      countdownExpired: false,
      noticeMessage: null,
      editErrorMessage: null,
      connectionLabel: "서버 재연결 중...",
    }),
    "서버 재연결 중...",
  );
});
