import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema, ServerTimeSchema, GameRevisionSchema, LiarSettingsSchema,
  LiarCategorySchema, LiarClueSchema, LiarTextSchema, LiarResultSchema, LiarVoteRecordSchema, LiarRoundNumberSchema, LiarRoundSummarySchema, LIAR_TOTAL_ROUNDS,
  type PlayerId, type LiarClientCommand, type LiarSettings, type LiarResult } from "@hangul-rummikub/shared";
import type { RandomSource } from "../../../ports/system.js";
import { normalizeLiarAnswer, type LiarPrompt } from "./prompts.js";

const Player = v.strictObject({ playerId: PlayerIdSchema, clue: v.nullable(LiarClueSchema), clueDone: v.boolean(),
  votedFor: v.nullable(PlayerIdSchema), lastSaidAt: v.nullable(ServerTimeSchema) });
const StateSchema = v.strictObject({ gameId: GameIdSchema, rulesVersion: v.literal("liar-game-v2"), revision: GameRevisionSchema,
  phase: v.picklist(["PLAYING", "FINISHED"]), stage: v.picklist(["REVEAL", "CLUE", "DISCUSSION", "VOTE", "REVOTE", "GUESS", "ROUND_RESULT", "FINISHED"]),
  roundNumber: LiarRoundNumberSchema, rounds: v.pipe(v.array(LiarRoundSummarySchema), v.maxLength(10)),
  startedAt: ServerTimeSchema, finishedAt: v.nullable(ServerTimeSchema), transitionId: TurnIdSchema, nextTransitionAt: v.nullable(ServerTimeSchema),
  settings: LiarSettingsSchema, category: LiarCategorySchema, word: LiarClueSchema, aliases: v.pipe(v.array(LiarClueSchema), v.maxLength(10)),
  liarPlayerId: PlayerIdSchema, players: v.pipe(v.array(Player), v.minLength(4), v.maxLength(8)),
  clueIndex: v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(8)),
  voteCandidates: v.pipe(v.array(PlayerIdSchema), v.maxLength(8)),
  voteRounds: v.pipe(v.array(v.pipe(v.array(LiarVoteRecordSchema), v.minLength(4), v.maxLength(8))), v.maxLength(2)),
  messages: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, text: LiarTextSchema, at: ServerTimeSchema })), v.maxLength(100)),
  result: v.nullable(LiarResultSchema) });
export type LiarState = v.InferOutput<typeof StateSchema>;

