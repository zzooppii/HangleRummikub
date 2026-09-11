import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema, ServerTimeSchema, GameRevisionSchema, SpyfallSettingsSchema, SpyfallLocationSchema,
  SpyfallRoleLabelSchema, SpyfallResultSchema, SpyfallVoteRecordSchema, SpyfallHistorySchema, spyfallLocations,
  type PlayerId, type SpyfallClientCommand, type SpyfallSettings, type SpyfallResult, type SpyfallLocation } from "@hangul-rummikub/shared";
import { spyfallJob } from "./locations.js";
const Milliseconds = v.pipe(v.number(), v.safeInteger(), v.minValue(0), v.maxValue(600_000));
const Player = v.strictObject({ playerId: PlayerIdSchema, job: v.nullable(SpyfallRoleLabelSchema), accusationUsed: v.boolean(), vote: v.nullable(v.boolean()) });
const StateSchema = v.strictObject({ gameId: GameIdSchema, rulesVersion: v.literal("spyfall-v1"), revision: GameRevisionSchema,
  phase: v.picklist(["PLAYING", "FINISHED"]), stage: v.picklist(["REVEAL", "QUESTION", "ANSWER", "ACCUSATION", "FINAL_ACCUSATION", "GUESS", "FINISHED"]),
  startedAt: ServerTimeSchema, finishedAt: v.nullable(ServerTimeSchema), transitionId: TurnIdSchema, nextTransitionAt: v.nullable(ServerTimeSchema),
  settings: SpyfallSettingsSchema, location: SpyfallLocationSchema, spyPlayerId: PlayerIdSchema, players: v.pipe(v.array(Player), v.minLength(3), v.maxLength(8)),
  questionerId: PlayerIdSchema, previousQuestionerId: v.nullable(PlayerIdSchema), respondentId: v.nullable(PlayerIdSchema),
  roundDeadlineAt: v.nullable(ServerTimeSchema), remainingMs: Milliseconds, actionRemainingMs: Milliseconds,
  resumeStage: v.picklist(["QUESTION", "ANSWER"]), accuserId: v.nullable(PlayerIdSchema), suspectId: v.nullable(PlayerIdSchema),
  finalIndex: v.pipe(v.number(), v.safeInteger(), v.minValue(-1), v.maxValue(8)),
  history: v.pipe(v.array(SpyfallHistorySchema), v.maxLength(100)), voteRounds: v.pipe(v.array(SpyfallVoteRecordSchema), v.maxLength(16)), result: v.nullable(SpyfallResultSchema) });
