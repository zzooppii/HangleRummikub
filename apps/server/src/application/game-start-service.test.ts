import assert from "node:assert/strict";
import test from "node:test";

import {
  NicknameSchema,
  PlayerIdSchema,
  PresenceVersionSchema,
  RequestIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  type ConnectionStatus,
  type PlayerId,
  type RequestId,
  type RoomId,
  type RoomRevision,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { GameStartService } from "./game-start-service.js";
import { InMemoryPersistence } from "../infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "../infrastructure/keyed-serial-executor.js";
import { FakeClock, FakeIdGenerator } from "../infrastructure/system.js";
import type { RoomRecord, RoomWriteCandidate } from "../model/persistence.js";
import type { PlayerPresenceReader } from "../ports/player-presence-reader.js";
import type { RoomUnitOfWork } from "../ports/room-unit-of-work.js";
import type {
  IdGenerator,
  RandomSource,
  ScheduledTurnDeadline,
  TurnScheduler,
} from "../ports/system.js";

function roomId(value: string): RoomId {
  return parse(RoomIdSchema, value);
}

function playerId(value: string): PlayerId {
  return parse(PlayerIdSchema, value);
}

function requestId(value: string): RequestId {
  return parse(RequestIdSchema, value);
}

function roomRevision(value: number): RoomRevision {
  return parse(RoomRevisionSchema, value);
}

class ZeroRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    if (!Number.isSafeInteger(maxExclusive) || maxExclusive <= 0) {
      throw new RangeError("maxExclusive must be positive.");
    }
    return 0;
  }
}

class MutablePresenceReader implements PlayerPresenceReader {
  readonly statuses = new Map<PlayerId, ConnectionStatus>();

  async readRoomPresence() {
    return {
      presenceVersion: parse(PresenceVersionSchema, 1),
      connectionStatusByPlayerId: new Map(this.statuses),
    };
  }
}

class RecordingTurnScheduler implements TurnScheduler {
  readonly deadlines: ScheduledTurnDeadline[] = [];

  async scheduleTimeout(deadline: ScheduledTurnDeadline): Promise<void> {
    this.deadlines.push(deadline);
  }

  async cancelTimeout(): Promise<void> {
    return;
  }
}

type Harness = Readonly<{
  persistence: InMemoryPersistence;
  service: GameStartService;
  presence: MutablePresenceReader;
  clock: FakeClock;
  room: RoomRecord;
}>;

type HarnessOptions = Readonly<{
  playerCount?: number;
  persistence?: InMemoryPersistence;
  unitOfWork?: RoomUnitOfWork;
  idGenerator?: IdGenerator;
  randomSource?: RandomSource;
  turnScheduler?: TurnScheduler;
}>;

async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const persistence = options.persistence ?? new InMemoryPersistence();
  const playerCount = options.playerCount ?? 2;
  const players = Array.from({ length: playerCount }, (_, index) => ({
    playerId: playerId(`player-${index}`),
    nickname: parse(NicknameSchema, `Player${index}`),
    joinOrder: index,
  }));
  const host = players[0];
  if (host === undefined) {
    throw new Error("Harness requires at least one Player.");
  }
  const candidate: RoomWriteCandidate = {
    roomId: roomId("room-start"),
    roomCode: parse(RoomCodeSchema, "ABCDEF"),
    phase: "LOBBY",
    hostPlayerId: host.playerId,
    players,
    game: null,
    roomRevision: roomRevision(4),
    createdAt: parse(ServerTimeSchema, 500),
    updatedAt: parse(ServerTimeSchema, 500),
  };
  const created = await persistence.createIfAbsent(candidate);
  assert.equal(created.status, "CREATED");
  if (created.status !== "CREATED") {
    throw new Error("Room fixture creation failed.");
  }

  const presence = new MutablePresenceReader();
  for (const player of players) {
    presence.statuses.set(player.playerId, "CONNECTED");
  }
  const clock = new FakeClock(10_000);
  const service = new GameStartService({
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: options.unitOfWork ?? persistence,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(),
    presenceReader: presence,
    clock,
    idGenerator: options.idGenerator ?? new FakeIdGenerator(),
    randomSource: options.randomSource ?? new ZeroRandomSource(),
    ...(options.turnScheduler === undefined
      ? {}
      : { turnScheduler: options.turnScheduler }),
  });

  return { persistence, service, presence, clock, room: created.room };
}

function startInput(room: RoomRecord, overrides: Partial<{
  actorPlayerId: PlayerId;
  requestId: RequestId;
  expectedRoomRevision: RoomRevision;
  authorization: Readonly<{ isCurrent(): boolean }>;
}> = {}) {
  const actorPlayerId = overrides.actorPlayerId ?? room.hostPlayerId;
  if (actorPlayerId === null) {
    throw new Error("Game start fixture requires a Host.");
  }
  return {
    roomId: room.roomId,
    actorPlayerId,
    requestId: overrides.requestId ?? requestId("start-request"),
    expectedRoomRevision:
      overrides.expectedRoomRevision ?? room.roomRevision,
    authorization: overrides.authorization ?? { isCurrent: () => true },
  };
}

