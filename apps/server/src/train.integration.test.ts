import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import * as v from "valibot";
import { TRAIN_ROUTES, TRAIN_COLORS, type TrainAction, SUPPORTED_GAME_TYPES, PlatformSnapshotV2Schema, SessionBootstrapAckSchema, StateSyncWireAckSchema, RoomLeaveAckSchema, type GameType, type PlatformSnapshotV2, } from "@hangul-rummikub/shared";
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
    let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: count > 5 ? "WOLF_NIGHT" : "TRAIN" }));
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
function train(snapshot: PlatformSnapshotV2) {
    if (snapshot.game?.gameType !== 'TRAIN')
        throw new Error('Expected Train game.');
    return snapshot.game;
}
type Harness = Awaited<ReturnType<typeof harness>>;
async function start(h: Harness) { const s = await h.sync(); return h.success(await h.call(h.host, 'game:start', {}, { expectedRoomRevision: s.versions.roomRevision })); }
function action(h: Harness, s: PlatformSnapshotV2, payload: unknown) { const g = train(s); if (g.phase !== 'PLAYING')
    throw new Error('Expected playing Train.'); return h.request('train:act', payload, { gameId: g.gameId, expectedGameRevision: g.gameRevision, turnId: g.turnId }); }
async function prepared(h: Harness) { let snapshot = await start(h); while (true) {
    const g = train(snapshot);
    if (g.phase !== 'PLAYING' || g.step !== 'SETUP')
        return snapshot;
    const member = h.members.find(m => m.playerId === g.activePlayerId)!, own = await h.sync(member.client), pending = train(own).privateState.pendingTickets;
    snapshot = h.success(await h.send(member.client, action(h, own, { kind: 'KEEP_TICKETS', keepCardIds: pending.slice(0, 2).map(t => t.cardId), returnCardIds: pending.slice(2).map(t => t.cardId) })));
} }
test('TRAIN socket: 2–5 seats, capacity/switch, initialization and no deadline', async (t) => {
    const one = await harness(t, 1), single = await one.sync();
    assert.equal(one.failure(await one.call(one.host, 'game:start', {}, { expectedRoomRevision: single.versions.roomRevision })), 'NOT_ENOUGH_PLAYERS');
    for (const n of [2, 3, 4, 5]) {
        const h = await harness(t, n), s = await start(h), g = train(s);
        assert.equal(g.playerStates.length, n);
        assert.equal(g.privateState.hand.length, 4);
        assert.equal(g.privateState.pendingTickets.length, 3);
        assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(d => d.roomId === s.room.roomId), false);
    }
    const h = await harness(t, 6), s = h.success(await h.send(h.host, h.selection(await h.sync(), 'TRAIN')));
    assert.equal(s.room.players.length, 6);
    assert.equal(h.failure(await h.call(h.host, 'game:start', {}, { expectedRoomRevision: s.versions.roomRevision })), 'NOT_ENOUGH_PLAYERS');
});
test('TRAIN socket: opaque private cards, auth actor, invalid IDs and payload leave state untouched', async (t) => {
    const h = await harness(t), s = await prepared(h), g = train(s);
    assert.ok(g.phase === 'PLAYING');
    const actor = h.members.find(m => m.playerId === g.activePlayerId)!, other = h.members.find(m => m !== actor)!, own = await h.sync(actor.client), foreign = train(await h.sync(other.client));
    for (const c of [...foreign.privateState.hand, ...foreign.privateState.tickets])
        assert.equal(JSON.stringify(own).includes(c.cardId), false);
    const before = await h.server.runtime.persistence.findById(s.room.roomId);
    assert.equal(h.failure(await h.send(other.client, action(h, own, { kind: 'DRAW_DECK' }))), 'NOT_YOUR_TURN');
    for (const cardId of ['missing', foreign.privateState.hand[0]!.cardId])
        assert.equal(h.failure(await h.send(actor.client, action(h, own, { kind: 'DRAW_MARKET', cardId }))), 'RULE_VIOLATION');
    assert.equal(h.failure(await h.send(actor.client, action(h, own, { kind: 'DRAW_DECK', extra: true }))), 'INVALID_PAYLOAD');
    assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId), before);
});
test('TRAIN socket: duplicate draw commits once, stale revisions and reused request IDs rejected', async (t) => {
    const h = await harness(t), s = await prepared(h), g = train(s);
    assert.ok(g.phase === 'PLAYING');
    const actor = h.members.find(m => m.playerId === g.activePlayerId)!, own = await h.sync(actor.client), command = action(h, own, { kind: 'DRAW_DECK' }), before = train(own).privateState.hand.length;
    const replies = await Promise.all([h.send(actor.client, command), h.send(actor.client, command)]);
    for (const raw of replies) {
        const next = train(h.success(raw));
        assert.equal(next.gameRevision, g.gameRevision + 1);
        assert.equal(next.privateState.hand.length, before + 1);
    }
    assert.equal(h.failure(await h.send(actor.client, { ...command, payload: { kind: 'DRAW_TICKETS' } })), 'REQUEST_ID_REUSED');
    assert.equal(h.failure(await h.send(actor.client, action(h, own, { kind: 'DRAW_DECK' }))), 'STALE_GAME_REVISION');
    const fresh = await h.sync(actor.client), race = await Promise.all([h.send(actor.client, action(h, fresh, { kind: 'DRAW_DECK' })), h.send(actor.client, action(h, fresh, { kind: 'DRAW_DECK' }))]);
    assert.equal(race.filter(raw => v.parse(StateSyncWireAckSchema, raw).ok).length, 1);
    assert.equal(train(await h.sync()).gameRevision, g.gameRevision + 2);
});
test('TRAIN socket: reconnect after first draw preserves second selection and primary; leave cancels and same room switches', async (t) => {
    const h = await harness(t), s = await prepared(h), g = train(s);
    assert.ok(g.phase === 'PLAYING');
    const member = h.members.find(m => m.playerId === g.activePlayerId)!, own = await h.sync(member.client), after = h.success(await h.send(member.client, action(h, own, { kind: 'DRAW_DECK' }))), before = train(after);
    assert.ok(before.phase === 'PLAYING');
    assert.equal(before.step, 'DRAW_SECOND');
    const replacement = await h.connect(), resumed = h.success(await h.call(replacement, 'session:resume', { credential: { ...member.credential, roomCode: s.room.roomCode }, lastSeenVersions: null })), restored = train(resumed);
    assert.ok(restored.phase === 'PLAYING');
    assert.equal(restored.step, 'DRAW_SECOND');
    assert.deepEqual(restored.privateState, before.privateState);
    assert.equal(restored.turnId, before.turnId);
    const second = h.success(await h.send(replacement, action(h, resumed, { kind: 'DRAW_DECK' })));
    assert.equal(train(second).gameRevision, before.gameRevision + 1);
    const latest = h.success(await h.call(replacement, 'state:sync')), left = v.parse(RoomLeaveAckSchema, await h.call(replacement, 'room:leave', {}, { expectedRoomRevision: latest.versions.roomRevision, expectedGameRevision: train(latest).gameRevision }));
    assert.ok(left.ok);
    const remaining = h.members.find(m => m !== member)!, ended = await h.sync(remaining.client), end = train(ended);
    assert.ok(end.phase === 'FINISHED');
    assert.equal(end.result.reason, 'CANCELLED');
    assert.deepEqual(end.result.winnerPlayerIds, []);
    const reset = h.success(await h.send(remaining.client, h.selection(ended, 'TRAIN')));
    assert.equal(reset.room.phase, 'LOBBY');
    assert.equal(reset.room.roomCode, s.room.roomCode);
    const switchGame = h.success(await h.send(remaining.client, h.selection(reset, 'JAIPUR')));
    assert.equal(switchGame.room.gameType, 'JAIPUR');
});
test('TRAIN socket: destination offer persists across reconnect without exposing tickets to another player', async (t) => {
    const h = await harness(t), s = await prepared(h), g = train(s);
    assert.ok(g.phase === 'PLAYING');
    const actor = h.members.find(m => m.playerId === g.activePlayerId)!, other = h.members.find(m => m !== actor)!, own = await h.sync(actor.client), offer = h.success(await h.send(actor.client, action(h, own, { kind: 'DRAW_TICKETS' }))), pending = train(offer).privateState.pendingTickets;
    assert.equal(pending.length, 3);
    const publicView = JSON.stringify(await h.sync(other.client));
    for (const c of pending)
        assert.equal(publicView.includes(c.cardId), false);
    actor.client.disconnect();
    const replacement = await h.connect(), resumed = h.success(await h.call(replacement, 'session:resume', { credential: { ...actor.credential, roomCode: s.room.roomCode }, lastSeenVersions: null }));
    assert.deepEqual(train(resumed).privateState.pendingTickets, pending);
    const chosen = h.success(await h.send(replacement, action(h, resumed, { kind: 'KEEP_TICKETS', keepCardIds: [pending[0]!.cardId], returnCardIds: pending.slice(1).reverse().map(c => c.cardId) })));
    assert.equal(train(chosen).privateState.pendingTickets.length, 0);
    assert.equal(train(chosen).privateState.tickets.length, 3);
});

