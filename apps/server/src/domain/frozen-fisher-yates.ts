import type { RandomSource } from "../ports/system.js";

export class FisherYatesRandomIndexError extends RangeError {
  constructor() {
    super("RandomSource returned an index outside the Fisher-Yates range.");
  }
}

/** Returns a detached, frozen shuffle without changing the caller's input. */
export function shuffleFrozen<TValue>(
  values: readonly TValue[],
  randomSource: RandomSource,
): readonly TValue[] {
  const shuffled = [...values];

  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const selectedIndex = randomSource.nextInt(index + 1);
    if (
      !Number.isSafeInteger(selectedIndex) ||
      selectedIndex < 0 ||
      selectedIndex > index
    ) {
      throw new FisherYatesRandomIndexError();
    }

    const currentValue = shuffled[index]!;
    shuffled[index] = shuffled[selectedIndex]!;
    shuffled[selectedIndex] = currentValue;
  }

  return Object.freeze(shuffled);
}
