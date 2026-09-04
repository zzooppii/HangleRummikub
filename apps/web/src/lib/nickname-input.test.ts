import assert from "node:assert/strict";
import test from "node:test";

import { NICKNAME_MAX_CODE_POINTS } from "@hangul-rummikub/shared";

import { limitNicknameInput } from "./nickname-input.js";

test("nickname 입력은 BMP 문자도 계약의 Unicode code point 상한에서 제한한다", () => {
  assert.equal(limitNicknameInput("가나다라마바사아자차카타파"), "가나다라마바사아자차카타");
});

test("nickname 입력은 surrogate pair도 한 Unicode code point로 센다", () => {
  const twelveAstralLetters = "𝐀".repeat(NICKNAME_MAX_CODE_POINTS);

  assert.equal(Array.from(twelveAstralLetters).length, 12);
  assert.equal(twelveAstralLetters.length, 24);
  assert.equal(
    limitNicknameInput(`${twelveAstralLetters}𝐀`),
    twelveAstralLetters,
  );
});

test("nickname 입력 제한은 trim이나 Unicode normalization을 대신하지 않는다", () => {
  const nonCanonicalInput = ` e\u0301 `;

  assert.equal(limitNicknameInput(nonCanonicalInput), nonCanonicalInput);
});
