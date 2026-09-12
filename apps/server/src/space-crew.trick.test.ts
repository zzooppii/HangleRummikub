import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { PlayerIdSchema, type PlayerId } from "@hangul-rummikub/shared";
import { createSpaceCrewDeck, dealSpaceCrewCards, type SpaceCrewCard, type SpaceCrewSuit } from "./games/space-crew/domain/cards.js";
import { createSpaceCrewTrickState, legalSpaceCrewCardIds, parseSpaceCrewTrickState, playSpaceCrewCard, type SpaceCrewTrickState } from "./games/space-crew/domain/trick.js";

type Face = readonly [SpaceCrewSuit, number];
const seats = ["crew-a", "crew-b", "crew-c", "crew-d", "crew-e"].map(id => v.parse(PlayerIdSchema, id));
const outsider = v.parse(PlayerIdSchema, "outsider");

function seat(index: number): PlayerId {
  const id = seats[index];
  assert.ok(id);
  return id;
}

function deck(): readonly SpaceCrewCard[] {
  let serial = 0;
  return createSpaceCrewDeck(() => `card-${++serial}`);
}

function initial(count = 4): SpaceCrewTrickState {
  return createSpaceCrewTrickState(dealSpaceCrewCards(deck(), seats.slice(0, count)));
}

function faceId(state: SpaceCrewTrickState, suit: SpaceCrewSuit, value: number): string {
  const card = state.cards.find(candidate => candidate.suit === suit && candidate.value === value);
  assert.ok(card);
  return card.cardId;
}

/** Fix selected hands, then fill every remaining slot from the real 40-card deck. */
function rig(required: readonly (readonly Face[])[]): SpaceCrewTrickState {
  const cards = deck();
  const used = new Set<string>();
  const players = required.map((faces, index) => ({
    playerId: seat(index),
    hand: faces.map(([suit, value]) => {
      const card = cards.find(candidate => candidate.suit === suit && candidate.value === value);
      assert.ok(card);
      assert.equal(used.has(card.cardId), false);
      used.add(card.cardId);
      return card.cardId;
    }),
  }));
  const available = cards.filter(card => !used.has(card.cardId));
  for (const [index, player] of players.entries()) {
    const capacity = Math.floor(40 / players.length) + Number(index < 40 % players.length);
    assert.ok(player.hand.length <= capacity);
    while (player.hand.length < capacity) {
      const card = available.shift();
      assert.ok(card);
      player.hand.push(card.cardId);
    }
  }
  assert.equal(available.length, 0);
  const rocketFour = cards.find(card => card.kind === "ROCKET" && card.value === 4);
  assert.ok(rocketFour);
  const commander = players.find(player => player.hand.includes(rocketFour.cardId));
  assert.ok(commander);
  return createSpaceCrewTrickState({ cards, players, commanderId: commander.playerId, totalTricks: Math.floor(40 / players.length) });
}

function actorOf(state: SpaceCrewTrickState): PlayerId {
  assert.notEqual(state.activePlayerId, null);
  if (state.activePlayerId === null) throw new Error("Expected an active actor.");
  return state.activePlayerId;
}

function submit(state: SpaceCrewTrickState, cardId: string): SpaceCrewTrickState {
  const before = structuredClone(state);
  const result = playSpaceCrewCard(state, actorOf(state), { cardId, expectedRevision: state.revision });
  assert.ok(result.ok, result.ok ? "" : result.reason);
  assert.deepEqual(state, before);
  assert.equal(result.state.revision, state.revision + 1);
  return result.state;
}

function submitFace(state: SpaceCrewTrickState, suit: SpaceCrewSuit, value: number): SpaceCrewTrickState {
  return submit(state, faceId(state, suit, value));
}

function nextLegal(state: SpaceCrewTrickState): string {
  const id = legalSpaceCrewCardIds(state, actorOf(state))[0];
  assert.ok(id);
  return id;
}

function assertConserved(state: SpaceCrewTrickState): void {
  const ids = [...state.players.flatMap(player => player.hand), ...state.currentTrick.map(play => play.cardId), ...state.completedTricks.flatMap(trick => trick.plays.map(play => play.cardId))];
  assert.equal(ids.length, 40);
  assert.equal(new Set(ids).size, 40);
  assert.deepEqual([...ids].sort(), state.cards.map(card => card.cardId).sort());
}

