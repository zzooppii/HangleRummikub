import assert from "node:assert/strict";
import test from "node:test";

import { validateRoomCode } from "@hangul-rummikub/shared";

import {
  createInvitationUrl,
  parseAppPathname,
} from "./room-url.js";

function validRoomCode() {
  const result = validateRoomCode("ABC234");

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Room code fixture must be valid.");
  }

  return result.value;
}

test("root path는 Home route로 해석한다", () => {
  assert.deepEqual(parseAppPathname("/"), { kind: "HOME" });
});

test("room path는 shared policy로 검증하고 canonical uppercase로 만든다", () => {
  assert.deepEqual(parseAppPathname("/room/ABC234"), {
    kind: "ROOM",
    roomCode: "ABC234",
  });
  assert.deepEqual(parseAppPathname("/room/abc234"), {
    kind: "ROOM",
    roomCode: "ABC234",
  });
});

test("잘못된 room code와 알 수 없는 path를 구분한다", () => {
  assert.deepEqual(parseAppPathname("/room/ABC20O"), {
    kind: "INVALID_ROOM_INVITATION",
  });
  assert.deepEqual(parseAppPathname("/unknown"), { kind: "NOT_FOUND" });
  assert.deepEqual(parseAppPathname("/room/ABC234/extra"), {
    kind: "NOT_FOUND",
  });
});

test("invitation URL은 origin과 canonical room code만 포함한다", () => {
  const invitationUrl = createInvitationUrl(
    "https://rummikub.example",
    validRoomCode(),
  );

  assert.equal(invitationUrl, "https://rummikub.example/room/ABC234");
  assert.equal(invitationUrl.includes("sessionToken"), false);
  assert.equal(invitationUrl.includes("playerId"), false);
  assert.equal(invitationUrl.includes("socketId"), false);
});
