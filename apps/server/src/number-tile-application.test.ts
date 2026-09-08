import assert from "node:assert/strict";
import test from "node:test";

import {
  GameIdSchema,
  GameRevisionSchema,
  NicknameSchema,
  NumberTileFinishedProjectionV2Schema,
  NumberTilePlayingProjectionV2Schema,
  PlayerIdSchema,
  PresenceVersionSchema,
  RequestIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  TileIdSchema,
  TurnIdSchema,
  type NumberTileColor,
  type NumberTileNumber,
  type NumberTileProposedTable,
  type PlayerId,
  type RoomId,
  type ServerTime,
  type TileId,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import { RoomCleanupService } from "./application/room-cleanup-service.js";
import { RoomLeaveService } from "./application/room-leave-service.js";
import {
  ROOM_RETENTION_MS,
} from "./application/room-presence-policy-service.js";
import { RoomRetentionService } from "./application/room-retention-service.js";
import type { RoomMutationSerialExecutor } from "./application/room-session-service.js";
import { ScheduledTurnRouter } from "./application/scheduled-turn-router.js";
import { GameRegistry } from "./games/game-registry.js";
import { LegacyHangulV1CommandRouter } from "./games/hangul-tile/compatibility/legacy-hangul-v1-command-router.js";
import { NumberTileCommandRouter } from "./games/number-tile/application/number-tile-command-router.js";
import { NumberTileDrawService } from "./games/number-tile/application/number-tile-draw-service.js";
import { NumberTilePassService } from "./games/number-tile/application/number-tile-pass-service.js";
import {
  applyNumberTilePlayingLeave,
  planNumberTilePresenceRestored,
} from "./games/number-tile/application/number-tile-player-lifecycle-actions.js";
import { NumberTileStartService } from "./games/number-tile/application/number-tile-start-service.js";
import {
  NumberTileSubmitService,
  createNumberTileSubmitFingerprint,
} from "./games/number-tile/application/number-tile-submit-service.js";
import { NumberTileTimeoutService } from "./games/number-tile/application/number-tile-timeout-service.js";
import { projectNumberTileV2Game } from "./games/number-tile/compatibility/number-tile-v2-game-projector.js";
import { NumberTileGameStateAdapter } from "./games/number-tile/compatibility/number-tile-game-state-adapter.js";
import type { PlayingNumberTileGameState } from "./games/number-tile/domain/game-state.js";
import type { OrdinaryNumberTile } from "./games/number-tile/domain/tile.js";
import {
  NUMBER_TILE_GAME_TYPE,
  createNumberTileRegistration,
} from "./games/number-tile/number-tile-registration.js";
import { ConnectionRegistry } from "./infrastructure/connection-registry.js";
import { ConnectionRegistryPresenceReader } from "./infrastructure/connection-registry-presence-reader.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "./infrastructure/keyed-serial-executor.js";
import { OverdueTurnSweeper } from "./infrastructure/overdue-turn-sweeper.js";
import { FakeClock, FakeIdGenerator } from "./infrastructure/system.js";
import {
  createStorageRevision,
  createUnboundSessionRecord,
  type NumberTileRoomRecord,
} from "./model/persistence.js";
import type {
  RandomSource,
  ScheduledTurnDeadline,
  TurnScheduler,
} from "./ports/system.js";

class ImmediateRoomLane implements RoomMutationSerialExecutor {
  run<TResult>(
    _roomId: RoomId,
    task: () => Promise<TResult>,
  ): Promise<TResult> {
    return task();
  }
}

const immediateRoomLane = new ImmediateRoomLane();

const alwaysCurrent = Object.freeze({ isCurrent: () => true });

test("Number Submit fingerprint는 bare Joker physical identity와 ordered role position을 보존한다", () => {
  const currentRevision = v.parse(GameRevisionSchema, 4);
  const currentTurnId = v.parse(TurnIdSchema, "number-fingerprint-turn");
  const joker = v.parse(TileIdSchema, "number-fingerprint-joker");
  const redFive = v.parse(TileIdSchema, "number-fingerprint-red-5");
  const redSix = v.parse(TileIdSchema, "number-fingerprint-red-6");
  const leading = createNumberTileSubmitFingerprint(
    currentRevision,
    currentTurnId,
    {
      melds: [{
        kind: "RUN",
        tiles: [
          { tileId: joker, kind: "JOKER" },
          { tileId: redFive, kind: "ORDINARY" },
          { tileId: redSix, kind: "ORDINARY" },
        ],
      }],
    },
  );
  const trailing = createNumberTileSubmitFingerprint(
    currentRevision,
    currentTurnId,
    {
      melds: [{
        kind: "RUN",
        tiles: [
          { tileId: redFive, kind: "ORDINARY" },
          { tileId: redSix, kind: "ORDINARY" },
          { tileId: joker, kind: "JOKER" },
        ],
      }],
    },
  );

  assert.doesNotMatch(leading, /assignedNumber|assignedColor/u);
  assert.notEqual(leading, trailing);
  assert.match(leading, /number-fingerprint-joker/u);
});

class LastIndexRandomSource implements RandomSource {
  calls = 0;

  nextInt(maxExclusive: number): number {
    this.calls += 1;
    return maxExclusive - 1;
  }
}

class RecordingTurnScheduler implements TurnScheduler {
  readonly deadlines: ScheduledTurnDeadline[] = [];

  async scheduleTimeout(deadline: ScheduledTurnDeadline): Promise<void> {
    this.deadlines.push(deadline);
  }

  async cancelTimeout(): Promise<void> {}
}

function playerId(value: string): PlayerId {
  return v.parse(PlayerIdSchema, value);
}

function roomId(value: string): RoomId {
  return v.parse(RoomIdSchema, value);
}

function serverTime(value: number): ServerTime {
  return v.parse(ServerTimeSchema, value);
}

const allPlayers = Object.freeze([
  Object.freeze({
    playerId: playerId("number-app-a"),
    nickname: v.parse(NicknameSchema, "NumberA"),
    joinOrder: 0,
  }),
  Object.freeze({
    playerId: playerId("number-app-b"),
    nickname: v.parse(NicknameSchema, "NumberB"),
    joinOrder: 1,
  }),
  Object.freeze({
    playerId: playerId("number-app-c"),
    nickname: v.parse(NicknameSchema, "NumberC"),
    joinOrder: 2,
  }),
  Object.freeze({
    playerId: playerId("number-app-d"),
    nickname: v.parse(NicknameSchema, "NumberD"),
    joinOrder: 3,
  }),
]);

type TestPlayer = (typeof allPlayers)[number];

const players = Object.freeze(allPlayers.slice(0, 2));

function lobbyCandidate(currentPlayers = players) {
  return Object.freeze({
    roomId: roomId("number-app-room"),
    roomCode: v.parse(RoomCodeSchema, "BCDFGH"),
    gameType: NUMBER_TILE_GAME_TYPE,
    phase: "LOBBY" as const,
    hostPlayerId: currentPlayers[0]!.playerId,
    players: currentPlayers,
    game: null,
    roomRevision: v.parse(RoomRevisionSchema, 1),
    createdAt: serverTime(1_000),
    updatedAt: serverTime(1_000),
  });
}

type StartedHarness = Readonly<{
  persistence: InMemoryPersistence;
  clock: FakeClock;
  idGenerator: FakeIdGenerator;
  randomSource: LastIndexRandomSource;
  scheduler: RecordingTurnScheduler;
  players: readonly TestPlayer[];
  room: NumberTileRoomRecord & Readonly<{ game: PlayingNumberTileGameState }>;
}>;

type PlayingNumberRoom = NumberTileRoomRecord &
  Readonly<{ game: PlayingNumberTileGameState }>;

async function createStartedHarness(playerCount = 2): Promise<StartedHarness> {
  const currentPlayers = Object.freeze(allPlayers.slice(0, playerCount));
  const lobby = lobbyCandidate(currentPlayers);
  const persistence = new InMemoryPersistence();
  assert.equal(
    (await persistence.createIfAbsent(lobby)).status,
    "CREATED",
  );
  const clock = new FakeClock(10_000);
  const idGenerator = new FakeIdGenerator();
  const randomSource = new LastIndexRandomSource();
  const scheduler = new RecordingTurnScheduler();
  const startService = new NumberTileStartService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor: immediateRoomLane,
    presenceLeaseReader: {
      acquireRoomPresenceLease: async () => ({
        presenceVersion: v.parse(PresenceVersionSchema, 1),
        connectionStatusByPlayerId: new Map(
          currentPlayers.map(
            (player) => [player.playerId, "CONNECTED"] as const,
          ),
        ),
        isCurrent: () => true,
      }),
    },
    clock,
    idGenerator,
    randomSource,
    gameRegistrationReader: new GameRegistry([
      createNumberTileRegistration(),
    ]),
    turnScheduler: scheduler,
  });
  const started = await startService.start({
    roomId: lobby.roomId,
    actorPlayerId: currentPlayers[0]!.playerId,
    requestId: v.parse(RequestIdSchema, "number-start-1"),
    expectedRoomRevision: lobby.roomRevision,
    authorization: alwaysCurrent,
  });
  assert.equal(started.ok, true);

  const room = await persistence.findById(lobby.roomId);
  if (
    room?.gameType !== NUMBER_TILE_GAME_TYPE ||
    room.phase !== "PLAYING" ||
    room.game === null ||
    room.game.turn === null ||
    room.game.result !== null
  ) {
    throw new Error("Expected an active canonical Number Tile Room.");
  }
  return {
    persistence,
    clock,
    idGenerator,
    randomSource,
    scheduler,
    players: currentPlayers,
    room: Object.freeze({ ...room, game: room.game }),
  };
}

function requireOrdinaryTileId(
  game: PlayingNumberTileGameState,
  color: NumberTileColor,
  number: NumberTileNumber,
  usedTileIds: Set<TileId>,
): TileId {
  const tile = [...game.tilesById.values()].find(
    (candidate): candidate is OrdinaryNumberTile =>
      candidate.kind === "ORDINARY" &&
      candidate.color === color &&
      candidate.number === number &&
      !usedTileIds.has(candidate.tileId),
  );
  if (tile === undefined) {
    throw new Error(`Missing Number Tile fixture face ${color} ${number}.`);
  }
  usedTileIds.add(tile.tileId);
  return tile.tileId;
}

function requireJokerTileId(
  game: PlayingNumberTileGameState,
  usedTileIds: Set<TileId>,
): TileId {
  const tile = [...game.tilesById.values()].find(
    (candidate) =>
      candidate.kind === "JOKER" && !usedTileIds.has(candidate.tileId),
  );
  if (tile === undefined) {
    throw new Error("Missing Number Tile Joker fixture.");
  }
  usedTileIds.add(tile.tileId);
  return tile.tileId;
}

function ordinaryPlacement(tileId: TileId) {
  return Object.freeze({ tileId, kind: "ORDINARY" as const });
}

function makeInitialValue30Table(
  game: PlayingNumberTileGameState,
): Readonly<{ table: NumberTileProposedTable; tileIds: readonly TileId[] }> {
  const used = new Set<TileId>();
  const redRun = ([4, 5, 6] as const).map((number) =>
    requireOrdinaryTileId(game, "RED", number, used),
  );
  const fiveGroup = (["BLUE", "BLACK", "ORANGE"] as const).map((color) =>
    requireOrdinaryTileId(game, color, 5, used),
  );
  const tileIds = Object.freeze([...redRun, ...fiveGroup]);
  return Object.freeze({
    tileIds,
    table: {
      melds: [
        {
          kind: "RUN" as const,
          tiles: redRun.map(ordinaryPlacement),
        },
        {
          kind: "GROUP" as const,
          tiles: fiveGroup.map(ordinaryPlacement),
        },
      ],
    },
  });
}

