import assert from "node:assert/strict";
import test from "node:test";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { parse } from "valibot";
import { createSpaceCrewDeck, dealSpaceCrewCards } from "./games/space-crew/domain/cards.js";
import { createSpaceCrewTrickState, legalSpaceCrewCardIds, playSpaceCrewCard, type SpaceCrewTrickState } from "./games/space-crew/domain/trick.js";
import {
  createSpaceCrewCommunications, communicateSpaceCrew, parseSpaceCrewCommunications,
  projectSpaceCrewCommunications, type SpaceCrewCommunicationInput,
  type SpaceCrewCommunicationMark, type SpaceCrewCommunications,
} from "./games/space-crew/domain/communication.js";

function setup(count = 4): SpaceCrewCommunicationInput {
  let sequence = 0;
  const ids = Array.from({ length: count }, (_, index) => parse(PlayerIdSchema, `crew-${index}`));
  const trick = createSpaceCrewTrickState(dealSpaceCrewCards(createSpaceCrewDeck(() => `opaque-${++sequence}`), ids));
  return { trick, communications: createSpaceCrewCommunications(ids), assignmentComplete: true, rule: { kind: "NORMAL" } };
}
function actor(input: SpaceCrewCommunicationInput, seat = 0): PlayerId {
  const player = input.trick.players[seat];
  assert.ok(player);
  return player.playerId;
}
function cardId(input: SpaceCrewCommunicationInput, suit: string, value: number): string {
  const card = input.trick.cards.find(item => item.suit === suit && item.value === value);
  assert.ok(card);
  return card.cardId;
}
function command(input: SpaceCrewCommunicationInput, value = 9, mark: SpaceCrewCommunicationMark | null = "HIGHEST") {
  return { cardId: cardId(input, "PINK", value), mark, expectedRevision: input.trick.revision };
}
function declare(input: SpaceCrewCommunicationInput, seat = 0, value = 9, mark: SpaceCrewCommunicationMark | null = "HIGHEST"): SpaceCrewCommunicationInput {
  const result = communicateSpaceCrew(input, actor(input, seat), command(input, value, mark));
  assert.ok(result.ok);
  return { ...input, trick: result.trick, communications: result.communications };
}
function completeTrick(trick: SpaceCrewTrickState, preferredCardId?: string): SpaceCrewTrickState {
  const target = trick.completedTricks.length + 1;
  let state = trick;
  while (state.completedTricks.length < target) {
    assert.ok(state.activePlayerId);
    const legal = legalSpaceCrewCardIds(state, state.activePlayerId);
    const selected = preferredCardId && legal.includes(preferredCardId) ? preferredCardId : legal[0];
    assert.ok(selected);
    const result = playSpaceCrewCard(state, state.activePlayerId, { cardId: selected, expectedRevision: state.revision });
    assert.ok(result.ok);
    state = result.state;
  }
  return state;
}

test("SPACE_CREW communication initializes every seat unused and rejects duplicate rosters", () => {
  for (const count of [3, 4, 5]) {
    const input = setup(count);
    assert.equal(input.communications.length, count);
    assert.ok(input.communications.every(item => !item.used && item.cardId === null && item.mark === null));
  }
  const id = parse(PlayerIdSchema, "same");
  assert.throws(() => createSpaceCrewCommunications([id, id, id]));
  assert.throws(() => createSpaceCrewCommunications([id]));
});

test("SPACE_CREW communication allows non-active actors, highest and lowest once, without removing cards", () => {
  for (const [value, mark] of [[9, "HIGHEST"], [1, "LOWEST"]] as const) {
    const input = setup(), before = structuredClone(input);
    assert.notEqual(actor(input), input.trick.activePlayerId);
    const next = declare(input, 0, value, mark);
    assert.deepEqual(input, before);
    assert.deepEqual(next.trick.players, input.trick.players);
    assert.equal(next.trick.revision, input.trick.revision + 1);
    assert.equal(next.trick.activePlayerId, input.trick.activePlayerId);
    assert.deepEqual(communicateSpaceCrew(next, actor(next), command(next, value, mark)), { ok: false, reason: "ALREADY_COMMUNICATED" });
    assert.equal(next.communications.find(item => item.playerId === actor(input))?.mark, mark);
  }
});

