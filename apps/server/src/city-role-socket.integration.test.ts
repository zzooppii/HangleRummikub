import assert from "node:assert/strict";
import test, { type TestContext } from "node:test";
import { io, type Socket } from "socket.io-client";
import { parse } from "valibot";
import { CityActionWireAckSchema, CityRolePlayingPlatformSnapshotV2Schema, CityRoleFinishedPlatformSnapshotV2Schema, LobbyPlatformSnapshotV2Schema, SessionBootstrapAckSchema, StateSnapshotWireEventSchema, StateSyncWireAckSchema, RoomLeaveAckSchema, type CityRolePlayingPlatformSnapshotV2 } from "@hangul-rummikub/shared";
import { createHttpServer } from "./server.js";

type RawClient = Socket<Record<string, (value: unknown) => void>, Record<string, (value: unknown, ack: (value: unknown) => void) => void>>;
const cityAuth = { supportedSnapshotVersions: [2, 1], supportedGameTypes: ["CITY_ROLE"] };

async function harness(t: TestContext) {
  const server = createHttpServer({ serveWeb: false }), clients: RawClient[] = [];
  t.after(async () => { clients.forEach((client) => client.disconnect()); await server.shutdown(); });
  await new Promise<void>((resolve) => server.httpServer.listen(0, "127.0.0.1", resolve));
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== "string");
  const url = `http://127.0.0.1:${address.port}`;
  let sequence = 0;
  async function connect(auth?: Record<string, unknown>) {
    const client = io(url, { ...(auth === undefined ? {} : { auth }), autoConnect: false, transports: ["websocket"], forceNew: true, reconnection: false }) as RawClient;
    clients.push(client);
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("CITY raw connection timeout")), 5_000);
      client.once("connect", () => { clearTimeout(timer); resolve(); });
      client.once("connect_error", (error) => { clearTimeout(timer); reject(error); });
      client.connect();
    });
    return client;
  }
  function command(kind: string, payload: unknown, extra: Record<string, unknown> = {}) {
    return { kind, protocolVersion: 1, requestId: `city-raw-${++sequence}`, payload, ...extra };
  }
  const send = (client: RawClient, request: ReturnType<typeof command>) => new Promise<unknown>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`No CITY acknowledgement for ${request.kind}`)), 5_000);
    client.emit(request.kind, request, (value) => { clearTimeout(timer); resolve(value); });
  });
  const call = (client: RawClient, kind: string, payload: unknown, extra?: Record<string, unknown>) => send(client, command(kind, payload, extra));
  async function bootstrap(client: RawClient) {
    const result = parse(SessionBootstrapAckSchema, await call(client, "session:bootstrap", {}));
    assert.equal(result.ok, true);
    if (!result.ok) throw new Error("bootstrap rejected");
    return result.data.credential;
  }
  function success(value: unknown) {
    const result = parse(StateSyncWireAckSchema, value);
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) throw new Error("command rejected");
    return result.data.snapshot;
  }
  function failure(value: unknown, code?: string) {
    const result = parse(StateSyncWireAckSchema, value);
    assert.equal(result.ok, false);
    if (result.ok) throw new Error("expected rejection");
    if (code !== undefined) assert.equal(result.error.code, code);
    return result.error;
  }
  const sync = async (client: RawClient) => success(await call(client, "state:sync", {}));
  function receipt(value: unknown) {
    const result = parse(CityActionWireAckSchema, value);
    assert.equal(result.ok, true, JSON.stringify(result));
    if (!result.ok) throw new Error("CITY action rejected.");
    assert.deepEqual(Object.keys(result.data).sort(), ["committedGameRevision", "gameId"]);
    return result;
  }
  async function action(client: RawClient, kind: string, payload: unknown, extra: Record<string, unknown>) {
    receipt(await call(client, kind, payload, extra));
    return sync(client);
  }
  const playing = (value: unknown) => parse(CityRolePlayingPlatformSnapshotV2Schema, value);
  const identity = (snapshot: CityRolePlayingPlatformSnapshotV2) => ({ gameId: snapshot.game.gameId, expectedGameRevision: snapshot.game.gameRevision, actionId: snapshot.game.window.actionId });
  async function room(count = 2) {
    const members: { client: RawClient; credential: Awaited<ReturnType<typeof bootstrap>>; playerId: string }[] = [];
    let latest: ReturnType<typeof parse<typeof LobbyPlatformSnapshotV2Schema>> | undefined;
    for (let index = 0; index < count; index += 1) {
      const client = await connect(cityAuth), credential = await bootstrap(client);
      latest = parse(LobbyPlatformSnapshotV2Schema, success(await call(client, index === 0 ? "room:create" : "room:join", index === 0 ? { bootstrapCredential: credential, nickname: `City${index}`, gameType: "CITY_ROLE" } : { bootstrapCredential: credential, nickname: `City${index}`, roomCode: latest!.room.roomCode })));
      members.push({ client, credential, playerId: latest.self.playerId });
    }
    assert.ok(latest);
    return { members, lobby: latest };
  }
  return { server, connect, bootstrap, command, send, call, success, failure, sync, receipt, action, playing, identity, room };
}