function makeInitialValue29Table(
  game: PlayingNumberTileGameState,
): Readonly<{ table: NumberTileProposedTable; tileIds: readonly TileId[] }> {
  const used = new Set<TileId>();
  const redRun = ([2, 3, 4] as const).map((number) =>
    requireOrdinaryTileId(game, "RED", number, used),
  );
  const fiveGroup = (["RED", "BLUE", "BLACK", "ORANGE"] as const).map(
    (color) => requireOrdinaryTileId(game, color, 5, used),
  );
  const tileIds = Object.freeze([...redRun, ...fiveGroup]);
  return Object.freeze({
    tileIds,
    table: {
      melds: [
        {
          kind: "RUN" as const,
          tiles: redRun.map(ordinaryPlacement),
        },
        {
          kind: "GROUP" as const,
          tiles: fiveGroup.map(ordinaryPlacement),
        },
      ],
    },
  });
}

function makeRunTable(
  game: PlayingNumberTileGameState,
  color: NumberTileColor,
  numbers: readonly [NumberTileNumber, NumberTileNumber, NumberTileNumber],
): Readonly<{ table: NumberTileProposedTable; tileIds: readonly TileId[] }> {
  const used = new Set<TileId>();
  const tileIds = Object.freeze(
    numbers.map((number) =>
      requireOrdinaryTileId(game, color, number, used),
    ),
  );
  return Object.freeze({
    tileIds,
    table: {
      melds: [
        {
          kind: "RUN" as const,
          tiles: tileIds.map(ordinaryPlacement),
        },
      ],
    },
  });
}

function reallocatePlayingGame(
  game: PlayingNumberTileGameState,
  seedRackTileIds: ReadonlyMap<PlayerId, readonly TileId[]>,
  options: Readonly<{
    poolEmpty: boolean;
    table?: NumberTileProposedTable;
  }>,
): PlayingNumberTileGameState {
  const used = new Set<TileId>();
  const table = options.table ?? { melds: [] };
  for (const placement of table.melds.flatMap((meld) => meld.tiles)) {
    if (!game.tilesById.has(placement.tileId) || used.has(placement.tileId)) {
      throw new Error("Number Tile fixture Table is invalid.");
    }
    used.add(placement.tileId);
  }
  const racks = new Map<PlayerId, TileId[]>();
  for (const playerId of game.turnOrder) {
    const seed = [...(seedRackTileIds.get(playerId) ?? [])];
    for (const tileId of seed) {
      if (!game.tilesById.has(tileId) || used.has(tileId)) {
        throw new Error("Number Tile fixture rack seed is invalid.");
      }
      used.add(tileId);
    }
    racks.set(playerId, seed);
  }

  const remaining = [...game.tilesById.keys()].filter(
    (tileId) => !used.has(tileId),
  );
  for (const playerId of game.turnOrder) {
    const rack = racks.get(playerId)!;
    if (rack.length === 0) {
      const tileId = remaining.shift();
      if (tileId === undefined) {
        throw new Error("Number Tile fixture could not keep every rack non-empty.");
      }
      rack.push(tileId);
    }
  }

  let pool: readonly TileId[];
  if (options.poolEmpty) {
    const sinkPlayerId = game.turnOrder.at(-1)!;
    racks.get(sinkPlayerId)!.push(...remaining);
    pool = Object.freeze([]);
  } else {
    for (const playerId of game.turnOrder) {
      const rack = racks.get(playerId)!;
      while (rack.length < 14) {
        const tileId = remaining.shift();
        if (tileId === undefined) {
          throw new Error("Number Tile fixture ran out of rack fillers.");
        }
        rack.push(tileId);
      }
    }
    pool = Object.freeze(remaining);
  }

  return Object.freeze({
    ...game,
    pool,
    racks: new Map(
      [...racks].map(([playerId, rack]) => [
        playerId,
        Object.freeze(rack),
      ] as const),
    ),
    table,
    noPlayPlayerIds: Object.freeze([]),
  });
}

async function replacePlayingGame(
  persistence: InMemoryPersistence,
  room: PlayingNumberRoom,
  game: PlayingNumberTileGameState,
): Promise<PlayingNumberRoom> {
  const replaced = await persistence.replace({
    candidate: Object.freeze({ ...room, game }),
    expectedRoomRevision: room.roomRevision,
    expectedStorageRevision: room.storageRevision,
  });
  assert.equal(replaced.status, "REPLACED");
  const stored = await persistence.findById(room.roomId);
  if (
    stored?.gameType !== NUMBER_TILE_GAME_TYPE ||
    stored.phase !== "PLAYING" ||
    stored.game === null ||
    stored.game.turn === null ||
    stored.game.result !== null
  ) {
    throw new Error("Expected a replaced active Number Tile Room.");
  }
  return Object.freeze({ ...stored, game: stored.game });
}

function createSubmitService(harness: StartedHarness): NumberTileSubmitService {
  return new NumberTileSubmitService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: immediateRoomLane,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
    turnScheduler: harness.scheduler,
  });
}

function createDrawService(harness: StartedHarness): NumberTileDrawService {
  return new NumberTileDrawService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: immediateRoomLane,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
    randomSource: harness.randomSource,
    turnScheduler: harness.scheduler,
  });
}

function createPassService(harness: StartedHarness): NumberTilePassService {
  return new NumberTilePassService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: immediateRoomLane,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
    turnScheduler: harness.scheduler,
  });
}

test("Number start creates the 2-player canonical state and schedules only its 90-second Turn", async () => {
  const harness = await createStartedHarness();
  const { game } = harness.room;

  assert.equal(game.gameRevision, 0);
  assert.equal(game.pool.length, 78);
  assert.deepEqual([...game.racks.values()].map((rack) => rack.length), [14, 14]);
  assert.deepEqual([...game.initialMeldCompleted.values()], [false, false]);
  assert.deepEqual([...game.offlineTimeoutStreakByPlayerId.values()], [0, 0]);
  assert.equal(game.turn.deadlineAt - game.turn.startedAt, 90_000);
  assert.equal(harness.scheduler.deadlines.length, 1);
  assert.equal(Object.hasOwn(game, "gameDeadlineAt"), false);
});

test("Number start deals 14 Tiles each and leaves canonical pool counts for 3 and 4 Players", async (t) => {
  for (const [playerCount, expectedPoolCount] of [
    [3, 64],
    [4, 50],
  ] as const) {
    await t.test(`${playerCount} Players`, async () => {
      const harness = await createStartedHarness(playerCount);
      assert.equal(harness.room.game.pool.length, expectedPoolCount);
      assert.deepEqual(
        [...harness.room.game.racks.values()].map((rack) => rack.length),
        Array.from({ length: playerCount }, () => 14),
      );
      assert.equal(harness.room.game.turnOrder.length, playerCount);
      assert.equal(harness.scheduler.deadlines.length, 1);
      assert.equal(
        harness.room.game.turn.deadlineAt -
          harness.room.game.turn.startedAt,
        90_000,
      );
    });
  }
});

test("Number start fails PLAYERS_NOT_CONNECTED atomically when its all-connected presence lease becomes stale before commit", async () => {
  const lobby = lobbyCandidate();
  const persistence = new InMemoryPersistence();
  assert.equal((await persistence.createIfAbsent(lobby)).status, "CREATED");
  const before = await persistence.findById(lobby.roomId);
  assert.notEqual(before, null);
  const scheduler = new RecordingTurnScheduler();
  const requestId = v.parse(RequestIdSchema, "number-start-stale-presence");
  let leaseChecks = 0;
  const service = new NumberTileStartService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor: immediateRoomLane,
    presenceLeaseReader: {
      acquireRoomPresenceLease: async () => ({
        presenceVersion: v.parse(PresenceVersionSchema, 1),
        connectionStatusByPlayerId: new Map(
          players.map(
            (player) => [player.playerId, "CONNECTED"] as const,
          ),
        ),
        isCurrent: () => {
          leaseChecks += 1;
          return leaseChecks === 1;
        },
      }),
    },
    clock: new FakeClock(10_000),
    idGenerator: new FakeIdGenerator(),
    randomSource: new LastIndexRandomSource(),
    gameRegistrationReader: new GameRegistry([
      createNumberTileRegistration(),
    ]),
    turnScheduler: scheduler,
  });
  const result = await service.start({
    roomId: lobby.roomId,
    actorPlayerId: lobby.hostPlayerId,
    requestId,
    expectedRoomRevision: lobby.roomRevision,
    authorization: alwaysCurrent,
  });
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Expected stale Number start presence to fail.");
  }
  assert.equal(result.error.code, "PLAYERS_NOT_CONNECTED");
  assert.equal(leaseChecks >= 3, true);

  const after = await persistence.findById(lobby.roomId);
  assert.deepEqual(after, before);
  assert.equal(after?.phase, "LOBBY");
  assert.equal(after?.game, null);
  assert.equal(after?.roomRevision, lobby.roomRevision);
  assert.equal(scheduler.deadlines.length, 0);
  assert.equal(
    (
      await persistence.classify(
        `room-player:${lobby.roomId}:${lobby.hostPlayerId}`,
        requestId,
        JSON.stringify(["game:start", lobby.roomRevision]),
      )
    ).status,
    "MISS",
  );
});

test("Number Draw is server-selected, advances once, and an idempotent replay cannot draw twice", async () => {
  const harness = await createStartedHarness();
  const before = harness.room.game;
  const actorPlayerId = before.turn.activePlayerId;
  const drawService = new NumberTileDrawService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: immediateRoomLane,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
    randomSource: harness.randomSource,
    turnScheduler: harness.scheduler,
  });
  const input = Object.freeze({
    roomId: harness.room.roomId,
    actorPlayerId,
    requestId: v.parse(RequestIdSchema, "number-draw-1"),
    expectedGameRevision: before.gameRevision,
    turnId: before.turn.turnId,
    receivedAt: before.turn.startedAt,
    authorization: alwaysCurrent,
  });

  const first = await drawService.draw(input);
  const replay = await drawService.draw(input);
  assert.deepEqual(replay, first);
  assert.equal(first.ok, true);

  const stored = await harness.persistence.findById(harness.room.roomId);
  if (
    stored?.gameType !== NUMBER_TILE_GAME_TYPE ||
    stored.game === null ||
    stored.game.turn === null
  ) {
    throw new Error("Expected Number Draw to preserve active play.");
  }
  assert.equal(stored.game.pool.length, before.pool.length - 1);
  assert.equal(stored.game.racks.get(actorPlayerId)?.length, 15);
  assert.equal(stored.game.gameRevision, 1);
  assert.notEqual(stored.game.turn.turnId, before.turn.turnId);
});

