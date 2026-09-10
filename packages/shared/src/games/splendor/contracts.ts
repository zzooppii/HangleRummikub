import * as v from "valibot";
import {
  GameIdSchema,
  PlayerIdSchema,
  TurnIdSchema,
} from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import {
  SplendorCardIdSchema,
  SplendorColorSchema,
  SplendorCostSchema,
  SplendorTokensSchema,
  SplendorTierSchema,
  SplendorNobleIdSchema,
} from "./actions.js";
export const SplendorCardSchema = v.strictObject({
  cardId: SplendorCardIdSchema,
  tier: SplendorTierSchema,
  bonus: SplendorColorSchema,
  points: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)),
  cost: SplendorCostSchema,
  art: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(5)),
});
export type SplendorCard = v.InferOutput<typeof SplendorCardSchema>;
export const SplendorNobleSchema = v.strictObject({
  nobleId: SplendorNobleIdSchema,
  points: v.literal(3),
  cost: SplendorCostSchema,
  portrait: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(9)),
});
export type SplendorNoble = v.InferOutput<typeof SplendorNobleSchema>;
const Count = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(0),
  v.maxValue(90),
);
const BonusCount = v.pipe(
  v.number(),
  v.safeInteger(),
  v.minValue(0),
  v.maxValue(18),
);
export const SplendorBonusSchema = v.strictObject({
  WHITE: BonusCount,
  BLUE: BonusCount,
  GREEN: BonusCount,
  RED: BonusCount,
  BLACK: BonusCount,
});
export const SplendorPublicPlayerSchema = v.strictObject({
  playerId: PlayerIdSchema,
  tokens: SplendorTokensSchema,
  bonuses: SplendorBonusSchema,
  purchased: v.array(SplendorCardSchema),
  reservedCount: v.pipe(Count, v.maxValue(3)),
  nobles: v.array(SplendorNobleSchema),
  score: Count,
});
export const SplendorFeedbackSchema = v.nullable(
  v.strictObject({
    playerId: PlayerIdSchema,
    kind: v.picklist([
      "TAKE",
      "BUY",
      "RESERVE",
      "RESERVE_DECK",
      "PASS",
      "TIMEOUT",
    ]),
    at: ServerTimeSchema,
    points: Count,
  }),
);
export const SplendorResultSchema = v.strictObject({
  reason: v.picklist(["POINTS", "CANCELLED", "INACTIVE"]),
  winnerPlayerIds: v.array(PlayerIdSchema),
  scores: v.array(
    v.strictObject({ playerId: PlayerIdSchema, score: Count, cards: Count }),
  ),
});
const Base = {
  gameType: v.literal("SPLENDOR"),
  gameId: GameIdSchema,
  gameRevision: GameRevisionSchema,
  rulesVersion: v.literal("splendor-base-v1"),
  cardSetVersion: v.literal("splendor-base-2014-v1"),
  bank: SplendorTokensSchema,
  market: v.pipe(
    v.array(
      v.strictObject({
        tier: SplendorTierSchema,
        slots: v.pipe(v.array(v.nullable(SplendorCardSchema)), v.length(4)),
        deckCount: Count,
      }),
    ),
    v.length(3),
  ),
  nobles: v.array(SplendorNobleSchema),
  playerStates: v.pipe(
    v.array(SplendorPublicPlayerSchema),
    v.minLength(2),
    v.maxLength(4),
  ),
  privateState: v.strictObject({
    playerId: PlayerIdSchema,
    reserved: v.pipe(v.array(SplendorCardSchema), v.maxLength(3)),
  }),
  feedback: SplendorFeedbackSchema,
  round: v.pipe(v.number(), v.safeInteger(), v.minValue(1)),
  finalRound: v.boolean(),
};
export const SplendorPlayingProjectionSchema = v.strictObject({
  ...Base,
  phase: v.literal("PLAYING"),
  turnId: TurnIdSchema,
  activePlayerId: PlayerIdSchema,
  deadlineAt: ServerTimeSchema,
});
export const SplendorFinishedProjectionSchema = v.strictObject({
  ...Base,
  phase: v.literal("FINISHED"),
  result: SplendorResultSchema,
});
