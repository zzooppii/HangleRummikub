import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "valibot";
import { PlayerIdSchema } from "@hangul-rummikub/shared";
import { makeHalliDeck, createHalliGame, flipHalli, ringHalli, timeoutHalli, cancelHalli, parseHalliState, hasFive, type HalliState } from "./games/halli-galli/domain/game.js";
const ids = Array.from({ length: 6 }, (_, i) => parse(PlayerIdSchema, `fruit-${i}`));
function game(n = 3) { return createHalliGame({ gameId: "game-fruit", playerIds: ids.slice(0, n), deck: makeHalliDeck(i => `private-${i}`), now: 1000, transitionId: "turn-fruit" }); }
function reveal(s: HalliState, fruit: string, count: number, seat: number) {
 for (const p of s.players) { const at = p.deck.findIndex(c => c.fruit === fruit && c.count === count); if (at >= 0) { s.players[seat]!.discard.push(...p.deck.splice(at, 1)); return; } }
 throw new Error("fixture card absent");
}
for (const n of [2, 3, 4, 5, 6]) test(`HALLI ${n}-player distribution preserves exact inventory and detached input`, () => {
 const s = game(n); assert.equal(s.players.flatMap(p => p.deck).length, 56); assert.ok(Math.max(...s.players.map(p => p.deck.length)) - Math.min(...s.players.map(p => p.deck.length)) <= 1);
 const copied = parseHalliState(s); copied.players[0]!.deck.pop(); assert.equal(s.players.flatMap(p => p.deck).length, 56); assert.throws(() => parseHalliState(copied));
});
test("HALLI counts only tops, exact five, including eliminated open pile", () => {
 const s = game(); reveal(s, "STRAWBERRY", 2, 0); reveal(s, "STRAWBERRY", 3, 1); assert.equal(hasFive(s), true);
 reveal(s, "STRAWBERRY", 4, 1); assert.equal(hasFive(s), false); reveal(s, "BANANA", 5, 2); assert.equal(hasFive(s), true);
 s.players[2]!.eliminated = true; assert.equal(hasFive(s), true);
});
test("HALLI successful bell collects every discard below existing deck, caller becomes next", () => {
 const s = game(); reveal(s, "LIME", 2, 0); reveal(s, "LIME", 3, 1); reveal(s, "PLUM", 1, 2); const before = structuredClone(s);
 const result = ringHalli(s, ids[2]!, 2500, "next"); assert.ok(result); assert.equal(result.feedback?.kind, "CORRECT"); assert.equal(result.feedback.cards, 3); assert.equal(result.activePlayerId, ids[2]);
 assert.deepEqual(result.players[2]!.deck.slice(0, before.players[2]!.deck.length), before.players[2]!.deck); assert.equal(result.players.flatMap(p => p.discard).length, 0); assert.deepEqual(s, before);
});
test("HALLI wrong bell pays each opponent, throttles spam without mutation", () => {
 const s = game(), sizes = s.players.map(p => p.deck.length), result = ringHalli(s, ids[0]!, 2500, "next"); assert.ok(result); assert.deepEqual(result.players.map(p => p.deck.length), [sizes[0]! - 2, sizes[1]! + 1, sizes[2]! + 1]);
 assert.equal(ringHalli(result, ids[0]!, 3199, "spam"), null); assert.ok(ringHalli(result, ids[0]!, 3200, "allowed"));
});
test("HALLI insufficient penalty pays clockwise and eliminates empty deck", () => {
 const s = game(4), p = s.players[0]!; s.players[3]!.deck.push(...p.deck.splice(1)); const sizes = s.players.map(p => p.deck.length);
 const result = ringHalli(s, ids[0]!, 2500, "next"); assert.ok(result); assert.equal(result.players[0]!.eliminated, true); assert.equal(result.players[1]!.deck.length, sizes[1]! + 1); assert.equal(result.players[2]!.deck.length, sizes[2]); assert.equal(result.activePlayerId, ids[1]);
 assert.equal(ringHalli(result, ids[0]!, 4000, "bad"), null);
});
test("HALLI rejects early/late/wrong actor flips and advances with fresh token", () => {
 const s = game(); assert.equal(flipHalli(s, ids[0]!, 999, "next"), null); assert.equal(flipHalli(s, ids[1]!, 2000, "next"), null); assert.equal(flipHalli(s, ids[0]!, 11000, "next"), null);
 const next = flipHalli(s, ids[0]!, 2000, "next"); assert.ok(next); assert.equal(next.activePlayerId, ids[1]); assert.equal(next.nextTransitionAt, 12000); assert.equal(next.transitionId, "next"); assert.equal(s.revision, 0);
});
test("HALLI final-card flip eliminates player but leaves top for counting", () => {
 const s = game(); s.players[2]!.deck.push(...s.players[0]!.deck.splice(1)); const next = flipHalli(s, ids[0]!, 2000, "next"); assert.ok(next); assert.equal(next.players[0]!.eliminated, true); assert.equal(next.players[0]!.discard.length, 1); assert.equal(next.phase, "PLAYING");
});
for (const action of ["FLIP", "WRONG_BELL"] as const) test(`HALLI last opponent exhausts by ${action}: survivor receives all 56 cards`, () => {
 const s = game(2); s.players[0]!.discard.push(...s.players[0]!.deck.splice(1), ...s.players[1]!.deck.splice(1));
 const visibleIndex = s.players[0]!.discard.findIndex(c => c.count === 1);
 s.players[0]!.discard.push(...s.players[0]!.discard.splice(visibleIndex, 1)); assert.equal(hasFive(s), false);
 const before = structuredClone(s);
 const r = action === "FLIP" ? flipHalli(s, ids[0]!, 2500, "end") : ringHalli(s, ids[0]!, 2500, "end");
 assert.ok(r); assert.equal(r.phase, "FINISHED"); assert.equal(r.result?.reason, "LAST_PLAYER"); assert.deepEqual(r.result?.winnerPlayerIds, [ids[1]!]);
 assert.deepEqual(r.players.map(p => p.deck.length), [0, 56]); assert.equal(r.players.flatMap(p => p.discard).length, 0);
 assert.equal(new Set(r.players[1]!.deck.map(c => c.id)).size, 56); assert.deepEqual(s, before);
 assert.equal(ringHalli(r, ids[1]!, 2600, "late"), null);
});
test("HALLI timeout uses server turn deadline; cancellation has no winner", () => {
 const s = game(); assert.equal(timeoutHalli(s, 10999, "next"), null); const r = timeoutHalli(s, 11000, "next"); assert.ok(r); assert.equal(r.feedback?.kind, "AUTO");
 assert.equal(r.phase, "PLAYING"); assert.equal(r.nextTransitionAt, 21000);
 assert.deepEqual(cancelHalli(s, 2000).result?.winnerPlayerIds, []);
});
test("HALLI validator rejects duplicate IDs, altered fruit quantities and forged result", () => {
 const s = game(); s.players[0]!.deck[0]!.id = s.players[1]!.deck[0]!.id; assert.throws(() => parseHalliState(s));
 const changed = game(); changed.players[0]!.deck[0]!.count = 5; assert.throws(() => parseHalliState(changed));
 const end = cancelHalli(game(), 2000); end.result!.winnerPlayerIds = [ids[0]!]; assert.throws(() => parseHalliState(end));
});
test("HALLI regression: two players continue after winning a pile", () => {
 const s = game(2); reveal(s, "BANANA", 5, 0); const before = structuredClone(s);
 const r = ringHalli(s, ids[0]!, 2500, "after-bell"); assert.ok(r);
 assert.equal(r.phase, "PLAYING"); assert.equal(r.result, null);
 assert.deepEqual(r.players[0]!.deck, [...before.players[0]!.deck, ...before.players.flatMap(p => p.discard)]);
 const next = flipHalli(r, ids[0]!, 3500, "after-flip"); assert.ok(next); assert.equal(next.phase, "PLAYING");
});
test("HALLI regression: two-player wrong bell pays one card and continues", () => {
 const s = game(2); reveal(s, "BANANA", 4, 0); const before = structuredClone(s);
 const r = ringHalli(s, ids[0]!, 2500, "after-wrong"); assert.ok(r); assert.equal(r.phase, "PLAYING");
 assert.deepEqual(r.players.map(p => p.discard), before.players.map(p => p.discard));
 assert.equal(r.players[0]!.deck.length, before.players[0]!.deck.length - 1); assert.equal(r.players[1]!.deck.length, before.players[1]!.deck.length + 1);
});
test("HALLI regression: fifteen minutes does not end a game with cards left", () => {
 const r = timeoutHalli(game(), 901000, "past-fifteen-minutes"); assert.ok(r); assert.equal(r.phase, "PLAYING"); assert.equal(r.result, null); assert.equal(r.nextTransitionAt, 911000);
});

