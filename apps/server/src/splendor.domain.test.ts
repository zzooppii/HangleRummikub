import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "valibot";
import {
  PlayerIdSchema,
  SplendorCardIdSchema,
  SPLENDOR_COLORS,
  type SplendorAction,
  type SplendorCard,
  type SplendorTokens,
} from "@hangul-rummikub/shared";
import {
  makeSplendorCards,
  SPLENDOR_NOBLES,
} from "./games/splendor/domain/catalog.js";
import {
  createSplendorGame,
  parseSplendorState,
  applySplendorAction,
  timeoutSplendor,
  cancelSplendor,
  emptyTokens,
  scoreFor,
  resultFor,
  bonusesFor,
  cardFor,
  affordable,
  hasSplendorAction,
  type SplendorState,
} from "./games/splendor/domain/game.js";
const ids = [0, 1, 2, 3].map((i) => parse(PlayerIdSchema, `sp-player-${i}`));
function fixture(n = 3) {
  let seq = 0;
  return createSplendorGame({
    gameId: "splendor-test",
    playerIds: ids.slice(0, n),
    cards: makeSplendorCards(() => `opaque-${++seq}`),
    nobles: SPLENDOR_NOBLES,
    now: 1000,
    transitionId: "turn-1",
  });
}
const resolution = () => ({ returns: emptyTokens(), nobleId: null });
function play(s: SplendorState, a: SplendorAction) {
  return applySplendorAction(
    s,
    s.activePlayerId,
    a,
    2000,
    `turn-${s.revision + 2}`,
  );
}
function give(s: SplendorState, t: Partial<SplendorTokens>, seat = 0) {
  for (const k of [...SPLENDOR_COLORS, "GOLD"] as const) {
    const n = t[k] ?? 0;
    s.bank[k] -= n;
    s.players[seat]!.tokens[k] += n;
  }
}
function acquire(s: SplendorState, c: SplendorCard, seat = 0) {
  for (const t of s.market) {
    const at = t.deck.indexOf(c.cardId);
    if (at >= 0) t.deck.splice(at, 1);
    const slot = t.slots.indexOf(c.cardId);
    if (slot >= 0) t.slots[slot] = t.deck.shift() ?? null;
  }
  s.players[seat]!.purchased.push(c.cardId);
}
function payment(s: SplendorState, c: SplendorCard) {
  const p = s.players.find((p) => p.playerId === s.activePlayerId)!,
    b = bonusesFor(s, p),
    pay = emptyTokens();
  for (const k of SPLENDOR_COLORS) {
    const need = Math.max(0, c.cost[k] - b[k]);
    pay[k] = Math.min(need, p.tokens[k]);
    pay.GOLD += need - pay[k];
  }
  return pay;
}
for (const n of [2, 3, 4])
  test(`SPLENDOR ${n}-player setup preserves 90 cards, nobles and bank`, () => {
    const s = fixture(n);
    assert.equal(s.nobles.length, n + 1);
    assert.deepEqual(
      s.market.map((t) => t.deck.length),
      [36, 26, 16],
    );
    assert.equal(s.bank.WHITE, n === 2 ? 4 : n === 3 ? 5 : 7);
    assert.equal(s.bank.GOLD, 5);
    assert.equal(s.nextTransitionAt, 91000);
    assert.equal(new Set(s.cards.map((c) => c.cardId)).size, 90);
    const copy = parseSplendorState(s);
    copy.players[0]!.tokens.WHITE++;
    assert.equal(s.players[0]!.tokens.WHITE, 0);
    assert.throws(() => parseSplendorState(copy));
  });
