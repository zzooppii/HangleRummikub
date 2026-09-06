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
  type RoomCode,
  type RoomId,
  type ServerTime,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import {
  createInitialNumberTileGameState,
  type NumberTileGameState,
  type PlayingNumberTileGameState,
} from "./games/number-tile/domain/game-state.js";
import { createNumberTileRackEmptyResult } from "./games/number-tile/domain/result-engine.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import { FakeIdGenerator } from "./infrastructure/system.js";
import type { RoomWriteCandidate } from "./model/persistence.js";

function playerId(value: string): PlayerId {
  return parse(PlayerIdSchema, value);
}

function roomId(value: string): RoomId {
  return parse(RoomIdSchema, value);
}

function roomCode(value: string): RoomCode {
  return parse(RoomCodeSchema, value);
}

function serverTime(value: number): ServerTime {
  return parse(ServerTimeSchema, value);
}

const players = Object.freeze([
  Object.freeze({
    playerId: playerId("number-storage-a"),
    nickname: parse(NicknameSchema, "NumberA"),
    joinOrder: 0,
  }),
  Object.freeze({
    playerId: playerId("number-storage-b"),
    nickname: parse(NicknameSchema, "NumberB"),
    joinOrder: 1,
  }),
]);

function createGame(): PlayingNumberTileGameState {
  return createInitialNumberTileGameState({
    playerIds: players.map((player) => player.playerId),
    idGenerator: new FakeIdGenerator(),
    randomSource: { nextInt: (maxExclusive) => maxExclusive - 1 },
    clock: { now: () => serverTime(10_000) },
  });
}

function numberRoom(
  id: string,
  code: string,
  phase: "LOBBY" | "PLAYING" | "FINISHED",
  game: NumberTileGameState | null,
): RoomWriteCandidate {
  return {
    roomId: roomId(id),
    roomCode: roomCode(code),
    gameType: "NUMBER_TILE",
    phase,
    hostPlayerId: players[0]!.playerId,
    players,
    game,
    roomRevision: parse(RoomRevisionSchema, phase === "LOBBY" ? 0 : 1),
    createdAt: serverTime(1_000),
    updatedAt: serverTime(10_000),
  };
}

function finishByRackEmpty(
  state: PlayingNumberTileGameState,
): NumberTileGameState {
  const winnerPlayerId = state.turnOrder[0]!;
  const winnerRack = state.racks.get(winnerPlayerId)!;
  const racks = new Map(state.racks);
  racks.set(winnerPlayerId, []);
  const pool = [...state.pool, ...winnerRack];
  return {
    ...state,
    pool,
    racks,
    turn: null,
    result: createNumberTileRackEmptyResult(
      {
        playerIds: state.turnOrder,
        racks,
        tilesById: state.tilesById,
        forfeitedPlayerIds: state.forfeitedPlayerIds,
        finishedAt: serverTime(30_000),
      },
      winnerPlayerId,
    ),
  };
}

test("Number Room persistence supports LOBBY, active Turn recovery, and no overall game deadline", async () => {
  const persistence = new InMemoryPersistence();
  const lobby = await persistence.createIfAbsent(
    numberRoom("number-lobby", "BCDEFG", "LOBBY", null),
  );
  assert.equal(lobby.status, "CREATED");

  const game = createGame();
  const playing = await persistence.createIfAbsent(
    numberRoom("number-playing", "CDEFGH", "PLAYING", game),
  );
  assert.equal(playing.status, "CREATED");
  if (playing.status !== "CREATED" || playing.room.gameType !== "NUMBER_TILE") {
    throw new Error("Expected a persisted Number Room.");
  }
  assert.equal(playing.room.game?.gameId, game.gameId);
  assert.deepEqual(await persistence.listActiveTurnDeadlines(), [
    {
      roomId: playing.room.roomId,
      gameId: game.gameId,
      turnId: game.turn.turnId,
      expectedGameRevision: game.gameRevision,
      deadlineAt: game.turn.deadlineAt,
    },
  ]);
  assert.deepEqual(await persistence.listActiveGameDeadlines(), []);
});

test("Number Room clone is detached on write/read and FINISHED retention uses result.finishedAt", async () => {
  const persistence = new InMemoryPersistence();
  const source = createGame();
  const mutablePool = [...source.pool];
  const mutableRacks = new Map(
    [...source.racks].map(([id, rack]) => [id, [...rack]] as const),
  );
  const mutableGame: PlayingNumberTileGameState = {
    ...source,
    pool: mutablePool,
    racks: mutableRacks,
  };
  const created = await persistence.createIfAbsent(
    numberRoom("number-isolated", "DEFGHJ", "PLAYING", mutableGame),
  );
  assert.equal(created.status, "CREATED");
  mutablePool.pop();
  mutableRacks.clear();

  const firstRead = await persistence.findById(roomId("number-isolated"));
  assert.equal(firstRead?.gameType, "NUMBER_TILE");
  if (firstRead?.gameType !== "NUMBER_TILE" || firstRead.game === null) {
    throw new Error("Expected Number state on read.");
  }
  assert.equal(firstRead.game.pool.length, source.pool.length);
  assert.equal(firstRead.game.racks.size, source.racks.size);
  assert.throws(() =>
    Reflect.apply(Map.prototype.clear, firstRead.game?.racks, []),
  );
  const secondRead = await persistence.findById(firstRead.roomId);
  assert.equal(secondRead?.game?.racks.size, source.racks.size);

  const terminalPersistence = new InMemoryPersistence();
  const finished = finishByRackEmpty(createGame());
  const terminal = await terminalPersistence.createIfAbsent(
    numberRoom("number-finished", "EFGHJK", "FINISHED", finished),
  );
  assert.equal(terminal.status, "CREATED");
  if (terminal.status !== "CREATED") {
    throw new Error("Expected a terminal Number Room.");
  }
  assert.deepEqual(await terminalPersistence.listFinishedRoomRetentions(), [
    {
      roomId: terminal.room.roomId,
      gameId: finished.gameId,
      finishedAt: serverTime(30_000),
    },
  ]);
});

test("gameType mutation and mismatched concrete state fail closed without changing canonical storage", async () => {
  const persistence = new InMemoryPersistence();
  const lobbyCandidate = numberRoom(
    "number-immutable",
    "FGHJKM",
    "LOBBY",
    null,
  );
  const created = await persistence.createIfAbsent(lobbyCandidate);
  assert.equal(created.status, "CREATED");
  if (created.status !== "CREATED") {
    throw new Error("Expected an immutable Number Room.");
  }

  const replacement = { ...created.room, updatedAt: serverTime(11_000) };
  Reflect.set(replacement, "gameType", "HANGUL_TILE");
  assert.deepEqual(
    await persistence.replace({
      candidate: replacement,
      expectedRoomRevision: created.room.roomRevision,
      expectedStorageRevision: created.room.storageRevision,
    }),
    { status: "GAME_TYPE_MISMATCH" },
  );
  assert.equal(
    (await persistence.findById(created.room.roomId))?.gameType,
    "NUMBER_TILE",
  );

  const mismatched = numberRoom(
    "number-mismatch",
    "GHJKMN",
    "PLAYING",
    createGame(),
  );
  Reflect.set(mismatched, "gameType", "HANGUL_TILE");
  await assert.rejects(
    persistence.createIfAbsent(mismatched),
    /allowedSymbols|RulesConfig|Hangul|GameState/u,
  );
  assert.equal(await persistence.findById(mismatched.roomId), null);
  assert.equal(await persistence.findByCode(mismatched.roomCode), null);
});
