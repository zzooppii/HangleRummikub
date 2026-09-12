import type { SpaceCrewCampaignAttachment, SpaceCrewCampaignCheckpoint, SpaceCrewCampaignError, SpaceCrewCampaignTransition } from "../domain/campaign.js";

export type SpaceCrewCampaignOperation = "CREATE" | "RESUME" | "BEGIN_ATTEMPT" | "DISTRESS" | "RESULT" | "INTERRUPT" | "RELEASE" | "NEXT_MISSION" | "SELECT_PRACTICE" | "PREPARE_INTERRUPT" | "FINALIZE_INTERRUPT" | "CANCEL_INTERRUPT";
export type SpaceCrewCampaignAuthorization =
  | Readonly<{ kind: "CREATE" | "RECOVER"; recoveryToken: string }>
  | Readonly<{ kind: "LEASE"; processId: string; roomId: string; generation: number }>;
export type SpaceCrewCampaignTransaction = Readonly<{
  campaignId: string; expectedRevision: number | null; requestId: string; fingerprint: string;
  operation: SpaceCrewCampaignOperation; authorization: SpaceCrewCampaignAuthorization;
}>;
export type SpaceCrewCampaignTransactionResult =
  | { ok: true; replayed: boolean; checkpoint: SpaceCrewCampaignCheckpoint; attachment: SpaceCrewCampaignAttachment }
  | { ok: false; reason: SpaceCrewCampaignError };

/** prepare runs once inside the campaign's serialized lane, and must not publish room state. */
export interface SpaceCrewCampaignRepository {
  read(campaignId: string): Promise<SpaceCrewCampaignCheckpoint | null>;
  transact(request: SpaceCrewCampaignTransaction,
    prepare: (current: SpaceCrewCampaignCheckpoint | null) => SpaceCrewCampaignTransition): Promise<SpaceCrewCampaignTransactionResult>;
}
