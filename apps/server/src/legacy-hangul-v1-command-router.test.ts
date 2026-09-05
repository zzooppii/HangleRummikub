import assert from "node:assert/strict";
import test from "node:test";

import {
  GameIdSchema,
  GameRevisionSchema,
  NicknameSchema,
  PlayerIdSchema,
  ProposedBoardSchema,
  RequestIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
  TileIdSchema,
  TurnIdSchema,
  TurnNumberSchema,
  type GameType,
} from "@hangul-rummikub/shared";
import * as v from "valibot";

import type {
  GameStartResult,
  StartGameInput,
} from "./application/game-start-service.js";
import type {
  TurnDrawInput,
  TurnDrawResult,
} from "./application/turn-draw-service.js";
import type {
  TurnPassInput,
  TurnPassResult,
} from "./application/turn-pass-service.js";
import type {
  TurnSubmitInput,
  TurnSubmitResult,
} from "./application/turn-submit-service.js";
import {
  LegacyHangulV1CommandRouter,
  type LegacyHangulV1CommandCapability,
  type LegacyHangulV1CommandRouterDependencies,
} from "./games/legacy-hangul-v1-command-router.js";
import { LEGACY_V1_DEFAULT_GAME_TYPE } from "./games/legacy-hangul-compatibility-registration.js";
import {
  createStorageRevision,
  type RoomRecord,
} from "./model/persistence.js";

const roomId = v.parse(RoomIdSchema, "room-command-routing");
const playerId = v.parse(PlayerIdSchema, "player-command-routing");
const nickname = v.parse(NicknameSchema, "라우터");
const gameId = v.parse(GameIdSchema, "game-command-routing");
const turnId = v.parse(TurnIdSchema, "turn-command-routing");
const nextTurnId = v.parse(TurnIdSchema, "next-turn-command-routing");
const drawnTileId = v.parse(TileIdSchema, "drawn-tile-command-routing");
const requestId = v.parse(RequestIdSchema, "request-command-routing");
const roomRevision = v.parse(RoomRevisionSchema, 2);
const gameRevision = v.parse(GameRevisionSchema, 3);
const nextGameRevision = v.parse(GameRevisionSchema, 4);
const turnNumber = v.parse(TurnNumberSchema, 5);
const receivedAt = v.parse(ServerTimeSchema, 12_345);
const proposedBoard = v.parse(ProposedBoardSchema, { wordGroups: [] });
const authorization = Object.freeze({ isCurrent: () => true });

const startInput: StartGameInput = Object.freeze({
  roomId,
  actorPlayerId: playerId,
  requestId,
  expectedRoomRevision: roomRevision,
  authorization,
});

const submitInput: TurnSubmitInput = Object.freeze({
  roomId,
  actorPlayerId: playerId,
  requestId,
  expectedGameRevision: gameRevision,
  turnId,
  receivedAt,
  proposedBoard,
  authorization,
});

const drawInput: TurnDrawInput = Object.freeze({
  roomId,
  actorPlayerId: playerId,
  requestId,
  expectedGameRevision: gameRevision,
  turnId,
  receivedAt,
  bagKind: "CONSONANT",
  authorization,
});

const passInput: TurnPassInput = Object.freeze({
  roomId,
  actorPlayerId: playerId,
  requestId,
  expectedGameRevision: gameRevision,
  turnId,
  receivedAt,
  authorization,
});

const startResult: GameStartResult = Object.freeze({
  ok: true,
  data: Object.freeze({
    roomId,
    gameId,
    roomRevision,
    gameRevision,
    turnId,
  }),
});

const submitResult: TurnSubmitResult = Object.freeze({
  ok: true,
  data: Object.freeze({
    roomId,
    gameId,
    roomRevision,
    gameRevision: nextGameRevision,
    outcome: "ADVANCED",
    nextTurnId,
    nextTurnNumber: turnNumber,
  }),
});

