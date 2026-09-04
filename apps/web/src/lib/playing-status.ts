export type PlayingLiveRegionInput = Readonly<{
  countdownExpired: boolean;
  noticeMessage: string | null;
  editErrorMessage: string | null;
  connectionLabel: string;
}>;

/** Keeps the per-second countdown silent while announcing its terminal edge. */
export function getPlayingLiveRegionMessage(
  input: PlayingLiveRegionInput,
): string {
  if (input.countdownExpired) {
    return "시간 종료 처리 중...";
  }

  return (
    input.noticeMessage ?? input.editErrorMessage ?? input.connectionLabel
  );
}
