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
  let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: count > 2 ? "WOLF_NIGHT" : "WORD_DUET" }));
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
function duet(s:PlatformSnapshotV2){if(s.game?.gameType!=='WORD_DUET')throw new Error('Expected Duet');return s.game;}
type Harness=Awaited<ReturnType<typeof harness>>;
async function start(h:Harness){const s=await h.sync();return h.success(await h.call(h.host,'game:start',{}, {expectedRoomRevision:s.versions.roomRevision}));}
function action(h:Harness,s:PlatformSnapshotV2,payload:unknown){const g=duet(s);if(g.phase==='FINISHED')throw new Error('Finished');return h.request('duet:act',payload,{gameId:g.gameId,expectedGameRevision:g.gameRevision,turnId:g.turnId});}
test('DUET socket admission: two players, host start, third join and oversized room rejected',async t=>{
 const one=await harness(t,1),s=await one.sync();assert.equal(one.failure(await one.call(one.host,'game:start',{}, {expectedRoomRevision:s.versions.roomRevision})),'NOT_ENOUGH_PLAYERS');
 const h=await harness(t),guest=h.members[1]!;assert.equal(h.failure(await h.call(guest.client,'game:start',{}, {expectedRoomRevision:(await h.sync()).versions.roomRevision})),'HOST_ONLY');
 const stranger=await h.connect(),credential=await h.bootstrap(stranger);assert.equal(h.failure(await h.call(stranger,'room:join',{bootstrapCredential:credential,nickname:'세번째',roomCode:h.lobby.room.roomCode})),'ROOM_FULL');
 const initial=await start(h);assert.equal(duet(initial).phase,'CLUE');assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(d=>d.roomId===initial.room.roomId),false);
 const big=await harness(t,3),selected=big.success(await big.send(big.host,big.selection(await big.sync(),'WORD_DUET')));assert.equal(selected.room.players.length,3);assert.equal(big.failure(await big.call(big.host,'game:start',{}, {expectedRoomRevision:selected.versions.roomRevision})),'NOT_ENOUGH_PLAYERS');
});
test('DUET socket privacy, schema, first-clue race, stale identity and idempotent card confirmation',async t=>{
 const h=await harness(t),s=await start(h),guest=h.members[1]!,ga=duet(s),gb=duet(await h.sync(guest.client));
 assert.notDeepEqual(ga.privateState.key,gb.privateState.key);assert.equal('revealedKeys' in ga,false);assert.ok(ga.cards.every(c=>!('roles' in c)));assert.ok(ga.playerStates.every(p=>!('remaining' in p)));
 const before=await h.server.runtime.persistence.findById(s.room.roomId);
 assert.equal(h.failure(await h.send(h.host,action(h,s,{kind:'GIVE_CLUE',word:'두 단어',number:2}))),'INVALID_PAYLOAD');
 assert.equal(h.failure(await h.send(h.host,{...action(h,s,{kind:'GIVE_CLUE',word:'암호',number:2}),actorPlayerId:guest.playerId})),'INVALID_PAYLOAD');
 assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId),before);
 const ca=action(h,s,{kind:'GIVE_CLUE',word:'암호',number:1}),cb=action(h,s,{kind:'GIVE_CLUE',word:'연결',number:2});
 const results=await Promise.all([h.send(h.host,ca),h.send(guest.client,cb)]),acks=results.map(x=>v.parse(StateSyncWireAckSchema,x));assert.equal(acks.filter(x=>x.ok).length,1);
 const current=await h.sync(),g=duet(current);if(g.phase!=='GUESS')throw new Error();
 const giver=h.members.find(m=>m.playerId===g.clueGiverId)!,guesser=h.members.find(m=>m!==giver)!,giverView=duet(await h.sync(giver.client));
 const card=giverView.privateState.key.find(c=>c.role==='AGENT')!;
 assert.equal(h.failure(await h.send(giver.client,action(h,current,{kind:'GUESS',cardId:card.cardId}))),'NOT_YOUR_TURN');
 assert.equal(h.failure(await h.send(guesser.client,{...action(h,current,{kind:'GUESS',cardId:card.cardId}),turnId:'old-turn'})),'STALE_GAME_REVISION');
 assert.equal(h.failure(await h.send(guesser.client,action(h,current,{kind:'GUESS',cardId:'unknown'}))),'RULE_VIOLATION');
 const cmd=action(h,current,{kind:'GUESS',cardId:card.cardId}),out=await Promise.all([h.send(guesser.client,cmd),h.send(guesser.client,cmd)]);out.forEach(h.success);
 const after=duet(await h.sync());assert.equal(after.gameRevision,g.gameRevision+1);assert.equal(after.foundCount,1);assert.equal(after.tokensRemaining,9);
 assert.equal(h.failure(await h.send(guesser.client,{...cmd,payload:{kind:'END_GUESSES'}})),'REQUEST_ID_REUSED');
});
test('DUET socket complete match, key declassification, finished host succession and same-room restart',async t=>{
 const h=await harness(t);let s=await start(h);const originalId=duet(s).gameId;
 for(let turn=0;turn<2;turn++){
  const giver=h.members[turn]!,guesser=h.members[turn===0?1:0]!;
  s=h.success(await h.send(giver.client,action(h,s,{kind:'GIVE_CLUE',word:'암호',number:1})));
  const view=duet(s),targets=view.privateState.key.filter(k=>k.role==='AGENT'&&view.cards.find(c=>c.cardId===k.cardId)?.foundBy===null);
  for(const target of targets)s=h.success(await h.send(guesser.client,action(h,s,{kind:'GUESS',cardId:target.cardId})));
  if(turn===0)s=h.success(await h.send(guesser.client,action(h,s,{kind:'END_GUESSES'})));
 }
 const end=duet(s);assert.equal(end.phase,'FINISHED');if(end.phase!=='FINISHED')throw new Error();assert.equal(end.result.reason,'ALL_AGENTS');assert.equal(end.revealedKeys.length,2);assert.equal(end.foundCount,15);assert.equal(end.result.winnerPlayerIds.length,2);
 const guest=h.members[1]!;h.host.disconnect();await h.sync(guest.client);const now=h.server.runtime.clock.now();t.mock.method(h.server.runtime.clock,'now',()=>v.parse(ServerTimeSchema,now+61000));
 assert.equal(await h.server.runtime.duetHostSuccession!.evaluate(s.room.roomId),true);
 const inherited=await h.sync(guest.client);assert.equal(inherited.room.players.find(p=>p.isHost)?.playerId,guest.playerId);
 const lobby=h.success(await h.send(guest.client,h.selection(inherited,'WORD_DUET')));assert.equal(lobby.room.roomCode,s.room.roomCode);
 const hostMember=h.members[0]!,replacement=await h.connect();h.success(await h.call(replacement,'session:resume',{credential:{...hostMember.credential,roomCode:lobby.room.roomCode},lastSeenVersions:null}));
 const current=await h.sync(guest.client),fresh=h.success(await h.call(guest.client,'game:start',{}, {expectedRoomRevision:current.versions.roomRevision}));assert.notEqual(duet(fresh).gameId,originalId);
});
test('DUET socket: resume preserves key and turn, revokes previous primary; explicit leave cancels',async t=>{
 const h=await harness(t),s=await start(h),guest=h.members[1]!,before=duet(await h.sync(guest.client)),replacement=await h.connect();
 const resumed=h.success(await h.call(replacement,'session:resume',{credential:{...guest.credential,roomCode:s.room.roomCode},lastSeenVersions:null}));
 assert.deepEqual(duet(resumed).privateState,before.privateState);assert.deepEqual(duet(resumed).cards,before.cards);assert.equal(resumed.self.playerId,guest.playerId);
 assert.equal(h.failure(await h.send(guest.client,action(h,resumed,{kind:'GIVE_CLUE',word:'암호',number:1}))),'UNAUTHENTICATED');
 const ack=v.parse(RoomLeaveAckSchema,await h.call(replacement,'room:leave',{}, {expectedRoomRevision:resumed.versions.roomRevision,expectedGameRevision:duet(resumed).gameRevision}));assert.ok(ack.ok);
 const finished=await h.sync(),end=duet(finished);assert.equal(end.phase,'FINISHED');if(end.phase!=='FINISHED')throw new Error();assert.equal(end.result.reason,'CANCELLED');assert.deepEqual(end.result.winnerPlayerIds,[]);
 const lobby=h.success(await h.send(h.host,h.selection(finished,'JAIPUR')));assert.equal(lobby.room.players.length,1);assert.equal(lobby.room.roomCode,s.room.roomCode);
});
