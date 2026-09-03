import assert from "node:assert/strict";
import test from "node:test";

import {
  GameIdSchema,
  GameRevisionSchema,
  NicknameSchema,
  PlayerIdSchema,
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
  type ServerTime,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  TurnDrawService,
  type TurnDrawInput,
} from "./turn-draw-service.js";
import { TurnPassService, type TurnPassInput } from "./turn-pass-service.js";
import { TurnSubmitService } from "./turn-submit-service.js";
import { TurnTimeoutService } from "./turn-timeout-service.js";
import type { Board } from "../domain/game/board.js";
import {
  createDefaultRulesConfig,
  type PlayingGameState,
} from "../domain/game/game-state.js";
import type {
  OrdinaryTileInstance,
  TileSourceBag,
} from "../domain/game/tile-inventory.js";
import { InMemoryPersistence } from "../infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "../infrastructure/keyed-serial-executor.js";
import { OverdueTurnSweeper } from "../infrastructure/overdue-turn-sweeper.js";
import { FakeClock, FakeIdGenerator } from "../infrastructure/system.js";
import { TestDictionaryProvider } from "../infrastructure/test-dictionary-provider.js";
import type { RoomRecord, RoomWriteCandidate } from "../model/persistence.js";
import type {
  RandomSource,
  ScheduledTurnDeadline,
  TurnScheduler,
} from "../ports/system.js";
import type {
  PlayerPresenceLease,
  PlayerPresenceLeaseReader,
} from "../ports/player-presence-lease.js";

const PLAYER_A = parse(PlayerIdSchema, "player-a");
const PLAYER_B = parse(PlayerIdSchema, "player-b");

function tileId(value: string): TileId {
  return parse(TileIdSchema, value);
}

function requestId(value: string): RequestId {
  return parse(RequestIdSchema, value);
}

function serverTime(value: number): ServerTime {
  return parse(ServerTimeSchema, value);
}

function tile(value: string, sourceBag: TileSourceBag): OrdinaryTileInstance {
  return sourceBag === "CONSONANT"
    ? Object.freeze({
        tileId: tileId(value),
        kind: "ORDINARY",
        physicalType: "MIEUM",
        sourceBag,
        allowedSymbols: Object.freeze(["ㅁ"] as const),
      })
    : Object.freeze({
        tileId: tileId(value),
        kind: "ORDINARY",
        physicalType: "A_ROTATION",
        sourceBag,
        allowedSymbols: Object.freeze(["ㅏ", "ㅓ", "ㅗ", "ㅜ"] as const),
      });
}

class MutableAuthorization {
  current = true;

  isCurrent(): boolean {
    return this.current;
  }
}

class RevokedOnRecheckAuthorization {
  #checks = 0;

  isCurrent(): boolean {
    this.#checks += 1;
    return this.#checks === 1;
  }
}

class RevokedAtCommitAuthorization {
  #checks = 0;

  isCurrent(): boolean {
    this.#checks += 1;
    return this.#checks <= 2;
  }
}

class RecordingScheduler implements TurnScheduler {
  readonly deadlines: ScheduledTurnDeadline[] = [];
  failuresRemaining = 0;

  async scheduleTimeout(deadline: ScheduledTurnDeadline): Promise<void> {
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("injected schedule failure");
    }
    this.deadlines.push(Object.freeze({ ...deadline }));
  }

  async cancelTimeout(): Promise<void> {
    return;
  }
}

class SequenceRandomSource implements RandomSource {
  readonly calls: number[] = [];
  #cursor = 0;

  constructor(private readonly sequence: readonly number[]) {}

  nextInt(maxExclusive: number): number {
    this.calls.push(maxExclusive);
    const value = this.sequence[this.#cursor];
    if (value === undefined) {
      throw new Error("Missing deterministic random value.");
    }
    this.#cursor += 1;
    return value;
  }
}

class MutablePresenceLeaseReader implements PlayerPresenceLeaseReader {
  #revision = 0;

  constructor(public connectionStatus: "CONNECTED" | "OFFLINE") {}

  setConnectionStatus(status: "CONNECTED" | "OFFLINE"): void {
    this.connectionStatus = status;
    this.#revision += 1;
  }

  invalidate(): void {
    this.#revision += 1;
  }

