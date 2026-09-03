import type { TileId } from "@hangul-rummikub/shared";

export type AssignedJamoComponent = Readonly<{
  tileId: TileId;
  assignedSymbol: string;
}>;

export type SyllableCompositionInput = Readonly<{
  choseong: readonly AssignedJamoComponent[];
  jungseong: readonly AssignedJamoComponent[];
  jongseong: readonly AssignedJamoComponent[];
}>;

export type WordCompositionInput = Readonly<{
  syllables: readonly SyllableCompositionInput[];
}>;

export type ChoseongSymbol =
  | "ㄱ"
  | "ㄲ"
  | "ㄴ"
  | "ㄷ"
  | "ㄸ"
  | "ㄹ"
  | "ㅁ"
  | "ㅂ"
  | "ㅃ"
  | "ㅅ"
  | "ㅆ"
  | "ㅇ"
  | "ㅈ"
  | "ㅉ"
  | "ㅊ"
  | "ㅋ"
  | "ㅌ"
  | "ㅍ"
  | "ㅎ";

export type JungseongSymbol =
  | "ㅏ"
  | "ㅐ"
  | "ㅑ"
  | "ㅒ"
  | "ㅓ"
  | "ㅔ"
  | "ㅕ"
  | "ㅖ"
  | "ㅗ"
  | "ㅘ"
  | "ㅙ"
  | "ㅚ"
  | "ㅛ"
  | "ㅜ"
  | "ㅝ"
  | "ㅞ"
  | "ㅟ"
  | "ㅠ"
  | "ㅡ"
  | "ㅢ"
  | "ㅣ";

export type JongseongSymbol =
  | "ㄱ"
  | "ㄲ"
  | "ㄳ"
  | "ㄴ"
  | "ㄵ"
  | "ㄶ"
  | "ㄷ"
  | "ㄹ"
  | "ㄺ"
  | "ㄻ"
  | "ㄼ"
  | "ㄽ"
  | "ㄾ"
  | "ㄿ"
  | "ㅀ"
  | "ㅁ"
  | "ㅂ"
  | "ㅄ"
  | "ㅅ"
  | "ㅆ"
  | "ㅇ"
  | "ㅈ"
  | "ㅊ"
  | "ㅋ"
  | "ㅌ"
  | "ㅍ"
  | "ㅎ";

export type ComposedSyllable = Readonly<{
  choseong: ChoseongSymbol;
  jungseong: JungseongSymbol;
  jongseong: JongseongSymbol | null;
  syllable: string;
}>;

export type ComposedWord = Readonly<{
  syllables: readonly ComposedSyllable[];
  word: string;
}>;

export type HangulCompositionError =
  | Readonly<{ code: "EMPTY_WORD" }>
  | Readonly<{
      code:
        | "INVALID_CHOSEONG"
        | "INVALID_JUNGSEONG"
        | "INVALID_JONGSEONG"
        | "DUPLICATE_TILE_REFERENCE";
      syllableIndex: number;
    }>;

export type HangulCompositionResult<T> =
  | Readonly<{ ok: true; value: T }>
  | Readonly<{ ok: false; error: HangulCompositionError }>;

// These arrays are in the normative Unicode modern Hangul L/V/T order.
const CHOSEONG_BY_L_INDEX: readonly ChoseongSymbol[] = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄸ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅃ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅉ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];

const JUNGSEONG_BY_V_INDEX: readonly JungseongSymbol[] = [
  "ㅏ",
  "ㅐ",
  "ㅑ",
  "ㅒ",
  "ㅓ",
  "ㅔ",
  "ㅕ",
  "ㅖ",
  "ㅗ",
  "ㅘ",
  "ㅙ",
  "ㅚ",
  "ㅛ",
  "ㅜ",
  "ㅝ",
  "ㅞ",
  "ㅟ",
  "ㅠ",
  "ㅡ",
  "ㅢ",
  "ㅣ",
];

