import assert from "node:assert/strict";
import test from "node:test";

import {
  LEGACY_ROOM_ADMISSION_CAPABILITIES,
  isRoomAdmissionCompatible,
} from "./room-admission-policy.js";

test("missing game capability remains the legacy Hangul-only V1 policy", () => {
  assert.deepEqual(LEGACY_ROOM_ADMISSION_CAPABILITIES, {
    selectedSnapshotVersion: 1,
    supportedGameTypes: ["HANGUL_TILE"],
  });
  assert.equal(
    isRoomAdmissionCompatible(
      "HANGUL_TILE",
      LEGACY_ROOM_ADMISSION_CAPABILITIES,
    ),
    true,
  );
  assert.equal(
    isRoomAdmissionCompatible(
      "NUMBER_TILE",
      LEGACY_ROOM_ADMISSION_CAPABILITIES,
    ),
    false,
  );
});

test("Number admission requires both exact game support and snapshot V2", () => {
  assert.equal(
    isRoomAdmissionCompatible("NUMBER_TILE", {
      selectedSnapshotVersion: 2,
      supportedGameTypes: ["NUMBER_TILE"],
    }),
    true,
  );
  assert.equal(
    isRoomAdmissionCompatible("NUMBER_TILE", {
      selectedSnapshotVersion: 1,
      supportedGameTypes: ["HANGUL_TILE", "NUMBER_TILE"],
    }),
    false,
  );
  assert.equal(
    isRoomAdmissionCompatible("NUMBER_TILE", {
      selectedSnapshotVersion: 2,
      supportedGameTypes: ["HANGUL_TILE"],
    }),
    false,
  );
});

test("an explicit capability does not grant access to an unadvertised game", () => {
  assert.equal(
    isRoomAdmissionCompatible("HANGUL_TILE", {
      selectedSnapshotVersion: 2,
      supportedGameTypes: ["HANGUL_TILE", "NUMBER_TILE"],
    }),
    true,
  );
  assert.equal(
    isRoomAdmissionCompatible("HANGUL_TILE", {
      selectedSnapshotVersion: 2,
      supportedGameTypes: ["NUMBER_TILE"],
    }),
    false,
  );
});
