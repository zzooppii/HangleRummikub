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
  type ProposedBoard,
  type RequestId,
  type RoomId,
  type ServerTime,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  TurnSubmitService,
  createTurnSubmitFingerprint,
  type TurnSubmitInput,
  type TurnSubmitResult,
  type TurnSubmitServiceDependencies,
} from "./turn-submit-service.js";
import type { Board } from "../domain/game/board.js";
import {
  createDefaultRulesConfig,
  type PlayingGameState,
} from "../domain/game/game-state.js";
import type {
  BoardValidationError,
  BoardValidationResult,
} from "../domain/game/rule-engine.js";
import type {
  OrdinaryPhysicalTileType,
  OrdinaryTileInstance,
  OrdinaryTileSymbol,
  TileInstance,
  TileSourceBag,
} from "../domain/game/tile-inventory.js";
import {
  InMemoryPersistence,
  type InMemoryPersistenceOptions,
} from "../infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "../infrastructure/keyed-serial-executor.js";
import { FakeClock, FakeIdGenerator } from "../infrastructure/system.js";
import { TestDictionaryProvider } from "../infrastructure/test-dictionary-provider.js";
import type { RoomRecord, RoomWriteCandidate } from "../model/persistence.js";
import type { RoomUnitOfWork } from "../ports/room-unit-of-work.js";
import type { DictionaryProvider } from "../ports/system.js";

function roomId(value: string): RoomId {
  return parse(RoomIdSchema, value);
}

function playerId(value: string): PlayerId {
  return parse(PlayerIdSchema, value);
}

function tileId(value: string): TileId {
  return parse(TileIdSchema, value);
}

function requestId(value: string): RequestId {
  return parse(RequestIdSchema, value);
}

function serverTime(value: number): ServerTime {
  return parse(ServerTimeSchema, value);
}

function ordinaryTile(
  value: string,
  physicalType: OrdinaryPhysicalTileType,
  sourceBag: TileSourceBag,
  allowedSymbols: readonly OrdinaryTileSymbol[],
): OrdinaryTileInstance {
  return Object.freeze({
    tileId: tileId(value),
    kind: "ORDINARY",
    physicalType,
    sourceBag,
    allowedSymbols: Object.freeze([...allowedSymbols]),
  });
}

const PLAYER_A = playerId("player-a");
const PLAYER_B = playerId("player-b");
const PLAYER_C = playerId("player-c");
const PLAYER_D = playerId("player-d");

function initialMeldTiles(prefix = "initial"): readonly OrdinaryTileInstance[] {
  return Object.freeze([
    ordinaryTile(`${prefix}-ieung`, "IEUNG", "CONSONANT", ["ㅇ"]),
    ordinaryTile(`${prefix}-yeo`, "YA_ROTATION", "VOWEL", [
      "ㅑ",
      "ㅕ",
      "ㅛ",
      "ㅠ",
    ]),
    ordinaryTile(`${prefix}-nieun`, "GIYEOK_NIEUN_ROTATION", "CONSONANT", [
      "ㄱ",
      "ㄴ",
    ]),
    ordinaryTile(`${prefix}-pieup`, "PIEUP", "CONSONANT", ["ㅍ"]),
    ordinaryTile(`${prefix}-i`, "I_EU_ROTATION", "VOWEL", ["ㅣ", "ㅡ"]),
    ordinaryTile(`${prefix}-rieul`, "RIEUL", "CONSONANT", ["ㄹ"]),
  ]);
}

function initialMeldBoard(tiles: readonly OrdinaryTileInstance[]): ProposedBoard {
  const [ieung, yeo, nieun, pieup, i, rieul] = tiles;
  if (
    ieung === undefined ||
    yeo === undefined ||
    nieun === undefined ||
    pieup === undefined ||
    i === undefined ||
    rieul === undefined
  ) {
    throw new Error("Initial meld fixture requires six Tiles.");
  }
  return parse(ProposedBoardSchema, {
    wordGroups: [
      {
        groupId: "word-yeonpil",
        syllables: [
          {
            choseong: [{ tileId: ieung.tileId, assignedSymbol: "ㅇ" }],
            jungseong: [{ tileId: yeo.tileId, assignedSymbol: "ㅕ" }],
            jongseong: [{ tileId: nieun.tileId, assignedSymbol: "ㄴ" }],
          },
          {
            choseong: [{ tileId: pieup.tileId, assignedSymbol: "ㅍ" }],
            jungseong: [{ tileId: i.tileId, assignedSymbol: "ㅣ" }],
            jongseong: [{ tileId: rieul.tileId, assignedSymbol: "ㄹ" }],
          },
        ],
      },
    ],
  });
}

