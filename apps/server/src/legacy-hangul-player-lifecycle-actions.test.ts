import assert from "node:assert/strict";
import test from "node:test";

import {
  NicknameSchema,
  PlayerIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  type GameType,
  type PlayerId,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import {
  createInitialGameState,
  type PlayingGameState,
} from "./domain/game/game-state.js";
import {
  applyLegacyHangulPlayingLeave,
  planLegacyHangulPresenceRestored,
} from "./games/legacy-hangul-player-lifecycle-actions.js";
import { LEGACY_V1_DEFAULT_GAME_TYPE } from "./games/legacy-hangul-compatibility-registration.js";
import { FakeIdGenerator } from "./infrastructure/system.js";
import {
  createStorageRevision,
  type RoomRecord,
} from "./model/persistence.js";

const startedAt = v.parse(ServerTimeSchema, 1_000);
const occurredAt = v.parse(ServerTimeSchema, 9_000);

type PlayingFixture = Readonly<{
  room: RoomRecord;
  game: PlayingGameState;
  playerIds: readonly PlayerId[];
  idGenerator: FakeIdGenerator;
}>;

function createPlayingFixture(playerCount: 2 | 3 = 3): PlayingFixture {
  const playerIds = Object.freeze(
    Array.from({ length: playerCount }, (_, index) =>
      v.parse(PlayerIdSchema, `lifecycle-action-player-${index + 1}`),
    ),
  );
  const idGenerator = new FakeIdGenerator();
  const game = createInitialGameState({
    playerIds,
    startedAt,
    idGenerator,
    randomSource: { nextInt: () => 0 },
  });
  const hostPlayerId = playerIds[0];
  if (hostPlayerId === undefined) {
    throw new Error("Lifecycle action fixture requires a Host.");
  }

  return Object.freeze({
    room: Object.freeze({
      roomId: v.parse(RoomIdSchema, "room-player-lifecycle-action"),
      roomCode: v.parse(RoomCodeSchema, "ABC234"),
      gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
      phase: "PLAYING",
      hostPlayerId,
      players: Object.freeze(
        playerIds.map((playerId, joinOrder) =>
          Object.freeze({
            playerId,
            nickname: v.parse(NicknameSchema, `Player${joinOrder + 1}`),
            joinOrder,
          }),
        ),
      ),
      game,
      roomRevision: v.parse(RoomRevisionSchema, 4),
      storageRevision: createStorageRevision(7),
      createdAt: v.parse(ServerTimeSchema, 500),
      updatedAt: startedAt,
    }),
    game,
    playerIds,
    idGenerator,
  });
}

function requirePlayingCandidate(
  candidate: ReturnType<typeof applyLegacyHangulPlayingLeave>["candidate"],
): PlayingGameState {
  if (
    candidate.phase !== "PLAYING" ||
    candidate.game === null ||
    candidate.game.turn === null ||
    candidate.game.result !== null
  ) {
    throw new Error("Expected a Playing candidate.");
  }
  return candidate.game;
}

test("current-player leave creates the exact next-turn candidate and TURN_STARTED advisory", () => {
  const fixture = createPlayingFixture(3);
  const actorPlayerId = fixture.game.turn.activePlayerId;
  const rackBefore = fixture.game.racks.get(actorPlayerId);

  const result = applyLegacyHangulPlayingLeave({
    room: fixture.room,
    actorPlayerId,
    occurredAt,
    idGenerator: fixture.idGenerator,
  });
  const game = requirePlayingCandidate(result.candidate);

  assert.equal(result.advisory, "TURN_STARTED");
  assert.equal(result.finishedGameId, null);
  assert.ok(result.nextTurnIdentity);
  assert.equal(result.nextTurnIdentity.roomId, fixture.room.roomId);
  assert.equal(result.nextTurnIdentity.gameId, fixture.game.gameId);
  assert.equal(
    result.nextTurnIdentity.gameRevision,
    fixture.game.gameRevision + 1,
  );
  assert.equal(result.nextTurnIdentity.turnId, game.turn.turnId);
  assert.equal(game.gameRevision, fixture.game.gameRevision + 1);
  assert.equal(game.forfeitedPlayerIds.has(actorPlayerId), true);
  assert.notEqual(game.turn.activePlayerId, actorPlayerId);
  assert.notEqual(game.turn.turnId, fixture.game.turn.turnId);
  assert.equal(game.turn.startedAt, occurredAt);
  assert.deepEqual(game.racks.get(actorPlayerId), rackBefore);
  assert.equal(result.candidate.roomRevision, fixture.room.roomRevision);
  assert.equal(result.candidate.updatedAt, occurredAt);
});

test("non-current leave preserves the Turn and returns NONE with a re-registration identity", () => {
  const fixture = createPlayingFixture(3);
  const actorPlayerId = fixture.playerIds.find(
    (playerId) => playerId !== fixture.game.turn.activePlayerId,
  );
  assert.ok(actorPlayerId);

  const result = applyLegacyHangulPlayingLeave({
    room: fixture.room,
    actorPlayerId,
    occurredAt,
    idGenerator: fixture.idGenerator,
  });
  const game = requirePlayingCandidate(result.candidate);

  assert.equal(result.advisory, "NONE");
  assert.equal(result.finishedGameId, null);
  assert.ok(result.nextTurnIdentity);
  assert.equal(game.gameRevision, fixture.game.gameRevision + 1);
  assert.equal(game.turn, fixture.game.turn);
  assert.equal(result.nextTurnIdentity.turnId, fixture.game.turn.turnId);
  assert.equal(
    result.nextTurnIdentity.gameRevision,
    fixture.game.gameRevision + 1,
  );
  assert.equal(game.forfeitedPlayerIds.has(actorPlayerId), true);
});

test("terminal leave creates the legacy LAST_PLAYER_STANDING result and GAME_FINISHED advisory", () => {
  const fixture = createPlayingFixture(2);
  const actorPlayerId = fixture.game.turn.activePlayerId;
  const survivor = fixture.playerIds.find(
    (playerId) => playerId !== actorPlayerId,
  );
  assert.ok(survivor);

  const action = applyLegacyHangulPlayingLeave({
    room: fixture.room,
    actorPlayerId,
    occurredAt,
    idGenerator: fixture.idGenerator,
  });

  assert.equal(action.advisory, "GAME_FINISHED");
  assert.equal(action.nextTurnIdentity, null);
  assert.equal(action.finishedGameId, fixture.game.gameId);
  assert.equal(action.candidate.phase, "FINISHED");
  assert.equal(action.candidate.roomRevision, fixture.room.roomRevision + 1);
  assert.ok(action.candidate.game?.result);
  assert.equal(action.candidate.game.turn, null);
  assert.equal(
    action.candidate.game.gameRevision,
    fixture.game.gameRevision + 1,
  );
  assert.equal(action.candidate.game.result.reason, "LAST_PLAYER_STANDING");
  assert.equal(action.candidate.game.result.finishedAt, occurredAt);
  assert.deepEqual(action.candidate.game.result.winnerPlayerIds, [survivor]);
});

test("already-forfeited leave is storage-only and produces no advisory", () => {
  const fixture = createPlayingFixture(3);
  const actorPlayerId = fixture.playerIds.find(
    (playerId) => playerId !== fixture.game.turn.activePlayerId,
  );
  assert.ok(actorPlayerId);
  const game: PlayingGameState = Object.freeze({
    ...fixture.game,
    forfeitedPlayerIds: Object.freeze(new Set([actorPlayerId])),
  });
  const room: RoomRecord = Object.freeze({ ...fixture.room, game });

  const result = applyLegacyHangulPlayingLeave({
    room,
    actorPlayerId,
    occurredAt,
    idGenerator: fixture.idGenerator,
  });

  assert.equal(result.advisory, "NONE");
  assert.equal(result.nextTurnIdentity, null);
  assert.equal(result.finishedGameId, null);
  assert.equal(result.candidate.game, game);
  assert.equal(result.candidate.roomRevision, room.roomRevision);
  assert.equal(result.candidate.game?.gameRevision, game.gameRevision);
  assert.equal(result.candidate.updatedAt, occurredAt);
});

test("presence restoration resets only the Hangul offline streak", () => {
  const fixture = createPlayingFixture(3);
  const playerId = fixture.playerIds[1];
  assert.ok(playerId);
  const streaks = new Map(fixture.game.offlineTimeoutStreakByPlayerId);
  streaks.set(playerId, 1);
  const game: PlayingGameState = Object.freeze({
    ...fixture.game,
    offlineTimeoutStreakByPlayerId: streaks,
  });
  const room: RoomRecord = Object.freeze({ ...fixture.room, game });

  const plan = planLegacyHangulPresenceRestored(room, playerId);

  assert.equal(plan.status, "RESET");
  if (plan.status !== "RESET") return;
  assert.equal(plan.gameId, game.gameId);
  assert.equal(plan.gameRevision, game.gameRevision);
  assert.equal(plan.previousOfflineTimeoutStreak, 1);
  assert.equal(plan.game.offlineTimeoutStreakByPlayerId.get(playerId), 0);
  assert.equal(game.offlineTimeoutStreakByPlayerId.get(playerId), 1);
  assert.equal(plan.game.board, game.board);
  assert.equal(plan.game.racks, game.racks);
  assert.equal(plan.game.turn, game.turn);
  assert.equal(plan.game.gameRevision, game.gameRevision);
  assert.equal(room.roomRevision, fixture.room.roomRevision);
});

test("wrong canonical gameType is rejected before either lifecycle decision", () => {
  const fixture = createPlayingFixture(3);
  const corruptRoom: RoomRecord = Object.freeze({
    ...fixture.room,
    gameType: "UNKNOWN_GAME" as GameType,
  });

  assert.throws(
    () =>
      applyLegacyHangulPlayingLeave({
        room: corruptRoom,
        actorPlayerId: fixture.game.turn.activePlayerId,
        occurredAt,
        idGenerator: fixture.idGenerator,
      }),
    /unsupported gameType/u,
  );
  assert.throws(
    () =>
      planLegacyHangulPresenceRestored(
        corruptRoom,
        fixture.game.turn.activePlayerId,
      ),
    /unsupported gameType/u,
  );
});
