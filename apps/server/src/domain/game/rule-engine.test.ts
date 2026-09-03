import assert from "node:assert/strict";
import test from "node:test";

import {
  TileIdSchema,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { TestDictionaryProvider } from "../../infrastructure/test-dictionary-provider.js";
import type {
  DictionaryLookupResult,
  DictionaryProvider,
} from "../../ports/system.js";
import type {
  Board,
  BoardSyllable,
  BoardTilePlacement,
  TileDescriptor,
  TileSourceBag,
  WordGroup,
} from "./board.js";
import {
  MVP_RULE_VALIDATION_POLICY,
  validateProposedBoard,
  type BoardValidationError,
  type BoardValidationResult,
  type ValidateBoardInput,
  type ValidatedBoard,
} from "./rule-engine.js";

type SyllableSymbols = Readonly<{
  choseong: string;
  jungseong: readonly string[];
  jongseong?: readonly string[];
}>;

type DescriptorOptions = Readonly<{
  jokerTileIds?: ReadonlySet<TileId>;
  allowedSymbolsById?: ReadonlyMap<TileId, readonly string[]>;
  jokerSourceBagById?: ReadonlyMap<TileId, TileSourceBag>;
}>;

class FixedDictionaryProvider implements DictionaryProvider {
  readonly dictionaryVersion = "fixed-rule-engine-test-v1";
  calls = 0;

  constructor(private readonly result: DictionaryLookupResult) {}

  lookup(_word: string): Promise<DictionaryLookupResult> {
    this.calls += 1;
    return Promise.resolve(this.result);
  }
}

class ThrowingDictionaryProvider implements DictionaryProvider {
  readonly dictionaryVersion = "throwing-rule-engine-test-v1";
  calls = 0;

  lookup(_word: string): Promise<DictionaryLookupResult> {
    this.calls += 1;
    return Promise.reject(new Error("private provider detail"));
  }
}

const ALLOW_ALL = new FixedDictionaryProvider({ status: "ALLOWED" });
const EMPTY_BOARD: Board = { wordGroups: [] };

const VOWEL_SYMBOLS = new Set([
  "ㅏ",
  "ㅐ",
  "ㅑ",
  "ㅒ",
  "ㅓ",
  "ㅔ",
  "ㅕ",
  "ㅖ",
  "ㅗ",
  "ㅛ",
  "ㅜ",
  "ㅠ",
  "ㅡ",
  "ㅣ",
]);

function tileId(value: string): TileId {
  return parse(TileIdSchema, value);
}

function placement(id: string | TileId, assignedSymbol: string): BoardTilePlacement {
  return {
    tileId: typeof id === "string" ? tileId(id) : id,
    assignedSymbol,
  };
}

function syllable(
  choseong: readonly BoardTilePlacement[],
  jungseong: readonly BoardTilePlacement[],
  jongseong: readonly BoardTilePlacement[] = [],
): BoardSyllable {
  return { choseong, jungseong, jongseong };
}

function generatedWord(
  groupId: string,
  symbols: readonly SyllableSymbols[],
): WordGroup {
  return {
    groupId,
    syllables: symbols.map((entry, syllableIndex) => ({
      choseong: [
        placement(`${groupId}-s${syllableIndex}-c0`, entry.choseong),
      ],
      jungseong: entry.jungseong.map((symbol, componentIndex) =>
        placement(
          `${groupId}-s${syllableIndex}-v${componentIndex}`,
          symbol,
        ),
      ),
      jongseong: (entry.jongseong ?? []).map((symbol, componentIndex) =>
        placement(
          `${groupId}-s${syllableIndex}-t${componentIndex}`,
          symbol,
        ),
      ),
    })),
  };
}

const WORD_SYMBOLS = {
  안경: [
    { choseong: "ㅇ", jungseong: ["ㅏ"], jongseong: ["ㄴ"] },
    { choseong: "ㄱ", jungseong: ["ㅕ"], jongseong: ["ㅇ"] },
  ],
  가방: [
    { choseong: "ㄱ", jungseong: ["ㅏ"] },
    { choseong: "ㅂ", jungseong: ["ㅏ"], jongseong: ["ㅇ"] },
  ],
  바다: [
    { choseong: "ㅂ", jungseong: ["ㅏ"] },
    { choseong: "ㄷ", jungseong: ["ㅏ"] },
  ],
  나무: [
    { choseong: "ㄴ", jungseong: ["ㅏ"] },
    { choseong: "ㅁ", jungseong: ["ㅜ"] },
  ],
  학교: [
    { choseong: "ㅎ", jungseong: ["ㅏ"], jongseong: ["ㄱ"] },
    { choseong: "ㄱ", jungseong: ["ㅛ"] },
  ],
  사과: [
    { choseong: "ㅅ", jungseong: ["ㅏ"] },
    { choseong: "ㄱ", jungseong: ["ㅗ", "ㅏ"] },
  ],
} satisfies Readonly<Record<string, readonly SyllableSymbols[]>>;

function board(...wordGroups: readonly WordGroup[]): Board {
  return { wordGroups };
}

function allPlacements(inputBoard: Board): readonly BoardTilePlacement[] {
  const result: BoardTilePlacement[] = [];

  for (const group of inputBoard.wordGroups) {
    for (const item of group.syllables) {
      result.push(...item.choseong, ...item.jungseong, ...item.jongseong);
    }
  }

  return result;
}

function descriptorMap(
  boards: readonly Board[],
  options: DescriptorOptions = {},
): ReadonlyMap<TileId, TileDescriptor> {
  const symbolsById = new Map<TileId, Set<string>>();

  for (const inputBoard of boards) {
    for (const component of allPlacements(inputBoard)) {
      const symbols = symbolsById.get(component.tileId) ?? new Set<string>();
      symbols.add(component.assignedSymbol);
      symbolsById.set(component.tileId, symbols);
    }
  }

  const descriptors = new Map<TileId, TileDescriptor>();
  for (const [id, symbols] of symbolsById) {
    if (options.jokerTileIds?.has(id) === true) {
      descriptors.set(id, {
        tileId: id,
        kind: "JOKER",
        physicalType: "JOKER",
        sourceBag: options.jokerSourceBagById?.get(id) ?? "CONSONANT",
      });
      continue;
    }

    const allowedSymbols = options.allowedSymbolsById?.get(id) ?? [...symbols];
    const firstSymbol = symbols.values().next().value;
    descriptors.set(id, {
      tileId: id,
      kind: "ORDINARY",
      physicalType: `TEST_${String(id)}`,
      sourceBag:
        firstSymbol !== undefined && VOWEL_SYMBOLS.has(firstSymbol)
          ? "VOWEL"
          : "CONSONANT",
      allowedSymbols: [...allowedSymbols],
    });
  }

  return descriptors;
}

function newTileIds(canonicalBoard: Board, proposedBoard: Board): Set<TileId> {
  const canonicalIds = new Set(
    allPlacements(canonicalBoard).map((component) => component.tileId),
  );

  return new Set(
    allPlacements(proposedBoard)
      .map((component) => component.tileId)
      .filter((id) => !canonicalIds.has(id)),
  );
}

function validationInput(
  proposedBoard: Board,
  overrides: Partial<ValidateBoardInput> = {},
): ValidateBoardInput {
  const canonicalBoard = overrides.canonicalBoard ?? EMPTY_BOARD;

  return {
    canonicalBoard,
    proposedBoard,
    tilesById:
      overrides.tilesById ?? descriptorMap([canonicalBoard, proposedBoard]),
    actorRackTileIds:
      overrides.actorRackTileIds ?? newTileIds(canonicalBoard, proposedBoard),
    initialMeldCompleted: overrides.initialMeldCompleted ?? true,
    dictionaryProvider:
      overrides.dictionaryProvider ?? new TestDictionaryProvider(),
    policy: overrides.policy ?? MVP_RULE_VALIDATION_POLICY,
  };
}

function expectSuccess(result: BoardValidationResult): ValidatedBoard {
  if (!result.ok) {
    assert.fail(
      `expected validation success, received ${result.error.code}`,
    );
  }

  return result.value;
}

function expectError(
  result: BoardValidationResult,
  code: BoardValidationError["code"],
): BoardValidationError {
  if (result.ok) {
    assert.fail("expected validation failure");
  }

  assert.equal(result.error.code, code);
  return result.error;
}

function manualTwoSyllableWord(
  groupId: string,
  first: BoardSyllable,
  second: BoardSyllable,
): WordGroup {
  return { groupId, syllables: [first, second] };
}

function deepFreezeBoard(inputBoard: Board): Board {
  const freezeComponents = (
    components: readonly BoardTilePlacement[],
  ): readonly BoardTilePlacement[] =>
    Object.freeze(
      components.map((component) =>
        Object.freeze({
          tileId: component.tileId,
          assignedSymbol: component.assignedSymbol,
        }),
      ),
    );

  return Object.freeze({
    wordGroups: Object.freeze(
      inputBoard.wordGroups.map((group) =>
        Object.freeze({
          groupId: group.groupId,
          syllables: Object.freeze(
            group.syllables.map((item) =>
              Object.freeze({
                choseong: freezeComponents(item.choseong),
                jungseong: freezeComponents(item.jungseong),
                jongseong: freezeComponents(item.jongseong),
              }),
            ),
          ),
        }),
      ),
    ),
  });
}

test("실제 test dictionary의 한 WordGroup을 검증하고 derived result만 반환한다", async () => {
  const proposed = board(generatedWord("sea", WORD_SYMBOLS.바다));
  const result = expectSuccess(
    await validateProposedBoard(validationInput(proposed)),
  );

  assert.deepEqual(result.composedWords, [{ groupId: "sea", word: "바다" }]);
  assert.deepEqual(result.newlyUsedRackTileIds, [
    ...allPlacements(proposed).map((component) => component.tileId),
  ]);
  assert.deepEqual(result.recoveredJokerTileIds, []);
  assert.equal(result.completesInitialMeld, false);
});

test("실제 test dictionary의 여러 WordGroup을 proposed 순서로 검증한다", async () => {
  const proposed = board(
    generatedWord("sea", WORD_SYMBOLS.바다),
    generatedWord("tree", WORD_SYMBOLS.나무),
  );

  assert.deepEqual(
    expectSuccess(await validateProposedBoard(validationInput(proposed)))
      .composedWords,
    [
      { groupId: "sea", word: "바다" },
      { groupId: "tree", word: "나무" },
    ],
  );
});

test("같은 완성 낱말은 서로 다른 groupId와 physical tile이면 중복 허용한다", async () => {
  const proposed = board(
    generatedWord("school-a", WORD_SYMBOLS.학교),
    generatedWord("school-b", WORD_SYMBOLS.학교),
  );
  const result = expectSuccess(
    await validateProposedBoard(validationInput(proposed)),
  );

  assert.deepEqual(result.composedWords, [
    { groupId: "school-a", word: "학교" },
    { groupId: "school-b", word: "학교" },
  ]);
});

test("빈 groupId, duplicate groupId, 빈 WordGroup을 INVALID_BOARD로 거절한다", async () => {
  const validGroup = generatedWord("valid", WORD_SYMBOLS.바다);
  const cases: readonly Readonly<{
    proposed: Board;
    reason: "EMPTY_GROUP_ID" | "DUPLICATE_GROUP_ID" | "EMPTY_WORD_GROUP";
  }>[] = [
    {
      proposed: board({ ...validGroup, groupId: "" }),
      reason: "EMPTY_GROUP_ID",
    },
    {
      proposed: board(validGroup, { ...validGroup }),
      reason: "DUPLICATE_GROUP_ID",
    },
    {
      proposed: board({ groupId: "empty", syllables: [] }),
      reason: "EMPTY_WORD_GROUP",
    },
  ];

  for (const testCase of cases) {
    const error = expectError(
      await validateProposedBoard(validationInput(testCase.proposed)),
      "INVALID_BOARD",
    );
    assert.equal(error.code === "INVALID_BOARD" ? error.reason : undefined, testCase.reason);
  }
});

test("Board 전체의 duplicate tileId를 dictionary lookup 전에 거절한다", async () => {
  const shared = placement("duplicated-tile", "ㅏ");
  const proposed = board(
    manualTwoSyllableWord(
      "duplicate",
      syllable([placement("duplicate-c1", "ㄱ")], [shared]),
      syllable([placement("duplicate-c2", "ㄴ")], [shared]),
    ),
  );
  const provider = new FixedDictionaryProvider({ status: "ALLOWED" });
  const error = expectError(
    await validateProposedBoard(
      validationInput(proposed, { dictionaryProvider: provider }),
    ),
    "TILE_CONSERVATION_VIOLATION",
  );

  assert.equal(
    error.code === "TILE_CONSERVATION_VIOLATION" ? error.reason : undefined,
    "DUPLICATE_TILE_REFERENCE",
  );
  assert.equal(provider.calls, 0);
});

test("tilesById에 없는 physical tile 참조를 거절한다", async () => {
  const proposed = board(generatedWord("unknown", WORD_SYMBOLS.바다));
  const descriptors = new Map(descriptorMap([proposed]));
  const unknownId = allPlacements(proposed)[0]?.tileId;
  assert.notEqual(unknownId, undefined);
  if (unknownId !== undefined) {
    descriptors.delete(unknownId);
  }

  const error = expectError(
    await validateProposedBoard(
      validationInput(proposed, { tilesById: descriptors }),
    ),
    "INVALID_TILE_REFERENCE",
  );
  assert.equal(error.code === "INVALID_TILE_REFERENCE" ? error.board : undefined, "PROPOSED");
});

test("ordinary descriptor의 allowedSymbols가 rotation/dedicated assignment 권한이다", async () => {
  const cases = [
    { physicalType: "GIYEOK_NIEUN", allowed: ["ㄱ", "ㄴ"], symbol: "ㄱ" },
    { physicalType: "GIYEOK_NIEUN", allowed: ["ㄱ", "ㄴ"], symbol: "ㄴ" },
    { physicalType: "A_ROTATION", allowed: ["ㅏ", "ㅓ", "ㅗ", "ㅜ"], symbol: "ㅗ" },
    { physicalType: "A_ROTATION", allowed: ["ㅏ", "ㅓ", "ㅗ", "ㅜ"], symbol: "ㅜ" },
    { physicalType: "SSANG_GIYEOK", allowed: ["ㄲ"], symbol: "ㄲ" },
  ] as const;

  for (const [index, testCase] of cases.entries()) {
    const targetId = tileId(`ordinary-valid-${index}`);
    const proposed = board(
      manualTwoSyllableWord(
        `ordinary-valid-group-${index}`,
        syllable(
          [
            placement(
              VOWEL_SYMBOLS.has(testCase.symbol)
                ? `ordinary-valid-c-${index}`
                : targetId,
              VOWEL_SYMBOLS.has(testCase.symbol) ? "ㄱ" : testCase.symbol,
            ),
          ],
          [
            placement(
              VOWEL_SYMBOLS.has(testCase.symbol)
                ? targetId
                : `ordinary-valid-vowel-${index}`,
              VOWEL_SYMBOLS.has(testCase.symbol) ? testCase.symbol : "ㅏ",
            ),
          ],
        ),
        syllable(
          [placement(`ordinary-valid-second-c-${index}`, "ㄱ")],
          [placement(`ordinary-valid-second-v-${index}`, "ㅏ")],
        ),
      ),
    );
    const descriptors = new Map(descriptorMap([proposed]));
    descriptors.set(targetId, {
      tileId: targetId,
      kind: "ORDINARY",
      physicalType: testCase.physicalType,
      sourceBag: VOWEL_SYMBOLS.has(testCase.symbol) ? "VOWEL" : "CONSONANT",
      allowedSymbols: testCase.allowed,
    });

    expectSuccess(
      await validateProposedBoard(
        validationInput(proposed, {
          tilesById: descriptors,
          dictionaryProvider: ALLOW_ALL,
        }),
      ),
    );
  }
});

test("ordinary rotation/dedicated Tile의 범위 밖 assignedSymbol을 거절한다", async () => {
  const cases = [
    { allowed: ["ㄱ", "ㄴ"], invalid: "ㅁ", role: "CHOSEONG" },
    { allowed: ["ㅏ", "ㅓ", "ㅗ", "ㅜ"], invalid: "ㅣ", role: "JUNGSEONG" },
    { allowed: ["ㄲ"], invalid: "ㄱ", role: "CHOSEONG" },
  ] as const;

  for (const [index, testCase] of cases.entries()) {
    const targetId = tileId(`ordinary-invalid-${index}`);
    const first =
      testCase.role === "CHOSEONG"
        ? syllable(
            [placement(targetId, testCase.invalid)],
            [placement(`ordinary-invalid-v-${index}`, "ㅏ")],
          )
        : syllable(
            [placement(`ordinary-invalid-c-${index}`, "ㄱ")],
            [placement(targetId, testCase.invalid)],
          );
    const proposed = board(
      manualTwoSyllableWord(
        `ordinary-invalid-group-${index}`,
        first,
        syllable(
          [placement(`ordinary-invalid-second-c-${index}`, "ㄴ")],
          [placement(`ordinary-invalid-second-v-${index}`, "ㅏ")],
        ),
      ),
    );
    const descriptors = new Map(descriptorMap([proposed]));
    const descriptor = descriptors.get(targetId);
    assert.notEqual(descriptor, undefined);
    descriptors.set(targetId, {
      tileId: targetId,
      kind: "ORDINARY",
      physicalType: "RESTRICTED_TEST_TILE",
      sourceBag: testCase.role === "JUNGSEONG" ? "VOWEL" : "CONSONANT",
      allowedSymbols: testCase.allowed,
    });

    expectError(
      await validateProposedBoard(
        validationInput(proposed, {
          tilesById: descriptors,
          dictionaryProvider: ALLOW_ALL,
        }),
      ),
      "INVALID_TILE_ASSIGNMENT",
    );
  }
});

test("Joker 하나에 compound vowel/final cluster symbol을 직접 assigned하면 거절한다", async () => {
  for (const [index, compoundSymbol] of ["ㅘ", "ㄳ"].entries()) {
    const jokerId = tileId(`joker-compound-${index}`);
    const proposed = board(
      manualTwoSyllableWord(
        `joker-compound-group-${index}`,
        syllable(
          [
            placement(
              compoundSymbol === "ㄳ" ? jokerId : `joker-compound-c-${index}`,
              compoundSymbol === "ㄳ" ? compoundSymbol : "ㄱ",
            ),
          ],
          [
            placement(
              compoundSymbol === "ㅘ" ? jokerId : `joker-compound-v-${index}`,
              compoundSymbol === "ㅘ" ? compoundSymbol : "ㅏ",
            ),
          ],
        ),
        syllable(
          [placement(`joker-compound-second-c-${index}`, "ㄴ")],
          [placement(`joker-compound-second-v-${index}`, "ㅏ")],
        ),
      ),
    );
    const tiles = descriptorMap([proposed], {
      jokerTileIds: new Set([jokerId]),
    });
    const error = expectError(
      await validateProposedBoard(
        validationInput(proposed, {
          tilesById: tiles,
          dictionaryProvider: ALLOW_ALL,
        }),
      ),
      "JOKER_RULE_VIOLATION",
    );
    assert.equal(
      error.code === "JOKER_RULE_VIOLATION" ? error.reason : undefined,
      "INVALID_ASSIGNMENT",
    );
  }
});

test("한 음절은 provider가 ALLOWED여도 WORD_TOO_SHORT이고 lookup하지 않는다", async () => {
  const provider = new FixedDictionaryProvider({ status: "ALLOWED" });
  const proposed = board(
    generatedWord("one-syllable", [
      { choseong: "ㄱ", jungseong: ["ㅏ"] },
    ]),
  );

  expectError(
    await validateProposedBoard(
      validationInput(proposed, { dictionaryProvider: provider }),
    ),
    "WORD_TOO_SHORT",
  );
  assert.equal(provider.calls, 0);
});

test("Hangul composition 실패를 safe domain error로 mapping하고 lookup하지 않는다", async () => {
  const provider = new FixedDictionaryProvider({ status: "ALLOWED" });
  const proposed = board(
    manualTwoSyllableWord(
      "invalid-composition",
      syllable(
        [placement("invalid-composition-c1", "ㄱ")],
        [
          placement("invalid-composition-v1", "ㅏ"),
          placement("invalid-composition-v2", "ㅗ"),
        ],
      ),
      syllable(
        [placement("invalid-composition-c2", "ㄴ")],
        [placement("invalid-composition-v3", "ㅏ")],
      ),
    ),
  );
  const error = expectError(
    await validateProposedBoard(
      validationInput(proposed, { dictionaryProvider: provider }),
    ),
    "INVALID_HANGUL_COMPOSITION",
  );

  assert.equal(
    error.code === "INVALID_HANGUL_COMPOSITION"
      ? error.compositionCode
      : undefined,
    "INVALID_JUNGSEONG",
  );
  assert.equal(provider.calls, 0);
});

test("fixture에 없는 composed word는 WORD_NOT_ALLOWED이다", async () => {
  const proposed = board(
    generatedWord("fixture-miss", [
      { choseong: "ㄱ", jungseong: ["ㅏ"] },
      { choseong: "ㄴ", jungseong: ["ㅏ"] },
    ]),
  );

  expectError(
    await validateProposedBoard(validationInput(proposed)),
    "WORD_NOT_ALLOWED",
  );
});

test("dictionary ERROR/TIMEOUT/throw를 DICTIONARY_UNAVAILABLE로 구분한다", async () => {
  const proposed = board(generatedWord("school", WORD_SYMBOLS.학교));
  const cases: readonly Readonly<{
    provider: DictionaryProvider;
    expectedReason: "ERROR" | "TIMEOUT";
  }>[] = [
    {
      provider: new FixedDictionaryProvider({
        status: "UNAVAILABLE",
        reason: "ERROR",
      }),
      expectedReason: "ERROR",
    },
    {
      provider: new FixedDictionaryProvider({
        status: "UNAVAILABLE",
        reason: "TIMEOUT",
      }),
      expectedReason: "TIMEOUT",
    },
    { provider: new ThrowingDictionaryProvider(), expectedReason: "ERROR" },
  ];

  for (const testCase of cases) {
    const error = expectError(
      await validateProposedBoard(
        validationInput(proposed, {
          dictionaryProvider: testCase.provider,
        }),
      ),
      "DICTIONARY_UNAVAILABLE",
    );
    assert.equal(
      error.code === "DICTIONARY_UNAVAILABLE" ? error.reason : undefined,
      testCase.expectedReason,
    );
  }
});

test("initial meld는 정확히 6 physical Tile인 안경을 허용한다", async () => {
  const proposed = board(generatedWord("glasses", WORD_SYMBOLS.안경));
  const result = expectSuccess(
    await validateProposedBoard(
      validationInput(proposed, { initialMeldCompleted: false }),
    ),
  );

  assert.equal(result.newlyUsedRackTileIds.length, 6);
  assert.equal(result.completesInitialMeld, true);
  assert.deepEqual(result.composedWords, [
    { groupId: "glasses", word: "안경" },
  ]);
});

test("initial meld의 5 physical Tile인 가방은 NOT_ENOUGH_TILES다", async () => {
  const proposed = board(generatedWord("bag", WORD_SYMBOLS.가방));
  const error = expectError(
    await validateProposedBoard(
      validationInput(proposed, { initialMeldCompleted: false }),
    ),
    "INITIAL_MELD_VIOLATION",
  );

  assert.equal(
    error.code === "INITIAL_MELD_VIOLATION" ? error.reason : undefined,
    "NOT_ENOUGH_TILES",
  );
});

test("initial meld는 여러 WordGroup의 physical Tile 수를 합산한다", async () => {
  const proposed = board(
    generatedWord("initial-sea", WORD_SYMBOLS.바다),
    generatedWord("initial-tree", WORD_SYMBOLS.나무),
  );
  const result = expectSuccess(
    await validateProposedBoard(
      validationInput(proposed, { initialMeldCompleted: false }),
    ),
  );

  assert.equal(result.newlyUsedRackTileIds.length, 8);
  assert.equal(result.completesInitialMeld, true);
});

test("initial meld는 canonical group content를 보존하면 Board 표시 순서 변경과 새 group을 허용한다", async () => {
  const sea = generatedWord("existing-sea", WORD_SYMBOLS.바다);
  const tree = generatedWord("existing-tree", WORD_SYMBOLS.나무);
  const canonical = board(sea, tree);
  const proposed = board(
    tree,
    sea,
    generatedWord("new-glasses", WORD_SYMBOLS.안경),
  );

  const result = expectSuccess(
    await validateProposedBoard(
      validationInput(proposed, {
        canonicalBoard: canonical,
        initialMeldCompleted: false,
      }),
    ),
  );

  assert.equal(result.newlyUsedRackTileIds.length, 6);
  assert.equal(result.completesInitialMeld, true);
});

test("initial meld 중 canonical group placement 변경을 거절한다", async () => {
  const canonicalGroup = generatedWord("preserved", WORD_SYMBOLS.바다);
  const originalFirst = canonicalGroup.syllables[0];
  assert.notEqual(originalFirst, undefined);
  if (originalFirst === undefined) {
    return;
  }
  const changedGroup: WordGroup = {
    ...canonicalGroup,
    syllables: [
      {
        ...originalFirst,
        choseong: originalFirst.choseong.map((component) => ({
          ...component,
          assignedSymbol: "ㅍ",
        })),
      },
      ...canonicalGroup.syllables.slice(1),
    ],
  };
  const newGroup = generatedWord("new-glasses", WORD_SYMBOLS.안경);
  const canonical = board(canonicalGroup);
  const proposed = board(changedGroup, newGroup);
  const error = expectError(
    await validateProposedBoard(
      validationInput(proposed, {
        canonicalBoard: canonical,
        initialMeldCompleted: false,
      }),
    ),
    "INITIAL_MELD_VIOLATION",
  );

  assert.equal(
    error.code === "INITIAL_MELD_VIOLATION" ? error.reason : undefined,
    "CANONICAL_BOARD_CHANGED",
  );
});

test("initial meld의 known new Tile도 actor rack에 없으면 TILE_NOT_OWNED다", async () => {
  const proposed = board(generatedWord("unowned-glasses", WORD_SYMBOLS.안경));
  const rack = newTileIds(EMPTY_BOARD, proposed);
  const firstId = allPlacements(proposed)[0]?.tileId;
  assert.notEqual(firstId, undefined);
  if (firstId !== undefined) {
    rack.delete(firstId);
  }

  expectError(
    await validateProposedBoard(
      validationInput(proposed, {
        actorRackTileIds: rack,
        initialMeldCompleted: false,
      }),
    ),
    "TILE_NOT_OWNED",
  );
});

test("actor rack Joker도 initial meld physical Tile 1개로 세고 사용할 수 있다", async () => {
  const proposed = board(generatedWord("joker-glasses", WORD_SYMBOLS.안경));
  const jokerId = allPlacements(proposed)[0]?.tileId;
  assert.notEqual(jokerId, undefined);
  if (jokerId === undefined) {
    return;
  }
  const result = expectSuccess(
    await validateProposedBoard(
      validationInput(proposed, {
        initialMeldCompleted: false,
        tilesById: descriptorMap([proposed], {
          jokerTileIds: new Set([jokerId]),
        }),
      }),
    ),
  );

  assert.equal(result.newlyUsedRackTileIds.length, 6);
  assert.deepEqual(result.recoveredJokerTileIds, []);
  assert.equal(result.completesInitialMeld, true);
});

test("normal rearrangement에서 기존 group을 split하고 rack Tile 하나를 추가할 수 있다", async () => {
  const g = placement("split-g", "ㄱ");
  const a1 = placement("split-a1", "ㅏ");
  const n = placement("split-n", "ㄴ");
  const a2 = placement("split-a2", "ㅏ");
  const d = placement("split-d", "ㄷ");
  const a3 = placement("split-a3", "ㅏ");
  const r = placement("split-r", "ㄹ");
  const a4 = placement("split-a4", "ㅏ");
  const newFinal = placement("split-new-final", "ㄱ");
  const canonical = board({
    groupId: "whole",
    syllables: [
      syllable([g], [a1]),
      syllable([n], [a2]),
      syllable([d], [a3]),
      syllable([r], [a4]),
    ],
  });
  const proposed = board(
    {
      groupId: "split-a",
      syllables: [syllable([g], [a1]), syllable([n], [a2])],
    },
    {
      groupId: "split-b",
      syllables: [
        syllable([d], [a3], [newFinal]),
        syllable([r], [a4]),
      ],
    },
  );

  const result = expectSuccess(
    await validateProposedBoard(
      validationInput(proposed, {
        canonicalBoard: canonical,
        dictionaryProvider: new FixedDictionaryProvider({ status: "ALLOWED" }),
      }),
    ),
  );
  assert.deepEqual(result.newlyUsedRackTileIds, [newFinal.tileId]);
});

test("normal rearrangement에서 여러 group을 merge하고 rack Tile 하나를 추가할 수 있다", async () => {
  const g = placement("merge-g", "ㄱ");
  const a1 = placement("merge-a1", "ㅏ");
  const n = placement("merge-n", "ㄴ");
  const a2 = placement("merge-a2", "ㅏ");
  const d = placement("merge-d", "ㄷ");
  const a3 = placement("merge-a3", "ㅏ");
  const r = placement("merge-r", "ㄹ");
  const a4 = placement("merge-a4", "ㅏ");
  const newFinal = placement("merge-new-final", "ㄱ");
  const canonical = board(
    {
      groupId: "left",
      syllables: [syllable([g], [a1]), syllable([n], [a2])],
    },
    {
      groupId: "right",
      syllables: [syllable([d], [a3]), syllable([r], [a4])],
    },
  );
  const proposed = board({
    groupId: "merged",
    syllables: [
      syllable([g], [a1]),
      syllable([n], [a2]),
      syllable([d], [a3]),
      syllable([r], [a4], [newFinal]),
    ],
  });

  const result = expectSuccess(
    await validateProposedBoard(
      validationInput(proposed, {
        canonicalBoard: canonical,
        dictionaryProvider: new FixedDictionaryProvider({ status: "ALLOWED" }),
      }),
    ),
  );
  assert.deepEqual(result.newlyUsedRackTileIds, [newFinal.tileId]);
});

test("normal proposed Board에서 canonical Tile 누락과 복제를 각각 거절한다", async () => {
  const canonicalGroup = generatedWord("canonical", WORD_SYMBOLS.바다);
  const canonical = board(canonicalGroup);
  const firstSyllable = canonicalGroup.syllables[0];
  const secondSyllable = canonicalGroup.syllables[1];
  assert.notEqual(firstSyllable, undefined);
  assert.notEqual(secondSyllable, undefined);
  if (firstSyllable === undefined || secondSyllable === undefined) {
    return;
  }
  const firstConsonant = firstSyllable.choseong[0];
  assert.notEqual(firstConsonant, undefined);
  if (firstConsonant === undefined) {
    return;
  }

  const missingBoard = board({
    groupId: "missing",
    syllables: [
      syllable([], firstSyllable.jungseong),
      secondSyllable,
    ],
  });
  const duplicateBoard = board({
    groupId: "duplicate",
    syllables: [
      firstSyllable,
      syllable([firstConsonant], secondSyllable.jungseong),
    ],
  });

  for (const [proposed, reason] of [
    [missingBoard, "MISSING_CANONICAL_TILE"],
    [duplicateBoard, "DUPLICATE_TILE_REFERENCE"],
  ] as const) {
    const error = expectError(
      await validateProposedBoard(
        validationInput(proposed, {
          canonicalBoard: canonical,
          dictionaryProvider: ALLOW_ALL,
        }),
      ),
      "TILE_CONSERVATION_VIOLATION",
    );
    assert.equal(
      error.code === "TILE_CONSERVATION_VIOLATION"
        ? error.reason
        : undefined,
      reason,
    );
  }
});

test("normal turn은 actor rack Tile 0개를 거절하고 1개를 허용한다", async () => {
  const canonicalGroup = generatedWord("normal", [
    { choseong: "ㄱ", jungseong: ["ㅏ"] },
    { choseong: "ㄴ", jungseong: ["ㅏ"] },
  ]);
  const canonical = board(canonicalGroup);

  const noNewError = expectError(
    await validateProposedBoard(
      validationInput(canonical, {
        canonicalBoard: canonical,
        actorRackTileIds: new Set(),
        dictionaryProvider: ALLOW_ALL,
      }),
    ),
    "REARRANGEMENT_VIOLATION",
  );
  assert.equal(
    noNewError.code === "REARRANGEMENT_VIOLATION"
      ? noNewError.reason
      : undefined,
    "NO_RACK_TILE_USED",
  );

  const second = canonicalGroup.syllables[1];
  assert.notEqual(second, undefined);
  if (second === undefined) {
    return;
  }
  const newFinal = placement("normal-new-final", "ㄴ");
  const proposed = board({
    ...canonicalGroup,
    syllables: [
      canonicalGroup.syllables[0] ?? second,
      syllable(second.choseong, second.jungseong, [newFinal]),
    ],
  });
  const result = expectSuccess(
    await validateProposedBoard(
      validationInput(proposed, {
        canonicalBoard: canonical,
        actorRackTileIds: new Set([newFinal.tileId]),
        dictionaryProvider: ALLOW_ALL,
      }),
    ),
  );

  assert.deepEqual(result.newlyUsedRackTileIds, [newFinal.tileId]);
  assert.equal(
    allPlacements(canonical).some((component) =>
      result.newlyUsedRackTileIds.includes(component.tileId),
    ),
    false,
  );
});

test("tilesById에는 있지만 actor rack에 없는 normal new Tile을 거절한다", async () => {
  const canonicalGroup = generatedWord("ownership", [
    { choseong: "ㄱ", jungseong: ["ㅏ"] },
    { choseong: "ㄴ", jungseong: ["ㅏ"] },
  ]);
  const canonical = board(canonicalGroup);
  const second = canonicalGroup.syllables[1];
  assert.notEqual(second, undefined);
  if (second === undefined) {
    return;
  }
  const unowned = placement("known-but-unowned", "ㄴ");
  const proposed = board({
    ...canonicalGroup,
    syllables: [
      canonicalGroup.syllables[0] ?? second,
      syllable(second.choseong, second.jungseong, [unowned]),
    ],
  });

  expectError(
    await validateProposedBoard(
      validationInput(proposed, {
        canonicalBoard: canonical,
        actorRackTileIds: new Set(),
        dictionaryProvider: ALLOW_ALL,
      }),
    ),
    "TILE_NOT_OWNED",
  );
});

test("compound vowel ㅘ는 두 physical Tile로 사과를 조합한다", async () => {
  const proposed = board(generatedWord("apple", WORD_SYMBOLS.사과));
  const result = expectSuccess(
    await validateProposedBoard(validationInput(proposed)),
  );

  assert.deepEqual(result.composedWords, [{ groupId: "apple", word: "사과" }]);
  assert.equal(result.newlyUsedRackTileIds.length, 5);
});

test("final cluster ㄳ은 두 physical Tile로 넋이를 조합할 수 있다", async () => {
  const proposed = board(
    generatedWord("cluster", [
      { choseong: "ㄴ", jungseong: ["ㅓ"], jongseong: ["ㄱ", "ㅅ"] },
      { choseong: "ㅇ", jungseong: ["ㅣ"] },
    ]),
  );
  const result = expectSuccess(
    await validateProposedBoard(
      validationInput(proposed, { dictionaryProvider: ALLOW_ALL }),
    ),
  );

  assert.deepEqual(result.composedWords, [{ groupId: "cluster", word: "넋이" }]);
  assert.equal(result.newlyUsedRackTileIds.length, 6);
});

test("새 rack Joker는 source bag과 무관하게 one-position 자음/모음을 대체한다", async () => {
  const cases = [
    { jokerRole: "CHOSEONG", symbol: "ㄱ", sourceBag: "VOWEL" },
    { jokerRole: "JUNGSEONG", symbol: "ㅏ", sourceBag: "CONSONANT" },
  ] as const;

  for (const [index, testCase] of cases.entries()) {
    const jokerId = tileId(`new-joker-${index}`);
    const first =
      testCase.jokerRole === "CHOSEONG"
        ? syllable(
            [placement(jokerId, testCase.symbol)],
            [placement(`new-joker-v-${index}`, "ㅏ")],
          )
        : syllable(
            [placement(`new-joker-c-${index}`, "ㄱ")],
            [placement(jokerId, testCase.symbol)],
          );
    const proposed = board(
      manualTwoSyllableWord(
        `new-joker-group-${index}`,
        first,
        syllable(
          [placement(`new-joker-second-c-${index}`, "ㄴ")],
          [placement(`new-joker-second-v-${index}`, "ㅏ")],
        ),
      ),
    );
    const result = expectSuccess(
      await validateProposedBoard(
        validationInput(proposed, {
          tilesById: descriptorMap([proposed], {
            jokerTileIds: new Set([jokerId]),
            jokerSourceBagById: new Map([[jokerId, testCase.sourceBag]]),
          }),
          dictionaryProvider: ALLOW_ALL,
        }),
      ),
    );

    assert.deepEqual(result.recoveredJokerTileIds, []);
  }
});

test("기존 Joker가 같은 logical placement와 symbol이면 replacement가 필요 없다", async () => {
  const jokerId = tileId("stable-joker");
  const joker = placement(jokerId, "ㄱ");
  const a1 = placement("stable-joker-a1", "ㅏ");
  const n = placement("stable-joker-n", "ㄴ");
  const a2 = placement("stable-joker-a2", "ㅏ");
  const newFinal = placement("stable-joker-new-final", "ㄴ");
  const canonical = board({
    groupId: "stable-joker-group",
    syllables: [syllable([joker], [a1]), syllable([n], [a2])],
  });
  const proposed = board({
    groupId: "stable-joker-group",
    syllables: [
      syllable([joker], [a1]),
      syllable([n], [a2], [newFinal]),
    ],
  });
  const result = expectSuccess(
    await validateProposedBoard(
      validationInput(proposed, {
        canonicalBoard: canonical,
        tilesById: descriptorMap([canonical, proposed], {
          jokerTileIds: new Set([jokerId]),
        }),
        dictionaryProvider: ALLOW_ALL,
      }),
    ),
  );

  assert.deepEqual(result.recoveredJokerTileIds, []);
  assert.deepEqual(result.newlyUsedRackTileIds, [newFinal.tileId]);
});

test("기존 Joker 이동은 old symbol과 같은 새 ordinary Tile로 multiset replacement한다", async () => {
  const jokerId = tileId("moved-joker");
  const joker = placement(jokerId, "ㄱ");
  const a1 = placement("moved-joker-a1", "ㅏ");
  const n = placement("moved-joker-n", "ㄴ");
  const a2 = placement("moved-joker-a2", "ㅏ");
  const replacement = placement("moved-joker-replacement", "ㄱ");
  const canonical = board({
    groupId: "moved-joker-group",
    syllables: [syllable([joker], [a1]), syllable([n], [a2])],
  });
  const proposed = board({
    groupId: "moved-joker-group",
    syllables: [
      syllable([n], [a1]),
      syllable([replacement], [a2], [joker]),
    ],
  });
  const result = expectSuccess(
    await validateProposedBoard(
      validationInput(proposed, {
        canonicalBoard: canonical,
        tilesById: descriptorMap([canonical, proposed], {
          jokerTileIds: new Set([jokerId]),
        }),
        dictionaryProvider: ALLOW_ALL,
      }),
    ),
  );

  assert.deepEqual(result.recoveredJokerTileIds, [jokerId]);
  assert.deepEqual(result.newlyUsedRackTileIds, [replacement.tileId]);
});

test("기존 Joker 이동에 old symbol matching ordinary Tile이 없으면 거절한다", async () => {
  const jokerId = tileId("unmatched-joker");
  const joker = placement(jokerId, "ㄱ");
  const a1 = placement("unmatched-joker-a1", "ㅏ");
  const n = placement("unmatched-joker-n", "ㄴ");
  const a2 = placement("unmatched-joker-a2", "ㅏ");
  const unrelated = placement("unmatched-joker-new-m", "ㅁ");
  const canonical = board({
    groupId: "unmatched-joker-group",
    syllables: [syllable([joker], [a1]), syllable([n], [a2])],
  });
  const proposed = board({
    groupId: "unmatched-joker-group",
    syllables: [
      syllable([n], [a1], [unrelated]),
      syllable([joker], [a2]),
    ],
  });
  const error = expectError(
    await validateProposedBoard(
      validationInput(proposed, {
        canonicalBoard: canonical,
        tilesById: descriptorMap([canonical, proposed], {
          jokerTileIds: new Set([jokerId]),
        }),
        dictionaryProvider: ALLOW_ALL,
      }),
    ),
    "JOKER_RULE_VIOLATION",
  );

  assert.equal(
    error.code === "JOKER_RULE_VIOLATION" ? error.reason : undefined,
    "MISSING_REPLACEMENT",
  );
});

test("기존 Joker assignedSymbol 변경도 old symbol replacement가 있으면 회수로 허용한다", async () => {
  const jokerId = tileId("changed-joker");
  const canonicalJoker = placement(jokerId, "ㄱ");
  const changedJoker = placement(jokerId, "ㄴ");
  const a1 = placement("changed-joker-a1", "ㅏ");
  const n = placement("changed-joker-n", "ㄴ");
  const a2 = placement("changed-joker-a2", "ㅏ");
  const replacement = placement("changed-joker-replacement", "ㄱ");
  const canonical = board({
    groupId: "changed-joker-group",
    syllables: [syllable([canonicalJoker], [a1]), syllable([n], [a2])],
  });
  const proposed = board({
    groupId: "changed-joker-group",
    syllables: [
      syllable([changedJoker], [a1]),
      syllable([n], [a2], [replacement]),
    ],
  });
  const result = expectSuccess(
    await validateProposedBoard(
      validationInput(proposed, {
        canonicalBoard: canonical,
        tilesById: descriptorMap([canonical, proposed], {
          jokerTileIds: new Set([jokerId]),
        }),
        dictionaryProvider: ALLOW_ALL,
      }),
    ),
  );

  assert.deepEqual(result.recoveredJokerTileIds, [jokerId]);
});

test("Joker 두 개 회수에 matching ordinary Tile 하나를 중복 사용하지 못한다", async () => {
  const jokerOneId = tileId("multi-joker-one");
  const jokerTwoId = tileId("multi-joker-two");
  const jokerOne = placement(jokerOneId, "ㄱ");
  const jokerTwo = placement(jokerTwoId, "ㄱ");
  const a1 = placement("multi-joker-a1", "ㅏ");
  const a2 = placement("multi-joker-a2", "ㅏ");
  const replacement = placement("multi-joker-one-replacement", "ㄱ");
  const canonical = board({
    groupId: "multi-joker-group",
    syllables: [syllable([jokerOne], [a1]), syllable([jokerTwo], [a2])],
  });
  const proposed = board({
    groupId: "multi-joker-group",
    syllables: [
      syllable([replacement], [a1], [jokerOne]),
      syllable([placement(jokerTwoId, "ㄴ")], [a2]),
    ],
  });
  const error = expectError(
    await validateProposedBoard(
      validationInput(proposed, {
        canonicalBoard: canonical,
        tilesById: descriptorMap([canonical, proposed], {
          jokerTileIds: new Set([jokerOneId, jokerTwoId]),
        }),
        dictionaryProvider: ALLOW_ALL,
      }),
    ),
    "JOKER_RULE_VIOLATION",
  );

  assert.equal(
    error.code === "JOKER_RULE_VIOLATION" ? error.reason : undefined,
    "MISSING_REPLACEMENT",
  );
});

test("기존 Joker가 proposed Board에서 사라지면 immediate reuse 이전에 conservation 위반이다", async () => {
  const jokerId = tileId("missing-joker");
  const joker = placement(jokerId, "ㄱ");
  const a1 = placement("missing-joker-a1", "ㅏ");
  const n = placement("missing-joker-n", "ㄴ");
  const a2 = placement("missing-joker-a2", "ㅏ");
  const canonical = board({
    groupId: "missing-joker-group",
    syllables: [syllable([joker], [a1]), syllable([n], [a2])],
  });
  const proposed = board({
    groupId: "missing-joker-group",
    syllables: [syllable([], [a1]), syllable([n], [a2])],
  });
  const error = expectError(
    await validateProposedBoard(
      validationInput(proposed, {
        canonicalBoard: canonical,
        tilesById: descriptorMap([canonical, proposed], {
          jokerTileIds: new Set([jokerId]),
        }),
        dictionaryProvider: ALLOW_ALL,
      }),
    ),
    "TILE_CONSERVATION_VIOLATION",
  );

  assert.equal(
    error.code === "TILE_CONSERVATION_VIOLATION" ? error.reason : undefined,
    "MISSING_CANONICAL_TILE",
  );
});

test("deep-frozen 입력을 반복 검증해도 deterministic하며 어떤 입력도 mutate하지 않는다", async () => {
  const canonical = deepFreezeBoard(
    board(generatedWord("frozen-existing", WORD_SYMBOLS.바다)),
  );
  const existingGroup = canonical.wordGroups[0];
  assert.notEqual(existingGroup, undefined);
  if (existingGroup === undefined) {
    return;
  }
  const second = existingGroup.syllables[1];
  assert.notEqual(second, undefined);
  if (second === undefined) {
    return;
  }
  const newFinal = placement("frozen-new-final", "ㄴ");
  const proposed = deepFreezeBoard(
    board({
      ...existingGroup,
      syllables: [
        existingGroup.syllables[0] ?? second,
        syllable(second.choseong, second.jungseong, [newFinal]),
      ],
    }),
  );
  const mutableDescriptors = new Map(descriptorMap([canonical, proposed]));
  const frozenDescriptors = new Map<TileId, TileDescriptor>();
  for (const [id, descriptor] of mutableDescriptors) {
    frozenDescriptors.set(
      id,
      descriptor.kind === "ORDINARY"
        ? Object.freeze({
            ...descriptor,
            allowedSymbols: Object.freeze([...descriptor.allowedSymbols]),
          })
        : Object.freeze({ ...descriptor }),
    );
  }
  const rack = new Set([newFinal.tileId]);
  const input: ValidateBoardInput = {
    canonicalBoard: canonical,
    proposedBoard: proposed,
    tilesById: frozenDescriptors,
    actorRackTileIds: rack,
    initialMeldCompleted: true,
    dictionaryProvider: new FixedDictionaryProvider({ status: "ALLOWED" }),
    policy: MVP_RULE_VALIDATION_POLICY,
  };
  const beforeBoards = JSON.stringify({ canonical, proposed });
  const beforeDescriptors = JSON.stringify([...frozenDescriptors]);
  const beforeRack = [...rack];

  const first = await validateProposedBoard(input);
  const secondResult = await validateProposedBoard(input);

  assert.deepEqual(secondResult, first);
  assert.equal(first.ok, true);
  assert.equal(JSON.stringify({ canonical, proposed }), beforeBoards);
  assert.equal(JSON.stringify([...frozenDescriptors]), beforeDescriptors);
  assert.deepEqual([...rack], beforeRack);
  assert.equal(rack.has(newFinal.tileId), true);
});
