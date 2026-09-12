import assert from "node:assert/strict";
import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import * as v from "valibot";
import {
  SUPPORTED_GAME_TYPES, PlatformSnapshotV2Schema, SessionBootstrapAckSchema,
  StateSyncWireAckSchema, RoomLeaveAckSchema, type GameType, type PlatformSnapshotV2,
} from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
import { createApplicationRuntime } from "./composition-root.js";
import type { SpaceCrewCampaignRepository } from "./games/space-crew/ports/campaign-repository.js";
import { FileSpaceCrewCampaignRepository, InMemorySpaceCrewCampaignRepository } from "./games/space-crew/infrastructure/campaign-repository.js";

type Client = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
type Command = { kind: string; protocolVersion: number; requestId: string; payload: unknown; [key: string]: unknown };
async function harness(t: TestContext, count = 4, options: { campaigns?: SpaceCrewCampaignRepository; processId?: string } = {}) {
  const campaigns = options.campaigns ?? new InMemorySpaceCrewCampaignRepository();
  const server = createHttpServer({ serveWeb: false, runtime: createApplicationRuntime({ spaceCrewCampaignRepository: campaigns, spaceCrewProcessId: options.processId ?? "integration-process" }) }), clients: Client[] = [];
  let closed = false;
  const close = async () => { if (closed) return; closed = true; clients.forEach(c => c.disconnect()); await server.shutdown(); };
  t.after(close);
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
  let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: "SPACE_CREW" }));
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
  return { close, campaigns, server, host, members, lobby, connect, bootstrap, request, send, call, success, failure, sync, selection, readyAll };
}
function crew(snapshot: PlatformSnapshotV2) {
  if (snapshot.game?.gameType !== 'SPACE_CREW') throw new Error('Expected Space Crew.');
  return snapshot.game;
}
type Harness = Awaited<ReturnType<typeof harness>>;
const recoveryToken = 'A'.repeat(43);
async function start(h: Harness, mode: 'CAMPAIGN' | 'PRACTICE' = 'CAMPAIGN') {
  const current = await h.sync();
  return h.success(await h.call(h.host, 'spaceCrew:start', mode === 'CAMPAIGN'
    ? { kind: 'NEW', mode, recoveryToken } : { kind: 'NEW', mode, missionNumber: 1, recoveryToken },
  { expectedRoomRevision: current.versions.roomRevision }));
}
function command(h: Harness, snapshot: PlatformSnapshotV2, payload: unknown, kind = 'spaceCrew:act') {
  const game = crew(snapshot);
  return h.request(kind, payload, { gameId: game.gameId, attemptId: game.attemptId, expectedGameRevision: game.gameRevision });
}
function member(h: Harness, playerId: string | null) {
  const found = h.members.find(entry => entry.playerId === playerId);
  assert.ok(found); return found;
}
async function choose(h: Harness, snapshot: PlatformSnapshotV2) {
  const game = crew(snapshot), task = game.tasks.visibleTasks.find(task => task.ownerId === null); assert.ok(task);
  return h.success(await h.send(member(h, game.tasks.activePlayerId).client,
    command(h, snapshot, { kind: 'TASK', action: { kind: 'CHOOSE', taskId: task.id } })));
}
async function firstTrick(h: Harness, snapshot: PlatformSnapshotV2, fail: boolean) {
  let current = await choose(h, snapshot);
  for (let i = 0; i < 4; i++) {
    const actor = member(h, crew(current).activePlayerId);
    const own = await h.sync(actor.client), game = crew(own);
    const leadingSuit = game.currentTrick[0]?.card.suit;
    const matching = game.privateState.hand.filter(card => card.suit === leadingSuit);
    const legal = matching.length ? matching : game.privateState.hand;
    const card = fail && i === 2 ? legal.find(card => card.suit === 'PINK' && card.value === 6) : legal[0];
    assert.ok(card);
    current = h.success(await h.send(actor.client, command(h, own, { kind: 'PLAY', cardId: card.cardId })));
  }
  assert.equal(crew(current).phase, 'FINISHED');
  assert.equal(crew(current).missionStatus, fail ? 'FAILURE' : 'SUCCESS');
  return current;
}

