import assert from "node:assert/strict";
import test from "node:test";

import {
  GameIdSchema,
  GameRevisionSchema,
  NicknameSchema,
  PlayerIdSchema,
  PresenceVersionSchema,
  ProposedBoardSchema,
  RequestIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  TileIdSchema,
  TurnIdSchema,
  type PlayerId,
  type RequestId,
  type RoomId,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  createDefaultRulesConfig,
  type PlayingGameState,
} from "../domain/game/game-state.js";
import type { OrdinaryTileInstance } from "../domain/game/tile-inventory.js";
import { InMemoryPersistence } from "../infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "../infrastructure/keyed-serial-executor.js";
import { FakeClock, FakeIdGenerator } from "../infrastructure/system.js";
import { TestDictionaryProvider } from "../infrastructure/test-dictionary-provider.js";
import { createLegacyHangulPlayerLifecycleActions } from "../games/legacy-hangul-player-lifecycle-actions.js";
import { LegacyHangulServerActionRouter } from "../games/legacy-hangul-server-action-router.js";
import { LEGACY_V1_DEFAULT_GAME_TYPE } from "../games/legacy-hangul-compatibility-registration.js";
import {
  createUnboundSessionRecord,
  type RoomRecord,
  type RoomWriteCandidate,
} from "../model/persistence.js";
import type { PlayerPresenceLeaseReader } from "../ports/player-presence-lease.js";
import type { RoomPresencePolicyReader } from "../ports/room-presence-policy.js";
import type { RandomSource, ScheduledTurnDeadline } from "../ports/system.js";
import { GameDeadlineService } from "./game-deadline-service.js";
import type { CurrentActorAuthorization } from "./game-start-service.js";
import { RoomLeaveService } from "./room-leave-service.js";
import { TurnDrawService } from "./turn-draw-service.js";
import { TurnPassService } from "./turn-pass-service.js";
import { TurnSubmitService } from "./turn-submit-service.js";
import { TurnTimeoutService } from "./turn-timeout-service.js";

const STARTED_AT = parse(ServerTimeSchema, 1_000);
const TURN_DEADLINE_AT = parse(ServerTimeSchema, 61_000);
const GAME_DEADLINE_AT = parse(ServerTimeSchema, 1_501_000);

function playerId(value: string): PlayerId {
  return parse(PlayerIdSchema, value);
}

function tileId(value: string): TileId {
  return parse(TileIdSchema, value);
}

function requestId(value: string): RequestId {
  return parse(RequestIdSchema, value);
}

function ordinaryTile(value: string): OrdinaryTileInstance {
  return Object.freeze({
    tileId: tileId(value),
    kind: "ORDINARY",
    physicalType: "MIEUM",
    sourceBag: "CONSONANT",
    allowedSymbols: Object.freeze(["ㅁ"] as const),
  });
}

class ZeroRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      throw new RangeError("A positive range is required.");
    }
    return 0;
  }
}

class StaticPlayerPresenceReader implements PlayerPresenceLeaseReader {
  constructor(
    private readonly status: "CONNECTED" | "OFFLINE" = "CONNECTED",
  ) {}

  async acquirePlayerPresenceLease() {
    return Object.freeze({
      connectionStatus: this.status,
      connectionGeneration: 1,
      isCurrent: () => true,
    });
  }
}

class StaticRoomPresenceReader implements RoomPresencePolicyReader {
  async acquireLobbyDisconnectLease() {
    return Object.freeze({
      connectionStatus: "CONNECTED" as const,
      connectionGeneration: 1,
      isCurrent: () => true,
    });
  }

  async acquireRoomPresenceLease() {
    return Object.freeze({
      presenceVersion: parse(PresenceVersionSchema, 0),
      connectionStatusByPlayerId: new Map<PlayerId, "CONNECTED">(),
      isCurrent: () => true,
    });
  }
}

const AUTHORIZATION: CurrentActorAuthorization = Object.freeze({
  isCurrent: () => true,
});

type HarnessOptions = Readonly<{
  playerCount?: 2 | 3 | 4;
  activePlayerIndex?: number;
  bagTileCount?: number;
  noMovePlayerIndices?: readonly number[];
  forfeitedPlayerIndices?: readonly number[];
  offlineTimeoutStreakByPlayerIndex?: ReadonlyMap<number, number>;
  clockNow?: number;
  turnDeadlineAt?: number;
  gameDeadlineAt?: number;
}>;

type Harness = Readonly<{
  persistence: InMemoryPersistence;
  executor: KeyedSerialExecutor<RoomId>;
  clock: FakeClock;
  idGenerator: FakeIdGenerator;
  playerIds: readonly PlayerId[];
  room: RoomRecord;
}>;

