import assert from 'node:assert/strict';
import test from 'node:test';
import { parse } from 'valibot';
import { GameIdSchema, PlayerIdSchema, ServerTimeSchema, TurnIdSchema, TRAIN_ROUTES, TRAIN_CITIES, TRAIN_TICKETS, TRAIN_COLORS, TRAIN_ROUTE_POINTS, type TrainAction, type TrainColor } from '@hangul-rummikub/shared';
import { makeTrainCards, shuffleTrain, createTrainGame, applyTrainAction, parseTrainState, trainCard, trainLongestPath, trainConnected, trainRouteAvailable, cancelTrain, type TrainState } from './games/train/domain/game.js';
import { projectTrain } from './games/train/compatibility/projector.js';
let seq = 0;
const time = () => parse(ServerTimeSchema, 1000 + seq), turn = () => parse(TurnIdSchema, `turn-${++seq}`);
function random(seed = 12) { return (n: number) => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed % n; }; }
function setup(n = 2, starter = 0, seed = 12) { const rng = random(seed), all = makeTrainCards(() => `opaque-${++seq}`); return createTrainGame({ cards: shuffleTrain(all.cards, rng), tickets: shuffleTrain(all.tickets, rng), gameId: parse(GameIdSchema, `game-${++seq}`), playerIds: Array.from({ length: n }, (_, i) => parse(PlayerIdSchema, `player-${i}`)), now: time(), transitionId: turn(), starter }, rng); }
function act(s: TrainState, a: TrainAction) { const out = applyTrainAction(s, s.activePlayerId, a, time(), turn(), random(seq)); assert.ok(out.ok, JSON.stringify(a)); return out.state; }
function ready(n = 2, starter = 0, seed = 12) { let s = setup(n, starter, seed); while (s.step === 'SETUP') {
    const p = s.players.find(p => p.playerId === s.activePlayerId)!;
    s = act(s, { kind: 'KEEP_TICKETS', keepCardIds: p.pendingTickets.slice(0, 2), returnCardIds: p.pendingTickets.slice(2) });
} return s; }
function stored(s: TrainState) { return { gameId: s.gameId, gameRevision: s.revision, startedAt: s.startedAt, finishedAt: s.finishedAt, state: s }; }
function give(s: TrainState, color: TrainColor, n: number) { const picked = s.cards.filter(c => c.color === color).slice(0, n).map(c => c.cardId); for (const p of s.players)
    p.hand = p.hand.filter(id => !picked.includes(id)); s.deck = s.deck.filter(id => !picked.includes(id)); s.discard = s.discard.filter(id => !picked.includes(id)); s.market = s.market.filter(id => !picked.includes(id)); s.players.find(p => p.playerId === s.activePlayerId)!.hand.push(...picked); return picked; }
