import * as v from "valibot";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { SpaceCrewCardIdSchema, SpaceCrewCardSchema, parseSpaceCrewDeck, type SpaceCrewCard } from "./cards.js";
import type { SpaceCrewCompletedTrick } from "./trick.js";

const TrickIndexSchema = v.union([
  v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(13)),
  v.literal("LAST"),
]);
const IndicesSchema = v.pipe(v.array(TrickIndexSchema), v.minLength(1), v.maxLength(13));
const PlayerTricksRequirementSchema = v.variant("type", [
  v.strictObject({ type: v.literal("COUNT"), count: v.picklist([0, 1]) }),
  v.strictObject({ type: v.literal("EXACT_INDICES"), indices: IndicesSchema }),
]);

/** Only conditions present in the audited fifty missions; no expression language. */
export const SpaceCrewPrimitiveSchema = v.variant("type", [
  v.strictObject({ type: v.literal("COLOR_VALUE_WINS"), value: v.literal(1), count: v.picklist([1, 2]) }),
  v.strictObject({ type: v.literal("ROCKET_WINS"), ascending: v.boolean() }),
  v.strictObject({ type: v.literal("FORBID_WIN_VALUE"), value: v.literal(9) }),
  v.strictObject({ type: v.literal("PLAYER_TRICKS"), playerId: PlayerIdSchema, requirement: PlayerTricksRequirementSchema }),
  v.strictObject({ type: v.literal("FORBID_PLAYER_ROCKET_WIN"), playerId: PlayerIdSchema }),
  v.strictObject({ type: v.literal("BALANCED_WINS"), maxDifference: v.literal(1) }),
  v.strictObject({
    type: v.literal("REQUIRED_WINNERS"), indices: IndicesSchema,
    allowedPlayerIds: v.pipe(v.array(PlayerIdSchema), v.minLength(1), v.maxLength(5)),
  }),
  v.strictObject({ type: v.literal("CAPTURE_COLOR"), playerId: PlayerIdSchema, color: v.literal("PINK") }),
]);

export type SpaceCrewPrimitive = v.InferOutput<typeof SpaceCrewPrimitiveSchema>;
export type SpaceCrewPrimitiveContext = Readonly<{
  cards: readonly SpaceCrewCard[];
  playerIds: readonly PlayerId[];
  commanderId: PlayerId;
  totalTricks: number;
  exhausted: boolean;
  completedTricks: readonly SpaceCrewCompletedTrick[];
}>;
export type SpaceCrewPrimitiveFailureReason =
  | "OBJECTIVE_NOT_MET" | "ROCKET_DID_NOT_WIN" | "ROCKET_ORDER"
  | "FORBIDDEN_WIN_VALUE" | "TOO_MANY_PLAYER_TRICKS" | "UNEXPECTED_PLAYER_TRICK"
  | "REQUIRED_WINNER_MISSED" | "FORBIDDEN_PLAYER_ROCKET_WIN" | "UNBALANCED_WINS"
  | "WRONG_COLOR_CAPTURER";
export type SpaceCrewPrimitiveFailure = Readonly<{
  reason: SpaceCrewPrimitiveFailureReason;
  trickNumber?: number;
  playerId?: PlayerId;
}>;
export type SpaceCrewPrimitiveEvaluation =
  | { ok: false; reason: "INVALID_CONFIG" | "INVALID_CONTEXT" }
  | { ok: true; status: "PENDING" | "SATISFIED"; progress: { actual: number; target: number } }
  | { ok: true; status: "FAILED"; progress: { actual: number; target: number }; failure: SpaceCrewPrimitiveFailure };

const PositiveInteger = v.pipe(v.number(), v.safeInteger(), v.minValue(1));
const ContextSchema = v.strictObject({
  cards: v.pipe(v.array(SpaceCrewCardSchema), v.length(40)),
  playerIds: v.pipe(v.array(PlayerIdSchema), v.minLength(3), v.maxLength(5)),
  commanderId: PlayerIdSchema,
  totalTricks: PositiveInteger,
  exhausted: v.boolean(),
  completedTricks: v.pipe(v.array(v.strictObject({
    number: PositiveInteger, leaderId: PlayerIdSchema, winnerId: PlayerIdSchema,
    plays: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, cardId: SpaceCrewCardIdSchema })), v.minLength(3), v.maxLength(5)),
  })), v.maxLength(13)),
});

export function parseSpaceCrewPrimitive(input: unknown): SpaceCrewPrimitive {
  return v.parse(SpaceCrewPrimitiveSchema, input);
}

