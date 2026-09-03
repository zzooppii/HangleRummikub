import assert from "node:assert/strict";
import test from "node:test";

import {
  PlayerIdSchema,
  ServerTimeSchema,
  type PlayerId,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { FakeClock, FakeIdGenerator } from "../../infrastructure/system.js";
import type { RandomSource } from "../../ports/system.js";
import {
  DICTIONARY_VERSION,
  JOKER_RULES_VERSION,
  RULES_VERSION,
  cloneGameState,
  createDefaultRulesConfig,
  createInitialGameState,
  fisherYatesShuffle,
  type RulesConfig,
} from "./game-state.js";
import { TILE_INVENTORY_VERSION } from "./tile-inventory.js";

class LastIndexRandomSource implements RandomSource {
  calls = 0;

  nextInt(maxExclusive: number): number {
    this.calls += 1;
    return maxExclusive - 1;
  }
}

class ZeroRandomSource implements RandomSource {
  calls = 0;

  nextInt(_maxExclusive: number): number {
    this.calls += 1;
    return 0;
  }
}

class SequenceRandomSource implements RandomSource {
  #index = 0;

  constructor(private readonly values: readonly number[]) {}

  nextInt(_maxExclusive: number): number {
    const value = this.values[this.#index];
    if (value === undefined) {
      throw new Error("Sequence exhausted.");
    }
    this.#index += 1;
    return value;
  }
}

function playerId(value: string): PlayerId {
  return parse(PlayerIdSchema, value);
}

function players(count: number): readonly PlayerId[] {
  return Array.from({ length: count }, (_value, index) =>
    playerId(`player-${index + 1}`),
  );
}

function createGame(
  playerCount: number,
  randomSource: RandomSource = new LastIndexRandomSource(),
) {
  return createInitialGameState({
    playerIds: players(playerCount),
    startedAt: new FakeClock(10_000).now(),
    idGenerator: new FakeIdGenerator(),
    randomSource,
  });
}

test("RulesConfig v1은 확정된 version과 수치를 fresh immutable snapshot으로 만든다", () => {
  const first = createDefaultRulesConfig();
  const second = createDefaultRulesConfig();

  assert.deepEqual(first, {
    rulesVersion: RULES_VERSION,
    dictionaryVersion: DICTIONARY_VERSION,
    tileInventoryVersion: TILE_INVENTORY_VERSION,
    minPlayers: 2,
    maxPlayers: 4,
    turnDurationMs: 60_000,
    gameDurationMs: 1_500_000,
    initialRack: { consonants: 7, vowels: 7 },
    initialMeld: { minimumTileCount: 6, minimumWordSyllables: 2 },
    timeoutPenaltyTileCount: 3,
    jokerRulesVersion: JOKER_RULES_VERSION,
  });
  assert.notEqual(first, second);
  assert.notEqual(first.initialRack, second.initialRack);
  assert.notEqual(first.initialMeld, second.initialMeld);
  assert.ok(Object.isFrozen(first));
  assert.ok(Object.isFrozen(first.initialRack));
  assert.ok(Object.isFrozen(first.initialMeld));
});

test("Fisher-Yates는 RandomSource를 범위별 한 번 사용하고 입력을 mutate하지 않는다", () => {
  const input = Object.freeze(["A", "B", "C", "D"]);
  const result = fisherYatesShuffle(
    input,
    new SequenceRandomSource([1, 0, 1]),
  );

  assert.deepEqual(result, ["C", "D", "A", "B"]);
  assert.deepEqual(input, ["A", "B", "C", "D"]);
  assert.ok(Object.isFrozen(result));
});

test("Fisher-Yates는 contract 밖 RandomSource 출력을 거절한다", () => {
  assert.throws(
    () =>
      fisherYatesShuffle(["A", "B"], {
        nextInt: () => 2,
      }),
    /outside the Fisher-Yates range/u,
  );
});

for (const [playerCount, consonants, vowels] of [
  [2, 81, 47],
  [3, 74, 40],
  [4, 67, 33],
] as const) {
  test(`${playerCount}명 시작은 각 rack 7+7과 bag ${consonants}/${vowels}를 만든다`, () => {
    const game = createGame(playerCount);
    const expectedPlayers = players(playerCount);

    assert.equal(game.consonantBag.length, consonants);
    assert.equal(game.vowelBag.length, vowels);
    assert.equal(game.racks.size, playerCount);
    assert.deepEqual(game.turnOrder, expectedPlayers);
    assert.equal(new Set(game.turnOrder).size, playerCount);
    assert.equal(game.turn.activePlayerId, expectedPlayers[0]);

    const locatedTileIds = [
      ...game.consonantBag,
      ...game.vowelBag,
      ...[...game.racks.values()].flat(),
    ];
    assert.equal(locatedTileIds.length, 156);
    assert.equal(new Set(locatedTileIds).size, 156);

    for (const rack of game.racks.values()) {
      assert.equal(rack.length, 14);
      assert.ok(
        rack
          .slice(0, 7)
          .every((tileId) => game.tilesById.get(tileId)?.sourceBag === "CONSONANT"),
      );
      assert.ok(
        rack
          .slice(7)
          .every((tileId) => game.tilesById.get(tileId)?.sourceBag === "VOWEL"),
      );
    }
  });
}

test("initial GameState는 156 Tile conservation과 unique location을 보존한다", () => {
  const game = createGame(4);
  const locatedTileIds = [
    ...game.consonantBag,
    ...game.vowelBag,
    ...[...game.racks.values()].flat(),
  ];

  assert.equal(game.tilesById.size, 156);
  assert.equal(locatedTileIds.length, 156);
  assert.equal(new Set(locatedTileIds).size, 156);
  assert.deepEqual(
    new Set(locatedTileIds),
    new Set(game.tilesById.keys()),
  );
  assert.equal(game.board.wordGroups.length, 0);
});

test("affiliated Joker가 deal되면 별도 bonus 없이 각 source bag의 7회 중 하나다", () => {
  const game = createGame(2, new LastIndexRandomSource());
  const firstRack = game.racks.get(playerId("player-1"));
  assert.ok(firstRack);

  const firstPlayerJokers = firstRack
    .map((tileId) => game.tilesById.get(tileId))
    .filter((tile) => tile?.kind === "JOKER");

  assert.equal(firstRack.length, 14);
  assert.deepEqual(
    firstPlayerJokers.map((tile) => tile?.sourceBag),
    ["CONSONANT", "VOWEL"],
  );
  assert.equal(
    [...game.racks.values()]
      .flat()
      .map((tileId) => game.tilesById.get(tileId))
      .filter((tile) => tile?.kind === "JOKER").length,
    2,
  );
});

test("Player turnOrder는 server RandomSource로 한 번 shuffle되고 첫 Turn이 1부터 시작한다", () => {
  const randomSource = new ZeroRandomSource();
  const game = createGame(4, randomSource);

  assert.deepEqual(game.turnOrder, [
    playerId("player-2"),
    playerId("player-3"),
    playerId("player-4"),
    playerId("player-1"),
  ]);
  assert.equal(new Set(game.turnOrder).size, 4);
  assert.equal(game.turn.activePlayerId, game.turnOrder[0]);
  assert.equal(game.turn.turnNumber, 1);
  assert.equal(game.turn.startedAt, 10_000);
  assert.equal(game.turn.deadlineAt, 70_000);
  assert.equal(game.gameStartedAt, 10_000);
  assert.equal(game.gameDeadlineAt, 1_510_000);
  assert.equal(randomSource.calls, 94 + 60 + 3);
});

test("새 Game은 gameRevision 0, empty Board, 모든 initial meld false로 시작한다", () => {
  const game = createGame(3);

  assert.equal(game.gameId, "test-game-1");
  assert.equal(game.gameRevision, 0);
  assert.equal(game.turn.turnId, "test-turn-1");
  assert.deepEqual(game.board, { wordGroups: [] });
  assert.deepEqual([...game.initialMeldCompleted], [
    [playerId("player-1"), false],
    [playerId("player-2"), false],
    [playerId("player-3"), false],
  ]);
  assert.deepEqual([...game.offlineTimeoutStreakByPlayerId], [
    [playerId("player-1"), 0],
    [playerId("player-2"), 0],
    [playerId("player-3"), 0],
  ]);
  assert.deepEqual([...game.forfeitedPlayerIds], []);
});

test("creation은 caller의 ordered Player/RulesConfig 참조를 보관하지 않는다", () => {
  const mutablePlayerIds = [playerId("player-1"), playerId("player-2")];
  const mutableInitialRack = { consonants: 7, vowels: 7 };
  const mutableInitialMeld = {
    minimumTileCount: 6,
    minimumWordSyllables: 2,
  };
  const rulesConfig: RulesConfig = {
    ...createDefaultRulesConfig(),
    initialRack: mutableInitialRack,
    initialMeld: mutableInitialMeld,
  };
  const game = createInitialGameState({
    playerIds: mutablePlayerIds,
    startedAt: parse(ServerTimeSchema, 0),
    idGenerator: new FakeIdGenerator(),
    randomSource: new LastIndexRandomSource(),
    rulesConfig,
  });

  mutablePlayerIds.reverse();
  mutableInitialRack.consonants = 1;
  mutableInitialMeld.minimumTileCount = 1;

  assert.deepEqual(game.turnOrder, [playerId("player-1"), playerId("player-2")]);
  assert.equal(game.rulesConfig.initialRack.consonants, 7);
  assert.equal(game.rulesConfig.initialMeld.minimumTileCount, 6);
  assert.ok(Object.isFrozen(game));
  assert.ok(Object.isFrozen(game.turnOrder));
  assert.ok(Object.isFrozen(game.turn));
  assert.ok(Object.isFrozen(game.board));
  assert.ok(Object.isFrozen(game.board.wordGroups));
  assert.ok(Object.isFrozen(game.consonantBag));
  assert.ok(Object.isFrozen(game.vowelBag));
  assert.ok(Object.isFrozen(game.tilesById));
  assert.ok(Object.isFrozen(game.racks));
  assert.ok(Object.isFrozen(game.initialMeldCompleted));
  assert.ok(Object.isFrozen(game.offlineTimeoutStreakByPlayerId));
  assert.ok(Object.isFrozen(game.forfeitedPlayerIds));
  assert.ok([...game.racks.values()].every(Object.isFrozen));
});

test("cloneGameState는 nested canonical collections를 detached copy로 만든다", () => {
  const original = createGame(2);
  const clone = cloneGameState(original);

  assert.deepEqual(clone, original);
  assert.notEqual(clone, original);
  assert.notEqual(clone.rulesConfig, original.rulesConfig);
  assert.notEqual(clone.rulesConfig.initialRack, original.rulesConfig.initialRack);
  assert.notEqual(clone.tilesById, original.tilesById);
  assert.notEqual(clone.consonantBag, original.consonantBag);
  assert.notEqual(clone.vowelBag, original.vowelBag);
  assert.notEqual(clone.racks, original.racks);
  assert.notEqual(clone.initialMeldCompleted, original.initialMeldCompleted);
  assert.notEqual(
    clone.offlineTimeoutStreakByPlayerId,
    original.offlineTimeoutStreakByPlayerId,
  );
  assert.notEqual(clone.forfeitedPlayerIds, original.forfeitedPlayerIds);
  assert.notEqual(clone.turnOrder, original.turnOrder);
  assert.notEqual(clone.turn, original.turn);
  assert.notEqual(clone.board, original.board);

  const cloneRacks = clone.racks as Map<PlayerId, readonly TileId[]>;
  cloneRacks.set(playerId("player-1"), Object.freeze([]));
  assert.equal(original.racks.get(playerId("player-1"))?.length, 14);
});

test("cloneGameState는 timeout streak와 forfeit rotation 불변 조건을 검증한다", () => {
  const original = createGame(2);

  assert.throws(() =>
    cloneGameState({
      ...original,
      offlineTimeoutStreakByPlayerId: new Map([
        [original.turnOrder[0]!, 0],
      ]),
    }),
  );
  assert.throws(() =>
    cloneGameState({
      ...original,
      offlineTimeoutStreakByPlayerId: new Map(
        original.turnOrder.map((id) => [id, 3]),
      ),
    }),
  );
  assert.throws(() =>
    cloneGameState({
      ...original,
      forfeitedPlayerIds: new Set([original.turn.activePlayerId]),
    }),
  );
  assert.throws(() =>
    cloneGameState({
      ...original,
      forfeitedPlayerIds: new Set([playerId("unknown-player")]),
    }),
  );
});

test("2명 미만, 4명 초과 또는 duplicate Player로 Game을 만들 수 없다", () => {
  for (const invalidPlayers of [
    players(1),
    players(5),
    [playerId("same-player"), playerId("same-player")],
  ]) {
    assert.throws(() =>
      createInitialGameState({
        playerIds: invalidPlayers,
        startedAt: parse(ServerTimeSchema, 0),
        idGenerator: new FakeIdGenerator(),
        randomSource: new LastIndexRandomSource(),
      }),
    );
  }
});
