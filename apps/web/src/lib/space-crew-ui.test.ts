import assert from "node:assert/strict";
import test from "node:test";
import { parse } from "valibot";
import { PlayerIdSchema, SpaceCrewPlayingProjectionSchema, SpaceCrewFinishedProjectionSchema, type SpaceCrewAction } from "@hangul-rummikub/shared";
import { getSpaceCrewMissionCopy, getSpaceCrewMissionCommunication } from "../features/space-crew/mission-copy.js";
import { getSpaceCrewAvailableActions, getSpaceCrewPlayableCardIds, getSpaceCrewCommunicationOptions, getSpaceCrewActionPrompt } from "../features/space-crew/selectors.js";

const id = (value: string) => parse(PlayerIdSchema, value);
const color = (cardId: string, suit: string, value: number) => ({ cardId, kind: "COLOR", suit, value });
const hand = [color("pink-1", "PINK", 1), color("pink-4", "PINK", 4), color("pink-9", "PINK", 9), color("blue-3", "BLUE", 3), color("yellow-5", "YELLOW", 5), color("green-2", "GREEN", 2), color("green-7", "GREEN", 7),
  ...[1, 2, 4].map(value => ({ cardId: `rocket-${value}`, kind: "ROCKET", suit: "ROCKET", value }))];
function game(missionNumber = 1, actor = "a", count = 4) {
  const players = ["a", "b", "c", "d", "e"].slice(0, count);
  return parse(SpaceCrewPlayingProjectionSchema, {
    gameType: "SPACE_CREW", gameId: "game", gameRevision: 0, rulesVersion: "space-crew-planet-nine-v1", mode: "CAMPAIGN",
    attemptId: "attempt", attemptNumber: 1, missionNumber, commanderId: "a", leaderId: "a", activePlayerId: "a",
    phase: "PLAYING", missionStatus: "ACTIVE", trickPhase: "BETWEEN_TRICKS", totalTricks: Math.floor(40 / count), completedTrickCount: 0,
    currentTrick: [], lastTrick: null, playerStates: players.map(playerId => ({ playerId, handCount: Math.floor(40 / count) })),
    privateState: { playerId: actor, hand: hand.slice(0, Math.floor(40 / count)), pendingDistressCardId: null },
    tasks: { mode: "CHOOSE", phase: "READY", totalCount: 1, activePlayerId: null, promptTaskId: null,
      visibleTasks: [{ id: "task-1", suit: "BLUE", value: 3, token: null, ownerId: "a", completed: false }], responses: [], transfer: null, tokenEditUsed: false },
    communications: players.map(playerId => ({ playerId, used: false, card: null, mark: null })),
    distress: { active: false, phase: "UNDECIDED", direction: null, votes: [], selectedPlayerIds: [] }, special: { kind: "NONE" },
    campaign: { campaignId: "campaign-000000000001", revision: 0, mode: "CAMPAIGN", missionNumber, actualAttempts: 1, recordedAttempts: 1, completedMissions: [], distressActive: false },
  });
}
const actionsOf = (state: ReturnType<typeof game>, kind: SpaceCrewAction["kind"]) => getSpaceCrewAvailableActions(state).filter(action => action.kind === kind);
const taskKinds = (state: ReturnType<typeof game>) => getSpaceCrewAvailableActions(state).flatMap(action => action.kind === "TASK" ? [action.action] : []);
const distressKinds = (state: ReturnType<typeof game>) => getSpaceCrewAvailableActions(state).flatMap(action => action.kind === "DISTRESS" ? [action.action] : []);

