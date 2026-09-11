import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import * as v from "valibot";
import {
  ServerTimeSchema, SUPPORTED_GAME_TYPES, PlatformSnapshotV2Schema, SessionBootstrapAckSchema,
  StateSyncWireAckSchema, RoomLeaveAckSchema, type GameType, type PlatformSnapshotV2,
} from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
import type { LostCitiesAction, LostCitiesPlayingProjection } from "@hangul-rummikub/shared";

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
  let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: count > 2 ? "WOLF_NIGHT" : "LOST_CITIES" }));
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

function lostCities(snapshot: PlatformSnapshotV2) {
  if(snapshot.game?.gameType!=='LOST_CITIES')throw new Error('Expected LostCities game.');
  return snapshot.game;
}
type Harness=Awaited<ReturnType<typeof harness>>;
async function start(h:Harness){const s=await h.sync();return h.success(await h.call(h.host,'game:start',{}, {expectedRoomRevision:s.versions.roomRevision}));}
function action(h:Harness,s:PlatformSnapshotV2,payload:unknown){const g=lostCities(s);if(g.phase!=='PLAYING')throw new Error('Expected playing LostCities.');return h.request('lostCities:act',payload,{gameId:g.gameId,expectedGameRevision:g.gameRevision,turnId:g.turnId});}
function move(g:LostCitiesPlayingProjection):LostCitiesAction {return {kind:'DISCARD',cardId:g.privateState.hand[0]!.cardId,draw:{kind:'DECK'}};}
test('LOST_CITIES admission: two players only, incompatible client rejected and a 60-second active deadline',async t=>{
  const one=await harness(t,1),l=await one.sync();assert.equal(one.failure(await one.call(one.host,'game:start',{}, {expectedRoomRevision:l.versions.roomRevision})),'NOT_ENOUGH_PLAYERS');
  const h=await harness(t),third=await h.connect(),token=await h.bootstrap(third);
  assert.equal(h.failure(await h.call(third,'room:join',{bootstrapCredential:token,nickname:'세번째',roomCode:h.lobby.room.roomCode})),'ROOM_FULL');
  const started=await start(h);assert.equal(lostCities(started).playerStates.length,2);assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(d=>d.roomId===started.room.roomId),true);
  const old=await h.connect(['JAIPUR']),oldToken=await h.bootstrap(old);assert.equal(h.failure(await h.call(old,'room:join',{bootstrapCredential:oldToken,nickname:'이전버전',roomCode:h.lobby.room.roomCode})),'INCOMPATIBLE_GAME_CAPABILITY');
  const large=await harness(t,3),selected=large.success(await large.send(large.host,large.selection(await large.sync(),'LOST_CITIES')));assert.equal(selected.room.players.length,3);assert.equal(large.failure(await large.call(large.host,'game:start',{}, {expectedRoomRevision:selected.versions.roomRevision})),'NOT_ENOUGH_PLAYERS');
});
test('LOST_CITIES socket validates actor, hidden cards, input shape and rollback of invalid draw',async t=>{
  const h=await harness(t),started=await start(h),g=lostCities(started);if(g.phase!=='PLAYING')throw new Error();
  const actor=h.members.find(p=>p.playerId===g.activePlayerId)!,other=h.members.find(p=>p!==actor)!,s=await h.sync(actor.client),own=lostCities(s),opponent=lostCities(await h.sync(other.client));if(own.phase!=='PLAYING')throw new Error();
  for(const c of opponent.privateState.hand)assert.equal(JSON.stringify(own).includes(c.cardId),false);
  const before=await h.server.runtime.persistence.findById(s.room.roomId);
  assert.equal(h.failure(await h.send(other.client,action(h,s,move(own)))),'NOT_YOUR_TURN');
  for(const cardId of [opponent.privateState.hand[0]!.cardId,'missing'])assert.equal(h.failure(await h.send(actor.client,action(h,s,{kind:'DISCARD',cardId,draw:{kind:'DECK'}}))),'RULE_VIOLATION');
  assert.equal(h.failure(await h.send(actor.client,action(h,s,{...move(own),draw:{kind:'DISCARD',suit:'DESERT'}}))),'RULE_VIOLATION');
  assert.equal(h.failure(await h.send(actor.client,action(h,s,{...move(own),actorPlayerId:other.playerId}))),'INVALID_PAYLOAD');
  assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId),before);
});
test('LOST_CITIES accepted retry, conflicting request and competing commands commit exactly once',async t=>{
  const h=await harness(t),started=await start(h),g=lostCities(started);if(g.phase!=='PLAYING')throw new Error();
  const actor=h.members.find(p=>p.playerId===g.activePlayerId)!,s=await h.sync(actor.client),own=lostCities(s);if(own.phase!=='PLAYING')throw new Error();
  const command=action(h,s,move(own));const result=h.success(await h.send(actor.client,command));const after=await h.server.runtime.persistence.findById(s.room.roomId);
  assert.equal(lostCities(result).deckCount,43);h.success(await h.send(actor.client,command));assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId),after);
  assert.equal(h.failure(await h.send(actor.client,{...command,payload:{...move(own),kind:'PLAY'}})),'REQUEST_ID_REUSED');
  assert.equal(h.failure(await h.send(actor.client,{...command,requestId:'stale'})),'STALE_GAME_REVISION');
  const current=lostCities(result);if(current.phase!=='PLAYING')throw new Error();const other=h.members.find(p=>p.playerId===current.activePlayerId)!,next=await h.sync(other.client),view=lostCities(next);if(view.phase!=='PLAYING')throw new Error();
  const c=action(h,next,move(view)),results=await Promise.all([h.send(other.client,c),h.send(other.client,{...c,requestId:'racing'})]);assert.equal(results.map(x=>v.parse(StateSyncWireAckSchema,x)).filter(x=>x.ok).length,1);assert.equal(lostCities(await h.sync()).deckCount,42);
});
test('LOST_CITIES resume restores exactly the same hand and turn without admitting previous primary',async t=>{
  const h=await harness(t),s=await start(h),g=lostCities(s);if(g.phase!=='PLAYING')throw new Error();const member=h.members.find(p=>p.playerId===g.activePlayerId)!,before=lostCities(await h.sync(member.client));
  const incompatible=await h.connect(['JAIPUR']);assert.equal(h.failure(await h.call(incompatible,'session:resume',{credential:{...member.credential,roomCode:s.room.roomCode},lastSeenVersions:null})),'INCOMPATIBLE_GAME_CAPABILITY');
  const replacement=await h.connect(),resumed=h.success(await h.call(replacement,'session:resume',{credential:{...member.credential,roomCode:s.room.roomCode},lastSeenVersions:null}));
  assert.deepEqual(lostCities(resumed).privateState,before.privateState);assert.equal(lostCities(resumed).gameRevision,before.gameRevision);
  const view=lostCities(resumed);if(view.phase!=='PLAYING')throw new Error();
  // Replaced sockets stay connected but lose their authenticated player binding.
  assert.equal(h.failure(await h.send(member.client,action(h,resumed,move(view)))),'UNAUTHENTICATED');
  assert.equal(lostCities(await h.sync(replacement)).gameRevision,before.gameRevision);
  h.success(await h.send(replacement,action(h,resumed,move(view))));
});
for(const mode of ['BASE','SIX_EXPEDITIONS'] as const) test(`LOST_CITIES ${mode} full three-round socket match, dual confirmations, joint victory and same-room restart`,async t=>{
  const h=await harness(t);const initial=await h.sync();h.success(await h.call(h.host,'lostCities:configure',{mode},{expectedRoomRevision:initial.versions.roomRevision}));let s=await start(h),oldGameId=lostCities(s).gameId;
  for(let round=1;round<=3;round++){
    for(let turn=0;turn<(mode==='BASE'?44:56);turn++){
      const g=lostCities(s);assert.equal(g.phase,'PLAYING');if(g.phase!=='PLAYING')throw new Error();const actor=h.members.find(p=>p.playerId===g.activePlayerId)!;s=await h.sync(actor.client);const own=lostCities(s);if(own.phase!=='PLAYING')throw new Error();s=h.success(await h.send(actor.client,action(h,s,move(own))));
    }
    const ended=lostCities(s);assert.equal(ended.deckCount,0);assert.equal(ended.roundResults.length,round);assert.deepEqual(ended.roundResults.at(-1)?.scores.map(p=>p.total),[0,0]);
    if(round<3){
      const confirm=(snapshot:PlatformSnapshotV2)=>{const g=lostCities(snapshot);return h.request('lostCities:nextRound',{}, {gameId:g.gameId,roundId:g.roundId,expectedGameRevision:g.gameRevision});};
      const first=confirm(s);s=h.success(await h.send(h.members[0]!.client,first));assert.equal(lostCities(s).phase,'ROUND_RESULT');h.success(await h.send(h.members[0]!.client,first));
      assert.equal(h.failure(await h.send(h.members[0]!.client,confirm(s))),'INVALID_PHASE');
      s=h.success(await h.send(h.members[1]!.client,confirm(s)));assert.equal(lostCities(s).phase,'PLAYING');assert.equal(lostCities(s).round,round+1);assert.equal(lostCities(s).gameId,oldGameId);
    }
  }
  const final=lostCities(s);assert.equal(final.phase,'FINISHED');if(final.phase!=='FINISHED')throw new Error();assert.equal(final.result.reason,'THREE_ROUNDS');assert.equal(final.result.winnerPlayerIds.length,2);
  const lobby=h.success(await h.send(h.host,h.selection(await h.sync(),'LOST_CITIES')));assert.equal(lobby.room.roomCode,s.room.roomCode);assert.equal(lobby.game,null);assert.equal(lobby.room.gameType,'LOST_CITIES');if(lobby.room.gameType!=='LOST_CITIES')throw new Error();assert.equal(lobby.room.settings?.mode,mode);const restarted=await start(h);assert.equal(lostCities(restarted).settings?.mode,mode);assert.notEqual(lostCities(restarted).gameId,oldGameId);
});
test('LOST_CITIES leave cancels and keeps remaining player eligible to select another game',async t=>{
  const h=await harness(t),s=await start(h),depart=h.members[1]!;
  const result=v.parse(RoomLeaveAckSchema,await h.call(depart.client,'room:leave',{}, {expectedRoomRevision:s.versions.roomRevision,expectedGameRevision:lostCities(s).gameRevision}));assert.ok(result.ok,result.ok?'':JSON.stringify(result.error));
  const final=await h.sync(),g=lostCities(final);assert.equal(g.phase,'FINISHED');if(g.phase!=='FINISHED')throw new Error();assert.deepEqual(g.result,{reason:'CANCELLED',winnerPlayerIds:[]});
  const selected=h.success(await h.send(h.host,h.selection(final,'JAIPUR')));assert.equal(selected.room.gameType,'JAIPUR');assert.equal(selected.room.players.length,1);assert.equal(selected.room.roomCode,s.room.roomCode);
});

