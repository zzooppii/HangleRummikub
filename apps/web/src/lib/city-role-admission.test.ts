import assert from "node:assert/strict";
import test from "node:test";
import { validatePlatformSnapshotV2 } from "@hangul-rummikub/shared";
import { GAME_CATALOG } from "../features/game-catalog/game-catalog.js";
import { decodeWebSnapshot, WEB_SUPPORTED_GAME_TYPES } from "./snapshot-wire-decoder.js";
import { gemLobbyFixture } from "./gem-card-test-fixtures.js";
import { cityActionFixture, cityFinishedFixture, cityLobbyFixture, citySelectionFixture } from "./city-role-test-fixtures.js";
import { resolveRoomSnapshotView } from "./room-snapshot-view.js";
import { projectRoomSnapshotShell } from "./room-snapshot-shell.js";

test("P21D preserves CITY admission and activates exactly eight-game capability and Home", () => {
  assert.deepEqual([...WEB_SUPPORTED_GAME_TYPES], ["HANGUL_TILE", "NUMBER_TILE", "GEM_CARD", "CITY_ROLE", "DRAW_RELAY", "SNEAKY_LUNCH", "WOLF_NIGHT", "HALLI_GALLI"]);
  assert.deepEqual(GAME_CATALOG.map(item => item.gameType), [...WEB_SUPPORTED_GAME_TYPES]);
});

test("CITY V2 selection/action/pending/finished decode into concrete room routes without a legacy Rack adaptation", () => {
  for (const [snapshot, expected] of [[cityLobbyFixture(), "LOBBY"], [citySelectionFixture(), "CITY_ROLE_PLAYING"], [cityActionFixture(), "CITY_ROLE_PLAYING"], [cityActionFixture(true), "CITY_ROLE_PLAYING"], [cityFinishedFixture(), "CITY_ROLE_FINISHED"]] as const) {
    const decoded = decodeWebSnapshot(snapshot);
    assert.equal(decoded.kind, "COMPATIBLE");
    if (decoded.kind !== "COMPATIBLE") throw new Error("CITY valid projection rejected.");
    assert.equal(decoded.value.kind, "PLATFORM_V2_CITY_ROLE");
    assert.equal(resolveRoomSnapshotView(decoded.value).kind, expected);
    assert.equal("legacySnapshot" in decoded.value, false);
    const shell = projectRoomSnapshotShell(decoded.value);
    assert.equal(shell.room.gameType, "CITY_ROLE");
    assert.deepEqual(shell.self, snapshot.self);
    assert.equal("game" in shell, false);
    assert.equal("rack" in shell.self, false);
    assert.equal(JSON.stringify(shell).includes("city-own-card"), false);
  }
});

test("CITY decoder fails closed for fake V1, cross-game, phase mismatch and injected server/private fields", () => {
  const selection = citySelectionFixture(), pending = cityActionFixture(true);
  for (const value of [
    { ...selection, snapshotVersion: 1 },
    { ...selection, room: { ...selection.room, gameType: "NUMBER_TILE" } },
    { ...selection, room: { ...selection.room, phase: "FINISHED" } },
    { ...selection, game: { ...selection.game, hiddenRemoved: ["CR-08"] } },
    { ...selection, game: { ...selection.game, deck: ["private-future-card"] } },
    { ...selection, self: { ...selection.self, sessionToken: "private-credential" } },
    { ...selection, game: { ...selection.game, privateState: { ...selection.game.privateState, rack: [] } } },
    { ...pending, self: { playerId: "P1" } },
  ]) assert.equal(decodeWebSnapshot(value).kind, "INCOMPATIBLE");
});

test("CITY room route refuses wrong correlated phase/type even after a compatible decode", () => {
  const decoded = decodeWebSnapshot(citySelectionFixture());
  assert.equal(decoded.kind, "COMPATIBLE");
  if (decoded.kind !== "COMPATIBLE" || decoded.value.kind !== "PLATFORM_V2_CITY_ROLE") throw new Error("CITY fixture invalid.");
  const wrongType = structuredClone(decoded.value);
  Reflect.set(wrongType.platformSnapshot.room, "gameType", "GEM_CARD");
  assert.deepEqual(resolveRoomSnapshotView(wrongType), { kind: "INCOMPATIBLE", reason: "UNSUPPORTED_GAME_TYPE" });
  const wrongPhase = structuredClone(decoded.value);
  Reflect.set(wrongPhase.platformSnapshot.room, "phase", "FINISHED");
  assert.deepEqual(resolveRoomSnapshotView(wrongPhase), { kind: "INCOMPATIBLE", reason: "INVALID_V2_PROJECTION" });
});

test("P15C admits a valid CITY V2 Lobby into only its concrete CITY branch", () => {
  const gem = gemLobbyFixture();
  const city = { ...gem, room: { ...gem.room, gameType: "CITY_ROLE" } };
  assert.equal(validatePlatformSnapshotV2(city).ok, true);
  const decoded = decodeWebSnapshot(city);
  assert.equal(decoded.kind, "COMPATIBLE");
  if (decoded.kind !== "COMPATIBLE") throw new Error("Expected a compatible CITY Lobby.");
  assert.equal(decoded.value.kind, "PLATFORM_V2_CITY_ROLE");
  assert.equal("legacySnapshot" in decoded.value, false);
});
