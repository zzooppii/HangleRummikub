import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import {
  SplendorLobbyPlatformSnapshotV2Schema,
  SplendorPlayingPlatformSnapshotV2Schema,
  SplendorFinishedPlatformSnapshotV2Schema,
  SessionBootstrapAckSchema,
  StateSyncWireAckSchema,
  RoomLeaveAckSchema,
  ServerTimeSchema,
  TurnIdSchema,
} from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";
type Client = Socket<
  Record<string, (value: unknown) => void>,
  Record<string, (value: unknown, ack: (value: unknown) => void) => void>
>;
async function harness(t: TestContext, count = 3, start = true) {
  const server = createHttpServer({ serveWeb: false }),
    clients: Client[] = [];
  t.after(async () => {
    clients.forEach((c) => c.disconnect());
    await server.shutdown();
  });
  await new Promise<void>((r) => server.httpServer.listen(0, "127.0.0.1", r));
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  let seq = 0,
    now = server.runtime.clock.now();
  t.mock.method(server.runtime.clock, "now", () => now);
  t.mock.method(
    server.runtime.splendorService!.deps.random,
    "nextInt",
    (n: number) => n - 1,
  );
  async function connect(types = ["SPLENDOR"]) {
    const c: Client = io(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      auth: { supportedSnapshotVersions: [2], supportedGameTypes: types },
    });
    clients.push(c);
    await new Promise<void>((r, j) => {
      c.once("connect", r);
      c.once("connect_error", j);
    });
    return c;
  }
  const request = (
    kind: string,
    payload: unknown = {},
    extra: Record<string, unknown> = {},
  ): {
    kind: string;
    protocolVersion: number;
    requestId: string;
    payload: unknown;
    [key: string]: unknown;
  } => ({
    kind,
    protocolVersion: 1,
    requestId: `splendor-${++seq}`,
    payload,
    ...extra,
  });
  const send = (c: Client, command: ReturnType<typeof request>) =>
    new Promise<unknown>((r, j) => {
      const timer = setTimeout(
        () => j(new Error(`Missing ${command.kind} ACK`)),
        4000,
      );
      c.emit(command.kind, command, (result) => {
        clearTimeout(timer);
        r(result);
      });
    });
  const call = (
    c: Client,
    kind: string,
    payload: unknown = {},
    extra: Record<string, unknown> = {},
  ) => send(c, request(kind, payload, extra));
  const success = (value: unknown) => {
    const ack = parse(StateSyncWireAckSchema, value);
    assert.ok(ack.ok, ack.ok ? "" : ack.error.code);
    return ack.data.snapshot;
  };
  const failure = (value: unknown) => {
    const ack = parse(StateSyncWireAckSchema, value);
    assert.equal(ack.ok, false);
    if (ack.ok) throw new Error();
    return ack.error.code;
  };
  async function bootstrap(c: Client) {
    const ack = parse(
      SessionBootstrapAckSchema,
      await call(c, "session:bootstrap"),
    );
    assert.ok(ack.ok);
    return ack.data.credential;
  }
  const host = await connect(),
    credential = await bootstrap(host);
  let lobby = parse(
    SplendorLobbyPlatformSnapshotV2Schema,
    success(
      await call(host, "room:create", {
        bootstrapCredential: credential,
        nickname: "상인1",
        gameType: "SPLENDOR",
      }),
    ),
  );
  const members = [{ client: host, playerId: lobby.self.playerId, credential }];
  for (let i = 1; i < count; i++) {
    const c = await connect(),
      credential = await bootstrap(c);
    lobby = parse(
      SplendorLobbyPlatformSnapshotV2Schema,
      success(
        await call(c, "room:join", {
          bootstrapCredential: credential,
          nickname: `상인${i + 1}`,
          roomCode: lobby.room.roomCode,
        }),
      ),
    );
    members.push({ client: c, playerId: lobby.self.playerId, credential });
  }
  if (start)
    success(
      await call(
        host,
        "game:start",
        {},
        { expectedRoomRevision: lobby.versions.roomRevision },
      ),
    );
  async function stored() {
    const room = await server.runtime.persistence.findById(lobby.room.roomId);
    assert.ok(room?.gameType === "SPLENDOR" && room.game);
    return room;
  }
  const sync = async (c = host) => success(await call(c, "state:sync"));
  function time(at: number) {
    now = parse(ServerTimeSchema, at);
  }
  async function advance() {
    const room = await stored(),
      s = room.game!.state;
    time(s.nextTransitionAt!);
    const deadline = {
      roomId: room.roomId,
      gameId: room.game!.gameId,
      expectedGameRevision: room.game!.gameRevision,
      turnId: parse(TurnIdSchema, s.transitionId),
      deadlineAt: now,
    };
    assert.equal(
      (await server.runtime.splendorService!.timeout(deadline)).status,
      "APPLIED",
    );
    assert.equal(
      (await server.runtime.splendorService!.timeout(deadline)).status,
      "NO_OP",
    );
    return deadline;
  }
  async function finishByExhaustion() {
    for (let i = 0; i < count * 3 && (await stored()).phase === "PLAYING"; i++)
      await advance();
    const end = parse(SplendorFinishedPlatformSnapshotV2Schema, await sync());
    assert.equal(end.game.result.reason, "INACTIVE");
    assert.deepEqual(end.game.result.winnerPlayerIds, []);
    return end;
  }
  return {
    finishByExhaustion,
    server,
    connect,
    bootstrap,
    request,
    send,
    call,
    success,
    failure,
    lobby,
    members,
    stored,
    sync,
    time,
    advance,
  };
}

