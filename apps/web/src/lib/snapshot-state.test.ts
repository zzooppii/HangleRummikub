import assert from "node:assert/strict";
import test from "node:test";

import {
  PROTOCOL_VERSION,
  type FinishedStateSnapshot,
  type GameFinishedEvent,
  type PlayingStateSnapshot,
  type StateSnapshot,
  type TurnStartedEvent,
  validateGameFinishedEvent,
  validateFinishedStateSnapshot,
  validatePlayingStateSnapshot,
  validateStateSnapshot,
  validateStateVersions,
  validateTurnStartedEvent,
} from "@hangul-rummikub/shared";

import {
  compareStateVersions,
  decideGameFinishedAdvisory,
  decideSnapshotUpdate,
  decideTurnStartedAdvisory,
} from "./snapshot-state.js";

test("NUMBER rematch game scopes accept newer Lobby/new game and reject delayed prior-game snapshots", () => {
  const state = (roomRevision: number, gameRevision: number | null, gameId: string | null, presenceVersion = 5) => {
    const versions = validateStateVersions({ roomRevision, gameRevision, presenceVersion });
    assert.equal(versions.ok, true);
    if (!versions.ok) throw new Error("Invalid test revisions");
    return { versions: versions.value, gameId, room: { roomId: "number-room", gameType: "NUMBER_TILE" }, self: { playerId: "self" } };
  };
  const finished = state(10, 47, "old-game");
  const lobby = state(11, null, null);
  const next = state(12, 0, "new-game");
  assert.equal(decideSnapshotUpdate(finished, lobby), "APPLY");
  assert.equal(decideSnapshotUpdate(lobby, next), "APPLY");
  assert.equal(decideSnapshotUpdate(finished, next), "APPLY");
  assert.equal(decideSnapshotUpdate(next, finished), "IGNORE_STALE");
  assert.equal(decideSnapshotUpdate(next, lobby), "IGNORE_STALE");
  assert.equal(decideSnapshotUpdate(finished, state(10, 0, "unexpected-game")), "REQUEST_SYNC");
  assert.equal(decideSnapshotUpdate(finished, state(11, null, null, 4)), "REQUEST_SYNC");
  assert.equal(decideSnapshotUpdate(finished, state(11, 46, "old-game")), "REQUEST_SYNC");
  assert.equal(decideSnapshotUpdate({ ...finished, room: { ...finished.room, gameType: "GEM_CARD" } },
    { ...lobby, room: { ...lobby.room, gameType: "GEM_CARD" } }), "APPLY");
});

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
          forfeited: false,
        },
        {
          playerId: "player_snapshot_guest",
          nickname: "참가자",
          isHost: false,
          connectionStatus: "CONNECTED",
          rackCount: 14,
          initialMeldCompleted: false,
          forfeited: false,
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
          forfeited: false,
        },
        {
          playerId: "player_snapshot_guest",
          nickname: "참가자",
          isHost: false,
          connectionStatus: "CONNECTED",
          rackCount: 3,
          initialMeldCompleted: false,
          forfeited: false,
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
        winnerPlayerIds: ["player_snapshot_test"],
        rankings: [
          {
            playerId: "player_snapshot_test",
            rank: 1,
            score: 3,
            remainingRackCount: 0,
            penaltyCost: 0,
            forfeited: false,
          },
          {
            playerId: "player_snapshot_guest",
            rank: 2,
            score: -3,
            remainingRackCount: 3,
            penaltyCost: 3,
            forfeited: false,
          },
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

function turnStartedEvent(
  options: Readonly<{
    gameRevision?: number;
    gameId?: string;
    turnId?: string;
  }> = {},
): TurnStartedEvent {
  const result = validateTurnStartedEvent({
    kind: "turn:started",
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 3,
      gameRevision: options.gameRevision ?? 0,
      presenceVersion: 4,
    },
    serverTime: 1_750_000_000_100,
    payload: {
      gameId: options.gameId ?? "game_snapshot_test",
      turnId: options.turnId ?? "turn_snapshot_test",
      turnNumber: 1,
      activePlayerId: "player_snapshot_test",
      deadlineAt: 1_750_000_060_100,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Turn-started fixture must be valid.");
  }
  return result.value;
}

function gameFinishedEvent(
  options: Readonly<{
    gameRevision?: number;
    gameId?: string;
    reason?: "RACK_EMPTY" | "TIME_LIMIT";
  }> = {},
): GameFinishedEvent {
  const reason = options.reason ?? "RACK_EMPTY";
  const result = validateGameFinishedEvent({
    kind: "game:finished",
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 4,
      gameRevision: options.gameRevision ?? 1,
      presenceVersion: 4,
    },
    serverTime: 1_750_000_001_000,
    payload: {
      gameId: options.gameId ?? "game_snapshot_test",
      reason,
      winnerPlayerIds: ["player_snapshot_test"],
      finalGameRevision: options.gameRevision ?? 1,
      finishedAt: 1_750_000_001_000,
    },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Game-finished fixture must be valid.");
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

test("같은 Room identity에서 canonical gameType이 달라지면 silent renderer 전환 대신 sync한다", () => {
  const current = {
    ...snapshot(2, 4),
    room: { ...snapshot(2, 4).room, gameType: "HANGUL_TILE" },
  };
  const incoming = {
    ...snapshot(2, 4),
    room: { ...snapshot(2, 4).room, gameType: "NUMBER_TILE" },
  };

  assert.equal(decideSnapshotUpdate(current, incoming), "REQUEST_SYNC");
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

test("turn:started advisory는 snapshot authority를 덮지 않고 불일치나 새 revision만 sync한다", () => {
  const current = playingSnapshot();

  assert.equal(
    decideTurnStartedAdvisory(current, turnStartedEvent()),
    "IGNORE",
  );
  assert.equal(
    decideTurnStartedAdvisory(
      current,
      turnStartedEvent({ turnId: "turn_conflict" }),
    ),
    "REQUEST_SYNC",
  );
  assert.equal(
    decideTurnStartedAdvisory(
      current,
      turnStartedEvent({ gameRevision: 1, turnId: "turn_next" }),
    ),
    "REQUEST_SYNC",
  );
  assert.equal(
    decideTurnStartedAdvisory(finishedSnapshot(), turnStartedEvent()),
    "IGNORE",
  );
});

test("game:finished advisory는 matching final snapshot을 유지하고 stale/different game event를 무시한다", () => {
  const finished = finishedSnapshot();

  assert.equal(
    decideGameFinishedAdvisory(finished, gameFinishedEvent()),
    "IGNORE",
  );
  assert.equal(
    decideGameFinishedAdvisory(
      finished,
      gameFinishedEvent({ reason: "TIME_LIMIT" }),
    ),
    "REQUEST_SYNC",
  );
  assert.equal(
    decideGameFinishedAdvisory(
      finished,
      gameFinishedEvent({ gameRevision: 0 }),
    ),
    "IGNORE",
  );
  assert.equal(
    decideGameFinishedAdvisory(
      finished,
      gameFinishedEvent({ gameId: "game_stale_delivery" }),
    ),
    "IGNORE",
  );
  assert.equal(
    decideGameFinishedAdvisory(
      playingSnapshot(),
      gameFinishedEvent({ gameRevision: 0 }),
    ),
    "REQUEST_SYNC",
  );
});

test("cross-game snapshots use room revision across lobby, missed transitions and late delivery", () => {
  const state = (gameType: string, roomRevision: number, gameId: string | null, gameRevision: number | null, presenceVersion = 8) => {
    const versions = validateStateVersions({ roomRevision, gameRevision, presenceVersion });
    assert.ok(versions.ok);
    return { versions: versions.value, gameId, room: { roomId: "persistent-room", gameType }, self: { playerId: "self" } };
  };
  for (const type of ["HANGUL_TILE", "NUMBER_TILE", "GEM_CARD", "CITY_ROLE", "HALLI_GALLI", "SPLENDOR", "ISLAND_SETTLERS", "WOLF_NIGHT", "SNEAKY_LUNCH", "DRAW_RELAY"]) {
    const old = state(type, 10, "old", 200), lobby = state("SPLENDOR", 11, null, null), next = state("SPLENDOR", 15, "new", 0);
    assert.equal(decideSnapshotUpdate(old, lobby), "APPLY");
    assert.equal(decideSnapshotUpdate(old, next), "APPLY");
    assert.equal(decideSnapshotUpdate(next, old), "IGNORE_STALE");
    assert.equal(decideSnapshotUpdate(lobby, old), "IGNORE_STALE");
    assert.equal(decideSnapshotUpdate(old, state("SPLENDOR", 10, null, null)), "REQUEST_SYNC");
    assert.equal(decideSnapshotUpdate(old, state("SPLENDOR", 11, null, null, 7)), "REQUEST_SYNC");
    assert.equal(decideSnapshotUpdate(old, state(type, 11, null, null)), "APPLY");
  }
});
