import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "valibot";
import { GameRevisionSchema, LiarClientCommandSchema, PlayerIdSchema, type LiarClientCommand } from "@hangul-rummikub/shared";
import { createLiarGame, advanceLiar, commandLiar, cancelLiar, parseLiarState, nextLiarRound, liarScores, liarMatchWinners, chooseLiarRoster, type LiarState } from "./games/liar-game/domain/game.js";
import { projectLiar } from "./games/liar-game/compatibility/projector.js";
import { LiarGameStateAdapter } from "./games/liar-game/compatibility/adapter.js";
import { CuratedLiarPrompts, normalizeLiarAnswer, rememberLiarPrompt, type LiarPromptHistory } from "./games/liar-game/domain/prompts.js";
const ids = ["a", "b", "c", "d"].map(x => parse(PlayerIdSchema, x));
let seq = 0;
function create() { return createLiarGame({ gameId: "liar-game", playerIds: ids, liarPlayerId: ids[3]!, settings: { category: "FOOD", discussionSeconds: 90 }, prompt: { category: "FOOD", word: "돈가스", aliases: ["돈까스"] }, now: 1000, transitionId: "reveal" }); }
function next(s: LiarState) { const next = advanceLiar(s, s.nextTransitionAt!, `phase-${++seq}`); assert.ok(next); return next; }
function stage(target: LiarState["stage"]) { let s = create(); for (let n = 0; n < 20 && s.stage !== target; n++) s = next(s); assert.equal(s.stage, target); return s; }
function cmd(s: LiarState, kind: LiarClientCommand["kind"], payload: unknown) { return parse(LiarClientCommandSchema, { protocolVersion: 1, requestId: `req-${++seq}`, kind, gameId: s.gameId, phaseId: s.transitionId, payload }); }
function act(s: LiarState, index: number, kind: Exclude<LiarClientCommand["kind"], "liar:configure">, payload: unknown, now = s.nextTransitionAt! - 1) { const c = cmd(s, kind, payload); assert.notEqual(c.kind, "liar:configure"); if (c.kind === "liar:configure") throw new Error(); return commandLiar(s, ids[index]!, c, now, `phase-${++seq}`); }
function vote(s: LiarState, targets: number[]) { for (let i = 0; i < targets.length; i++) { const n = act(s, i, "liar:vote", { playerId: ids[targets[i]!] }); assert.ok(n); s = n; } return s; }
function stored(s: LiarState) { return { gameId: s.gameId, gameRevision: s.revision, startedAt: s.startedAt, finishedAt: s.finishedAt, state: s }; }
test("LIAR setup has one secret, ordered clues and fixed server deadlines", () => {
  const s = create(); assert.equal(s.nextTransitionAt, 16000); assert.deepEqual(s.players.map(p => p.playerId), ids);
  assert.equal(advanceLiar(s, 15999, "early"), null); const n = next(s); assert.equal(n.stage, "CLUE"); assert.equal(n.nextTransitionAt, 46000);
  assert.equal(s.stage, "REVEAL"); assert.equal(s.revision, 0);
});
test("LIAR sequential hints reject wrong actor and deadlines without changing inputs; timeout records a pass", () => {
  const s = stage("CLUE"), baseline = structuredClone(s);
  assert.equal(act(s, 1, "liar:clue", { text: "설명" }), null);
  assert.equal(act(s, 0, "liar:clue", { text: "설명" }, s.nextTransitionAt!), null);
  assert.deepEqual(s, baseline);
  const n = act(s, 0, "liar:clue", { text: "바삭해요" }); assert.ok(n); assert.equal(n.clueIndex, 1); assert.equal(n.players[0]!.clue, "바삭해요");
  assert.equal(n.nextTransitionAt, s.nextTransitionAt! - 1 + 30000);
  const pass = next(n); assert.equal(pass.players[1]!.clue, null); assert.equal(pass.players[1]!.clueDone, true);
  const discussion = next(next(pass)); assert.equal(discussion.stage, "DISCUSSION"); assert.equal(discussion.nextTransitionAt, discussion.players.length * 30000 + 16000 + 89999);
});
test("LIAR hint validation never acts as an answer oracle, including liar's own turn", () => {
  let s = stage("CLUE"); for (let i = 0; i < 3; i++) s = next(s);
  assert.ok(act(s, 3, "liar:clue", { text: "돈가스" })); assert.ok(act(s, 3, "liar:clue", { text: "무관한 설명" }));
});
test("LIAR discussion is stage scoped, rate limited, bounded and never mutates rejected state", () => {
  const s = stage("DISCUSSION"), time = s.nextTransitionAt! - 90000;
  assert.equal(act(create(), 0, "liar:say", { text: "아직 밤" }), null);
  let n = act(s, 0, "liar:say", { text: "<script>hello</script>" }, time); assert.ok(n);
  assert.equal(act(n, 0, "liar:say", { text: "too fast" }, time + 999), null);
  assert.ok(act(n, 1, "liar:say", { text: "same time, different actor" }, time));
  for (let i = 1; i <= 100; i++) { const updated = act(n, i % 4, "liar:say", { text: `message-${i}` }, time + Math.floor(i / 4) * 1000 + 1000); assert.ok(updated); n = updated; }
  assert.equal(n.messages.length, 100); assert.equal(n.messages.at(-1)!.text, "message-100");
});
test("LIAR secret votes survive unrelated submissions; self/unknown/repeated votes fail", () => {
  const s = stage("VOTE"), n = act(s, 0, "liar:vote", { playerId: ids[3] }); assert.ok(n);
  assert.equal(act(s, 0, "liar:vote", { playerId: ids[0] }), null); assert.equal(act(s, 0, "liar:vote", { playerId: "missing" }), null);
  assert.equal(act(n, 0, "liar:vote", { playerId: ids[2] }), null); assert.equal(n.transitionId, s.transitionId);
  assert.equal(s.players[0]!.votedFor, null); assert.ok(act(n, 1, "liar:vote", { playerId: ids[3] }));
});
test("LIAR wrong accusation ends with liar victory; all abstain also wins for liar", () => {
  const n = vote(stage("VOTE"), [1, 0, 0, 0]); assert.equal(n.result!.reason, "MISIDENTIFIED"); assert.deepEqual(n.result!.winnerPlayerIds, [ids[3]]);
  const empty = next(stage("VOTE")); assert.equal(empty.result!.reason, "NO_VOTES"); assert.equal(empty.result!.voteRounds[0]!.filter(v => v.votedFor === null).length, 4);
});
test("LIAR catching liar enters guess before answer revelation; alias and normalized exact answers win", () => {
  const s = vote(stage("VOTE"), [3, 3, 3, 0]); assert.equal(s.stage, "GUESS"); assert.equal(s.result, null);
  assert.equal(act(s, 0, "liar:guess", { text: "돈가스" }), null);
  for (const answer of ["돈가스", " 돈 까 스 ", "돈가스".normalize("NFD")]) { const n = act(s, 3, "liar:guess", { text: answer }); assert.ok(n); assert.equal(n.result!.reason, "GUESS_CORRECT"); }
  assert.equal(normalizeLiarAnswer(" A b C "), "abc");
});
test("LIAR wrong/late guess rewards all citizens and a second guess never replaces the result", () => {
  const s = vote(stage("VOTE"), [3, 3, 3, 0]); const wrong = act(s, 3, "liar:guess", { text: "돈" }); assert.ok(wrong);
  assert.equal(wrong.result!.reason, "GUESS_WRONG"); assert.deepEqual(wrong.result!.winnerPlayerIds, ids.slice(0, 3));
  assert.equal(act(wrong, 3, "liar:guess", { text: "돈가스" }), null); assert.equal(act(s, 3, "liar:guess", { text: "돈가스" }, s.nextTransitionAt!), null);
  assert.equal(next(s).result!.reason, "GUESS_TIMEOUT");
});
test("LIAR tie resets own votes once and restricts runoff targets; tie/no-vote runoff ends", () => {
  const s = vote(stage("VOTE"), [1, 0, 1, 0]); assert.equal(s.stage, "REVOTE"); assert.deepEqual(s.voteCandidates, ids.slice(0, 2)); assert.ok(s.players.every(p => p.votedFor === null));
  assert.equal(act(s, 0, "liar:vote", { playerId: ids[2] }), null);
  const tied = vote(s, [1, 0, 1, 0]); assert.equal(tied.result!.reason, "TIE"); assert.equal(tied.voteRounds.length, 2);
  assert.equal(next(s).result!.reason, "NO_VOTES");
  const only = act(s, 0, "liar:vote", { playerId: ids[1] }); assert.ok(only); assert.equal(next(only).result!.reason, "MISIDENTIFIED");
});
test("LIAR runoff can catch liar and retains both private vote histories until result", () => {
  const s = vote(stage("VOTE"), [3, 3, 0, 0]); assert.equal(s.stage, "REVOTE");
  const caught = vote(s, [3, 3, 3, 0]); assert.equal(caught.stage, "GUESS"); assert.equal(caught.voteRounds.length, 2); assert.equal(next(caught).result!.voteRounds.length, 2);
});
test("LIAR public projection has no answer or votes for liar; citizens only receive their own card", () => {
  const s = stage("VOTE"), voted = act(s, 0, "liar:vote", { playerId: ids[3] }); assert.ok(voted);
  const liar = projectLiar(stored(voted), ids[3]!); assert.equal(liar.phase, "PLAYING");
  const wire = JSON.stringify(liar); for (const secret of ["돈가스", "돈까스", '"aliases"', '"voteRounds"', '"liarPlayerId"', '"lastSaidAt"']) assert.ok(!wire.includes(secret), secret);
  if (liar.phase !== "PLAYING" || liar.stage === "ROUND_RESULT") throw new Error(); assert.deepEqual(liar.privateView, { playerId: ids[3], votedFor: null, role: "LIAR" });
  const own = projectLiar(stored(voted), ids[0]!); assert.equal(own.phase, "PLAYING"); if (own.phase !== "PLAYING" || own.stage === "ROUND_RESULT") throw new Error(); assert.equal(own.privateView.votedFor, ids[3]);
  assert.throws(() => projectLiar(stored(voted), parse(PlayerIdSchema, "unknown")));
  const ended = projectLiar(stored(next(vote(s, [3, 3, 3, 0]))), ids[3]!); assert.equal(ended.phase, "PLAYING"); assert.ok("stage" in ended && ended.stage === "ROUND_RESULT"); assert.match(JSON.stringify(ended), /돈가스/);
});
test("LIAR cancellation never awards points and stored adapter rejects invalid metadata/state", () => {
  const s = stage("CLUE"), cancelled = cancelLiar(s, s.startedAt + 20000); assert.equal(cancelled.result!.reason, "CANCELLED"); assert.deepEqual(cancelled.result!.winnerPlayerIds, []);
  assert.deepEqual(cancelLiar(cancelled, 9999999), cancelled);
  const adapter = new LiarGameStateAdapter(), copy = adapter.cloneAndValidate(stored(s)); copy.state.players[0]!.clue = "mutation"; assert.equal(s.players[0]!.clue, null);
  assert.throws(() => adapter.cloneAndValidate({ ...stored(s), gameRevision: parse(GameRevisionSchema, 500) }));
  for (const damaged of [{ ...s, liarPlayerId: "missing" }, { ...s, stage: "GUESS" }, { ...s, players: [s.players[0], s.players[0], s.players[2], s.players[3]] }, { ...s, result: cancelled.result }, { ...s, extraSecret: "x" }]) assert.throws(() => parseLiarState(damaged));
});
test("LIAR curated prompt source covers six categories and never requires a network", () => {
  const source = new CuratedLiarPrompts();
  for (const category of ["FOOD", "ANIMAL", "PLACE", "OBJECT", "JOB", "HOBBY"] as const) {
    const count = 50;
    const found = new Set<string>();
    const answers = new Set<string>();
    for (let i = 0; i < count; i++) {
      const prompt = source.choose(category, { nextInt: (max) => { assert.equal(max, count); return i; } });
      assert.equal(prompt.category, category);
      assert.ok(prompt.word.trim().length > 0);
      found.add(normalizeLiarAnswer(prompt.word));
      for (const answer of [prompt.word, ...prompt.aliases]) {
        const normalized = normalizeLiarAnswer(answer);
        assert.ok(!answers.has(normalized), `Duplicate answer in ${category}: ${answer}`);
        answers.add(normalized);
      }
    }
    assert.equal(found.size, count);
  }
});