test("SPLENDOR finished result, host rematch, old callbacks and old commands isolation", async (t) => {
  const h = await harness(t, 2),
    host = h.members[0]!,
    first = parse(SplendorPlayingPlatformSnapshotV2Schema, await h.sync());
  const room = await h.stored();
  const oldTimer = {
    roomId: room.roomId,
    gameId: room.game!.gameId,
    expectedGameRevision: room.game!.gameRevision,
    turnId: parse(TurnIdSchema, room.game!.state.transitionId),
    deadlineAt: parse(ServerTimeSchema, room.game!.state.nextTransitionAt),
  };
  const end = await h.finishByExhaustion();
  assert.equal(h.server.runtime.turnScheduler.scheduledCount, 0);
  const extra = {
    gameId: end.game.gameId,
    expectedGameRevision: end.game.gameRevision,
    expectedRoomRevision: end.versions.roomRevision,
  };
  assert.equal(
    h.failure(
      await h.call(h.members[1]!.client, "splendor:rematch", {}, extra),
    ),
    "HOST_ONLY",
  );
  const lobby = parse(
    SplendorLobbyPlatformSnapshotV2Schema,
    h.success(await h.call(host.client, "splendor:rematch", {}, extra)),
  );
  const next = parse(
    SplendorPlayingPlatformSnapshotV2Schema,
    h.success(
      await h.call(
        host.client,
        "game:start",
        {},
        { expectedRoomRevision: lobby.versions.roomRevision },
      ),
    ),
  );
  assert.notEqual(next.game.gameId, first.game.gameId);
  assert.equal(
    (await h.server.runtime.splendorService!.timeout(oldTimer)).status,
    "NO_OP",
  );
  assert.equal(
    h.failure(
      await h.call(host.client, "splendor:act", take(), {
        gameId: first.game.gameId,
        expectedGameRevision: 0,
        turnId: first.game.turnId,
      }),
    ),
    "STALE_GAME_REVISION",
  );
});

test("SPLENDOR four-player capacity, start host and current revision", async (t) => {
  const h = await harness(t, 4, false),
    host = h.members[0]!,
    extra = { expectedRoomRevision: h.lobby.versions.roomRevision };
  const c = await h.connect(),
    credential = await h.bootstrap(c);
  assert.equal(
    h.failure(
      await h.call(c, "room:join", {
        bootstrapCredential: credential,
        nickname: "다섯",
        roomCode: h.lobby.room.roomCode,
      }),
    ),
    "ROOM_FULL",
  );
  assert.equal(
    h.failure(await h.call(h.members[1]!.client, "game:start", {}, extra)),
    "HOST_ONLY",
  );
  assert.equal(
    h.failure(
      await h.call(
        host.client,
        "game:start",
        {},
        { expectedRoomRevision: 999 },
      ),
    ),
    "STALE_ROOM_REVISION",
  );
  h.success(await h.call(host.client, "game:start", {}, extra));
});

test("SPLENDOR explicit leave cancels game, preserves result and removes departed player on rematch", async (t) => {
  const h = await harness(t),
    room = await h.stored(),
    host = h.members[0]!;
  const leave = parse(
    RoomLeaveAckSchema,
    await h.call(
      h.members[2]!.client,
      "room:leave",
      {},
      {
        expectedRoomRevision: room.roomRevision,
        expectedGameRevision: room.game!.gameRevision,
      },
    ),
  );
  assert.ok(leave.ok);
  const end = parse(SplendorFinishedPlatformSnapshotV2Schema, await h.sync());
  assert.equal(end.game.result.reason, "CANCELLED");
  const lobby = parse(
    SplendorLobbyPlatformSnapshotV2Schema,
    h.success(
      await h.call(
        host.client,
        "splendor:rematch",
        {},
        {
          gameId: end.game.gameId,
          expectedGameRevision: end.game.gameRevision,
          expectedRoomRevision: end.versions.roomRevision,
        },
      ),
    ),
  );
  assert.equal(lobby.room.players.length, 2);
});

