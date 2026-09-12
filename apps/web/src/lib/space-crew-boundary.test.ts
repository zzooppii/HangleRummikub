import assert from 'node:assert/strict';
import test from 'node:test';
import * as v from 'valibot';
import { RoomIdSchema, PlayerIdSchema, SpaceCrewStartCommandSchema, SpaceCrewClientCommandSchema, validateBrowserStoredPlayerSession } from '@hangul-rummikub/shared';
import { SpaceCrewOutbox, SPACE_CREW_OUTBOX_PREFIX, spaceCrewRejectionIsDefinitive } from './space-crew-outbox.js';
import { decodeWebSnapshot, WEB_SUPPORTED_GAME_TYPES } from './snapshot-wire-decoder.js';
import { resolveRoomSnapshotView } from './room-snapshot-view.js';
import { projectRoomSnapshotShell } from './room-snapshot-shell.js';
import { SavedGameStorage } from './saved-game.js';
import { roomLeaveConfirmationMessage } from './room-leave.js';
import { GAME_CATALOG } from '../features/game-catalog/game-catalog.js';
import type { SessionStorageLike } from './session-storage.js';
class MemoryStorage implements SessionStorageLike {
  readonly values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}
const scope = { roomId: v.parse(RoomIdSchema, 'room_crew_browser'), playerId: v.parse(PlayerIdSchema, 'player_crew_browser') };
const start = v.parse(SpaceCrewStartCommandSchema, { kind: 'spaceCrew:start', protocolVersion: 1, requestId: 'start-id', expectedRoomRevision: 3,
  payload: { kind: 'NEW', mode: 'CAMPAIGN', recoveryToken: 'A'.repeat(43) } });
const play = v.parse(SpaceCrewClientCommandSchema, { kind: 'spaceCrew:act', protocolVersion: 1, requestId: 'play-id', gameId: 'game_crew_browser', attemptId: 'attempt_crew_browser', expectedGameRevision: 42, payload: { kind: 'PLAY', cardId: 'opaque-card' } });

test('Space Crew outbox survives reload with identical start and action envelopes and isolates actors/rooms', () => {
  const storage = new MemoryStorage(), outbox = new SpaceCrewOutbox(storage);
  for (const command of [start, play]) {
    outbox.save(scope, command);
    const refreshed = new SpaceCrewOutbox(storage);
    assert.deepEqual(refreshed.read(scope), command);
    assert.equal(refreshed.read({ ...scope, playerId: v.parse(PlayerIdSchema, 'other_player') }), null);
    assert.equal(refreshed.read({ ...scope, roomId: v.parse(RoomIdSchema, 'other_room') }), null);
    refreshed.save(scope, command);
    assert.throws(() => refreshed.save(scope, { ...command, requestId: v.parse(SpaceCrewStartCommandSchema, { ...start, requestId: 'new-id' }).requestId }));
    refreshed.clear(scope, 'wrong-id'); assert.deepEqual(refreshed.read(scope), command);
    refreshed.clear(scope, command.requestId); assert.equal(outbox.read(scope), null);
  }
});

test('Space Crew outbox rejects corrupt, forged and unwritable storage before sending a new command', () => {
  const storage = new MemoryStorage(), outbox = new SpaceCrewOutbox(storage), key = `${SPACE_CREW_OUTBOX_PREFIX}${scope.roomId}:${scope.playerId}`;
  for (const raw of ['{', JSON.stringify({ ...scope, playerId: 'other_player', command: play }), JSON.stringify({ ...scope, command: { ...play, actorPlayerId: scope.playerId } })]) {
    storage.setItem(key, raw);
    assert.throws(() => outbox.read(scope)); assert.throws(() => outbox.save(scope, start));
    assert.equal(storage.getItem(key), raw);
  }
  const unavailable = new SpaceCrewOutbox({ getItem: () => null, setItem: () => {}, removeItem: () => {} });
  assert.throws(() => unavailable.save(scope, start));
  const denied = new SpaceCrewOutbox({ getItem: () => { throw new Error('denied'); }, setItem: () => {}, removeItem: () => {} });
  assert.throws(() => denied.read(scope));
});

test('Space Crew retains uncertain internal/auth outcomes and clears only definitive rejections', () => {
  assert.equal(spaceCrewRejectionIsDefinitive('INTERNAL_ERROR'), false);
  assert.equal(spaceCrewRejectionIsDefinitive('UNAUTHENTICATED'), false);
  for (const code of ['INVALID_PAYLOAD', 'RULE_VIOLATION', 'STALE_GAME_REVISION', 'INVALID_PHASE', 'HOST_ONLY', 'REQUEST_ID_REUSED'] as const) assert.equal(spaceCrewRejectionIsDefinitive(code), true);
});