async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const playerCount = options.playerCount ?? 2;
  const playerIds = Object.freeze(
    Array.from({ length: playerCount }, (_, index) =>
      playerId(`phase16-player-${index + 1}`),
    ),
  );
  const activePlayerId = playerIds[options.activePlayerIndex ?? 0];
  if (activePlayerId === undefined) {
    throw new Error("Phase 16 fixture has an invalid active Player index.");
  }

  const rackTiles = playerIds.map((_, index) =>
    ordinaryTile(`phase16-rack-${index + 1}`),
  );
  const bagTiles = Array.from(
    { length: options.bagTileCount ?? 0 },
    (_, index) => ordinaryTile(`phase16-bag-${index + 1}`),
  );
  const tiles = [...rackTiles, ...bagTiles];
  const forfeitedPlayerIds = new Set(
    (options.forfeitedPlayerIndices ?? []).map((index) => {
      const value = playerIds[index];
      if (value === undefined) {
        throw new Error("Phase 16 fixture has an invalid forfeited index.");
      }
      return value;
    }),
  );
  const noMoveTurnEndPlayerIds = new Set(
    (options.noMovePlayerIndices ?? []).map((index) => {
      const value = playerIds[index];
      if (value === undefined) {
        throw new Error("Phase 16 fixture has an invalid no-move index.");
      }
      return value;
    }),
  );
  const game: PlayingGameState = Object.freeze({
    gameId: parse(GameIdSchema, "phase16-game"),
    gameRevision: parse(GameRevisionSchema, 4),
    rulesConfig: createDefaultRulesConfig(),
    tilesById: new Map(tiles.map((tile) => [tile.tileId, tile])),
    consonantBag: Object.freeze(bagTiles.map((tile) => tile.tileId)),
    vowelBag: Object.freeze([]),
    racks: new Map(
      playerIds.map((id, index) => {
        const rackTile = rackTiles[index];
        if (rackTile === undefined) {
          throw new Error("Phase 16 fixture missed a rack Tile.");
        }
        return [id, Object.freeze([rackTile.tileId])] as const;
      }),
    ),
    board: Object.freeze({ wordGroups: Object.freeze([]) }),
    initialMeldCompleted: new Map(playerIds.map((id) => [id, true])),
    offlineTimeoutStreakByPlayerId: new Map(
      playerIds.map((id, index) => [
        id,
        options.offlineTimeoutStreakByPlayerIndex?.get(index) ?? 0,
      ]),
    ),
    forfeitedPlayerIds: Object.freeze(forfeitedPlayerIds),
    noMoveTurnEndPlayerIds: Object.freeze(noMoveTurnEndPlayerIds),
    turnOrder: playerIds,
    turn: Object.freeze({
      turnId: parse(TurnIdSchema, "phase16-turn"),
      turnNumber: 1,
      activePlayerId,
      startedAt: STARTED_AT,
      deadlineAt: parse(
        ServerTimeSchema,
        options.turnDeadlineAt ?? TURN_DEADLINE_AT,
      ),
    }),
    result: null,
    gameStartedAt: STARTED_AT,
    gameDeadlineAt: parse(
      ServerTimeSchema,
      options.gameDeadlineAt ?? GAME_DEADLINE_AT,
    ),
  });
  const roomCandidate: RoomWriteCandidate = Object.freeze({
    roomId: parse(RoomIdSchema, "phase16-room"),
    roomCode: parse(RoomCodeSchema, "ABCDEF"),
    gameType: "HANGUL_TILE",
    phase: "PLAYING",
    hostPlayerId: playerIds[0]!,
    players: Object.freeze(
      playerIds.map((id, index) =>
        Object.freeze({
          playerId: id,
          nickname: parse(NicknameSchema, `Player${index + 1}`),
          joinOrder: index,
        }),
      ),
    ),
    game,
    roomRevision: parse(RoomRevisionSchema, 3),
    createdAt: STARTED_AT,
    updatedAt: STARTED_AT,
  });
  const persistence = new InMemoryPersistence();
  const created = await persistence.createIfAbsent(roomCandidate);
  assert.equal(created.status, "CREATED");
  if (created.status !== "CREATED") {
    throw new Error("Phase 16 Room fixture creation failed.");
  }
  for (const [index, id] of playerIds.entries()) {
    const verificationData = Object.freeze({
      algorithm: "SHA-256" as const,
      digestHex: (index + 1).toString(16).repeat(64),
    });
    const saved = await persistence.saveUnbound(
      createUnboundSessionRecord(verificationData, STARTED_AT),
    );
    assert.equal(saved.status, "SAVED");
    const promoted = await persistence.promoteUnbound({
      verificationData,
      roomId: created.room.roomId,
      playerId: id,
      now: STARTED_AT,
    });
    assert.equal(promoted.status, "PROMOTED");
  }

  return Object.freeze({
    persistence,
    executor: new KeyedSerialExecutor<RoomId>(),
    clock: new FakeClock(options.clockNow ?? 10_000),
    idGenerator: new FakeIdGenerator(),
    playerIds,
    room: created.room,
  });
}

function requirePlaying(room: RoomRecord): PlayingGameState {
  if (
    room.phase !== "PLAYING" ||
    room.game === null ||
    room.game.turn === null ||
    room.game.result !== null
  ) {
    throw new Error("Expected a PLAYING Game fixture.");
  }
  return room.game;
}

async function currentRoom(harness: Harness): Promise<RoomRecord> {
  const room = await harness.persistence.findById(harness.room.roomId);
  if (room === null) {
    throw new Error("Phase 16 fixture Room disappeared.");
  }
  return room;
}

