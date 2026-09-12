import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import test from "node:test";
import * as v from "valibot";
import { NicknameSchema, PresenceVersionSchema, RequestIdSchema, RoomCodeSchema, RoomRevisionSchema,
  SpaceCrewClientCommandSchema, SpaceCrewStartCommandSchema, type RoomId } from "@hangul-rummikub/shared";
import { createSpaceCrewCampaign, beginSpaceCrewCampaignAttempt, finishSpaceCrewCampaignAttempt, claimSpaceCrewCampaign, selectSpaceCrewPracticeMission, type SpaceCrewCampaignTransition } from "./games/space-crew/domain/campaign.js";
import { SpaceCrewService } from "./games/space-crew/application/service.js";
import { InMemorySpaceCrewCampaignRepository } from "./games/space-crew/infrastructure/campaign-repository.js";
import { campaignIdForRecoveryToken } from "./games/space-crew/infrastructure/campaign-credentials.js";
import type { SpaceCrewCampaignRepository, SpaceCrewCampaignOperation } from "./games/space-crew/ports/campaign-repository.js";
import { InMemoryPersistence } from "./infrastructure/in-memory-persistence.js";
import { FakeClock, FakeIdGenerator } from "./infrastructure/system.js";
import { KeyedSerialExecutor } from "./infrastructure/keyed-serial-executor.js";
import type { SpaceCrewRoomRecord } from "./model/persistence.js";
import type { RoomUnitOfWork } from "./ports/room-unit-of-work.js";
import type { RoomPresencePolicyReader } from "./ports/room-presence-policy.js";

