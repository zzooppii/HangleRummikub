import type { RequestId, ServerTime } from "@hangul-rummikub/shared";

import type { IdempotencyRecord } from "../model/persistence.js";

export type IdempotencyLookupResult =
  | { status: "MISS" }
  | { status: "REPLAY"; record: IdempotencyRecord }
  | { status: "CONFLICT"; record: IdempotencyRecord };

export interface IdempotencyRepository {
  classify(
    scopeKey: string,
    requestId: RequestId,
    payloadFingerprint: string,
  ): Promise<IdempotencyLookupResult>;
  deleteByScope(scopeKey: string): Promise<number>;
  deleteCreatedBefore(cutoff: ServerTime): Promise<number>;
}
