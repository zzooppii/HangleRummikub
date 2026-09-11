import { useEffect, useRef, useState } from "react";

/** Monotonic elapsed time keeps changing the local system clock from extending a turn. */
export function useCarcassonneClock(
  serverTime: number,
  deadlineAt: number | null,
) {
  const anchor = useRef({
    serverTime,
    local: typeof performance === "undefined" ? 0 : performance.now(),
  });
  const [now, setNow] = useState(serverTime);
  useEffect(() => {
    anchor.current = { serverTime, local: performance.now() };
    setNow(serverTime);
    const timer = setInterval(
      () =>
        setNow(
          anchor.current.serverTime + performance.now() - anchor.current.local,
        ),
      100,
    );
    return () => clearInterval(timer);
  }, [serverTime]);
  return deadlineAt === null
    ? 0
    : Math.max(
        0,
        Math.min(
          90,
          Math.ceil((deadlineAt - Math.max(now, serverTime)) / 1000),
        ),
      );
}