test('SPACE_CREW socket: configured 3/4/5 player starts preserve private cards and install no deadlines', async t => {
  for (const count of [3, 4, 5]) {
    const h = await harness(t, count), current = await h.sync();
    assert.equal(h.failure(await h.call(h.members[1]!.client, 'spaceCrew:start', { kind: 'NEW', mode: 'CAMPAIGN', recoveryToken }, { expectedRoomRevision: current.versions.roomRevision })), 'HOST_ONLY');
    const started = await start(h), game = crew(started);
    assert.equal(game.missionNumber, 1); assert.equal(game.attemptNumber, 1);
    assert.equal(game.totalTricks, count === 3 ? 13 : count === 4 ? 10 : 8);
    assert.equal(game.playerStates.reduce((sum, player) => sum + player.handCount, 0), 40);
    const views = await Promise.all(h.members.map(async entry => crew(await h.sync(entry.client))));
    for (const [index, view] of views.entries()) {
      assert.equal(view.privateState.playerId, h.members[index]!.playerId);
      for (const other of views.filter(other => other.privateState.playerId !== view.privateState.playerId)) {
        for (const card of other.privateState.hand) assert.equal(JSON.stringify(view).includes(card.cardId), false);
      }
      assert.equal(JSON.stringify(view).includes(recoveryToken), false);
      assert.equal('deadlineAt' in view, false);
    }
    assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).some(deadline => deadline.roomId === started.room.roomId), false);
  }
});

test('SPACE_CREW socket: scoped authorization, strict payloads, idempotency and stale atomicity', async t => {
  const h = await harness(t), started = await start(h), game = crew(started);
  const actor = member(h, game.tasks.activePlayerId), other = h.members.find(entry => entry !== actor); assert.ok(other);
  const task = game.tasks.visibleTasks[0]; assert.ok(task);
  const accepted = command(h, started, { kind: 'TASK', action: { kind: 'CHOOSE', taskId: task.id } });
  const before = await h.server.runtime.persistence.findById(started.room.roomId);
  assert.equal(h.failure(await h.send(other.client, accepted)), 'NOT_YOUR_TURN');
  assert.equal(h.failure(await h.send(actor.client, { ...accepted, payload: { kind: 'TASK', actorPlayerId: actor.playerId, action: { kind: 'CHOOSE', taskId: task.id } } })), 'INVALID_PAYLOAD');
  assert.deepEqual(await h.server.runtime.persistence.findById(started.room.roomId), before);
  h.success(await h.send(actor.client, accepted));
  const after = await h.server.runtime.persistence.findById(started.room.roomId);
  h.success(await h.send(actor.client, accepted));
  assert.deepEqual(await h.server.runtime.persistence.findById(started.room.roomId), after);
  assert.equal(h.failure(await h.send(actor.client, { ...accepted, requestId: 'stale-task' })), 'STALE_GAME_REVISION');
  assert.equal(h.failure(await h.send(actor.client, { ...accepted, payload: { kind: 'DISTRESS', action: { kind: 'SKIP' } } })), 'REQUEST_ID_REUSED');
  const current = await h.sync(), active = member(h, crew(current).activePlayerId), own = await h.sync(active.client), card = crew(own).privateState.hand[0]; assert.ok(card);
  const move = command(h, own, { kind: 'PLAY', cardId: card.cardId });
  const results = await Promise.all([h.send(active.client, move), h.send(active.client, { ...move, requestId: 'parallel-play' })]);
  assert.equal(results.map(raw => v.parse(StateSyncWireAckSchema, raw)).filter(result => result.ok).length, 1);
});

test('SPACE_CREW socket: reconnect preserves attempt and self hand while replacing primary authorization', async t => {
  const h = await harness(t), started = await start(h), actor = member(h, crew(started).tasks.activePlayerId);
  const before = crew(await h.sync(actor.client)), replacement = await h.connect();
  const resumed = h.success(await h.call(replacement, 'session:resume', { credential: { ...actor.credential, roomCode: started.room.roomCode }, lastSeenVersions: null }));
  assert.deepEqual(crew(resumed).privateState, before.privateState);
  assert.equal(crew(resumed).attemptId, before.attemptId); assert.equal(crew(resumed).gameRevision, before.gameRevision);
  const task = before.tasks.visibleTasks[0]; assert.ok(task);
  assert.equal(h.failure(await h.send(actor.client, command(h, resumed, { kind: 'TASK', action: { kind: 'CHOOSE', taskId: task.id } }))), 'UNAUTHENTICATED');
  actor.client = replacement;
  await choose(h, resumed);
});

