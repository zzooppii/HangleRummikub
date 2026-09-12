import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "valibot";
import { PlayerIdSchema, SpyfallClientCommandSchema, GameRevisionSchema, GameIdSchema, ServerTimeSchema, SPYFALL_DEFAULT_SETTINGS, type PlayerId } from "@hangul-rummikub/shared";
import { createSpyfallGame, commandSpyfall, advanceSpyfall, cancelSpyfall, parseSpyfallState, type SpyfallState } from "./games/spyfall/domain/game.js";
import { projectSpyfall } from "./games/spyfall/compatibility/projector.js";
let sequence = 0;
const id = () => `phase-${++sequence}`;
function create(count = 4, roles = false) {
  const playerIds = Array.from({ length: count }, (_, i) => parse(PlayerIdSchema, `p${i}`));
  return createSpyfallGame({ gameId: "spy-game", playerIds, spyPlayerId: playerIds.at(-1)!, settings: { ...SPYFALL_DEFAULT_SETTINGS, useRoles: roles }, location: "HOSPITAL", now: 1000, transitionId: id() });
}
function start(count = 4, roles = false) { return advanceSpyfall(create(count, roles), 16_000, id())!; }
function cmd(s: SpyfallState, actor: PlayerId, kind: string, payload: unknown = {}, now = 16_001): SpyfallState | null {
  const c = parse(SpyfallClientCommandSchema, { kind: `spyfall:${kind}`, protocolVersion: 1, requestId: id(), gameId: s.gameId, phaseId: s.transitionId, payload });
  if (c.kind === "spyfall:configure") throw new Error("Not a game action.");
  return commandSpyfall(s, actor, c, now, id());
}
function projected(s: SpyfallState, viewer: PlayerId) { return projectSpyfall({ gameId: parse(GameIdSchema, s.gameId), gameRevision: parse(GameRevisionSchema, s.revision), startedAt: parse(ServerTimeSchema, s.startedAt), finishedAt: s.finishedAt, state: s }, viewer); }
for (const count of [3, 4, 6, 8]) test(`SPYFALL ${count} participants receive one spy; atomic legal questioning and no immediate return question`, () => {
  const s = start(count, true), before = structuredClone(s), a = s.players[0]!.playerId, b = s.players[1]!.playerId;
  assert.equal(s.stage, "QUESTION"); assert.equal(s.roundDeadlineAt, 496_000);
  assert.equal(s.players.filter(p => p.job === null).length, 1);
  assert.equal(cmd(s, b, "ask", { playerId: a }), null);
  assert.equal(cmd(s, a, "ask", { playerId: a }), null);
  assert.equal(cmd(s, a, "ask", { playerId: "unknown" }), null);
  const answer = cmd(s, a, "ask", { playerId: b })!;
  assert.deepEqual(s, before); assert.equal(answer.stage, "ANSWER");
  assert.equal(cmd(answer, a, "answer"), null);
  const next = cmd(answer, b, "answer")!; assert.equal(next.questionerId, b); assert.equal(next.previousQuestionerId, a);
  assert.equal(cmd(next, b, "ask", { playerId: a }), null); assert.equal(next.history[0]?.completed, true);
});
test("SPYFALL private projection never includes selected location, spy identity, jobs or ballots for unauthorized viewers", () => {
  const s = start(4, true), spy = projected(s, s.spyPlayerId), citizen = projected(s, s.players[0]!.playerId);
  assert.equal(spy.phase, "PLAYING"); assert.equal(citizen.phase, "PLAYING");
  const wire = JSON.stringify(spy);
  for (const secret of ['"HOSPITAL"', '"job"', '"spyPlayerId"', '"voteRounds"', '"ballots"']) assert.ok(!wire.includes(secret), secret);
  if (citizen.phase === "PLAYING") { assert.equal(citizen.privateView.role, "CITIZEN"); if (citizen.privateView.role === "CITIZEN") assert.equal(citizen.privateView.location, "HOSPITAL"); }
  assert.throws(() => projected(s, parse(PlayerIdSchema, "outsider")));
});
test("SPYFALL accusation pauses both deadlines; failed vote restores remaining action time and consumes only accuser's chance", () => {
  let s = start(), a = s.players[0]!.playerId, b = s.players[1]!.playerId, spy = s.spyPlayerId;
  s = cmd(s, a, "ask", { playerId: b })!; const deadline = s.nextTransitionAt!, round = s.roundDeadlineAt!;
  const vote = cmd(s, b, "accuse", { playerId: spy }, 20_000)!;
  assert.equal(vote.roundDeadlineAt, null); assert.equal(vote.remainingMs, round - 20_000); assert.equal(vote.actionRemainingMs, deadline - 20_000);
  assert.equal(cmd(vote, spy, "vote", { agree: true }, 21_000), null);
  assert.equal(cmd(vote, spy, "reveal", {}, 21_000), null);
  const first = cmd(vote, a, "vote", { agree: false }, 21_000)!;
  assert.equal(cmd(first, a, "vote", { agree: true }, 21_000), null);
  const resumed = cmd(first, s.players[2]!.playerId, "vote", { agree: true }, 22_000)!;
  assert.equal(resumed.stage, "ANSWER"); assert.equal(resumed.nextTransitionAt, deadline + 2000); assert.equal(resumed.roundDeadlineAt, round + 2000);
  assert.equal(resumed.respondentId, b); assert.equal(cmd(resumed, b, "accuse", { playerId: spy }, 22_001), null);
  assert.equal(resumed.voteRounds[0]?.convicted, false);
  const strangerView = projected(first, spy); assert.equal(strangerView.phase, "PLAYING"); if (strangerView.phase === "PLAYING") assert.equal(strangerView.privateView.vote, null);
  assert.ok(!JSON.stringify(strangerView).includes('"ballots"'));
});
test("SPYFALL innocent conviction still ends immediately with a spy victory", () => {
  let s = start(); const accuser = s.players[0]!.playerId, suspect = s.players[1]!.playerId;
  s = cmd(s, accuser, "accuse", { playerId: suspect })!;
  for (const p of s.players.filter(p => p.playerId !== accuser && p.playerId !== suspect)) s = cmd(s, p.playerId, "vote", { agree: true })!;
  assert.equal(s.phase, "FINISHED"); assert.equal(s.result?.reason, "MISIDENTIFIED");
  assert.equal(cmd(s, s.spyPlayerId, "reveal"), null); assert.equal(s.result?.voteRounds[0]?.convicted, true);
  assert.doesNotThrow(() => projected(s, accuser));
});
for (const final of [false, true]) for (const mode of ["correct", "wrong", "timeout"] as const) test(`SPYFALL ${final ? "final" : "midround"} spy conviction offers one private last guess: ${mode}`, () => {
  let s = start(); let now = 16_001;
  if (final) { now = s.roundDeadlineAt!; s = advanceSpyfall(s, now, id())!; }
  const accuser = s.players[0]!.playerId, spy = s.spyPlayerId;
  s = cmd(s, accuser, "accuse", { playerId: spy }, now)!;
  const votePhase = s.transitionId;
  for (const p of s.players.filter(p => p.playerId !== accuser && p.playerId !== spy)) s = cmd(s, p.playerId, "vote", { agree: true }, now)!;
  assert.equal(s.phase, "PLAYING"); assert.equal(s.stage, "GUESS"); assert.equal(s.result, null);
  assert.notEqual(s.transitionId, votePhase); assert.equal(s.nextTransitionAt, now + 20_000);
  assert.equal(s.roundDeadlineAt, null); assert.equal(s.voteRounds.at(-1)?.final, final);
  assert.equal(s.voteRounds.at(-1)?.convicted, true);
  const wire = projected(s, spy); assert.equal(wire.phase, "PLAYING");
  if (wire.phase === "PLAYING") { assert.equal(wire.revealedSpyId, spy); assert.equal(wire.privateView.role, "SPY"); assert.equal(wire.finalAccuserId, null); }
  for (const secret of ['"HOSPITAL"', '"job"', '"result"', '"ballots"']) assert.ok(!JSON.stringify(wire).includes(secret), secret);
  assert.doesNotThrow(() => projected(s, accuser));
  assert.equal(cmd(s, accuser, "guess", { location: "HOSPITAL" }, now), null);
  assert.equal(cmd(s, spy, "reveal", {}, now), null);
  assert.equal(cmd(s, spy, "guess", { location: "HOSPITAL" }, s.nextTransitionAt!), null);
  const before = structuredClone(s);
  const end = mode === "timeout" ? advanceSpyfall(s, s.nextTransitionAt!, id())! : cmd(s, spy, "guess", { location: mode === "correct" ? "HOSPITAL" : "SCHOOL" }, now + 1)!;
  assert.deepEqual(s, before);
  assert.equal(end.result?.reason, mode === "correct" ? "GUESS_CORRECT" : mode === "wrong" ? "GUESS_WRONG" : "GUESS_TIMEOUT");
  assert.deepEqual(end.result?.winnerPlayerIds, mode === "correct" ? [spy] : s.players.filter(p => p.playerId !== spy).map(p => p.playerId));
  assert.equal(end.result?.voteRounds.at(-1)?.convicted, true);
  assert.equal(cmd(end, spy, "guess", { location: "HOSPITAL" }, now + 2), null);
  assert.doesNotThrow(() => projected(end, spy));
});
for (const mode of ["correct", "wrong", "timeout"] as const) test(`SPYFALL voluntary spy reveal and ${mode} guess`, () => {
  let s = start(); assert.equal(cmd(s, s.players[0]!.playerId, "reveal"), null);
  assert.equal(cmd(s, s.spyPlayerId, "guess", { location: "HOSPITAL" }), null);
  s = cmd(s, s.spyPlayerId, "reveal")!; const view = projected(s, s.players[0]!.playerId);
  assert.equal(view.phase, "PLAYING"); if (view.phase === "PLAYING") assert.equal(view.revealedSpyId, s.spyPlayerId);
  assert.equal(cmd(s, s.players[0]!.playerId, "guess", { location: "HOSPITAL" }), null);
  assert.equal(cmd(s, s.players[0]!.playerId, "accuse", { playerId: s.spyPlayerId }), null);
  s = mode === "timeout" ? advanceSpyfall(s, s.nextTransitionAt!, id())! : cmd(s, s.spyPlayerId, "guess", { location: mode === "correct" ? "HOSPITAL" : "SCHOOL" })!;
  assert.equal(s.result?.reason, mode === "correct" ? "GUESS_CORRECT" : mode === "wrong" ? "GUESS_WRONG" : "GUESS_TIMEOUT");
  assert.doesNotThrow(() => projected(s, s.spyPlayerId));
});
test("SPYFALL timeouts advance idle players; exact round boundary closes voluntary guesses and exhausts final accusations", () => {
  let s = start(); s = advanceSpyfall(s, s.nextTransitionAt!, id())!; assert.equal(s.questionerId, s.players[1]!.playerId); assert.equal(s.history[0]?.respondentId, null);
  const at = s.roundDeadlineAt!;
  assert.equal(cmd(s, s.spyPlayerId, "reveal", {}, at), null);
  s = advanceSpyfall(s, at, id())!; assert.equal(s.stage, "FINAL_ACCUSATION"); assert.equal(s.finalIndex, 0);
  assert.equal(cmd(s, s.spyPlayerId, "reveal", {}, at + 1), null);
  const wrongActor = s.players[1]!.playerId; assert.equal(cmd(s, wrongActor, "skip", {}, at + 1), null);
  for (let i = 0; i < 4; i++) s = advanceSpyfall(s, s.nextTransitionAt!, id())!;
  assert.equal(s.result?.reason, "ESCAPED"); assert.equal(advanceSpyfall(s, at + 200_000, id()), null);
});
test("SPYFALL final accusation allows a spent accuser, failed vote proceeds to next person, missing ballots prevent unanimity", () => {
  let s = start(), a = s.players[0]!.playerId;
  s = cmd(s, a, "accuse", { playerId: s.spyPlayerId })!;
  s = advanceSpyfall(s, s.nextTransitionAt!, id())!; assert.equal(s.stage, "QUESTION"); assert.equal(s.players[0]?.accusationUsed, true);
  s = advanceSpyfall(s, s.roundDeadlineAt!, id())!; const at = s.nextTransitionAt! - 1000;
  s = cmd(s, a, "accuse", { playerId: s.spyPlayerId }, at)!; assert.equal(s.stage, "ACCUSATION");
  s = advanceSpyfall(s, s.nextTransitionAt!, id())!; assert.equal(s.finalIndex, 1); assert.equal(s.stage, "FINAL_ACCUSATION");
  assert.equal(s.voteRounds[1]?.final, true);
});
test("SPYFALL stale phase commands and early deadlines are inert; corrupt state is rejected and cancellation discloses only final result", () => {
  const s = start(), before = structuredClone(s), a = s.players[0]!.playerId;
  const stale = parse(SpyfallClientCommandSchema, { kind: "spyfall:ask", protocolVersion: 1, requestId: id(), gameId: s.gameId, phaseId: "stale", payload: { playerId: s.players[1]!.playerId } });
  if (stale.kind === "spyfall:configure") throw new Error();
  assert.equal(commandSpyfall(s, a, stale, 16_001, id()), null); assert.equal(advanceSpyfall(s, 16_001, id()), null); assert.deepEqual(s, before);
  assert.throws(() => parseSpyfallState({ ...s, spyPlayerId: "outsider" })); assert.throws(() => parseSpyfallState({ ...s, players: [s.players[0], ...s.players.slice(0, 3)] }));
  assert.throws(() => parseSpyfallState({ ...s, roundDeadlineAt: null }));
  const cancelled = cancelSpyfall(s, 20_000); assert.deepEqual(cancelled.result?.winnerPlayerIds, []); assert.equal(cancelled.result?.reason, "CANCELLED"); assert.deepEqual(s, before);
});
