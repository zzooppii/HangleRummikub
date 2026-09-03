import assert from "node:assert/strict";
import test from "node:test";

import {
  PROTOCOL_VERSION,
  validateGameStartCommand,
  validateStateSnapshot,
  type StateSnapshot,
} from "@hangul-rummikub/shared";

import { createRequestId } from "./request-id.js";
import {
  createOrReuseGameStartCommand,
  getGameStartControl,
} from "./game-start.js";

type LobbyPlayerFixture = Readonly<{
  playerId: string;
  nickname: string;
  isHost: boolean;
  connectionStatus: "CONNECTED" | "OFFLINE";
}>;

function lobbySnapshot(
  players: readonly LobbyPlayerFixture[],
  selfPlayerId = "player_host",
): StateSnapshot {
  const result = validateStateSnapshot({
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 3,
      gameRevision: null,
      presenceVersion: 2,
    },
    serverTime: 1_750_000_000_000,
    room: {
      roomId: "room_game_start_test",
      roomCode: "ABC234",
      phase: "LOBBY",
      players,
    },
    self: { playerId: selfPlayerId },
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Lobby snapshot fixture must be valid.");
  }

  return result.value;
}

const connectedPlayers = [
  {
    playerId: "player_host",
    nickname: "방장",
    isHost: true,
    connectionStatus: "CONNECTED",
  },
  {
    playerId: "player_guest",
    nickname: "참가자",
    isHost: false,
    connectionStatus: "CONNECTED",
  },
] as const;

test("Host이고 2~4명 모두 접속했으며 command가 없을 때만 시작할 수 있다", () => {
  const snapshot = lobbySnapshot(connectedPlayers);
  const fourPlayerSnapshot = lobbySnapshot([
    ...connectedPlayers,
    {
      playerId: "player_guest_2",
      nickname: "참가자2",
      isHost: false,
      connectionStatus: "CONNECTED",
    },
    {
      playerId: "player_guest_3",
      nickname: "참가자3",
      isHost: false,
      connectionStatus: "CONNECTED",
    },
  ]);

  assert.deepEqual(getGameStartControl(snapshot, false), {
    isHost: true,
    canStart: true,
    guidance: "지금 게임을 시작할 수 있습니다.",
  });
  assert.equal(getGameStartControl(fourPlayerSnapshot, false).canStart, true);
  assert.equal(getGameStartControl(snapshot, true).canStart, false);
});

test("non-Host에게 actionable 시작 control을 제공하지 않는다", () => {
  const control = getGameStartControl(
    lobbySnapshot(connectedPlayers, "player_guest"),
    false,
  );

  assert.equal(control.isHost, false);
  assert.equal(control.canStart, false);
  assert.equal(control.guidance, "방장이 게임을 시작할 수 있습니다.");
});

test("한 명이라도 OFFLINE이면 Host의 시작 control을 비활성화한다", () => {
  const control = getGameStartControl(
    lobbySnapshot([
      connectedPlayers[0],
      { ...connectedPlayers[1], connectionStatus: "OFFLINE" },
    ]),
    false,
  );

  assert.equal(control.canStart, false);
  assert.equal(
    control.guidance,
    "모든 참가자가 접속 중일 때 시작할 수 있습니다.",
  );
});

test("Host 혼자 있는 Lobby에서는 게임을 시작할 수 없다", () => {
  const control = getGameStartControl(
    lobbySnapshot([connectedPlayers[0]]),
    false,
  );

  assert.equal(control.canStart, false);
  assert.match(control.guidance, /2~4명/u);
});

test("network retry는 같은 command와 requestId를 재사용하고 새 logical command만 새 ID를 만든다", () => {
  let sequence = 0;
  const createId = () =>
    createRequestId(() => {
      sequence += 1;
      return `request-game-start-${sequence}`;
    });
  const snapshot = lobbySnapshot(connectedPlayers);

  const initial = createOrReuseGameStartCommand(
    null,
    snapshot.versions.roomRevision,
    createId,
  );
  const retry = createOrReuseGameStartCommand(
    initial,
    snapshot.versions.roomRevision,
    createId,
  );
  const nextLogicalCommand = createOrReuseGameStartCommand(
    null,
    snapshot.versions.roomRevision,
    createId,
  );

  assert.equal(retry, initial);
  assert.equal(retry.requestId, initial.requestId);
  assert.notEqual(nextLogicalCommand.requestId, initial.requestId);
  assert.equal(sequence, 2);
  assert.equal(validateGameStartCommand(initial).ok, true);
  assert.equal(validateGameStartCommand(nextLogicalCommand).ok, true);
});
