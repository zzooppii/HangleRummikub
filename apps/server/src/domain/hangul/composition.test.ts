import assert from "node:assert/strict";
import test from "node:test";

import {
  TileIdSchema,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  composeSyllable,
  composeWord,
  type AssignedJamoComponent,
  type HangulCompositionError,
  type HangulCompositionResult,
  type SyllableCompositionInput,
  type WordCompositionInput,
} from "./composition.js";

function tileId(value: string): TileId {
  return parse(TileIdSchema, value);
}

function component(
  id: string,
  assignedSymbol: string,
): AssignedJamoComponent {
  return { tileId: tileId(id), assignedSymbol };
}

function components(
  idPrefix: string,
  assignedSymbols: readonly string[],
): readonly AssignedJamoComponent[] {
  return assignedSymbols.map((assignedSymbol, index) =>
    component(`${idPrefix}-${index}`, assignedSymbol),
  );
}

function syllableInput(
  idPrefix: string,
  choseong: string,
  jungseong: readonly string[],
  jongseong: readonly string[] = [],
): SyllableCompositionInput {
  return {
    choseong: components(`${idPrefix}-initial`, [choseong]),
    jungseong: components(`${idPrefix}-medial`, jungseong),
    jongseong: components(`${idPrefix}-final`, jongseong),
  };
}

function deeplyFrozenSyllable(
  input: SyllableCompositionInput,
): SyllableCompositionInput {
  const freezeComponents = (
    values: readonly AssignedJamoComponent[],
  ): readonly AssignedJamoComponent[] =>
    Object.freeze(
      values.map(({ tileId: id, assignedSymbol }) =>
        Object.freeze({ tileId: id, assignedSymbol }),
      ),
    );

  return Object.freeze({
    choseong: freezeComponents(input.choseong),
    jungseong: freezeComponents(input.jungseong),
    jongseong: freezeComponents(input.jongseong),
  });
}

function deeplyFrozenWord(
  syllables: readonly SyllableCompositionInput[],
): WordCompositionInput {
  return Object.freeze({
    syllables: Object.freeze(syllables.map(deeplyFrozenSyllable)),
  });
}

function expectSuccess<T>(result: HangulCompositionResult<T>): T {
  if (!result.ok) {
    assert.fail(`expected success, received ${result.error.code}`);
  }

  return result.value;
}

function expectError<T>(
  result: HangulCompositionResult<T>,
  expected: HangulCompositionError,
): void {
  if (result.ok) {
    assert.fail("expected composition failure");
  }

  assert.deepEqual(result.error, expected);
}

test("19개 modern choseong을 Unicode L 순서와 일치하게 조합한다", () => {
  const cases = [
    { symbol: "ㄱ", expected: "가" },
    { symbol: "ㄲ", expected: "까" },
    { symbol: "ㄴ", expected: "나" },
    { symbol: "ㄷ", expected: "다" },
    { symbol: "ㄸ", expected: "따" },
    { symbol: "ㄹ", expected: "라" },
    { symbol: "ㅁ", expected: "마" },
    { symbol: "ㅂ", expected: "바" },
    { symbol: "ㅃ", expected: "빠" },
    { symbol: "ㅅ", expected: "사" },
    { symbol: "ㅆ", expected: "싸" },
    { symbol: "ㅇ", expected: "아" },
    { symbol: "ㅈ", expected: "자" },
    { symbol: "ㅉ", expected: "짜" },
    { symbol: "ㅊ", expected: "차" },
    { symbol: "ㅋ", expected: "카" },
    { symbol: "ㅌ", expected: "타" },
    { symbol: "ㅍ", expected: "파" },
    { symbol: "ㅎ", expected: "하" },
  ];

  for (const [index, testCase] of cases.entries()) {
    const value = expectSuccess(
      composeSyllable(
        syllableInput(`choseong-${index}`, testCase.symbol, ["ㅏ"]),
      ),
    );

    assert.deepEqual(value, {
      choseong: testCase.symbol,
      jungseong: "ㅏ",
      jongseong: null,
      syllable: testCase.expected,
    });
    assert.equal(value.syllable, value.syllable.normalize("NFC"));
  }
});