test('LOST_CITIES host settings enforce authorization, revision, replay, persistence and lobby-only changes',async t=>{
  const h=await harness(t),initial=await h.sync(),guest=h.members[1]!;
  const c=h.request('lostCities:configure',{mode:'SIX_EXPEDITIONS'},{expectedRoomRevision:initial.versions.roomRevision});
  assert.equal(h.failure(await h.send(guest.client,c)),'HOST_ONLY');
  assert.equal(h.failure(await h.send(h.host,{...c,payload:{mode:'UNKNOWN'}})),'INVALID_PAYLOAD');
  let s=h.success(await h.send(h.host,c));
  assert.equal(s.versions.roomRevision,initial.versions.roomRevision+1);
  assert.equal(h.success(await h.send(h.host,c)).versions.roomRevision,s.versions.roomRevision);
  assert.equal(h.failure(await h.send(h.host,{...c,payload:{mode:'BASE'}})),'REQUEST_ID_REUSED');
  assert.equal(h.failure(await h.send(h.host,{...c,requestId:'old-settings'})),'STALE_ROOM_REVISION');
  const guestView=await h.sync(guest.client);if(guestView.room.gameType!=='LOST_CITIES')throw new Error();assert.equal(guestView.room.settings?.mode,'SIX_EXPEDITIONS');
  const resumed=h.success(await h.call(await h.connect(),'session:resume',{credential:{...guest.credential,roomCode:s.room.roomCode},lastSeenVersions:null}));
  if(resumed.room.gameType!=='LOST_CITIES')throw new Error();assert.equal(resumed.room.settings?.mode,'SIX_EXPEDITIONS');
  s=h.success(await h.call(h.host,'lostCities:configure',{mode:'BASE'},{expectedRoomRevision:s.versions.roomRevision}));
  s=await start(h);assert.equal(lostCities(s).deckCount,44);assert.equal(lostCities(s).discards.length,5);
  assert.equal(h.failure(await h.call(h.host,'lostCities:configure',{mode:'SIX_EXPEDITIONS'},{expectedRoomRevision:s.versions.roomRevision})),'INVALID_PHASE');
  assert.equal(lostCities(await h.sync()).settings?.mode,'BASE');
});