  async acquirePlayerPresenceLease(): Promise<PlayerPresenceLease> {
    const capturedRevision = this.#revision;
    const connectionStatus = this.connectionStatus;
    return Object.freeze({
      connectionStatus,
      connectionGeneration: 1,
      isCurrent: () => this.#revision === capturedRevision,
    });
  }
}

type Harness = Readonly<{
  persistence: InMemoryPersistence;
  executor: KeyedSerialExecutor<RoomId>;
  clock: FakeClock;
  randomSource: SequenceRandomSource;
  scheduler: RecordingScheduler;
  authorization: MutableAuthorization;
  presenceLeaseReader: MutablePresenceLeaseReader;
  room: RoomRecord;
  drawService: TurnDrawService;
  passService: TurnPassService;
  timeoutService: TurnTimeoutService;
}>;

type HarnessOptions = Readonly<{
  consonantCount?: number;
  vowelCount?: number;
  clockNow?: number;
  deadlineAt?: number;
  randomSequence?: readonly number[];
  scheduler?: RecordingScheduler;
  playerAOfflineTimeoutStreak?: number;
  playerBForfeited?: boolean;
  playerAPresence?: "CONNECTED" | "OFFLINE";
}>;

async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const consonants = Array.from(
    { length: options.consonantCount ?? 4 },
    (_, index) => tile(`consonant-${index + 1}`, "CONSONANT"),
  );
  const vowels = Array.from(
    { length: options.vowelCount ?? 4 },
    (_, index) => tile(`vowel-${index + 1}`, "VOWEL"),
  );
  const rackA = tile("rack-a", "CONSONANT");
  const rackB = tile("rack-b", "VOWEL");
  const allTiles = [...consonants, ...vowels, rackA, rackB];
  const board: Board = Object.freeze({ wordGroups: Object.freeze([]) });
  const game: PlayingGameState = Object.freeze({
    gameId: parse(GameIdSchema, "game-turn-end"),
    gameRevision: parse(GameRevisionSchema, 4),
    rulesConfig: createDefaultRulesConfig(),
    tilesById: new Map(allTiles.map((entry) => [entry.tileId, entry])),
    consonantBag: Object.freeze(consonants.map((entry) => entry.tileId)),
    vowelBag: Object.freeze(vowels.map((entry) => entry.tileId)),
    racks: new Map<PlayerId, readonly TileId[]>([
      [PLAYER_A, Object.freeze([rackA.tileId])],
      [PLAYER_B, Object.freeze([rackB.tileId])],
    ]),
    board,
    initialMeldCompleted: new Map<PlayerId, boolean>([
      [PLAYER_A, false],
      [PLAYER_B, true],
    ]),
    offlineTimeoutStreakByPlayerId: new Map<PlayerId, number>([
      [PLAYER_A, options.playerAOfflineTimeoutStreak ?? 0],
      [PLAYER_B, 0],
    ]),
    forfeitedPlayerIds: new Set<PlayerId>(
      options.playerBForfeited ? [PLAYER_B] : [],
    ),
    turnOrder: Object.freeze([PLAYER_A, PLAYER_B]),
    turn: Object.freeze({
      turnId: parse(TurnIdSchema, "turn-current"),
      turnNumber: 8,
      activePlayerId: PLAYER_A,
      startedAt: serverTime(1_000),
      deadlineAt: serverTime(options.deadlineAt ?? 61_000),
    }),
    result: null,
    gameStartedAt: serverTime(1_000),
    gameDeadlineAt: serverTime(1_501_000),
  });
  const persistence = new InMemoryPersistence();
  const candidate: RoomWriteCandidate = {
    roomId: parse(RoomIdSchema, "room-turn-end"),
    roomCode: parse(RoomCodeSchema, "ABCDEF"),
    phase: "PLAYING",
    hostPlayerId: PLAYER_A,
    players: [
      {
        playerId: PLAYER_A,
        nickname: parse(NicknameSchema, "PlayerA"),
        joinOrder: 0,
      },
      {
        playerId: PLAYER_B,
        nickname: parse(NicknameSchema, "PlayerB"),
        joinOrder: 1,
      },
    ],
    game,
    roomRevision: parse(RoomRevisionSchema, 3),
    createdAt: serverTime(500),
    updatedAt: serverTime(1_000),
  };
  const created = await persistence.createIfAbsent(candidate);
  assert.equal(created.status, "CREATED");
  if (created.status !== "CREATED") {
    throw new Error("Turn end fixture Room creation failed.");
  }

  const executor = new KeyedSerialExecutor<RoomId>();
  const clock = new FakeClock(options.clockNow ?? 10_000);
  const randomSource = new SequenceRandomSource(
    options.randomSequence ?? [0, 1, 0, 1, 0, 1],
  );
  const scheduler = options.scheduler ?? new RecordingScheduler();
  const authorization = new MutableAuthorization();
  const presenceLeaseReader = new MutablePresenceLeaseReader(
    options.playerAPresence ?? "CONNECTED",
  );
  const common = {
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: persistence,
    roomMutationExecutor: executor,
    clock,
    idGenerator: new FakeIdGenerator(),
    turnScheduler: scheduler,
    presenceLeaseReader,
  };

  return {
    persistence,
    executor,
    clock,
    randomSource,
    scheduler,
    authorization,
    presenceLeaseReader,
    room: created.room,
    drawService: new TurnDrawService(common),
    passService: new TurnPassService(common),
    timeoutService: new TurnTimeoutService({ ...common, randomSource }),
  };
}

function drawInput(
  harness: Harness,
  overrides: Partial<TurnDrawInput> = {},
): TurnDrawInput {
  const game = harness.room.game;
  if (game?.turn === null || game === null) {
    throw new Error("Harness requires a playing Game.");
  }
  return {
    roomId: harness.room.roomId,
    actorPlayerId: PLAYER_A,
    requestId: requestId("draw-request"),
    expectedGameRevision: game.gameRevision,
    turnId: game.turn.turnId,
    receivedAt: serverTime(60_999),
    bagKind: "CONSONANT",
    authorization: harness.authorization,
    ...overrides,
  };
}

