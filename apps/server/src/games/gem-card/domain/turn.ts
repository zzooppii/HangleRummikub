import {
  PlayerIdSchema,
  ServerTimeSchema,
  TurnIdSchema,
  type PlayerId,
  type ServerTime,
  type TurnId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

export const GEM_TURN_DURATION_MS = 45_000;

export type GemTurn = Readonly<{
  turnId: TurnId;
  turnNumber: number;
  activePlayerId: PlayerId;
  startedAt: ServerTime;
  deadlineAt: ServerTime;
}>;

export function createGemTurn(turn: GemTurn): GemTurn {
  if (!Number.isSafeInteger(turn.turnNumber) || turn.turnNumber < 1) {
    throw new RangeError("GEM turn number must be a positive safe integer.");
  }
  const startedAt = parse(ServerTimeSchema, turn.startedAt);
  const deadlineAt = parse(ServerTimeSchema, turn.deadlineAt);
  if (deadlineAt - startedAt !== GEM_TURN_DURATION_MS) {
    throw new Error("GEM turn deadline must be exactly 45 seconds after start.");
  }
  return Object.freeze({
    turnId: parse(TurnIdSchema, turn.turnId),
    turnNumber: turn.turnNumber,
    activePlayerId: parse(PlayerIdSchema, turn.activePlayerId),
    startedAt,
    deadlineAt,
  });
}

export function isGemActionBeforeDeadline(
  receivedAt: ServerTime,
  deadlineAt: ServerTime,
): boolean {
  return parse(ServerTimeSchema, receivedAt) < parse(ServerTimeSchema, deadlineAt);
}

export function gemEligiblePlayerIds(
  turnOrder: readonly PlayerId[],
  forfeitedPlayerIds: ReadonlySet<PlayerId>,
): readonly PlayerId[] {
  if (new Set(turnOrder).size !== turnOrder.length || turnOrder.length < 2 || turnOrder.length > 4) {
    throw new Error("GEM turn order must contain two to four unique players.");
  }
  if ([...forfeitedPlayerIds].some((playerId) => !turnOrder.includes(playerId))) {
    throw new Error("GEM forfeited player set contains an unknown player.");
  }
  return Object.freeze(turnOrder.filter((playerId) => !forfeitedPlayerIds.has(playerId)));
}

export function nextGemEligiblePlayerId(
  turnOrder: readonly PlayerId[],
  forfeitedPlayerIds: ReadonlySet<PlayerId>,
  currentPlayerId: PlayerId,
): PlayerId {
  const eligible = gemEligiblePlayerIds(turnOrder, forfeitedPlayerIds);
  if (!turnOrder.includes(currentPlayerId)) {
    throw new Error("Current GEM turn player is not in turn order.");
  }
  if (eligible.length === 0) {
    throw new Error("GEM turn cannot advance without an eligible player.");
  }
  const currentIndex = turnOrder.indexOf(currentPlayerId);
  for (let offset = 1; offset <= turnOrder.length; offset += 1) {
    const candidate = turnOrder[(currentIndex + offset) % turnOrder.length];
    if (candidate !== undefined && !forfeitedPlayerIds.has(candidate)) return candidate;
  }
  throw new Error("GEM turn could not resolve an eligible player.");
}