test("fifty mission summaries cover the audited objective, ending and five-player exceptions", () => {
  const summaries = Array.from({ length: 50 }, (_, index) => getSpaceCrewMissionCopy(index + 1));
  assert.equal(new Set(summaries.map(copy => copy.title)).size, 50);
  assert.ok(summaries.every(copy => copy.objective.length > 8 && copy.communicationNote.length > 8));
  assert.deepEqual(summaries.flatMap((copy, i) => copy.fivePlayerTransfer ? [i + 1] : []), [25, 27, 28, 30, 31, 32, 35, 36, 37, 38, 39, 40, 42, 43, 45, 47, 48, 49]);
  assert.deepEqual(summaries.flatMap((copy, i) => copy.completionNote.includes("마지막 트릭까지") ? [i + 1] : []), [5, 16, 29, 33, 34, 41, 48, 50]);
  assert.match(getSpaceCrewMissionCopy(26).objective, /서로 다른 색상/);
  assert.match(getSpaceCrewMissionCopy(29).objective, /매 트릭/);
  assert.match(getSpaceCrewMissionCopy(33).objective, /정확히 한 트릭.*로켓/);
  assert.match(getSpaceCrewMissionCopy(41).objective, /첫 트릭과 마지막 트릭만.*로켓/);
  assert.match(getSpaceCrewMissionCopy(46).setupNotes.join(" "), /구조 신호 교환 후에도 바뀌지/);
  assert.match(getSpaceCrewMissionCopy(48).objective, /마지막 트릭/);
  assert.match(getSpaceCrewMissionCopy(50).objective, /나머지 트릭은 다른 승무원/);
  for (const number of [0, 51, 1.5, NaN]) assert.throws(() => getSpaceCrewMissionCopy(number));
});

test("mission descriptions keep absolute, relative and hidden assignment rules distinct", () => {
  assert.match(getSpaceCrewMissionCopy(3).setupNotes.join(" "), /전체 목표 중/);
  assert.match(getSpaceCrewMissionCopy(22).setupNotes.join(" "), /다른 목표는 사이에/);
  for (const mission of [20, 27, 37]) assert.match(getSpaceCrewMissionCopy(mission).setupNotes[0] ?? "", /공개하기 전에.*자신을 제외한 한 명에게 모든 목표/);
  for (const mission of [24, 32, 36, 43]) assert.match(getSpaceCrewMissionCopy(mission).setupNotes[0] ?? "", /한 장씩.*배분 완료 시/);
  assert.match(getSpaceCrewMissionCopy(12).setupNotes.join(" "), /무작위.*교신 중인 카드는 제외/);
  assert.match(getSpaceCrewMissionCopy(23).setupNotes.join(" "), /토큰 두 개/);
  assert.match(getSpaceCrewMissionCopy(40).setupNotes.join(" "), /토큰 없는 목표/);
});

test("play affordances follow the led color or rocket only when the viewer holds that suit", () => {
  const state = game();
  assert.equal(getSpaceCrewPlayableCardIds(state).length, 10);
  state.currentTrick = [parse(SpaceCrewPlayingProjectionSchema, { ...state, currentTrick: [{ playerId: "d", card: color("lead", "PINK", 2) }] }).currentTrick[0]!];
  state.trickPhase = "IN_TRICK";
  assert.deepEqual(getSpaceCrewPlayableCardIds(state), ["pink-1", "pink-4", "pink-9"]);
  state.currentTrick = [{ playerId: id("d"), card: { cardId: "lead-rocket", kind: "ROCKET", suit: "ROCKET", value: 3 } }];
  assert.deepEqual(getSpaceCrewPlayableCardIds(state), ["rocket-1", "rocket-2", "rocket-4"]);
  state.privateState.hand = state.privateState.hand.filter(card => card.kind !== "ROCKET");
  assert.equal(getSpaceCrewPlayableCardIds(state).length, 7);
  state.activePlayerId = id("b"); assert.deepEqual(getSpaceCrewPlayableCardIds(state), []);
  state.activePlayerId = id("a"); state.missionStatus = "SETUP"; assert.deepEqual(getSpaceCrewPlayableCardIds(state), []);
});

