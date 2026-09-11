import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema } from "../../protocol.js";
import { DuetCardIdSchema, DuetClueWordSchema, DuetClueNumberSchema, DuetRoleSchema } from "./actions.js";
const count = (max: number) => v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(max));
export const DuetCardViewSchema = v.strictObject({ cardId: DuetCardIdSchema, word: v.pipe(v.string(), v.minLength(1), v.maxLength(12)), foundBy: v.nullable(PlayerIdSchema), bystanderFor: v.pipe(v.array(PlayerIdSchema), v.maxLength(2)) });
export const DuetKeySchema = v.pipe(v.array(v.strictObject({ cardId: DuetCardIdSchema, role: DuetRoleSchema })), v.length(25));
export const DuetClueSchema = v.strictObject({ playerId: PlayerIdSchema, word: DuetClueWordSchema, number: DuetClueNumberSchema });
export const DuetHistorySchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("CLUE"), ...DuetClueSchema.entries }),
  v.strictObject({ kind: v.literal("GUESS"), playerId: PlayerIdSchema, cardId: DuetCardIdSchema, outcome: DuetRoleSchema }),
  v.strictObject({ kind: v.picklist(["END", "PASS"]), playerId: PlayerIdSchema }),
]);
export const DuetResultSchema = v.strictObject({ reason: v.picklist(["ALL_AGENTS", "ASSASSIN", "SUDDEN_DEATH_MISS", "CANCELLED"]), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(2)) });
export type DuetResult = v.InferOutput<typeof DuetResultSchema>;
const Base = {
  gameType: v.literal("WORD_DUET"), gameId: GameIdSchema, gameRevision: GameRevisionSchema, rulesVersion: v.literal("duet-2025-ko-v1"),
  cards: v.pipe(v.array(DuetCardViewSchema), v.length(25)), tokensRemaining: count(9), foundCount: count(15),
  playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, cluesComplete: v.boolean(), passed: v.boolean() })), v.length(2)),
  privateState: v.strictObject({ playerId: PlayerIdSchema, key: DuetKeySchema }),
  currentClue: v.nullable(DuetClueSchema), history: v.pipe(v.array(DuetHistorySchema), v.maxLength(110)),
};
export const DuetPlayingProjectionSchema = v.strictObject({ ...Base, phase: v.picklist(["CLUE", "GUESS", "SUDDEN_DEATH"]), turnId: TurnIdSchema, clueGiverId: v.nullable(PlayerIdSchema), guessesThisTurn: count(25) });
export const DuetFinishedProjectionSchema = v.strictObject({ ...Base, phase: v.literal("FINISHED"), result: DuetResultSchema, revealedKeys: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, key: DuetKeySchema })), v.length(2)) });
export type DuetPlayingProjection = v.InferOutput<typeof DuetPlayingProjectionSchema>;
export type DuetFinishedProjection = v.InferOutput<typeof DuetFinishedProjectionSchema>;
export function duetProjectionIsConsistent(g: DuetPlayingProjection | DuetFinishedProjection): boolean {
  const players = new Set(g.playerStates.map(p => p.playerId)), ids = new Set(g.cards.map(c => c.cardId));
  const validKey = (key: v.InferOutput<typeof DuetKeySchema>) => new Set(key.map(c => c.cardId)).size === 25 && key.every(c => ids.has(c.cardId)) && key.filter(c => c.role === "AGENT").length === 9 && key.filter(c => c.role === "ASSASSIN").length === 3;
  if (players.size !== 2 || ids.size !== 25 || new Set(g.cards.map(c => c.word)).size !== 25 || !players.has(g.privateState.playerId) || !validKey(g.privateState.key)) return false;
  if (g.cards.some(c => c.foundBy !== null && !players.has(c.foundBy) || new Set(c.bystanderFor).size !== c.bystanderFor.length || c.bystanderFor.some(id => !players.has(id)))) return false;
  if (g.foundCount !== g.cards.filter(c => c.foundBy !== null).length || g.currentClue && !players.has(g.currentClue.playerId)) return false;
  if (g.history.some(h => !players.has(h.playerId) || h.kind === "GUESS" && !ids.has(h.cardId))) return false;
  if (g.phase === "FINISHED") return g.revealedKeys.every(k => players.has(k.playerId) && validKey(k.key)) && new Set(g.revealedKeys.map(k => k.playerId)).size === 2 && (g.result.reason === "ALL_AGENTS" ? g.foundCount === 15 && g.result.winnerPlayerIds.length === 2 && new Set(g.result.winnerPlayerIds).size === 2 && g.result.winnerPlayerIds.every(id => players.has(id)) : g.result.winnerPlayerIds.length === 0);
  if (g.clueGiverId !== null && !players.has(g.clueGiverId)) return false;
  if (g.phase === "GUESS" && (g.currentClue === null || g.currentClue.playerId !== g.clueGiverId)) return false;
  return g.foundCount < 15 && (g.phase === "SUDDEN_DEATH" || g.tokensRemaining > 0);
}