function emptyBoard(): Board {
  return Object.freeze({ wordGroups: Object.freeze([]) });
}

class MutableAuthorization {
  current = true;

  isCurrent(): boolean {
    return this.current;
  }
}

type Harness = Readonly<{
  persistence: InMemoryPersistence;
  service: TurnSubmitService;
  room: RoomRecord;
  clock: FakeClock;
  authorization: MutableAuthorization;
  proposedBoard: ProposedBoard;
  actorTiles: readonly OrdinaryTileInstance[];
}>;

type HarnessOptions = Readonly<{
  players?: readonly PlayerId[];
  actorRackExtraTiles?: readonly TileInstance[];
  actorRackOnlyUsedTiles?: boolean;
  initialMeldCompleted?: boolean;
  canonicalBoard?: Board;
  actorRackOverride?: readonly TileInstance[];
  knownTiles?: readonly TileInstance[];
  otherRacks?: ReadonlyMap<PlayerId, readonly TileInstance[]>;
  activePlayerId?: PlayerId;
  clock?: FakeClock;
  dictionaryProvider?: DictionaryProvider;
  persistenceOptions?: InMemoryPersistenceOptions;
  validateBoard?: TurnSubmitServiceDependencies["validateBoard"];
  onCheckpoint?: TurnSubmitServiceDependencies["onCheckpoint"];
  authorization?: MutableAuthorization;
  unitOfWorkFactory?: (
    persistence: InMemoryPersistence,
  ) => RoomUnitOfWork;
}>;

async function createHarness(options: HarnessOptions = {}): Promise<Harness> {
  const players = options.players ?? [PLAYER_A, PLAYER_B];
  const actorTiles = initialMeldTiles();
  const defaultExtra = ordinaryTile(
    "actor-extra",
    "MIEUM",
    "CONSONANT",
    ["ㅁ"],
  );
  const actorRackTiles =
    options.actorRackOverride ??
    (options.actorRackOnlyUsedTiles
      ? actorTiles
      : [...actorTiles, ...(options.actorRackExtraTiles ?? [defaultExtra])]);
  const allTiles = new Map<TileId, TileInstance>();
  for (const tile of actorRackTiles) {
    allTiles.set(tile.tileId, tile);
  }
  for (const tile of actorTiles) {
    allTiles.set(tile.tileId, tile);
  }
  for (const tile of options.knownTiles ?? []) {
    allTiles.set(tile.tileId, tile);
  }

  const racks = new Map<PlayerId, readonly TileId[]>();
  for (const id of players) {
    const otherRack = options.otherRacks?.get(id);
    const rackTiles = id === PLAYER_A ? actorRackTiles : (otherRack ?? []);
    racks.set(id, Object.freeze(rackTiles.map((tile) => tile.tileId)));
    for (const tile of rackTiles) {
      allTiles.set(tile.tileId, tile);
    }
  }

  const canonicalBoard = options.canonicalBoard ?? emptyBoard();
  const rulesConfig = createDefaultRulesConfig();
  const game: PlayingGameState = Object.freeze({
    gameId: parse(GameIdSchema, "game-submit"),
    gameRevision: parse(GameRevisionSchema, 4),
    rulesConfig,
    tilesById: allTiles,
    consonantBag: Object.freeze([]),
    vowelBag: Object.freeze([]),
    racks,
    board: canonicalBoard,
    initialMeldCompleted: new Map(
      players.map((id) => [
        id,
        id === PLAYER_A ? (options.initialMeldCompleted ?? false) : false,
      ]),
    ),
    turnOrder: Object.freeze([...players]),
    turn: Object.freeze({
      turnId: parse(TurnIdSchema, "turn-current"),
      turnNumber: 7,
      activePlayerId: options.activePlayerId ?? PLAYER_A,
      startedAt: serverTime(1_000),
      deadlineAt: serverTime(61_000),
    }),
    result: null,
    gameStartedAt: serverTime(1_000),
    gameDeadlineAt: serverTime(1_501_000),
  });
  const persistence = new InMemoryPersistence(options.persistenceOptions);
  const candidate: RoomWriteCandidate = {
    roomId: roomId("room-submit"),
    roomCode: parse(RoomCodeSchema, "ABCDEF"),
    phase: "PLAYING",
    hostPlayerId: players[0] ?? PLAYER_A,
    players: players.map((id, index) => ({
      playerId: id,
      nickname: parse(NicknameSchema, `Player${index}`),
      joinOrder: index,
    })),
    game,
    roomRevision: parse(RoomRevisionSchema, 3),
    createdAt: serverTime(500),
    updatedAt: serverTime(1_000),
  };
  const created = await persistence.createIfAbsent(candidate);
  assert.equal(created.status, "CREATED");
  if (created.status !== "CREATED") {
    throw new Error("Submit fixture Room creation failed.");
  }

  const clock = options.clock ?? new FakeClock(70_000);
  const authorization = options.authorization ?? new MutableAuthorization();
  const serviceDependencies: TurnSubmitServiceDependencies = {
    roomRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: options.unitOfWorkFactory?.(persistence) ?? persistence,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(),
    clock,
    idGenerator: new FakeIdGenerator(),
    dictionaryProvider:
      options.dictionaryProvider ?? new TestDictionaryProvider(),
    ...(options.validateBoard === undefined
      ? {}
      : { validateBoard: options.validateBoard }),
    ...(options.onCheckpoint === undefined
      ? {}
      : { onCheckpoint: options.onCheckpoint }),
  };
  const service = new TurnSubmitService(serviceDependencies);

  return {
    persistence,
    service,
    room: created.room,
    clock,
    authorization,
    proposedBoard: initialMeldBoard(actorTiles),
    actorTiles,
  };
}

