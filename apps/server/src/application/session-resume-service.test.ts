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
} from "@hangul-rummikub/shared";
import { parse } from "valibot";

import { SessionResumeService } from "./session-resume-service.js";
import {
  createUnboundSessionRecord,
  type RoomRecord,
  type RoomWriteCandidate,
} from "../model/persistence.js";
import { InMemoryPersistence } from "../infrastructure/in-memory-persistence.js";
import { NodeCryptoSessionTokenIssuer } from "../infrastructure/system.js";
import type { SessionTokenIssuer } from "../ports/system.js";

function roomId(value: string): RoomId {
  return parse(RoomIdSchema, value);
}

function roomCode(value: string): RoomCode {
  return parse(RoomCodeSchema, value);
}

function playerId(value: string): PlayerId {
  return parse(PlayerIdSchema, value);
}

function roomCandidate(
  code = "ABCDEF",
  players: readonly Readonly<{ playerId: PlayerId; nickname: string }>[] = [
    { playerId: playerId("player-host"), nickname: "Host" },
  ],
): RoomWriteCandidate {
  const host = players[0];
  if (host === undefined) {
    throw new Error("Room fixture requires a Host.");
  }

  return {
    roomId: roomId("room-resume"),
    roomCode: roomCode(code),
    phase: "LOBBY",
    hostPlayerId: host.playerId,
    players: players.map((player, joinOrder) => ({
      playerId: player.playerId,
      nickname: parse(NicknameSchema, player.nickname),
      joinOrder,
    })),
    roomRevision: parse(RoomRevisionSchema, 0),
    createdAt: parse(ServerTimeSchema, 1_000),
    updatedAt: parse(ServerTimeSchema, 1_000),
  };
}

async function createRoomFixture(
  persistence: InMemoryPersistence,
  candidate: RoomWriteCandidate,
): Promise<RoomRecord> {
  const created = await persistence.createIfAbsent(candidate);
  assert.equal(created.status, "CREATED");
  if (created.status !== "CREATED") {
    throw new Error("Room fixture creation failed.");
  }
  return created.room;
}

type BoundFixture = Readonly<{
  persistence: InMemoryPersistence;
  issuer: NodeCryptoSessionTokenIssuer;
  service: SessionResumeService;
  room: RoomRecord;
  playerId: PlayerId;
  sessionToken: ReturnType<NodeCryptoSessionTokenIssuer["issue"]>["rawToken"];
}>;

async function createBoundFixture(
  boundPlayerId = playerId("player-host"),
  players?: readonly Readonly<{ playerId: PlayerId; nickname: string }>[],
): Promise<BoundFixture> {
  const persistence = new InMemoryPersistence();
  const issuer = new NodeCryptoSessionTokenIssuer();
  const room = await createRoomFixture(
    persistence,
    roomCandidate("ABCDEF", players),
  );
  const issued = issuer.issue();
  const unbound = createUnboundSessionRecord(
    issued.verificationData,
    parse(ServerTimeSchema, 1_000),
  );
  assert.equal((await persistence.saveUnbound(unbound)).status, "SAVED");
  assert.equal(
    (
      await persistence.promoteUnbound({
        verificationData: issued.verificationData,
        roomId: room.roomId,
        playerId: boundPlayerId,
        now: parse(ServerTimeSchema, 1_001),
      })
    ).status,
    "PROMOTED",
  );

  return {
    persistence,
    issuer,
    service: new SessionResumeService({
      sessionRepository: persistence,
      roomRepository: persistence,
      sessionTokenIssuer: issuer,
    }),
    room,
    playerId: boundPlayerId,
    sessionToken: issued.rawToken,
  };
}

function collectKeys(value: unknown): readonly string[] {
  if (Array.isArray(value)) {
    return value.flatMap(collectKeys);
  }
  if (typeof value !== "object" || value === null) {
    return [];
  }
  return Object.keys(value).flatMap((key) => [
    key,
    ...collectKeys(Reflect.get(value, key)),
  ]);
}

test("resumeSession은 lowercase Room code를 normalize하고 BOUND Player를 복구한다", async () => {
  const fixture = await createBoundFixture();
  const result = await fixture.service.resumeSession({
    sessionToken: fixture.sessionToken,
    roomCode: "  abcdef ",
  });

  assert.equal(result.ok, true);
  if (!result.ok) {
    throw new Error("Expected successful session resume.");
  }
  assert.equal(result.data.roomId, fixture.room.roomId);
  assert.equal(result.data.roomCode, fixture.room.roomCode);
  assert.equal(result.data.playerId, fixture.playerId);
  assert.deepEqual(result.data.room, fixture.room);

  const serialized = JSON.stringify(result.data);
  assert.equal(serialized.includes(fixture.sessionToken), false);
  for (const key of collectKeys(result.data)) {
    assert.equal(
      new Set(["sessionToken", "rawToken", "digestHex", "verificationData"]).has(
        key,
      ),
      false,
    );
  }
});

