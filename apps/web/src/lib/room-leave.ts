import {
  PROTOCOL_VERSION,
  type GameRevision,
  type ProtocolErrorCode,
  type RequestId,
  type RoomCode,
  type RoomLeaveCommand,
  type RoomPhase,
  type RoomRevision,
} from "@hangul-rummikub/shared";

export type RoomLeaveFlightRef = {
  current: Promise<void> | null;
};

export type RoomLeaveClientOutcome =
  | "ACCEPTED"
  | "ROOM_CLOSED"
  | "DEFINITIVE_FAILURE"
  | "RETRYABLE_FAILURE";

export type RoomLeaveClientAction = Readonly<{
  roomState: "CLEAR_AND_GO_HOME" | "RETAIN";
  pendingCommand: "CLEAR" | "REUSE";
}>;

export function decideRoomLeaveClientAction(
  outcome: RoomLeaveClientOutcome,
): RoomLeaveClientAction {
  switch (outcome) {
    case "ACCEPTED":
    case "ROOM_CLOSED":
      return {
        roomState: "CLEAR_AND_GO_HOME",
        pendingCommand: "CLEAR",
      };
    case "DEFINITIVE_FAILURE":
      return { roomState: "RETAIN", pendingCommand: "CLEAR" };
    case "RETRYABLE_FAILURE":
      return { roomState: "RETAIN", pendingCommand: "REUSE" };
  }
}

export function createOrReuseRoomLeaveCommand(
  pendingCommand: RoomLeaveCommand | null,
  expectedRoomRevision: RoomRevision,
  expectedGameRevision: GameRevision | null,
  createId: () => RequestId,
): RoomLeaveCommand {
  if (pendingCommand !== null) {
    return pendingCommand;
  }

  return {
    kind: "room:leave",
    protocolVersion: PROTOCOL_VERSION,
    requestId: createId(),
    expectedRoomRevision,
    expectedGameRevision,
    payload: {},
  };
}

/** Runs at most one leave transport attempt for the current page. */
export function runRoomLeaveSingleFlight(
  flightRef: RoomLeaveFlightRef,
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

export function roomLeaveConfirmationMessage(phase: RoomPhase): string {
  switch (phase) {
    case "LOBBY":
      return "방에서 나가시겠습니까?";
    case "PLAYING":
      return "게임 중 나가면 기권 처리됩니다. 방에서 나가시겠습니까?";
    case "FINISHED":
      return "방에서 나가 홈으로 돌아가시겠습니까?";
  }
}

export function shouldRequestSyncAfterRoomLeaveFailure(
  code: ProtocolErrorCode,
): boolean {
  return (
    code === "STALE_ROOM_REVISION" ||
    code === "STALE_GAME_REVISION" ||
    code === "INVALID_PHASE"
  );
}

export function isStaleRoomLeaveSessionFailure(
  code: ProtocolErrorCode,
): boolean {
  return code === "SESSION_NOT_FOUND" || code === "ROOM_NOT_FOUND";
}

export function roomClosedMatchesCurrentRoom(
  currentRoomId: string | null,
  currentRoomCode: RoomCode | null,
  eventRoomId: string,
  eventRoomCode: RoomCode,
): boolean {
  return currentRoomId === eventRoomId && currentRoomCode === eventRoomCode;
}