test("SPLENDOR timer recovery continues past fifteen minutes using server Clock", async (t) => {
  const h = await harness(t, 3, false),
    runtime = h.server.runtime;
  const diagnostic = t.mock.method(console, "error", () => undefined);
  const schedule = t.mock.method(
    runtime.turnScheduler,
    "scheduleTimeout",
    async () => {
      throw new Error("offline scheduler");
    },
  );
  h.success(
    await h.call(
      h.members[0]!.client,
      "game:start",
      {},
      { expectedRoomRevision: h.lobby.versions.roomRevision },
    ),
  );
  assert.equal(diagnostic.mock.callCount(), 1);
  schedule.mock.restore();
  const room = await h.stored();
  h.time(room.game!.state.nextTransitionAt!);
  assert.equal(await runtime.overdueTurnSweeper.sweepOnce(), 1);
  const current = await h.stored();
  h.time(current.game!.state.startedAt + 900_000);
  assert.equal(await runtime.overdueTurnSweeper.sweepOnce(), 1);
  const ongoing = parse(
    SplendorPlayingPlatformSnapshotV2Schema,
    await h.sync(),
  );
  assert.equal(ongoing.game.gameRevision, current.game!.gameRevision + 1);
  assert.equal(runtime.turnScheduler.scheduledCount, 1);
});

test("SPLENDOR finished offline host transfers after 60 seconds without changing result", async (t) => {
  const h = await harness(t, 2);
  await h.finishByExhaustion();
  const before = (await h.stored()).game!,
    runtime = h.server.runtime,
    host = h.members[0]!;
  const binding = runtime.connectionRegistry
    .listActiveBindings(h.lobby.room.roomId)
    .find((b) => b.playerId === host.playerId)!;
  runtime.connectionRegistry.disconnect(
    binding.socketId,
    binding.connectionGeneration,
  );
  const at = runtime.clock.now();
  runtime.splendorHostSuccession!.disconnected(
    h.lobby.room.roomId,
    host.playerId,
    at,
  );
  h.time(at + 59999);
  assert.equal(
    await runtime.splendorHostSuccession!.evaluate(h.lobby.room.roomId),
    false,
  );
  h.time(at + 60000);
  assert.equal(
    await runtime.splendorHostSuccession!.evaluate(h.lobby.room.roomId),
    true,
  );
  const after = await h.stored();
  assert.equal(after.hostPlayerId, h.members[1]!.playerId);
  assert.deepEqual(after.game, before);
});

const zero = () => ({ WHITE: 0, BLUE: 0, GREEN: 0, RED: 0, BLACK: 0, GOLD: 0 });
const take = () => ({
  kind: "TAKE",
  tokens: { ...zero(), WHITE: 1, BLUE: 1, GREEN: 1 },
  returns: zero(),
  nobleId: null,
});
for (const count of [2, 3, 4])
  test(`SPLENDOR raw ${count}-player action, duplicate retry, privacy and timeout`, async (t) => {
    const h = await harness(t, count),
      first = parse(SplendorPlayingPlatformSnapshotV2Schema, await h.sync()),
      host = h.members[0]!;
    const scope = {
      gameId: first.game.gameId,
      expectedGameRevision: first.game.gameRevision,
      turnId: first.game.turnId,
    };
    assert.equal(
      h.failure(
        await h.call(h.members[1]!.client, "splendor:act", take(), scope),
      ),
      "NOT_YOUR_TURN",
    );
    const room = await h.stored(),
      hidden = room.game!.state.market.flatMap((t) => t.deck);
    for (const member of h.members) {
      const wire = JSON.stringify(await h.sync(member.client));
      assert.ok(hidden.every((id) => !wire.includes(id)));
      assert.ok(!wire.includes('"sessionToken"'));
      assert.ok(!wire.includes('"deck":'));
    }
    const req = h.request("splendor:act", take(), scope);
    const acks = await Promise.all([
      h.send(host.client, req),
      h.send(host.client, req),
    ]);
    acks.forEach(h.success);
    assert.equal((await h.stored()).game!.gameRevision, 1);
    assert.equal(
      h.failure(
        await h.send(host.client, {
          ...req,
          payload: { ...take(), tokens: { ...zero(), RED: 2 } },
        }),
      ),
      "REQUEST_ID_REUSED",
    );
    assert.equal(
      h.failure(await h.call(host.client, "splendor:act", take(), scope)),
      "STALE_GAME_REVISION",
    );
    await h.advance();
    assert.equal((await h.stored()).game!.gameRevision, 2);
    assert.equal(h.server.runtime.turnScheduler.scheduledCount, 1);
  });
