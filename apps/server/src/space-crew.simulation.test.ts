import assert from "node:assert/strict";
import test from "node:test";
import { PlayerIdSchema } from "@hangul-rummikub/shared";
import * as v from "valibot";
import {
  createSpaceCrewDeck, dealSpaceCrewCards, shuffleSpaceCrewCards,
} from "./games/space-crew/domain/cards.js";
import {
  createSpaceCrewTrickState, legalSpaceCrewCardIds, playSpaceCrewCard,
} from "./games/space-crew/domain/trick.js";
import type { RandomSource } from "./ports/system.js";

function random(initial: number): RandomSource {
  let seed = initial;
  return { nextInt(upper) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed % upper;
  } };
}

for (const count of [3, 4, 5]) {
  test(`SPACE_CREW simulation: ${count} players, twelve deterministic complete deals`, () => {
    for (let seed = 1; seed <= 12; seed++) {
      let id = 0;
      const rng = random(seed);
      const deck = shuffleSpaceCrewCards(createSpaceCrewDeck(() => `instance-${++id}`), rng);
      const seats = Array.from({ length: count }, (_, i) => v.parse(PlayerIdSchema, `crew-${i}`));
      let state = createSpaceCrewTrickState(dealSpaceCrewCards(deck, seats));
      const inventory = deck.map(card => card.cardId).sort();
      while (state.phase !== "EXHAUSTED") {
        const actor = state.activePlayerId;
        assert.ok(actor);
        const options = legalSpaceCrewCardIds(state, actor);
        const cardId = options[rng.nextInt(options.length)];
        assert.ok(cardId);
        const command = { cardId, expectedRevision: state.revision };
        const before = structuredClone(state);
        const result = playSpaceCrewCard(state, actor, command);
        assert.deepEqual(state, before, "accepted command must leave its input untouched");
        assert.ok(result.ok);
        state = result.state;
        assert.equal(state.revision, before.revision + 1);
        assert.deepEqual(playSpaceCrewCard(state, actor, command), { ok: false, reason: "STALE_REVISION" });

        const locations = [...state.players.flatMap(p => p.hand),
          ...state.currentTrick.map(p => p.cardId),
          ...state.completedTricks.flatMap(t => t.plays.map(p => p.cardId))];
        assert.deepEqual(locations.sort(), inventory, "every physical card exists in exactly one zone");

        if (state.completedTricks.length > before.completedTricks.length) {
          const trick = state.completedTricks.at(-1);
          assert.ok(trick);
          const played = trick.plays.map(play => {
            const card = deck.find(c => c.cardId === play.cardId);
            assert.ok(card);
            return { ...play, ...card };
          });
          const lead = played[0];
          assert.ok(lead);
          const winningSuit = played.some(card => card.suit === "ROCKET") ? "ROCKET" : lead.suit;
          const strongest = played.filter(card => card.suit === winningSuit)
            .sort((a, b) => b.value - a.value)[0];
          assert.ok(strongest);
          assert.equal(trick.winnerId, strongest.playerId);
          assert.equal(state.leaderId, strongest.playerId);
        }
      }
      assert.equal(state.completedTricks.length, count === 3 ? 13 : count === 4 ? 10 : 8);
      assert.equal(state.players.reduce((sum, p) => sum + p.hand.length, 0), count === 3 ? 1 : 0);
      assert.deepEqual(state.currentTrick, []);
      assert.equal(state.activePlayerId, null);
      assert.equal(state.revision, count === 3 ? 39 : 40);
    }
  });
}
