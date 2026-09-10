import assert from 'node:assert/strict';
import test from 'node:test';
import * as v from 'valibot';
import { GameIdSchema, PlayerIdSchema, ServerTimeSchema, TurnIdSchema, SaboteurCardIdSchema, SaboteurActionSchema, SaboteurPlayingProjectionSchema, saboteurProjectionIsConsistent, saboteurConnections, canPlaceSaboteur, reachableSaboteurPorts, type SaboteurAction, type SaboteurCard, type SaboteurPath } from '@hangul-rummikub/shared';
import { makeSaboteurCards, makeSaboteurGold, saboteurRoles, PATH_COUNTS } from './games/saboteur/domain/catalog.js';
import { createSaboteurGame, parseSaboteurState, applySaboteurAction, confirmSaboteurRound, cancelSaboteur, saySaboteur, saboteurCard, type SaboteurState, type SaboteurRoundSetup } from './games/saboteur/domain/game.js';
import { projectSaboteur } from './games/saboteur/compatibility/projector.js';
import { revealSaboteurGoals } from './games/saboteur/domain/board.js';
let id = 0;
const fresh = () => `sab-test-${++id}`, token = () => v.parse(TurnIdSchema, fresh()), now = v.parse(ServerTimeSchema, 10000);
function shuffle<T>(values: readonly T[], seed: number): T[] { const result = [...values]; let n = seed; for (let i = result.length - 1; i > 0; i--) {
    n = (n * 1664525 + 1013904223) >>> 0;
    const j = n % (i + 1);
    [result[i], result[j]] = [result[j]!, result[i]!];
} return result; }
function setup(n = 3, seed = 1): SaboteurRoundSetup { return { cards: shuffle(makeSaboteurCards(fresh), seed), roles: shuffle(saboteurRoles(n), seed + 5), goals: ['ROCK_NE', 'GOLD', 'ROCK_NW'] }; }
function game(n = 3, seed = 1) { return createSaboteurGame({ ...setup(n, seed), gameId: v.parse(GameIdSchema, fresh()), playerIds: Array.from({ length: n }, (_, i) => v.parse(PlayerIdSchema, `player-${i}`)), starter: 0, now, transitionId: token(), goldCards: shuffle(makeSaboteurGold(fresh), seed) }); }
function project(s: SaboteurState, playerId = s.players[0]!.playerId) { return projectSaboteur({ gameId: s.gameId, gameRevision: s.revision, startedAt: s.startedAt, finishedAt: s.finishedAt, state: s }, playerId); }
function apply(s: SaboteurState, a: SaboteurAction) { const result = applySaboteurAction(s, s.activePlayerId, a, now, token()); assert.ok(result.ok, JSON.stringify(result)); return result.state; }
/** Rearrange a fixture's existing cards, never invent or remove instances. */
function give(s: SaboteurState, predicate: (c: SaboteurCard) => boolean) { const p = s.players.find(p => p.playerId === s.activePlayerId)!; const owned = p.hand.map(id => saboteurCard(s, id)).find(predicate); if (owned)
    return owned; const zones = [s.deck, ...s.players.filter(other => other !== p).map(p => p.hand)], zone = zones.find(z => z.some(id => predicate(saboteurCard(s, id)))); assert.ok(zone); const i = zone.findIndex(id => predicate(saboteurCard(s, id))), card = zone[i]!; zone[i] = p.hand[0]!; p.hand[0] = card; parseSaboteurState(s); return saboteurCard(s, card); }
