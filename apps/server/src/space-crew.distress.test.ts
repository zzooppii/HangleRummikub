import assert from "node:assert/strict";
import test from "node:test";
import { PlayerIdSchema } from "@hangul-rummikub/shared";
import * as v from "valibot";
import { createSpaceCrewDeck, dealSpaceCrewCards } from "./games/space-crew/domain/cards.js";
import { createSpaceCrewCommunications, communicateSpaceCrew } from "./games/space-crew/domain/communication.js";
import { createSpaceCrewTrickState, legalSpaceCrewCardIds, playSpaceCrewCard } from "./games/space-crew/domain/trick.js";
import {
  applySpaceCrewDistress, createSpaceCrewDistressState, parseSpaceCrewDistressState,
  projectSpaceCrewDistress, spaceCrewRecordedAttempts,
  type SpaceCrewDistressContext, type SpaceCrewDistressState,
} from "./games/space-crew/domain/distress.js";

function fixture(count = 3, attempt = 1, previous?: SpaceCrewDistressState): SpaceCrewDistressContext {
  let next = 0;
  const ids = Array.from({ length: count }, (_, i) => v.parse(PlayerIdSchema, `p-${i}`));
  return {
    trick: createSpaceCrewTrickState(dealSpaceCrewCards(createSpaceCrewDeck(() => `opaque-${++next}`), ids)),
    communications: createSpaceCrewCommunications(ids), assignmentComplete: true,
    distress: createSpaceCrewDistressState(attempt, previous),
  };
}
function actor(state: SpaceCrewDistressContext, seat: number) {
  const player = state.trick.players[seat];
  assert.ok(player);
  return player.playerId;
}
function submit(state: SpaceCrewDistressContext, seat: number, action: object): SpaceCrewDistressContext {
  const before = structuredClone(state);
  const result = applySpaceCrewDistress(state, actor(state, seat), { ...action, expectedRevision: state.trick.revision });
  assert.deepEqual(state, before);
  assert.ok(result.ok, JSON.stringify(result));
  assert.equal(result.trick.revision, state.trick.revision + 1);
  return { ...state, trick: result.trick, distress: result.distress };
}
function approve(state: SpaceCrewDistressContext, direction: "LEFT" | "RIGHT" = "LEFT") {
  let next = submit(state, 0, { kind: "PROPOSE", direction });
  for (let i = 1; i < state.trick.players.length; i++) next = submit(next, i, { kind: "VOTE", accept: true });
  return next;
}
function choices(state: SpaceCrewDistressContext) {
  return state.trick.players.map(player => {
    const cardId = player.hand.find(id => state.trick.cards.find(card => card.cardId === id)?.kind === "COLOR");
    assert.ok(cardId);
    return cardId;
  });
}
function exchange(state: SpaceCrewDistressContext) {
  let next = state;
  for (const [seat, cardId] of choices(state).entries()) next = submit(next, seat, { kind: "SELECT", cardId });
  return next;
}

test("SPACE_CREW distress: both directions exchange exactly one original card per player, for 3–5 seats", () => {
  for (const count of [3, 4, 5]) for (const direction of ["LEFT", "RIGHT"] as const) {
    const input = fixture(count);
    const selected = choices(input);
    const ready = approve(input, direction);
    const result = exchange(ready);
    assert.equal(result.distress.phase, "EXCHANGED");
    assert.equal(result.distress.active, true);
    for (let source = 0; source < count; source++) {
      const destination = (source + (direction === "LEFT" ? 1 : -1) + count) % count;
      const incoming = selected[source], outgoing = selected[destination];
      const receiver = result.trick.players[destination], old = input.trick.players[destination];
      assert.ok(incoming && outgoing && receiver && old);
      assert.deepEqual([...receiver.hand].sort(), [...old.hand.filter(id => id !== outgoing), incoming].sort());
    }
    assert.equal(new Set(result.trick.players.flatMap(p => p.hand)).size, 40);
    assert.equal(result.trick.commanderId, input.trick.commanderId);
    assert.deepEqual(result.distress.history.map(e => e.kind), ["ACTIVATED", "EXCHANGED"]);
    assert.deepEqual(result.distress.selections, []);
  }
});

