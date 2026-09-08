import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import { CityActionWireAckSchema, CityRolePlayingPlatformSnapshotV2Schema, SessionBootstrapAckSchema, StateSyncWireAckSchema, type CityRolePlayingPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";

type RawClient = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;

test("production same-origin four-game client serves SPA and plays CITY through private draw, choice, build and resume", async (t) => {
  // A static serving fixture keeps npm test independent of a pre-existing Vite
  // build. CITY commands, sessions, private projection and persistence are real.
  const webDistPath = mkdtempSync(join(tmpdir(), "city-production-serving-"));
  mkdirSync(join(webDistPath, "assets"));
  writeFileSync(join(webDistPath, "index.html"), '<!doctype html><html><body>city-production-serving-shell<script type="module" src="/assets/index-city-123.js"></script></body></html>');
  writeFileSync(join(webDistPath, "assets", "index-city-123.js"), "export {};");
  const server = createHttpServer({ serveWeb: true, webDistPath }), clients: RawClient[] = [];
  t.after(async () => {
    clients.forEach((client) => client.disconnect());
    await server.shutdown();
    rmSync(webDistPath, { recursive: true, force: true });
  });
  server.httpServer.listen(0, "127.0.0.1");
  await once(server.httpServer, "listening");
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  const origin = `http://127.0.0.1:${address.port}`;
  const health = await fetch(`${origin}/health`);
  assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { ok: true });
  for (const path of ["/", "/room/BCDFGH"]) {
    const response = await fetch(`${origin}${path}`);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-cache");
    assert.match(await response.text(), /city-production-serving-shell/u);
  }
  const asset = await fetch(`${origin}/assets/index-city-123.js`);
  assert.equal(asset.status, 200);
  assert.match(asset.headers.get("cache-control") ?? "", /immutable/u);
  assert.equal((await fetch(`${origin}/api/test-state`)).status, 404);

  const auth = { supportedSnapshotVersions: [2, 1], supportedGameTypes: ["HANGUL_TILE", "NUMBER_TILE", "GEM_CARD", "CITY_ROLE"] };
  async function connect() {
    const client = io(origin, { auth, extraHeaders: { Origin: origin }, autoConnect: false, forceNew: true, reconnection: false, transports: ["websocket"] }) as RawClient;
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error("CITY production connection timed out.")), 3000);
      client.once("connect", () => { clearTimeout(timeout); resolve(); });
      client.once("connect_error", (error) => { clearTimeout(timeout); reject(error); });
      client.connect();
    });
    assert.equal(client.io.engine.transport.name, "websocket");
    assert.deepEqual(server.io.sockets.sockets.get(client.id!)?.handshake.auth, auth);
    return client;
  }
  let sequence = 0;
  function call(client: RawClient, kind: string, payload: unknown, identity: Record<string, unknown> = {}) {
    return new Promise<unknown>((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error(`${kind} acknowledgement timed out.`)), 3000);
      client.emit(kind, { kind, protocolVersion: 1, requestId: `city-production-${++sequence}`, payload, ...identity }, (ack) => { clearTimeout(timeout); resolve(ack); });
    });
  }
  function snapshot(ack: unknown) {
    const parsed = parse(StateSyncWireAckSchema, ack);
    assert.equal(parsed.ok, true, JSON.stringify(parsed));
    if (!parsed.ok) throw new Error("Expected canonical snapshot.");
    return parsed.data.snapshot;
  }
  async function bootstrap(client: RawClient) {
    const ack = parse(SessionBootstrapAckSchema, await call(client, "session:bootstrap", {}));
    assert.equal(ack.ok, true);
    if (!ack.ok) throw new Error("Bootstrap failed.");
    return ack.data.credential;
  }
  const sync = async (client: RawClient) => parse(CityRolePlayingPlatformSnapshotV2Schema, snapshot(await call(client, "state:sync", {})));
  const identity = (view: CityRolePlayingPlatformSnapshotV2) => ({ gameId: view.game.gameId, actionId: view.game.window.actionId, expectedGameRevision: view.game.gameRevision });
  async function action(client: RawClient, view: CityRolePlayingPlatformSnapshotV2, kind: string, payload: unknown = {}) {
    const ack = parse(CityActionWireAckSchema, await call(client, kind, payload, identity(view)));
    assert.equal(ack.ok, true, JSON.stringify(ack));
    if (!ack.ok) throw new Error("CITY production action failed.");
    assert.deepEqual(Object.keys(ack.data).sort(), ["committedGameRevision", "gameId"]);
    assert.equal(ack.data.committedGameRevision, view.game.gameRevision + 1);
    return sync(client);
  }
  const first = await connect(), second = await connect();
  const firstCredential = await bootstrap(first), secondCredential = await bootstrap(second);
  const created = snapshot(await call(first, "room:create", { bootstrapCredential: firstCredential, nickname: "CityProdA", gameType: "CITY_ROLE" }));
  const joined = snapshot(await call(second, "room:join", { bootstrapCredential: secondCredential, nickname: "CityProdB", roomCode: created.room.roomCode }));
  const members = [{ client: first, credential: firstCredential, playerId: created.self.playerId }, { client: second, credential: secondCredential, playerId: joined.self.playerId }];
  let view = parse(CityRolePlayingPlatformSnapshotV2Schema, snapshot(await call(first, "game:start", {}, { expectedRoomRevision: joined.versions.roomRevision })));
  assert.equal(view.game.rolesPerPlayer, 2);
  assert.equal(view.game.privateState.hand.length, 4);
  let resumedPending = false, constructed = false;
  for (let step = 0; step < 32 && (!resumedPending || !constructed); step += 1) {
    const actor = members.find((member) => member.playerId === view.game.window.activePlayerId)!;
    view = await sync(actor.client);
    if (view.game.phase === "ROLE_SELECTION") {
      assert.equal(view.game.window.deadlineAt - view.game.window.startedAt, 45000);
      const roles = view.game.privateState.availableRoleIds;
      assert.ok(roles && roles.length > 0);
      view = await action(actor.client, view, "city:selectRole", { roleId: roles[0] });
      continue;
    }
    const deadline = view.game.window.deadlineAt, actionId = view.game.window.actionId;
    assert.equal(deadline - view.game.window.startedAt, 90000);
    if (!resumedPending) {
      view = await action(actor.client, view, "city:drawBuildingCards");
      assert.equal(view.game.phase, "ROLE_ACTION");
      if (view.game.phase !== "ROLE_ACTION") throw new Error("Expected pending role action.");
      const pending = view.game.privateState.pendingCards;
      assert.ok(pending && pending.length > 0);
      const other = members.find((member) => member.playerId !== actor.playerId)!;
      const otherView = await sync(other.client);
      for (const card of pending) assert.equal(JSON.stringify(otherView).includes(card.cardId), false);
      actor.client.disconnect();
      const resumed = await connect();
      const restored = parse(CityRolePlayingPlatformSnapshotV2Schema, snapshot(await call(resumed, "session:resume", { credential: { ...actor.credential, roomCode: view.room.roomCode }, lastSeenVersions: null })));
      assert.equal(restored.self.playerId, actor.playerId);
      assert.equal(restored.room.players.length, 2);
      assert.deepEqual(restored.game, view.game);
      actor.client = resumed;
      view = await action(resumed, restored, "city:chooseBuildingCard", { cardId: pending[0]!.cardId });
      resumedPending = true;
    } else {
      view = await action(actor.client, view, "city:takeIncome");
    }
    assert.equal(view.game.window.deadlineAt, deadline);
    assert.equal(view.game.window.actionId, actionId);
    const own = view.game.playerStates.find((player) => player.playerId === actor.playerId)!;
    const card = view.game.privateState.hand.find((candidate) => candidate.cost <= own.gold && !own.builtBuildings.some((building) => building.templateId === candidate.templateId));
    if (card) {
      view = await action(actor.client, view, "city:build", { cardId: card.cardId });
      assert.ok(view.game.playerStates.find((player) => player.playerId === actor.playerId)!.builtBuildings.some((building) => building.cardId === card.cardId));
      constructed = true;
    }
    view = await action(actor.client, view, "city:endTurn");
  }
  assert.equal(resumedPending, true);
  assert.equal(constructed, true);
  assert.equal((await server.runtime.persistence.listActiveTurnDeadlines()).length, 1);
  assert.equal((await server.runtime.persistence.listActiveGameDeadlines()).length, 0);
});
