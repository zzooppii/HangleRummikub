import type { PlayerId } from "@hangul-rummikub/shared";

export type NumberTileFinishDecision =
  | Readonly<{
      reason: "RACK_EMPTY";
      winnerPlayerId: PlayerId;
    }>
  | Readonly<{
      reason: "LAST_PLAYER_STANDING";
      winnerPlayerId: PlayerId;
    }>
  | Readonly<{
      reason: "STALEMATE";
    }>;

export type NumberTileForfeitTransition = Readonly<{
  changed: boolean;
  forfeitedPlayerIds: ReadonlySet<PlayerId>;
  noPlayPlayerIds: readonly PlayerId[];
}>;

export type NumberTileOfflineTimeoutDecision = Readonly<{
  streak: 1 | 2;
  shouldForfeit: boolean;
}>;

type NumberTilePlayerSetInput = Readonly<{
  turnOrder: readonly PlayerId[];
  forfeitedPlayerIds: ReadonlySet<PlayerId>;
}>;

class NumberTileReadonlyPlayerSet implements ReadonlySet<PlayerId> {
  readonly #values: Set<PlayerId>;

  constructor(values: Iterable<PlayerId>) {
    this.#values = new Set(values);
    Object.freeze(this);
  }

  get size(): number {
    return this.#values.size;
  }

  has(value: PlayerId): boolean {
    return this.#values.has(value);
  }

  entries(): SetIterator<[PlayerId, PlayerId]> {
    return this.#values.entries();
  }

  keys(): SetIterator<PlayerId> {
    return this.#values.keys();
  }

  values(): SetIterator<PlayerId> {
    return this.#values.values();
  }

  forEach(
    callbackfn: (
      value: PlayerId,
      value2: PlayerId,
      set: ReadonlySet<PlayerId>,
    ) => void,
    thisArg?: unknown,
  ): void {
    this.#values.forEach((value) =>
      callbackfn.call(thisArg, value, value, this),
    );
  }

  [Symbol.iterator](): SetIterator<PlayerId> {
    return this.#values[Symbol.iterator]();
  }
}

export function createNumberTileReadonlyPlayerSet(
  values: Iterable<PlayerId> = [],
): ReadonlySet<PlayerId> {
  return new NumberTileReadonlyPlayerSet(values);
}

export type NumberTileNoPlayInput = NumberTilePlayerSetInput &
  Readonly<{
    noPlayPlayerIds: readonly PlayerId[];
    actorPlayerId: PlayerId;
    poolTileCount: number;
  }>;

export type NumberTileFinishInput = NumberTilePlayerSetInput &
  Readonly<{
    noPlayPlayerIds: readonly PlayerId[];
    poolTileCount: number;
    rackEmptyPlayerId: PlayerId | null;
  }>;

function validatePoolTileCount(poolTileCount: number): void {
  if (!Number.isSafeInteger(poolTileCount) || poolTileCount < 0) {
    throw new RangeError(
      "Number Tile pool count must be a non-negative safe integer.",
    );
  }
}

function validatePlayerSets(input: NumberTilePlayerSetInput): void {
  if (input.turnOrder.length < 2 || input.turnOrder.length > 4) {
    throw new Error("Number Tile turn order must contain two to four Players.");
  }
  if (new Set(input.turnOrder).size !== input.turnOrder.length) {
    throw new Error("Number Tile turn order must contain unique Players.");
  }
  if (
    [...input.forfeitedPlayerIds].some(
      (playerId) => !input.turnOrder.includes(playerId),
    )
  ) {
    throw new Error("Number Tile forfeit state references an unknown Player.");
  }
}

function validateNoPlayTracker(
  input: NumberTilePlayerSetInput &
    Readonly<{ noPlayPlayerIds: readonly PlayerId[] }>,
): void {
  if (new Set(input.noPlayPlayerIds).size !== input.noPlayPlayerIds.length) {
    throw new Error("Number Tile no-play state must not contain duplicates.");
  }
  if (
    [...input.noPlayPlayerIds].some(
      (playerId) => !input.turnOrder.includes(playerId),
    )
  ) {
    throw new Error("Number Tile no-play state references an unknown Player.");
  }
}

