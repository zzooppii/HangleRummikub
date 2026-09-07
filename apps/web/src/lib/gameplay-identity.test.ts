import assert from "node:assert/strict";
import test from "node:test";

import type {
  GameId,
  GameRevision,
  TurnId,
} from "@hangul-rummikub/shared";

import { isSameGameplayIdentity } from "./gameplay-identity.js";

const base = {
  gameId: "game-one" as GameId,
  gameRevision: 4 as GameRevision,
  turnId: "turn-one" as TurnId,
};

test("gameId, gameRevision, turnId가 모두 같으면 같은 gameplay identity다", () => {
  assert.equal(isSameGameplayIdentity(base, { ...base }), true);
});

test("gameId가 다르면 superseded identity다", () => {
  assert.equal(
    isSameGameplayIdentity(base, {
      ...base,
      gameId: "game-two" as GameId,
    }),
    false,
  );
});

test("gameRevision이 다르면 superseded identity다", () => {
  assert.equal(
    isSameGameplayIdentity(base, {
      ...base,
      gameRevision: 5 as GameRevision,
    }),
    false,
  );
});

test("turnId가 다르면 superseded identity다", () => {
  assert.equal(
    isSameGameplayIdentity(base, {
      ...base,
      turnId: "turn-two" as TurnId,
    }),
    false,
  );
});

test("presence와 wire representation metadata는 identity 비교에 관여하지 않는다", () => {
  const legacyV1Source = {
    ...base,
    presenceVersion: 1,
    wireRepresentation: "LEGACY_V1" as const,
  };
  const platformV2Source = {
    ...base,
    presenceVersion: 9,
    wireRepresentation: "PLATFORM_V2" as const,
  };

  assert.equal(
    isSameGameplayIdentity(legacyV1Source, platformV2Source),
    true,
  );
});