test("HALLI dropping from three to two players does not make the next correct bell terminal", () => {
 const s = game(); reveal(s, "BANANA", 5, 0);
 s.players[2]!.discard.push(...s.players[2]!.deck.splice(0)); s.players[2]!.eliminated = true;
 assert.ok(hasFive(s)); const r = ringHalli(s, ids[0]!, 2500, "two-survive"); assert.ok(r); assert.equal(r.phase, "PLAYING"); assert.equal(r.players[2]!.eliminated, true);
 assert.equal(r.players[2]!.discard.length, 0); assert.ok(flipHalli(r, ids[0]!, 3500, "continue"));
});
test("HALLI cannot store an exhaustion result while opponents still have cards", () => {
 const s = cancelHalli(game(2), 3000); s.result!.reason = "LAST_PLAYER"; s.result!.winnerPlayerIds = [...ids.slice(0, 2)];
 assert.throws(() => parseHalliState(s));
});
test("HALLI two players can win successive piles without ending the game", () => {
 let s = game(2);
 for (const [i, fruit] of ["BANANA", "LIME", "PLUM"].entries()) {
  const actor = ids[i % 2]!; reveal(s, fruit, 5, i % 2); const oldDeck = [...s.players[i % 2]!.deck];
  const next = ringHalli(s, actor, 2500 + i * 2000, `round-${i}`); assert.ok(next); assert.equal(next.phase, "PLAYING"); assert.equal(next.result, null);
  assert.equal(next.activePlayerId, actor); assert.deepEqual(next.players[i % 2]!.deck.slice(0, oldDeck.length), oldDeck);
  const flipped = flipHalli(next, actor, 3500 + i * 2000, `flip-${i}`); assert.ok(flipped); assert.equal(flipped.phase, "PLAYING"); s = flipped;
 }
 assert.equal(new Set(s.players.flatMap(p => [...p.deck, ...p.discard]).map(c => c.id)).size, 56);
});


test("HALLI fast play: first flip and alternating turns need no artificial wait", () => {
 let s = game(2);
 for (let i = 0; i < 8; i++) {
  const at = 1000 + i * 20, actor = s.activePlayerId;
  const next = flipHalli(s, actor, at, `fast-${i}`);
  assert.ok(next, `turn ${i} must accept an immediate flip`);
  assert.equal(next.flipAvailableAt, at); assert.equal(next.nextTransitionAt, at + 10000);
  assert.equal(next.revision, i + 1); assert.notEqual(next.activePlayerId, actor); s = next;
 }
 assert.equal(s.players.flatMap(p => p.discard).length, 8);
});
for (const correct of [true, false]) test(`HALLI fast play: flip immediately after ${correct ? "correct" : "wrong"} bell`, () => {
 const s = game(2); reveal(s, "BANANA", correct ? 5 : 4, 0);
 const rung = ringHalli(s, ids[0]!, 2500, "bell"); assert.ok(rung);
 const flipped = flipHalli(rung, rung.activePlayerId, 2500, "immediate-flip");
 assert.ok(flipped); assert.equal(flipped.revision, rung.revision + 1); assert.equal(flipped.phase, "PLAYING");
});
