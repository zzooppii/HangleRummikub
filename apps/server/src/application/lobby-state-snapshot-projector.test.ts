import assert from "node:assert/strict";
import test from "node:test";

import {
  NicknameSchema,
  GameRevisionSchema,
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
import { createInitialGameState } from "../domain/game/game-state.js";
import { createTimeLimitResult } from "../domain/game/result-engine.js";
import { JOKER_ALLOWED_SYMBOLS } from "../domain/game/tile-inventory.js";
import {
  createStorageRevision,
  type RoomRecord,
} from "../model/persistence.js";
import { FakeClock, FakeIdGenerator } from "../infrastructure/system.js";

function roomId(value: string): RoomId {
  return parse(RoomIdSchema, value);
}

function playerId(value: string): PlayerId {
  return parse(PlayerIdSchema, value);
}

function roomFixture(): RoomRecord & Readonly<{ hostPlayerId: PlayerId }> {
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
    game: null,
    roomRevision: parse(RoomRevisionSchema, 3),
    storageRevision: createStorageRevision(8),
    createdAt: parse(ServerTimeSchema, 1_000),
    updatedAt: parse(ServerTimeSchema, 2_000),
  };
}

function playingRoomFixture(): RoomRecord & Readonly<{ hostPlayerId: PlayerId }> {
  const lobby = roomFixture();
  return {
    ...lobby,
    phase: "PLAYING",
    game: createInitialGameState({
      playerIds: lobby.players.map((player) => player.playerId),
      startedAt: parse(ServerTimeSchema, 5_000),
      idGenerator: new FakeIdGenerator(),
      randomSource: { nextInt: () => 0 },
    }),
    roomRevision: parse(RoomRevisionSchema, lobby.roomRevision + 1),
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

const LEGACY_HANGUL_FORBIDDEN_INTERNAL_KEYS = new Set([
  "connectionGeneration",
  "consonantBag",
  "createdAt",
  "digestHex",
  "expectedGameRevision",
  "forfeitedPlayerIds",
  "gameDeadlineAt",
  "gameStartedAt",
  "idempotency",
  "joinOrder",
  "noMoveTurnEndPlayerIds",
  "offlineTimeoutStreak",
  "offlineTimeoutStreakByPlayerId",
  "racks",
  "randomSource",
  "rulesConfig",
  "scheduler",
  "sessionToken",
  "socketId",
  "stalemateTracker",
  "storageRevision",
  "tilesById",
  "tokenHash",
  "updatedAt",
  "verificationData",
  "vowelBag",
]);

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

test("PLAYING projection은 public Game과 각 self의 private rack만 분리한다", async () => {
  const room = playingRoomFixture();
  const guest = room.players[1];
  assert.ok(guest);
  const presenceReader: RoomPresenceReadPort = {
    readRoomPresence: async () => ({
      presenceVersion: parse(PresenceVersionSchema, 4),
      connectionStatusByPlayerId: new Map(
        room.players.map((player) => [player.playerId, "CONNECTED"] as const),
      ),
    }),
  };
  const projector = new LobbyStateSnapshotProjector({
    clock: new FakeClock(9_000),
    presenceReader,
  });

  const hostSnapshot = await projector.project({
    room,
    selfPlayerId: room.hostPlayerId,
  });
  const guestSnapshot = await projector.project({
    room,
    selfPlayerId: guest.playerId,
  });
  assert.equal("game" in hostSnapshot, true);
  assert.equal("game" in guestSnapshot, true);
  if (!("game" in hostSnapshot) || !("game" in guestSnapshot)) {
    throw new Error("Expected PLAYING snapshots.");
  }

  assert.equal(hostSnapshot.versions.gameRevision, 0);
  assert.equal(hostSnapshot.self.rack.length, 14);
  assert.equal(guestSnapshot.self.rack.length, 14);
  assert.deepEqual(hostSnapshot.game, guestSnapshot.game);
  assert.deepEqual(
    hostSnapshot.room.players.map((player) => ({
      rackCount: player.rackCount,
      initialMeldCompleted: player.initialMeldCompleted,
    })),
    [
      { rackCount: 14, initialMeldCompleted: false },
      { rackCount: 14, initialMeldCompleted: false },
    ],
  );
  assert.deepEqual(hostSnapshot.game.bagCounts, {
    consonant: 81,
    vowel: 47,
  });

  const hostRackIds = new Set(
    hostSnapshot.self.rack.map((tile) => tile.tileId),
  );
  const guestRackIds = new Set(
    guestSnapshot.self.rack.map((tile) => tile.tileId),
  );
  assert.equal(
    [...hostRackIds].some((tileId) => guestRackIds.has(tileId)),
    false,
  );
  assert.equal(validateStateSnapshot(hostSnapshot).ok, true);
  assert.equal(validateStateSnapshot(guestSnapshot).ok, true);
});

test("Legacy Hangul v1 PLAYING projection은 exact shape와 A/B rack·bag privacy를 유지한다", async () => {
  const room = playingRoomFixture();
  const game = room.game;
  const guest = room.players[1];
  if (game === null || guest === undefined) {
    throw new Error("PLAYING privacy fixture requires a Game and Guest.");
  }
  const projector = new LobbyStateSnapshotProjector({
    clock: new FakeClock(9_000),
    presenceReader: {
      readRoomPresence: async () => ({
        presenceVersion: parse(PresenceVersionSchema, 4),
        connectionStatusByPlayerId: new Map(
          room.players.map((player) => [player.playerId, "CONNECTED"] as const),
        ),
      }),
    },
  });

  const hostSnapshot = await projector.project({
    room,
    selfPlayerId: room.hostPlayerId,
  });
  const guestSnapshot = await projector.project({
    room,
    selfPlayerId: guest.playerId,
  });
  if (
    hostSnapshot.room.phase !== "PLAYING" ||
    !("game" in hostSnapshot) ||
    guestSnapshot.room.phase !== "PLAYING" ||
    !("game" in guestSnapshot)
  ) {
    throw new Error("Expected two PLAYING snapshots.");
  }

  assert.deepEqual(Object.keys(hostSnapshot).sort(), [
    "game",
    "protocolVersion",
    "room",
    "self",
    "serverTime",
    "versions",
  ]);
  assert.deepEqual(Object.keys(hostSnapshot.versions).sort(), [
    "gameRevision",
    "presenceVersion",
    "roomRevision",
  ]);
  assert.deepEqual(Object.keys(hostSnapshot.room).sort(), [
    "phase",
    "players",
    "roomCode",
    "roomId",
  ]);
  assert.deepEqual(Object.keys(hostSnapshot.room.players[0] ?? {}).sort(), [
    "connectionStatus",
    "forfeited",
    "initialMeldCompleted",
    "isHost",
    "nickname",
    "playerId",
    "rackCount",
  ]);
  assert.deepEqual(Object.keys(hostSnapshot.game).sort(), [
    "bagCounts",
    "board",
    "gameId",
    "turn",
    "turnOrder",
  ]);
  assert.deepEqual(Object.keys(hostSnapshot.self).sort(), ["playerId", "rack"]);

  const hostWire = JSON.stringify(hostSnapshot);
  const guestWire = JSON.stringify(guestSnapshot);
  const hostRack = game.racks.get(room.hostPlayerId);
  const guestRack = game.racks.get(guest.playerId);
  if (hostRack === undefined || guestRack === undefined) {
    throw new Error("PLAYING privacy fixture requires both canonical racks.");
  }
  assert.deepEqual(
    hostSnapshot.self.rack.map((tile) => tile.tileId),
    hostRack,
  );
  assert.deepEqual(
    guestSnapshot.self.rack.map((tile) => tile.tileId),
    guestRack,
  );
  for (const tileId of guestRack) {
    assert.equal(hostWire.includes(`"${tileId}"`), false, `guest rack Tile leaked: ${tileId}`);
  }
  for (const tileId of hostRack) {
    assert.equal(guestWire.includes(`"${tileId}"`), false, `host rack Tile leaked: ${tileId}`);
  }
  for (const tileId of [...game.consonantBag, ...game.vowelBag]) {
    assert.equal(hostWire.includes(`"${tileId}"`), false, `bag Tile leaked to Host: ${tileId}`);
    assert.equal(guestWire.includes(`"${tileId}"`), false, `bag Tile leaked to Guest: ${tileId}`);
  }

  for (const snapshot of [hostSnapshot, guestSnapshot]) {
    for (const key of collectKeys(snapshot)) {
      assert.equal(
        LEGACY_HANGUL_FORBIDDEN_INTERNAL_KEYS.has(key),
        false,
        `forbidden key: ${key}`,
      );
    }
    assert.equal(validateStateSnapshot(snapshot).ok, true);
  }
});

test("PLAYING projection은 Board Tile 편집 metadata만 public으로 투영한다", async () => {
  const room = playingRoomFixture();
  const game = room.game;
  if (game === null) {
    throw new Error("PLAYING fixture requires a GameState.");
  }

  const ordinaryConsonant = [...game.tilesById.values()].find(
    (tile) =>
      tile.kind === "ORDINARY" && tile.allowedSymbols.includes("ㄱ"),
  );
  const ordinaryVowel = [...game.tilesById.values()].find(
    (tile) =>
      tile.kind === "ORDINARY" && tile.allowedSymbols.includes("ㅏ"),
  );
  const jokers = [...game.tilesById.values()].filter(
    (tile) => tile.kind === "JOKER",
  );
  const boardJoker = jokers[0];
  const privateRackJoker = jokers[1];
  if (
    ordinaryConsonant === undefined ||
    ordinaryConsonant.kind !== "ORDINARY" ||
    ordinaryVowel === undefined ||
    ordinaryVowel.kind !== "ORDINARY" ||
    boardJoker === undefined ||
    boardJoker.kind !== "JOKER" ||
    privateRackJoker === undefined ||
    privateRackJoker.kind !== "JOKER"
  ) {
    throw new Error("Board projection fixture Tiles are required.");
  }
  const hostRack = game.racks.get(room.hostPlayerId);
  if (hostRack === undefined || hostRack.length === 0) {
    throw new Error("Host rack fixture is required.");
  }
  const publicBoardTileIds = new Set([
    ordinaryConsonant.tileId,
    ordinaryVowel.tileId,
    boardJoker.tileId,
  ]);
  const racksWithJoker = new Map(
    [...game.racks].map(([playerId, rack]) => [
      playerId,
      rack.filter(
        (tileId) =>
          !publicBoardTileIds.has(tileId) && tileId !== privateRackJoker.tileId,
      ),
    ]),
  );
  const hostRackWithoutBoard = racksWithJoker.get(room.hostPlayerId);
  if (hostRackWithoutBoard === undefined) {
    throw new Error("Host rack fixture is required.");
  }
  racksWithJoker.set(room.hostPlayerId, [
    privateRackJoker.tileId,
    ...hostRackWithoutBoard.slice(0, hostRack.length - 1),
  ]);

  const roomWithBoard: RoomRecord = {
    ...room,
    game: {
      ...game,
      racks: racksWithJoker,
      board: {
        wordGroups: [
          {
            groupId: "group-public-metadata",
            syllables: [
              {
                choseong: [
                  { tileId: ordinaryConsonant.tileId, assignedSymbol: "ㄱ" },
                ],
                jungseong: [
                  { tileId: ordinaryVowel.tileId, assignedSymbol: "ㅏ" },
                ],
                jongseong: [
                  { tileId: boardJoker.tileId, assignedSymbol: "ㄴ" },
                ],
              },
            ],
          },
        ],
      },
    },
  };
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
    room: roomWithBoard,
    selfPlayerId: room.hostPlayerId,
  });
  if (!("game" in snapshot)) {
    throw new Error("Expected a PLAYING snapshot.");
  }

  const syllable = snapshot.game.board.wordGroups[0]?.syllables[0];
  assert.ok(syllable);
  assert.deepEqual(syllable.choseong[0], {
    tileId: ordinaryConsonant.tileId,
    kind: "ORDINARY",
    physicalType: ordinaryConsonant.physicalType,
    assignedSymbol: "ㄱ",
    allowedSymbols: [...ordinaryConsonant.allowedSymbols],
  });
  assert.deepEqual(syllable.jongseong[0], {
    tileId: boardJoker.tileId,
    kind: "JOKER",
    physicalType: "JOKER",
    assignedSymbol: "ㄴ",
    allowedSymbols: [...JOKER_ALLOWED_SYMBOLS],
  });
  assert.deepEqual(snapshot.self.rack[0], {
    tileId: privateRackJoker.tileId,
    kind: "JOKER",
    physicalType: "JOKER",
    sourceBag: privateRackJoker.sourceBag,
    allowedSymbols: [...JOKER_ALLOWED_SYMBOLS],
  });

  const boardForbidden = new Set([
    "sourceBag",
    "rackOwner",
    "ownerPlayerId",
    "tilesById",
    "consonantBag",
    "vowelBag",
  ]);
  for (const key of collectKeys(snapshot.game.board)) {
    assert.equal(boardForbidden.has(key), false, `forbidden Board key: ${key}`);
  }
});