test("communication uses ONLY for singletons, never middle cards or rockets, and dead zone hides marks", () => {
  const state = game();
  const normal = getSpaceCrewCommunicationOptions(state);
  assert.ok(normal.some(option => option.cardId === "blue-3" && option.mark === "ONLY"));
  assert.ok(normal.some(option => option.cardId === "pink-1" && option.mark === "LOWEST"));
  assert.ok(normal.some(option => option.cardId === "pink-9" && option.mark === "HIGHEST"));
  assert.equal(normal.some(option => option.cardId === "pink-4" || option.cardId.startsWith("rocket")), false);
  state.missionNumber = 6;
  const dead = getSpaceCrewCommunicationOptions(state);
  assert.deepEqual(dead.map(option => option.cardId), normal.map(option => option.cardId));
  assert.ok(dead.every(option => option.mark === null));
  const own = state.communications.find(item => item.playerId === id("a")); assert.ok(own); own.used = true;
  assert.deepEqual(getSpaceCrewCommunicationOptions(state), []);
});

test("communication respects exact disruption boundary, nominee and between-trick windows", () => {
  for (const [mission, from] of [[18, 2], [30, 2], [19, 3], [28, 3], [38, 3]]) {
    assert.ok(mission !== undefined && from !== undefined);
    const state = game(mission); state.completedTrickCount = from - 2;
    assert.deepEqual(getSpaceCrewCommunicationOptions(state), []);
    state.completedTrickCount += 1; assert.ok(getSpaceCrewCommunicationOptions(state).length > 0);
    state.trickPhase = "IN_TRICK"; assert.deepEqual(getSpaceCrewCommunicationOptions(state), []);
  }
  assert.deepEqual(Array.from({ length: 50 }, (_, i) => i + 1).filter(number => getSpaceCrewMissionCommunication(number).kind === "DEAD_ZONE"), [6, 14, 21, 25, 29, 39]);
  const state = game(11); state.special = { kind: "NO_COMMUNICATION_PLAYER", phase: "READY", playerId: id("a") };
  assert.deepEqual(getSpaceCrewCommunicationOptions(state), []);
  state.special.playerId = id("b"); assert.ok(getSpaceCrewCommunicationOptions(state).length > 0);
});

test("hidden commander decision actions carry null task ids without inventing future cards", () => {
  const state = game(20, "b"); state.missionStatus = "SETUP";
  state.tasks = { ...state.tasks, mode: "COMMANDER_DECISION", phase: "RESPOND", activePlayerId: id("b"), promptTaskId: null, visibleTasks: [], totalCount: 2 };
  assert.deepEqual(taskKinds(state), [{ kind: "RESPOND", taskId: null, answer: true }, { kind: "RESPOND", taskId: null, answer: false }]);
  state.privateState.playerId = id("a"); state.tasks.phase = "ASSIGN";
  const assignments = taskKinds(state);
  assert.equal(assignments.length, 3);
  assert.ok(assignments.every(action => action.kind === "ASSIGN" && action.taskId === null && action.toPlayerId !== id("a")));
});

test("commander distribution permits temporary gaps when the final floor/ceiling remains feasible", () => {
  const state = game(24); state.missionStatus = "SETUP";
  const task = state.tasks.visibleTasks[0]!;
  state.tasks = { ...state.tasks, mode: "COMMANDER_DISTRIBUTION", phase: "ASSIGN", totalCount: 6, promptTaskId: "prompt", visibleTasks: [{ ...task, id: "owned", ownerId: id("a") }, { ...task, id: "prompt", ownerId: null }] };
  assert.ok(taskKinds(state).some(action => action.kind === "ASSIGN" && action.toPlayerId === id("a")));
  state.tasks.visibleTasks.unshift({ ...task, id: "owned-2", ownerId: id("a") });
  assert.equal(taskKinds(state).some(action => action.kind === "ASSIGN" && action.toPlayerId === id("a")), false);
});