const tile = (path: SaboteurPath, x: number, y: number, rotation: 0 | 180 = 0) => ({ path, x, y, rotation, cardId: v.parse(SaboteurCardIdSchema, fresh()), placedBy: v.parse(PlayerIdSchema, 'player-0') });
test('Saboteur exact 67 play / 28 gold card inventory, role mixes and 3–10 player deals', () => {
    const cards = makeSaboteurCards(fresh);
    assert.equal(cards.filter(c => c.kind === 'PATH').length, 40);
    assert.equal(cards.filter(c => c.kind === 'BREAK').length, 9);
    assert.equal(cards.filter(c => c.kind === 'REPAIR').length, 9);
    assert.equal(cards.filter(c => c.kind === 'MAP').length, 6);
    assert.equal(cards.filter(c => c.kind === 'ROCKFALL').length, 3);
    assert.equal(Object.values(PATH_COUNTS).reduce((a, b) => a + b), 40);
    assert.equal(makeSaboteurGold(fresh).reduce((n, c) => n + c.value, 0), 44);
    for (let n = 3; n <= 10; n++) {
        const s = game(n);
        assert.equal(s.players[0]!.hand.length, n <= 5 ? 6 : n <= 7 ? 5 : 4);
        assert.equal(s.deck.length, 67 - n * s.players[0]!.hand.length);
        assert.equal(saboteurRoles(n).length, n + 1);
        assert.equal(saboteurProjectionIsConsistent(project(s)), true);
    }
    assert.throws(() => game(2));
    assert.throws(() => game(11));
});
test('Saboteur rotation and disconnected dead ends use internal port topology', () => {
    assert.deepEqual(saboteurConnections('DEAD_ALL', 0), [['N'], ['E'], ['S'], ['W']]);
    assert.deepEqual(saboteurConnections('ES', 180), [['W', 'N']]);
    const s = { board: [tile('DEAD_EW', 1, 0)], goals: [] };
    assert.equal(reachableSaboteurPorts(s).has('1,0:W'), true);
    assert.equal(reachableSaboteurPorts(s).has('1,0:E'), false);
    assert.equal(canPlaceSaboteur(s, tile('EW', 2, 0)), false);
    assert.equal(canPlaceSaboteur({ board: [], goals: [] }, s.board[0]!), true);
});
test('Saboteur placement enforces every adjacent edge, occupancy and start reachability', () => {
    const empty = { board: [], goals: [] };
    assert.equal(canPlaceSaboteur(empty, tile('EW', 1, 0)), true);
    assert.equal(canPlaceSaboteur(empty, tile('NS', 1, 0)), false);
    assert.equal(canPlaceSaboteur(empty, tile('EW', 0, 0)), false);
    assert.equal(canPlaceSaboteur(empty, tile('EW', 5, 0)), false);
    const disconnected = { board: [tile('EW', 2, 0)], goals: [] };
    assert.equal(canPlaceSaboteur(disconnected, tile('EW', 3, 0)), false);
    assert.equal(canPlaceSaboteur(disconnected, tile('EW', 1, 0)), true);
    const conflict = { board: [tile('NESW', 1, 0), tile('EW', 2, -1)], goals: [] };
    assert.equal(canPlaceSaboteur(conflict, tile('NESW', 2, 0)), false);
});
test('Saboteur hidden goal identity does not affect legal placement; dead ends cannot reveal beyond a wall', () => {
    const g = game(), board = Array.from({ length: 6 }, (_, i) => tile('EW', i + 1, 0));
    const last = tile('EW', 7, 0);
    assert.equal(canPlaceSaboteur({ board, goals: g.goals }, last), true);
    const reached = revealSaboteurGoals({ board: [...board, last], goals: g.goals }, ['ROCK_NE', 'GOLD', 'ROCK_NW']);
    assert.equal(reached[1]!.face, 'GOLD');
    const blocked = revealSaboteurGoals({ board: [...board, tile('DEAD_EW', 7, 0)], goals: g.goals }, g.hiddenGoals);
    assert.equal(blocked[1]!.face, null);
    const rock = revealSaboteurGoals({ board: [...board, last], goals: g.goals }, ['GOLD', 'ROCK_NE', 'ROCK_NW']);
    assert.equal(rock[1]!.face, 'ROCK_NE');
    assert.equal(rock[1]!.rotation, 180);
});
test('Saboteur invalid actor, unknown or opponent card and invalid rotation preserve original state', () => {
    const s = game(), before = structuredClone(s), other = s.players[1]!;
    const a: SaboteurAction = { kind: 'DISCARD', cardId: s.players[0]!.hand[0]! };
    assert.deepEqual(applySaboteurAction(s, other.playerId, a, now, token()), { ok: false, reason: 'NOT_YOUR_TURN' });
    for (const cardId of [v.parse(SaboteurCardIdSchema, 'missing'), other.hand[0]!])
        assert.deepEqual(applySaboteurAction(s, s.activePlayerId, { kind: 'DISCARD', cardId }, now, token()), { ok: false, reason: 'INVALID_ACTION' });
    assert.equal(v.safeParse(SaboteurActionSchema, { kind: 'PLACE', cardId: a.cardId, x: 1, y: 0, rotation: 90 }).success, false);
    assert.deepEqual(s, before);
});
test('Saboteur break forbids self/duplicate, blocks paths and double repair removes exactly one tool', () => {
    let s = game(3);
    let c = give(s, c => c.kind === 'BREAK' && c.tool === 'PICKAXE');
    const victim = s.players[1]!.playerId;
    assert.equal(applySaboteurAction(s, s.activePlayerId, { kind: 'BREAK', cardId: c.cardId, targetPlayerId: s.activePlayerId }, now, token()).ok, false);
    s = apply(s, { kind: 'BREAK', cardId: c.cardId, targetPlayerId: victim });
    c = give(s, c => c.kind === 'PATH' && c.path === 'EW');
    assert.equal(applySaboteurAction(s, s.activePlayerId, { kind: 'PLACE', cardId: c.cardId, x: 1, y: 0, rotation: 0 }, now, token()).ok, false);
    c = give(s, c => c.kind === 'REPAIR' && c.tools.includes('PICKAXE') && c.tools.length === 2);
    s = apply(s, { kind: 'REPAIR', cardId: c.cardId, targetPlayerId: victim, tool: 'PICKAXE' });
    assert.equal(s.players.find(p => p.playerId === victim)!.equipment.length, 0);
    assert.equal(s.discard.length, 2);
    c = give(s, c => c.kind === 'REPAIR');
    assert.ok(c.kind === 'REPAIR');
    assert.equal(applySaboteurAction(s, s.activePlayerId, { kind: 'REPAIR', cardId: c.cardId, targetPlayerId: victim, tool: c.tools[0]! }, now, token()).ok, false);
});
test('Saboteur map observations are private and do not reveal goal identity in feedback or other projections', () => {
    let s = game(6);
    const viewer = s.activePlayerId, c = give(s, c => c.kind === 'MAP');
    s = apply(s, { kind: 'MAP', cardId: c.cardId, goalId: 'B' });
    assert.deepEqual(project(s, viewer).privateState.observations, [{ goalId: 'B', face: 'GOLD' }]);
    const other = project(s, s.players[1]!.playerId);
    assert.deepEqual(other.privateState.observations, []);
    assert.ok(other.goals.every(g => g.face === null));
    assert.deepEqual(other.feedback, { playerId: viewer, kind: 'MAP', at: now, targetPlayerId: null, tool: null, position: null });
    assert.equal(JSON.stringify(other).includes(c.cardId), false);
    for (const p of s.players)
        if (p.playerId !== other.privateState.playerId)
            for (const id of p.hand)
                assert.equal(JSON.stringify(other).includes(id), false);
    assert.equal(v.safeParse(SaboteurPlayingProjectionSchema, { ...other, hiddenGoals: s.hiddenGoals }).success, false);
});
test('Saboteur rockfall removes only an ordinary path and leaves disconnected cards on board', () => {
    let s = game();
    for (let x = 1; x <= 2; x++) {
        const c = give(s, c => c.kind === 'PATH' && c.path === 'EW');
        s = apply(s, { kind: 'PLACE', cardId: c.cardId, x, y: 0, rotation: 0 });
    }
    const c = give(s, c => c.kind === 'ROCKFALL');
    for (const x of [0, 8])
        assert.equal(applySaboteurAction(s, s.activePlayerId, { kind: 'ROCKFALL', cardId: c.cardId, x, y: 0 }, now, token()).ok, false);
    s = apply(s, { kind: 'ROCKFALL', cardId: c.cardId, x: 1, y: 0 });
    assert.equal(s.board.length, 1);
    assert.equal(s.board[0]!.x, 2);
    assert.equal(reachableSaboteurPorts(s).has('2,0:W'), false);
});
test('Saboteur reaching gold starts private counterclockwise selection even when saboteur places last card', () => {
    let s = game(3);
    const roles = ['SABOTEUR', 'MINER', 'MINER'] as const;
    s.players.forEach((p, i) => { p.role = roles[i]!; });
    s.unusedRole = 'MINER';
    for (let x = 1; x <= 7; x++) {
        const c = give(s, c => c.kind === 'PATH' && (c.path === 'EW' || c.path === 'NESW'));
        s = apply(s, { kind: 'PLACE', cardId: c.cardId, x, y: 0, rotation: 0 });
    }
    assert.equal(s.phase, 'GOLD_SELECTION');
    assert.equal(s.players.find(p => p.playerId === s.lastActorId)!.role, 'SABOTEUR');
    assert.deepEqual(s.goldQueue, [s.players[2]!.playerId, s.players[1]!.playerId]);
    assert.equal(s.goldPool.length, 2);
    const observer = project(s, s.players[0]!.playerId);
    assert.deepEqual(observer.privateState.goldChoices, []);
    const chosen = s.goldPool[0]!;
    s = apply(s, { kind: 'TAKE_GOLD', cardId: chosen });
    assert.equal(s.goldPool.length, 1);
    assert.equal(project(s, s.players[0]!.playerId).privateState.goldChoices.length, 0);
    s = apply(s, { kind: 'TAKE_GOLD', cardId: s.goldPool[0]! });
    assert.equal(s.phase, 'ROUND_RESULT');
    assert.equal(s.players[0]!.gold.length, 0);
    assert.equal(s.players[1]!.gold.length, 1);
    assert.equal(s.players[2]!.gold.length, 1);
    assert.equal(saboteurProjectionIsConsistent(project(s)), true);
});
test('Saboteur three rounds, empty-deck play, private gold and fresh roles/cards for every player count', () => {
    for (let n = 3; n <= 10; n++)
        for (let seed = 1; seed <= 2; seed++) {
            let s = game(n, seed), moves = 0;
            const firstIds = new Set(s.cards.map(c => c.cardId));
            while (s.phase !== 'FINISHED') {
                if (s.phase === 'PLAYING') {
                    const actor = s.players.find(p => p.playerId === s.activePlayerId)!;
                    s = apply(s, { kind: 'DISCARD', cardId: actor.hand[0]! });
                    moves++;
                    if (s.deck.length === 0 && s.players.some(p => p.hand.length))
                        assert.equal(s.phase, 'PLAYING');
                }
                else if (s.phase === 'ROUND_RESULT') {
                    for (const p of s.players) {
                        const next = confirmSaboteurRound(s, p.playerId, s.confirmedPlayerIds.length === n - 1 ? setup(n, seed + s.round) : null, token());
                        assert.ok(next.ok);
                        s = next.state;
                    }
                }
                else
                    throw new Error('Discard-only match should not select miner gold.');
                assert.equal(saboteurProjectionIsConsistent(project(s)), true);
                if (s.round > 1)
                    assert.ok(s.cards.every(c => !firstIds.has(c.cardId)));
                assert.ok(moves <= 201);
            }
            assert.equal(moves, 201);
            assert.equal(s.roundResults.length, 3);
            assert.equal(s.result?.reason, 'THREE_ROUNDS');
            assert.ok(s.result!.winnerPlayerIds.length > 0);
        }
});
test('Saboteur role-free sabotage round awards no gold and last actor successor starts next round', () => {
    let s = game(3);
    s.players.forEach(p => p.role = 'MINER');
    s.unusedRole = 'SABOTEUR';
    while (s.phase === 'PLAYING')
        s = apply(s, { kind: 'DISCARD', cardId: s.players.find(p => p.playerId === s.activePlayerId)!.hand[0]! });
    assert.equal(s.roundResults[0]!.winner, 'NOBODY');
    assert.equal(s.players.flatMap(p => p.gold).length, 0);
    const last = s.players.findIndex(p => p.playerId === s.lastActorId), expected = s.players[(last + 1) % 3]!.playerId;
    for (const p of s.players) {
        const r = confirmSaboteurRound(s, p.playerId, s.confirmedPlayerIds.length === 2 ? setup() : null, token());
        assert.ok(r.ok);
        s = r.state;
    }
    assert.equal(s.activePlayerId, expected);
});
test('Saboteur chat trims text, limits rate and sequence, changes snapshot revision without consuming a turn', () => {
    const s = game(), actor = s.activePlayerId, one = saySaboteur(s, actor, '  hello  ', 0, now);
    assert.ok(one.ok);
    assert.equal(one.state.messages[0]!.text, 'hello');
    assert.equal(one.state.transitionId, s.transitionId);
    assert.equal(one.state.revision, s.revision + 1);
    assert.equal(saySaboteur(one.state, actor, 'again', 1, now).ok, false);
    assert.equal(saySaboteur(one.state, actor, 'again', 0, v.parse(ServerTimeSchema, 13000)).ok, false);
});
test('Saboteur stored validation rejects duplicate cards, equipment, hidden goals and invalid result state', () => {
    const s = game();
    for (const mutate of [(s: SaboteurState) => { s.deck[0] = s.deck[1]!; }, (s: SaboteurState) => { s.hiddenGoals[0] = 'GOLD'; }, (s: SaboteurState) => { s.players[0]!.role = 'SABOTEUR'; s.players[1]!.role = 'SABOTEUR'; }, (s: SaboteurState) => { s.phase = 'ROUND_RESULT'; }, (s: SaboteurState) => { s.goldDeck[0] = s.goldDeck[1]!; }]) {
        const copy = structuredClone(s);
        mutate(copy);
        assert.throws(() => parseSaboteurState(copy));
    }
    const cancelled = cancelSaboteur(s, now);
    assert.equal(cancelled.result?.reason, 'CANCELLED');
    assert.deepEqual(cancelled.result?.scores, []);
    assert.equal(s.phase, 'PLAYING');
});