test("기본 literal 가, 나, 한, 글, 까, 똥을 명시된 role로 조합한다", () => {
  const cases = [
    { choseong: "ㄱ", jungseong: ["ㅏ"], jongseong: [], expected: "가" },
    { choseong: "ㄴ", jungseong: ["ㅏ"], jongseong: [], expected: "나" },
    {
      choseong: "ㅎ",
      jungseong: ["ㅏ"],
      jongseong: ["ㄴ"],
      expected: "한",
    },
    {
      choseong: "ㄱ",
      jungseong: ["ㅡ"],
      jongseong: ["ㄹ"],
      expected: "글",
    },
    { choseong: "ㄲ", jungseong: ["ㅏ"], jongseong: [], expected: "까" },
    {
      choseong: "ㄸ",
      jungseong: ["ㅗ"],
      jongseong: ["ㅇ"],
      expected: "똥",
    },
  ];

  for (const [index, testCase] of cases.entries()) {
    const value = expectSuccess(
      composeSyllable(
        syllableInput(
          `basic-literal-${index}`,
          testCase.choseong,
          testCase.jungseong,
          testCase.jongseong,
        ),
      ),
    );

    assert.equal(value.syllable, testCase.expected);
  }
});

test("21개 modern jungseong을 exact physical component sequence로 조합한다", () => {
  const cases = [
    { components: ["ㅏ"], symbol: "ㅏ", expected: "가" },
    { components: ["ㅐ"], symbol: "ㅐ", expected: "개" },
    { components: ["ㅑ"], symbol: "ㅑ", expected: "갸" },
    { components: ["ㅒ"], symbol: "ㅒ", expected: "걔" },
    { components: ["ㅓ"], symbol: "ㅓ", expected: "거" },
    { components: ["ㅔ"], symbol: "ㅔ", expected: "게" },
    { components: ["ㅕ"], symbol: "ㅕ", expected: "겨" },
    { components: ["ㅖ"], symbol: "ㅖ", expected: "계" },
    { components: ["ㅗ"], symbol: "ㅗ", expected: "고" },
    { components: ["ㅗ", "ㅏ"], symbol: "ㅘ", expected: "과" },
    { components: ["ㅗ", "ㅐ"], symbol: "ㅙ", expected: "괘" },
    { components: ["ㅗ", "ㅣ"], symbol: "ㅚ", expected: "괴" },
    { components: ["ㅛ"], symbol: "ㅛ", expected: "교" },
    { components: ["ㅜ"], symbol: "ㅜ", expected: "구" },
    { components: ["ㅜ", "ㅓ"], symbol: "ㅝ", expected: "궈" },
    { components: ["ㅜ", "ㅔ"], symbol: "ㅞ", expected: "궤" },
    { components: ["ㅜ", "ㅣ"], symbol: "ㅟ", expected: "귀" },
    { components: ["ㅠ"], symbol: "ㅠ", expected: "규" },
    { components: ["ㅡ"], symbol: "ㅡ", expected: "그" },
    { components: ["ㅡ", "ㅣ"], symbol: "ㅢ", expected: "긔" },
    { components: ["ㅣ"], symbol: "ㅣ", expected: "기" },
  ];

  for (const [index, testCase] of cases.entries()) {
    const value = expectSuccess(
      composeSyllable(
        syllableInput(`jungseong-${index}`, "ㄱ", testCase.components),
      ),
    );

    assert.equal(value.jungseong, testCase.symbol);
    assert.equal(value.syllable, testCase.expected);
    assert.equal(value.syllable, value.syllable.normalize("NFC"));
  }
});

