import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { createSpaceCrewDeck, type SpaceCrewSuit } from "./games/space-crew/domain/cards.js";
import {
  evaluateSpaceCrewPrimitive, parseSpaceCrewPrimitive,
  type SpaceCrewPrimitive, type SpaceCrewPrimitiveContext,
} from "./games/space-crew/domain/mission-primitives.js";

type Face = readonly [SpaceCrewSuit, number];
const seats = ["crew-a", "crew-b", "crew-c", "crew-d", "crew-e"].map(id => v.parse(PlayerIdSchema, id));
function player(index: number): PlayerId {
  const id = seats[index];
  assert.ok(id);
  return id;
}
function initial(count = 3): SpaceCrewPrimitiveContext {
  let serial = 0;
  return { cards: createSpaceCrewDeck(() => `primitive-card-${++serial}`), playerIds: seats.slice(0, count),
    commanderId: player(0), totalTricks: Math.floor(40 / count), exhausted: false, completedTricks: [] };
}
function cardId(context: SpaceCrewPrimitiveContext, face: Face): string {
  const card = context.cards.find(candidate => candidate.suit === face[0] && candidate.value === face[1]);
  assert.ok(card);
  return card.cardId;
}

/** Winning face and player are hand-specified; the production evaluator supplies no oracle. */
function append(context: SpaceCrewPrimitiveContext, faces: readonly Face[], winner: number, winningFace: Face): SpaceCrewPrimitiveContext {
  const last = context.completedTricks.at(-1);
  const leaderId = last?.winnerId ?? context.commanderId;
  const leaderSeat = context.playerIds.indexOf(leaderId);
  const winningId = cardId(context, winningFace);
  const remaining = faces.map(face => cardId(context, face)).filter(id => id !== winningId);
  assert.equal(faces.length, context.playerIds.length);
  assert.equal(remaining.length, faces.length - 1);
  const plays = context.playerIds.map((_, offset) => {
    const playerId = context.playerIds[(leaderSeat + offset) % context.playerIds.length];
    assert.ok(playerId);
    const id = playerId === player(winner) ? winningId : remaining.shift();
    assert.ok(id);
    return { playerId, cardId: id };
  });
  const completedTricks = [...context.completedTricks, { number: context.completedTricks.length + 1, leaderId, winnerId: player(winner), plays }];
  return { ...context, completedTricks, exhausted: completedTricks.length === context.totalTricks };
}
function sameSuit(context: SpaceCrewPrimitiveContext, suit: SpaceCrewSuit, values: readonly number[], winner = 0): SpaceCrewPrimitiveContext {
  const highest = values.at(-1);
  assert.ok(highest);
  return append(context, values.map(value => [suit, value]), winner, [suit, highest]);
}
function evaluate(config: SpaceCrewPrimitive, context: SpaceCrewPrimitiveContext) {
  const before = structuredClone(context);
  const configBefore = structuredClone(config);
  const result = evaluateSpaceCrewPrimitive(config, context);
  assert.deepEqual(context, before);
  assert.deepEqual(config, configBefore);
  assert.ok(result.ok, result.ok ? "" : result.reason);
  return result;
}
function fails(config: SpaceCrewPrimitive, context: SpaceCrewPrimitiveContext, reason: string, trickNumber?: number) {
  const result = evaluate(config, context);
  assert.equal(result.status, "FAILED");
  if (result.status !== "FAILED") throw new Error("Expected failure.");
  assert.equal(result.failure.reason, reason);
  assert.equal(result.failure.trickNumber, trickNumber);
  return result;
}

function fullThree(winners: readonly number[] = Array.from({ length: 13 }, () => 0), pinkLeftover = false): SpaceCrewPrimitiveContext {
  let context = initial();
  let index = 0;
  for (const suit of ["PINK", "BLUE", "GREEN", "YELLOW"] as const) {
    for (const start of [1, 4, 7]) {
      const winner = winners[index++];
      assert.notEqual(winner, undefined);
      if (winner === undefined) throw new Error("Missing winner.");
      context = pinkLeftover && suit === "PINK" && start === 7
        ? append(context, [["PINK", 7], ["PINK", 8], ["ROCKET", 4]], winner, ["ROCKET", 4])
        : sameSuit(context, suit, [start, start + 1, start + 2], winner);
    }
  }
  const lastWinner = winners[12];
  assert.notEqual(lastWinner, undefined);
  if (lastWinner === undefined) throw new Error("Missing last winner.");
  return sameSuit(context, "ROCKET", [1, 2, 3], lastWinner);
}