test("Number Draw rejects an empty pool, stale revision, and deadline equality without consuming randomness or state", async (t) => {
  await t.test("empty pool", async () => {
    const harness = await createStartedHarness();
    const activePlayerId = harness.room.game.turn.activePlayerId;
    const game = reallocatePlayingGame(
      harness.room.game,
      new Map([
        [activePlayerId, [harness.room.game.racks.get(activePlayerId)![0]!]],
      ]),
      { poolEmpty: true },
    );
    const room = await replacePlayingGame(
      harness.persistence,
      harness.room,
      game,
    );
    const randomCallsBefore = harness.randomSource.calls;
    const result = await createDrawService(harness).draw({
      roomId: room.roomId,
      actorPlayerId: activePlayerId,
      requestId: v.parse(RequestIdSchema, "number-draw-empty"),
      expectedGameRevision: room.game.gameRevision,
      turnId: room.game.turn.turnId,
      receivedAt: room.game.turn.startedAt,
      authorization: alwaysCurrent,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected an empty Number pool to reject Draw.");
    }
    assert.equal(result.error.code, "POOL_EMPTY");
    assert.equal(harness.randomSource.calls, randomCallsBefore);
    const stored = await harness.persistence.findById(room.roomId);
    assert.equal(stored?.storageRevision, room.storageRevision);
  });

  await t.test("stale revision", async () => {
    const harness = await createStartedHarness();
    const room = harness.room;
    const randomCallsBefore = harness.randomSource.calls;
    const result = await createDrawService(harness).draw({
      roomId: room.roomId,
      actorPlayerId: room.game.turn.activePlayerId,
      requestId: v.parse(RequestIdSchema, "number-draw-stale"),
      expectedGameRevision: v.parse(
        GameRevisionSchema,
        room.game.gameRevision + 1,
      ),
      turnId: room.game.turn.turnId,
      receivedAt: room.game.turn.startedAt,
      authorization: alwaysCurrent,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected stale Number Draw to fail.");
    }
    assert.equal(result.error.code, "STALE_GAME_REVISION");
    assert.equal(harness.randomSource.calls, randomCallsBefore);
    const stored = await harness.persistence.findById(room.roomId);
    assert.equal(stored?.storageRevision, room.storageRevision);
  });

  await t.test("deadline equality", async () => {
    const harness = await createStartedHarness();
    const room = harness.room;
    const randomCallsBefore = harness.randomSource.calls;
    const result = await createDrawService(harness).draw({
      roomId: room.roomId,
      actorPlayerId: room.game.turn.activePlayerId,
      requestId: v.parse(RequestIdSchema, "number-draw-expired"),
      expectedGameRevision: room.game.gameRevision,
      turnId: room.game.turn.turnId,
      receivedAt: room.game.turn.deadlineAt,
      authorization: alwaysCurrent,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected Number Draw at deadline equality to fail.");
    }
    assert.equal(result.error.code, "TURN_EXPIRED");
    assert.equal(harness.randomSource.calls, randomCallsBefore);
    const stored = await harness.persistence.findById(room.roomId);
    assert.equal(stored?.storageRevision, room.storageRevision);
  });
});

test("Number Submit normalizes inaccessible Tile probes and Pass rejects while the pool is non-empty without mutation", async () => {
  const harness = await createStartedHarness();
  const before = harness.room.game;
  const commandBase = {
    roomId: harness.room.roomId,
    actorPlayerId: before.turn.activePlayerId,
    expectedGameRevision: before.gameRevision,
    turnId: before.turn.turnId,
    receivedAt: before.turn.startedAt,
    authorization: alwaysCurrent,
  } as const;
  const submitService = new NumberTileSubmitService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: immediateRoomLane,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
  });
  const submit = await submitService.submit({
    ...commandBase,
    requestId: v.parse(RequestIdSchema, "number-submit-probe"),
    proposedTable: {
      melds: [
        {
          kind: "RUN",
          tiles: [
            {
              tileId: v.parse(TileIdSchema, "opaque-probe-a"),
              kind: "ORDINARY",
            },
            {
              tileId: v.parse(TileIdSchema, "opaque-probe-b"),
              kind: "ORDINARY",
            },
            {
              tileId: v.parse(TileIdSchema, "opaque-probe-c"),
              kind: "ORDINARY",
            },
          ],
        },
      ],
    },
  });
  assert.equal(submit.ok, false);
  if (submit.ok) {
    throw new Error("Expected the inaccessible Number Tile probe to fail.");
  }
  assert.equal(submit.error.code, "INVALID_TILE_ACCESS");

  const actorRack = before.racks.get(commandBase.actorPlayerId);
  const actorTileId = actorRack?.find(
    (tileId) => before.tilesById.get(tileId)?.kind === "ORDINARY",
  );
  if (actorTileId === undefined) {
    throw new Error("Expected an owned Number Tile for invalid-meld coverage.");
  }
  const invalidMeld = await submitService.submit({
    ...commandBase,
    requestId: v.parse(RequestIdSchema, "number-submit-invalid-meld"),
    proposedTable: {
      melds: [
        {
          kind: "RUN",
          tiles: [{ tileId: actorTileId, kind: "ORDINARY" }],
        },
      ],
    },
  });
  assert.equal(invalidMeld.ok, false);
  if (invalidMeld.ok) {
    throw new Error("Expected the invalid Number Tile meld to fail.");
  }
  assert.equal(invalidMeld.error.code, "INVALID_MELD");

  const passService = new NumberTilePassService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: immediateRoomLane,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
  });
  const pass = await passService.pass({
    ...commandBase,
    requestId: v.parse(RequestIdSchema, "number-pass-early"),
  });
  assert.equal(pass.ok, false);
  if (pass.ok) {
    throw new Error("Expected Number Pass with a non-empty pool to fail.");
  }
  assert.equal(pass.error.code, "PASS_NOT_ALLOWED");

  const after = await harness.persistence.findById(harness.room.roomId);
  assert.equal(after?.game?.gameRevision, before.gameRevision);
  assert.equal(after?.storageRevision, harness.room.storageRevision);
});

test("Number Submit commits an exact 30-point initial meld and atomically rejects an exact 29-point initial meld", async (t) => {
  await t.test("30-point initial meld", async () => {
    const harness = await createStartedHarness();
    const activePlayerId = harness.room.game.turn.activePlayerId;
    const fixture = makeInitialValue30Table(harness.room.game);
    const filler = [...harness.room.game.tilesById.keys()].find(
      (tileId) => !fixture.tileIds.includes(tileId),
    );
    assert.notEqual(filler, undefined);
    const game = reallocatePlayingGame(
      harness.room.game,
      new Map([
        [activePlayerId, Object.freeze([...fixture.tileIds, filler!])],
      ]),
      { poolEmpty: false },
    );
    const room = await replacePlayingGame(
      harness.persistence,
      harness.room,
      game,
    );
    const service = createSubmitService(harness);
    const input = Object.freeze({
      roomId: room.roomId,
      actorPlayerId: activePlayerId,
      requestId: v.parse(RequestIdSchema, "number-initial-30"),
      expectedGameRevision: room.game.gameRevision,
      turnId: room.game.turn.turnId,
      receivedAt: room.game.turn.startedAt,
      proposedTable: fixture.table,
      authorization: alwaysCurrent,
    });
    const submitted = await service.submit(input);
    const replay = await service.submit(input);
    assert.equal(submitted.ok, true);
    assert.deepEqual(replay, submitted);
    if (!submitted.ok) {
      throw new Error("Expected the 30-point Number initial meld to commit.");
    }
    assert.equal(submitted.data.outcome, "ADVANCED");

    const stored = await harness.persistence.findById(room.roomId);
    if (
      stored?.gameType !== NUMBER_TILE_GAME_TYPE ||
      stored.phase !== "PLAYING" ||
      stored.game === null
    ) {
      throw new Error("Expected the committed Number initial meld.");
    }
    assert.equal(stored.game.initialMeldCompleted.get(activePlayerId), true);
    assert.equal(stored.game.table.melds.length, 2);
    assert.equal(stored.game.gameRevision, room.game.gameRevision + 1);
    assert.equal(
      stored.game.racks.get(activePlayerId)?.some((tileId) =>
        fixture.tileIds.includes(tileId),
      ),
      false,
    );
  });

  await t.test("29-point initial meld", async () => {
    const harness = await createStartedHarness();
    const activePlayerId = harness.room.game.turn.activePlayerId;
    const fixture = makeInitialValue29Table(harness.room.game);
    const filler = [...harness.room.game.tilesById.keys()].find(
      (tileId) => !fixture.tileIds.includes(tileId),
    );
    assert.notEqual(filler, undefined);
    const game = reallocatePlayingGame(
      harness.room.game,
      new Map([
        [activePlayerId, Object.freeze([...fixture.tileIds, filler!])],
      ]),
      { poolEmpty: false },
    );
    const room = await replacePlayingGame(
      harness.persistence,
      harness.room,
      game,
    );
    const beforeStorageRevision = room.storageRevision;
    const submitted = await createSubmitService(harness).submit({
      roomId: room.roomId,
      actorPlayerId: activePlayerId,
      requestId: v.parse(RequestIdSchema, "number-initial-29"),
      expectedGameRevision: room.game.gameRevision,
      turnId: room.game.turn.turnId,
      receivedAt: room.game.turn.startedAt,
      proposedTable: fixture.table,
      authorization: alwaysCurrent,
    });
    assert.equal(submitted.ok, false);
    if (submitted.ok) {
      throw new Error("Expected the 29-point Number initial meld to fail.");
    }
    assert.equal(submitted.error.code, "INITIAL_MELD_TOO_LOW");

    const stored = await harness.persistence.findById(room.roomId);
    if (stored?.gameType !== NUMBER_TILE_GAME_TYPE || stored.game === null) {
      throw new Error("Expected the rejected Number initial-meld state.");
    }
    assert.equal(stored?.storageRevision, beforeStorageRevision);
    assert.equal(stored.game.gameRevision, room.game.gameRevision);
    assert.equal(stored.game.table.melds.length, 0);
    assert.equal(
      stored.game.initialMeldCompleted.get(activePlayerId),
      false,
    );
  });
});

test("Number Submit canonicalizes orange 7, joker, orange 9, orange 6 before commit, replay and V2 projection", async () => {
  const harness = await createStartedHarness();
  const actorPlayerId = harness.room.game.turn.activePlayerId;
  const used = new Set<TileId>();
  const seven = requireOrdinaryTileId(harness.room.game, "ORANGE", 7, used);
  const joker = requireJokerTileId(harness.room.game, used);
  const nine = requireOrdinaryTileId(harness.room.game, "ORANGE", 9, used);
  const six = requireOrdinaryTileId(harness.room.game, "ORANGE", 6, used);
  const proposedTable: NumberTileProposedTable = { melds: [{ kind: "RUN", tiles: [
    ordinaryPlacement(seven), { tileId: joker, kind: "JOKER" },
    ordinaryPlacement(nine), ordinaryPlacement(six),
  ] }] };
  const orderedIds = [six, seven, joker, nine];
  const room = await replacePlayingGame(harness.persistence, harness.room,
    reallocatePlayingGame(harness.room.game,
      new Map([[actorPlayerId, [seven, joker, nine, six]]]), { poolEmpty: false }));
  const input = { roomId: room.roomId, actorPlayerId,
    requestId: v.parse(RequestIdSchema, "number-unordered-joker-submit"),
    expectedGameRevision: room.game.gameRevision, turnId: room.game.turn.turnId,
    receivedAt: room.game.turn.startedAt, authorization: alwaysCurrent, proposedTable };
  const service = createSubmitService(harness);
  const accepted = await service.submit(input);
  assert.equal(accepted.ok, true);
  if (!accepted.ok) throw new Error("Expected the unique 30-point RUN to commit.");
  assert.equal(accepted.data.outcome, "ADVANCED");
  assert.deepEqual(await service.submit(input), accepted);
  const stored = await harness.persistence.findById(room.roomId);
  if (stored?.gameType !== "NUMBER_TILE" || stored.game?.turn == null)
    throw new Error("Expected normalized playing Number state.");
  assert.equal(stored.game.gameRevision, room.game.gameRevision + 1);
  assert.equal(stored.storageRevision, room.storageRevision + 1);
  assert.equal(stored.game.initialMeldCompleted.get(actorPlayerId), true);
  assert.deepEqual(stored.game.table.melds[0]!.tiles.map(tile => tile.tileId), orderedIds);
  assert.deepEqual(stored.game.table.melds[0]!.tiles[2], { tileId: joker, kind: "JOKER" });
  assert.equal(stored.game.racks.get(actorPlayerId)!.length, 10);
  const cloned = new NumberTileGameStateAdapter().cloneAndValidate(stored.game);
  assert.notEqual(cloned.table, stored.game.table);
  assert.deepEqual(cloned.table, stored.game.table);
  for (const selfPlayerId of stored.game.turnOrder) {
    const projected: ReturnType<typeof projectNumberTileV2Game> = projectNumberTileV2Game({ phase: "PLAYING", game: stored.game,
      playerIds: stored.game.turnOrder, selfPlayerId });
    assert.equal(v.safeParse(NumberTilePlayingProjectionV2Schema, projected).success, true);
    assert.deepEqual(projected.table.melds[0]!.tiles.map(tile => tile.tileId), orderedIds);
    assert.deepEqual(projected.table.melds[0]!.tiles[2], { tileId: joker, kind: "JOKER" });
  }
  // Idempotency remains full raw-payload identity; normalization is not a
  // license to reuse the request ID for a changed serialized request.
  const conflict = await service.submit({ ...input, proposedTable: {
    melds: [{ kind: "RUN", tiles: [ordinaryPlacement(six), ordinaryPlacement(seven),
      { tileId: joker, kind: "JOKER" }, ordinaryPlacement(nine)] }],
  } });
  assert.equal(conflict.ok, false);
  if (!conflict.ok) assert.equal(conflict.error.code, "REQUEST_ID_REUSED");
  const after = await harness.persistence.findById(room.roomId);
  assert.equal(after?.storageRevision, stored.storageRevision);
  assert.equal(after?.game?.gameRevision, stored.game.gameRevision);
  assert.deepEqual(proposedTable.melds[0]!.tiles.map(tile => tile.tileId), [seven, joker, nine, six]);
});

