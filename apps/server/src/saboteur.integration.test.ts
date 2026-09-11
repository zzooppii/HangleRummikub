import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import * as v from "valibot";
import { StateSnapshotWireEventSchema, ServerTimeSchema, SUPPORTED_GAME_TYPES, PlatformSnapshotV2Schema, SessionBootstrapAckSchema, StateSyncWireAckSchema, RoomLeaveAckSchema, type GameType, type PlatformSnapshotV2, } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
type Client = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
type Command = {
    kind: string;
    protocolVersion: number;
    requestId: string;
    payload: unknown;
    [key: string]: unknown;
};
async function harness(t: TestContext, count = 3) {
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
    let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: "SABOTEUR" }));
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
function sab(snapshot: PlatformSnapshotV2) { if (snapshot.game?.gameType !== 'SABOTEUR')
    throw new Error('Expected Saboteur'); return snapshot.game; }
type Harness = Awaited<ReturnType<typeof harness>>;
async function start(h: Harness) { const s = await h.sync(); return h.success(await h.call(h.host, 'game:start', {}, { expectedRoomRevision: s.versions.roomRevision })); }
function action(h: Harness, s: PlatformSnapshotV2, payload: unknown) { const g = sab(s); if (!('turnId' in g))
    throw new Error('Expected action phase'); return h.request('saboteur:act', payload, { gameId: g.gameId, expectedGameRevision: g.gameRevision, turnId: g.turnId }); }
