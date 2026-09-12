import assert from "node:assert/strict";
import test from "node:test";
import * as v from "valibot";
import {
  GameIdSchema, GameRevisionSchema, PlayerIdSchema, ServerTimeSchema, TurnIdSchema,
  SpaceCrewActionSchema, SpaceCrewStartPayloadSchema, SpaceCrewCampaignSummarySchema,
  SpaceCrewPlayingProjectionSchema, SpaceCrewFinishedProjectionSchema, spaceCrewProjectionIsConsistent,
  type PlayerId,
} from "@hangul-rummikub/shared";
import { createSpaceCrewDeck, type SpaceCrewCard } from "./games/space-crew/domain/cards.js";
import { createSpaceCrewTaskDeck } from "./games/space-crew/domain/missions.js";
import { createSpaceCrewMissionState, applySpaceCrewMissionAction, type SpaceCrewMissionState } from "./games/space-crew/domain/mission.js";
import { spaceCrewTaskPrompt } from "./games/space-crew/domain/tasks.js";
import { legalSpaceCrewCardIds } from "./games/space-crew/domain/trick.js";
import { projectSpaceCrew } from "./games/space-crew/compatibility/projector.js";
import type { SpaceCrewStoredGame } from "./games/space-crew/compatibility/adapter.js";

const players = Array.from({ length: 4 }, (_, i) => v.parse(PlayerIdSchema, `projection-player-${i}`));
function player(index: number): PlayerId { const id = players[index]; assert.ok(id); return id; }
function suitDeck(): readonly SpaceCrewCard[] {
  let serial = 0; const cards = createSpaceCrewDeck(() => `private-card-${++serial}`);
  const hands = (["PINK", "BLUE", "GREEN", "YELLOW"] as const).map((suit, index) => {
    const rocket = cards.find(c => c.kind === "ROCKET" && c.value === (index === 0 ? 4 : index)); assert.ok(rocket);
    return [...cards.filter(c => c.suit === suit), rocket];
  });
  return Array.from({ length: 10 }, (_, index) => hands.map(hand => { const c = hand[index]; assert.ok(c); return c; })).flat();
}
function create(missionNumber = 1): SpaceCrewMissionState {
  let next = 0;
  return createSpaceCrewMissionState({ missionNumber, playerIds: players, deck: suitDeck(), taskDeck: createSpaceCrewTaskDeck(() => `public-goal-${++next}`) });
}
function stored(mission: SpaceCrewMissionState, cancelled = false): SpaceCrewStoredGame {
  const revision = mission.revision + 100;
  return {
    gameId: v.parse(GameIdSchema, "projection-game"), gameRevision: v.parse(GameRevisionSchema, revision),
    startedAt: v.parse(ServerTimeSchema, 1000), finishedAt: cancelled || mission.status === "SUCCESS" || mission.status === "FAILURE" ? v.parse(ServerTimeSchema, 2000) : null,
    state: { revision, mode: "PRACTICE", attemptId: v.parse(TurnIdSchema, "projection-attempt"), mission, cancelled,
      campaign: { campaignId: "projection_campaign_01", revision: 1, mode: "PRACTICE", missionNumber: mission.missionNumber,
        actualAttempts: mission.distress.attemptNumber, recordedAttempts: mission.distress.attemptNumber + Number(mission.distress.active),
        completedMissions: mission.status === "SUCCESS" ? [mission.missionNumber] : [], distressActive: mission.distress.active },
    },
  };
}
function act(state: SpaceCrewMissionState, who: PlayerId, action: Readonly<Record<string, unknown>>): SpaceCrewMissionState {
  const result = applySpaceCrewMissionAction(state, who, { ...action, expectedRevision: state.revision }, { nextInt: () => 0 });
  assert.ok(result.ok, JSON.stringify(result)); return result.state;
}
function ready(initial: SpaceCrewMissionState): SpaceCrewMissionState {
  let state = initial;
  while (state.tasks.phase === "CHOOSE") {
    const who = spaceCrewTaskPrompt(state.tasks).activePlayerId, task = state.tasks.tasks.find(t => t.ownerId === null); assert.ok(who && task);
    state = act(state, who, { kind: "TASK", action: { kind: "CHOOSE", taskId: task.id } });
  }
  if (state.special.kind === "NO_TRICKS_PLAYER") {
    for (const who of players.slice(1)) state = act(state, who, { kind: "SPECIAL_RESPOND", answer: "GOOD" });
    state = act(state, player(0), { kind: "SPECIAL_SELECT", playerId: player(1) });
  }
  return state;
}
function cardId(state: SpaceCrewMissionState, suit: string, value: number): string { const card = state.trick.cards.find(c => c.suit === suit && c.value === value); assert.ok(card); return card.cardId; }
function playFirst(state: SpaceCrewMissionState): SpaceCrewMissionState {
  const who = state.trick.activePlayerId; assert.ok(who); const cardId = legalSpaceCrewCardIds(state.trick, who)[0]; assert.ok(cardId);
  return act(state, who, { kind: "PLAY", cardId });
}
function validProjection(input: unknown): boolean {
  const result = v.safeParse(v.union([SpaceCrewPlayingProjectionSchema, SpaceCrewFinishedProjectionSchema]), input);
  return result.success && spaceCrewProjectionIsConsistent(result.output);
}

