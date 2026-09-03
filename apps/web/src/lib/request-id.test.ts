import assert from "node:assert/strict";
import test from "node:test";

import { createRequestId } from "./request-id.js";

test("주입한 Web Crypto UUID 결과를 requestId로 검증한다", () => {
  assert.equal(
    createRequestId(() => "00000000-0000-4000-8000-000000000001"),
    "00000000-0000-4000-8000-000000000001",
  );
});

test("새 logical command마다 generator를 다시 호출한다", () => {
  let sequence = 0;
  const generate = () => {
    sequence += 1;
    return `request-${sequence}`;
  };

  assert.equal(createRequestId(generate), "request-1");
  assert.equal(createRequestId(generate), "request-2");
  assert.equal(sequence, 2);
});

test("유효하지 않은 generator 결과는 안전하게 거절한다", () => {
  assert.throws(
    () => createRequestId(() => ""),
    /could not create a valid request ID/u,
  );
});
