import assert from "node:assert/strict";
import test from "node:test";

import {
  GameRevisionSchema,
  PlayerIdSchema,
  ServerTimeSchema,
  type PlayerId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  createInitialGameState,
  type GameState,
} from "./domain/game/game-state.js";
import { createTimeLimitResult } from "./domain/game/result-engine.js";
import { projectLegacyHangulV1Game } from "./games/legacy-hangul-v1-game-projector.js";
import { FakeIdGenerator } from "./infrastructure/system.js";

const PLAYER_A = parse(PlayerIdSchema, "player-projector-a");
const PLAYER_B = parse(PlayerIdSchema, "player-projector-b");
const PLAYER_IDS: readonly PlayerId[] = [PLAYER_A, PLAYER_B];

function playingGame(): GameState {
  return createInitialGameState({
    playerIds: PLAYER_IDS,
    startedAt: parse(ServerTimeSchema, 5_000),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
}

test("Legacy Hangul v1 game projector가 PLAYING game detail과 self rack privacy를 소유한다", () => {
  const game = playingGame();
  const projection = projectLegacyHangulV1Game({
    phase: "PLAYING",
    playerIds: PLAYER_IDS,
    selfPlayerId: PLAYER_A,
    game,
  });

  assert.equal(projection.phase, "PLAYING");
  assert.equal(projection.gameRevision, game.gameRevision);
  assert.deepEqual(
    projection.playerProgress.map((player) => ({
      playerId: player.playerId,
      rackCount: player.rackCount,
      initialMeldCompleted: player.initialMeldCompleted,
      forfeited: player.forfeited,
    })),
    [
      {
        playerId: PLAYER_A,
        rackCount: 14,
        initialMeldCompleted: false,
        forfeited: false,
      },
      {
        playerId: PLAYER_B,
        rackCount: 14,
        initialMeldCompleted: false,
        forfeited: false,
      },
    ],
  );
  assert.deepEqual(
    projection.privateRack.map((tile) => tile.tileId),
    game.racks.get(PLAYER_A),
  );
  assert.deepEqual(projection.game.bagCounts, {
    consonant: game.consonantBag.length,
    vowel: game.vowelBag.length,
  });
  assert.deepEqual(projection.game.turn, game.turn);

  const serialized = JSON.stringify(projection);
  for (const tileId of game.racks.get(PLAYER_B) ?? []) {
    assert.equal(serialized.includes(`"${tileId}"`), false);
  }
  for (const tileId of [...game.consonantBag, ...game.vowelBag]) {
    assert.equal(serialized.includes(`"${tileId}"`), false);
  }
});

test("Legacy Hangul v1 game projector가 FINISHED result를 복사하고 private rack 정책을 유지한다", () => {
  const activeGame = playingGame();
  const finishedAt = parse(ServerTimeSchema, activeGame.gameDeadlineAt);
  const result = createTimeLimitResult({
    playerIds: activeGame.turnOrder,
    racks: activeGame.racks,
    tilesById: activeGame.tilesById,
    forfeitedPlayerIds: activeGame.forfeitedPlayerIds,
    finishedAt,
  });
  const finishedGame: GameState = {
    ...activeGame,
    gameRevision: parse(
      GameRevisionSchema,
      activeGame.gameRevision + 1,
    ),
    turn: null,
    result,
  };

  const projection = projectLegacyHangulV1Game({
    phase: "FINISHED",
    playerIds: PLAYER_IDS,
    selfPlayerId: PLAYER_B,
    game: finishedGame,
  });

  assert.equal(projection.phase, "FINISHED");
  assert.equal(projection.gameRevision, finishedGame.gameRevision);
  assert.notEqual(projection.game.result, result);
  assert.deepEqual(projection.game.result, result);
  assert.deepEqual(
    projection.privateRack.map((tile) => tile.tileId),
    finishedGame.racks.get(PLAYER_B),
  );

  const serialized = JSON.stringify(projection);
  for (const tileId of finishedGame.racks.get(PLAYER_A) ?? []) {
    assert.equal(serialized.includes(`"${tileId}"`), false);
  }
});
