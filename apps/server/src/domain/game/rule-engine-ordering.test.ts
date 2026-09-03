import assert from "node:assert/strict";
import test from "node:test";

import {
  TileIdSchema,
  type TileId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import type {
  DictionaryLookupResult,
  DictionaryProvider,
} from "../../ports/system.js";
import type {
  Board,
  BoardSyllable,
  BoardTilePlacement,
  TileDescriptor,
  WordGroup,
} from "./board.js";
import {
  MVP_RULE_VALIDATION_POLICY,
  validateProposedBoard,
  type ValidateBoardInput,
} from "./rule-engine.js";

class RecordingDictionaryProvider implements DictionaryProvider {
  readonly dictionaryVersion = "rule-engine-ordering-test-v1";
  readonly words: string[] = [];

  constructor(private readonly result: DictionaryLookupResult) {}

  lookup(word: string): Promise<DictionaryLookupResult> {
    this.words.push(word);
    return Promise.resolve(this.result);
  }
}

class MutatingDictionaryProvider implements DictionaryProvider {
  readonly dictionaryVersion = "rule-engine-snapshot-test-v1";
  readonly words: string[] = [];

  constructor(private readonly target: { assignedSymbol: string }) {}

  lookup(word: string): Promise<DictionaryLookupResult> {
    this.words.push(word);
    if (this.words.length === 1) {
      this.target.assignedSymbol = "ㅏ";
    }
    return Promise.resolve({ status: "ALLOWED" });
  }
}

const VOWEL_SYMBOLS: ReadonlySet<string> = new Set([
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

function placement(id: string, assignedSymbol: string): BoardTilePlacement {
  return { tileId: tileId(id), assignedSymbol };
}

function syllable(
  idPrefix: string,
  choseong: string,
  jungseong: readonly string[],
): BoardSyllable {
  return {
    choseong: [placement(`${idPrefix}-c`, choseong)],
    jungseong: jungseong.map((symbol, index) =>
      placement(`${idPrefix}-v${index}`, symbol),
    ),
    jongseong: [],
  };
}

function twoSyllableGroup(
  groupId: string,
  firstChoseong: string,
  firstJungseong: readonly string[],
  secondChoseong: string,
  secondJungseong: readonly string[],
): WordGroup {
  return {
    groupId,
    syllables: [
      syllable(`${groupId}-s0`, firstChoseong, firstJungseong),
      syllable(`${groupId}-s1`, secondChoseong, secondJungseong),
    ],
  };
}

function placementsOf(board: Board): readonly BoardTilePlacement[] {
  const placements: BoardTilePlacement[] = [];

  for (const group of board.wordGroups) {
    for (const item of group.syllables) {
      placements.push(...item.choseong, ...item.jungseong, ...item.jongseong);
    }
  }

  return placements;
}

function descriptorMap(board: Board): Map<TileId, TileDescriptor> {
  const descriptors = new Map<TileId, TileDescriptor>();

  for (const component of placementsOf(board)) {
    descriptors.set(component.tileId, {
      tileId: component.tileId,
      kind: "ORDINARY",
      physicalType: "ORDERING_TEST_TILE",
      sourceBag: VOWEL_SYMBOLS.has(component.assignedSymbol)
        ? "VOWEL"
        : "CONSONANT",
      allowedSymbols: [component.assignedSymbol],
    });
  }

  return descriptors;
}

function inputFor(
  proposedBoard: Board,
  dictionaryProvider: DictionaryProvider,
  tilesById: ReadonlyMap<TileId, TileDescriptor> = descriptorMap(proposedBoard),
  actorRackTileIds: ReadonlySet<TileId> = new Set(
    placementsOf(proposedBoard).map((component) => component.tileId),
  ),
): ValidateBoardInput {
  return {
    canonicalBoard: { wordGroups: [] },
    proposedBoard,
    tilesById,
    actorRackTileIds,
    initialMeldCompleted: true,
    dictionaryProvider,
    policy: MVP_RULE_VALIDATION_POLICY,
  };
}

test("known but unowned new Tile is rejected before its physical assignment is interpreted", async () => {
  const unowned = placement("unowned-disallowed", "ㅁ");
  const proposedBoard: Board = {
    wordGroups: [
      {
        groupId: "ownership-first",
        syllables: [
          {
            choseong: [unowned],
            jungseong: [placement("ownership-first-v0", "ㅏ")],
            jongseong: [],
          },
          syllable("ownership-first-s1", "ㄴ", ["ㅏ"]),
        ],
      },
    ],
  };
  const tilesById = descriptorMap(proposedBoard);
  tilesById.set(unowned.tileId, {
    tileId: unowned.tileId,
    kind: "ORDINARY",
    physicalType: "GIYEOK_ONLY_TEST_TILE",
    sourceBag: "CONSONANT",
    allowedSymbols: ["ㄱ"],
  });
  const actorRackTileIds = new Set(
    placementsOf(proposedBoard)
      .filter((component) => component.tileId !== unowned.tileId)
      .map((component) => component.tileId),
  );
  const provider = new RecordingDictionaryProvider({ status: "ALLOWED" });

  const result = await validateProposedBoard(
    inputFor(proposedBoard, provider, tilesById, actorRackTileIds),
  );

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "TILE_NOT_OWNED");
  }
  assert.deepEqual(provider.words, []);
});

test("an earlier WordGroup dictionary rejection wins before a later composition failure", async () => {
  const firstGroup = twoSyllableGroup("first", "ㄱ", ["ㅏ"], "ㄴ", ["ㅏ"]);
  const invalidLaterGroup = twoSyllableGroup(
    "later-invalid",
    "ㄷ",
    ["ㅏ", "ㅗ"],
    "ㄹ",
    ["ㅏ"],
  );
  const proposedBoard: Board = {
    wordGroups: [firstGroup, invalidLaterGroup],
  };
  const provider = new RecordingDictionaryProvider({ status: "NOT_ALLOWED" });

  const result = await validateProposedBoard(inputFor(proposedBoard, provider));

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "WORD_NOT_ALLOWED");
    assert.equal(result.error.groupId, "first");
  }
  assert.deepEqual(provider.words, ["가나"]);
});

