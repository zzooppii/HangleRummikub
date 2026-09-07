export type AsyncSingleFlightRef = {
  current: Promise<void> | null;
};

/** Runs one page-memory async operation and reuses its in-flight Promise. */
export function runAsyncSingleFlight(
  flightRef: AsyncSingleFlightRef,
  execute: () => Promise<void>,
): Promise<void> {
  if (flightRef.current !== null) {
    return flightRef.current;
  }

  const flight = execute().finally(() => {
    if (flightRef.current === flight) {
      flightRef.current = null;
    }
  });
  flightRef.current = flight;
  return flight;
}
