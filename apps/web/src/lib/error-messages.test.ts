import assert from "node:assert/strict";
import test from "node:test";

import type { ProtocolErrorCode } from "@hangul-rummikub/shared";

import { getUserErrorMessage } from "./error-messages.js";

test("주요 protocol error를 안정적인 한국어 UX message로 변환한다", () => {
  const requiredCodes: ProtocolErrorCode[] = [
    "NICKNAME_INVALID",
    "NICKNAME_TAKEN",
    "ROOM_CODE_INVALID",
    "ROOM_NOT_FOUND",
    "ROOM_FULL",
    "ROOM_NOT_JOINABLE",
    "UNAUTHENTICATED",
    "SESSION_NOT_FOUND",
    "INCOMPATIBLE_PROTOCOL",
    "REQUEST_ID_REUSED",
    "ROOM_CODE_EXHAUSTED",
    "TEMPORARILY_UNAVAILABLE",
    "INTERNAL_ERROR",
  ];

  for (const code of requiredCodes) {
    const message = getUserErrorMessage(code);

    assert.ok(message.length > 0, `${code} should have a user message`);
    assert.equal(message.includes(code), false);
    assert.equal(message.includes("Error"), false);
  }
});
