import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "valibot";
import {
  SPLENDOR_CITY_TILES,
  meetsSplendorCity,
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
for (const cities of [false, true]) for (const n of [2, 3, 4])
  test(`SPLENDOR ${cities ? "CITIES" : "BASE"} ${n}-player complete game through legal atomic actions`, () => {
    let s = cities ? cityFixture(n) : fixture(n);
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
      a.cityId = s.cities.find(c => meetsSplendorCity(c, scoreFor(s,p) + (buy?.points ?? 0), bonuses))?.cityId ?? null;
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
    assert.equal(s.result?.reason, cities ? "CITIES" : "POINTS");
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

function cityFixture(n = 3) {
  const s = fixture(n);
  s.rulesVersion = "splendor-cities-2017-v1";
  s.nobles = [];
  s.cities = [SPLENDOR_CITY_TILES[0]![0]!, SPLENDOR_CITY_TILES[1]![0]!, SPLENDOR_CITY_TILES[3]![0]!];
  return parseSplendorState(s);
}
function grantBonus(s: SplendorState, color: SplendorCard["bonus"], count: number, seat = 0) {
  const cards = s.cards.filter(c => c.bonus === color && c.points === 0 && !s.players.some(p => p.purchased.includes(c.cardId))).slice(0, count);
  assert.equal(cards.length, count);
  cards.forEach(c => acquire(s, c, seat));
}
function grantPoints(s: SplendorState, points: readonly number[], seat = 0) {
  for (const n of points) {
    const c = s.cards.find(c => c.points === n && !s.players.some(p => p.purchased.includes(c.cardId)));
    assert.ok(c); acquire(s, c, seat);
  }
}
const cityTake = (): SplendorAction => ({kind:"TAKE", tokens:{...emptyTokens(), WHITE:1, BLUE:1, GREEN:1}, ...resolution()});

test("SPLENDOR CITIES: seven paired tiles, three physical tiles, no nobles for every player count", () => {
  assert.equal(SPLENDOR_CITY_TILES.length, 7);
  assert.equal(new Set(SPLENDOR_CITY_TILES.flat().map(c => c.cityId)).size, 14);
  for (const n of [2,3,4]) {
    const s = cityFixture(n);
    assert.equal(s.cities.length, 3);
    assert.equal(s.nobles.length, 0);
    assert.equal(s.cards.length, 90);
    const duplicate = structuredClone(s); duplicate.cities[1] = SPLENDOR_CITY_TILES[0]![1]!;
    assert.throws(() => parseSplendorState(duplicate));
    const missing = structuredClone(s); missing.cities.pop();
    assert.throws(() => parseSplendorState(missing));
    const tampered = structuredClone(s); tampered.cities[0]!.points--;
    assert.throws(() => parseSplendorState(tampered));
    const nobles = structuredClone(s); nobles.nobles = [SPLENDOR_NOBLES[0]!];
    assert.throws(() => parseSplendorState(nobles));
  }
});
test("SPLENDOR CITIES: gray requirement needs another single color and sufficient prestige", () => {
  const c = SPLENDOR_CITY_TILES[5]![0]!;
  assert.equal(meetsSplendorCity(c, 14, {WHITE:0,BLUE:0,GREEN:8,RED:0,BLACK:0}), false);
  assert.equal(meetsSplendorCity(c, 14, {WHITE:2,BLUE:2,GREEN:4,RED:0,BLACK:0}), false);
  assert.equal(meetsSplendorCity(c, 13, {WHITE:4,BLUE:0,GREEN:4,RED:0,BLACK:0}), false);
  assert.equal(meetsSplendorCity(c, 14, {WHITE:4,BLUE:0,GREEN:4,RED:0,BLACK:0}), true);
  assert.equal(meetsSplendorCity(SPLENDOR_CITY_TILES[4]![0]!, 12, {WHITE:0,BLUE:0,GREEN:6,RED:0,BLACK:0}), true);
});
test("SPLENDOR CITIES: 15 points alone does not start the final round", () => {
  const s = cityFixture(); grantPoints(s, [5,5,5]);
  const r = play(s, cityTake()); assert.ok(r.ok);
  assert.equal(r.state.finalRound, false); assert.equal(r.state.phase, "PLAYING");
});
test("SPLENDOR CITIES: city below 15 starts final round; higher score without a city loses", () => {
  const s = cityFixture(); grantBonus(s,"RED",4); grantBonus(s,"BLACK",3); grantPoints(s,[5,5,3]);
  grantPoints(s,[5,5,5,4],1);
  const r = play(s, cityTake()); assert.ok(r.ok);
  assert.equal(scoreFor(r.state,r.state.players[0]!),13);
  assert.equal(r.state.players[0]!.cities.length,1);
  assert.equal(r.state.cities.length,2); assert.equal(r.state.finalRound,true);
  assert.equal(r.state.phase,"PLAYING");
  const second = timeoutSplendor(r.state,r.state.nextTransitionAt!,"city-next")!;
  assert.equal(second.phase,"PLAYING");
  const end = timeoutSplendor(second,second.nextTransitionAt!,"city-end")!;
  assert.equal(end.result?.reason,"CITIES");
  assert.deepEqual(end.result?.winnerPlayerIds,[ids[0]]);
  assert.equal(end.result?.scores.find(p=>p.playerId===ids[1])?.score,19);
});
test("SPLENDOR CITIES: multiple city choice is atomic and claimed cities cannot be chosen again", () => {
  const s = cityFixture();
  for (const [k,n] of [["RED",4],["BLACK",3],["WHITE",3],["BLUE",4]] as const) grantBonus(s,k,n);
  grantPoints(s,[5,5,3]); const before = structuredClone(s);
  assert.deepEqual(play(s,cityTake()),{ok:false,reason:"CHOOSE_CITY"});
  assert.deepEqual(s,before);
  const chosen = s.cities[0]!;
  const r = play(s,{...cityTake(),cityId:chosen.cityId}); assert.ok(r.ok);
  assert.equal(r.state.players[0]!.cities[0]?.cityId,chosen.cityId);
  assert.equal(r.state.cities.some(c=>c.cityId===chosen.cityId),false);
  assert.deepEqual(play(r.state,{...cityTake(),cityId:chosen.cityId}),{ok:false,reason:"CHOOSE_CITY"});
  assert.deepEqual(play(fixture(),{...cityTake(),cityId:chosen.cityId}),{ok:false,reason:"CHOOSE_CITY"});
  assert.deepEqual(play(cityFixture(),{...cityTake(),nobleId:"SPN-0"}),{ok:false,reason:"CHOOSE_NOBLE"});
});
test("SPLENDOR CITIES: last seat acquisition ends immediately; city contenders tie by card count", () => {
  const s = cityFixture();
  grantBonus(s,"RED",4); grantBonus(s,"BLACK",3); grantPoints(s,[5,5,3]);
  grantBonus(s,"WHITE",3,2); grantBonus(s,"BLUE",4,2); grantPoints(s,[5,4,4],2);
  const first = play(s,cityTake()); assert.ok(first.ok);
  const second = play(first.state,cityTake()); assert.ok(second.ok);
  const last = play(second.state,cityTake()); assert.ok(last.ok);
  assert.equal(last.state.phase,"FINISHED");
  assert.deepEqual(last.state.result?.winnerPlayerIds,[ids[0],ids[2]]);
  const fewer = structuredClone(last.state);
  const extra = fewer.cards.find(c=>c.points===0 && !fewer.players.some(p=>p.purchased.includes(c.cardId)))!;
  acquire(fewer,extra,2); fewer.result = resultFor(fewer,"CITIES");
  assert.deepEqual(parseSplendorState(fewer).result?.winnerPlayerIds,[ids[0]]);
  const unearned = cityFixture(); unearned.players[0]!.cities.push(unearned.cities.shift()!); unearned.finalRound=true;
  assert.throws(()=>parseSplendorState(unearned));
});

test("SPLENDOR feedback records actual collection and excess returns without netting them", () => {
  const s=fixture(4);
  give(s,{WHITE:3,BLUE:3,RED:3,GOLD:1});
  const action:SplendorAction={kind:"TAKE",tokens:{...emptyTokens(),GREEN:2},...resolution(),returns:{...emptyTokens(),WHITE:1,GREEN:1}};
  const r=play(s,action); assert.ok(r.ok);
  assert.deepEqual(r.state.feedback?.tokenMovement,{gained:action.tokens,spent:emptyTokens(),returned:action.returns});
  assert.equal(r.state.players[0]!.tokens.GREEN,1);
  assert.equal(r.state.players[0]!.tokens.WHITE,2);
  assert.equal(s.feedback,null);
});
test("SPLENDOR reservation feedback reports gold only if the bank actually supplied it", () => {
  const s=fixture();
  const action:SplendorAction={kind:"RESERVE_DECK",tier:1,...resolution()};
  const r=play(s,action); assert.ok(r.ok);
  assert.deepEqual(r.state.feedback?.tokenMovement?.gained,{...emptyTokens(),GOLD:1});
  const noGold=fixture(); give(noGold,{GOLD:5},1);
  const no=play(noGold,action); assert.ok(no.ok);
  assert.deepEqual(no.state.feedback?.tokenMovement?.gained,emptyTokens());
  const timed=timeoutSplendor(r.state,r.state.nextTransitionAt!,"no-old-movement");
  assert.equal(timed?.feedback?.tokenMovement,undefined);
});
