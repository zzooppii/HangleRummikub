import * as v from "valibot";
import { PlayerIdSchema } from "@hangul-rummikub/shared";
import type { RandomSource } from "../../../ports/system.js";
import { SpaceCrewCardIdSchema } from "./cards.js";
import { parseSpaceCrewCommunications, type SpaceCrewCommunications } from "./communication.js";
import { parseSpaceCrewTrickState, type SpaceCrewTrickState } from "./trick.js";

/** Server-only receipt. Selected and protected playing-card IDs are never public. */
export const SpaceCrewMissionExchangeSchema = v.strictObject({
  moves: v.pipe(v.array(v.strictObject({ fromPlayerId: PlayerIdSchema, cardId: SpaceCrewCardIdSchema })), v.minLength(3), v.maxLength(5)),
  protectedCardIds: v.pipe(v.array(SpaceCrewCardIdSchema), v.maxLength(5)),
});
export type SpaceCrewMissionExchange = v.InferOutput<typeof SpaceCrewMissionExchangeSchema>;
type Result = { ok: true; trick: SpaceCrewTrickState; exchange: SpaceCrewMissionExchange }
  | { ok: false; reason: "INVALID_STATE" | "INVALID_RANDOM" };

function invalid(): never { throw new Error("Invalid Space Crew first-trick exchange."); }

/** Checks the recorded one-time movement without random draws or historical hand reconstruction. */
export function parseSpaceCrewMissionExchange(input: unknown, trick: SpaceCrewTrickState, communications: SpaceCrewCommunications): SpaceCrewMissionExchange {
  const exchange = v.parse(SpaceCrewMissionExchangeSchema, input);
  const first = trick.completedTricks[0];
  if (!first || exchange.moves.length !== trick.players.length) return invalid();
  const firstCardIds = new Set(first.plays.map(play => play.cardId));
  if (new Set(exchange.moves.map(move => move.cardId)).size !== exchange.moves.length
    || new Set(exchange.protectedCardIds).size !== exchange.protectedCardIds.length) return invalid();
  const laterPlays = [...trick.completedTricks.slice(1).flatMap(item => item.plays), ...trick.currentTrick];
  for (const [index, move] of exchange.moves.entries()) {
    const recipient = trick.players[(index + 1) % trick.players.length];
    if (move.fromPlayerId !== trick.players[index]?.playerId || !recipient || firstCardIds.has(move.cardId)
      || exchange.protectedCardIds.includes(move.cardId)
      || !recipient.hand.includes(move.cardId) && !laterPlays.some(play => play.playerId === recipient.playerId && play.cardId === move.cardId)) return invalid();
  }
  // This is the declaration snapshot at exchange time, not later declarations.
  for (const cardId of exchange.protectedCardIds) {
    if (firstCardIds.has(cardId) || !communications.some(item => item.used && item.cardId === cardId)) return invalid();
  }
  return exchange;
}

/** All random selections read the same old hands. Each player receives from their right neighbour. */
export function exchangeSpaceCrewAfterFirstTrick(input: SpaceCrewTrickState, communicationInput: SpaceCrewCommunications, randomSource?: RandomSource): Result {
  let trick: SpaceCrewTrickState;
  let communications: SpaceCrewCommunications;
  try { trick = parseSpaceCrewTrickState(input); communications = parseSpaceCrewCommunications(communicationInput, trick); }
  catch { return { ok: false, reason: "INVALID_STATE" }; }
  if (trick.completedTricks.length !== 1 || trick.phase !== "BETWEEN_TRICKS") return { ok: false, reason: "INVALID_STATE" };
  const protectedCardIds = communications.flatMap(item => item.used && item.cardId !== null
    && trick.players.find(player => player.playerId === item.playerId)?.hand.includes(item.cardId) ? [item.cardId] : []);
  const moves: SpaceCrewMissionExchange["moves"] = [];
  for (const player of trick.players) {
    const eligible = player.hand.filter(cardId => !protectedCardIds.includes(cardId));
    if (eligible.length === 0) return { ok: false, reason: "INVALID_STATE" };
    let index: number;
    try {
      if (!randomSource) return { ok: false, reason: "INVALID_RANDOM" };
      index = randomSource.nextInt(eligible.length);
    } catch { return { ok: false, reason: "INVALID_RANDOM" }; }
    if (!Number.isSafeInteger(index) || index < 0 || index >= eligible.length) return { ok: false, reason: "INVALID_RANDOM" };
    const cardId = eligible[index];
    if (!cardId) return { ok: false, reason: "INVALID_RANDOM" };
    moves.push({ fromPlayerId: player.playerId, cardId });
  }
  const beforeHands = trick.players.map(player => [...player.hand]);
  for (const [index, player] of trick.players.entries()) {
    const outgoing = moves[index], incoming = moves[(index - 1 + moves.length) % moves.length], before = beforeHands[index];
    if (!outgoing || !incoming || !before) return { ok: false, reason: "INVALID_STATE" };
    player.hand = [...before.filter(cardId => cardId !== outgoing.cardId), incoming.cardId];
  }
  try {
    const candidate = parseSpaceCrewTrickState(trick);
    const declarations = parseSpaceCrewCommunications(communications, candidate);
    return { ok: true, trick: candidate, exchange: parseSpaceCrewMissionExchange({ moves, protectedCardIds }, candidate, declarations) };
  } catch { return { ok: false, reason: "INVALID_STATE" }; }
}
