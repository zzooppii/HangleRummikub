import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse, safeParse } from 'valibot';
import { VegasLobbyPlatformSnapshotV2Schema, VegasPlayingPlatformSnapshotV2Schema, VegasClientCommandSchema, GameRevisionSchema } from '@hangul-rummikub/shared';
import { VegasScreen } from '../features/vegas/VegasScreen.js';
import { vegasTransitionCues, VegasAudio } from '../features/vegas/sound.js';
import { previewVegas, vegasGroups } from '../features/vegas/ui.js';
import { decodeWebSnapshot } from './snapshot-wire-decoder.js';
const players = [{ playerId: 'a', nickname: '하비', isHost: true, connectionStatus: 'CONNECTED' }, { playerId: 'b', nickname: '민아', isHost: false, connectionStatus: 'CONNECTED' }];
function lobby() { return parse(VegasLobbyPlatformSnapshotV2Schema, { snapshotVersion: 2, versions: { roomRevision: 1, presenceVersion: 1 }, serverTime: 1000, self: { playerId: 'a' }, room: { roomId: 'vegas-room', roomCode: 'ABCDEF', gameType: 'VEGAS', phase: 'LOBBY', players }, game: null }); }
function playing() { const s = lobby(); return parse(VegasPlayingPlatformSnapshotV2Schema, { ...s, room: { ...s.room, phase: 'PLAYING' }, game: { gameType: 'VEGAS', gameId: 'vegas-game', gameRevision: 1, rulesVersion: 'vegas-base-v1', phase: 'PLAYING', turnId: 'vegas-turn', activePlayerId: 'a', turnStartedAt: 1000, deadlineAt: 31000, round: 1, roundStarterId: 'a', viewerPlayerId: 'a', ownBanknotes: [], casinos: [[50000], [90000, 10000], [80000], [60000], [70000], [50000]], playerStates: [{ playerId: 'a', remainingDice: 5, casinoDice: [1, 0, 2, 0, 0, 0] }, { playerId: 'b', remainingDice: 4, casinoDice: [0, 2, 0, 2, 0, 0] }], rolled: [2, 2, 3, 3, 3], turnStage: 'AWAITING_PLACEMENT', feedback: null, lastRound: null } }); }
test('VEGAS UI: concrete lobby/game, visual assets, six casinos, choice groups, sound controls, timer', () => {
    for (const s of [lobby(), playing()]) {
        assert.equal(decodeWebSnapshot(s).kind, 'COMPATIBLE');
        const html = renderToStaticMarkup(createElement(VegasScreen, { snapshot: s, connected: true, pending: false, error: null, connectionLabel: '연결됨', onCommand: async () => { }, onRematch() { }, onStart() { }, onLeave() { }, onCopy() { } }));
        assert.match(html, /라스베이거스/);
        assert.match(html, /효과음 음량/);
        assert.match(html, /소리 듣기/);
        if (s.game) {
            assert.match(html, /2 눈 2개 선택/);
            assert.match(html, /3 눈 3개 선택/);
            assert.match(html, /남은 시간 30초/);
            assert.match(html, /획득 금액 비공개/);
            assert.equal((html.match(/class="vg-casino vg-casino-/g) ?? []).length, 6);
        }
        else
            assert.match(html, /카지노 열기/);
    }
});
test('VEGAS preview: ties, changed majority, own turn only, leaves canonical state unchanged', () => {
    const s = playing(), g = s.game, before = structuredClone(g);
    assert.deepEqual(vegasGroups(g), [{ face: 2, count: 2 }, { face: 3, count: 3 }]);
    const tied = previewVegas(g, s.self.playerId, 2);
    assert.deepEqual(tied[1]!.excluded, [true, true]);
    assert.deepEqual(tied[1]!.awards, []);
    assert.equal(previewVegas(g, s.self.playerId, 3)[2]!.counts[0], 5);
    assert.equal(previewVegas(g, g.playerStates[1]!.playerId, 3)[2]!.added, 0);
    assert.deepEqual(g, before);
});
test('VEGAS DTO: private data injection, wrong viewer, malformed roll, dice conservation and command injection rejected', () => {
    const s = playing(), g = s.game;
    for (const game of [{ ...g, deck: [90000] }, { ...g, viewerPlayerId: 'b' }, { ...g, rolled: [2] }, { ...g, deadlineAt: 32000 }, { ...g, playerStates: [{ ...g.playerStates[0], remainingDice: 8 }, g.playerStates[1]] }])
        assert.equal(safeParse(VegasPlayingPlatformSnapshotV2Schema, { ...s, game }).success, false);
    const c = { kind: 'vegas:act', protocolVersion: 1, requestId: 'request', gameId: 'game', expectedGameRevision: 1, turnId: 'turn', payload: { kind: 'ROLL' } };
    assert.equal(safeParse(VegasClientCommandSchema, c).success, true);
    for (const payload of [{ kind: 'ROLL', count: 8 }, { kind: 'PLACE', face: 7 }, { kind: 'PLACE', face: 2, count: 1 }])
        assert.equal(safeParse(VegasClientCommandSchema, { ...c, payload }).success, false);
});
test('VEGAS sound: monotonic revisions, no duplicate or stale cues, unavailable audio is harmless', () => {
    const g = playing().game, n = { ...g, gameRevision: parse(GameRevisionSchema, 2), feedback: { kind: 'ROLL' as const, playerId: g.activePlayerId, face: null, count: 5, automatic: false, at: g.turnStartedAt } };
    assert.deepEqual(vegasTransitionCues(g, n, 'a'), ['ROLL']);
    assert.deepEqual(vegasTransitionCues(n, structuredClone(n), 'a'), []);
    assert.deepEqual(vegasTransitionCues(n, g, 'a'), []);
    const audio = new VegasAudio(() => null);
    audio.unlock();
    audio.setVolume(0);
    audio.play(['ROLL', 'PAYOUT']);
    audio.dispose();
});
