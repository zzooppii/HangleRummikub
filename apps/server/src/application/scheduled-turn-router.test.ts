import assert from "node:assert/strict";
import test from "node:test";

import {
  GameIdSchema,
  GameRevisionSchema,
  NicknameSchema,
  PlayerIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  TurnIdSchema,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import { createStorageRevision, type RoomRecord } from "../model/persistence.js";
import { ScheduledTurnRouter } from "./scheduled-turn-router.js";

const roomId = v.parse(RoomIdSchema, "room-scheduled-router");
const playerId = v.parse(PlayerIdSchema, "player-scheduled-router");
const deadline = Object.freeze({
  roomId,
  gameId: v.parse(GameIdSchema, "game-scheduled-router"),
  expectedGameRevision: v.parse(GameRevisionSchema, 0),
  turnId: v.parse(TurnIdSchema, "turn-scheduled-router"),
  deadlineAt: v.parse(ServerTimeSchema, 90_000),
});

function room(gameType: "HANGUL_TILE" | "NUMBER_TILE"): RoomRecord {
  return {
    roomId,
    roomCode: v.parse(RoomCodeSchema, "BCD234"),
    gameType,
    phase: "LOBBY",
    hostPlayerId: playerId,
    players: [{
      playerId,
      nickname: v.parse(NicknameSchema, "Player"),
      joinOrder: 0,
    }],
    game: null,
    roomRevision: v.parse(RoomRevisionSchema, 0),
    storageRevision: createStorageRevision(0),
    createdAt: v.parse(ServerTimeSchema, 0),
    updatedAt: v.parse(ServerTimeSchema, 0),
  };
}

test("scheduled turn routing selects exactly one concrete timeout capability", async () => {
  for (const selected of ["HANGUL_TILE", "NUMBER_TILE"] as const) {
    const calls: string[] = [];
    const router = new ScheduledTurnRouter({
      cityRole: { gameType: "CITY_ROLE", handleTurnTimeout: async () => { throw new Error("Unexpected CITY timeout in two-game fixture."); } },
      gemCard: { gameType: "GEM_CARD", handleTurnTimeout: async () => { throw new Error("Unexpected GEM timeout in two-game fixture."); } },
      roomRepository: { findById: async () => room(selected) },
      hangul: {
        gameType: "HANGUL_TILE",
        handleTurnTimeout: async () => {
          calls.push("HANGUL_TILE");
          return { status: "APPLIED" };
        },
      },
      numberTile: {
        gameType: "NUMBER_TILE",
        handleTurnTimeout: async () => {
          calls.push("NUMBER_TILE");
          return { status: "APPLIED" };
        },
      },
    });

    assert.deepEqual(await router.handleTurnTimeout(deadline), {
      status: "APPLIED",
    });
    assert.deepEqual(calls, [selected]);
  }
});

test("scheduled turn routing does not delegate an absent Room", async () => {
  let calls = 0;
  const router = new ScheduledTurnRouter({
    cityRole: { gameType: "CITY_ROLE", handleTurnTimeout: async () => { throw new Error("Unexpected CITY timeout in two-game fixture."); } },
      gemCard: { gameType: "GEM_CARD", handleTurnTimeout: async () => { throw new Error("Unexpected GEM timeout in two-game fixture."); } },
    roomRepository: { findById: async () => null },
    hangul: {
      gameType: "HANGUL_TILE",
      handleTurnTimeout: async () => {
        calls += 1;
        return { status: "APPLIED" };
      },
    },
    numberTile: {
      gameType: "NUMBER_TILE",
      handleTurnTimeout: async () => {
        calls += 1;
        return { status: "APPLIED" };
      },
    },
  });

  assert.deepEqual(await router.handleTurnTimeout(deadline), {
    status: "NO_OP",
  });
  assert.equal(calls, 0);
});
