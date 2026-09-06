import assert from "node:assert/strict";
import test from "node:test";

import {
  LobbyStateSnapshotSchema,
  PLATFORM_SNAPSHOT_VERSION,
  PlayingStateSnapshotSchema,
  PROTOCOL_VERSION,
  type LobbyStateSnapshot,
  type PlayingStateSnapshot,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import { selectSnapshotWirePayload } from "./snapshot-wire-selector.js";

function createLobbySnapshotV1(): LobbyStateSnapshot {
  return v.parse(LobbyStateSnapshotSchema, {
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 2,
      gameRevision: null,
      presenceVersion: 4,
    },
    serverTime: 1_800_000_000_000,
    room: {
      roomId: "room_selector",
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
  });
}

function createPlayingSnapshotV1(): PlayingStateSnapshot {
  return v.parse(PlayingStateSnapshotSchema, {
    protocolVersion: PROTOCOL_VERSION,
    versions: {
      roomRevision: 3,
      gameRevision: 7,
      presenceVersion: 5,
    },
    serverTime: 1_800_000_001_000,
    room: {
      roomId: "room_selector",
      roomCode: "ABC234",
      phase: "PLAYING",
      players: [
        {
          playerId: "player-a",
          nickname: "Alpha",
          isHost: true,
          connectionStatus: "CONNECTED",
          rackCount: 1,
          initialMeldCompleted: false,
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
      gameId: "game_selector",
      board: { wordGroups: [] },
      turnOrder: ["player-a", "player-b"],
      turn: {
        turnId: "turn_selector",
        turnNumber: 8,
        activePlayerId: "player-b",
        startedAt: 1_800_000_001_000,
        deadlineAt: 1_800_000_061_000,
      },
      bagCounts: { consonant: 81, vowel: 47 },
    },
    self: {
      playerId: "player-a",
      rack: [
        {
          tileId: "private-a-1",
          kind: "ORDINARY",
          physicalType: "GIYEOK",
          sourceBag: "CONSONANT",
          allowedSymbols: ["ㄱ"],
        },
      ],
    },
  });
}

test("V1 selector는 legacy snapshot의 exact wire value를 그대로 반환한다", () => {
  const legacySnapshot = createLobbySnapshotV1();
  const before = structuredClone(legacySnapshot);

  const selected = selectSnapshotWirePayload({
    selectedVersion: 1,
    canonicalGameType: "HANGUL_TILE",
    legacySnapshot,
  });

  assert.strictEqual(selected, legacySnapshot);
  assert.deepEqual(selected, before);
  assert.equal("snapshotVersion" in selected, false);
  assert.equal("gameType" in selected.room, false);
  assert.deepEqual(legacySnapshot, before);
});

test("V2 selector는 canonical HANGUL_TILE을 mapper에 전달하고 semantic projection을 반환한다", () => {
  const legacySnapshot = createPlayingSnapshotV1();
  const before = structuredClone(legacySnapshot);

  const selected = selectSnapshotWirePayload({
    selectedVersion: 2,
    canonicalGameType: "HANGUL_TILE",
    legacySnapshot,
  });

  if (!("snapshotVersion" in selected) || selected.game === null) {
    throw new Error("V2 PLAYING selection must return a game projection.");
  }
  assert.equal(selected.snapshotVersion, PLATFORM_SNAPSHOT_VERSION);
  assert.equal(selected.room.gameType, "HANGUL_TILE");
  assert.equal(selected.game.gameType, "HANGUL_TILE");
  assert.equal(selected.game.gameRevision, legacySnapshot.versions.gameRevision);
  assert.deepEqual(selected.game.publicState, legacySnapshot.game);
  assert.deepEqual(selected.game.privateState.rack, legacySnapshot.self.rack);
  assert.deepEqual(legacySnapshot, before, "selector must not mutate V1 input");
  assert.equal("protocolVersion" in selected, false);
});

test("corrupt canonical gameType은 V1에서도 Hangul로 silent fallback하지 않는다", () => {
  const legacySnapshot = createLobbySnapshotV1();

  assert.throws(() =>
    selectSnapshotWirePayload({
      selectedVersion: 1,
      canonicalGameType: "UNKNOWN_GAME",
      legacySnapshot,
    }),
  );
});

test("V2 mapping failure는 V1 payload로 silent downgrade하지 않는다", () => {
  const legacySnapshot = createPlayingSnapshotV1();
  const malformedSnapshot = {
    ...legacySnapshot,
    storageRevision: 9,
  } as unknown as PlayingStateSnapshot;

  assert.throws(() =>
    selectSnapshotWirePayload({
      selectedVersion: 2,
      canonicalGameType: "HANGUL_TILE",
      legacySnapshot: malformedSnapshot,
    }),
  );
});