test("SPACE_CREW wire actions are strict and cannot override server actor, revision, rules, or assignment", () => {
  const cardId = "opaque-card";
  assert.ok(v.safeParse(SpaceCrewActionSchema, { kind: "COMMUNICATE", cardId, mark: null }).success);
  for (const payload of [
    { kind: "PLAY", cardId, expectedRevision: 0 }, { kind: "PLAY", cardId, actorPlayerId: player(0) },
    { kind: "PLAY", cardId, assignmentComplete: true }, { kind: "COMMUNICATE", cardId, mark: "HIGHEST", rule: { kind: "NORMAL" } },
    { kind: "TASK", action: { kind: "CHOOSE", taskId: "goal", expectedRevision: 0 } },
    { kind: "DISTRESS", action: { kind: "SELECT", cardId, hidden: true } },
    { kind: "TASK", action: { kind: "ASSIGN", taskId: null, toPlayerId: player(0), force: true } },
    { kind: "SPECIAL_RESPOND", answer: "my hand is all blue" },
  ]) assert.equal(v.safeParse(SpaceCrewActionSchema, payload).success, false);
});

test("SPACE_CREW start payloads require canonical private recovery tokens for both modes", () => {
  const recoveryToken = "A".repeat(43), campaignId = "campaign_fixture_01";
  for (const payload of [
    { kind: "NEW", mode: "CAMPAIGN", recoveryToken }, { kind: "NEW", mode: "PRACTICE", missionNumber: 50, recoveryToken }, { kind: "RESUME", campaignId, recoveryToken },
  ]) assert.ok(v.safeParse(SpaceCrewStartPayloadSchema, payload).success);
  for (const payload of [
    { kind: "NEW", mode: "CAMPAIGN", recoveryToken, missionNumber: 20 },
    { kind: "NEW", mode: "PRACTICE", missionNumber: 1 },
    { kind: "NEW", mode: "PRACTICE", missionNumber: 51, recoveryToken },
    { kind: "RESUME", campaignId, recoveryToken: "A".repeat(42) + "B" },
    { kind: "RESUME", campaignId, recoveryToken: "a".repeat(64) },
    { kind: "RESUME", campaignId: "../campaign_file", recoveryToken },
  ]) assert.equal(v.safeParse(SpaceCrewStartPayloadSchema, payload).success, false);
  assert.ok(v.safeParse(SpaceCrewCampaignSummarySchema, { campaignId, revision: 0, mode: "CAMPAIGN", missionNumber: 1, actualAttempts: 0, recordedAttempts: 0, completedMissions: [], distressActive: false }).success);
});

