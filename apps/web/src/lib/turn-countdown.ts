export type TurnCountdown = Readonly<{
  remainingMilliseconds: number;
  remainingSeconds: number;
  expired: boolean;
}>;

/** Estimates server time from the local receipt time of a server timestamp. */
export function calculateServerClockOffset(
  serverTime: number,
  localReceivedAt: number,
): number {
  return serverTime - localReceivedAt;
}

export function calculateTurnCountdown(
  deadlineAt: number,
  serverClockOffset: number,
  localNow: number,
): TurnCountdown {
  const remainingMilliseconds = Math.max(
    0,
    deadlineAt - (localNow + serverClockOffset),
  );

  return {
    remainingMilliseconds,
    remainingSeconds: Math.ceil(remainingMilliseconds / 1_000),
    expired: remainingMilliseconds === 0,
  };
}

/** Formats display seconds without changing deadline or countdown policy. */
export function formatCountdownMmSs(remainingSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(remainingSeconds));
  const minutes = Math.floor(safeSeconds / 60);
  const seconds = safeSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}
