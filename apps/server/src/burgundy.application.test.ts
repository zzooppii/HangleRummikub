import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import * as v from "valibot";
import {
  SUPPORTED_GAME_TYPES,
  PlatformSnapshotV2Schema,
  SessionBootstrapAckSchema,
  StateSyncWireAckSchema,
  type GameType,
  type PlatformSnapshotV2,
} from "@hangul-rummikub/shared";
import { BURGUNDY_DEFAULT_SETTINGS } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";

type Client = Socket<
  Record<string, (value: unknown) => void>,
  Record<string, (value: unknown, ack: (value: unknown) => void) => void>
>;
type Command = {
  kind: string;
  protocolVersion: number;
  requestId: string;
  payload: unknown;
  [key: string]: unknown;
};
async function harness(t: TestContext, count = 2) {
  const server = createHttpServer({ serveWeb: false }),
    clients: Client[] = [];
  t.after(async () => {
    clients.forEach((c) => c.disconnect());
    await server.shutdown();
  });
  await new Promise<void>((resolve) =>
    server.httpServer.listen(0, "127.0.0.1", resolve),
  );
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  const port = address.port;
  let seq = 0;
  const request = (
    kind: string,
    payload: unknown = {},
    extra: Record<string, unknown> = {},
  ): Command => ({
    kind,
    protocolVersion: 1,
    requestId: `room-prepare-${++seq}`,
    payload,
    ...extra,
  });
  async function connect(types: readonly GameType[] = SUPPORTED_GAME_TYPES) {
    const client: Client = io(`http://127.0.0.1:${port}`, {
      transports: ["websocket"],
      forceNew: true,
      reconnection: false,
      auth: {
        supportsRoomPreparation: true,
        supportedSnapshotVersions: [2],
        supportedGameTypes: types,
      },
    });
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      client.once("connect", resolve);
      client.once("connect_error", reject);
    });
    return client;
  }
  const send = (client: Client, command: Command) =>
    new Promise<unknown>((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error(`Missing ${command.kind} acknowledgement`)),
        5000,
      );
      client.emit(command.kind, command, (value) => {
        clearTimeout(timer);
        resolve(value);
      });
    });
  const call = (
    client: Client,
    kind: string,
    payload: unknown = {},
    extra: Record<string, unknown> = {},
  ) => send(client, request(kind, payload, extra));
  const success = (raw: unknown) => {
    const ack = v.parse(StateSyncWireAckSchema, raw);
    assert.ok(ack.ok, ack.ok ? "" : JSON.stringify(ack.error));
    return v.parse(PlatformSnapshotV2Schema, ack.data.snapshot);
  };
  const failure = (raw: unknown) => {
    const ack = v.parse(StateSyncWireAckSchema, raw);
    assert.equal(ack.ok, false);
    if (ack.ok) throw new Error("Expected failure");
    return ack.error.code;
  };
  const bootstrap = async (client: Client) => {
    const ack = v.parse(
      SessionBootstrapAckSchema,
      await call(client, "session:bootstrap"),
    );
    assert.ok(ack.ok);
    return ack.data.credential;
  };
  const host = await connect(),
    hostCredential = await bootstrap(host);
  let lobby = success(
    await call(host, "room:create", {
      bootstrapCredential: hostCredential,
      nickname: "방장",
      gameType: count > 5 ? "WOLF_NIGHT" : "BURGUNDY",
    }),
  );
  const members = [
    { client: host, credential: hostCredential, playerId: lobby.self.playerId },
  ];
  for (let i = 1; i < count; i++) {
    const client = await connect(),
      credential = await bootstrap(client);
    lobby = success(
      await call(client, "room:join", {
        bootstrapCredential: credential,
        nickname: `참가${i}`,
        roomCode: lobby.room.roomCode,
      }),
    );
    members.push({ client, credential, playerId: lobby.self.playerId });
  }
  const sync = async (client = host) =>
    success(await call(client, "state:sync"));
  function selection(
    snapshot: PlatformSnapshotV2,
    gameType: GameType,
  ): Command {
    const game = snapshot.game;
    return request(
      "room:selectGame",
      {
        gameType,
        gameId:
          game === null
            ? null
            : "gameId" in game
              ? game.gameId
              : game.publicState.gameId,
      },
      {
        expectedRoomRevision: snapshot.versions.roomRevision,
        expectedGameRevision: game?.gameRevision ?? null,
      },
    );
  }
  async function readyAll() {
    for (const member of members) {
      const current = await sync(member.client);
      success(
        await call(
          member.client,
          "room:ready",
          { ready: true },
          { expectedRoomRevision: current.versions.roomRevision },
        ),
      );
    }
    return sync();
  }
  return {
    server,
    host,
    members,
    lobby,
    connect,
    bootstrap,
    request,
    send,
    call,
    success,
    failure,
    sync,
    selection,
    readyAll,
  };
}