function submitInput(
  harness: Harness,
  overrides: Partial<TurnSubmitInput> = {},
): TurnSubmitInput {
  const game = harness.room.game;
  if (game === null || game.turn === null) {
    throw new Error("Submit fixture requires an active Game.");
  }
  return {
    roomId: harness.room.roomId,
    actorPlayerId: PLAYER_A,
    requestId: requestId("submit-request"),
    expectedGameRevision: game.gameRevision,
    turnId: game.turn.turnId,
    receivedAt: serverTime(game.turn.deadlineAt - 1),
    proposedBoard: harness.proposedBoard,
    authorization: harness.authorization,
    ...overrides,
  };
}

function requireSuccess(result: TurnSubmitResult) {
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Expected Submit success.");
  }
  return result.data;
}

function requireError(result: TurnSubmitResult, code: string): void {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Expected Submit rejection.");
  }
  assert.equal(result.error.code, code);
}

test("valid initial meld Submit은 Board/rack/meld/revision/next Turn을 원자적으로 commit한다", async () => {
  const harness = await createHarness({
    players: [PLAYER_A, PLAYER_B, PLAYER_C],
  });
  const result = requireSuccess(
    await harness.service.submit(submitInput(harness)),
  );
  assert.equal(result.outcome, "ADVANCED");

  const persisted = await harness.persistence.findById(harness.room.roomId);
  assert.ok(persisted?.game);
  assert.equal(persisted.phase, "PLAYING");
  assert.equal(persisted.roomRevision, harness.room.roomRevision);
  assert.equal(persisted.storageRevision, harness.room.storageRevision + 1);
  assert.equal(persisted.game.gameRevision, 5);
  assert.deepEqual(persisted.game.board, harness.proposedBoard);
  assert.deepEqual(persisted.game.racks.get(PLAYER_A), [tileId("actor-extra")]);
  assert.equal(persisted.game.initialMeldCompleted.get(PLAYER_A), true);
  assert.ok(persisted.game.turn);
  assert.equal(persisted.game.turn.activePlayerId, PLAYER_B);
  assert.equal(persisted.game.turn.turnNumber, 8);
  assert.equal(persisted.game.turn.turnId, "test-turn-1");
  assert.equal(persisted.game.turn.startedAt, harness.clock.now());
  assert.equal(persisted.game.turn.deadlineAt, harness.clock.now() + 60_000);
  assert.equal(persisted.game.result, null);
});