test("SPLENDOR full base dataset has 8/6/4 per color and ten distinct nobles", () => {
  const s = fixture();
  for (const color of SPLENDOR_COLORS)
    assert.deepEqual(
      [1, 2, 3].map(
        (t) => s.cards.filter((c) => c.tier === t && c.bonus === color).length,
      ),
      [8, 6, 4],
    );
  assert.equal(
    new Set(SPLENDOR_NOBLES.map((n) => JSON.stringify(n.cost))).size,
    10,
  );
});
test("SPLENDOR take different and same color, invalid patterns are atomic", () => {
  const s = fixture(),
    before = structuredClone(s);
  for (const tokens of [
    { ...emptyTokens(), WHITE: 1 },
    { ...emptyTokens(), WHITE: 1, BLUE: 1, GOLD: 1 },
    { ...emptyTokens(), WHITE: 2, BLUE: 1 },
  ])
    assert.equal(play(s, { kind: "TAKE", tokens, ...resolution() }).ok, false);
  const r = play(s, {
    kind: "TAKE",
    tokens: { ...emptyTokens(), WHITE: 1, BLUE: 1, RED: 1 },
    ...resolution(),
  });
  assert.ok(r.ok);
  assert.equal(r.state.bank.WHITE, 4);
  assert.equal(r.state.activePlayerId, ids[1]);
  assert.deepEqual(s, before);
  const d = play(s, {
    kind: "TAKE",
    tokens: { ...emptyTokens(), WHITE: 2 },
    ...resolution(),
  });
  assert.ok(d.ok);
  assert.equal(d.state.players[0]!.tokens.WHITE, 2);
});
test("SPLENDOR double requires four before transfer; scarcity only takes available colors", () => {
  const s = fixture(2);
  give(s, { WHITE: 1 }, 1);
  assert.equal(
    play(s, {
      kind: "TAKE",
      tokens: { ...emptyTokens(), WHITE: 2 },
      ...resolution(),
    }).ok,
    false,
  );
  const scarce = fixture(4);
  give(scarce, { WHITE: 7, BLUE: 3 }, 1);
  give(scarce, { BLUE: 4, GREEN: 6 }, 2);
  give(scarce, { GREEN: 1, RED: 7 }, 3);
  const r = play(scarce, {
    kind: "TAKE",
    tokens: { ...emptyTokens(), BLACK: 1 },
    ...resolution(),
  });
  assert.ok(r.ok);
});
test("SPLENDOR excess return is selected atomically, including freshly taken tokens", () => {
  const s = fixture(4);
  give(s, { WHITE: 3, BLUE: 3, GREEN: 3 });
  const a: SplendorAction = {
    kind: "TAKE",
    tokens: { ...emptyTokens(), RED: 1, BLACK: 1, WHITE: 1 },
    ...resolution(),
  };
  assert.equal(play(s, a).ok, false);
  const r = play(s, { ...a, returns: { ...emptyTokens(), RED: 1, WHITE: 1 } });
  assert.ok(r.ok);
  assert.equal(
    Object.values(r.state.players[0]!.tokens).reduce((x, n) => x + n, 0),
    10,
  );
  assert.equal(r.state.players[0]!.tokens.RED, 0);
  assert.equal(s.revision, 0);
  assert.equal(
    play(s, { ...a, returns: { ...emptyTokens(), GOLD: 2 } }).ok,
    false,
  );
});
test("SPLENDOR market reservation gives gold and refills; hidden deck reservation does not move public slots", () => {
  const s = fixture();
  const card = s.market[0]!.slots[0]!;
  const a = play(s, { kind: "RESERVE", cardId: card, ...resolution() });
  assert.ok(a.ok);
  assert.equal(a.state.players[0]!.tokens.GOLD, 1);
  assert.equal(a.state.market[0]!.deck.length, 35);
  assert.equal(a.state.players[0]!.reserved[0], card);
  const b = play(s, { kind: "RESERVE_DECK", tier: 2, ...resolution() });
  assert.ok(b.ok);
  assert.deepEqual(b.state.market[1]!.slots, s.market[1]!.slots);
  assert.equal(b.state.players[0]!.reserved[0], s.market[1]!.deck[0]);
});
test("SPLENDOR reserves without gold and rejects fourth reservation without mutation", () => {
  const s = fixture();
  give(s, { GOLD: 5 }, 1);
  for (let i = 0; i < 3; i++) {
    const id = s.market[0]!.deck.shift()!;
    s.players[0]!.reserved.push(id);
  }
  const before = structuredClone(s);
  assert.equal(
    play(s, { kind: "RESERVE_DECK", tier: 1, ...resolution() }).ok,
    false,
  );
  assert.deepEqual(s, before);
  s.market[0]!.deck.push(s.players[0]!.reserved.pop()!);
  const r = play(s, { kind: "RESERVE_DECK", tier: 1, ...resolution() });
  assert.ok(r.ok);
  assert.equal(r.state.players[0]!.tokens.GOLD, 0);
});
test("SPLENDOR payment permits gold even with matching gems, rejects overpay, buys own reserve", () => {
  const s = fixture(4);
  const c = cardFor(s, s.market[0]!.slots[0]!);
  give(s, { WHITE: 1, BLUE: 1, GREEN: 1, RED: 1, GOLD: 1 });
  const pay = payment(s, c);
  pay.WHITE--;
  pay.GOLD++;
  const r = play(s, {
    kind: "BUY",
    cardId: c.cardId,
    payment: pay,
    ...resolution(),
  });
  assert.ok(r.ok);
  assert.equal(r.state.players[0]!.tokens.WHITE, 1);
  assert.equal(r.state.players[0]!.tokens.GOLD, 0);
  assert.equal(bonusesFor(r.state, r.state.players[0]!).BLACK, 1);
  assert.equal(
    play(s, {
      kind: "BUY",
      cardId: c.cardId,
      payment: { ...pay, GOLD: 2 },
      ...resolution(),
    }).ok,
    false,
  );
  const reserve = fixture(4);
  const id = reserve.market[0]!.slots[0]!;
  reserve.market[0]!.slots[0] = reserve.market[0]!.deck.shift()!;
  reserve.players[0]!.reserved.push(id);
  give(reserve, { WHITE: 1, BLUE: 1, GREEN: 1, RED: 1 });
  const bought = play(reserve, {
    kind: "BUY",
    cardId: id,
    payment: payment(reserve, cardFor(reserve, id)),
    ...resolution(),
  });
  assert.ok(bought.ok);
  assert.equal(bought.state.players[0]!.reserved.length, 0);
  assert.deepEqual(bought.state.market, reserve.market);
});
test("SPLENDOR unknown and other player private references return identical failures", () => {
  const s = fixture();
  const id = s.market[0]!.deck.shift()!;
  s.players[1]!.reserved.push(id);
  const a = play(s, {
    kind: "BUY",
    cardId: id,
    payment: emptyTokens(),
    ...resolution(),
  });
  const b = play(s, {
    kind: "BUY",
    cardId: parse(SplendorCardIdSchema, "not-found"),
    payment: emptyTokens(),
    ...resolution(),
  });
  assert.deepEqual(a, b);
});
test("SPLENDOR multiple eligible nobles require a choice, taking one only", () => {
  const s = fixture();
  for (const color of ["WHITE", "BLUE", "GREEN"] as const) {
    for (const c of s.cards.filter((c) => c.bonus === color).slice(0, 4))
      acquire(s, c);
  }
  const a: SplendorAction = {
    kind: "TAKE",
    tokens: { ...emptyTokens(), WHITE: 1, BLUE: 1, GREEN: 1 },
    ...resolution(),
  };
  const before = structuredClone(s);
  assert.deepEqual(play(s, a), { ok: false, reason: "CHOOSE_NOBLE" });
  assert.deepEqual(s, before);
  const r = play(s, { ...a, nobleId: "SPN-0" });
  assert.ok(r.ok);
  assert.equal(r.state.players[0]!.nobles.length, 1);
  assert.equal(r.state.nobles.length, s.nobles.length - 1);
  assert.equal(
    scoreFor(r.state, r.state.players[0]!),
    scoreFor(s, s.players[0]!) + 3,
  );
});
test("SPLENDOR score trigger completes original round", () => {
  let s = fixture(3);
  for (const c of s.cards.filter((c) => c.points === 5).slice(0, 3))
    acquire(s, c);
  let r = play(s, {
    kind: "TAKE",
    tokens: { ...emptyTokens(), WHITE: 1, BLUE: 1, GREEN: 1 },
    ...resolution(),
  });
  assert.ok(r.ok);
  s = r.state;
  assert.equal(s.phase, "PLAYING");
  assert.equal(s.finalRound, true);
  r = play(s, {
    kind: "TAKE",
    tokens: { ...emptyTokens(), WHITE: 1, BLUE: 1, GREEN: 1 },
    ...resolution(),
  });
  assert.ok(r.ok);
  assert.equal(r.state.phase, "PLAYING");
  r = play(r.state, {
    kind: "TAKE",
    tokens: { ...emptyTokens(), WHITE: 1, BLUE: 1, GREEN: 1 },
    ...resolution(),
  });
  assert.ok(r.ok);
  assert.equal(r.state.phase, "FINISHED");
  assert.deepEqual(r.state.result?.winnerPlayerIds, [ids[0]]);
});
test("SPLENDOR deadlines, stale timeout, cancellation, and inactive terminal state", () => {
  let s = fixture(2);
  assert.equal(
    applySplendorAction(
      s,
      ids[0]!,
      { kind: "TAKE", tokens: { ...emptyTokens(), WHITE: 2 }, ...resolution() },
      91000,
      "late",
    ).ok,
    false,
  );
  assert.equal(timeoutSplendor(s, 90999, "early"), null);
  for (let i = 0; i < 6; i++) {
    const r = timeoutSplendor(s, s.nextTransitionAt!, `timeout-${i}`);
    assert.ok(r);
    s = r;
  }
  assert.equal(s.result?.reason, "INACTIVE");
  assert.deepEqual(s.result.winnerPlayerIds, []);
  assert.equal(cancelSplendor(fixture(), 3000).result?.reason, "CANCELLED");
});
test("SPLENDOR corrupt cards, noble counts and results fail closed", () => {
  const s = fixture();
  s.cards[0]!.cost.RED++;
  assert.throws(() => parseSplendorState(s));
  const n = fixture();
  n.nobles.push(n.nobles[0]!);
  assert.throws(() => parseSplendorState(n));
  const end = cancelSplendor(fixture(), 3000);
  end.result!.winnerPlayerIds = [ids[0]!];
  assert.throws(() => parseSplendorState(end));
});
for (const n of [2, 3, 4])
  test(`SPLENDOR ${n}-player complete game through legal atomic actions`, () => {
    let s = fixture(n);
    for (let turn = 0; turn < 600 && s.phase === "PLAYING"; turn++) {
      const p = s.players.find((p) => p.playerId === s.activePlayerId)!,
        cards = [
          ...s.market.flatMap((t) =>
            t.slots.filter((id): id is NonNullable<typeof id> => id !== null),
          ),
          ...p.reserved,
        ].map((id) => cardFor(s, id));
      const buy = cards
        .filter((c) => affordable(s, p, c))
        .sort(
          (a, b) =>
            b.points - a.points ||
            Object.values(a.cost).reduce((x, v) => x + v, 0) -
              Object.values(b.cost).reduce((x, v) => x + v, 0),
        )[0];
      let a: SplendorAction;
      const after = { ...p.tokens },
        bonuses = bonusesFor(s, p);
      if (buy) {
        const pay = payment(s, buy);
        a = { kind: "BUY", cardId: buy.cardId, payment: pay, ...resolution() };
        bonuses[buy.bonus]++;
        for (const k of [...SPLENDOR_COLORS, "GOLD"] as const)
          after[k] -= pay[k];
      } else {
        const available = SPLENDOR_COLORS.filter((k) => s.bank[k] > 0)
          .sort((a, b) => p.tokens[a] - p.tokens[b])
          .slice(0, 3);
        if (available.length) {
          const tokens = emptyTokens();
          available.forEach((k) => {
            tokens[k] = 1;
            after[k]++;
          });
          a = { kind: "TAKE", tokens, ...resolution() };
        } else if (
          p.reserved.length < 3 &&
          s.market.some((t) => t.slots.some((c) => c !== null))
        ) {
          const id = s.market
            .flatMap((t) => t.slots)
            .find((id): id is NonNullable<typeof id> => id !== null)!;
          a = { kind: "RESERVE", cardId: id, ...resolution() };
          if (s.bank.GOLD > 0) after.GOLD++;
        } else {
          assert.equal(hasSplendorAction(s, p), false);
          a = { kind: "PASS", ...resolution() };
        }
      }
      let extra = Math.max(
        0,
        Object.values(after).reduce((x, v) => x + v, 0) - 10,
      );
      while (extra > 0) {
        const k = SPLENDOR_COLORS.filter((k) => after[k] > a.returns[k]).sort(
          (a, b) => after[b] - after[a],
        )[0];
        assert.ok(k);
        a.returns[k]++;
        extra--;
      }
      const nobles = s.nobles.filter((n) =>
        SPLENDOR_COLORS.every((k) => bonuses[k] >= n.cost[k]),
      );
      a.nobleId = nobles[0]?.nobleId ?? null;
      const r = applySplendorAction(
        s,
        s.activePlayerId,
        a,
        2000,
        `simulation-${turn}`,
      );
      assert.ok(r.ok, JSON.stringify(r));
      s = r.state;
    }
    assert.equal(s.phase, "FINISHED");
    assert.equal(s.result?.reason, "POINTS");
    assert.ok(s.result.winnerPlayerIds.length > 0);
  });

test("SPLENDOR tied scores use fewer bought cards, then shared winners", () => {
  const s = fixture(3);
  for (const seat of [0, 1])
    for (const points of [5, 4, 3, 3]) {
      const c = s.cards.find(
        (c) =>
          c.points === points &&
          !s.players.some((p) => p.purchased.includes(c.cardId)),
      )!;
      acquire(s, c, seat);
    }
  assert.deepEqual(resultFor(s, "POINTS").winnerPlayerIds, [ids[0], ids[1]]);
  const c = s.cards.find((c) => c.points === 0)!;
  acquire(s, c, 1);
  assert.deepEqual(resultFor(s, "POINTS").winnerPlayerIds, [ids[0]]);
});
