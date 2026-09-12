import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import { SpaceCrewClientCommandSchema, SpaceCrewStartCommandSchema, SpaceCrewRecoveryTokenSchema } from "./index.js";

const identity = { protocolVersion: 1, requestId: "crew-request", gameId: "crew-game", attemptId: "crew-attempt", expectedGameRevision: 0 };
const recoveryToken = Buffer.alloc(32, 31).toString("base64url");
const start = { kind: "spaceCrew:start", protocolVersion: 1, requestId: "crew-start", expectedRoomRevision: 2,
  payload: { kind: "NEW", mode: "CAMPAIGN", recoveryToken } };

test("Space Crew start distinguishes campaign, practice and credential recovery", () => {
  for (const payload of [start.payload, { kind: "NEW", mode: "PRACTICE", missionNumber: 50, recoveryToken },
    { kind: "RESUME", campaignId: "crew_campaign_1234", recoveryToken }]) {
    assert.equal(v.safeParse(SpaceCrewStartCommandSchema, { ...start, payload }).success, true);
  }
  for (const payload of [{ ...start.payload, missionNumber: 2 }, { kind: "NEW", mode: "PRACTICE", recoveryToken },
    { kind: "NEW", mode: "PRACTICE", missionNumber: 51, recoveryToken }, { kind: "RESUME", campaignId: "crew_campaign_1234" },
    { ...start.payload, playerCount: 2 }, { ...start.payload, expansion: "DEEP_SEA" }]) {
    assert.equal(v.safeParse(SpaceCrewStartCommandSchema, { ...start, payload }).success, false);
  }
});

test("Space Crew recovery secrets require canonical 32-byte base64url encoding", () => {
  assert.equal(v.safeParse(SpaceCrewRecoveryTokenSchema, recoveryToken).success, true);
  for (const token of ["short", recoveryToken + "=", recoveryToken.slice(0, -1) + "B", " "+recoveryToken]) {
    assert.equal(v.safeParse(SpaceCrewRecoveryTokenSchema, token).success, false);
  }
});

test("Space Crew commands bind attempt and game revision without accepting client actors or hidden state", () => {
  const command = { ...identity, kind: "spaceCrew:act", payload: { kind: "PLAY", cardId: "opaque-card" } };
  assert.equal(v.safeParse(SpaceCrewClientCommandSchema, command).success, true);
  const { attemptId: _attemptId, ...missingAttempt } = command;
  for (const input of [missingAttempt, { ...command, actorPlayerId: "another-player" }, { ...command, expectedGameRevision: -1 },
    { ...command, payload: { ...command.payload, hand: [] } }, { ...command, payload: { ...command.payload, expectedRevision: 0 } },
    { ...identity, kind: "spaceCrew:retry", payload: { seed: 123 } }]) {
    assert.equal(v.safeParse(SpaceCrewClientCommandSchema, input).success, false);
  }
});

test("Space Crew retry, progression and practice commands use distinct strict payloads", () => {
  for (const kind of ["spaceCrew:retry", "spaceCrew:next"]) {
    assert.equal(v.safeParse(SpaceCrewClientCommandSchema, { ...identity, kind, payload: {} }).success, true);
  }
  for (const missionNumber of [1, 25, 50]) {
    assert.equal(v.safeParse(SpaceCrewClientCommandSchema, { ...identity, kind: "spaceCrew:practiceMission", payload: { missionNumber } }).success, true);
  }
  for (const missionNumber of [0, 51, 1.5, "1"]) {
    assert.equal(v.safeParse(SpaceCrewClientCommandSchema, { ...identity, kind: "spaceCrew:practiceMission", payload: { missionNumber } }).success, false);
  }
});
