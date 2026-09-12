import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "valibot";
import { SpaceCrewPlayingProjectionSchema, SpaceCrewFinishedProjectionSchema, spaceCrewProjectionIsConsistent,
  type SpaceCrewProjection, type SpaceCrewPlayingProjection } from "@hangul-rummikub/shared";
import { spaceCrewTransitionSound } from "../features/space-crew/sound.js";

const players = ["a", "b", "c", "d"];
const hand = [...Array.from({ length: 9 }, (_, index) => ({ cardId: `pink-${index + 1}`, kind: "COLOR", suit: "PINK", value: index + 1 })),
  { cardId: "rocket-4", kind: "ROCKET", suit: "ROCKET", value: 4 }];
const plays = [
  { playerId: "a", card: hand[0] },
  { playerId: "b", card: { cardId: "blue-1", kind: "COLOR", suit: "BLUE", value: 1 } },
  { playerId: "c", card: { cardId: "green-1", kind: "COLOR", suit: "GREEN", value: 1 } },
  { playerId: "d", card: { cardId: "yellow-1", kind: "COLOR", suit: "YELLOW", value: 1 } },
];
function playing(overrides: Record<string, unknown> = {}): SpaceCrewPlayingProjection {
  const state = parse(SpaceCrewPlayingProjectionSchema, {
    gameType: "SPACE_CREW", gameId: "sound-game", gameRevision: 0, rulesVersion: "space-crew-planet-nine-v1", mode: "CAMPAIGN",
    attemptId: "sound-attempt", attemptNumber: 1, missionNumber: 1, commanderId: "a", leaderId: "a", activePlayerId: "a",
    phase: "PLAYING", missionStatus: "ACTIVE", trickPhase: "BETWEEN_TRICKS", totalTricks: 10, completedTrickCount: 0,
    currentTrick: [], lastTrick: null, playerStates: players.map(playerId => ({ playerId, handCount: 10 })),
    privateState: { playerId: "a", hand, pendingDistressCardId: null },
    tasks: { mode: "CHOOSE", phase: "READY", totalCount: 1, activePlayerId: null, promptTaskId: null,
      visibleTasks: [{ id: "task-blue-9", suit: "BLUE", value: 9, token: null, ownerId: "b", completed: false }], responses: [], transfer: null, tokenEditUsed: false },
    communications: players.map(playerId => ({ playerId, used: false, card: null, mark: null })),
    distress: { active: false, phase: "UNDECIDED", direction: null, votes: [], selectedPlayerIds: [] }, special: { kind: "NONE" },
    campaign: { campaignId: "campaign-sound-00001", revision: 0, mode: "CAMPAIGN", missionNumber: 1, actualAttempts: 1,
      recordedAttempts: 1, completedMissions: [], distressActive: false }, ...overrides,
  });
  assert.ok(spaceCrewProjectionIsConsistent(state), "Sound fixture must be a valid authorized projection");
  return state;
}
function inTrick(count: number, overrides: Record<string, unknown> = {}) {
  return playing({ gameRevision: count, currentTrick: plays.slice(0, count), trickPhase: "IN_TRICK", activePlayerId: players[count],
    privateState: { playerId: "a", hand: hand.slice(1), pendingDistressCardId: null },
    playerStates: players.map((playerId, index) => ({ playerId, handCount: index < count ? 9 : 10 })), ...overrides });
}
function completed(overrides: Record<string, unknown> = {}) {
  return playing({ gameRevision: 4, completedTrickCount: 1, lastTrick: { number: 1, leaderId: "a", winnerId: "a", plays },
    privateState: { playerId: "a", hand: hand.slice(1), pendingDistressCardId: null },
    playerStates: players.map(playerId => ({ playerId, handCount: 9 })), ...overrides });
}
function finished(outcome: "SUCCESS" | "FAILURE") {
  const state = parse(SpaceCrewFinishedProjectionSchema, { ...completed(), phase: "FINISHED", missionStatus: outcome, activePlayerId: null,
    tasks: { ...completed().tasks, visibleTasks: [{ id: "task-pink-1", suit: "PINK", value: 1, token: null, ownerId: outcome === "SUCCESS" ? "a" : "b", completed: outcome === "SUCCESS" }] },
    result: { outcome, reason: outcome === "SUCCESS" ? "OBJECTIVES_COMPLETE" : "WRONG_OWNER", taskIds: outcome === "SUCCESS" ? [] : ["task-pink-1"] } });
  assert.ok(spaceCrewProjectionIsConsistent(state)); return state;
}