test("SPACE_CREW each viewer receives only their own hand and opaque opponent hand counts", () => {
  const mission = create(), game = stored(mission), before = structuredClone(game);
  for (const viewer of players) {
    const projection = projectSpaceCrew(game, viewer), serialized = JSON.stringify(projection);
    assert.ok(validProjection(projection));
    assert.equal(projection.privateState.playerId, viewer);
    assert.deepEqual(projection.playerStates.map(p => p.handCount), [10, 10, 10, 10]);
    for (const owner of mission.trick.players) for (const id of owner.hand) {
      assert.equal(serialized.includes(`"${id}"`), owner.playerId === viewer);
    }
  }
  assert.deepEqual(game, before);
  assert.throws(() => projectSpaceCrew(game, v.parse(PlayerIdSchema, "outsider")));
});

test("SPACE_CREW projection supports minimum and maximum rosters with correct public hand totals", () => {
  for (const count of [3, 5]) {
    const roster = Array.from({ length: count }, (_, i) => v.parse(PlayerIdSchema, `roster-${count}-${i}`));
    let nextCard = 0, nextTask = 0;
    const mission = createSpaceCrewMissionState({ missionNumber: 9, playerIds: roster,
      deck: createSpaceCrewDeck(() => `roster-card-${++nextCard}`), taskDeck: createSpaceCrewTaskDeck(() => `roster-task-${++nextTask}`) });
    for (const viewer of roster) {
      const projection = projectSpaceCrew(stored(mission), viewer);
      assert.ok(validProjection(projection));
      assert.equal(projection.totalTricks, count === 3 ? 13 : 8);
      assert.deepEqual(projection.playerStates.map(p => p.handCount), count === 3 ? [14, 13, 13] : [8, 8, 8, 8, 8]);
    }
  }
});

test("SPACE_CREW projects current and most recent completed trick but never older cards", () => {
  let state = ready(create(5));
  for (let i = 0; i < 8; i++) state = playFirst(state);
  const first = state.trick.completedTricks[0]; assert.ok(first);
  state = playFirst(state);
  const projection = projectSpaceCrew(stored(state), player(3)), json = JSON.stringify(projection);
  assert.equal(projection.completedTrickCount, 2); assert.equal(projection.lastTrick?.number, 2);
  assert.equal(projection.currentTrick.length, 1);
  for (const play of first.plays) assert.equal(json.includes(`"${play.cardId}"`), false);
  for (const forbidden of ["completedTricks", "completedAtTrick", "completedOrder", "exchange", "protectedCardIds"]) assert.equal(json.includes(`"${forbidden}"`), false);
});

test("SPACE_CREW mission 12 projects the new own hand without exposing random exchange records", () => {
  let next = 0;
  const goals = [...createSpaceCrewTaskDeck(() => `exchange-goal-${++next}`)].sort((a, b) => Number(b.value >= 7) - Number(a.value >= 7));
  let state = ready(createSpaceCrewMissionState({ missionNumber: 12, playerIds: players, deck: suitDeck(), taskDeck: goals }));
  for (let i = 0; i < 4; i++) state = playFirst(state);
  assert.ok(state.exchange);
  const projection = projectSpaceCrew(stored(state), player(0)), json = JSON.stringify(projection);
  assert.equal("exchange" in projection, false);
  for (const move of state.exchange.moves) {
    const own = projection.privateState.hand.some(card => card.cardId === move.cardId);
    assert.equal(json.includes(`"${move.cardId}"`), own);
  }
  assert.equal(json.includes("protectedCardIds"), false);
});