function passService(harness: Harness, finished: string[] = []) {
  return new TurnPassService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: harness.executor,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
    onGameFinished: ({ gameId }) => {
      finished.push(gameId);
    },
  });
}

function timeoutService(
  harness: Harness,
  presence: "CONNECTED" | "OFFLINE" = "CONNECTED",
  finished: string[] = [],
) {
  return new TurnTimeoutService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: harness.executor,
    clock: harness.clock,
    idGenerator: harness.idGenerator,
    randomSource: new ZeroRandomSource(),
    presenceLeaseReader: new StaticPlayerPresenceReader(presence),
    onGameFinished: ({ gameId }) => {
      finished.push(gameId);
    },
  });
}

function turnDeadline(room: RoomRecord): ScheduledTurnDeadline {
  const game = requirePlaying(room);
  return Object.freeze({
    roomId: room.roomId,
    gameId: game.gameId,
    turnId: game.turn.turnId,
    expectedGameRevision: game.gameRevision,
    deadlineAt: game.turn.deadlineAt,
  });
}

async function passCurrentTurn(
  harness: Harness,
  service: TurnPassService,
  sequence: number,
) {
  const room = await currentRoom(harness);
  const game = requirePlaying(room);
  return service.pass({
    roomId: room.roomId,
    actorPlayerId: game.turn.activePlayerId,
    requestId: requestId(`phase16-pass-${sequence}`),
    expectedGameRevision: game.gameRevision,
    turnId: game.turn.turnId,
    receivedAt: harness.clock.now(),
    authorization: AUTHORIZATION,
  });
}

for (const playerCount of [2, 3, 4] as const) {
  test(`${playerCount}-Player empty-bag no-move cycle ends exactly on the last required pass`, async () => {
    const harness = await createHarness({ playerCount });
    const finished: string[] = [];
    const service = passService(harness, finished);

    for (let index = 0; index < playerCount; index += 1) {
      const result = await passCurrentTurn(harness, service, index + 1);
      assert.equal(result.ok, true);
      if (!result.ok) {
        throw new Error("Expected an accepted empty-bag Pass.");
      }

      if (index < playerCount - 1) {
        assert.equal(result.data.outcome, "ADVANCED");
        const intermediate = await currentRoom(harness);
        const game = requirePlaying(intermediate);
        assert.equal(game.noMoveTurnEndPlayerIds.size, index + 1);
        assert.equal(intermediate.roomRevision, harness.room.roomRevision);
      } else {
        assert.equal(result.data.outcome, "FINISHED");
        if (result.data.outcome !== "FINISHED") {
          throw new Error("Expected the final Pass to finish the Game.");
        }
        assert.equal(result.data.finishReason, "STALEMATE");
      }
    }

    const finishedRoom = await currentRoom(harness);
    assert.equal(finishedRoom.phase, "FINISHED");
    assert.equal(finishedRoom.game?.turn, null);
    assert.equal(finishedRoom.game?.result?.reason, "STALEMATE");
    assert.equal(finishedRoom.game?.gameRevision, 4 + playerCount);
    assert.equal(finishedRoom.roomRevision, harness.room.roomRevision + 1);
    assert.equal(finishedRoom.storageRevision, harness.room.storageRevision + playerCount);
    assert.deepEqual(finishedRoom.game?.result?.winnerPlayerIds, harness.playerIds);
    assert.deepEqual(
      finishedRoom.game?.result?.rankings.map((entry) => entry.rank),
      Array.from({ length: playerCount }, () => 1),
    );
    assert.deepEqual(finished, ["phase16-game"]);
  });
}

test("a zero-penalty timeout advances the no-move cycle and can finish STALEMATE", async () => {
  const harness = await createHarness({
    activePlayerIndex: 1,
    noMovePlayerIndices: [0],
    clockNow: TURN_DEADLINE_AT,
  });
  const service = timeoutService(harness);
  const result = await service.timeout(turnDeadline(harness.room));

  assert.equal(result.status, "APPLIED");
  if (result.status !== "APPLIED") {
    throw new Error("Expected a no-penalty timeout application.");
  }
  assert.equal(result.data.penaltyTileIds.length, 0);
  assert.equal(result.data.outcome, "FINISHED");
  if (result.data.outcome === "FINISHED") {
    assert.equal(result.data.finishReason, "STALEMATE");
  }
  const room = await currentRoom(harness);
  assert.equal(room.gameType, "HANGUL_TILE");
  assert.equal(room.phase, "FINISHED");
  assert.equal(room.game?.result?.reason, "STALEMATE");
  assert.equal(room.game?.turn, null);
});