test("16개 single jongseong을 modern Unicode T 위치에 맞게 조합한다", () => {
  const cases = [
    { symbol: "ㄱ", expected: "각" },
    { symbol: "ㄲ", expected: "갂" },
    { symbol: "ㄴ", expected: "간" },
    { symbol: "ㄷ", expected: "갇" },
    { symbol: "ㄹ", expected: "갈" },
    { symbol: "ㅁ", expected: "감" },
    { symbol: "ㅂ", expected: "갑" },
    { symbol: "ㅅ", expected: "갓" },
    { symbol: "ㅆ", expected: "갔" },
    { symbol: "ㅇ", expected: "강" },
    { symbol: "ㅈ", expected: "갖" },
    { symbol: "ㅊ", expected: "갗" },
    { symbol: "ㅋ", expected: "갘" },
    { symbol: "ㅌ", expected: "같" },
    { symbol: "ㅍ", expected: "갚" },
    { symbol: "ㅎ", expected: "갛" },
  ];

  for (const [index, testCase] of cases.entries()) {
    const value = expectSuccess(
      composeSyllable(
        syllableInput(`single-final-${index}`, "ㄱ", ["ㅏ"], [
          testCase.symbol,
        ]),
      ),
    );

    assert.equal(value.jongseong, testCase.symbol);
    assert.equal(value.syllable, testCase.expected);
    assert.equal(value.syllable, value.syllable.normalize("NFC"));
  }
});

test("11개 cluster jongseong만 exact ordered two-position sequence로 조합한다", () => {
  const cases = [
    {
      choseong: "ㄴ",
      jungseong: ["ㅓ"],
      components: ["ㄱ", "ㅅ"],
      symbol: "ㄳ",
      expected: "넋",
    },
    {
      choseong: "ㅇ",
      jungseong: ["ㅏ"],
      components: ["ㄴ", "ㅈ"],
      symbol: "ㄵ",
      expected: "앉",
    },
    {
      choseong: "ㅇ",
      jungseong: ["ㅏ"],
      components: ["ㄴ", "ㅎ"],
      symbol: "ㄶ",
      expected: "않",
    },
    {
      choseong: "ㅇ",
      jungseong: ["ㅣ"],
      components: ["ㄹ", "ㄱ"],
      symbol: "ㄺ",
      expected: "읽",
    },
    {
      choseong: "ㅅ",
      jungseong: ["ㅏ"],
      components: ["ㄹ", "ㅁ"],
      symbol: "ㄻ",
      expected: "삶",
    },
    {
      choseong: "ㅂ",
      jungseong: ["ㅏ"],
      components: ["ㄹ", "ㅂ"],
      symbol: "ㄼ",
      expected: "밟",
    },
    {
      choseong: "ㄱ",
      jungseong: ["ㅗ"],
      components: ["ㄹ", "ㅅ"],
      symbol: "ㄽ",
      expected: "곬",
    },
    {
      choseong: "ㅎ",
      jungseong: ["ㅏ"],
      components: ["ㄹ", "ㅌ"],
      symbol: "ㄾ",
      expected: "핥",
    },
    {
      choseong: "ㅇ",
      jungseong: ["ㅡ"],
      components: ["ㄹ", "ㅍ"],
      symbol: "ㄿ",
      expected: "읊",
    },
    {
      choseong: "ㅇ",
      jungseong: ["ㅗ"],
      components: ["ㄹ", "ㅎ"],
      symbol: "ㅀ",
      expected: "옳",
    },
    {
      choseong: "ㄱ",
      jungseong: ["ㅏ"],
      components: ["ㅂ", "ㅅ"],
      symbol: "ㅄ",
      expected: "값",
    },
  ];

  for (const [index, testCase] of cases.entries()) {
    const value = expectSuccess(
      composeSyllable(
        syllableInput(
          `cluster-final-${index}`,
          testCase.choseong,
          testCase.jungseong,
          testCase.components,
        ),
      ),
    );

    assert.equal(value.jongseong, testCase.symbol);
    assert.equal(value.syllable, testCase.expected);
    assert.equal(value.syllable, value.syllable.normalize("NFC"));
  }
});

test("jongseong이 없는 syllable도 valid하다", () => {
  const value = expectSuccess(
    composeSyllable(syllableInput("no-final", "ㄴ", ["ㅏ"])),
  );

  assert.deepEqual(value, {
    choseong: "ㄴ",
    jungseong: "ㅏ",
    jongseong: null,
    syllable: "나",
  });
});

