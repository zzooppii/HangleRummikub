import assert from "node:assert/strict";
import test from "node:test";

import {
  TileIdSchema,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  composeWord,
  type AssignedJamoComponent,
  type SyllableCompositionInput,
} from "../domain/hangul/composition.js";
import type {
  DictionaryLookupResult,
  DictionaryProvider,
  DictionaryUnavailableReason,
} from "../ports/system.js";
import {
  TEST_DICTIONARY_FIXTURE,
  TEST_DICTIONARY_VERSION,
  TEST_DICTIONARY_WORDS,
  TestDictionaryProvider,
} from "./test-dictionary-provider.js";

const EXPECTED_DOCUMENT_WORDS = [
  "가방",
  "가위",
  "개구리",
  "고구마",
  "고양이",
  "구름",
  "나무",
  "나비",
  "다람쥐",
  "달걀",
  "도토리",
  "바다",
  "바나나",
  "사과",
  "사자",
  "수박",
  "시계",
  "안경",
  "연필",
  "우산",
  "인형",
  "자동차",
  "장갑",
  "학교",
  "가다",
  "걷다",
  "달리다",
  "느리다",
  "하얗다",
  "아주",
] as const;

class FixedResultDictionaryProvider implements DictionaryProvider {
  readonly dictionaryVersion = "test-failure-contract-v1";

  constructor(private readonly result: DictionaryLookupResult) {}

  lookup(_word: string): Promise<DictionaryLookupResult> {
    return Promise.resolve(this.result);
  }
}

function tileId(value: string): TileId {
  return parse(TileIdSchema, value);
}

function component(
  id: string,
  assignedSymbol: string,
): AssignedJamoComponent {
  return { tileId: tileId(id), assignedSymbol };
}

function syllable(
  idPrefix: string,
  choseong: string,
  jungseong: string,
  jongseong?: string,
): SyllableCompositionInput {
  return {
    choseong: [component(`${idPrefix}-initial`, choseong)],
    jungseong: [component(`${idPrefix}-medial`, jungseong)],
    jongseong:
      jongseong === undefined
        ? []
        : [component(`${idPrefix}-final`, jongseong)],
  };
}

function unavailableReason(
  result: DictionaryLookupResult,
): DictionaryUnavailableReason {
  if (result.status !== "UNAVAILABLE") {
    assert.fail(`expected UNAVAILABLE, received ${result.status}`);
  }

  return result.reason;
}

test("Phase 9 fixture는 문서의 30개 후보와 version/integrity가 일치한다", () => {
  assert.equal(TEST_DICTIONARY_VERSION, "test-dictionary-v1");
  assert.equal(TEST_DICTIONARY_FIXTURE.dictionaryVersion, "test-dictionary-v1");
  assert.equal(TEST_DICTIONARY_WORDS.length, 30);
  assert.deepEqual(TEST_DICTIONARY_WORDS, EXPECTED_DOCUMENT_WORDS);
  assert.equal(Object.isFrozen(TEST_DICTIONARY_WORDS), true);
  assert.equal(Object.isFrozen(TEST_DICTIONARY_FIXTURE), true);

  const normalizedWords = TEST_DICTIONARY_WORDS.map((word) =>
    word.normalize("NFC"),
  );
  assert.equal(TEST_DICTIONARY_WORDS.every((word) => word.length > 0), true);
  assert.deepEqual(normalizedWords, TEST_DICTIONARY_WORDS);
  assert.equal(new Set(normalizedWords).size, 30);
});

test("malformed fixture는 조용히 보정하거나 중복 제거하지 않고 거절한다", () => {
  const knownWord = "학교";

  assert.throws(
    () =>
      new TestDictionaryProvider({
        dictionaryVersion: "",
        words: [knownWord],
      }),
    /version must not be empty/u,
  );
  assert.throws(
    () =>
      new TestDictionaryProvider({
        dictionaryVersion: "test-empty-list-v1",
        words: [],
      }),
    /at least one word/u,
  );
  assert.throws(
    () =>
      new TestDictionaryProvider({
        dictionaryVersion: "test-empty-word-v1",
        words: [""],
      }),
    /must not be empty/u,
  );
  assert.throws(
    () =>
      new TestDictionaryProvider({
        dictionaryVersion: "test-nfd-word-v1",
        words: [knownWord.normalize("NFD")],
      }),
    /must already be NFC/u,
  );
  assert.throws(
    () =>
      new TestDictionaryProvider({
        dictionaryVersion: "test-duplicate-word-v1",
        words: [knownWord, knownWord],
      }),
    /duplicate word/u,
  );
});