function passInput(
  harness: Harness,
  overrides: Partial<TurnPassInput> = {},
): TurnPassInput {
  const game = harness.room.game;
  if (game?.turn === null || game === null) {
    throw new Error("Harness requires a playing Game.");
  }
  return {
    roomId: harness.room.roomId,
    actorPlayerId: PLAYER_A,
    requestId: requestId("pass-request"),
    expectedGameRevision: game.gameRevision,
    turnId: game.turn.turnId,
    receivedAt: serverTime(60_999),
    authorization: harness.authorization,
    ...overrides,
  };
}

function deadline(room: RoomRecord): ScheduledTurnDeadline {
  const game = room.game;
  if (game?.turn === null || game === null) {
    throw new Error("Harness requires a playing Game.");
  }
  return {
    roomId: room.roomId,
    gameId: game.gameId,
    turnId: game.turn.turnId,
    expectedGameRevision: game.gameRevision,
    deadlineAt: game.turn.deadlineAt,
  };
}

function requireError(
  result: Awaited<ReturnType<TurnDrawService["draw"]>> | Awaited<ReturnType<TurnPassService["pass"]>>,
  code: string,
): void {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Expected turn command rejection.");
  }
  assert.equal(result.error.code, code);
}

test("turn:draw removes one server-selected Tile, appends it to rack, and advances once", async (context) => {
  for (const bagKind of ["CONSONANT", "VOWEL"] as const) {
    await context.test(bagKind, async () => {
      const harness = await createHarness();
      const before = await harness.persistence.findById(harness.room.roomId);
      assert.ok(before?.game?.turn);
      const selectedBefore =
        bagKind === "CONSONANT"
          ? before.game.consonantBag
          : before.game.vowelBag;
      const expectedTile = selectedBefore.at(-1);
      assert.ok(expectedTile);

      const result = await harness.drawService.draw(
        drawInput(harness, {
          bagKind,
          requestId: requestId(`draw-${bagKind}`),
        }),
      );
      assert.equal(result.ok, true);
      if (!result.ok) {
        throw new Error("Expected Draw success.");
      }
      assert.equal(result.data.drawnTileId, expectedTile);

      const after = await harness.persistence.findById(harness.room.roomId);
      assert.ok(after?.game?.turn);
      assert.equal(after.roomRevision, before.roomRevision);
      assert.equal(after.storageRevision, before.storageRevision + 1);
      assert.equal(after.game.gameRevision, before.game.gameRevision + 1);
      assert.deepEqual(after.game.board, before.game.board);
      assert.equal(
        after.game.initialMeldCompleted.get(PLAYER_A),
        before.game.initialMeldCompleted.get(PLAYER_A),
      );
      assert.equal(after.game.racks.get(PLAYER_A)?.at(-1), expectedTile);
      assert.equal(after.game.turn.activePlayerId, PLAYER_B);
      assert.equal(after.game.turn.turnNumber, before.game.turn.turnNumber + 1);
      assert.equal(after.game.turn.startedAt, harness.clock.now());
      assert.equal(
        after.game.turn.deadlineAt,
        harness.clock.now() + after.game.rulesConfig.turnDurationMs,
      );
      const selectedAfter =
        bagKind === "CONSONANT"
          ? after.game.consonantBag
          : after.game.vowelBag;
      assert.equal(selectedAfter.length, selectedBefore.length - 1);
      assert.equal(harness.scheduler.deadlines.length, 1);
    });
  }
});

test("empty selected bag and disallowed pass reject without mutation", async (context) => {
  await context.test("selected empty bag reports BAG_EMPTY", async () => {
    const harness = await createHarness({ consonantCount: 0, vowelCount: 1 });
    const before = await harness.persistence.findById(harness.room.roomId);
    requireError(await harness.drawService.draw(drawInput(harness)), "BAG_EMPTY");
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      before,
    );
  });

  await context.test("remaining Tile reports PASS_NOT_ALLOWED", async () => {
    const harness = await createHarness({ consonantCount: 0, vowelCount: 1 });
    const before = await harness.persistence.findById(harness.room.roomId);
    requireError(
      await harness.passService.pass(passInput(harness)),
      "PASS_NOT_ALLOWED",
    );
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      before,
    );
  });
});