test("ordinary descriptor permission cannot collapse a logical compound into one component", async () => {
  const cases = [
    { symbol: "ㅘ", role: "JUNGSEONG" },
    { symbol: "ㄳ", role: "JONGSEONG" },
  ] as const;

  for (const [index, testCase] of cases.entries()) {
    const compound = placement(`ordinary-direct-compound-${index}`, testCase.symbol);
    const proposedBoard: Board = {
      wordGroups: [
        {
          groupId: `ordinary-direct-compound-group-${index}`,
          syllables: [
            {
              choseong: [placement(`ordinary-direct-compound-c0-${index}`, "ㄱ")],
              jungseong:
                testCase.role === "JUNGSEONG"
                  ? [compound]
                  : [placement(`ordinary-direct-compound-v0-${index}`, "ㅏ")],
              jongseong: testCase.role === "JONGSEONG" ? [compound] : [],
            },
            syllable(`ordinary-direct-compound-s1-${index}`, "ㄴ", ["ㅏ"]),
          ],
        },
      ],
    };
    const tilesById = descriptorMap(proposedBoard);
    tilesById.set(compound.tileId, {
      tileId: compound.tileId,
      kind: "ORDINARY",
      physicalType: "MISCONFIGURED_COMPOUND_TEST_TILE",
      sourceBag: testCase.role === "JUNGSEONG" ? "VOWEL" : "CONSONANT",
      allowedSymbols: [testCase.symbol],
    });
    const provider = new RecordingDictionaryProvider({ status: "ALLOWED" });

    const result = await validateProposedBoard(
      inputFor(proposedBoard, provider, tilesById),
    );

    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "INVALID_HANGUL_COMPOSITION");
    }
    assert.deepEqual(provider.words, []);
  }
});

test("awaited dictionary lookup cannot mutate the snapshotted input used by later groups", async () => {
  const mutableSecondChoseong = {
    tileId: tileId("snapshot-second-c0"),
    assignedSymbol: "ㄷ",
  };
  const firstGroup = twoSyllableGroup("snapshot-first", "ㄱ", ["ㅏ"], "ㄴ", ["ㅏ"]);
  const secondGroup = {
    groupId: "snapshot-second",
    syllables: [
      {
        choseong: [mutableSecondChoseong],
        jungseong: [placement("snapshot-second-v0", "ㅏ")],
        jongseong: [],
      },
      syllable("snapshot-second-s1", "ㄹ", ["ㅏ"]),
    ],
  };
  const proposedBoard = { wordGroups: [firstGroup, secondGroup] };
  const provider = new MutatingDictionaryProvider(mutableSecondChoseong);

  const result = await validateProposedBoard(inputFor(proposedBoard, provider));

  assert.equal(mutableSecondChoseong.assignedSymbol, "ㅏ");
  assert.equal(result.ok, true);
  if (result.ok) {
    assert.deepEqual(result.value.composedWords, [
      { groupId: "snapshot-first", word: "가나" },
      { groupId: "snapshot-second", word: "다라" },
    ]);
  }
  assert.deepEqual(provider.words, ["가나", "다라"]);
});