test("SPLENDOR secret reserve only reaches its owner; resume replaces old connection", async (t) => {
  const h = await harness(t),
    host = h.members[0]!,
    first = parse(SplendorPlayingPlatformSnapshotV2Schema, await h.sync());
  const reserved = parse(
    SplendorPlayingPlatformSnapshotV2Schema,
    h.success(
      await h.call(
        host.client,
        "splendor:act",
        { kind: "RESERVE_DECK", tier: 3, returns: zero(), nobleId: null },
        {
          gameId: first.game.gameId,
          expectedGameRevision: 0,
          turnId: first.game.turnId,
        },
      ),
    ),
  );
  const card = reserved.game.privateState.reserved[0]!;
  assert.equal(reserved.game.privateState.reserved.length, 1);
  assert.equal(reserved.game.playerStates[0]!.tokens.GOLD, 1);
  for (const member of h.members.slice(1)) {
    const wire = parse(
      SplendorPlayingPlatformSnapshotV2Schema,
      await h.sync(member.client),
    );
    assert.equal(wire.game.playerStates[0]!.reservedCount, 1);
    assert.equal(wire.game.privateState.reserved.length, 0);
    assert.ok(!JSON.stringify(wire).includes(card.cardId));
  }
  const before = (await h.stored()).game,
    replacement = await h.connect();
  const resumed = parse(
    SplendorPlayingPlatformSnapshotV2Schema,
    h.success(
      await h.call(replacement, "session:resume", {
        credential: { ...host.credential, roomCode: h.lobby.room.roomCode },
        lastSeenVersions: null,
      }),
    ),
  );
  assert.deepEqual(resumed.game.privateState.reserved, [card]);
  assert.deepEqual((await h.stored()).game, before);
  assert.equal(
    h.failure(
      await h.call(host.client, "splendor:act", take(), {
        gameId: first.game.gameId,
        expectedGameRevision: 1,
        turnId: resumed.game.turnId,
      }),
    ),
    "UNAUTHENTICATED",
  );
  const old = await h.connect(["GEM_CARD"]),
    credential = await h.bootstrap(old);
  assert.equal(
    h.failure(
      await h.call(old, "room:join", {
        bootstrapCredential: credential,
        nickname: "이전",
        roomCode: h.lobby.room.roomCode,
      }),
    ),
    "INCOMPATIBLE_GAME_CAPABILITY",
  );
});
test("SPLENDOR invalid action is atomic; deadline race advances exactly once", async (t) => {
  const h = await harness(t),
    host = h.members[0]!,
    first = parse(SplendorPlayingPlatformSnapshotV2Schema, await h.sync()),
    before = await h.stored();
  const scope = {
    gameId: first.game.gameId,
    expectedGameRevision: 0,
    turnId: first.game.turnId,
  };
  assert.equal(
    h.failure(
      await h.call(
        host.client,
        "splendor:act",
        { ...take(), tokens: { ...zero(), GOLD: 1 } },
        scope,
      ),
    ),
    "INVALID_PAYLOAD",
  );
  assert.deepEqual((await h.stored()).game, before.game);
  assert.equal(
    h.failure(
      await h.call(
        host.client,
        "splendor:act",
        { ...take(), cheat: true },
        scope,
      ),
    ),
    "INVALID_PAYLOAD",
  );
  h.time(first.game.deadlineAt);
  const deadline = {
    roomId: first.room.roomId,
    gameId: first.game.gameId,
    expectedGameRevision: first.game.gameRevision,
    turnId: first.game.turnId,
    deadlineAt: first.game.deadlineAt,
  };
  const [ack, timeout] = await Promise.all([
    h.call(host.client, "splendor:act", take(), scope),
    h.server.runtime.splendorService!.timeout(deadline),
  ]);
  assert.ok(["TURN_EXPIRED", "STALE_GAME_REVISION"].includes(h.failure(ack)));
  assert.equal(timeout.status, "APPLIED");
  assert.equal((await h.stored()).game!.gameRevision, 1);
  assert.equal(
    (await h.server.runtime.splendorService!.timeout(deadline)).status,
    "NO_OP",
  );
});
