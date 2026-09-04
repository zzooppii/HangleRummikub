import assert from "node:assert/strict";
import test from "node:test";

import {
  BOOTSTRAP_SESSION_TTL_MS,
  NicknameSchema,
  PlayerIdSchema,
  RequestIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  SessionTokenSchema,
  type ErrorDto,
  type PlayerId,
  type RequestId,
  type RoomCode,
  type RoomId,
  type RoomPhase,
  type RoomRevision,
  type ServerTime,
  type SessionToken,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  MAX_ROOM_CODE_ATTEMPTS,
  MAX_ROOM_PLAYERS,
  RoomSessionApplicationService,
  type ApplicationResult,
  type BootstrapSessionSuccessData,
} from "./room-session-service.js";
import {
  createInitialGameState,
  type GameState,
} from "../domain/game/game-state.js";
import { createRackEmptyResult } from "../domain/game/result-engine.js";
import {
  GameRegistry,
  type GameRegistrationReader,
} from "../games/game-registry.js";
import {
  createLegacyHangulCompatibilityRegistration,
} from "../games/legacy-hangul-compatibility-registration.js";
import {
  type IdempotencyRecord,
  type RoomRecord,
  type RoomWriteCandidate,
} from "../model/persistence.js";
import type { IdempotencyRepository } from "../ports/idempotency-repository.js";
import type { SessionRepository } from "../ports/session-repository.js";
import type {
  RoomUnitOfWork,
  RoomUnitOfWorkChangeSet,
  RoomUnitOfWorkResult,
} from "../ports/room-unit-of-work.js";
import type { RoomCodeGenerator } from "../ports/system.js";
import {
  InMemoryPersistence,
  type InMemoryCommitCheckpoint,
} from "../infrastructure/in-memory-persistence.js";
import { KeyedSerialExecutor } from "../infrastructure/keyed-serial-executor.js";
import {
  FakeClock,
  FakeIdGenerator,
  NodeCryptoSessionTokenIssuer,
} from "../infrastructure/system.js";

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

function sessionToken(value: string): SessionToken {
  return parse(SessionTokenSchema, value);
}

function requireSuccess<TData>(result: ApplicationResult<TData>): TData {
  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Expected an application success.");
  }
  return result.data;
}

function requireError<TData>(
  result: ApplicationResult<TData>,
  expectedCode: ErrorDto["code"],
): ErrorDto {
  assert.equal(result.ok, false);
  if (result.ok) {
    throw new Error("Expected an application rejection.");
  }
  assert.equal(result.error.code, expectedCode);
  return result.error;
}

class SequenceRoomCodeGenerator implements RoomCodeGenerator {
  #cursor = 0;

  constructor(private readonly candidates: readonly RoomCode[]) {}

  get callCount(): number {
    return this.#cursor;
  }

  generateCandidate(): RoomCode {
    const candidate = this.candidates[this.#cursor];
    if (candidate === undefined) {
      throw new Error("Room code test sequence is exhausted.");
    }
    this.#cursor += 1;
    return candidate;
  }
}

type CommitInterceptor = (
  changeSet: RoomUnitOfWorkChangeSet,
) => Promise<RoomUnitOfWorkResult | undefined>;

class RecordingRoomUnitOfWork implements RoomUnitOfWork {
  readonly changeSets: RoomUnitOfWorkChangeSet[] = [];

  constructor(
    private readonly delegate: RoomUnitOfWork,
    private readonly interceptor?: CommitInterceptor,
  ) {}

