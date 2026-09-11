import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import * as v from "valibot";
import {
  SUPPORTED_GAME_TYPES, PlatformSnapshotV2Schema, SessionBootstrapAckSchema,
  StateSyncWireAckSchema, RoomLeaveAckSchema, type GameType, type PlatformSnapshotV2,
  RoomRevisionSchema, TurnIdSchema,
} from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";

type Client = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
type Command = { kind: string; protocolVersion: number; requestId: string; payload: unknown; [key: string]: unknown };
async function harness(t: TestContext, count = 3) {
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
  let lobby = success(await call(host, "room:create", { bootstrapCredential: hostCredential, nickname: "방장", gameType: "WOLF_NIGHT" }));
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

test("same room: all fifteen games can be selected, host starts without any ready commands", async t => {
  for (const gameType of SUPPORTED_GAME_TYPES) {
    await t.test(gameType, async t => {
      const h = await harness(t, gameType === "LIAR_GAME" ? 4 : (gameType === "WORD_DUET" || gameType === "JAIPUR" || gameType === "LOST_CITIES") ? 2 : 3), before = await h.sync();
      const selected = h.success(await h.send(h.host, h.selection(before, gameType)));
      assert.equal(selected.room.roomId, before.room.roomId); assert.equal(selected.room.roomCode, before.room.roomCode);
      assert.deepEqual(selected.room.players.map(p => [p.playerId, p.nickname, p.isHost]), before.room.players.map(p => [p.playerId, p.nickname, p.isHost]));
      assert.ok(selected.room.players.every(p => p.isReady === false));
      assert.equal(h.failure(await h.call(h.members[1]!.client, "game:start", {}, { expectedRoomRevision: selected.versions.roomRevision })), "HOST_ONLY");
      const started = h.success(await h.call(h.host, "game:start", {}, { expectedRoomRevision: selected.versions.roomRevision }));
      assert.equal(started.room.gameType, gameType); assert.equal(started.room.phase, "PLAYING"); assert.ok(started.game);
      const old = await h.server.runtime.persistence.findById(started.room.roomId); assert.ok(old);
      assert.equal(h.failure(await h.send(h.host, h.selection(started, "SPLENDOR"))), "INVALID_PHASE");
      assert.deepEqual(await h.server.runtime.persistence.findById(started.room.roomId), old);
      const reset = await h.server.runtime.persistence.commit({ roomMutation: { kind: "RESET_GAME", expectedRoomRevision: old.roomRevision, expectedStorageRevision: old.storageRevision,
        candidate: { ...old, game: null, phase: "LOBBY", roomRevision: v.parse(RoomRevisionSchema, old.roomRevision + 1) } },
        sessionMutation: { kind: "NONE" }, idempotency: { scopeKey: "illegal-reset", requestId: v.parse((await import("@hangul-rummikub/shared")).RequestIdSchema, "illegal-reset"), payloadFingerprint: "illegal", terminalResult: null, createdAt: h.server.runtime.clock.now() } });
      assert.equal(reset.status, "PRECONDITION_FAILED");
    });
  }
});

test("selection: host/auth/revisions/schema/capability and idempotent replay", async t => {
  const h = await harness(t), before = await h.sync(), command = h.selection(before, "HALLI_GALLI");
  assert.equal(h.failure(await h.send(h.members[1]!.client, command)), "HOST_ONLY");
  const stranger = await h.connect();
  assert.equal(h.failure(await h.send(stranger, command)), "UNAUTHENTICATED");
  assert.equal(h.failure(await h.send(h.host, { ...command, payload: { gameType: "UNKNOWN", gameId: null } })), "INVALID_PAYLOAD");
  assert.equal(h.failure(await h.send(h.host, { ...command, payload: { gameType: "HALLI_GALLI", gameId: "stale-game" } })), "STALE_GAME_REVISION");
  assert.equal(h.failure(await h.send(h.host, { ...command, expectedRoomRevision: 999 })), "STALE_ROOM_REVISION");
  const selected = h.success(await h.send(h.host, command));
  const ready = await h.readyAll();
  h.success(await h.send(h.host, command));
  assert.deepEqual((await h.sync()).room, ready.room);
  assert.equal(h.failure(await h.send(h.host, { ...command, payload: { gameType: "SPLENDOR", gameId: null } })), "REQUEST_ID_REUSED");
  const next = h.success(await h.send(h.host, h.selection(ready, "NUMBER_TILE")));
  assert.ok(next.room.players.every(p => p.isReady === false));
  assert.equal(h.failure(await h.call(h.host, "room:ready", { ready: true }, { expectedRoomRevision: selected.versions.roomRevision })), "STALE_ROOM_REVISION");
  const guest = h.members[1]!, replacement = await h.connect(["NUMBER_TILE"]);
  h.success(await h.call(replacement, "session:resume", { credential: { ...guest.credential, roomCode: next.room.roomCode }, lastSeenVersions: null }));
  assert.equal(h.failure(await h.send(h.host, h.selection(await h.sync(), "GEM_CARD"))), "INCOMPATIBLE_GAME_CAPABILITY");
  assert.equal(h.failure(await h.call(guest.client, "room:ready", { ready: true }, { expectedRoomRevision: next.versions.roomRevision })), "UNAUTHENTICATED");
});

test("finished -> lobby preserves credentials, removes explicit departures, ignores previous timer and request", async t => {
  const h = await harness(t);
  h.success(await h.send(h.host, h.selection(await h.sync(), "HALLI_GALLI")));
  const ready = await h.readyAll(); h.success(await h.call(h.host, "game:start", {}, { expectedRoomRevision: ready.versions.roomRevision }));
  const running = await h.server.runtime.persistence.findById(ready.room.roomId); assert.ok(running?.gameType === "HALLI_GALLI" && running.game);
  const deadline = { roomId: running.roomId, gameId: running.game.gameId, expectedGameRevision: running.game.gameRevision, turnId: v.parse(TurnIdSchema, running.game.state.transitionId), deadlineAt: h.server.runtime.clock.now() };
  const leave = v.parse(RoomLeaveAckSchema, await h.call(h.members[2]!.client, "room:leave", {}, { expectedRoomRevision: running.roomRevision, expectedGameRevision: running.game.gameRevision })); assert.ok(leave.ok);
  const end = await h.sync(); assert.equal(end.room.phase, "FINISHED");
  const command = h.selection(end, "SPLENDOR"), lobby = h.success(await h.send(h.host, command));
  assert.equal(lobby.room.players.length, 2); assert.equal(lobby.room.roomCode, running.roomCode);
  const replacement = await h.connect(), member = h.members[1]!;
  const resumed = h.success(await h.call(replacement, "session:resume", { credential: { ...member.credential, roomCode: lobby.room.roomCode }, lastSeenVersions: null }));
  assert.equal(resumed.self.playerId, member.playerId); member.client = replacement;
  h.members.pop(); const prepared = await h.readyAll();
  h.success(await h.call(h.host, "game:start", {}, { expectedRoomRevision: prepared.versions.roomRevision }));
  const fresh = await h.server.runtime.persistence.findById(running.roomId); assert.ok(fresh?.game);
  assert.notEqual(fresh.game.gameId, running.game.gameId);
  h.success(await h.send(h.host, command));
  assert.equal((await h.server.runtime.splendorService!.timeout(deadline)).status, "NO_OP");
  assert.deepEqual(await h.server.runtime.persistence.findById(running.roomId), fresh);
});

test("six players remain in a four-player game's lobby, start is blocked", async t => {
  const h = await harness(t, 6);
  const lobby = h.success(await h.send(h.host, h.selection(await h.sync(), "HANGUL_TILE")));
  assert.equal(lobby.room.players.length, 6); assert.equal((await h.sync(h.members[5]!.client)).room.players.length, 6);
  const ready = await h.readyAll();
  const result = v.parse(StateSyncWireAckSchema, await h.call(h.host, "game:start", {}, { expectedRoomRevision: ready.versions.roomRevision }));
  assert.equal(result.ok, false); assert.equal((await h.sync()).room.phase, "LOBBY");
});

test("every game's finished roster returns only remaining members to the same room", async t => {
  for (const gameType of SUPPORTED_GAME_TYPES) await t.test(gameType, async t => {
    const h = await harness(t, gameType === "LIAR_GAME" ? 4 : (gameType === "WORD_DUET" || gameType === "JAIPUR" || gameType === "LOST_CITIES") ? 2 : 3);
    h.success(await h.send(h.host, h.selection(await h.sync(), gameType)));
    const prepared = await h.readyAll();
    h.success(await h.call(h.host, "game:start", {}, { expectedRoomRevision: prepared.versions.roomRevision }));
    for (const member of h.members.slice(1)) {
      const current = await h.server.runtime.persistence.findById(prepared.room.roomId); assert.ok(current?.game);
      const ack = v.parse(RoomLeaveAckSchema, await h.call(member.client, "room:leave", {}, { expectedRoomRevision: current.roomRevision, expectedGameRevision: current.game.gameRevision })); assert.ok(ack.ok, ack.ok ? "" : ack.error.code);
    }
    // DRAW intentionally continues through reveal after departures. Finish via
    // its real deadline and reveal commands rather than changing that rule.
    if (gameType === "DRAW_RELAY") {
      let now = h.server.runtime.clock.now();
      t.mock.method(h.server.runtime.clock, "now", () => now);
      for (let step = 0; step < 40; step++) {
        const current = await h.server.runtime.persistence.findById(prepared.room.roomId);
        assert.ok(current?.gameType === "DRAW_RELAY" && current.game);
        if (current.phase === "FINISHED") break;
        const state = current.game.state;
        if (state.deadlineAt !== null) {
          now = v.parse((await import("@hangul-rummikub/shared")).ServerTimeSchema, state.deadlineAt);
          assert.equal((await h.server.runtime.drawRelayService!.timeout({ roomId: current.roomId, gameId: current.game.gameId,
            expectedGameRevision: current.game.gameRevision, turnId: v.parse(TurnIdSchema, state.stageToken), deadlineAt: now })).status, "APPLIED");
        } else {
          h.success(await h.call(h.host, "draw:revealNext", {}, { gameId: current.game.gameId, expectedGameRevision: current.game.gameRevision, stageToken: state.stageToken }));
        }
      }
    }
    const finished = await h.sync(); assert.equal(finished.room.phase, "FINISHED");
    const lobby = h.success(await h.send(h.host, h.selection(finished, "NUMBER_TILE")));
    assert.equal(lobby.room.roomCode, prepared.room.roomCode); assert.equal(lobby.room.players.length, 1);
    assert.equal(lobby.room.players[0]?.playerId, prepared.self.playerId); assert.equal(lobby.room.players[0]?.isReady, false);
    const oldGuest = h.members[1]!, reconnect = await h.connect();
    const rejected = v.parse(StateSyncWireAckSchema, await h.call(reconnect, "session:resume", { credential: { ...oldGuest.credential, roomCode: lobby.room.roomCode }, lastSeenVersions: null })); assert.equal(rejected.ok, false);
  });
});

test("competing selections commit once; revoked authority at commit cannot change the room", async t => {
  const h = await harness(t), snapshot = await h.sync();
  const replies = await Promise.all([h.send(h.host, h.selection(snapshot, "NUMBER_TILE")), h.send(h.host, h.selection(snapshot, "GEM_CARD"))]);
  assert.equal(replies.map(raw => v.parse(StateSyncWireAckSchema, raw)).filter(ack => ack.ok).length, 1);
  const before = await h.server.runtime.persistence.findById(snapshot.room.roomId); assert.ok(before);
  const command = v.parse((await import("@hangul-rummikub/shared")).RoomPreparationCommandSchema, h.selection(await h.sync(), "SPLENDOR"));
  let calls = 0;
  const result = await h.server.runtime.roomGameSelectionService.prepare({ roomId: before.roomId, actorPlayerId: h.members[0]!.playerId, command,
    authorization: { isCurrent: () => ++calls === 1 }, canRepresentGame: () => true });
  assert.equal(result.ok, false); assert.deepEqual(await h.server.runtime.persistence.findById(before.roomId), before);
});
