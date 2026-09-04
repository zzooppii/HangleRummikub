import assert from "node:assert/strict";
import test from "node:test";

import {
  NicknameSchema,
  PlayerIdSchema,
  RequestIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  type PlayerId,
  type RequestId,
  type RoomCode,
  type RoomId,
  type RoomRevision,
  type ServerTime,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { createInitialGameState } from "../domain/game/game-state.js";
import { createTimeLimitResult } from "../domain/game/result-engine.js";
import { LegacyHangulGameStateAdapter } from "../games/legacy-hangul-game-state-adapter.js";
import {
  createStorageRevision,
  createUnboundSessionRecord,
  incrementStorageRevision,
  type IdempotencyRecord,
  type JsonValue,
  type RoomRecord,
  type RoomWriteCandidate,
  type UnboundSessionRecord,
} from "../model/persistence.js";
import type { RoomUnitOfWorkChangeSet } from "../ports/room-unit-of-work.js";
import type { SessionVerificationData } from "../ports/system.js";
import { FakeClock, FakeIdGenerator } from "./system.js";
import { InMemoryPersistence } from "./in-memory-persistence.js";

function roomId(value: string): RoomId {
  return parse(RoomIdSchema, value);
}

function roomCode(value: string): RoomCode {
  return parse(RoomCodeSchema, value);
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

function serverTime(value: number): ServerTime {
  return parse(ServerTimeSchema, value);
}

function verificationData(character: string): SessionVerificationData {
  return {
    algorithm: "SHA-256",
    digestHex: character.repeat(64),
  };
}

type RoomFixtureOptions = Readonly<{
  roomId?: string;
  roomCode?: string;
  playerId?: string;
  nickname?: string;
  roomRevision?: number;
  updatedAt?: number;
}>;

type RoomCandidateWithHost = RoomWriteCandidate &
  Readonly<{ hostPlayerId: PlayerId }>;
type RoomRecordWithHost = RoomRecord & Readonly<{ hostPlayerId: PlayerId }>;

function roomHasHost(room: RoomRecord): room is RoomRecordWithHost {
  return room.hostPlayerId !== null;
}

function roomFixture(options: RoomFixtureOptions = {}): RoomCandidateWithHost {
  const hostPlayerId = playerId(options.playerId ?? "player-a");

  return {
    roomId: roomId(options.roomId ?? "room-a"),
    roomCode: roomCode(options.roomCode ?? "ABCDEF"),
    gameType: "HANGUL_TILE",
    phase: "LOBBY",
    hostPlayerId,
    players: [
      {
        playerId: hostPlayerId,
        nickname: parse(NicknameSchema, options.nickname ?? "혁상"),
        joinOrder: 0,
      },
    ],
    game: null,
    roomRevision: roomRevision(options.roomRevision ?? 0),
    createdAt: serverTime(1_000),
    updatedAt: serverTime(options.updatedAt ?? 1_000),
  };
}

async function requireCreatedRoom(
  persistence: InMemoryPersistence,
  candidate: RoomCandidateWithHost,
): Promise<RoomRecordWithHost> {
  const result = await persistence.createIfAbsent(candidate);
  assert.equal(result.status, "CREATED");
  if (result.status !== "CREATED") {
    throw new Error("Test fixture Room was not created.");
  }
  if (!roomHasHost(result.room)) {
    throw new Error("Test fixture Room must retain its Host.");
  }
  return result.room;
}

async function saveUnboundFixture(
  persistence: InMemoryPersistence,
  verification: SessionVerificationData,
  clock: FakeClock,
): Promise<UnboundSessionRecord> {
  const session = createUnboundSessionRecord(verification, clock.now());
  const result = await persistence.saveUnbound(session);
  assert.equal(result.status, "SAVED");
  if (result.status !== "SAVED") {
    throw new Error("Test fixture Session was not saved.");
  }
  return result.session;
}

function idempotencyRecord(
  scopeKey: string,
  id: string,
  fingerprint: string,
  terminalResult: JsonValue = { accepted: true },
  createdAt = 1_000,
): IdempotencyRecord {
  return {
    scopeKey,
    requestId: requestId(id),
    payloadFingerprint: fingerprint,
    terminalResult,
    createdAt: serverTime(createdAt),
  };
}

function createRoomChangeSet(
  candidate: RoomCandidateWithHost,
  session: UnboundSessionRecord,
  idempotency: IdempotencyRecord,
  now: ServerTime,
): RoomUnitOfWorkChangeSet {
  return {
    roomMutation: { kind: "CREATE", candidate },
    sessionMutation: {
      kind: "PROMOTE_UNBOUND",
      verificationData: session.verificationData,
      roomId: candidate.roomId,
      playerId: candidate.hostPlayerId,
      now,
    },
    idempotency,
  };
}

test("RoomRepository는 create-if-absent, 두 index lookup, collision, delete를 지원한다", async () => {
  const persistence = new InMemoryPersistence();
  const candidate = roomFixture();
  const created = await requireCreatedRoom(persistence, candidate);

  assert.equal(created.storageRevision, 0);
  assert.equal(created.gameType, "HANGUL_TILE");
  const foundById = await persistence.findById(candidate.roomId);
  const foundByCode = await persistence.findByCode(candidate.roomCode);
  assert.equal(foundById?.gameType, "HANGUL_TILE");
  assert.equal(foundByCode?.gameType, "HANGUL_TILE");
  assert.deepEqual(foundById, created);
  assert.deepEqual(foundByCode, created);

  assert.deepEqual(await persistence.createIfAbsent(candidate), {
    status: "ROOM_ID_CONFLICT",
  });
  assert.deepEqual(
    await persistence.createIfAbsent(
      roomFixture({ roomId: "room-b", roomCode: "ABCDEF" }),
    ),
    { status: "ROOM_CODE_CONFLICT" },
  );

  assert.deepEqual(
    await persistence.delete({
      roomId: created.roomId,
      expectedRoomRevision: created.roomRevision,
      expectedStorageRevision: created.storageRevision,
    }),
    { status: "DELETED" },
  );
  assert.equal(await persistence.findById(candidate.roomId), null);
  assert.equal(await persistence.findByCode(candidate.roomCode), null);
});

test("RoomRepository는 입력과 반환값의 외부 mutation에서 내부 state를 격리한다", async () => {
  const persistence = new InMemoryPersistence();
  const host = {
    playerId: playerId("player-a"),
    nickname: parse(NicknameSchema, "Harvey"),
    joinOrder: 0,
  };
  const players = [host];
  const candidate: RoomCandidateWithHost = {
    ...roomFixture(),
    hostPlayerId: host.playerId,
    players,
  };
  const created = await requireCreatedRoom(persistence, candidate);

  Reflect.set(candidate, "gameType", "UNSUPPORTED_GAME");
  Reflect.set(host, "nickname", parse(NicknameSchema, "Changed"));
  players.push({
    playerId: playerId("player-b"),
    nickname: parse(NicknameSchema, "Second"),
    joinOrder: 1,
  });
  assert.equal(Reflect.set(created, "phase", "FINISHED"), false);
  assert.equal(
    Reflect.set(created.players[0] ?? {}, "nickname", "Tampered"),
    false,
  );

  const stored = await persistence.findById(candidate.roomId);
  assert.notEqual(stored, null);
  assert.equal(stored?.gameType, "HANGUL_TILE");
  assert.equal(Reflect.set(created, "gameType", "UNSUPPORTED_GAME"), false);
  assert.equal(stored?.phase, "LOBBY");
  assert.equal(stored?.players.length, 1);
  assert.equal(stored?.players[0]?.nickname, "Harvey");
  assert.equal(Object.isFrozen(stored), true);
  assert.equal(Object.isFrozen(stored?.players), true);
  assert.equal(Object.isFrozen(stored?.players[0]), true);
});

test("RoomRepository는 지원하지 않는 gameType을 create 경계에서 거절한다", async () => {
  const legacyAdapter = new LegacyHangulGameStateAdapter();
  let adapterInvocationCount = 0;
  const persistence = new InMemoryPersistence({
    legacyHangulGameStateAdapter: {
      gameType: legacyAdapter.gameType,
      cloneAndValidate(state) {
        adapterInvocationCount += 1;
        return legacyAdapter.cloneAndValidate(state);
      },
      inspectLifecycle(state) {
        adapterInvocationCount += 1;
        return legacyAdapter.inspectLifecycle(state);
      },
    },
  });
  const malformedLobbyCandidate = {
    ...roomFixture(),
    gameType: "UNSUPPORTED_GAME",
  } as unknown as RoomWriteCandidate;
  const guestPlayerId = playerId("player-unsupported-game-guest");
  const playingPlayers = [
    ...malformedLobbyCandidate.players,
    {
      playerId: guestPlayerId,
      nickname: parse(NicknameSchema, "Guest"),
      joinOrder: 1,
    },
  ];
  const malformedPlayingCandidate = {
    ...malformedLobbyCandidate,
    roomId: roomId("room-unsupported-game-playing"),
    roomCode: roomCode("BCDEFG"),
    phase: "PLAYING",
    players: playingPlayers,
    game: createInitialGameState({
      playerIds: playingPlayers.map((player) => player.playerId),
      startedAt: serverTime(10_000),
      idGenerator: new FakeIdGenerator(),
      randomSource: { nextInt: () => 0 },
    }),
  } as unknown as RoomWriteCandidate;

  for (const malformedCandidate of [
    malformedLobbyCandidate,
    malformedPlayingCandidate,
  ]) {
    await assert.rejects(persistence.createIfAbsent(malformedCandidate));
    assert.equal(await persistence.findById(malformedCandidate.roomId), null);
    assert.equal(await persistence.findByCode(malformedCandidate.roomCode), null);
  }
  assert.equal(adapterInvocationCount, 0);
});

test("Legacy Hangul v1 Room phase는 concrete GameState lifecycle과 정확히 일치해야 한다", async () => {
  const persistence = new InMemoryPersistence();
  const lobby = roomFixture();
  const guestPlayerId = playerId("player-phase-guest");
  const players = [
    ...lobby.players,
    {
      playerId: guestPlayerId,
      nickname: parse(NicknameSchema, "Guest"),
      joinOrder: 1,
    },
  ];
  const game = createInitialGameState({
    playerIds: players.map((player) => player.playerId),
    startedAt: serverTime(10_000),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const terminalGame = {
    ...game,
    turn: null,
    result: createTimeLimitResult({
      playerIds: game.turnOrder,
      racks: game.racks,
      tilesById: game.tilesById,
      forfeitedPlayerIds: game.forfeitedPlayerIds,
      finishedAt: game.gameDeadlineAt,
    }),
  } as const;
  const cases: readonly Readonly<{
    candidate: RoomWriteCandidate;
    expectedMessage: RegExp;
  }>[] = [
    {
      candidate: { ...lobby, players, game },
      expectedMessage: /LOBBY Room must not contain a GameState/u,
    },
    {
      candidate: {
        ...lobby,
        roomId: roomId("room-playing-without-game"),
        roomCode: roomCode("BCDEFG"),
        phase: "PLAYING",
        players,
        game: null,
      },
      expectedMessage: /PLAYING Room must contain an active GameState/u,
    },
    {
      candidate: {
        ...lobby,
        roomId: roomId("room-finished-with-active-game"),
        roomCode: roomCode("CDEFGH"),
        phase: "FINISHED",
        players,
        game,
      },
      expectedMessage: /FINISHED Room must contain a terminal GameState/u,
    },
    {
      candidate: {
        ...lobby,
        roomId: roomId("room-playing-with-finished-game"),
        roomCode: roomCode("DEFGHJ"),
        phase: "PLAYING",
        players,
        game: terminalGame,
      },
      expectedMessage: /PLAYING Room must contain an active GameState/u,
    },
    {
      candidate: {
        ...lobby,
        roomId: roomId("room-finished-without-game"),
        roomCode: roomCode("EFGHJK"),
        phase: "FINISHED",
        players,
        game: null,
      },
      expectedMessage: /FINISHED Room must contain a terminal GameState/u,
    },
  ];

  for (const { candidate, expectedMessage } of cases) {
    await assert.rejects(
      persistence.createIfAbsent(candidate),
      expectedMessage,
    );
    assert.equal(await persistence.findById(candidate.roomId), null);
    assert.equal(await persistence.findByCode(candidate.roomCode), null);
  }
});

test("RoomRepository는 roomRevision과 storageRevision CAS를 분리한다", async () => {
  const persistence = new InMemoryPersistence();
  const created = await requireCreatedRoom(persistence, roomFixture());
  const replacement = roomFixture({ roomRevision: 1, updatedAt: 2_000 });

  const replaced = await persistence.replace({
    candidate: replacement,
    expectedRoomRevision: created.roomRevision,
    expectedStorageRevision: created.storageRevision,
  });
  assert.equal(replaced.status, "REPLACED");
  if (replaced.status !== "REPLACED") {
    throw new Error("Expected Room replacement to succeed.");
  }
  assert.equal(replaced.room.gameType, "HANGUL_TILE");
  assert.equal(replaced.room.roomRevision, 1);
  assert.equal(replaced.room.storageRevision, 1);

  const staleRoom = await persistence.replace({
    candidate: roomFixture({ roomRevision: 2, updatedAt: 3_000 }),
    expectedRoomRevision: roomRevision(0),
    expectedStorageRevision: replaced.room.storageRevision,
  });
  assert.deepEqual(staleRoom, { status: "STALE_ROOM_REVISION" });

  const staleStorage = await persistence.replace({
    candidate: roomFixture({ roomRevision: 2, updatedAt: 3_000 }),
    expectedRoomRevision: replaced.room.roomRevision,
    expectedStorageRevision: createStorageRevision(0),
  });
  assert.deepEqual(staleStorage, { status: "STALE_STORAGE_REVISION" });

  const stored = await persistence.findById(created.roomId);
  assert.equal(stored?.gameType, "HANGUL_TILE");
  assert.equal(stored?.roomRevision, 1);
  assert.equal(stored?.storageRevision, 1);
  assert.equal(stored?.updatedAt, 2_000);
});

test("RoomRepository와 UnitOfWork는 기존 Room의 gameType 변경을 원자적으로 거절한다", async () => {
  const persistence = new InMemoryPersistence();
  const created = await requireCreatedRoom(persistence, roomFixture());
  const mismatchedCandidate = {
    ...created,
    gameType: "UNSUPPORTED_GAME",
    roomRevision: roomRevision(1),
    updatedAt: serverTime(2_000),
  } as unknown as RoomWriteCandidate;

  assert.deepEqual(
    await persistence.replace({
      candidate: mismatchedCandidate,
      expectedRoomRevision: created.roomRevision,
      expectedStorageRevision: created.storageRevision,
    }),
    { status: "GAME_TYPE_MISMATCH" },
  );
  assert.deepEqual(await persistence.findById(created.roomId), created);

  const record = idempotencyRecord(
    "room:game-type-mismatch",
    "request-game-type-mismatch",
    "fingerprint-game-type-mismatch",
  );
  assert.deepEqual(
    await persistence.commit({
      roomMutation: {
        kind: "REPLACE",
        candidate: mismatchedCandidate,
        expectedRoomRevision: created.roomRevision,
        expectedStorageRevision: created.storageRevision,
      },
      sessionMutation: { kind: "NONE" },
      idempotency: record,
    }),
    { status: "PRECONDITION_FAILED", reason: "GAME_TYPE_MISMATCH" },
  );
  assert.deepEqual(await persistence.findById(created.roomId), created);
  assert.deepEqual(
    await persistence.classify(
      record.scopeKey,
      record.requestId,
      record.payloadFingerprint,
    ),
    { status: "MISS" },
  );
});

test("같은 Room의 competing CAS write는 하나만 commit한다", async () => {
  const persistence = new InMemoryPersistence();
  const created = await requireCreatedRoom(persistence, roomFixture());

  const results = await Promise.all([
    persistence.replace({
      candidate: roomFixture({ roomRevision: 1, updatedAt: 2_000 }),
      expectedRoomRevision: created.roomRevision,
      expectedStorageRevision: created.storageRevision,
    }),
    persistence.replace({
      candidate: roomFixture({ roomRevision: 1, updatedAt: 3_000 }),
      expectedRoomRevision: created.roomRevision,
      expectedStorageRevision: created.storageRevision,
    }),
  ]);

  assert.equal(
    results.filter((result) => result.status === "REPLACED").length,
    1,
  );
  assert.equal(
    results.filter((result) => result.status === "STALE_ROOM_REVISION").length,
    1,
  );
  assert.equal(
    (await persistence.findById(created.roomId))?.storageRevision,
    1,
  );
});

test("RoomRepository의 code 변경과 collision은 index를 원자적으로 유지한다", async () => {
  const persistence = new InMemoryPersistence();
  const first = await requireCreatedRoom(persistence, roomFixture());
  await requireCreatedRoom(
    persistence,
    roomFixture({
      roomId: "room-b",
      roomCode: "BCDEFG",
      playerId: "player-b",
    }),
  );

  const collision = await persistence.replace({
    candidate: roomFixture({ roomCode: "BCDEFG", roomRevision: 1 }),
    expectedRoomRevision: first.roomRevision,
    expectedStorageRevision: first.storageRevision,
  });
  assert.deepEqual(collision, { status: "ROOM_CODE_CONFLICT" });
  assert.equal((await persistence.findByCode(roomCode("ABCDEF")))?.roomId, "room-a");
  assert.equal((await persistence.findByCode(roomCode("BCDEFG")))?.roomId, "room-b");

  const changed = await persistence.replace({
    candidate: roomFixture({ roomCode: "CDEFGH", roomRevision: 1 }),
    expectedRoomRevision: first.roomRevision,
    expectedStorageRevision: first.storageRevision,
  });
  assert.equal(changed.status, "REPLACED");
  assert.equal(await persistence.findByCode(roomCode("ABCDEF")), null);
  assert.equal((await persistence.findByCode(roomCode("CDEFGH")))?.roomId, "room-a");
});

test("StorageRevision은 non-negative safe integer이고 overflow되지 않는다", () => {
  assert.equal(createStorageRevision(0), 0);
  assert.equal(incrementStorageRevision(createStorageRevision(4)), 5);
  assert.throws(() => createStorageRevision(-1));
  assert.throws(() => createStorageRevision(1.5));
  assert.throws(
    () => incrementStorageRevision(createStorageRevision(Number.MAX_SAFE_INTEGER)),
  );
});

test("SessionRepository는 UNBOUND hash record를 저장하고 raw token을 보관하지 않는다", async () => {
  const persistence = new InMemoryPersistence();
  const clock = new FakeClock(10_000);
  const session = await saveUnboundFixture(
    persistence,
    verificationData("a"),
    clock,
  );

  assert.equal("rawToken" in session, false);
  assert.equal("sessionToken" in session, false);
  assert.equal(session.state, "UNBOUND");
  assert.equal(session.issuedAt, 10_000);
  assert.equal(session.expiresAt, 310_000);
  assert.deepEqual(
    await persistence.findByVerificationData(session.verificationData),
    session,
  );
  assert.deepEqual(await persistence.saveUnbound(session), {
    status: "SESSION_ALREADY_EXISTS",
  });
});

test("SessionRepository는 유효한 UNBOUND session을 정확히 한 번 promotion한다", async () => {
  const persistence = new InMemoryPersistence();
  const room = await requireCreatedRoom(persistence, roomFixture());
  const clock = new FakeClock(1_000);
  const session = await saveUnboundFixture(
    persistence,
    verificationData("b"),
    clock,
  );
  clock.advance(299_999);

  const promoted = await persistence.promoteUnbound({
    verificationData: session.verificationData,
    roomId: room.roomId,
    playerId: room.hostPlayerId,
    now: clock.now(),
  });
  assert.equal(promoted.status, "PROMOTED");
  if (promoted.status !== "PROMOTED") {
    throw new Error("Expected Session promotion to succeed.");
  }
  assert.equal(promoted.session.state, "BOUND");
  assert.equal("rawToken" in promoted.session, false);

  assert.deepEqual(
    await persistence.promoteUnbound({
      verificationData: session.verificationData,
      roomId: room.roomId,
      playerId: room.hostPlayerId,
      now: clock.now(),
    }),
    { status: "SESSION_ALREADY_BOUND" },
  );
  assert.equal(await persistence.deleteByRoomId(room.roomId), 1);
  assert.equal(
    await persistence.findByVerificationData(session.verificationData),
    null,
  );
});

test("SessionRepository는 Clock 기준 만료 시각부터 promotion을 거절하고 state를 보존한다", async () => {
  const persistence = new InMemoryPersistence();
  const room = await requireCreatedRoom(persistence, roomFixture());
  const clock = new FakeClock(5_000);
  const session = await saveUnboundFixture(
    persistence,
    verificationData("c"),
    clock,
  );
  clock.advance(300_000);

  assert.deepEqual(
    await persistence.promoteUnbound({
      verificationData: session.verificationData,
      roomId: room.roomId,
      playerId: room.hostPlayerId,
      now: clock.now(),
    }),
    { status: "SESSION_EXPIRED" },
  );
  assert.equal(
    (await persistence.findByVerificationData(session.verificationData))?.state,
    "UNBOUND",
  );
});

test("RoomUnitOfWork는 Room, session promotion, idempotency를 함께 commit하고 replay한다", async () => {
  const persistence = new InMemoryPersistence();
  const clock = new FakeClock(1_000);
  const session = await saveUnboundFixture(
    persistence,
    verificationData("d"),
    clock,
  );
  const mutableTerminalResult = {
    roomCode: "ABCDEF",
    nested: { accepted: true },
  };
  const record = idempotencyRecord(
    "bootstrap:hash-d",
    "request-create-a",
    "fingerprint-a",
    mutableTerminalResult,
  );
  const changeSet = createRoomChangeSet(
    roomFixture(),
    session,
    record,
    clock.now(),
  );

  const committed = await persistence.commit(changeSet);
  assert.equal(committed.status, "COMMITTED");
  assert.equal((await persistence.findById(roomId("room-a")))?.storageRevision, 0);
  assert.equal(
    (await persistence.findByVerificationData(session.verificationData))?.state,
    "BOUND",
  );

  mutableTerminalResult.nested.accepted = false;
  const replay = await persistence.commit(changeSet);
  assert.equal(replay.status, "REPLAY");
  if (replay.status !== "REPLAY") {
    throw new Error("Expected idempotent replay.");
  }
  assert.deepEqual(replay.idempotency.terminalResult, {
    roomCode: "ABCDEF",
    nested: { accepted: true },
  });

  const conflictingChangeSet: RoomUnitOfWorkChangeSet = {
    ...changeSet,
    idempotency: {
      ...record,
      payloadFingerprint: "fingerprint-b",
    },
  };
  assert.equal(
    (await persistence.commit(conflictingChangeSet)).status,
    "IDEMPOTENCY_CONFLICT",
  );
});

for (const checkpoint of [
  "AFTER_ROOM_WRITE",
  "AFTER_SESSION_WRITE",
  "AFTER_IDEMPOTENCY_WRITE",
] as const) {
  test(`RoomUnitOfWork ${checkpoint} 예외는 partial state를 노출하지 않는다`, async () => {
    const persistence = new InMemoryPersistence({
      onCommitCheckpoint(currentCheckpoint): void {
        if (currentCheckpoint === checkpoint) {
          throw new Error(`injected failure: ${checkpoint}`);
        }
      },
    });
    const clock = new FakeClock(1_000);
    const session = await saveUnboundFixture(
      persistence,
      verificationData(checkpoint === "AFTER_ROOM_WRITE" ? "e" : checkpoint === "AFTER_SESSION_WRITE" ? "f" : "1"),
      clock,
    );
    const record = idempotencyRecord(
      `bootstrap:${checkpoint}`,
      `request-${checkpoint}`,
      `fingerprint-${checkpoint}`,
    );
    const changeSet = createRoomChangeSet(
      roomFixture(),
      session,
      record,
      clock.now(),
    );

    await assert.rejects(
      persistence.commit(changeSet),
      new RegExp(`injected failure: ${checkpoint}`, "u"),
    );
    assert.equal(await persistence.findById(roomId("room-a")), null);
    assert.equal(await persistence.findByCode(roomCode("ABCDEF")), null);
    assert.equal(
      (await persistence.findByVerificationData(session.verificationData))?.state,
      "UNBOUND",
    );
    assert.deepEqual(
      await persistence.classify(
        record.scopeKey,
        record.requestId,
        record.payloadFingerprint,
      ),
      { status: "MISS" },
    );
  });
}

test("join-like REPLACE failure는 Room과 UNBOUND session을 모두 보존한다", async () => {
  const persistence = new InMemoryPersistence({
    onCommitCheckpoint(checkpoint): void {
      if (checkpoint === "AFTER_SESSION_WRITE") {
        throw new Error("injected join failure");
      }
    },
  });
  const room = await requireCreatedRoom(persistence, roomFixture());
  const clock = new FakeClock(1_000);
  const session = await saveUnboundFixture(
    persistence,
    verificationData("4"),
    clock,
  );
  const joiningPlayerId = playerId("player-b");
  const candidate: RoomWriteCandidate = {
    ...roomFixture({ roomRevision: 1, updatedAt: 2_000 }),
    players: [
      ...room.players,
      {
        playerId: joiningPlayerId,
        nickname: parse(NicknameSchema, "Second"),
        joinOrder: 1,
      },
    ],
  };
  const record = idempotencyRecord(
    "bootstrap:join",
    "request-join",
    "fingerprint-join",
  );

  await assert.rejects(
    persistence.commit({
      roomMutation: {
        kind: "REPLACE",
        candidate,
        expectedRoomRevision: room.roomRevision,
        expectedStorageRevision: room.storageRevision,
      },
      sessionMutation: {
        kind: "PROMOTE_UNBOUND",
        verificationData: session.verificationData,
        roomId: room.roomId,
        playerId: joiningPlayerId,
        now: clock.now(),
      },
      idempotency: record,
    }),
    /injected join failure/u,
  );

  const unchanged = await persistence.findById(room.roomId);
  assert.equal(unchanged?.gameType, "HANGUL_TILE");
  assert.equal(unchanged?.players.length, 1);
  assert.equal(unchanged?.roomRevision, 0);
  assert.equal(unchanged?.storageRevision, 0);
  assert.equal(
    (await persistence.findByVerificationData(session.verificationData))?.state,
    "UNBOUND",
  );
  assert.equal(
    (
      await persistence.classify(
        record.scopeKey,
        record.requestId,
        record.payloadFingerprint,
      )
    ).status,
    "MISS",
  );
});

test("cleanup failure는 Room, bound session, 기존 idempotency scope를 모두 보존한다", async () => {
  let failureArmed = false;
  const persistence = new InMemoryPersistence({
    onCommitCheckpoint(checkpoint): void {
      if (failureArmed && checkpoint === "AFTER_IDEMPOTENCY_WRITE") {
        throw new Error("injected cleanup failure");
      }
    },
  });
  const initialRecord = idempotencyRecord(
    "room:cleanup-failure",
    "request-before-cleanup",
    "fingerprint-before-cleanup",
  );
  const initialResult = await persistence.commit({
    roomMutation: { kind: "CREATE", candidate: roomFixture() },
    sessionMutation: { kind: "NONE" },
    idempotency: initialRecord,
  });
  assert.equal(initialResult.status, "COMMITTED");
  if (initialResult.status !== "COMMITTED" || initialResult.room === null) {
    throw new Error("Expected cleanup failure fixture to commit.");
  }
  const room = initialResult.room;
  if (room.hostPlayerId === null) {
    throw new Error("Cleanup fixture requires a Host.");
  }
  const clock = new FakeClock(1_000);
  const session = await saveUnboundFixture(
    persistence,
    verificationData("5"),
    clock,
  );
  assert.equal(
    (
      await persistence.promoteUnbound({
        verificationData: session.verificationData,
        roomId: room.roomId,
        playerId: room.hostPlayerId,
        now: clock.now(),
      })
    ).status,
    "PROMOTED",
  );
  const cleanupRecord = idempotencyRecord(
    "room:cleanup-failure",
    "request-cleanup-failure",
    "fingerprint-cleanup-failure",
  );
  failureArmed = true;

  await assert.rejects(
    persistence.commit({
      roomMutation: {
        kind: "DELETE",
        roomId: room.roomId,
        expectedRoomRevision: room.roomRevision,
        expectedStorageRevision: room.storageRevision,
      },
      sessionMutation: { kind: "DELETE_BY_ROOM", roomId: room.roomId },
      idempotencyScopesToDelete: [initialRecord.scopeKey],
      idempotency: cleanupRecord,
    }),
    /injected cleanup failure/u,
  );

  assert.notEqual(await persistence.findById(room.roomId), null);
  assert.equal(
    (await persistence.findByVerificationData(session.verificationData))?.state,
    "BOUND",
  );
  assert.equal(
    (
      await persistence.classify(
        initialRecord.scopeKey,
        initialRecord.requestId,
        initialRecord.payloadFingerprint,
      )
    ).status,
    "REPLAY",
  );
  assert.equal(
    (
      await persistence.classify(
        cleanupRecord.scopeKey,
        cleanupRecord.requestId,
        cleanupRecord.payloadFingerprint,
      )
    ).status,
    "MISS",
  );
});

test("RoomUnitOfWork collision은 code, session, idempotency ghost state를 만들지 않는다", async () => {
  const persistence = new InMemoryPersistence();
  await requireCreatedRoom(persistence, roomFixture());
  const clock = new FakeClock(1_000);
  const session = await saveUnboundFixture(
    persistence,
    verificationData("2"),
    clock,
  );
  const conflictingRoom = roomFixture({
    roomId: "room-b",
    roomCode: "ABCDEF",
    playerId: "player-b",
  });
  const record = idempotencyRecord(
    "bootstrap:collision",
    "request-collision",
    "fingerprint-collision",
  );

  assert.deepEqual(
    await persistence.commit(
      createRoomChangeSet(conflictingRoom, session, record, clock.now()),
    ),
    { status: "PRECONDITION_FAILED", reason: "ROOM_CODE_CONFLICT" },
  );
  assert.equal(await persistence.findById(conflictingRoom.roomId), null);
  assert.equal(
    (await persistence.findByVerificationData(session.verificationData))?.state,
    "UNBOUND",
  );
  assert.deepEqual(
    await persistence.classify(
      record.scopeKey,
      record.requestId,
      record.payloadFingerprint,
    ),
    { status: "MISS" },
  );
});

test("RoomUnitOfWork cleanup은 Room code와 bound Room session을 함께 제거한다", async () => {
  const persistence = new InMemoryPersistence();
  const initialRecord = idempotencyRecord(
    "room:room-a",
    "request-initial",
    "fingerprint-initial",
  );
  const initialResult = await persistence.commit({
    roomMutation: { kind: "CREATE", candidate: roomFixture() },
    sessionMutation: { kind: "NONE" },
    idempotency: initialRecord,
  });
  assert.equal(initialResult.status, "COMMITTED");
  if (initialResult.status !== "COMMITTED" || initialResult.room === null) {
    throw new Error("Expected cleanup Room fixture to commit.");
  }
  const room = initialResult.room;
  if (room.hostPlayerId === null) {
    throw new Error("Cleanup fixture requires a Host.");
  }
  const clock = new FakeClock(1_000);
  const session = await saveUnboundFixture(
    persistence,
    verificationData("3"),
    clock,
  );
  assert.equal(
    (
      await persistence.promoteUnbound({
        verificationData: session.verificationData,
        roomId: room.roomId,
        playerId: room.hostPlayerId,
        now: clock.now(),
      })
    ).status,
    "PROMOTED",
  );
  const cleanupRecord = idempotencyRecord(
    "room:room-a",
    "request-cleanup",
    "fingerprint-cleanup",
  );

  const result = await persistence.commit({
    roomMutation: {
      kind: "DELETE",
      roomId: room.roomId,
      expectedRoomRevision: room.roomRevision,
      expectedStorageRevision: room.storageRevision,
    },
    sessionMutation: { kind: "DELETE_BY_ROOM", roomId: room.roomId },
    idempotencyScopesToDelete: ["room:room-a"],
    idempotency: cleanupRecord,
  });

  assert.equal(result.status, "COMMITTED");
  assert.equal(await persistence.findById(room.roomId), null);
  assert.equal(await persistence.findByCode(room.roomCode), null);
  assert.equal(
    await persistence.findByVerificationData(session.verificationData),
    null,
  );
  assert.equal(
    (
      await persistence.classify(
        initialRecord.scopeKey,
        initialRecord.requestId,
        initialRecord.payloadFingerprint,
      )
    ).status,
    "MISS",
  );
  assert.equal(
    (
      await persistence.classify(
        cleanupRecord.scopeKey,
        cleanupRecord.requestId,
        cleanupRecord.payloadFingerprint,
      )
    ).status,
    "REPLAY",
  );
});

test("IdempotencyRepository는 fingerprint 분류와 caller-driven cleanup을 제공한다", async () => {
  const persistence = new InMemoryPersistence();
  const firstRecord = idempotencyRecord(
    "scope-a",
    "request-a",
    "same-payload",
    { sequence: 1 },
    100,
  );
  const createResult = await persistence.commit({
    roomMutation: { kind: "CREATE", candidate: roomFixture() },
    sessionMutation: { kind: "NONE" },
    idempotency: firstRecord,
  });
  assert.equal(createResult.status, "COMMITTED");
  if (createResult.status !== "COMMITTED" || createResult.room === null) {
    throw new Error("Expected atomic create fixture to commit.");
  }

  const secondRecord = idempotencyRecord(
    "scope-a",
    "request-b",
    "second-payload",
    { sequence: 2 },
    200,
  );
  const replaceResult = await persistence.commit({
    roomMutation: {
      kind: "REPLACE",
      candidate: roomFixture({ roomRevision: 1, updatedAt: 2_000 }),
      expectedRoomRevision: createResult.room.roomRevision,
      expectedStorageRevision: createResult.room.storageRevision,
    },
    sessionMutation: { kind: "NONE" },
    idempotency: secondRecord,
  });
  assert.equal(replaceResult.status, "COMMITTED");

  assert.equal(
    (
      await persistence.classify(
        firstRecord.scopeKey,
        firstRecord.requestId,
        firstRecord.payloadFingerprint,
      )
    ).status,
    "REPLAY",
  );
  assert.equal(
    (
      await persistence.classify(
        firstRecord.scopeKey,
        firstRecord.requestId,
        "different-payload",
      )
    ).status,
    "CONFLICT",
  );

  assert.equal(await persistence.deleteCreatedBefore(serverTime(150)), 1);
  assert.equal(
    (
      await persistence.classify(
        firstRecord.scopeKey,
        firstRecord.requestId,
        firstRecord.payloadFingerprint,
      )
    ).status,
    "MISS",
  );
  assert.equal(await persistence.deleteByScope("scope-a"), 1);
  assert.equal(
    (
      await persistence.classify(
        secondRecord.scopeKey,
        secondRecord.requestId,
        secondRecord.payloadFingerprint,
      )
    ).status,
    "MISS",
  );
});

test("persistence는 구조적 extra private field를 저장하거나 반환하지 않는다", async () => {
  const persistence = new InMemoryPersistence();
  const cleanCandidate = roomFixture();
  const host = cleanCandidate.players[0];
  if (host === undefined) {
    throw new Error("Expected host fixture.");
  }
  const candidateWithPrivateFields = {
    ...cleanCandidate,
    socketId: "socket-secret",
    sessionToken: "raw-secret",
    players: [{ ...host, socketId: "player-socket-secret" }],
  };
  const room = await requireCreatedRoom(
    persistence,
    candidateWithPrivateFields,
  );

  assert.equal("socketId" in room, false);
  assert.equal("connectionStatus" in room, false);
  assert.equal("sessionToken" in room, false);
  assert.equal("rawToken" in room, false);
  assert.equal(room.game, null);
  assert.equal("socketId" in (room.players[0] ?? {}), false);

  const clock = new FakeClock(1_000);
  const cleanSession = createUnboundSessionRecord(
    verificationData("6"),
    clock.now(),
  );
  const sessionWithPrivateFields = {
    ...cleanSession,
    rawToken: "raw-secret",
    socketId: "socket-secret",
  };
  assert.equal(
    (await persistence.saveUnbound(sessionWithPrivateFields)).status,
    "SAVED",
  );
  const storedSession = await persistence.findByVerificationData(
    cleanSession.verificationData,
  );
  assert.notEqual(storedSession, null);
  assert.equal(storedSession === null ? true : "rawToken" in storedSession, false);
  assert.equal(storedSession === null ? true : "socketId" in storedSession, false);

  const recordWithPrivateField = {
    ...idempotencyRecord(
      "scope-private-field",
      "request-private-field",
      "fingerprint-private-field",
    ),
    rawToken: "raw-secret",
  };
  const committed = await persistence.commit({
    roomMutation: {
      kind: "REPLACE",
      candidate: roomFixture({ roomRevision: 1, updatedAt: 2_000 }),
      expectedRoomRevision: room.roomRevision,
      expectedStorageRevision: room.storageRevision,
    },
    sessionMutation: { kind: "NONE" },
    idempotency: recordWithPrivateField,
  });
  assert.equal(committed.status, "COMMITTED");
  if (committed.status !== "COMMITTED") {
    throw new Error("Expected private-field fixture to commit.");
  }
  assert.equal("rawToken" in committed.idempotency, false);
});

test("idempotency terminal result는 private 및 prototype-sensitive field를 거절한다", async () => {
  const persistence = new InMemoryPersistence();
  const dangerousResult: Record<string, JsonValue> = { accepted: true };
  Object.defineProperty(dangerousResult, "__proto__", {
    configurable: true,
    enumerable: true,
    value: { polluted: true },
    writable: true,
  });

  await assert.rejects(
    persistence.commit({
      roomMutation: { kind: "CREATE", candidate: roomFixture() },
      sessionMutation: { kind: "NONE" },
      idempotency: idempotencyRecord(
        "scope-dangerous",
        "request-dangerous",
        "fingerprint-dangerous",
        dangerousResult,
      ),
    }),
    /server-private field/u,
  );
  assert.equal(await persistence.findById(roomId("room-a")), null);

  await assert.rejects(
    persistence.commit({
      roomMutation: { kind: "CREATE", candidate: roomFixture() },
      sessionMutation: { kind: "NONE" },
      idempotency: idempotencyRecord(
        "scope-secret-result",
        "request-secret-result",
        "fingerprint-secret-result",
        { sessionToken: "raw-secret" },
      ),
    }),
    /server-private field/u,
  );
  assert.equal(await persistence.findById(roomId("room-a")), null);
});

test("PLAYING Room의 GameState deep copy는 caller mutation에서 persistence를 격리한다", async () => {
  const persistence = new InMemoryPersistence();
  const hostPlayerId = playerId("player-game-host");
  const guestPlayerId = playerId("player-game-guest");
  const players = [
    {
      playerId: hostPlayerId,
      nickname: parse(NicknameSchema, "Host"),
      joinOrder: 0,
    },
    {
      playerId: guestPlayerId,
      nickname: parse(NicknameSchema, "Guest"),
      joinOrder: 1,
    },
  ];
  const game = createInitialGameState({
    playerIds: players.map((player) => player.playerId),
    startedAt: serverTime(10_000),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: () => 0 },
  });
  const usedBoardTileIds = new Set<TileId>();
  const takeTileForSymbol = (symbol: string): TileId => {
    const tile = [...game.tilesById.values()].find(
      (candidate) =>
        candidate.kind === "ORDINARY" &&
        !usedBoardTileIds.has(candidate.tileId) &&
        candidate.allowedSymbols.some(
          (allowedSymbol) => allowedSymbol === symbol,
        ),
    );
    if (tile === undefined) {
      throw new Error(`Expected an ordinary Tile for ${symbol}.`);
    }
    usedBoardTileIds.add(tile.tileId);
    return tile.tileId;
  };
  const giyeokTileId = takeTileForSymbol("ㄱ");
  const firstATileId = takeTileForSymbol("ㅏ");
  const nieunTileId = takeTileForSymbol("ㄴ");
  const secondATileId = takeTileForSymbol("ㅏ");
  const gameWithBoard = {
    ...game,
    consonantBag: game.consonantBag.filter(
      (tileId) => !usedBoardTileIds.has(tileId),
    ),
    vowelBag: game.vowelBag.filter(
      (tileId) => !usedBoardTileIds.has(tileId),
    ),
    racks: new Map(
      [...game.racks].map(([id, rack]) => [
        id,
        rack.filter((tileId) => !usedBoardTileIds.has(tileId)),
      ]),
    ),
    board: {
      wordGroups: [
        {
          groupId: "group-game-isolation",
          syllables: [
            {
              choseong: [
                { tileId: giyeokTileId, assignedSymbol: "ㄱ" },
              ],
              jungseong: [
                { tileId: firstATileId, assignedSymbol: "ㅏ" },
              ],
              jongseong: [],
            },
            {
              choseong: [
                { tileId: nieunTileId, assignedSymbol: "ㄴ" },
              ],
              jungseong: [
                { tileId: secondATileId, assignedSymbol: "ㅏ" },
              ],
              jongseong: [],
            },
          ],
        },
      ],
    },
  };
  const created = await persistence.createIfAbsent({
    roomId: roomId("room-game-isolation"),
    roomCode: roomCode("BCDEFG"),
    gameType: "HANGUL_TILE",
    phase: "PLAYING",
    hostPlayerId,
    players,
    game: gameWithBoard,
    roomRevision: roomRevision(1),
    createdAt: serverTime(1_000),
    updatedAt: serverTime(10_000),
  });
  assert.equal(created.status, "CREATED");
  if (created.status !== "CREATED" || created.room.game === null) {
    throw new Error("Expected a persisted PLAYING Room.");
  }
  const baseline = await persistence.findById(created.room.roomId);
  assert.ok(baseline?.game);

  const nestedRack = [...created.room.game.racks.values()].find(
    (rack) => rack.length > 0,
  );
  const ordinaryTile = [...created.room.game.tilesById.values()].find(
    (tile) => tile.kind === "ORDINARY",
  );
  const boardPlacement =
    created.room.game.board.wordGroups[0]?.syllables[0]?.choseong[0];
  assert.ok(nestedRack);
  assert.ok(ordinaryTile?.kind === "ORDINARY");
  assert.ok(boardPlacement);
  assert.ok(created.room.game.turn);

  assert.throws(() =>
    Reflect.apply(Array.prototype.pop, nestedRack, []),
  );
  assert.throws(() =>
    Reflect.apply(Array.prototype.push, ordinaryTile.allowedSymbols, ["X"]),
  );
  assert.equal(Reflect.set(boardPlacement, "assignedSymbol", "ㅎ"), false);
  assert.equal(Reflect.set(created.room.game.turn, "turnNumber", 99), false);
  assert.throws(() =>
    Reflect.apply(Array.prototype.pop, created.room.game?.vowelBag, []),
  );

  Reflect.apply(Map.prototype.clear, created.room.game.racks, []);
  Reflect.apply(Map.prototype.clear, created.room.game.tilesById, []);
  Reflect.apply(
    Map.prototype.clear,
    created.room.game.initialMeldCompleted,
    [],
  );
  assert.throws(() =>
    Reflect.apply(Array.prototype.pop, created.room.game?.consonantBag, []),
  );
  assert.throws(() =>
    Reflect.apply(Array.prototype.pop, created.room.game?.turnOrder, []),
  );
  assert.throws(() =>
    Reflect.apply(
      Array.prototype.push,
      created.room.game?.board.wordGroups,
      [{ groupId: "mutated", syllables: [] }],
    ),
  );
  assert.equal(
    Reflect.set(created.room.game.rulesConfig, "turnDurationMs", 1),
    false,
  );

  assert.deepEqual(
    await persistence.findById(created.room.roomId),
    baseline,
  );
});

test("RoomUnitOfWork는 Player 제거와 해당 bound session 삭제를 원자적으로 commit한다", async () => {
  const persistence = new InMemoryPersistence();
  const host = playerId("player-leave-host");
  const guest = playerId("player-leave-guest");
  const candidate: RoomCandidateWithHost = {
    ...roomFixture({ roomId: "room-leave", roomCode: "BCDEFG" }),
    hostPlayerId: host,
    players: [
      { playerId: host, nickname: parse(NicknameSchema, "Host"), joinOrder: 0 },
      { playerId: guest, nickname: parse(NicknameSchema, "Guest"), joinOrder: 1 },
    ],
  };
  const room = await requireCreatedRoom(persistence, candidate);
  const clock = new FakeClock(2_000);
  const hostSession = await saveUnboundFixture(persistence, verificationData("8"), clock);
  const guestSession = await saveUnboundFixture(persistence, verificationData("9"), clock);
  assert.equal((await persistence.promoteUnbound({
    verificationData: hostSession.verificationData,
    roomId: room.roomId,
    playerId: host,
    now: clock.now(),
  })).status, "PROMOTED");
  assert.equal((await persistence.promoteUnbound({
    verificationData: guestSession.verificationData,
    roomId: room.roomId,
    playerId: guest,
    now: clock.now(),
  })).status, "PROMOTED");

  const result = await persistence.commit({
    roomMutation: {
      kind: "REPLACE",
      candidate: {
        ...room,
        players: room.players.filter((player) => player.playerId !== guest),
        roomRevision: roomRevision(room.roomRevision + 1),
        updatedAt: clock.now(),
      },
      expectedRoomRevision: room.roomRevision,
      expectedStorageRevision: room.storageRevision,
    },
    sessionMutation: {
      kind: "DELETE_BOUND_PLAYER",
      roomId: room.roomId,
      playerId: guest,
    },
    idempotency: idempotencyRecord(
      `room-player:${room.roomId}:${guest}`,
      "leave-player-request",
      "leave-player",
      { roomId: room.roomId, playerId: guest },
      clock.now(),
    ),
  });

  assert.equal(result.status, "COMMITTED");
  assert.equal(
    await persistence.findByVerificationData(guestSession.verificationData),
    null,
  );
  assert.equal(
    (await persistence.findByVerificationData(hostSession.verificationData))?.state,
    "BOUND",
  );
  assert.deepEqual(
    (await persistence.findById(room.roomId))?.players.map((player) => player.playerId),
    [host],
  );
});

test("Room cleanup UoW는 Room/code/session/Room idempotency를 모두 제거하고 다른 Room은 보존한다", async () => {
  const persistence = new InMemoryPersistence();
  const room = await requireCreatedRoom(
    persistence,
    roomFixture({ roomId: "room-clean-all", roomCode: "CDEFGH" }),
  );
  const retainedRoom = await requireCreatedRoom(
    persistence,
    roomFixture({ roomId: "room-keep", roomCode: "DEFGHJ", playerId: "player-keep" }),
  );
  const clock = new FakeClock(3_000);
  const session = await saveUnboundFixture(persistence, verificationData("a"), clock);
  assert.equal((await persistence.promoteUnbound({
    verificationData: session.verificationData,
    roomId: room.roomId,
    playerId: room.hostPlayerId,
    now: clock.now(),
  })).status, "PROMOTED");
  const roomScoped = idempotencyRecord(
    `room-player:${room.roomId}:${room.hostPlayerId}`,
    "cleanup-target-idempotency",
    "target",
    { roomId: room.roomId },
    clock.now(),
  );
  await persistence.commit({
    roomMutation: {
      kind: "REPLACE",
      candidate: { ...room, updatedAt: clock.now() },
      expectedRoomRevision: room.roomRevision,
      expectedStorageRevision: room.storageRevision,
    },
    sessionMutation: { kind: "NONE" },
    idempotency: roomScoped,
  });
  const latest = await persistence.findById(room.roomId);
  assert.ok(latest);

  assert.deepEqual(await persistence.cleanup({
    roomMutation: {
      kind: "DELETE",
      roomId: latest.roomId,
      expectedRoomRevision: latest.roomRevision,
      expectedStorageRevision: latest.storageRevision,
    },
    sessionMutation: { kind: "DELETE_BY_ROOM", roomId: latest.roomId },
  }), { status: "COMMITTED" });

  assert.equal(await persistence.findById(room.roomId), null);
  assert.equal(await persistence.findByCode(room.roomCode), null);
  assert.equal(await persistence.findByVerificationData(session.verificationData), null);
  assert.deepEqual(
    await persistence.classify(
      roomScoped.scopeKey,
      roomScoped.requestId,
      roomScoped.payloadFingerprint,
    ),
    { status: "MISS" },
  );
  assert.ok(await persistence.findById(retainedRoom.roomId));
});

test("Room cleanup UoW checkpoint failure는 Room/code/session/idempotency를 모두 원자적으로 보존한다", async () => {
  let failureArmed = false;
  const persistence = new InMemoryPersistence({
    onCommitCheckpoint(checkpoint): void {
      if (failureArmed && checkpoint === "AFTER_IDEMPOTENCY_WRITE") {
        throw new Error("injected atomic room cleanup failure");
      }
    },
  });
  const room = await requireCreatedRoom(
    persistence,
    roomFixture({
      roomId: "room-atomic-cleanup-failure",
      roomCode: "EFGHJK",
    }),
  );
  const clock = new FakeClock(4_000);
  const session = await saveUnboundFixture(
    persistence,
    verificationData("b"),
    clock,
  );
  assert.equal(
    (
      await persistence.promoteUnbound({
        verificationData: session.verificationData,
        roomId: room.roomId,
        playerId: room.hostPlayerId,
        now: clock.now(),
      })
    ).status,
    "PROMOTED",
  );
  const roomScoped = idempotencyRecord(
    `room-player:${room.roomId}:${room.hostPlayerId}`,
    "atomic-cleanup-existing-request",
    "atomic-cleanup-existing-fingerprint",
    { roomId: room.roomId },
    clock.now(),
  );
  const seeded = await persistence.commit({
    roomMutation: {
      kind: "REPLACE",
      candidate: { ...room, updatedAt: clock.now() },
      expectedRoomRevision: room.roomRevision,
      expectedStorageRevision: room.storageRevision,
    },
    sessionMutation: { kind: "NONE" },
    idempotency: roomScoped,
  });
  assert.equal(seeded.status, "COMMITTED");
  if (seeded.status !== "COMMITTED" || seeded.room === null) {
    throw new Error("Expected atomic cleanup fixture to commit.");
  }
  failureArmed = true;

  await assert.rejects(
    persistence.cleanup({
      roomMutation: {
        kind: "DELETE",
        roomId: seeded.room.roomId,
        expectedRoomRevision: seeded.room.roomRevision,
        expectedStorageRevision: seeded.room.storageRevision,
      },
      sessionMutation: {
        kind: "DELETE_BY_ROOM",
        roomId: seeded.room.roomId,
      },
    }),
    /injected atomic room cleanup failure/u,
  );

  assert.ok(await persistence.findById(seeded.room.roomId));
  assert.ok(await persistence.findByCode(seeded.room.roomCode));
  assert.equal(
    (await persistence.findByVerificationData(session.verificationData))?.state,
    "BOUND",
  );
  assert.equal(
    (
      await persistence.classify(
        roomScoped.scopeKey,
        roomScoped.requestId,
        roomScoped.payloadFingerprint,
      )
    ).status,
    "REPLAY",
  );
});

test("atomic cleanup 뒤 roomCode는 tombstone 없이 새 Room 후보로 다시 사용할 수 있다", async () => {
  const persistence = new InMemoryPersistence();
  const original = await requireCreatedRoom(
    persistence,
    roomFixture({ roomId: "room-code-original", roomCode: "FGHJKM" }),
  );

  assert.deepEqual(
    await persistence.cleanup({
      roomMutation: {
        kind: "DELETE",
        roomId: original.roomId,
        expectedRoomRevision: original.roomRevision,
        expectedStorageRevision: original.storageRevision,
      },
      sessionMutation: { kind: "DELETE_BY_ROOM", roomId: original.roomId },
    }),
    { status: "COMMITTED" },
  );

  const replacement = await persistence.createIfAbsent(
    roomFixture({
      roomId: "room-code-replacement",
      roomCode: "FGHJKM",
      playerId: "player-code-replacement",
    }),
  );
  assert.equal(replacement.status, "CREATED");
  assert.equal(
    (await persistence.findByCode(original.roomCode))?.roomId,
    replacement.status === "CREATED" ? replacement.room.roomId : null,
  );
});