test("accepted Submit, Draw, and positive-penalty timeout each reset the stale no-move cycle", async (context) => {
  await context.test("Submit", async () => {
    const harness = await createHarness({ noMovePlayerIndices: [1] });
    const service = new TurnSubmitService({
      roomRepository: harness.persistence,
      idempotencyRepository: harness.persistence,
      roomUnitOfWork: harness.persistence,
      roomMutationExecutor: harness.executor,
      clock: harness.clock,
      idGenerator: harness.idGenerator,
      dictionaryProvider: new TestDictionaryProvider(),
      validateBoard: async () => ({
        ok: true,
        value: Object.freeze({
          composedWords: Object.freeze([]),
          newlyUsedRackTileIds: Object.freeze([]),
          recoveredJokerTileIds: Object.freeze([]),
          completesInitialMeld: false,
        }),
      }),
    });
    const game = requirePlaying(harness.room);
    const result = await service.submit({
      roomId: harness.room.roomId,
      actorPlayerId: game.turn.activePlayerId,
      requestId: requestId("phase16-submit-reset"),
      expectedGameRevision: game.gameRevision,
      turnId: game.turn.turnId,
      receivedAt: harness.clock.now(),
      proposedBoard: parse(ProposedBoardSchema, { wordGroups: [] }),
      authorization: AUTHORIZATION,
    });
    assert.equal(result.ok, true);
    assert.equal(requirePlaying(await currentRoom(harness)).noMoveTurnEndPlayerIds.size, 0);
  });

  await context.test("Draw", async () => {
    const harness = await createHarness({
      bagTileCount: 1,
      noMovePlayerIndices: [1],
    });
    const game = requirePlaying(harness.room);
    const service = new TurnDrawService({
      roomRepository: harness.persistence,
      idempotencyRepository: harness.persistence,
      roomUnitOfWork: harness.persistence,
      roomMutationExecutor: harness.executor,
      clock: harness.clock,
      idGenerator: harness.idGenerator,
    });
    const result = await service.draw({
      roomId: harness.room.roomId,
      actorPlayerId: game.turn.activePlayerId,
      requestId: requestId("phase16-draw-reset"),
      expectedGameRevision: game.gameRevision,
      turnId: game.turn.turnId,
      receivedAt: harness.clock.now(),
      bagKind: "CONSONANT",
      authorization: AUTHORIZATION,
    });
    assert.equal(result.ok, true);
    assert.equal(requirePlaying(await currentRoom(harness)).noMoveTurnEndPlayerIds.size, 0);
  });

  await context.test("positive-penalty timeout", async () => {
    const harness = await createHarness({
      bagTileCount: 1,
      noMovePlayerIndices: [1],
      clockNow: TURN_DEADLINE_AT,
    });
    const result = await timeoutService(harness).timeout(turnDeadline(harness.room));
    assert.equal(result.status, "APPLIED");
    if (result.status === "APPLIED") {
      assert.equal(result.data.penaltyTileIds.length, 1);
      assert.equal(result.data.outcome, "ADVANCED");
    }
    assert.equal(requirePlaying(await currentRoom(harness)).noMoveTurnEndPlayerIds.size, 0);
  });
});

function leaveService(harness: Harness, finished: string[] = []) {
  return new RoomLeaveService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomCleanupUnitOfWork: harness.persistence,
    roomMutationExecutor: harness.executor,
    presenceReader: new StaticRoomPresenceReader(),
    playerLifecycleActions: createLegacyHangulPlayerLifecycleActions(
      harness.idGenerator,
    ),
    clock: harness.clock,
    onGameFinished: ({ gameId }) => {
      finished.push(gameId);
    },
  });
}

async function leavePlayer(
  harness: Harness,
  service: RoomLeaveService,
  actorPlayerId: PlayerId,
  sequence: number,
) {
  const room = await currentRoom(harness);
  const game = requirePlaying(room);
  return service.leave({
    roomId: room.roomId,
    actorPlayerId,
    requestId: requestId(`phase16-leave-${sequence}`),
    expectedRoomRevision: room.roomRevision,
    expectedGameRevision: game.gameRevision,
    authorization: AUTHORIZATION,
  });
}

test("a Playing leave immediately creates LAST_PLAYER_STANDING with transfer scoring", async () => {
  const harness = await createHarness();
  const finished: string[] = [];
  const service = leaveService(harness, finished);
  const result = await leavePlayer(harness, service, harness.playerIds[1]!, 1);

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.data.phase, "FINISHED");
  }
  const room = await currentRoom(harness);
  assert.equal(room.phase, "FINISHED");
  assert.equal(room.game?.turn, null);
  assert.equal(room.game?.result?.reason, "LAST_PLAYER_STANDING");
  assert.deepEqual(room.game?.result?.winnerPlayerIds, [harness.playerIds[0]]);
  assert.deepEqual(
    room.game?.result?.rankings.map(({ playerId: id, rank, score, forfeited }) => ({
      id,
      rank,
      score,
      forfeited,
    })),
    [
      { id: harness.playerIds[0], rank: 1, score: 1, forfeited: false },
      { id: harness.playerIds[1], rank: 2, score: -1, forfeited: true },
    ],
  );
  assert.equal(room.game?.gameRevision, 5);
  assert.equal(room.roomRevision, 4);
  assert.equal(room.storageRevision, harness.room.storageRevision + 1);
  assert.deepEqual(finished, ["phase16-game"]);
});