export function parseLiarState(input: unknown): LiarState {
  const s = v.parse(StateSchema, input), ids = s.players.map(p => p.playerId), members = new Set(ids);
  const validTarget = (actor: PlayerId, target: PlayerId | null) => target === null || members.has(target) && target !== actor;
  if (members.size !== ids.length || !members.has(s.liarPlayerId) || s.clueIndex > ids.length ||
    new Set(s.voteCandidates).size !== s.voteCandidates.length || s.voteCandidates.some(id => !members.has(id)) ||
    s.settings.category !== "RANDOM" && s.settings.category !== s.category ||
    s.players.some((p, i) => !validTarget(p.playerId, p.votedFor) || p.clue !== null && !p.clueDone || p.clueDone !== (i < s.clueIndex)) ||
    s.messages.some(m => !members.has(m.playerId) || m.at < s.startedAt) ||
    s.voteRounds.some(round => round.length !== ids.length || round.some((vote, i) => vote.playerId !== ids[i] || !validTarget(vote.playerId, vote.votedFor)))) throw new Error("Invalid LIAR roster or history.");
  const completed = s.stage === "ROUND_RESULT" || s.phase === "FINISHED" && s.result?.reason !== "CANCELLED";
  if (s.rounds.length !== s.roundNumber - (completed ? 0 : 1) && !(s.result?.reason === "CANCELLED" && s.rounds.length === s.roundNumber)) throw new Error("Invalid LIAR round count.");
  const seen = new Set<string>();
  for (const [i, round] of s.rounds.entries()) {
    const r = round.result, key = `${round.category}:${normalizeLiarAnswer(r.word)}`;
    const expected = ["GUESS_WRONG", "GUESS_TIMEOUT"].includes(r.reason) ? ids.filter(id => id !== r.liarPlayerId) : [r.liarPlayerId];
    if (round.roundNumber !== i + 1 || r.reason === "CANCELLED" || !members.has(r.liarPlayerId) || seen.has(key) ||
      r.winnerPlayerIds.length !== expected.length || expected.some(id => !r.winnerPlayerIds.includes(id)) ||
      r.voteRounds.some(votes => votes.length !== ids.length || new Set(votes.map(p => p.playerId)).size !== ids.length || votes.some(p => !members.has(p.playerId) || !validTarget(p.playerId, p.votedFor)))) throw new Error("Invalid LIAR completed rounds.");
    seen.add(key);
  }
  if (completed && (s.rounds.at(-1)?.category !== s.category || JSON.stringify(s.rounds.at(-1)?.result) !== JSON.stringify(s.result))) throw new Error("Invalid LIAR round result.");
  if (!completed && s.result?.reason !== "CANCELLED" && seen.has(`${s.category}:${normalizeLiarAnswer(s.word)}`)) throw new Error("Repeated LIAR prompt in match.");
  if (s.phase === "FINISHED" || s.stage === "ROUND_RESULT") {
    if ((s.phase === "FINISHED" ? s.stage !== "FINISHED" || s.finishedAt === null || s.finishedAt < s.startedAt : s.finishedAt !== null || s.roundNumber >= LIAR_TOTAL_ROUNDS) ||
      s.phase === "FINISHED" && s.result?.reason !== "CANCELLED" && s.roundNumber !== LIAR_TOTAL_ROUNDS || s.nextTransitionAt !== null || !s.result ||
      s.result.liarPlayerId !== s.liarPlayerId || s.result.word !== s.word ||
      JSON.stringify(s.result.voteRounds) !== JSON.stringify(s.voteRounds)) throw new Error("Invalid LIAR finish.");
    const result = s.result;
    const expected = result.reason === "CANCELLED" ? [] : ["GUESS_WRONG", "GUESS_TIMEOUT"].includes(result.reason) ? ids.filter(id => id !== s.liarPlayerId) : [s.liarPlayerId];
    if (JSON.stringify(result.winnerPlayerIds) !== JSON.stringify(expected) ||
      (result.reason === "GUESS_CORRECT" || result.reason === "GUESS_WRONG") && result.guess === null ||
      result.reason === "GUESS_CORRECT" && !isAnswer(s, result.guess!) || result.reason === "GUESS_WRONG" && isAnswer(s, result.guess!)) throw new Error("Invalid LIAR result.");
  } else {
    if (s.stage === "FINISHED" || s.result !== null || s.finishedAt !== null || s.nextTransitionAt === null || s.nextTransitionAt <= s.startedAt ||
      s.stage === "REVEAL" && s.clueIndex !== 0 || s.stage === "CLUE" && s.clueIndex >= ids.length ||
      ["DISCUSSION", "VOTE", "REVOTE", "GUESS"].includes(s.stage) && s.clueIndex !== ids.length ||
      s.stage === "REVOTE" && (s.voteRounds.length !== 1 || s.voteCandidates.length < 2) ||
      s.stage === "GUESS" && (s.voteCandidates.length !== 1 || s.voteCandidates[0] !== s.liarPlayerId || s.voteRounds.length === 0) ||
      ["REVEAL", "CLUE", "DISCUSSION", "VOTE"].includes(s.stage) && s.voteRounds.length !== 0 ||
      ["REVEAL", "CLUE", "DISCUSSION"].includes(s.stage) && s.players.some(p => p.votedFor !== null) ||
      ["VOTE", "REVOTE"].includes(s.stage) && s.players.some(p => p.votedFor !== null && !s.voteCandidates.includes(p.votedFor))) throw new Error("Invalid LIAR stage.");
  }
  return s;
}
export function createLiarGame(input: { gameId: string; playerIds: readonly PlayerId[]; liarPlayerId: PlayerId; settings: LiarSettings; prompt: LiarPrompt; now: number; transitionId: string }): LiarState {
  return parseLiarState({ gameId: input.gameId, rulesVersion: "liar-game-v2", revision: 0, roundNumber: 1, rounds: [], phase: "PLAYING", stage: "REVEAL", startedAt: input.now,
    finishedAt: null, transitionId: input.transitionId, nextTransitionAt: input.now + 15_000, settings: input.settings,
    category: input.prompt.category, word: input.prompt.word, aliases: [...input.prompt.aliases], liarPlayerId: input.liarPlayerId,
    players: input.playerIds.map(playerId => ({ playerId, clue: null, clueDone: false, votedFor: null, lastSaidAt: null })),
    clueIndex: 0, voteCandidates: [], voteRounds: [], messages: [], result: null });
}
function enter(s: LiarState, stage: Exclude<LiarState["stage"], "FINISHED" | "ROUND_RESULT">, now: number, id: string, seconds: number): void {
  s.stage = stage; s.transitionId = v.parse(TurnIdSchema, id); s.nextTransitionAt = v.parse(ServerTimeSchema, now + seconds * 1000);
}
function isAnswer(s: LiarState, text: string): boolean { return [s.word, ...s.aliases].some(word => normalizeLiarAnswer(word) === normalizeLiarAnswer(text)); }
function finish(s: LiarState, reason: LiarResult["reason"], now: number, guess: string | null = null): void {
  const winnerPlayerIds = reason === "CANCELLED" ? [] : reason === "GUESS_WRONG" || reason === "GUESS_TIMEOUT" ? s.players.filter(p => p.playerId !== s.liarPlayerId).map(p => p.playerId) : [s.liarPlayerId];
  const final = reason === "CANCELLED" || s.roundNumber === LIAR_TOTAL_ROUNDS;
  s.phase = final ? "FINISHED" : "PLAYING"; s.stage = final ? "FINISHED" : "ROUND_RESULT";
  s.finishedAt = final ? v.parse(ServerTimeSchema, now) : null; s.nextTransitionAt = null;
  s.result = { reason, winnerPlayerIds, liarPlayerId: s.liarPlayerId, word: s.word, guess, voteRounds: structuredClone(s.voteRounds) };
  if (reason !== "CANCELLED") s.rounds.push({ roundNumber: s.roundNumber, category: s.category, result: structuredClone(s.result) });
}
function nextClue(s: LiarState, now: number, id: string): void {
  s.clueIndex++;
  enter(s, s.clueIndex === s.players.length ? "DISCUSSION" : "CLUE", now, id, s.clueIndex === s.players.length ? s.settings.discussionSeconds : 30);
}
function resolveVotes(s: LiarState, now: number, id: string): void {
  s.voteRounds.push(s.players.map(p => ({ playerId: p.playerId, votedFor: p.votedFor })));
  const counts = s.voteCandidates.map(playerId => ({ playerId, count: s.players.filter(p => p.votedFor === playerId).length }));
  const highest = Math.max(0, ...counts.map(p => p.count));
  if (highest === 0) { finish(s, "NO_VOTES", now); return; }
  const tied = counts.filter(p => p.count === highest).map(p => p.playerId);
  if (tied.length > 1) {
    if (s.stage === "REVOTE") { finish(s, "TIE", now); return; }
    s.voteCandidates = tied; for (const p of s.players) p.votedFor = null;
    enter(s, "REVOTE", now, id, 30); return;
  }
  if (tied[0] !== s.liarPlayerId) { finish(s, "MISIDENTIFIED", now); return; }
  s.voteCandidates = [s.liarPlayerId]; enter(s, "GUESS", now, id, 20);
}
export function advanceLiar(input: LiarState, now: number, nextId: string): LiarState | null {
  if (input.phase !== "PLAYING" || input.nextTransitionAt === null || now < input.nextTransitionAt) return null;
  const s = structuredClone(input);
  switch (s.stage) {
    case "REVEAL": enter(s, "CLUE", now, nextId, 30); break;
    case "CLUE": s.players[s.clueIndex]!.clueDone = true; nextClue(s, now, nextId); break;
    case "DISCUSSION": s.voteCandidates = s.players.map(p => p.playerId); enter(s, "VOTE", now, nextId, 30); break;
    case "VOTE": case "REVOTE": resolveVotes(s, now, nextId); break;
    case "GUESS": finish(s, "GUESS_TIMEOUT", now); break;
    default: return null;
  }
  if (s.result !== null) s.transitionId = v.parse(TurnIdSchema, nextId);
  s.revision = v.parse(GameRevisionSchema, s.revision + 1); return parseLiarState(s);
}
export function commandLiar(input: LiarState, actor: PlayerId, c: Exclude<LiarClientCommand, { kind: "liar:configure" }>, now: number, nextId: string): LiarState | null {
  if (input.phase !== "PLAYING" || c.gameId !== input.gameId || c.phaseId !== input.transitionId || input.nextTransitionAt === null || now >= input.nextTransitionAt) return null;
  const s = structuredClone(input), p = s.players.find(p => p.playerId === actor);
  if (!p) return null;
  switch (c.kind) {
    case "liar:nextRound": return null;
    case "liar:clue": {
      const text = v.safeParse(LiarClueSchema, c.payload.text);
      if (s.stage !== "CLUE" || s.players[s.clueIndex]?.playerId !== actor || p.clueDone || !text.success) return null;
      p.clue = text.output; p.clueDone = true; nextClue(s, now, nextId); break;
    }
    case "liar:say": {
      const text = v.safeParse(LiarTextSchema, c.payload.text);
      if (s.stage !== "DISCUSSION" || !text.success || p.lastSaidAt !== null && now - p.lastSaidAt < 1000) return null;
      p.lastSaidAt = v.parse(ServerTimeSchema, now); s.messages.push({ playerId: actor, text: text.output, at: p.lastSaidAt }); s.messages = s.messages.slice(-100); break;
    }
    case "liar:vote":
      if (s.stage !== "VOTE" && s.stage !== "REVOTE" || p.votedFor !== null || c.payload.playerId === actor || !s.voteCandidates.includes(c.payload.playerId)) return null;
      p.votedFor = c.payload.playerId;
      if (s.players.every(p => p.votedFor !== null)) resolveVotes(s, now, nextId);
      break;
    case "liar:guess": {
      const text = v.safeParse(LiarClueSchema, c.payload.text);
      if (s.stage !== "GUESS" || actor !== s.liarPlayerId || !text.success) return null;
      finish(s, isAnswer(s, text.output) ? "GUESS_CORRECT" : "GUESS_WRONG", now, text.output); break;
    }
  }
  if (s.result !== null) s.transitionId = v.parse(TurnIdSchema, nextId);
  s.revision = v.parse(GameRevisionSchema, s.revision + 1); return parseLiarState(s);
}
export function cancelLiar(input: LiarState, now: number): LiarState {
  if (input.phase === "FINISHED") return input;
  const s = structuredClone(input); s.revision = v.parse(GameRevisionSchema, s.revision + 1); finish(s, "CANCELLED", now); return parseLiarState(s);
}

