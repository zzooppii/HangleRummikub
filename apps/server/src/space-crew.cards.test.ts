import assert from "node:assert/strict";
import test from "node:test";
import { PlayerIdSchema } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import {
  createSpaceCrewDeck,
  parseSpaceCrewDeck,
  dealSpaceCrewCards,
  shuffleSpaceCrewCards,
} from "./games/space-crew/domain/cards.js";
import type { RandomSource } from "./ports/system.js";

function deck() {
  let next = 0;
  return createSpaceCrewDeck(() => `opaque-${++next}`);
}

function players(count: number) {
  return Object.freeze(Array.from({ length: count }, (_, index) =>
    parse(PlayerIdSchema, `crew-${index}`)));
}

function seededRandom(initial: number): RandomSource {
  let seed = initial;
  return {
    nextInt(maxExclusive) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      return seed % maxExclusive;
    },
  };
}

test("SPACE_CREW cards: exact 36 color faces and four rockets with unique opaque IDs", () => {
  const cards = deck();
  assert.equal(cards.length, 40);
  assert.equal(new Set(cards.map(card => card.cardId)).size, 40);
  for (const suit of ["PINK", "BLUE", "GREEN", "YELLOW"]) {
    assert.deepEqual(cards.filter(card => card.suit === suit).map(card => card.value),
      [1, 2, 3, 4, 5, 6, 7, 8, 9]);
    assert.ok(cards.filter(card => card.suit === suit).every(card => card.kind === "COLOR"));
  }
  assert.deepEqual(cards.filter(card => card.kind === "ROCKET").map(card => [card.suit, card.value]),
    [["ROCKET", 1], ["ROCKET", 2], ["ROCKET", 3], ["ROCKET", 4]]);
  assert.deepEqual(cards.map(card => card.cardId), Array.from({ length: 40 }, (_, i) => `opaque-${i + 1}`));
});

test("SPACE_CREW cards: invalid generated IDs fail without substituting face-based IDs", () => {
  assert.throws(() => createSpaceCrewDeck(() => ""));
  assert.throws(() => createSpaceCrewDeck(() => "same-id"));
});

test("SPACE_CREW deck parser rejects malformed input, invalid faces, and extra fields", () => {
  const cards = deck();
  const badCards: readonly unknown[] = [
    null, "card", {},
    { cardId: "replacement", kind: "COLOR", suit: "PINK", value: 0 },
    { cardId: "replacement", kind: "COLOR", suit: "PINK", value: 10 },
    { cardId: "replacement", kind: "COLOR", suit: "PINK", value: 1.5 },
    { cardId: "replacement", kind: "COLOR", suit: "PINK", value: "1" },
    { cardId: "replacement", kind: "COLOR", suit: "PINK", value: Number.NaN },
    { cardId: "replacement", kind: "COLOR", suit: "ORANGE", value: 1 },
    { cardId: "replacement", kind: "COLOR", suit: "ROCKET", value: 1 },
    { cardId: "replacement", kind: "ROCKET", suit: "PINK", value: 1 },
    { cardId: "replacement", kind: "ROCKET", suit: "ROCKET", value: 5 },
    { cardId: "", kind: "COLOR", suit: "PINK", value: 1 },
    { cardId: 42, kind: "COLOR", suit: "PINK", value: 1 },
    { ...cards[0], injected: true },
  ];
  for (const bad of badCards) {
    assert.throws(() => parseSpaceCrewDeck([bad, ...cards.slice(1)]));
  }
  for (const bad of [null, {}, "deck", [], cards.slice(1), [...cards, cards[0]]]) {
    assert.throws(() => parseSpaceCrewDeck(bad));
  }
});

test("SPACE_CREW deck parser rejects duplicate IDs and duplicate faces independently", () => {
  const cards = deck();
  const first = cards[0], second = cards[1];
  assert.ok(first && second);
  assert.throws(() => parseSpaceCrewDeck([
    first, { ...second, cardId: first.cardId }, ...cards.slice(2),
  ]));
  assert.throws(() => parseSpaceCrewDeck([
    first, { ...first, cardId: second.cardId }, ...cards.slice(2),
  ]));
});