test("five-player transfer is owner-only, once, before play and only on marked missions", () => {
  const state = game(25, "a", 5);
  assert.equal(taskKinds(state).filter(action => action.kind === "TRANSFER").length, 4);
  state.privateState.playerId = id("b"); assert.equal(taskKinds(state).length, 0);
  state.privateState.playerId = id("a"); state.tasks.transfer = { taskId: "task-1", fromPlayerId: id("a"), toPlayerId: id("b") };
  assert.equal(taskKinds(state).length, 0);
  state.tasks.transfer = null; state.missionNumber = 26; assert.equal(taskKinds(state).length, 0);
  state.missionNumber = 25; state.completedTrickCount = 1; assert.equal(taskKinds(state).length, 0);
  assert.equal(taskKinds(game(25)).length, 0);
});

test("token editing chooses two marked tasks for 23 and a blank destination for 40 before the first choice", () => {
  const state = game(23); state.missionStatus = "SETUP";
  const task = state.tasks.visibleTasks[0]!;
  state.tasks = { ...state.tasks, phase: "CHOOSE", activePlayerId: id("a"), totalCount: 3, visibleTasks: [
    { ...task, id: "one", ownerId: null, token: { kind: "ABSOLUTE", position: 1 } },
    { ...task, id: "two", ownerId: null, token: { kind: "ABSOLUTE", position: 2 } }, { ...task, id: "blank", ownerId: null, token: null }] };
  assert.deepEqual(taskKinds(state).filter(action => action.kind === "SWAP_TOKENS"), [{ kind: "SWAP_TOKENS", firstTaskId: "one", secondTaskId: "two" }]);
  state.missionNumber = 40;
  assert.equal(taskKinds(state).filter(action => action.kind === "MOVE_TOKEN").length, 2);
  state.tasks.visibleTasks[0]!.ownerId = id("a");
  assert.equal(taskKinds(state).some(action => action.kind === "MOVE_TOKEN"), false);
  state.tasks.visibleTasks[0]!.ownerId = null; state.tasks.tokenEditUsed = true;
  assert.equal(taskKinds(state).some(action => action.kind === "MOVE_TOKEN"), false);
});

test("special responses follow seating and nominee exclusions differ for 5/11 versus 33/41", () => {
  const state = game(5, "b"); state.missionStatus = "SETUP";
  state.special = { kind: "NO_TRICKS_PLAYER", phase: "RESPOND", playerId: null, responses: [] };
  assert.deepEqual(actionsOf(state, "SPECIAL_RESPOND"), [{ kind: "SPECIAL_RESPOND", answer: "GOOD" }, { kind: "SPECIAL_RESPOND", answer: "BAD" }]);
  state.privateState.playerId = id("c"); assert.deepEqual(actionsOf(state, "SPECIAL_RESPOND"), []);
  state.privateState.playerId = id("a"); state.special.phase = "SELECT";
  assert.equal(actionsOf(state, "SPECIAL_SELECT").length, 4);
  state.special = { kind: "NO_COMMUNICATION_PLAYER", phase: "SELECT", playerId: null };
  assert.equal(actionsOf(state, "SPECIAL_SELECT").length, 4);
  state.special = { kind: "LIMITED_TRICKS_PLAYER", phase: "SELECT", playerId: null, responses: [] };
  assert.equal(actionsOf(state, "SPECIAL_SELECT").length, 3);
  assert.equal(actionsOf(state, "SPECIAL_SELECT").some(action => action.kind === "SPECIAL_SELECT" && action.playerId === id("a")), false);
});

test("mission 50 exposes only fixed preferences, distinct role proposals and unused votes", () => {
  const state = game(50); state.missionStatus = "SETUP";
  state.special = { kind: "FINAL_ROLES", phase: "PREFERENCES", preferences: [], proposal: null, votes: [] };
  assert.equal(actionsOf(state, "SPECIAL_PREFERENCE").length, 3);
  state.privateState.playerId = id("b"); assert.equal(actionsOf(state, "SPECIAL_PREFERENCE").length, 0);
  state.special.phase = "PROPOSE";
  assert.equal(actionsOf(state, "SPECIAL_PROPOSE_ROLES").length, 12);
  assert.ok(actionsOf(state, "SPECIAL_PROPOSE_ROLES").every(action => action.kind === "SPECIAL_PROPOSE_ROLES" && action.firstFourPlayerId !== action.lastPlayerId));
  state.special.phase = "VOTE"; state.special.proposal = { firstFourPlayerId: id("a"), lastPlayerId: id("c"), proposerId: id("b") }; state.special.votes = [{ playerId: id("b"), accept: true }];
  assert.equal(actionsOf(state, "SPECIAL_VOTE_ROLES").length, 0);
  state.privateState.playerId = id("d"); assert.equal(actionsOf(state, "SPECIAL_VOTE_ROLES").length, 2);
});

