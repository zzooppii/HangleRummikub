import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema } from "../../protocol.js";
import { GuryongtuTileSchema, GuryongtuParitySchema, guryongtuParity } from "./actions.js";
const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(9));
const positive = v.pipe(v.number(), v.safeInteger(), v.minValue(1));
const Play = v.strictObject({ playerId: PlayerIdSchema, parity: GuryongtuParitySchema });
export const GuryongtuDuelSchema = v.strictObject({ duel: v.pipe(positive, v.maxValue(9)), attackerId: PlayerIdSchema, plays: v.pipe(v.array(Play), v.length(2)), winnerPlayerId: v.nullable(PlayerIdSchema) });
export const GuryongtuRoundResultSchema = v.strictObject({ round: positive, scores: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, wins: count })), v.length(2)), winnerPlayerId: v.nullable(PlayerIdSchema) });
export const GuryongtuResultSchema = v.strictObject({ reason: v.picklist(["TWO_WINS", "CANCELLED"]), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(1)) });
const Base = {
  gameType: v.literal("GURYONGTU"), gameId: GameIdSchema, gameRevision: GameRevisionSchema, rulesVersion: v.literal("guryongtu-base-v1"),
  round: positive, roundId: TurnIdSchema, attackerId: PlayerIdSchema,
  playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, handCount: count, oddCount: count, evenCount: count, wins: count, matchWins: v.pipe(count, v.maxValue(2)) })), v.length(2)),
  submitted: v.nullable(Play), history: v.pipe(v.array(GuryongtuDuelSchema), v.maxLength(9)), roundResults: v.array(GuryongtuRoundResultSchema),
  privateState: v.strictObject({ playerId: PlayerIdSchema, hand: v.pipe(v.array(GuryongtuTileSchema), v.maxLength(9)), submitted: v.nullable(GuryongtuTileSchema), used: v.pipe(v.array(GuryongtuTileSchema), v.maxLength(9)) }),
};
export const GuryongtuPlayingProjectionSchema = v.variant("phase", [
  v.strictObject({ ...Base, phase: v.literal("PLAYING"), stage: v.picklist(["ATTACK", "DEFEND"]), turnId: TurnIdSchema, activePlayerId: PlayerIdSchema }),
  v.strictObject({ ...Base, phase: v.literal("ROUND_RESULT"), confirmedPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(1)) }),
]);
export const GuryongtuFinishedProjectionSchema = v.strictObject({ ...Base, phase: v.literal("FINISHED"), result: GuryongtuResultSchema });
export type GuryongtuProjection = v.InferOutput<typeof GuryongtuPlayingProjectionSchema> | v.InferOutput<typeof GuryongtuFinishedProjectionSchema>;
export function guryongtuProjectionIsConsistent(g: GuryongtuProjection): boolean {
  const players = new Set(g.playerStates.map(p => p.playerId));
  const self = g.playerStates.find(p => p.playerId === g.privateState.playerId);
  const tiles = [...g.privateState.hand, ...g.privateState.used, ...(g.privateState.submitted ? [g.privateState.submitted] : [])];
  if (players.size !== 2 || !self || !players.has(g.attackerId) || tiles.length !== 9 || new Set(tiles.map(t => t.tileId)).size !== 9 || new Set(tiles.map(t => t.rank)).size !== 9) return false;
  if (self.handCount !== g.privateState.hand.length || self.oddCount !== g.privateState.hand.filter(t => guryongtuParity(t.rank) === "ODD").length || self.evenCount !== self.handCount - self.oddCount) return false;
  if (g.playerStates.some(p => p.oddCount + p.evenCount !== p.handCount || p.oddCount > 5 || p.evenCount > 4 || p.handCount + g.history.length + (g.submitted?.playerId === p.playerId ? 1 : 0) !== 9)) return false;
  if (g.privateState.used.length !== g.history.length || (g.privateState.submitted !== null) !== (g.submitted?.playerId === self.playerId)) return false;
  if (g.privateState.submitted && g.submitted?.parity !== guryongtuParity(g.privateState.submitted.rank)) return false;
  if (g.submitted && g.submitted.playerId !== g.attackerId) return false;
  if (g.history.some((r, i) => r.duel !== i + 1 || !players.has(r.attackerId) || new Set(r.plays.map(p => p.playerId)).size !== 2 || r.plays.some(p => !players.has(p.playerId)) || (r.winnerPlayerId !== null && !players.has(r.winnerPlayerId)))) return false;
  if (g.history.some((r, i) => r.plays.find(p => p.playerId === self.playerId)?.parity !== guryongtuParity(g.privateState.used[i]!.rank) || (i > 0 && r.attackerId !== (g.history[i - 1]!.winnerPlayerId ?? g.history[i - 1]!.attackerId)))) return false;
  const last = g.history.at(-1);
  if (last && g.attackerId !== (last.winnerPlayerId ?? last.attackerId)) return false;
  if (g.playerStates.some(p => p.wins !== g.history.filter(r => r.winnerPlayerId === p.playerId).length || p.matchWins !== g.roundResults.filter(r => r.winnerPlayerId === p.playerId).length)) return false;
  if (g.roundResults.some((r, i) => r.round !== i + 1 || new Set(r.scores.map(p => p.playerId)).size !== 2 || r.scores.some(p => !players.has(p.playerId)) || (r.winnerPlayerId !== null && !players.has(r.winnerPlayerId)))) return false;
  if (g.roundResults.some(r => {
    const a = r.scores[0]!, b = r.scores[1]!;
    return a.wins + b.wins > 9 || r.winnerPlayerId !== (a.wins === b.wins ? null : a.wins > b.wins ? a.playerId : b.playerId);
  })) return false;
  const terminal = g.history.length === 9 || Math.abs(g.playerStates[0]!.wins - g.playerStates[1]!.wins) > 9 - g.history.length;
  if (g.roundResults.length === g.round && g.playerStates.some(p => g.roundResults.at(-1)?.scores.find(s => s.playerId === p.playerId)?.wins !== p.wins)) return false;
  if (g.phase === "PLAYING") return !terminal && g.playerStates.every(p => p.matchWins < 2) && players.has(g.activePlayerId) && g.history.length < 9 && g.roundResults.length === g.round - 1 && (g.stage === "ATTACK" ? g.submitted === null && g.activePlayerId === g.attackerId : g.submitted !== null && g.activePlayerId !== g.attackerId);
  if (g.phase === "ROUND_RESULT") return terminal && g.submitted === null && g.roundResults.length === g.round && g.confirmedPlayerIds.every(id => players.has(id)) && g.playerStates.every(p => p.matchWins < 2);
  return g.result.reason === "CANCELLED" ? g.result.winnerPlayerIds.length === 0 : g.submitted === null && g.result.winnerPlayerIds.length === 1 && g.playerStates.some(p => p.playerId === g.result.winnerPlayerIds[0] && p.matchWins === 2);
}
