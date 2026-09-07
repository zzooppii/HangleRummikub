import type {
  GameId,
  GameRevision,
  TurnId,
} from "@hangul-rummikub/shared";

export type GameplayIdentity = Readonly<{
  gameId: GameId;
  gameRevision: GameRevision;
  turnId: TurnId;
}>;

/** Compares only the canonical identity that scopes an in-memory game draft. */
export function isSameGameplayIdentity(
  previous: GameplayIdentity,
  next: GameplayIdentity,
): boolean {
  return previous.gameId === next.gameId &&
    previous.gameRevision === next.gameRevision &&
    previous.turnId === next.turnId;
}
