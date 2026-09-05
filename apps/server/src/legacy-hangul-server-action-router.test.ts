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
  type GameType,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type { GameDeadlineResult } from "./application/game-deadline-service.js";
import type { TurnTimeoutResult } from "./application/turn-timeout-service.js";
import {
  LegacyHangulServerActionRouter,
  type LegacyHangulServerActionCapability,
  type LegacyHangulServerActionRouterDependencies,
} from "./games/legacy-hangul-server-action-router.js";
import { LEGACY_V1_DEFAULT_GAME_TYPE } from "./games/legacy-hangul-compatibility-registration.js";
import {
  createStorageRevision,
  type RoomRecord,
} from "./model/persistence.js";
import type {
  ScheduledGameDeadline,
  ScheduledTurnDeadline,
} from "./ports/system.js";

const roomId = v.parse(RoomIdSchema, "room-server-action-routing");
const gameId = v.parse(GameIdSchema, "game-server-action-routing");
const turnId = v.parse(TurnIdSchema, "turn-server-action-routing");
const playerId = v.parse(PlayerIdSchema, "player-server-action-routing");

const turnDeadline: ScheduledTurnDeadline = Object.freeze({
  roomId,
  gameId,
  turnId,
  expectedGameRevision: v.parse(GameRevisionSchema, 7),
  deadlineAt: v.parse(ServerTimeSchema, 60_000),
});

const gameDeadline: ScheduledGameDeadline = Object.freeze({
  roomId,
  gameId,
  deadlineAt: v.parse(ServerTimeSchema, 1_500_000),
});

const turnTimeoutResult: TurnTimeoutResult = Object.freeze({
  status: "NO_OP",
  reason: "STALE_TURN",
});

const gameDeadlineResult: GameDeadlineResult = Object.freeze({
  status: "NO_OP",
  reason: "STALE_GAME",
});

function createRoom(): RoomRecord {
  return Object.freeze({
    roomId,
    roomCode: v.parse(RoomCodeSchema, "ABC234"),
    gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
    phase: "LOBBY",
    hostPlayerId: playerId,
    players: Object.freeze([
      Object.freeze({
        playerId,
        nickname: v.parse(NicknameSchema, "서버액션"),
        joinOrder: 0,
      }),
    ]),
    game: null,
    roomRevision: v.parse(RoomRevisionSchema, 2),
    storageRevision: createStorageRevision(3),
    createdAt: v.parse(ServerTimeSchema, 1_000),
    updatedAt: v.parse(ServerTimeSchema, 2_000),
  });
}

type ActionCalls = {
  turnTimeout: ScheduledTurnDeadline[];
  gameDeadline: ScheduledGameDeadline[];
};

function createCapability(): Readonly<{
  capability: LegacyHangulServerActionCapability;
  calls: ActionCalls;
}> {
  const calls: ActionCalls = { turnTimeout: [], gameDeadline: [] };
  const capability = {
    gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
    async handleTurnTimeout(input: ScheduledTurnDeadline) {
      calls.turnTimeout.push(input);
      return turnTimeoutResult;
    },
    async handleGameDeadline(input: ScheduledGameDeadline) {
      calls.gameDeadline.push(input);
      return gameDeadlineResult;
    },
  } satisfies LegacyHangulServerActionCapability;

  return { capability, calls };
}

function createRouter(
  room: RoomRecord | null = createRoom(),
): Readonly<{
  router: LegacyHangulServerActionRouter;
  capability: LegacyHangulServerActionCapability;
  calls: ActionCalls;
}> {
  const { capability, calls } = createCapability();
  return {
    router: new LegacyHangulServerActionRouter({
      roomRepository: { findById: async () => room },
      capability,
    }),
    capability,
    calls,
  };
}

test("Turn timeout은 canonical HANGUL_TILE capability에 exact identity를 한 번 위임한다", async () => {
  const { router, calls } = createRouter();

  const result = await router.handleTurnTimeout(turnDeadline);

  assert.strictEqual(result, turnTimeoutResult);
  assert.deepEqual(calls.turnTimeout, [turnDeadline]);
  assert.strictEqual(calls.turnTimeout[0], turnDeadline);
  assert.deepEqual(calls.gameDeadline, []);
});

test("Game deadline은 canonical HANGUL_TILE capability에 exact identity를 한 번 위임한다", async () => {
  const { router, calls } = createRouter();

  const result = await router.handleGameDeadline(gameDeadline);

  assert.strictEqual(result, gameDeadlineResult);
  assert.deepEqual(calls.gameDeadline, [gameDeadline]);
  assert.strictEqual(calls.gameDeadline[0], gameDeadline);
  assert.deepEqual(calls.turnTimeout, []);
});

