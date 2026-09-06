import assert from "node:assert/strict";
import test from "node:test";

import {
  type GameId,
  PlayerIdSchema,
  ServerTimeSchema,
  type TurnId,
  type PlayerId,
  type ServerTime,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  NUMBER_TILE_RULES,
  NUMBER_TILE_RULES_VERSION,
  createInitialNumberTileGameState,
  isNumberTileActionBeforeDeadline,
} from "./games/number-tile/domain/game-state.js";
import { NUMBER_TILE_INVENTORY_VERSION } from "./games/number-tile/domain/tile-inventory.js";
import { FakeIdGenerator } from "./infrastructure/system.js";
import type { Clock, RandomSource } from "./ports/system.js";

class LastIndexRandomSource implements RandomSource {
  calls = 0;

  nextInt(maxExclusive: number): number {
    this.calls += 1;
    return maxExclusive - 1;
  }
}

class ZeroIndexRandomSource implements RandomSource {
  nextInt(_maxExclusive: number): number {
    return 0;
  }
}

class CountingClock implements Clock {
  calls = 0;

  constructor(private readonly currentTime: ServerTime) {}

  now(): ServerTime {
    this.calls += 1;
    return this.currentTime;
  }
}

function playerId(value: string): PlayerId {
  return parse(PlayerIdSchema, value);
}

function players(count: number): readonly PlayerId[] {
  return Array.from({ length: count }, (_value, index) =>
    playerId(`number-player-${index + 1}`),
  );
}

function createGame(playerCount: number) {
  const randomSource = new LastIndexRandomSource();
  const clock = new CountingClock(parse(ServerTimeSchema, 50_000));
  const state = createInitialNumberTileGameState({
    playerIds: players(playerCount),
    idGenerator: new FakeIdGenerator(),
    randomSource,
    clock,
  });
  return { state, randomSource, clock };
}

test("Number Tile rules v1은 확정된 setup 수치와 no-overall-deadline 정책을 표현한다", () => {
  assert.deepEqual(NUMBER_TILE_RULES, {
    rulesVersion: "number-tile-rules-v1",
    tileInventoryVersion: "number-tile-inventory-v1",
    minPlayers: 2,
    maxPlayers: 4,
    initialRackSize: 14,
    initialMeldMinimumValue: 30,
    turnDurationMs: 90_000,
    jokerPenalty: 30,
  });
  assert.equal(NUMBER_TILE_RULES_VERSION, "number-tile-rules-v1");
  assert.equal(NUMBER_TILE_INVENTORY_VERSION, "number-tile-inventory-v1");
  assert.equal(Object.hasOwn(NUMBER_TILE_RULES, "gameDurationMs"), false);
});

test("initial setup은 2/3/4명에게 14장씩 deal하고 pool 78/64/50장을 남긴다", () => {
  for (const [playerCount, expectedPoolCount] of [
    [2, 78],
    [3, 64],
    [4, 50],
  ] as const) {
    const { state } = createGame(playerCount);

    assert.equal(state.racks.size, playerCount);
    assert.equal(state.pool.length, expectedPoolCount);
    assert.deepEqual(
      [...state.racks.values()].map((rack) => rack.length),
      Array.from({ length: playerCount }, () => 14),
    );
    assert.equal(state.tilesById.size, 106);
  }
});

test("initial state는 physical conservation과 Number-only player state를 확정한다", () => {
  const { state } = createGame(3);
  const locatedTileIds = [
    ...state.pool,
    ...[...state.racks.values()].flat(),
  ];

  assert.equal(locatedTileIds.length, 106);
  assert.equal(new Set(locatedTileIds).size, 106);
  assert.equal(
    locatedTileIds.every((tileId) => state.tilesById.has(tileId)),
    true,
  );
  assert.deepEqual([...state.initialMeldCompleted.values()], [
    false,
    false,
    false,
  ]);
  assert.deepEqual([...state.offlineTimeoutStreakByPlayerId.values()], [
    0, 0, 0,
  ]);
  assert.deepEqual([...state.forfeitedPlayerIds], []);
  assert.deepEqual([...state.noPlayPlayerIds], []);
  assert.deepEqual(state.table, { melds: [] });
  assert.equal(state.result, null);
  assert.equal(Object.hasOwn(state, "gameDeadlineAt"), false);
  assert.equal(Object.hasOwn(state, "connectedPlayerIds"), false);
});