const blueHand: Face[] = Array.from({ length: 9 }, (_, index) => ["BLUE", index + 1]);

test("Space Crew trick: every commander seat starts and turns wrap clockwise", () => {
  for (const count of [3, 4, 5]) {
    for (let commanderSeat = 0; commanderSeat < count; commanderSeat += 1) {
      const cards = [...deck()];
      const rocketIndex = cards.findIndex(card => card.kind === "ROCKET" && card.value === 4);
      const displaced = cards[commanderSeat];
      const rocket = cards[rocketIndex];
      assert.ok(displaced && rocket);
      cards[commanderSeat] = rocket;
      cards[rocketIndex] = displaced;
      let state = createSpaceCrewTrickState(dealSpaceCrewCards(cards, seats.slice(0, count)));
      assert.equal(state.commanderId, seat(commanderSeat));
      assert.equal(state.leaderId, seat(commanderSeat));
      for (let offset = 0; offset < count; offset += 1) {
        assert.equal(state.activePlayerId, seat((commanderSeat + offset) % count));
        state = submit(state, nextLegal(state));
        assertConserved(state);
        if (offset < count - 1) {
          assert.equal(state.phase, "IN_TRICK");
          assert.equal(state.completedTricks.length, 0);
          assert.equal(state.currentTrick.length, offset + 1);
        }
      }
      const finished = state.completedTricks[0];
      assert.ok(finished);
      assert.equal(state.phase, "BETWEEN_TRICKS");
      assert.equal(state.currentTrick.length, 0);
      assert.equal(state.leaderId, finished.winnerId);
      assert.equal(state.activePlayerId, finished.winnerId);
    }
  }
});

test("Space Crew trick: follow color, reject trump while holding color, allow a lower card", () => {
  let state = rig([[['ROCKET', 4], ['PINK', 7]], [['PINK', 2], ['PINK', 9], ['ROCKET', 1], ['BLUE', 1]], [['PINK', 3]], [['PINK', 4]]]);
  state = submitFace(state, "PINK", 7);
  const before = structuredClone(state);
  for (const [suit, value] of [["ROCKET", 1], ["BLUE", 1]] satisfies Face[]) {
    assert.deepEqual(playSpaceCrewCard(state, seat(1), { cardId: faceId(state, suit, value), expectedRevision: state.revision }), { ok: false, reason: "MUST_FOLLOW_SUIT" });
    assert.deepEqual(state, before);
  }
  const legal = legalSpaceCrewCardIds(state, seat(1));
  assert.ok(legal.includes(faceId(state, "PINK", 2)));
  assert.ok(legal.includes(faceId(state, "PINK", 9)));
  assert.ok(legal.every(id => state.cards.find(card => card.cardId === id)?.suit === "PINK"));
  state = submitFace(state, "PINK", 2);
  state = submitFace(state, "PINK", 3);
  state = submitFace(state, "PINK", 4);
  assert.equal(state.completedTricks[0]?.winnerId, seat(0));
});

test("Space Crew trick: an off-suit nine cannot beat the led one", () => {
  let state = rig([[...blueHand, ['ROCKET', 4]], [['YELLOW', 9]], [['GREEN', 9]], [['PINK', 9]]]);
  for (const [suit, value] of [["BLUE", 1], ["YELLOW", 9], ["GREEN", 9], ["PINK", 9]] satisfies Face[]) state = submitFace(state, suit, value);
  assert.equal(state.completedTricks[0]?.winnerId, seat(0));
});

test("Space Crew trick: void in led color allows every card, rocket one beats color nine", () => {
  let state = rig([[...blueHand, ['ROCKET', 4]], [['ROCKET', 1]], [['PINK', 1]], [['PINK', 2]]]);
  state = submitFace(state, "BLUE", 9);
  assert.deepEqual(legalSpaceCrewCardIds(state, seat(1)), state.players[1]?.hand);
  for (const [suit, value] of [["ROCKET", 1], ["PINK", 1], ["PINK", 2]] satisfies Face[]) state = submitFace(state, suit, value);
  assert.equal(state.completedTricks[0]?.winnerId, seat(1));
});

