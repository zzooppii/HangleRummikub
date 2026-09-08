import assert from "node:assert/strict";
import test from "node:test";

import {
  calculateServerClockOffset,
  calculateTurnCountdown,
  formatCountdownMmSs,
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

test("MM:SS formatting pads seconds and rolls over at one minute", () => {
  for (const [seconds, expected] of [
    [0, "00:00"], [1, "00:01"], [9, "00:09"], [45, "00:45"], [59, "00:59"],
    [60, "01:00"], [90, "01:30"],
  ] as const) {
    assert.equal(formatCountdownMmSs(seconds), expected);
  }
});

test("MM:SS formatting clamps negative values and floors fractional seconds", () => {
  assert.equal(formatCountdownMmSs(-2), "00:00");
  assert.equal(formatCountdownMmSs(-0.1), "00:00");
  assert.equal(formatCountdownMmSs(0.9), "00:00");
  assert.equal(formatCountdownMmSs(59.9), "00:59");
  assert.equal(formatCountdownMmSs(60.9), "01:00");
});

test("MM:SS formatting does not cap minutes at 99", () => {
  assert.equal(formatCountdownMmSs(5_999), "99:59");
  assert.equal(formatCountdownMmSs(6_000), "100:00");
  assert.equal(formatCountdownMmSs(6_061), "101:01");
});

test("MM:SS formatting preserves existing non-finite number behavior", () => {
  assert.equal(formatCountdownMmSs(Number.NaN), "NaN:NaN");
  assert.equal(formatCountdownMmSs(Number.POSITIVE_INFINITY), "Infinity:NaN");
  assert.equal(formatCountdownMmSs(Number.NEGATIVE_INFINITY), "00:00");
});