export type SpyfallState = v.InferOutput<typeof StateSchema>;
export function parseSpyfallState(input: unknown): SpyfallState {
  const s = v.parse(StateSchema, input), ids = s.players.map(p => p.playerId), members = new Set(ids);
  const belongs = (id: PlayerId | null) => id === null || members.has(id);
  const active = s.stage === "QUESTION" || s.stage === "ANSWER";
  if (members.size !== ids.length || !members.has(s.spyPlayerId) || !members.has(s.questionerId) ||
    ![s.previousQuestionerId, s.respondentId, s.accuserId, s.suspectId].every(belongs) || s.previousQuestionerId === s.questionerId ||
    s.respondentId !== null && (s.respondentId === s.questionerId || s.respondentId === s.previousQuestionerId) ||
    !spyfallLocations(s.settings.locationPack).includes(s.location) || s.finalIndex > ids.length ||
    s.players.some(p => p.playerId === s.spyPlayerId ? p.job !== null : (p.job !== null) !== s.settings.useRoles) ||
    s.history.some(h => !members.has(h.questionerId) || !belongs(h.respondentId) || h.questionerId === h.respondentId || h.completed && h.respondentId === null)) throw new Error("Invalid SPYFALL roster or history.");
  for (const r of s.voteRounds) {
    if (!members.has(r.accuserId) || !members.has(r.suspectId) || r.accuserId === r.suspectId || r.ballots.length !== ids.length ||
      r.ballots.some((b, i) => b.playerId !== ids[i] || b.playerId === r.suspectId && b.agree !== null || b.playerId === r.accuserId && b.agree !== true) ||
      r.convicted !== r.ballots.filter(b => b.playerId !== r.suspectId).every(b => b.agree === true)) throw new Error("Invalid SPYFALL ballot history.");
  }
  if (s.phase === "FINISHED") {
    const r = s.result;
    if (s.stage !== "FINISHED" || s.finishedAt === null || s.finishedAt < s.startedAt || s.nextTransitionAt !== null || s.roundDeadlineAt !== null || !r ||
      r.spyPlayerId !== s.spyPlayerId || r.location !== s.location || JSON.stringify(r.voteRounds) !== JSON.stringify(s.voteRounds)) throw new Error("Invalid SPYFALL finish.");
    const citizenWin = ["SPY_CAUGHT", "GUESS_WRONG", "GUESS_TIMEOUT"].includes(r.reason);
    const winners = r.reason === "CANCELLED" ? [] : citizenWin ? ids.filter(id => id !== s.spyPlayerId) : [s.spyPlayerId];
    const lastVote = s.voteRounds.at(-1);
    if (JSON.stringify(r.winnerPlayerIds) !== JSON.stringify(winners) ||
      (r.reason === "GUESS_CORRECT" || r.reason === "GUESS_WRONG") !== (r.guess !== null) ||
      r.guess !== null && !spyfallLocations(s.settings.locationPack).includes(r.guess) ||
      r.reason === "GUESS_CORRECT" && r.guess !== s.location || r.reason === "GUESS_WRONG" && r.guess === s.location ||
      r.reason === "SPY_CAUGHT" && (!lastVote?.convicted || lastVote.suspectId !== s.spyPlayerId) ||
      r.reason === "MISIDENTIFIED" && (!lastVote?.convicted || lastVote.suspectId === s.spyPlayerId) ||
      r.reason === "ESCAPED" && s.finalIndex !== ids.length) throw new Error("Invalid SPYFALL result.");
  } else {
    if (s.stage === "FINISHED" || s.result !== null || s.finishedAt !== null || s.nextTransitionAt === null || s.nextTransitionAt <= s.startedAt ||
      active !== (s.roundDeadlineAt !== null) || active && (s.nextTransitionAt > s.roundDeadlineAt! || s.finalIndex !== -1) ||
      s.stage === "QUESTION" && s.respondentId !== null || s.stage === "ANSWER" && s.respondentId === null ||
      s.stage === "REVEAL" && (s.finalIndex !== -1 || s.history.length > 0 || s.voteRounds.length > 0) ||
      s.stage === "ACCUSATION" && (s.accuserId === null || s.suspectId === null || s.accuserId === s.suspectId ||
        s.players.find(p => p.playerId === s.accuserId)?.vote !== true || s.players.find(p => p.playerId === s.suspectId)?.vote !== null ||
        s.finalIndex === -1 && s.remainingMs <= 0) ||
      s.stage !== "ACCUSATION" && (s.accuserId !== null || s.suspectId !== null || s.players.some(p => p.vote !== null)) ||
      s.stage === "FINAL_ACCUSATION" && (s.finalIndex < 0 || s.finalIndex >= ids.length) ||
      s.stage === "GUESS" && s.finalIndex !== -1) throw new Error("Invalid SPYFALL phase.");
  }
  return s;
}
export function createSpyfallGame(input: { gameId: string; playerIds: readonly PlayerId[]; spyPlayerId: PlayerId; settings: SpyfallSettings; location: SpyfallLocation; now: number; transitionId: string }): SpyfallState {
  let jobIndex = 0;
  return parseSpyfallState({ gameId: input.gameId, rulesVersion: "spyfall-v1", revision: 0, phase: "PLAYING", stage: "REVEAL", startedAt: input.now,
    finishedAt: null, transitionId: input.transitionId, nextTransitionAt: input.now + 15_000, settings: input.settings, location: input.location, spyPlayerId: input.spyPlayerId,
    players: input.playerIds.map(playerId => ({ playerId, job: playerId !== input.spyPlayerId && input.settings.useRoles ? spyfallJob(input.location, jobIndex++) : null, accusationUsed: false, vote: null })),
    questionerId: input.playerIds[0], previousQuestionerId: null, respondentId: null, roundDeadlineAt: null, remainingMs: input.settings.roundSeconds * 1000,
    actionRemainingMs: 60_000, resumeStage: "QUESTION", accuserId: null, suspectId: null, finalIndex: -1, history: [], voteRounds: [], result: null });
}
function enter(s: SpyfallState, stage: SpyfallState["stage"], now: number, id: string, milliseconds: number): void {
  s.stage = stage; s.transitionId = v.parse(TurnIdSchema, id); s.nextTransitionAt = v.parse(ServerTimeSchema, now + milliseconds);
}
function finish(s: SpyfallState, reason: SpyfallResult["reason"], now: number, guess: SpyfallLocation | null = null): void {
  const citizenWin = ["SPY_CAUGHT", "GUESS_WRONG", "GUESS_TIMEOUT"].includes(reason);
  s.phase = "FINISHED"; s.stage = "FINISHED"; s.finishedAt = v.parse(ServerTimeSchema, now); s.nextTransitionAt = null; s.roundDeadlineAt = null;
  s.result = { reason, winnerPlayerIds: reason === "CANCELLED" ? [] : citizenWin ? s.players.filter(p => p.playerId !== s.spyPlayerId).map(p => p.playerId) : [s.spyPlayerId], spyPlayerId: s.spyPlayerId, location: s.location, guess, voteRounds: structuredClone(s.voteRounds) };
}
function timedQuestion(s: SpyfallState, now: number, id: string, stage: "QUESTION" | "ANSWER", duration = 60_000): void {
  enter(s, stage, now, id, Math.min(duration, s.roundDeadlineAt! - now));
}
function recordAnswer(s: SpyfallState, completed: boolean): void {
  s.history.push({ questionerId: s.questionerId, respondentId: s.respondentId, completed }); s.history = s.history.slice(-100);
  const old = s.questionerId;
  // An unanswered selection passes clockwise; no invented question/answer is recorded.
  s.questionerId = s.respondentId ?? s.players[(s.players.findIndex(p => p.playerId === old) + 1) % s.players.length]!.playerId;
  s.previousQuestionerId = old; s.respondentId = null;
}
function finalAccusation(s: SpyfallState, now: number, id: string): void {
  s.roundDeadlineAt = null; s.remainingMs = 0; s.accuserId = null; s.suspectId = null; for (const p of s.players) p.vote = null;
  s.finalIndex++;
  if (s.finalIndex >= s.players.length) finish(s, "ESCAPED", now);
  else enter(s, "FINAL_ACCUSATION", now, id, 20_000);
}
function resolveVotes(s: SpyfallState, now: number, id: string): void {
  const suspect = s.suspectId!, convicted = s.players.filter(p => p.playerId !== suspect).every(p => p.vote === true);
  s.voteRounds.push({ accuserId: s.accuserId!, suspectId: suspect, final: s.finalIndex >= 0, convicted, ballots: s.players.map(p => ({ playerId: p.playerId, agree: p.vote })) });
  if (convicted) { finish(s, suspect === s.spyPlayerId ? "SPY_CAUGHT" : "MISIDENTIFIED", now); return; }
  s.accuserId = null; s.suspectId = null; for (const p of s.players) p.vote = null;
  if (s.finalIndex >= 0) finalAccusation(s, now, id);
  else { s.roundDeadlineAt = v.parse(ServerTimeSchema, now + s.remainingMs); timedQuestion(s, now, id, s.resumeStage, s.actionRemainingMs); }
}
function changed(s: SpyfallState): SpyfallState { s.revision = v.parse(GameRevisionSchema, s.revision + 1); return parseSpyfallState(s); }
export function advanceSpyfall(input: SpyfallState, now: number, nextId: string): SpyfallState | null {
  if (input.phase !== "PLAYING" || input.nextTransitionAt === null || now < input.nextTransitionAt) return null;
  const s = structuredClone(input);
  switch (s.stage) {
    case "REVEAL": s.roundDeadlineAt = v.parse(ServerTimeSchema, now + s.remainingMs); timedQuestion(s, now, nextId, "QUESTION"); break;
    case "QUESTION": case "ANSWER":
      if (s.roundDeadlineAt === null || now >= s.roundDeadlineAt) finalAccusation(s, now, nextId);
      else { recordAnswer(s, false); timedQuestion(s, now, nextId, "QUESTION"); } break;
    case "ACCUSATION": resolveVotes(s, now, nextId); break;
    case "FINAL_ACCUSATION": finalAccusation(s, now, nextId); break;
    case "GUESS": finish(s, "GUESS_TIMEOUT", now); break;
    default: return null;
  }
  return changed(s);
}
export function commandSpyfall(input: SpyfallState, actor: PlayerId, c: Exclude<SpyfallClientCommand, { kind: "spyfall:configure" }>, now: number, nextId: string): SpyfallState | null {
  if (input.phase !== "PLAYING" || c.gameId !== input.gameId || c.phaseId !== input.transitionId || input.nextTransitionAt === null || now >= input.nextTransitionAt) return null;
  const s = structuredClone(input), p = s.players.find(p => p.playerId === actor);
  if (!p) return null;
  switch (c.kind) {
    case "spyfall:ask":
      if (s.stage !== "QUESTION" || s.questionerId !== actor || c.payload.playerId === actor || c.payload.playerId === s.previousQuestionerId || !s.players.some(p => p.playerId === c.payload.playerId)) return null;
      s.respondentId = c.payload.playerId; timedQuestion(s, now, nextId, "ANSWER"); break;
    case "spyfall:answer":
      if (s.stage !== "ANSWER" || s.respondentId !== actor) return null;
      recordAnswer(s, true); timedQuestion(s, now, nextId, "QUESTION"); break;
    case "spyfall:accuse": {
      const regular = s.stage === "QUESTION" || s.stage === "ANSWER";
      if (!regular && s.stage !== "FINAL_ACCUSATION" || c.payload.playerId === actor || !s.players.some(p => p.playerId === c.payload.playerId) ||
        regular && p.accusationUsed || !regular && s.players[s.finalIndex]?.playerId !== actor) return null;
      if (regular) {
        p.accusationUsed = true; s.remainingMs = s.roundDeadlineAt! - now; s.actionRemainingMs = s.nextTransitionAt! - now;
        s.resumeStage = s.stage === "ANSWER" ? "ANSWER" : "QUESTION";
      }
      s.roundDeadlineAt = null; s.accuserId = actor; s.suspectId = c.payload.playerId;
      for (const member of s.players) member.vote = member.playerId === actor ? true : null;
      enter(s, "ACCUSATION", now, nextId, 30_000); break;
    }
    case "spyfall:vote":
      if (s.stage !== "ACCUSATION" || actor === s.suspectId || p.vote !== null) return null;
      p.vote = c.payload.agree;
      if (s.players.filter(p => p.playerId !== s.suspectId).every(p => p.vote !== null)) resolveVotes(s, now, nextId);
      break;
    case "spyfall:skip":
      if (s.stage !== "FINAL_ACCUSATION" || s.players[s.finalIndex]?.playerId !== actor) return null;
      finalAccusation(s, now, nextId); break;
    case "spyfall:reveal":
      if (actor !== s.spyPlayerId || s.stage !== "QUESTION" && s.stage !== "ANSWER") return null;
      s.remainingMs = s.roundDeadlineAt! - now; s.roundDeadlineAt = null; enter(s, "GUESS", now, nextId, 20_000); break;
    case "spyfall:guess":
      if (s.stage !== "GUESS" || actor !== s.spyPlayerId || !spyfallLocations(s.settings.locationPack).includes(c.payload.location)) return null;
      finish(s, s.location === c.payload.location ? "GUESS_CORRECT" : "GUESS_WRONG", now, c.payload.location); break;
  }
  return changed(s);
}
export function cancelSpyfall(input: SpyfallState, now: number): SpyfallState {
  if (input.phase === "FINISHED") return input;
  const s = structuredClone(input); finish(s, "CANCELLED", now); return changed(s);
}
