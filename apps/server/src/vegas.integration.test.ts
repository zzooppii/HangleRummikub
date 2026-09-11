import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import * as v from "valibot";
import { SUPPORTED_GAME_TYPES, PlatformSnapshotV2Schema, SessionBootstrapAckSchema, StateSyncWireAckSchema, RoomLeaveAckSchema, type GameType, type PlatformSnapshotV2, ServerTimeSchema, } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
type Client = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
type Command = {
    kind: string;
    protocolVersion: number;
    requestId: string;
    payload: unknown;
    [key: string]: unknown;
};
async function harness(t: TestContext, count = 2) {
    const server = createHttpServer({ serveWeb: false }), clients: Client[] = [];
    t.after(async () => { clients.forEach(c => c.disconnect()); await server.shutdown(); });
    await new Promise<void>(resolve => server.httpServer.listen(0, "127.0.0.1", resolve));
    const address = server.httpServer.address();
    assert.ok(address && typeof address !== "string");
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
    const failure = (raw: unknown) => { const ack = v.parse(StateSyncWireAckSchema, raw); assert.equal(ack.ok, false); if (ack.ok)
        throw new Error("Expected failure"); return ack.error.code; };
    const bootstrap = async (client: Client) => { const ack = v.parse(SessionBootstrapAckSchema, await call(client, "session:bootstrap")); assert.ok(ack.ok); return ack.data.credential; };
    const host = await connect(), hostCredential = await bootstrap(host);
    let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: count > 5 ? "WOLF_NIGHT" : "VEGAS" }));
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
function vegas(s: PlatformSnapshotV2) { if (s.game?.gameType !== 'VEGAS')
    throw new Error('Expected Vegas'); return s.game; }
type Harness = Awaited<ReturnType<typeof harness>>;
async function start(h: Harness) { const s = await h.sync(); return h.success(await h.call(h.host, 'game:start', {}, { expectedRoomRevision: s.versions.roomRevision })); }
function action(h: Harness, s: PlatformSnapshotV2, payload: unknown) { const g = vegas(s); if (g.phase !== 'PLAYING')
    throw new Error(); return h.request('vegas:act', payload, { gameId: g.gameId, expectedGameRevision: g.gameRevision, turnId: g.turnId }); }
