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
