import assert from "node:assert/strict";
import test from "node:test";

import {
  NicknameSchema,
  PlayerIdSchema,
  PresenceVersionSchema,
  PROTOCOL_VERSION,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  validateStateSnapshot,
  type ConnectionStatus,
  type PlayerId,
  type RoomId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  LobbyStateSnapshotProjector,
  type RoomPresenceReadPort,
} from "./lobby-state-snapshot-projector.js";
import {
  createStorageRevision,
  type RoomRecord,
} from "../model/persistence.js";
import { FakeClock } from "../infrastructure/system.js";

function roomId(value: string): RoomId {
  return parse(RoomIdSchema, value);
}

function playerId(value: string): PlayerId {
  return parse(PlayerIdSchema, value);
}

function roomFixture(): RoomRecord {
  const hostId = playerId("player-host");
  const guestId = playerId("player-guest");
  return {
    roomId: roomId("room-snapshot"),
    roomCode: parse(RoomCodeSchema, "ABCDEF"),
    phase: "LOBBY",
    hostPlayerId: hostId,
    players: [
      {
        playerId: hostId,
        nickname: parse(NicknameSchema, "Host"),
        joinOrder: 0,
      },
      {
        playerId: guestId,
        nickname: parse(NicknameSchema, "Guest"),
        joinOrder: 1,
      },
    ],
    roomRevision: parse(RoomRevisionSchema, 3),
    storageRevision: createStorageRevision(8),
    createdAt: parse(ServerTimeSchema, 1_000),
    updatedAt: parse(ServerTimeSchema, 2_000),
  };
}

function collectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectKeys);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.keys(value).flatMap((key) => [
    key,
    ...collectKeys(Reflect.get(value, key)),
  ]);
}

test("Lobby projector는 ordered player-specific StateSnapshot을 만든다", async () => {
  const room = roomFixture();
  const hostId = room.hostPlayerId;
  const guest = room.players[1];
  if (guest === undefined) {
    throw new Error("Guest fixture is required.");
  }
  let requestedRoomId: RoomId | undefined;
  const statuses = new Map<PlayerId, ConnectionStatus>([
    [hostId, "CONNECTED"],
    [guest.playerId, "OFFLINE"],
  ]);
  const presenceReader: RoomPresenceReadPort = {
    readRoomPresence: async (requested) => {
      requestedRoomId = requested;
      return {
        presenceVersion: parse(PresenceVersionSchema, 7),
        connectionStatusByPlayerId: statuses,
      };
    },
  };
  const projector = new LobbyStateSnapshotProjector({
    clock: new FakeClock(9_000),
    presenceReader,
  });

  const snapshot = await projector.project({
    room,
    selfPlayerId: guest.playerId,
  });

  assert.equal(requestedRoomId, room.roomId);
  assert.equal(snapshot.protocolVersion, PROTOCOL_VERSION);
  assert.deepEqual(snapshot.versions, {
    roomRevision: room.roomRevision,
    gameRevision: null,
    presenceVersion: 7,
  });
  assert.equal(snapshot.serverTime, 9_000);
  assert.deepEqual(snapshot.room, {
    roomId: room.roomId,
    roomCode: room.roomCode,
    phase: "LOBBY",
    players: [
      {
        playerId: hostId,
        nickname: "Host",
        isHost: true,
        connectionStatus: "CONNECTED",
      },
      {
        playerId: guest.playerId,
        nickname: "Guest",
        isHost: false,
        connectionStatus: "OFFLINE",
      },
    ],
  });
  assert.deepEqual(snapshot.self, { playerId: guest.playerId });
  assert.equal(validateStateSnapshot(snapshot).ok, true);
});

test("Lobby projector는 누락된 presence를 OFFLINE으로 처리한다", async () => {
  const room = roomFixture();
  const projector = new LobbyStateSnapshotProjector({
    clock: new FakeClock(9_000),
    presenceReader: {
      readRoomPresence: async () => ({
        presenceVersion: parse(PresenceVersionSchema, 0),
        connectionStatusByPlayerId: new Map(),
      }),
    },
  });

  const snapshot = await projector.project({
    room,
    selfPlayerId: room.hostPlayerId,
  });
  assert.deepEqual(
    snapshot.room.players.map((player) => player.connectionStatus),
    ["OFFLINE", "OFFLINE"],
  );
});

test("Lobby snapshot은 canonical server-private 및 credential field를 노출하지 않는다", async () => {
  const room = roomFixture();
  const projector = new LobbyStateSnapshotProjector({
    clock: new FakeClock(9_000),
    presenceReader: {
      readRoomPresence: async () => ({
        presenceVersion: parse(PresenceVersionSchema, 1),
        connectionStatusByPlayerId: new Map(),
      }),
    },
  });
  const snapshot = await projector.project({
    room,
    selfPlayerId: room.hostPlayerId,
  });
  const forbidden = new Set([
    "storageRevision",
    "createdAt",
    "updatedAt",
    "joinOrder",
    "sessionToken",
    "tokenHash",
    "digestHex",
    "verificationData",
    "socketId",
    "connectionGeneration",
  ]);

  for (const key of collectKeys(snapshot)) {
    assert.equal(forbidden.has(key), false, `forbidden key: ${key}`);
  }
});

test("Lobby projector는 Room에 없는 self Player projection을 거절한다", async () => {
  const room = roomFixture();
  let presenceRead = false;
  const projector = new LobbyStateSnapshotProjector({
    clock: new FakeClock(9_000),
    presenceReader: {
      readRoomPresence: async () => {
        presenceRead = true;
        return {
          presenceVersion: parse(PresenceVersionSchema, 0),
          connectionStatusByPlayerId: new Map(),
        };
      },
    },
  });

  await assert.rejects(
    projector.project({
      room,
      selfPlayerId: playerId("player-outsider"),
    }),
    /not present/u,
  );
  assert.equal(presenceRead, false);
});