const token = Buffer.alloc(32, 13).toString("base64url"), campaignId = campaignIdForRecoveryToken(token);
async function fixture() {
  const persistence = new InMemoryPersistence(), durable = new InMemorySpaceCrewCampaignRepository();
  const ids = new FakeIdGenerator(), clock = new FakeClock(100), lane = new KeyedSerialExecutor<RoomId>();
  let rejectCommit = false, authorizationCurrent = true, randomCalls = 0;
  let uncertainOperation: SpaceCrewCampaignOperation | null = null;
  const campaigns: SpaceCrewCampaignRepository = {
    read: id => durable.read(id),
    transact: async (request, prepare) => {
      const saved = await durable.transact(request, prepare);
      if (saved.ok && request.operation === uncertainOperation) {
        uncertainOperation = null; return { ok: false, reason: "STORAGE_UNAVAILABLE" };
      }
      return saved;
    },
  };
  const unit: RoomUnitOfWork = { commit: (change, guard) => rejectCommit
    ? Promise.resolve({ status: "PRECONDITION_FAILED", reason: "COMMIT_PRECONDITION_FAILED" }) : persistence.commit(change, guard) };
  const presence: RoomPresencePolicyReader = {
    acquireLobbyDisconnectLease: async () => ({ connectionStatus: "CONNECTED", connectionGeneration: 1, isCurrent: () => true }),
    acquireRoomPresenceLease: async roomId => ({ presenceVersion: v.parse(PresenceVersionSchema, 0), isCurrent: () => true,
      connectionStatusByPlayerId: new Map((await persistence.findById(roomId))?.players.map(player => [player.playerId, "CONNECTED" as const])) }),
  };
  const service = new SpaceCrewService({ roomRepository: persistence, roomUnitOfWork: unit, idempotencyRepository: persistence,
    roomMutationExecutor: lane, presence, clock, ids, campaigns, processId: "service-test-process",
    random: { nextInt: upper => { randomCalls++; return upper - 1; } } });
  let roomIndex = 0;
  async function lobby(): Promise<SpaceCrewRoomRecord> {
    const players = Array.from({ length: 4 }, (_, index) => ({ playerId: ids.generatePlayerId(), nickname: v.parse(NicknameSchema, `선원${index}`), joinOrder: index }));
    const created = await persistence.createIfAbsent({ roomId: ids.generateRoomId(), roomCode: v.parse(RoomCodeSchema, roomIndex++ === 0 ? "ABCDEF" : "BCDEFG"),
      roomRevision: v.parse(RoomRevisionSchema, 0), phase: "LOBBY", hostPlayerId: players[0]!.playerId, players,
      gameType: "SPACE_CREW", game: null, createdAt: clock.now(), updatedAt: clock.now() });
    assert.equal(created.status, "CREATED"); if (created.status !== "CREATED" || created.room.gameType !== "SPACE_CREW") throw new Error("Missing room");
    return created.room;
  }
  async function current(roomId: RoomId): Promise<SpaceCrewRoomRecord> {
    const room = await persistence.findById(roomId); assert.equal(room?.gameType, "SPACE_CREW");
    if (room?.gameType !== "SPACE_CREW") throw new Error("Missing Space Crew room"); return room;
  }
  const actor = (room: SpaceCrewRoomRecord) => {
    assert.ok(room.hostPlayerId); return { roomId: room.roomId, actorPlayerId: room.hostPlayerId,
      receivedAt: clock.now(), authorization: { isCurrent: () => authorizationCurrent } };
  };
  const startCommand = (room: SpaceCrewRoomRecord, requestId = "start") => v.parse(SpaceCrewStartCommandSchema, {
    kind: "spaceCrew:start", protocolVersion: 1, requestId, expectedRoomRevision: room.roomRevision,
    payload: { kind: "NEW", mode: "CAMPAIGN", recoveryToken: token },
  });
  const chooseInput = (room: SpaceCrewRoomRecord) => {
    assert.ok(room.game); const mission = room.game.state.mission, task = mission.tasks.tasks[0]; assert.ok(task);
    return { ...actor(room), actorPlayerId: mission.trick.commanderId, command: v.parse(SpaceCrewClientCommandSchema, {
      kind: "spaceCrew:act", protocolVersion: 1, requestId: "choose", gameId: room.game.gameId,
      attemptId: room.game.state.attemptId, expectedGameRevision: room.game.gameRevision,
      payload: { kind: "TASK", action: { kind: "CHOOSE", taskId: task.id } },
    }) };
  };
  const leaveInput = (room: SpaceCrewRoomRecord, request = "leave") => ({ room, actorPlayerId: actor(room).actorPlayerId,
    occurredAt: clock.now(), requestId: v.parse(RequestIdSchema, request), authorization: actor(room).authorization });
  return { persistence, durable, service, lobby, current, actor, startCommand, chooseInput, leaveInput,
    reject: (value: boolean) => { rejectCommit = value; }, authorize: (value: boolean) => { authorizationCurrent = value; },
    uncertain: (operation: SpaceCrewCampaignOperation) => { uncertainOperation = operation; }, randomCalls: () => randomCalls };
}

test("Space Crew service preserves one shuffled start across uncertain durable acknowledgement and replay", async () => {
  const h = await fixture(), room = await h.lobby(), command = h.startCommand(room), input = { ...h.actor(room), command };
  h.uncertain("CREATE"); assert.equal((await h.service.startConfigured(input)).ok, false);
  assert.deepEqual(await h.current(room.roomId), room);
  const saved = await h.durable.read(campaignId), calls = h.randomCalls(); assert.equal(saved?.attempts.length, 1);
  assert.ok((await h.service.startConfigured(input)).ok);
  const accepted = await h.current(room.roomId); assert.equal(accepted.game?.state.attemptId, saved?.attempts[0]?.attemptId);
  assert.equal(h.randomCalls(), calls); assert.equal((await h.durable.read(campaignId))?.attempts.length, 1);
  assert.ok((await h.service.startConfigured(input)).ok); assert.deepEqual(await h.current(room.roomId), accepted);
});