const drawResult: TurnDrawResult = Object.freeze({
  ok: true,
  data: Object.freeze({
    roomId,
    gameId,
    roomRevision,
    gameRevision: nextGameRevision,
    drawnTileId,
    bagKind: "CONSONANT",
    nextTurnId,
    nextTurnNumber: turnNumber,
  }),
});

const passResult: TurnPassResult = Object.freeze({
  ok: true,
  data: Object.freeze({
    roomId,
    gameId,
    roomRevision,
    gameRevision: nextGameRevision,
    outcome: "ADVANCED",
    nextTurnId,
    nextTurnNumber: turnNumber,
  }),
});

function createLobbyRoom(): RoomRecord {
  return Object.freeze({
    roomId,
    roomCode: v.parse(RoomCodeSchema, "ABC234"),
    gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
    phase: "LOBBY",
    hostPlayerId: playerId,
    players: Object.freeze([
      Object.freeze({ playerId, nickname, joinOrder: 0 }),
    ]),
    game: null,
    roomRevision,
    storageRevision: createStorageRevision(0),
    createdAt: v.parse(ServerTimeSchema, 1_000),
    updatedAt: v.parse(ServerTimeSchema, 2_000),
  });
}

type CommandCalls = {
  start: StartGameInput[];
  submit: TurnSubmitInput[];
  draw: TurnDrawInput[];
  pass: TurnPassInput[];
};

function createCapability(): Readonly<{
  capability: LegacyHangulV1CommandCapability;
  calls: CommandCalls;
}> {
  const calls: CommandCalls = {
    start: [],
    submit: [],
    draw: [],
    pass: [],
  };
  const capability = {
    gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
    async start(input: StartGameInput) {
      calls.start.push(input);
      return startResult;
    },
    async submit(input: TurnSubmitInput) {
      calls.submit.push(input);
      return submitResult;
    },
    async draw(input: TurnDrawInput) {
      calls.draw.push(input);
      return drawResult;
    },
    async pass(input: TurnPassInput) {
      calls.pass.push(input);
      return passResult;
    },
  } satisfies LegacyHangulV1CommandCapability;

  return { capability, calls };
}

function createRouter(
  room: RoomRecord | null = createLobbyRoom(),
): Readonly<{
  router: LegacyHangulV1CommandRouter;
  capability: LegacyHangulV1CommandCapability;
  calls: CommandCalls;
}> {
  const { capability, calls } = createCapability();
  return {
    router: new LegacyHangulV1CommandRouter({
      roomRepository: { findById: async () => room },
      capability,
    }),
    capability,
    calls,
  };
}

test("game:start는 canonical HANGUL_TILE Room을 exact capability에 한 번 위임한다", async () => {
  const { router, calls } = createRouter();

  const result = await router.start(startInput);

  assert.strictEqual(result, startResult);
  assert.deepEqual(calls.start, [startInput]);
  assert.strictEqual(calls.start[0], startInput);
});

test("turn:submit은 payload, revision, requestId와 receivedAt identity를 보존한다", async () => {
  const { router, calls } = createRouter();

  const result = await router.submit(submitInput);

  assert.strictEqual(result, submitResult);
  assert.deepEqual(calls.submit, [submitInput]);
  assert.strictEqual(calls.submit[0], submitInput);
  assert.strictEqual(calls.submit[0]?.proposedBoard, proposedBoard);
  assert.equal(calls.submit[0]?.receivedAt, receivedAt);
  assert.equal(calls.submit[0]?.requestId, requestId);
});

test("turn:draw는 bag selection, revision, requestId와 receivedAt을 해석 없이 전달한다", async () => {
  const { router, calls } = createRouter();

  const result = await router.draw(drawInput);

  assert.strictEqual(result, drawResult);
  assert.deepEqual(calls.draw, [drawInput]);
  assert.strictEqual(calls.draw[0], drawInput);
  assert.equal(calls.draw[0]?.bagKind, "CONSONANT");
  assert.equal(calls.draw[0]?.receivedAt, receivedAt);
  assert.equal(calls.draw[0]?.requestId, requestId);
});

