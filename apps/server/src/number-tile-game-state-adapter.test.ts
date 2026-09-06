import assert from "node:assert/strict";
import test from "node:test";

import {
  PlayerIdSchema,
  ServerTimeSchema,
  type PlayerId,
  type ServerTime,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { NumberTileGameStateAdapter } from "./games/number-tile/compatibility/number-tile-game-state-adapter.js";
import {
  createInitialNumberTileGameState,
  type NumberTileGameState,
  type PlayingNumberTileGameState,
} from "./games/number-tile/domain/game-state.js";
import { createNumberTileRackEmptyResult } from "./games/number-tile/domain/result-engine.js";
import type { NumberTilePlacement } from "./games/number-tile/domain/table.js";
import { FakeIdGenerator } from "./infrastructure/system.js";

function playerId(value: string): PlayerId {
  return parse(PlayerIdSchema, value);
}

function serverTime(value: number): ServerTime {
  return parse(ServerTimeSchema, value);
}

function createGame(): PlayingNumberTileGameState {
  return createInitialNumberTileGameState({
    playerIds: [playerId("number-a"), playerId("number-b")],
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: (maxExclusive) => maxExclusive - 1 },
    clock: { now: () => serverTime(10_000) },
  });
}

function removeLocatedTile(
  pool: TileId[],
  racks: Map<PlayerId, TileId[]>,
  tileId: TileId,
): void {
  const poolIndex = pool.indexOf(tileId);
  if (poolIndex >= 0) {
    pool.splice(poolIndex, 1);
    return;
  }
  for (const rack of racks.values()) {
    const rackIndex = rack.indexOf(tileId);
    if (rackIndex >= 0) {
      rack.splice(rackIndex, 1);
      return;
    }
  }
  throw new Error("Test Tile was not in pool or rack.");
}

function withJokerGroup(
  state: PlayingNumberTileGameState,
): PlayingNumberTileGameState {
  const redOne = [...state.tilesById.values()].find(
    (tile) =>
      tile.kind === "ORDINARY" && tile.color === "RED" && tile.number === 1,
  );
  const blueOne = [...state.tilesById.values()].find(
    (tile) =>
      tile.kind === "ORDINARY" && tile.color === "BLUE" && tile.number === 1,
  );
  const joker = [...state.tilesById.values()].find(
    (tile) => tile.kind === "JOKER",
  );
  if (redOne === undefined || blueOne === undefined || joker === undefined) {
    throw new Error("Expected Number Tile group fixtures.");
  }

  const pool = [...state.pool];
  const racks = new Map<PlayerId, TileId[]>(
    [...state.racks].map(([id, rack]) => [id, [...rack]] as const),
  );
  for (const tile of [redOne, blueOne, joker]) {
    removeLocatedTile(pool, racks, tile.tileId);
  }
  const placements: NumberTilePlacement[] = [
    { tileId: redOne.tileId, kind: "ORDINARY" },
    { tileId: blueOne.tileId, kind: "ORDINARY" },
    {
      tileId: joker.tileId,
      kind: "JOKER",
      assignedColor: "BLACK",
      assignedNumber: 1,
    },
  ];
  return {
    ...state,
    pool,
    racks,
    table: { melds: [{ kind: "GROUP", tiles: placements }] },
  };
}

function finishedRackEmptyState(
  state: PlayingNumberTileGameState,
): NumberTileGameState {
  const winnerPlayerId = state.turnOrder[0]!;
  const winnerRack = state.racks.get(winnerPlayerId)!;
  const racks = new Map(state.racks);
  racks.set(winnerPlayerId, []);
  const pool = [...state.pool, ...winnerRack];
  const result = createNumberTileRackEmptyResult(
    {
      playerIds: state.turnOrder,
      racks,
      tilesById: state.tilesById,
      forfeitedPlayerIds: state.forfeitedPlayerIds,
      finishedAt: serverTime(20_000),
    },
    winnerPlayerId,
  );
  return { ...state, pool, racks, turn: null, result };
}