test('TRAIN socket: complete a real game, publish scoring to both players and start a fresh game', async t => {
    const h = await harness(t);
    let snapshot = await prepared(h), steps = 0;
    const oldId = train(snapshot).gameId;
    while (train(snapshot).phase === 'PLAYING' && steps++ < 1500) {
        const state = train(snapshot);
        assert.ok(state.phase === 'PLAYING');
        const member = h.members.find(m => m.playerId === state.activePlayerId)!;
        const own = await h.sync(member.client), g = train(own);
        assert.ok(g.phase === 'PLAYING');
        const me = g.playerStates.find(p => p.playerId === member.playerId)!;
        let payload: TrainAction | null = null;
        if (g.step === 'TURN') for (const r of [...TRAIN_ROUTES].sort((a,b) => b.length-a.length)) {
            if (r.length > me.trains || g.claims.some(c => TRAIN_ROUTES.find(route => route.routeId === c.routeId)!.group === r.group)) continue;
            for (const color of TRAIN_COLORS.filter(c => c !== 'LOCOMOTIVE' && (r.color === 'GRAY' || r.color === c))) {
                const cards = [...g.privateState.hand.filter(c => c.color === color), ...g.privateState.hand.filter(c => c.color === 'LOCOMOTIVE')];
                if (cards.length >= r.length) { payload = {kind:'CLAIM_ROUTE',routeId:r.routeId,cardIds:cards.slice(0,r.length).map(c=>c.cardId)}; break; }
            }
            if (payload) break;
        }
        if (!payload) {
            if (g.deckCount + g.discardCount > 0) payload = {kind:'DRAW_DECK'};
            else {
                const card = g.market.find(c => g.step !== 'DRAW_SECOND' || c.color !== 'LOCOMOTIVE');
                if (card) payload = {kind:'DRAW_MARKET',cardId:card.cardId};
                else if (g.ticketDeckCount > 0) payload = {kind:'DRAW_TICKETS'};
                else payload = {kind:'PASS'};
            }
        }
        if (g.step === 'CHOOSE_TICKETS') payload = {kind:'KEEP_TICKETS',keepCardIds:g.privateState.pendingTickets.map(t=>t.cardId),returnCardIds:[]};
        snapshot = h.success(await h.send(member.client,action(h,own,payload)));
    }
    const ended = train(snapshot);
    assert.ok(ended.phase === 'FINISHED');
    assert.equal(ended.result.reason, 'TRAINS');
    for (const member of h.members) {
        const view = train(await h.sync(member.client));
        assert.ok(view.phase === 'FINISHED');
        assert.deepEqual(view.result, ended.result);
        assert.equal(view.result.scores.length, 2);
        assert.ok(view.result.scores.every(s => s.tickets.length >= 2));
    }
    const lobby = h.success(await h.send(h.host,h.selection(await h.sync(),'TRAIN')));
    assert.equal(lobby.room.phase, 'LOBBY');
    const fresh = train(await start(h));
    assert.notEqual(fresh.gameId,oldId);
    assert.equal(fresh.claims.length,0);
});