test("distress proposal, skip, vote and private color selection obey the initial no-communication window", () => {
  const state = game();
  assert.deepEqual(distressKinds(state), [{ kind: "PROPOSE", direction: "LEFT" }, { kind: "PROPOSE", direction: "RIGHT" }, { kind: "SKIP" }]);
  state.distress.phase = "SKIPPED"; assert.equal(distressKinds(state).length, 2);
  state.distress.phase = "VOTING"; state.distress.votes = [{ playerId: id("b"), accept: true }];
  assert.deepEqual(distressKinds(state), [{ kind: "VOTE", accept: true }, { kind: "VOTE", accept: false }]);
  assert.deepEqual(getSpaceCrewPlayableCardIds(state), []); assert.deepEqual(getSpaceCrewCommunicationOptions(state), []); assert.equal(taskKinds(state).length, 0);
  state.distress.votes.push({ playerId: id("a"), accept: true }); assert.deepEqual(distressKinds(state), []);
  state.distress.phase = "SELECTING";
  const selects = distressKinds(state); assert.equal(selects.length, 7);
  assert.equal(selects.some(action => action.kind === "SELECT" && action.cardId.startsWith("rocket")), false);
  state.distress.selectedPlayerIds = [id("a")]; state.privateState.pendingDistressCardId = "pink-1";
  assert.deepEqual(distressKinds(state), []); assert.match(getSpaceCrewActionPrompt(state), /기다립니다/);
  state.distress.phase = "UNDECIDED"; state.communications[1]!.used = true; assert.deepEqual(distressKinds(state), []);
  state.communications[1]!.used = false; state.completedTrickCount = 1; assert.deepEqual(distressKinds(state), []);
});

test("finished or revision-exhausted views offer no commands and selectors do not mutate the projection", () => {
  const state = game(), before = structuredClone(state);
  getSpaceCrewAvailableActions(state); getSpaceCrewActionPrompt(state);
  assert.deepEqual(state, before);
  const finished = parse(SpaceCrewFinishedProjectionSchema, { ...state, phase: "FINISHED", missionStatus: "SUCCESS", activePlayerId: null, result: { outcome: "SUCCESS", reason: "OBJECTIVES_COMPLETE", taskIds: [] } });
  assert.deepEqual(getSpaceCrewAvailableActions(finished), []);
  assert.equal(getSpaceCrewActionPrompt(finished), "미션 성공");
  state.gameRevision = parse(SpaceCrewPlayingProjectionSchema, { ...state, gameRevision: Number.MAX_SAFE_INTEGER }).gameRevision;
  assert.deepEqual(getSpaceCrewAvailableActions(state), []);
});


test("mission copy gives the audited task counts across every task-based mission", () => {
  const groups: ReadonlyArray<readonly [number, readonly number[]]> = [
    [1, [1]], [2, [2, 3, 17, 20]], [3, [4, 6, 7, 8, 27, 48]],
    [4, [10, 11, 12, 14, 15, 37]], [5, [18, 19, 21, 22, 23]],
    [6, [24, 25, 28, 30, 31]], [7, [32, 35, 36]], [8, [38, 39, 40]],
    [9, [42, 43, 45]], [10, [47, 49]],
  ];
  for (const [count, missions] of groups) for (const mission of missions) {
    assert.ok(getSpaceCrewMissionCopy(mission).objective.includes(`목표 ${count}개`), `mission ${mission}: ${count} tasks`);
  }
});