  async commit(
    changeSet: RoomUnitOfWorkChangeSet,
  ): Promise<RoomUnitOfWorkResult> {
    this.changeSets.push(changeSet);
    const intercepted = await this.interceptor?.(changeSet);
    return intercepted ?? this.delegate.commit(changeSet);
  }
}

type HarnessOptions = Readonly<{
  codes?: readonly string[];
  onCommitCheckpoint?: (checkpoint: InMemoryCommitCheckpoint) => void;
  commitInterceptor?: CommitInterceptor;
  initialTime?: number;
  gameRegistrationReader?: GameRegistrationReader;
}>;

type Harness = Readonly<{
  service: RoomSessionApplicationService;
  persistence: InMemoryPersistence;
  clock: FakeClock;
  issuer: NodeCryptoSessionTokenIssuer;
  codeGenerator: SequenceRoomCodeGenerator;
  unitOfWork: RecordingRoomUnitOfWork;
  idGenerator: FakeIdGenerator;
}>;

const DEFAULT_ROOM_CODES = [
  "ABCDEF",
  "BCDEFG",
  "CDEFGH",
  "DEFGHJ",
  "EFGHJK",
  "FGHJKM",
] as const;

function createLegacyHangulRegistry(): GameRegistry {
  return new GameRegistry([
    createLegacyHangulCompatibilityRegistration(),
  ]);
}

function createHarness(options: HarnessOptions = {}): Harness {
  const persistence =
    options.onCommitCheckpoint === undefined
      ? new InMemoryPersistence()
      : new InMemoryPersistence({
          onCommitCheckpoint: options.onCommitCheckpoint,
        });
  const clock = new FakeClock(options.initialTime ?? 1_000);
  const issuer = new NodeCryptoSessionTokenIssuer();
  const idGenerator = new FakeIdGenerator();
  const codeGenerator = new SequenceRoomCodeGenerator(
    (options.codes ?? DEFAULT_ROOM_CODES).map(roomCode),
  );
  const unitOfWork = new RecordingRoomUnitOfWork(
    persistence,
    options.commitInterceptor,
  );
  const service = new RoomSessionApplicationService({
    roomRepository: persistence,
    sessionRepository: persistence,
    idempotencyRepository: persistence,
    roomUnitOfWork: unitOfWork,
    clock,
    idGenerator,
    roomCodeGenerator: codeGenerator,
    sessionTokenIssuer: issuer,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(),
    gameRegistrationReader:
      options.gameRegistrationReader ?? createLegacyHangulRegistry(),
  });

  return {
    service,
    persistence,
    clock,
    issuer,
    codeGenerator,
    unitOfWork,
    idGenerator,
  };
}

async function bootstrap(harness: Harness): Promise<BootstrapSessionSuccessData> {
  return requireSuccess(await harness.service.bootstrapSession());
}

type SeedPlayer = Readonly<{
  nickname: string;
  playerId?: string;
}>;

type SeedRoomOptions = Readonly<{
  roomId?: string;
  roomCode?: string;
  phase?: RoomPhase;
  players?: readonly SeedPlayer[];
  roomRevision?: number;
}>;

async function seedRoom(
  persistence: InMemoryPersistence,
  options: SeedRoomOptions = {},
): Promise<RoomRecord> {
  const seedRoomId = options.roomId ?? "seed-room";
  const players = (options.players ?? [{ nickname: "Host" }]).map(
    (player, index) => ({
      playerId: playerId(
        player.playerId ?? `${seedRoomId}-player-${index}`,
      ),
      nickname: parse(NicknameSchema, player.nickname),
      joinOrder: index,
    }),
  );
  const host = players[0];
  if (host === undefined) {
    throw new Error("A Room fixture requires a Host Player.");
  }

  const phase = options.phase ?? "LOBBY";
  let game: GameState | null = null;
  if (phase !== "LOBBY") {
    const activeGame = createInitialGameState({
      playerIds: players.map((player) => player.playerId),
      startedAt: serverTime(500),
      idGenerator: new FakeIdGenerator(),
      randomSource: { nextInt: () => 0 },
    });
    if (phase === "PLAYING") {
      game = activeGame;
    } else {
      const winnerRack = activeGame.racks.get(host.playerId) ?? [];
      const returnedConsonants = winnerRack.filter(
        (tileId) => activeGame.tilesById.get(tileId)?.sourceBag === "CONSONANT",
      );
      const returnedVowels = winnerRack.filter(
        (tileId) => activeGame.tilesById.get(tileId)?.sourceBag === "VOWEL",
      );
      const racks = new Map(activeGame.racks);
      racks.set(host.playerId, []);
      game = {
        ...activeGame,
        consonantBag: [...activeGame.consonantBag, ...returnedConsonants],
        vowelBag: [...activeGame.vowelBag, ...returnedVowels],
        racks,
        turn: null,
        result: createRackEmptyResult(
          {
            playerIds: activeGame.turnOrder,
            racks,
            tilesById: activeGame.tilesById,
            forfeitedPlayerIds: activeGame.forfeitedPlayerIds,
            finishedAt: serverTime(500),
          },
          host.playerId,
        ),
      };
    }
  }

  const candidate: RoomWriteCandidate = {
    roomId: roomId(seedRoomId),
    roomCode: roomCode(options.roomCode ?? "ABCDEF"),
    gameType: "HANGUL_TILE",
    phase,
    hostPlayerId: host.playerId,
    players,
    game,
    roomRevision: roomRevision(options.roomRevision ?? 0),
    createdAt: serverTime(500),
    updatedAt: serverTime(500),
  };
  const created = await persistence.createIfAbsent(candidate);
  assert.equal(created.status, "CREATED");
  if (created.status !== "CREATED") {
    throw new Error("Room fixture could not be created.");
  }
  return created.room;
}

function lastChangeSet(unitOfWork: RecordingRoomUnitOfWork): RoomUnitOfWorkChangeSet {
  const changeSet = unitOfWork.changeSets.at(-1);
  if (changeSet === undefined) {
    throw new Error("Expected a recorded UnitOfWork change set.");
  }
  return changeSet;
}

async function requireStoredIdempotency(
  persistence: InMemoryPersistence,
  record: IdempotencyRecord,
): Promise<IdempotencyRecord> {
  const lookup = await persistence.classify(
    record.scopeKey,
    record.requestId,
    record.payloadFingerprint,
  );
  assert.equal(lookup.status, "REPLAY");
  if (lookup.status !== "REPLAY") {
    throw new Error("Expected an accepted idempotency record.");
  }
  return lookup.record;
}

function collectObjectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectObjectKeys);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }

  return Object.keys(value).flatMap((key) => [
    key,
    ...collectObjectKeys(Reflect.get(value, key)),
  ]);
}