test('SPACE_CREW socket: failed retry and successful next retain room but rotate attempt and opaque cards', async t => {
  const h = await harness(t); assert.ok(h.server.runtime.spaceCrewService);
  t.mock.method(h.server.runtime.spaceCrewService.deps.random, 'nextInt', (upper: number) => upper - 1);
  const started = await start(h), failed = await firstTrick(h, started, true), previous = crew(failed);
  const retry = command(h, failed, {}, 'spaceCrew:retry');
  assert.equal(h.failure(await h.send(h.members[1]!.client, retry)), 'HOST_ONLY');
  const retried = h.success(await h.send(h.host, retry)), nextAttempt = crew(retried);
  assert.equal(retried.room.roomCode, started.room.roomCode); assert.equal(nextAttempt.gameId, previous.gameId);
  assert.notEqual(nextAttempt.attemptId, previous.attemptId); assert.equal(nextAttempt.attemptNumber, 2);
  assert.equal(nextAttempt.gameRevision, previous.gameRevision + 1);
  assert.equal(h.failure(await h.send(h.host, { ...command(h, retried, { kind: 'PLAY', cardId: 'unknown' }), attemptId: previous.attemptId })), 'STALE_GAME_REVISION');
  const won = await firstTrick(h, retried, false), old = crew(won);
  const advanced = h.success(await h.send(h.host, command(h, won, {}, 'spaceCrew:next'))), next = crew(advanced);
  assert.equal(next.missionNumber, 2); assert.equal(next.attemptNumber, 1);
  assert.deepEqual(next.campaign.completedMissions, [1]); assert.notEqual(next.attemptId, old.attemptId);
  const oldIds = new Set(old.privateState.hand.map(card => card.cardId));
  assert.ok(next.privateState.hand.every(card => !oldIds.has(card.cardId)));
  assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).length, 0);
});

test('SPACE_CREW socket: practice selection follows a finished attempt and persists selected mission', async t => {
  const h = await harness(t); assert.ok(h.server.runtime.spaceCrewService);
  t.mock.method(h.server.runtime.spaceCrewService.deps.random, 'nextInt', (upper: number) => upper - 1);
  const started = await start(h, 'PRACTICE');
  assert.equal(h.failure(await h.send(h.host, command(h, started, { missionNumber: 9 }, 'spaceCrew:practiceMission'))), 'INVALID_PHASE');
  const won = await firstTrick(h, started, false);
  assert.equal(h.failure(await h.send(h.host, command(h, won, {}, 'spaceCrew:next'))), 'INVALID_PHASE');
  const selected = h.success(await h.send(h.host, command(h, won, { missionNumber: 9 }, 'spaceCrew:practiceMission'))), game = crew(selected);
  assert.equal(game.mode, 'PRACTICE'); assert.equal(game.missionNumber, 9); assert.equal(game.attemptNumber, 1);
  const checkpoint = await h.campaigns.read(game.campaign.campaignId); assert.ok(checkpoint);
  assert.equal(checkpoint.missionNumber, 9); assert.equal(checkpoint.mode, 'PRACTICE');
});

test('SPACE_CREW socket: playing leave aborts durably; finished leave preserves earned result', async t => {
  for (const finished of [false, true]) {
    const h = await harness(t); assert.ok(h.server.runtime.spaceCrewService);
    t.mock.method(h.server.runtime.spaceCrewService.deps.random, 'nextInt', (upper: number) => upper - 1);
    let snapshot = await start(h);
    if (finished) snapshot = await firstTrick(h, snapshot, false);
    const before = crew(snapshot), previous = await h.campaigns.read(before.campaign.campaignId); assert.ok(previous);
    const leaving = h.members[1]!;
    const ack = v.parse(RoomLeaveAckSchema, await h.call(leaving.client, 'room:leave', {}, {
      expectedRoomRevision: snapshot.versions.roomRevision, expectedGameRevision: before.gameRevision,
    })); assert.ok(ack.ok);
    const after = crew(await h.sync()); assert.equal(after.phase, 'FINISHED');
    if (after.phase !== 'FINISHED') throw new Error('Expected terminal projection.');
    const checkpoint = await h.campaigns.read(after.campaign.campaignId); assert.ok(checkpoint);
    assert.equal(checkpoint.lease.active, false);
    assert.equal(checkpoint.attempts.at(-1)?.status, finished ? 'SUCCESS' : 'ABORTED');
    if (finished) {
      assert.equal(before.phase, 'FINISHED'); if (before.phase !== 'FINISHED') throw new Error();
      assert.deepEqual(after.result, before.result); assert.deepEqual(checkpoint.attempts, previous.attempts);
      assert.deepEqual(checkpoint.completedMissions, [1]); assert.equal(after.gameRevision, before.gameRevision);
    } else {
      assert.equal(after.result.reason, 'CREW_LEFT'); assert.equal(after.gameRevision, before.gameRevision + 1);
    }
    assert.equal(h.failure(await h.send(h.host, command(h, await h.sync(), {}, 'spaceCrew:retry'))), 'INVALID_PHASE');
  }
});

