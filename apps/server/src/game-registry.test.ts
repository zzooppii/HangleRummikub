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
} from "./games/legacy-hangul-compatibility-registration.js";

test("legacy Hangul compatibility registration is the single exact frozen entry", () => {
  const registration = createLegacyHangulCompatibilityRegistration();
  const registry = new GameRegistry([registration]);

  assert.deepEqual(registration, { gameType: "HANGUL_TILE" });
  assert.ok(Object.isFrozen(registration));
  assert.strictEqual(
    registry.find("HANGUL_TILE"),
    registry.getRequired("HANGUL_TILE"),
  );
  assert.deepEqual(registry.getRequired("HANGUL_TILE"), {
    gameType: "HANGUL_TILE",
  });
});

test("lookup is exact and unknown runtime values fail closed without a Hangul fallback", () => {
  const registry = new GameRegistry([
    createLegacyHangulCompatibilityRegistration(),
  ]);

  for (const unknownGameType of [
    "hangul_tile",
    " HANGUL_TILE ",
    "NUMBER_TILE",
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

test("required lookup rejects an absent supported registration", () => {
  const registry = new GameRegistry([]);

  assert.equal(registry.find("HANGUL_TILE"), null);
  assert.throws(
    () => registry.getRequired("HANGUL_TILE"),
    /Game registration was not found\./u,
  );
});

test("duplicate registration fails during registry construction", () => {
  assert.throws(
    () =>
      new GameRegistry([
        createLegacyHangulCompatibilityRegistration(),
        createLegacyHangulCompatibilityRegistration(),
      ]),
    /Duplicate game registration: HANGUL_TILE\./u,
  );
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

test("the production-like composition root registers the legacy Hangul default", () => {
  const runtime = createApplicationRuntime();

  assert.deepEqual(
    runtime.gameRegistry.getRequired(LEGACY_V1_DEFAULT_GAME_TYPE),
    { gameType: "HANGUL_TILE" },
  );
});

test("the composition root fails immediately when the legacy default is missing", () => {
  assert.throws(
    () => createApplicationRuntime({ gameRegistrations: [] }),
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
