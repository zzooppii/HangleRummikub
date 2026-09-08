import assert from "node:assert/strict";
import test from "node:test";

import {
  NicknameSchema,
  PlayerIdSchema,
  type ConnectionStatus,
  type PlayerId,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { projectRoomParticipants } from "./project-room-participants.js";

const host = Object.freeze({
  playerId: parse(PlayerIdSchema, "participant-host"),
  nickname: parse(NicknameSchema, "Host"),
  joinOrder: 0,
});
const guest = Object.freeze({
  playerId: parse(PlayerIdSchema, "participant-guest"),
  nickname: parse(NicknameSchema, "Guest"),
  joinOrder: 1,
});

test("Room participants preserve input order, host identity and explicit connection statuses", () => {
  const statuses = new Map<PlayerId, ConnectionStatus>([
    [host.playerId, "CONNECTED"],
    [guest.playerId, "OFFLINE"],
  ]);

  assert.deepEqual(
    projectRoomParticipants([guest, host], host.playerId, statuses),
    [
      {
        playerId: guest.playerId,
        nickname: guest.nickname,
        isHost: false,
        connectionStatus: "OFFLINE",
      },
      {
        playerId: host.playerId,
        nickname: host.nickname,
        isHost: true,
        connectionStatus: "CONNECTED",
      },
    ],
  );
});

test("Room participants support a null host and default absent presence to OFFLINE", () => {
  assert.deepEqual(projectRoomParticipants([host, guest], null, new Map()), [
    {
      playerId: host.playerId,
      nickname: host.nickname,
      isHost: false,
      connectionStatus: "OFFLINE",
    },
    {
      playerId: guest.playerId,
      nickname: guest.nickname,
      isHost: false,
      connectionStatus: "OFFLINE",
    },
  ]);
});

test("Room participants are detached mutable whitelist objects and leave inputs unchanged", () => {
  const players = Object.freeze([
    Object.freeze({
      ...host,
      game: Object.freeze({ gameRevision: 3 }),
      rack: Object.freeze(["private-tile"]),
    }),
    guest,
  ]);
  const playersBefore = players.map((player) => ({ ...player }));
  const statuses = new Map<PlayerId, ConnectionStatus>([
    [host.playerId, "CONNECTED"],
  ]);
  const statusesBefore = new Map(statuses);

  const projected = projectRoomParticipants(players, host.playerId, statuses);

  assert.notEqual(projected, players);
  assert.equal(Object.isFrozen(projected), false);
  for (const [index, participant] of projected.entries()) {
    assert.notEqual(participant, players[index]);
    assert.equal(Object.isFrozen(participant), false);
    assert.deepEqual(Object.keys(participant).sort(), [
      "connectionStatus",
      "isHost",
      "nickname",
      "playerId",
    ]);
  }
  const first = projected[0];
  assert.ok(first);
  first.nickname = parse(NicknameSchema, "Changed");
  first.connectionStatus = "OFFLINE";
  projected.reverse();

  assert.deepEqual(players, playersBefore);
  assert.deepEqual(statuses, statusesBefore);
});