test("SPACE_CREW distress: incomplete votes and selections never move cards; selected cards stay private", () => {
  const original = fixture();
  let state = submit(original, 0, { kind: "PROPOSE", direction: "LEFT" });
  assert.equal(state.distress.active, false);
  const pendingVote = applySpaceCrewDistress(state, actor(state, 0), { kind: "SELECT", cardId: choices(state)[0], expectedRevision: state.trick.revision });
  assert.deepEqual(pendingVote, { ok: false, reason: "INVALID_PHASE" });
  state = submit(state, 1, { kind: "VOTE", accept: true });
  state = submit(state, 2, { kind: "VOTE", accept: true });
  const cardId = choices(state)[0];
  assert.ok(cardId);
  state = submit(state, 0, { kind: "SELECT", cardId });
  assert.deepEqual(state.trick.players, original.trick.players);
  const projection = projectSpaceCrewDistress(state.distress);
  assert.deepEqual(projection.selectedPlayerIds, [actor(state, 0)]);
  assert.equal(JSON.stringify(projection).includes(cardId), false);
  assert.equal(JSON.stringify(state.distress.history).includes(cardId), false);
});

test("SPACE_CREW distress: veto skips without activating, can reconsider before any communication", () => {
  let state = submit(fixture(), 0, { kind: "PROPOSE", direction: "RIGHT" });
  state = submit(state, 1, { kind: "VOTE", accept: false });
  assert.equal(state.distress.phase, "SKIPPED");
  assert.equal(state.distress.active, false);
  state = exchange(approve(state));
  assert.equal(state.distress.active, true);
  assert.equal(state.distress.history.filter(e => e.kind === "ACTIVATED").length, 1);
});

test("SPACE_CREW distress: duplicate vote/selection, rocket, absent and foreign cards reject atomically", () => {
  const voting = submit(fixture(), 0, { kind: "PROPOSE", direction: "LEFT" });
  assert.deepEqual(applySpaceCrewDistress(voting, actor(voting, 0), { kind: "VOTE", accept: true, expectedRevision: voting.trick.revision }), { ok: false, reason: "ALREADY_RESPONDED" });
  const state = approve(fixture());
  const rocket = state.trick.cards.find(c => c.kind === "ROCKET" && c.value === 4);
  const foreign = state.trick.players[1]?.hand[0];
  assert.ok(rocket && foreign);
  const before = structuredClone(state);
  for (const cardId of [rocket.cardId, foreign, "missing"]) {
    assert.deepEqual(applySpaceCrewDistress(state, actor(state, 0), { kind: "SELECT", cardId, expectedRevision: state.trick.revision }), { ok: false, reason: "INVALID_CARD" });
    assert.deepEqual(state, before);
  }
  const selected = submit(state, 0, { kind: "SELECT", cardId: choices(state)[0] });
  assert.deepEqual(applySpaceCrewDistress(selected, actor(selected, 0), { kind: "SELECT", cardId: choices(state)[0], expectedRevision: selected.trick.revision }), { ok: false, reason: "ALREADY_RESPONDED" });
});

test("SPACE_CREW distress: context, command shape, actor, revision and phase barriers", () => {
  const state = fixture(), who = actor(state, 0);
  const command = { kind: "PROPOSE", direction: "LEFT", expectedRevision: 0 };
  for (const input of [null, {}, { ...command, extra: true }, { ...command, direction: "UP" }]) {
    assert.deepEqual(applySpaceCrewDistress(state, who, input), { ok: false, reason: "INVALID_ACTION" });
  }
  assert.deepEqual(applySpaceCrewDistress(state, v.parse(PlayerIdSchema, "outsider"), command), { ok: false, reason: "INVALID_ACTOR" });
  assert.deepEqual(applySpaceCrewDistress(state, who, { ...command, expectedRevision: 1 }), { ok: false, reason: "STALE_REVISION" });
  assert.deepEqual(applySpaceCrewDistress({ ...state, assignmentComplete: false }, who, command), { ok: false, reason: "INVALID_PHASE" });
  const max = { ...state, trick: { ...state.trick, revision: Number.MAX_SAFE_INTEGER } };
  assert.deepEqual(applySpaceCrewDistress(max, who, { ...command, expectedRevision: Number.MAX_SAFE_INTEGER }), { ok: false, reason: "REVISION_EXHAUSTED" });
  const finished = exchange(approve(state));
  assert.deepEqual(applySpaceCrewDistress(finished, who, { ...command, expectedRevision: finished.trick.revision }), { ok: false, reason: "INVALID_PHASE" });
});