test("primitives parse only the audited strict config variants", () => {
  assert.deepEqual(parseSpaceCrewPrimitive({ type: "COLOR_VALUE_WINS", value: 1, count: 2 }), { type: "COLOR_VALUE_WINS", value: 1, count: 2 });
  for (const config of [
    { type: "COLOR_VALUE_WINS", value: 9, count: 2 }, { type: "COLOR_VALUE_WINS", value: 1, count: 3 },
    { type: "FORBID_WIN_VALUE", value: 8 }, { type: "BALANCED_WINS", maxDifference: 2 },
    { type: "CAPTURE_COLOR", playerId: player(0), color: "BLUE" },
    { type: "ROCKET_WINS", ascending: false, expression: "true" },
    { type: "PLAYER_TRICKS", playerId: player(0), requirement: { type: "COUNT", count: 4 } },
    { type: "REQUIRED_WINNERS", indices: [], allowedPlayerIds: [player(0)] },
    { type: "REQUIRED_WINNERS", indices: [1.5], allowedPlayerIds: [player(0)] },
  ]) {
    assert.throws(() => parseSpaceCrewPrimitive(config));
    assert.deepEqual(evaluateSpaceCrewPrimitive(config, initial()), { ok: false, reason: "INVALID_CONFIG" });
  }
});

test("color one objectives count winning faces, not cards merely captured", () => {
  const objective: SpaceCrewPrimitive = { type: "COLOR_VALUE_WINS", value: 1, count: 2 };
  let context = append(initial(), [["PINK", 1], ["BLUE", 9], ["GREEN", 9]], 0, ["PINK", 1]);
  assert.deepEqual(evaluate(objective, context), { ok: true, status: "PENDING", progress: { actual: 1, target: 2 } });
  assert.equal(evaluate({ ...objective, count: 1 }, context).status, "SATISFIED");
  context = append(context, [["BLUE", 1], ["PINK", 9], ["GREEN", 8]], 0, ["BLUE", 1]);
  assert.deepEqual(evaluate(objective, context), { ok: true, status: "SATISFIED", progress: { actual: 2, target: 2 } });
  const capturedOnly = sameSuit(initial(), "PINK", [1, 2, 3]);
  assert.deepEqual(evaluate(objective, capturedOnly).progress, { actual: 0, target: 2 });
  fails(objective, fullThree(), "OBJECTIVE_NOT_MET");
});

test("two color-one wins fail before exhaustion once three ones have lost", () => {
  const config: SpaceCrewPrimitive = { type: "COLOR_VALUE_WINS", value: 1, count: 2 };
  let context = sameSuit(initial(), "PINK", [1, 2, 3]);
  context = sameSuit(context, "BLUE", [1, 2, 3]);
  assert.equal(evaluate(config, context).status, "PENDING");
  context = sameSuit(context, "GREEN", [1, 2, 3]);
  assert.equal(context.exhausted, false);
  assert.deepEqual(fails(config, context, "OBJECTIVE_NOT_MET").progress, { actual: 0, target: 2 });
});

test("one color-one win remains possible until all four ones have lost", () => {
  const config: SpaceCrewPrimitive = { type: "COLOR_VALUE_WINS", value: 1, count: 1 };
  let context = sameSuit(initial(), "PINK", [1, 2, 3]);
  context = sameSuit(context, "BLUE", [1, 2, 3]);
  context = sameSuit(context, "GREEN", [1, 2, 3]);
  assert.equal(evaluate(config, context).status, "PENDING");
  context = sameSuit(context, "YELLOW", [1, 2, 3]);
  assert.equal(context.exhausted, false);
  assert.deepEqual(fails(config, context, "OBJECTIVE_NOT_MET").progress, { actual: 0, target: 1 });
});