test("Draw/Pass reject stale primary and UoW failure without partial state", async (context) => {
  await context.test("current-primary is rechecked before Draw candidate", async () => {
    const harness = await createHarness();
    const before = await harness.persistence.findById(harness.room.roomId);
    requireError(
      await harness.drawService.draw(
        drawInput(harness, {
          authorization: new RevokedOnRecheckAuthorization(),
        }),
      ),
      "UNAUTHENTICATED",
    );
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      before,
    );
  });

  await context.test("current-primary is rechecked before Pass candidate", async () => {
    const harness = await createHarness({ consonantCount: 0, vowelCount: 0 });
    const before = await harness.persistence.findById(harness.room.roomId);
    requireError(
      await harness.passService.pass(
        passInput(harness, {
          authorization: new RevokedOnRecheckAuthorization(),
        }),
      ),
      "UNAUTHENTICATED",
    );
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      before,
    );
  });

  for (const kind of ["DRAW", "PASS"] as const) {
    await context.test(`${kind} current-primary atomic commit guard`, async () => {
      const harness = await createHarness({
        consonantCount: kind === "PASS" ? 0 : 1,
        vowelCount: kind === "PASS" ? 0 : 1,
      });
      const before = await harness.persistence.findById(harness.room.roomId);
      const authorization = new RevokedAtCommitAuthorization();
      const result =
        kind === "DRAW"
          ? await harness.drawService.draw(
              drawInput(harness, { authorization }),
            )
          : await harness.passService.pass(
              passInput(harness, { authorization }),
            );
      requireError(result, "UNAUTHENTICATED");
      assert.deepEqual(
        await harness.persistence.findById(harness.room.roomId),
        before,
      );
    });
  }

  for (const kind of ["DRAW", "PASS"] as const) {
    await context.test(`${kind} UoW CAS rejection`, async () => {
      const harness = await createHarness({
        consonantCount: kind === "PASS" ? 0 : 1,
        vowelCount: kind === "PASS" ? 0 : 1,
      });
      const before = await harness.persistence.findById(harness.room.roomId);
      const dependencies = {
        roomRepository: harness.persistence,
        idempotencyRepository: harness.persistence,
        roomUnitOfWork: {
          async commit() {
            return {
              status: "PRECONDITION_FAILED" as const,
              reason: "STALE_STORAGE_REVISION" as const,
            };
          },
        },
        roomMutationExecutor: harness.executor,
        clock: harness.clock,
        idGenerator: new FakeIdGenerator(),
      };
      const result =
        kind === "DRAW"
          ? await new TurnDrawService(dependencies).draw(drawInput(harness))
          : await new TurnPassService(dependencies).pass(passInput(harness));
      requireError(result, "STALE_GAME_REVISION");
      assert.deepEqual(
        await harness.persistence.findById(harness.room.roomId),
        before,
      );
    });
  }
});

test("turn:pass succeeds only with both bags empty and preserves rack/Board", async () => {
  const harness = await createHarness({ consonantCount: 0, vowelCount: 0 });
  const before = await harness.persistence.findById(harness.room.roomId);
  assert.ok(before?.game?.turn);
  const result = await harness.passService.pass(passInput(harness));
  assert.equal(result.ok, true);

  const after = await harness.persistence.findById(harness.room.roomId);
  assert.ok(after?.game?.turn);
  assert.equal(after.roomRevision, before.roomRevision);
  assert.equal(after.storageRevision, before.storageRevision + 1);
  assert.equal(after.game.gameRevision, before.game.gameRevision + 1);
  assert.deepEqual(after.game.racks, before.game.racks);
  assert.deepEqual(after.game.board, before.game.board);
  assert.deepEqual(
    after.game.initialMeldCompleted,
    before.game.initialMeldCompleted,
  );
  assert.equal(after.game.turn.activePlayerId, PLAYER_B);
  assert.equal(harness.scheduler.deadlines.length, 1);
});

test("Draw and Pass use accepted-result idempotency without advancing twice", async (context) => {
  await context.test("Draw replay returns the same Tile and next Turn", async () => {
    const harness = await createHarness();
    const input = drawInput(harness);
    const first = await harness.drawService.draw(input);
    const afterFirst = await harness.persistence.findById(harness.room.roomId);
    const replay = await harness.drawService.draw(input);
    assert.deepEqual(replay, first);
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      afterFirst,
    );

    requireError(
      await harness.drawService.draw({ ...input, bagKind: "VOWEL" }),
      "REQUEST_ID_REUSED",
    );
  });

  await context.test("Pass replay creates no second Turn", async () => {
    const harness = await createHarness({ consonantCount: 0, vowelCount: 0 });
    const input = passInput(harness);
    const first = await harness.passService.pass(input);
    const afterFirst = await harness.persistence.findById(harness.room.roomId);
    assert.deepEqual(await harness.passService.pass(input), first);
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      afterFirst,
    );
  });
});

test("deadline equality rejects Draw/Pass while timeout advances the Turn", async (context) => {
  await context.test("Draw", async () => {
    const harness = await createHarness({ clockNow: 61_000 });
    requireError(
      await harness.drawService.draw(
        drawInput(harness, { receivedAt: serverTime(61_000) }),
      ),
      "TURN_EXPIRED",
    );
    assert.equal(
      (await harness.timeoutService.timeout(deadline(harness.room))).status,
      "APPLIED",
    );
  });

  await context.test("Pass", async () => {
    const harness = await createHarness({
      consonantCount: 0,
      vowelCount: 0,
      clockNow: 61_000,
    });
    requireError(
      await harness.passService.pass(
        passInput(harness, { receivedAt: serverTime(61_000) }),
      ),
      "TURN_EXPIRED",
    );
    assert.equal(
      (await harness.timeoutService.timeout(deadline(harness.room))).status,
      "APPLIED",
    );
  });
});