test("Space Crew pending room commit protects its lease and current authorization without redealing", async () => {
  const h = await fixture(), room = await h.lobby(), input = { ...h.actor(room), command: h.startCommand(room) };
  h.reject(true); assert.equal((await h.service.startConfigured(input)).ok, false); const calls = h.randomCalls();
  const other = await h.lobby(), resume = v.parse(SpaceCrewStartCommandSchema, { ...h.startCommand(other, "recover"), payload: { kind: "RESUME", campaignId, recoveryToken: token } });
  assert.equal((await h.service.startConfigured({ ...h.actor(other), command: resume })).ok, false);
  h.reject(false); h.authorize(false); assert.equal((await h.service.startConfigured(input)).ok, false);
  assert.deepEqual(await h.current(room.roomId), room); h.authorize(true);
  assert.ok((await h.service.startConfigured(input)).ok); assert.equal(h.randomCalls(), calls);
  assert.equal((await h.durable.read(campaignId))?.attempts.length, 1);
});

test("Space Crew leave cancellation preserves active history and next command reconciles the checkpoint revision", async () => {
  const h = await fixture(), lobby = await h.lobby(); assert.ok((await h.service.startConfigured({ ...h.actor(lobby), command: h.startCommand(lobby) })).ok);
  const room = await h.current(lobby.roomId), pending = await h.service.preparePlayingLeave(h.leaveInput(room));
  assert.equal((await h.durable.read(campaignId))?.attempts[0]?.status, "ACTIVE");
  assert.ok((await h.durable.read(campaignId))?.pendingInterruption);
  await pending.finalize(false);
  const restored = await h.durable.read(campaignId); assert.equal(restored?.pendingInterruption, null);
  assert.equal(restored?.attempts[0]?.status, "ACTIVE"); assert.equal(restored?.attempts[0]?.endedAt, null);
  assert.deepEqual(await h.current(room.roomId), room);
  assert.ok((await h.service.command(h.chooseInput(room))).ok);
  const playing = await h.current(room.roomId), accepted = await h.service.preparePlayingLeave(h.leaveInput(playing, "leave-again"));
  const committed = await h.persistence.replace({ candidate: accepted.result.candidate, expectedRoomRevision: playing.roomRevision, expectedStorageRevision: playing.storageRevision });
  assert.equal(committed.status, "REPLACED"); await accepted.finalize(true);
  assert.equal((await h.current(room.roomId)).game?.state.cancelled, true);
  assert.equal((await h.durable.read(campaignId))?.attempts[0]?.status, "ABORTED");
  assert.equal((await h.durable.read(campaignId))?.lease.active, false);
});

test("Space Crew uncertain leave reservation is replayed then cancelled before subsequent play", async () => {
  const h = await fixture(), lobby = await h.lobby(); assert.ok((await h.service.startConfigured({ ...h.actor(lobby), command: h.startCommand(lobby) })).ok);
  const room = await h.current(lobby.roomId); h.uncertain("PREPARE_INTERRUPT");
  await assert.rejects(h.service.preparePlayingLeave(h.leaveInput(room)));
  assert.deepEqual(await h.current(room.roomId), room); assert.ok((await h.durable.read(campaignId))?.pendingInterruption);
  assert.ok((await h.service.command(h.chooseInput(room))).ok);
  const checkpoint = await h.durable.read(campaignId); assert.equal(checkpoint?.pendingInterruption, null);
  assert.equal(checkpoint?.attempts[0]?.status, "ACTIVE"); assert.equal(checkpoint?.attempts.length, 1);
});

test("Space Crew cleanup aborts a durable start whose lobby commit never happened", async () => {
  const h = await fixture(), room = await h.lobby(); h.reject(true);
  assert.equal((await h.service.startConfigured({ ...h.actor(room), command: h.startCommand(room) })).ok, false);
  const prepared = await h.service.prepareRoomCleanup(room);
  assert.equal((await h.durable.read(campaignId))?.attempts[0]?.status, "ACTIVE");
  assert.equal((await h.persistence.delete({ roomId: room.roomId, expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision })).status, "DELETED");
  await prepared.finalize(true);
  assert.equal((await h.durable.read(campaignId))?.attempts[0]?.status, "ABORTED");
  const other = await h.lobby(); h.reject(false);
  const resume = v.parse(SpaceCrewStartCommandSchema, { ...h.startCommand(other, "recover"), payload: { kind: "RESUME", campaignId, recoveryToken: token } });
  assert.ok((await h.service.startConfigured({ ...h.actor(other), command: resume })).ok);
  assert.deepEqual((await h.durable.read(campaignId))?.attempts.map(attempt => attempt.status), ["ABORTED", "ACTIVE"]);
});