test("raw CITY two-player create/join/start/draft/acquire/build/round/resume preserves private roles and deadlines", async (t) => {
  const h = await harness(t), room = await h.room();
  const events: string[] = [];
  for (const member of room.members) {
    member.client.on("state:snapshot", (event) => { parse(StateSnapshotWireEventSchema, event); events.push("snapshot"); });
    member.client.on("turn:started", () => events.push("legacy-turn"));
    member.client.on("game:finished", () => events.push("legacy-finish"));
  }
  let view = h.playing(h.success(await h.call(room.members[0]!.client, "game:start", {}, { expectedRoomRevision: room.lobby.versions.roomRevision })));
  assert.equal(view.game.gameRevision, 0);
  assert.equal(view.game.phase, "ROLE_SELECTION");
  assert.equal(view.game.rolesPerPlayer, 2);
  assert.equal(view.game.window.deadlineAt - view.game.window.startedAt, 45_000);
  assert.equal(view.game.privateState.hand.length, 4);
  assert.equal(view.game.playerStates.length, 2);
  assert.equal(view.game.roleDraftVersion, "city-draft-v2");
  assert.equal(view.game.secretPairDraft, true);
  assert.deepEqual(view.game.publicRemovedRoleIds, []);
  let builds = 0, completedRounds = 0, pendingResumed = false;
  for (let step = 0; step < 48 && (builds === 0 || completedRounds === 0 || !pendingResumed); step += 1) {
    const actor = room.members.find((member) => member.playerId === view.game.window.activePlayerId)!;
    view = h.playing(await h.sync(actor.client));
    if (view.game.phase === "ROLE_SELECTION") {
      const roles = view.game.privateState.availableRoleIds;
      assert.ok(roles && roles.length > 0);
      const observer = room.members.find((member) => member.playerId !== actor.playerId)!;
      const other = h.playing(await h.sync(observer.client));
      assert.equal("availableRoleIds" in other.game.privateState, false);
      const request = h.command("city:selectRole", { roleId: roles[0], ...(view.game.secretPairDraft ? { discardRoleId: roles[1] } : {}) }, h.identity(view));
      const firstReceipt = h.receipt(await h.send(actor.client, request));
      view = h.playing(await h.sync(actor.client));
      const stored = await h.server.runtime.persistence.findById(view.room.roomId);
      const replayReceipt = h.receipt(await h.send(actor.client, request));
      assert.deepEqual(replayReceipt.data, firstReceipt.data);
      assert.equal(replayReceipt.requestId, firstReceipt.requestId);
      assert.deepEqual(await h.server.runtime.persistence.findById(view.room.roomId), stored);
      continue;
    }
    assert.equal(view.game.window.deadlineAt - view.game.window.startedAt, 90_000);
    const originalDeadline = view.game.window.deadlineAt, originalAction = view.game.window.actionId;
    if (!pendingResumed) {
      const request = h.command("city:drawBuildingCards", {}, h.identity(view));
      const firstReceipt = h.receipt(await h.send(actor.client, request));
      view = h.playing(await h.sync(actor.client));
      assert.ok(view.game.phase === "ROLE_ACTION");
      const pendingCards = view.game.privateState.pendingCards;
      assert.ok(pendingCards && pendingCards.length > 0);
      const stored = await h.server.runtime.persistence.findById(view.room.roomId);
      const replayReceipt = h.receipt(await h.send(actor.client, request));
      assert.deepEqual(replayReceipt.data, firstReceipt.data);
      assert.equal(replayReceipt.requestId, firstReceipt.requestId);
      assert.deepEqual(await h.server.runtime.persistence.findById(view.room.roomId), stored);
      const other = room.members.find((member) => member.playerId !== actor.playerId)!;
      const otherView = h.playing(await h.sync(other.client));
      assert.equal("pendingCards" in otherView.game.privateState, false);
      for (const card of pendingCards) assert.equal(JSON.stringify(otherView).includes(card.cardId), false);
      assert.equal(stored?.gameType, "CITY_ROLE");
      assert.ok(stored.game);
      const offlineState = { ...stored.game.state, players: stored.game.state.players.map((player) => String(player.playerId) === actor.playerId ? { ...player, offlineTimeoutStreak: 2 } : player) };
      assert.equal((await h.server.runtime.persistence.replace({ candidate: { ...stored, game: { ...stored.game, state: offlineState } }, expectedRoomRevision: stored.roomRevision, expectedStorageRevision: stored.storageRevision })).status, "REPLACED");
      const resumed = await h.connect(cityAuth);
      const restored = h.playing(h.success(await h.call(resumed, "session:resume", { credential: { ...actor.credential, roomCode: view.room.roomCode }, lastSeenVersions: null })));
      assert.equal(restored.self.playerId, actor.playerId);
      assert.equal(restored.room.players.length, 2);
      assert.deepEqual(restored.game, view.game);
      const afterResume = await h.server.runtime.persistence.findById(view.room.roomId);
      assert.equal(afterResume?.gameType, "CITY_ROLE");
      assert.equal(afterResume.game?.state.players.find((player) => String(player.playerId) === actor.playerId)?.offlineTimeoutStreak, 0);
      assert.equal(afterResume.game?.gameRevision, stored.game.gameRevision);
      h.failure(await h.call(actor.client, "city:chooseBuildingCard", { cardId: pendingCards[0]!.cardId }, h.identity(restored)));
      actor.client = resumed;
      view = h.playing(await h.action(resumed, "city:chooseBuildingCard", { cardId: pendingCards[0]!.cardId }, h.identity(restored)));
      pendingResumed = true;
    } else {
      view = h.playing(await h.action(actor.client, "city:takeIncome", {}, h.identity(view)));
    }
    assert.equal(view.game.window.deadlineAt, originalDeadline);
    assert.equal(view.game.window.actionId, originalAction);
    const player = view.game.playerStates.find((entry) => entry.playerId === actor.playerId)!;
    const affordable = view.game.privateState.hand.find((card) => card.cost <= player.gold && !player.builtBuildings.some((built) => built.templateId === card.templateId));
    if (affordable !== undefined) {
      const beforeGold = player.gold;
      const history = view.game.landmarkHistory?.find(row => row.playerId === actor.playerId);
      const discount = view.game.rulesVersion === "city-rules-v2" && history !== undefined &&
        history.staircaseRemaining > 0 && history.lastDiscountRound !== view.game.roundNumber &&
        player.builtBuildings.some(card => card.templateId === "CB-LAN-04") &&
        affordable.category !== "LANDMARK" && affordable.cost >= 2 ? 1 : 0;
      const refund = view.game.rulesVersion === "city-rules-v2" && history !== undefined &&
        !history.gardenUsed && affordable.templateId === "CB-LAN-01" ? 1 : 0;
      view = h.playing(await h.action(actor.client, "city:build", { cardId: affordable.cardId }, h.identity(view)));
      assert.ok(view.game.playerStates.find((entry) => entry.playerId === actor.playerId)!.builtBuildings.some((card) => card.cardId === affordable.cardId));
      assert.equal(view.game.playerStates.find((entry) => entry.playerId === actor.playerId)!.gold, beforeGold - affordable.cost + discount + refund);
      builds += 1;
    }
    view = h.playing(await h.action(actor.client, "city:endTurn", {}, h.identity(view)));
    completedRounds = view.game.roundNumber - 1;
  }
  assert.ok(builds > 0);
  assert.ok(completedRounds > 0);
  assert.equal(pendingResumed, true);
  assert.equal(events.some((event) => event.startsWith("legacy-")), false);
  const stored = await h.server.runtime.persistence.findById(view.room.roomId);
  assert.equal(stored?.gameType, "CITY_ROLE");
  assert.ok(stored.game);
  const storedGame = stored.game;
  for (const member of room.members) {
    const selfView = h.playing(await h.sync(member.client)), serialized = JSON.stringify(selfView);
    for (const cardId of storedGame.state.deck) assert.equal(serialized.includes(cardId), false);
    for (const player of storedGame.state.players) if (String(player.playerId) !== member.playerId) for (const cardId of player.hand) assert.equal(serialized.includes(cardId), false);
    for (const key of ["sessionToken", "verificationData", "storageRevision", "offlineTimeoutStreak", "entropySeed", "entropyCounter", "hiddenRemoved", "deck", "discard", "assignments"]) assert.equal(serialized.includes(`"${key}"`), false);
  }
});