test("Number storage still rejects unordered canonical RUN while an ordered bare Joker round-trip is stable", async () => {
  const harness = await createStartedHarness();
  const used = new Set<TileId>();
  const seven = requireOrdinaryTileId(harness.room.game, "ORANGE", 7, used);
  const joker = requireJokerTileId(harness.room.game, used);
  const nine = requireOrdinaryTileId(harness.room.game, "ORANGE", 9, used);
  const six = requireOrdinaryTileId(harness.room.game, "ORANGE", 6, used);
  const game = reallocatePlayingGame(harness.room.game, new Map(), {
    poolEmpty: false, table: { melds: [{ kind: "RUN", tiles: [
      ordinaryPlacement(seven), { tileId: joker, kind: "JOKER" },
      ordinaryPlacement(nine), ordinaryPlacement(six),
    ] }] },
  });
  const adapter = new NumberTileGameStateAdapter();
  assert.throws(() => adapter.cloneAndValidate(game), /RUN order is not normalized/u);
  await assert.rejects(harness.persistence.replace({ candidate: { ...harness.room, game },
    expectedRoomRevision: harness.room.roomRevision,
    expectedStorageRevision: harness.room.storageRevision }), /RUN order is not normalized/u);
  assert.equal((await harness.persistence.findById(harness.room.roomId))?.storageRevision,
    harness.room.storageRevision);
  const canonical = { ...game, table: { melds: [{ kind: "RUN" as const, tiles: [
    ordinaryPlacement(six), ordinaryPlacement(seven),
    { tileId: joker, kind: "JOKER" as const }, ordinaryPlacement(nine),
  ] }] } };
  const cloned = adapter.cloneAndValidate(canonical);
  assert.deepEqual(cloned.table, canonical.table);
  assert.notEqual(cloned.table, canonical.table);
  assert.deepEqual(adapter.cloneAndValidate(cloned).table, canonical.table);
});

test("Number Submit rejects deadline equality, stale revision, and a wrong-turn actor before any UoW mutation", async () => {
  const harness = await createStartedHarness();
  const activePlayerId = harness.room.game.turn.activePlayerId;
  const otherPlayerId = harness.room.game.turnOrder.find(
    (playerId) => playerId !== activePlayerId,
  )!;
  const fixture = makeInitialValue30Table(harness.room.game);
  const filler = [...harness.room.game.tilesById.keys()].find(
    (tileId) => !fixture.tileIds.includes(tileId),
  )!;
  const game = reallocatePlayingGame(
    harness.room.game,
    new Map([
      [activePlayerId, Object.freeze([...fixture.tileIds, filler])],
    ]),
    { poolEmpty: false },
  );
  const room = await replacePlayingGame(
    harness.persistence,
    harness.room,
    game,
  );
  const service = createSubmitService(harness);
  const common = {
    roomId: room.roomId,
    proposedTable: fixture.table,
    turnId: room.game.turn.turnId,
    authorization: alwaysCurrent,
  } as const;

  const expired = await service.submit({
    ...common,
    actorPlayerId: activePlayerId,
    requestId: v.parse(RequestIdSchema, "number-submit-expired"),
    expectedGameRevision: room.game.gameRevision,
    receivedAt: room.game.turn.deadlineAt,
  });
  assert.equal(expired.ok, false);
  if (expired.ok) {
    throw new Error("Expected deadline equality to be expired.");
  }
  assert.equal(expired.error.code, "TURN_EXPIRED");

  const stale = await service.submit({
    ...common,
    actorPlayerId: activePlayerId,
    requestId: v.parse(RequestIdSchema, "number-submit-stale"),
    expectedGameRevision: v.parse(
      GameRevisionSchema,
      room.game.gameRevision + 1,
    ),
    receivedAt: room.game.turn.startedAt,
  });
  assert.equal(stale.ok, false);
  if (stale.ok) {
    throw new Error("Expected a stale Number revision to fail.");
  }
  assert.equal(stale.error.code, "STALE_GAME_REVISION");

  const wrongTurn = await service.submit({
    ...common,
    actorPlayerId: otherPlayerId,
    requestId: v.parse(RequestIdSchema, "number-submit-wrong-turn"),
    expectedGameRevision: room.game.gameRevision,
    receivedAt: room.game.turn.startedAt,
  });
  assert.equal(wrongTurn.ok, false);
  if (wrongTurn.ok) {
    throw new Error("Expected a wrong-turn Number actor to fail.");
  }
  assert.equal(wrongTurn.error.code, "NOT_YOUR_TURN");

  const stored = await harness.persistence.findById(room.roomId);
  assert.equal(stored?.storageRevision, room.storageRevision);
  assert.equal(stored?.game?.gameRevision, room.game.gameRevision);
});

test("pool-empty Number Pass records a partial no-play cycle and the final eligible Pass commits STALEMATE", async () => {
  const harness = await createStartedHarness();
  const activePlayerId = harness.room.game.turn.activePlayerId;
  const game = reallocatePlayingGame(
    harness.room.game,
    new Map([
      [activePlayerId, [harness.room.game.racks.get(activePlayerId)![0]!]],
    ]),
    { poolEmpty: true },
  );
  let room = await replacePlayingGame(
    harness.persistence,
    harness.room,
    game,
  );
  const service = createPassService(harness);
  const firstInput = Object.freeze({
    roomId: room.roomId,
    actorPlayerId: room.game.turn.activePlayerId,
    requestId: v.parse(RequestIdSchema, "number-pass-cycle-1"),
    expectedGameRevision: room.game.gameRevision,
    turnId: room.game.turn.turnId,
    receivedAt: room.game.turn.startedAt,
    authorization: alwaysCurrent,
  });
  const first = await service.pass(firstInput);
  assert.equal(first.ok, true);
  if (!first.ok) {
    throw new Error("Expected the first pool-empty Pass to commit.");
  }
  assert.equal(first.data.outcome, "ADVANCED");

  const replay = await service.pass(firstInput);
  assert.deepEqual(replay, first);

  const afterFirst = await harness.persistence.findById(room.roomId);
  if (
    afterFirst?.gameType !== NUMBER_TILE_GAME_TYPE ||
    afterFirst.phase !== "PLAYING" ||
    afterFirst.game === null ||
    afterFirst.game.turn === null
  ) {
    throw new Error("Expected a partial Number no-play cycle.");
  }
  assert.equal(
    afterFirst.game.gameRevision,
    room.game.gameRevision + 1,
  );
  room = Object.freeze({ ...afterFirst, game: afterFirst.game });
  assert.deepEqual(room.game.noPlayPlayerIds, [activePlayerId]);

  const second = await service.pass({
    roomId: room.roomId,
    actorPlayerId: room.game.turn.activePlayerId,
    requestId: v.parse(RequestIdSchema, "number-pass-cycle-2"),
    expectedGameRevision: room.game.gameRevision,
    turnId: room.game.turn.turnId,
    receivedAt: room.game.turn.startedAt,
    authorization: alwaysCurrent,
  });
  assert.equal(second.ok, true);
  if (!second.ok || second.data.outcome !== "FINISHED") {
    throw new Error("Expected the complete no-play cycle to finish.");
  }
  assert.equal(second.data.finishReason, "STALEMATE");

  const finished = await harness.persistence.findById(room.roomId);
  assert.equal(finished?.phase, "FINISHED");
  assert.equal(finished?.game?.result?.reason, "STALEMATE");
});

test("a valid pool-empty Number Submit resets an earlier Pass from the canonical no-play cycle", async () => {
  const harness = await createStartedHarness();
  const activePlayerId = harness.room.game.turn.activePlayerId;
  const nextPlayerId = harness.room.game.turnOrder.find(
    (playerId) => playerId !== activePlayerId,
  )!;
  const fixture = makeRunTable(harness.room.game, "BLUE", [10, 11, 12]);
  const activeSeed = [...harness.room.game.tilesById.keys()].find(
    (tileId) => !fixture.tileIds.includes(tileId),
  )!;
  const allocated = reallocatePlayingGame(
    harness.room.game,
    new Map([
      [activePlayerId, [activeSeed]],
      [nextPlayerId, fixture.tileIds],
    ]),
    { poolEmpty: true },
  );
  const initialMeldCompleted = new Map(
    allocated.turnOrder.map((playerId) => [playerId, true] as const),
  );
  let room = await replacePlayingGame(
    harness.persistence,
    harness.room,
    Object.freeze({ ...allocated, initialMeldCompleted }),
  );

  const passed = await createPassService(harness).pass({
    roomId: room.roomId,
    actorPlayerId: activePlayerId,
    requestId: v.parse(RequestIdSchema, "number-pass-before-submit"),
    expectedGameRevision: room.game.gameRevision,
    turnId: room.game.turn.turnId,
    receivedAt: room.game.turn.startedAt,
    authorization: alwaysCurrent,
  });
  assert.equal(passed.ok, true);
  const afterPass = await harness.persistence.findById(room.roomId);
  if (
    afterPass?.gameType !== NUMBER_TILE_GAME_TYPE ||
    afterPass.phase !== "PLAYING" ||
    afterPass.game === null ||
    afterPass.game.turn === null
  ) {
    throw new Error("Expected active play after the partial Pass cycle.");
  }
  room = Object.freeze({ ...afterPass, game: afterPass.game });
  assert.equal(room.game.turn.activePlayerId, nextPlayerId);
  assert.deepEqual(room.game.noPlayPlayerIds, [activePlayerId]);

  const submitted = await createSubmitService(harness).submit({
    roomId: room.roomId,
    actorPlayerId: nextPlayerId,
    requestId: v.parse(RequestIdSchema, "number-submit-resets-cycle"),
    expectedGameRevision: room.game.gameRevision,
    turnId: room.game.turn.turnId,
    receivedAt: room.game.turn.startedAt,
    proposedTable: fixture.table,
    authorization: alwaysCurrent,
  });
  assert.equal(submitted.ok, true);
  if (!submitted.ok) {
    throw new Error("Expected a valid Number Submit to reset no-play state.");
  }
  assert.equal(submitted.data.outcome, "ADVANCED");
  const stored = await harness.persistence.findById(room.roomId);
  if (stored?.gameType !== NUMBER_TILE_GAME_TYPE || stored.game === null) {
    throw new Error("Expected committed Number Submit state.");
  }
  assert.deepEqual(stored.game.noPlayPlayerIds, []);
  assert.equal(stored.game.table.melds.length, 1);
});

