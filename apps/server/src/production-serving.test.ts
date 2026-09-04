import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";

import {
  NicknameSchema,
  PROTOCOL_VERSION,
  RequestIdSchema,
  type ClientToServerEvents,
  type GameStartAck,
  type RoomCreateAck,
  type RoomJoinAck,
  type ServerToClientEvents,
  type SessionBootstrapAck,
  type SessionResumeAck,
} from "@hangul-rummikub/shared";
import {
  io as createSocketClient,
  type Socket as SocketIoClient,
} from "socket.io-client";
import { parse } from "valibot";

import { createHttpServer } from "./server.js";

const INDEX_MARKER = "phase-18-production-shell";
const ASSET_NAME = "index-a1b2c3d4.js";
const NETWORK_TIMEOUT_MS = 2_000;

type ProductionClient = SocketIoClient<
  ServerToClientEvents,
  ClientToServerEvents
>;

function createWebBuildFixture(): string {
  const webDistPath = mkdtempSync(join(tmpdir(), "hangul-web-dist-"));
  const assetsPath = join(webDistPath, "assets");
  mkdirSync(assetsPath);
  writeFileSync(
    join(webDistPath, "index.html"),
    `<!doctype html><html><body>${INDEX_MARKER}<script type="module" src="/assets/${ASSET_NAME}"></script></body></html>`,
  );
  writeFileSync(join(assetsPath, ASSET_NAME), "globalThis.__PHASE_18__ = true;");
  return webDistPath;
}

async function listen(
  server: ReturnType<typeof createHttpServer>,
): Promise<string> {
  server.httpServer.listen(0, "127.0.0.1");
  await once(server.httpServer, "listening");
  const address = server.httpServer.address();
  if (address === null || typeof address === "string") {
    throw new Error("Production test server did not bind to a TCP port.");
  }
  return `http://127.0.0.1:${address.port}`;
}

async function waitForSocketConnection(
  socket: ProductionClient,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      reject(new Error("Timed out connecting to the production Socket.IO server."));
    }, NETWORK_TIMEOUT_MS);
    const handleConnect = (): void => {
      clearTimeout(timeout);
      socket.off("connect_error", handleConnectError);
      resolve();
    };
    const handleConnectError = (error: Error): void => {
      clearTimeout(timeout);
      socket.off("connect", handleConnect);
      reject(error);
    };
    socket.once("connect", handleConnect);
    socket.once("connect_error", handleConnectError);
  });
}

async function waitForSocketRejection(
  socket: ProductionClient,
): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      reject(new Error("Timed out waiting for Socket.IO origin rejection."));
    }, NETWORK_TIMEOUT_MS);
    const handleConnect = (): void => {
      clearTimeout(timeout);
      socket.off("connect_error", handleConnectError);
      reject(new Error("Cross-origin Socket.IO connection was accepted."));
    };
    const handleConnectError = (): void => {
      clearTimeout(timeout);
      socket.off("connect", handleConnect);
      resolve();
    };
    socket.once("connect", handleConnect);
    socket.once("connect_error", handleConnectError);
  });
}

function createProductionClient(
  origin: string,
  requestOrigin: string | undefined = origin,
): ProductionClient {
  // socket.io-client's v4.8 public io() overload erases event-map generics.
  // Keep the assertion at this test transport adapter boundary.
  return createSocketClient(origin, {
    ...(requestOrigin === undefined
      ? {}
      : { extraHeaders: { Origin: requestOrigin } }),
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  }) as ProductionClient;
}

async function connectProductionClient(
  origin: string,
  requestOrigin: string | undefined = origin,
): Promise<ProductionClient> {
  const socket = createProductionClient(origin, requestOrigin);
  const connected = waitForSocketConnection(socket);
  socket.connect();
  await connected;
  return socket;
}