test("raw CITY six-player admission/draft is V2-private and a seventh player cannot mutate the room", async (t) => {
  const h = await harness(t), room = await h.room(6);
  assert.equal(room.lobby.room.players.length, 6);
  const extra = await h.connect(cityAuth), credential = await h.bootstrap(extra);
  const before = await h.server.runtime.persistence.findById(room.lobby.room.roomId);
  h.failure(await h.call(extra, "room:join", { bootstrapCredential: credential, nickname: "Seventh", roomCode: room.lobby.room.roomCode }), "ROOM_FULL");
  assert.deepEqual(await h.server.runtime.persistence.findById(room.lobby.room.roomId), before);
  let view = h.playing(h.success(await h.call(room.members[0]!.client, "game:start", {}, { expectedRoomRevision: room.lobby.versions.roomRevision })));
  assert.equal(view.game.rolesPerPlayer, 1);
  let picks = 0;
  while (view.game.phase === "ROLE_SELECTION") {
    const actor = room.members.find((member) => member.playerId === view.game.window.activePlayerId)!;
    for (const member of room.members) {
      const own = h.playing(await h.sync(member.client));
      assert.equal(own.game.privateState.hand.length, 4);
      assert.equal("availableRoleIds" in own.game.privateState, member.playerId === actor.playerId);
      assert.ok(own.game.privateState.selectedRoleIds.length <= 1);
    }
    const actorView = h.playing(await h.sync(actor.client));
    assert.ok(actorView.game.phase === "ROLE_SELECTION");
    view = h.playing(await h.action(actor.client, "city:selectRole", { roleId: actorView.game.privateState.availableRoleIds![0] }, h.identity(actorView)));
    picks += 1;
  }
  assert.equal(picks, 6);
  assert.equal(view.game.window.deadlineAt - view.game.window.startedAt, 90_000);
});

