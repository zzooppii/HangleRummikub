import assert from "node:assert/strict";
import test from "node:test";

import {
  PROTOCOL_VERSION,
  type StateSnapshot,
  validateStateSnapshot,
  validateStateVersions,
} from "@hangul-rummikub/shared";

import {
  compareStateVersions,
  decideSnapshotUpdate,
} from "./snapshot-state.js";

function snapshot(
  roomRevision: number,
  presenceVersion: number,
): StateSnapshot {
  const result = validateStateSnapshot({
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision,
      gameRevision: null,
      presenceVersion,
    },
    serverTime: 1_750_000_000_000,
    room: {
      roomId: "room_snapshot_test",
      roomCode: "ABC234",
      phase: "LOBBY",
      players: [
        {
          playerId: "player_snapshot_test",
          nickname: "혁상",
          isHost: true,
          connectionStatus: "CONNECTED",
        },
      ],
    },
    self: { playerId: "player_snapshot_test" },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Snapshot fixture must be valid.");
  }

  return result.value;
}

test("current snapshot이 없거나 roomRevision이 최신이면 적용한다", () => {
  assert.equal(decideSnapshotUpdate(null, snapshot(0, 0)), "APPLY");
  assert.equal(
    decideSnapshotUpdate(snapshot(1, 3), snapshot(2, 3)),
    "APPLY",
  );
});

test("presenceVersion만 최신이어도 snapshot을 적용한다", () => {
  assert.equal(
    decideSnapshotUpdate(snapshot(2, 3), snapshot(2, 4)),
    "APPLY",
  );
});

test("모든 version이 오래된 snapshot은 무시한다", () => {
  assert.equal(
    decideSnapshotUpdate(snapshot(2, 4), snapshot(1, 3)),
    "IGNORE_STALE",
  );
});

test("같은 version은 현재 snapshot을 안정적으로 유지한다", () => {
  assert.equal(
    decideSnapshotUpdate(snapshot(2, 4), snapshot(2, 4)),
    "KEEP_EQUAL",
  );
});

test("revision vector가 서로 비교 불가능하면 full sync를 요청한다", () => {
  assert.equal(
    decideSnapshotUpdate(snapshot(2, 4), snapshot(3, 3)),
    "REQUEST_SYNC",
  );
});

test("Game 부재 null과 revision 숫자는 임의로 순서를 정하지 않는다", () => {
  const current = snapshot(2, 4).versions;
  const incomingResult = validateStateVersions({
    ...current,
    gameRevision: 0,
  });

  assert.equal(incomingResult.ok, true);
  if (!incomingResult.ok) {
    throw new Error("State versions fixture must be valid.");
  }

  assert.equal(
    compareStateVersions(current, incomingResult.value),
    "REQUEST_SYNC",
  );
});
