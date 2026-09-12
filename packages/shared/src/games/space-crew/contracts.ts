import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema, TurnIdSchema } from "../../identifiers.js";
import { GameRevisionSchema } from "../../protocol.js";
import {
  SpaceCrewCampaignIdSchema, SpaceCrewCardIdSchema, SpaceCrewCardSchema, SpaceCrewColorSchema,
  SpaceCrewCommunicationMarkSchema, SpaceCrewDirectionSchema, SpaceCrewMissionNumberSchema,
  SpaceCrewRolePreferenceSchema, SpaceCrewTaskIdSchema, SpaceCrewTaskTokenSchema,
} from "./actions.js";

const Count = v.pipe(v.number(), v.safeInteger(), v.minValue(0));
const Positive = v.pipe(Count, v.minValue(1));
const PlayerIds = v.pipe(v.array(PlayerIdSchema), v.maxLength(5));
const PlaySchema = v.strictObject({ playerId: PlayerIdSchema, card: SpaceCrewCardSchema });
const LastTrickSchema = v.strictObject({ number: v.pipe(Positive, v.maxValue(13)), leaderId: PlayerIdSchema, winnerId: PlayerIdSchema, plays: v.pipe(v.array(PlaySchema), v.minLength(3), v.maxLength(5)) });
export const SpaceCrewCampaignSummarySchema = v.strictObject({
  campaignId: SpaceCrewCampaignIdSchema, revision: Count, mode: v.picklist(["CAMPAIGN", "PRACTICE"]),
  missionNumber: SpaceCrewMissionNumberSchema, actualAttempts: Count, recordedAttempts: Count,
  completedMissions: v.pipe(v.array(SpaceCrewMissionNumberSchema), v.maxLength(50)), distressActive: v.boolean(),
});
export type SpaceCrewCampaignSummary = v.InferOutput<typeof SpaceCrewCampaignSummarySchema>;
const SelectionPhase = v.picklist(["RESPOND", "SELECT", "READY"]);
const GoodBad = v.picklist(["GOOD", "BAD"]);
export const SpaceCrewSpecialProjectionSchema = v.variant("kind", [
  v.strictObject({ kind: v.literal("NONE") }),
  v.strictObject({ kind: v.literal("NO_TRICKS_PLAYER"), phase: SelectionPhase, playerId: v.nullable(PlayerIdSchema), responses: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, answer: GoodBad })), v.maxLength(4)) }),
  v.strictObject({ kind: v.literal("NO_COMMUNICATION_PLAYER"), phase: v.picklist(["SELECT", "READY"]), playerId: v.nullable(PlayerIdSchema) }),
  v.strictObject({ kind: v.literal("LIMITED_TRICKS_PLAYER"), phase: SelectionPhase, playerId: v.nullable(PlayerIdSchema), responses: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, answer: v.boolean() })), v.maxLength(4)) }),
  v.strictObject({ kind: v.literal("PINK_COLLECTOR"), phase: v.literal("READY"), initialPinkNineHolderId: PlayerIdSchema, playerId: PlayerIdSchema }),
  v.strictObject({ kind: v.literal("FINAL_ROLES"), phase: v.picklist(["PREFERENCES", "PROPOSE", "VOTE", "READY"]),
    preferences: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, preference: SpaceCrewRolePreferenceSchema })), v.maxLength(5)),
    proposal: v.nullable(v.strictObject({ firstFourPlayerId: PlayerIdSchema, lastPlayerId: PlayerIdSchema, proposerId: PlayerIdSchema })),
    votes: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, accept: v.literal(true) })), v.maxLength(5)),
  }),
]);
export type SpaceCrewSpecialProjection = v.InferOutput<typeof SpaceCrewSpecialProjectionSchema>;
const TaskViewSchema = v.strictObject({
  id: SpaceCrewTaskIdSchema, suit: SpaceCrewColorSchema, value: v.picklist([1, 2, 3, 4, 5, 6, 7, 8, 9]),
  token: v.nullable(SpaceCrewTaskTokenSchema), ownerId: v.nullable(PlayerIdSchema), completed: v.boolean(),
});
const TasksSchema = v.strictObject({
  mode: v.picklist(["CHOOSE", "COMMANDER_DECISION", "COMMANDER_DISTRIBUTION"]),
  phase: v.picklist(["CHOOSE", "RESPOND", "ASSIGN", "READY"]), totalCount: v.pipe(Count, v.maxValue(10)),
  activePlayerId: v.nullable(PlayerIdSchema), promptTaskId: v.nullable(SpaceCrewTaskIdSchema),
  visibleTasks: v.pipe(v.array(TaskViewSchema), v.maxLength(10)),
  responses: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, answer: v.boolean() })), v.maxLength(4)),
  transfer: v.nullable(v.strictObject({ taskId: SpaceCrewTaskIdSchema, fromPlayerId: PlayerIdSchema, toPlayerId: PlayerIdSchema })),
  tokenEditUsed: v.boolean(),
});
export const SpaceCrewResultSchema = v.strictObject({
  outcome: v.picklist(["SUCCESS", "FAILURE"]),
  reason: v.picklist(["OBJECTIVES_COMPLETE", "CREW_LEFT", "WRONG_OWNER", "TASK_ORDER", "EXHAUSTED", "OBJECTIVE_NOT_MET", "ROCKET_DID_NOT_WIN", "ROCKET_ORDER", "FORBIDDEN_WIN_VALUE", "TOO_MANY_PLAYER_TRICKS", "UNEXPECTED_PLAYER_TRICK", "REQUIRED_WINNER_MISSED", "FORBIDDEN_PLAYER_ROCKET_WIN", "UNBALANCED_WINS", "WRONG_COLOR_CAPTURER", "OMEGA_NOT_LAST_TRICK"]),
  taskIds: v.pipe(v.array(SpaceCrewTaskIdSchema), v.maxLength(10)),
});
export type SpaceCrewResult = v.InferOutput<typeof SpaceCrewResultSchema>;
const Base = {
  gameType: v.literal("SPACE_CREW"), gameId: GameIdSchema, gameRevision: GameRevisionSchema,
  rulesVersion: v.literal("space-crew-planet-nine-v1"), mode: v.picklist(["CAMPAIGN", "PRACTICE"]),
  attemptId: TurnIdSchema, attemptNumber: Positive, missionNumber: SpaceCrewMissionNumberSchema,
  commanderId: PlayerIdSchema, leaderId: PlayerIdSchema, activePlayerId: v.nullable(PlayerIdSchema),
  trickPhase: v.picklist(["BETWEEN_TRICKS", "IN_TRICK", "EXHAUSTED"]),
  totalTricks: v.picklist([8, 10, 13]), completedTrickCount: v.pipe(Count, v.maxValue(13)),
  currentTrick: v.pipe(v.array(PlaySchema), v.maxLength(4)), lastTrick: v.nullable(LastTrickSchema),
  playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, handCount: v.pipe(Count, v.maxValue(14)) })), v.minLength(3), v.maxLength(5)),
  privateState: v.strictObject({ playerId: PlayerIdSchema, hand: v.pipe(v.array(SpaceCrewCardSchema), v.maxLength(14)), pendingDistressCardId: v.nullable(SpaceCrewCardIdSchema) }),
  tasks: TasksSchema,
  communications: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, used: v.boolean(), card: v.nullable(SpaceCrewCardSchema), mark: v.nullable(SpaceCrewCommunicationMarkSchema) })), v.minLength(3), v.maxLength(5)),
  distress: v.strictObject({ active: v.boolean(), phase: v.picklist(["UNDECIDED", "VOTING", "SELECTING", "SKIPPED", "EXCHANGED"]), direction: v.nullable(SpaceCrewDirectionSchema), votes: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, accept: v.boolean() })), v.maxLength(5)), selectedPlayerIds: PlayerIds }),
  special: SpaceCrewSpecialProjectionSchema,
  campaign: SpaceCrewCampaignSummarySchema,
};
export const SpaceCrewPlayingProjectionSchema = v.strictObject({ ...Base, phase: v.literal("PLAYING"), missionStatus: v.picklist(["SETUP", "ACTIVE"]) });
export const SpaceCrewFinishedProjectionSchema = v.strictObject({ ...Base, phase: v.literal("FINISHED"), missionStatus: v.picklist(["SUCCESS", "FAILURE"]), result: SpaceCrewResultSchema });
export type SpaceCrewPlayingProjection = v.InferOutput<typeof SpaceCrewPlayingProjectionSchema>;
export type SpaceCrewFinishedProjection = v.InferOutput<typeof SpaceCrewFinishedProjectionSchema>;
export type SpaceCrewProjection = SpaceCrewPlayingProjection | SpaceCrewFinishedProjection;