test("SPACE_CREW commander decision hides all task identities until assignment and distribution reveals one new task", () => {
  let decision = create(20);
  const allIds = decision.tasks.tasks.map(task => task.id);
  for (const viewer of players) {
    const projection = projectSpaceCrew(stored(decision), viewer);
    assert.deepEqual(projection.tasks.visibleTasks, []); assert.equal(projection.tasks.promptTaskId, null);
    for (const id of allIds) assert.equal(JSON.stringify(projection).includes(id), false);
  }
  for (const who of players.slice(1)) decision = act(decision, who, { kind: "TASK", action: { kind: "RESPOND", taskId: null, answer: true } });
  decision = act(decision, player(0), { kind: "TASK", action: { kind: "ASSIGN", taskId: null, toPlayerId: player(1) } });
  assert.equal(projectSpaceCrew(stored(decision), player(2)).tasks.visibleTasks.length, 2);
  let distribution = create(24);
  const current = spaceCrewTaskPrompt(distribution.tasks).taskId; assert.ok(current);
  assert.deepEqual(projectSpaceCrew(stored(distribution), player(2)).tasks.visibleTasks.map(t => t.id), [current]);
  for (const who of players.slice(1)) distribution = act(distribution, who, { kind: "TASK", action: { kind: "RESPOND", taskId: current, answer: true } });
  distribution = act(distribution, player(0), { kind: "TASK", action: { kind: "ASSIGN", taskId: current, toPlayerId: player(0) } });
  const projection = projectSpaceCrew(stored(distribution), player(2));
  assert.equal(projection.tasks.visibleTasks.length, 2);
  for (const task of distribution.tasks.tasks.slice(2)) assert.equal(JSON.stringify(projection).includes(task.id), false);
});

test("SPACE_CREW distress selections are private to their owner, with only selection identities public", () => {
  let state = ready(create());
  state = act(state, player(0), { kind: "DISTRESS", action: { kind: "PROPOSE", direction: "LEFT" } });
  for (const who of players.slice(1)) state = act(state, who, { kind: "DISTRESS", action: { kind: "VOTE", accept: true } });
  const selected = cardId(state, "PINK", 1);
  state = act(state, player(0), { kind: "DISTRESS", action: { kind: "SELECT", cardId: selected } });
  const owner = projectSpaceCrew(stored(state), player(0)), other = projectSpaceCrew(stored(state), player(1));
  assert.equal(owner.privateState.pendingDistressCardId, selected); assert.equal(other.privateState.pendingDistressCardId, null);
  assert.deepEqual(owner.distress, other.distress); assert.deepEqual(other.distress.selectedPlayerIds, [player(0)]);
  assert.equal(JSON.stringify(other).includes(`"${selected}"`), false);
  assert.equal("selections" in other.distress, false); assert.equal("history" in other.distress, false);
});

test("SPACE_CREW dead-zone declaration is public without its relationship and disappears after being played", () => {
  let state = ready(create(6)); const declared = cardId(state, "PINK", 9);
  state = act(state, player(0), { kind: "COMMUNICATE", cardId: declared, mark: null });
  const owner = projectSpaceCrew(stored(state), player(0)), other = projectSpaceCrew(stored(state), player(1));
  assert.ok(validProjection(owner), "hand and communication may reference the same authorized card");
  assert.equal(other.communications[0]?.card?.cardId, declared); assert.equal(other.communications[0]?.mark, null);
  state = act(state, player(0), { kind: "PLAY", cardId: declared });
  for (let i = 0; i < 7; i++) state = playFirst(state);
  const later = projectSpaceCrew(stored(state), player(1));
  assert.deepEqual(later.communications[0], { playerId: player(0), used: true, card: null, mark: null });
  assert.equal(JSON.stringify(later).includes(`"${declared}"`), false);
});

test("SPACE_CREW special setup projects allowed preferences and public nomination without internal revision", () => {
  let fifty = create(50);
  fifty = act(fifty, player(0), { kind: "SPECIAL_PREFERENCE", preference: "FIRST_FOUR" });
  const roles = projectSpaceCrew(stored(fifty), player(2)).special;
  assert.equal(roles.kind, "FINAL_ROLES"); assert.equal("revision" in roles, false);
  if (roles.kind === "FINAL_ROLES") assert.deepEqual(roles.preferences, [{ playerId: player(0), preference: "FIRST_FOUR" }]);
  const collector = projectSpaceCrew(stored(create(46)), player(2)).special;
  assert.deepEqual(collector, { kind: "PINK_COLLECTOR", phase: "READY", initialPinkNineHolderId: player(0), playerId: player(1) });
});