test("normal Number Submit commits a whole-table RUN rearrangement while table-only Submit stays atomic", async (t) => {
  await t.test("RUN split and bridge", async () => {
    const harness = await createStartedHarness();
    const actorPlayerId = harness.room.game.turn.activePlayerId;
    const used = new Set<TileId>();
    const threeToSix = ([3, 4, 5, 6] as const).map((number) =>
      requireOrdinaryTileId(harness.room.game, "RED", number, used),
    );
    const eightToTen = ([8, 9, 10] as const).map((number) =>
      requireOrdinaryTileId(harness.room.game, "RED", number, used),
    );
    const seven = requireOrdinaryTileId(
      harness.room.game,
      "RED",
      7,
      used,
    );
    const filler = [...harness.room.game.tilesById.keys()].find(
      (tileId) => !used.has(tileId),
    )!;
    const canonicalTable: NumberTileProposedTable = {
      melds: [
        { kind: "RUN", tiles: threeToSix.map(ordinaryPlacement) },
        { kind: "RUN", tiles: eightToTen.map(ordinaryPlacement) },
      ],
    };
    const allocated = reallocatePlayingGame(
      harness.room.game,
      new Map([[actorPlayerId, [seven, filler]]]),
      { poolEmpty: false, table: canonicalTable },
    );
    const initialMeldCompleted = new Map(
      allocated.initialMeldCompleted,
    );
    initialMeldCompleted.set(actorPlayerId, true);
    const room = await replacePlayingGame(
      harness.persistence,
      harness.room,
      Object.freeze({ ...allocated, initialMeldCompleted }),
    );
    const proposedTable: NumberTileProposedTable = {
      melds: [
        {
          kind: "RUN",
          tiles: threeToSix.slice(0, 3).map(ordinaryPlacement),
        },
        {
          kind: "RUN",
          tiles: [
            threeToSix[3]!,
            seven,
            ...eightToTen,
          ].map(ordinaryPlacement),
        },
      ],
    };
    const result = await createSubmitService(harness).submit({
      roomId: room.roomId,
      actorPlayerId,
      requestId: v.parse(RequestIdSchema, "number-rearrange-valid"),
      expectedGameRevision: room.game.gameRevision,
      turnId: room.game.turn.turnId,
      receivedAt: room.game.turn.startedAt,
      proposedTable,
      authorization: alwaysCurrent,
    });
    assert.equal(result.ok, true);
    const stored = await harness.persistence.findById(room.roomId);
    if (stored?.gameType !== NUMBER_TILE_GAME_TYPE || stored.game === null) {
      throw new Error("Expected committed Number rearrangement.");
    }
    assert.deepEqual(
      stored.game.table.melds.map((meld) => meld.tiles.length),
      [3, 5],
    );
    assert.equal(stored.game.racks.get(actorPlayerId)?.includes(seven), false);
  });

  await t.test("table-only", async () => {
    const harness = await createStartedHarness();
    const actorPlayerId = harness.room.game.turn.activePlayerId;
    const used = new Set<TileId>();
    const oneToThree = ([1, 2, 3] as const).map((number) =>
      requireOrdinaryTileId(harness.room.game, "BLUE", number, used),
    );
    const actorTile = [...harness.room.game.tilesById.keys()].find(
      (tileId) => !used.has(tileId),
    )!;
    const canonicalTable: NumberTileProposedTable = {
      melds: [
        { kind: "RUN", tiles: oneToThree.map(ordinaryPlacement) },
      ],
    };
    const allocated = reallocatePlayingGame(
      harness.room.game,
      new Map([[actorPlayerId, [actorTile]]]),
      { poolEmpty: false, table: canonicalTable },
    );
    const initialMeldCompleted = new Map(
      allocated.initialMeldCompleted,
    );
    initialMeldCompleted.set(actorPlayerId, true);
    const room = await replacePlayingGame(
      harness.persistence,
      harness.room,
      Object.freeze({ ...allocated, initialMeldCompleted }),
    );
    const result = await createSubmitService(harness).submit({
      roomId: room.roomId,
      actorPlayerId,
      requestId: v.parse(RequestIdSchema, "number-table-only"),
      expectedGameRevision: room.game.gameRevision,
      turnId: room.game.turn.turnId,
      receivedAt: room.game.turn.startedAt,
      proposedTable: canonicalTable,
      authorization: alwaysCurrent,
    });
    assert.equal(result.ok, false);
    if (result.ok) {
      throw new Error("Expected table-only Number Submit to fail.");
    }
    assert.equal(result.error.code, "NO_NEW_RACK_TILE");
    const stored = await harness.persistence.findById(room.roomId);
    assert.equal(stored?.storageRevision, room.storageRevision);
    assert.equal(stored?.game?.gameRevision, room.game.gameRevision);
  });
});

test("Number Submit persists a freely rearranged bare Joker by physical identity", async () => {
  const harness = await createStartedHarness();
  const actorPlayerId = harness.room.game.turn.activePlayerId;
  const used = new Set<TileId>();
  const red5 = requireOrdinaryTileId(harness.room.game, "RED", 5, used);
  const joker = requireJokerTileId(harness.room.game, used);
  const red7 = requireOrdinaryTileId(harness.room.game, "RED", 7, used);
  const red6 = requireOrdinaryTileId(harness.room.game, "RED", 6, used);
  const blue9 = requireOrdinaryTileId(harness.room.game, "BLUE", 9, used);
  const black9 = requireOrdinaryTileId(harness.room.game, "BLACK", 9, used);
  const filler = [...harness.room.game.tilesById.keys()].find(
    (tileId) => !used.has(tileId),
  )!;
  const canonicalTable: NumberTileProposedTable = {
    melds: [
      {
        kind: "RUN",
        tiles: [
          ordinaryPlacement(red5),
          {
            tileId: joker,
            kind: "JOKER",
          },
          ordinaryPlacement(red7),
        ],
      },
    ],
  };
  const allocated = reallocatePlayingGame(
    harness.room.game,
    new Map([[actorPlayerId, [red6, blue9, black9, filler]]]),
    { poolEmpty: false, table: canonicalTable },
  );
  const initialMeldCompleted = new Map(allocated.initialMeldCompleted);
  initialMeldCompleted.set(actorPlayerId, true);
  const room = await replacePlayingGame(
    harness.persistence,
    harness.room,
    Object.freeze({ ...allocated, initialMeldCompleted }),
  );
  const proposedTable: NumberTileProposedTable = {
    melds: [
      {
        kind: "RUN",
        tiles: [red5, red6, red7].map(ordinaryPlacement),
      },
      {
        kind: "GROUP",
        tiles: [
          ordinaryPlacement(blue9),
          ordinaryPlacement(black9),
          {
            tileId: joker,
            kind: "JOKER",
          },
        ],
      },
    ],
  };
  const result = await createSubmitService(harness).submit({
    roomId: room.roomId,
    actorPlayerId,
    requestId: v.parse(RequestIdSchema, "number-joker-recovery"),
    expectedGameRevision: room.game.gameRevision,
    turnId: room.game.turn.turnId,
    receivedAt: room.game.turn.startedAt,
    proposedTable,
    authorization: alwaysCurrent,
  });
  assert.equal(result.ok, true);
  const stored = await harness.persistence.findById(room.roomId);
  if (stored?.gameType !== NUMBER_TILE_GAME_TYPE || stored.game === null) {
    throw new Error("Expected persisted Number Joker recovery.");
  }
  const jokerPlacement = stored.game.table.melds
    .flatMap((meld) => meld.tiles)
    .find((placement) => placement.tileId === joker);
  assert.deepEqual(jokerPlacement, {
    tileId: joker,
    kind: "JOKER",
  });
  assert.equal(stored.game.racks.get(actorPlayerId)?.includes(joker), false);
  assert.equal(stored.game.racks.get(actorPlayerId)?.includes(red6), false);
});

test("Number Submit gives RACK_EMPTY terminal precedence and persists its canonical result", async () => {
  const harness = await createStartedHarness();
  const actorPlayerId = harness.room.game.turn.activePlayerId;
  const used = new Set<TileId>();
  const red7 = requireOrdinaryTileId(harness.room.game, "RED", 7, used);
  const blue7 = requireOrdinaryTileId(harness.room.game, "BLUE", 7, used);
  const black7 = requireOrdinaryTileId(harness.room.game, "BLACK", 7, used);
  const joker = requireJokerTileId(harness.room.game, used);
  const canonicalTable: NumberTileProposedTable = {
    melds: [
      {
        kind: "GROUP",
        tiles: [red7, blue7, black7].map(ordinaryPlacement),
      },
    ],
  };
  const allocated = reallocatePlayingGame(
    harness.room.game,
    new Map([[actorPlayerId, [joker]]]),
    { poolEmpty: true, table: canonicalTable },
  );
  const initialMeldCompleted = new Map(allocated.initialMeldCompleted);
  initialMeldCompleted.set(actorPlayerId, true);
  const room = await replacePlayingGame(
    harness.persistence,
    harness.room,
    Object.freeze({ ...allocated, initialMeldCompleted }),
  );
  const result = await createSubmitService(harness).submit({
    roomId: room.roomId,
    actorPlayerId,
    requestId: v.parse(RequestIdSchema, "number-rack-empty"),
    expectedGameRevision: room.game.gameRevision,
    turnId: room.game.turn.turnId,
    receivedAt: room.game.turn.startedAt,
    proposedTable: {
      melds: [
        {
          kind: "GROUP",
          tiles: [
            ordinaryPlacement(red7),
            ordinaryPlacement(blue7),
            ordinaryPlacement(black7),
            {
              tileId: joker,
              kind: "JOKER",
            },
          ],
        },
      ],
    },
    authorization: alwaysCurrent,
  });
  assert.equal(result.ok, true);
  if (!result.ok || result.data.outcome !== "FINISHED") {
    throw new Error("Expected Number rack-empty Submit to finish.");
  }
  assert.equal(result.data.finishReason, "RACK_EMPTY");
  assert.deepEqual(result.data.winnerPlayerIds, [actorPlayerId]);
  const stored = await harness.persistence.findById(room.roomId);
  if (
    stored?.gameType !== NUMBER_TILE_GAME_TYPE ||
    stored.phase !== "FINISHED" ||
    stored.game === null ||
    stored.game.result === null
  ) {
    throw new Error("Expected persisted Number rack-empty result.");
  }
  assert.equal(stored.game.result.reason, "RACK_EMPTY");
  assert.equal(stored.game.racks.get(actorPlayerId)?.length, 0);

  const verificationData = Object.freeze({
    algorithm: "SHA-256" as const,
    digestHex: "a".repeat(64),
  });
  assert.equal(
    (
      await harness.persistence.saveUnbound(
        createUnboundSessionRecord(verificationData, harness.clock.now()),
      )
    ).status,
    "SAVED",
  );
  assert.equal(
    (
      await harness.persistence.promoteUnbound({
        verificationData,
        roomId: stored.roomId,
        playerId: actorPlayerId,
        now: harness.clock.now(),
      })
    ).status,
    "PROMOTED",
  );

  const leaveService = new RoomLeaveService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomCleanupUnitOfWork: harness.persistence,
    roomMutationExecutor: immediateRoomLane,
    presenceReader: {
      acquireLobbyDisconnectLease: async () => ({
        connectionStatus: "CONNECTED",
        connectionGeneration: 1,
        isCurrent: () => true,
      }),
      acquireRoomPresenceLease: async () => ({
        presenceVersion: v.parse(PresenceVersionSchema, 1),
        connectionStatusByPlayerId: new Map(),
        isCurrent: () => true,
      }),
    },
    playerLifecycleActions: {
      applyPlayingLeave: () => {
        throw new Error("FINISHED leave must not invoke playing actions.");
      },
      planPresenceRestored: () => ({ status: "NO_CHANGE" }),
    },
    clock: harness.clock,
  });
  const leaveResult = await leaveService.leave({
    roomId: stored.roomId,
    actorPlayerId,
    requestId: v.parse(RequestIdSchema, "number-finished-leave"),
    expectedRoomRevision: stored.roomRevision,
    expectedGameRevision: stored.game.gameRevision,
    authorization: alwaysCurrent,
  });
  assert.equal(leaveResult.ok, true);
  assert.equal(leaveResult.ok && leaveResult.gameAdvisory, "NONE");
});

