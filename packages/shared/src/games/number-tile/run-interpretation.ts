import {
  NUMBER_TILE_NUMBERS,
  type NumberTileColor,
  type NumberTileNumber,
} from "./turn-command-contracts.js";

/** Number-only face input. Callers retain physical identities; null means Joker.
 * The server supplies faces resolved from its canonical physical Tile records. */
export type NumberTileRunFace = Readonly<{
  number: NumberTileNumber;
  color: NumberTileColor;
}> | null;

export type NumberTileRunSolution = Readonly<{
  orderedIndices: readonly number[];
  jokerNumber: NumberTileNumber | null;
  value: number;
}>;

export type NumberTileRunDerivation =
  | Readonly<{ status: "INVALID" }>
  | Readonly<{ status: "AMBIGUOUS"; candidates: readonly NumberTileRunSolution[] }>
  | Readonly<{ status: "VALID"; solution: NumberTileRunSolution }>;

/** Enumerates complete consecutive ranges, never chooses an arbitrary Joker face.
 * Unique sets ignore insertion order. Only genuinely ambiguous sets use an
 * already valid ordered sequence as explicit numeric intent. */
export function deriveNumberTileRun(
  faces: readonly NumberTileRunFace[],
): NumberTileRunDerivation {
  const ordinary = faces.flatMap((face, index) => face === null ? [] : [{ face, index }]);
  const jokerCount = faces.length - ordinary.length;
  if (faces.length < 3 || faces.length > 13 || jokerCount > 1 || ordinary.length < 2 ||
    ordinary.some(({ face }) => face.color !== ordinary[0]!.face.color) ||
    new Set(ordinary.map(({ face }) => face.number)).size !== ordinary.length) {
    return Object.freeze({ status: "INVALID" });
  }

  const jokerIndex = faces.indexOf(null);
  const candidates: NumberTileRunSolution[] = [];
  for (const start of NUMBER_TILE_NUMBERS) {
    const end = start + faces.length - 1;
    if (end > 13 || ordinary.some(({ face }) => face.number < start || face.number > end)) continue;
    const range = NUMBER_TILE_NUMBERS.filter(number => number >= start && number <= end);
    const missing = range.filter(number => !ordinary.some(({ face }) => face.number === number));
    if (missing.length !== jokerCount) continue;
    candidates.push(Object.freeze({
      orderedIndices: Object.freeze(range.map(number =>
        ordinary.find(({ face }) => face.number === number)?.index ?? jokerIndex)),
      jokerNumber: missing[0] ?? null,
      value: range.reduce<number>((total, number) => total + number, 0),
    }));
  }

  if (candidates.length === 0) return Object.freeze({ status: "INVALID" });
  const solution = candidates.length === 1 ? candidates[0] : candidates.find(candidate =>
    candidate.orderedIndices.every((index, canonicalIndex) => index === canonicalIndex));
  return solution === undefined
    ? Object.freeze({ status: "AMBIGUOUS", candidates: Object.freeze(candidates) })
    : Object.freeze({ status: "VALID", solution });
}
