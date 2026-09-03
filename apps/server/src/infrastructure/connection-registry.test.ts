import assert from "node:assert/strict";
import test from "node:test";

import {
  PlayerIdSchema,
  RoomIdSchema,
  type PlayerId,
  type RoomId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  ConnectionRegistry,
  createSocketId,
  type AuthenticatedSocketBinding,
  type ConnectionGeneration,
} from "./connection-registry.js";

function roomId(value: string): RoomId {
  return parse(RoomIdSchema, value);
}

function playerId(value: string): PlayerId {
  return parse(PlayerIdSchema, value);
}

function generationOf(
  binding: AuthenticatedSocketBinding,
): ConnectionGeneration {
  return binding.connectionGeneration;
}

test("새 primary binding은 Player를 CONNECTED로 만들고 presenceVersion을 증가시킨다", () => {
  const registry = new ConnectionRegistry();
  const room = roomId("room-a");
  const player = playerId("player-a");
  const socket = createSocketId("socket-a");

  assert.equal(registry.getPresenceVersion(room), 0);
  assert.equal(registry.getConnectionStatus(room, player), "OFFLINE");

  const result = registry.bindPrimary({ socketId: socket, roomId: room, playerId: player });

  assert.equal(result.binding.connectionGeneration, 1);
  assert.equal(result.replacedBinding, null);
  assert.equal(result.presenceChanged, true);
  assert.equal(result.presenceVersion, 1);
  assert.equal(registry.getConnectionStatus(room, player), "CONNECTED");
  assert.deepEqual(registry.getAuthenticatedBinding(socket), result.binding);
  assert.deepEqual(registry.getPrimaryBinding(room, player), result.binding);
});

test("single-primary replacement는 generation만 증가시키고 이전 socket 권한을 즉시 제거한다", () => {
  const registry = new ConnectionRegistry();
  const room = roomId("room-a");
  const player = playerId("player-a");
  const firstSocket = createSocketId("socket-1");
  const secondSocket = createSocketId("socket-2");
  const first = registry.bindPrimary({
    socketId: firstSocket,
    roomId: room,
    playerId: player,
  });

  const second = registry.bindPrimary({
    socketId: secondSocket,
    roomId: room,
    playerId: player,
  });

  assert.equal(second.binding.connectionGeneration, 2);
  assert.deepEqual(second.replacedBinding, first.binding);
  assert.equal(second.presenceChanged, false);
  assert.equal(second.presenceVersion, first.presenceVersion);
  assert.equal(registry.getAuthenticatedBinding(firstSocket), null);
  assert.deepEqual(registry.getAuthenticatedBinding(secondSocket), second.binding);
  assert.deepEqual(registry.listActiveBindings(room), [second.binding]);
});

test("stale disconnect는 새 primary를 OFFLINE으로 만들거나 version을 증가시키지 않는다", () => {
  const registry = new ConnectionRegistry();
  const room = roomId("room-a");
  const player = playerId("player-a");
  const firstSocket = createSocketId("socket-1");
  const secondSocket = createSocketId("socket-2");
  const first = registry.bindPrimary({
    socketId: firstSocket,
    roomId: room,
    playerId: player,
  });
  const second = registry.bindPrimary({
    socketId: secondSocket,
    roomId: room,
    playerId: player,
  });

  assert.deepEqual(
    registry.disconnect(firstSocket, generationOf(first.binding)),
    { status: "IGNORED" },
  );
  assert.equal(registry.getPresenceVersion(room), 1);
  assert.equal(registry.getConnectionStatus(room, player), "CONNECTED");
  assert.deepEqual(registry.getPrimaryBinding(room, player), second.binding);

  assert.deepEqual(
    registry.disconnect(secondSocket, generationOf(first.binding)),
    { status: "IGNORED" },
  );
  assert.equal(registry.getPresenceVersion(room), 1);
  assert.equal(registry.getConnectionStatus(room, player), "CONNECTED");
});

test("current primary disconnect와 offline resume만 public presence transition을 만든다", () => {
  const registry = new ConnectionRegistry();
  const room = roomId("room-a");
  const player = playerId("player-a");
  const firstSocket = createSocketId("socket-1");
  const first = registry.bindPrimary({
    socketId: firstSocket,
    roomId: room,
    playerId: player,
  });

  const disconnected = registry.disconnect(
    firstSocket,
    generationOf(first.binding),
  );
  assert.equal(disconnected.status, "DISCONNECTED");
  assert.equal(
    disconnected.status === "DISCONNECTED"
      ? disconnected.presenceVersion
      : -1,
    2,
  );
  assert.equal(registry.getConnectionStatus(room, player), "OFFLINE");
  assert.equal(registry.listActiveBindings(room).length, 0);

  const resumed = registry.bindPrimary({
    socketId: createSocketId("socket-2"),
    roomId: room,
    playerId: player,
  });
  assert.equal(resumed.binding.connectionGeneration, 2);
  assert.equal(resumed.presenceChanged, true);
  assert.equal(resumed.presenceVersion, 3);
  assert.equal(registry.getConnectionStatus(room, player), "CONNECTED");
});

test("Room별 presenceVersion과 active fanout binding은 서로 독립적이다", () => {
  const registry = new ConnectionRegistry();
  const roomA = roomId("room-a");
  const roomB = roomId("room-b");
  const first = registry.bindPrimary({
    socketId: createSocketId("socket-a1"),
    roomId: roomA,
    playerId: playerId("player-a1"),
  });
  const second = registry.bindPrimary({
    socketId: createSocketId("socket-a2"),
    roomId: roomA,
    playerId: playerId("player-a2"),
  });
  const otherRoom = registry.bindPrimary({
    socketId: createSocketId("socket-b1"),
    roomId: roomB,
    playerId: playerId("player-b1"),
  });

  assert.equal(registry.getPresenceVersion(roomA), 2);
  assert.equal(registry.getPresenceVersion(roomB), 1);
  assert.deepEqual(registry.listActiveBindings(roomA), [
    first.binding,
    second.binding,
  ]);
  assert.deepEqual(registry.listActiveBindings(roomB), [otherRoom.binding]);
});

test("같은 socketId를 두 Player에 동시에 인증하지 않는다", () => {
  const registry = new ConnectionRegistry();
  const socket = createSocketId("socket-shared");
  registry.bindPrimary({
    socketId: socket,
    roomId: roomId("room-a"),
    playerId: playerId("player-a"),
  });

  assert.throws(
    () =>
      registry.bindPrimary({
        socketId: socket,
        roomId: roomId("room-b"),
        playerId: playerId("player-b"),
      }),
    /already authenticated/u,
  );
  assert.equal(registry.getPresenceVersion(roomId("room-a")), 1);
  assert.equal(registry.getPresenceVersion(roomId("room-b")), 0);
});
