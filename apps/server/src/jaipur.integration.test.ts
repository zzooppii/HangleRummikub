import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import * as v from "valibot";
import {
  SUPPORTED_GAME_TYPES, PlatformSnapshotV2Schema, SessionBootstrapAckSchema,
  StateSyncWireAckSchema, RoomLeaveAckSchema, type GameType, type PlatformSnapshotV2,
  ServerTimeSchema,
} from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
import type { JaipurAction, JaipurPlayingProjection, JaipurCardType } from "@hangul-rummikub/shared";

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
  let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: count > 2 ? "WOLF_NIGHT" : "JAIPUR" }));
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

function jaipur(snapshot: PlatformSnapshotV2) {
  if(snapshot.game?.gameType!=='JAIPUR')throw new Error('Expected Jaipur game.');
  return snapshot.game;
}
type Harness=Awaited<ReturnType<typeof harness>>;
async function start(h:Harness){const s=await h.sync();return h.success(await h.call(h.host,'game:start',{}, {expectedRoomRevision:s.versions.roomRevision}));}
function action(h:Harness,s:PlatformSnapshotV2,payload:unknown){const g=jaipur(s);if(g.phase!=='PLAYING')throw new Error('Expected playing Jaipur.');return h.request('jaipur:act',payload,{gameId:g.gameId,expectedGameRevision:g.gameRevision,turnId:g.turnId});}
function legalMove(g:JaipurPlayingProjection):JaipurAction {
  const groups=new Map<JaipurCardType,typeof g.privateState.hand>();
  for(const card of g.privateState.hand)groups.set(card.type,[...(groups.get(card.type)??[]),card]);
  const sale=[...groups].find(([type,cards])=>!['DIAMOND','GOLD','SILVER'].includes(type)||cards.length>=2);
  if(sale)return {kind:'SELL',cardIds:sale[1].map(c=>c.cardId)};
  const single=g.market.find(c=>c.type!=='CAMEL');
  if(single&&g.privateState.hand.length<7)return {kind:'TAKE_GOOD',cardId:single.cardId};
  return {kind:'TAKE_CAMELS'};
}