test("2/3/4 Player Game은 turnOrder의 다음 Player를 순환한다", async (context) => {
  for (const fixture of [
    { players: [PLAYER_A, PLAYER_B], expectedNext: PLAYER_B },
    { players: [PLAYER_B, PLAYER_A, PLAYER_C], expectedNext: PLAYER_C },
    {
      players: [PLAYER_B, PLAYER_C, PLAYER_D, PLAYER_A],
      expectedNext: PLAYER_B,
    },
  ] as const) {
    await context.test(`${fixture.players.length} players`, async () => {
      const harness = await createHarness({ players: fixture.players });
      requireSuccess(await harness.service.submit(submitInput(harness)));
      const persisted = await harness.persistence.findById(harness.room.roomId);
      assert.equal(
        persisted?.game?.turn?.activePlayerId,
        fixture.expectedNext,
      );
      assert.equal(persisted?.game?.turn?.turnNumber, 8);
      assert.equal(persisted?.game?.turn?.turnId, "test-turn-1");
    });
  }
});

test("receivedAt deadline 경계는 queue/validation 완료 시각과 분리된다", async (context) => {
  for (const boundary of [
    { offset: -1, expected: "ADVANCED" },
    { offset: 0, expected: "TURN_EXPIRED" },
    { offset: 1, expected: "TURN_EXPIRED" },
  ] as const) {
    await context.test(`deadline ${boundary.offset}`, async () => {
      const clock = new FakeClock(100_000);
      const harness = await createHarness({ clock });
      const game = harness.room.game;
      assert.ok(game?.turn);
      const result = await harness.service.submit(
        submitInput(harness, {
          receivedAt: serverTime(game.turn.deadlineAt + boundary.offset),
        }),
      );
      if (boundary.expected === "ADVANCED") {
        const success = requireSuccess(result);
        assert.equal(success.outcome, "ADVANCED");
        const persisted = await harness.persistence.findById(harness.room.roomId);
        assert.equal(persisted?.game?.turn?.startedAt, 100_000);
      } else {
        requireError(result, boundary.expected);
        assert.deepEqual(
          await harness.persistence.findById(harness.room.roomId),
          harness.room,
        );
      }
    });
  }
});

test("turn/state/security precondition rejection은 canonical aggregate를 바꾸지 않는다", async (context) => {
  const cases = [
    {
      name: "non-active actor",
      overrides: { actorPlayerId: PLAYER_B },
      code: "NOT_YOUR_TURN",
    },
    {
      name: "wrong turnId",
      overrides: { turnId: parse(TurnIdSchema, "wrong-turn") },
      code: "NOT_YOUR_TURN",
    },
    {
      name: "stale gameRevision",
      overrides: { expectedGameRevision: parse(GameRevisionSchema, 3) },
      code: "STALE_GAME_REVISION",
    },
  ] as const;

  for (const entry of cases) {
    await context.test(entry.name, async () => {
      const harness = await createHarness();
      const before = await harness.persistence.findById(harness.room.roomId);
      const input = submitInput(harness, entry.overrides);
      requireError(await harness.service.submit(input), entry.code);
      assert.deepEqual(
        await harness.persistence.findById(harness.room.roomId),
        before,
      );
    });
  }

  await context.test("stale primary", async () => {
    const harness = await createHarness();
    harness.authorization.current = false;
    requireError(
      await harness.service.submit(submitInput(harness)),
      "UNAUTHENTICATED",
    );
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      harness.room,
    );
  });
});

test("missing/finished Room은 Submit을 안전하게 거절한다", async (context) => {
  await context.test("missing Room", async () => {
    const harness = await createHarness();
    requireError(
      await harness.service.submit(
        submitInput(harness, { roomId: roomId("room-missing") }),
      ),
      "ROOM_NOT_FOUND",
    );
  });

  await context.test("FINISHED Room", async () => {
    const harness = await createHarness({ actorRackOnlyUsedTiles: true });
    requireSuccess(await harness.service.submit(submitInput(harness)));
    const finished = await harness.persistence.findById(harness.room.roomId);
    assert.equal(finished?.phase, "FINISHED");
    requireError(
      await harness.service.submit(
        submitInput(harness, { requestId: requestId("after-finish") }),
      ),
      "INVALID_PHASE",
    );
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      finished,
    );
  });
});