test("timeout is Clock-authoritative at the exact deadline and draws three deterministic penalties", async () => {
  const harness = await createHarness({ clockNow: 60_999, randomSequence: [0, 1, 0] });
  const identity = deadline(harness.room);
  const before = await harness.persistence.findById(harness.room.roomId);
  assert.equal((await harness.timeoutService.timeout(identity)).status, "NO_OP");
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    before,
  );
  assert.deepEqual(harness.scheduler.deadlines, [identity]);

  harness.clock.set(61_000);
  const result = await harness.timeoutService.timeout(identity);
  assert.equal(result.status, "APPLIED");
  if (result.status !== "APPLIED") {
    throw new Error("Expected timeout application.");
  }
  assert.equal(result.data.penaltyTileIds.length, 3);
  assert.deepEqual(harness.randomSource.calls, [2, 2, 2]);

  const after = await harness.persistence.findById(harness.room.roomId);
  assert.ok(after?.game?.turn && before?.game?.turn);
  assert.equal(after.game.racks.get(PLAYER_A)?.length, 4);
  assert.equal(after.game.consonantBag.length, 2);
  assert.equal(after.game.vowelBag.length, 3);
  assert.deepEqual(after.game.board, before.game.board);
  assert.equal(after.game.gameRevision, before.game.gameRevision + 1);
  assert.equal(after.storageRevision, before.storageRevision + 1);
  assert.equal(after.roomRevision, before.roomRevision);
  assert.equal(after.game.turn.activePlayerId, PLAYER_B);
  assert.equal(harness.scheduler.deadlines.length, 2);
  assert.equal(
    harness.scheduler.deadlines[1]?.turnId,
    after.game.turn.turnId,
  );
});

test("timeout at deadline +1ms is accepted and does not require a socket authorization", async () => {
  const harness = await createHarness({ clockNow: 61_001 });
  const result = await harness.timeoutService.timeout(deadline(harness.room));
  assert.equal(result.status, "APPLIED");
  const after = await harness.persistence.findById(harness.room.roomId);
  assert.equal(after?.game?.gameRevision, 5);
});

test("OFFLINE timeout streak increments once, then second timeout forfeits after penalty", async (context) => {
  await context.test("first OFFLINE timeout records streak one", async () => {
    const harness = await createHarness({
      clockNow: 61_000,
      playerAPresence: "OFFLINE",
    });
    const result = await harness.timeoutService.timeout(deadline(harness.room));
    assert.equal(result.status, "APPLIED");
    if (result.status !== "APPLIED") {
      throw new Error("Expected first OFFLINE timeout application.");
    }
    assert.equal(result.data.offlineTimeoutStreak, 1);
    assert.equal(result.data.timedOutPlayerForfeited, false);

    const after = await harness.persistence.findById(harness.room.roomId);
    assert.equal(after?.game?.offlineTimeoutStreakByPlayerId.get(PLAYER_A), 1);
    assert.equal(after?.game?.forfeitedPlayerIds.has(PLAYER_A), false);
    assert.equal(after?.game?.racks.get(PLAYER_A)?.length, 4);
  });

  await context.test(
    "second consecutive OFFLINE timeout applies penalty and forfeit atomically",
    async () => {
      const harness = await createHarness({
        clockNow: 61_000,
        playerAPresence: "OFFLINE",
        playerAOfflineTimeoutStreak: 1,
      });
      const before = await harness.persistence.findById(harness.room.roomId);
      assert.ok(before?.game?.turn);
      const result = await harness.timeoutService.timeout(deadline(harness.room));
      assert.equal(result.status, "APPLIED");
      if (result.status !== "APPLIED") {
        throw new Error("Expected second OFFLINE timeout application.");
      }
      assert.equal(result.data.offlineTimeoutStreak, 2);
      assert.equal(result.data.timedOutPlayerForfeited, true);

      const after = await harness.persistence.findById(harness.room.roomId);
      assert.ok(after?.game?.turn);
      assert.equal(after.game.gameRevision, before.game.gameRevision + 1);
      assert.equal(after.storageRevision, before.storageRevision + 1);
      assert.equal(after.game.racks.get(PLAYER_A)?.length, 4);
      assert.equal(
        after.game.offlineTimeoutStreakByPlayerId.get(PLAYER_A),
        2,
      );
      assert.equal(after.game.forfeitedPlayerIds.has(PLAYER_A), true);
      assert.equal(after.game.turn.activePlayerId, PLAYER_B);
    },
  );
});

test("CONNECTED timeout resets an existing offline streak without forfeiting", async () => {
  const harness = await createHarness({
    clockNow: 61_000,
    playerAPresence: "CONNECTED",
    playerAOfflineTimeoutStreak: 1,
  });
  const result = await harness.timeoutService.timeout(deadline(harness.room));
  assert.equal(result.status, "APPLIED");
  if (result.status !== "APPLIED") {
    throw new Error("Expected connected timeout application.");
  }
  assert.equal(result.data.offlineTimeoutStreak, 0);
  assert.equal(result.data.timedOutPlayerForfeited, false);
  const after = await harness.persistence.findById(harness.room.roomId);
  assert.equal(after?.game?.offlineTimeoutStreakByPlayerId.get(PLAYER_A), 0);
  assert.equal(after?.game?.forfeitedPlayerIds.has(PLAYER_A), false);
});

test("next Turn skips forfeited Players while immutable turnOrder stays complete", async () => {
  const harness = await createHarness({
    clockNow: 61_000,
    playerBForfeited: true,
  });
  const result = await harness.timeoutService.timeout(deadline(harness.room));
  assert.equal(result.status, "APPLIED");
  const after = await harness.persistence.findById(harness.room.roomId);
  assert.ok(after?.game?.turn);
  assert.deepEqual(after.game.turnOrder, [PLAYER_A, PLAYER_B]);
  assert.equal(after.game.forfeitedPlayerIds.has(PLAYER_B), true);
  assert.equal(after.game.turn.activePlayerId, PLAYER_A);
  assert.equal(after.game.turn.turnNumber, 9);
});