test("three Players continue after one forfeit and finish when only one survivor remains", async () => {
  const harness = await createHarness({ playerCount: 3 });
  const service = leaveService(harness);
  const first = await leavePlayer(harness, service, harness.playerIds[2]!, 1);
  assert.equal(first.ok, true);
  assert.equal((await currentRoom(harness)).phase, "PLAYING");

  const second = await leavePlayer(harness, service, harness.playerIds[1]!, 2);
  assert.equal(second.ok, true);
  const room = await currentRoom(harness);
  assert.equal(room.phase, "FINISHED");
  assert.equal(room.game?.result?.reason, "LAST_PLAYER_STANDING");
  assert.deepEqual(room.game?.result?.winnerPlayerIds, [harness.playerIds[0]]);
  assert.equal(room.game?.turn, null);
});

test("forfeit prunes the stalemate tracker to the current active set", async () => {
  const harness = await createHarness({
    playerCount: 3,
    activePlayerIndex: 1,
    noMovePlayerIndices: [0, 2],
  });
  const leave = leaveService(harness);
  const forfeitedPlayerId = harness.playerIds[2]!;

  const leaveResult = await leavePlayer(harness, leave, forfeitedPlayerId, 1);
  assert.equal(leaveResult.ok, true);
  const afterLeave = await currentRoom(harness);
  const playing = requirePlaying(afterLeave);
  assert.deepEqual([...playing.forfeitedPlayerIds], [forfeitedPlayerId]);
  assert.deepEqual([...playing.noMoveTurnEndPlayerIds], [harness.playerIds[0]]);
  assert.equal(playing.turn.activePlayerId, harness.playerIds[1]);

  const passResult = await passCurrentTurn(
    harness,
    passService(harness),
    2,
  );
  assert.equal(passResult.ok, true);
  if (!passResult.ok) {
    throw new Error("Expected the reduced active set to complete STALEMATE.");
  }
  assert.equal(passResult.data.outcome, "FINISHED");
  if (passResult.data.outcome === "FINISHED") {
    assert.equal(passResult.data.finishReason, "STALEMATE");
  }
  const finished = await currentRoom(harness);
  assert.equal(finished.phase, "FINISHED");
  assert.equal(finished.game?.result?.reason, "STALEMATE");
});

test("the final survivor leaving produces ALL_PLAYERS_FORFEITED with no winner", async () => {
  const harness = await createHarness({ forfeitedPlayerIndices: [1] });
  const service = leaveService(harness);
  const result = await leavePlayer(harness, service, harness.playerIds[0]!, 1);

  assert.equal(result.ok, true);
  const room = await currentRoom(harness);
  assert.equal(room.phase, "FINISHED");
  assert.equal(room.game?.result?.reason, "ALL_PLAYERS_FORFEITED");
  assert.deepEqual(room.game?.result?.winnerPlayerIds, []);
  assert.equal(room.game?.turn, null);
  assert.deepEqual(
    room.game?.result?.rankings.map(({ rank, score, forfeited }) => ({
      rank,
      score,
      forfeited,
    })),
    [
      { rank: 1, score: -1, forfeited: true },
      { rank: 1, score: -1, forfeited: true },
    ],
  );
});

test("a second OFFLINE timeout applies its penalty first and can finish ALL_PLAYERS_FORFEITED", async () => {
  const harness = await createHarness({
    forfeitedPlayerIndices: [1],
    offlineTimeoutStreakByPlayerIndex: new Map([[0, 1]]),
    clockNow: TURN_DEADLINE_AT,
  });
  const result = await timeoutService(harness, "OFFLINE").timeout(
    turnDeadline(harness.room),
  );

  assert.equal(result.status, "APPLIED");
  if (result.status !== "APPLIED") {
    throw new Error("Expected the second OFFLINE timeout to apply.");
  }
  assert.equal(result.data.penaltyTileIds.length, 0);
  assert.equal(result.data.timedOutPlayerForfeited, true);
  assert.equal(result.data.outcome, "FINISHED");
  if (result.data.outcome === "FINISHED") {
    assert.equal(result.data.finishReason, "ALL_PLAYERS_FORFEITED");
    assert.deepEqual(result.data.winnerPlayerIds, []);
  }
  const room = await currentRoom(harness);
  assert.equal(room.game?.turn, null);
  assert.equal(room.game?.result?.reason, "ALL_PLAYERS_FORFEITED");
  assert.equal(room.game?.offlineTimeoutStreakByPlayerId.get(harness.playerIds[0]!), 2);
});