test("actual RuleEngine rejection은 invalid Tile 정보와 initial-meld partial state를 남기지 않는다", async (context) => {
  await context.test("unknown Tile is privacy-safe", async () => {
    const harness = await createHarness();
    const unknownTileBoard = parse(ProposedBoardSchema, {
      wordGroups: harness.proposedBoard.wordGroups.map((group) => ({
        ...group,
        syllables: group.syllables.map((syllable, index) =>
          index === 0
            ? {
                ...syllable,
                choseong: [
                  {
                    tileId: tileId("unknown-tile"),
                    assignedSymbol: "ㅇ",
                  },
                ],
              }
            : syllable,
        ),
      })),
    });
    requireError(
      await harness.service.submit(
        submitInput(harness, { proposedBoard: unknownTileBoard }),
      ),
      "INVALID_TILE_ACCESS",
    );
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      harness.room,
    );
  });

  await context.test("five-Tile initial meld", async () => {
    const harness = await createHarness();
    const fiveTileBoard = parse(ProposedBoardSchema, {
      wordGroups: harness.proposedBoard.wordGroups.map((group) => ({
        ...group,
        syllables: group.syllables.map((syllable, index) =>
          index === 1 ? { ...syllable, jongseong: [] } : syllable,
        ),
      })),
    });
    requireError(
      await harness.service.submit(
        submitInput(harness, { proposedBoard: fiveTileBoard }),
      ),
      "RULE_VIOLATION",
    );
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      harness.room,
    );
  });
});

test("RuleEngine error는 privacy-safe application error로 mapping된다", async (context) => {
  const cases: readonly Readonly<{
    domainError: BoardValidationError;
    applicationCode: string;
  }>[] = [
    {
      domainError: {
        code: "INVALID_TILE_REFERENCE",
        board: "PROPOSED",
        groupId: "word",
      },
      applicationCode: "INVALID_TILE_ACCESS",
    },
    {
      domainError: { code: "TILE_NOT_OWNED", groupId: "word" },
      applicationCode: "INVALID_TILE_ACCESS",
    },
    {
      domainError: {
        code: "INVALID_BOARD",
        reason: "EMPTY_WORD_GROUP",
        board: "PROPOSED",
      },
      applicationCode: "INVALID_BOARD",
    },
    {
      domainError: {
        code: "INVALID_HANGUL_COMPOSITION",
        groupId: "word",
        compositionCode: "INVALID_JUNGSEONG",
      },
      applicationCode: "INVALID_HANGUL_COMPOSITION",
    },
    {
      domainError: { code: "WORD_NOT_ALLOWED", groupId: "word" },
      applicationCode: "WORD_NOT_ALLOWED",
    },
    {
      domainError: { code: "WORD_TOO_SHORT", groupId: "word" },
      applicationCode: "RULE_VIOLATION",
    },
    {
      domainError: {
        code: "DICTIONARY_UNAVAILABLE",
        reason: "TIMEOUT",
        groupId: "word",
      },
      applicationCode: "TEMPORARILY_UNAVAILABLE",
    },
    {
      domainError: {
        code: "DICTIONARY_UNAVAILABLE",
        reason: "ERROR",
        groupId: "word",
      },
      applicationCode: "TEMPORARILY_UNAVAILABLE",
    },
  ];

  for (const [index, entry] of cases.entries()) {
    await context.test(entry.domainError.code, async () => {
      const harness = await createHarness({
        validateBoard: async () => ({ ok: false, error: entry.domainError }),
      });
      const before = await harness.persistence.findById(harness.room.roomId);
      requireError(
        await harness.service.submit(
          submitInput(harness, { requestId: requestId(`error-${index}`) }),
        ),
        entry.applicationCode,
      );
      assert.deepEqual(
        await harness.persistence.findById(harness.room.roomId),
        before,
      );
    });
  }
});

test("Game snapshot과 다른 dictionaryVersion은 lookup 없이 안전하게 거절한다", async () => {
  let lookupCalls = 0;
  const mismatchedProvider: DictionaryProvider = {
    dictionaryVersion: "different-dictionary-version",
    async lookup() {
      lookupCalls += 1;
      return { status: "ALLOWED" };
    },
  };
  const harness = await createHarness({ dictionaryProvider: mismatchedProvider });
  const input = submitInput(harness);

  requireError(await harness.service.submit(input), "INTERNAL_ERROR");
  assert.equal(lookupCalls, 0);
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    harness.room,
  );
  assert.deepEqual(
    await harness.persistence.classify(
      `room-player:${input.roomId}:${input.actorPlayerId}`,
      input.requestId,
      createTurnSubmitFingerprint(
        input.expectedGameRevision,
        input.turnId,
        input.proposedBoard,
      ),
    ),
    { status: "MISS" },
  );
});

