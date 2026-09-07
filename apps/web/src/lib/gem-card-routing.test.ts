import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import {
  validateNickname,
  validateRequestId,
  validateBootstrapCredential,
  validateRoomCreateCommand,
  validateRoomJoinCommand,
} from "@hangul-rummikub/shared";

import { gemLobbyFixture, gemPlayingFixture, gemFinishedFixture } from "./gem-card-test-fixtures.js";
import { decodeWebSnapshot } from "./snapshot-wire-decoder.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { projectRoomSnapshotShell } from "./room-snapshot-shell.js";
import { createPendingRoomCreateOperation, createPendingRoomJoinOperation } from "./session-storage.js";
import { createRoomPath, createInvitationUrl } from "./room-url.js";
import { getGameStartControl } from "./game-start.js";

test("GEM V2 Lobby/Playing/Finished decode and route directly without either tile adapter", () => {
  for (const [fixture, route] of [
    [gemLobbyFixture(), "LOBBY"],
    [gemPlayingFixture(), "GEM_CARD_PLAYING"],
    [gemFinishedFixture(), "GEM_CARD_FINISHED"],
  ] as const) {
    const before = structuredClone(fixture);
    const decoded = decodeWebSnapshot(fixture);
    assert.equal(decoded.kind, "COMPATIBLE");
    if (decoded.kind !== "COMPATIBLE") throw new Error("Expected GEM fixture.");
    assert.equal(decoded.value.kind, "PLATFORM_V2_GEM_CARD");
    assert.equal("legacySnapshot" in decoded.value, false);
    assert.equal(resolveRoomSnapshotView(decoded.value).kind, route);
    const shell = projectRoomSnapshotShell(decoded.value);
    assert.equal(shell.room.gameType, "GEM_CARD");
    assert.equal(shell.versions.gameRevision, fixture.game?.gameRevision ?? null);
    assert.equal(shell.self.playerId, fixture.self.playerId);
    assert.deepEqual(fixture, before);
  }
});

test("GEM malformed/rack-shaped/private/leaked projections fail closed before rendering", () => {
  const s = gemPlayingFixture();
  const malformed: unknown[] = [
    { ...s, game: null },
    { ...s, room: { ...s.room, gameType: "NUMBER_TILE" } },
    { ...s, self: { playerId: "unknown-player" } },
    { ...s, game: { ...s.game, rulesVersion: "gem-rules-future" } },
    { ...s, game: { ...s.game, cardSetVersion: "gem-cardset-future" } },
    { ...s, game: { ...s.game, turn: { ...s.game.turn, deadlineAt: s.game.turn.startedAt + 90000 } } },
    ...["rack", "privateState", "deck", "rng", "storageRevision", "sessionToken", "offlineTimeoutStreak", "idempotency"].map(
      field => ({ ...s, game: { ...s.game, [field]: [] } }),
    ),
  ];
  for (const input of malformed) {
    assert.deepEqual(decodeWebSnapshot(input), { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" });
  }
  assert.deepEqual(decodeWebSnapshot({ ...s, snapshotVersion: 1 }), {
    kind: "INCOMPATIBLE", reason: "UNSUPPORTED_SNAPSHOT_VERSION",
  });
});

test("GEM explicit create and code-only join preserve credential/URL and platform Host readiness", () => {
  const lobby = gemLobbyFixture();
  const request = validateRequestId("gem-web-entry");
  const token = validateBootstrapCredential({ sessionToken: "x".repeat(43) });
  const name = validateNickname("GemTester");
  if (!request.ok || !token.ok || !name.ok) throw new Error("Invalid test identity.");
  const common = { requestId: request.value, sessionToken: token.value.sessionToken, nickname: name.value };
  const create = createPendingRoomCreateOperation({ ...common, gameType: "GEM_CARD" });
  const join = createPendingRoomJoinOperation({ ...common, roomCode: lobby.room.roomCode });
  assert.equal(create.payload.gameType, "GEM_CARD");
  assert.equal(validateRoomCreateCommand(create).ok, true);
  assert.equal(validateRoomJoinCommand(join).ok, true);
  assert.equal("gameType" in join.payload, false);
  assert.equal(createRoomPath(lobby.room.roomCode), `/room/${lobby.room.roomCode}`);
  assert.equal(createInvitationUrl("https://example.test", lobby.room.roomCode), `https://example.test/room/${lobby.room.roomCode}`);
  const decoded = decodeWebSnapshot(lobby);
  if (decoded.kind !== "COMPATIBLE") throw new Error("Invalid Lobby fixture.");
  const shell = projectRoomSnapshotShell(decoded.value);
  assert.equal(getGameStartControl(shell, false).canStart, true);
  const offline = structuredClone(shell);
  const other = offline.room.players.find(player => player.playerId !== shell.self.playerId);
  assert.ok(other);
  Reflect.set(other, "connectionStatus", "OFFLINE");
  assert.equal(getGameStartControl(offline, false).canStart, false);
});

test("GEM Web has concrete scoped components and no cross-feature/domain/private-state imports", () => {
  const folder = new URL("../../src/features/gem-card/", import.meta.url);
  const sources = readdirSync(folder).filter(name => /\.tsx?$/u.test(name))
    .map(name => readFileSync(new URL(name, folder), "utf8")).join("\n");
  assert.doesNotMatch(sources, /from\s+["'][^"']*(?:features\/number-tile|\.\.\/number-tile|\.\.\/game\/|apps\/server|domain\/)[^"']*["']/u);
  assert.doesNotMatch(sources, /game\.privateState|rackCount|game:command|GenericGame|GameModule|TIME_LIMIT|ALL_PLAYERS_FORFEITED/u);
  const app = readFileSync(new URL("../../src/App.tsx", import.meta.url), "utf8");
  assert.match(app, /roomView\.kind === "GEM_CARD_PLAYING"[\s\S]*<GemCardPlayingScreen/u);
  assert.match(app, /roomView\.kind === "GEM_CARD_FINISHED"[\s\S]*<GemCardFinishedScreen/u);
  assert.match(app, /selfState\?\.forfeited === false/u);
  const lobby = readFileSync(new URL("../../src/features/lobby/LobbyScreen.tsx", import.meta.url), "utf8");
  assert.match(lobby, /"GEM_CARD"[\s\S]*"보석 카드 게임"/u);
});
