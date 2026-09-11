import * as v from "valibot";
import { GameIdSchema, GameRevisionSchema, PlayerIdSchema, ServerTimeSchema, TurnIdSchema, GuryongtuTileSchema, GuryongtuDuelSchema, GuryongtuRoundResultSchema, GuryongtuResultSchema, guryongtuParity, type GameId, type PlayerId, type ServerTime, type TurnId, type GuryongtuAction, type GuryongtuTile } from "@hangul-rummikub/shared";
const count = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(9));
const positive = v.pipe(v.number(), v.safeInteger(), v.minValue(1));
const Player = v.strictObject({ playerId: PlayerIdSchema, hand: v.array(GuryongtuTileSchema), used: v.array(GuryongtuTileSchema), submitted: v.nullable(GuryongtuTileSchema), wins: count, matchWins: v.pipe(count, v.maxValue(2)) });
const Base = { rulesVersion: v.literal("guryongtu-base-v1"), gameId: GameIdSchema, revision: GameRevisionSchema, startedAt: ServerTimeSchema, round: positive, roundId: TurnIdSchema, transitionId: TurnIdSchema, attackerId: PlayerIdSchema, players: v.pipe(v.array(Player), v.length(2)), history: v.pipe(v.array(GuryongtuDuelSchema), v.maxLength(9)), roundResults: v.array(GuryongtuRoundResultSchema) };
const StateSchema = v.variant("phase", [
  v.strictObject({ ...Base, phase: v.literal("PLAYING"), stage: v.picklist(["ATTACK", "DEFEND"]), activePlayerId: PlayerIdSchema, finishedAt: v.null() }),
  v.strictObject({ ...Base, phase: v.literal("ROUND_RESULT"), confirmedPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(1)), finishedAt: v.null() }),
  v.strictObject({ ...Base, phase: v.literal("FINISHED"), result: GuryongtuResultSchema, finishedAt: ServerTimeSchema }),
]);
export type GuryongtuState = v.InferOutput<typeof StateSchema>;
export type GuryongtuRoundSetup = Readonly<{ hands: readonly (readonly GuryongtuTile[])[]; starter: number }>;
export type GuryongtuOutcome = Readonly<{ok: true; state: GuryongtuState}> | Readonly<{ok: false; reason: "INVALID_PHASE" | "NOT_YOUR_TURN" | "INVALID_ACTION"}>;
/** 1 defeats 9; positive means the first tile wins. No transport or randomness. */
export function compareGuryongtu(a: number, b: number): number {
  v.parse(v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(9)), a);
  v.parse(v.pipe(v.number(), v.safeInteger(), v.minValue(1), v.maxValue(9)), b);
  if (a === b) return 0;
  if (a === 1 && b === 9) return 1;
  if (a === 9 && b === 1) return -1;
  return a > b ? 1 : -1;
}
export function parseGuryongtuState(input: unknown): GuryongtuState {
  const s = v.parse(StateSchema, input), ids = new Set(s.players.map(p => p.playerId));
  const invalid = () => { throw new Error("Invalid Guryongtu state."); };
  if (ids.size !== 2 || !ids.has(s.attackerId)) invalid();
  const allIds = s.players.flatMap(p => [...p.hand, ...p.used, ...(p.submitted ? [p.submitted] : [])]).map(t => t.tileId);
  if (allIds.length !== 18 || new Set(allIds).size !== 18) invalid();
  for (const p of s.players) {
    const tiles = [...p.hand, ...p.used, ...(p.submitted ? [p.submitted] : [])];
    if (tiles.length !== 9 || new Set(tiles.map(t => t.rank)).size !== 9 || p.used.length !== s.history.length || p.wins !== s.history.filter(h => h.winnerPlayerId === p.playerId).length || p.matchWins !== s.roundResults.filter(r => r.winnerPlayerId === p.playerId).length) invalid();
  }
  for (const [i, h] of s.history.entries()) {
    const a = s.players[0]!, b = s.players[1]!, av = a.used[i]!, bv = b.used[i]!;
    const result = compareGuryongtu(av.rank, bv.rank), winner = result === 0 ? null : result > 0 ? a.playerId : b.playerId;
    if (h.duel !== i + 1 || !ids.has(h.attackerId) || h.winnerPlayerId !== winner || new Set(h.plays.map(p => p.playerId)).size !== 2 || h.plays.some(p => !ids.has(p.playerId))) invalid();
    for (const p of s.players) if (h.plays.find(x => x.playerId === p.playerId)?.parity !== guryongtuParity(p.used[i]!.rank)) invalid();
    const prev = s.history[i - 1];
    if (prev && h.attackerId !== (prev.winnerPlayerId ?? prev.attackerId)) invalid();
  }
  const last = s.history.at(-1);
  if (last && s.attackerId !== (last.winnerPlayerId ?? last.attackerId)) invalid();
  for (const [i, r] of s.roundResults.entries()) {
    if (r.round !== i + 1 || new Set(r.scores.map(p => p.playerId)).size !== 2 || r.scores.some(p => !ids.has(p.playerId))) invalid();
    const a = r.scores[0]!, b = r.scores[1]!;
    if (a.wins + b.wins > 9 || r.winnerPlayerId !== (a.wins === b.wins ? null : a.wins > b.wins ? a.playerId : b.playerId)) invalid();
  }
  const pending = s.players.filter(p => p.submitted !== null);
  const terminal = s.history.length === 9 || Math.abs(s.players[0]!.wins - s.players[1]!.wins) > 9 - s.history.length;
  if (s.phase === "PLAYING") {
    if (terminal || s.roundResults.length !== s.round - 1 || s.players.some(p => p.matchWins >= 2) || !ids.has(s.activePlayerId)) invalid();
    if (s.stage === "ATTACK" ? pending.length !== 0 || s.activePlayerId !== s.attackerId : pending.length !== 1 || pending[0]?.playerId !== s.attackerId || s.activePlayerId === s.attackerId) invalid();
  } else if (s.phase === "ROUND_RESULT") {
    if (!terminal || pending.length || s.roundResults.length !== s.round || s.players.some(p => p.matchWins >= 2) || s.confirmedPlayerIds.some(id => !ids.has(id))) invalid();
  } else if (s.result.reason === "TWO_WINS") {
    if (!terminal || pending.length || s.roundResults.length !== s.round || s.result.winnerPlayerIds.length !== 1 || !s.players.some(p => p.matchWins === 2 && p.playerId === s.result.winnerPlayerIds[0])) invalid();
  } else if (s.result.winnerPlayerIds.length || pending.length > 1 || pending.some(p => p.playerId !== s.attackerId) || ![s.round - 1, s.round].includes(s.roundResults.length)) invalid();
  if (s.roundResults.length === s.round && s.players.some(p => s.roundResults.at(-1)?.scores.find(x => x.playerId === p.playerId)?.wins !== p.wins)) invalid();
  return s;
}
function base(s: GuryongtuState) {
  return { rulesVersion: s.rulesVersion, gameId: s.gameId, revision: v.parse(GameRevisionSchema, s.revision + 1), startedAt: s.startedAt, round: s.round, roundId: s.roundId, transitionId: s.transitionId, attackerId: s.attackerId, players: s.players, history: s.history, roundResults: s.roundResults };
}
export function createGuryongtuGame(input: GuryongtuRoundSetup & {gameId: GameId; playerIds: readonly PlayerId[]; now: ServerTime; transitionId: TurnId}): GuryongtuState {
  if (input.hands.length !== 2 || input.playerIds.length !== 2 || ![0, 1].includes(input.starter)) throw new Error("Invalid Guryongtu setup.");
  const attackerId = input.playerIds[input.starter]!;
  return parseGuryongtuState({ rulesVersion: "guryongtu-base-v1", gameId: input.gameId, revision: 0, startedAt: input.now, round: 1, roundId: input.transitionId, transitionId: input.transitionId, attackerId, players: input.playerIds.map((playerId, i) => ({ playerId, hand: input.hands[i], used: [], submitted: null, wins: 0, matchWins: 0 })), history: [], roundResults: [], phase: "PLAYING", stage: "ATTACK", activePlayerId: attackerId, finishedAt: null });
}
export function applyGuryongtuAction(original: GuryongtuState, actor: PlayerId, action: GuryongtuAction, now: ServerTime, transitionId: TurnId): GuryongtuOutcome {
  if (original.phase !== "PLAYING") return {ok: false, reason: "INVALID_PHASE"};
  if (original.activePlayerId !== actor) return {ok: false, reason: "NOT_YOUR_TURN"};
  const s = parseGuryongtuState(original);
  if (s.phase !== "PLAYING") return {ok: false, reason: "INVALID_PHASE"};
  const player = s.players.find(p => p.playerId === actor)!;
  const tile = player.hand.find(t => t.tileId === action.tileId);
  if (!tile) return {ok: false, reason: "INVALID_ACTION"};
  player.hand = player.hand.filter(t => t.tileId !== tile.tileId); player.submitted = tile;
  if (s.stage === "ATTACK") return {ok: true, state: parseGuryongtuState({ ...base(s), phase: "PLAYING", stage: "DEFEND", activePlayerId: s.players.find(p => p.playerId !== actor)!.playerId, transitionId, finishedAt: null })};
  const a = s.players[0]!, b = s.players[1]!, result = compareGuryongtu(a.submitted!.rank, b.submitted!.rank);
  const winner = result === 0 ? null : result > 0 ? a : b;
  if (winner) winner.wins++;
  s.history.push({ duel: s.history.length + 1, attackerId: s.attackerId, plays: s.players.map(p => ({playerId: p.playerId, parity: guryongtuParity(p.submitted!.rank)})), winnerPlayerId: winner?.playerId ?? null });
  for (const p of s.players) { p.used.push(p.submitted!); p.submitted = null; }
  s.attackerId = winner?.playerId ?? s.attackerId;
  if (s.history.length === 9 || Math.abs(a.wins - b.wins) > 9 - s.history.length) {
    const roundWinner = a.wins === b.wins ? null : a.wins > b.wins ? a : b;
    if (roundWinner) roundWinner.matchWins++;
    s.roundResults.push({ round: s.round, scores: s.players.map(p => ({playerId: p.playerId, wins: p.wins})), winnerPlayerId: roundWinner?.playerId ?? null });
    return {ok: true, state: parseGuryongtuState(roundWinner?.matchWins === 2
      ? {...base(s), transitionId, phase: "FINISHED", finishedAt: now, result: {reason: "TWO_WINS", winnerPlayerIds: [roundWinner.playerId]}}
      : {...base(s), transitionId, phase: "ROUND_RESULT", confirmedPlayerIds: [], finishedAt: null})};
  }
  return {ok: true, state: parseGuryongtuState({...base(s), transitionId, phase: "PLAYING", stage: "ATTACK", activePlayerId: s.attackerId, finishedAt: null})};
}
export function confirmGuryongtuRound(original: GuryongtuState, actor: PlayerId, setup: GuryongtuRoundSetup | null, transitionId: TurnId): GuryongtuOutcome {
  if (original.phase !== "ROUND_RESULT" || !original.players.some(p => p.playerId === actor) || original.confirmedPlayerIds.includes(actor)) return {ok: false, reason: "INVALID_PHASE"};
  const s = parseGuryongtuState(original);
  if (s.phase !== "ROUND_RESULT") return {ok: false, reason: "INVALID_PHASE"};
  if (!s.confirmedPlayerIds.length) return {ok: true, state: parseGuryongtuState({...base(s), phase: "ROUND_RESULT", confirmedPlayerIds: [actor], finishedAt: null})};
  if (!setup || setup.hands.length !== 2 || ![0, 1].includes(setup.starter)) throw new Error("Guryongtu next setup missing.");
  const attackerId = s.players[setup.starter]!.playerId;
  return {ok: true, state: parseGuryongtuState({...base(s), round: s.round + 1, roundId: transitionId, transitionId, attackerId, players: s.players.map((p, i) => ({...p, hand: setup.hands[i], used: [], submitted: null, wins: 0})), history: [], phase: "PLAYING", stage: "ATTACK", activePlayerId: attackerId, finishedAt: null})};
}
export function cancelGuryongtu(original: GuryongtuState, now: ServerTime): GuryongtuState {
  if (original.phase === "FINISHED") return parseGuryongtuState(original);
  return parseGuryongtuState({...base(parseGuryongtuState(original)), phase: "FINISHED", finishedAt: now, result: {reason: "CANCELLED", winnerPlayerIds: []}});
}