test("accepted Submit idempotency replay는 rack/revision/turn을 두 번 변경하지 않는다", async () => {
  const harness = await createHarness();
  const input = submitInput(harness);
  const first = await harness.service.submit(input);
  requireSuccess(first);
  const afterFirst = await harness.persistence.findById(harness.room.roomId);

  assert.deepEqual(await harness.service.submit(input), first);
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    afterFirst,
  );

  const changedBoard = parse(ProposedBoardSchema, {
    wordGroups: harness.proposedBoard.wordGroups.map((group) => ({
      ...group,
      groupId: "changed-group",
    })),
  });
  requireError(
    await harness.service.submit(
      submitInput(harness, { proposedBoard: changedBoard }),
    ),
    "REQUEST_ID_REUSED",
  );
});

test("accepted idempotency record는 non-secret 최소 result만 저장한다", async () => {
  const harness = await createHarness();
  const input = submitInput(harness);
  const data = requireSuccess(await harness.service.submit(input));
  const lookup = await harness.persistence.classify(
    `room-player:${input.roomId}:${input.actorPlayerId}`,
    input.requestId,
    createTurnSubmitFingerprint(
      input.expectedGameRevision,
      input.turnId,
      input.proposedBoard,
    ),
  );
  assert.equal(lookup.status, "REPLAY");
  if (lookup.status !== "REPLAY") {
    throw new Error("Expected accepted Submit idempotency record.");
  }
  assert.deepEqual(lookup.record.terminalResult, data);
  const serialized = JSON.stringify(lookup.record.terminalResult);
  for (const forbidden of [
    "rack",
    "tilesById",
    "sessionToken",
    "socketId",
    "storageRevision",
  ]) {
    assert.equal(serialized.includes(forbidden), false);
  }
});

test("같은 Room의 concurrent Submit은 최대 하나만 commit한다", async () => {
  const harness = await createHarness();
  const [first, second] = await Promise.all([
    harness.service.submit(
      submitInput(harness, { requestId: requestId("concurrent-a") }),
    ),
    harness.service.submit(
      submitInput(harness, { requestId: requestId("concurrent-b") }),
    ),
  ]);
  assert.equal([first, second].filter((result) => result.ok).length, 1);
  const failure = [first, second].find((result) => !result.ok);
  assert.ok(failure && !failure.ok);
  assert.equal(failure.error.code, "NOT_YOUR_TURN");
  const persisted = await harness.persistence.findById(harness.room.roomId);
  assert.equal(persisted?.game?.gameRevision, 5);
  assert.equal(persisted?.storageRevision, harness.room.storageRevision + 1);
});

test("async validation 중 primary가 교체되면 pre-commit recheck가 Submit을 막는다", async () => {
  const authorization = new MutableAuthorization();
  let validateCalls = 0;
  const harness = await createHarness({
    validateBoard: async (input): Promise<BoardValidationResult> => {
      validateCalls += 1;
      const result = await import("../domain/game/rule-engine.js").then(
        ({ validateProposedBoard }) => validateProposedBoard(input),
      );
      authorization.current = false;
      return result;
    },
  });
  // Use the authorization captured by this simulated socket lease.
  const input = submitInput(harness, { authorization });
  requireError(await harness.service.submit(input), "UNAUTHENTICATED");
  assert.equal(validateCalls, 1);
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    harness.room,
  );
});

test("UoW commit 순간 primary가 교체되면 atomic precondition이 Submit을 막는다", async () => {
  const authorization = new MutableAuthorization();
  const harness = await createHarness({
    authorization,
    onCheckpoint(checkpoint) {
      if (checkpoint === "BEFORE_COMMIT") {
        authorization.current = false;
      }
    },
  });
  const input = submitInput(harness);
  requireError(await harness.service.submit(input), "UNAUTHENTICATED");
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    harness.room,
  );
  assert.deepEqual(
    await harness.persistence.classify(
      `room-player:${input.roomId}:${input.actorPlayerId}`,
      input.requestId,
      createTurnSubmitFingerprint(
        input.expectedGameRevision,
        input.turnId,
        input.proposedBoard,
      ),
    ),
    { status: "MISS" },
  );
});

