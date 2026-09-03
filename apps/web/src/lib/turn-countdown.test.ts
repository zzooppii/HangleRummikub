import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateServerClockOffset,
  calculateTurnCountdown,
} from "./turn-countdown.js";

test("serverTime과 local receipt time으로 display-only clock offset을 계산한다", () => {
  const offset = calculateServerClockOffset(1_750_000_005_000, 10_000);

  assert.equal(offset, 1_749_999_995_000);
  assert.deepEqual(
    calculateTurnCountdown(1_750_000_065_000, offset, 10_000),
    {
      remainingMilliseconds: 60_000,
      remainingSeconds: 60,
      expired: false,
    },
  );
});

test("countdown은 남은 일부 초를 올림하고 0 아래로 내려가지 않는다", () => {
  assert.deepEqual(calculateTurnCountdown(10_001, 0, 10_000), {
    remainingMilliseconds: 1,
    remainingSeconds: 1,
    expired: false,
  });
  assert.deepEqual(calculateTurnCountdown(10_000, 0, 10_000), {
    remainingMilliseconds: 0,
    remainingSeconds: 0,
    expired: true,
  });
  assert.deepEqual(calculateTurnCountdown(9_000, 0, 10_000), {
    remainingMilliseconds: 0,
    remainingSeconds: 0,
    expired: true,
  });
});

test("새 snapshot의 serverTime으로 offset을 다시 계산하면 countdown이 재동기화된다", () => {
  const oldOffset = calculateServerClockOffset(20_000, 1_000);
  const oldCountdown = calculateTurnCountdown(25_000, oldOffset, 4_000);
  const newOffset = calculateServerClockOffset(24_000, 4_000);
  const resynced = calculateTurnCountdown(84_000, newOffset, 4_000);

  assert.equal(oldCountdown.remainingSeconds, 2);
  assert.equal(resynced.remainingSeconds, 60);
});
