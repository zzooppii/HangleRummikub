import assert from "node:assert/strict";
import test from "node:test";

import {
  PLATFORM_SNAPSHOT_VERSION,
  PROTOCOL_VERSION,
  PlatformSnapshotV2Schema,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import { mapLegacyStateSnapshotV1ToPlatformSnapshotV2 } from "./platform-snapshot-v2-mapper.js";

function privateRackTile(tileId: string, sourceBag: "CONSONANT" | "VOWEL") {
  return {
    tileId,
    kind: "ORDINARY" as const,
    physicalType: sourceBag === "CONSONANT" ? "GIYEOK" : "A",
    sourceBag,
    allowedSymbols: sourceBag === "CONSONANT" ? (["ㄱ"] as const) : (["ㅏ"] as const),
  };
}

function createLobbySnapshotV1() {
  return {
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 2,
      gameRevision: null,
      presenceVersion: 4,
    },
    serverTime: 1_800_000_000_000,
    room: {
      roomId: "room_p5a",
      roomCode: "ABC234",
      phase: "LOBBY",
      players: [
        {
          playerId: "player-a",
          nickname: "Alpha",
          isHost: true,
          connectionStatus: "CONNECTED",
        },
      ],
    },
    self: { playerId: "player-a" },
  } as const;
}

function createPlayingSnapshotV1(selfPlayerId: "player-a" | "player-b") {
  const rack =
    selfPlayerId === "player-a"
      ? [
          privateRackTile("private-a-1", "CONSONANT"),
          privateRackTile("private-a-2", "VOWEL"),
        ]
      : [privateRackTile("private-b-1", "CONSONANT")];

  return {
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 3,
      gameRevision: 7,
      presenceVersion: 5,
    },
    serverTime: 1_800_000_001_000,
    room: {
      roomId: "room_p5a",
      roomCode: "ABC234",
      phase: "PLAYING",
      players: [
        {
          playerId: "player-a",
          nickname: "Alpha",
          isHost: true,
          connectionStatus: "CONNECTED",
          rackCount: 2,
          initialMeldCompleted: true,
          forfeited: false,
        },
        {
          playerId: "player-b",
          nickname: "Beta",
          isHost: false,
          connectionStatus: "OFFLINE",
          rackCount: 1,
          initialMeldCompleted: false,
          forfeited: false,
        },
      ],
    },
    game: {
      gameId: "game_p5a",
      board: { wordGroups: [] },
      turnOrder: ["player-a", "player-b"],
      turn: {
        turnId: "turn_p5a",
        turnNumber: 8,
        activePlayerId: "player-b",
        startedAt: 1_800_000_001_000,
        deadlineAt: 1_800_000_061_000,
      },
      bagCounts: { consonant: 81, vowel: 47 },
    },
    self: { playerId: selfPlayerId, rack },
  } as const;
}

function createFinishedSnapshotV1(
  selfPlayerId: "player-a" | "player-b" = "player-a",
) {
  const playing = createPlayingSnapshotV1(selfPlayerId);

  return {
    ...playing,
    versions: {
      ...playing.versions,
      roomRevision: 4,
      gameRevision: 8,
    },
    room: {
      ...playing.room,
      phase: "FINISHED",
      players: playing.room.players.map((player) =>
        player.playerId === "player-a"
          ? { ...player, rackCount: 0 }
          : player,
      ),
    },
    game: {
      gameId: playing.game.gameId,
      board: playing.game.board,
      turnOrder: playing.game.turnOrder,
      bagCounts: playing.game.bagCounts,
      result: {
        reason: "RACK_EMPTY",
        winnerPlayerIds: ["player-a"],
        rankings: [
          {
            playerId: "player-a",
            rank: 1,
            score: 1,
            remainingRackCount: 0,
            penaltyCost: 0,
            forfeited: false,
          },
          {
            playerId: "player-b",
            rank: 2,
            score: -1,
            remainingRackCount: 1,
            penaltyCost: 1,
            forfeited: false,
          },
        ],
        finishedAt: 1_800_000_030_000,
      },
    },
    self: {
      playerId: selfPlayerId,
      rack: selfPlayerId === "player-a" ? [] : playing.self.rack,
    },
  } as const;
}

function collectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectKeys);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }

  return Object.keys(value).flatMap((key) => [
    key,
    ...collectKeys(Reflect.get(value, key)),
  ]);
}

test("V1→V2 mapper는 LOBBY platform semantics와 null game을 보존한다", () => {
  const legacy = createLobbySnapshotV1();
  const before = structuredClone(legacy);

  const snapshot = mapLegacyStateSnapshotV1ToPlatformSnapshotV2({
    canonicalGameType: "HANGUL_TILE",
    snapshot: legacy,
  });

  assert.equal(snapshot.snapshotVersion, PLATFORM_SNAPSHOT_VERSION);
  assert.deepEqual(snapshot.versions, {
    roomRevision: legacy.versions.roomRevision,
    presenceVersion: legacy.versions.presenceVersion,
  });
  assert.deepEqual(snapshot.room, {
    ...legacy.room,
    gameType: "HANGUL_TILE",
  });
  assert.deepEqual(snapshot.self, legacy.self);
  assert.equal(snapshot.game, null);
  assert.equal(v.safeParse(PlatformSnapshotV2Schema, snapshot).success, true);
  assert.deepEqual(legacy, before, "mapper must not mutate its V1 input");
});

test("V1→V2 mapper는 PLAYING A/B semantics와 rack privacy를 그대로 재배치한다", () => {
  const legacyA = createPlayingSnapshotV1("player-a");
  const legacyB = createPlayingSnapshotV1("player-b");
  const snapshotA = mapLegacyStateSnapshotV1ToPlatformSnapshotV2({
    canonicalGameType: "HANGUL_TILE",
    snapshot: legacyA,
  });
  const snapshotB = mapLegacyStateSnapshotV1ToPlatformSnapshotV2({
    canonicalGameType: "HANGUL_TILE",
    snapshot: legacyB,
  });

  if (
    snapshotA.game?.gameType !== "HANGUL_TILE" ||
    snapshotB.game?.gameType !== "HANGUL_TILE"
  ) {
    throw new Error("PLAYING fixtures must contain a Hangul projection.");
  }
  assert.deepEqual(snapshotA.game.publicState, legacyA.game);
  assert.deepEqual(snapshotB.game.publicState, legacyB.game);
  assert.equal(snapshotA.serverTime, legacyA.serverTime);
  assert.deepEqual(snapshotA.versions, {
    roomRevision: legacyA.versions.roomRevision,
    presenceVersion: legacyA.versions.presenceVersion,
  });
  assert.equal(snapshotA.room.roomId, legacyA.room.roomId);
  assert.equal(snapshotA.room.roomCode, legacyA.room.roomCode);
  assert.equal(snapshotA.room.phase, legacyA.room.phase);
  assert.deepEqual(
    snapshotA.room.players,
    legacyA.room.players.map((player) => ({
      playerId: player.playerId,
      nickname: player.nickname,
      isHost: player.isHost,
      connectionStatus: player.connectionStatus,
    })),
  );
  assert.deepEqual(snapshotA.self, { playerId: legacyA.self.playerId });
  assert.equal(snapshotA.game.gameRevision, legacyA.versions.gameRevision);
  assert.deepEqual(
    snapshotA.game.privateState.rack,
    legacyA.self.rack,
  );
  assert.deepEqual(
    snapshotB.game.privateState.rack,
    legacyB.self.rack,
  );
  assert.deepEqual(
    snapshotA.game.playerStates,
    legacyA.room.players.map((player) => ({
      playerId: player.playerId,
      rackCount: player.rackCount,
      initialMeldCompleted: player.initialMeldCompleted,
      forfeited: player.forfeited,
    })),
  );

  const serializedA = JSON.stringify(snapshotA);
  const serializedB = JSON.stringify(snapshotB);
  assert.equal(serializedA.includes("private-a-1"), true);
  assert.equal(serializedA.includes("private-b-1"), false);
  assert.equal(serializedB.includes("private-b-1"), true);
  assert.equal(serializedB.includes("private-a-1"), false);
  assert.equal(serializedA.includes("consonantBag"), false);
  assert.equal(serializedB.includes("vowelBag"), false);
});

