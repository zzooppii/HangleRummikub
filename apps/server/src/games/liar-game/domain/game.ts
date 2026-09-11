import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema, ServerTimeSchema, GameRevisionSchema, LiarSettingsSchema,
  LiarCategorySchema, LiarClueSchema, LiarTextSchema, LiarResultSchema, LiarVoteRecordSchema,
  type PlayerId, type LiarClientCommand, type LiarSettings, type LiarResult } from "@hangul-rummikub/shared";
import { normalizeLiarAnswer, type LiarPrompt } from "./prompts.js";

const Player = v.strictObject({ playerId: PlayerIdSchema, clue: v.nullable(LiarClueSchema), clueDone: v.boolean(),
  votedFor: v.nullable(PlayerIdSchema), lastSaidAt: v.nullable(ServerTimeSchema) });
const StateSchema = v.strictObject({ gameId: GameIdSchema, rulesVersion: v.literal("liar-game-v1"), revision: GameRevisionSchema,
  phase: v.picklist(["PLAYING", "FINISHED"]), stage: v.picklist(["REVEAL", "CLUE", "DISCUSSION", "VOTE", "REVOTE", "GUESS", "FINISHED"]),
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
  if (s.phase === "FINISHED") {
    if (s.stage !== "FINISHED" || s.finishedAt === null || s.finishedAt < s.startedAt || s.nextTransitionAt !== null || !s.result ||
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
  return parseLiarState({ gameId: input.gameId, rulesVersion: "liar-game-v1", revision: 0, phase: "PLAYING", stage: "REVEAL", startedAt: input.now,
    finishedAt: null, transitionId: input.transitionId, nextTransitionAt: input.now + 15_000, settings: input.settings,
    category: input.prompt.category, word: input.prompt.word, aliases: [...input.prompt.aliases], liarPlayerId: input.liarPlayerId,
    players: input.playerIds.map(playerId => ({ playerId, clue: null, clueDone: false, votedFor: null, lastSaidAt: null })),
    clueIndex: 0, voteCandidates: [], voteRounds: [], messages: [], result: null });
}
function enter(s: LiarState, stage: Exclude<LiarState["stage"], "FINISHED">, now: number, id: string, seconds: number): void {
  s.stage = stage; s.transitionId = v.parse(TurnIdSchema, id); s.nextTransitionAt = v.parse(ServerTimeSchema, now + seconds * 1000);
}
function isAnswer(s: LiarState, text: string): boolean { return [s.word, ...s.aliases].some(word => normalizeLiarAnswer(word) === normalizeLiarAnswer(text)); }
function finish(s: LiarState, reason: LiarResult["reason"], now: number, guess: string | null = null): void {
  const winnerPlayerIds = reason === "CANCELLED" ? [] : reason === "GUESS_WRONG" || reason === "GUESS_TIMEOUT" ? s.players.filter(p => p.playerId !== s.liarPlayerId).map(p => p.playerId) : [s.liarPlayerId];
  s.phase = "FINISHED"; s.stage = "FINISHED"; s.finishedAt = v.parse(ServerTimeSchema, now); s.nextTransitionAt = null;
  s.result = { reason, winnerPlayerIds, liarPlayerId: s.liarPlayerId, word: s.word, guess, voteRounds: structuredClone(s.voteRounds) };
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
  s.revision = v.parse(GameRevisionSchema, s.revision + 1); return parseLiarState(s);
}
export function commandLiar(input: LiarState, actor: PlayerId, c: Exclude<LiarClientCommand, { kind: "liar:configure" }>, now: number, nextId: string): LiarState | null {
  if (input.phase !== "PLAYING" || c.gameId !== input.gameId || c.phaseId !== input.transitionId || input.nextTransitionAt === null || now >= input.nextTransitionAt) return null;
  const s = structuredClone(input), p = s.players.find(p => p.playerId === actor);
  if (!p) return null;
  switch (c.kind) {
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
  s.revision = v.parse(GameRevisionSchema, s.revision + 1); return parseLiarState(s);
}
export function cancelLiar(input: LiarState, now: number): LiarState {
  if (input.phase === "FINISHED") return input;
  const s = structuredClone(input); s.revision = v.parse(GameRevisionSchema, s.revision + 1); finish(s, "CANCELLED", now); return parseLiarState(s);
}