function assertTerminalResultIsNonSecret(
  record: IdempotencyRecord,
  rawToken: SessionToken,
): void {
  const forbiddenKeys = new Set([
    "sessionToken",
    "rawToken",
    "digestHex",
    "verificationData",
    "socketId",
    "connectionGeneration",
    "storageRevision",
  ]);
  for (const key of collectObjectKeys(record.terminalResult)) {
    assert.equal(forbiddenKeys.has(key), false, `forbidden key: ${key}`);
  }
  assert.equal(JSON.stringify(record.terminalResult).includes(rawToken), false);
}

test("bootstrapSession은 정확히 5분 유효한 UNBOUND credential을 hash로만 저장한다", async () => {
  const harness = createHarness({ initialTime: 10_000 });
  const issued = await bootstrap(harness);

  assert.equal(issued.issuedAt, 10_000);
  assert.equal(issued.expiresAt, 10_000 + BOOTSTRAP_SESSION_TTL_MS);
  const verification = harness.issuer.deriveVerificationData(issued.sessionToken);
  const persisted = await harness.persistence.findByVerificationData(verification);
  assert.notEqual(persisted, null);
  assert.equal(persisted?.state, "UNBOUND");
  assert.equal(Reflect.has(persisted ?? {}, "sessionToken"), false);
  assert.notEqual(verification.digestHex, issued.sessionToken);
});

test("bootstrap credential은 expiresAt 직전 유효하고 expiresAt부터 동일한 안전 오류로 거절된다", async () => {
  const beforeExpiry = createHarness();
  const validCredential = await bootstrap(beforeExpiry);
  beforeExpiry.clock.set(validCredential.expiresAt - 1);
  requireSuccess(
    await beforeExpiry.service.createRoom({
      sessionToken: validCredential.sessionToken,
      requestId: requestId("before-expiry"),
      nickname: "Valid",
    }),
  );

  const atExpiry = createHarness();
  const expiredCredential = await bootstrap(atExpiry);
  atExpiry.clock.set(expiredCredential.expiresAt);
  const expiredError = requireError(
    await atExpiry.service.createRoom({
      sessionToken: expiredCredential.sessionToken,
      requestId: requestId("at-expiry"),
      nickname: "Expired",
    }),
    "UNAUTHENTICATED",
  );
  const wrongTokenError = requireError(
    await atExpiry.service.createRoom({
      sessionToken: sessionToken("not-the-issued-token"),
      requestId: requestId("wrong-token"),
      nickname: "Unknown",
    }),
    "UNAUTHENTICATED",
  );

  assert.deepEqual(wrongTokenError, expiredError);
  assert.equal(atExpiry.unitOfWork.changeSets.length, 0);
});

test("createRoom은 normalized Host와 초기 revision을 원자적으로 생성한다", async () => {
  const harness = createHarness();
  const credential = await bootstrap(harness);
  const created = requireSuccess(
    await harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: requestId("create-main"),
      nickname: "  Harvey  ",
    }),
  );

  assert.deepEqual(created, {
    roomId: roomId("test-room-1"),
    roomCode: roomCode("ABCDEF"),
    playerId: playerId("test-player-1"),
    roomRevision: roomRevision(0),
  });
  const room = await harness.persistence.findById(created.roomId);
  assert.notEqual(room, null);
  assert.equal(room?.phase, "LOBBY");
  assert.equal(room?.gameType, "HANGUL_TILE");
  assert.equal(room?.hostPlayerId, created.playerId);
  assert.equal(room?.players.length, 1);
  assert.deepEqual(room?.players[0], {
    playerId: created.playerId,
    nickname: "Harvey",
    joinOrder: 0,
  });
  assert.equal(room?.roomRevision, 0);
  assert.equal(room?.storageRevision, 0);

  const verification = harness.issuer.deriveVerificationData(
    credential.sessionToken,
  );
  const session = await harness.persistence.findByVerificationData(verification);
  assert.equal(session?.state, "BOUND");
  if (session?.state === "BOUND") {
    assert.equal(session.roomId, created.roomId);
    assert.equal(session.playerId, created.playerId);
  }

  const persistedIdempotency = await requireStoredIdempotency(
    harness.persistence,
    lastChangeSet(harness.unitOfWork).idempotency,
  );
  assert.deepEqual(persistedIdempotency.terminalResult, created);
  assertTerminalResultIsNonSecret(
    persistedIdempotency,
    credential.sessionToken,
  );
});