test("resumeSession은 malformed/unknown/UNBOUND credential을 SESSION_NOT_FOUND로 통일한다", async (context) => {
  await context.test("malformed", async () => {
    const fixture = await createBoundFixture();
    const result = await fixture.service.resumeSession({
      sessionToken: "contains whitespace",
      roomCode: "ABCDEF",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "SESSION_NOT_FOUND");
    }
  });

  await context.test("unknown", async () => {
    const fixture = await createBoundFixture();
    const unknown = fixture.issuer.issue();
    const result = await fixture.service.resumeSession({
      sessionToken: unknown.rawToken,
      roomCode: "ABCDEF",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "SESSION_NOT_FOUND");
    }
  });

  await context.test("UNBOUND", async () => {
    const persistence = new InMemoryPersistence();
    const issuer = new NodeCryptoSessionTokenIssuer();
    const issued = issuer.issue();
    await persistence.saveUnbound(
      createUnboundSessionRecord(
        issued.verificationData,
        parse(ServerTimeSchema, 1_000),
      ),
    );
    const service = new SessionResumeService({
      sessionRepository: persistence,
      roomRepository: persistence,
      sessionTokenIssuer: issuer,
    });
    const result = await service.resumeSession({
      sessionToken: issued.rawToken,
      roomCode: "ABCDEF",
    });
    assert.equal(result.ok, false);
    if (!result.ok) {
      assert.equal(result.error.code, "SESSION_NOT_FOUND");
    }
  });
});

test("resumeSession은 token verification 실패와 Room code mismatch를 SESSION_NOT_FOUND로 숨긴다", async () => {
  const fixture = await createBoundFixture();
  const rejectingIssuer: SessionTokenIssuer = {
    issue: () => fixture.issuer.issue(),
    deriveVerificationData: (rawToken) =>
      fixture.issuer.deriveVerificationData(rawToken),
    verify: () => false,
  };
  const rejectingService = new SessionResumeService({
    sessionRepository: fixture.persistence,
    roomRepository: fixture.persistence,
    sessionTokenIssuer: rejectingIssuer,
  });
  const verificationFailure = await rejectingService.resumeSession({
    sessionToken: fixture.sessionToken,
    roomCode: "ABCDEF",
  });
  assert.equal(verificationFailure.ok, false);
  if (!verificationFailure.ok) {
    assert.equal(verificationFailure.error.code, "SESSION_NOT_FOUND");
  }

  const mismatch = await fixture.service.resumeSession({
    sessionToken: fixture.sessionToken,
    roomCode: "GHJKMN",
  });
  assert.equal(mismatch.ok, false);
  if (!mismatch.ok) {
    assert.equal(mismatch.error.code, "SESSION_NOT_FOUND");
    assert.deepEqual(mismatch.error, verificationFailure.ok ? null : verificationFailure.error);
  }
});

test("resumeSession은 유효한 BOUND session의 canonical Room이 사라지면 ROOM_NOT_FOUND를 반환한다", async () => {
  const fixture = await createBoundFixture();
  assert.equal(
    (
      await fixture.persistence.delete({
        roomId: fixture.room.roomId,
        expectedRoomRevision: fixture.room.roomRevision,
        expectedStorageRevision: fixture.room.storageRevision,
      })
    ).status,
    "DELETED",
  );

  const result = await fixture.service.resumeSession({
    sessionToken: fixture.sessionToken,
    roomCode: fixture.room.roomCode,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "ROOM_NOT_FOUND");
  }
});

test("resumeSession은 Room에 없는 stale bound Player를 SESSION_NOT_FOUND로 거절한다", async () => {
  const hostId = playerId("player-host");
  const staleId = playerId("player-stale");
  const fixture = await createBoundFixture(staleId, [
    { playerId: hostId, nickname: "Host" },
    { playerId: staleId, nickname: "Stale" },
  ]);
  const replaced = await fixture.persistence.replace({
    candidate: {
      roomId: fixture.room.roomId,
      roomCode: fixture.room.roomCode,
      phase: fixture.room.phase,
      hostPlayerId: hostId,
      players: [fixture.room.players[0]].flatMap((player) =>
        player === undefined ? [] : [player],
      ),
      roomRevision: parse(
        RoomRevisionSchema,
        fixture.room.roomRevision + 1,
      ),
      createdAt: fixture.room.createdAt,
      updatedAt: parse(ServerTimeSchema, 2_000),
    },
    expectedRoomRevision: fixture.room.roomRevision,
    expectedStorageRevision: fixture.room.storageRevision,
  });
  assert.equal(replaced.status, "REPLACED");

  const result = await fixture.service.resumeSession({
    sessionToken: fixture.sessionToken,
    roomCode: fixture.room.roomCode,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "SESSION_NOT_FOUND");
  }
});

test("resumeSession은 repository 예외를 secret 없는 INTERNAL_ERROR로 변환한다", async () => {
  const fixture = await createBoundFixture();
  const service = new SessionResumeService({
    sessionRepository: {
      ...fixture.persistence,
      findByVerificationData: async () => {
        throw new Error(`do not expose ${fixture.sessionToken}`);
      },
      saveUnbound: (session) => fixture.persistence.saveUnbound(session),
      promoteUnbound: (input) => fixture.persistence.promoteUnbound(input),
      deleteByVerificationData: (verificationData) =>
        fixture.persistence.deleteByVerificationData(verificationData),
      deleteByRoomId: (id) => fixture.persistence.deleteByRoomId(id),
    },
    roomRepository: fixture.persistence,
    sessionTokenIssuer: fixture.issuer,
  });
  const result = await service.resumeSession({
    sessionToken: fixture.sessionToken,
    roomCode: fixture.room.roomCode,
  });
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.equal(result.error.code, "INTERNAL_ERROR");
    assert.equal(result.error.message.includes(fixture.sessionToken), false);
  }
});

