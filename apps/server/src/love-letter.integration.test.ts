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
import type { LoveLetterAction, LoveLetterPlayingProjection } from "@hangul-rummikub/shared";

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
  let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: count > 6 ? "WOLF_NIGHT" : "LOVE_LETTER" }));
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
function letter(s:PlatformSnapshotV2){if(s.game?.gameType!=='LOVE_LETTER')throw new Error('Expected Love Letter');return s.game;}
type Harness=Awaited<ReturnType<typeof harness>>;
async function start(h:Harness){const s=await h.sync();return h.success(await h.call(h.host,'game:start',{}, {expectedRoomRevision:s.versions.roomRevision}));}
function action(h:Harness,s:PlatformSnapshotV2,payload:unknown){const g=letter(s);if(g.phase!=='PLAYING')throw new Error('Expected playing');return h.request('loveLetter:act',payload,{gameId:g.gameId,expectedGameRevision:g.gameRevision,turnId:g.turnId});}
function legalMove(g:LoveLetterPlayingProjection):LoveLetterAction{
 if(g.phase!=='PLAYING')throw new Error('Playing required');const hand=g.privateState.hand;
 if(g.stage==='CHANCELLOR')return {kind:'CHANCELLOR',keepCardId:hand[0]!.cardId,returnCardIds:hand.slice(1).map(c=>c.cardId)};
 const forced=hand.some(c=>c.rank===8)&&hand.some(c=>c.rank===5||c.rank===7),card=(forced?hand.find(c=>c.rank===8):hand.find(c=>c.rank!==9))??hand[0]!;
 const targets=[1,2,3,5,7].includes(card.rank)?g.playerStates.filter(p=>!p.eliminated&&(p.playerId===g.privateState.playerId?card.rank===5:!p.protected)):[];
 return {kind:'PLAY',cardId:card.cardId,targetPlayerId:targets[0]?.playerId??null,guess:card.rank===1&&targets.length?9:null};
}
test('LOVE_LETTER socket: 2–6 admission, oversized room preserved, server deck private',async t=>{
 for(const count of [2,3,4,5,6]){const h=await harness(t,count),s=await start(h);assert.equal(s.room.phase,'PLAYING');const g=letter(s);assert.equal(g.playerStates.length,count);assert.equal(g.deckCount,21-1-count-1-(count===2?3:0));assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(d=>d.roomId===s.room.roomId),false);}
 const h=await harness(t,1),s=await h.sync();assert.equal(h.failure(await h.call(h.host,'game:start',{}, {expectedRoomRevision:s.versions.roomRevision})),'NOT_ENOUGH_PLAYERS');
 const large=await harness(t,7);const selected=large.success(await large.send(large.host,large.selection(await large.sync(),'LOVE_LETTER')));assert.equal(selected.room.players.length,7);assert.equal(large.failure(await large.call(large.host,'game:start',{}, {expectedRoomRevision:selected.versions.roomRevision})),'NOT_ENOUGH_PLAYERS');
});
test('LOVE_LETTER socket: primary actor, private projection, unauthorized IDs and strict input',async t=>{
 const h=await harness(t,3),s=await start(h),g=letter(s);assert.ok(g.phase==='PLAYING');
 const actor=h.members.find(p=>p.playerId===g.activePlayerId)!,other=h.members.find(p=>p!==actor)!,view=await h.sync(actor.client),own=letter(view),foreign=letter(await h.sync(other.client));
 const before=await h.server.runtime.persistence.findById(s.room.roomId);
 for(const c of foreign.privateState.hand)assert.ok(!JSON.stringify(own).includes(c.cardId));
 assert.equal(h.failure(await h.send(other.client,action(h,view,{kind:'PLAY',cardId:foreign.privateState.hand[0]!.cardId,targetPlayerId:null,guess:null}))),'NOT_YOUR_TURN');
 for(const id of [foreign.privateState.hand[0]!.cardId,'absent'])assert.equal(h.failure(await h.send(actor.client,action(h,view,{kind:'PLAY',cardId:id,targetPlayerId:null,guess:null}))),'RULE_VIOLATION');
 assert.equal(h.failure(await h.send(actor.client,action(h,view,{kind:'PLAY',cardId:'absent',targetPlayerId:null,guess:null,hand:[]}))),'INVALID_PAYLOAD');assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId),before);
 const unauth=await h.connect();assert.equal(h.failure(await h.send(unauth,action(h,view,{kind:'PLAY',cardId:'absent',targetPlayerId:null,guess:null}))),'UNAUTHENTICATED');
});
test('LOVE_LETTER socket: idempotent receipt, request conflicts, stale turns and concurrent commands',async t=>{
 const h=await harness(t,3),s=await start(h),g=letter(s);assert.ok(g.phase==='PLAYING');const actor=h.members.find(p=>p.playerId===g.activePlayerId)!,view=await h.sync(actor.client),own=letter(view);assert.ok(own.phase==='PLAYING');
 const c=action(h,view,legalMove(own));h.success(await h.send(actor.client,c));const before=await h.server.runtime.persistence.findById(s.room.roomId);h.success(await h.send(actor.client,c));assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId),before);
 assert.equal(h.failure(await h.send(actor.client,{...c,payload:{kind:'PLAY',cardId:'missing',targetPlayerId:null,guess:null}})),'REQUEST_ID_REUSED');
 assert.equal(h.failure(await h.send(actor.client,{...c,requestId:'new-stale'})),'STALE_GAME_REVISION');
 const ng=letter(await h.sync());assert.ok(ng.phase==='PLAYING');const member=h.members.find(p=>p.playerId===ng.activePlayerId)!,v=await h.sync(member.client),gg=letter(v);assert.ok(gg.phase==='PLAYING');const one=action(h,v,legalMove(gg));
 const results=await Promise.all([h.send(member.client,one),h.send(member.client,{...one,requestId:'other-concurrent'})]);assert.equal(results.map(x=>vParseAck(x)).filter(x=>x.ok).length,1);
});
function vParseAck(x:unknown){return v.parse(StateSyncWireAckSchema,x);}
test('LOVE_LETTER socket: reconnect restores hand and pending Chancellor, unsupported capability blocked',async t=>{
 const h=await harness(t,3);assert.ok(h.server.runtime.loveLetterService);
 const prefix=[0,2,3,16,19],desired=[...prefix,...Array.from({length:21},(_,i)=>i).filter(i=>!prefix.includes(i))],current=Array.from({length:21},(_,i)=>i),choices:number[]=[];
 for(let i=20;i>0;i--){const j=current.indexOf(desired[i]!);choices.push(j);[current[i],current[j]]=[current[j]!,current[i]!];}choices.push(2);
 t.mock.method(h.server.runtime.loveLetterService.deps.random,'nextInt',(upper:number)=>{const choice=choices.shift();assert.ok(choice!==undefined&&choice<upper);return choice;});
 let s=await start(h);const active=h.members[2]!,view=await h.sync(active.client),own=letter(view);assert.ok(own.phase==='PLAYING');
 const chancellor=own.privateState.hand.find(c=>c.rank===6);assert.ok(chancellor);s=h.success(await h.send(active.client,action(h,view,{kind:'PLAY',cardId:chancellor.cardId,targetPlayerId:null,guess:null})));
 assert.equal(letter(s).phase,'PLAYING');const pending=letter(s);assert.ok(pending.phase==='PLAYING');assert.equal(pending.stage,'CHANCELLOR');
 const member=h.members[2]!,before=letter(await h.sync(member.client)),replacement=await h.connect();const resumed=h.success(await h.call(replacement,'session:resume',{credential:{...member.credential,roomCode:s.room.roomCode},lastSeenVersions:null}));assert.deepEqual(letter(resumed).privateState,before.privateState);assert.equal(letter(resumed).gameRevision,before.gameRevision);
 assert.equal(h.failure(await h.call(member.client,'state:sync')),'UNAUTHENTICATED');member.client=replacement;
 const unsupported=await h.connect(['JAIPUR']);assert.equal(h.failure(await h.call(unsupported,'session:resume',{credential:{...member.credential,roomCode:s.room.roomCode},lastSeenVersions:null})),'INCOMPATIBLE_GAME_CAPABILITY');
});
test('LOVE_LETTER socket: full 4p match, host-only next round, fresh IDs, same-room restart and stale callbacks',async t=>{
 const h=await harness(t,4);let s=await start(h),steps=0;const gameId=letter(s).gameId;
 while(s.room.phase==='PLAYING'&&steps++<500){const g=letter(s);
  if(g.phase==='PLAYING'){const m=h.members.find(p=>p.playerId===g.activePlayerId)!,view=await h.sync(m.client),own=letter(view);assert.ok(own.phase==='PLAYING');s=h.success(await h.send(m.client,action(h,view,legalMove(own))));}
  else if(g.phase==='ROUND_RESULT'){
   const extra={gameId:g.gameId,expectedGameRevision:g.gameRevision,roundId:g.roundId};assert.equal(h.failure(await h.call(h.members[1]!.client,'loveLetter:nextRound',{},extra)),'HOST_ONLY');
   s=h.success(await h.call(h.host,'loveLetter:nextRound',{},extra));assert.notEqual(letter(s).roundId,g.roundId);assert.equal(letter(s).gameId,gameId);assert.equal(letter(s).gameRevision,g.gameRevision+1);
   assert.equal(h.failure(await h.call(h.host,'loveLetter:nextRound',{},extra)),'STALE_GAME_REVISION');
  }
 }
 const end=letter(s);assert.equal(end.phase,'FINISHED');assert.ok(end.phase==='FINISHED');assert.equal(end.result.reason,'TOKENS');assert.ok(end.result.winnerPlayerIds.length>0);
 const guest=h.members[1]!;h.host.disconnect();await h.sync(guest.client);const at=h.server.runtime.clock.now();t.mock.method(h.server.runtime.clock,'now',()=>v.parse(ServerTimeSchema,at+61000));assert.equal(await h.server.runtime.loveLetterHostSuccession!.evaluate(s.room.roomId),true);
 const inherited=await h.sync(guest.client);assert.equal(inherited.room.players.find(p=>p.isHost)?.playerId,guest.playerId);
 const lobby=h.success(await h.send(guest.client,h.selection(inherited,'LOVE_LETTER')));assert.equal(lobby.room.roomCode,s.room.roomCode);assert.equal(lobby.room.phase,'LOBBY');
});
test('LOVE_LETTER socket: explicit leave cancels match without hand reveal and retains remaining room',async t=>{
 const h=await harness(t,3),s=await start(h),before=letter(await h.sync(h.members[1]!.client));
 const leave=v.parse(RoomLeaveAckSchema,await h.call(h.members[1]!.client,'room:leave',{}, {expectedRoomRevision:s.versions.roomRevision,expectedGameRevision:letter(s).gameRevision}));assert.ok(leave.ok);
 const after=await h.sync(),g=letter(after);assert.ok(g.phase==='FINISHED');assert.equal(g.result.reason,'CANCELLED');for(const c of before.privateState.hand)assert.ok(!JSON.stringify(g).includes(c.cardId));
 const lobby=h.success(await h.send(h.host,h.selection(after,'JAIPUR')));assert.equal(lobby.room.roomCode,s.room.roomCode);assert.equal(lobby.room.players.length,2);
});