/** Cross-field checks use only the authorized projection, never hidden cards. */
export function spaceCrewProjectionIsConsistent(game: SpaceCrewProjection): boolean {
  const players = new Set<string>(game.playerStates.map(p => p.playerId));
  const hasPlayer = (id: string | null): boolean => id === null || players.has(id);
  const uniqueMembers = (ids: readonly string[]): boolean => new Set(ids).size === ids.length && ids.every(id => players.has(id));
  if (players.size !== game.playerStates.length || !players.has(game.privateState.playerId) || !players.has(game.commanderId) || !players.has(game.leaderId) || !hasPlayer(game.activePlayerId)) return false;
  if (game.privateState.hand.length !== game.playerStates.find(p => p.playerId === game.privateState.playerId)?.handCount || game.totalTricks !== Math.floor(40 / players.size) || game.completedTrickCount > game.totalTricks) return false;
  if (game.playerStates.reduce((sum, p) => sum + p.handCount, 0) + game.currentTrick.length + game.completedTrickCount * players.size !== 40) return false;
  if (game.currentTrick.length >= players.size || !uniqueMembers(game.currentTrick.map(p => p.playerId))) return false;
  if (game.lastTrick === null ? game.completedTrickCount !== 0 : game.lastTrick.number !== game.completedTrickCount || game.lastTrick.plays.length !== players.size || !players.has(game.lastTrick.leaderId) || !players.has(game.lastTrick.winnerId) || !uniqueMembers(game.lastTrick.plays.map(p => p.playerId))) return false;
  const zones = [...game.privateState.hand, ...game.currentTrick.map(p => p.card), ...(game.lastTrick?.plays.map(p => p.card) ?? [])];
  if (new Set(zones.map(c => c.cardId)).size !== zones.length) return false;
  const pending = game.privateState.pendingDistressCardId;
  if (pending !== null && (game.distress.phase !== "SELECTING" || !game.privateState.hand.some(c => c.cardId === pending) || !game.distress.selectedPlayerIds.includes(game.privateState.playerId))) return false;
  if (!uniqueMembers(game.distress.votes.map(vote => vote.playerId)) || !uniqueMembers(game.distress.selectedPlayerIds)) return false;
  if (game.communications.length !== players.size || !uniqueMembers(game.communications.map(c => c.playerId))) return false;
  const communicationIds: string[] = [];
  for (const item of game.communications) {
    if (!item.used && (item.card !== null || item.mark !== null) || item.card === null && item.mark !== null) return false;
    if (item.card !== null) {
      if (item.card.kind !== "COLOR") return false;
      communicationIds.push(item.card.cardId);
      if (game.currentTrick.some(play => play.card.cardId === item.card?.cardId) || game.lastTrick?.plays.some(play => play.card.cardId === item.card?.cardId)) return false;
      const selfCard = game.privateState.hand.find(c => c.cardId === item.card?.cardId);
      if (item.playerId === game.privateState.playerId ? !selfCard || selfCard.kind !== item.card.kind || selfCard.suit !== item.card.suit || selfCard.value !== item.card.value : selfCard !== undefined) return false;
    }
  }
  if (new Set(communicationIds).size !== communicationIds.length) return false;
  const visible = game.tasks.visibleTasks;
  if (visible.length > game.tasks.totalCount || new Set(visible.map(t => t.id)).size !== visible.length || visible.some(t => !hasPlayer(t.ownerId) || t.completed && t.ownerId === null)) return false;
  if (!hasPlayer(game.tasks.activePlayerId) || !uniqueMembers(game.tasks.responses.map(r => r.playerId))) return false;
  if (game.tasks.promptTaskId !== null && !visible.some(t => t.id === game.tasks.promptTaskId)) return false;
  if (game.tasks.mode === "COMMANDER_DECISION" && game.tasks.phase !== "READY" && (visible.length !== 0 || game.tasks.promptTaskId !== null)) return false;
  if ((game.tasks.mode === "CHOOSE" || game.tasks.phase === "READY") && visible.length !== game.tasks.totalCount) return false;
  if (game.tasks.mode === "COMMANDER_DISTRIBUTION" && game.tasks.phase !== "READY" && visible.filter(t => t.ownerId === null).length !== 1) return false;
  if (game.tasks.transfer && (!players.has(game.tasks.transfer.fromPlayerId) || !players.has(game.tasks.transfer.toPlayerId) || !visible.some(t => t.id === game.tasks.transfer?.taskId))) return false;
  const special = game.special;
  if (special.kind === "FINAL_ROLES") {
    if (!uniqueMembers(special.preferences.map(p => p.playerId)) || !uniqueMembers(special.votes.map(p => p.playerId))) return false;
    if (special.proposal && (!players.has(special.proposal.firstFourPlayerId) || !players.has(special.proposal.lastPlayerId) || !players.has(special.proposal.proposerId) || special.proposal.firstFourPlayerId === special.proposal.lastPlayerId)) return false;
  } else if (special.kind !== "NONE") {
    if (!hasPlayer(special.playerId)) return false;
    if (special.kind === "PINK_COLLECTOR" && !players.has(special.initialPinkNineHolderId)) return false;
    if ("responses" in special && !uniqueMembers(special.responses.map(r => r.playerId))) return false;
  }
  if (game.campaign.mode !== game.mode || game.campaign.missionNumber !== game.missionNumber || game.campaign.actualAttempts !== game.attemptNumber || game.campaign.recordedAttempts !== game.campaign.actualAttempts + Number(game.campaign.distressActive) || new Set(game.campaign.completedMissions).size !== game.campaign.completedMissions.length) return false;
  if (game.phase === "FINISHED" && game.activePlayerId !== null) return false;
  if (game.phase === "FINISHED" && (game.result.outcome !== game.missionStatus || (game.result.outcome === "SUCCESS") !== (game.result.reason === "OBJECTIVES_COMPLETE") || game.result.taskIds.some(id => !visible.some(t => t.id === id)))) return false;
  return true;
}