test("dedicated double consonant 한 자리는 허용하고 ordinary consonant 두 자리는 거절한다", () => {
  const dedicated = expectSuccess(
    composeSyllable(syllableInput("dedicated-double", "ㄲ", ["ㅏ"])),
  );
  assert.equal(dedicated.syllable, "까");

  const twoOrdinary: SyllableCompositionInput = {
    choseong: components("two-ordinary-initial", ["ㄱ", "ㄱ"]),
    jungseong: components("two-ordinary-medial", ["ㅏ"]),
    jongseong: [],
  };
  expectError(composeSyllable(twoOrdinary), {
    code: "INVALID_CHOSEONG",
    syllableIndex: 0,
  });
});

test("choseong은 정확히 한 개의 modern choseong component를 요구한다", () => {
  const cases: readonly (readonly AssignedJamoComponent[])[] = [
    [],
    components("initial-many", ["ㄱ", "ㄴ"]),
    components("initial-vowel", ["ㅏ"]),
    components("initial-conjoining", ["ᄀ"]),
    components("initial-unknown", ["A"]),
  ];

  for (const [index, choseong] of cases.entries()) {
    expectError(
      composeSyllable({
        choseong,
        jungseong: components(`invalid-initial-medial-${index}`, ["ㅏ"]),
        jongseong: [],
      }),
      { code: "INVALID_CHOSEONG", syllableIndex: 0 },
    );
  }
});

test("jungseong은 single Tile 또는 허용된 ordered compound sequence만 받는다", () => {
  const cases: readonly (readonly string[])[] = [
    [],
    ["ㅘ"],
    ["ㅙ"],
    ["ㅚ"],
    ["ㅝ"],
    ["ㅞ"],
    ["ㅟ"],
    ["ㅢ"],
    ["ㅏ", "ㅗ"],
    ["ㅑ", "ㅣ"],
    ["ㅗ", "ㅓ"],
    ["ㅓ", "ㅣ"],
    ["ㅣ", "ㅡ"],
    ["ㅗ", "ㅏ", "ㅣ"],
    ["ㄱ"],
    ["ᅡ"],
  ];

  for (const [index, jungseong] of cases.entries()) {
    expectError(
      composeSyllable(
        syllableInput(`invalid-medial-${index}`, "ㄱ", jungseong),
      ),
      { code: "INVALID_JUNGSEONG", syllableIndex: 0 },
    );
  }
});

test("jongseong은 no-final, 허용 single 또는 exact cluster 외의 형식을 거절한다", () => {
  const cases: readonly (readonly string[])[] = [
    ["ㄸ"],
    ["ㅃ"],
    ["ㅉ"],
    ["ㄳ"],
    ["ㄵ"],
    ["ㄶ"],
    ["ㄺ"],
    ["ㄻ"],
    ["ㄼ"],
    ["ㄽ"],
    ["ㄾ"],
    ["ㄿ"],
    ["ㅀ"],
    ["ㅄ"],
    ["ㄱ", "ㄴ"],
    ["ㄴ", "ㄱ"],
    ["ㅂ", "ㄴ"],
    ["ㅅ", "ㄱ"],
    ["ㄱ", "ㅅ", "ㅅ"],
    ["ㅏ"],
    ["ᆨ"],
  ];

  for (const [index, jongseong] of cases.entries()) {
    expectError(
      composeSyllable(
        syllableInput(`invalid-final-${index}`, "ㄱ", ["ㅏ"], jongseong),
      ),
      { code: "INVALID_JONGSEONG", syllableIndex: 0 },
    );
  }
});

test("한 syllable 안에서 같은 physical tileId를 두 role에 재사용할 수 없다", () => {
  const reused = component("same-physical-tile", "ㄱ");
  const input: SyllableCompositionInput = {
    choseong: [reused],
    jungseong: components("duplicate-within-medial", ["ㅏ"]),
    jongseong: [reused],
  };

  expectError(composeSyllable(input), {
    code: "DUPLICATE_TILE_REFERENCE",
    syllableIndex: 0,
  });
});