test("Game deadline and overdue Turn timeout share one lane and TIME_LIMIT wins without penalty", async () => {
  const harness = await createHarness({
    bagTileCount: 3,
    clockNow: TURN_DEADLINE_AT,
    gameDeadlineAt: TURN_DEADLINE_AT,
  });
  const game = requirePlaying(harness.room);
  const deadlineService = new GameDeadlineService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: harness.executor,
    clock: harness.clock,
  });
  const timeout = timeoutService(harness);
  const serverActions = new LegacyHangulServerActionRouter({
    roomRepository: harness.persistence,
    capability: Object.freeze({
      gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
      handleTurnTimeout: (input) => timeout.timeout(input),
      handleGameDeadline: (input) => deadlineService.expire(input),
    }),
  });
  const rackBefore = game.racks.get(game.turn.activePlayerId);
  const gameDeadlinePromise = serverActions.handleGameDeadline({
    roomId: harness.room.roomId,
    gameId: game.gameId,
    deadlineAt: game.gameDeadlineAt,
  });
  const timeoutPromise = serverActions.handleTurnTimeout(
    turnDeadline(harness.room),
  );

  const [gameDeadlineResult, timeoutResult] = await Promise.all([
    gameDeadlinePromise,
    timeoutPromise,
  ]);
  assert.equal(gameDeadlineResult.status, "APPLIED");
  assert.equal(timeoutResult.status, "NO_OP");
  if (timeoutResult.status === "NO_OP") {
    assert.equal(timeoutResult.reason, "NOT_PLAYING");
  }
  const room = await currentRoom(harness);
  assert.equal(room.game?.result?.reason, "TIME_LIMIT");
  assert.equal(room.game?.turn, null);
  assert.deepEqual(room.game?.racks.get(game.turn.activePlayerId), rackBefore);
  assert.equal(room.game?.consonantBag.length, 3);
  assert.equal(room.game?.gameRevision, game.gameRevision + 1);
  assert.equal(room.storageRevision, harness.room.storageRevision + 1);
});

test("Submit, Draw, and Pass reject receivedAt at the Game deadline as GAME_EXPIRED without mutation", async (context) => {
  for (const command of ["SUBMIT", "DRAW", "PASS"] as const) {
    await context.test(command, async () => {
      const harness = await createHarness({
        bagTileCount: command === "DRAW" ? 1 : 0,
        gameDeadlineAt: 50_000,
        turnDeadlineAt: 60_000,
      });
      const before = await currentRoom(harness);
      const game = requirePlaying(before);
      let result:
        | Awaited<ReturnType<TurnSubmitService["submit"]>>
        | Awaited<ReturnType<TurnDrawService["draw"]>>
        | Awaited<ReturnType<TurnPassService["pass"]>>;

      if (command === "SUBMIT") {
        const service = new TurnSubmitService({
          roomRepository: harness.persistence,
          idempotencyRepository: harness.persistence,
          roomUnitOfWork: harness.persistence,
          roomMutationExecutor: harness.executor,
          clock: harness.clock,
          idGenerator: harness.idGenerator,
          dictionaryProvider: new TestDictionaryProvider(),
          validateBoard: async () => {
            throw new Error("Game-expired Submit must not reach RuleEngine validation.");
          },
        });
        result = await service.submit({
          roomId: before.roomId,
          actorPlayerId: game.turn.activePlayerId,
          requestId: requestId("phase16-expired-submit"),
          expectedGameRevision: game.gameRevision,
          turnId: game.turn.turnId,
          receivedAt: game.gameDeadlineAt,
          proposedBoard: parse(ProposedBoardSchema, { wordGroups: [] }),
          authorization: AUTHORIZATION,
        });
      } else if (command === "DRAW") {
        const service = new TurnDrawService({
          roomRepository: harness.persistence,
          idempotencyRepository: harness.persistence,
          roomUnitOfWork: harness.persistence,
          roomMutationExecutor: harness.executor,
          clock: harness.clock,
          idGenerator: harness.idGenerator,
        });
        result = await service.draw({
          roomId: before.roomId,
          actorPlayerId: game.turn.activePlayerId,
          requestId: requestId("phase16-expired-draw"),
          expectedGameRevision: game.gameRevision,
          turnId: game.turn.turnId,
          receivedAt: game.gameDeadlineAt,
          bagKind: "CONSONANT",
          authorization: AUTHORIZATION,
        });
      } else {
        result = await passService(harness).pass({
          roomId: before.roomId,
          actorPlayerId: game.turn.activePlayerId,
          requestId: requestId("phase16-expired-pass"),
          expectedGameRevision: game.gameRevision,
          turnId: game.turn.turnId,
          receivedAt: game.gameDeadlineAt,
          authorization: AUTHORIZATION,
        });
      }

      assert.equal(result.ok, false);
      if (result.ok) {
        throw new Error("Expected GAME_EXPIRED command rejection.");
      }
      assert.equal(result.error.code, "GAME_EXPIRED");
      assert.deepEqual(await currentRoom(harness), before);
    });
  }
});