test("turn:pass는 rule 판단 없이 exact input과 result를 한 번 전달한다", async () => {
  const { router, calls } = createRouter();

  const result = await router.pass(passInput);

  assert.strictEqual(result, passResult);
  assert.deepEqual(calls.pass, [passInput]);
  assert.strictEqual(calls.pass[0], passInput);
  assert.equal(calls.pass[0]?.receivedAt, receivedAt);
  assert.equal(calls.pass[0]?.requestId, requestId);
});

test("unsupported canonical gameType은 모든 Hangul capability 호출 전에 fail closed한다", async () => {
  const originalRoom = createLobbyRoom();
  const corruptRoom = Object.freeze({
    ...originalRoom,
    // This intentionally models corrupt persistence that cannot be expressed by GameType.
    gameType: "UNKNOWN_GAME" as GameType,
  });
  const { router, calls } = createRouter(corruptRoom);

  const results = await Promise.all([
    router.start(startInput),
    router.submit(submitInput),
    router.draw(drawInput),
    router.pass(passInput),
  ]);

  for (const result of results) {
    assert.deepEqual(result, {
      ok: false,
      error: {
        code: "INTERNAL_ERROR",
        message: "An internal error occurred.",
        recoverable: false,
      },
    });
  }
  assert.deepEqual(calls, { start: [], submit: [], draw: [], pass: [] });
  assert.deepEqual(originalRoom, createLobbyRoom());
});

test("missing Room은 기존 ROOM_NOT_FOUND 결과를 유지하고 capability를 호출하지 않는다", async () => {
  const { router, calls } = createRouter(null);

  const results = await Promise.all([
    router.start(startInput),
    router.submit(submitInput),
    router.draw(drawInput),
    router.pass(passInput),
  ]);

  for (const result of results) {
    assert.deepEqual(result, {
      ok: false,
      error: {
        code: "ROOM_NOT_FOUND",
        message: "Room was not found.",
        recoverable: false,
      },
    });
  }
  assert.deepEqual(calls, { start: [], submit: [], draw: [], pass: [] });
});

test("router는 capability method를 copy한 뒤 caller replacement로부터 격리된다", async () => {
  const room = createLobbyRoom();
  let originalCalls = 0;
  let replacementCalls = 0;
  const mutableCapability = {
    gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
    start: async () => {
      originalCalls += 1;
      return startResult;
    },
    submit: async () => submitResult,
    draw: async () => drawResult,
    pass: async () => passResult,
  } satisfies LegacyHangulV1CommandCapability;
  const router = new LegacyHangulV1CommandRouter({
    roomRepository: { findById: async () => room },
    capability: mutableCapability,
  });

  mutableCapability.start = async () => {
    replacementCalls += 1;
    return startResult;
  };

  assert.ok(Object.isFrozen(router));
  assert.strictEqual(await router.start(startInput), startResult);
  assert.equal(originalCalls, 1);
  assert.equal(replacementCalls, 0);
});

test("missing or incomplete command capability는 constructor에서 fail fast한다", () => {
  const roomRepository = { findById: async () => createLobbyRoom() };
  const missingCapabilityDependencies = {
    roomRepository,
    capability: undefined,
  } as unknown as LegacyHangulV1CommandRouterDependencies;
  const incompleteCapabilityDependencies = {
    roomRepository,
    capability: {
      gameType: LEGACY_V1_DEFAULT_GAME_TYPE,
      start: async () => startResult,
      submit: async () => submitResult,
      draw: async () => drawResult,
    },
  } as unknown as LegacyHangulV1CommandRouterDependencies;

  assert.throws(
    () => new LegacyHangulV1CommandRouter(missingCapabilityDependencies),
    /Legacy Hangul v1 command capability is missing or invalid\./u,
  );
  assert.throws(
    () => new LegacyHangulV1CommandRouter(incompleteCapabilityDependencies),
    /Legacy Hangul v1 command capability is missing or invalid\./u,
  );
});