test("Number state adapter clones and validates a full active state without sharing nested storage", () => {
  const adapter = new NumberTileGameStateAdapter();
  const mutable = withJokerGroup(createGame());
  const cloned = adapter.cloneAndValidate(mutable);

  assert.notStrictEqual(cloned, mutable);
  assert.notStrictEqual(cloned.tilesById, mutable.tilesById);
  assert.notStrictEqual(cloned.racks, mutable.racks);
  assert.notStrictEqual(cloned.pool, mutable.pool);
  assert.notStrictEqual(cloned.table, mutable.table);
  assert.notStrictEqual(cloned.table.melds[0], mutable.table.melds[0]);
  assert.notStrictEqual(
    cloned.table.melds[0]?.tiles[2],
    mutable.table.melds[0]?.tiles[2],
  );
  assert.equal("set" in cloned.racks, false);
  assert.equal("set" in cloned.tilesById, false);
  assert.ok(Object.isFrozen(cloned));
  assert.ok(Object.isFrozen(cloned.pool));
  assert.ok(Object.isFrozen(cloned.table.melds));

  Reflect.apply(Array.prototype.pop, mutable.pool, []);
  Reflect.apply(Map.prototype.clear, mutable.racks, []);
  Reflect.apply(Array.prototype.pop, mutable.table.melds[0]!.tiles, []);
  assert.equal(cloned.pool.length > 0, true);
  assert.equal(cloned.racks.size, 2);
  assert.equal(cloned.table.melds[0]?.tiles.length, 3);

  assert.deepEqual(adapter.inspectLifecycle(cloned), {
    lifecycle: "RUNNING",
    gameId: cloned.gameId,
    gameRevision: cloned.gameRevision,
    activeTurn: {
      turnId: cloned.turn?.turnId,
      deadlineAt: cloned.turn?.deadlineAt,
    },
  });
  assert.equal(
    Object.hasOwn(adapter.inspectLifecycle(cloned), "gameDeadlineAt"),
    false,
  );
});

test("Number state adapter reconstructs a canonical terminal result and keeps it detached", () => {
  const adapter = new NumberTileGameStateAdapter();
  const mutable = finishedRackEmptyState(createGame());
  const cloned = adapter.cloneAndValidate(mutable);

  assert.equal(cloned.turn, null);
  assert.equal(cloned.result?.reason, "RACK_EMPTY");
  assert.notStrictEqual(cloned.result, mutable.result);
  assert.ok(Object.isFrozen(cloned.result));
  assert.deepEqual(adapter.inspectLifecycle(cloned), {
    lifecycle: "FINISHED",
    gameId: cloned.gameId,
    finishedAt: serverTime(20_000),
  });
});

test("Number state adapter rejects corrupt conservation, lifecycle, tracker, and result state", () => {
  const adapter = new NumberTileGameStateAdapter();
  const game = createGame();

  assert.throws(
    () => adapter.cloneAndValidate({ ...game, pool: game.pool.slice(1) }),
    /conservation/u,
  );
  assert.throws(
    () =>
      adapter.cloneAndValidate({
        ...game,
        noPlayPlayerIds: [game.turnOrder[1]!, game.turnOrder[0]!],
      }),
    /no-play tracker/u,
  );
  assert.throws(
    () =>
      adapter.cloneAndValidate({
        ...game,
        noPlayPlayerIds: [game.turnOrder[0]!],
      }),
    /empty pool/u,
  );
  const invalidStreaks = new Map(game.offlineTimeoutStreakByPlayerId);
  invalidStreaks.set(game.turnOrder[0]!, 2);
  assert.throws(
    () =>
      adapter.cloneAndValidate({
        ...game,
        offlineTimeoutStreakByPlayerId: invalidStreaks,
      }),
    /must forfeit/u,
  );
  assert.throws(
    () =>
      adapter.cloneAndValidate({
        ...game,
        turn: { ...game.turn, deadlineAt: serverTime(100_001) },
      }),
    /canonical duration/u,
  );

  const finished = finishedRackEmptyState(game);
  if (finished.result === null) {
    throw new Error("Expected a terminal Number result.");
  }
  assert.throws(
    () =>
      adapter.cloneAndValidate({
        ...finished,
        result: { ...finished.result, winnerPlayerIds: [game.turnOrder[1]!] },
      }),
    /rack-empty|canonical state/u,
  );
});