test("timeout that would leave no eligible Player fails without a partial penalty or forfeit", async () => {
  const harness = await createHarness({
    clockNow: 61_000,
    playerAPresence: "OFFLINE",
    playerAOfflineTimeoutStreak: 1,
    playerBForfeited: true,
    randomSequence: [],
  });
  const before = await harness.persistence.findById(harness.room.roomId);

  assert.deepEqual(await harness.timeoutService.timeout(deadline(harness.room)), {
    status: "FAILED",
    reason: "INTERNAL_ERROR",
  });
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    before,
  );
  assert.deepEqual(harness.randomSource.calls, []);
});

test("presence lease changing before commit makes timeout a no-op without partial penalty or forfeit", async () => {
  const harness = await createHarness({
    clockNow: 61_000,
    playerAPresence: "OFFLINE",
    playerAOfflineTimeoutStreak: 1,
  });
  const before = await harness.persistence.findById(harness.room.roomId);
  const timeoutService = new TurnTimeoutService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: {
      commit: (changeSet, precondition) => {
        harness.presenceLeaseReader.setConnectionStatus("CONNECTED");
        return harness.persistence.commit(changeSet, precondition);
      },
    },
    roomMutationExecutor: harness.executor,
    clock: harness.clock,
    idGenerator: new FakeIdGenerator(),
    randomSource: harness.randomSource,
    presenceLeaseReader: harness.presenceLeaseReader,
  });

  assert.deepEqual(await timeoutService.timeout(deadline(harness.room)), {
    status: "NO_OP",
    reason: "PRESENCE_CHANGED",
  });
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    before,
  );
});

test("stale timeout game/turn/revision/deadline identities are harmless no-ops", async (context) => {
  const cases: readonly Readonly<{
    name: string;
    change: Partial<ScheduledTurnDeadline>;
    reason: string;
  }>[] = [
    {
      name: "game",
      change: { gameId: parse(GameIdSchema, "other-game") },
      reason: "STALE_GAME",
    },
    {
      name: "turn",
      change: { turnId: parse(TurnIdSchema, "other-turn") },
      reason: "STALE_TURN",
    },
    {
      name: "revision",
      change: { expectedGameRevision: parse(GameRevisionSchema, 3) },
      reason: "STALE_GAME_REVISION",
    },
    {
      name: "deadline",
      change: { deadlineAt: serverTime(60_999) },
      reason: "STALE_DEADLINE",
    },
  ];

  for (const entry of cases) {
    await context.test(entry.name, async () => {
      const harness = await createHarness({ clockNow: 61_001 });
      const before = await harness.persistence.findById(harness.room.roomId);
      const result = await harness.timeoutService.timeout({
        ...deadline(harness.room),
        ...entry.change,
      });
      assert.equal(result.status, "NO_OP");
      if (result.status !== "NO_OP") {
        throw new Error("Expected stale timeout no-op.");
      }
      assert.equal(result.reason, entry.reason);
      assert.deepEqual(
        await harness.persistence.findById(harness.room.roomId),
        before,
      );
    });
  }
});

test("timeout penalty is capped by remaining physical Tiles without inventing any", async (context) => {
  for (const remaining of [2, 1, 0] as const) {
    await context.test(`${remaining} remaining`, async () => {
      const harness = await createHarness({
        consonantCount: remaining,
        vowelCount: 0,
        clockNow: 61_000,
        randomSequence: [],
      });
      const result = await harness.timeoutService.timeout(deadline(harness.room));
      assert.equal(result.status, "APPLIED");
      if (result.status !== "APPLIED") {
        throw new Error("Expected timeout application.");
      }
      assert.equal(result.data.penaltyTileIds.length, remaining);
      assert.deepEqual(harness.randomSource.calls, []);
      const after = await harness.persistence.findById(harness.room.roomId);
      assert.equal(after?.game?.racks.get(PLAYER_A)?.length, 1 + remaining);
    });
  }
});

test("vowel-only timeout penalty never consumes RandomSource", async () => {
  const harness = await createHarness({
    consonantCount: 0,
    vowelCount: 3,
    clockNow: 61_000,
    randomSequence: [],
  });
  const result = await harness.timeoutService.timeout(deadline(harness.room));
  assert.equal(result.status, "APPLIED");
  if (result.status !== "APPLIED") {
    throw new Error("Expected timeout application.");
  }
  assert.equal(result.data.penaltyTileIds.length, 3);
  assert.deepEqual(harness.randomSource.calls, []);
  const after = await harness.persistence.findById(harness.room.roomId);
  assert.equal(after?.game?.vowelBag.length, 0);
});

test("invalid timeout RandomSource output fails atomically", async () => {
  const harness = await createHarness({
    clockNow: 61_000,
    randomSequence: [2],
  });
  const before = await harness.persistence.findById(harness.room.roomId);
  assert.deepEqual(await harness.timeoutService.timeout(deadline(harness.room)), {
    status: "FAILED",
    reason: "INTERNAL_ERROR",
  });
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    before,
  );
});