test("LIAR prompt cycles exhaust each category, avoid boundary repeats and exclude current match", () => {
  const source = new CuratedLiarPrompts(), random = { nextInt: () => 0 };
  for (const category of ["FOOD", "ANIMAL", "PLACE", "OBJECT", "JOB", "HOBBY"] as const) {
    let history: LiarPromptHistory = [];
    const count = 50, firstCycle = new Set<string>();
    for (let i = 0; i < count; i++) {
      const prompt = source.choose(category, random, history); firstCycle.add(prompt.word);
      history = rememberLiarPrompt(history, prompt);
    }
    assert.equal(firstCycle.size, count);
    const previous = history.at(-1)!.word;
    const next = source.choose(category, random, history, history.slice(0, 9));
    assert.notEqual(next.word, previous); assert.ok(!history.slice(0, 9).some(p => p.word === next.word));
    history = rememberLiarPrompt(history, next); assert.equal(history.length, 1);
    const baseline = structuredClone(history);
    source.choose("RANDOM", random, history); assert.deepEqual(history, baseline);
  }
});

test("LIAR ten rounds score once, reset private round data, and produce tied champions", () => {
  let s = create(); const source = new CuratedLiarPrompts(), random = { nextInt: () => 0 };
  for (let round = 1; round <= 10; round++) {
    while (s.result === null) s = next(s); // abstentions award this round's liar 3 points
    assert.equal(s.roundNumber, round); assert.equal(s.rounds.length, round);
    assert.equal(liarScores(s).reduce((sum, p) => sum + p.points, 0), round * 3);
    assert.equal(advanceLiar(s, 999999999, "stale"), null);
    assert.equal(new LiarGameStateAdapter().inspectLifecycle(stored(s)).lifecycle, round === 10 ? "FINISHED" : "RUNNING");
    if (round < 10) {
      const baseline = structuredClone(s), roster = { playerIds: ids, liarPlayerId: ids[(round - 1) % ids.length]! };
      const excluded = s.rounds.map(r => ({ category: r.category, word: r.result.word }));
      const fresh = nextLiarRound(s, roster, source.choose("FOOD", random, excluded, excluded), s.startedAt + round * 300000, `round-${round + 1}`);
      assert.ok(fresh); assert.deepEqual(s, baseline); s = fresh;
      assert.equal(s.stage, "REVEAL"); assert.equal(s.clueIndex, 0); assert.deepEqual(s.messages, []); assert.deepEqual(s.voteRounds, []);
      assert.ok(s.players.every(p => !p.clueDone && p.clue === null && p.votedFor === null && p.lastSaidAt === null));
      const liar = projectLiar(stored(s), s.liarPlayerId); assert.ok(!JSON.stringify(liar).includes(`"word":"${s.word}"`));
    }
  }
  assert.equal(s.phase, "FINISHED"); assert.equal(new Set(s.rounds.map(r => r.result.word)).size, 10);
  const counts = ids.map(id => s.rounds.filter(r => r.result.liarPlayerId === id).length);
  assert.equal(Math.max(...counts) - Math.min(...counts), 1);
  assert.equal(liarMatchWinners(s).length, 2); assert.ok(liarScores(s).filter(p => liarMatchWinners(s).includes(p.playerId)).every(p => p.points === 9));
  assert.equal(nextLiarRound(s, { playerIds: ids, liarPlayerId: ids[0]! }, { category: "FOOD", word: "새 단어", aliases: [] }, 99999999, "eleventh"), null);
});

