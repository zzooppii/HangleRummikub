import assert from 'node:assert/strict';
import test from 'node:test';
import * as v from 'valibot';
import { GameIdSchema, PlayerIdSchema, TurnIdSchema, ServerTimeSchema, vegasPayout, VEGAS_FACES } from '@hangul-rummikub/shared';
import { createVegasGame, applyVegasAction, timeoutVegas, parseVegasState, publicVegas, VEGAS_BANK, type VegasState } from './games/vegas/domain/game.js';
function rng(seed: number) { return { nextInt(n: number) { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; } }; }
const now = (n: number) => v.parse(ServerTimeSchema, n), turn = (n: number) => v.parse(TurnIdSchema, `vegas-turn-${n}`);
function setup(n = 3, seed = 15) { return createVegasGame({ gameId: v.parse(GameIdSchema, 'vegas-game'), playerIds: Array.from({ length: n }, (_, i) => v.parse(PlayerIdSchema, `vegas-player-${i}`)), now: now(100), turnId: turn(0), starter: 0, random: rng(seed) }); }
test('VEGAS payout: all equal positive groups cancel, then one descending note per survivor', () => {
    assert.deepEqual(vegasPayout([5, 3, 3, 1], [10000, 80000, 30000]), { excluded: [false, true, true, false], awards: [{ playerIndex: 0, amount: 80000 }, { playerIndex: 3, amount: 30000 }], returned: [10000] });
    assert.deepEqual(vegasPayout([2, 2, 1, 1], [90000, 30000]).awards, []);
    assert.deepEqual(vegasPayout([0, 0, 1], [50000, 20000]).awards, [{ playerIndex: 2, amount: 50000 }]);
    assert.deepEqual(vegasPayout([3, 2, 1], [90000]).awards, [{ playerIndex: 0, amount: 90000 }]);
    assert.deepEqual(vegasPayout([0, 0], [50000]).returned, [50000]);
});
test('VEGAS setup: exact denomination inventory, every casino funded, immutable failures', () => {
    const s = setup(), before = structuredClone(s);
    assert.equal(VEGAS_BANK.length, 54);
    assert.ok(s.casinos.every(c => c.reduce((a, b) => a + b, 0) >= 50000));
    assert.deepEqual(applyVegasAction(s, s.players[1]!.playerId, { kind: 'ROLL' }, now(101), turn(1), rng(5)), { ok: false, reason: 'NOT_YOUR_TURN' });
    assert.deepEqual(applyVegasAction(s, s.activePlayerId, { kind: 'PLACE', face: 1 }, now(101), turn(1), rng(5)), { ok: false, reason: 'INVALID_ACTION' });
    assert.deepEqual(s, before);
    const corrupt = structuredClone(s);
    corrupt.players[0]!.remainingDice++;
    assert.throws(() => parseVegasState(corrupt));
    const money = structuredClone(s);
    money.deck.pop();
    assert.throws(() => parseVegasState(money));
});
test('VEGAS roll once, place ALL chosen dice, preserve deadline on roll, absent face rejection', () => {
    const s = setup(), r = applyVegasAction(s, s.activePlayerId, { kind: 'ROLL' }, now(101), turn(1), { nextInt: () => 0 });
    assert.ok(r.ok);
    assert.deepEqual(r.state.rolled, Array(8).fill(1));
    assert.equal(r.state.deadlineAt, s.deadlineAt);
    assert.equal(r.state.transitionId, s.transitionId);
    assert.equal(applyVegasAction(r.state, s.activePlayerId, { kind: 'ROLL' }, now(102), turn(2), rng(1)).ok, false);
    assert.equal(applyVegasAction(r.state, s.activePlayerId, { kind: 'PLACE', face: 6 }, now(102), turn(2), rng(1)).ok, false);
    const p = applyVegasAction(r.state, s.activePlayerId, { kind: 'PLACE', face: 1 }, now(102), turn(2), rng(1));
    assert.ok(p.ok);
    assert.equal(p.state.players[0]!.remainingDice, 0);
    assert.equal(p.state.players[0]!.casinoDice[0], 8);
    assert.equal(p.state.activePlayerId, s.players[1]!.playerId);
    assert.equal(s.players[0]!.remainingDice, 8);
});
test('VEGAS deadline edge, auto roll/place uses one revision, public projection has no deck/balances', () => {
    const s = setup();
    assert.equal(timeoutVegas(s, now(30099), turn(2), rng(1)), null);
    assert.equal(applyVegasAction(s, s.activePlayerId, { kind: 'ROLL' }, now(30099), turn(1), rng(1)).ok, true);
    assert.deepEqual(applyVegasAction(s, s.activePlayerId, { kind: 'ROLL' }, now(30100), turn(1), rng(1)), { ok: false, reason: 'TURN_EXPIRED' });
    const t = timeoutVegas(s, now(30100), turn(2), rng(1));
    assert.ok(t);
    assert.equal(t.revision, 1);
    assert.equal(t.feedback?.automatic, true);
    assert.ok(t.players[0]!.remainingDice < 8);
    const view = publicVegas(t, s.players[1]!.playerId);
    assert.equal('deck' in view, false);
    assert.equal('players' in view, false);
    assert.deepEqual(view.ownBanknotes, []);
});
test('VEGAS 2/3/4/5 players × 12 seeds: full four rounds manual + automatic, conservation at every step', () => {
    for (const n of [2, 3, 4, 5])
        for (let seed = 1; seed <= 12; seed++) {
            let s = setup(n, seed);
            const random = rng(seed + 100);
            let steps = 0;
            while (s.phase === 'PLAYING' && steps++ < 400) {
                const beforeRound = s.round, starter = s.roundStarterId;
                if (seed % 2 === 0) {
                    const next = timeoutVegas(s, s.deadlineAt!, turn(steps), random);
                    assert.ok(next);
                    s = next;
                }
                else {
                    const payload = s.turnStage === 'AWAITING_ROLL' ? { kind: 'ROLL' as const } : { kind: 'PLACE' as const, face: s.rolled[random.nextInt(s.rolled.length)]! };
                    const next = applyVegasAction(s, s.activePlayerId, payload, now(s.turnStartedAt + 1), turn(steps), random);
                    assert.ok(next.ok);
                    s = next.state;
                }
                parseVegasState(s);
                if (s.round > beforeRound) {
                    assert.equal(s.roundStarterId, s.players[(s.players.findIndex(p => p.playerId === starter) + 1) % n]!.playerId);
                    assert.ok(s.players.every(p => p.remainingDice === 8));
                }
            }
            assert.equal(s.phase, 'FINISHED');
            assert.equal(s.round, 4);
            assert.ok(s.result?.winnerPlayerIds.length);
            assert.equal(s.result?.scores.reduce((a, p) => a + p.banknoteCount, 0), s.players.reduce((a, p) => a + p.banknotes.length, 0));
        }
});
test('VEGAS final tie breaks by note count, then shared victory', () => {
    function finishFixture(counts: number[][]): VegasState { const s = setup(2), bank = [...VEGAS_BANK]; s.round = 4; s.casinos = VEGAS_FACES.map(() => [bank.splice(bank.indexOf(50000), 1)[0]!]); for (let i = 0; i < 2; i++) {
        s.players[i]!.banknotes = counts[i]!.map(n => bank.splice(bank.indexOf(n as typeof bank[number]), 1)[0]!);
        s.players[i]!.remainingDice = 0;
        s.players[i]!.casinoDice = [0, 0, 0, 0, 0, 8];
    } s.deck = bank; s.players[0]!.remainingDice = 1; s.players[0]!.casinoDice[5] = 7; s.turnStage = 'AWAITING_PLACEMENT'; s.rolled = [6]; return parseVegasState(s); }
    for (const fixture of [[[20000], [10000, 10000]], [[10000], [10000]]]) {
        const s = finishFixture(fixture), r = applyVegasAction(s, s.activePlayerId, { kind: 'PLACE', face: 6 }, now(101), turn(1), rng(1));
        assert.ok(r.ok);
        assert.equal(r.state.result?.winnerPlayerIds.length, fixture[1]!.length === 2 ? 1 : 2);
        if (fixture[1]!.length === 2)
            assert.deepEqual(r.state.result?.winnerPlayerIds, [s.players[1]!.playerId]);
    }
});
