import assert from "node:assert/strict";
import test from "node:test";
import type { RequestId } from "@hangul-rummikub/shared";

import { markRequestFeedbackSeen } from "./request-feedback.js";

test("feedback marks each request once and preserves the Set on replay", () => {
  const seen = new Set<RequestId>();
  const first = "feedback-first" as RequestId;
  const second = "feedback-second" as RequestId;

  assert.equal(markRequestFeedbackSeen(seen, first), true);
  assert.deepEqual([...seen], [first]);
  assert.equal(markRequestFeedbackSeen(seen, first), false);
  assert.deepEqual([...seen], [first]);
  assert.equal(markRequestFeedbackSeen(seen, second), true);
  assert.deepEqual([...seen], [first, second]);
  assert.equal(markRequestFeedbackSeen(seen, second), false);
  assert.deepEqual([...seen], [first, second]);
});

test("feedback scopes independently mark the same request", () => {
  const accepted = new Set<RequestId>();
  const audio = new Set<RequestId>();
  const requestId = "feedback-scoped" as RequestId;

  assert.equal(markRequestFeedbackSeen(accepted, requestId), true);
  assert.equal(audio.size, 0);
  assert.equal(markRequestFeedbackSeen(audio, requestId), true);
  assert.equal(markRequestFeedbackSeen(accepted, requestId), false);
  assert.equal(markRequestFeedbackSeen(audio, requestId), false);
  assert.deepEqual([...accepted], [requestId]);
  assert.deepEqual([...audio], [requestId]);
});

test("caller clearing a feedback scope permits that request again", () => {
  const seen = new Set<RequestId>();
  const requestId = "feedback-reused" as RequestId;

  assert.equal(markRequestFeedbackSeen(seen, requestId), true);
  seen.clear();
  assert.equal(markRequestFeedbackSeen(seen, requestId), true);
  assert.equal(markRequestFeedbackSeen(seen, requestId), false);
  assert.deepEqual([...seen], [requestId]);
});