export function canNumberTilePass(poolTileCount: number): boolean {
  validatePoolTileCount(poolTileCount);
  return poolTileCount === 0;
}

/** Caller applies the timeout draw/no-tile action before honoring shouldForfeit. */
export function advanceNumberTileOfflineTimeoutStreak(
  currentStreak: number,
): NumberTileOfflineTimeoutDecision {
  if (currentStreak !== 0 && currentStreak !== 1) {
    throw new Error(
      "Active Number Tile offline timeout streak must be zero or one.",
    );
  }
  const streak = currentStreak === 0 ? 1 : 2;
  return Object.freeze({ streak, shouldForfeit: streak === 2 });
}

/** A successful platform resume resets only this Number-owned rule state. */
export function resetNumberTileOfflineTimeoutStreak(): 0 {
  return 0;
}

export function numberTileEligiblePlayerIds(
  turnOrder: readonly PlayerId[],
  forfeitedPlayerIds: ReadonlySet<PlayerId>,
): readonly PlayerId[] {
  validatePlayerSets({ turnOrder, forfeitedPlayerIds });
  return Object.freeze(
    turnOrder.filter((playerId) => !forfeitedPlayerIds.has(playerId)),
  );
}

/**
 * Removes forfeited Players from the tracker while preserving records for all
 * still-eligible Players. Presence is deliberately not part of eligibility.
 */
export function pruneNumberTileNoPlayTracker(
  turnOrder: readonly PlayerId[],
  forfeitedPlayerIds: ReadonlySet<PlayerId>,
  noPlayPlayerIds: readonly PlayerId[],
): readonly PlayerId[] {
  validatePlayerSets({ turnOrder, forfeitedPlayerIds });
  validateNoPlayTracker({ turnOrder, forfeitedPlayerIds, noPlayPlayerIds });
  return Object.freeze(
    turnOrder.filter(
      (playerId) =>
        !forfeitedPlayerIds.has(playerId) && noPlayPlayerIds.includes(playerId),
    ),
  );
}

/** Records either an explicit Pass or a pool-empty timeout no-tile action. */
export function recordNumberTileNoPlay(
  input: NumberTileNoPlayInput,
): readonly PlayerId[] {
  validatePlayerSets(input);
  validateNoPlayTracker(input);
  validatePoolTileCount(input.poolTileCount);
  if (input.poolTileCount !== 0) {
    throw new Error(
      "Number Tile no-play can be recorded only when the pool is empty.",
    );
  }
  if (!input.turnOrder.includes(input.actorPlayerId)) {
    throw new Error("Number Tile no-play actor must be a canonical Player.");
  }
  if (input.forfeitedPlayerIds.has(input.actorPlayerId)) {
    throw new Error(
      "A forfeited Number Tile Player cannot record a no-play turn.",
    );
  }

  const current = pruneNumberTileNoPlayTracker(
    input.turnOrder,
    input.forfeitedPlayerIds,
    input.noPlayPlayerIds,
  );
  return current.includes(input.actorPlayerId)
    ? current
    : Object.freeze(
        input.turnOrder.filter(
          (playerId) =>
            current.includes(playerId) || playerId === input.actorPlayerId,
        ),
      );
}

/** A valid Submit or the draw that empties the pool starts a fresh cycle. */
export function resetNumberTileNoPlayTracker(): readonly PlayerId[] {
  return Object.freeze([]);
}

export function isNumberTileNoPlayCycleComplete(
  turnOrder: readonly PlayerId[],
  forfeitedPlayerIds: ReadonlySet<PlayerId>,
  noPlayPlayerIds: readonly PlayerId[],
): boolean {
  validateNoPlayTracker({ turnOrder, forfeitedPlayerIds, noPlayPlayerIds });
  const eligiblePlayerIds = numberTileEligiblePlayerIds(
    turnOrder,
    forfeitedPlayerIds,
  );
  return (
    eligiblePlayerIds.length >= 2 &&
    eligiblePlayerIds.every((playerId) => noPlayPlayerIds.includes(playerId))
  );
}

