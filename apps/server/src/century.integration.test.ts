import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import * as v from "valibot";
import {
  SUPPORTED_GAME_TYPES, PlatformSnapshotV2Schema, SessionBootstrapAckSchema,
  StateSyncWireAckSchema, RoomLeaveAckSchema, type GameType, type PlatformSnapshotV2,

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
  let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: count > 5 ? "WOLF_NIGHT" : "CENTURY" }));
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

function century(snapshot: PlatformSnapshotV2) {
  if(snapshot.game?.gameType!=='CENTURY')throw new Error('Expected Century game.');
  return snapshot.game;
}
type Harness=Awaited<ReturnType<typeof harness>>;
async function start(h:Harness){const s=await h.sync();return h.success(await h.call(h.host,'game:start',{}, {expectedRoomRevision:s.versions.roomRevision}));}
function action(h:Harness,s:PlatformSnapshotV2,payload:unknown){const g=century(s);if(g.phase!=='PLAYING')throw new Error('Expected playing Century.');return h.request('century:act',payload,{gameId:g.gameId,expectedGameRevision:g.gameRevision,turnId:g.turnId});}
test('CENTURY socket: 2–5 seats, same-room switch, server initialization and no deadlines',async t=>{
 const one=await harness(t,1),single=await one.sync();assert.equal(one.failure(await one.call(one.host,'game:start',{}, {expectedRoomRevision:single.versions.roomRevision})),'NOT_ENOUGH_PLAYERS');
 for(const count of [2,3,4,5]){const h=await harness(t,count),s=await start(h);assert.equal(s.room.phase,'PLAYING');assert.equal(century(s).playerStates.length,count);assert.equal(century(s).privateState.hand.length,2);assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(d=>d.roomId===s.room.roomId),false);}
 const h=await harness(t,6),s=h.success(await h.send(h.host,h.selection(await h.sync(),'CENTURY')));assert.equal(s.room.players.length,6);assert.equal(h.failure(await h.call(h.host,'game:start',{}, {expectedRoomRevision:s.versions.roomRevision})),'NOT_ENOUGH_PLAYERS');
});
test('CENTURY socket: private views, actor/turn validation, hidden/unknown IDs indistinguishable, failed state atomic',async t=>{
 const h=await harness(t),s=await start(h),g=century(s);assert.ok(g.phase==='PLAYING');const actor=h.members.find(m=>m.playerId===g.activePlayerId)!,other=h.members.find(m=>m!==actor)!,own=await h.sync(actor.client),opponent=century(await h.sync(other.client));
 for(const c of opponent.privateState.hand)assert.equal(JSON.stringify(own).includes(c.cardId),false);
 const before=await h.server.runtime.persistence.findById(s.room.roomId),payload={kind:'PRODUCE',cardId:century(own).privateState.hand[0]!.cardId,returned:[0,0,0,0]};
 assert.equal(h.failure(await h.send(other.client,action(h,own,payload))),'NOT_YOUR_TURN');
 for(const cardId of ['missing-card',opponent.privateState.hand[0]!.cardId])assert.equal(h.failure(await h.send(actor.client,action(h,own,{...payload,cardId}))),'RULE_VIOLATION');
 assert.equal(h.failure(await h.send(actor.client,action(h,own,{...payload,extra:true}))),'INVALID_PAYLOAD');
 assert.deepEqual(await h.server.runtime.persistence.findById(s.room.roomId),before);
 const next=h.success(await h.send(actor.client,action(h,own,payload)));assert.equal(century(next).gameRevision,g.gameRevision+1);assert.equal(century(next).playerStates.find(p=>p.playerId===actor.playerId)!.played.length,1);
});
test('CENTURY socket: duplicate/concurrent commands commit once, stale scope and reused request fingerprint rejected',async t=>{
 const h=await harness(t),s=await start(h),g=century(s);assert.ok(g.phase==='PLAYING');const actor=h.members.find(m=>m.playerId===g.activePlayerId)!,own=await h.sync(actor.client),c=action(h,own,{kind:'REST',returned:[0,0,0,0]});
 const results=await Promise.all([h.send(actor.client,c),h.send(actor.client,c)]);for(const raw of results)assert.equal(century(h.success(raw)).gameRevision,g.gameRevision+1);
 assert.equal(century(await h.sync()).gameRevision,g.gameRevision+1);
 assert.equal(h.failure(await h.send(actor.client,{...c,payload:{kind:'UPGRADE',cardId:century(own).privateState.hand[1]!.cardId,upgrades:[],returned:[0,0,0,0]}})),'REQUEST_ID_REUSED');
 assert.equal(h.failure(await h.send(actor.client,action(h,own,{kind:'REST',returned:[0,0,0,0]}))),'STALE_GAME_REVISION');
 const fresh=await h.sync(),ng=century(fresh);assert.ok(ng.phase==='PLAYING');const next=h.members.find(m=>m.playerId===ng.activePlayerId)!;
 const commands=[action(h,fresh,{kind:'REST',returned:[0,0,0,0]}),action(h,fresh,{kind:'REST',returned:[0,0,0,0]})];const race=await Promise.all(commands.map(c=>h.send(next.client,c)));assert.equal(race.filter(raw=>v.parse(StateSyncWireAckSchema,raw).ok).length,1);assert.equal(century(await h.sync()).gameRevision,g.gameRevision+2);
});
test('CENTURY socket: reconnect preserves hand/turn; explicit leave cancels; same room can restart and switch',async t=>{
 const h=await harness(t),s=await start(h),g=century(s),member=h.members[1]!;
 const before=century(await h.sync(member.client));member.client.disconnect();const replacement=await h.connect();
 const resumed=h.success(await h.call(replacement,'session:resume',{credential:{...member.credential,roomCode:s.room.roomCode},lastSeenVersions:null}));
 assert.equal(resumed.self.playerId,member.playerId);assert.deepEqual(century(resumed).privateState,before.privateState);assert.equal(century(resumed).gameRevision,g.gameRevision);
 const left=v.parse(RoomLeaveAckSchema,await h.call(replacement,'room:leave',{}, {expectedRoomRevision:resumed.versions.roomRevision,expectedGameRevision:century(resumed).gameRevision}));assert.ok(left.ok);const ended=await h.sync();assert.equal(ended.room.phase,'FINISHED');const result=century(ended);assert.ok(result.phase==='FINISHED');assert.equal(result.result.reason,'CANCELLED');assert.deepEqual(result.result.winnerPlayerIds,[]);
 const reset=h.success(await h.send(h.host,h.selection(ended,'CENTURY')));assert.equal(reset.room.phase,'LOBBY');assert.equal(reset.room.roomCode,s.room.roomCode);assert.equal(reset.room.players.length,1);
 const switched=h.success(await h.send(h.host,h.selection(reset,'JAIPUR')));assert.equal(switched.room.gameType,'JAIPUR');assert.equal(switched.room.roomCode,s.room.roomCode);
});
test('CENTURY socket: full legal game, final projections, host succession and fresh same-room start',async t=>{
 const h=await harness(t),targets=new Map<string,string>();let snapshot=await start(h),steps=0;
 const originalGameId=century(snapshot).gameId;
 while(snapshot.room.phase==='PLAYING'&&steps++<1500){
  const observed=century(snapshot);assert.ok(observed.phase==='PLAYING');const actor=h.members.find(m=>m.playerId===observed.activePlayerId)!,view=await h.sync(actor.client),g=century(view);assert.ok(g.phase==='PLAYING');
  const me=g.playerStates.find(p=>p.playerId===actor.playerId)!,colors=[0,1,2,3] as const,zero=()=>[0,0,0,0];
  const affordable=g.pointMarket.find(c=>colors.every(i=>me.spices[i]>=c.cost[i]));let payload:unknown;
  if(affordable){payload={kind:'CLAIM',cardId:affordable.cardId,returned:zero()};targets.delete(actor.playerId);}
  else{
   const target=g.pointMarket.find(c=>c.cardId===targets.get(actor.playerId))??[...g.pointMarket].sort((a,b)=>colors.reduce<number>((t,i)=>t+Math.max(0,a.cost[i]-me.spices[i])*(i+1),0)-colors.reduce<number>((t,i)=>t+Math.max(0,b.cost[i]-me.spices[i])*(i+1),0))[0]!;targets.set(actor.playerId,target.cardId);
   const upgrade=g.privateState.hand.find(c=>c.kind==='UPGRADE'),produce=g.privateState.hand.find(c=>c.kind==='PRODUCE');let chosen=false;payload={kind:'REST',returned:zero()};
   if(upgrade?.kind==='UPGRADE'){const cubes=[...me.spices],upgrades:number[]=[];for(let step=0;step<upgrade.steps;step++){let source:number|undefined;for(const dest of [3,2,1]){if(cubes[dest]!>=target.cost[dest]!)continue;source=[2,1,0].find(i=>i<dest&&cubes[i]!>target.cost[i]!);if(source!==undefined)break;}if(source===undefined)break;upgrades.push(source);cubes[source]!--;cubes[source+1]!++;}if(upgrades.length){chosen=true;payload={kind:'UPGRADE',cardId:upgrade.cardId,upgrades,returned:zero()};}}
   if(!chosen&&produce?.kind==='PRODUCE'&&(me.spices[0]<target.cost[0]||me.spices.reduce((n,v)=>n+v,0)<10)){const after=me.spices.map((n,i)=>n+produce.gain[i]!),returned=zero();let excess=Math.max(0,after.reduce((n,v)=>n+v,0)-10);for(const i of colors){returned[i]=Math.min(excess,Math.max(0,after[i]!-target.cost[i]));excess-=returned[i]!;}assert.equal(excess,0);payload={kind:'PRODUCE',cardId:produce.cardId,returned};}
  }
  snapshot=h.success(await h.send(actor.client,action(h,view,payload)));
 }
 const end=century(snapshot);assert.ok(end.phase==='FINISHED');assert.equal(end.result.reason,'POINT_CARDS');assert.equal(end.result.winnerPlayerIds.length,1);
 for(const member of h.members){const projected=century(await h.sync(member.client));assert.ok(projected.phase==='FINISHED');assert.deepEqual(projected.result,end.result);}
 const guest=h.members[1]!;h.host.disconnect();await h.sync(guest.client);const now=h.server.runtime.clock.now();t.mock.method(h.server.runtime.clock,'now',()=>now+61_000);
 assert.equal(await h.server.runtime.centuryHostSuccession!.evaluate(snapshot.room.roomId),true);const inherited=await h.sync(guest.client);assert.equal(inherited.room.players.find(p=>p.isHost)?.playerId,guest.playerId);
 const lobby=h.success(await h.send(guest.client,h.selection(inherited,'CENTURY')));assert.equal(lobby.room.roomCode,snapshot.room.roomCode);assert.equal(lobby.room.players.length,2);
 const replacement=await h.connect();h.success(await h.call(replacement,'session:resume',{credential:{...h.members[0]!.credential,roomCode:lobby.room.roomCode},lastSeenVersions:null}));
 const latest=await h.sync(guest.client);const fresh=h.success(await h.call(guest.client,'game:start',{}, {expectedRoomRevision:latest.versions.roomRevision}));assert.notEqual(century(fresh).gameId,originalGameId);
});
