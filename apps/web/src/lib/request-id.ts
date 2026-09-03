import {
  validateRequestId,
  type RequestId,
} from "@hangul-rummikub/shared";

export type RandomUuid = () => string;

function browserRandomUuid(): string {
  return globalThis.crypto.randomUUID();
}

export function createRequestId(
  randomUuid: RandomUuid = browserRandomUuid,
): RequestId {
  const result = validateRequestId(randomUuid());

  if (!result.ok) {
    throw new Error("The browser could not create a valid request ID.");
  }

  return result.value;
}