test('SABOTEUR socket admission supports 3/6/10, rejects too few, full room and incompatible capability', async (t) => {
    const two = await harness(t, 2), l = await two.sync();
    assert.equal(two.failure(await two.call(two.host, 'game:start', {}, { expectedRoomRevision: l.versions.roomRevision })), 'NOT_ENOUGH_PLAYERS');
    for (const count of [3, 6, 10]) {
        const h = await harness(t, count);
        if (count === 10) {
            const extra = await h.connect(), credential = await h.bootstrap(extra);
            assert.equal(h.failure(await h.call(extra, 'room:join', { bootstrapCredential: credential, nickname: '열한번째', roomCode: h.lobby.room.roomCode })), 'ROOM_FULL');
        }
        const s = await start(h);
        assert.equal(sab(s).playerStates.length, count);
        assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(d => d.roomId === s.room.roomId), true);
    }
    const h = await harness(t), old = await h.connect(['JAIPUR']), credential = await h.bootstrap(old);
    assert.equal(h.failure(await h.call(old, 'room:join', { bootstrapCredential: credential, nickname: '구버전', roomCode: h.lobby.room.roomCode })), 'INCOMPATIBLE_GAME_CAPABILITY');
});
test('SABOTEUR socket rejects actor/card/payload errors without mutation and keeps all private fields scoped', async (t) => {
    const h = await harness(t), g = sab(await start(h));
    assert.ok('activePlayerId' in g);
    const actor = h.members.find(p => p.playerId === g.activePlayerId)!, other = h.members.find(p => p !== actor)!, s = await h.sync(actor.client), own = sab(s), hidden = sab(await h.sync(other.client));
    for (const c of hidden.privateState.hand)
        assert.equal(JSON.stringify(own).includes(c.cardId), false);
    assert.ok(own.goals.every(g => g.face === null));
    assert.equal('hiddenGoals' in own, false);
    assert.equal('cards' in own, false);
    const before = await h.server.runtime.persistence.findById(s.room.roomId), valid = { kind: 'DISCARD', cardId: own.privateState.hand[0]!.cardId };
    assert.equal(h.failure(await h.send(other.client, action(h, s, valid))), 'NOT_YOUR_TURN');
    for (const cardId of [hidden.privateState.hand[0]!.cardId, 'unknown'])
        assert.equal(h.failure(await h.send(actor.client, action(h, s, { kind: 'DISCARD', cardId }))), 'RULE_VIOLATION');
    assert.equal(h.failure(await h.send(actor.client, action(h, s, { ...valid, actorPlayerId: actor.playerId }))), 'INVALID_PAYLOAD');
    assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId), before);
});
test('SABOTEUR socket chat does not stale current turn; retries, conflicting requests and concurrent actions commit once', async (t) => {
    const h = await harness(t), g = sab(await start(h));
    assert.ok('activePlayerId' in g);
    const actor = h.members.find(p => p.playerId === g.activePlayerId)!, other = h.members.find(p => p !== actor)!, s = await h.sync(actor.client), own = sab(s);
    const cmd = action(h, s, { kind: 'DISCARD', cardId: own.privateState.hand[0]!.cardId });
    h.success(await h.call(other.client, 'saboteur:say', { text: '<b>금은 어디?</b>', sequence: 0 }, { gameId: g.gameId, roundId: g.roundId }));
    const accepted = h.success(await h.send(actor.client, cmd));
    assert.equal(sab(accepted).deckCount, 48);
    const before = await h.server.runtime.persistence.findById(s.room.roomId);
    h.success(await h.send(actor.client, cmd));
    assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId), before);
    assert.equal(h.failure(await h.send(actor.client, { ...cmd, payload: { kind: 'DISCARD', cardId: own.privateState.hand[1]!.cardId } })), 'REQUEST_ID_REUSED');
    const current = sab(await h.sync());
    assert.ok('activePlayerId' in current);
    const next = h.members.find(p => p.playerId === current.activePlayerId)!, view = await h.sync(next.client), hand = sab(view).privateState.hand;
    const replies = await Promise.all([h.send(next.client, action(h, view, { kind: 'DISCARD', cardId: hand[0]!.cardId })), h.send(next.client, action(h, view, { kind: 'DISCARD', cardId: hand[1]!.cardId }))]);
    assert.equal(replies.map(r => v.parse(StateSyncWireAckSchema, r)).filter(a => a.ok).length, 1);
});
test('SABOTEUR full 3-round socket match, simultaneous confirmations and same-room restart', async (t) => {
    const h = await harness(t), initial = await start(h);
    let s = initial, moves = 0;
    while (sab(s).phase !== 'FINISHED') {
        const g = sab(s);
        if (g.phase === 'PLAYING') {
            const member = h.members.find(p => p.playerId === g.activePlayerId)!, view = await h.sync(member.client);
            s = h.success(await h.send(member.client, action(h, view, { kind: 'DISCARD', cardId: sab(view).privateState.hand[0]!.cardId })));
            moves++;
        }
        else if (g.phase === 'ROUND_RESULT') {
            const replies = await Promise.all(h.members.map(m => h.call(m.client, 'saboteur:nextRound', {}, { gameId: g.gameId, roundId: g.roundId, expectedGameRevision: g.gameRevision })));
            replies.forEach(h.success);
            s = await h.sync();
        }
        else
            throw new Error('Unexpected phase');
        assert.ok(moves <= 201);
    }
    assert.equal(moves, 201);
    const end = sab(s);
    assert.equal(end.phase, 'FINISHED');
    assert.equal(end.roundResults.length, 3);
    if (end.phase !== 'FINISHED')
        throw new Error();
    assert.equal(end.result.scores.length, 3);
    const lobby = h.success(await h.send(h.host, h.selection(await h.sync(), 'SABOTEUR')));
    assert.equal(lobby.room.roomCode, initial.room.roomCode);
    assert.equal(lobby.game, null);
    const again = await start(h);
    assert.notEqual(sab(again).gameId, end.gameId);
});
test('SABOTEUR reconnect restores exact private state, revokes old primary and explicit leave cancels match', async (t) => {
    const h = await harness(t), initial = await start(h), before = await h.sync(h.host), member = h.members[0]!, replacement = await h.connect();
    const resume = h.success(await h.call(replacement, 'session:resume', { credential: { roomCode: before.room.roomCode, sessionToken: member.credential.sessionToken }, lastSeenVersions: null }));
    assert.deepEqual(sab(resume).privateState, sab(before).privateState);
    assert.equal(sab(resume).deadlineAt, sab(before).deadlineAt);
    assert.equal(h.failure(await h.send(h.host, action(h, resume, { kind: 'DISCARD', cardId: sab(resume).privateState.hand[0]!.cardId }))), 'UNAUTHENTICATED');
    const after = await h.server.runtime.persistence.findById(before.room.roomId);
    assert.ok(after);
    assert.equal(sab(resume).gameId, sab(initial).gameId);
    const leave = v.parse(RoomLeaveAckSchema, await h.call(replacement, 'room:leave', {}, { expectedRoomRevision: resume.versions.roomRevision, expectedGameRevision: sab(resume).gameRevision }));
    assert.ok(leave.ok);
    const remaining = sab(await h.sync(h.members[1]!.client));
    assert.equal(remaining.phase, 'FINISHED');
    if (remaining.phase === 'FINISHED')
        assert.equal(remaining.result.reason, 'CANCELLED');
});

test('SABOTEUR deadline race rejects late socket action and applies only one timeout despite chat revisions', async t => {
    const h=await harness(t), initial=await start(h),g=sab(initial);
    assert.ok(g.phase==='PLAYING');
    const service=h.server.runtime.saboteurService!;
    let clock=initial.serverTime;
    t.mock.method(h.server.runtime.clock,'now',()=>clock);
    const active=h.members.find(p=>p.playerId===g.activePlayerId)!, view=await h.sync(active.client);
    const cmd=action(h,view,{kind:'DISCARD',cardId:sab(view).privateState.hand[0]!.cardId});
    const deadline=(await h.server.runtime.persistence.listActiveTurnDeadlines()).find(d=>d.roomId===initial.room.roomId)!;
    assert.equal(deadline.deadlineAt,g.deadlineAt);
    h.success(await h.call(h.host,'saboteur:say',{text:'시간은 유지',sequence:0},{gameId:g.gameId,roundId:g.roundId}));
    assert.equal(sab(await h.sync()).deadlineAt,deadline.deadlineAt);
    clock=v.parse(ServerTimeSchema,deadline.deadlineAt-1);
    assert.equal((await service.timeout(deadline)).status,'NO_OP');
    clock=deadline.deadlineAt;
    const [late,one,two]=await Promise.all([h.send(active.client,cmd),service.timeout(deadline),service.timeout(deadline)]);
    assert.equal(v.parse(StateSyncWireAckSchema,late).ok,false);
    assert.equal([one,two].filter(r=>r.status==='APPLIED').length,1);
    const next=sab(await h.sync());
    assert.equal(next.deckCount,g.deckCount-1);
    assert.equal(next.discardCount,1);
    assert.equal(next.gameRevision,g.gameRevision+2);
    assert.equal(next.deadlineAt,clock+30000);
    assert.equal(next.feedback?.kind,'TIMEOUT_DISCARD');
    const before=await h.server.runtime.persistence.findById(initial.room.roomId);
    assert.equal((await service.timeout(deadline)).status,'NO_OP');
    assert.deepEqual(await h.server.runtime.persistence.findById(initial.room.roomId),before);
});