type ResolvedTrick = {
  number: number;
  winnerId: PlayerId;
  winningCard: SpaceCrewCard;
  cards: SpaceCrewCard[];
};

/** Checks the canonical history boundary, without inventing or exposing past hands. */
function resolveHistory(context: SpaceCrewPrimitiveContext): ResolvedTrick[] | undefined {
  try {
    parseSpaceCrewDeck(context.cards);
  } catch {
    return undefined;
  }
  const seats = context.playerIds;
  if (new Set(seats).size !== seats.length || !seats.includes(context.commanderId)
    || context.totalTricks !== Math.floor(40 / seats.length)
    || context.completedTricks.length > context.totalTricks
    || context.exhausted !== (context.completedTricks.length === context.totalTricks)) return undefined;
  const inventory = new Map(context.cards.map(card => [card.cardId, card]));
  const used = new Set<string>();
  const resolved: ResolvedTrick[] = [];
  let leader = context.commanderId;
  for (const [index, trick] of context.completedTricks.entries()) {
    if (trick.number !== index + 1 || trick.leaderId !== leader || trick.plays.length !== seats.length) return undefined;
    const leaderSeat = seats.indexOf(leader);
    const cards: SpaceCrewCard[] = [];
    for (const [offset, play] of trick.plays.entries()) {
      const card = inventory.get(play.cardId);
      if (play.playerId !== seats[(leaderSeat + offset) % seats.length] || !card || used.has(play.cardId)) return undefined;
      used.add(play.cardId);
      cards.push(card);
    }
    const first = cards[0];
    const openingPlay = trick.plays[0];
    if (!first || !openingPlay) return undefined;
    let winningCard = first;
    let winnerId = openingPlay.playerId;
    for (const [offset, card] of cards.entries()) {
      const play = trick.plays[offset];
      if (!play) return undefined;
      if (card.kind === "ROCKET"
        ? winningCard.kind !== "ROCKET" || card.value > winningCard.value
        : winningCard.kind !== "ROCKET" && card.suit === first.suit && card.value > winningCard.value) {
        winningCard = card;
        winnerId = play.playerId;
      }
    }
    if (winnerId !== trick.winnerId) return undefined;
    resolved.push({ number: trick.number, winnerId, winningCard, cards });
    leader = winnerId;
  }
  return resolved;
}

function indicesFor(indices: readonly (number | "LAST")[], totalTricks: number): number[] | undefined {
  const resolved = indices.map(index => index === "LAST" ? totalTricks : index);
  return new Set(resolved).size === resolved.length && resolved.every(index => index <= totalTricks) ? resolved : undefined;
}

function progress(actual: number, target: number, exhausted: boolean): SpaceCrewPrimitiveEvaluation {
  if (actual >= target) return { ok: true, status: "SATISFIED", progress: { actual, target } };
  return exhausted
    ? failure(actual, target, "OBJECTIVE_NOT_MET")
    : { ok: true, status: "PENDING", progress: { actual, target } };
}

function failure(
  actual: number, target: number, reason: SpaceCrewPrimitiveFailureReason,
  trick?: Pick<ResolvedTrick, "number" | "winnerId">,
): SpaceCrewPrimitiveEvaluation {
  return {
    ok: true, status: "FAILED", progress: { actual, target },
    failure: trick ? { reason, trickNumber: trick.number, playerId: trick.winnerId } : { reason },
  };
}

/**
 * SATISFIED means this condition holds so far, never whole-mission SUCCESS.
 * The mission's end policy must still require exhaustion where appropriate.
 * Failure evidence deliberately contains no cards, hands, or history arrays.
 */