test("initial setup은 Clock을 한 번만 읽고 90초 turn, revision 0, immutable order를 만든다", () => {
  const inputPlayerIds = [...players(3)];
  const randomSource = new LastIndexRandomSource();
  const clock = new CountingClock(parse(ServerTimeSchema, 50_000));
  const state = createInitialNumberTileGameState({
    playerIds: inputPlayerIds,
    idGenerator: new FakeIdGenerator(),
    randomSource,
    clock,
  });

  inputPlayerIds.reverse();

  assert.equal(clock.calls, 1);
  assert.equal(randomSource.calls, 105 + 2);
  assert.equal(state.gameId, "test-game-1");
  assert.equal(state.gameRevision, 0);
  assert.equal(state.turn.turnId, "test-turn-1");
  assert.equal(state.turn.turnNumber, 1);
  assert.equal(state.turn.startedAt, 50_000);
  assert.equal(state.turn.deadlineAt, 140_000);
  assert.deepEqual(state.turnOrder, players(3));
  assert.equal(state.turn.activePlayerId, state.turnOrder[0]);
  assert.equal(Object.isFrozen(state), true);
  assert.equal(Object.isFrozen(state.turnOrder), true);
  assert.equal(Object.isFrozen(state.pool), true);
  assert.equal([...state.racks.values()].every(Object.isFrozen), true);
  assert.equal("set" in state.tilesById, false);
  assert.equal("set" in state.racks, false);
  assert.equal("set" in state.initialMeldCompleted, false);
  assert.equal("set" in state.offlineTimeoutStreakByPlayerId, false);
  assert.equal("add" in state.forfeitedPlayerIds, false);
});

test("nontrivial injected shuffle은 repeatable한 immutable turn order와 active Player를 만든다", () => {
  const create = () =>
    createInitialNumberTileGameState({
      playerIds: players(3),
      idGenerator: new FakeIdGenerator(),
      randomSource: new ZeroIndexRandomSource(),
      clock: new CountingClock(parse(ServerTimeSchema, 50_000)),
    });

  const first = create();
  const second = create();

  assert.deepEqual(first.turnOrder, [players(3)[1], players(3)[2], players(3)[0]]);
  assert.deepEqual(second.turnOrder, first.turnOrder);
  assert.equal(first.turn.activePlayerId, first.turnOrder[0]);
  assert.equal(second.turn.activePlayerId, first.turn.activePlayerId);
  assert.equal(Object.isFrozen(first.turnOrder), true);
});

test("turn action deadline은 receivedAt < deadlineAt만 유효하다", () => {
  const deadlineAt = parse(ServerTimeSchema, 140_000);

  assert.equal(
    isNumberTileActionBeforeDeadline(
      parse(ServerTimeSchema, 139_999),
      deadlineAt,
    ),
    true,
  );
  assert.equal(
    isNumberTileActionBeforeDeadline(deadlineAt, deadlineAt),
    false,
  );
  assert.equal(
    isNumberTileActionBeforeDeadline(
      parse(ServerTimeSchema, 140_001),
      deadlineAt,
    ),
    false,
  );
});

test("initial setup은 2~4명 unique player invariant를 fail-fast한다", () => {
  const create = (playerIds: readonly PlayerId[]) =>
    createInitialNumberTileGameState({
      playerIds,
      idGenerator: new FakeIdGenerator(),
      randomSource: new LastIndexRandomSource(),
      clock: new CountingClock(parse(ServerTimeSchema, 50_000)),
    });

  assert.throws(() => create(players(1)), /requires 2-4 players/u);
  assert.throws(() => create(players(5)), /requires 2-4 players/u);
  const duplicated = playerId("duplicate-player");
  assert.throws(
    () => create([duplicated, duplicated]),
    /playerIds must be unique/u,
  );
});

test("initial setup은 RandomSource의 범위 밖 index를 fail-closed한다", () => {
  const invalidRandomSource: RandomSource = {
    nextInt(maxExclusive: number): number {
      return maxExclusive;
    },
  };

  assert.throws(
    () =>
      createInitialNumberTileGameState({
        playerIds: players(2),
        idGenerator: new FakeIdGenerator(),
        randomSource: invalidRandomSource,
        clock: new CountingClock(parse(ServerTimeSchema, 50_000)),
      }),
    /outside the Number Tile shuffle range/u,
  );
});

test("initial setup은 runtime-corrupt player/game/turn ID를 fail-closed한다", () => {
  const create = (
    playerIds: readonly PlayerId[],
    idGenerator: FakeIdGenerator,
  ) =>
    createInitialNumberTileGameState({
      playerIds,
      idGenerator,
      randomSource: new LastIndexRandomSource(),
      clock: new CountingClock(parse(ServerTimeSchema, 50_000)),
    });

  assert.throws(
    () => create(["" as PlayerId, players(2)[1]!], new FakeIdGenerator()),
    /Identifier must not be empty/u,
  );

  class InvalidGameIdGenerator extends FakeIdGenerator {
    override generateGameId(): GameId {
      return "" as GameId;
    }
  }
  assert.throws(
    () => create(players(2), new InvalidGameIdGenerator()),
    /Identifier must not be empty/u,
  );

  class InvalidTurnIdGenerator extends FakeIdGenerator {
    override generateTurnId(): TurnId {
      return "" as TurnId;
    }
  }
  assert.throws(
    () => create(players(2), new InvalidTurnIdGenerator()),
    /Identifier must not be empty/u,
  );
});

test("90초 turn deadline이 safe integer 범위를 넘으면 fail-closed한다", () => {
  const nearMaximum = parse(
    ServerTimeSchema,
    Number.MAX_SAFE_INTEGER - 45_000,
  );

  assert.throws(
    () =>
      createInitialNumberTileGameState({
        playerIds: players(2),
        idGenerator: new FakeIdGenerator(),
        randomSource: new LastIndexRandomSource(),
        clock: new CountingClock(nearMaximum),
      }),
    /deadline must be a safe integer/u,
  );
});
