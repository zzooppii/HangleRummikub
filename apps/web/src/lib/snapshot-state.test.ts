import assert from "node:assert/strict";
import test from "node:test";

import {
  PROTOCOL_VERSION,
  type FinishedStateSnapshot,
  type PlayingStateSnapshot,
  type StateSnapshot,
  validateFinishedStateSnapshot,
  validatePlayingStateSnapshot,
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

function playingSnapshot(): PlayingStateSnapshot {
  const result = validatePlayingStateSnapshot({
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 3,
      gameRevision: 0,
      presenceVersion: 4,
    },
    serverTime: 1_750_000_000_100,
    room: {
      roomId: "room_snapshot_test",
      roomCode: "ABC234",
      phase: "PLAYING",
      players: [
        {
          playerId: "player_snapshot_test",
          nickname: "혁상",
          isHost: true,
          connectionStatus: "CONNECTED",
          rackCount: 0,
          initialMeldCompleted: false,
        },
        {
          playerId: "player_snapshot_guest",
          nickname: "참가자",
          isHost: false,
          connectionStatus: "CONNECTED",
          rackCount: 14,
          initialMeldCompleted: false,
        },
      ],
    },
    game: {
      gameId: "game_snapshot_test",
      board: { wordGroups: [] },
      turnOrder: ["player_snapshot_test", "player_snapshot_guest"],
      turn: {
        turnId: "turn_snapshot_test",
        turnNumber: 1,
        activePlayerId: "player_snapshot_test",
        startedAt: 1_750_000_000_100,
        deadlineAt: 1_750_000_060_100,
      },
      bagCounts: { consonant: 81, vowel: 47 },
    },
    self: { playerId: "player_snapshot_test", rack: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Playing snapshot fixture must be valid.");
  }

  return result.value;
}

function finishedSnapshot(): FinishedStateSnapshot {
  const result = validateFinishedStateSnapshot({
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 4,
      gameRevision: 1,
      presenceVersion: 4,
    },
    serverTime: 1_750_000_001_000,
    room: {
      roomId: "room_snapshot_test",
      roomCode: "ABC234",
      phase: "FINISHED",
      players: [
        {
          playerId: "player_snapshot_test",
          nickname: "혁상",
          isHost: true,
          connectionStatus: "CONNECTED",
          rackCount: 0,
          initialMeldCompleted: true,
        },
        {
          playerId: "player_snapshot_guest",
          nickname: "참가자",
          isHost: false,
          connectionStatus: "CONNECTED",
          rackCount: 3,
          initialMeldCompleted: false,
        },
      ],
    },
    game: {
      gameId: "game_snapshot_test",
      board: { wordGroups: [] },
      turnOrder: ["player_snapshot_test", "player_snapshot_guest"],
      bagCounts: { consonant: 81, vowel: 47 },
      result: {
        reason: "RACK_EMPTY",
        winnerPlayerId: "player_snapshot_test",
        scores: [
          { playerId: "player_snapshot_test", score: 3 },
          { playerId: "player_snapshot_guest", score: -3 },
        ],
        finishedAt: 1_750_000_001_000,
      },
    },
    self: { playerId: "player_snapshot_test", rack: [] },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Finished snapshot fixture must be valid.");
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

test("LOBBY snapshot에서 canonical PLAYING snapshot으로 전이한다", () => {
  assert.equal(
    decideSnapshotUpdate(snapshot(2, 4), playingSnapshot()),
    "APPLY",
  );
});

test("accepted rack-empty Submit의 canonical FINISHED snapshot을 적용한다", () => {
  assert.equal(
    decideSnapshotUpdate(playingSnapshot(), finishedSnapshot()),
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

test("LOBBY의 Game 부재에서 PLAYING revision 0으로 전이하면 적용한다", () => {
  const current = snapshot(2, 4).versions;
  const incomingResult = validateStateVersions({
    roomRevision: 3,
    gameRevision: 0,
    presenceVersion: 4,
  });

  assert.equal(incomingResult.ok, true);
  if (!incomingResult.ok) {
    throw new Error("State versions fixture must be valid.");
  }

  assert.equal(
    compareStateVersions(current, incomingResult.value),
    "APPLY",
  );
});

test("PLAYING revision에서 Game 부재로 돌아가는 오래된 vector는 무시한다", () => {
  const lobbyVersions = snapshot(2, 4).versions;
  const playingResult = validateStateVersions({
    roomRevision: 3,
    gameRevision: 0,
    presenceVersion: 4,
  });

  assert.equal(playingResult.ok, true);
  if (!playingResult.ok) {
    throw new Error("State versions fixture must be valid.");
  }

  assert.equal(
    compareStateVersions(playingResult.value, lobbyVersions),
    "IGNORE_STALE",
  );
});
