import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import { AzulTileSchema, AzulColorSchema, AzulSourceSchema, AzulDestinationSchema, azulWallColumn } from "./actions.js";

const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(100));
const score = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const row = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(4));
const tiles = v.pipe(v.array(AzulTileSchema), v.maxLength(100));
export const AzulPlayerSchema = v.strictObject({
  playerId: PlayerIdSchema, score,
  patternLines: v.pipe(v.array(v.pipe(v.array(AzulTileSchema), v.maxLength(5))), v.length(5)),
  wall: v.pipe(v.array(v.pipe(v.array(v.nullable(AzulTileSchema)), v.length(5))), v.length(5)),
  floor: v.pipe(v.array(v.union([AzulTileSchema, v.literal("FIRST_PLAYER")])), v.maxLength(7)),
});
export type AzulPlayerView = v.InferOutput<typeof AzulPlayerSchema>;
export const AzulRoundResultSchema = v.strictObject({
  round: score,
  scores: v.pipe(v.array(v.strictObject({
    playerId: PlayerIdSchema, before: score, after: score, penalty: v.pipe(count, v.maxValue(14)),
    placements: v.pipe(v.array(v.strictObject({ row, column: row, color: AzulColorSchema, horizontal: v.pipe(count, v.maxValue(5)), vertical: v.pipe(count, v.maxValue(5)), points: v.pipe(count, v.maxValue(10)) })), v.maxLength(5)),
  })), v.minLength(2), v.maxLength(4)),
});
export type AzulRoundResult = v.InferOutput<typeof AzulRoundResultSchema>;
export const AzulResultSchema = v.strictObject({
  reason: v.picklist(["WALL_COMPLETE", "CANCELLED"]), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(4)),
  scores: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, base: score, rows: v.pipe(count, v.maxValue(5)), columns: v.pipe(count, v.maxValue(5)), colors: v.pipe(count, v.maxValue(5)), total: score })), v.maxLength(4)),
});
export const AzulFeedbackSchema = v.strictObject({ playerId: PlayerIdSchema, color: AzulColorSchema, source: AzulSourceSchema, destination: AzulDestinationSchema, count, placed: count, dropped: count, tookFirstPlayer: v.boolean(), automatic: v.boolean(), at: ServerTimeSchema });
const base = {
  gameType: v.literal("AZUL"), gameId: GameIdSchema, gameRevision: GameRevisionSchema, rulesVersion: v.literal("azul-base-v1"),
  round: v.pipe(score, v.minValue(1)), factories: v.pipe(v.array(v.pipe(v.array(AzulTileSchema), v.maxLength(4))), v.minLength(5), v.maxLength(9)),
  center: tiles, firstPlayerId: v.nullable(PlayerIdSchema), bagCount: count, discardCount: count,
  playerStates: v.pipe(v.array(AzulPlayerSchema), v.minLength(2), v.maxLength(4)),
  lastRound: v.nullable(AzulRoundResultSchema), feedback: v.nullable(AzulFeedbackSchema),
};
export const AzulPlayingProjectionSchema = v.strictObject({ ...base, phase: v.literal("PLAYING"), turnId: TurnIdSchema, activePlayerId: PlayerIdSchema, turnStartedAt: ServerTimeSchema, deadlineAt: ServerTimeSchema });
export const AzulFinishedProjectionSchema = v.strictObject({ ...base, phase: v.literal("FINISHED"), result: AzulResultSchema });
export type AzulPlayingProjection = v.InferOutput<typeof AzulPlayingProjectionSchema>;
export type AzulFinishedProjection = v.InferOutput<typeof AzulFinishedProjectionSchema>;
export type AzulProjection = AzulPlayingProjection | AzulFinishedProjection;

export function azulProjectionIsConsistent(g: AzulProjection): boolean {
  const players = new Set(g.playerStates.map(p => p.playerId));
  if (players.size !== g.playerStates.length || g.factories.length !== players.size * 2 + 1 || (g.firstPlayerId !== null && !players.has(g.firstPlayerId))) return false;
  const visible = [...g.factories.flat(), ...g.center];
  let markers = 0;
  for (const p of g.playerStates) {
    for (let r = 0; r < 5; r++) {
      const line = p.patternLines[r]!, wall = p.wall[r]!;
      if (line.length > r + 1 || line.some(t => t.color !== line[0]?.color) || (line.length > 0 && wall.some(t => t?.color === line[0]?.color))) return false;
      if (wall.some((t, c) => t !== null && azulWallColumn(r, t.color) !== c)) return false;
      visible.push(...line, ...wall.filter(t => t !== null));
    }
    for (const t of p.floor) {
      if (t === "FIRST_PLAYER") { markers++; if (g.firstPlayerId !== p.playerId) return false; }
      else visible.push(t);
    }
  }
  if (markers > 1 || new Set(visible.map(t => t.tileId)).size !== visible.length || visible.length + g.bagCount + g.discardCount !== 100) return false;
  if (g.phase === "PLAYING" && g.deadlineAt - g.turnStartedAt !== 30_000) return false;
  if (g.phase === "PLAYING" && (!players.has(g.activePlayerId) || g.center.length + g.factories.flat().length === 0)) return false;
  if (g.feedback && !players.has(g.feedback.playerId)) return false;
  if (g.lastRound && (g.lastRound.round > g.round || new Set(g.lastRound.scores.map(s => s.playerId)).size !== players.size || g.lastRound.scores.some(s => !players.has(s.playerId)))) return false;
  if (g.phase === "FINISHED") {
    if (new Set(g.result.winnerPlayerIds).size !== g.result.winnerPlayerIds.length || g.result.winnerPlayerIds.some(id => !players.has(id))) return false;
    if (g.result.reason === "CANCELLED") return g.result.scores.length === 0 && g.result.winnerPlayerIds.length === 0;
    if (!g.result.winnerPlayerIds.length || g.result.scores.length !== players.size || new Set(g.result.scores.map(s => s.playerId)).size !== players.size) return false;
    if (g.result.scores.some(s => !players.has(s.playerId) || s.total !== s.base + s.rows * 2 + s.columns * 7 + s.colors * 10 || g.playerStates.find(p => p.playerId === s.playerId)?.score !== s.total)) return false;
  }
  return true;
}
