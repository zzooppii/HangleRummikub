import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import * as v from "valibot";
import {
  SUPPORTED_GAME_TYPES, PlatformSnapshotV2Schema, SessionBootstrapAckSchema,
  ServerTimeSchema, StateSyncWireAckSchema, RoomLeaveAckSchema, type GameType, type PlatformSnapshotV2,
} from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";

type Client = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
type Command = { kind: string; protocolVersion: number; requestId: string; payload: unknown; [key: string]: unknown };
async function harness(t: TestContext, count = 2) {
  const server = createHttpServer({ serveWeb: false }), clients: Client[] = [];
  t.after(async () => { clients.forEach(c => c.disconnect()); await server.shutdown(); });
  await new Promise<void>(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
  const address = server.httpServer.address(); assert.ok(address && typeof address !== "string");
  const port = address.port;
  let seq = 0;
  const request = (kind: string, payload: unknown = {}, extra: Record<string, unknown> = {}): Command => ({ kind, protocolVersion: 1, requestId: `room-prepare-${++seq}`, payload, ...extra });
  async function connect(types: readonly GameType[] = SUPPORTED_GAME_TYPES) {
    const client: Client = io(`http://127.0.0.1:${port}`, { transports: ["websocket"], forceNew: true, reconnection: false, auth: { supportsRoomPreparation: true, supportedSnapshotVersions: [2], supportedGameTypes: types } });
    clients.push(client);
    await new Promise<void>((resolve, reject) => { client.once("connect", resolve); client.once("connect_error", reject); });
    return client;
  }
  const send = (client: Client, command: Command) => new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Missing ${command.kind} acknowledgement`)), 5000);
    client.emit(command.kind, command, value => { clearTimeout(timer); resolve(value); });
  });
  const call = (client: Client, kind: string, payload: unknown = {}, extra: Record<string, unknown> = {}) => send(client, request(kind, payload, extra));
  const success = (raw: unknown) => { const ack = v.parse(StateSyncWireAckSchema, raw); assert.ok(ack.ok, ack.ok ? "" : JSON.stringify(ack.error)); return v.parse(PlatformSnapshotV2Schema, ack.data.snapshot); };
  const failure = (raw: unknown) => { const ack = v.parse(StateSyncWireAckSchema, raw); assert.equal(ack.ok, false); if (ack.ok) throw new Error("Expected failure"); return ack.error.code; };
  const bootstrap = async (client: Client) => { const ack = v.parse(SessionBootstrapAckSchema, await call(client, "session:bootstrap")); assert.ok(ack.ok); return ack.data.credential; };
  const host = await connect(), hostCredential = await bootstrap(host);
  let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: count > 2 ? "WOLF_NIGHT" : "GURYONGTU" }));
  const members = [{ client: host, credential: hostCredential, playerId: lobby.self.playerId }];
  for (let i = 1; i < count; i++) {
    const client = await connect(), credential = await bootstrap(client);
    lobby = success(await call(client, "room:join", { bootstrapCredential: credential, nickname: `참가${i}`, roomCode: lobby.room.roomCode }));
    members.push({ client, credential, playerId: lobby.self.playerId });
  }
  const sync = async (client = host) => success(await call(client, "state:sync"));
  function selection(snapshot: PlatformSnapshotV2, gameType: GameType): Command {
    const game = snapshot.game;
    return request("room:selectGame", { gameType, gameId: game === null ? null : "gameId" in game ? game.gameId : game.publicState.gameId }, {
      expectedRoomRevision: snapshot.versions.roomRevision, expectedGameRevision: game?.gameRevision ?? null,
    });
  }
  async function readyAll() {
    for (const member of members) {
      const current = await sync(member.client);
      success(await call(member.client, "room:ready", { ready: true }, { expectedRoomRevision: current.versions.roomRevision }));
    }
    return sync();
  }
  return { server, host, members, lobby, connect, bootstrap, request, send, call, success, failure, sync, selection, readyAll };
}

function guryongtu(snapshot: PlatformSnapshotV2) {
  if(snapshot.game?.gameType!=='GURYONGTU')throw new Error('Expected Guryongtu game.');
  return snapshot.game;
}
type Harness=Awaited<ReturnType<typeof harness>>;
async function start(h:Harness){const s=await h.sync();return h.success(await h.call(h.host,'game:start',{}, {expectedRoomRevision:s.versions.roomRevision}));}
function action(h:Harness,s:PlatformSnapshotV2,payload:unknown){const g=guryongtu(s);if(g.phase!=='PLAYING')throw new Error('Expected playing Guryongtu.');return h.request('guryongtu:act',payload,{gameId:g.gameId,expectedGameRevision:g.gameRevision,turnId:g.turnId});}

test('GURYONGTU admission and capabilities: exactly two and preserved oversized lobby', async t => {
  const single = await harness(t, 1), one = await single.sync();
  assert.equal(single.failure(await single.call(single.host, 'game:start', {}, {expectedRoomRevision: one.versions.roomRevision})), 'NOT_ENOUGH_PLAYERS');
  const incompatible = await single.connect(['JAIPUR']), incompatibleToken = await single.bootstrap(incompatible);
  assert.equal(single.failure(await single.call(incompatible, 'room:join', {bootstrapCredential: incompatibleToken, nickname: '구버전', roomCode: single.lobby.room.roomCode})), 'INCOMPATIBLE_GAME_CAPABILITY');
  const h = await harness(t), outsider = await h.connect(), credential = await h.bootstrap(outsider);
  assert.equal(h.failure(await h.call(outsider, 'room:join', {bootstrapCredential: credential, nickname: '셋째', roomCode: h.lobby.room.roomCode})), 'ROOM_FULL');
  const started = await start(h); assert.equal(started.room.phase, 'PLAYING');
  assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(d => d.roomId === started.room.roomId), false);
  const large = await harness(t, 3); const switched = large.success(await large.send(large.host, large.selection(await large.sync(), 'GURYONGTU')));
  assert.equal(switched.room.players.length, 3);
  assert.equal(large.failure(await large.call(large.host, 'game:start', {}, {expectedRoomRevision: switched.versions.roomRevision})), 'NOT_ENOUGH_PLAYERS');
});
test('GURYONGTU real socket privacy, unauthorized IDs, runtime validation and atomic rejection', async t => {
  const h = await harness(t), initial = await start(h), g = guryongtu(initial); if (g.phase !== 'PLAYING') throw new Error();
  const actor = h.members.find(p => p.playerId === g.activePlayerId)!, other = h.members.find(p => p !== actor)!;
  const s = await h.sync(actor.client), own = guryongtu(s), foreign = guryongtu(await h.sync(other.client));
  for (const tile of foreign.privateState.hand) assert.equal(JSON.stringify(own).includes(tile.tileId), false);
  const before = await h.server.runtime.persistence.findById(s.room.roomId);
  for (const tileId of [foreign.privateState.hand[0]!.tileId, 'unknown']) assert.equal(h.failure(await h.send(actor.client, action(h, s, {kind: 'PLAY_TILE', tileId}))), 'RULE_VIOLATION');
  assert.equal(h.failure(await h.send(other.client, action(h, s, {kind: 'PLAY_TILE', tileId: foreign.privateState.hand[0]!.tileId}))), 'NOT_YOUR_TURN');
  assert.equal(h.failure(await h.send(actor.client, action(h, s, {kind: 'PLAY_TILE', tileId: own.privateState.hand[0]!.tileId, rank: 9}))), 'INVALID_PAYLOAD');
  assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId), before);
  const cmd = action(h, s, {kind: 'PLAY_TILE', tileId: own.privateState.hand.find(t => t.rank === 7)!.tileId});
  const results = await Promise.all([h.send(actor.client, cmd), h.send(actor.client, cmd)]);
  results.forEach(h.success);
  const after = guryongtu(await h.sync(other.client)); assert.equal(after.gameRevision, own.gameRevision + 1); assert.equal(after.submitted?.parity, 'ODD'); assert.equal(after.privateState.submitted, null);
  for (const tile of own.privateState.hand) assert.equal(JSON.stringify(after).includes(tile.tileId), false);
  assert.equal(h.failure(await h.send(actor.client, {...cmd, requestId: 'stale-other-request'})), 'STALE_GAME_REVISION');
  assert.equal(h.failure(await h.send(actor.client, {...cmd, payload: {kind: 'PLAY_TILE', tileId: own.privateState.hand[0]!.tileId}})), 'REQUEST_ID_REUSED');
});
test('GURYONGTU reconnect after secret submission, old socket rejection, cancellation and same-room rematch', async t => {
  const h = await harness(t), started = await start(h), g = guryongtu(started); if (g.phase !== 'PLAYING') throw new Error();
  const member = h.members.find(p => p.playerId === g.activePlayerId)!, s = await h.sync(member.client), own = guryongtu(s);
  h.success(await h.send(member.client, action(h, s, {kind: 'PLAY_TILE', tileId: own.privateState.hand.find(t => t.rank === 9)!.tileId})));
  const fresh = await h.connect();
  const resumed = h.success(await h.call(fresh, 'session:resume', {credential: {...member.credential, roomCode: s.room.roomCode}, lastSeenVersions: null}));
  assert.equal(h.failure(await h.send(member.client, action(h, resumed, {kind: 'PLAY_TILE', tileId: own.privateState.hand[0]!.tileId}))), 'UNAUTHENTICATED');
  assert.equal(resumed.self.playerId, member.playerId); assert.equal(guryongtu(resumed).privateState.submitted?.rank, 9); assert.equal(guryongtu(resumed).privateState.hand.length, 8);
  const current = await h.sync(fresh);
  const leave = v.parse(RoomLeaveAckSchema, await h.call(fresh, 'room:leave', {}, {expectedRoomRevision: current.versions.roomRevision, expectedGameRevision: current.game?.gameRevision})); assert.ok(leave.ok);
  const remaining = h.members.find(p => p !== member)!; const finished = await h.sync(remaining.client);
  assert.equal(finished.room.phase, 'FINISHED'); const fg = guryongtu(finished); assert.equal(fg.phase, 'FINISHED'); if (fg.phase !== 'FINISHED') throw new Error(); assert.equal(fg.result.reason, 'CANCELLED');
  assert.equal(JSON.stringify(fg).includes(own.privateState.hand.find(t => t.rank === 9)!.tileId), false);
  const lobby = h.success(await h.send(remaining.client, h.selection(finished, 'GURYONGTU'))); assert.equal(lobby.room.roomCode, s.room.roomCode); assert.equal(lobby.game, null); assert.equal(lobby.room.players.length, 1);
});
test('GURYONGTU complete tied set and two-win match, simultaneous confirmations and stale game identity', async t => {
  const h = await harness(t); let s = await start(h);
  const firstId = guryongtu(s).gameId;
  async function duel(a: number, b: number) {
    for (let i = 0; i < 2; i++) {
      const g = guryongtu(s); if (g.phase !== 'PLAYING') throw new Error();
      const index = h.members.findIndex(p => p.playerId === g.activePlayerId), member = h.members[index]!;
      const own = await h.sync(member.client), hand = guryongtu(own).privateState.hand;
      s = h.success(await h.send(member.client, action(h, own, {kind: 'PLAY_TILE', tileId: hand.find(t => t.rank === (index === 0 ? a : b))!.tileId})));
    }
  }
  async function confirm() {
    const g = guryongtu(s); assert.equal(g.phase, 'ROUND_RESULT');
    const calls = h.members.map(p => h.call(p.client, 'guryongtu:nextRound', {}, {gameId: g.gameId, roundId: g.roundId, expectedGameRevision: g.gameRevision}));
    const results = (await Promise.all(calls)).map(raw => v.parse(StateSyncWireAckSchema, raw)); assert.equal(results.filter(r => r.ok).length, 1);
    const loser = h.members[results.findIndex(r => !r.ok)]!, current = await h.sync(loser.client), cg = guryongtu(current);
    s = h.success(await h.call(loser.client, 'guryongtu:nextRound', {}, {gameId: cg.gameId, roundId: cg.roundId, expectedGameRevision: cg.gameRevision}));
  }
  for (let rank = 1; rank <= 9; rank++) await duel(rank, rank);
  assert.ok(guryongtu(s).playerStates.every(p => p.matchWins === 0)); await confirm();
  for (let round = 0; round < 2; round++) {
    for (const [a, b] of [[5, 2], [6, 3], [7, 4], [8, 5], [9, 6]]) await duel(a!, b!);
    if (round === 0) await confirm();
  }
  assert.equal(s.room.phase, 'FINISHED'); const g = guryongtu(s); if (g.phase !== 'FINISHED') throw new Error(); assert.deepEqual(g.result.winnerPlayerIds, [h.members[0]!.playerId]);
  const guest = h.members[1]!; h.host.disconnect(); await h.sync(guest.client);
  const at = h.server.runtime.clock.now(); t.mock.method(h.server.runtime.clock, 'now', () => v.parse(ServerTimeSchema, at + 61_000));
  assert.equal(await h.server.runtime.guryongtuHostSuccession!.evaluate(s.room.roomId), true);
  const inherited = await h.sync(guest.client); assert.equal(inherited.room.players.find(p => p.isHost)?.playerId, guest.playerId);
  s = h.success(await h.send(guest.client, h.selection(inherited, 'GURYONGTU')));
  const replacement = await h.connect(); h.success(await h.call(replacement, 'session:resume', {credential: {...h.members[0]!.credential, roomCode: s.room.roomCode}, lastSeenVersions: null}));
  const before = await h.sync(guest.client); s = h.success(await h.call(guest.client, 'game:start', {}, {expectedRoomRevision: before.versions.roomRevision})); assert.notEqual(guryongtu(s).gameId, firstId);
  assert.equal(h.failure(await h.call(guest.client, 'guryongtu:nextRound', {}, {gameId: firstId, roundId: g.roundId, expectedGameRevision: g.gameRevision})), 'STALE_GAME_REVISION');
});