test('JAIPUR admission: exactly two, third join rejected, oversized switched room preserved',async t=>{
  const single=await harness(t,1),one=await single.sync();
  assert.equal(single.failure(await single.call(single.host,'game:start',{}, {expectedRoomRevision:one.versions.roomRevision})),'NOT_ENOUGH_PLAYERS');
  const h=await harness(t),outsider=await h.connect(),credential=await h.bootstrap(outsider);
  assert.equal(h.failure(await h.call(outsider,'room:join',{bootstrapCredential:credential,nickname:'세번째',roomCode:h.lobby.room.roomCode})),'ROOM_FULL');
  assert.ok(h.server.runtime.jaipurService);
  const random=h.server.runtime.jaipurService.deps.random,originalRandom=random.nextInt.bind(random),shuffleBounds:number[]=[];
  random.nextInt=(upperBound)=>{shuffleBounds.push(upperBound);return originalRandom(upperBound);};
  const started=await start(h);assert.equal(started.room.phase,'PLAYING');assert.equal(jaipur(started).playerStates.length,2);assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(d=>d.roomId===started.room.roomId),false);
  random.nextInt=originalRandom;
  assert.deepEqual(shuffleBounds.slice(0,51),Array.from({length:51},(_,i)=>52-i),'Reserve three market camels before uniformly shuffling the remaining 52 cards.');
  const large=await harness(t,3);const selected=large.success(await large.send(large.host,large.selection(await large.sync(),'JAIPUR')));assert.equal(selected.room.players.length,3);
  assert.equal(large.failure(await large.call(large.host,'game:start',{}, {expectedRoomRevision:selected.versions.roomRevision})),'NOT_ENOUGH_PLAYERS');assert.equal((await large.sync()).room.phase,'LOBBY');
});
test('JAIPUR socket: private projections, wrong actor, foreign IDs and runtime payload rejection',async t=>{
  const h=await harness(t),started=await start(h),g=jaipur(started);assert.equal(g.phase,'PLAYING');if(g.phase!=='PLAYING')throw new Error();
  const actor=h.members.find(p=>p.playerId===g.activePlayerId)!,other=h.members.find(p=>p!==actor)!,s=await h.sync(actor.client),opponent=jaipur(await h.sync(other.client));
  const own=jaipur(s);assert.equal(own.privateState.playerId,actor.playerId);
  for(const card of opponent.privateState.hand)assert.equal(JSON.stringify(own).includes(card.cardId),false);
  assert.ok(own.playerStates.every(p=>!('camelCount' in p)&&!('score' in p)));assert.ok(own.bonusBank.every(b=>!('values' in b)));
  const before=await h.server.runtime.persistence.findById(started.room.roomId);
  assert.equal(h.failure(await h.send(other.client,action(h,s,{kind:'TAKE_CAMELS'}))),'NOT_YOUR_TURN');
  const foreign=opponent.privateState.hand[0]?.cardId??'unknown';
  for(const cardId of [foreign,'unknown'])assert.equal(h.failure(await h.send(actor.client,action(h,s,{kind:'SELL',cardIds:[cardId]}))),'RULE_VIOLATION');
  assert.equal(h.failure(await h.send(actor.client,action(h,s,{kind:'TAKE_CAMELS',actorPlayerId:other.playerId}))),'INVALID_PAYLOAD');
  assert.deepEqual(await h.server.runtime.persistence.findById(started.room.roomId),before);
});
test('JAIPUR socket: accepted retry commits once, conflicting and stale requests are rejected',async t=>{
  const h=await harness(t),started=await start(h),g=jaipur(started);if(g.phase!=='PLAYING')throw new Error();
  const member=h.members.find(p=>p.playerId===g.activePlayerId)!,s=await h.sync(member.client),view=jaipur(s);if(view.phase!=='PLAYING')throw new Error();
  const command=action(h,s,legalMove(view));h.success(await h.send(member.client,command));const after=await h.server.runtime.persistence.findById(s.room.roomId);
  h.success(await h.send(member.client,command));assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId),after);
  assert.equal(h.failure(await h.send(member.client,{...command,payload:{kind:'SELL',cardIds:[]}})),'REQUEST_ID_REUSED');
  assert.equal(h.failure(await h.send(member.client,{...command,requestId:'stale-attempt'})),'STALE_GAME_REVISION');
  const next=await h.sync(),ng=jaipur(next);if(ng.phase!=='PLAYING')throw new Error();
  const nextMember=h.members.find(p=>p.playerId===ng.activePlayerId)!,nextView=await h.sync(nextMember.client),nextGame=jaipur(nextView);if(nextGame.phase!=='PLAYING')throw new Error();
  const one=action(h,nextView,legalMove(nextGame)),two={...one,requestId:'parallel-distinct'};
  const results=await Promise.all([h.send(nextMember.client,one),h.send(nextMember.client,two)]);
  assert.equal(results.map(raw=>v.parse(StateSyncWireAckSchema,raw)).filter(r=>r.ok).length,1);
});
test('JAIPUR socket: reconnect keeps private hand and turn; previous primary cannot act',async t=>{
  const h=await harness(t),s=await start(h),g=jaipur(s);if(g.phase!=='PLAYING')throw new Error();
  const member=h.members.find(p=>p.playerId===g.activePlayerId)!,before=jaipur(await h.sync(member.client)),replacement=await h.connect();
  const resumed=h.success(await h.call(replacement,'session:resume',{credential:{...member.credential,roomCode:s.room.roomCode},lastSeenVersions:null}));
  assert.deepEqual(jaipur(resumed).privateState,before.privateState);assert.equal(jaipur(resumed).gameRevision,before.gameRevision);
  assert.equal(h.failure(await h.send(member.client,action(h,resumed,{kind:'TAKE_CAMELS'}))),'UNAUTHENTICATED');
  member.client=replacement;
});
test('JAIPUR socket: full multi-round match, fresh identities, host succession and same-room restart',async t=>{
  const h=await harness(t);let s=await start(h),steps=0;const gameId=jaipur(s).gameId;
  while(s.room.phase==='PLAYING'&&steps++<700){
    const g=jaipur(s);
    if(g.phase==='PLAYING'){
      const actor=h.members.find(p=>p.playerId===g.activePlayerId)!,view=await h.sync(actor.client),own=jaipur(view);if(own.phase!=='PLAYING')throw new Error();
      s=h.success(await h.send(actor.client,action(h,view,legalMove(own))));
    }else if(g.phase==='ROUND_RESULT'){
      const before=g.roundId,oldRevision=g.gameRevision;
      for(const member of h.members){const view=await h.sync(member.client),current=jaipur(view);assert.equal(current.phase,'ROUND_RESULT');s=h.success(await h.call(member.client,'jaipur:nextRound',{}, {gameId:current.gameId,expectedGameRevision:current.gameRevision,roundId:current.roundId}));}
      const next=jaipur(s);assert.equal(s.room.phase,'PLAYING');assert.notEqual(next.roundId,before);assert.equal(next.gameRevision,oldRevision+2);assert.equal(next.gameId,gameId);
      assert.equal(h.failure(await h.call(h.host,'jaipur:nextRound',{}, {gameId,expectedGameRevision:next.gameRevision,roundId:before})),'STALE_GAME_REVISION');
    }else throw new Error('Unexpected Jaipur phase.');
  }
  const end=jaipur(s);assert.equal(end.phase,'FINISHED');if(end.phase!=='FINISHED')throw new Error();assert.equal(end.result.reason,'SEALS');assert.ok(end.roundResults.length>=2);assert.equal(end.playerStates.filter(p=>p.seals===2).length,1);
  const guest=h.members[1]!;h.host.disconnect();
  // A sync roundtrip lets the server observe the disconnected host first.
  await h.sync(guest.client);
  const at=h.server.runtime.clock.now();t.mock.method(h.server.runtime.clock,'now',()=>v.parse((ServerTimeSchema),at+61_000));
  assert.equal(await h.server.runtime.jaipurHostSuccession!.evaluate(s.room.roomId),true);
  const inherited=await h.sync(guest.client);assert.equal(inherited.room.players.find(p=>p.isHost)?.playerId,guest.playerId);
  const lobby=h.success(await h.send(guest.client,h.selection(inherited,'JAIPUR')));assert.equal(lobby.room.roomCode,s.room.roomCode);assert.equal(lobby.room.phase,'LOBBY');
  const hostMember=h.members[0]!,replacement=await h.connect();h.success(await h.call(replacement,'session:resume',{credential:{...hostMember.credential,roomCode:lobby.room.roomCode},lastSeenVersions:null}));hostMember.client=replacement;
  const current=await h.sync(guest.client),fresh=h.success(await h.call(guest.client,'game:start',{}, {expectedRoomRevision:current.versions.roomRevision}));assert.notEqual(jaipur(fresh).gameId,gameId);
});
test('JAIPUR socket: explicit leave cancels match; switching removes departed player',async t=>{
  const h=await harness(t),s=await start(h),g=jaipur(s);
  const ack=v.parse(RoomLeaveAckSchema,await h.call(h.members[1]!.client,'room:leave',{}, {expectedRoomRevision:s.versions.roomRevision,expectedGameRevision:g.gameRevision}));assert.ok(ack.ok);
  const end=await h.sync(),finished=jaipur(end);assert.equal(finished.phase,'FINISHED');if(finished.phase!=='FINISHED')throw new Error();assert.equal(finished.result.reason,'CANCELLED');
  const selected=h.success(await h.send(h.host,h.selection(end,'SPLENDOR')));assert.equal(selected.room.players.length,1);assert.equal(selected.room.roomCode,s.room.roomCode);
  assert.equal(h.failure(await h.call(h.host,'jaipur:nextRound',{}, {gameId:g.gameId,expectedGameRevision:g.gameRevision,roundId:g.roundId})),'INVALID_PHASE');
});