test('LOST_CITIES deadline survives sync and competing timeout/manual commands commit only once',async t=>{
  const h=await harness(t),started=await start(h),g=lostCities(started);if(g.phase!=='PLAYING')throw new Error();
  const runtime=h.server.runtime,service=runtime.lostCitiesService!;
  const actor=h.members.find(p=>p.playerId===g.activePlayerId)!,s=await h.sync(actor.client),own=lostCities(s);
  if(own.phase!=='PLAYING')throw new Error();assert.equal(own.deadlineAt,g.deadlineAt);
  const deadline=(await runtime.persistence.listActiveTurnDeadlines()).find(d=>d.roomId===s.room.roomId)!;
  assert.equal(deadline.deadlineAt,g.deadlineAt);assert.equal((await service.timeout(deadline)).status,'NO_OP');
  let now=v.parse(ServerTimeSchema,g.deadlineAt);t.mock.method(runtime.clock,'now',()=>now);
  const before=await runtime.persistence.findById(s.room.roomId);
  assert.equal(h.failure(await h.send(actor.client,action(h,s,move(own)))),'TURN_EXPIRED');
  assert.deepEqual(await runtime.persistence.findById(s.room.roomId),before);
  const results=await Promise.all([service.timeout(deadline),service.timeout(deadline),h.send(actor.client,action(h,s,move(own)))]);
  assert.deepEqual(results.slice(0,2),[{status:'APPLIED'},{status:'NO_OP'}]);
  const after=lostCities(await h.sync(actor.client));if(after.phase!=='PLAYING')throw new Error();
  assert.equal(after.gameRevision,own.gameRevision+1);assert.equal(after.deckCount,own.deckCount-1);
  assert.equal(after.feedback?.card.cardId,own.privateState.hand[0]!.cardId);assert.equal(after.activePlayerId,h.members.find(p=>p!==actor)!.playerId);
  assert.equal(after.deadlineAt,now+60_000);assert.equal((await service.timeout(deadline)).status,'NO_OP');
  now=v.parse(ServerTimeSchema,after.deadlineAt);
  const latest=(await runtime.persistence.listActiveTurnDeadlines()).find(d=>d.roomId===s.room.roomId)!;
  assert.equal((await service.timeout({...latest,expectedGameRevision:own.gameRevision})).status,'NO_OP');
  assert.equal((await service.timeout(latest)).status,'APPLIED');
});

