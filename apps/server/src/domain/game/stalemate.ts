import type { PlayerId } from "@hangul-rummikub/shared";

export function activePlayerIds(
  turnOrder: readonly PlayerId[],
  forfeitedPlayerIds: ReadonlySet<PlayerId>,
): readonly PlayerId[] {
  return Object.freeze(
    turnOrder.filter((playerId) => !forfeitedPlayerIds.has(playerId)),
  );
}

/** Keeps only still-active Players while preserving original turn order. */
export function pruneNoMoveTurnEnds(
  turnOrder: readonly PlayerId[],
  forfeitedPlayerIds: ReadonlySet<PlayerId>,
  current: ReadonlySet<PlayerId>,
): ReadonlySet<PlayerId> {
  return Object.freeze(
    new Set(
      turnOrder.filter(
        (playerId) =>
          !forfeitedPlayerIds.has(playerId) && current.has(playerId),
      ),
    ),
  );
}

export function advanceNoMoveTurnEnds(
  turnOrder: readonly PlayerId[],
  forfeitedPlayerIds: ReadonlySet<PlayerId>,
  current: ReadonlySet<PlayerId>,
  actorPlayerId: PlayerId,
): ReadonlySet<PlayerId> {
  const next = new Set(
    pruneNoMoveTurnEnds(turnOrder, forfeitedPlayerIds, current),
  );
  if (!forfeitedPlayerIds.has(actorPlayerId)) {
    next.add(actorPlayerId);
  }
  return Object.freeze(next);
}

export function isStalemateCycleComplete(
  turnOrder: readonly PlayerId[],
  forfeitedPlayerIds: ReadonlySet<PlayerId>,
  noMoveTurnEndPlayerIds: ReadonlySet<PlayerId>,
): boolean {
  const active = activePlayerIds(turnOrder, forfeitedPlayerIds);
  return (
    active.length >= 2 &&
    active.every((playerId) => noMoveTurnEndPlayerIds.has(playerId))
  );
}
