export type CorrelatableAcknowledgement = Readonly<{
  requestId: string | null;
}>;

export function hasMatchingAcknowledgementRequestId(
  expectedRequestId: string,
  acknowledgement: CorrelatableAcknowledgement,
): boolean {
  return (
    acknowledgement.requestId !== null &&
    acknowledgement.requestId === expectedRequestId
  );
}