test("missing Room은 action별 ROOM_NOT_FOUND no-op이며 capability를 호출하지 않는다", async () => {
  const { router, calls } = createRouter(null);

  assert.deepEqual(await router.handleTurnTimeout(turnDeadline), {
    status: "NO_OP",
    reason: "ROOM_NOT_FOUND",
  });
  assert.deepEqual(await router.handleGameDeadline(gameDeadline), {
    status: "NO_OP",
    reason: "ROOM_NOT_FOUND",
  });
  assert.deepEqual(calls, { turnTimeout: [], gameDeadline: [] });
});

test("unsupported canonical gameType은 두 action 모두 fail closed하고 delegate를 호출하지 않는다", async () => {
  const corruptRoom = Object.freeze({
    ...createRoom(),
    // Models corrupt persistence that cannot be constructed through GameTypeSchema.
    gameType: "UNKNOWN_GAME" as GameType,
  });
  const { router, calls } = createRouter(corruptRoom);

  assert.deepEqual(await router.handleTurnTimeout(turnDeadline), {
    status: "FAILED",
    reason: "INTERNAL_ERROR",
  });
  assert.deepEqual(await router.handleGameDeadline(gameDeadline), {
    status: "FAILED",
    reason: "INTERNAL_ERROR",
  });
  assert.deepEqual(calls, { turnTimeout: [], gameDeadline: [] });
});

test("canonical Room lookup failure는 두 action 모두 INTERNAL_ERROR로 닫힌다", async () => {
  const { capability, calls } = createCapability();
  const router = new LegacyHangulServerActionRouter({
    roomRepository: {
      findById: async () => {
        throw new Error("injected Room read failure");
      },
    },
    capability,
  });

  assert.deepEqual(await router.handleTurnTimeout(turnDeadline), {
    status: "FAILED",
    reason: "INTERNAL_ERROR",
  });
  assert.deepEqual(await router.handleGameDeadline(gameDeadline), {
    status: "FAILED",
    reason: "INTERNAL_ERROR",
  });
  assert.deepEqual(calls, { turnTimeout: [], gameDeadline: [] });
});

test("missing 또는 incomplete server-action capability는 constructor에서 fail fast한다", () => {
  const roomRepository = { findById: async () => createRoom() };
  const missingCapability = {
    roomRepository,
    capability: undefined,
  } as unknown as LegacyHangulServerActionRouterDependencies;
  const incompleteCapability = {
    roomRepository,
    capability: {
      gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
      handleTurnTimeout: async () => turnTimeoutResult,
    },
  } as unknown as LegacyHangulServerActionRouterDependencies;

  assert.throws(
    () => new LegacyHangulServerActionRouter(missingCapability),
    /Legacy Hangul server-action capability is missing or invalid\./u,
  );
  assert.throws(
    () => new LegacyHangulServerActionRouter(incompleteCapability),
    /Legacy Hangul server-action capability is missing or invalid\./u,
  );
});

test("router는 capability를 copy한 뒤 caller replacement로부터 격리된다", async () => {
  let originalTimeoutCalls = 0;
  let originalDeadlineCalls = 0;
  let replacementCalls = 0;
  const mutableCapability = {
    gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
    handleTurnTimeout: async () => {
      originalTimeoutCalls += 1;
      return turnTimeoutResult;
    },
    handleGameDeadline: async () => {
      originalDeadlineCalls += 1;
      return gameDeadlineResult;
    },
  } satisfies LegacyHangulServerActionCapability;
  const router = new LegacyHangulServerActionRouter({
    roomRepository: { findById: async () => createRoom() },
    capability: mutableCapability,
  });

  mutableCapability.handleTurnTimeout = async () => {
    replacementCalls += 1;
    return turnTimeoutResult;
  };
  mutableCapability.handleGameDeadline = async () => {
    replacementCalls += 1;
    return gameDeadlineResult;
  };

  assert.ok(Object.isFrozen(router));
  assert.strictEqual(
    await router.handleTurnTimeout(turnDeadline),
    turnTimeoutResult,
  );
  assert.strictEqual(
    await router.handleGameDeadline(gameDeadline),
    gameDeadlineResult,
  );
  assert.equal(originalTimeoutCalls, 1);
  assert.equal(originalDeadlineCalls, 1);
  assert.equal(replacementCalls, 0);
});