function requireError(
  result: Awaited<ReturnType<GameStartService["start"]>>,
  expectedCode: string,
): void {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Expected Game start failure.");
  }
  assert.equal(result.error.code, expectedCode);
}

test("Host와 연결된 2명은 Game을 원자적으로 시작한다", async () => {
  const harness = await createHarness();
  const result = await harness.service.start(startInput(harness.room));

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Expected Game start success.");
  }
  const persisted = await harness.persistence.findById(harness.room.roomId);
  assert.ok(persisted);
  assert.equal(persisted.phase, "PLAYING");
  assert.equal(persisted.roomRevision, harness.room.roomRevision + 1);
  assert.equal(persisted.storageRevision, harness.room.storageRevision + 1);
  assert.ok(persisted.game);
  assert.ok(persisted.game.turn);
  assert.equal(persisted.game.gameRevision, 0);
  assert.equal(result.data.gameId, persisted.game.gameId);
  assert.equal(result.data.turnId, persisted.game.turn.turnId);
  assert.equal(persisted.game.turn.turnNumber, 1);
  assert.equal(persisted.game.gameStartedAt, harness.clock.now());
  assert.equal(persisted.game.turn.startedAt, harness.clock.now());
  assert.equal(persisted.game.turn.deadlineAt, harness.clock.now() + 60_000);
  assert.equal(persisted.game.gameDeadlineAt, harness.clock.now() + 1_500_000);
});

test("game:start commit 후 first Turn을 scheduler에 등록한다", async () => {
  const scheduler = new RecordingTurnScheduler();
  const harness = await createHarness({ turnScheduler: scheduler });
  const result = await harness.service.start(startInput(harness.room));
  assert.equal(result.ok, true);
  assert.equal(scheduler.deadlines.length, 1);
  const scheduled = scheduler.deadlines[0];
  const room = await harness.persistence.findById(harness.room.roomId);
  assert.ok(scheduled && room?.game?.turn);
  assert.deepEqual(scheduled, {
    roomId: room.roomId,
    gameId: room.game.gameId,
    turnId: room.game.turn.turnId,
    expectedGameRevision: room.game.gameRevision,
    deadlineAt: room.game.turn.deadlineAt,
  });
});

test("Game start authorization과 phase precondition을 안정적으로 거절한다", async (context) => {
  await context.test("한 명이면 NOT_ENOUGH_PLAYERS", async () => {
    const harness = await createHarness({ playerCount: 1 });
    requireError(
      await harness.service.start(startInput(harness.room)),
      "NOT_ENOUGH_PLAYERS",
    );
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      harness.room,
    );
  });

  await context.test("다섯 명인 비정상 Room은 시작할 수 없다", async () => {
    const harness = await createHarness({ playerCount: 5 });
    requireError(
      await harness.service.start(startInput(harness.room)),
      "INVALID_PHASE",
    );
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      harness.room,
    );
  });

  await context.test("non-Host면 HOST_ONLY", async () => {
    const harness = await createHarness();
    const guest = harness.room.players[1];
    assert.ok(guest);
    requireError(
      await harness.service.start(
        startInput(harness.room, { actorPlayerId: guest.playerId }),
      ),
      "HOST_ONLY",
    );
  });

  await context.test("Player가 OFFLINE이면 PLAYERS_NOT_CONNECTED", async () => {
    const harness = await createHarness();
    const guest = harness.room.players[1];
    assert.ok(guest);
    harness.presence.statuses.set(guest.playerId, "OFFLINE");
    requireError(
      await harness.service.start(startInput(harness.room)),
      "PLAYERS_NOT_CONNECTED",
    );
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      harness.room,
    );
  });

  await context.test("stale revision이면 STALE_ROOM_REVISION", async () => {
    const harness = await createHarness();
    requireError(
      await harness.service.start(
        startInput(harness.room, { expectedRoomRevision: roomRevision(3) }),
      ),
      "STALE_ROOM_REVISION",
    );
  });
});

test("accepted game:start retry는 Game, Tile, rack과 shuffle을 다시 만들지 않는다", async () => {
  const harness = await createHarness();
  const input = startInput(harness.room);
  const first = await harness.service.start(input);
  assert.equal(first.ok, true);
  const afterFirst = await harness.persistence.findById(harness.room.roomId);
  assert.ok(afterFirst?.game);

  const replay = await harness.service.start(input);
  assert.deepEqual(replay, first);
  const afterReplay = await harness.persistence.findById(harness.room.roomId);
  assert.deepEqual(afterReplay, afterFirst);
});