test("복합모음이나 겹받침의 두 position에 같은 physical tileId를 재사용할 수 없다", () => {
  const compoundVowelTile = tileId("same-compound-vowel-tile");
  const compoundVowel: SyllableCompositionInput = {
    choseong: components("duplicate-compound-initial", ["ㄱ"]),
    jungseong: [
      { tileId: compoundVowelTile, assignedSymbol: "ㅗ" },
      { tileId: compoundVowelTile, assignedSymbol: "ㅏ" },
    ],
    jongseong: [],
  };
  expectError(composeSyllable(compoundVowel), {
    code: "DUPLICATE_TILE_REFERENCE",
    syllableIndex: 0,
  });

  const finalClusterTile = tileId("same-final-cluster-tile");
  const finalCluster: SyllableCompositionInput = {
    choseong: components("duplicate-cluster-initial", ["ㄱ"]),
    jungseong: components("duplicate-cluster-medial", ["ㅏ"]),
    jongseong: [
      { tileId: finalClusterTile, assignedSymbol: "ㄱ" },
      { tileId: finalClusterTile, assignedSymbol: "ㅅ" },
    ],
  };
  expectError(composeSyllable(finalCluster), {
    code: "DUPLICATE_TILE_REFERENCE",
    syllableIndex: 0,
  });
});

test("여러 syllable 사이에서도 같은 physical tileId를 재사용할 수 없다", () => {
  const reused = component("same-word-tile", "ㄱ");
  const input = {
    syllables: [
      {
        choseong: [reused],
        jungseong: components("duplicate-word-first-medial", ["ㅏ"]),
        jongseong: [],
      },
      {
        choseong: [reused],
        jungseong: components("duplicate-word-second-medial", ["ㅣ"]),
        jongseong: [],
      },
    ],
  };

  expectError(composeWord(input), {
    code: "DUPLICATE_TILE_REFERENCE",
    syllableIndex: 1,
  });
});

test("빈 syllable collection은 EMPTY_WORD로 거절한다", () => {
  expectError(composeWord({ syllables: [] }), { code: "EMPTY_WORD" });
});

test("word 실패는 잘못된 syllable의 zero-based index를 보존한다", () => {
  const input = {
    syllables: [
      syllableInput("indexed-valid", "ㄱ", ["ㅏ"]),
      syllableInput("indexed-invalid", "ㄴ", ["ㅑ", "ㅣ"]),
    ],
  };

  expectError(composeWord(input), {
    code: "INVALID_JUNGSEONG",
    syllableIndex: 1,
  });
});

test("explicit syllable segmentation으로 한글을 NFC 완성형 word로 산출한다", () => {
  const value = expectSuccess(
    composeWord({
      syllables: [
        syllableInput("word-han", "ㅎ", ["ㅏ"], ["ㄴ"]),
        syllableInput("word-geul", "ㄱ", ["ㅡ"], ["ㄹ"]),
      ],
    }),
  );

  assert.equal(value.word, "한글");
  assert.equal(value.word, value.word.normalize("NFC"));
  assert.equal(Array.from(value.word).length, 2);
  assert.deepEqual(
    value.syllables.map(({ syllable }) => syllable),
    ["한", "글"],
  );
});

test("compound component가 포함된 word도 precomposed NFC로 산출한다", () => {
  const value = expectSuccess(
    composeWord({
      syllables: [
        syllableInput("word-gwa", "ㄱ", ["ㅗ", "ㅏ"]),
        syllableInput("word-il", "ㅇ", ["ㅣ"], ["ㄹ"]),
      ],
    }),
  );

  assert.equal(value.word, "과일");
  assert.equal(value.word, value.word.normalize("NFC"));
});

test("여러 syllable literal 사과와 학교를 explicit segmentation으로 조합한다", () => {
  const cases = [
    {
      expected: "사과",
      syllables: [
        syllableInput("word-sagwa-sa", "ㅅ", ["ㅏ"]),
        syllableInput("word-sagwa-gwa", "ㄱ", ["ㅗ", "ㅏ"]),
      ],
    },
    {
      expected: "학교",
      syllables: [
        syllableInput("word-hakgyo-hak", "ㅎ", ["ㅏ"], ["ㄱ"]),
        syllableInput("word-hakgyo-gyo", "ㄱ", ["ㅛ"]),
      ],
    },
  ];

  for (const testCase of cases) {
    const value = expectSuccess(composeWord({ syllables: testCase.syllables }));
    assert.equal(value.word, testCase.expected);
    assert.equal(value.word, value.word.normalize("NFC"));
  }
});

