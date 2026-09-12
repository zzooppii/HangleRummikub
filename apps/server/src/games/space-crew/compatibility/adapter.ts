import * as v from "valibot";
import { GameIdSchema, GameRevisionSchema, ServerTimeSchema, TurnIdSchema, type GameId, type GameRevision, type ServerTime, type TurnId } from "@hangul-rummikub/shared";
import { parseSpaceCrewMissionState, type SpaceCrewMissionState } from "../domain/mission.js";
import { SpaceCrewCampaignAttachmentSchema, type SpaceCrewCampaignAttachment } from "../domain/campaign.js";

const StateSchema = v.strictObject({
  revision: v.pipe(v.number(), v.safeInteger(), v.minValue(0)), mode: v.picklist(["CAMPAIGN", "PRACTICE"]),
  attemptId: TurnIdSchema, mission: v.unknown(), cancelled: v.boolean(), campaign: SpaceCrewCampaignAttachmentSchema,
});
const StoredSchema = v.strictObject({
  gameId: GameIdSchema, gameRevision: GameRevisionSchema, startedAt: ServerTimeSchema,
  finishedAt: v.nullable(ServerTimeSchema), state: StateSchema,
});
export type SpaceCrewGameState = Readonly<{
  revision: number; mode: "CAMPAIGN" | "PRACTICE"; attemptId: TurnId;
  mission: SpaceCrewMissionState; cancelled: boolean; campaign: SpaceCrewCampaignAttachment;
}>;
export type SpaceCrewStoredGame = Readonly<{
  gameId: GameId; gameRevision: GameRevision; startedAt: ServerTime; finishedAt: ServerTime | null; state: SpaceCrewGameState;
}>;
export type SpaceCrewLifecycle = Readonly<{ lifecycle: "RUNNING"; gameId: GameId; gameRevision: GameRevision; activeTurn: null }>
  | Readonly<{ lifecycle: "FINISHED"; gameId: GameId; finishedAt: ServerTime }>;

export function spaceCrewGameIsFinished(state: SpaceCrewGameState): boolean {
  return state.cancelled || state.mission.status === "SUCCESS" || state.mission.status === "FAILURE";
}

export class SpaceCrewGameStateAdapter {
  cloneAndValidate(input: SpaceCrewStoredGame): SpaceCrewStoredGame {
    const parsed = v.parse(StoredSchema, input);
    const mission = parseSpaceCrewMissionState(parsed.state.mission);
    const state: SpaceCrewGameState = { ...parsed.state, mission };
    if (parsed.gameRevision !== state.revision || state.revision < mission.revision
      || state.mode !== state.campaign.mode || mission.missionNumber !== state.campaign.missionNumber
      || mission.distress.attemptNumber !== state.campaign.actualAttempts || mission.distress.active !== state.campaign.distressActive
      || spaceCrewGameIsFinished(state) !== (parsed.finishedAt !== null)
      || parsed.finishedAt !== null && parsed.finishedAt < parsed.startedAt) throw new Error("Invalid Space Crew stored metadata.");
    return { ...parsed, state };
  }

  inspectLifecycle(game: SpaceCrewStoredGame): SpaceCrewLifecycle {
    const parsed = this.cloneAndValidate(game);
    if (spaceCrewGameIsFinished(parsed.state)) {
      if (parsed.finishedAt === null) throw new Error("Missing Space Crew finish time.");
      return { lifecycle: "FINISHED", gameId: parsed.gameId, finishedAt: parsed.finishedAt };
    }
    return { lifecycle: "RUNNING", gameId: parsed.gameId, gameRevision: parsed.gameRevision, activeTurn: null };
  }
}