test('SABOTEUR offline actor still times out and result confirmation deadline advances without unanimity', async t => {
    const h=await harness(t),initial=await start(h);
    let clock=initial.serverTime;
    t.mock.method(h.server.runtime.clock,'now',()=>clock);
    let s=initial;
    // Reach a genuine round result via accepted commands.
    while(sab(s).phase==='PLAYING'){
        const g=sab(s);assert.ok(g.phase==='PLAYING');
        const actor=h.members.find(p=>p.playerId===g.activePlayerId)!,view=await h.sync(actor.client);
        s=h.success(await h.send(actor.client,action(h,view,{kind:'DISCARD',cardId:sab(view).privateState.hand[0]!.cardId})));
    }
    const result=sab(s);assert.equal(result.phase,'ROUND_RESULT');
    assert.equal(result.deadlineAt,clock+60000);
    const deadline=(await h.server.runtime.persistence.listActiveTurnDeadlines()).find(d=>d.roomId===s.room.roomId)!;
    h.success(await h.call(h.host,'saboteur:nextRound',{}, {gameId:result.gameId,roundId:result.roundId,expectedGameRevision:result.gameRevision}));
    assert.equal(sab(await h.sync()).deadlineAt,deadline.deadlineAt);
    clock=v.parse(ServerTimeSchema,deadline.deadlineAt-1);
    assert.equal((await h.server.runtime.saboteurService!.timeout(deadline)).status,'NO_OP');
    clock=deadline.deadlineAt;
    assert.equal((await h.server.runtime.saboteurService!.timeout(deadline)).status,'APPLIED');
    const next=sab(await h.sync());assert.ok(next.phase==='PLAYING');
    assert.equal(next.round,2);assert.equal(next.deadlineAt,clock+30000);
    assert.equal((await h.server.runtime.saboteurService!.timeout(deadline)).status,'NO_OP');
    const actor=h.members.find(p=>p.playerId===next.activePlayerId)!,observer=h.members.find(p=>p!==actor)!;
    const activeDeadline=(await h.server.runtime.persistence.listActiveTurnDeadlines()).find(d=>d.roomId===s.room.roomId)!;
    actor.client.disconnect();
    assert.equal(sab(await h.sync(observer.client)).deadlineAt,activeDeadline.deadlineAt);
    clock=activeDeadline.deadlineAt;
    assert.equal((await h.server.runtime.saboteurService!.timeout(activeDeadline)).status,'APPLIED');
    const after=sab(await h.sync(observer.client));
    assert.equal(after.feedback?.kind,'TIMEOUT_DISCARD');
    assert.equal(after.deckCount,next.deckCount-1);
});

test('SABOTEUR runtime scheduler dispatches timeout and broadcasts the resulting snapshot', async t => {
    const h=await harness(t),s=await start(h),g=sab(s);
    assert.ok(g.deadlineAt!==null);
    const clock=g.deadlineAt;
    t.mock.method(h.server.runtime.clock,'now',()=>clock);
    const automatic=new Promise<PlatformSnapshotV2>((resolve,reject)=>{
        const timer=setTimeout(()=>{h.host.off('state:snapshot',receive);reject(new Error('Missing scheduled timeout broadcast'));},5000);
        function receive(raw:unknown){
            const event=v.safeParse(StateSnapshotWireEventSchema,raw);
            if(!event.success)return;
            const parsed=v.safeParse(PlatformSnapshotV2Schema,event.output.payload.snapshot);
            if(!parsed.success||parsed.output.game?.gameType!=='SABOTEUR'||parsed.output.game.feedback?.kind!=='TIMEOUT_DISCARD')return;
            clearTimeout(timer);h.host.off('state:snapshot',receive);resolve(parsed.output);
        }
        h.host.on('state:snapshot',receive);
    });
    // A chat revision re-registers the same, already-due deadline; the real timer driver calls the router.
    h.success(await h.call(h.host,'saboteur:say',{text:'기한 유지',sequence:0},{gameId:g.gameId,roundId:g.roundId}));
    const after=sab(await automatic);
    assert.equal(after.deckCount,g.deckCount-1);
    assert.equal(after.gameRevision,g.gameRevision+2);
    assert.equal(after.deadlineAt,clock+30000);
});
