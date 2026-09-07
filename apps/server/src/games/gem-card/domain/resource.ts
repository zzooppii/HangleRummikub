export const GEM_BASIC_RESOURCES = Object.freeze([
  "DAWN",
  "TIDE",
  "GROVE",
  "EMBER",
  "ECHO",
] as const);

export type GemBasicResource = (typeof GEM_BASIC_RESOURCES)[number];

export const GEM_RESOURCES = Object.freeze([
  ...GEM_BASIC_RESOURCES,
  "PRISM",
] as const);

export type GemResource = (typeof GEM_RESOURCES)[number];

export type GemBasicResourceCounts = Readonly<
  Record<GemBasicResource, number>
>;

export type GemResourceCounts = Readonly<Record<GemResource, number>>;

export const GEM_RESOURCE_LIMIT = 9;

export const GEM_INITIAL_RESOURCE_TOTALS: GemResourceCounts = Object.freeze({
  DAWN: 7,
  TIDE: 7,
  GROVE: 7,
  EMBER: 7,
  ECHO: 7,
  PRISM: 5,
});

function requireCount(value: number, label: string): number {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${label} must be a non-negative safe integer.`);
  }
  return value;
}

function hasExactKeys(
  value: object,
  expectedKeys: readonly string[],
): boolean {
  const actualKeys = Object.keys(value).sort();
  const sortedExpected = [...expectedKeys].sort();
  return (
    actualKeys.length === sortedExpected.length &&
    actualKeys.every((key, index) => key === sortedExpected[index])
  );
}

export function isGemBasicResource(
  value: unknown,
): value is GemBasicResource {
  return (
    typeof value === "string" &&
    GEM_BASIC_RESOURCES.some((resource) => resource === value)
  );
}

export function isGemResource(value: unknown): value is GemResource {
  return (
    typeof value === "string" &&
    GEM_RESOURCES.some((resource) => resource === value)
  );
}

export function createGemBasicResourceCounts(
  counts: GemBasicResourceCounts,
): GemBasicResourceCounts {
  if (!hasExactKeys(counts, GEM_BASIC_RESOURCES)) {
    throw new Error("GEM basic resource counts must contain exactly five basic resources.");
  }
  return Object.freeze(
    Object.fromEntries(
      GEM_BASIC_RESOURCES.map((resource) => [
        resource,
        requireCount(counts[resource], `GEM ${resource} count`),
      ]),
    ) as Record<GemBasicResource, number>,
  );
}

export function createGemResourceCounts(
  counts: GemResourceCounts,
): GemResourceCounts {
  if (!hasExactKeys(counts, GEM_RESOURCES)) {
    throw new Error("GEM resource counts must contain exactly six resources.");
  }
  return Object.freeze(
    Object.fromEntries(
      GEM_RESOURCES.map((resource) => [
        resource,
        requireCount(counts[resource], `GEM ${resource} count`),
      ]),
    ) as Record<GemResource, number>,
  );
}

export function createEmptyGemBasicResourceCounts(): GemBasicResourceCounts {
  return createGemBasicResourceCounts({
    DAWN: 0,
    TIDE: 0,
    GROVE: 0,
    EMBER: 0,
    ECHO: 0,
  });
}

export function createEmptyGemResourceCounts(): GemResourceCounts {
  return createGemResourceCounts({
    DAWN: 0,
    TIDE: 0,
    GROVE: 0,
    EMBER: 0,
    ECHO: 0,
    PRISM: 0,
  });
}

export function createInitialGemSupply(): GemResourceCounts {
  return createGemResourceCounts(GEM_INITIAL_RESOURCE_TOTALS);
}

export function totalGemResources(counts: GemResourceCounts): number {
  return GEM_RESOURCES.reduce((total, resource) => total + counts[resource], 0);
}

export function assertGemResourceConservation(
  supply: GemResourceCounts,
  playerHoldings: readonly GemResourceCounts[],
): void {
  createGemResourceCounts(supply);
  playerHoldings.forEach(createGemResourceCounts);
  for (const resource of GEM_RESOURCES) {
    const total = playerHoldings.reduce(
      (sum, holdings) => sum + holdings[resource],
      supply[resource],
    );
    if (total !== GEM_INITIAL_RESOURCE_TOTALS[resource]) {
      throw new Error(`GEM ${resource} resource conservation failed.`);
    }
  }
}
