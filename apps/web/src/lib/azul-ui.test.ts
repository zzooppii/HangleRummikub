import assert from "node:assert/strict";
import test from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { parse, safeParse } from "valibot";
import { GameRevisionSchema, TurnIdSchema, AzulPlayingPlatformSnapshotV2Schema, AzulLobbyPlatformSnapshotV2Schema, AzulFinishedPlatformSnapshotV2Schema, AzulTileSchema, AzulClientCommandSchema, type AzulColor } from "@hangul-rummikub/shared";
import { azulTransitionCues, AZUL_SOUND_SCORE } from "../features/azul/sound.js";
import { AzulScreen } from "../features/azul/AzulScreen.js";
import { previewAzul, azulLineReason } from "../features/azul/ui.js";
import { decodeWebSnapshot, type AzulWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { getGameStartControl } from "./game-start.js";
const tile = (color: AzulColor, id: string) => parse(AzulTileSchema, { color, tileId: id });
const players = [{ playerId: 'a', nickname: '하비', isHost: true, connectionStatus: 'CONNECTED' }, { playerId: 'b', nickname: '민지', isHost: false, connectionStatus: 'CONNECTED' }];
function lobby() { return parse(AzulLobbyPlatformSnapshotV2Schema, { snapshotVersion: 2, versions: { roomRevision: 1, presenceVersion: 1 }, serverTime: 1000, self: { playerId: 'a' }, room: { roomId: 'azul-room', roomCode: 'ABCDEF', gameType: 'AZUL', phase: 'LOBBY', players }, game: null }); }
function playing() { const l = lobby(); return parse(AzulPlayingPlatformSnapshotV2Schema, { ...l, room: { ...l.room, phase: 'PLAYING' }, game: {
  gameType: 'AZUL', gameId: 'azul-game', gameRevision: 0, rulesVersion: 'azul-base-v1', phase: 'PLAYING', turnId: 'azul-turn', activePlayerId: 'a', turnStartedAt: 1000, deadlineAt: 31000, round: 1,
  factories: [[tile('BLUE', 't1'), tile('BLUE', 't2'), tile('BLUE', 't3'), tile('RED', 't4')], [], [], [], []], center: [tile('WHITE', 't5'), tile('WHITE', 't6')], firstPlayerId: null, bagCount: 94, discardCount: 0,
  playerStates: players.map(p => ({ playerId: p.playerId, score: 0, patternLines: [[], [], [], [], []], wall: Array.from({ length: 5 }, () => Array(5).fill(null)), floor: [] })), lastRound: null, feedback: null,
} }); }
function render(snapshot: AzulWebSnapshot) { return renderToStaticMarkup(createElement(AzulScreen, { snapshot, connected: true, pending: false, error: null, connectionLabel: '서버 연결됨', onCommand: async () => {}, onRematch() {}, onStart() {}, onLeave() {}, onCopy() {} })); }
test('Azul UI: lobby/playing/finished decode to concrete screens with public opponent boards', () => {
  const l = lobby(), p = playing(); const { phase: _phase, turnId: _turn, activePlayerId: _active, turnStartedAt: _started, deadlineAt: _deadline, ...base } = p.game;
  const f = parse(AzulFinishedPlatformSnapshotV2Schema, { ...p, room: { ...p.room, phase: 'FINISHED' }, game: { ...base, phase: 'FINISHED', result: { reason: 'CANCELLED', winnerPlayerIds: [], scores: [] } } });
  for (const s of [l, p, f]) { const d = decodeWebSnapshot(s); assert.equal(d.kind, 'COMPATIBLE'); if (d.kind !== 'COMPATIBLE') throw new Error(); assert.equal(resolveRoomSnapshotView(d.value).kind, 'AZUL'); assert.match(render(s), /AZUL/); }
  assert.match(render(l), /아줄 시작하기/); assert.match(render(p), /코발트 3개 선택/); assert.match(render(p), /민지/); assert.match(render(p), /벽 펼치기/); assert.match(render(f), /이번 게임이 취소/);
  assert.equal(getGameStartControl(l, false).canStart, true);
});
test('Azul UI: preview groups one source and shows overflow, completion and first-marker penalty', () => {
  const g = playing().game, s = { source: { kind: 'FACTORY' as const, index: 0 }, color: 'BLUE' as const };
  const p = previewAzul(g, 'a', s, 1); assert.equal(p.count, 3); assert.equal(p.placed, 2); assert.equal(p.dropped, 1); assert.equal(p.penalty, 1); assert.equal(p.completes, true); assert.equal(p.takesFirst, false);
  const center = previewAzul(g, 'a', { source: { kind: 'CENTER' }, color: 'WHITE' }, 0); assert.equal(center.takesFirst, true); assert.equal(center.placed, 1); assert.equal(center.dropped, 1); assert.equal(center.penalty, 2);
  assert.equal(previewAzul(g, 'a', s, 'FLOOR').penalty, 4); assert.equal(previewAzul(g, 'a', s, null).action, null); assert.equal(previewAzul(g, 'a', null, 0).action, null);
});
test('Azul UI: illegal row reasons and capped floor penalty are explicit', () => {
  const g = playing().game, p = g.playerStates[0]!; p.patternLines[1] = [tile('RED', 'existing')]; p.patternLines[0] = [tile('BLUE', 'complete')]; p.wall[3]![3] = tile('BLUE', 'on-wall');
  assert.match(azulLineReason(p, 'BLUE', 1)!, /다른 색/); assert.match(azulLineReason(p, 'BLUE', 0)!, /완성/); assert.match(azulLineReason(p, 'BLUE', 3)!, /같은 색/);
  const selection = { source: { kind: 'FACTORY' as const, index: 0 }, color: 'BLUE' as const }; assert.equal(previewAzul(g, 'a', selection, 1).action, null);
  p.floor = Array.from({ length: 7 }, (_, i) => tile('RED', `floor-${i}`)); assert.equal(previewAzul(g, 'a', selection, 'FLOOR').penalty, 0);
});
test('Azul DTO: rejects forged counts, missing identity, duplicate tiles, mismatched roster and hidden data', () => {
  const c = { kind: 'azul:act', protocolVersion: 1, requestId: 'r1', gameId: 'g1', turnId: 't1', expectedGameRevision: 0, payload: { source: { kind: 'CENTER' }, color: 'BLUE', destination: 'FLOOR' } };
  assert.equal(safeParse(AzulClientCommandSchema, c).success, true);
  for (const bad of [{ ...c, turnId: undefined }, { ...c, expectedGameRevision: -1 }, { ...c, payload: { ...c.payload, count: 1 } }, { ...c, payload: { ...c.payload, source: { kind: 'FACTORY', index: 9 } } }]) assert.equal(safeParse(AzulClientCommandSchema, bad).success, false);
  const s = playing(), g = s.game;
  for (const game of [{ ...g, activePlayerId: 'outsider' }, { ...g, factories: [[g.factories[0]![0], g.factories[0]![0]], [], [], [], []], bagCount: 96 }, { ...g, playerStates: [g.playerStates[0], g.playerStates[0]] }, { ...g, bag: ['hidden-id'] }, { ...g, bagCount: 100 }]) assert.equal(safeParse(AzulPlayingPlatformSnapshotV2Schema, { ...s, game }).success, false);
});

test('Azul UI: own turn is prominent, countdown and sound settings are accessible; opponent turn is distinct',()=>{
  const s=playing(), own=render(s); assert.match(own,/지금, 내 차례입니다!/);assert.match(own,/az-my-turn-screen/);assert.match(own,/남은 시간 30초/);assert.match(own,/효과음 볼륨/);assert.match(own,/소리 들어보기/);
  const other=parse(AzulPlayingPlatformSnapshotV2Schema,{...s,self:{playerId:'b'}}), html=render(other);
  assert.doesNotMatch(html,/az-my-turn-screen/);assert.match(html,/하비님의 차례/);
  assert.equal(safeParse(AzulPlayingPlatformSnapshotV2Schema,{...s,game:{...s.game,deadlineAt:30999}}).success,false);
});
test('Azul sound: server revisions trigger placement once; round and turn cues are ordered; resume does not replay history',()=>{
  const g=playing().game;
  assert.deepEqual(azulTransitionCues(g,g,'a'),[]);
  assert.deepEqual(azulTransitionCues(null,g,'a'),['TURN']);
  const n=parse(AzulPlayingPlatformSnapshotV2Schema,{...playing(),game:{...g,gameRevision:1,turnId:'next',activePlayerId:'b',feedback:{playerId:'a',color:'BLUE',source:{kind:'FACTORY',index:0},destination:2,count:3,placed:3,dropped:0,tookFirstPlayer:false,automatic:false,at:2000}}}).game;
  assert.deepEqual(azulTransitionCues(g,n,'b'),['PLACE','TURN']);
  assert.deepEqual(azulTransitionCues(n,structuredClone(n),'b'),[]);
  assert.deepEqual(azulTransitionCues(n,{...n,gameRevision:parse(GameRevisionSchema,2),turnId:parse(TurnIdSchema,'third'),lastRound:{round:1,scores:[]}},'b'),['ROUND','TURN']);
  for(const notes of Object.values(AZUL_SOUND_SCORE)){assert.ok(notes.length>0);for(const note of notes){assert.ok(note.gain<=.34);assert.ok(note.decay<=.65);assert.ok(note.pitch>0 && note.pitch<2000);}}
});