test("UoW CAS failure는 stale error이며 candidate/idempotency를 commit하지 않는다", async () => {
  const harness = await createHarness({
    unitOfWorkFactory: () => ({
      commit: async () => ({
        status: "PRECONDITION_FAILED",
        reason: "STALE_STORAGE_REVISION",
      }),
    }),
  });
  const input = submitInput(harness);
  requireError(await harness.service.submit(input), "STALE_GAME_REVISION");
  assert.deepEqual(
    await harness.persistence.findById(harness.room.roomId),
    harness.room,
  );
  assert.deepEqual(
    await harness.persistence.classify(
      `room-player:${input.roomId}:${input.actorPlayerId}`,
      input.requestId,
      createTurnSubmitFingerprint(
        input.expectedGameRevision,
        input.turnId,
        input.proposedBoard,
      ),
    ),
    { status: "MISS" },
  );
});

test("candidate/UoW failure injection은 Board, rack, versions, idempotency를 남기지 않는다", async (context) => {
  await context.test("candidate checkpoint", async () => {
    const harness = await createHarness({
      onCheckpoint(checkpoint) {
        if (checkpoint === "AFTER_CANDIDATE_CREATED") {
          throw new Error("injected candidate failure");
        }
      },
    });
    const input = submitInput(harness);
    requireError(await harness.service.submit(input), "INTERNAL_ERROR");
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      harness.room,
    );
  });

  await context.test("before commit checkpoint", async () => {
    const harness = await createHarness({
      onCheckpoint(checkpoint) {
        if (checkpoint === "BEFORE_COMMIT") {
          throw new Error("injected pre-commit failure");
        }
      },
    });
    const input = submitInput(harness);
    requireError(await harness.service.submit(input), "INTERNAL_ERROR");
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      harness.room,
    );
    assert.deepEqual(
      await harness.persistence.classify(
        `room-player:${input.roomId}:${input.actorPlayerId}`,
        input.requestId,
        createTurnSubmitFingerprint(
          input.expectedGameRevision,
          input.turnId,
          input.proposedBoard,
        ),
      ),
      { status: "MISS" },
    );
  });

  await context.test("idempotency persistence checkpoint", async () => {
    const harness = await createHarness({
      persistenceOptions: {
        onCommitCheckpoint(checkpoint) {
          if (checkpoint === "AFTER_IDEMPOTENCY_WRITE") {
            throw new Error("injected idempotency failure");
          }
        },
      },
    });
    const input = submitInput(harness);
    requireError(await harness.service.submit(input), "INTERNAL_ERROR");
    assert.deepEqual(
      await harness.persistence.findById(harness.room.roomId),
      harness.room,
    );
    assert.deepEqual(
      await harness.persistence.classify(
        `room-player:${input.roomId}:${input.actorPlayerId}`,
        input.requestId,
        createTurnSubmitFingerprint(
          input.expectedGameRevision,
          input.turnId,
          input.proposedBoard,
        ),
      ),
      { status: "MISS" },
    );
  });
});

test("normal rearrangement은 existing Board를 보존하며 rack Tile 하나를 commit한다", async () => {
  const [ieung, yeo, nieun, pieup, i, rieul] = initialMeldTiles("normal");
  if (
    ieung === undefined ||
    yeo === undefined ||
    nieun === undefined ||
    pieup === undefined ||
    i === undefined ||
    rieul === undefined
  ) {
    throw new Error("Normal fixture requires six Tiles.");
  }
  const canonicalBoard: Board = {
    wordGroups: [
      {
        groupId: "word-yeonpi",
        syllables: [
          {
            choseong: [{ tileId: ieung.tileId, assignedSymbol: "ㅇ" }],
            jungseong: [{ tileId: yeo.tileId, assignedSymbol: "ㅕ" }],
            jongseong: [{ tileId: nieun.tileId, assignedSymbol: "ㄴ" }],
          },
          {
            choseong: [{ tileId: pieup.tileId, assignedSymbol: "ㅍ" }],
            jungseong: [{ tileId: i.tileId, assignedSymbol: "ㅣ" }],
            jongseong: [],
          },
        ],
      },
    ],
  };
  const extra = ordinaryTile("normal-extra", "MIEUM", "CONSONANT", ["ㅁ"]);
  const harness = await createHarness({
    initialMeldCompleted: true,
    canonicalBoard,
    actorRackOverride: [rieul, extra],
    knownTiles: [ieung, yeo, nieun, pieup, i],
  });
  const proposedBoard = parse(ProposedBoardSchema, {
    wordGroups: [
      {
        groupId: "word-yeonpil",
        syllables: [
          canonicalBoard.wordGroups[0]?.syllables[0],
          {
            ...canonicalBoard.wordGroups[0]?.syllables[1],
            jongseong: [{ tileId: rieul.tileId, assignedSymbol: "ㄹ" }],
          },
        ],
      },
    ],
  });
  const success = requireSuccess(
    await harness.service.submit(submitInput(harness, { proposedBoard })),
  );
  assert.equal(success.outcome, "ADVANCED");
  const persisted = await harness.persistence.findById(harness.room.roomId);
  assert.deepEqual(persisted?.game?.board, proposedBoard);
  assert.deepEqual(persisted?.game?.racks.get(PLAYER_A), [extra.tileId]);
});