function emitWithAck<TAcknowledgement>(
  label: string,
  emit: (
    acknowledge: (acknowledgement: TAcknowledgement) => void,
  ) => void,
): Promise<TAcknowledgement> {
  return new Promise<TAcknowledgement>((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timed out waiting for ${label} acknowledgement.`));
    }, NETWORK_TIMEOUT_MS);
    emit((acknowledgement) => {
      clearTimeout(timeout);
      resolve(acknowledgement);
    });
  });
}

test("production server는 health, SPA routes, hashed assets와 Socket.IO를 한 origin에서 제공한다", async () => {
  const webDistPath = createWebBuildFixture();
  const server = createHttpServer({ serveWeb: true, webDistPath });

  try {
    const origin = await listen(server);

    const healthResponse = await fetch(`${origin}/health`);
    assert.equal(healthResponse.status, 200);
    assert.deepEqual(await healthResponse.json(), { ok: true });

    for (const path of ["/", "/room/ABC234", "/unknown/spa/route"]) {
      const response = await fetch(`${origin}${path}`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /text\/html/);
      assert.equal(response.headers.get("cache-control"), "no-cache");
      assert.match(await response.text(), new RegExp(INDEX_MARKER));
    }

    const assetResponse = await fetch(`${origin}/assets/${ASSET_NAME}`);
    assert.equal(assetResponse.status, 200);
    assert.match(
      assetResponse.headers.get("cache-control") ?? "",
      /max-age=31536000/,
    );
    assert.match(assetResponse.headers.get("cache-control") ?? "", /immutable/);
    assert.match(await assetResponse.text(), /__PHASE_18__/);

    const missingAssetResponse = await fetch(`${origin}/assets/missing.js`);
    assert.equal(missingAssetResponse.status, 404);
    assert.doesNotMatch(await missingAssetResponse.text(), new RegExp(INDEX_MARKER));

    const sourceProbeResponse = await fetch(`${origin}/package.json`);
    assert.equal(sourceProbeResponse.status, 404);
    assert.doesNotMatch(await sourceProbeResponse.text(), /hangul-rummikub/);

    const unknownApiResponse = await fetch(`${origin}/api/missing`);
    assert.equal(unknownApiResponse.status, 404);
    assert.doesNotMatch(
      await unknownApiResponse.text(),
      new RegExp(INDEX_MARKER),
    );

    const postResponse = await fetch(`${origin}/room/ABC234`, {
      method: "POST",
    });
    assert.equal(postResponse.status, 404);
    assert.doesNotMatch(await postResponse.text(), new RegExp(INDEX_MARKER));

    const pollingResponse = await fetch(
      `${origin}/socket.io/?EIO=4&transport=polling`,
      { headers: { Origin: origin } },
    );
    assert.equal(pollingResponse.status, 200);
    assert.match(await pollingResponse.text(), /^0\{/);

    const socket = createProductionClient(origin);
    try {
      const connected = waitForSocketConnection(socket);
      socket.connect();
      await connected;
      assert.equal(socket.connected, true);
    } finally {
      socket.disconnect();
    }

    const crossOriginSocket = createProductionClient(
      origin,
      "https://attacker.example",
    );
    try {
      const rejected = waitForSocketRejection(crossOriginSocket);
      crossOriginSocket.connect();
      await rejected;
      assert.equal(crossOriginSocket.connected, false);
    } finally {
      crossOriginSocket.disconnect();
    }
  } finally {
    await server.shutdown();
    rmSync(webDistPath, { recursive: true, force: true });
  }
});

test("production same-origin Socket.IO에서 bootstrap, create, join과 start가 동작한다", async () => {
  const webDistPath = createWebBuildFixture();
  const server = createHttpServer({ serveWeb: true, webDistPath });
  let host: ProductionClient | undefined;
  let guest: ProductionClient | undefined;

  try {
    const origin = await listen(server);
    host = await connectProductionClient(origin);

    const hostBootstrap = await emitWithAck<SessionBootstrapAck>(
      "host session:bootstrap",
      (acknowledge) => {
        host?.emit(
          "session:bootstrap",
          {
            kind: "session:bootstrap",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-host-bootstrap"),
            payload: {},
          },
          acknowledge,
        );
      },
    );
    assert.equal(hostBootstrap.ok, true);
    if (!hostBootstrap.ok) {
      throw new Error("Host bootstrap unexpectedly failed.");
    }

    const createAck = await emitWithAck<RoomCreateAck>(
      "room:create",
      (acknowledge) => {
        host?.emit(
          "room:create",
          {
            kind: "room:create",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-room-create"),
            payload: {
              bootstrapCredential: hostBootstrap.data.credential,
              nickname: parse(NicknameSchema, "배포호스트"),
            },
          },
          acknowledge,
        );
      },
    );
    assert.equal(createAck.ok, true);
    if (!createAck.ok || createAck.scope !== "ROOM") {
      throw new Error("Production Room create unexpectedly failed.");
    }
    assert.equal(createAck.data.snapshot.room.phase, "LOBBY");
    assert.equal(createAck.data.snapshot.room.players.length, 1);

    guest = await connectProductionClient(origin);
    const guestBootstrap = await emitWithAck<SessionBootstrapAck>(
      "guest session:bootstrap",
      (acknowledge) => {
        guest?.emit(
          "session:bootstrap",
          {
            kind: "session:bootstrap",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-guest-bootstrap"),
            payload: {},
          },
          acknowledge,
        );
      },
    );
    assert.equal(guestBootstrap.ok, true);
    if (!guestBootstrap.ok) {
      throw new Error("Guest bootstrap unexpectedly failed.");
    }

    const joinAck = await emitWithAck<RoomJoinAck>(
      "room:join",
      (acknowledge) => {
        guest?.emit(
          "room:join",
          {
            kind: "room:join",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-room-join"),
            payload: {
              bootstrapCredential: guestBootstrap.data.credential,
              nickname: parse(NicknameSchema, "배포게스트"),
              roomCode: createAck.data.snapshot.room.roomCode,
            },
          },
          acknowledge,
        );
      },
    );
    assert.equal(joinAck.ok, true);
    if (!joinAck.ok || joinAck.scope !== "ROOM") {
      throw new Error("Production Room join unexpectedly failed.");
    }
    assert.equal(joinAck.data.snapshot.room.players.length, 2);

    const startAck = await emitWithAck<GameStartAck>(
      "game:start",
      (acknowledge) => {
        host?.emit(
          "game:start",
          {
            kind: "game:start",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-game-start"),
            expectedRoomRevision:
              joinAck.data.snapshot.versions.roomRevision,
            payload: {},
          },
          acknowledge,
        );
      },
    );
    assert.equal(startAck.ok, true);
    if (!startAck.ok || startAck.scope !== "ROOM") {
      throw new Error("Production Game start unexpectedly failed.");
    }
    assert.equal(startAck.data.snapshot.room.phase, "PLAYING");
    assert.equal(startAck.data.snapshot.room.players.length, 2);
    assert.equal(startAck.data.snapshot.self.rack.length, 14);
    assert.equal(startAck.data.snapshot.game.bagCounts.consonant, 81);
    assert.equal(startAck.data.snapshot.game.bagCounts.vowel, 47);

    const directRoomResponse = await fetch(
      `${origin}/room/${createAck.data.snapshot.room.roomCode}`,
    );
    assert.equal(directRoomResponse.status, 200);
    assert.match(await directRoomResponse.text(), new RegExp(INDEX_MARKER));

    const guestPlayerId = joinAck.data.snapshot.self.playerId;
    const gameId = startAck.data.snapshot.game.gameId;
    guest.disconnect();
    guest = await connectProductionClient(origin);
    const resumeAck = await emitWithAck<SessionResumeAck>(
      "session:resume after direct-route refresh",
      (acknowledge) => {
        guest?.emit(
          "session:resume",
          {
            kind: "session:resume",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-guest-resume"),
            payload: {
              credential: {
                roomCode: createAck.data.snapshot.room.roomCode,
                sessionToken: guestBootstrap.data.credential.sessionToken,
              },
              lastSeenVersions: null,
            },
          },
          acknowledge,
        );
      },
    );
    assert.equal(resumeAck.ok, true);
    if (!resumeAck.ok || resumeAck.scope !== "ROOM") {
      throw new Error("Production session resume unexpectedly failed.");
    }
    const resumedSnapshot = resumeAck.data.snapshot;
    assert.equal(resumedSnapshot.room.phase, "PLAYING");
    if (!("game" in resumedSnapshot) || !("rack" in resumedSnapshot.self)) {
      throw new Error("Production resume did not return a PLAYING snapshot.");
    }
    assert.equal(resumedSnapshot.self.playerId, guestPlayerId);
    assert.equal(resumedSnapshot.game.gameId, gameId);
    assert.equal(resumedSnapshot.self.rack.length, 14);
    assert.equal(resumedSnapshot.room.players.length, 2);
  } finally {
    host?.disconnect();
    guest?.disconnect();
    await server.shutdown();
    rmSync(webDistPath, { recursive: true, force: true });
  }
});

test("production web build가 없으면 application runtime 시작 전에 fail-fast한다", () => {
  const missingPath = join(tmpdir(), `missing-hangul-web-${process.pid}`);

  assert.throws(
    () => createHttpServer({ serveWeb: true, webDistPath: missingPath }),
    /Production web build is missing/,
  );
});

test("graceful shutdown은 중복 호출에도 server와 scheduler lifecycle을 한 번만 종료한다", async () => {
  const webDistPath = createWebBuildFixture();
  const server = createHttpServer({ serveWeb: true, webDistPath });

  try {
    await listen(server);
    assert.equal(server.runtime.turnScheduler.isRunning, true);
    assert.equal(server.runtime.overdueTurnSweeper.isRunning, true);
    assert.equal(server.runtime.roomPolicyScheduler.isRunning, true);

    const firstShutdown = server.shutdown();
    const secondShutdown = server.shutdown();
    assert.equal(firstShutdown, secondShutdown);
    await firstShutdown;

    assert.equal(server.httpServer.listening, false);
    assert.equal(server.runtime.turnScheduler.isRunning, false);
    assert.equal(server.runtime.overdueTurnSweeper.isRunning, false);
    assert.equal(server.runtime.roomPolicyScheduler.isRunning, false);

    await server.shutdown();
  } finally {
    await server.shutdown();
    rmSync(webDistPath, { recursive: true, force: true });
  }
});