test("Space Crew trick: highest of several rockets wins and leads next", () => {
  let state = rig([[...blueHand, ['ROCKET', 4]], [['ROCKET', 2]], [['ROCKET', 3]], [['ROCKET', 1]]]);
  for (const [suit, value] of [["BLUE", 9], ["ROCKET", 2], ["ROCKET", 3], ["ROCKET", 1]] satisfies Face[]) state = submitFace(state, suit, value);
  assert.equal(state.completedTricks[0]?.winnerId, seat(2));
  assert.equal(state.activePlayerId, seat(2));
});

test("Space Crew trick: rocket lead requires rockets but does not require winning", () => {
  let state = rig([[['ROCKET', 4]], [['ROCKET', 1], ['ROCKET', 3], ['PINK', 1]], [['ROCKET', 2]], []]);
  state = submitFace(state, "ROCKET", 4);
  assert.deepEqual(new Set(legalSpaceCrewCardIds(state, seat(1))), new Set([faceId(state, "ROCKET", 1), faceId(state, "ROCKET", 3)]));
  assert.deepEqual(playSpaceCrewCard(state, seat(1), { cardId: faceId(state, "PINK", 1), expectedRevision: state.revision }), { ok: false, reason: "MUST_FOLLOW_SUIT" });
  state = submitFace(state, "ROCKET", 1);
  state = submitFace(state, "ROCKET", 2);
  assert.deepEqual(legalSpaceCrewCardIds(state, seat(3)), state.players[3]?.hand);
  state = submit(state, nextLegal(state));
  assert.equal(state.completedTricks[0]?.winnerId, seat(0));
});

test("Space Crew trick: strict command, actor and revision failures are atomic", () => {
  const state = initial();
  const actor = actorOf(state);
  const id = nextLegal(state);
  const before = structuredClone(state);
  const malformed: unknown[] = [null, [], {}, { cardId: id }, { cardId: id, expectedRevision: -1 }, { cardId: id, expectedRevision: 0.5 }, { cardId: id, expectedRevision: Infinity }, { cardId: id, expectedRevision: Number.MAX_SAFE_INTEGER + 1 }, { cardId: id, expectedRevision: 0, extra: true }, { cardId: 3, expectedRevision: 0 }];
  for (const command of malformed) {
    assert.deepEqual(playSpaceCrewCard(state, actor, command), { ok: false, reason: "INVALID_ACTION" });
    assert.deepEqual(state, before);
  }
  assert.deepEqual(playSpaceCrewCard(state, outsider, { cardId: id, expectedRevision: 0 }), { ok: false, reason: "INVALID_ACTOR" });
  assert.deepEqual(playSpaceCrewCard(state, actor, { cardId: id, expectedRevision: 1 }), { ok: false, reason: "STALE_REVISION" });
  const other = state.players.find(player => player.playerId !== actor);
  assert.ok(other);
  assert.deepEqual(playSpaceCrewCard(state, other.playerId, { cardId: id, expectedRevision: 0 }), { ok: false, reason: "NOT_YOUR_TURN" });
  assert.deepEqual(legalSpaceCrewCardIds(state, other.playerId), []);
  assert.deepEqual(legalSpaceCrewCardIds(state, outsider), []);
  assert.deepEqual(state, before);
});

test("Space Crew trick: unknown, foreign and already played cards share one error", () => {
  let state = initial();
  const played = nextLegal(state);
  state = submit(state, played);
  const foreign = state.players.find(player => player.playerId !== state.activePlayerId)?.hand[0];
  assert.ok(foreign);
  const before = structuredClone(state);
  for (const cardId of ["absent-card", foreign, played]) {
    assert.deepEqual(playSpaceCrewCard(state, actorOf(state), { cardId, expectedRevision: state.revision }), { ok: false, reason: "INVALID_CARD" });
    assert.deepEqual(state, before);
  }
});