test("SPACE_CREW distress: first communication or first card closes the distress window", () => {
  const state = fixture();
  const card = state.trick.cards.find(c => c.suit === "PINK" && c.value === 1);
  assert.ok(card);
  const communicated = communicateSpaceCrew({ ...state, rule: { kind: "NORMAL" } }, actor(state, 0), { cardId: card.cardId, mark: "LOWEST", expectedRevision: 0 });
  assert.ok(communicated.ok);
  assert.deepEqual(applySpaceCrewDistress({ ...state, trick: communicated.trick, communications: communicated.communications }, actor(state, 0), { kind: "PROPOSE", direction: "LEFT", expectedRevision: 1 }), { ok: false, reason: "INVALID_PHASE" });
  const leader = state.trick.activePlayerId;
  assert.ok(leader);
  const played = playSpaceCrewCard(state.trick, leader, { cardId: legalSpaceCrewCardIds(state.trick, leader)[0], expectedRevision: 0 });
  assert.ok(played.ok);
  assert.deepEqual(applySpaceCrewDistress({ ...state, trick: played.state }, actor(state, 0), { kind: "PROPOSE", direction: "LEFT", expectedRevision: 1 }), { ok: false, reason: "INVALID_PHASE" });
});

test("SPACE_CREW distress: retry retains help but resets votes, selections and exchange; score adds only once", () => {
  const first = exchange(approve(fixture()));
  let second = fixture(3, 2, first.distress);
  second = submit(second, 0, { kind: "SKIP" });
  assert.equal(second.distress.active, true);
  const third = exchange(approve(fixture(3, 3, second.distress), "RIGHT"));
  assert.equal(third.distress.history.filter(e => e.kind === "ACTIVATED").length, 1);
  assert.equal(third.distress.history.filter(e => e.kind === "EXCHANGED").length, 2);
  assert.equal(spaceCrewRecordedAttempts(3, third.distress.active), 4);
  assert.equal(spaceCrewRecordedAttempts(3, false), 3);
  assert.equal(fixture().distress.active, false, "new mission starts with no inherited help");
});

test("SPACE_CREW distress: malformed persisted history and pending selections are rejected", () => {
  const state = approve(fixture());
  assert.throws(() => parseSpaceCrewDistressState({ ...state.distress, active: false }, state.trick));
  assert.throws(() => parseSpaceCrewDistressState({ ...state.distress, votes: [] }, state.trick));
  assert.throws(() => parseSpaceCrewDistressState({ ...state.distress, selections: [{ playerId: actor(state, 0), cardId: "absent" }] }, state.trick));
  assert.throws(() => createSpaceCrewDistressState(1, state.distress));
  const finished = exchange(state);
  const impossible = { ...finished.distress, history: [...finished.distress.history,
    { attemptNumber: 1, kind: "SKIPPED", direction: null }] };
  assert.throws(() => parseSpaceCrewDistressState(impossible, finished.trick));
  assert.throws(() => createSpaceCrewDistressState(2, {
    active: true,
    history: [...finished.distress.history, { attemptNumber: 1, kind: "SKIPPED", direction: null }],
  }));
  assert.throws(() => parseSpaceCrewDistressState({ ...fixture().distress, phase: "SKIPPED" }, fixture().trick));
  assert.throws(() => spaceCrewRecordedAttempts(0, false));
  assert.throws(() => spaceCrewRecordedAttempts(Number.MAX_SAFE_INTEGER, true));
});
