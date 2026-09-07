import assert from "node:assert/strict";
import test from "node:test";

import {
  GameRevisionSchema,
  type GameRevision,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  FisherYatesRandomIndexError,
  shuffleFrozen,
} from "./domain/frozen-fisher-yates.js";
import { nextGameRevision } from "./domain/game-revision.js";
import type { RandomSource } from "./ports/system.js";

class RecordingRandomSource implements RandomSource {
  readonly calls: number[] = [];
  #index = 0;

  constructor(private readonly values: readonly number[]) {}

  nextInt(maxExclusive: number): number {
    this.calls.push(maxExclusive);
    const value = this.values[this.#index];
    if (value === undefined) {
      throw new Error("Random sequence exhausted.");
    }
    this.#index += 1;
    return value;
  }
}

function revision(value: number): GameRevision {
  return parse(GameRevisionSchema, value);
}

test("nextGameRevision은 canonical numeric successor만 반환한다", () => {
  assert.equal(nextGameRevision(revision(0)), 1);
  const current = revision(41);
  assert.equal(nextGameRevision(current), 42);
  assert.equal(nextGameRevision(current), 42);
  assert.equal(current, 41);
});

test("nextGameRevision은 schema 범위를 넘는 successor를 거절한다", () => {
  assert.throws(() => nextGameRevision(revision(Number.MAX_SAFE_INTEGER)));
});

test("shuffleFrozen은 scripted RNG 순서와 Fisher-Yates 호출 횟수를 보존한다", () => {
  const input = Object.freeze(["A", "B", "C", "D"]);
  const randomSource = new RecordingRandomSource([1, 0, 1]);

  const result = shuffleFrozen(input, randomSource);

  assert.deepEqual(result, ["C", "D", "A", "B"]);
  assert.deepEqual(randomSource.calls, [4, 3, 2]);
  assert.deepEqual(input, ["A", "B", "C", "D"]);
  assert.notEqual(result, input);
  assert.ok(Object.isFrozen(result));
  assert.deepEqual([...result].sort(), [...input].sort());
});

test("shuffleFrozen은 empty/single input에도 detached frozen output을 만든다", () => {
  for (const input of [Object.freeze([]), Object.freeze(["only"])]) {
    const randomSource = new RecordingRandomSource([]);
    const result = shuffleFrozen(input, randomSource);

    assert.deepEqual(result, input);
    assert.notEqual(result, input);
    assert.ok(Object.isFrozen(result));
    assert.deepEqual(randomSource.calls, []);
  }
});

test("shuffleFrozen은 contract 밖 RNG index를 중립 RangeError로 거절한다", () => {
  for (const invalidIndex of [-1, 2, 0.5]) {
    assert.throws(
      () =>
        shuffleFrozen(["A", "B"], {
          nextInt: () => invalidIndex,
        }),
      (error: unknown) =>
        error instanceof FisherYatesRandomIndexError &&
        error instanceof RangeError &&
        error.message ===
          "RandomSource returned an index outside the Fisher-Yates range.",
    );
  }
});