test("Space Crew trick: complete hands preserve 40 zones and stop at 13/10/8 tricks", () => {
  for (const [count, expectedTricks, leftover] of [[3, 13, 1], [4, 10, 0], [5, 8, 0]]) {
    assert.ok(count !== undefined && expectedTricks !== undefined && leftover !== undefined);
    let state = initial(count);
    while (state.phase !== "EXHAUSTED") {
      state = submit(state, nextLegal(state));
      assertConserved(state);
    }
    assert.equal(state.completedTricks.length, expectedTricks);
    assert.equal(state.players.flatMap(player => player.hand).length, leftover);
    assert.equal(state.revision, count * expectedTricks);
    assert.equal(state.activePlayerId, null);
    assert.equal(state.currentTrick.length, 0);
    const before = structuredClone(state);
    assert.deepEqual(playSpaceCrewCard(state, seat(0), { cardId: state.players[0]?.hand[0] ?? "absent", expectedRevision: state.revision }), { ok: false, reason: "INVALID_PHASE" });
    assert.deepEqual(state, before);
    assert.deepEqual(legalSpaceCrewCardIds(state, seat(0)), []);
  }
});

test("Space Crew trick: runtime parser rejects malformed zones, seats, inventory and phases", () => {
  const state = initial();
  const player = state.players[0];
  const other = state.players[1];
  const firstCard = state.cards[0];
  const secondCard = state.cards[1];
  assert.ok(player && other && firstCard && secondCard);
  const malformed: unknown[] = [
    { ...state, extra: true }, { ...state, revision: -1 }, { ...state, totalTricks: 11 },
    { ...state, commanderId: outsider }, { ...state, leaderId: outsider },
    { ...state, activePlayerId: outsider }, { ...state, phase: "EXHAUSTED", activePlayerId: null },
    { ...state, phase: "IN_TRICK" }, { ...state, activePlayerId: null },
    { ...state, cards: state.cards.slice(1) },
    { ...state, cards: [{ ...firstCard, suit: secondCard.suit, value: secondCard.value }, ...state.cards.slice(1)] },
    { ...state, players: [{ ...player, hand: [...player.hand, "absent"] }, ...state.players.slice(1)] },
    { ...state, players: [{ ...player, hand: player.hand.slice(1) }, ...state.players.slice(1)] },
    { ...state, players: [player, { ...other, playerId: player.playerId }, ...state.players.slice(2)] },
    { ...state, players: [{ ...player, hand: [...player.hand, ...other.hand.slice(0, 1)] }, { ...other, hand: other.hand.slice(1) }, ...state.players.slice(2)] },
  ];
  for (const input of malformed) assert.throws(() => parseSpaceCrewTrickState(input), /Invalid Space Crew trick state/);
  const corrupted = structuredClone(state);
  corrupted.activePlayerId = outsider;
  assert.deepEqual(playSpaceCrewCard(corrupted, actorOf(state), { cardId: nextLegal(state), expectedRevision: 0 }), { ok: false, reason: "INVALID_STATE" });
});

test("Space Crew trick: completed winner, numbering, seat order and next leader are validated", () => {
  let state = initial();
  while (state.completedTricks.length < 2) state = submit(state, nextLegal(state));
  const first = state.completedTricks[0];
  const second = state.completedTricks[1];
  assert.ok(first && second);
  const otherWinner = state.players.find(player => player.playerId !== first.winnerId)?.playerId;
  const otherLeader = state.players.find(player => player.playerId !== state.leaderId)?.playerId;
  assert.ok(otherWinner && otherLeader);
  for (const completedTricks of [
    [{ ...first, number: 2 }, second],
    [{ ...first, winnerId: otherWinner }, second],
    [{ ...first, plays: [...first.plays].reverse() }, second],
    [first, { ...second, leaderId: outsider }],
  ]) assert.throws(() => parseSpaceCrewTrickState({ ...state, completedTricks }));
  assert.throws(() => parseSpaceCrewTrickState({ ...state, leaderId: otherLeader, activePlayerId: otherLeader }));
  assert.throws(() => parseSpaceCrewTrickState({ ...state, revision: 1 }));
  const current = submit(state, nextLegal(state));
  const play = current.currentTrick[0];
  assert.ok(play);
  assert.throws(() => parseSpaceCrewTrickState({ ...current, currentTrick: [{ ...play, playerId: outsider }] }));
});