test("PLAYING snapshot은 bag 순서, 다른 rack, canonical private field를 노출하지 않는다", async () => {
  const room = playingRoomFixture();
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
    "consonantBag",
    "vowelBag",
    "tilesById",
    "racks",
    "storageRevision",
    "sessionToken",
    "verificationData",
    "tokenHash",
    "socketId",
    "connectionGeneration",
    "idempotency",
    "randomSource",
  ]);

  for (const key of collectKeys(snapshot)) {
    assert.equal(forbidden.has(key), false, `forbidden key: ${key}`);
  }
});

test("FINISHED projection은 일반화된 ranking을 공개하고 상대 rack detail은 숨긴다", async () => {
  const playingRoom = playingRoomFixture();
  const game = playingRoom.game;
  const guest = playingRoom.players[1];
  if (game === null || game.turn === null || guest === undefined) {
    throw new Error("FINISHED projection fixture requires an active Game.");
  }
  const finishedAt = parse(ServerTimeSchema, game.gameDeadlineAt);
  const result = createTimeLimitResult({
    playerIds: game.turnOrder,
    racks: game.racks,
    tilesById: game.tilesById,
    forfeitedPlayerIds: game.forfeitedPlayerIds,
    finishedAt,
  });
  const finishedRoom: RoomRecord = {
    ...playingRoom,
    phase: "FINISHED",
    game: {
      ...game,
      gameRevision: parse(GameRevisionSchema, game.gameRevision + 1),
      turn: null,
      result,
    },
    roomRevision: parse(RoomRevisionSchema, playingRoom.roomRevision + 1),
  };
  const projector = new LobbyStateSnapshotProjector({
    clock: new FakeClock(finishedAt),
    presenceReader: {
      readRoomPresence: async () => ({
        presenceVersion: parse(PresenceVersionSchema, 5),
        connectionStatusByPlayerId: new Map(
          finishedRoom.players.map(
            (player) => [player.playerId, "CONNECTED"] as const,
          ),
        ),
      }),
    },
  });

  const hostSnapshot = await projector.project({
    room: finishedRoom,
    selfPlayerId: finishedRoom.hostPlayerId ?? finishedRoom.players[0]!.playerId,
  });
  const guestSnapshot = await projector.project({
    room: finishedRoom,
    selfPlayerId: guest.playerId,
  });
  assert.equal(hostSnapshot.room.phase, "FINISHED");
  assert.equal(guestSnapshot.room.phase, "FINISHED");
  if (
    !("game" in hostSnapshot) ||
    !("game" in guestSnapshot) ||
    !("result" in hostSnapshot.game) ||
    !("result" in guestSnapshot.game)
  ) {
    throw new Error("Expected FINISHED snapshots.");
  }

  assert.deepEqual(hostSnapshot.game.result, result);
  assert.deepEqual(hostSnapshot.game, guestSnapshot.game);
  assert.equal(validateStateSnapshot(hostSnapshot).ok, true);
  assert.equal(validateStateSnapshot(guestSnapshot).ok, true);

  const hostRack = game.racks.get(playingRoom.hostPlayerId);
  const guestRack = game.racks.get(guest.playerId);
  if (hostRack === undefined || guestRack === undefined) {
    throw new Error("FINISHED privacy fixture requires both canonical racks.");
  }
  assert.deepEqual(
    hostSnapshot.self.rack.map((tile) => tile.tileId),
    hostRack,
  );
  assert.deepEqual(
    guestSnapshot.self.rack.map((tile) => tile.tileId),
    guestRack,
  );
  const hostWire = JSON.stringify(hostSnapshot);
  const guestWire = JSON.stringify(guestSnapshot);
  for (const tileId of guestRack) {
    assert.equal(
      hostWire.includes(`"${tileId}"`),
      false,
      `guest rack Tile leaked: ${tileId}`,
    );
  }
  for (const tileId of hostRack) {
    assert.equal(
      guestWire.includes(`"${tileId}"`),
      false,
      `host rack Tile leaked: ${tileId}`,
    );
  }
  for (const snapshot of [hostSnapshot, guestSnapshot]) {
    for (const key of collectKeys(snapshot)) {
      assert.equal(
        LEGACY_HANGUL_FORBIDDEN_INTERNAL_KEYS.has(key),
        false,
        `forbidden key: ${key}`,
      );
    }
  }
  for (const forbidden of [
    "tileId",
    "physicalType",
    "allowedSymbols",
    "sourceBag",
    "offlineTimeoutStreak",
    "storageRevision",
  ]) {
    assert.equal(
      collectKeys(hostSnapshot.game.result).includes(forbidden),
      false,
      `forbidden result key: ${forbidden}`,
    );
  }
});
