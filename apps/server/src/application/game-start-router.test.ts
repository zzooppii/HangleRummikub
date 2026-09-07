import assert from "node:assert/strict";
import test from "node:test";

import {
  NicknameSchema,
  PlayerIdSchema,
  RequestIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import { createStorageRevision, type RoomRecord } from "../model/persistence.js";
import type { RoomRepository } from "../ports/room-repository.js";
import { GameStartRouter } from "./game-start-router.js";

const roomId = v.parse(RoomIdSchema, "room-start-router");
const actorPlayerId = v.parse(PlayerIdSchema, "player-start-router");
const input = Object.freeze({
  roomId,
  actorPlayerId,
  requestId: v.parse(RequestIdSchema, "request-start-router"),
  expectedRoomRevision: v.parse(RoomRevisionSchema, 0),
  authorization: { isCurrent: () => true },
});

function lobbyRoom(gameType: "HANGUL_TILE" | "NUMBER_TILE"): RoomRecord {
  const common = {
    roomId,
    roomCode: v.parse(RoomCodeSchema, "ABC234"),
    phase: "LOBBY",
    hostPlayerId: actorPlayerId,
    players: Object.freeze([
      {
        playerId: actorPlayerId,
        nickname: v.parse(NicknameSchema, "Player"),
        joinOrder: 0,
      },
    ]),
    game: null,
    roomRevision: v.parse(RoomRevisionSchema, 0),
    storageRevision: createStorageRevision(0),
    createdAt: v.parse(ServerTimeSchema, 1),
    updatedAt: v.parse(ServerTimeSchema, 1),
  } as const;
  return gameType === "HANGUL_TILE"
    ? Object.freeze({ ...common, gameType })
    : Object.freeze({ ...common, gameType });
}

function repository(room: RoomRecord | null): Pick<RoomRepository, "findById"> {
  return { findById: async () => room };
}

test("game:start delegates exactly once from canonical Room gameType", async () => {
  for (const selected of ["HANGUL_TILE", "NUMBER_TILE"] as const) {
    let hangulCalls = 0;
    let numberCalls = 0;
    const router = new GameStartRouter({
      gemCard: { gameType: "GEM_CARD", start: async () => { throw new Error("Unexpected GEM dispatch in two-game fixture."); } },
      roomRepository: repository(lobbyRoom(selected)),
      hangul: {
        gameType: "HANGUL_TILE",
        start: async () => {
          hangulCalls += 1;
          return {
            ok: false,
            error: { code: "HOST_ONLY", message: "hangul", recoverable: false },
          };
        },
      },
      numberTile: {
        gameType: "NUMBER_TILE",
        start: async () => {
          numberCalls += 1;
          return {
            ok: false,
            error: { code: "HOST_ONLY", message: "number", recoverable: false },
          };
        },
      },
    });

    const result = await router.start(input);
    assert.equal(result.ok, false);
    assert.equal(result.error.message, selected === "HANGUL_TILE" ? "hangul" : "number");
    assert.equal(hangulCalls, selected === "HANGUL_TILE" ? 1 : 0);
    assert.equal(numberCalls, selected === "NUMBER_TILE" ? 1 : 0);
  }
});

test("game:start fails before delegation when the Room is absent", async () => {
  let calls = 0;
  const router = new GameStartRouter({
      gemCard: { gameType: "GEM_CARD", start: async () => { throw new Error("Unexpected GEM dispatch in two-game fixture."); } },
    roomRepository: repository(null),
    hangul: {
      gameType: "HANGUL_TILE",
      start: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    },
    numberTile: {
      gameType: "NUMBER_TILE",
      start: async () => {
        calls += 1;
        throw new Error("must not run");
      },
    },
  });

  const result = await router.start(input);
  assert.deepEqual(result, {
    ok: false,
    error: {
      code: "ROOM_NOT_FOUND",
      message: "Room was not found.",
      recoverable: false,
    },
  });
  assert.equal(calls, 0);
});

test("game:start configuration fails fast when an exact capability is missing", () => {
  assert.throws(
    () =>
      new GameStartRouter({
      gemCard: { gameType: "GEM_CARD", start: async () => { throw new Error("Unexpected GEM dispatch in two-game fixture."); } },
        roomRepository: repository(null),
        hangul: {
          gameType: "HANGUL_TILE",
          start: async () => ({
            ok: false,
            error: { code: "INTERNAL_ERROR", message: "x", recoverable: false },
          }),
        },
        numberTile: undefined as unknown as ConstructorParameters<
          typeof GameStartRouter
        >[0]["numberTile"],
      }),
    /Missing NUMBER_TILE start capability\./u,
  );
});