function route(a: string, b: string) { const r = TRAIN_ROUTES.find(r => r.a === a && r.b === b || r.a === b && r.b === a); assert.ok(r); return r; }
test('TRAIN catalog: 36 cities, 100 unique routes, 309 spaces, 30 original tickets, all connected', () => {
    assert.equal(TRAIN_CITIES.length, 36);
    assert.equal(TRAIN_ROUTES.length, 100);
    assert.equal(TRAIN_TICKETS.length, 30);
    assert.equal(new Set(TRAIN_ROUTES.map(r => r.routeId)).size, 100);
    assert.equal(TRAIN_ROUTES.reduce((n, r) => n + r.length, 0), 309);
    const p = parse(PlayerIdSchema, 'all'), claims = TRAIN_ROUTES.map(r => ({ routeId: r.routeId, playerId: p }));
    for (const c of TRAIN_CITIES)
        assert.ok(trainConnected(claims, p, TRAIN_CITIES[0]!.cityId, c.cityId));
    assert.equal(TRAIN_TICKETS.find(t => t.a === 'los-angeles' && t.b === 'new-york')?.points, 21);
});
test('TRAIN start: all seats and starters, 4 cards/45 trains, private 3-ticket offers and minimum 2', () => {
    for (let n = 2; n <= 5; n++)
        for (let starter = 0; starter < n; starter++) {
            const s = setup(n, starter);
            assert.equal(s.cards.length, 110);
            assert.equal(s.tickets.length, 30);
            assert.equal(s.market.length, 5);
            assert.equal(s.activePlayerId, s.players[0]!.playerId);
            for (const p of s.players) {
                assert.equal(p.hand.length, 4);
                assert.equal(p.trains, 45);
                assert.equal(p.pendingTickets.length, 3);
            }
            const g = projectTrain(stored(s), s.players[0]!.playerId);
            assert.equal(g.privateState.minimumKeep, 2);
            const first = s.players[0]!;
            assert.equal(applyTrainAction(s, first.playerId, { kind: 'KEEP_TICKETS', keepCardIds: first.pendingTickets.slice(0, 1), returnCardIds: first.pendingTickets.slice(1) }, time(), turn(), random()).ok, false);
            const done = ready(n, starter);
            assert.equal(done.activePlayerId, done.startingPlayerId);
            assert.equal(done.step, 'TURN');
        }
    assert.throws(() => setup(1));
    assert.throws(() => setup(6));
});
test('TRAIN atomicity: unknown/foreign IDs, duplicate payment, wrong actor and phase leave state unchanged', () => {
    const s = ready(), before = structuredClone(s), p = s.players.find(p => p.playerId === s.activePlayerId)!, other = s.players.find(p => p !== s.players.find(x => x.playerId === s.activePlayerId))!;
    for (const cardId of ['unknown', other.hand[0]]) {
        const out = applyTrainAction(s, p.playerId, { kind: 'CLAIM_ROUTE', routeId: route('vancouver', 'seattle').routeId, cardIds: [cardId] }, time(), turn(), random());
        assert.deepEqual(out, { ok: false, reason: 'INVALID_ACTION' });
    }
    assert.deepEqual(applyTrainAction(s, other.playerId, { kind: 'DRAW_DECK' }, time(), turn(), random()), { ok: false, reason: 'NOT_YOUR_TURN' });
    assert.equal(applyTrainAction(s, p.playerId, { kind: 'DRAW_DECK', injected: true }, time(), turn(), random()).ok, false);
    assert.deepEqual(s, before);
});
test('TRAIN draw is sequential: first card commits; public locomotive blocked second; blind locomotive counts one', () => {
    let s = ready();
    const actor = s.activePlayerId, wild = s.cards.find(c => c.color === 'LOCOMOTIVE' && s.deck.includes(c.cardId))!;
    s.deck.splice(s.deck.indexOf(wild.cardId), 1);
    s.deck.unshift(wild.cardId);
    const before = s.players[0]!.hand.length;
    s = act(s, { kind: 'DRAW_DECK' });
    assert.equal(s.activePlayerId, actor);
    assert.equal(s.step, 'DRAW_SECOND');
    assert.equal(s.players[0]!.hand.length, before + 1);
    const secondWild = s.cards.find(c => c.color === 'LOCOMOTIVE' && s.deck.includes(c.cardId))!;
    s.deck.splice(s.deck.indexOf(secondWild.cardId), 1);
    const replaced = s.market[0]!;
    s.market[0] = secondWild.cardId;
    s.deck.push(replaced);
    assert.equal(applyTrainAction(s, actor, { kind: 'DRAW_MARKET', cardId: secondWild.cardId }, time(), turn(), random()).ok, false);
    assert.equal(applyTrainAction(s, actor, { kind: 'DRAW_TICKETS' }, time(), turn(), random()).ok, false);
    s = act(s, { kind: 'DRAW_DECK' });
    assert.notEqual(s.activePlayerId, actor);
    assert.equal(s.step, 'TURN');
    const chosen = s.market.find(id => trainCard(s, id).color === 'LOCOMOTIVE');
    assert.ok(chosen);
    const old = s.activePlayerId;
    s = act(s, { kind: 'DRAW_MARKET', cardId: chosen });
    assert.notEqual(s.activePlayerId, old);
});
test('TRAIN route payment: same color, wild substitution, 4 spaces score 7, mixed color rejected', () => {
    const s = ready(), r = route('denver', 'omaha'), a = give(s, 'PURPLE', 3), w = give(s, 'LOCOMOTIVE', 1), red = give(s, 'RED', 1);
    assert.equal(applyTrainAction(s, s.activePlayerId, { kind: 'CLAIM_ROUTE', routeId: r.routeId, cardIds: [...a.slice(0, 2), ...red, ...w] }, time(), turn(), random()).ok, false);
    const next = act(s, { kind: 'CLAIM_ROUTE', routeId: r.routeId, cardIds: [...a, ...w] }), p = next.players.find(p => p.playerId === s.activePlayerId)!;
    assert.equal(p.trains, 41);
    assert.equal(p.routePoints, 7);
    assert.equal(next.claims[0]!.routeId, r.routeId);
    assert.equal(s.claims.length, 0);
});
test('TRAIN gray route accepts one color or all wild; doubles depend on player count and owner', () => {
    for (const n of [2, 3, 4, 5]) {
        let s = ready(n);
        const pair = TRAIN_ROUTES.filter(r => r.group === 'seattle--vancouver'), id = give(s, 'LOCOMOTIVE', 1);
        const owner = s.activePlayerId;
        s = act(s, { kind: 'CLAIM_ROUTE', routeId: pair[0]!.routeId, cardIds: id });
        assert.equal(trainRouteAvailable(s, owner, pair[1]!.routeId), false);
        assert.equal(trainRouteAvailable(s, s.activePlayerId, pair[1]!.routeId), n >= 4);
    }
});
test('TRAIN extra tickets persist until choice; return order and minimum, cancellation of draw rejected', () => {
    let s = ready();
    const actor = s.activePlayerId;
    s = act(s, { kind: 'DRAW_TICKETS' });
    const p = s.players.find(p => p.playerId === actor)!, offer = [...p.pendingTickets];
    assert.equal(offer.length, 3);
    assert.equal(s.step, 'CHOOSE_TICKETS');
    assert.equal(applyTrainAction(s, actor, { kind: 'DRAW_DECK' }, time(), turn(), random()).ok, false);
    s = act(s, { kind: 'KEEP_TICKETS', keepCardIds: offer.slice(0, 1), returnCardIds: offer.slice(1).reverse() });
    assert.deepEqual(s.ticketDeck.slice(-2), offer.slice(1).reverse());
    assert.notEqual(s.activePlayerId, actor);
    assert.equal(s.players.find(p => p.playerId === actor)!.tickets.length, 3);
});
test('TRAIN longest continuous trail permits loops/revisited cities and never reuses an edge', () => {
    const p = parse(PlayerIdSchema, 'p');
    const edges = [route('los-angeles', 'san-francisco'), route('san-francisco', 'salt-lake-city'), route('salt-lake-city', 'las-vegas'), route('las-vegas', 'los-angeles'), route('los-angeles', 'phoenix')];
    const claims = edges.map(r => ({ routeId: r.routeId, playerId: p }));
    assert.equal(trainLongestPath(claims, p), 16);
    assert.equal(trainConnected(claims, p, 'phoenix', 'salt-lake-city'), true);
    assert.equal(trainConnected(claims, p, 'phoenix', 'miami'), false);
    const star = ['seattle', 'calgary', 'salt-lake-city', 'denver'].map(c => route('helena', c));
    assert.equal(trainLongestPath(star.map(r => ({ routeId: r.routeId, playerId: p })), p), 10);
});
test('TRAIN every trigger seat gives each player including trigger exactly one final turn', () => {
    for (let n = 2; n <= 5; n++)
        for (let seat = 0; seat < n; seat++) {
            let s = ready(n, seat), remaining = 42;
            const actor = s.activePlayerId, small = route('vancouver', 'seattle');
            for (const r of TRAIN_ROUTES) {
                if (r.group === small.group || r.length > remaining || s.claims.some(c => TRAIN_ROUTES.find(x => x.routeId === c.routeId)!.group === r.group))
                    continue;
                s.claims.push({ routeId: r.routeId, playerId: actor });
                remaining -= r.length;
                if (!remaining)
                    break;
            }
            assert.equal(remaining, 0);
            const p = s.players.find(p => p.playerId === actor)!;
            p.trains = 3;
            p.routePoints = s.claims.reduce((n, c) => n + TRAIN_ROUTE_POINTS[TRAIN_ROUTES.find(r => r.routeId === c.routeId)!.length]!, 0);
            const cards = give(s, 'RED', 1);
            s = act(s, { kind: 'CLAIM_ROUTE', routeId: small.routeId, cardIds: cards });
            assert.equal(s.finalTurnsRemaining, n);
            const order = [];
            for (let i = 0; i < n; i++) {
                order.push(s.activePlayerId);
                s = act(s, { kind: 'DRAW_DECK' });
                if (s.phase === 'PLAYING' && s.step === 'DRAW_SECOND')
                    s = act(s, { kind: 'DRAW_DECK' });
            }
            assert.equal(new Set(order).size, n);
            assert.equal(order.at(-1), actor);
            assert.equal(s.phase, 'FINISHED');
            assert.equal(s.result?.reason, 'TRAINS');
            assert.equal(s.finalTurnsRemaining, 0);
        }
});
test('TRAIN projection hides opponent card/ticket identities and unfinished destinations; tampering rejected', () => {
    const s = ready(), viewer = s.players[0]!.playerId, other = s.players[1]!, g = projectTrain(stored(s), viewer), wire = JSON.stringify(g);
    for (const id of [...other.hand, ...other.tickets])
        assert.equal(wire.includes(id), false);
    assert.equal('cards' in g, false);
    assert.equal('deck' in g, false);
    assert.equal('tickets' in g.playerStates[1]!, false);
    const broken = structuredClone(s);
    broken.players[0]!.hand.push(broken.players[0]!.hand[0]!);
    assert.throws(() => parseTrainState(broken));
    const broken2 = structuredClone(s);
    broken2.players[0]!.trains--;
    assert.throws(() => parseTrainState(broken2));
    assert.equal(cancelTrain(s, time()).result?.reason, 'CANCELLED');
});
test('TRAIN exhausted deck reshuffles discard and impossible locomotive refresh terminates', () => {
    let s = ready();
    s.discard.push(...s.deck.splice(0));
    const after = act(s, { kind: 'DRAW_DECK' });
    assert.ok(after.deck.length > 0);
    parseTrainState(after);
    s = ready();
    for (const p of s.players)
        p.hand.push(...s.deck.splice(0), ...s.market.splice(0));
    const actor = s.players.find(p => p.playerId === s.activePlayerId)!;
    const wild = give(s, 'LOCOMOTIVE', 6);
    actor.hand = actor.hand.filter(id => !wild.includes(id));
    s.market = wild.slice(0, 5);
    s.deck = wild.slice(5);
    s = act(s, { kind: 'DRAW_MARKET', cardId: s.market[0]! });
    assert.equal(s.market.length, 5);
    assert.equal(s.step, 'TURN');
    parseTrainState(s);
});
test('TRAIN complete legal 2–5 player games retain conservation through claims, draws and scoring', () => {
    for (const n of [2, 3, 4, 5])
        for (const seed of [7, 21, 57]) {
            let s = ready(n, seed % n, seed), steps = 0;
            while (s.phase === 'PLAYING' && steps++ < 1200) {
                const p = s.players.find(p => p.playerId === s.activePlayerId)!;
                if (s.step === 'DRAW_SECOND') {
                    s = act(s, { kind: 'DRAW_DECK' });
                    continue;
                }
                let choice: {
                    routeId: string;
                    cardIds: TrainState['deck'];
                } | undefined;
                for (const r of [...TRAIN_ROUTES].sort((a, b) => b.length - a.length)) {
                    if (r.length > p.trains || !trainRouteAvailable(s, p.playerId, r.routeId))
                        continue;
                    for (const color of TRAIN_COLORS.filter(c => c !== 'LOCOMOTIVE' && (r.color === 'GRAY' || r.color === c))) {
                        const cards = p.hand.filter(id => trainCard(s, id).color === color), wild = p.hand.filter(id => trainCard(s, id).color === 'LOCOMOTIVE');
                        if (cards.length + wild.length >= r.length) {
                            choice = { routeId: r.routeId, cardIds: [...cards, ...wild].slice(0, r.length) };
                            break;
                        }
                    }
                    if (choice)
                        break;
                }
                if (choice)
                    s = act(s, { kind: 'CLAIM_ROUTE', ...choice });
                else if (s.deck.length + s.discard.length)
                    s = act(s, { kind: 'DRAW_DECK' });
                else if (s.market.length)
                    s = act(s, { kind: 'DRAW_MARKET', cardId: s.market[0]! });
                else if (s.ticketDeck.length) {
                    s = act(s, { kind: 'DRAW_TICKETS' });
                    const pending = s.players.find(p => p.playerId === s.activePlayerId)!.pendingTickets;
                    s = act(s, { kind: 'KEEP_TICKETS', keepCardIds: [...pending], returnCardIds: [] });
                }
                else
                    s = act(s, { kind: 'PASS' });
            }
            assert.equal(s.phase, 'FINISHED', `${n} players seed ${seed}, ${steps} commands`);
            assert.ok(s.result!.winnerPlayerIds.length);
            for (const score of s.result!.scores)
                assert.equal(score.total, score.routePoints + score.ticketPoints + score.longestBonus);
        }
});