test("all four rocket wins may be unordered, while ascending mode checks winning rocket order", () => {
  let context = initial();
  for (const [index, value] of [2, 1, 4, 3].entries()) {
    context = append(context, [["ROCKET", value], ["PINK", index + 1], ["BLUE", index + 1]], 0, ["ROCKET", value]);
  }
  assert.deepEqual(evaluate({ type: "ROCKET_WINS", ascending: false }, context), { ok: true, status: "SATISFIED", progress: { actual: 4, target: 4 } });
  fails({ type: "ROCKET_WINS", ascending: true }, context, "ROCKET_ORDER", 1);
  let ordered = initial();
  for (const value of [1, 2, 3, 4]) ordered = append(ordered, [["ROCKET", value], ["PINK", value], ["BLUE", value]], 0, ["ROCKET", value]);
  assert.equal(evaluate({ type: "ROCKET_WINS", ascending: true }, ordered).status, "SATISFIED");
});

test("a rocket captured under another rocket makes all-four rocket wins fail immediately", () => {
  const context = append(initial(), [["ROCKET", 1], ["ROCKET", 2], ["PINK", 3]], 0, ["ROCKET", 2]);
  fails({ type: "ROCKET_WINS", ascending: false }, context, "ROCKET_DID_NOT_WIN", 1);
});

test("forbidden nine checks the winner card and can hold before exhaustion", () => {
  const config: SpaceCrewPrimitive = { type: "FORBID_WIN_VALUE", value: 9 };
  assert.equal(evaluate(config, initial()).status, "SATISFIED");
  const safe = append(initial(), [["PINK", 1], ["BLUE", 9], ["GREEN", 9]], 0, ["PINK", 1]);
  assert.equal(evaluate(config, safe).status, "SATISFIED");
  fails(config, sameSuit(initial(), "PINK", [1, 2, 9], 1), "FORBIDDEN_WIN_VALUE", 1);
});

test("player count zero/one counts rocket wins normally; rocket prohibition is a separate condition", () => {
  const zero: SpaceCrewPrimitive = { type: "PLAYER_TRICKS", playerId: player(0), requirement: { type: "COUNT", count: 0 } };
  const one: SpaceCrewPrimitive = { ...zero, requirement: { type: "COUNT", count: 1 } };
  assert.equal(evaluate(zero, initial()).status, "SATISFIED");
  assert.equal(evaluate(one, initial()).status, "PENDING");
  const rocketWin = append(initial(), [["ROCKET", 1], ["PINK", 1], ["BLUE", 1]], 0, ["ROCKET", 1]);
  assert.deepEqual(evaluate(one, rocketWin).progress, { actual: 1, target: 1 });
  fails(zero, rocketWin, "TOO_MANY_PLAYER_TRICKS", 1);
  fails({ type: "FORBID_PLAYER_ROCKET_WIN", playerId: player(0) }, rocketWin, "FORBIDDEN_PLAYER_ROCKET_WIN", 1);
  assert.equal(evaluate({ type: "FORBID_PLAYER_ROCKET_WIN", playerId: player(1) }, rocketWin).status, "SATISFIED");
  const twice = sameSuit(rocketWin, "GREEN", [1, 2, 3]);
  fails(one, twice, "TOO_MANY_PLAYER_TRICKS", 2);
  fails({ ...one, playerId: player(1) }, fullThree(), "OBJECTIVE_NOT_MET");
});

test("exact player indices reject missed required tricks and extra wins immediately", () => {
  const config: SpaceCrewPrimitive = { type: "PLAYER_TRICKS", playerId: player(0), requirement: { type: "EXACT_INDICES", indices: [1, "LAST"] } };
  const first = sameSuit(initial(), "PINK", [1, 2, 3]);
  assert.equal(evaluate(config, first).status, "PENDING");
  fails(config, sameSuit(initial(), "PINK", [1, 2, 3], 1), "REQUIRED_WINNER_MISSED", 1);
  fails(config, sameSuit(first, "PINK", [4, 5, 6]), "UNEXPECTED_PLAYER_TRICK", 2);
  const winners = [0, ...Array.from({ length: 11 }, () => 1), 0];
  assert.equal(evaluate(config, fullThree(winners)).status, "SATISFIED");
});