export function evaluateSpaceCrewPrimitive(configInput: unknown, contextInput: unknown): SpaceCrewPrimitiveEvaluation {
  const parsedConfig = v.safeParse(SpaceCrewPrimitiveSchema, configInput);
  if (!parsedConfig.success) return { ok: false, reason: "INVALID_CONFIG" };
  const parsedContext = v.safeParse(ContextSchema, contextInput);
  if (!parsedContext.success) return { ok: false, reason: "INVALID_CONTEXT" };
  const config = parsedConfig.output;
  const context = parsedContext.output;
  const history = resolveHistory(context);
  if (!history) return { ok: false, reason: "INVALID_CONTEXT" };
  if ("playerId" in config && !context.playerIds.includes(config.playerId)) return { ok: false, reason: "INVALID_CONFIG" };

  switch (config.type) {
    case "COLOR_VALUE_WINS": {
      const faces = new Set(history.filter(trick => trick.winningCard.kind === "COLOR" && trick.winningCard.value === config.value)
        .map(trick => trick.winningCard.suit));
      const usedFaces = new Set(history.flatMap(trick => trick.cards)
        .filter(card => card.kind === "COLOR" && card.value === config.value).map(card => card.suit));
      // Only completed public plays constrain the four possible winning faces.
      if (faces.size + 4 - usedFaces.size < config.count) return failure(faces.size, config.count, "OBJECTIVE_NOT_MET");
      return progress(faces.size, config.count, context.exhausted);
    }
    case "ROCKET_WINS": {
      let count = 0;
      for (const trick of history) {
        if (trick.cards.some(card => card.kind === "ROCKET" && card.cardId !== trick.winningCard.cardId)) {
          return failure(count, 4, "ROCKET_DID_NOT_WIN", trick);
        }
        if (trick.winningCard.kind !== "ROCKET") continue;
        if (config.ascending && trick.winningCard.value !== count + 1) return failure(count, 4, "ROCKET_ORDER", trick);
        count += 1;
      }
      return progress(count, 4, context.exhausted);
    }
    case "FORBID_WIN_VALUE": {
      const violation = history.find(trick => trick.winningCard.value === config.value);
      return violation ? failure(1, 0, "FORBIDDEN_WIN_VALUE", violation) : progress(0, 0, false);
    }
    case "FORBID_PLAYER_ROCKET_WIN": {
      const violation = history.find(trick => trick.winnerId === config.playerId && trick.winningCard.kind === "ROCKET");
      return violation ? failure(1, 0, "FORBIDDEN_PLAYER_ROCKET_WIN", violation) : progress(0, 0, false);
    }
    case "PLAYER_TRICKS": {
      const wins = history.filter(trick => trick.winnerId === config.playerId);
      if (config.requirement.type === "COUNT") {
        const target = config.requirement.count;
        const excess = wins[target];
        return excess ? failure(target + 1, target, "TOO_MANY_PLAYER_TRICKS", excess)
          : progress(wins.length, target, context.exhausted);
      }
      const indices = indicesFor(config.requirement.indices, context.totalTricks);
      if (!indices) return { ok: false, reason: "INVALID_CONFIG" };
      let count = 0;
      for (const trick of history) {
        const required = indices.includes(trick.number);
        const won = trick.winnerId === config.playerId;
        if (won && !required) return failure(count, indices.length, "UNEXPECTED_PLAYER_TRICK", trick);
        if (required && !won) return failure(count, indices.length, "REQUIRED_WINNER_MISSED", trick);
        if (won) count += 1;
      }
      return progress(count, indices.length, context.exhausted);
    }
    case "BALANCED_WINS": {
      const counts = new Map(context.playerIds.map(id => [id, 0]));
      let difference = 0;
      for (const trick of history) {
        counts.set(trick.winnerId, (counts.get(trick.winnerId) ?? 0) + 1);
        const values = [...counts.values()];
        difference = Math.max(...values) - Math.min(...values);
        if (difference > config.maxDifference) return failure(difference, config.maxDifference, "UNBALANCED_WINS", trick);
      }
      return { ok: true, status: "SATISFIED", progress: { actual: difference, target: config.maxDifference } };
    }
    case "REQUIRED_WINNERS": {
      const indices = indicesFor(config.indices, context.totalTricks);
      if (!indices || new Set(config.allowedPlayerIds).size !== config.allowedPlayerIds.length
        || config.allowedPlayerIds.some(id => !context.playerIds.includes(id))) return { ok: false, reason: "INVALID_CONFIG" };
      let count = 0;
      for (const trick of history) {
        if (!indices.includes(trick.number)) continue;
        if (!config.allowedPlayerIds.includes(trick.winnerId)) return failure(count, indices.length, "REQUIRED_WINNER_MISSED", trick);
        count += 1;
      }
      return progress(count, indices.length, context.exhausted);
    }
    case "CAPTURE_COLOR": {
      let count = 0;
      for (const trick of history) {
        const captured = trick.cards.filter(card => card.suit === config.color).length;
        if (captured > 0 && trick.winnerId !== config.playerId) return failure(count, 9, "WRONG_COLOR_CAPTURER", trick);
        count += captured;
      }
      return progress(count, 9, context.exhausted);
    }
  }
}