// The array offset is TIndex - 1 because TIndex 0 means no jongseong.
const JONGSEONG_BY_NON_EMPTY_T_INDEX: readonly JongseongSymbol[] = [
  "ㄱ",
  "ㄲ",
  "ㄳ",
  "ㄴ",
  "ㄵ",
  "ㄶ",
  "ㄷ",
  "ㄹ",
  "ㄺ",
  "ㄻ",
  "ㄼ",
  "ㄽ",
  "ㄾ",
  "ㄿ",
  "ㅀ",
  "ㅁ",
  "ㅂ",
  "ㅄ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];

const SINGLE_JUNGSEONG_SYMBOLS: readonly JungseongSymbol[] = [
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
];

const SINGLE_JONGSEONG_SYMBOLS: readonly JongseongSymbol[] = [
  "ㄱ",
  "ㄲ",
  "ㄴ",
  "ㄷ",
  "ㄹ",
  "ㅁ",
  "ㅂ",
  "ㅅ",
  "ㅆ",
  "ㅇ",
  "ㅈ",
  "ㅊ",
  "ㅋ",
  "ㅌ",
  "ㅍ",
  "ㅎ",
];

type TwoComponentResolution<TSymbol extends string> = Readonly<{
  components: readonly [string, string];
  symbol: TSymbol;
}>;

const COMPOUND_JUNGSEONGS: readonly TwoComponentResolution<JungseongSymbol>[] = [
  { components: ["ㅗ", "ㅏ"], symbol: "ㅘ" },
  { components: ["ㅗ", "ㅐ"], symbol: "ㅙ" },
  { components: ["ㅗ", "ㅣ"], symbol: "ㅚ" },
  { components: ["ㅜ", "ㅓ"], symbol: "ㅝ" },
  { components: ["ㅜ", "ㅔ"], symbol: "ㅞ" },
  { components: ["ㅜ", "ㅣ"], symbol: "ㅟ" },
  { components: ["ㅡ", "ㅣ"], symbol: "ㅢ" },
];

const CLUSTER_JONGSEONGS: readonly TwoComponentResolution<JongseongSymbol>[] = [
  { components: ["ㄱ", "ㅅ"], symbol: "ㄳ" },
  { components: ["ㄴ", "ㅈ"], symbol: "ㄵ" },
  { components: ["ㄴ", "ㅎ"], symbol: "ㄶ" },
  { components: ["ㄹ", "ㄱ"], symbol: "ㄺ" },
  { components: ["ㄹ", "ㅁ"], symbol: "ㄻ" },
  { components: ["ㄹ", "ㅂ"], symbol: "ㄼ" },
  { components: ["ㄹ", "ㅅ"], symbol: "ㄽ" },
  { components: ["ㄹ", "ㅌ"], symbol: "ㄾ" },
  { components: ["ㄹ", "ㅍ"], symbol: "ㄿ" },
  { components: ["ㄹ", "ㅎ"], symbol: "ㅀ" },
  { components: ["ㅂ", "ㅅ"], symbol: "ㅄ" },
];

const HANGUL_SYLLABLE_BASE = 0xac00;
const JUNGSEONG_COUNT = 21;
const JONGSEONG_COUNT = 28;

type IndexedSymbol<TSymbol extends string> = Readonly<{
  symbol: TSymbol;
  index: number;
}>;

type IndexedJongseong = Readonly<{
  symbol: JongseongSymbol | null;
  index: number;
}>;

function success<T>(value: T): HangulCompositionResult<T> {
  return { ok: true, value };
}

function invalid(
  code:
    | "INVALID_CHOSEONG"
    | "INVALID_JUNGSEONG"
    | "INVALID_JONGSEONG"
    | "DUPLICATE_TILE_REFERENCE",
  syllableIndex: number,
): HangulCompositionResult<never> {
  return { ok: false, error: { code, syllableIndex } };
}

function findIndex(values: readonly string[], value: string): number {
  return values.indexOf(value);
}

function findTwoComponentResolution<TSymbol extends string>(
  definitions: readonly TwoComponentResolution<TSymbol>[],
  first: string,
  second: string,
): TwoComponentResolution<TSymbol> | undefined {
  return definitions.find(
    ({ components }) => components[0] === first && components[1] === second,
  );
}

function resolveChoseong(
  components: readonly AssignedJamoComponent[],
  syllableIndex: number,
): HangulCompositionResult<IndexedSymbol<ChoseongSymbol>> {
  if (components.length !== 1) {
    return invalid("INVALID_CHOSEONG", syllableIndex);
  }

  const component = components[0];
  if (component === undefined) {
    return invalid("INVALID_CHOSEONG", syllableIndex);
  }

  const index = findIndex(CHOSEONG_BY_L_INDEX, component.assignedSymbol);
  const symbol = CHOSEONG_BY_L_INDEX[index];
  if (index < 0 || symbol === undefined) {
    return invalid("INVALID_CHOSEONG", syllableIndex);
  }

  return success({ symbol, index });
}

function resolveJungseong(
  components: readonly AssignedJamoComponent[],
  syllableIndex: number,
): HangulCompositionResult<IndexedSymbol<JungseongSymbol>> {
  let symbol: JungseongSymbol | undefined;

  if (components.length === 1) {
    const component = components[0];
    if (
      component !== undefined &&
      findIndex(SINGLE_JUNGSEONG_SYMBOLS, component.assignedSymbol) >= 0
    ) {
      const index = findIndex(
        JUNGSEONG_BY_V_INDEX,
        component.assignedSymbol,
      );
      symbol = JUNGSEONG_BY_V_INDEX[index];
    }
  } else if (components.length === 2) {
    const first = components[0];
    const second = components[1];
    if (first !== undefined && second !== undefined) {
      symbol = findTwoComponentResolution(
        COMPOUND_JUNGSEONGS,
        first.assignedSymbol,
        second.assignedSymbol,
      )?.symbol;
    }
  }

  if (symbol === undefined) {
    return invalid("INVALID_JUNGSEONG", syllableIndex);
  }

  const index = findIndex(JUNGSEONG_BY_V_INDEX, symbol);
  if (index < 0) {
    return invalid("INVALID_JUNGSEONG", syllableIndex);
  }

  return success({ symbol, index });
}

function resolveJongseong(
  components: readonly AssignedJamoComponent[],
  syllableIndex: number,
): HangulCompositionResult<IndexedJongseong> {
  if (components.length === 0) {
    return success({ symbol: null, index: 0 });
  }

  let symbol: JongseongSymbol | undefined;

  if (components.length === 1) {
    const component = components[0];
    if (
      component !== undefined &&
      findIndex(SINGLE_JONGSEONG_SYMBOLS, component.assignedSymbol) >= 0
    ) {
      const index = findIndex(
        JONGSEONG_BY_NON_EMPTY_T_INDEX,
        component.assignedSymbol,
      );
      symbol = JONGSEONG_BY_NON_EMPTY_T_INDEX[index];
    }
  } else if (components.length === 2) {
    const first = components[0];
    const second = components[1];
    if (first !== undefined && second !== undefined) {
      symbol = findTwoComponentResolution(
        CLUSTER_JONGSEONGS,
        first.assignedSymbol,
        second.assignedSymbol,
      )?.symbol;
    }
  }

  if (symbol === undefined) {
    return invalid("INVALID_JONGSEONG", syllableIndex);
  }

  const nonEmptyIndex = findIndex(JONGSEONG_BY_NON_EMPTY_T_INDEX, symbol);
  if (nonEmptyIndex < 0) {
    return invalid("INVALID_JONGSEONG", syllableIndex);
  }

  return success({ symbol, index: nonEmptyIndex + 1 });
}

function findDuplicateTileReference(
  input: SyllableCompositionInput,
): boolean {
  const seenTileIds = new Set<TileId>();
  const roles = [input.choseong, input.jungseong, input.jongseong];

  for (const components of roles) {
    for (const component of components) {
      if (seenTileIds.has(component.tileId)) {
        return true;
      }
      seenTileIds.add(component.tileId);
    }
  }

  return false;
}

function composeSyllableAt(
  input: SyllableCompositionInput,
  syllableIndex: number,
): HangulCompositionResult<ComposedSyllable> {
  if (findDuplicateTileReference(input)) {
    return invalid("DUPLICATE_TILE_REFERENCE", syllableIndex);
  }

  const choseong = resolveChoseong(input.choseong, syllableIndex);
  if (!choseong.ok) {
    return choseong;
  }

  const jungseong = resolveJungseong(input.jungseong, syllableIndex);
  if (!jungseong.ok) {
    return jungseong;
  }

  const jongseong = resolveJongseong(input.jongseong, syllableIndex);
  if (!jongseong.ok) {
    return jongseong;
  }

  const codePoint =
    HANGUL_SYLLABLE_BASE +
    (choseong.value.index * JUNGSEONG_COUNT + jungseong.value.index) *
      JONGSEONG_COUNT +
    jongseong.value.index;
  const syllable = String.fromCodePoint(codePoint).normalize("NFC");

  return success({
    choseong: choseong.value.symbol,
    jungseong: jungseong.value.symbol,
    jongseong: jongseong.value.symbol,
    syllable,
  });
}

export function composeSyllable(
  input: SyllableCompositionInput,
): HangulCompositionResult<ComposedSyllable> {
  return composeSyllableAt(input, 0);
}

export function composeWord(
  input: WordCompositionInput,
): HangulCompositionResult<ComposedWord> {
  if (input.syllables.length === 0) {
    return { ok: false, error: { code: "EMPTY_WORD" } };
  }

  const seenTileIds = new Set<TileId>();
  for (
    let syllableIndex = 0;
    syllableIndex < input.syllables.length;
    syllableIndex += 1
  ) {
    const syllable = input.syllables[syllableIndex];
    if (syllable === undefined) {
      return invalid("INVALID_CHOSEONG", syllableIndex);
    }

    const roles = [syllable.choseong, syllable.jungseong, syllable.jongseong];
    for (const components of roles) {
      for (const component of components) {
        if (seenTileIds.has(component.tileId)) {
          return invalid("DUPLICATE_TILE_REFERENCE", syllableIndex);
        }
        seenTileIds.add(component.tileId);
      }
    }
  }

  const composedSyllables: ComposedSyllable[] = [];
  for (
    let syllableIndex = 0;
    syllableIndex < input.syllables.length;
    syllableIndex += 1
  ) {
    const syllable = input.syllables[syllableIndex];
    if (syllable === undefined) {
      return invalid("INVALID_CHOSEONG", syllableIndex);
    }

    const result = composeSyllableAt(syllable, syllableIndex);
    if (!result.ok) {
      return result;
    }
    composedSyllables.push(result.value);
  }

  const word = composedSyllables
    .map(({ syllable }) => syllable)
    .join("")
    .normalize("NFC");

  return success({ syllables: composedSyllables, word });
}