test("문서에서 승인한 fixture 30개 전체를 ALLOWED로 판정한다", async () => {
  const provider = new TestDictionaryProvider();

  for (const word of EXPECTED_DOCUMENT_WORDS) {
    assert.deepEqual(await provider.lookup(word), { status: "ALLOWED" });
  }
});

test("fixture에 없는 문자열은 한국어 어휘 주장 없이 NOT_ALLOWED로 판정한다", async () => {
  const provider = new TestDictionaryProvider();
  const fixtureMisses = ["한글", "테스트", "사과나무", "가"];

  for (const word of fixtureMisses) {
    assert.deepEqual(await provider.lookup(word), { status: "NOT_ALLOWED" });
  }
});

test("lookup은 NFC와 NFD equivalent input을 같은 fixture key로 판정한다", async () => {
  const provider = new TestDictionaryProvider();
  const knownWord = "학교";

  assert.deepEqual(await provider.lookup(knownWord), { status: "ALLOWED" });
  assert.deepEqual(await provider.lookup(knownWord.normalize("NFD")), {
    status: "ALLOWED",
  });
});

test("lookup은 trim이나 내부 whitespace 제거를 하지 않는다", async () => {
  const provider = new TestDictionaryProvider();

  for (const word of [" 학교", "학교 ", "학 교"]) {
    assert.deepEqual(await provider.lookup(word), { status: "NOT_ALLOWED" });
  }
});

test("provider는 fixture를 복사하고 instance 사이에서 deterministic하다", async () => {
  const mutableFixture = {
    dictionaryVersion: "test-copy-isolation-v1",
    words: ["사과"],
  };
  const firstProvider = new TestDictionaryProvider(mutableFixture);
  const secondProvider = new TestDictionaryProvider(mutableFixture);
  const expected = await firstProvider.lookup("사과");

  mutableFixture.dictionaryVersion = "mutated-version";
  mutableFixture.words[0] = "학교";
  mutableFixture.words.push("바다");

  assert.deepEqual(await firstProvider.lookup("사과"), expected);
  assert.deepEqual(await firstProvider.lookup("사과"), expected);
  assert.deepEqual(await secondProvider.lookup("사과"), expected);
  assert.deepEqual(await firstProvider.lookup("학교"), {
    status: "NOT_ALLOWED",
  });
  assert.equal(firstProvider.dictionaryVersion, "test-copy-isolation-v1");
  assert.equal(secondProvider.dictionaryVersion, "test-copy-isolation-v1");
  assert.equal(Object.isFrozen(firstProvider), true);
  assert.equal(
    Reflect.set(firstProvider, "dictionaryVersion", "other-version"),
    false,
  );
});

test("UNAVAILABLE의 ERROR와 TIMEOUT을 NOT_ALLOWED와 구분해 narrowing한다", async () => {
  const reasons: readonly DictionaryUnavailableReason[] = ["ERROR", "TIMEOUT"];

  for (const reason of reasons) {
    const provider = new FixedResultDictionaryProvider({
      status: "UNAVAILABLE",
      reason,
    });
    assert.equal(unavailableReason(await provider.lookup("학교")), reason);
  }

  const fixtureMiss = await new TestDictionaryProvider().lookup("한글");
  assert.equal(fixtureMiss.status, "NOT_ALLOWED");
});

test("Phase 8 composeWord의 NFC 결과를 별도 조합 없이 lookup한다", async () => {
  const composed = composeWord({
    syllables: [
      syllable("dictionary-boundary-hak", "ㅎ", "ㅏ", "ㄱ"),
      syllable("dictionary-boundary-gyo", "ㄱ", "ㅛ"),
    ],
  });

  if (!composed.ok) {
    assert.fail(`expected composition success, received ${composed.error.code}`);
  }

  assert.equal(composed.value.word, "학교");
  assert.equal(composed.value.word, composed.value.word.normalize("NFC"));
  assert.deepEqual(await new TestDictionaryProvider().lookup(composed.value.word), {
    status: "ALLOWED",
  });
});

test("한 음절 입력은 길이가 아니라 fixture membership으로만 판정한다", async () => {
  assert.deepEqual(await new TestDictionaryProvider().lookup("가"), {
    status: "NOT_ALLOWED",
  });
});