test("Number timeout draws once at the deadline, preserves at-least-once safety, and publishes one applied callback", async () => {
  const harness = await createStartedHarness();
  const before = harness.room.game;
  harness.clock.set(before.turn.deadlineAt);
  const applied: unknown[] = [];
  const timeoutService = new NumberTileTimeoutService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: immediateRoomLane,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
    randomSource: harness.randomSource,
    presenceLeaseReader: {
      acquirePlayerPresenceLease: async () => ({
        connectionStatus: "CONNECTED",
        connectionGeneration: 1,
        isCurrent: () => true,
      }),
    },
    turnScheduler: harness.scheduler,
  });
  timeoutService.subscribeApplied((data) => {
    applied.push(data);
  });
  const scheduled: ScheduledTurnDeadline = Object.freeze({
    roomId: harness.room.roomId,
    gameId: before.gameId,
    turnId: before.turn.turnId,
    expectedGameRevision: before.gameRevision,
    deadlineAt: before.turn.deadlineAt,
  });

  const beforeStaleCallbacks = await harness.persistence.findById(
    harness.room.roomId,
  );
  const randomCallsBeforeStaleCallbacks = harness.randomSource.calls;
  const staleCallbacks = [
    {
      input: {
        ...scheduled,
        gameId: v.parse(GameIdSchema, "number-timeout-stale-game"),
      },
      reason: "STALE_GAME",
    },
    {
      input: {
        ...scheduled,
        turnId: v.parse(TurnIdSchema, "number-timeout-stale-turn"),
      },
      reason: "STALE_TURN",
    },
    {
      input: {
        ...scheduled,
        expectedGameRevision: v.parse(
          GameRevisionSchema,
          scheduled.expectedGameRevision + 1,
        ),
      },
      reason: "STALE_GAME_REVISION",
    },
    {
      input: {
        ...scheduled,
        deadlineAt: serverTime(scheduled.deadlineAt + 1),
      },
      reason: "STALE_DEADLINE",
    },
  ] as const;
  for (const stale of staleCallbacks) {
    assert.deepEqual(await timeoutService.timeout(stale.input), {
      status: "NO_OP",
      reason: stale.reason,
    });
  }
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    beforeStaleCallbacks,
  );
  assert.equal(harness.randomSource.calls, randomCallsBeforeStaleCallbacks);
  assert.equal(applied.length, 0);

  const first = await timeoutService.timeout(scheduled);
  const duplicate = await timeoutService.timeout(scheduled);
  assert.equal(first.status, "APPLIED");
  assert.equal(duplicate.status, "NO_OP");
  assert.equal(applied.length, 1);

  const stored = await harness.persistence.findById(harness.room.roomId);
  if (stored?.gameType !== NUMBER_TILE_GAME_TYPE || stored.game === null) {
    throw new Error("Expected Number timeout state to remain canonical.");
  }
  assert.equal(stored.game.pool.length, before.pool.length - 1);
  assert.equal(stored.game.gameRevision, 1);
  assert.equal(
    stored.game.offlineTimeoutStreakByPlayerId.get(before.turn.activePlayerId),
    0,
  );
});

test("an online Number timeout with an empty pool commits one no-tile turn and advances the no-play cycle", async () => {
  const harness = await createStartedHarness();
  const activePlayerId = harness.room.game.turn.activePlayerId;
  const allocated = reallocatePlayingGame(
    harness.room.game,
    new Map([
      [activePlayerId, [harness.room.game.racks.get(activePlayerId)![0]!]],
    ]),
    { poolEmpty: true },
  );
  const room = await replacePlayingGame(
    harness.persistence,
    harness.room,
    allocated,
  );
  harness.clock.set(room.game.turn.deadlineAt);
  const timeoutService = new NumberTileTimeoutService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: immediateRoomLane,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
    randomSource: harness.randomSource,
    presenceLeaseReader: {
      acquirePlayerPresenceLease: async () => ({
        connectionStatus: "CONNECTED",
        connectionGeneration: 1,
        isCurrent: () => true,
      }),
    },
    turnScheduler: harness.scheduler,
  });
  const result = await timeoutService.timeout({
    roomId: room.roomId,
    gameId: room.game.gameId,
    turnId: room.game.turn.turnId,
    expectedGameRevision: room.game.gameRevision,
    deadlineAt: room.game.turn.deadlineAt,
  });
  assert.equal(result.status, "APPLIED");
  if (result.status !== "APPLIED") {
    throw new Error("Expected pool-empty Number timeout to apply.");
  }
  assert.equal(result.data.outcome, "ADVANCED");
  assert.equal(result.data.drawnTileId, null);
  assert.equal(result.data.timedOutPlayerForfeited, false);
  const stored = await harness.persistence.findById(room.roomId);
  if (stored?.gameType !== NUMBER_TILE_GAME_TYPE || stored.game === null) {
    throw new Error("Expected persisted Number no-tile timeout.");
  }
  assert.deepEqual(stored.game.noPlayPlayerIds, [activePlayerId]);
  assert.equal(stored.game.pool.length, 0);
  assert.equal(stored.game.gameRevision, room.game.gameRevision + 1);
});

test("the first offline Number timeout records streak one and a persisted resume plan resets it without changing gameRevision", async () => {
  const harness = await createStartedHarness();
  const before = harness.room.game;
  const actorPlayerId = before.turn.activePlayerId;
  harness.clock.set(before.turn.deadlineAt);
  const timeoutService = new NumberTileTimeoutService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: immediateRoomLane,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
    randomSource: harness.randomSource,
    presenceLeaseReader: {
      acquirePlayerPresenceLease: async () => ({
        connectionStatus: "OFFLINE",
        connectionGeneration: null,
        isCurrent: () => true,
      }),
    },
    turnScheduler: harness.scheduler,
  });
  const first = await timeoutService.timeout({
    roomId: harness.room.roomId,
    gameId: before.gameId,
    turnId: before.turn.turnId,
    expectedGameRevision: before.gameRevision,
    deadlineAt: before.turn.deadlineAt,
  });
  assert.equal(first.status, "APPLIED");
  if (first.status !== "APPLIED") {
    throw new Error("Expected the first offline Number timeout to apply.");
  }
  assert.equal(first.data.outcome, "ADVANCED");
  assert.equal(first.data.offlineTimeoutStreak, 1);
  assert.equal(first.data.timedOutPlayerForfeited, false);

  const afterTimeout = await harness.persistence.findById(harness.room.roomId);
  if (
    afterTimeout?.gameType !== NUMBER_TILE_GAME_TYPE ||
    afterTimeout.phase !== "PLAYING" ||
    afterTimeout.game === null ||
    afterTimeout.game.turn === null
  ) {
    throw new Error("Expected active play after the first offline timeout.");
  }
  assert.equal(
    afterTimeout.game.offlineTimeoutStreakByPlayerId.get(actorPlayerId),
    1,
  );
  assert.equal(afterTimeout.game.forfeitedPlayerIds.has(actorPlayerId), false);

  const plan = planNumberTilePresenceRestored(afterTimeout, actorPlayerId);
  assert.equal(plan.status, "RESET");
  if (plan.status !== "RESET") {
    throw new Error("Expected successful resume to produce a reset plan.");
  }
  assert.equal(plan.gameRevision, afterTimeout.game.gameRevision);
  const replacement = await harness.persistence.replace({
    candidate: Object.freeze({ ...afterTimeout, game: plan.game }),
    expectedRoomRevision: afterTimeout.roomRevision,
    expectedStorageRevision: afterTimeout.storageRevision,
  });
  assert.equal(replacement.status, "REPLACED");
  const resumed = await harness.persistence.findById(afterTimeout.roomId);
  assert.equal(resumed?.gameType, "NUMBER_TILE");
  assert.equal(
    resumed?.game?.offlineTimeoutStreakByPlayerId.get(actorPlayerId),
    0,
  );
  assert.equal(resumed?.game?.gameRevision, afterTimeout.game.gameRevision);
});

test("a second consecutive offline Number timeout applies its draw before last-player-standing forfeit", async () => {
  const harness = await createStartedHarness();
  const original = harness.room.game;
  const actorPlayerId = original.turn.activePlayerId;
  const streaks = new Map(original.offlineTimeoutStreakByPlayerId);
  streaks.set(actorPlayerId, 1);
  const prepared = await harness.persistence.replace({
    candidate: {
      ...harness.room,
      game: Object.freeze({
        ...original,
        offlineTimeoutStreakByPlayerId: streaks,
      }),
    },
    expectedRoomRevision: harness.room.roomRevision,
    expectedStorageRevision: harness.room.storageRevision,
  });
  assert.equal(prepared.status, "REPLACED");

  harness.clock.set(original.turn.deadlineAt);
  const timeoutService = new NumberTileTimeoutService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: immediateRoomLane,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
    randomSource: harness.randomSource,
    presenceLeaseReader: {
      acquirePlayerPresenceLease: async () => ({
        connectionStatus: "OFFLINE",
        connectionGeneration: null,
        isCurrent: () => true,
      }),
    },
  });
  const result = await timeoutService.timeout({
    roomId: harness.room.roomId,
    gameId: original.gameId,
    turnId: original.turn.turnId,
    expectedGameRevision: original.gameRevision,
    deadlineAt: original.turn.deadlineAt,
  });
  assert.equal(result.status, "APPLIED");
  if (result.status !== "APPLIED") {
    throw new Error("Expected the second offline timeout to commit.");
  }
  assert.equal(result.data.outcome, "FINISHED");
  assert.equal(result.data.timedOutPlayerForfeited, true);
  assert.equal(result.data.offlineTimeoutStreak, 2);
  assert.notEqual(result.data.drawnTileId, null);
  if (result.data.outcome !== "FINISHED") {
    throw new Error("Expected last-player-standing after the offline forfeit.");
  }
  assert.equal(result.data.finishReason, "LAST_PLAYER_STANDING");

  const stored = await harness.persistence.findById(harness.room.roomId);
  if (
    stored?.gameType !== NUMBER_TILE_GAME_TYPE ||
    stored.game === null ||
    stored.game.result === null
  ) {
    throw new Error("Expected a terminal Number state.");
  }
  assert.equal(stored.game.racks.get(actorPlayerId)?.length, 15);
  assert.equal(stored.game.pool.length, original.pool.length - 1);
  assert.equal(stored.game.result.reason, "LAST_PLAYER_STANDING");
  assert.equal(Object.hasOwn(stored.game.result, "rankings"), false);
});

test("overdue recovery reads a canonical Number deadline and routes one timeout commit", async () => {
  const harness = await createStartedHarness();
  const before = harness.room.game;
  harness.clock.set(before.turn.deadlineAt);
  const timeoutService = new NumberTileTimeoutService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: immediateRoomLane,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
    randomSource: harness.randomSource,
    presenceLeaseReader: {
      acquirePlayerPresenceLease: async () => ({
        connectionStatus: "CONNECTED",
        connectionGeneration: 1,
        isCurrent: () => true,
      }),
    },
    turnScheduler: harness.scheduler,
  });
  let hangulCalls = 0;
  let numberCalls = 0;
  const router = new ScheduledTurnRouter({
      gemCard: { gameType: "GEM_CARD", handleTurnTimeout: async () => { throw new Error("Unexpected GEM timeout in two-game fixture."); } },
    roomRepository: harness.persistence,
    hangul: {
      gameType: "HANGUL_TILE",
      handleTurnTimeout: async () => {
        hangulCalls += 1;
        return { status: "FAILED" };
      },
    },
    numberTile: {
      gameType: NUMBER_TILE_GAME_TYPE,
      handleTurnTimeout: async (deadline) => {
        numberCalls += 1;
        return timeoutService.timeout(deadline);
      },
    },
  });
  const sweeper = new OverdueTurnSweeper({
    activeTurnReader: harness.persistence,
    clock: harness.clock,
    enqueueTimeout: async (deadline) => {
      const result = await router.handleTurnTimeout(deadline);
      assert.equal(result.status, "APPLIED");
    },
  });

  sweeper.start();
  try {
    assert.equal(await sweeper.sweepOnce(), 1);
  } finally {
    sweeper.stop();
  }

  const stored = await harness.persistence.findById(harness.room.roomId);
  if (stored?.gameType !== NUMBER_TILE_GAME_TYPE || stored.game === null) {
    throw new Error("Expected recovered Number timeout state.");
  }
  assert.equal(hangulCalls, 0);
  assert.equal(numberCalls, 1);
  assert.equal(stored.game.gameRevision, before.gameRevision + 1);
  assert.equal(stored.game.pool.length, before.pool.length - 1);
});