/** Scores are derived from completed results, so retries cannot award a round twice. */
export function liarScores(s: LiarState) {
  return s.players.map(p => ({ playerId: p.playerId, points: s.rounds.reduce((sum, round) => sum +
    (round.result.winnerPlayerIds.includes(p.playerId) ? p.playerId === round.result.liarPlayerId ? 3 : 1 : 0), 0) }));
}
export function liarMatchWinners(s: LiarState): PlayerId[] {
  if (s.phase !== "FINISHED" || s.result?.reason === "CANCELLED") return [];
  const scores = liarScores(s), highest = Math.max(...scores.map(p => p.points));
  return scores.filter(p => p.points === highest).map(p => p.playerId);
}
export function chooseLiarRoster(playerIds: readonly PlayerId[], rounds: LiarState["rounds"], random: RandomSource) {
  const counts = playerIds.map(playerId => ({ playerId, count: rounds.filter(r => r.result.liarPlayerId === playerId).length }));
  const maximum = Math.max(...counts.map(p => p.count));
  const weights = counts.map(p => maximum - p.count + 1);
  let draw = random.nextInt(weights.reduce((sum, weight) => sum + weight, 0));
  const selected = counts.find((_, index) => { draw -= weights[index]!; return draw < 0; });
  if (!selected) throw new Error("Invalid LIAR role draw.");
  // Every participant retains a nonzero chance; public history cannot identify the next liar.
  const liarPlayerId = selected.playerId, order = [...playerIds];
  for (let i = order.length - 1; i > 0; i--) { const j = random.nextInt(i + 1); [order[i], order[j]] = [order[j]!, order[i]!]; }
  return { liarPlayerId, playerIds: order };
}
export function nextLiarRound(input: LiarState, roster: { playerIds: readonly PlayerId[]; liarPlayerId: PlayerId }, prompt: LiarPrompt, now: number, nextId: string): LiarState | null {
  if (input.phase !== "PLAYING" || input.stage !== "ROUND_RESULT" || input.roundNumber >= LIAR_TOTAL_ROUNDS ||
    roster.playerIds.length !== input.players.length || roster.playerIds.some(id => !input.players.some(p => p.playerId === id))) return null;
  const fresh = createLiarGame({ gameId: input.gameId, ...roster, settings: input.settings, prompt, now, transitionId: nextId });
  return parseLiarState({ ...fresh, startedAt: input.startedAt, revision: input.revision + 1, roundNumber: input.roundNumber + 1, rounds: structuredClone(input.rounds) });
}