test("V1→V2 mapper는 FINISHED Hangul result와 private rack semantics를 보존한다", () => {
  const legacyA = createFinishedSnapshotV1("player-a");
  const legacyB = createFinishedSnapshotV1("player-b");
  const snapshotA = mapLegacyStateSnapshotV1ToPlatformSnapshotV2({
    canonicalGameType: "HANGUL_TILE",
    snapshot: legacyA,
  });
  const snapshotB = mapLegacyStateSnapshotV1ToPlatformSnapshotV2({
    canonicalGameType: "HANGUL_TILE",
    snapshot: legacyB,
  });

  if (
    snapshotA.game?.gameType !== "HANGUL_TILE" ||
    snapshotB.game?.gameType !== "HANGUL_TILE"
  ) {
    throw new Error("FINISHED fixture must contain a Hangul projection.");
  }
  assert.equal(snapshotA.room.phase, "FINISHED");
  assert.equal(snapshotA.game.gameRevision, legacyA.versions.gameRevision);
  assert.deepEqual(snapshotA.game.publicState, legacyA.game);
  assert.deepEqual(snapshotA.game.publicState.result, legacyA.game.result);
  assert.deepEqual(snapshotA.game.privateState.rack, legacyA.self.rack);
  assert.deepEqual(snapshotB.game.privateState.rack, legacyB.self.rack);
  assert.equal(JSON.stringify(snapshotA).includes("private-b-1"), false);
  assert.equal(JSON.stringify(snapshotB).includes("private-b-1"), true);
  assert.equal(JSON.stringify(snapshotB).includes("private-a-1"), false);
});

test("V1→V2 mapper는 unsupported canonical gameType과 malformed V1을 fail-closed한다", () => {
  const legacy = createPlayingSnapshotV1("player-a");

  for (const gameType of ["NUMBER_TILE", "GEM_CARD", "UNKNOWN"]) {
    assert.throws(() =>
      mapLegacyStateSnapshotV1ToPlatformSnapshotV2({
        canonicalGameType: gameType,
        snapshot: legacy,
      })
    );
  }
  assert.throws(() =>
    mapLegacyStateSnapshotV1ToPlatformSnapshotV2({
      canonicalGameType: "HANGUL_TILE",
      snapshot: { ...legacy, storageRevision: 9 },
    })
  );
  assert.throws(() =>
    mapLegacyStateSnapshotV1ToPlatformSnapshotV2({
      canonicalGameType: "HANGUL_TILE",
      snapshot: {
        ...legacy,
        room: {
          ...legacy.room,
          players: legacy.room.players.map((player) =>
            player.playerId === "player-b"
              ? { ...player, rack: [{ tileId: "private-probe" }] }
              : player,
          ),
        },
      },
    })
  );
});

test("PlatformSnapshot V2 mapper output은 server-private key를 생성하지 않는다", () => {
  const snapshot = mapLegacyStateSnapshotV1ToPlatformSnapshotV2({
    canonicalGameType: "HANGUL_TILE",
    snapshot: createPlayingSnapshotV1("player-a"),
  });
  const forbiddenKeys = [
    "connectionGeneration",
    "consonantBag",
    "idempotency",
    "offlineTimeoutStreak",
    "sessionToken",
    "socketId",
    "stalemateTracker",
    "storageRevision",
    "tilesById",
    "tokenHash",
    "verificationData",
    "vowelBag",
  ];
  const exposedKeys = new Set(collectKeys(snapshot));

  for (const forbiddenKey of forbiddenKeys) {
    assert.equal(exposedKeys.has(forbiddenKey), false, forbiddenKey);
  }
});