test("Number timeout and Submit/leave races keep exactly one canonical winner", async (t) => {
  await t.test("timeout wins before a captured Submit", async () => {
    const harness = await createStartedHarness();
    const before = harness.room.game;
    const scheduled = Object.freeze({
      roomId: harness.room.roomId,
      gameId: before.gameId,
      turnId: before.turn.turnId,
      expectedGameRevision: before.gameRevision,
      deadlineAt: before.turn.deadlineAt,
    });
    harness.clock.set(before.turn.deadlineAt);
    const timeoutService = new NumberTileTimeoutService({
      roomRepository: harness.persistence,
      idempotencyRepository: harness.persistence,
      roomUnitOfWork: harness.persistence,
      roomMutationExecutor: immediateRoomLane,
      clock: harness.clock,
      idGenerator: harness.idGenerator,
      randomSource: harness.randomSource,
      presenceLeaseReader: {
        acquirePlayerPresenceLease: async () => ({
          connectionStatus: "CONNECTED",
          connectionGeneration: 1,
          isCurrent: () => true,
        }),
      },
    });
    assert.equal((await timeoutService.timeout(scheduled)).status, "APPLIED");
    const afterTimeout = await harness.persistence.findById(harness.room.roomId);
    if (
      afterTimeout?.gameType !== NUMBER_TILE_GAME_TYPE ||
      afterTimeout.game === null
    ) {
      throw new Error("Expected Number timeout to win the race.");
    }

    const staleSubmit = await createSubmitService(harness).submit({
      roomId: harness.room.roomId,
      actorPlayerId: before.turn.activePlayerId,
      requestId: v.parse(RequestIdSchema, "number-timeout-submit-race"),
      expectedGameRevision: before.gameRevision,
      turnId: before.turn.turnId,
      receivedAt: v.parse(ServerTimeSchema, before.turn.deadlineAt - 1),
      proposedTable: { melds: [] },
      authorization: alwaysCurrent,
    });
    assert.equal(staleSubmit.ok, false);
    if (staleSubmit.ok) {
      throw new Error("Expected captured Submit to lose after timeout.");
    }
    assert.equal(staleSubmit.error.code, "NOT_YOUR_TURN");
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      afterTimeout,
    );
  });

  await t.test("leave wins before a captured timeout", async () => {
    const harness = await createStartedHarness(3);
    const before = harness.room;
    const scheduled = Object.freeze({
      roomId: before.roomId,
      gameId: before.game.gameId,
      turnId: before.game.turn.turnId,
      expectedGameRevision: before.game.gameRevision,
      deadlineAt: before.game.turn.deadlineAt,
    });
    const leave = applyNumberTilePlayingLeave({
      room: before,
      actorPlayerId: before.game.turn.activePlayerId,
      occurredAt: serverTime(20_000),
      idGenerator: harness.idGenerator,
    });
    const leaveCommit = await harness.persistence.replace({
      candidate: leave.candidate,
      expectedRoomRevision: before.roomRevision,
      expectedStorageRevision: before.storageRevision,
    });
    assert.equal(leaveCommit.status, "REPLACED");
    const afterLeave = await harness.persistence.findById(before.roomId);
    assert.notEqual(afterLeave, null);
    harness.clock.set(scheduled.deadlineAt);
    const timeoutService = new NumberTileTimeoutService({
      roomRepository: harness.persistence,
      idempotencyRepository: harness.persistence,
      roomUnitOfWork: harness.persistence,
      roomMutationExecutor: immediateRoomLane,
      clock: harness.clock,
      idGenerator: harness.idGenerator,
      randomSource: harness.randomSource,
      presenceLeaseReader: {
        acquirePlayerPresenceLease: async () => ({
          connectionStatus: "OFFLINE",
          connectionGeneration: null,
          isCurrent: () => true,
        }),
      },
    });

    assert.equal((await timeoutService.timeout(scheduled)).status, "NO_OP");
    assert.deepEqual(
      await harness.persistence.findById(before.roomId),
      afterLeave,
    );
  });
});

test("Number leave and restored presence keep Number-only lifecycle semantics", async () => {
  const harness = await createStartedHarness();
  const actorPlayerId = harness.room.game.turn.activePlayerId;
  const leave = applyNumberTilePlayingLeave({
    room: harness.room,
    actorPlayerId,
    occurredAt: serverTime(20_000),
    idGenerator: harness.idGenerator,
  });
  assert.equal(leave.advisory, "NONE");
  assert.equal(leave.finishedGameId, harness.room.game.gameId);
  assert.equal(leave.candidate.phase, "FINISHED");
  assert.equal(leave.candidate.game?.result?.reason, "LAST_PLAYER_STANDING");
  assert.equal(
    leave.candidate.game?.result?.reason === "LAST_PLAYER_STANDING"
      ? leave.candidate.game.result.winnerPlayerIds.length
      : 0,
    1,
  );

  const streaks = new Map(
    harness.room.game.offlineTimeoutStreakByPlayerId,
  );
  streaks.set(actorPlayerId, 1);
  const roomWithStreak: NumberTileRoomRecord = Object.freeze({
    ...harness.room,
    game: Object.freeze({
      ...harness.room.game,
      offlineTimeoutStreakByPlayerId: streaks,
    }),
  });
  const plan = planNumberTilePresenceRestored(roomWithStreak, actorPlayerId);
  assert.equal(plan.status, "RESET");
  if (plan.status !== "RESET") {
    throw new Error("Expected Number presence restoration to reset streak.");
  }
  assert.equal(plan.game.gameRevision, harness.room.game.gameRevision);
  assert.equal(plan.game.offlineTimeoutStreakByPlayerId.get(actorPlayerId), 0);
  assert.equal(
    roomWithStreak.game?.offlineTimeoutStreakByPlayerId.get(actorPlayerId),
    1,
  );
});

test("Number leave reaches immediate LAST_PLAYER_STANDING only after 3- and 4-player rooms have one eligible survivor", async (t) => {
  for (const playerCount of [3, 4] as const) {
    await t.test(`${playerCount} Players`, async () => {
      const harness = await createStartedHarness(playerCount);
      const orderedPlayerIds = harness.room.game.turnOrder;
      const expectedWinnerPlayerId = orderedPlayerIds.at(-1)!;
      let current: NumberTileRoomRecord = harness.room;

      for (const [leaveIndex, actorPlayerId] of orderedPlayerIds
        .slice(0, -1)
        .entries()) {
        const action = applyNumberTilePlayingLeave({
          room: current,
          actorPlayerId,
          occurredAt: serverTime(20_000 + leaveIndex),
          idGenerator: harness.idGenerator,
        });
        const isFinalLeave = leaveIndex === playerCount - 2;
        assert.equal(action.advisory, "NONE");
        assert.equal(action.finishedGameId !== null, isFinalLeave);

        const replaced = await harness.persistence.replace({
          candidate: action.candidate,
          expectedRoomRevision: current.roomRevision,
          expectedStorageRevision: current.storageRevision,
        });
        assert.equal(replaced.status, "REPLACED");
        const stored = await harness.persistence.findById(current.roomId);
        if (stored?.gameType !== NUMBER_TILE_GAME_TYPE) {
          throw new Error("Expected canonical Number lifecycle state.");
        }
        current = stored;

        if (!isFinalLeave) {
          assert.equal(current.phase, "PLAYING");
          assert.equal(current.game?.result, null);
        }
      }

      assert.equal(current.phase, "FINISHED");
      assert.equal(current.game?.result?.reason, "LAST_PLAYER_STANDING");
      assert.deepEqual(current.game?.result?.winnerPlayerIds, [
        expectedWinnerPlayerId,
      ]);
      assert.equal(
        current.game?.forfeitedPlayerIds.size,
        playerCount - 1,
      );
    });
  }
});

test("finished Number Room uses the platform fixed-retention cleanup path", async () => {
  const harness = await createStartedHarness();
  const before = harness.room;
  const finishedAt = serverTime(30_000);
  const leave = applyNumberTilePlayingLeave({
    room: before,
    actorPlayerId: before.game.turn.activePlayerId,
    occurredAt: finishedAt,
    idGenerator: harness.idGenerator,
  });
  assert.notEqual(leave.finishedGameId, null);
  const committed = await harness.persistence.replace({
    candidate: leave.candidate,
    expectedRoomRevision: before.roomRevision,
    expectedStorageRevision: before.storageRevision,
  });
  assert.equal(committed.status, "REPLACED");
  if (committed.status !== "REPLACED") {
    throw new Error("Expected a FINISHED Number Room.");
  }
  assert.equal(committed.room.gameType, NUMBER_TILE_GAME_TYPE);
  assert.equal(committed.room.phase, "FINISHED");
  assert.equal(committed.room.game?.result?.finishedAt, finishedAt);

  const clock = new FakeClock(
    v.parse(ServerTimeSchema, finishedAt + ROOM_RETENTION_MS),
  );
  let resourceCleanupCount = 0;
  const cleanupService = new RoomCleanupService({
    roomRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(),
    resources: {
      cleanupRoom: () => {
        resourceCleanupCount += 1;
      },
    },
  });
  const retentionService = new RoomRetentionService({
    cleanupService,
    roomRepository: harness.persistence,
    presenceReader: new ConnectionRegistryPresenceReader(
      new ConnectionRegistry(),
    ),
    clock,
  });
  const result = await retentionService.expire({
    kind: "FINISHED_ROOM_RETENTION",
    roomId: committed.room.roomId,
    gameId: committed.room.game!.gameId,
    finishedAt,
    deadlineAt: clock.now(),
  });

  assert.equal(result.status, "CLEANED");
  assert.equal(await harness.persistence.findById(before.roomId), null);
  assert.equal(await harness.persistence.findByCode(before.roomCode), null);
  assert.equal(resourceCleanupCount, 1);
});

test("a serialized Number leave wins over an already-captured Submit without a second mutation", async () => {
  const harness = await createStartedHarness(3);
  const before = harness.room;
  const actorPlayerId = before.game.turn.activePlayerId;
  const leave = applyNumberTilePlayingLeave({
    room: before,
    actorPlayerId,
    occurredAt: serverTime(20_000),
    idGenerator: harness.idGenerator,
  });
  assert.equal(leave.finishedGameId, null);
  const leaveCommit = await harness.persistence.replace({
    candidate: leave.candidate,
    expectedRoomRevision: before.roomRevision,
    expectedStorageRevision: before.storageRevision,
  });
  assert.equal(leaveCommit.status, "REPLACED");
  const afterLeave = await harness.persistence.findById(before.roomId);
  if (
    afterLeave?.gameType !== NUMBER_TILE_GAME_TYPE ||
    afterLeave.phase !== "PLAYING" ||
    afterLeave.game === null ||
    afterLeave.game.turn === null
  ) {
    throw new Error("Expected active Number play after a 3-player leave.");
  }
  const storageRevisionAfterLeave = afterLeave.storageRevision;
  const staleSubmit = await createSubmitService(harness).submit({
    roomId: before.roomId,
    actorPlayerId,
    requestId: v.parse(RequestIdSchema, "number-leave-submit-race"),
    expectedGameRevision: before.game.gameRevision,
    turnId: before.game.turn.turnId,
    receivedAt: before.game.turn.startedAt,
    proposedTable: { melds: [] },
    authorization: alwaysCurrent,
  });
  assert.equal(staleSubmit.ok, false);
  if (staleSubmit.ok) {
    throw new Error("Expected captured Submit to lose after canonical leave.");
  }
  assert.equal(staleSubmit.error.code, "NOT_YOUR_TURN");
  const afterSubmit = await harness.persistence.findById(before.roomId);
  assert.equal(afterSubmit?.gameType, "NUMBER_TILE");
  assert.equal(afterSubmit?.storageRevision, storageRevisionAfterLeave);
  assert.equal(
    afterSubmit?.game?.gameRevision,
    afterLeave.game.gameRevision,
  );
  assert.equal(afterSubmit?.game?.forfeitedPlayerIds.has(actorPlayerId), true);
});