function burgundy(snapshot: PlatformSnapshotV2) {
  if (snapshot.game?.gameType !== "BURGUNDY")
    throw new Error("Expected Burgundy game.");
  return snapshot.game;
}
type Harness = Awaited<ReturnType<typeof harness>>;
async function start(h: Harness) {
  const s = await h.sync();
  return h.success(
    await h.call(
      h.host,
      "game:start",
      {},
      { expectedRoomRevision: s.versions.roomRevision },
    ),
  );
}
function action(h: Harness, s: PlatformSnapshotV2, payload: unknown) {
  const g = burgundy(s);
  if (g.phase !== "PLAYING") throw new Error("Expected playing phase.");
  return h.request("burgundy:act", payload, {
    gameId: g.gameId,
    expectedGameRevision: g.gameRevision,
    turnId: g.turnId,
  });
}
test("BURGUNDY socket: host settings are validated and configure 2–4 player deadlines", async (t) => {
  for (const count of [2, 3, 4]) {
    const h = await harness(t, count),
      lobby = await h.sync();
    const configured = h.success(
      await h.call(
        h.host,
        "burgundy:configure",
        { ...BURGUNDY_DEFAULT_SETTINGS, turnSeconds: 30 },
        { expectedRoomRevision: lobby.versions.roomRevision },
      ),
    );
    assert.equal(configured.room.gameType, "BURGUNDY");
    const s = await start(h),
      g = burgundy(s);
    assert.equal(g.playerStates.length, count);
    if (g.phase !== "PLAYING") throw new Error("Expected game.");
    assert.equal(g.deadlineAt - g.turnStartedAt, 30_000);
    assert.equal(
      (await h.server.runtime.persistence.listActiveTurnDeadlines()).some(
        (d) => d.roomId === s.room.roomId,
      ),
      true,
    );
  }
});
test("BURGUNDY socket: unavailable rules and non-host configure are rejected without mutation", async (t) => {
  const h = await harness(t),
    s = await h.sync();
  for (const settings of [
    { ...BURGUNDY_DEFAULT_SETTINGS, boardId: 30 },
    { ...BURGUNDY_DEFAULT_SETTINGS, turnSeconds: 45 },
  ]) {
    assert.equal(
      h.failure(
        await h.call(h.host, "burgundy:configure", settings, {
          expectedRoomRevision: s.versions.roomRevision,
        }),
      ),
      "INVALID_PAYLOAD",
    );
  }
  assert.equal(
    h.failure(
      await h.call(
        h.members[1]!.client,
        "burgundy:configure",
        BURGUNDY_DEFAULT_SETTINGS,
        { expectedRoomRevision: s.versions.roomRevision },
      ),
    ),
    "HOST_ONLY",
  );
  assert.equal((await h.sync()).versions.roomRevision, s.versions.roomRevision);
});
test("BURGUNDY socket: wrong actor, injected values, hidden tile probes and stale revision are atomic", async (t) => {
  const h = await harness(t),
    s = await start(h),
    g = burgundy(s);
  if (g.phase !== "PLAYING") throw new Error();
  const actor = h.members.find((p) => p.playerId === g.activePlayerId)!,
    other = h.members.find((p) => p !== actor)!;
  const before = await h.server.runtime.persistence.findById(s.room.roomId);
  assert.equal(
    h.failure(
      await h.send(other.client, action(h, s, { type: "WORKERS", die: 0 })),
    ),
    "NOT_YOUR_TURN",
  );
  assert.equal(
    h.failure(
      await h.send(
        actor.client,
        action(h, s, { type: "WORKERS", die: 0, silver: 99 }),
      ),
    ),
    "INVALID_PAYLOAD",
  );
  const value = g.playerStates.find((p) => p.playerId === g.activePlayerId)!
    .dice[0].value;
  assert.equal(
    h.failure(
      await h.send(
        actor.client,
        action(h, s, { type: "TAKE", die: 0, value, tileId: "hidden-probe" }),
      ),
    ),
    "RULE_VIOLATION",
  );
  assert.equal(
    h.failure(
      await h.send(actor.client, {
        ...action(h, s, { type: "WORKERS", die: 0 }),
        turnId: "past-turn",
      }),
    ),
    "STALE_GAME_REVISION",
  );
  assert.deepEqual(
    await h.server.runtime.persistence.findById(s.room.roomId),
    before,
  );
  const room = before;
  assert.ok(room?.gameType === "BURGUNDY" && room.game);
  const hiddenIds: readonly string[] = room.game.state.supply;
  for (const member of h.members) {
    const projected = JSON.stringify(burgundy(await h.sync(member.client)));
    for (const id of hiddenIds)
      assert.equal(projected.includes(`"${id}"`), false);
  }
});
test("BURGUNDY socket: idempotent retry commits once and concurrent actions serialize", async (t) => {
  const h = await harness(t),
    s = await start(h),
    g = burgundy(s);
  if (g.phase !== "PLAYING") throw new Error();
  const actor = h.members.find((p) => p.playerId === g.activePlayerId)!,
    command = action(h, s, { type: "WORKERS", die: 0 });
  h.success(await h.send(actor.client, command));
  const before = await h.server.runtime.persistence.findById(s.room.roomId);
  h.success(await h.send(actor.client, command));
  assert.deepEqual(
    await h.server.runtime.persistence.findById(s.room.roomId),
    before,
  );
  assert.equal(
    h.failure(
      await h.send(actor.client, {
        ...command,
        payload: { type: "WORKERS", die: 1 },
      }),
    ),
    "REQUEST_ID_REUSED",
  );
  const second = action(h, await h.sync(), { type: "WORKERS", die: 1 });
  const results = await Promise.all([
    h.send(actor.client, second),
    h.send(actor.client, { ...second, requestId: "parallel-burgundy" }),
  ]);
  assert.equal(
    results.map((r) => v.parse(StateSyncWireAckSchema, r)).filter((r) => r.ok)
      .length,
    1,
  );
});