test("SPACE_CREW communication accepts singleton only with ONLY and rejects middle/wrong relationships", () => {
  const input = setup();
  for (const [value, mark] of [[5, "HIGHEST"], [5, "LOWEST"], [5, "ONLY"], [1, "HIGHEST"], [9, "LOWEST"], [9, "ONLY"]] as const) {
    assert.deepEqual(communicateSpaceCrew(input, actor(input), command(input, value, mark)), { ok: false, reason: "INVALID_MARK" });
  }
  const five = setup(5);
  assert.equal(declare(five, 4, 5, "ONLY").communications[4]?.mark, "ONLY");
  for (const mark of ["HIGHEST", "LOWEST"] as const) {
    assert.deepEqual(communicateSpaceCrew(five, actor(five, 4), command(five, 5, mark)), { ok: false, reason: "INVALID_MARK" });
  }
});

test("SPACE_CREW communication rejects rockets and uses identical errors for foreign and unknown cards", () => {
  const input = setup(), before = structuredClone(input);
  for (const id of ["unknown-card", cardId(input, "PINK", 2), cardId(input, "ROCKET", 1)]) {
    assert.deepEqual(communicateSpaceCrew(input, actor(input), { cardId: id, mark: "ONLY", expectedRevision: 0 }), { ok: false, reason: "INVALID_CARD" });
  }
  assert.deepEqual(input, before);
});

test("SPACE_CREW dead zone requires legal extrema but stores and projects no relationship", () => {
  const input: SpaceCrewCommunicationInput = { ...setup(), rule: { kind: "DEAD_ZONE" } };
  assert.deepEqual(communicateSpaceCrew(input, actor(input), command(input, 5, null)), { ok: false, reason: "INVALID_MARK" });
  assert.deepEqual(communicateSpaceCrew(input, actor(input), command(input)), { ok: false, reason: "INVALID_MARK" });
  const next = declare(input, 0, 9, null);
  assert.equal(next.communications[0]?.mark, null);
  const projected = projectSpaceCrewCommunications(next.trick, next.communications);
  assert.equal(projected[0]?.card?.cardId, cardId(input, "PINK", 9));
  assert.equal(projected[0]?.mark, null);
  assert.ok(projected.slice(1).every(item => item.card === null && item.mark === null));
  assert.deepEqual(Object.keys(projected[0] ?? {}).sort(), ["card", "mark", "playerId", "used"]);
});

test("SPACE_CREW communication requires completed assignment and a gap between tricks", () => {
  const input = setup();
  assert.deepEqual(communicateSpaceCrew({ ...input, assignmentComplete: false }, actor(input), command(input)), { ok: false, reason: "INVALID_PHASE" });
  assert.ok(input.trick.activePlayerId);
  const id = legalSpaceCrewCardIds(input.trick, input.trick.activePlayerId)[0];
  assert.ok(id);
  const played = playSpaceCrewCard(input.trick, input.trick.activePlayerId, { cardId: id, expectedRevision: 0 });
  assert.ok(played.ok);
  const mid = { ...input, trick: played.state };
  assert.deepEqual(communicateSpaceCrew(mid, actor(mid), command(mid)), { ok: false, reason: "INVALID_PHASE" });
  let exhausted = input.trick;
  while (exhausted.phase !== "EXHAUSTED") exhausted = completeTrick(exhausted);
  const done = { ...input, trick: exhausted };
  assert.deepEqual(communicateSpaceCrew(done, actor(done), command(done)), { ok: false, reason: "INVALID_PHASE" });
});

test("SPACE_CREW disruption unlocks immediately before the specified second or third trick", () => {
  for (const fromTrick of [2, 3] as const) {
    let input: SpaceCrewCommunicationInput = { ...setup(), rule: { kind: "DISRUPTION", fromTrick } };
    for (let completed = 0; completed < fromTrick - 1; completed++) {
      assert.deepEqual(communicateSpaceCrew(input, actor(input), command(input)), { ok: false, reason: "COMMUNICATION_FORBIDDEN" });
      input = { ...input, trick: completeTrick(input.trick) };
    }
    const mark = fromTrick === 3 ? "ONLY" : "HIGHEST";
    assert.ok(communicateSpaceCrew(input, actor(input), command(input, 9, mark)).ok);
  }
});

test("SPACE_CREW forbidden player rule blocks that actor only and validates designated membership", () => {
  const base = setup(), input: SpaceCrewCommunicationInput = { ...base, rule: { kind: "FORBIDDEN_PLAYER", playerId: actor(base) } };
  assert.deepEqual(communicateSpaceCrew(input, actor(input), command(input)), { ok: false, reason: "COMMUNICATION_FORBIDDEN" });
  assert.ok(communicateSpaceCrew(input, actor(input, 1), command(input, 6, "HIGHEST")).ok);
  const invalid: SpaceCrewCommunicationInput = { ...input, rule: { kind: "FORBIDDEN_PLAYER", playerId: parse(PlayerIdSchema, "outsider") } };
  assert.deepEqual(communicateSpaceCrew(invalid, actor(input), command(input)), { ok: false, reason: "INVALID_STATE" });
});