test("Number V2 projection exposes only the viewer rack and preserves finished privacy", async () => {
  const harness = await createStartedHarness();
  const playerIds = players.map((player) => player.playerId);
  const projectionA = projectNumberTileV2Game({
    phase: "PLAYING",
    playerIds,
    selfPlayerId: playerIds[0]!,
    game: harness.room.game,
  });
  const projectionB = projectNumberTileV2Game({
    phase: "PLAYING",
    playerIds,
    selfPlayerId: playerIds[1]!,
    game: harness.room.game,
  });
  assert.equal(v.safeParse(NumberTilePlayingProjectionV2Schema, projectionA).success, true);
  assert.equal(projectionA.privateState.rack.length, 14);
  assert.equal(projectionB.privateState.rack.length, 14);
  const rackAIds = new Set(projectionA.privateState.rack.map((tile) => tile.tileId));
  assert.equal(
    projectionB.privateState.rack.some((tile) => rackAIds.has(tile.tileId)),
    false,
  );
  assert.equal(Object.hasOwn(projectionA, "pool"), false);

  const leave = applyNumberTilePlayingLeave({
    room: harness.room,
    actorPlayerId: playerIds[1]!,
    occurredAt: serverTime(20_000),
    idGenerator: harness.idGenerator,
  });
  if (
    leave.candidate.gameType !== NUMBER_TILE_GAME_TYPE ||
    leave.candidate.phase !== "FINISHED" ||
    leave.candidate.game === null ||
    leave.candidate.game.turn !== null ||
    leave.candidate.game.result === null
  ) {
    throw new Error("Expected a finished Number Room for projection.");
  }
  const finished = projectNumberTileV2Game({
    phase: "FINISHED",
    playerIds,
    selfPlayerId: playerIds[0]!,
    game: leave.candidate.game,
  });
  assert.equal(v.safeParse(NumberTileFinishedProjectionV2Schema, finished).success, true);
  assert.equal(finished.privateState.rack.length, 14);
  assert.equal(Object.hasOwn(finished, "turn"), false);
});

test("Number STALEMATE integration ranks every eligible Player ahead of a lower-penalty forfeited Player in V2 projection", async () => {
  const harness = await createStartedHarness(4);
  const orderedPlayerIds = harness.room.game.turnOrder;
  const forfeitedPlayerId = orderedPlayerIds[2]!;
  const leave = applyNumberTilePlayingLeave({
    room: harness.room,
    actorPlayerId: forfeitedPlayerId,
    occurredAt: serverTime(20_000),
    idGenerator: harness.idGenerator,
  });
  assert.equal(leave.finishedGameId, null);
  const leaveCommit = await harness.persistence.replace({
    candidate: leave.candidate,
    expectedRoomRevision: harness.room.roomRevision,
    expectedStorageRevision: harness.room.storageRevision,
  });
  assert.equal(leaveCommit.status, "REPLACED");
  const afterLeave = await harness.persistence.findById(harness.room.roomId);
  if (
    afterLeave?.gameType !== NUMBER_TILE_GAME_TYPE ||
    afterLeave.phase !== "PLAYING" ||
    afterLeave.game === null ||
    afterLeave.game.turn === null
  ) {
    throw new Error("Expected three eligible Number Players after forfeit.");
  }

  const used = new Set<TileId>();
  const seedRackTileIds = new Map<PlayerId, readonly TileId[]>([
    [
      orderedPlayerIds[0]!,
      [requireOrdinaryTileId(afterLeave.game, "RED", 8, used)],
    ],
    [
      orderedPlayerIds[1]!,
      [requireOrdinaryTileId(afterLeave.game, "RED", 9, used)],
    ],
    [
      forfeitedPlayerId,
      [requireOrdinaryTileId(afterLeave.game, "RED", 1, used)],
    ],
    [
      orderedPlayerIds[3]!,
      [requireOrdinaryTileId(afterLeave.game, "RED", 13, used)],
    ],
  ]);
  const allocated = reallocatePlayingGame(
    afterLeave.game,
    seedRackTileIds,
    { poolEmpty: true },
  );
  let room = await replacePlayingGame(
    harness.persistence,
    Object.freeze({ ...afterLeave, game: afterLeave.game }),
    allocated,
  );
  const service = createPassService(harness);

  for (let passIndex = 0; passIndex < 3; passIndex += 1) {
    const result = await service.pass({
      roomId: room.roomId,
      actorPlayerId: room.game.turn.activePlayerId,
      requestId: v.parse(
        RequestIdSchema,
        `number-stalemate-pass-${passIndex + 1}`,
      ),
      expectedGameRevision: room.game.gameRevision,
      turnId: room.game.turn.turnId,
      receivedAt: room.game.turn.startedAt,
      authorization: alwaysCurrent,
    });
    assert.equal(result.ok, true);
    const stored = await harness.persistence.findById(room.roomId);
    if (passIndex < 2) {
      if (
        stored?.gameType !== NUMBER_TILE_GAME_TYPE ||
        stored.phase !== "PLAYING" ||
        stored.game === null ||
        stored.game.turn === null
      ) {
        throw new Error("Expected an incomplete three-Player no-play cycle.");
      }
      room = Object.freeze({ ...stored, game: stored.game });
    }
  }

  const stored = await harness.persistence.findById(room.roomId);
  if (
    stored?.gameType !== NUMBER_TILE_GAME_TYPE ||
    stored.phase !== "FINISHED" ||
    stored.game === null ||
    stored.game.turn !== null ||
    stored.game.result?.reason !== "STALEMATE"
  ) {
    throw new Error("Expected canonical Number STALEMATE state.");
  }
  const result = stored.game.result;
  const forfeitedEntry = result.rankings.find(
    (entry) => entry.playerId === forfeitedPlayerId,
  )!;
  assert.equal(forfeitedEntry.penaltyCost, 1);
  assert.equal(forfeitedEntry.rank, 4);
  assert.equal(forfeitedEntry.score, -1);
  assert.equal(
    result.rankings.slice(0, 3).every((entry) => !entry.forfeited),
    true,
  );
  assert.equal(result.winnerPlayerIds.includes(forfeitedPlayerId), false);

  const projection = projectNumberTileV2Game({
    phase: "FINISHED",
    playerIds: orderedPlayerIds,
    selfPlayerId: orderedPlayerIds[0]!,
    game: stored.game,
  });
  assert.equal(
    v.safeParse(NumberTileFinishedProjectionV2Schema, projection).success,
    true,
  );
  assert.equal(projection.result.reason, "STALEMATE");
  if (projection.result.reason !== "STALEMATE") {
    throw new Error("Expected projected Number STALEMATE rankings.");
  }
  assert.equal(
    projection.result.rankings.find(
      (entry) => entry.playerId === forfeitedPlayerId,
    )?.rank,
    4,
  );
});

test("Number command router delegates only canonical NUMBER_TILE Rooms", async () => {
  const harness = await createStartedHarness();
  const calls = { draw: 0, submit: 0, pass: 0 };
  const routedResult = Object.freeze({
    ok: false as const,
    error: Object.freeze({
      code: "INVALID_PHASE" as const,
      message: "sentinel",
      recoverable: false,
    }),
  });
  const router = new NumberTileCommandRouter({
    roomRepository: harness.persistence,
    capability: {
      gameType: NUMBER_TILE_GAME_TYPE,
      draw: async () => {
        calls.draw += 1;
        return routedResult;
      },
      submit: async () => {
        calls.submit += 1;
        return routedResult;
      },
      pass: async () => {
        calls.pass += 1;
        return routedResult;
      },
    },
  });
  const game = harness.room.game;
  const base = {
    roomId: harness.room.roomId,
    actorPlayerId: game.turn.activePlayerId,
    requestId: v.parse(RequestIdSchema, "number-route-1"),
    expectedGameRevision: game.gameRevision,
    turnId: game.turn.turnId,
    receivedAt: game.turn.startedAt,
    authorization: alwaysCurrent,
  } as const;
  assert.deepEqual(
    await router.submit({ ...base, proposedTable: { melds: [] } }),
    routedResult,
  );
  assert.deepEqual(await router.draw(base), routedResult);
  assert.deepEqual(await router.pass(base), routedResult);
  assert.deepEqual(calls, { draw: 1, submit: 1, pass: 1 });

  const hangulRoomId = roomId("hangul-route-room");
  const hangulRoom = Object.freeze({
    roomId: hangulRoomId,
    roomCode: v.parse(RoomCodeSchema, "CDFGHJ"),
    gameType: "HANGUL_TILE" as const,
    phase: "LOBBY" as const,
    hostPlayerId: players[0]!.playerId,
    players,
    game: null,
    roomRevision: v.parse(RoomRevisionSchema, 0),
    storageRevision: createStorageRevision(0),
    createdAt: serverTime(1_000),
    updatedAt: serverTime(1_000),
  });
  const rejectingRouter = new NumberTileCommandRouter({
    roomRepository: {
      findById: async () => hangulRoom,
    },
    capability: {
      gameType: NUMBER_TILE_GAME_TYPE,
      draw: async () => {
        calls.draw += 1;
        return routedResult;
      },
      submit: async () => {
        calls.submit += 1;
        return routedResult;
      },
      pass: async () => {
        calls.pass += 1;
        return routedResult;
      },
    },
  });
  const rejectedNumberCommands = await Promise.all([
    rejectingRouter.submit({
      ...base,
      roomId: hangulRoomId,
      proposedTable: { melds: [] },
    }),
    rejectingRouter.draw({ ...base, roomId: hangulRoomId }),
    rejectingRouter.pass({ ...base, roomId: hangulRoomId }),
  ]);
  for (const rejected of rejectedNumberCommands) {
    assert.equal(rejected.ok, false);
    if (rejected.ok) {
      throw new Error("Expected cross-game Number routing to fail closed.");
    }
    assert.equal(rejected.error.code, "INTERNAL_ERROR");
  }
  assert.deepEqual(calls, { draw: 1, submit: 1, pass: 1 });

  const hangulCalls = { start: 0, submit: 0, draw: 0, pass: 0 };
  const legacyRouter = new LegacyHangulV1CommandRouter({
    roomRepository: harness.persistence,
    capability: {
      gameType: "HANGUL_TILE",
      start: async () => {
        hangulCalls.start += 1;
        return routedResult;
      },
      submit: async () => {
        hangulCalls.submit += 1;
        return routedResult;
      },
      draw: async () => {
        hangulCalls.draw += 1;
        return routedResult;
      },
      pass: async () => {
        hangulCalls.pass += 1;
        return routedResult;
      },
    },
  });
  const rejectedHangulCommands = await Promise.all([
    legacyRouter.submit({
      ...base,
      proposedBoard: { wordGroups: [] },
    }),
    legacyRouter.draw({ ...base, bagKind: "CONSONANT" }),
    legacyRouter.pass(base),
  ]);
  for (const rejected of rejectedHangulCommands) {
    assert.equal(rejected.ok, false);
    if (rejected.ok) {
      throw new Error("Expected legacy Hangul routing on Number to fail closed.");
    }
    assert.equal(rejected.error.code, "INTERNAL_ERROR");
  }
  assert.deepEqual(hangulCalls, { start: 0, submit: 0, draw: 0, pass: 0 });
});
