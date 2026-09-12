import * as v from "valibot";
import {
  SpaceCrewPlayingProjectionSchema, SpaceCrewFinishedProjectionSchema, spaceCrewProjectionIsConsistent,
  type SpaceCrewProjection, type SpaceCrewResult, type SpaceCrewSpecialProjection, type PlayerId,
} from "@hangul-rummikub/shared";
import { projectSpaceCrewCommunications } from "../domain/communication.js";
import { projectSpaceCrewDistress } from "../domain/distress.js";
import { spaceCrewTaskPrompt, visibleSpaceCrewTaskIds } from "../domain/tasks.js";
import type { SpaceCrewMissionSpecial, SpaceCrewMissionState } from "../domain/mission.js";
import { SpaceCrewGameStateAdapter, spaceCrewGameIsFinished, type SpaceCrewStoredGame } from "./adapter.js";

function specialProjection(special: SpaceCrewMissionSpecial): SpaceCrewSpecialProjection {
  switch (special.kind) {
    case "NONE": return { kind: "NONE" };
    case "NO_TRICKS_PLAYER": return { kind: special.kind, phase: special.phase, playerId: special.playerId, responses: special.responses.map(r => ({ playerId: r.playerId, answer: r.answer })) };
    case "LIMITED_TRICKS_PLAYER": return { kind: special.kind, phase: special.phase, playerId: special.playerId, responses: special.responses.map(r => ({ playerId: r.playerId, answer: r.answer })) };
    case "NO_COMMUNICATION_PLAYER": return { kind: special.kind, phase: special.phase, playerId: special.playerId };
    case "PINK_COLLECTOR": return { kind: special.kind, phase: special.phase, playerId: special.playerId, initialPinkNineHolderId: special.initialPinkNineHolderId };
    case "FINAL_ROLES": return {
      kind: special.kind, phase: special.phase,
      preferences: special.preferences.map(p => ({ playerId: p.playerId, preference: p.preference })),
      proposal: special.proposal === null ? null : { firstFourPlayerId: special.proposal.firstFourPlayerId, lastPlayerId: special.proposal.lastPlayerId, proposerId: special.proposal.proposerId },
      votes: special.votes.map(vote => ({ playerId: vote.playerId, accept: vote.accept })),
    };
  }
}

function resultProjection(mission: SpaceCrewMissionState, cancelled: boolean): SpaceCrewResult {
  if (cancelled) return { outcome: "FAILURE", reason: "CREW_LEFT", taskIds: [] };
  if (mission.status === "SUCCESS") return { outcome: "SUCCESS", reason: "OBJECTIVES_COMPLETE", taskIds: [] };
  const failure = mission.failure;
  if (failure === null) throw new Error("Missing Space Crew mission result.");
  return { outcome: "FAILURE", reason: failure.kind === "EXHAUSTED" ? "EXHAUSTED" : failure.reason, taskIds: failure.kind === "TASK" ? [...failure.taskIds] : [] };
}

/** Builds one viewer's whitelist; never serializes the canonical mission aggregate. */
export function projectSpaceCrew(input: SpaceCrewStoredGame, viewer: PlayerId): SpaceCrewProjection {
  const game = new SpaceCrewGameStateAdapter().cloneAndValidate(input);
  const state = game.state, mission = state.mission, trick = mission.trick;
  const self = trick.players.find(player => player.playerId === viewer);
  if (!self) throw new Error("Space Crew viewer missing.");
  const card = (id: string) => {
    const found = trick.cards.find(item => item.cardId === id);
    if (!found) throw new Error("Invalid Space Crew visible card.");
    return { cardId: found.cardId, kind: found.kind, suit: found.suit, value: found.value };
  };
  const visibleTaskIds = new Set(visibleSpaceCrewTaskIds(mission.tasks));
  const prompt = spaceCrewTaskPrompt(mission.tasks);
  const last = trick.completedTricks.at(-1);
  const finished = spaceCrewGameIsFinished(state);
  const campaign = state.campaign;
  const base = {
    gameType: "SPACE_CREW", gameId: game.gameId, gameRevision: game.gameRevision,
    rulesVersion: "space-crew-planet-nine-v1", mode: state.mode,
    attemptId: state.attemptId, attemptNumber: mission.distress.attemptNumber, missionNumber: mission.missionNumber,
    commanderId: trick.commanderId, leaderId: trick.leaderId, activePlayerId: finished ? null : trick.activePlayerId,
    trickPhase: trick.phase, totalTricks: trick.totalTricks, completedTrickCount: trick.completedTricks.length,
    currentTrick: trick.currentTrick.map(play => ({ playerId: play.playerId, card: card(play.cardId) })),
    lastTrick: last === undefined ? null : { number: last.number, leaderId: last.leaderId, winnerId: last.winnerId, plays: last.plays.map(play => ({ playerId: play.playerId, card: card(play.cardId) })) },
    playerStates: trick.players.map(player => ({ playerId: player.playerId, handCount: player.hand.length })),
    privateState: {
      playerId: viewer, hand: self.hand.map(card),
      pendingDistressCardId: mission.distress.selections.find(selection => selection.playerId === viewer)?.cardId ?? null,
    },
    tasks: {
      mode: mission.tasks.mode, phase: mission.tasks.phase, totalCount: mission.tasks.tasks.length,
      activePlayerId: prompt.activePlayerId, promptTaskId: prompt.taskId,
      visibleTasks: mission.tasks.tasks.filter(task => visibleTaskIds.has(task.id)).map(task => ({
        id: task.id, suit: task.suit, value: task.value,
        token: task.token === null ? null : task.token.kind === "LAST" ? { kind: "LAST" } : { kind: task.token.kind, position: task.token.position },
        ownerId: task.ownerId, completed: task.completedAtTrick !== null,
      })),
      responses: mission.tasks.responses.map(response => ({ playerId: response.playerId, answer: response.answer })),
      transfer: mission.tasks.transfer === null ? null : { taskId: mission.tasks.transfer.taskId, fromPlayerId: mission.tasks.transfer.fromPlayerId, toPlayerId: mission.tasks.transfer.toPlayerId },
      tokenEditUsed: mission.tasks.tokenEditUsed,
    },
    communications: projectSpaceCrewCommunications(trick, mission.communications),
    distress: projectSpaceCrewDistress(mission.distress),
    special: specialProjection(mission.special),
    campaign: {
      campaignId: campaign.campaignId, revision: campaign.revision, mode: campaign.mode, missionNumber: campaign.missionNumber,
      actualAttempts: campaign.actualAttempts, recordedAttempts: campaign.recordedAttempts,
      completedMissions: [...campaign.completedMissions], distressActive: campaign.distressActive,
    },
  };
  const projection = finished
    ? v.parse(SpaceCrewFinishedProjectionSchema, { ...base, phase: "FINISHED", missionStatus: state.cancelled ? "FAILURE" : mission.status, result: resultProjection(mission, state.cancelled) })
    : v.parse(SpaceCrewPlayingProjectionSchema, { ...base, phase: "PLAYING", missionStatus: mission.status });
  if (!spaceCrewProjectionIsConsistent(projection)) throw new Error("Inconsistent Space Crew projection.");
  return projection;
}