test("duplicate and stale timeout callbacks never apply a second penalty", async () => {
  const harness = await createHarness({ clockNow: 61_000 });
  const identity = deadline(harness.room);
  assert.equal((await harness.timeoutService.timeout(identity)).status, "APPLIED");
  const afterFirst = await harness.persistence.findById(harness.room.roomId);
  assert.equal((await harness.timeoutService.timeout(identity)).status, "NO_OP");
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    afterFirst,
  );
});

test("deadline-before Draw/Pass wins the shared Room lane and makes timeout stale", async (context) => {
  await context.test("Draw vs timeout", async () => {
    const harness = await createHarness({ clockNow: 61_000 });
    const identity = deadline(harness.room);
    const [drawResult, timeoutResult] = await Promise.all([
      harness.drawService.draw(drawInput(harness)),
      harness.timeoutService.timeout(identity),
    ]);
    assert.equal(drawResult.ok, true);
    assert.equal(timeoutResult.status, "NO_OP");
    const after = await harness.persistence.findById(harness.room.roomId);
    assert.equal(after?.game?.gameRevision, 5);
    assert.equal(after?.game?.racks.get(PLAYER_A)?.length, 2);
  });

  await context.test("Pass vs timeout", async () => {
    const harness = await createHarness({
      consonantCount: 0,
      vowelCount: 0,
      clockNow: 61_000,
    });
    const identity = deadline(harness.room);
    const [passResult, timeoutResult] = await Promise.all([
      harness.passService.pass(passInput(harness)),
      harness.timeoutService.timeout(identity),
    ]);
    assert.equal(passResult.ok, true);
    assert.equal(timeoutResult.status, "NO_OP");
    const after = await harness.persistence.findById(harness.room.roomId);
    assert.equal(after?.game?.gameRevision, 5);
    assert.equal(after?.game?.racks.get(PLAYER_A)?.length, 1);
  });
});

test("timeout queued first wins expired Draw/Pass races with one commit", async (context) => {
  await context.test("Timeout vs Draw", async () => {
    const harness = await createHarness({ clockNow: 61_000 });
    const [timeoutResult, drawResult] = await Promise.all([
      harness.timeoutService.timeout(deadline(harness.room)),
      harness.drawService.draw(
        drawInput(harness, { receivedAt: serverTime(61_000) }),
      ),
    ]);
    assert.equal(timeoutResult.status, "APPLIED");
    requireError(drawResult, "NOT_YOUR_TURN");
    const after = await harness.persistence.findById(harness.room.roomId);
    assert.equal(after?.game?.gameRevision, 5);
    assert.equal(after?.game?.racks.get(PLAYER_A)?.length, 4);
  });

  await context.test("Timeout vs Pass", async () => {
    const harness = await createHarness({
      consonantCount: 0,
      vowelCount: 0,
      clockNow: 61_000,
    });
    const [timeoutResult, passResult] = await Promise.all([
      harness.timeoutService.timeout(deadline(harness.room)),
      harness.passService.pass(
        passInput(harness, { receivedAt: serverTime(61_000) }),
      ),
    ]);
    assert.equal(timeoutResult.status, "APPLIED");
    requireError(passResult, "NOT_YOUR_TURN");
    const after = await harness.persistence.findById(harness.room.roomId);
    assert.equal(after?.game?.gameRevision, 5);
    assert.equal(after?.game?.racks.get(PLAYER_A)?.length, 1);
  });
});

test("deadline-before Submit and timeout race commit exactly one canonical transition", async () => {
  const harness = await createHarness({ clockNow: 61_000 });
  const game = harness.room.game;
  assert.ok(game?.turn);
  const submitService = new TurnSubmitService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: harness.executor,
    clock: harness.clock,
    idGenerator: new FakeIdGenerator(),
    dictionaryProvider: new TestDictionaryProvider(),
    validateBoard: async () => ({
      ok: true,
      value: {
        composedWords: Object.freeze([]),
        newlyUsedRackTileIds: Object.freeze([]),
        recoveredJokerTileIds: Object.freeze([]),
        completesInitialMeld: false,
      },
    }),
  });
  const identity = deadline(harness.room);
  const [submitResult, timeoutResult] = await Promise.all([
    submitService.submit({
      roomId: harness.room.roomId,
      actorPlayerId: PLAYER_A,
      requestId: requestId("submit-race"),
      expectedGameRevision: game.gameRevision,
      turnId: game.turn.turnId,
      receivedAt: serverTime(game.turn.deadlineAt - 1),
      proposedBoard: parse(ProposedBoardSchema, { wordGroups: [] }),
      authorization: harness.authorization,
    }),
    harness.timeoutService.timeout(identity),
  ]);
  assert.equal(submitResult.ok, true);
  assert.equal(timeoutResult.status, "NO_OP");
  const after = await harness.persistence.findById(harness.room.roomId);
  assert.equal(after?.game?.gameRevision, 5);
  assert.equal(after?.game?.racks.get(PLAYER_A)?.length, 1);
});

