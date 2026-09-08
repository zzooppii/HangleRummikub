import type { RequestId } from "@hangul-rummikub/shared";

/** Marks feedback in a caller-owned Set; its lifetime stays with the caller. */
export function markRequestFeedbackSeen(
  seen: Set<RequestId>,
  requestId: RequestId,
): boolean {
  if (seen.has(requestId)) return false;
  seen.add(requestId);
  return true;
}
