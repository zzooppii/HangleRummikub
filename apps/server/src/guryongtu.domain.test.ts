import assert from "node:assert/strict";
import test from "node:test";
import { parse, safeParse } from "valibot";
import { GameIdSchema, PlayerIdSchema, ServerTimeSchema, TurnIdSchema, TileIdSchema, GuryongtuPlayingProjectionSchema, guryongtuProjectionIsConsistent } from "@hangul-rummikub/shared";
import { createGuryongtuGame, applyGuryongtuAction, confirmGuryongtuRound, cancelGuryongtu, parseGuryongtuState, compareGuryongtu, type GuryongtuState } from "./games/guryongtu/domain/game.js";
import { projectGuryongtu } from "./games/guryongtu/compatibility/projector.js";
let sequence = 0;
const now = parse(ServerTimeSchema, 1000), next = () => parse(TurnIdSchema, `turn-${++sequence}`);
const ids = [parse(PlayerIdSchema, "a"), parse(PlayerIdSchema, "b")];
const setup = () => ({hands: ids.map(() => Array.from({length: 9}, (_, i) => ({tileId: parse(TileIdSchema, `opaque-${++sequence}`), rank: i + 1}))), starter: 0});
function initial() {return createGuryongtuGame({...setup(), gameId: parse(GameIdSchema, "game"), playerIds: ids, now, transitionId: next()});}
function play(s: GuryongtuState, rank: number) {
  assert.equal(s.phase, "PLAYING"); if (s.phase !== "PLAYING") throw new Error();
  const before = structuredClone(s), p = s.players.find(p => p.playerId === s.activePlayerId)!;
  const tile = p.hand.find(t => t.rank === rank); assert.ok(tile);
  const result = applyGuryongtuAction(s, p.playerId, {kind: "PLAY_TILE", tileId: tile.tileId}, now, next());
  assert.ok(result.ok); assert.deepEqual(s, before); return result.state;
}
function duel(s: GuryongtuState, a: number, b: number) {
  const ranks = [a, b];
  for (let i = 0; i < 2; i++) {if (s.phase !== "PLAYING") throw new Error(); s = play(s, ranks[ids.indexOf(s.activePlayerId)]!);}
  return s;
}
const project = (s: GuryongtuState, i = 0) => projectGuryongtu({gameId: s.gameId, gameRevision: s.revision, startedAt: s.startedAt, finishedAt: s.finishedAt, state: s}, ids[i]!);
test("GURYONGTU all 81 comparisons, initial inventory, immutable duel results and private projection", () => {
  for (let a = 1; a <= 9; a++) for (let b = 1; b <= 9; b++) {
    const expected = a === b ? 0 : a === 1 && b === 9 ? 1 : a === 9 && b === 1 ? -1 : Math.sign(a - b);
    assert.equal(compareGuryongtu(a, b), expected);
    const s = duel(initial(), a, b), winner = expected === 0 ? null : ids[expected > 0 ? 0 : 1];
    assert.equal(s.history[0]!.winnerPlayerId, winner);
    assert.equal(s.attackerId, winner ?? ids[0]);
    for (let i = 0; i < 2; i++) {
      const view = project(s, i); assert.ok(guryongtuProjectionIsConsistent(view));
      assert.equal(view.privateState.hand.length, 8); assert.equal(view.privateState.used.length, 1);
      const other = s.players[1 - i]!;
      for (const t of [...other.hand, ...other.used]) assert.equal(JSON.stringify(view).includes(JSON.stringify(t.tileId)), false);
      assert.ok(view.history[0]!.plays.every(p => Object.keys(p).sort().join() === "parity,playerId"));
    }
  }
});
test("GURYONGTU ownership, reused tiles, wrong actor and rejected moves are atomic", () => {
  const s = initial(), before = structuredClone(s), own = s.players[0]!.hand[0]!, other = s.players[1]!.hand[0]!;
  for (const tileId of [other.tileId, parse(TileIdSchema, "unknown")]) assert.deepEqual(applyGuryongtuAction(s, ids[0]!, {kind: "PLAY_TILE", tileId}, now, next()), {ok: false, reason: "INVALID_ACTION"});
  assert.deepEqual(applyGuryongtuAction(s, ids[1]!, {kind: "PLAY_TILE", tileId: other.tileId}, now, next()), {ok: false, reason: "NOT_YOUR_TURN"});
  assert.deepEqual(s, before);
  const after = duel(s, 1, 9);
  assert.deepEqual(applyGuryongtuAction(after, ids[0]!, {kind: "PLAY_TILE", tileId: own.tileId}, now, next()), {ok: false, reason: "INVALID_ACTION"});
});
test("GURYONGTU early clinch uses remaining duels, including draws", () => {
  let s = initial();
  for (const [a, b] of [[1, 1], [9, 9], [5, 2], [6, 3], [7, 4], [8, 5]]) s = duel(s, a!, b!);
  assert.equal(s.phase, "ROUND_RESULT"); assert.equal(s.history.length, 6); assert.equal(s.players[0]!.matchWins, 1); assert.equal(s.players[0]!.hand.length, 3);
  assert.ok(guryongtuProjectionIsConsistent(project(s)));
});
test("GURYONGTU tied set keeps match wins, both confirm, new tile IDs, then two wins finish", () => {
  let s = initial();
  for (let i = 1; i <= 9; i++) s = duel(s, i, i);
  assert.equal(s.phase, "ROUND_RESULT"); assert.equal(s.roundResults[0]!.winnerPlayerId, null);
  const previousIds = s.players.flatMap(p => p.used.map(t => t.tileId));
  let first = confirmGuryongtuRound(s, ids[0]!, null, next()); assert.ok(first.ok); s = first.state;
  assert.equal(confirmGuryongtuRound(s, ids[0]!, null, next()).ok, false);
  let second = confirmGuryongtuRound(s, ids[1]!, setup(), next()); assert.ok(second.ok); s = second.state;
  assert.equal(s.round, 2); assert.ok(s.players.every(p => p.matchWins === 0 && p.hand.every(t => !previousIds.includes(t.tileId))));
  for (let round = 0; round < 2; round++) {
    for (const [a, b] of [[5, 2], [6, 3], [7, 4], [8, 5], [9, 6]]) s = duel(s, a!, b!);
    if (round === 0) {first = confirmGuryongtuRound(s, ids[0]!, null, next()); assert.ok(first.ok); second = confirmGuryongtuRound(first.state, ids[1]!, setup(), next()); assert.ok(second.ok); s = second.state;}
  }
  assert.equal(s.phase, "FINISHED"); if (s.phase !== "FINISHED") throw new Error();
  assert.deepEqual(s.result, {reason: "TWO_WINS", winnerPlayerIds: [ids[0]]}); assert.equal(s.round, 3);
  assert.ok(guryongtuProjectionIsConsistent(project(s)));
});
test("GURYONGTU stored invariants and strict public schemas reject corruption and hidden fields", () => {
  const s = duel(initial(), 1, 9), bad = structuredClone(s); bad.players[0]!.hand[0] = bad.players[0]!.used[0]!;
  assert.throws(() => parseGuryongtuState(bad));
  const score = structuredClone(s); score.players[0]!.wins++; assert.throws(() => parseGuryongtuState(score));
  const view = project(s);
  assert.equal(safeParse(GuryongtuPlayingProjectionSchema, {...view, secret: s.players}).success, false);
  assert.equal(safeParse(GuryongtuPlayingProjectionSchema, {...view, submitted: {playerId: ids[0], parity: "ODD", rank: 1}}).success, false);
  assert.equal(guryongtuProjectionIsConsistent({...view, playerStates: view.playerStates.map(p => ({...p, oddCount: 9}))}), false);
});
test("GURYONGTU cancel preserves pending secret tile and never reveals opponent IDs", () => {
  const s = cancelGuryongtu(play(initial(), 7), now), p = project(s, 1);
  assert.equal(p.phase, "FINISHED"); assert.ok(guryongtuProjectionIsConsistent(p));
  assert.equal(p.submitted?.parity, "ODD"); assert.equal(p.privateState.submitted, null);
  assert.equal(JSON.stringify(p).includes(JSON.stringify(s.players[0]!.submitted!.tileId)), false);
});