test("composition은 deep-frozen readonly input에 deterministic하며 input을 변경하지 않는다", () => {
  const input = deeplyFrozenWord([
    syllableInput("deterministic-han", "ㅎ", ["ㅏ"], ["ㄴ"]),
    syllableInput("deterministic-guk", "ㄱ", ["ㅜ"], ["ㄱ"]),
  ]);
  const serializedBefore = JSON.stringify(input);

  assert.equal(Object.isFrozen(input), true);
  assert.equal(Object.isFrozen(input.syllables), true);
  for (const syllable of input.syllables) {
    assert.equal(Object.isFrozen(syllable), true);
    assert.equal(Object.isFrozen(syllable.choseong), true);
    assert.equal(Object.isFrozen(syllable.jungseong), true);
    assert.equal(Object.isFrozen(syllable.jongseong), true);
    for (const assigned of [
      ...syllable.choseong,
      ...syllable.jungseong,
      ...syllable.jongseong,
    ]) {
      assert.equal(Object.isFrozen(assigned), true);
    }
  }

  const first = composeWord(input);
  const second = composeWord(input);

  assert.deepEqual(first, second);
  assert.equal(JSON.stringify(input), serializedBefore);
});

test("assignedSymbol이 canonical 의미이며 opaque tileId 차이는 조합 결과를 바꾸지 않는다", () => {
  const first = expectSuccess(
    composeSyllable(syllableInput("display-independent-a", "ㄱ", ["ㅏ"])),
  );
  const second = expectSuccess(
    composeSyllable(syllableInput("display-independent-b", "ㄱ", ["ㅏ"])),
  );

  assert.deepEqual(first, second);
  assert.equal(first.syllable, "가");
});

test("Joker-like opaque tileId는 특별 취급하지 않고 one-position assignedSymbol만 조합한다", () => {
  const compoundWithOpaqueReplacement: SyllableCompositionInput = {
    choseong: [component("ordinary-initial", "ㄱ")],
    jungseong: [
      component("ordinary-medial", "ㅗ"),
      component("joker-like-opaque-id", "ㅏ"),
    ],
    jongseong: [],
  };
  const compound = expectSuccess(
    composeSyllable(compoundWithOpaqueReplacement),
  );
  assert.equal(compound.syllable, "과");

  const wholeCompoundInOneTile = syllableInput(
    "joker-whole-compound",
    "ㄱ",
    ["ㅘ"],
  );
  expectError(composeSyllable(wholeCompoundInOneTile), {
    code: "INVALID_JUNGSEONG",
    syllableIndex: 0,
  });

  const clusterWithOpaqueReplacement: SyllableCompositionInput = {
    choseong: [component("cluster-ordinary-initial", "ㄱ")],
    jungseong: [component("cluster-ordinary-medial", "ㅏ")],
    jongseong: [
      component("cluster-ordinary-final", "ㄱ"),
      component("cluster-joker-like-opaque-id", "ㅅ"),
    ],
  };
  const cluster = expectSuccess(composeSyllable(clusterWithOpaqueReplacement));
  assert.equal(cluster.syllable, "갃");

  const wholeClusterInOneTile = syllableInput(
    "joker-whole-cluster",
    "ㄱ",
    ["ㅏ"],
    ["ㄳ"],
  );
  expectError(composeSyllable(wholeClusterInOneTile), {
    code: "INVALID_JONGSEONG",
    syllableIndex: 0,
  });
});

test("한 syllable word 조합은 허용하며 최소 낱말 길이는 composition 경계 밖이다", () => {
  const value = expectSuccess(
    composeWord({
      syllables: [syllableInput("single-syllable-word", "ㅁ", ["ㅜ"], ["ㄹ"])],
    }),
  );

  assert.equal(value.word, "물");
});
