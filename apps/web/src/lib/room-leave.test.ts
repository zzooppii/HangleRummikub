import assert from "node:assert/strict";
import test from "node:test";

import {
  validateRoomCode,
  validateRoomLeaveCommand,
  validateStateVersions,
  type GameRevision,
  type ProtocolErrorCode,
  type RoomCode,
  type RoomRevision,
} from "@hangul-rummikub/shared";

import { createRequestId } from "./request-id.js";
import {
  createOrReuseRoomLeaveCommand,
  decideRoomLeaveClientAction,
  isStaleRoomLeaveSessionFailure,
  roomClosedMatchesCurrentRoom,
  roomLeaveConfirmationMessage,
  runRoomLeaveSingleFlight,
  shouldRequestSyncAfterRoomLeaveFailure,
} from "./room-leave.js";

function revisions(
  roomRevision: number,
  gameRevision: number | null,
): Readonly<{
  roomRevision: RoomRevision;
  gameRevision: GameRevision | null;
}> {
  const result = validateStateVersions({
    roomRevision,
    gameRevision,
    presenceVersion: 0,
  });
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Revision fixture must be valid.");
  }
  return result.value;
}

function roomCode(value: string): RoomCode {
  const result = validateRoomCode(value);
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Room code fixture must be valid.");
  }
  return result.value;
}

test("leave command는 room/game revision을 포함하고 retry에서 requestId를 유지한다", () => {
  let sequence = 0;
  const createId = () => createRequestId(() => `leave-${++sequence}`);
  const firstVersions = revisions(7, 3);
  const retryVersions = revisions(8, 4);
  const first = createOrReuseRoomLeaveCommand(
    null,
    firstVersions.roomRevision,
    firstVersions.gameRevision,
    createId,
  );
  const retry = createOrReuseRoomLeaveCommand(
    first,
    retryVersions.roomRevision,
    retryVersions.gameRevision,
    createId,
  );

  assert.equal(retry, first);
  assert.equal(sequence, 1);
  assert.equal(first.expectedRoomRevision, 7);
  assert.equal(first.expectedGameRevision, 3);
  assert.deepEqual(first.payload, {});
  assert.equal(validateRoomLeaveCommand(first).ok, true);
});

test("Lobby leave는 null game revision을 전송한다", () => {
  const lobbyVersions = revisions(2, null);
  const command = createOrReuseRoomLeaveCommand(
    null,
    lobbyVersions.roomRevision,
    lobbyVersions.gameRevision,
    () => createRequestId(() => "leave-lobby"),
  );

  assert.equal(command.expectedGameRevision, null);
  assert.equal(validateRoomLeaveCommand(command).ok, true);
});

test("leave transport는 page-memory single-flight다", async () => {
  let executions = 0;
  let release: () => void = () => {
    throw new Error("Room leave resolver was not initialized.");
  };
  const flightRef: { current: Promise<void> | null } = { current: null };
  const first = runRoomLeaveSingleFlight(
    flightRef,
    () =>
      new Promise<void>((resolve) => {
        executions += 1;
        release = resolve;
      }),
  );
  const duplicate = runRoomLeaveSingleFlight(flightRef, async () => {
    executions += 1;
  });

  assert.equal(duplicate, first);
  assert.equal(executions, 1);
  release();
  await first;
  assert.equal(flightRef.current, null);
});

test("leave confirmation은 phase별 consequence를 설명한다", () => {
  assert.match(roomLeaveConfirmationMessage("LOBBY"), /나가/);
  assert.match(roomLeaveConfirmationMessage("PLAYING"), /기권/);
  assert.match(roomLeaveConfirmationMessage("FINISHED"), /홈/);
});

test("leave rejection은 stale revision일 때만 sync를 요청하고 화면 상태는 helper가 변경하지 않는다", () => {
  const cases: readonly [ProtocolErrorCode, boolean][] = [
    ["STALE_ROOM_REVISION", true],
    ["STALE_GAME_REVISION", true],
    ["INVALID_PHASE", true],
    ["UNAUTHENTICATED", false],
    ["INTERNAL_ERROR", false],
  ];

  for (const [code, expected] of cases) {
    assert.equal(shouldRequestSyncAfterRoomLeaveFailure(code), expected);
  }
});

test("leave 중 이미 제거된 Room/session 응답은 stale credential cleanup으로 분류한다", () => {
  assert.equal(isStaleRoomLeaveSessionFailure("SESSION_NOT_FOUND"), true);
  assert.equal(isStaleRoomLeaveSessionFailure("ROOM_NOT_FOUND"), true);
  assert.equal(isStaleRoomLeaveSessionFailure("UNAUTHENTICATED"), false);
  assert.equal(isStaleRoomLeaveSessionFailure("STALE_ROOM_REVISION"), false);
});

test("accepted/closed는 local Room을 정리하고 failure는 상태 보존 및 same-ID retry를 구분한다", () => {
  assert.deepEqual(decideRoomLeaveClientAction("ACCEPTED"), {
    roomState: "CLEAR_AND_GO_HOME",
    pendingCommand: "CLEAR",
  });
  assert.deepEqual(decideRoomLeaveClientAction("ROOM_CLOSED"), {
    roomState: "CLEAR_AND_GO_HOME",
    pendingCommand: "CLEAR",
  });
  assert.deepEqual(decideRoomLeaveClientAction("DEFINITIVE_FAILURE"), {
    roomState: "RETAIN",
    pendingCommand: "CLEAR",
  });
  assert.deepEqual(decideRoomLeaveClientAction("RETRYABLE_FAILURE"), {
    roomState: "RETAIN",
    pendingCommand: "REUSE",
  });
});

test("room:closed advisory는 roomCode가 재사용되어도 현재 불변 Room identity에만 적용한다", () => {
  const current = roomCode("ABC234");
  const other = roomCode("XYZ789");
  assert.equal(
    roomClosedMatchesCurrentRoom(
      "room-current",
      current,
      "room-current",
      current,
    ),
    true,
  );
  assert.equal(
    roomClosedMatchesCurrentRoom(
      "room-current",
      current,
      "room-reused-code",
      current,
    ),
    false,
  );
  assert.equal(
    roomClosedMatchesCurrentRoom(
      "room-current",
      current,
      "room-current",
      other,
    ),
    false,
  );
  assert.equal(
    roomClosedMatchesCurrentRoom(null, null, "room-current", current),
    false,
  );
});