export function nextEligibleNumberTilePlayer(
  turnOrder: readonly PlayerId[],
  forfeitedPlayerIds: ReadonlySet<PlayerId>,
  currentPlayerId: PlayerId,
): PlayerId | null {
  validatePlayerSets({ turnOrder, forfeitedPlayerIds });
  const currentIndex = turnOrder.indexOf(currentPlayerId);
  if (currentIndex < 0) {
    throw new Error("Current Number Tile Player must belong to the turn order.");
  }

  for (let offset = 1; offset <= turnOrder.length; offset += 1) {
    const candidate = turnOrder[(currentIndex + offset) % turnOrder.length];
    if (candidate !== undefined && !forfeitedPlayerIds.has(candidate)) {
      return candidate;
    }
  }
  return null;
}

export function applyNumberTileForfeit(
  turnOrder: readonly PlayerId[],
  forfeitedPlayerIds: ReadonlySet<PlayerId>,
  noPlayPlayerIds: readonly PlayerId[],
  playerId: PlayerId,
): NumberTileForfeitTransition {
  validatePlayerSets({ turnOrder, forfeitedPlayerIds });
  validateNoPlayTracker({ turnOrder, forfeitedPlayerIds, noPlayPlayerIds });
  if (!turnOrder.includes(playerId)) {
    throw new Error("Number Tile forfeit actor must be a canonical Player.");
  }

  if (forfeitedPlayerIds.has(playerId)) {
    return Object.freeze({
      changed: false,
      forfeitedPlayerIds: createNumberTileReadonlyPlayerSet(
        forfeitedPlayerIds,
      ),
      noPlayPlayerIds: pruneNumberTileNoPlayTracker(
        turnOrder,
        forfeitedPlayerIds,
        noPlayPlayerIds,
      ),
    });
  }

  const eligiblePlayerIds = numberTileEligiblePlayerIds(
    turnOrder,
    forfeitedPlayerIds,
  );
  if (eligiblePlayerIds.length <= 1) {
    throw new Error(
      "The final eligible Number Tile Player cannot forfeit after terminal play.",
    );
  }

  const nextForfeitedPlayerIds = new Set(forfeitedPlayerIds);
  nextForfeitedPlayerIds.add(playerId);
  return Object.freeze({
    changed: true,
    forfeitedPlayerIds: createNumberTileReadonlyPlayerSet(
      nextForfeitedPlayerIds,
    ),
    noPlayPlayerIds: pruneNumberTileNoPlayTracker(
      turnOrder,
      nextForfeitedPlayerIds,
      noPlayPlayerIds,
    ),
  });
}

/**
 * Evaluates canonical terminal precedence after any required timeout action and
 * forfeit have already been applied by the caller.
 */
export function evaluateNumberTileFinish(
  input: NumberTileFinishInput,
): NumberTileFinishDecision | null {
  validatePlayerSets(input);
  validateNoPlayTracker(input);
  validatePoolTileCount(input.poolTileCount);

  if (input.rackEmptyPlayerId !== null) {
    if (!input.turnOrder.includes(input.rackEmptyPlayerId)) {
      throw new Error(
        "Rack-empty winner must be a canonical Number Tile Player.",
      );
    }
    if (input.forfeitedPlayerIds.has(input.rackEmptyPlayerId)) {
      throw new Error(
        "A forfeited Number Tile Player cannot win by emptying a rack.",
      );
    }
    return Object.freeze({
      reason: "RACK_EMPTY",
      winnerPlayerId: input.rackEmptyPlayerId,
    });
  }

  const eligiblePlayerIds = numberTileEligiblePlayerIds(
    input.turnOrder,
    input.forfeitedPlayerIds,
  );
  if (eligiblePlayerIds.length === 0) {
    throw new Error(
      "Number Tile cannot reach an all-players-forfeited terminal state.",
    );
  }
  if (eligiblePlayerIds.length === 1) {
    return Object.freeze({
      reason: "LAST_PLAYER_STANDING",
      winnerPlayerId: eligiblePlayerIds[0]!,
    });
  }
  if (
    input.poolTileCount === 0 &&
    isNumberTileNoPlayCycleComplete(
      input.turnOrder,
      input.forfeitedPlayerIds,
      input.noPlayPlayerIds,
    )
  ) {
    return Object.freeze({ reason: "STALEMATE" });
  }
  return null;
}