test("Space Crew sound suppresses initial/reloaded state, repeated revisions, stale state and missed events", () => {
  const before = playing(), after = inTrick(1);
  assert.equal(spaceCrewTransitionSound(null, before), null);
  assert.equal(spaceCrewTransitionSound(null, finished("SUCCESS")), null);
  assert.equal(spaceCrewTransitionSound(before, null), null);
  assert.equal(spaceCrewTransitionSound(before, structuredClone(before)), null);
  assert.equal(spaceCrewTransitionSound(after, before), null);
  assert.equal(spaceCrewTransitionSound(before, inTrick(3)), null);
  assert.equal(spaceCrewTransitionSound(before, playing({ gameId: "different-game", gameRevision: 1 })), null);
});

test("Space Crew reconnect resets the live predecessor so even one missed revision is silent", () => {
  const initial = playing(), firstCard = inTrick(1), secondCard = inTrick(2);
  assert.equal(spaceCrewTransitionSound(initial, firstCard), "CARD");
  // SpaceCrewScreen clears its predecessor on disconnect; reconnection establishes a new baseline.
  const reconnectBaseline: SpaceCrewProjection | null = null;
  assert.equal(spaceCrewTransitionSound(reconnectBaseline, secondCard), null);
  assert.equal(spaceCrewTransitionSound(secondCard, structuredClone(secondCard)), null);
  assert.equal(spaceCrewTransitionSound(secondCard, inTrick(3)), "CARD");
});

test("Space Crew sound distinguishes a card submission from a completed trick", () => {
  assert.equal(spaceCrewTransitionSound(playing(), inTrick(1)), "CARD");
  assert.equal(spaceCrewTransitionSound(inTrick(1), inTrick(2)), "CARD");
  assert.equal(spaceCrewTransitionSound(inTrick(3), completed()), "TRICK");
});

test("Space Crew mission result supersedes the final card and trick effect", () => {
  for (const outcome of ["SUCCESS", "FAILURE"] as const) {
    const after = finished(outcome), before = inTrick(3, { tasks: { ...after.tasks,
      visibleTasks: after.tasks.visibleTasks.map(task => ({ ...task, completed: false })) } });
    assert.equal(spaceCrewTransitionSound(before, after), outcome);
    assert.equal(spaceCrewTransitionSound(after, structuredClone(after)), null);
  }
});

test("Space Crew retry deals once on the same game and never replays a prior mission result", () => {
  const before = finished("FAILURE"), next = playing({ gameRevision: 5, attemptId: "second-attempt", attemptNumber: 2,
    missionStatus: "SETUP", tasks: { ...playing().tasks, phase: "CHOOSE", activePlayerId: "a",
      visibleTasks: playing().tasks.visibleTasks.map(task => ({ ...task, ownerId: null })) },
    campaign: { ...playing().campaign, actualAttempts: 2, recordedAttempts: 2 } });
  assert.equal(spaceCrewTransitionSound(before, next), "DEAL");
  assert.equal(spaceCrewTransitionSound(next, structuredClone(next)), null);
  assert.equal(spaceCrewTransitionSound(null, next), null);
});

test("Space Crew communication sounds once and playing its exposed card produces only a card effect", () => {
  const before = playing(), announced = playing({ gameRevision: 1,
    communications: players.map(playerId => playerId === "a" ? { playerId, used: true, card: hand[0], mark: "LOWEST" } : { playerId, used: false, card: null, mark: null }) });
  assert.equal(spaceCrewTransitionSound(before, announced), "COMMUNICATION");
  const submitted = inTrick(1, { gameRevision: 2,
    communications: players.map(playerId => ({ playerId, used: playerId === "a", card: null, mark: null })) });
  assert.equal(spaceCrewTransitionSound(announced, submitted), "CARD");
});

test("Space Crew task choice and distress voting use selection, while the completed exchange uses signal", () => {
  const assigned = playing({ gameRevision: 1 });
  const choosing = playing({ missionStatus: "SETUP", tasks: { ...assigned.tasks, phase: "CHOOSE", activePlayerId: "a",
    visibleTasks: assigned.tasks.visibleTasks.map(task => ({ ...task, ownerId: null })) } });
  assert.equal(spaceCrewTransitionSound(choosing, assigned), "SELECT");
  const voting = playing({ gameRevision: 1, distress: { active: false, phase: "VOTING", direction: "LEFT", votes: [{ playerId: "a", accept: true }], selectedPlayerIds: [] } });
  assert.equal(spaceCrewTransitionSound(playing(), voting), "SELECT");
  const selecting = playing({ gameRevision: 7, distress: { active: true, phase: "SELECTING", direction: "LEFT",
    votes: players.map(playerId => ({ playerId, accept: true })), selectedPlayerIds: ["b", "c", "d"] }, campaign: { ...playing().campaign, distressActive: true, recordedAttempts: 2 } });
  const exchanged = playing({ gameRevision: 8, distress: { ...selecting.distress, phase: "EXCHANGED", selectedPlayerIds: players }, campaign: selecting.campaign });
  assert.equal(spaceCrewTransitionSound(selecting, exchanged), "SIGNAL");
  assert.equal(spaceCrewTransitionSound(exchanged, structuredClone(exchanged)), null);
});