test("GameDeadline vs Submit serializes both callback-first and pre-deadline-command-first order", async (context) => {
  for (const order of ["DEADLINE_FIRST", "SUBMIT_FIRST"] as const) {
    await context.test(order, async () => {
      const harness = await createHarness({
        clockNow: 50_000,
        gameDeadlineAt: 50_000,
        turnDeadlineAt: 60_000,
      });
      const game = requirePlaying(harness.room);
      const deadline = new GameDeadlineService({
        roomRepository: harness.persistence,
        idempotencyRepository: harness.persistence,
        roomUnitOfWork: harness.persistence,
        roomMutationExecutor: harness.executor,
        clock: harness.clock,
      });
      const submit = new TurnSubmitService({
        roomRepository: harness.persistence,
        idempotencyRepository: harness.persistence,
        roomUnitOfWork: harness.persistence,
        roomMutationExecutor: harness.executor,
        clock: harness.clock,
        idGenerator: harness.idGenerator,
        dictionaryProvider: new TestDictionaryProvider(),
        validateBoard: async () => ({
          ok: true,
          value: Object.freeze({
            composedWords: Object.freeze([]),
            newlyUsedRackTileIds: Object.freeze([]),
            recoveredJokerTileIds: Object.freeze([]),
            completesInitialMeld: false,
          }),
        }),
      });
      const deadlineInput = Object.freeze({
        roomId: harness.room.roomId,
        gameId: game.gameId,
        deadlineAt: game.gameDeadlineAt,
      });
      const submitInput = Object.freeze({
        roomId: harness.room.roomId,
        actorPlayerId: game.turn.activePlayerId,
        requestId: requestId(`phase16-race-submit-${order}`),
        expectedGameRevision: game.gameRevision,
        turnId: game.turn.turnId,
        receivedAt: parse(ServerTimeSchema, game.gameDeadlineAt - 1),
        proposedBoard: parse(ProposedBoardSchema, { wordGroups: [] }),
        authorization: AUTHORIZATION,
      });

      let deadlinePromise: ReturnType<GameDeadlineService["expire"]>;
      let submitPromise: ReturnType<TurnSubmitService["submit"]>;
      if (order === "DEADLINE_FIRST") {
        deadlinePromise = deadline.expire(deadlineInput);
        submitPromise = submit.submit(submitInput);
      } else {
        submitPromise = submit.submit(submitInput);
        deadlinePromise = deadline.expire(deadlineInput);
      }

      const [deadlineResult, submitResult] = await Promise.all([
        deadlinePromise,
        submitPromise,
      ]);
      assert.equal(deadlineResult.status, "APPLIED");
      const room = await currentRoom(harness);
      assert.equal(room.phase, "FINISHED");
      assert.equal(room.game?.result?.reason, "TIME_LIMIT");
      assert.equal(room.game?.turn, null);

      if (order === "DEADLINE_FIRST") {
        assert.equal(submitResult.ok, false);
        if (!submitResult.ok) {
          assert.equal(submitResult.error.code, "INVALID_PHASE");
        }
        assert.equal(room.game?.gameRevision, game.gameRevision + 1);
        assert.equal(room.storageRevision, harness.room.storageRevision + 1);
      } else {
        assert.equal(submitResult.ok, true);
        if (submitResult.ok) {
          assert.equal(submitResult.data.outcome, "ADVANCED");
        }
        assert.equal(room.game?.gameRevision, game.gameRevision + 2);
        assert.equal(room.storageRevision, harness.room.storageRevision + 2);
      }
    });
  }
});

test("GameDeadline vs Draw serializes both callback-first and pre-deadline-command-first order", async (context) => {
  for (const order of ["DEADLINE_FIRST", "DRAW_FIRST"] as const) {
    await context.test(order, async () => {
      const harness = await createHarness({
        bagTileCount: 1,
        clockNow: 50_000,
        gameDeadlineAt: 50_000,
        turnDeadlineAt: 60_000,
      });
      const game = requirePlaying(harness.room);
      const actorRackBefore = game.racks.get(game.turn.activePlayerId);
      if (actorRackBefore === undefined) {
        throw new Error("Expected the active Player rack.");
      }
      const deadline = new GameDeadlineService({
        roomRepository: harness.persistence,
        idempotencyRepository: harness.persistence,
        roomUnitOfWork: harness.persistence,
        roomMutationExecutor: harness.executor,
        clock: harness.clock,
      });
      const draw = new TurnDrawService({
        roomRepository: harness.persistence,
        idempotencyRepository: harness.persistence,
        roomUnitOfWork: harness.persistence,
        roomMutationExecutor: harness.executor,
        clock: harness.clock,
        idGenerator: harness.idGenerator,
      });
      const deadlineInput = Object.freeze({
        roomId: harness.room.roomId,
        gameId: game.gameId,
        deadlineAt: game.gameDeadlineAt,
      });
      const drawInput = Object.freeze({
        roomId: harness.room.roomId,
        actorPlayerId: game.turn.activePlayerId,
        requestId: requestId(`phase16-race-draw-${order}`),
        expectedGameRevision: game.gameRevision,
        turnId: game.turn.turnId,
        receivedAt: parse(ServerTimeSchema, game.gameDeadlineAt - 1),
        bagKind: "CONSONANT" as const,
        authorization: AUTHORIZATION,
      });

      let deadlinePromise: ReturnType<GameDeadlineService["expire"]>;
      let drawPromise: ReturnType<TurnDrawService["draw"]>;
      if (order === "DEADLINE_FIRST") {
        deadlinePromise = deadline.expire(deadlineInput);
        drawPromise = draw.draw(drawInput);
      } else {
        drawPromise = draw.draw(drawInput);
        deadlinePromise = deadline.expire(deadlineInput);
      }

      const [deadlineResult, drawResult] = await Promise.all([
        deadlinePromise,
        drawPromise,
      ]);
      assert.equal(deadlineResult.status, "APPLIED");
      const room = await currentRoom(harness);
      assert.equal(room.phase, "FINISHED");
      assert.equal(room.game?.result?.reason, "TIME_LIMIT");
      assert.equal(room.game?.turn, null);
      const actorRackAfter = room.game?.racks.get(game.turn.activePlayerId);

      if (order === "DEADLINE_FIRST") {
        assert.equal(drawResult.ok, false);
        if (!drawResult.ok) {
          assert.equal(drawResult.error.code, "INVALID_PHASE");
        }
        assert.deepEqual(actorRackAfter, actorRackBefore);
        assert.equal(room.game?.consonantBag.length, 1);
        assert.equal(room.game?.gameRevision, game.gameRevision + 1);
      } else {
        assert.equal(drawResult.ok, true);
        assert.equal(actorRackAfter?.length, actorRackBefore.length + 1);
        assert.equal(room.game?.consonantBag.length, 0);
        assert.equal(room.game?.gameRevision, game.gameRevision + 2);
      }
    });
  }
});