test("raw CITY missing/V1-only/HNG-only capability and bad credentials fail closed before seat mutation", async (t) => {
  const h = await harness(t), room = await h.room();
  for (const auth of [undefined, { supportedSnapshotVersions: [1], supportedGameTypes: ["CITY_ROLE"] }, { supportedSnapshotVersions: [2, 1], supportedGameTypes: ["HANGUL_TILE", "NUMBER_TILE", "GEM_CARD"] }]) {
    const client = await h.connect(auth), credential = await h.bootstrap(client);
    const before = await h.server.runtime.persistence.findById(room.lobby.room.roomId);
    h.failure(await h.call(client, "room:create", { bootstrapCredential: credential, nickname: "Blocked", gameType: "CITY_ROLE" }), "INCOMPATIBLE_GAME_CAPABILITY");
    h.failure(await h.call(client, "room:join", { bootstrapCredential: credential, nickname: "Blocked", roomCode: room.lobby.room.roomCode }), "INCOMPATIBLE_GAME_CAPABILITY");
    h.failure(await h.call(client, "session:resume", { credential: { ...room.members[0]!.credential, roomCode: room.lobby.room.roomCode }, lastSeenVersions: null }), "INCOMPATIBLE_GAME_CAPABILITY");
    assert.deepEqual(await h.server.runtime.persistence.findById(room.lobby.room.roomId), before);
  }
  const outsider = await h.connect(cityAuth);
  const before = await h.server.runtime.persistence.findById(room.lobby.room.roomId);
  h.failure(await h.call(outsider, "session:resume", { credential: { roomCode: room.lobby.room.roomCode }, lastSeenVersions: null }));
  h.failure(await h.call(outsider, "session:resume", { credential: { ...room.members[0]!.credential, sessionToken: "wrong-token", roomCode: room.lobby.room.roomCode }, lastSeenVersions: null }));
  assert.deepEqual(await h.server.runtime.persistence.findById(room.lobby.room.roomId), before);
});

