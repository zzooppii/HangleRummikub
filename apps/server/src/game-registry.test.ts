import assert from "node:assert/strict";
import test from "node:test";

import type { GameType } from "@hangul-rummikub/shared";

import { createApplicationRuntime } from "./composition-root.js";
import {
  GameRegistry,
  type GameRegistration,
} from "./games/game-registry.js";
import {
  LEGACY_V1_DEFAULT_GAME_TYPE,
  createLegacyHangulCompatibilityRegistration,
} from "./games/hangul-tile/compatibility/legacy-hangul-compatibility-registration.js";
import {
  NUMBER_TILE_GAME_TYPE,
  createNumberTileRegistration,
} from "./games/number-tile/number-tile-registration.js";

test("the two concrete game registrations are exact frozen identity entries", () => {
  const hangulRegistration = createLegacyHangulCompatibilityRegistration();
  const numberRegistration = createNumberTileRegistration();
  const registry = new GameRegistry([
    hangulRegistration,
    numberRegistration,
  ]);

  assert.deepEqual(hangulRegistration, { gameType: "HANGUL_TILE" });
  assert.deepEqual(numberRegistration, { gameType: "NUMBER_TILE" });
  assert.ok(Object.isFrozen(hangulRegistration));
  assert.ok(Object.isFrozen(numberRegistration));
  assert.strictEqual(
    registry.find("HANGUL_TILE"),
    registry.getRequired("HANGUL_TILE"),
  );
  assert.deepEqual(registry.getRequired("HANGUL_TILE"), {
    gameType: "HANGUL_TILE",
  });
  assert.deepEqual(registry.getRequired("NUMBER_TILE"), {
    gameType: "NUMBER_TILE",
  });
});

test("lookup is exact and unknown runtime values fail closed without a Hangul fallback", () => {
  const registry = new GameRegistry([
    createLegacyHangulCompatibilityRegistration(),
    createNumberTileRegistration(),
  ]);

  for (const unknownGameType of [
    "hangul_tile",
    " HANGUL_TILE ",
    "number_tile",
    " NUMBER_TILE ",
    "GEM_CARD",
    "UNKNOWN_GAME",
    null,
    undefined,
    { gameType: "HANGUL_TILE" },
  ]) {
    assert.equal(registry.find(unknownGameType), null);
    assert.throws(
      () => registry.getRequired(unknownGameType),
      /Game registration was not found\./u,
    );
  }
});

test("required lookup rejects either absent supported registration", () => {
  const hangulOnly = new GameRegistry([
    createLegacyHangulCompatibilityRegistration(),
  ]);
  const numberOnly = new GameRegistry([createNumberTileRegistration()]);

  assert.equal(hangulOnly.find("NUMBER_TILE"), null);
  assert.throws(
    () => hangulOnly.getRequired("NUMBER_TILE"),
    /Game registration was not found\./u,
  );
  assert.equal(numberOnly.find("HANGUL_TILE"), null);
  assert.throws(
    () => numberOnly.getRequired("HANGUL_TILE"),
    /Game registration was not found\./u,
  );
});

test("duplicate registration for either game fails during registry construction", () => {
  for (const duplicate of [
    createLegacyHangulCompatibilityRegistration,
    createNumberTileRegistration,
  ]) {
    assert.throws(
      () => new GameRegistry([duplicate(), duplicate()]),
      /Duplicate game registration: (?:HANGUL_TILE|NUMBER_TILE)\./u,
    );
  }
});

test("registry copies and freezes registrations instead of retaining mutable inputs", () => {
  const mutableRegistration: { gameType: GameType } = {
    gameType: "HANGUL_TILE",
  };
  const mutableRegistrations: GameRegistration[] = [mutableRegistration];
  const registry = new GameRegistry(mutableRegistrations);
  const storedRegistration = registry.getRequired("HANGUL_TILE");

  assert.notStrictEqual(storedRegistration, mutableRegistration);
  assert.ok(Object.isFrozen(storedRegistration));
  assert.ok(Object.isFrozen(registry));

  assert.equal(
    Reflect.set(mutableRegistration, "gameType", "UNKNOWN_GAME"),
    true,
  );
  mutableRegistrations.length = 0;

  assert.deepEqual(registry.getRequired("HANGUL_TILE"), {
    gameType: "HANGUL_TILE",
  });
  assert.equal(
    Reflect.set(storedRegistration, "gameType", "UNKNOWN_GAME"),
    false,
  );
  assert.equal(registry.find("UNKNOWN_GAME"), null);
});

test("the production-like composition root registers exactly the three supported games", () => {
  const runtime = createApplicationRuntime();

  assert.deepEqual(
    runtime.gameRegistry.getRequired(LEGACY_V1_DEFAULT_GAME_TYPE),
    { gameType: "HANGUL_TILE" },
  );
  assert.deepEqual(
    runtime.gameRegistry.getRequired(NUMBER_TILE_GAME_TYPE),
    { gameType: "NUMBER_TILE" },
  );
  assert.deepEqual(runtime.gameRegistry.getRequired("GEM_CARD"), { gameType: "GEM_CARD" });
});

test("the composition root fails immediately when a supported game is missing", () => {
  assert.throws(
    () =>
      createApplicationRuntime({
        gameRegistrations: [createNumberTileRegistration()],
      }),
    /Game registration was not found\./u,
  );
  assert.throws(
    () =>
      createApplicationRuntime({
        gameRegistrations: [
          createLegacyHangulCompatibilityRegistration(),
        ],
      }),
    /Game registration was not found\./u,
  );
});

test("the composition root fails immediately for duplicate registrations", () => {
  assert.throws(
    () =>
      createApplicationRuntime({
        gameRegistrations: [
          createLegacyHangulCompatibilityRegistration(),
          createLegacyHangulCompatibilityRegistration(),
        ],
      }),
    /Duplicate game registration: HANGUL_TILE\./u,
  );
});
