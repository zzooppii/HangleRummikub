const unexpectedGemLifecycle = Object.freeze({ gameType: "GEM_CARD" as const, applyPlayingLeave: () => { throw new Error("Unexpected GEM leave in two-game fixture."); }, planPresenceRestored: () => { throw new Error("Unexpected GEM presence in two-game fixture."); } });
const unexpectedCityLifecycle = Object.freeze({ gameType: "CITY_ROLE" as const, applyPlayingLeave: () => { throw new Error("Unexpected CITY leave in two-game fixture."); }, planPresenceRestored: () => { throw new Error("Unexpected CITY presence in two-game fixture."); } });
import assert from "node:assert/strict";
import test from "node:test";

import {
  NicknameSchema,
  PlayerIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  type PlayerId,
  type ServerTime,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type { LegacyHangulPlayerLifecycleActionRouting } from "../games/hangul-tile/compatibility/legacy-hangul-player-lifecycle-actions.js";
import type { NumberTilePlayerLifecycleActionRouting } from "../games/number-tile/application/number-tile-player-lifecycle-actions.js";
import {
  createStorageRevision,
  type RoomRecord,
} from "../model/persistence.js";
import { PlayerLifecycleRouter } from "./player-lifecycle-router.js";

const actorPlayerId = v.parse(PlayerIdSchema, "lifecycle-router-player");
const occurredAt = v.parse(ServerTimeSchema, 7_000);

function lobbyRoom(gameType: "HANGUL_TILE" | "NUMBER_TILE"): RoomRecord {
  const common = {
    roomId: v.parse(RoomIdSchema, `lifecycle-router-${gameType}`),
    roomCode: v.parse(
      RoomCodeSchema,
      gameType === "HANGUL_TILE" ? "DFGHJK" : "FGHJKM",
    ),
    phase: "LOBBY",
    hostPlayerId: actorPlayerId,
    players: Object.freeze([
      Object.freeze({
        playerId: actorPlayerId,
        nickname: v.parse(NicknameSchema, "RouterPlayer"),
        joinOrder: 0,
      }),
    ]),
    game: null,
    roomRevision: v.parse(RoomRevisionSchema, 0),
    storageRevision: createStorageRevision(0),
    createdAt: v.parse(ServerTimeSchema, 1_000),
    updatedAt: v.parse(ServerTimeSchema, 1_000),
  } as const;
  return gameType === "HANGUL_TILE"
    ? Object.freeze({ ...common, gameType })
    : Object.freeze({ ...common, gameType });
}

function createRecordingCapabilities() {
  const hangulLeaveRooms: RoomRecord[] = [];
  const numberLeaveRooms: RoomRecord[] = [];
  const hangulPresence: Array<
    Readonly<{ room: RoomRecord; playerId: PlayerId }>
  > = [];
  const numberPresence: Array<
    Readonly<{ room: RoomRecord; playerId: PlayerId }>
  > = [];

  const hangul: LegacyHangulPlayerLifecycleActionRouting = Object.freeze({
    gameType: "HANGUL_TILE",
    applyPlayingLeave: (input: {
      room: RoomRecord;
      actorPlayerId: PlayerId;
      occurredAt: ServerTime;
    }) => {
      hangulLeaveRooms.push(input.room);
      return Object.freeze({
        candidate: input.room,
        nextTurnIdentity: null,
        finishedGameId: null,
        advisory: "TURN_STARTED",
      });
    },
    planPresenceRestored: (room: RoomRecord, playerId: PlayerId) => {
      hangulPresence.push(Object.freeze({ room, playerId }));
      return Object.freeze({ status: "NO_CHANGE" });
    },
  });
  const numberTile: NumberTilePlayerLifecycleActionRouting = Object.freeze({
    gameType: "NUMBER_TILE",
    applyPlayingLeave: (input: {
      room: RoomRecord;
      actorPlayerId: PlayerId;
      occurredAt: ServerTime;
    }) => {
      numberLeaveRooms.push(input.room);
      return Object.freeze({
        candidate: input.room,
        nextTurnIdentity: null,
        finishedGameId: null,
        advisory: "NONE",
      });
    },
    planPresenceRestored: (room: RoomRecord, playerId: PlayerId) => {
      numberPresence.push(Object.freeze({ room, playerId }));
      return Object.freeze({ status: "NO_CHANGE" });
    },
  });

  return {
    hangul,
    numberTile,
    hangulLeaveRooms,
    numberLeaveRooms,
    hangulPresence,
    numberPresence,
  };
}

test("player lifecycle leave dispatches exactly once by canonical Room gameType", () => {
  const capabilities = createRecordingCapabilities();
  const router = new PlayerLifecycleRouter({ ...capabilities, gemCard: unexpectedGemLifecycle, cityRole: unexpectedCityLifecycle });
  const hangulRoom = lobbyRoom("HANGUL_TILE");
  const numberRoom = lobbyRoom("NUMBER_TILE");

  const hangulResult = router.applyPlayingLeave({
    room: hangulRoom,
    actorPlayerId,
    occurredAt,
  });
  const numberResult = router.applyPlayingLeave({
    room: numberRoom,
    actorPlayerId,
    occurredAt,
  });

  assert.deepEqual(capabilities.hangulLeaveRooms, [hangulRoom]);
  assert.deepEqual(capabilities.numberLeaveRooms, [numberRoom]);
  assert.equal(hangulResult.advisory, "TURN_STARTED");
  assert.equal(numberResult.advisory, "NONE");
});

test("presence restoration dispatches exactly once by canonical Room gameType", () => {
  const capabilities = createRecordingCapabilities();
  const router = new PlayerLifecycleRouter({ ...capabilities, gemCard: unexpectedGemLifecycle, cityRole: unexpectedCityLifecycle });
  const hangulRoom = lobbyRoom("HANGUL_TILE");
  const numberRoom = lobbyRoom("NUMBER_TILE");

  assert.deepEqual(
    router.planPresenceRestored(hangulRoom, actorPlayerId),
    { status: "NO_CHANGE" },
  );
  assert.deepEqual(
    router.planPresenceRestored(numberRoom, actorPlayerId),
    { status: "NO_CHANGE" },
  );
  assert.deepEqual(capabilities.hangulPresence, [
    { room: hangulRoom, playerId: actorPlayerId },
  ]);
  assert.deepEqual(capabilities.numberPresence, [
    { room: numberRoom, playerId: actorPlayerId },
  ]);
});

test("player lifecycle routing fails fast when either concrete capability is missing", () => {
  const capabilities = createRecordingCapabilities();

  assert.throws(
    () =>
      Reflect.construct(PlayerLifecycleRouter, [
        {
          hangul: capabilities.numberTile,
          numberTile: capabilities.numberTile,
        },
      ]),
    /Missing HANGUL_TILE player lifecycle capability\./u,
  );
  assert.throws(
    () =>
      Reflect.construct(PlayerLifecycleRouter, [
        {
          hangul: capabilities.hangul,
          numberTile: capabilities.hangul,
        },
      ]),
    /Missing NUMBER_TILE player lifecycle capability\./u,
  );
});

test("the Number lifecycle result cannot introduce a legacy advisory", () => {
  const capabilities = createRecordingCapabilities();
  const router = new PlayerLifecycleRouter({ ...capabilities, gemCard: unexpectedGemLifecycle, cityRole: unexpectedCityLifecycle });
  const result = router.applyPlayingLeave({
    room: lobbyRoom("NUMBER_TILE"),
    actorPlayerId,
    occurredAt: v.parse(ServerTimeSchema, 8_000),
  });

  assert.deepEqual(result, {
    candidate: lobbyRoom("NUMBER_TILE"),
    nextTurnIdentity: null,
    finishedGameId: null,
    advisory: "NONE",
  });
});