test('VEGAS socket admission: 2–5 players start, 1/6 rejected, full room rejected', async (t) => {
    for (const n of [2, 3, 4, 5]) {
        const h = await harness(t, n), g = vegas(await start(h));
        assert.equal(g.playerStates.length, n);
        assert.equal(g.phase, 'PLAYING');
    }
    const h = await harness(t, 1), s = await h.sync();
    assert.equal(h.failure(await h.call(h.host, 'game:start', {}, { expectedRoomRevision: s.versions.roomRevision })), 'NOT_ENOUGH_PLAYERS');
    const large = await harness(t, 6), selected = large.success(await large.send(large.host, large.selection(await large.sync(), 'VEGAS')));
    assert.equal(large.failure(await large.call(large.host, 'game:start', {}, { expectedRoomRevision: selected.versions.roomRevision })), 'NOT_ENOUGH_PLAYERS');
    const full = await harness(t, 5), c = await full.connect(), credential = await full.bootstrap(c);
    assert.equal(full.failure(await full.call(c, 'room:join', { bootstrapCredential: credential, nickname: '초과', roomCode: full.lobby.room.roomCode })), 'ROOM_FULL');
});
test('VEGAS socket: actor, injection, invalid stage, stale scope rejected without commit', async (t) => {
    const h = await harness(t), s = await start(h), g = vegas(s);
    if (g.phase !== 'PLAYING')
        throw new Error();
    const actor = h.members.find(p => p.playerId === g.activePlayerId)!, other = h.members.find(p => p !== actor)!, before = await h.server.runtime.persistence.findById(s.room.roomId);
    assert.equal(h.failure(await h.send(other.client, action(h, s, { kind: 'ROLL' }))), 'NOT_YOUR_TURN');
    assert.equal(h.failure(await h.send(actor.client, action(h, s, { kind: 'ROLL', rolled: [6, 6] }))), 'INVALID_PAYLOAD');
    assert.equal(h.failure(await h.send(actor.client, action(h, s, { kind: 'PLACE', face: 1 }))), 'RULE_VIOLATION');
    assert.equal(h.failure(await h.send(actor.client, { ...action(h, s, { kind: 'ROLL' }), turnId: 'past-turn' })), 'STALE_GAME_REVISION');
    assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId), before);
});
test('VEGAS socket: roll stored exactly once, double roll rejected, deadline retained, concurrent place commits once', async (t) => {
    const h = await harness(t), s = await start(h), g = vegas(s);
    if (g.phase !== 'PLAYING')
        throw new Error();
    const actor = h.members.find(p => p.playerId === g.activePlayerId)!, c = action(h, s, { kind: 'ROLL' }), rolled = h.success(await h.send(actor.client, c)), r = vegas(rolled);
    if (r.phase !== 'PLAYING')
        throw new Error();
    assert.equal(r.rolled.length, 8);
    assert.equal(r.turnId, g.turnId);
    assert.equal(r.deadlineAt, g.deadlineAt);
    assert.equal(r.gameRevision, g.gameRevision + 1);
    const before = await h.server.runtime.persistence.findById(s.room.roomId);
    h.success(await h.send(actor.client, c));
    assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId), before);
    assert.equal(h.failure(await h.send(actor.client, action(h, rolled, { kind: 'ROLL' }))), 'RULE_VIOLATION');
    assert.equal(h.failure(await h.send(actor.client, { ...c, payload: { kind: 'PLACE', face: r.rolled[0] } })), 'REQUEST_ID_REUSED');
    const results = await Promise.all([h.send(actor.client, action(h, rolled, { kind: 'PLACE', face: r.rolled[0] })), h.send(actor.client, action(h, rolled, { kind: 'PLACE', face: r.rolled[0] }))]);
    assert.equal(results.filter(x => v.parse(StateSyncWireAckSchema, x).ok).length, 1);
    const after = vegas(await h.sync());
    assert.equal(after.gameRevision, r.gameRevision + 1);
});
test('VEGAS socket: resume preserves roll, old connection cannot act, missing capability rejected', async (t) => {
    const h = await harness(t), s = await start(h), g = vegas(s);
    if (g.phase !== 'PLAYING')
        throw new Error();
    const actor = h.members.find(p => p.playerId === g.activePlayerId)!;
    const r = vegas(h.success(await h.send(actor.client, action(h, s, { kind: 'ROLL' }))));
    const credential = { ...actor.credential, roomCode: s.room.roomCode };
    const replacement = await h.connect();
    const resumed = h.success(await h.call(replacement, 'session:resume', { credential, lastSeenVersions: null }));
    assert.deepEqual(vegas(resumed), r);
    const old = await h.call(actor.client, 'state:sync');
    assert.equal(v.parse(StateSyncWireAckSchema, old).ok, false);
    const unsupported = await h.connect(['AZUL']), boot = await h.bootstrap(unsupported);
    assert.equal(h.failure(await h.call(unsupported, 'room:join', { bootstrapCredential: boot, nickname: '구버전', roomCode: s.room.roomCode })), 'INCOMPATIBLE_GAME_CAPABILITY');
});
test('VEGAS socket: full match, private balances, final scores, restart and game switch', async (t) => {
    const h = await harness(t, 3);
    let s = await start(h);
    let guard = 0;
    while (vegas(s).phase === 'PLAYING' && guard++ < 210) {
        const g = vegas(s);
        if (g.phase !== 'PLAYING')
            break;
        const member = h.members.find(p => p.playerId === g.activePlayerId)!;
        s = h.success(await h.send(member.client, action(h, s, g.turnStage === 'AWAITING_ROLL' ? { kind: 'ROLL' } : { kind: 'PLACE', face: g.rolled[0] })));
        const room = await h.server.runtime.persistence.findById(s.room.roomId);
        assert.ok(room?.gameType === 'VEGAS' && room.game);
        for (const m of h.members) {
            const view = vegas(await h.sync(m.client));
            assert.deepEqual(view.ownBanknotes, room.game.state.players.find(p => p.playerId === m.playerId)!.banknotes);
            assert.equal(view.viewerPlayerId, m.playerId);
            assert.equal('deck' in view, false);
            assert.ok(view.playerStates.every(p => !('banknotes' in p) && !('total' in p)));
        }
    }
    const final = vegas(s);
    assert.equal(final.phase, 'FINISHED');
    if (final.phase !== 'FINISHED')
        throw new Error();
    assert.equal(final.result.reason, 'FOUR_ROUNDS');
    assert.equal(final.result.scores.length, 3);
    const reset = h.success(await h.send(h.host, h.selection(await h.sync(), 'VEGAS')));
    assert.equal(reset.room.roomCode, s.room.roomCode);
    assert.equal(reset.game, null);
    const second = await start(h);
    assert.notEqual(vegas(second).gameId, final.gameId);
    const left = v.parse(RoomLeaveAckSchema, await h.call(h.members[1]!.client, 'room:leave', {}, { expectedRoomRevision: second.versions.roomRevision, expectedGameRevision: vegas(second).gameRevision }));
    assert.ok(left.ok);
    const cancelled = vegas(await h.sync());
    assert.equal(cancelled.phase, 'FINISHED');
    if (cancelled.phase === 'FINISHED')
        assert.equal(cancelled.result.reason, 'CANCELLED');
    const switched = h.success(await h.send(h.host, h.selection(await h.sync(), 'AZUL')));
    assert.equal(switched.room.gameType, 'AZUL');
    assert.equal(switched.room.roomCode, s.room.roomCode);
});
test("VEGAS timer: server deadline survives resume; premature/stale callbacks do nothing; expired command and racing timeouts commit once", async (t) => {
    const h = await harness(t), s = await start(h), g = vegas(s);
    assert.equal(g.phase, 'PLAYING');
    if (g.phase !== 'PLAYING')
        throw new Error();
    assert.equal(g.deadlineAt - g.turnStartedAt, 30000);
    const service = h.server.runtime.vegasService!;
    const deadline = (await h.server.runtime.persistence.listActiveTurnDeadlines()).find(d => d.roomId === s.room.roomId)!;
    assert.ok(deadline);
    const before = await h.server.runtime.persistence.findById(s.room.roomId);
    assert.deepEqual(await service.timeout(deadline), { status: 'NO_OP' });
    assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId), before);
    const actor = h.members.find(m => m.playerId === g.activePlayerId)!, replacement = await h.connect();
    const resumed = h.success(await h.call(replacement, 'session:resume', { credential: { ...actor.credential, roomCode: s.room.roomCode }, lastSeenVersions: null }));
    const restored = vegas(resumed);
    if (restored.phase !== 'PLAYING')
        throw new Error();
    assert.equal(restored.deadlineAt, g.deadlineAt);
    assert.equal(restored.turnId, g.turnId);
    assert.deepEqual(restored.rolled, g.rolled);
    t.mock.method(h.server.runtime.clock, 'now', () => v.parse(ServerTimeSchema, g.deadlineAt));
    const late = action(h, s, { kind: 'ROLL' });
    assert.equal(h.failure(await h.send(replacement, late)), 'TURN_EXPIRED');
    assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId), before);
    const results = await Promise.all([service.timeout(deadline), service.timeout(deadline), h.send(replacement, { ...late, requestId: 'deadline-race' })]);
    assert.equal(results.slice(0, 2).filter(r => typeof r === 'object' && r !== null && 'status' in r && r.status === 'APPLIED').length, 1);
    const next = vegas(await h.sync(replacement));
    assert.equal(next.gameRevision, g.gameRevision + 1);
    assert.equal(next.feedback?.automatic, true);
    if (next.phase !== 'PLAYING')
        throw new Error();
    assert.equal(next.deadlineAt, g.deadlineAt + 30000);
    assert.notEqual(next.turnId, g.turnId);
    assert.deepEqual(await service.timeout(deadline), { status: 'NO_OP' });
    const active = (await h.server.runtime.persistence.listActiveTurnDeadlines()).find(d => d.roomId === s.room.roomId)!;
    assert.equal(active.turnId, next.turnId);
    assert.equal(active.deadlineAt, next.deadlineAt);
});
test("VEGAS timer: a successful manual command makes its old timeout stale; leaving removes active deadline", async (t) => {
    const h = await harness(t), s = await start(h), g = vegas(s);
    if (g.phase !== 'PLAYING')
        throw new Error();
    const deadline = (await h.server.runtime.persistence.listActiveTurnDeadlines()).find(d => d.roomId === s.room.roomId)!;
    const actor = h.members.find(m => m.playerId === g.activePlayerId)!;
    h.success(await h.send(actor.client, action(h, s, { kind: 'ROLL' })));
    t.mock.method(h.server.runtime.clock, 'now', () => v.parse(ServerTimeSchema, g.deadlineAt));
    assert.deepEqual(await h.server.runtime.vegasService!.timeout(deadline), { status: 'NO_OP' });
    const current = await h.sync();
    const ack = v.parse(RoomLeaveAckSchema, await h.call(h.members[1]!.client, 'room:leave', {}, { expectedRoomRevision: current.versions.roomRevision, expectedGameRevision: vegas(current).gameRevision }));
    assert.ok(ack.ok);
    assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(d => d.roomId === s.room.roomId), false);
});