test("Space Crew trick: initial commander must hold rocket four; later exchanges need no hand replay", () => {
  const deal = dealSpaceCrewCards(deck(), seats.slice(0, 4));
  const other = deal.players.find(player => player.playerId !== deal.commanderId);
  assert.ok(other);
  assert.throws(() => createSpaceCrewTrickState({ ...deal, commanderId: other.playerId }));
  const initialState = createSpaceCrewTrickState(deal);
  const falseCommander = { ...initialState, commanderId: other.playerId, leaderId: other.playerId, activePlayerId: other.playerId };
  assert.throws(() => parseSpaceCrewTrickState(falseCommander));
  assert.deepEqual(playSpaceCrewCard(falseCommander, other.playerId, { cardId: other.hand[0], expectedRevision: 0 }), { ok: false, reason: "INVALID_STATE" });
  let state = rig([[...blueHand, ['ROCKET', 4]], [['YELLOW', 9]], [['GREEN', 9]], [['PINK', 9]]]);
  for (const [suit, value] of [["BLUE", 1], ["YELLOW", 9], ["GREEN", 9], ["PINK", 9]] satisfies Face[]) state = submitFace(state, suit, value);
  const commander = state.players[0];
  const recipient = state.players[1];
  const exchanged = recipient?.hand[0];
  const rocketFour = faceId(state, "ROCKET", 4);
  assert.ok(commander && recipient && exchanged);
  commander.hand = commander.hand.map(id => id === rocketFour ? exchanged : id);
  recipient.hand = recipient.hand.map(id => id === exchanged ? rocketFour : id);
  state.revision += 1;
  assert.equal(parseSpaceCrewTrickState(state).commanderId, seat(0));
});

test("Space Crew trick: parsed candidates are detached and revision overflow is rejected", () => {
  const state = initial();
  const original = structuredClone(state);
  const parsed = parseSpaceCrewTrickState(state);
  parsed.players[0]?.hand.pop();
  const parsedCard = parsed.cards[0];
  assert.ok(parsedCard);
  parsedCard.cardId = "changed-only-on-copy";
  assert.deepEqual(state, original);
  const successful = submit(state, nextLegal(state));
  const changedCard = successful.cards[0];
  const changedPlay = successful.currentTrick[0];
  assert.ok(changedCard && changedPlay);
  changedCard.cardId = "changed-only-on-candidate";
  changedPlay.cardId = "changed-play-only-on-candidate";
  assert.deepEqual(state, original);
  const fullRevision = { ...state, revision: Number.MAX_SAFE_INTEGER };
  const before = structuredClone(fullRevision);
  assert.deepEqual(playSpaceCrewCard(fullRevision, actorOf(state), { cardId: nextLegal(state), expectedRevision: Number.MAX_SAFE_INTEGER }), { ok: false, reason: "REVISION_EXHAUSTED" });
  assert.deepEqual(fullRevision, before);
});

test("Space Crew trick: parser rejects current off-suit plays with matching cards still held", () => {
  for (const leadSuit of ["PINK", "ROCKET"] satisfies SpaceCrewSuit[]) {
    let state = rig([[['ROCKET', 4], ['PINK', 7]], [['PINK', 2], ['ROCKET', 1], ['BLUE', 1]], [], []]);
    state = submitFace(state, leadSuit, leadSuit === "PINK" ? 7 : 4);
    const follower = state.players[1];
    assert.ok(follower);
    const illegal = faceId(state, "BLUE", 1);
    follower.hand = follower.hand.filter(id => id !== illegal);
    state.currentTrick.push({ playerId: follower.playerId, cardId: illegal });
    state.activePlayerId = seat(2);
    state.revision += 1;
    const before = structuredClone(state);
    assert.throws(() => parseSpaceCrewTrickState(state));
    assert.deepEqual(playSpaceCrewCard(state, seat(2), { cardId: "absent", expectedRevision: state.revision }), { ok: false, reason: "INVALID_STATE" });
    assert.deepEqual(state, before);
  }
});
