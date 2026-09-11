import { useEffect, useState } from "react";

export function lostCitiesSecondsLeft(deadlineAt: number | null, serverTime: number, elapsedMs = 0): number {
  return deadlineAt === null ? 0 : Math.min(60, Math.max(0, Math.ceil((deadlineAt - serverTime - Math.max(0, elapsedMs)) / 1000)));
}

/** Monotonic local elapsed time is display-only; the server owns expiry and mutations. */
export function useLostCitiesCountdown(deadlineAt: number | null, serverTime: number): number {
  const [sample, setSample] = useState({deadlineAt, serverTime, elapsed: 0});
  useEffect(() => {
    const receivedAt = performance.now();
    setSample({deadlineAt, serverTime, elapsed: 0});
    if (deadlineAt === null) return;
    const timer = setInterval(() => setSample({deadlineAt, serverTime, elapsed: performance.now() - receivedAt}), 200);
    return () => clearInterval(timer);
  }, [deadlineAt, serverTime]);
  return lostCitiesSecondsLeft(deadlineAt, serverTime, sample.deadlineAt === deadlineAt && sample.serverTime === serverTime ? sample.elapsed : 0);
}
