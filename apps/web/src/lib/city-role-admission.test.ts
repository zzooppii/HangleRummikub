import assert from "node:assert/strict";
import test from "node:test";
import { validatePlatformSnapshotV2 } from "@hangul-rummikub/shared";
import { GAME_CATALOG } from "../features/game-catalog/game-catalog.js";
import { decodeWebSnapshot, WEB_SUPPORTED_GAME_TYPES } from "./snapshot-wire-decoder.js";
import { gemLobbyFixture } from "./gem-card-test-fixtures.js";

test("P15B server CITY contract does not activate the three-game Web capability or Home", () => {
  assert.deepEqual([...WEB_SUPPORTED_GAME_TYPES], ["HANGUL_TILE", "NUMBER_TILE", "GEM_CARD"]);
  assert.deepEqual(GAME_CATALOG.map(item => item.gameType), [...WEB_SUPPORTED_GAME_TYPES]);
});

test("P15B current Web fails closed for an otherwise valid CITY V2 Lobby", () => {
  const gem = gemLobbyFixture();
  const city = { ...gem, room: { ...gem.room, gameType: "CITY_ROLE" } };
  assert.equal(validatePlatformSnapshotV2(city).ok, true);
  assert.deepEqual(decodeWebSnapshot(city), { kind: "INCOMPATIBLE", reason: "UNSUPPORTED_GAME_TYPE" });
});
