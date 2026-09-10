import type { CityGameState } from "./game-state.js";

type DraftState = Pick<CityGameState, "roleDraftVersion" | "round" | "window">;

function isCitySecretPairDraft(state: DraftState): boolean {
  return state.roleDraftVersion !== undefined && state.round.eligibleAtSetup.length === 2;
}

export function cityDraftRequiresDiscard(state: DraftState): boolean {
  return state.window?.kind === "ROLE_SELECTION" && isCitySecretPairDraft(state) &&
    (state.roleDraftVersion === "city-draft-v2" || state.round.selectionCursor > 0);
}
