import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import { TurnNumberSchema } from "../../projections.js";
import { GEM_BASIC_RESOURCE_IDS, GemBasicCountsSchema, GemCardTierSchema, GemFinishReasonSchema, GemPublicCardSchema, GemResourceCountsSchema } from "./contracts.js";
const PlayerIds = v.pipe(v.array(PlayerIdSchema), v.minLength(2), v.maxLength(4), v.check(ids => new Set(ids).size === ids.length));
const PlayerState = v.strictObject({
  playerId: PlayerIdSchema,
  resources: GemResourceCountsSchema,
  production: GemBasicCountsSchema,
  purchasedCards: v.pipe(v.array(GemPublicCardSchema), v.maxLength(45)),
  reservedCards: v.pipe(v.array(GemPublicCardSchema), v.maxLength(2)),
  score: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(95)),
  forfeited: v.boolean(),
});
const Common = {
  gameType: v.literal("GEM_CARD"), gameId: GameIdSchema, gameRevision: GameRevisionSchema,
  rulesVersion: v.literal("gem-rules-v1"), cardSetVersion: v.literal("gem-cardset-v1"),
  turnOrder: PlayerIds,
  market: v.pipe(v.array(v.strictObject({
    tier: GemCardTierSchema,
    slots: v.tuple([v.nullable(GemPublicCardSchema), v.nullable(GemPublicCardSchema), v.nullable(GemPublicCardSchema)]),
    remainingDeckCount: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(12)),
  })), v.length(3)),
  supply: GemResourceCountsSchema,
  playerStates: v.pipe(v.array(PlayerState), v.minLength(2), v.maxLength(4)),
};
type PublicGame = v.InferOutput<ReturnType<typeof commonSchema>>;
function commonSchema() { return v.strictObject(Common); }
function coherent(game: PublicGame): boolean {
  const players = game.playerStates;
  if (new Set(players.map(p => p.playerId)).size !== game.turnOrder.length || players.length !== game.turnOrder.length || players.some(p => !game.turnOrder.includes(p.playerId)))
    return false;
  if (!game.market.every((tier, i) => tier.tier === i + 1 && tier.slots.every(c => c === null ? tier.remainingDeckCount === 0 : c.tier === tier.tier)))
    return false;
  const visible = [...game.market.flatMap(t => t.slots.filter(c => c !== null)), ...players.flatMap(p => [...p.purchasedCards, ...p.reservedCards])];
  if (new Set(visible.map(c => c.cardId)).size !== visible.length || visible.length + game.market.reduce((n, t) => n + t.remainingDeckCount, 0) !== 45)
    return false;
  if (![...GEM_BASIC_RESOURCE_IDS, "PRISM" as const].every(r => game.supply[r] + players.reduce((n, p) => n + p.resources[r], 0) === (r === "PRISM" ? 5 : 7)))
    return false;
  return players.every(p => Object.values(p.resources).reduce((a, b) => a + b, 0) <= 9 && p.score === p.purchasedCards.reduce((n, c) => n + c.victoryPoints, 0) && GEM_BASIC_RESOURCE_IDS.every(r => p.production[r] === p.purchasedCards.filter(c => c.productionResource === r).length));
}
export const GemCardResultV2Schema = v.strictObject({
  reason: GemFinishReasonSchema, finishedAt: ServerTimeSchema,
  winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.minLength(1), v.maxLength(4)),
  rankings: v.pipe(v.array(v.strictObject({
    playerId: PlayerIdSchema, rank: v.pipe(v.number(), v.integer(), v.minValue(1), v.maxValue(4)),
    score: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(95)),
    purchasedCardCount: v.pipe(v.number(), v.integer(), v.minValue(0), v.maxValue(45)), forfeited: v.boolean(),
  })), v.minLength(2), v.maxLength(4)),
});
export const GemCardPlayingProjectionV2Schema = v.pipe(v.strictObject({
  ...Common,
  turn: v.strictObject({ turnId: TurnIdSchema, turnNumber: TurnNumberSchema, activePlayerId: PlayerIdSchema, startedAt: ServerTimeSchema, deadlineAt: ServerTimeSchema }),
  fairRound: v.nullable(v.strictObject({ reason: v.picklist(["SCORE_THRESHOLD_ROUND_END", "MARKET_EXHAUSTED_ROUND_END"]) })),
}), v.check(game => coherent(game), "GEM public state is inconsistent."), v.check(game => game.turn.deadlineAt - game.turn.startedAt === 45000 && game.playerStates.filter(p => !p.forfeited).length >= 2 && game.playerStates.some(p => p.playerId === game.turn.activePlayerId && !p.forfeited), "GEM active turn is invalid."));
export const GemCardFinishedProjectionV2Schema = v.pipe(v.strictObject({ ...Common, result: GemCardResultV2Schema }), v.check(game => coherent(game), "GEM public state is inconsistent."), v.check(game => {
  const rankings = game.result.rankings;
  if (rankings.length !== game.playerStates.length || new Set(rankings.map(p => p.playerId)).size !== rankings.length)
    return false;
  if (!rankings.every(entry => game.playerStates.some(p => p.playerId === entry.playerId && p.score === entry.score && p.forfeited === entry.forfeited && p.purchasedCards.length === entry.purchasedCardCount)))
    return false;
  const ordered = [...rankings].sort((a, b) => Number(a.forfeited) - Number(b.forfeited) || b.score - a.score);
  if (!ordered.every((entry, i) => entry.playerId === rankings[i]?.playerId && entry.rank === (i > 0 && ordered[i - 1]?.forfeited === entry.forfeited && ordered[i - 1]?.score === entry.score ? ordered[i - 1]?.rank : i + 1)))
    return false;
  const winners = rankings.filter(p => !p.forfeited && p.rank === 1).map(p => p.playerId);
  if (JSON.stringify(winners) !== JSON.stringify(game.result.winnerPlayerIds))
    return false;
  const eligible = rankings.filter(p => !p.forfeited).length;
  return game.result.reason === "LAST_PLAYER_STANDING" ? eligible === 1 : eligible >= 2 && (game.result.reason !== "SCORE_THRESHOLD_ROUND_END" || rankings.some(p => p.score >= 18));
}, "GEM result is inconsistent."));
export type GemCardPlayingProjectionV2 = v.InferOutput<typeof GemCardPlayingProjectionV2Schema>;
export type GemCardFinishedProjectionV2 = v.InferOutput<typeof GemCardFinishedProjectionV2Schema>;