test("raw CITY/HNG wrong-game command matrix and forged CITY fields preserve all canonical state", async (t) => {
  const h = await harness(t), city = await h.room();
  const view = h.playing(h.success(await h.call(city.members[0]!.client, "game:start", {}, { expectedRoomRevision: city.lobby.versions.roomRevision })));
  const actor = city.members.find((member) => member.playerId === view.game.window.activePlayerId)!;
  const before = await h.server.runtime.persistence.findById(view.room.roomId);
  for (const [kind, payload] of [["turn:draw", { bagKind: "CONSONANT" }], ["number:draw", {}], ["gem:collect", { selection: { kind: "PRISM" } }], ["city:selectRole", { roleId: "CR-01", playerId: actor.playerId }], ["city:useRoleAbility", { ability: "REPLACE_OWN_CARDS", cardIds: [] }], ["city:takeIncome", { gold: 100 }]] as const) {
    const extra = kind.startsWith("city:") ? h.identity(view) : { expectedGameRevision: view.game.gameRevision, turnId: view.game.window.actionId };
    h.failure(await h.call(actor.client, kind, payload, extra));
    assert.deepEqual(await h.server.runtime.persistence.findById(view.room.roomId), before);
  }
  for (const gameType of ["HANGUL_TILE", "NUMBER_TILE", "GEM_CARD"] as const) {
    const client = await h.connect({ supportedSnapshotVersions: [2, 1], supportedGameTypes: [gameType, "CITY_ROLE"] }), credential = await h.bootstrap(client);
    const created = h.success(await h.call(client, "room:create", { bootstrapCredential: credential, nickname: "Other", gameType }));
    const partner = await h.connect({ supportedSnapshotVersions: [2, 1], supportedGameTypes: [gameType, "CITY_ROLE"] }), partnerCredential = await h.bootstrap(partner);
    const joined = h.success(await h.call(partner, "room:join", { bootstrapCredential: partnerCredential, nickname: "OtherTwo", roomCode: created.room.roomCode }));
    h.success(await h.call(client, "game:start", {}, { expectedRoomRevision: joined.versions.roomRevision }));
    const original = await h.server.runtime.persistence.findById(created.room.roomId);
    assert.equal(original?.phase, "PLAYING");
    for (const [kind, payload] of [["city:selectRole", { roleId: "CR-08" }], ["city:takeIncome", {}], ["city:drawBuildingCards", {}], ["city:chooseBuildingCard", { cardId: "opaque-probe" }], ["city:useRoleAbility", { ability: "MARK_ROLE_DISABLED", targetRoleId: "CR-08" }], ["city:build", { cardId: "opaque-probe" }], ["city:endTurn", {}]] as const) {
      h.failure(await h.call(client, kind, payload, h.identity(view)));
      assert.deepEqual(await h.server.runtime.persistence.findById(created.room.roomId), original);
    }
  }
});

test("raw CITY explicit leave produces private-safe LPS and no remaining gameplay scheduler", async (t) => {
  const h = await harness(t), room = await h.room();
  const view = h.playing(h.success(await h.call(room.members[0]!.client, "game:start", {}, { expectedRoomRevision: room.lobby.versions.roomRevision })));
  const leave = parse(RoomLeaveAckSchema, await h.call(room.members[1]!.client, "room:leave", {}, { expectedRoomRevision: view.versions.roomRevision, expectedGameRevision: view.game.gameRevision }));
  assert.equal(leave.ok, true, JSON.stringify(leave));
  const result = parse(CityRoleFinishedPlatformSnapshotV2Schema, await h.sync(room.members[0]!.client));
  assert.equal(result.game.result.reason, "LAST_PLAYER_STANDING");
  assert.equal(result.game.result.rankings.length, 2);
  assert.equal(result.room.players.length, 2);
  assert.equal((await h.server.runtime.persistence.listActiveTurnDeadlines()).length, 0);
  assert.equal((await h.server.runtime.persistence.listActiveGameDeadlines()).length, 0);
  assert.equal((await h.server.runtime.persistence.listFinishedRoomRetentions()).length, 1);
  assert.equal(JSON.stringify(result).includes('"hiddenRemoved"'), false);
});
