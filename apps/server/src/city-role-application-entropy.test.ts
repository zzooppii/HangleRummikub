import assert from "node:assert/strict";
import test from "node:test";
import { TurnIdSchema } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { CityRoleEntropySource, cityDomainEntropy, createCityEntropySeed } from "./games/city-role/application/city-role-entropy.js";
import { parseBuildingCardId } from "./games/city-role/domain/identity.js";
import { CITY_ROLE_IDS } from "./games/city-role/domain/role.js";

const SEED = "0123456789abcdef".repeat(4);

test("CITY application entropy seed uses exactly eight injected uint32 draws", () => {
  const calls: number[] = [];
  const seed = createCityEntropySeed({ nextInt(max) { calls.push(max); return calls.length - 1; } });
  assert.equal(seed, Array.from({ length: 8 }, (_, index) => index.toString(16).padStart(8, "0")).join(""));
  assert.deepEqual(calls, Array(8).fill(0x1_0000_0000));
});

test("CITY application entropy seed rejects malformed injected random values", () => {
  for (const value of [-1, 0.5, NaN, Infinity, 0x1_0000_0000]) {
    assert.throws(() => createCityEntropySeed({ nextInt() { return value; } }));
  }
});

test("CITY transactional entropy resumes the exact stream from the persisted counter", () => {
  const first = new CityRoleEntropySource(SEED, 0);
  const same = new CityRoleEntropySource(SEED, 0);
  const bounds = [8, 7, 6, 5, 4, 3, 2, 59, 0x1_0000_0000, 3];
  assert.deepEqual(bounds.map(bound => first.nextInt(bound)), bounds.map(bound => same.nextInt(bound)));
  assert.equal(first.counter, same.counter);
  const resumed = new CityRoleEntropySource(SEED, first.counter);
  assert.deepEqual(bounds.map(bound => first.nextInt(bound)), bounds.map(bound => resumed.nextInt(bound)));
});

test("CITY entropy attempt does not mutate a stored checkpoint when abandoned", () => {
  const stored = Object.freeze({ entropySeed: SEED, entropyCounter: 0 });
  const failedAttempt = new CityRoleEntropySource(stored.entropySeed, stored.entropyCounter);
  const chosen = failedAttempt.nextInt(7);
  assert.ok(failedAttempt.counter > stored.entropyCounter);
  assert.equal(stored.entropyCounter, 0);
  const retry = new CityRoleEntropySource(stored.entropySeed, stored.entropyCounter);
  assert.equal(retry.nextInt(7), chosen);
  assert.equal(retry.counter, failedAttempt.counter);
});

test("CITY entropy range validation is bounded and every accepted index is in range", () => {
  const random = new CityRoleEntropySource(SEED, 0);
  for (const bound of [1, 2, 3, 8, 60, 65537, 0x8000_0001, 0x1_0000_0000]) {
    for (let index = 0; index < 100; index += 1) {
      const value = random.nextInt(bound);
      assert.ok(Number.isInteger(value) && value >= 0 && value < bound);
    }
  }
  const before = random.counter;
  for (const bound of [0, -1, 0.5, NaN, Infinity, 0x1_0000_0001]) assert.throws(() => random.nextInt(bound));
  assert.equal(random.counter, before);
});

test("CITY entropy rejects malformed checkpoints and counter exhaustion", () => {
  for (const seed of ["", "0".repeat(63), "g".repeat(64), "A".repeat(64)]) assert.throws(() => new CityRoleEntropySource(seed, 0));
  for (const counter of [-1, 0.5, NaN, Infinity]) assert.throws(() => new CityRoleEntropySource(SEED, counter));
  assert.throws(() => new CityRoleEntropySource(SEED, Number.MAX_SAFE_INTEGER).nextInt(2));
});

test("CITY entropy rejects non-string seed values instead of coercing arrays or objects", () => {
  for (const seed of [[SEED], { toString: () => SEED }, null, 123]) {
    // Exercise malformed runtime input without pretending it is a typed seed.
    assert.throws(() => Reflect.construct(CityRoleEntropySource, [seed, 0]), /Invalid CITY entropy checkpoint/u);
  }
});

test("CITY optional domain entropy is lazy and caches each role/discard permutation", () => {
  const random = new CityRoleEntropySource(SEED, 0);
  let generatedIds = 0;
  const discard = ["opaque-a", "opaque-b", "opaque-c"].map(parseBuildingCardId);
  const entropy = cityDomainEntropy({ generateTurnId() { generatedIds += 1; return parse(TurnIdSchema, `action-${generatedIds}`); } }, random, discard);
  assert.equal(Object.isFrozen(entropy), true);
  assert.equal(random.counter, 0);
  assert.equal(generatedIds, 0);
  assert.equal(entropy.nextActionId, entropy.nextActionId);
  assert.equal(generatedIds, 1);
  assert.equal(random.counter, 0);
  const roles = entropy.nextRoleOrder;
  const afterRoles = random.counter;
  assert.deepEqual([...roles ?? []].sort(), [...CITY_ROLE_IDS].sort());
  assert.ok(afterRoles >= 7);
  assert.equal(entropy.nextRoleOrder, roles);
  assert.equal(random.counter, afterRoles);
  const cards = entropy.discardOrder;
  const afterCards = random.counter;
  assert.deepEqual([...cards ?? []].sort(), [...discard].sort());
  assert.ok(afterCards >= afterRoles + 2);
  assert.equal(entropy.discardOrder, cards);
  assert.equal(random.counter, afterCards);
  assert.deepEqual(discard, ["opaque-a", "opaque-b", "opaque-c"]);
});

test("CITY empty discard permutation consumes no random values or action identity", () => {
  const random = new CityRoleEntropySource(SEED, 0);
  const entropy = cityDomainEntropy({ generateTurnId() { throw new Error("Unused action ID must not be requested."); } }, random, []);
  assert.deepEqual(entropy.discardOrder, []);
  assert.equal(random.counter, 0);
});