test("createRoom은 invalid nickname을 shared validator의 NICKNAME_INVALID로 거절한다", async () => {
  const harness = createHarness();
  const credential = await bootstrap(harness);

  requireError(
    await harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: requestId("invalid-nickname"),
      nickname: "player🙂",
    }),
    "NICKNAME_INVALID",
  );
  assert.equal(harness.unitOfWork.changeSets.length, 0);
  const session = await harness.persistence.findByVerificationData(
    harness.issuer.deriveVerificationData(credential.sessionToken),
  );
  assert.equal(session?.state, "UNBOUND");
});

test("createRoom은 roomCode collision 후 다음 candidate로 재시도한다", async () => {
  const harness = createHarness({ codes: ["ABCDEF", "GHJKMN"] });
  await seedRoom(harness.persistence, {
    roomId: "collision-room",
    roomCode: "ABCDEF",
  });
  const credential = await bootstrap(harness);
  const created = requireSuccess(
    await harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: requestId("collision-retry"),
      nickname: "Creator",
    }),
  );

  assert.equal(created.roomCode, "GHJKMN");
  assert.equal(harness.codeGenerator.callCount, 2);
  assert.equal(harness.unitOfWork.changeSets.length, 2);
  assert.notEqual(await harness.persistence.findByCode(roomCode("GHJKMN")), null);
});

test("createRoom은 정확히 10회 collision 후 ROOM_CODE_EXHAUSTED이며 ghost state를 남기지 않는다", async () => {
  const collisionCodes = [
    "ABCDEF",
    "BCDEFG",
    "CDEFGH",
    "DEFGHJ",
    "EFGHJK",
    "FGHJKM",
    "GHJKMN",
    "HJKMNP",
    "JKMNPQ",
    "KMNPQR",
  ] as const;
  const harness = createHarness({ codes: collisionCodes });
  for (const [index, code] of collisionCodes.entries()) {
    await seedRoom(harness.persistence, {
      roomId: `collision-${index}`,
      roomCode: code,
    });
  }
  const credential = await bootstrap(harness);

  requireError(
    await harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: requestId("exhausted"),
      nickname: "Creator",
    }),
    "ROOM_CODE_EXHAUSTED",
  );

  assert.equal(MAX_ROOM_CODE_ATTEMPTS, 10);
  assert.equal(harness.codeGenerator.callCount, 10);
  assert.equal(await harness.persistence.findById(roomId("test-room-1")), null);
  const session = await harness.persistence.findByVerificationData(
    harness.issuer.deriveVerificationData(credential.sessionToken),
  );
  assert.equal(session?.state, "UNBOUND");
  const attempted = lastChangeSet(harness.unitOfWork).idempotency;
  assert.deepEqual(
    await harness.persistence.classify(
      attempted.scopeKey,
      attempted.requestId,
      attempted.payloadFingerprint,
    ),
    { status: "MISS" },
  );
});

test("createRoom accepted retry는 ack loss 뒤 같은 결과를 replay하고 다른 payload를 거절한다", async () => {
  const harness = createHarness();
  const credential = await bootstrap(harness);
  const id = requestId("idempotent-create");
  const first = requireSuccess(
    await harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: id,
      nickname: "  Harvey ",
    }),
  );
  const replay = requireSuccess(
    await harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: id,
      nickname: "Harvey",
    }),
  );

  assert.deepEqual(replay, first);
  assert.equal(
    (await harness.persistence.findById(first.roomId))?.gameType,
    "HANGUL_TILE",
  );
  assert.equal(harness.codeGenerator.callCount, 1);
  assert.equal(harness.unitOfWork.changeSets.length, 1);
  requireError(
    await harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: id,
      nickname: "Different",
    }),
    "REQUEST_ID_REUSED",
  );
});

test("legacy v1 default registration이 없으면 createRoom은 어떤 canonical state도 만들지 않는다", async () => {
  const harness = createHarness({
    gameRegistrationReader: new GameRegistry([]),
  });
  const credential = await bootstrap(harness);
  const verificationData = harness.issuer.deriveVerificationData(
    credential.sessionToken,
  );
  const id = requestId("missing-game-registration");

  requireError(
    await harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: id,
      nickname: "Harvey",
    }),
    "INTERNAL_ERROR",
  );

  assert.equal(await harness.persistence.findByCode(roomCode("ABCDEF")), null);
  assert.equal(await harness.persistence.findById(roomId("test-room-1")), null);
  assert.equal(harness.unitOfWork.changeSets.length, 0);
  assert.equal(harness.codeGenerator.callCount, 0);
  assert.equal(
    (await harness.persistence.findByVerificationData(verificationData))?.state,
    "UNBOUND",
  );
  assert.deepEqual(
    await harness.persistence.classify(
      `bootstrap:${verificationData.algorithm}:${verificationData.digestHex}`,
      id,
      JSON.stringify(["room:create", "Harvey"]),
    ),
    { status: "MISS" },
  );
});

