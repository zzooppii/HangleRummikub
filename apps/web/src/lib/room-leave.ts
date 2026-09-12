import type { GameType } from "@hangul-rummikub/shared";
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

import {
  runAsyncSingleFlight,
  type AsyncSingleFlightRef,
} from "./async-single-flight.js";

export type RoomLeaveFlightRef = AsyncSingleFlightRef;

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
  return runAsyncSingleFlight(flightRef, execute);
}

export function roomLeaveConfirmationMessage(phase: RoomPhase, gameType?: GameType): string {
  switch (phase) {
    case "LOBBY":
      return "방에서 나가시겠습니까?";
    case "PLAYING":
      if (gameType === "LIAR_GAME") return "나가면 모든 참가자의 이번 라이어게임 판이 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "SPYFALL") return "나가면 모든 참가자의 이번 스파이폴 판이 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "ISLAND_SETTLERS") return "나가면 모든 참가자의 이번 섬 개척 판이 취소됩니다. 잠시 자리를 비우려면 창만 닫고 같은 자리로 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "TRAIN") return "나가면 이번 티켓 투 라이드 게임이 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 나가시겠습니까?";
      if (gameType === "CENTURY") return "나가면 이번 센추리 게임이 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 나가시겠습니까?";
      if (gameType === "JAIPUR") return "나가면 이번 자이푸르 매치가 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "LOVE_LETTER") return "나가면 이번 러브레터 매치가 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "GURYONGTU") return "나가면 이번 구룡투 매치가 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "AZUL") return "나가면 이번 아줄 매치가 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "VEGAS") return "나가면 이번 라스베이거스 매치가 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "CARCASSONNE") return "나가면 이번 카르카손 매치가 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "CLUE") return "나가면 이번 클루 게임이 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "WORD_DUET") return "나가면 이번 코드네임 듀엣 매치가 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "SABOTEUR") return "나가면 이번 사보타지 매치가 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "LOST_CITIES") return "나가면 이번 로스트시티 매치가 취소됩니다. 잠시 자리를 비우려면 창을 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "SPLENDOR") return "나가면 모든 참가자의 이번 스플렌더 판이 취소됩니다. 잠시 자리를 비우려면 창만 닫고 재접속할 수 있습니다. 방에서 나가시겠습니까?";
      if (gameType === "HALLI_GALLI") return "나가면 모든 참가자의 이번 할리갈리 판이 취소됩니다. 방에서 나가시겠습니까?";
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
