import { projectGemCardV2Game } from "../games/gem-card/compatibility/gem-card-v2-game-projector.js";
import assert from "node:assert/strict";
import test from "node:test";

import {
  NicknameSchema,
  PLATFORM_SNAPSHOT_VERSION,
  PlayerIdSchema,
  PresenceVersionSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  type PlayerId,
  type RoomId,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import { projectLegacyHangulV1Game } from "../games/hangul-tile/compatibility/legacy-hangul-v1-game-projector.js";
import { projectNumberTileV2Game } from "../games/number-tile/compatibility/number-tile-v2-game-projector.js";
import {
  createInitialNumberTileGameState,
  type FinishedNumberTileGameState,
  type PlayingNumberTileGameState,
} from "../games/number-tile/domain/game-state.js";
import { createNumberTileLastPlayerStandingResult } from "../games/number-tile/domain/result-engine.js";
import { createNumberTileReadonlyPlayerSet } from "../games/number-tile/domain/stalemate.js";
import { FakeClock, FakeIdGenerator } from "../infrastructure/system.js";
import {
  createStorageRevision,
  type HangulRoomRecord,
  type NumberTileRoomRecord,
} from "../model/persistence.js";
import type { PlayerPresenceReader } from "../ports/player-presence-reader.js";
import type { RandomSource } from "../ports/system.js";
import { LobbyStateSnapshotProjector } from "./lobby-state-snapshot-projector.js";
import { PlatformSnapshotV2Projector } from "./platform-snapshot-v2-projector.js";

class ZeroRandomSource implements RandomSource {
  nextInt(): number {
    return 0;
  }
}

function playerId(value: string): PlayerId {
  return v.parse(PlayerIdSchema, value);
}

function roomId(value: string): RoomId {
  return v.parse(RoomIdSchema, value);
}

const playerA = playerId("platform-number-a");
const playerB = playerId("platform-number-b");
const players = Object.freeze([
  Object.freeze({
    playerId: playerA,
    nickname: v.parse(NicknameSchema, "NumberA"),
    joinOrder: 0,
  }),
  Object.freeze({
    playerId: playerB,
    nickname: v.parse(NicknameSchema, "NumberB"),
    joinOrder: 1,
  }),
]);

function createPresenceReader(): PlayerPresenceReader {
  return {
    readRoomPresence: async () => ({
      presenceVersion: v.parse(PresenceVersionSchema, 7),
      connectionStatusByPlayerId: new Map([
        [playerA, "CONNECTED"],
        [playerB, "OFFLINE"],
      ]),
    }),
  };
}

function createProjectors() {
  const clock = new FakeClock(50_000);
  const presenceReader = createPresenceReader();
  const legacyHangulSnapshotProjector = new LobbyStateSnapshotProjector({
    clock,
    presenceReader,
    legacyHangulV1GameProjector: projectLegacyHangulV1Game,
  });
  return {
    legacyHangulSnapshotProjector,
    platform: new PlatformSnapshotV2Projector({
    gemCardGameProjector: projectGemCardV2Game,
      clock,
      presenceReader,
      legacyHangulSnapshotProjector,
      numberTileGameProjector: projectNumberTileV2Game,
    }),
  };
}

function createNumberGame(): PlayingNumberTileGameState {
  return createInitialNumberTileGameState({
    playerIds: [playerA, playerB],
    idGenerator: new FakeIdGenerator(),
    randomSource: new ZeroRandomSource(),
    clock: new FakeClock(10_000),
  });
}

function createNumberRoom(
  phase: "LOBBY",
  game: null,
): NumberTileRoomRecord;
function createNumberRoom(
  phase: "PLAYING",
  game: PlayingNumberTileGameState,
): NumberTileRoomRecord;
function createNumberRoom(
  phase: "FINISHED",
  game: FinishedNumberTileGameState,
): NumberTileRoomRecord;
function createNumberRoom(
  phase: "LOBBY" | "PLAYING" | "FINISHED",
  game: PlayingNumberTileGameState | FinishedNumberTileGameState | null,
): NumberTileRoomRecord {
  return Object.freeze({
    roomId: roomId("platform-number-room"),
    roomCode: v.parse(RoomCodeSchema, "BCDFGH"),
    gameType: "NUMBER_TILE",
    phase,
    hostPlayerId: playerA,
    players,
    game,
    roomRevision: v.parse(RoomRevisionSchema, 3),
    storageRevision: createStorageRevision(4),
    createdAt: v.parse(ServerTimeSchema, 1_000),
    updatedAt: v.parse(ServerTimeSchema, 2_000),
  });
}

function createFinishedNumberGame(
  game: PlayingNumberTileGameState,
): FinishedNumberTileGameState {
  const forfeitedPlayerIds = createNumberTileReadonlyPlayerSet([playerB]);
  const result = createNumberTileLastPlayerStandingResult({
    playerIds: game.turnOrder,
    racks: game.racks,
    tilesById: game.tilesById,
    forfeitedPlayerIds,
    finishedAt: v.parse(ServerTimeSchema, 20_000),
  });
  return Object.freeze({
    ...game,
    forfeitedPlayerIds,
    turn: null,
    result,
  });
}

function collectKeys(value: object): ReadonlySet<string> {
  const keys = new Set<string>();
  const visit = (current: object): void => {
    for (const [key, nested] of Object.entries(current)) {
      keys.add(key);
      if (nested !== null && typeof nested === "object") {
        visit(nested);
      }
    }
  };
  visit(value);
  return keys;
}

test("PlatformSnapshotV2 projects a Number Tile LOBBY shell without a game payload", async () => {
  const { platform } = createProjectors();
  const snapshot = await platform.project({
    room: createNumberRoom("LOBBY", null),
    selfPlayerId: playerA,
  });

  assert.equal(snapshot.snapshotVersion, PLATFORM_SNAPSHOT_VERSION);
  assert.deepEqual(snapshot.versions, {
    roomRevision: 3,
    presenceVersion: 7,
  });
  assert.equal(snapshot.room.gameType, "NUMBER_TILE");
  assert.equal(snapshot.room.phase, "LOBBY");
  assert.deepEqual(snapshot.room.players.map((player) => player.connectionStatus), [
    "CONNECTED",
    "OFFLINE",
  ]);
  assert.equal(snapshot.game, null);
  assert.deepEqual(snapshot.self, { playerId: playerA });
});

test("PlatformSnapshotV2 projects Number PLAYING A/B views with strict rack privacy", async () => {
  const { platform } = createProjectors();
  const game = createNumberGame();
  const room = createNumberRoom("PLAYING", game);
  const snapshotA = await platform.project({ room, selfPlayerId: playerA });
  const snapshotB = await platform.project({ room, selfPlayerId: playerB });

  if (
    snapshotA.game?.gameType !== "NUMBER_TILE" ||
    snapshotB.game?.gameType !== "NUMBER_TILE" ||
    !("turn" in snapshotA.game) ||
    !("turn" in snapshotB.game)
  ) {
    throw new Error("Expected two Number Tile PLAYING projections.");
  }

  const rackA = game.racks.get(playerA);
  const rackB = game.racks.get(playerB);
  assert.ok(rackA && rackB);
  assert.deepEqual(
    snapshotA.game.privateState.rack.map((tile) => tile.tileId),
    rackA,
  );
  assert.deepEqual(
    snapshotB.game.privateState.rack.map((tile) => tile.tileId),
    rackB,
  );
  assert.deepEqual(
    snapshotA.game.playerStates.map((state) => state.rackCount),
    [rackA.length, rackB.length],
  );

  const serializedA = JSON.stringify(snapshotA);
  const serializedB = JSON.stringify(snapshotB);
  for (const tileId of rackB) {
    assert.equal(serializedA.includes(tileId), false);
  }
  for (const tileId of rackA) {
    assert.equal(serializedB.includes(tileId), false);
  }
  const forbiddenKeys = [
    "tilesById",
    "pool",
    "offlineTimeoutStreakByPlayerId",
    "noPlayPlayerIds",
    "storageRevision",
    "sessionToken",
    "verificationData",
    "socketId",
    "idempotency",
  ];
  const keysA = collectKeys(snapshotA);
  for (const key of forbiddenKeys) {
    assert.equal(keysA.has(key), false, key);
  }
});

test("PlatformSnapshotV2 keeps Number FINISHED opponent rack details private", async () => {
  const { platform } = createProjectors();
  const playing = createNumberGame();
  const finished = createFinishedNumberGame(playing);
  const room = createNumberRoom("FINISHED", finished);
  const snapshotA = await platform.project({ room, selfPlayerId: playerA });
  const snapshotB = await platform.project({ room, selfPlayerId: playerB });

  if (
    snapshotA.game?.gameType !== "NUMBER_TILE" ||
    snapshotB.game?.gameType !== "NUMBER_TILE" ||
    !("result" in snapshotA.game) ||
    !("result" in snapshotB.game)
  ) {
    throw new Error("Expected two Number Tile FINISHED projections.");
  }
  assert.equal(snapshotA.game.result.reason, "LAST_PLAYER_STANDING");
  assert.deepEqual(snapshotA.game.result, snapshotB.game.result);
  for (const tileId of finished.racks.get(playerB) ?? []) {
    assert.equal(JSON.stringify(snapshotA).includes(tileId), false);
  }
  for (const tileId of finished.racks.get(playerA) ?? []) {
    assert.equal(JSON.stringify(snapshotB).includes(tileId), false);
  }
});

test("Number Tile has no legacy V1 projection path", async () => {
  const { legacyHangulSnapshotProjector } = createProjectors();
  const room = createNumberRoom("PLAYING", createNumberGame());

  await assert.rejects(
    legacyHangulSnapshotProjector.project({ room, selfPlayerId: playerA }),
    /Unsupported Room gameType for Legacy Hangul v1 projection\./u,
  );
});

test("the unified projector preserves the existing Hangul V2 LOBBY mapping", async () => {
  const { platform } = createProjectors();
  const room: HangulRoomRecord = Object.freeze({
    roomId: roomId("platform-hangul-room"),
    roomCode: v.parse(RoomCodeSchema, "CDFGHJ"),
    gameType: "HANGUL_TILE",
    phase: "LOBBY",
    hostPlayerId: playerA,
    players: Object.freeze([players[0]!]),
    game: null,
    roomRevision: v.parse(RoomRevisionSchema, 5),
    storageRevision: createStorageRevision(6),
    createdAt: v.parse(ServerTimeSchema, 3_000),
    updatedAt: v.parse(ServerTimeSchema, 4_000),
  });

  const snapshot = await platform.project({ room, selfPlayerId: playerA });
  assert.equal(snapshot.snapshotVersion, PLATFORM_SNAPSHOT_VERSION);
  assert.equal(snapshot.room.gameType, "HANGUL_TILE");
  assert.equal(snapshot.room.phase, "LOBBY");
  assert.equal(snapshot.game, null);
  assert.deepEqual(snapshot.self, { playerId: playerA });
});
