import assert from "node:assert/strict";
import test from "node:test";

import { PROTOCOL_VERSION } from "@hangul-rummikub/shared";

import { resolveLegacyHangulRoomView } from "./legacy-hangul-room-view.js";

const PLAYER_A = "player_legacy_view_a";
const PLAYER_B = "player_legacy_view_b";

function lobbySnapshot(): Record<string, unknown> {
  return {
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 1,
      gameRevision: null,
      presenceVersion: 2,
    },
    serverTime: 1_750_000_000_000,
    room: {
      roomId: "room_legacy_view",
      roomCode: "ABC234",
      phase: "LOBBY",
      players: [
        {
          playerId: PLAYER_A,
          nickname: "혁상",
          isHost: true,
          connectionStatus: "CONNECTED",
        },
      ],
    },
    self: { playerId: PLAYER_A },
  };
}

function playingSnapshot(): unknown {
  return {
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 2,
      gameRevision: 0,
      presenceVersion: 2,
    },
    serverTime: 1_750_000_000_100,
    room: {
      roomId: "room_legacy_view",
      roomCode: "ABC234",
      phase: "PLAYING",
      players: [
        {
          playerId: PLAYER_A,
          nickname: "혁상",
          isHost: true,
          connectionStatus: "CONNECTED",
          rackCount: 0,
          initialMeldCompleted: false,
          forfeited: false,
        },
        {
          playerId: PLAYER_B,
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
      gameId: "game_legacy_view",
      board: { wordGroups: [] },
      turnOrder: [PLAYER_A, PLAYER_B],
      turn: {
        turnId: "turn_legacy_view",
        turnNumber: 1,
        activePlayerId: PLAYER_A,
        startedAt: 1_750_000_000_100,
        deadlineAt: 1_750_000_060_100,
      },
      bagCounts: { consonant: 81, vowel: 47 },
    },
    self: { playerId: PLAYER_A, rack: [] },
  };
}

function finishedSnapshot(): unknown {
  return {
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 3,
      gameRevision: 1,
      presenceVersion: 2,
    },
    serverTime: 1_750_000_001_000,
    room: {
      roomId: "room_legacy_view",
      roomCode: "ABC234",
      phase: "FINISHED",
      players: [
        {
          playerId: PLAYER_A,
          nickname: "혁상",
          isHost: true,
          connectionStatus: "CONNECTED",
          rackCount: 0,
          initialMeldCompleted: true,
          forfeited: false,
        },
        {
          playerId: PLAYER_B,
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
      gameId: "game_legacy_view",
      board: { wordGroups: [] },
      turnOrder: [PLAYER_A, PLAYER_B],
      bagCounts: { consonant: 81, vowel: 47 },
      result: {
        reason: "RACK_EMPTY",
        winnerPlayerIds: [PLAYER_A],
        rankings: [
          {
            playerId: PLAYER_A,
            rank: 1,
            score: 3,
            remainingRackCount: 0,
            penaltyCost: 0,
            forfeited: false,
          },
          {
            playerId: PLAYER_B,
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
    self: { playerId: PLAYER_A, rack: [] },
  };
}

test("legacy v1 LOBBY snapshot은 Lobby renderer를 선택한다", () => {
  assert.deepEqual(resolveLegacyHangulRoomView(lobbySnapshot()), {
    kind: "LOBBY",
  });
});

test("legacy v1 PLAYING snapshot은 validated Hangul Playing renderer를 선택한다", () => {
  const input = playingSnapshot();
  const result = resolveLegacyHangulRoomView(input);

  assert.equal(result.kind, "PLAYING");
  if (result.kind === "PLAYING") {
    assert.equal(result.snapshot.room.phase, "PLAYING");
    assert.equal(result.snapshot.game.turn.turnId, "turn_legacy_view");
  }
});

test("legacy v1 FINISHED snapshot은 validated Hangul Finished renderer를 선택한다", () => {
  const result = resolveLegacyHangulRoomView(finishedSnapshot());

  assert.equal(result.kind, "FINISHED");
  if (result.kind === "FINISHED") {
    assert.equal(result.snapshot.room.phase, "FINISHED");
    assert.equal(result.snapshot.game.result.reason, "RACK_EMPTY");
  }
});

test("Hangul PLAYING/FINISHED validator와 맞지 않는 입력은 현재 동작대로 Lobby로 fallback한다", () => {
  const malformedPlaying = {
    ...lobbySnapshot(),
    room: {
      roomId: "room_legacy_view",
      roomCode: "ABC234",
      phase: "PLAYING",
      players: [],
    },
  };
  const malformedFinished = {
    ...lobbySnapshot(),
    room: {
      roomId: "room_legacy_view",
      roomCode: "ABC234",
      phase: "FINISHED",
      players: [],
    },
  };

  for (const malformedSnapshot of [malformedPlaying, malformedFinished]) {
    assert.deepEqual(resolveLegacyHangulRoomView(malformedSnapshot), {
      kind: "LOBBY",
    });
  }
});