test("required winners constrain only the specified indices, enabling mission 50 role composition", () => {
  const winners = [0, 0, 0, 0, ...Array.from({ length: 8 }, () => 2), 1];
  const context = fullThree(winners);
  const configs: SpaceCrewPrimitive[] = [
    { type: "PLAYER_TRICKS", playerId: player(0), requirement: { type: "EXACT_INDICES", indices: [1, 2, 3, 4] } },
    { type: "PLAYER_TRICKS", playerId: player(1), requirement: { type: "EXACT_INDICES", indices: ["LAST"] } },
    { type: "REQUIRED_WINNERS", indices: [5, 6, 7, 8, 9, 10, 11, 12], allowedPlayerIds: [player(2)] },
  ];
  for (const config of configs) assert.equal(evaluate(config, context).status, "SATISFIED");
  const firstLast: SpaceCrewPrimitive = { type: "REQUIRED_WINNERS", indices: [1, "LAST"], allowedPlayerIds: [player(0)] };
  fails(firstLast, context, "REQUIRED_WINNER_MISSED", 13);
  assert.equal(evaluate(firstLast, fullThree()).status, "SATISFIED");
});

test("balance checks each prefix, not just a balanced final count, and includes zero-win players", () => {
  const config: SpaceCrewPrimitive = { type: "BALANCED_WINS", maxDifference: 1 };
  let context = sameSuit(initial(), "PINK", [1, 2, 3]);
  assert.equal(evaluate(config, context).status, "SATISFIED");
  context = sameSuit(context, "PINK", [4, 5, 6]);
  context = sameSuit(context, "PINK", [7, 8, 9], 1);
  context = sameSuit(context, "BLUE", [1, 2, 3], 1);
  context = sameSuit(context, "BLUE", [4, 5, 6], 2);
  context = sameSuit(context, "BLUE", [7, 8, 9], 2);
  fails(config, context, "UNBALANCED_WINS", 2);
  assert.equal(evaluate(config, fullThree(Array.from({ length: 13 }, (_, index) => index % 3))).status, "SATISFIED");
});

test("capture pink counts all captured cards, fails on any wrong capturer, and handles three-player leftover", () => {
  const config: SpaceCrewPrimitive = { type: "CAPTURE_COLOR", playerId: player(0), color: "PINK" };
  let context = sameSuit(initial(), "PINK", [1, 2, 3]);
  assert.deepEqual(evaluate(config, context).progress, { actual: 3, target: 9 });
  context = sameSuit(context, "PINK", [4, 5, 6]);
  context = sameSuit(context, "PINK", [7, 8, 9]);
  assert.equal(context.exhausted, false);
  assert.equal(evaluate(config, context).status, "SATISFIED");
  fails(config, sameSuit(initial(), "PINK", [1, 2, 3], 1), "WRONG_COLOR_CAPTURER", 1);
  const result = fails(config, fullThree(undefined, true), "OBJECTIVE_NOT_MET");
  assert.deepEqual(result.progress, { actual: 8, target: 9 });
});