test('Space Crew V2 lobby routes to its own screen and capability matches catalog', () => {
  const raw = { snapshotVersion: 2, versions: { roomRevision: 1, presenceVersion: 1 }, serverTime: 100,
    room: { roomId: scope.roomId, roomCode: 'ABC234', gameType: 'SPACE_CREW', phase: 'LOBBY', players: [{ playerId: scope.playerId, nickname: '승무원', isHost: true, connectionStatus: 'CONNECTED' }] },
    self: { playerId: scope.playerId }, game: null };
  const decoded = decodeWebSnapshot(raw); assert.equal(decoded.kind, 'COMPATIBLE');
  if (decoded.kind !== 'COMPATIBLE') throw new Error();
  assert.equal(decoded.value.kind, 'PLATFORM_V2_SPACE_CREW');
  assert.deepEqual(resolveRoomSnapshotView(decoded.value), { kind: 'SPACE_CREW', snapshot: raw });
  assert.equal(projectRoomSnapshotShell(decoded.value).room.gameType, 'SPACE_CREW');
  assert.equal(decodeWebSnapshot({ ...raw, recoveryToken: 'A'.repeat(43) }).kind, 'INCOMPATIBLE');
  assert.ok(WEB_SUPPORTED_GAME_TYPES.includes('SPACE_CREW'));
  assert.ok(GAME_CATALOG.some(game => game.gameType === 'SPACE_CREW'));
});

test('Space Crew saved-room metadata stays separate from campaign recovery and leave describes only the interrupted attempt', () => {
  const tab = new MemoryStorage(), browser = new MemoryStorage(), saved = new SavedGameStorage(tab, browser);
  const parsed = validateBrowserStoredPlayerSession({ protocolVersion: 1, playerId: scope.playerId, credential: { roomCode: 'ABC234', sessionToken: 'opaque-session-for-room' } });
  assert.ok(parsed.ok); if (!parsed.ok) throw new Error();
  assert.equal(saved.save(parsed.value, 'SPACE_CREW'), true);
  assert.equal(new SavedGameStorage(tab, browser).entry()?.gameType, 'SPACE_CREW');
  assert.equal(JSON.stringify(saved.entry()).includes('opaque-session-for-room'), false);
  assert.equal([...browser.values.values()].some(value => value.includes('recoveryToken')), false);
  const message = roomLeaveConfirmationMessage('PLAYING', 'SPACE_CREW');
  assert.match(message, /시도가 중단/); assert.match(message, /캠페인.*보존/); assert.match(message, /새 방/);
});

test('Space Crew outbox validation and storage failures never expose credential-bearing exception details', () => {
  const secret = 'private-recovery-secret-invalid';
  const storage = new MemoryStorage(), outbox = new SpaceCrewOutbox(storage);
  assert.throws(() => outbox.save(scope, { ...start, payload: { kind: 'NEW', mode: 'CAMPAIGN', recoveryToken: secret } }), error => {
    assert.ok(error instanceof Error); assert.doesNotMatch(error.message, /private-recovery-secret/);
    assert.equal(error.message, '요청을 안전하게 저장할 수 없습니다. 저장 공간을 확인해주세요.'); return true;
  });
  outbox.save(scope, start);
  const throwing = new SpaceCrewOutbox({
    getItem: key => storage.getItem(key),
    setItem: () => { throw new Error(secret); },
    removeItem: () => { throw new Error(secret); },
  });
  for (const operation of [() => throwing.save(scope, start), () => throwing.clear(scope, start.requestId)]) {
    assert.throws(operation, error => { assert.ok(error instanceof Error); assert.equal(error.message.includes(secret), false); return true; });
    assert.deepEqual(outbox.read(scope), start);
  }
  let reads = 0;
  const readbackFailure = new SpaceCrewOutbox({
    getItem: key => { if (++reads > 1) throw new Error(secret); return storage.getItem(key); },
    setItem: () => {}, removeItem: () => {},
  });
  assert.throws(() => readbackFailure.clear(scope, start.requestId), error => {
    assert.ok(error instanceof Error); assert.equal(error.message, '이전 요청 저장을 정리할 수 없습니다. 저장 공간을 확인해주세요.'); return true;
  });
});
