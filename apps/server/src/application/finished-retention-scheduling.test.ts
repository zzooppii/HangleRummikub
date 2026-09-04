import assert from "node:assert/strict";
import test from "node:test";

import {
  NicknameSchema,
  PlayerIdSchema,
  RoomCodeSchema,
  RoomIdSchema,
  RoomRevisionSchema,
  ServerTimeSchema,
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { createInitialGameState } from "../domain/game/game-state.js";
import { createTimeLimitResult } from "../domain/game/result-engine.js";
import { InMemoryPersistence } from "../infrastructure/in-memory-persistence.js";
import { FakeIdGenerator } from "../infrastructure/system.js";
import type {
  RoomPolicyDeadline,
  RoomPolicyScheduler,
} from "../ports/room-policy-scheduler.js";
import type { RandomSource } from "../ports/system.js";
import {
  FINISHED_RETENTION_SCHEDULING_MAX_ATTEMPTS,
  scheduleFinishedRetentionBestEffort,
} from "./game-finish-transition.js";
import { ROOM_RETENTION_MS } from "./room-presence-policy-service.js";

const FINISHED_AT = parse(ServerTimeSchema, 10_000);

class ZeroRandomSource implements RandomSource {
  nextInt(maxExclusive: number): number {
    if (maxExclusive <= 0) {
      throw new RangeError("A positive range is required.");
    }
    return 0;
  }
}

class FailureInjectingPolicyScheduler implements RoomPolicyScheduler {
  readonly attempts: RoomPolicyDeadline[] = [];

  constructor(public failuresRemaining: number) {}

  async schedule(deadline: RoomPolicyDeadline): Promise<void> {
    this.attempts.push(deadline);
    if (this.failuresRemaining > 0) {
      this.failuresRemaining -= 1;
      throw new Error("injected retention registration failure");
    }
  }

  async cancelLobbyGrace(): Promise<void> {}

  async cancelPlayingAllOffline(): Promise<void> {}

  async cancelRoom(): Promise<void> {}
}

async function createFinishedFixture() {
  const persistence = new InMemoryPersistence();
  const playerIds = [
    parse(PlayerIdSchema, "retention-player-a"),
    parse(PlayerIdSchema, "retention-player-b"),
  ] as const;
  const playingGame = createInitialGameState({
    playerIds,
    startedAt: parse(ServerTimeSchema, 1_000),
    idGenerator: new FakeIdGenerator(),
    randomSource: new ZeroRandomSource(),
  });
  const result = createTimeLimitResult({
    playerIds: playingGame.turnOrder,
    racks: playingGame.racks,
    tilesById: playingGame.tilesById,
    forfeitedPlayerIds: playingGame.forfeitedPlayerIds,
    finishedAt: FINISHED_AT,
  });
  const roomId = parse(RoomIdSchema, "room-finished-retention-retry");
  const created = await persistence.createIfAbsent({
    roomId,
    roomCode: parse(RoomCodeSchema, "ABC234"),
    phase: "FINISHED",
    hostPlayerId: playerIds[0],
    players: playerIds.map((playerId, joinOrder) => ({
      playerId,
      nickname: parse(NicknameSchema, `Player${joinOrder}`),
      joinOrder,
    })),
    game: Object.freeze({
      ...playingGame,
      turn: null,
      result,
    }),
    roomRevision: parse(RoomRevisionSchema, 1),
    createdAt: parse(ServerTimeSchema, 1_000),
    updatedAt: FINISHED_AT,
  });
  assert.equal(created.status, "CREATED");
  if (created.status !== "CREATED") {
    throw new Error("Expected a FINISHED Room fixture.");
  }
  return { persistence, roomId, gameId: playingGame.gameId };
}

test("FINISHED retention first registration failure retries without rolling back the result", async () => {
  const fixture = await createFinishedFixture();
  const before = await fixture.persistence.findById(fixture.roomId);
  const scheduler = new FailureInjectingPolicyScheduler(1);
  const failures: unknown[] = [];

  const scheduled = await scheduleFinishedRetentionBestEffort(
    fixture.persistence,
    scheduler,
    { roomId: fixture.roomId, gameId: fixture.gameId },
    (failure) => failures.push(failure),
  );

  assert.equal(scheduled, true);
  assert.equal(scheduler.attempts.length, 2);
  assert.deepEqual(failures, []);
  assert.deepEqual(await fixture.persistence.findById(fixture.roomId), before);
});

test("FINISHED retention total registration failure preserves result and reports once", async () => {
  const fixture = await createFinishedFixture();
  const before = await fixture.persistence.findById(fixture.roomId);
  const scheduler = new FailureInjectingPolicyScheduler(100);
  const failures: unknown[] = [];

  const scheduled = await scheduleFinishedRetentionBestEffort(
    fixture.persistence,
    scheduler,
    { roomId: fixture.roomId, gameId: fixture.gameId },
    (failure) => failures.push(failure),
  );

  assert.equal(scheduled, false);
  assert.equal(
    scheduler.attempts.length,
    FINISHED_RETENTION_SCHEDULING_MAX_ATTEMPTS,
  );
  assert.deepEqual(failures, [
    {
      roomId: fixture.roomId,
      gameId: fixture.gameId,
      reason: "READ_OR_SCHEDULE_FAILED",
    },
  ]);
  assert.deepEqual(await fixture.persistence.findById(fixture.roomId), before);
});

test("FINISHED retention retry keeps the absolute finishedAt plus 30 minute deadline", async () => {
  const fixture = await createFinishedFixture();
  const scheduler = new FailureInjectingPolicyScheduler(1);

  assert.equal(
    await scheduleFinishedRetentionBestEffort(
      fixture.persistence,
      scheduler,
      { roomId: fixture.roomId, gameId: fixture.gameId },
    ),
    true,
  );

  assert.equal(scheduler.attempts.length, 2);
  for (const attempted of scheduler.attempts) {
    assert.equal(attempted.kind, "FINISHED_ROOM_RETENTION");
    if (attempted.kind !== "FINISHED_ROOM_RETENTION") {
      throw new Error("Expected a FINISHED retention deadline.");
    }
    assert.equal(attempted.finishedAt, FINISHED_AT);
    assert.equal(attempted.deadlineAt, FINISHED_AT + ROOM_RETENTION_MS);
  }
  assert.strictEqual(scheduler.attempts[0], scheduler.attempts[1]);
});
