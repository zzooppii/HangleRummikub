import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { once } from "node:events";
import test from "node:test";

import {
  LobbyPlatformSnapshotV2Schema,
  NicknameSchema,
  PLATFORM_SNAPSHOT_VERSION,
  PlayingPlatformSnapshotV2Schema,
  PlayingStateSnapshotSchema,
  PROTOCOL_VERSION,
  RequestIdSchema,
  type ClientToServerEvents,
  type GameStartWireAck,
  type GameStartAck,
  type PlayingStateSnapshot,
  type RoomCreateAck,
  type RoomCreateWireAck,
  type RoomJoinAck,
  type ServerToClientEvents,
  type SessionBootstrapAck,
  type SessionResumeAck,
  type SessionResumeWireAck,
  type SnapshotWireClientToServerEvents,
  type SnapshotWireServerToClientEvents,
  type StateSyncAck,
  type TurnDrawAck,
  type TurnDrawWireAck,
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

type ProductionWireClient = SocketIoClient<
  SnapshotWireServerToClientEvents,
  SnapshotWireClientToServerEvents
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

async function connectNegotiatedProductionClient(
  origin: string,
): Promise<ProductionWireClient> {
  // Keep this separate from the legacy helper so its callback types cannot
  // accidentally hide a V2 wire acknowledgement behind a V1-only type.
  const socket = createSocketClient(origin, {
    auth: { supportedSnapshotVersions: [PLATFORM_SNAPSHOT_VERSION, 1] },
    extraHeaders: { Origin: origin },
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    transports: ["websocket"],
  }) as ProductionWireClient;
  const connected = new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("connect", handleConnect);
      socket.off("connect_error", handleConnectError);
      reject(new Error("Timed out connecting negotiated production client."));
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

async function syncPlayingSnapshot(
  socket: ProductionClient,
  label: string,
  requestId: string,
): Promise<PlayingStateSnapshot> {
  const acknowledgement = await emitWithAck<StateSyncAck>(
    label,
    (acknowledge) => {
      socket.emit(
        "state:sync",
        {
          kind: "state:sync",
          protocolVersion: PROTOCOL_VERSION,
          requestId: parse(RequestIdSchema, requestId),
          payload: {},
        },
        acknowledge,
      );
    },
  );
  assert.equal(acknowledgement.ok, true);
  if (!acknowledgement.ok || acknowledgement.scope !== "ROOM") {
    throw new Error(`Production ${label} unexpectedly failed.`);
  }
  if (acknowledgement.data.snapshot.room.phase !== "PLAYING") {
    throw new Error(`Production ${label} did not return a PLAYING snapshot.`);
  }
  return parse(PlayingStateSnapshotSchema, acknowledgement.data.snapshot);
}

function collectStringValues(value: unknown): readonly string[] {
  if (typeof value === "string") {
    return [value];
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStringValues);
  }
  if (value === null || typeof value !== "object") {
    return [];
  }
  return Object.values(value).flatMap(collectStringValues);
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

test("production-serving Socket.IO는 V2 explicit create, legacy join, start, Draw, V2 resume을 함께 제공한다", async () => {
  const webDistPath = createWebBuildFixture();
  const server = createHttpServer({ serveWeb: true, webDistPath });
  let v2Host: ProductionWireClient | undefined;
  let legacyGuest: ProductionClient | undefined;

  try {
    const origin = await listen(server);
    v2Host = await connectNegotiatedProductionClient(origin);
    legacyGuest = await connectProductionClient(origin);

    const hostBootstrap = await emitWithAck<SessionBootstrapAck>(
      "production V2 host bootstrap",
      (acknowledge) => {
        v2Host?.emit(
          "session:bootstrap",
          {
            kind: "session:bootstrap",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-v2-bootstrap"),
            payload: {},
          },
          acknowledge,
        );
      },
    );
    assert.equal(hostBootstrap.ok, true);
    if (!hostBootstrap.ok) {
      throw new Error("Production V2 host bootstrap unexpectedly failed.");
    }

    const createAck = await emitWithAck<RoomCreateWireAck>(
      "production V2 explicit room:create",
      (acknowledge) => {
        v2Host?.emit(
          "room:create",
          {
            kind: "room:create",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-v2-create"),
            payload: {
              bootstrapCredential: hostBootstrap.data.credential,
              nickname: parse(NicknameSchema, "V2호스트"),
              gameType: "HANGUL_TILE",
            },
          },
          acknowledge,
        );
      },
    );
    assert.equal(createAck.ok, true);
    if (!createAck.ok || createAck.scope !== "ROOM") {
      throw new Error("Production V2 Room create unexpectedly failed.");
    }
    const created = parse(
      LobbyPlatformSnapshotV2Schema,
      createAck.data.snapshot,
    );
    assert.equal(created.snapshotVersion, PLATFORM_SNAPSHOT_VERSION);
    assert.equal(created.room.gameType, "HANGUL_TILE");
    assert.equal(created.game, null);
    assert.equal(
      (await server.runtime.persistence.findById(created.room.roomId))?.gameType,
      "HANGUL_TILE",
    );

    const guestBootstrap = await emitWithAck<SessionBootstrapAck>(
      "production legacy guest bootstrap",
      (acknowledge) => {
        legacyGuest?.emit(
          "session:bootstrap",
          {
            kind: "session:bootstrap",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-legacy-bootstrap"),
            payload: {},
          },
          acknowledge,
        );
      },
    );
    assert.equal(guestBootstrap.ok, true);
    if (!guestBootstrap.ok) {
      throw new Error("Production legacy guest bootstrap unexpectedly failed.");
    }

    const joinAck = await emitWithAck<RoomJoinAck>(
      "production legacy room:join",
      (acknowledge) => {
        legacyGuest?.emit(
          "room:join",
          {
            kind: "room:join",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-legacy-join"),
            payload: {
              bootstrapCredential: guestBootstrap.data.credential,
              nickname: parse(NicknameSchema, "레거시게스트"),
              roomCode: created.room.roomCode,
            },
          },
          acknowledge,
        );
      },
    );
    assert.equal(joinAck.ok, true);
    if (!joinAck.ok || joinAck.scope !== "ROOM") {
      throw new Error("Production legacy Room join unexpectedly failed.");
    }
    assert.equal(joinAck.data.snapshot.room.players.length, 2);
    assert.equal("snapshotVersion" in joinAck.data.snapshot, false);
    assert.equal("gameType" in joinAck.data.snapshot.room, false);

    if (v2Host === undefined || legacyGuest === undefined) {
      throw new Error("Production mixed clients unexpectedly disappeared.");
    }
    const hostSocket = v2Host;
    const guestSocket = legacyGuest;
    const startAck = await emitWithAck<GameStartWireAck>(
      "production V2 game:start",
      (acknowledge) => {
        hostSocket.emit(
          "game:start",
          {
            kind: "game:start",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-v2-start"),
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
      throw new Error("Production V2 Game start unexpectedly failed.");
    }
    const started = parse(
      PlayingPlatformSnapshotV2Schema,
      startAck.data.snapshot,
    );
    if (started.game.gameType !== "HANGUL_TILE") {
      throw new Error("Production V2 start returned a non-Hangul game.");
    }
    assert.equal(started.room.gameType, "HANGUL_TILE");
    assert.equal(started.game.gameRevision, 0);
    assert.equal(started.game.privateState.rack.length, 14);

    const turn = started.game.publicState.turn;
    if (turn.activePlayerId === started.self.playerId) {
      const drawAck = await emitWithAck<TurnDrawWireAck>(
        "production V2 host turn:draw",
        (acknowledge) => {
          hostSocket.emit(
            "turn:draw",
            {
              kind: "turn:draw",
              protocolVersion: PROTOCOL_VERSION,
              requestId: parse(RequestIdSchema, "production-v2-host-draw"),
              expectedGameRevision: started.game.gameRevision,
              turnId: turn.turnId,
              payload: { bagKind: "CONSONANT" },
            },
            acknowledge,
          );
        },
      );
      assert.equal(drawAck.ok, true);
      if (!drawAck.ok || drawAck.scope !== "ROOM") {
        throw new Error("Production V2 host Draw unexpectedly failed.");
      }
      assert.equal(
        parse(PlayingPlatformSnapshotV2Schema, drawAck.data.snapshot).game
          .gameRevision,
        1,
      );
    } else {
      assert.equal(turn.activePlayerId, joinAck.data.snapshot.self.playerId);
      const drawAck = await emitWithAck<TurnDrawAck>(
        "production legacy guest turn:draw",
        (acknowledge) => {
          guestSocket.emit(
            "turn:draw",
            {
              kind: "turn:draw",
              protocolVersion: PROTOCOL_VERSION,
              requestId: parse(RequestIdSchema, "production-legacy-draw"),
              expectedGameRevision: started.game.gameRevision,
              turnId: turn.turnId,
              payload: { bagKind: "CONSONANT" },
            },
            acknowledge,
          );
        },
      );
      assert.equal(drawAck.ok, true);
      if (!drawAck.ok || drawAck.scope !== "ROOM") {
        throw new Error("Production legacy guest Draw unexpectedly failed.");
      }
      assert.equal(drawAck.data.snapshot.versions.gameRevision, 1);
      assert.equal("snapshotVersion" in drawAck.data.snapshot, false);
    }

    hostSocket.disconnect();
    v2Host = await connectNegotiatedProductionClient(origin);
    const resumeAck = await emitWithAck<SessionResumeWireAck>(
      "production V2 session:resume",
      (acknowledge) => {
        v2Host?.emit(
          "session:resume",
          {
            kind: "session:resume",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-v2-resume"),
            payload: {
              credential: {
                roomCode: created.room.roomCode,
                sessionToken: hostBootstrap.data.credential.sessionToken,
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
      throw new Error("Production V2 resume unexpectedly failed.");
    }
    const resumed = parse(
      PlayingPlatformSnapshotV2Schema,
      resumeAck.data.snapshot,
    );
    if (resumed.game.gameType !== "HANGUL_TILE") {
      throw new Error("Production V2 resume returned a non-Hangul game.");
    }
    assert.equal(resumed.self.playerId, created.self.playerId);
    assert.equal(resumed.room.gameType, "HANGUL_TILE");
    assert.equal(resumed.game.gameRevision, 1);
    assert.equal(
      resumed.game.publicState.gameId,
      started.game.publicState.gameId,
    );
  } finally {
    v2Host?.disconnect();
    legacyGuest?.disconnect();
    await server.shutdown();
    rmSync(webDistPath, { recursive: true, force: true });
  }
});

test("production same-origin Socket.IO에서 A/B create, join, start, Draw, privacy와 resume가 동작한다", async () => {
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
              gameType: "HANGUL_TILE",
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

    if (host === undefined || guest === undefined) {
      throw new Error("Production A/B clients unexpectedly disappeared.");
    }
    const hostPlayerId = createAck.data.snapshot.self.playerId;
    const guestPlayerId = joinAck.data.snapshot.self.playerId;
    const activePlayerId = startAck.data.snapshot.game.turn.activePlayerId;
    const actorSocket =
      activePlayerId === hostPlayerId
        ? host
        : activePlayerId === guestPlayerId
          ? guest
          : undefined;
    if (actorSocket === undefined) {
      throw new Error("Production Game selected an unknown active Player.");
    }
    const actorBeforeDraw = await syncPlayingSnapshot(
      actorSocket,
      "active Player state:sync before Draw",
      "production-draw-actor-before",
    );
    const drawAck = await emitWithAck<TurnDrawAck>(
      "turn:draw",
      (acknowledge) => {
        actorSocket.emit(
          "turn:draw",
          {
            kind: "turn:draw",
            protocolVersion: PROTOCOL_VERSION,
            requestId: parse(RequestIdSchema, "production-turn-draw"),
            expectedGameRevision: actorBeforeDraw.versions.gameRevision,
            turnId: actorBeforeDraw.game.turn.turnId,
            payload: { bagKind: "CONSONANT" },
          },
          acknowledge,
        );
      },
    );
    assert.equal(drawAck.ok, true);
    if (!drawAck.ok || drawAck.scope !== "ROOM") {
      throw new Error("Production Draw unexpectedly failed.");
    }
    assert.equal(drawAck.data.snapshot.versions.gameRevision, 1);
    assert.equal(drawAck.data.snapshot.self.playerId, activePlayerId);
    assert.equal(drawAck.data.snapshot.self.rack.length, 15);
    assert.equal(drawAck.data.snapshot.game.bagCounts.consonant, 80);
    assert.equal(drawAck.data.snapshot.game.bagCounts.vowel, 47);
    assert.notEqual(
      drawAck.data.snapshot.game.turn.activePlayerId,
      activePlayerId,
    );

    const [hostAfterDraw, guestAfterDraw] = await Promise.all([
      syncPlayingSnapshot(
        host,
        "Host state:sync after Draw",
        "production-host-after-draw",
      ),
      syncPlayingSnapshot(
        guest,
        "Guest state:sync after Draw",
        "production-guest-after-draw",
      ),
    ]);
    for (const snapshot of [hostAfterDraw, guestAfterDraw]) {
      assert.equal(snapshot.versions.gameRevision, 1);
      assert.equal(snapshot.game.bagCounts.consonant, 80);
      assert.equal(snapshot.game.bagCounts.vowel, 47);
      assert.equal(snapshot.room.players.length, 2);
      assert.equal(
        snapshot.room.players.find(
          (player) => player.playerId === snapshot.self.playerId,
        )?.rackCount,
        snapshot.self.rack.length,
      );
    }
    const actorAfterDraw =
      activePlayerId === hostPlayerId ? hostAfterDraw : guestAfterDraw;
    const opponentAfterDraw =
      activePlayerId === hostPlayerId ? guestAfterDraw : hostAfterDraw;
    assert.equal(actorAfterDraw.self.rack.length, 15);
    assert.equal(opponentAfterDraw.self.rack.length, 14);
    const drawnTiles = actorAfterDraw.self.rack.filter(
      (tile) =>
        !actorBeforeDraw.self.rack.some(
          (beforeTile) => beforeTile.tileId === tile.tileId,
        ),
    );
    assert.equal(drawnTiles.length, 1);
    const drawnTile = drawnTiles[0];
    assert.ok(drawnTile);
    assert.equal(
      new Set(collectStringValues(opponentAfterDraw)).has(drawnTile.tileId),
      false,
    );
    const projectedStrings = new Set(
      [hostAfterDraw, guestAfterDraw].flatMap(collectStringValues),
    );
    assert.equal(
      projectedStrings.has(hostBootstrap.data.credential.sessionToken),
      false,
    );
    assert.equal(
      projectedStrings.has(guestBootstrap.data.credential.sessionToken),
      false,
    );

    const directRoomResponse = await fetch(
      `${origin}/room/${createAck.data.snapshot.room.roomCode}`,
    );
    assert.equal(directRoomResponse.status, 200);
    assert.match(await directRoomResponse.text(), new RegExp(INDEX_MARKER));

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
    assert.equal(resumedSnapshot.versions.gameRevision, 1);
    assert.deepEqual(resumedSnapshot.self.rack, guestAfterDraw.self.rack);
    assert.deepEqual(
      resumedSnapshot.game.bagCounts,
      guestAfterDraw.game.bagCounts,
    );
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
