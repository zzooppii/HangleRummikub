import assert from "node:assert/strict";
import test from "node:test";

import { hasMatchingAcknowledgementRequestId } from "./ack-correlation.js";

test("acknowledgement requestId가 outbound command와 같으면 허용한다", () => {
  assert.equal(
    hasMatchingAcknowledgementRequestId("request-expected", {
      requestId: "request-expected",
    }),
    true,
  );
});

test("acknowledgement requestId가 outbound command와 다르면 거절한다", () => {
  assert.equal(
    hasMatchingAcknowledgementRequestId("request-expected", {
      requestId: "request-other",
    }),
    false,
  );
});

test("상관시킬 수 없는 null requestId acknowledgement를 거절한다", () => {
  assert.equal(
    hasMatchingAcknowledgementRequestId("request-expected", {
      requestId: null,
    }),
    false,
  );
});
