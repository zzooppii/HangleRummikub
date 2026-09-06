import assert from "node:assert/strict";
import test from "node:test";

import { negotiateGameTypeCapability } from "./game-type-capability.js";

test("supportedGameTypes absence is an immutable Hangul-only legacy capability", () => {
  const result = negotiateGameTypeCapability({});
  assert.deepEqual(result, {
    ok: true,
    mode: "LEGACY_DEFAULT",
    supportedGameTypes: ["HANGUL_TILE"],
  });
  assert.equal(result.ok && Object.isFrozen(result.supportedGameTypes), true);
});

test("explicit known unique game capabilities are accepted without mutation", () => {
  const advertised = ["HANGUL_TILE", "NUMBER_TILE"];
  const auth = { supportedGameTypes: advertised };
  assert.deepEqual(negotiateGameTypeCapability(auth), {
    ok: true,
    mode: "EXPLICIT",
    supportedGameTypes: advertised,
  });
  assert.deepEqual(auth, { supportedGameTypes: advertised });
});

test("malformed, duplicate, unknown and oversized game capability fail closed", () => {
  for (const supportedGameTypes of [
    [],
    ["HANGUL_TILE", "HANGUL_TILE"],
    ["GEM_CARD"],
    ["HANGUL_TILE", "NUMBER_TILE", "GEM_CARD"],
    "HANGUL_TILE",
    null,
  ]) {
    assert.deepEqual(
      negotiateGameTypeCapability({ supportedGameTypes }),
      { ok: false },
    );
  }
});