test("LIAR citizen rewards, cancellation and corrupted round histories preserve scoring invariants", () => {
  const won = next(vote(stage("VOTE"), [3, 3, 3, 0]));
  assert.deepEqual(liarScores(won).map(p => p.points), [1, 1, 1, 0]);
  const cancelled = cancelLiar(won, 999999); assert.deepEqual(liarScores(cancelled), liarScores(won));
  assert.deepEqual(liarMatchWinners(cancelled), []); assert.equal(cancelled.rounds.length, 1);
  assert.deepEqual(liarScores(cancelLiar(create(), 2000)).map(p => p.points), [0, 0, 0, 0]);
  assert.throws(() => parseLiarState({ ...won, rounds: [] }));
  assert.throws(() => parseLiarState({ ...won, roundNumber: 10 }));
  assert.throws(() => parseLiarState({ ...won, rounds: [{ ...won.rounds[0], result: { ...won.result, winnerPlayerIds: [ids[3]] } }] }));
  assert.throws(() => nextLiarRound(won, { playerIds: ids, liarPlayerId: ids[0]! }, { category: "FOOD", word: won.word, aliases: [] }, 999999, "duplicate"));
});

test("LIAR role weighting favors fewer prior assignments while every player remains eligible", () => {
  const prior = next(stage("VOTE")); // d was the first liar
  const drawn = new Map<string, number>();
  for (let roll = 0; roll < 7; roll++) {
    let first = true;
    const roster = chooseLiarRoster(ids, prior.rounds, { nextInt(max) { if (first) { first = false; assert.equal(max, 7); return roll; } return 0; } });
    drawn.set(roster.liarPlayerId, (drawn.get(roster.liarPlayerId) ?? 0) + 1);
    assert.deepEqual([...roster.playerIds].sort(), [...ids].sort());
  }
  assert.deepEqual(ids.map(id => drawn.get(id)), [2, 2, 2, 1]);
});

test("LIAR all six complete category histories fit and a new cycle preserves other categories", () => {
  const source = new CuratedLiarPrompts(), random = { nextInt: () => 0 };
  let history: LiarPromptHistory = [];
  for (const category of ["FOOD", "ANIMAL", "PLACE", "OBJECT", "JOB", "HOBBY"] as const) {
    for (let i = 0; i < 50; i++) history = rememberLiarPrompt(history, source.choose(category, random, history));
  }
  assert.equal(history.length, 300);
  const others = history.filter(p => p.category !== "PLACE"), previous = history.filter(p => p.category === "PLACE").at(-1)!;
  const prompt = source.choose("PLACE", random, history);
  assert.notEqual(prompt.word, previous.word);
  const renewed = rememberLiarPrompt(history, prompt);
  assert.equal(renewed.length, 251);
  assert.deepEqual(renewed.filter(p => p.category !== "PLACE"), others);
  assert.equal(history.length, 300);
});
