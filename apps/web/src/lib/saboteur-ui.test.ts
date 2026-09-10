import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, safeParse } from 'valibot';
import { SaboteurLobbyPlatformSnapshotV2Schema, SaboteurPlayingPlatformSnapshotV2Schema, SaboteurFinishedPlatformSnapshotV2Schema, SaboteurClientCommandSchema, SaboteurCardSchema, GAME_PLAYER_LIMITS } from '@hangul-rummikub/shared';
import { SaboteurScreen } from '../features/saboteur/SaboteurScreen.js';
import { saboteurCandidates, saboteurFeedback, saboteurBoardBounds } from '../features/saboteur/ui.js';
import { decodeWebSnapshot, type SaboteurWebSnapshot } from './snapshot-wire-decoder.js';
import { resolveRoomSnapshotView } from './room-snapshot-view.js';
import { getGameStartControl } from './game-start.js';
const players = ['a', 'b', 'c'].map((id, i) => ({ playerId: id, nickname: ['하비', '친구', '동료'][i]!, isHost: i === 0, connectionStatus: 'CONNECTED' }));
function lobby(n = 3) { return parse(SaboteurLobbyPlatformSnapshotV2Schema, { snapshotVersion: 2, versions: { roomRevision: 1, presenceVersion: 1 }, serverTime: 10000, self: { playerId: 'a' }, room: { roomId: 'sab-room', roomCode: 'BCDFGH', gameType: 'SABOTEUR', phase: 'LOBBY', players: players.slice(0, n) }, game: null }); }
function playing() { const l = lobby(); return parse(SaboteurPlayingPlatformSnapshotV2Schema, { ...l, room: { ...l.room, phase: 'PLAYING' }, game: { gameType: 'SABOTEUR', gameId: 'sab-game', gameRevision: 0, rulesVersion: 'saboteur-base-2025-v1', round: 1, roundId: 'r1', phase: 'PLAYING', turnId: 't1', activePlayerId: 'a', deckCount: 49, discardCount: 0, board: [], goals: ['A', 'B', 'C'].map((goalId, i) => ({ goalId, x: 8, y: [-2, 0, 2][i], face: null, rotation: 0 })), playerStates: players.map(p => ({ playerId: p.playerId, handCount: 6, brokenTools: [] })), privateState: { playerId: 'a', role: 'SABOTEUR', hand: [{ kind: 'PATH', path: 'EW', cardId: 'h1' }, { kind: 'BREAK', tool: 'PICKAXE', cardId: 'h2' }, { kind: 'REPAIR', tools: ['PICKAXE', 'CART'], cardId: 'h3' }, { kind: 'MAP', cardId: 'h4' }, { kind: 'ROCKFALL', cardId: 'h5' }, { kind: 'PATH', path: 'DEAD_EW', cardId: 'h6' }], gold: [], observations: [], goldChoices: [], chatSequence: 0 }, roundResults: [], feedback: null, messages: [] } }); }
const render = (snapshot: SaboteurWebSnapshot) => renderToStaticMarkup(createElement(SaboteurScreen, { snapshot, connected: true, pending: false, error: null, connectionLabel: '접속 중', onCommand: async () => { }, onRematch: () => { }, onStart: () => { }, onLeave: () => { }, onCopy: () => { } }));
test('Saboteur catalog admission and snapshot route reach concrete tabletop renderer', () => {
    for (const s of [lobby(), playing()]) {
        const decoded = decodeWebSnapshot(s);
        assert.equal(decoded.kind, 'COMPATIBLE');
        if (decoded.kind !== 'COMPATIBLE')
            throw new Error();
        assert.equal(resolveRoomSnapshotView(decoded.value).kind, 'SABOTEUR');
        assert.match(render(s), /SABOTEUR/);
    }
    assert.deepEqual(GAME_PLAYER_LIMITS.SABOTEUR, { min: 3, max: 10 });
    assert.equal(getGameStartControl(lobby(2), false).canStart, false);
    assert.equal(getGameStartControl(lobby(), false).canStart, true);
});
test('Saboteur tabletop shows real card faces, hidden role button, three goals, equipment and private hand', () => {
    const html = render(playing());
    assert.equal((html.match(/class="sab-hand-card"/g) ?? []).length, 6);
    assert.equal((html.match(/class="sab-board-card sab-goal /g) ?? []).length, 3);
    assert.match(html, /sab-path-art/);
    assert.match(html, /atlas.png/);
    assert.match(html, /사용 확정/);
    assert.match(html, /나만 볼 수 있습니다/);
    assert.doesNotMatch(html, /당신은 사보타지입니다/);
});
test('Saboteur legal placement hints use public topology and respect broken tools and rotation', () => {
    const g = playing().game, c = g.privateState.hand[0]!;
    assert.deepEqual(saboteurCandidates(g, c, 0).map(p => [p.x, p.y]), [[1, 0], [-1, 0]]);
    g.playerStates[0]!.brokenTools.push('PICKAXE');
    assert.deepEqual(saboteurCandidates(g, c, 0), []);
    g.playerStates[0]!.brokenTools = [];
    const curve = parse(SaboteurCardSchema, { kind: 'PATH', path: 'ES', cardId: 'curve' });
    assert.notDeepEqual(saboteurCandidates(g, curve, 0), saboteurCandidates(g, curve, 180));
    assert.deepEqual(saboteurBoardBounds(g), { minX: -1, maxX: 9, minY: -3, maxY: 3 });
});
test('Saboteur strict schemas reject private leaks, wrong ownership/counts and malformed actions', () => {
    const p = playing();
    for (const game of [{ ...p.game, hiddenGoals: ['GOLD'] }, { ...p.game, deckCount: 48 }, { ...p.game, privateState: { ...p.game.privateState, playerId: 'b' } }])
        assert.equal(safeParse(SaboteurPlayingPlatformSnapshotV2Schema, { ...p, game }).success, false);
    const c = { kind: 'saboteur:act', protocolVersion: 1, requestId: 'req', gameId: 'game', expectedGameRevision: 0, turnId: 'turn', payload: { kind: 'PLACE', cardId: 'card', x: 1, y: 0, rotation: 0 } };
    assert.equal(safeParse(SaboteurClientCommandSchema, c).success, true);
    for (const payload of [{ ...c.payload, rotation: 90 }, { ...c.payload, x: 1.5 }, { ...c.payload, x: 1000000 }, { ...c.payload, actorPlayerId: 'b' }])
        assert.equal(safeParse(SaboteurClientCommandSchema, { ...c, payload }).success, false);
});
test('Saboteur round result offers confirmation and cancellation offers same-room restart', () => {
    const p = playing();
    if (p.game.phase !== 'PLAYING')
        throw new Error();
    const { turnId: _turn, activePlayerId: _active, ...g } = p.game;
    const settled = { ...g, phase: 'ROUND_RESULT', confirmedPlayerIds: [], deckCount: 0, discardCount: 67, playerStates: g.playerStates.map(p => ({ ...p, handCount: 0 })), privateState: { ...g.privateState, hand: [] }, roundResults: [{ round: 1, winner: 'SABOTEURS', roles: players.map((p, i) => ({ playerId: p.playerId, role: i === 0 ? 'SABOTEUR' : 'MINER' })) }] };
    const result = parse(SaboteurPlayingPlatformSnapshotV2Schema, { ...p, game: settled });
    assert.match(render(result), /확인 · 다음 라운드/);
    assert.match(render(result), /사보타지가 광산을 막았습니다/);
    const { confirmedPlayerIds: _confirmed, ...base } = settled, cancelled = parse(SaboteurFinishedPlatformSnapshotV2Schema, { ...p, room: { ...p.room, phase: 'FINISHED' }, game: { ...base, phase: 'FINISHED', result: { reason: 'CANCELLED', winnerPlayerIds: [], scores: [] } } });
    assert.match(render(cancelled), /경기가 취소되었습니다/);
    assert.match(render(cancelled), /같은 방에서 다시 하기/);
});
test('Saboteur public chat escapes markup and map feedback includes no target or observation', () => {
    const p = playing();
    p.game.messages.push({ playerId: p.self.playerId, text: '<img src=x onerror=alert(1)>', at: p.serverTime });
    const html = render(p);
    assert.match(html, /&lt;img/);
    assert.doesNotMatch(html, /<img src="?x/);
    p.game.feedback = { playerId: p.self.playerId, kind: 'MAP', at: p.serverTime, targetPlayerId: null, tool: null, position: null };
    assert.equal(saboteurFeedback(p.game, () => '하비'), '하비님이 지도를 확인했습니다.');
});