test('LOST_CITIES scheduler failure recovers through shared overdue sweeper and cancels on leave',async t=>{
  const h=await harness(t),runtime=h.server.runtime;
  const diagnostic=t.mock.method(console,'error',()=>undefined);
  const schedule=t.mock.method(runtime.turnScheduler,'scheduleTimeout',async()=>{throw new Error('test schedule failure');});
  const started=await start(h),g=lostCities(started);if(g.phase!=='PLAYING')throw new Error();
  assert.equal(diagnostic.mock.callCount(),1);schedule.mock.restore();
  t.mock.method(runtime.clock,'now',()=>v.parse(ServerTimeSchema,g.deadlineAt));
  assert.equal(await runtime.overdueTurnSweeper.sweepOnce(),1);
  const s=await h.sync(),after=lostCities(s);assert.equal(after.gameRevision,g.gameRevision+1);assert.equal(runtime.turnScheduler.scheduledCount,1);
  const left=v.parse(RoomLeaveAckSchema,await h.call(h.host,'room:leave',{}, {expectedRoomRevision:s.versions.roomRevision,expectedGameRevision:after.gameRevision}));
  assert.ok(left.ok);assert.equal(runtime.turnScheduler.scheduledCount,0);
  assert.equal((await runtime.persistence.listActiveTurnDeadlines()).length,0);
});
