import assert from "node:assert/strict";
import test from "node:test";

import {
  PlayerIdSchema,
  ServerTimeSchema,
  type PlayerId,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  createInitialGameState,
  type FinishedGameState,
  type GameState,
  type PlayingGameState,
} from "./domain/game/game-state.js";
import { createTimeLimitResult } from "./domain/game/result-engine.js";
import { LegacyHangulGameStateAdapter } from "./games/legacy-hangul-game-state-adapter.js";
import { FakeIdGenerator } from "./infrastructure/system.js";

function createPlayingGame(): PlayingGameState {
  return createInitialGameState({
    playerIds: [
      parse(PlayerIdSchema, "adapter-player-a"),
      parse(PlayerIdSchema, "adapter-player-b"),
    ],
    startedAt: parse(ServerTimeSchema, 1_000),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
}

function finishGame(game: PlayingGameState): FinishedGameState {
  return {
    ...game,
    turn: null,
    result: createTimeLimitResult({
      playerIds: game.turnOrder,
      racks: game.racks,
      tilesById: game.tilesById,
      forfeitedPlayerIds: game.forfeitedPlayerIds,
      finishedAt: game.gameDeadlineAt,
    }),
  };
}

test("Legacy Hangul state adapter clones and inspects a RUNNING state", () => {
  const adapter = new LegacyHangulGameStateAdapter();
  const original = createPlayingGame();
  const clone = adapter.cloneAndValidate(original);

  assert.equal(adapter.gameType, "HANGUL_TILE");
  assert.equal(Object.isFrozen(adapter), true);
  assert.equal(Reflect.set(adapter, "gameType", "UNKNOWN_GAME"), false);
  assert.deepEqual(adapter.inspectLifecycle(original), {
    lifecycle: "RUNNING",
    gameId: original.gameId,
    gameRevision: original.gameRevision,
    activeTurn: {
      turnId: original.turn.turnId,
      deadlineAt: original.turn.deadlineAt,
    },
    gameDeadlineAt: original.gameDeadlineAt,
  });
  assert.deepEqual(clone, original);
  assert.notEqual(clone, original);
  assert.notEqual(clone.tilesById, original.tilesById);
  assert.notEqual(clone.consonantBag, original.consonantBag);
  assert.notEqual(clone.vowelBag, original.vowelBag);
  assert.notEqual(clone.racks, original.racks);
  assert.notEqual(clone.board, original.board);
  assert.notEqual(clone.turn, original.turn);

  const originalRackCount = original.racks.size;
  Reflect.apply(Map.prototype.clear, clone.racks, []);
  assert.equal(original.racks.size, originalRackCount);

  const clonedTileCount = clone.tilesById.size;
  Reflect.apply(Map.prototype.clear, original.tilesById, []);
  assert.equal(clone.tilesById.size, clonedTileCount);
});

test("Legacy Hangul state adapter clones and inspects a FINISHED state", () => {
  const adapter = new LegacyHangulGameStateAdapter();
  const original = finishGame(createPlayingGame());
  const clone = adapter.cloneAndValidate(original);

  assert.deepEqual(adapter.inspectLifecycle(original), {
    lifecycle: "FINISHED",
    gameId: original.gameId,
    finishedAt: original.result.finishedAt,
  });
  assert.deepEqual(clone, original);
  assert.notEqual(clone, original);
  if (clone.turn !== null || clone.result === null) {
    throw new Error("Expected a cloned FINISHED GameState.");
  }
  assert.notEqual(clone.result, original.result);
  assert.notEqual(clone.result.rankings, original.result.rankings);
  assert.notEqual(clone.result.rankings[0], original.result.rankings[0]);

  const cloneRacks = clone.racks as Map<PlayerId, readonly TileId[]>;
  cloneRacks.clear();
  assert.equal(original.racks.size, original.turnOrder.length);
});

test("Legacy Hangul state adapter rejects invalid lifecycle and existing state invariants", () => {
  const adapter = new LegacyHangulGameStateAdapter();
  const playing = createPlayingGame();
  const result = finishGame(playing).result;

  assert.throws(() =>
    adapter.inspectLifecycle({
      ...playing,
      turn: null,
      result: null,
    } as unknown as GameState),
  );
  assert.throws(() =>
    adapter.inspectLifecycle({
      ...playing,
      result,
    } as unknown as GameState),
  );
  assert.throws(() =>
    adapter.cloneAndValidate({
      ...playing,
      rulesConfig: {
        ...playing.rulesConfig,
        turnDurationMs: 1,
      },
    }),
  );
});
