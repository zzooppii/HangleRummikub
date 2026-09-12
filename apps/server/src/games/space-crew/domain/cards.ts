import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import * as v from "valibot";
import { shuffleFrozen } from "../../../domain/frozen-fisher-yates.js";
import type { RandomSource } from "../../../ports/system.js";

export const SPACE_CREW_COLORS = ["PINK", "BLUE", "GREEN", "YELLOW"] as const;
const COLOR_VALUES = [1, 2, 3, 4, 5, 6, 7, 8, 9] as const;
const ROCKET_VALUES = [1, 2, 3, 4] as const;

// IDs are opaque inputs from the server's ID port, never derived from a card face.
export const SpaceCrewCardIdSchema = v.pipe(v.string(), v.minLength(1), v.maxLength(128));
export const SpaceCrewCardSchema = v.variant("kind", [
  v.strictObject({
    cardId: SpaceCrewCardIdSchema,
    kind: v.literal("COLOR"),
    suit: v.picklist(SPACE_CREW_COLORS),
    value: v.picklist(COLOR_VALUES),
  }),
  v.strictObject({
    cardId: SpaceCrewCardIdSchema,
    kind: v.literal("ROCKET"),
    suit: v.literal("ROCKET"),
    value: v.picklist(ROCKET_VALUES),
  }),
]);

export type SpaceCrewCard = Readonly<v.InferOutput<typeof SpaceCrewCardSchema>>;
export type SpaceCrewColor = (typeof SPACE_CREW_COLORS)[number];
export type SpaceCrewSuit = SpaceCrewCard["suit"];

export const SpaceCrewHandSchema = v.strictObject({
  playerId: PlayerIdSchema,
  hand: v.pipe(v.array(SpaceCrewCardIdSchema), v.maxLength(14)),
});
export type SpaceCrewHand = Readonly<{ playerId: PlayerId; hand: readonly string[] }>;
export type SpaceCrewDeal = Readonly<{
  cards: readonly SpaceCrewCard[];
  players: readonly SpaceCrewHand[];
  commanderId: PlayerId;
  totalTricks: number;
}>;

const DeckSchema = v.pipe(v.array(SpaceCrewCardSchema), v.length(40));
const SeatsSchema = v.pipe(v.array(PlayerIdSchema), v.minLength(3), v.maxLength(5));

/** Parses a detached, immutable server-only inventory; this is not a public DTO. */
export function parseSpaceCrewDeck(input: unknown): readonly SpaceCrewCard[] {
  const cards = v.parse(DeckSchema, input);
  const ids = new Set(cards.map((card) => card.cardId));
  const faces = new Set(cards.map((card) => `${card.suit}:${card.value}`));
  // The schema admits exactly 40 different faces; 40 unique faces is the full deck.
  if (ids.size !== 40 || faces.size !== 40) {
    throw new Error("Invalid space crew inventory.");
  }
  return Object.freeze(cards.map((card) => Object.freeze(card)));
}

export function createSpaceCrewDeck(generateId: () => string): readonly SpaceCrewCard[] {
  const cards: SpaceCrewCard[] = [];
  for (const suit of SPACE_CREW_COLORS) {
    for (const value of COLOR_VALUES) {
      cards.push({ cardId: generateId(), kind: "COLOR", suit, value });
    }
  }
  for (const value of ROCKET_VALUES) {
    cards.push({ cardId: generateId(), kind: "ROCKET", suit: "ROCKET", value });
  }
  return parseSpaceCrewDeck(cards);
}

export function shuffleSpaceCrewCards(
  deck: readonly SpaceCrewCard[],
  randomSource: RandomSource,
): readonly SpaceCrewCard[] {
  return shuffleFrozen(parseSpaceCrewDeck(deck), randomSource);
}

/** Deal an already shuffled deck clockwise, one card at a time. */
export function dealSpaceCrewCards(
  deck: readonly SpaceCrewCard[],
  playerIds: readonly PlayerId[],
): SpaceCrewDeal {
  const seats = v.parse(SeatsSchema, playerIds);
  if (new Set(seats).size !== seats.length) {
    throw new Error("Invalid space crew seats.");
  }
  const cards = parseSpaceCrewDeck(deck);
  const players = seats.map((playerId, seat) => Object.freeze({
    playerId,
    hand: Object.freeze(cards.filter((_, index) => index % seats.length === seat)
      .map((card) => card.cardId)),
  }));
  const commanderCard = cards.find((card) => card.kind === "ROCKET" && card.value === 4);
  const commander = players.find((player) => commanderCard && player.hand.includes(commanderCard.cardId));
  if (!commander) {
    throw new Error("Invalid space crew commander.");
  }
  return Object.freeze({
    cards,
    players: Object.freeze(players),
    commanderId: commander.playerId,
    totalTricks: Math.floor(cards.length / seats.length),
  });
}