test("commit 직전 actor authorization이 철회되면 Game과 idempotency를 남기지 않는다", async () => {
  const harness = await createHarness();
  const input = startInput(harness.room, {
    requestId: requestId("revoked-before-commit"),
    authorization: { isCurrent: () => false },
  });

  requireError(await harness.service.start(input), "UNAUTHENTICATED");
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    harness.room,
  );
  assert.deepEqual(
    await harness.persistence.classify(
      `room-player:${input.roomId}:${input.actorPlayerId}`,
      input.requestId,
      JSON.stringify(["game:start", input.expectedRoomRevision]),
    ),
    { status: "MISS" },
  );
});

test("같은 requestId의 다른 fingerprint와 새 request의 재시작을 구분한다", async () => {
  const harness = await createHarness();
  const first = await harness.service.start(startInput(harness.room));
  assert.equal(first.ok, true);

  requireError(
    await harness.service.start(
      startInput(harness.room, {
        expectedRoomRevision: roomRevision(harness.room.roomRevision + 1),
      }),
    ),
    "REQUEST_ID_REUSED",
  );
  requireError(
    await harness.service.start(
      startInput(harness.room, { requestId: requestId("new-start") }),
    ),
    "INVALID_PHASE",
  );
});

test("accepted idempotency record는 non-secret 최소 result만 저장한다", async () => {
  const harness = await createHarness();
  const input = startInput(harness.room);
  const result = await harness.service.start(input);
  assert.equal(result.ok, true);

  const lookup = await harness.persistence.classify(
    `room-player:${input.roomId}:${input.actorPlayerId}`,
    input.requestId,
    JSON.stringify(["game:start", input.expectedRoomRevision]),
  );
  assert.equal(lookup.status, "REPLAY");
  if (lookup.status !== "REPLAY") {
    throw new Error("Expected accepted idempotency record.");
  }
  if (
    typeof lookup.record.terminalResult !== "object" ||
    lookup.record.terminalResult === null ||
    Array.isArray(lookup.record.terminalResult)
  ) {
    throw new Error("Expected an object terminal result.");
  }
  assert.deepEqual(
    Object.keys(lookup.record.terminalResult).sort(),
    ["gameId", "gameRevision", "roomId", "roomRevision", "turnId"],
  );
});

test("UnitOfWork failure injection은 partial Game과 accepted idempotency를 남기지 않는다", async () => {
  const persistence = new InMemoryPersistence({
    onCommitCheckpoint(checkpoint) {
      if (checkpoint === "AFTER_IDEMPOTENCY_WRITE") {
        throw new Error("injected commit failure");
      }
    },
  });
  const harness = await createHarness({ persistence });
  const input = startInput(harness.room);
  requireError(await harness.service.start(input), "INTERNAL_ERROR");

  assert.deepEqual(
    await persistence.findById(harness.room.roomId),
    harness.room,
  );
  assert.deepEqual(
    await persistence.classify(
      `room-player:${input.roomId}:${input.actorPlayerId}`,
      input.requestId,
      JSON.stringify(["game:start", input.expectedRoomRevision]),
    ),
    { status: "MISS" },
  );
});

test("Tile 생성 중 예외는 canonical Room을 변경하지 않는다", async () => {
  const base = new FakeIdGenerator();
  const failingIds: IdGenerator = {
    generateRoomId: () => base.generateRoomId(),
    generatePlayerId: () => base.generatePlayerId(),
    generateGameId: () => base.generateGameId(),
    generateTurnId: () => base.generateTurnId(),
    generateTileId: () => {
      throw new Error("injected tile generation failure");
    },
  };
  const harness = await createHarness({ idGenerator: failingIds });
  requireError(
    await harness.service.start(startInput(harness.room)),
    "INTERNAL_ERROR",
  );
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    harness.room,
  );
});

test("repository CAS failure는 stale rejection이며 partial Game을 남기지 않는다", async () => {
  const persistence = new InMemoryPersistence();
  const rejectingUnitOfWork: RoomUnitOfWork = {
    commit: async () => ({
      status: "PRECONDITION_FAILED",
      reason: "STALE_STORAGE_REVISION",
    }),
  };
  const harness = await createHarness({
    persistence,
    unitOfWork: rejectingUnitOfWork,
  });
  requireError(
    await harness.service.start(startInput(harness.room)),
    "STALE_ROOM_REVISION",
  );
  assert.deepEqual(
    await persistence.findById(harness.room.roomId),
    harness.room,
  );
});

test("같은 Room의 동시 start 중 canonical mutation은 한 번만 성공한다", async () => {
  const harness = await createHarness();
  const [first, second] = await Promise.all([
    harness.service.start(
      startInput(harness.room, { requestId: requestId("concurrent-a") }),
    ),
    harness.service.start(
      startInput(harness.room, { requestId: requestId("concurrent-b") }),
    ),
  ]);

  assert.equal([first, second].filter((result) => result.ok).length, 1);
  const rejection = [first, second].find((result) => !result.ok);
  assert.ok(rejection && !rejection.ok);
  assert.equal(rejection.error.code, "INVALID_PHASE");
  const persisted = await harness.persistence.findById(harness.room.roomId);
  assert.ok(persisted?.game);
  assert.equal(persisted.roomRevision, harness.room.roomRevision + 1);
});