test("LAST resolves to 13, 10, and 8 for three, four, and five players", () => {
  const config: SpaceCrewPrimitive = { type: "REQUIRED_WINNERS", indices: ["LAST"], allowedPlayerIds: [player(1)] };
  const three = fullThree([...Array.from({ length: 12 }, () => 0), 1]);
  assert.equal(evaluate(config, three).status, "SATISFIED");
  let four = initial(4);
  for (const suit of ["PINK", "BLUE", "GREEN", "YELLOW"] as const) {
    four = sameSuit(four, suit, [1, 2, 3, 4]);
    four = sameSuit(four, suit, [5, 6, 7, 8]);
  }
  four = append(four, [["PINK", 9], ["BLUE", 9], ["GREEN", 9], ["YELLOW", 9]], 0, ["PINK", 9]);
  assert.equal(evaluate(config, four).status, "PENDING");
  four = sameSuit(four, "ROCKET", [1, 2, 3, 4], 1);
  assert.equal(evaluate(config, four).status, "SATISFIED");
  let five = sameSuit(initial(5), "PINK", [1, 2, 3, 4, 5]);
  five = append(five, [["PINK", 6], ["PINK", 7], ["PINK", 8], ["PINK", 9], ["BLUE", 1]], 0, ["PINK", 9]);
  five = sameSuit(five, "BLUE", [2, 3, 4, 5, 6]);
  five = append(five, [["BLUE", 7], ["BLUE", 8], ["BLUE", 9], ["GREEN", 1], ["GREEN", 2]], 0, ["BLUE", 9]);
  five = sameSuit(five, "GREEN", [3, 4, 5, 6, 7]);
  five = append(five, [["GREEN", 8], ["GREEN", 9], ["YELLOW", 1], ["YELLOW", 2], ["YELLOW", 3]], 0, ["GREEN", 9]);
  five = sameSuit(five, "YELLOW", [4, 5, 6, 7, 8]);
  assert.equal(evaluate(config, five).status, "PENDING");
  five = append(five, [["YELLOW", 9], ["ROCKET", 1], ["ROCKET", 2], ["ROCKET", 3], ["ROCKET", 4]], 1, ["ROCKET", 4]);
  assert.equal(evaluate(config, five).status, "SATISFIED");
});

test("context and config boundary rejects foreign actors, duplicate plays, incorrect winners and false exhaustion", () => {
  const config: SpaceCrewPrimitive = { type: "FORBID_WIN_VALUE", value: 9 };
  const valid = sameSuit(initial(), "PINK", [1, 2, 3]);
  const first = valid.completedTricks[0];
  assert.ok(first);
  for (const context of [
    { ...valid, exhausted: true }, { ...valid, totalTricks: 10 }, { ...valid, extra: "private" },
    { ...valid, commanderId: "outsider" }, { ...valid, playerIds: [player(0), player(0), player(1)] },
    { ...valid, completedTricks: [{ ...first, winnerId: player(1) }] },
    { ...valid, completedTricks: [{ ...first, number: 2 }] },
    { ...valid, completedTricks: [{ ...first, plays: first.plays.map(play => ({ ...play, cardId: "missing" })) }] },
    { ...valid, completedTricks: [first, { ...first, number: 2 }] },
    { ...valid, cards: [...valid.cards.slice(1), valid.cards[0], valid.cards[0]] },
  ]) assert.deepEqual(evaluateSpaceCrewPrimitive(config, context), { ok: false, reason: "INVALID_CONTEXT" });
  for (const invalid of [
    { type: "CAPTURE_COLOR", playerId: "outsider", color: "PINK" },
    { type: "REQUIRED_WINNERS", indices: [1], allowedPlayerIds: [player(0), player(0)] },
    { type: "REQUIRED_WINNERS", indices: [13, "LAST"], allowedPlayerIds: [player(0)] },
    { type: "PLAYER_TRICKS", playerId: player(0), requirement: { type: "EXACT_INDICES", indices: [1, 1] } },
  ]) assert.deepEqual(evaluateSpaceCrewPrimitive(invalid, valid), { ok: false, reason: "INVALID_CONFIG" });
  assert.deepEqual(evaluateSpaceCrewPrimitive({ type: "REQUIRED_WINNERS", indices: [13], allowedPlayerIds: [player(0)] }, initial(5)), { ok: false, reason: "INVALID_CONFIG" });
});

test("failure evidence carries only concise public facts, never card identifiers or history", () => {
  const config: SpaceCrewPrimitive = { type: "FORBID_WIN_VALUE", value: 9 };
  const result = fails(config, sameSuit(initial(), "PINK", [1, 2, 9], 1), "FORBIDDEN_WIN_VALUE", 1);
  assert.deepEqual(result.failure, { reason: "FORBIDDEN_WIN_VALUE", trickNumber: 1, playerId: player(1) });
  const serialized = JSON.stringify(result);
  for (const privateField of ["primitive-card", "cards", "hand", "completedTricks", "winningCard"]) assert.equal(serialized.includes(privateField), false);
});