test("SPACE_CREW communication rejects stale, malformed, injected commands and exhausted revision atomically", () => {
  const input = setup(), before = structuredClone(input);
  for (const invalid of [null, {}, { ...command(input), injected: true }, { ...command(input), assignmentComplete: true }, { ...command(input), rule: { kind: "NORMAL" } }, { ...command(input), expectedRevision: 0.5 }]) {
    assert.deepEqual(communicateSpaceCrew(input, actor(input), invalid), { ok: false, reason: "INVALID_ACTION" });
  }
  assert.deepEqual(communicateSpaceCrew(input, actor(input), { ...command(input), expectedRevision: 1 }), { ok: false, reason: "STALE_REVISION" });
  assert.deepEqual(communicateSpaceCrew(input, parse(PlayerIdSchema, "outsider"), command(input)), { ok: false, reason: "INVALID_ACTOR" });
  const maximum = { ...input, trick: { ...input.trick, revision: Number.MAX_SAFE_INTEGER } };
  assert.deepEqual(communicateSpaceCrew(maximum, actor(maximum), command(maximum)), { ok: false, reason: "REVISION_EXHAUSTED" });
  assert.deepEqual(input, before);
});

test("SPACE_CREW communication parser rejects missing/duplicate/unknown members and inconsistent references", () => {
  const input = setup(), first = input.communications[0];
  assert.ok(first);
  const invalidLists: readonly unknown[] = [
    input.communications.slice(1),
    [first, first, ...input.communications.slice(2)],
    [{ ...first, playerId: "outsider" }, ...input.communications.slice(1)],
    [{ ...first, used: true }, ...input.communications.slice(1)],
    [{ ...first, mark: "ONLY" }, ...input.communications.slice(1)],
    [{ ...first, used: true, cardId: "unknown" }, ...input.communications.slice(1)],
    [{ ...first, used: true, cardId: cardId(input, "PINK", 2) }, ...input.communications.slice(1)],
    [{ ...first, used: true, cardId: cardId(input, "ROCKET", 1) }, ...input.communications.slice(1)],
    [{ ...first, extra: true }, ...input.communications.slice(1)],
  ];
  for (const invalid of invalidLists) assert.throws(() => parseSpaceCrewCommunications(invalid, input.trick));
  const duplicate: SpaceCrewCommunications = [first, first, ...input.communications.slice(2)];
  assert.deepEqual(communicateSpaceCrew({ ...input, communications: duplicate }, actor(input), command(input)), { ok: false, reason: "INVALID_STATE" });
});

test("SPACE_CREW historical declaration stays highest after it becomes the only card of its suit", () => {
  const input = declare(setup());
  const trick = completeTrick(completeTrick(input.trick));
  const result = projectSpaceCrewCommunications(trick, input.communications).find(item => item.playerId === actor(input));
  assert.equal(result?.mark, "HIGHEST");
  assert.equal(result?.card?.cardId, cardId(input, "PINK", 9));
  assert.ok(input.communications[0]?.used);
});

test("SPACE_CREW played declaration disappears from public projection but communication remains spent", () => {
  const input = declare(setup()), id = cardId(input, "PINK", 9);
  let trick = completeTrick(input.trick, id);
  const expected = { playerId: actor(input), used: true, card: null, mark: null };
  assert.deepEqual(projectSpaceCrewCommunications(trick, input.communications)[0], expected);
  trick = completeTrick(trick);
  assert.deepEqual(projectSpaceCrewCommunications(trick, input.communications)[0], expected);
  assert.equal(input.communications[0]?.cardId, id);
  const resumed = { ...input, trick };
  assert.deepEqual(communicateSpaceCrew(resumed, actor(input), command(resumed)), { ok: false, reason: "ALREADY_COMMUNICATED" });
});

test("SPACE_CREW communication success detaches mutable source state and projection exposes no aliases", () => {
  const input = setup(), before = structuredClone(input), next = declare(input);
  const projected = projectSpaceCrewCommunications(next.trick, next.communications);
  const firstCard = input.trick.cards[0];
  assert.ok(firstCard);
  firstCard.cardId = "mutated-source";
  assert.notEqual(next.trick.cards[0]?.cardId, "mutated-source");
  assert.ok(Object.isFrozen(next.communications));
  assert.ok(projected.every(item => Object.isFrozen(item) && (item.card === null || Object.isFrozen(item.card))));
  assert.deepEqual(next.trick.players, before.trick.players);
});