test("동시 동일 accepted request는 BOUND 관찰 race에서도 둘 다 같은 결과를 replay한다", async () => {
  const persistence = new InMemoryPersistence();
  const clock = new FakeClock(1_000);
  const issuer = new NodeCryptoSessionTokenIssuer();
  const ids = new FakeIdGenerator();
  const codes = new SequenceRoomCodeGenerator([roomCode("ABCDEF")]);
  let lookupCount = 0;
  let releaseSecondLookup: (() => void) | undefined;
  const secondLookupGate = new Promise<void>((resolve) => {
    releaseSecondLookup = resolve;
  });
  const delayedSessions: SessionRepository = {
    findByVerificationData: async (verificationData) => {
      lookupCount += 1;
      if (lookupCount === 2) {
        await secondLookupGate;
      }
      return persistence.findByVerificationData(verificationData);
    },
    saveUnbound: (session) => persistence.saveUnbound(session),
    promoteUnbound: (input) => persistence.promoteUnbound(input),
    deleteByVerificationData: (verificationData) =>
      persistence.deleteByVerificationData(verificationData),
    deleteByRoomId: (id) => persistence.deleteByRoomId(id),
  };
  const releasingUnitOfWork: RoomUnitOfWork = {
    commit: async (changeSet) => {
      const result = await persistence.commit(changeSet);
      if (result.status === "COMMITTED") {
        releaseSecondLookup?.();
      }
      return result;
    },
  };
  const service = new RoomSessionApplicationService({
    roomRepository: persistence,
    sessionRepository: delayedSessions,
    idempotencyRepository: persistence,
    roomUnitOfWork: releasingUnitOfWork,
    clock,
    idGenerator: ids,
    roomCodeGenerator: codes,
    sessionTokenIssuer: issuer,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(),
    gameRegistrationReader: createLegacyHangulRegistry(),
  });
  const credential = requireSuccess(await service.bootstrapSession());
  const input = {
    sessionToken: credential.sessionToken,
    requestId: requestId("same-concurrent-request"),
    nickname: "Harvey",
  };

  const [first, second] = await Promise.all([
    service.createRoom(input),
    service.createRoom(input),
  ]);
  assert.deepEqual(requireSuccess(first), requireSuccess(second));
  assert.equal(codes.callCount, 1);
});

test("late idempotency lookup failure는 안전한 INTERNAL_ERROR로 변환된다", async () => {
  const persistence = new InMemoryPersistence();
  const clock = new FakeClock(1_000);
  const issuer = new NodeCryptoSessionTokenIssuer();
  let classifyCalls = 0;
  const failingIdempotency: IdempotencyRepository = {
    classify: async (scopeKey, id, fingerprint) => {
      classifyCalls += 1;
      if (classifyCalls === 2) {
        throw new Error("injected late lookup failure");
      }
      return persistence.classify(scopeKey, id, fingerprint);
    },
    deleteByScope: (scopeKey) => persistence.deleteByScope(scopeKey),
    deleteCreatedBefore: (cutoff) =>
      persistence.deleteCreatedBefore(cutoff),
  };
  const service = new RoomSessionApplicationService({
    roomRepository: persistence,
    sessionRepository: persistence,
    idempotencyRepository: failingIdempotency,
    roomUnitOfWork: persistence,
    clock,
    idGenerator: new FakeIdGenerator(),
    roomCodeGenerator: new SequenceRoomCodeGenerator([roomCode("ABCDEF")]),
    sessionTokenIssuer: issuer,
    roomMutationExecutor: new KeyedSerialExecutor<RoomId>(),
    gameRegistrationReader: createLegacyHangulRegistry(),
  });
  const credential = requireSuccess(await service.bootstrapSession());
  clock.set(credential.expiresAt);

  requireError(
    await service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: requestId("late-lookup-failure"),
      nickname: "Harvey",
    }),
    "INTERNAL_ERROR",
  );
  assert.equal(classifyCalls, 2);
  assert.equal(await persistence.findByCode(roomCode("ABCDEF")), null);
});

test("joinRoom은 canonical roomCode, ordered Player, revision을 원자적으로 갱신한다", async () => {
  const harness = createHarness();
  const hostCredential = await bootstrap(harness);
  const created = requireSuccess(
    await harness.service.createRoom({
      sessionToken: hostCredential.sessionToken,
      requestId: requestId("host-create"),
      nickname: "Host",
    }),
  );
  harness.clock.advance(100);
  const joinCredential = await bootstrap(harness);
  const joined = requireSuccess(
    await harness.service.joinRoom({
      sessionToken: joinCredential.sessionToken,
      requestId: requestId("join-main"),
      roomCode: "  abcdef ",
      nickname: "Guest",
    }),
  );

  assert.deepEqual(joined, {
    roomId: created.roomId,
    roomCode: roomCode("ABCDEF"),
    playerId: playerId("test-player-2"),
    roomRevision: roomRevision(1),
  });
  const room = await harness.persistence.findById(created.roomId);
  assert.equal(room?.gameType, "HANGUL_TILE");
  assert.equal(room?.players.length, 2);
  assert.deepEqual(room?.players.map(({ nickname, joinOrder }) => ({ nickname, joinOrder })), [
    { nickname: "Host", joinOrder: 0 },
    { nickname: "Guest", joinOrder: 1 },
  ]);
  assert.equal(room?.roomRevision, 1);
  assert.equal(room?.storageRevision, 1);
  assert.equal(room?.updatedAt, harness.clock.now());

  const session = await harness.persistence.findByVerificationData(
    harness.issuer.deriveVerificationData(joinCredential.sessionToken),
  );
  assert.equal(session?.state, "BOUND");
  const idempotency = await requireStoredIdempotency(
    harness.persistence,
    lastChangeSet(harness.unitOfWork).idempotency,
  );
  assertTerminalResultIsNonSecret(idempotency, joinCredential.sessionToken);
});