test("마지막 rack Tile Submit은 RACK_EMPTY result와 score를 같은 commit에 만든다", async () => {
  const bTiles = [0, 1, 2, 3].map((index) =>
    ordinaryTile(`b-${index}`, "MIEUM", "CONSONANT", ["ㅁ"]),
  );
  const cTiles: TileInstance[] = [
    ordinaryTile("c-0", "MIEUM", "CONSONANT", ["ㅁ"]),
    ordinaryTile("c-1", "MIEUM", "CONSONANT", ["ㅁ"]),
    Object.freeze({
      tileId: tileId("c-joker"),
      kind: "JOKER",
      physicalType: "JOKER",
      sourceBag: "VOWEL",
    }),
  ];
  const harness = await createHarness({
    players: [PLAYER_A, PLAYER_B, PLAYER_C],
    actorRackOnlyUsedTiles: true,
    otherRacks: new Map([
      [PLAYER_B, bTiles],
      [PLAYER_C, cTiles],
    ]),
  });
  const success = requireSuccess(
    await harness.service.submit(submitInput(harness)),
  );
  assert.deepEqual(success, {
    roomId: harness.room.roomId,
    gameId: harness.room.game?.gameId,
    roomRevision: harness.room.roomRevision + 1,
    gameRevision: 5,
    outcome: "FINISHED",
    finishReason: "RACK_EMPTY",
    winnerPlayerId: PLAYER_A,
  });

  const persisted = await harness.persistence.findById(harness.room.roomId);
  assert.ok(persisted?.game);
  assert.equal(persisted.phase, "FINISHED");
  assert.equal(persisted.roomRevision, harness.room.roomRevision + 1);
  assert.equal(persisted.storageRevision, harness.room.storageRevision + 1);
  assert.equal(persisted.game.gameRevision, 5);
  assert.deepEqual(persisted.game.racks.get(PLAYER_A), []);
  assert.equal(persisted.game.turn, null);
  assert.deepEqual(persisted.game.result, {
    reason: "RACK_EMPTY",
    winnerPlayerId: PLAYER_A,
    scores: [
      { playerId: PLAYER_A, score: 36, remainingRackTileCount: 0 },
      { playerId: PLAYER_B, score: -4, remainingRackTileCount: 4 },
      { playerId: PLAYER_C, score: -32, remainingRackTileCount: 3 },
    ],
    finishedAt: harness.clock.now(),
  });
});

test("2-player rack-empty score도 ordinary/Joker penalty를 계산한다", async () => {
  const loserTiles: TileInstance[] = [
    ordinaryTile("loser-ordinary", "MIEUM", "CONSONANT", ["ㅁ"]),
    Object.freeze({
      tileId: tileId("loser-joker"),
      kind: "JOKER",
      physicalType: "JOKER",
      sourceBag: "CONSONANT",
    }),
  ];
  const harness = await createHarness({
    actorRackOnlyUsedTiles: true,
    otherRacks: new Map([[PLAYER_B, loserTiles]]),
  });
  requireSuccess(await harness.service.submit(submitInput(harness)));
  const result = (await harness.persistence.findById(harness.room.roomId))?.game
    ?.result;
  assert.deepEqual(result?.scores, [
    { playerId: PLAYER_A, score: 31, remainingRackTileCount: 0 },
    { playerId: PLAYER_B, score: -31, remainingRackTileCount: 2 },
  ]);
});