test("timeout queued first in the shared Room lane wins an expired Submit with one penalty commit", async () => {
  const harness = await createHarness({
    clockNow: 61_000,
    randomSequence: [0, 1, 0],
  });
  const game = harness.room.game;
  assert.ok(game?.turn);
  const before = await harness.persistence.findById(harness.room.roomId);
  assert.ok(before?.game?.turn);
  const beforeBagTileCount =
    before.game.consonantBag.length + before.game.vowelBag.length;
  const beforeRackTileCount = before.game.racks.get(PLAYER_A)?.length;
  assert.ok(beforeRackTileCount !== undefined);

  const submitService = new TurnSubmitService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: harness.executor,
    clock: harness.clock,
    idGenerator: new FakeIdGenerator(),
    dictionaryProvider: new TestDictionaryProvider(),
    validateBoard: async () => ({
      ok: true,
      value: {
        composedWords: Object.freeze([]),
        newlyUsedRackTileIds: Object.freeze([]),
        recoveredJokerTileIds: Object.freeze([]),
        completesInitialMeld: false,
      },
    }),
  });

  let releaseLane: (() => void) | undefined;
  let markLaneEntered: (() => void) | undefined;
  const laneEntered = new Promise<void>((resolve) => {
    markLaneEntered = resolve;
  });
  const laneRelease = new Promise<void>((resolve) => {
    releaseLane = resolve;
  });
  const blocker = harness.executor.run(harness.room.roomId, async () => {
    markLaneEntered?.();
    await laneRelease;
  });
  await laneEntered;

  const identity = deadline(harness.room);
  const timeoutPromise = harness.timeoutService.timeout(identity);
  const submitPromise = submitService.submit({
    roomId: harness.room.roomId,
    actorPlayerId: PLAYER_A,
    requestId: requestId("expired-submit-behind-timeout"),
    expectedGameRevision: game.gameRevision,
    turnId: game.turn.turnId,
    receivedAt: game.turn.deadlineAt,
    proposedBoard: parse(ProposedBoardSchema, { wordGroups: [] }),
    authorization: harness.authorization,
  });

  releaseLane?.();
  await blocker;
  const [timeoutResult, submitResult] = await Promise.all([
    timeoutPromise,
    submitPromise,
  ]);

  assert.equal(timeoutResult.status, "APPLIED");
  assert.equal(submitResult.ok, false);
  if (submitResult.ok) {
    throw new Error("Expected the expired Submit queued behind timeout to fail.");
  }
  assert.ok(
    submitResult.error.code === "TURN_EXPIRED" ||
      submitResult.error.code === "NOT_YOUR_TURN" ||
      submitResult.error.code === "STALE_GAME_REVISION",
  );

  const after = await harness.persistence.findById(harness.room.roomId);
  assert.ok(after?.game?.turn);
  assert.equal(after.game.gameRevision, before.game.gameRevision + 1);
  assert.equal(after.storageRevision, before.storageRevision + 1);
  assert.equal(after.roomRevision, before.roomRevision);
  assert.equal(
    after.game.racks.get(PLAYER_A)?.length,
    beforeRackTileCount + 3,
  );
  assert.equal(
    after.game.consonantBag.length + after.game.vowelBag.length,
    beforeBagTileCount - 3,
  );
  assert.equal(after.game.turn.activePlayerId, PLAYER_B);
  assert.equal(harness.randomSource.calls.length, 3);
});

test("persistent post-commit scheduling failure is reported without rollback and sweeper recovers", async () => {
  const scheduler = new RecordingScheduler();
  scheduler.failuresRemaining = 100;
  const failures: unknown[] = [];
  const harness = await createHarness({ scheduler });
  const service = new TurnDrawService({
    roomRepository: harness.persistence,
    idempotencyRepository: harness.persistence,
    roomUnitOfWork: harness.persistence,
    roomMutationExecutor: harness.executor,
    clock: harness.clock,
    idGenerator: new FakeIdGenerator(),
    turnScheduler: scheduler,
    onTurnSchedulingFailure: (failure) => failures.push(failure),
  });
  const result = await service.draw(drawInput(harness));
  assert.equal(result.ok, true);
  assert.equal(scheduler.failuresRemaining, 98);
  assert.equal(failures.length, 1);
  const after = await harness.persistence.findById(harness.room.roomId);
  assert.equal(after?.game?.gameRevision, 5);
  assert.equal(after?.storageRevision, harness.room.storageRevision + 1);

  harness.clock.set(70_000);
  const sweeper = new OverdueTurnSweeper({
    activeTurnReader: harness.persistence,
    clock: harness.clock,
    enqueueTimeout: (identity) => harness.timeoutService.timeout(identity).then(() => undefined),
  });
  sweeper.start();
  assert.equal(await sweeper.sweepOnce(), 1);
  const recovered = await harness.persistence.findById(harness.room.roomId);
  assert.equal(recovered?.game?.gameRevision, 6);
  assert.equal(await sweeper.sweepOnce(), 0);
  sweeper.stop();
});

test("timeout applied listeners fire only for the newly committed timeout and cannot roll it back", async () => {
  const harness = await createHarness({ clockNow: 61_000 });
  const events: string[] = [];
  harness.timeoutService.subscribeApplied(async (data) => {
    events.push(data.timedOutTurnId);
    throw new Error("injected delivery failure");
  });
  const identity = deadline(harness.room);
  assert.equal((await harness.timeoutService.timeout(identity)).status, "APPLIED");
  assert.deepEqual(events, [identity.turnId]);
  assert.equal((await harness.timeoutService.timeout(identity)).status, "NO_OP");
  assert.deepEqual(events, [identity.turnId]);
});