test("joinRoom accepted retry는 replay되고 payload 충돌은 거절되며 다음 joinOrder는 증가한다", async () => {
  const harness = createHarness();
  const hostCredential = await bootstrap(harness);
  const created = requireSuccess(
    await harness.service.createRoom({
      sessionToken: hostCredential.sessionToken,
      requestId: requestId("join-idempotency-host"),
      nickname: "Host",
    }),
  );
  const firstCredential = await bootstrap(harness);
  const id = requestId("idempotent-join");
  const first = requireSuccess(
    await harness.service.joinRoom({
      sessionToken: firstCredential.sessionToken,
      requestId: id,
      roomCode: " abcdef ",
      nickname: " Guest ",
    }),
  );
  const replay = requireSuccess(
    await harness.service.joinRoom({
      sessionToken: firstCredential.sessionToken,
      requestId: id,
      roomCode: "ABCDEF",
      nickname: "Guest",
    }),
  );
  assert.deepEqual(replay, first);
  requireError(
    await harness.service.joinRoom({
      sessionToken: firstCredential.sessionToken,
      requestId: id,
      roomCode: "ABCDEF",
      nickname: "Changed",
    }),
    "REQUEST_ID_REUSED",
  );

  const secondCredential = await bootstrap(harness);
  const second = requireSuccess(
    await harness.service.joinRoom({
      sessionToken: secondCredential.sessionToken,
      requestId: requestId("second-join"),
      roomCode: created.roomCode,
      nickname: "Second",
    }),
  );
  assert.equal(second.roomRevision, 2);
  const room = await harness.persistence.findById(created.roomId);
  assert.deepEqual(room?.players.map((player) => player.joinOrder), [0, 1, 2]);
});

test("joinRoom은 Room 없음, non-LOBBY, full Room을 각각 안정적으로 거절한다", async (context) => {
  await context.test("ROOM_NOT_FOUND", async () => {
    const harness = createHarness();
    const credential = await bootstrap(harness);
    requireError(
      await harness.service.joinRoom({
        sessionToken: credential.sessionToken,
        requestId: requestId("missing-room"),
        roomCode: "ABCDEF",
        nickname: "Guest",
      }),
      "ROOM_NOT_FOUND",
    );
  });

  for (const phase of ["PLAYING", "FINISHED"] as const) {
    await context.test(`${phase} -> ROOM_NOT_JOINABLE`, async () => {
      const harness = createHarness();
      const original = await seedRoom(harness.persistence, {
        phase,
        players: [{ nickname: "Host" }, { nickname: "Existing" }],
      });
      const credential = await bootstrap(harness);
      requireError(
        await harness.service.joinRoom({
          sessionToken: credential.sessionToken,
          requestId: requestId(`not-joinable-${phase}`),
          roomCode: "ABCDEF",
          nickname: "Guest",
        }),
        "ROOM_NOT_JOINABLE",
      );
      assert.deepEqual(
        await harness.persistence.findById(original.roomId),
        original,
      );
    });
  }

  await context.test("4명 Room -> ROOM_FULL", async () => {
    const harness = createHarness();
    const original = await seedRoom(harness.persistence, {
      players: [
        { nickname: "Player0" },
        { nickname: "Player1" },
        { nickname: "Player2" },
        { nickname: "Player3" },
      ],
    });
    const credential = await bootstrap(harness);
    requireError(
      await harness.service.joinRoom({
        sessionToken: credential.sessionToken,
        requestId: requestId("fifth-player"),
        roomCode: "ABCDEF",
        nickname: "Player4",
      }),
      "ROOM_FULL",
    );
    assert.equal(MAX_ROOM_PLAYERS, 4);
    assert.deepEqual(
      await harness.persistence.findById(original.roomId),
      original,
    );
  });
});

