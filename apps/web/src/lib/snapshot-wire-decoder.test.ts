import assert from "node:assert/strict";
import test from "node:test";

import {
  PROTOCOL_VERSION,
  validatePlatformSnapshotV2,
  validatePlayingStateSnapshot,
  validateStateSnapshot,
} from "@hangul-rummikub/shared";

import { adaptPlatformSnapshotV2ToLegacyHangulV1 } from "./platform-snapshot-v2-hangul-adapter.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import {
  WEB_SUPPORTED_SNAPSHOT_VERSIONS,
  decodeWebSnapshot,
} from "./snapshot-wire-decoder.js";
import {
  createTurnDraft,
  decideTurnDraftReconciliation,
} from "./turn-draft.js";

const PLAYER_A = "player_web_v2_a";
const PLAYER_B = "player_web_v2_b";

function lobbyV2(): Record<string, unknown> {
  return {
    snapshotVersion: 2,
    versions: { roomRevision: 1, presenceVersion: 2 },
    serverTime: 1_750_000_000_000,
    room: {
      roomId: "room_web_v2",
      roomCode: "ABC234",
      phase: "LOBBY",
      gameType: "HANGUL_TILE",
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
    game: null,
  };
}

function playingV2(): Record<string, unknown> {
  return {
    snapshotVersion: 2,
    versions: { roomRevision: 3, presenceVersion: 4 },
    serverTime: 1_750_000_000_100,
    room: {
      roomId: "room_web_v2",
      roomCode: "ABC234",
      phase: "PLAYING",
      gameType: "HANGUL_TILE",
      players: [
        {
          playerId: PLAYER_A,
          nickname: "혁상",
          isHost: true,
          connectionStatus: "CONNECTED",
        },
        {
          playerId: PLAYER_B,
          nickname: "참가자",
          isHost: false,
          connectionStatus: "CONNECTED",
        },
      ],
    },
    self: { playerId: PLAYER_A },
    game: {
      gameType: "HANGUL_TILE",
      gameRevision: 7,
      publicState: {
        gameId: "game_web_v2",
        board: { wordGroups: [] },
        turnOrder: [PLAYER_A, PLAYER_B],
        turn: {
          turnId: "turn_web_v2",
          turnNumber: 8,
          activePlayerId: PLAYER_A,
          startedAt: 1_750_000_000_100,
          deadlineAt: 1_750_000_060_100,
        },
        bagCounts: { consonant: 80, vowel: 47 },
      },
      playerStates: [
        {
          playerId: PLAYER_A,
          rackCount: 1,
          initialMeldCompleted: true,
          forfeited: false,
        },
        {
          playerId: PLAYER_B,
          rackCount: 2,
          initialMeldCompleted: false,
          forfeited: false,
        },
      ],
      privateState: {
        rack: [
          {
            tileId: "tile_web_v2_private",
            kind: "ORDINARY",
            physicalType: "GIYEOK_NIEUN",
            sourceBag: "CONSONANT",
            allowedSymbols: ["ㄱ", "ㄴ"],
          },
        ],
      },
    },
  };
}

function finishedV2(): Record<string, unknown> {
  const playing = playingV2();
  const game = playing.game as Record<string, unknown>;
  const publicState = game.publicState as Record<string, unknown>;
  const { turn: _turn, ...finishedPublicState } = publicState;

  return {
    ...playing,
    versions: { roomRevision: 4, presenceVersion: 4 },
    room: {
      ...(playing.room as Record<string, unknown>),
      phase: "FINISHED",
    },
    game: {
      ...game,
      gameRevision: 8,
      publicState: {
        ...finishedPublicState,
        result: {
          reason: "TIME_LIMIT",
          winnerPlayerIds: [PLAYER_A],
          rankings: [
            {
              playerId: PLAYER_A,
              rank: 1,
              score: -1,
              remainingRackCount: 1,
              penaltyCost: 1,
              forfeited: false,
            },
            {
              playerId: PLAYER_B,
              rank: 2,
              score: -2,
              remainingRackCount: 2,
              penaltyCost: 2,
              forfeited: false,
            },
          ],
          finishedAt: 1_750_000_001_000,
        },
      },
    },
  };
}

function requireCompatible(input: unknown) {
  const result = decodeWebSnapshot(input);
  assert.equal(result.kind, "COMPATIBLE");
  if (result.kind !== "COMPATIBLE") {
    throw new Error("Expected a compatible snapshot fixture.");
  }
  return result.value;
}

function requirePlayingLegacyFromV2(input: unknown) {
  const decoded = requireCompatible(input);
  assert.equal(decoded.kind, "PLATFORM_V2_HANGUL_TILE");
  const validation = validatePlayingStateSnapshot(decoded.legacySnapshot);
  assert.equal(validation.ok, true);
  if (!validation.ok) {
    throw new Error("Expected a valid adapted Playing snapshot.");
  }
  return validation.value;
}

test("new Web은 snapshot capability 2와 legacy 1을 내림차순으로 advertise한다", () => {
  assert.deepEqual(WEB_SUPPORTED_SNAPSHOT_VERSIONS, [2, 1]);
  assert.equal(Object.isFrozen(WEB_SUPPORTED_SNAPSHOT_VERSIONS), true);
});

test("V1 snapshot은 legacy compatibility path로 그대로 decode한다", () => {
  const adapted = requireCompatible(lobbyV2()).legacySnapshot;
  const result = decodeWebSnapshot(adapted);

  assert.equal(result.kind, "COMPATIBLE");
  if (result.kind === "COMPATIBLE") {
    assert.equal(result.value.kind, "LEGACY_HANGUL_V1");
    assert.deepEqual(result.value.legacySnapshot, adapted);
  }
});

test("V2 LOBBY는 strict parse 뒤 game 없는 legacy Lobby shape로 변환한다", () => {
  const input = lobbyV2();
  const before = structuredClone(input);
  const decoded = requireCompatible(input);

  assert.equal(decoded.kind, "PLATFORM_V2_HANGUL_TILE");
  assert.equal(decoded.legacySnapshot.protocolVersion, PROTOCOL_VERSION);
  assert.equal(decoded.legacySnapshot.versions.gameRevision, null);
  assert.equal("game" in decoded.legacySnapshot, false);
  assert.equal("gameType" in decoded.legacySnapshot.room, false);
  assert.equal(resolveRoomSnapshotView(decoded).kind, "LOBBY");
  assert.deepEqual(input, before);
});

test("V2 PLAYING은 canonical revision/player state/private rack을 재계산 없이 복원한다", () => {
  const input = playingV2();
  const decoded = requireCompatible(input);
  assert.equal(decoded.kind, "PLATFORM_V2_HANGUL_TILE");
  if (decoded.kind !== "PLATFORM_V2_HANGUL_TILE") {
    throw new Error("Expected Platform V2 fixture.");
  }

  const snapshot = decoded.legacySnapshot;
  assert.equal(snapshot.versions.gameRevision, 7);
  assert.equal(snapshot.room.phase, "PLAYING");
  assert.equal("game" in snapshot, true);
  if (
    snapshot.room.phase === "PLAYING" &&
    "game" in snapshot &&
    "turn" in snapshot.game
  ) {
    assert.equal(snapshot.game.gameId, "game_web_v2");
    assert.equal(snapshot.game.turn.turnId, "turn_web_v2");
    assert.equal(snapshot.room.players[0]?.rackCount, 1);
    assert.equal(snapshot.room.players[1]?.rackCount, 2);
    assert.deepEqual(
      snapshot.self.rack.map((tile) => tile.tileId),
      ["tile_web_v2_private"],
    );
  }
  assert.doesNotMatch(JSON.stringify(snapshot), /sessionToken|socketId/u);
  assert.equal(validateStateSnapshot(snapshot).ok, true);
  assert.equal(resolveRoomSnapshotView(decoded).kind, "PLAYING");
});

test("V2 FINISHED는 Hangul result와 private-state privacy를 보존한다", () => {
  const decoded = requireCompatible(finishedV2());
  assert.equal(decoded.kind, "PLATFORM_V2_HANGUL_TILE");
  const snapshot = decoded.legacySnapshot;

  assert.equal(snapshot.room.phase, "FINISHED");
  assert.equal(snapshot.versions.gameRevision, 8);
  if (
    snapshot.room.phase === "FINISHED" &&
    "game" in snapshot &&
    "result" in snapshot.game
  ) {
    assert.equal(snapshot.game.result.reason, "TIME_LIMIT");
    assert.equal(snapshot.game.result.rankings[1]?.remainingRackCount, 2);
    assert.deepEqual(
      snapshot.self.rack.map((tile) => tile.tileId),
      ["tile_web_v2_private"],
    );
  }
  assert.equal(resolveRoomSnapshotView(decoded).kind, "FINISHED");
});

test("typed adapter도 strict V2에서 exact legacy StateSnapshot을 만든다", () => {
  const validation = validatePlatformSnapshotV2(playingV2());
  assert.equal(validation.ok, true);
  if (!validation.ok) {
    throw new Error("Expected valid PlatformSnapshot V2 fixture.");
  }

  const adapted = adaptPlatformSnapshotV2ToLegacyHangulV1(validation.value);
  assert.equal(validateStateSnapshot(adapted).ok, true);
  assert.equal(adapted.versions.gameRevision, 7);
});

test("V2 adapter는 canonical game/turn identity를 보존해 V1 TurnDraft reconcile semantics를 유지한다", () => {
  const base = requirePlayingLegacyFromV2(playingV2());
  const draft = createTurnDraft(base);
  assert.notEqual(draft, null);
  if (draft === null) {
    throw new Error("Expected an active-player TurnDraft fixture.");
  }

  assert.equal(base.game.gameId, "game_web_v2");
  assert.equal(base.versions.gameRevision, 7);
  assert.equal(base.game.turn.turnId, "turn_web_v2");

  const presenceV2 = playingV2();
  Reflect.set(presenceV2.versions as object, "presenceVersion", 5);
  const presenceV1 = structuredClone(base);
  Reflect.set(presenceV1.versions, "presenceVersion", 5);
  const adaptedPresence = requirePlayingLegacyFromV2(presenceV2);
  assert.equal(
    decideTurnDraftReconciliation(draft, adaptedPresence),
    decideTurnDraftReconciliation(draft, presenceV1),
  );
  assert.equal(
    decideTurnDraftReconciliation(draft, adaptedPresence),
    "KEEP_DRAFT",
  );

  const revisionV2 = playingV2();
  Reflect.set(revisionV2.game as object, "gameRevision", 8);
  const revisionV1 = structuredClone(base);
  Reflect.set(revisionV1.versions, "gameRevision", 8);
  const adaptedRevision = requirePlayingLegacyFromV2(revisionV2);
  assert.equal(
    decideTurnDraftReconciliation(draft, adaptedRevision),
    decideTurnDraftReconciliation(draft, revisionV1),
  );
  assert.equal(
    decideTurnDraftReconciliation(draft, adaptedRevision),
    "RESET_DRAFT",
  );

  const turnV2 = playingV2();
  const turnGame = turnV2.game as Record<string, unknown>;
  const turnPublicState = turnGame.publicState as Record<string, unknown>;
  Reflect.set(turnPublicState.turn as object, "turnId", "turn_web_v2_next");
  const turnV1 = structuredClone(base);
  Reflect.set(turnV1.game.turn, "turnId", "turn_web_v2_next");
  const adaptedTurn = requirePlayingLegacyFromV2(turnV2);
  assert.equal(
    decideTurnDraftReconciliation(draft, adaptedTurn),
    decideTurnDraftReconciliation(draft, turnV1),
  );
  assert.equal(
    decideTurnDraftReconciliation(draft, adaptedTurn),
    "RESET_DRAFT",
  );

  const gameV2 = playingV2();
  const gamePublicState = (gameV2.game as Record<string, unknown>)
    .publicState as Record<string, unknown>;
  Reflect.set(gamePublicState, "gameId", "game_web_v2_next");
  const gameV1 = structuredClone(base);
  Reflect.set(gameV1.game, "gameId", "game_web_v2_next");
  const adaptedGame = requirePlayingLegacyFromV2(gameV2);
  assert.equal(
    decideTurnDraftReconciliation(draft, adaptedGame),
    decideTurnDraftReconciliation(draft, gameV1),
  );
  assert.equal(
    decideTurnDraftReconciliation(draft, adaptedGame),
    "RESET_DRAFT",
  );
});

test("future version과 unsupported canonical gameType은 Hangul fallback 없이 구분한다", () => {
  const futureVersion = { ...playingV2(), snapshotVersion: 3 };
  const unsupportedGame = {
    ...playingV2(),
    room: {
      ...(playingV2().room as Record<string, unknown>),
      gameType: "UNSUPPORTED_GAME",
    },
  };

  assert.deepEqual(decodeWebSnapshot(futureVersion), {
    kind: "INCOMPATIBLE",
    reason: "UNSUPPORTED_SNAPSHOT_VERSION",
  });
  assert.deepEqual(decodeWebSnapshot(unsupportedGame), {
    kind: "INCOMPATIBLE",
    reason: "UNSUPPORTED_GAME_TYPE",
  });
});

test("recognized V2의 malformed projection은 V1로 downgrade하지 않는다", () => {
  const missingVersion = { ...playingV2() };
  delete missingVersion.snapshotVersion;
  const malformed = {
    ...playingV2(),
    game: null,
  };

  for (const input of [missingVersion, malformed]) {
    assert.deepEqual(decodeWebSnapshot(input), {
      kind: "INCOMPATIBLE",
      reason: "INVALID_V2_PROJECTION",
    });
  }
});

test("malformed legacy input은 V2 incompatible로 오분류하지 않는다", () => {
  assert.deepEqual(
    decodeWebSnapshot({ protocolVersion: PROTOCOL_VERSION, invalid: true }),
    { kind: "INVALID_LEGACY_V1" },
  );
});
