import assert from "node:assert/strict";
import test from "node:test";

import {
  GameIdSchema,
  PlayerIdSchema,
  ROOM_CODE_ALPHABET,
  ROOM_CODE_LENGTH,
  RoomIdSchema,
  TileIdSchema,
  TurnIdSchema,
} from "@hangul-rummikub/shared";
import { safeParse } from "valibot";

import {
  CryptoRandomSource,
  FakeClock,
  FakeIdGenerator,
  FakeRandomSource,
  NodeCryptoIdGenerator,
  NodeCryptoSessionTokenIssuer,
  RandomRoomCodeGenerator,
  SystemClock,
} from "./system.js";

test("SystemClock은 현재 Unix epoch milliseconds를 반환한다", () => {
  const beforeMs = Date.now();
  const currentMs = new SystemClock().now();
  const afterMs = Date.now();

  assert.equal(Number.isSafeInteger(currentMs), true);
  assert.equal(currentMs >= beforeMs, true);
  assert.equal(currentMs <= afterMs, true);
});

test("FakeClock은 시간을 결정적으로 set하고 advance한다", () => {
  const clock = new FakeClock(1_000);

  assert.equal(clock.now(), 1_000);
  clock.advance(250);
  assert.equal(clock.now(), 1_250);
  clock.set(5_000);
  assert.equal(clock.now(), 5_000);

  assert.throws(() => clock.advance(-1), RangeError);
  assert.throws(() => clock.set(1.5), RangeError);
  assert.throws(() => new FakeClock(-1), RangeError);
});

test("CryptoRandomSource는 요청 범위 안의 정수를 반환한다", () => {
  const source = new CryptoRandomSource();

  for (let iteration = 0; iteration < 32; iteration += 1) {
    const value = source.nextInt(7);
    assert.equal(Number.isSafeInteger(value), true);
    assert.equal(value >= 0 && value < 7, true);
  }

  assert.throws(() => source.nextInt(0), RangeError);
  assert.throws(() => source.nextInt(1.5), RangeError);
});

test("FakeRandomSource는 복사된 sequence를 결정적으로 소비한다", () => {
  const sourceValues = [2, 0];
  const source = new FakeRandomSource(sourceValues);
  sourceValues[0] = 1;

  assert.equal(source.nextInt(3), 2);
  assert.equal(source.nextInt(3), 0);
  assert.throws(() => source.nextInt(3), /no remaining values/u);

  const invalidSource = new FakeRandomSource([3]);
  assert.throws(() => invalidSource.nextInt(3), RangeError);
});

test("RoomCodeGenerator는 확정 alphabet의 6자리 candidate만 만든다", () => {
  const generator = new RandomRoomCodeGenerator(
    new FakeRandomSource([0, 1, 2, 3, 4, 5]),
  );
  const candidate = generator.generateCandidate();

  assert.equal(candidate, "ABCDEF");
  assert.equal(candidate.length, ROOM_CODE_LENGTH);
  for (const character of candidate) {
    assert.equal(ROOM_CODE_ALPHABET.includes(character), true);
  }
});

test("RoomCodeGenerator는 잘못된 RandomSource 출력을 거절한다", () => {
  const invalidSource = {
    nextInt: () => ROOM_CODE_ALPHABET.length,
  };
  const generator = new RandomRoomCodeGenerator(invalidSource);

  assert.throws(() => generator.generateCandidate(), RangeError);
});

test("production IdGenerator 출력은 shared branded identifier schema와 호환된다", () => {
  const generator = new NodeCryptoIdGenerator();
  const generated = [
    { schema: RoomIdSchema, value: generator.generateRoomId() },
    { schema: PlayerIdSchema, value: generator.generatePlayerId() },
    { schema: GameIdSchema, value: generator.generateGameId() },
    { schema: TurnIdSchema, value: generator.generateTurnId() },
    { schema: TileIdSchema, value: generator.generateTileId() },
  ];

  for (const { schema, value } of generated) {
    assert.equal(safeParse(schema, value).success, true);
  }

  assert.equal(new Set(generated.map(({ value }) => value)).size, 5);
});

test("FakeIdGenerator는 identifier 종류별 deterministic 값을 만든다", () => {
  const generator = new FakeIdGenerator();

  assert.equal(generator.generateRoomId(), "test-room-1");
  assert.equal(generator.generateRoomId(), "test-room-2");
  assert.equal(generator.generatePlayerId(), "test-player-1");
  assert.equal(generator.generateGameId(), "test-game-1");
  assert.equal(generator.generateTurnId(), "test-turn-1");
  assert.equal(generator.generateTileId(), "test-tile-1");
});

test("SessionTokenIssuer는 opaque token과 deterministic hash를 분리한다", () => {
  const issuer = new NodeCryptoSessionTokenIssuer();
  const first = issuer.issue();
  const second = issuer.issue();

  assert.notEqual(first.rawToken, second.rawToken);
  assert.match(first.rawToken, /^[A-Za-z0-9_-]{43}$/u);
  assert.match(first.verificationData.digestHex, /^[0-9a-f]{64}$/u);
  assert.notEqual(first.rawToken, first.verificationData.digestHex);
  assert.deepEqual(
    issuer.deriveVerificationData(first.rawToken),
    first.verificationData,
  );
  assert.equal(issuer.verify(first.rawToken, first.verificationData), true);
  assert.equal(issuer.verify(second.rawToken, first.verificationData), false);
});

test("SessionTokenIssuer는 malformed verification data를 안전하게 거절한다", () => {
  const issuer = new NodeCryptoSessionTokenIssuer();
  const issued = issuer.issue();

  assert.equal(
    issuer.verify(issued.rawToken, {
      algorithm: "SHA-256",
      digestHex: "not-a-sha256-digest",
    }),
    false,
  );
});