test("forfeit finish commits before a stale Turn timeout can apply penalty", async () => {
  const harness = await createHarness({
    bagTileCount: 3,
    clockNow: TURN_DEADLINE_AT,
  });
  const game = requirePlaying(harness.room);
  const rackBefore = game.racks.get(game.turn.activePlayerId);
  const leave = leaveService(harness);
  const timeout = timeoutService(harness);
  const leavePromise = leave.leave({
    roomId: harness.room.roomId,
    actorPlayerId: harness.playerIds[1]!,
    requestId: requestId("phase16-race-leave"),
    expectedRoomRevision: harness.room.roomRevision,
    expectedGameRevision: game.gameRevision,
    authorization: AUTHORIZATION,
  });
  const timeoutPromise = timeout.timeout(turnDeadline(harness.room));

  const [leaveResult, timeoutResult] = await Promise.all([
    leavePromise,
    timeoutPromise,
  ]);
  assert.equal(leaveResult.ok, true);
  assert.equal(timeoutResult.status, "NO_OP");
  if (timeoutResult.status === "NO_OP") {
    assert.equal(timeoutResult.reason, "NOT_PLAYING");
  }
  const room = await currentRoom(harness);
  assert.equal(room.game?.result?.reason, "LAST_PLAYER_STANDING");
  assert.deepEqual(room.game?.racks.get(game.turn.activePlayerId), rackBefore);
  assert.equal(room.game?.consonantBag.length, 3);
  assert.equal(room.game?.gameRevision, game.gameRevision + 1);
  assert.equal(room.storageRevision, harness.room.storageRevision + 1);
});

test("STALEMATE-ending Pass and overdue timeout allow exactly one terminal transition in either order", async (context) => {
  for (const order of ["PASS_FIRST", "TIMEOUT_FIRST"] as const) {
    await context.test(order, async () => {
      const harness = await createHarness({
        activePlayerIndex: 1,
        noMovePlayerIndices: [0],
        clockNow: TURN_DEADLINE_AT,
      });
      const game = requirePlaying(harness.room);
      const pass = passService(harness);
      const timeout = timeoutService(harness);
      const passInput = Object.freeze({
        roomId: harness.room.roomId,
        actorPlayerId: game.turn.activePlayerId,
        requestId: requestId(`phase16-race-pass-${order}`),
        expectedGameRevision: game.gameRevision,
        turnId: game.turn.turnId,
        receivedAt: parse(ServerTimeSchema, game.turn.deadlineAt - 1),
        authorization: AUTHORIZATION,
      });
      const timeoutInput = turnDeadline(harness.room);

      let passPromise: ReturnType<TurnPassService["pass"]>;
      let timeoutPromise: ReturnType<TurnTimeoutService["timeout"]>;
      if (order === "PASS_FIRST") {
        passPromise = pass.pass(passInput);
        timeoutPromise = timeout.timeout(timeoutInput);
      } else {
        timeoutPromise = timeout.timeout(timeoutInput);
        passPromise = pass.pass(passInput);
      }

      const [passResult, timeoutResult] = await Promise.all([
        passPromise,
        timeoutPromise,
      ]);
      const room = await currentRoom(harness);
      assert.equal(room.phase, "FINISHED");
      assert.equal(room.game?.result?.reason, "STALEMATE");
      assert.equal(room.game?.turn, null);
      assert.equal(room.game?.gameRevision, game.gameRevision + 1);
      assert.equal(room.storageRevision, harness.room.storageRevision + 1);

      if (order === "PASS_FIRST") {
        assert.equal(passResult.ok, true);
        if (passResult.ok) {
          assert.equal(passResult.data.outcome, "FINISHED");
        }
        assert.equal(timeoutResult.status, "NO_OP");
        if (timeoutResult.status === "NO_OP") {
          assert.equal(timeoutResult.reason, "NOT_PLAYING");
        }
      } else {
        assert.equal(timeoutResult.status, "APPLIED");
        if (timeoutResult.status === "APPLIED") {
          assert.equal(timeoutResult.data.outcome, "FINISHED");
        }
        assert.equal(passResult.ok, false);
        if (!passResult.ok) {
          assert.equal(passResult.error.code, "INVALID_PHASE");
        }
      }
    });
  }
});
