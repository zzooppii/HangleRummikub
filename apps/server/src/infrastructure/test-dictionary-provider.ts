import type {
  DictionaryLookupResult,
  DictionaryProvider,
} from "../ports/system.js";

export const TEST_DICTIONARY_VERSION = "test-dictionary-v1";

export const TEST_DICTIONARY_WORDS: readonly string[] = Object.freeze([
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
]);

export type TestDictionaryFixture = Readonly<{
  dictionaryVersion: string;
  words: readonly string[];
}>;

export const TEST_DICTIONARY_FIXTURE: TestDictionaryFixture = Object.freeze({
  dictionaryVersion: TEST_DICTIONARY_VERSION,
  words: TEST_DICTIONARY_WORDS,
});

const ALLOWED_RESULT: DictionaryLookupResult = Object.freeze({
  status: "ALLOWED",
});

const NOT_ALLOWED_RESULT: DictionaryLookupResult = Object.freeze({
  status: "NOT_ALLOWED",
});

function validateFixture(fixture: TestDictionaryFixture): void {
  if (fixture.dictionaryVersion.trim().length === 0) {
    throw new TypeError("Test dictionary version must not be empty.");
  }

  if (fixture.words.length === 0) {
    throw new TypeError("Test dictionary fixture must contain at least one word.");
  }

  const canonicalWords = new Set<string>();

  for (const [index, word] of fixture.words.entries()) {
    if (word.length === 0) {
      throw new TypeError(
        `Test dictionary word at index ${index} must not be empty.`,
      );
    }

    const canonicalWord = word.normalize("NFC");
    if (word !== canonicalWord) {
      throw new TypeError(
        `Test dictionary word at index ${index} must already be NFC.`,
      );
    }

    if (canonicalWords.has(canonicalWord)) {
      throw new TypeError(
        `Test dictionary contains a duplicate word at index ${index}.`,
      );
    }

    canonicalWords.add(canonicalWord);
  }
}

export class TestDictionaryProvider implements DictionaryProvider {
  readonly #dictionaryVersion: string;
  readonly #canonicalWords: ReadonlySet<string>;

  constructor(fixture: TestDictionaryFixture = TEST_DICTIONARY_FIXTURE) {
    validateFixture(fixture);
    this.#dictionaryVersion = fixture.dictionaryVersion;
    this.#canonicalWords = new Set(fixture.words);
    Object.freeze(this);
  }

  get dictionaryVersion(): string {
    return this.#dictionaryVersion;
  }

  lookup(word: string): Promise<DictionaryLookupResult> {
    const canonicalWord = word.normalize("NFC");

    return Promise.resolve(
      this.#canonicalWords.has(canonicalWord)
        ? ALLOWED_RESULT
        : NOT_ALLOWED_RESULT,
    );
  }
}