test("joinRoom nickname 비교는 NFC normalized exact case-sensitive 정책을 따른다", async () => {
  const duplicateHarness = createHarness();
  const duplicateRoom = await seedRoom(duplicateHarness.persistence, {
    players: [{ nickname: "é" }],
  });
  const duplicateCredential = await bootstrap(duplicateHarness);
  requireError(
    await duplicateHarness.service.joinRoom({
      sessionToken: duplicateCredential.sessionToken,
      requestId: requestId("nfc-duplicate"),
      roomCode: duplicateRoom.roomCode,
      nickname: "e\u0301",
    }),
    "NICKNAME_TAKEN",
  );
  assert.equal(
    (
      await duplicateHarness.persistence.findById(duplicateRoom.roomId)
    )?.roomRevision,
    duplicateRoom.roomRevision,
  );

  const caseHarness = createHarness();
  const caseRoom = await seedRoom(caseHarness.persistence, {
    players: [{ nickname: "Harvey" }],
  });
  const caseCredential = await bootstrap(caseHarness);
  const joined = requireSuccess(
    await caseHarness.service.joinRoom({
      sessionToken: caseCredential.sessionToken,
      requestId: requestId("case-sensitive"),
      roomCode: caseRoom.roomCode,
      nickname: "harvey",
    }),
  );
  assert.equal(joined.roomRevision, 1);
});

test("joinRoom invalid input은 canonical state와 session을 변경하지 않는다", async () => {
  const harness = createHarness();
  const original = await seedRoom(harness.persistence);
  const badNicknameCredential = await bootstrap(harness);
  requireError(
    await harness.service.joinRoom({
      sessionToken: badNicknameCredential.sessionToken,
      requestId: requestId("bad-join-nickname"),
      roomCode: "ABCDEF",
      nickname: "bad name",
    }),
    "NICKNAME_INVALID",
  );
  const badCodeCredential = await bootstrap(harness);
  requireError(
    await harness.service.joinRoom({
      sessionToken: badCodeCredential.sessionToken,
      requestId: requestId("bad-room-code"),
      roomCode: "OOO000",
      nickname: "Guest",
    }),
    "ROOM_CODE_INVALID",
  );

  assert.deepEqual(await harness.persistence.findById(original.roomId), original);
  for (const credential of [badNicknameCredential, badCodeCredential]) {
    const session = await harness.persistence.findByVerificationData(
      harness.issuer.deriveVerificationData(credential.sessionToken),
    );
    assert.equal(session?.state, "UNBOUND");
  }
});

test("3명 Room의 concurrent join 두 개 중 하나만 성공하여 정원 4명을 넘지 않는다", async () => {
  const harness = createHarness();
  const original = await seedRoom(harness.persistence, {
    players: [
      { nickname: "Host" },
      { nickname: "Second" },
      { nickname: "Third" },
    ],
  });
  const firstCredential = await bootstrap(harness);
  const secondCredential = await bootstrap(harness);

  const [firstResult, secondResult] = await Promise.all([
    harness.service.joinRoom({
      sessionToken: firstCredential.sessionToken,
      requestId: requestId("capacity-a"),
      roomCode: original.roomCode,
      nickname: "FourthA",
    }),
    harness.service.joinRoom({
      sessionToken: secondCredential.sessionToken,
      requestId: requestId("capacity-b"),
      roomCode: original.roomCode,
      nickname: "FourthB",
    }),
  ]);
  const attempts = [
    { credential: firstCredential, result: firstResult },
    { credential: secondCredential, result: secondResult },
  ];

  assert.equal(attempts.filter(({ result }) => result.ok).length, 1);
  const room = await harness.persistence.findById(original.roomId);
  assert.equal(room?.players.length, 4);
  assert.equal(room?.roomRevision, original.roomRevision + 1);
  for (const { credential, result } of attempts) {
    const session = await harness.persistence.findByVerificationData(
      harness.issuer.deriveVerificationData(credential.sessionToken),
    );
    if (result.ok) {
      assert.equal(session?.state, "BOUND");
    } else {
      assert.equal(result.error.code, "ROOM_FULL");
      assert.equal(session?.state, "UNBOUND");
    }
  }
});

test("같은 bootstrap token의 concurrent create/create는 정확히 하나만 promotion한다", async () => {
  const harness = createHarness({ codes: ["ABCDEF", "BCDEFG"] });
  const credential = await bootstrap(harness);
  const [first, second] = await Promise.all([
    harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: requestId("race-create-a"),
      nickname: "Alpha",
    }),
    harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: requestId("race-create-b"),
      nickname: "Beta",
    }),
  ]);

  assert.equal([first, second].filter((result) => result.ok).length, 1);
  const rejected = [first, second].find((result) => !result.ok);
  assert.notEqual(rejected, undefined);
  if (rejected !== undefined && !rejected.ok) {
    assert.equal(rejected.error.code, "UNAUTHENTICATED");
  }
  const rooms = await Promise.all([
    harness.persistence.findByCode(roomCode("ABCDEF")),
    harness.persistence.findByCode(roomCode("BCDEFG")),
  ]);
  assert.equal(rooms.filter((room) => room !== null).length, 1);
  const bound = await harness.persistence.findByVerificationData(
    harness.issuer.deriveVerificationData(credential.sessionToken),
  );
  assert.equal(bound?.state, "BOUND");
});