test("SPACE_CREW finished and cancelled projections retain hand privacy and whitelist cooperative results", () => {
  let success = ready(create()); for (let i = 0; i < 4; i++) success = playFirst(success);
  const win = projectSpaceCrew(stored(success), player(1));
  assert.equal(win.phase, "FINISHED"); assert.equal(win.missionStatus, "SUCCESS"); assert.equal(win.activePlayerId, null);
  if (win.phase === "FINISHED") assert.deepEqual(win.result, { outcome: "SUCCESS", reason: "OBJECTIVES_COMPLETE", taskIds: [] });
  let failure = ready(create(2)); for (let i = 0; i < 8; i++) failure = playFirst(failure);
  const loss = projectSpaceCrew(stored(failure), player(1)); assert.equal(loss.phase, "FINISHED");
  if (loss.phase === "FINISHED") assert.equal(loss.result.reason, "WRONG_OWNER");
  assert.ok(loss.tasks.visibleTasks.every(task => typeof task.completed === "boolean" && !("completedAtTrick" in task)));
  const initial = create(20), before = structuredClone(initial), cancelled = projectSpaceCrew(stored(initial, true), player(2));
  assert.equal(cancelled.phase, "FINISHED"); assert.deepEqual(initial, before); assert.equal(initial.status, "SETUP");
  if (cancelled.phase === "FINISHED") assert.deepEqual(cancelled.result, { outcome: "FAILURE", reason: "CREW_LEFT", taskIds: [] });
  assert.deepEqual(cancelled.tasks.visibleTasks, []);
  for (const hand of initial.trick.players.filter(p => p.playerId !== player(2)).map(p => p.hand)) for (const id of hand) assert.equal(JSON.stringify(cancelled).includes(`"${id}"`), false);
});

test("SPACE_CREW strict wire validation rejects secret fields and inconsistent public references", () => {
  const projection = projectSpaceCrew(stored(create()), player(0));
  for (const invalid of [
    { ...projection, fullState: {} }, { ...projection, campaign: { ...projection.campaign, recoveryToken: "A".repeat(43) } },
    { ...projection, campaign: { ...projection.campaign, verificationHash: "private" } },
    { ...projection, privateState: { ...projection.privateState, opponentHands: [] } },
    { ...projection, tasks: { ...projection.tasks, completedOrder: [] } },
    { ...projection, campaign: { ...projection.campaign, actualAttempts: 2 } },
    { ...projection, playerStates: projection.playerStates.map((p, i) => i === 1 ? { ...p, handCount: 11 } : p) },
    { ...projection, commanderId: "outsider" }, { ...projection, completedTrickCount: 1 },
    { ...projection, communications: projection.communications.map((c, i) => i === 1 ? projection.communications[0] : c) },
  ]) assert.equal(validProjection(invalid), false);
  const declared = ready(create(6));
  const state = act(declared, player(0), { kind: "COMMUNICATE", cardId: cardId(declared, "PINK", 9), mark: null });
  const dto = projectSpaceCrew(stored(state), player(1));
  const publicCard = dto.communications[0]?.card; assert.ok(publicCard);
  assert.equal(validProjection({ ...dto, communications: dto.communications.map((c, i) => i === 1 ? { ...c, used: true, card: publicCard } : c) }), false);
});

test("SPACE_CREW projection is detached from canonical storage and cannot mutate later snapshots", () => {
  const game = stored(create()), before = structuredClone(game), projection = projectSpaceCrew(game, player(0));
  const card = projection.privateState.hand[0]; assert.ok(card); card.cardId = "changed-client-copy";
  projection.tasks.visibleTasks.splice(0); projection.campaign.completedMissions.push(50);
  assert.deepEqual(game, before);
  assert.ok(projectSpaceCrew(game, player(0)).privateState.hand.every(card => card.cardId !== "changed-client-copy"));
});