test('SPACE_CREW socket: active same-process campaign takeover and wrong recovery credentials are rejected atomically', async t => {
  const h = await harness(t), started = await start(h), game = crew(started);
  const host = await h.connect(), credential = await h.bootstrap(host);
  let lobby = h.success(await h.call(host, 'room:create', { bootstrapCredential: credential, nickname: '새방장', gameType: 'SPACE_CREW' }));
  for (let index = 0; index < 2; index++) {
    const client = await h.connect(), bootstrapCredential = await h.bootstrap(client);
    lobby = h.success(await h.call(client, 'room:join', { bootstrapCredential, nickname: `새참가${index}`, roomCode: lobby.room.roomCode }));
  }
  const checkpoint = await h.campaigns.read(game.campaign.campaignId);
  for (const token of ['B'.repeat(42) + 'A', recoveryToken]) {
    const current = await h.sync(host);
    assert.equal(h.failure(await h.call(host, 'spaceCrew:start', { kind: 'RESUME', campaignId: game.campaign.campaignId, recoveryToken: token }, { expectedRoomRevision: current.versions.roomRevision })), 'RULE_VIOLATION');
    assert.equal((await h.sync(host)).room.phase, 'LOBBY');
    assert.deepEqual(await h.campaigns.read(game.campaign.campaignId), checkpoint);
  }
  assert.deepEqual(crew(await h.sync()).privateState, game.privateState);
});

test('SPACE_CREW socket: a fresh runtime resumes durable progress in a new room without old hands or sessions', async t => {
  const directory = await mkdtemp(join(tmpdir(), 'space-crew-socket-'));
  // Registered first so server shutdown hooks can run before removing their storage.
  t.after(async () => { await rm(directory, { recursive: true, force: true }); });
  const first = await harness(t, 4, { campaigns: new FileSpaceCrewCampaignRepository({ directory }), processId: 'before-restart' });
  assert.ok(first.server.runtime.spaceCrewService);
  t.mock.method(first.server.runtime.spaceCrewService.deps.random, 'nextInt', (upper: number) => upper - 1);
  const won = await firstTrick(first, await start(first), false);
  let current = first.success(await first.send(first.host, command(first, won, {}, 'spaceCrew:next')));
  while (crew(current).tasks.phase !== 'READY') current = await choose(first, current);
  current = first.success(await first.send(first.host, command(first, current, { kind: 'DISTRESS', action: { kind: 'PROPOSE', direction: 'LEFT' } })));
  for (const voter of first.members.slice(1)) {
    const view = await first.sync(voter.client);
    current = first.success(await first.send(voter.client, command(first, view, { kind: 'DISTRESS', action: { kind: 'VOTE', accept: true } })));
  }
  for (const actor of first.members) {
    const view = await first.sync(actor.client), card = crew(view).privateState.hand[0]; assert.ok(card);
    current = first.success(await first.send(actor.client, command(first, view, { kind: 'DISTRESS', action: { kind: 'SELECT', cardId: card.cardId } })));
  }
  const old = crew(current), oldCheckpoint = await first.campaigns.read(old.campaign.campaignId); assert.ok(oldCheckpoint);
  assert.equal(old.distress.active, true);
  const allOldCards = (await Promise.all(first.members.map(async actor => crew(await first.sync(actor.client)).privateState.hand))).flat();
  await first.close();
  const second = await harness(t, 3, { campaigns: new FileSpaceCrewCampaignRepository({ directory }), processId: 'after-restart' });
  const lobby = await second.sync();
  const resumed = second.success(await second.call(second.host, 'spaceCrew:start', { kind: 'RESUME', campaignId: old.campaign.campaignId, recoveryToken }, { expectedRoomRevision: lobby.versions.roomRevision })), game = crew(resumed);
  assert.notEqual(resumed.room.roomId, current.room.roomId); assert.notEqual(game.gameId, old.gameId); assert.notEqual(game.attemptId, old.attemptId);
  assert.equal(game.missionNumber, 2); assert.equal(game.attemptNumber, 2); assert.equal(game.distress.active, true);
  assert.deepEqual(game.campaign.completedMissions, [1]); assert.equal(game.playerStates.length, 3); assert.equal(game.completedTrickCount, 0);
  const checkpoint = await second.campaigns.read(game.campaign.campaignId); assert.ok(checkpoint);
  assert.deepEqual(checkpoint.distressEvents, oldCheckpoint.distressEvents);
  assert.deepEqual(checkpoint.attempts.map(attempt => attempt.status), ['SUCCESS', 'ABORTED', 'ACTIVE']);
  const viewText = JSON.stringify(game);
  for (const card of allOldCards) assert.equal(viewText.includes(card.cardId), false);
  const stale = { ...command(second, resumed, {}, 'spaceCrew:retry'), attemptId: old.attemptId };
  assert.equal(second.failure(await second.send(second.host, stale)), 'STALE_GAME_REVISION');
  const rawFiles = await Promise.all((await readdir(directory)).filter(name => name.endsWith('.json')).map(name => readFile(join(directory, name), 'utf8')));
  assert.ok(rawFiles.length > 0);
  for (const raw of rawFiles) {
    assert.equal(raw.includes(recoveryToken), false);
    for (const card of allOldCards) assert.equal(raw.includes(card.cardId), false);
  }
  await second.close();
});