test("같은 bootstrap token의 concurrent create/join은 canonical mutation 하나만 남긴다", async () => {
  const harness = createHarness({ codes: ["GHJKMN"] });
  const target = await seedRoom(harness.persistence, {
    roomId: "target-room",
    roomCode: "ABCDEF",
  });
  const credential = await bootstrap(harness);
  const [createResult, joinResult] = await Promise.all([
    harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: requestId("race-create"),
      nickname: "Creator",
    }),
    harness.service.joinRoom({
      sessionToken: credential.sessionToken,
      requestId: requestId("race-join"),
      roomCode: target.roomCode,
      nickname: "Joiner",
    }),
  ]);

  assert.equal([createResult, joinResult].filter((result) => result.ok).length, 1);
  const rejected = [createResult, joinResult].find((result) => !result.ok);
  if (rejected === undefined || rejected.ok) {
    throw new Error("Expected one bootstrap race rejection.");
  }
  assert.equal(rejected.error.code, "UNAUTHENTICATED");

  const targetAfter = await harness.persistence.findById(target.roomId);
  const createdRoom = await harness.persistence.findByCode(roomCode("GHJKMN"));
  assert.equal(
    (targetAfter?.players.length ?? 0) + (createdRoom?.players.length ?? 0),
    2,
  );
  const session = await harness.persistence.findByVerificationData(
    harness.issuer.deriveVerificationData(credential.sessionToken),
  );
  assert.equal(session?.state, "BOUND");
  if (session?.state === "BOUND") {
    const boundRoom = await harness.persistence.findById(session.roomId);
    assert.equal(
      boundRoom?.players.some((player) => player.playerId === session.playerId),
      true,
    );
  }
});

test("create UoW failure injection은 Room/session/idempotency partial state를 남기지 않는다", async () => {
  let armed = false;
  const harness = createHarness({
    onCommitCheckpoint: (checkpoint) => {
      if (armed && checkpoint === "AFTER_SESSION_WRITE") {
        throw new Error("injected create failure");
      }
    },
  });
  const credential = await bootstrap(harness);
  armed = true;
  requireError(
    await harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: requestId("create-failure"),
      nickname: "Creator",
    }),
    "INTERNAL_ERROR",
  );

  assert.equal(await harness.persistence.findById(roomId("test-room-1")), null);
  const session = await harness.persistence.findByVerificationData(
    harness.issuer.deriveVerificationData(credential.sessionToken),
  );
  assert.equal(session?.state, "UNBOUND");
  const attempted = lastChangeSet(harness.unitOfWork).idempotency;
  assert.deepEqual(
    await harness.persistence.classify(
      attempted.scopeKey,
      attempted.requestId,
      attempted.payloadFingerprint,
    ),
    { status: "MISS" },
  );
});

test("join UoW failure injection은 Room revision/Player/session/idempotency를 모두 보존한다", async () => {
  let armed = false;
  const harness = createHarness({
    onCommitCheckpoint: (checkpoint) => {
      if (armed && checkpoint === "AFTER_ROOM_WRITE") {
        throw new Error("injected join failure");
      }
    },
  });
  const original = await seedRoom(harness.persistence);
  const credential = await bootstrap(harness);
  armed = true;
  requireError(
    await harness.service.joinRoom({
      sessionToken: credential.sessionToken,
      requestId: requestId("join-failure"),
      roomCode: original.roomCode,
      nickname: "Guest",
    }),
    "INTERNAL_ERROR",
  );

  assert.deepEqual(await harness.persistence.findById(original.roomId), original);
  const session = await harness.persistence.findByVerificationData(
    harness.issuer.deriveVerificationData(credential.sessionToken),
  );
  assert.equal(session?.state, "UNBOUND");
  const attempted = lastChangeSet(harness.unitOfWork).idempotency;
  assert.deepEqual(
    await harness.persistence.classify(
      attempted.scopeKey,
      attempted.requestId,
      attempted.payloadFingerprint,
    ),
    { status: "MISS" },
  );
});

test("conditional session promotion failure는 canonical Room과 idempotency를 만들지 않는다", async () => {
  const harness = createHarness({
    commitInterceptor: async () => ({
      status: "PRECONDITION_FAILED",
      reason: "SESSION_NOT_FOUND",
    }),
  });
  const credential = await bootstrap(harness);
  requireError(
    await harness.service.createRoom({
      sessionToken: credential.sessionToken,
      requestId: requestId("promotion-failure"),
      nickname: "Creator",
    }),
    "UNAUTHENTICATED",
  );

  assert.equal(await harness.persistence.findById(roomId("test-room-1")), null);
  const session = await harness.persistence.findByVerificationData(
    harness.issuer.deriveVerificationData(credential.sessionToken),
  );
  assert.equal(session?.state, "UNBOUND");
  const attempted = lastChangeSet(harness.unitOfWork).idempotency;
  assert.deepEqual(
    await harness.persistence.classify(
      attempted.scopeKey,
      attempted.requestId,
      attempted.payloadFingerprint,
    ),
    { status: "MISS" },
  );
});
