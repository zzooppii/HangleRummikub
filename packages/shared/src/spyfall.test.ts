import assert from "node:assert/strict";
import test from "node:test";
import { safeParse } from "valibot";
import { SpyfallClientCommandSchema, SpyfallPlayingPlatformSnapshotV2Schema, SpyfallSettingsSchema, GAME_PLAYER_LIMITS, spyfallLocations } from "./index.js";
const players = ["a", "b", "c"].map((playerId, i) => ({ playerId, nickname: `요원${i}`, isHost: i === 0, connectionStatus: "CONNECTED" }));
function playing() { return { snapshotVersion: 2, versions: { roomRevision: 1, presenceVersion: 1 }, serverTime: 1000, self: { playerId: "a" }, room: { roomId: "room", roomCode: "BCDFGH", gameType: "SPYFALL", phase: "PLAYING", players }, game: { gameType: "SPYFALL", gameId: "game", gameRevision: 0, rulesVersion: "spyfall-v1", settings: { roundSeconds: 480, useRoles: false, locationPack: "ALL" }, playerStates: players.map(p => ({ playerId: p.playerId, accusationUsed: false })), history: [], phase: "PLAYING", stage: "REVEAL", phaseId: "reveal", deadlineAt: 16000, roundDeadlineAt: null, remainingMs: 480000, questionerId: "a", previousQuestionerId: null, respondentId: null, accuserId: null, suspectId: null, finalAccuserId: null, revealedSpyId: null, privateView: { playerId: "a", role: "SPY", vote: null } } }; }
test("SPYFALL wire prevents hidden answer/job/ballot fields and wrong viewer or roster", () => {
  const s = playing(); assert.ok(safeParse(SpyfallPlayingPlatformSnapshotV2Schema, s).success);
  for (const game of [{ ...s.game, location: "HOSPITAL" }, { ...s.game, spyPlayerId: "c" }, { ...s.game, ballots: [] }, { ...s.game, privateView: { ...s.game.privateView, location: "HOSPITAL" } }, { ...s.game, privateView: { ...s.game.privateView, playerId: "b" } }, { ...s.game, questionerId: "outsider" }, { ...s.game, revealedSpyId: "c" }, { ...s.game, respondentId: "a" }]) assert.equal(safeParse(SpyfallPlayingPlatformSnapshotV2Schema, { ...s, game }).success, false);
  assert.equal(safeParse(SpyfallPlayingPlatformSnapshotV2Schema, { ...s, room: { ...s.room, players: [players[0], players[0], players[2]] } }).success, false);
  assert.deepEqual(GAME_PLAYER_LIMITS.SPYFALL, { min: 3, max: 8 }); assert.equal(spyfallLocations("ALL").length, 24); assert.equal(spyfallLocations("EVERYDAY").length, 12);
});
test("SPYFALL commands fail closed for forged authority, phase, ballots and unknown settings", () => {
  const c = { kind: "spyfall:vote", protocolVersion: 1, requestId: "req", gameId: "game", phaseId: "phase", payload: { agree: true } };
  assert.ok(safeParse(SpyfallClientCommandSchema, c).success);
  for (const bad of [{ ...c, actorPlayerId: "b" }, { ...c, payload: { agree: "true" } }, { ...c, payload: { agree: true, playerId: "b" } }, { ...c, phaseId: "" }, { ...c, deadlineAt: 1 }, { ...c, kind: "spyfall:guess", payload: { location: "SECRET" } }]) assert.equal(safeParse(SpyfallClientCommandSchema, bad).success, false);
  for (const settings of [{ roundSeconds: 481, useRoles: false, locationPack: "ALL" }, { roundSeconds: 480, useRoles: true, locationPack: "CUSTOM" }, { roundSeconds: 480, useRoles: false, locationPack: "ALL", spyCount: 2 }]) assert.equal(safeParse(SpyfallSettingsSchema, settings).success, false);
});