test("Space Crew committed leave remains accepted when finalization acknowledgement is uncertain", async () => {
  const h = await fixture(), lobby = await h.lobby(); assert.ok((await h.service.startConfigured({ ...h.actor(lobby), command: h.startCommand(lobby) })).ok);
  const room = await h.current(lobby.roomId), prepared = await h.service.preparePlayingLeave(h.leaveInput(room));
  assert.equal((await h.persistence.replace({ candidate: prepared.result.candidate, expectedRoomRevision: room.roomRevision, expectedStorageRevision: room.storageRevision })).status, "REPLACED");
  h.uncertain("FINALIZE_INTERRUPT"); await prepared.finalize(true);
  assert.equal((await h.current(room.roomId)).game?.state.cancelled, true);
  assert.equal((await h.service.command(h.chooseInput(room))).ok, false);
  const checkpoint = await h.durable.read(campaignId); assert.equal(checkpoint?.pendingInterruption, null);
  assert.equal(checkpoint?.attempts.length, 1); assert.equal(checkpoint?.attempts[0]?.status, "ABORTED");
});

test("Space Crew practice recovery distinguishes a completed run from a later failed run of that same mission", async () => {
  const take = (result: SpaceCrewCampaignTransition) => { assert.ok(result.ok); return result.checkpoint; };
  for (const failedRepeat of [false, true]) {
    const h = await fixture(), room = await h.lobby(), binding = { processId: "previous-process", roomId: "previous-room" };
    let checkpoint = createSpaceCrewCampaign({ campaignId, mode: "PRACTICE", missionNumber: 1, ...binding });
    checkpoint = take(beginSpaceCrewCampaignAttempt(checkpoint, { attemptId: "original-attempt", now: 1 }));
    checkpoint = take(finishSpaceCrewCampaignAttempt(checkpoint, { attemptId: "original-attempt", now: 2, outcome: "SUCCESS", reason: "SUCCESS", completedTaskCount: 1, totalTaskCount: 1 }));
    if (failedRepeat) {
      checkpoint = take(claimSpaceCrewCampaign(checkpoint, { ...binding, now: 3 }));
      checkpoint = take(selectSpaceCrewPracticeMission(checkpoint, { missionNumber: 1 }));
      checkpoint = take(beginSpaceCrewCampaignAttempt(checkpoint, { attemptId: "repeat-attempt", now: 4 }));
      checkpoint = take(finishSpaceCrewCampaignAttempt(checkpoint, { attemptId: "repeat-attempt", now: 5, outcome: "FAILURE", reason: "WRONG_OWNER", completedTaskCount: 0, totalTaskCount: 1 }));
    }
    assert.ok((await h.durable.transact({ campaignId, expectedRevision: null, requestId: "historical-create", fingerprint: createHash("sha256").update("historical").digest("hex"), operation: "CREATE", authorization: { kind: "CREATE", recoveryToken: token } }, () => ({ ok: true, checkpoint }))).ok);
    const command = v.parse(SpaceCrewStartCommandSchema, { ...h.startCommand(room, "practice-recover"), payload: { kind: "RESUME", campaignId, recoveryToken: token } });
    assert.ok((await h.service.startConfigured({ ...h.actor(room), command })).ok);
    const recovered = await h.durable.read(campaignId); assert.equal(recovered?.runNumber, 2);
    assert.equal(recovered?.attempts.at(-1)?.attemptNumber, failedRepeat ? 2 : 1);
    assert.equal(recovered?.attempts.length, failedRepeat ? 3 : 2);
    assert.deepEqual(recovered?.completedMissions, [1]);
  }
});