test("SPACE_CREW deck parsing detaches card objects from mutable caller input", () => {
  const input = deck().map(card => ({ ...card }));
  const before = structuredClone(input);
  const parsed = parseSpaceCrewDeck(input);
  const first = input[0];
  assert.ok(first);
  first.cardId = "changed-after-parse";
  input.pop();
  assert.deepEqual(parsed, before);
});

test("SPACE_CREW dealing allocates all 40 cards round robin for 3, 4, and 5 players", () => {
  const cards = deck();
  const before = structuredClone(cards);
  for (const count of [3, 4, 5]) {
    const roster = players(count);
    const dealt = dealSpaceCrewCards(cards, roster);
    assert.deepEqual(dealt.players.map(player => player.playerId), roster);
    assert.deepEqual(dealt.players.map(player => player.hand.length),
      count === 3 ? [14, 13, 13] : Array.from({ length: count }, () => 40 / count));
    assert.equal(dealt.totalTricks, count === 3 ? 13 : 40 / count);
    for (const [index, player] of dealt.players.entries()) {
      assert.deepEqual(player.hand, cards.filter((_, i) => i % count === index).map(card => card.cardId));
    }
    const allocated = dealt.players.flatMap(player => player.hand);
    assert.equal(allocated.length, 40);
    assert.equal(new Set(allocated).size, 40);
    assert.deepEqual([...allocated].sort(), cards.map(card => card.cardId).sort());
    assert.deepEqual(dealt.cards, cards);
  }
  assert.deepEqual(cards, before);
});

test("SPACE_CREW dealing derives commander from rocket four in every seat", () => {
  for (const count of [3, 4, 5]) {
    const roster = players(count);
    for (let seat = 0; seat < count; seat++) {
      const cards = [...deck()];
      const rocketIndex = cards.findIndex(card => card.kind === "ROCKET" && card.value === 4);
      const rocket = cards[rocketIndex], replacement = cards[seat];
      assert.ok(rocket && replacement);
      cards[seat] = rocket;
      cards[rocketIndex] = replacement;
      const dealt = dealSpaceCrewCards(Object.freeze(cards), roster);
      assert.equal(dealt.commanderId, roster[seat]);
      assert.ok(dealt.players.find(player => player.playerId === dealt.commanderId)?.hand.includes(rocket.cardId));
    }
  }
});

test("SPACE_CREW dealing rejects unsupported roster sizes and duplicate players without mutation", () => {
  const cards = deck(), before = structuredClone(cards);
  for (const count of [0, 1, 2, 6]) {
    assert.throws(() => dealSpaceCrewCards(cards, players(count)));
  }
  const roster = players(3), first = roster[0];
  assert.ok(first);
  assert.throws(() => dealSpaceCrewCards(cards, Object.freeze([first, first, first])));
  assert.deepEqual(cards, before);
});

test("SPACE_CREW deal result cannot alias mutable input cards or roster", () => {
  const cards = deck().map(card => ({ ...card })), roster = [...players(3)];
  const dealt = dealSpaceCrewCards(cards, roster), before = structuredClone(dealt);
  const first = cards[0];
  assert.ok(first);
  first.cardId = "changed-after-deal";
  cards.pop();
  roster.reverse();
  assert.deepEqual(dealt, before);
});

test("SPACE_CREW shuffle is deterministic, preserves inventory, and accepts frozen input", () => {
  const cards = deck(), before = structuredClone(cards);
  const shuffled = shuffleSpaceCrewCards(cards, seededRandom(17));
  assert.deepEqual(shuffled, shuffleSpaceCrewCards(cards, seededRandom(17)));
  assert.deepEqual(shuffled.map(card => card.cardId).sort(), cards.map(card => card.cardId).sort());
  assert.deepEqual(cards, before);
  assert.notStrictEqual(shuffled, cards);
  assert.ok(Object.isFrozen(shuffled));
  assert.deepEqual(shuffleSpaceCrewCards(cards, { nextInt: upper => upper - 1 }), cards);
});

test("SPACE_CREW shuffle rejects out-of-range random values without changing input", () => {
  const cards = deck(), before = structuredClone(cards);
  for (const value of [-1, 40, 0.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    assert.throws(() => shuffleSpaceCrewCards(cards, { nextInt: () => value }));
    assert.deepEqual(cards, before);
  }
});
