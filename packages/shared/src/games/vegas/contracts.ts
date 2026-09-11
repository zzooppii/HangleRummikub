import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import { VegasFaceSchema, VEGAS_TURN_DURATION_MS } from "./actions.js";
export const VegasNoteSchema = v.picklist([10000, 20000, 30000, 40000, 50000, 60000, 70000, 80000, 90000]);
const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(8));
const round = v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(4));
const notes = v.pipe(v.array(VegasNoteSchema), v.maxLength(54));
export const VegasPlayerSchema = v.strictObject({ playerId: PlayerIdSchema, remainingDice: count, casinoDice: v.pipe(v.array(count), v.length(6)) });
export const VegasCasinoResultSchema = v.strictObject({ face: VegasFaceSchema,
    counts: v.pipe(v.array(count), v.minLength(2), v.maxLength(5)),
    excludedPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(5)),
    awards: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, amount: VegasNoteSchema })), v.maxLength(5)), returned: notes,
});
export const VegasRoundResultSchema = v.strictObject({ round, casinos: v.pipe(v.array(VegasCasinoResultSchema), v.length(6)) });
export type VegasRoundResult = v.InferOutput<typeof VegasRoundResultSchema>;
export const VegasResultSchema = v.strictObject({ reason: v.picklist(["FOUR_ROUNDS", "CANCELLED"]), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(5)),
    scores: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, total: v.pipe(v.number(), v.safeInteger(), v.minValue(0)), banknoteCount: v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(54)) })), v.maxLength(5)),
});
export const VegasFeedbackSchema = v.strictObject({ kind: v.picklist(["ROLL", "PLACE"]), playerId: PlayerIdSchema, face: v.nullable(VegasFaceSchema), count, automatic: v.boolean(), at: ServerTimeSchema });
const base = { gameType: v.literal("VEGAS"), gameId: GameIdSchema, gameRevision: GameRevisionSchema, rulesVersion: v.literal("vegas-base-v1"), round,
    playerStates: v.pipe(v.array(VegasPlayerSchema), v.minLength(2), v.maxLength(5)), casinos: v.pipe(v.array(notes), v.length(6)),
    roundStarterId: PlayerIdSchema, viewerPlayerId: PlayerIdSchema, ownBanknotes: notes,
    lastRound: v.nullable(VegasRoundResultSchema), feedback: v.nullable(VegasFeedbackSchema),
};
export const VegasPlayingProjectionSchema = v.strictObject({ ...base, phase: v.literal("PLAYING"), turnId: TurnIdSchema, activePlayerId: PlayerIdSchema,
    turnStartedAt: ServerTimeSchema, deadlineAt: ServerTimeSchema, turnStage: v.picklist(["AWAITING_ROLL", "AWAITING_PLACEMENT"]), rolled: v.pipe(v.array(VegasFaceSchema), v.maxLength(8)),
});
export const VegasFinishedProjectionSchema = v.strictObject({ ...base, phase: v.literal("FINISHED"), result: VegasResultSchema });
export type VegasPlayingProjection = v.InferOutput<typeof VegasPlayingProjectionSchema>;
export type VegasProjection = VegasPlayingProjection | v.InferOutput<typeof VegasFinishedProjectionSchema>;
export function vegasProjectionIsConsistent(g: VegasProjection): boolean {
    const players = new Set(g.playerStates.map(p => p.playerId));
    if (players.size !== g.playerStates.length || !players.has(g.viewerPlayerId) || !players.has(g.roundStarterId))
        return false;
    if (g.playerStates.some(p => p.remainingDice + p.casinoDice.reduce((a, b) => a + b, 0) !== 8))
        return false;
    if (g.feedback && !players.has(g.feedback.playerId))
        return false;
    if (g.lastRound && (g.lastRound.round > g.round || g.lastRound.casinos.some((c, i) => c.face !== i + 1 || c.counts.length !== players.size || c.awards.some(a => !players.has(a.playerId)) || c.excludedPlayerIds.some(id => !players.has(id)))))
        return false;
    if (g.phase === "PLAYING") {
        const active = g.playerStates.find(p => p.playerId === g.activePlayerId);
        if (!active || active.remainingDice === 0 || g.deadlineAt - g.turnStartedAt !== VEGAS_TURN_DURATION_MS)
            return false;
        if (g.turnStage === "AWAITING_ROLL" ? g.rolled.length !== 0 : g.rolled.length !== active.remainingDice)
            return false;
        return g.casinos.every(n => n.reduce((a, b) => a + b, 0) >= 50000);
    }
    if (g.result.reason === "CANCELLED")
        return g.result.scores.length === 0 && g.result.winnerPlayerIds.length === 0;
    const scores = g.result.scores;
    if (g.round !== 4 || scores.length !== players.size || new Set(scores.map(p => p.playerId)).size !== players.size || scores.some(p => !players.has(p.playerId)))
        return false;
    const sorted = [...scores].sort((a, b) => b.total - a.total || b.banknoteCount - a.banknoteCount), best = sorted[0]!;
    const winners = sorted.filter(p => p.total === best.total && p.banknoteCount === best.banknoteCount).map(p => p.playerId);
    return new Set(g.result.winnerPlayerIds).size === winners.length && winners.every(id => g.result.winnerPlayerIds.includes(id));
}
