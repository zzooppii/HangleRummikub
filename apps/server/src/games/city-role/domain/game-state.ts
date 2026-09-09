import type { CityBuildingCard } from "./cardset-v1.js";
import type { BuildingCardId, CityActionId, CityGameId, CityPlayerId } from "./identity.js";
import type { CityRoleId } from "./role.js";
import type { CityLandmarkHistory } from "./landmarks-v2.js";

export type CityPlayerState = Readonly<{
  playerId: CityPlayerId;
  gold: number;
  hand: readonly BuildingCardId[];
  city: readonly BuildingCardId[];
  forfeited: boolean;
  offlineTimeoutStreak: number;
}>;

// Ownership stays in this partition even after resolution or forfeiture.
// Visibility is recorded independently, never inferred from ownership alone.
export type CityRoleAssignment = Readonly<{
  roleId: CityRoleId;
  playerId: CityPlayerId;
  status: "SELECTED" | "ACTIVE" | "RESOLVED" | "DISABLED" | "TOMBSTONED";
  revealed: boolean;
}>;

export type CityRound = Readonly<{
  roundNumber: number;
  draftLeaderPlayerId: CityPlayerId;
  eligibleAtSetup: readonly CityPlayerId[];
  rolesPerPlayer: 1 | 2;
  pickQueue: readonly CityPlayerId[];
  selectionCursor: number;
  available: readonly CityRoleId[];
  publicRemoved: readonly CityRoleId[];
  hiddenRemoved: readonly CityRoleId[];
  unselected: readonly CityRoleId[];
  assignments: readonly CityRoleAssignment[];
  resolutionCursor: number;
  protectedPlayerIds: readonly CityPlayerId[];
  ended: boolean;
}>;

export type CityMark = Readonly<{
  kind: "DISABLE" | "GOLD_TRANSFER";
  sourcePlayerId: CityPlayerId;
  targetRoleId: CityRoleId;
  status: "UNRESOLVED" | "RESOLVED" | "CANCELLED";
}>;

// Only disclosures permitted by the rules. Unselected/removed/private targets
// never enter this history; normal round-end disclosures survive atomic setup.
export type CityRoleReveal = Readonly<{
  roundNumber: number;
  roleId: CityRoleId;
  playerId: CityPlayerId;
  kind: "NORMAL" | "DISABLED";
}>;

export type CityPendingChoice = Readonly<{
  kind: "DRAW_BUILDING";
  ownerPlayerId: CityPlayerId;
  actionId: CityActionId;
  roleId: CityRoleId;
  cards: readonly BuildingCardId[];
}>;

export type CitySelectionWindow = Readonly<{
  kind: "ROLE_SELECTION";
  actionId: CityActionId;
  activePlayerId: CityPlayerId;
}>;
export type CityActionWindow = Readonly<{
  kind: "ROLE_ACTION";
  actionId: CityActionId;
  activePlayerId: CityPlayerId;
  activeRoleId: CityRoleId;
  acquisition: "NOT_TAKEN" | "PENDING" | "COMPLETE";
  abilityUsed: boolean;
  buildingsBuilt: number;
}>;
export type CityWindow = CitySelectionWindow | CityActionWindow;

export type CityFinishReason = "CITY_COMPLETION_ROUND_END" | "LAST_PLAYER_STANDING" | "NO_ELIGIBLE_PLAYERS";
export type CityRanking = Readonly<{
  playerId: CityPlayerId;
  rank: number;
  score: number;
  buildingVP: number;
  completionBonus: number;
  diversityBonus: number;
  landmarkBonus?: number;
  buildingCount: number;
  forfeited: boolean;
  winner: boolean;
}>;
export type CityGameResult = Readonly<{
  reason: CityFinishReason;
  rankings: readonly CityRanking[];
}>;

type CityStateBase = Readonly<{
  gameId: CityGameId;
  rulesVersion: "city-rules-v1" | "city-rules-v2";
  cardSetVersion: "city-cardset-v1" | "city-cardset-v2";
  // Required exclusively for v2 by the strict state validator. Never synthesized on restore.
  landmarkHistory?: readonly CityLandmarkHistory[];
  roleSetVersion: "city-roles-v1";
  cards: readonly CityBuildingCard[];
  players: readonly CityPlayerState[];
  seatOrder: readonly CityPlayerId[];
  leaderPlayerId: CityPlayerId;
  deck: readonly BuildingCardId[];
  discard: readonly BuildingCardId[];
  round: CityRound;
  marks: readonly CityMark[];
  revealedRoles: readonly CityRoleReveal[];
  pendingChoice: CityPendingChoice | null;
  firstCompletion: Readonly<{ playerId: CityPlayerId; roundNumber: number }> | null;
}>;
export type PlayingCityGameState = CityStateBase & Readonly<{ window: CityWindow; result: null }>;
export type FinishedCityGameState = CityStateBase & Readonly<{ window: null; result: CityGameResult }>;
export type CityGameState = PlayingCityGameState | FinishedCityGameState;

export function cloneCityGameState(state: CityGameState): CityGameState {
  const base = {
    ...state,
    ...(state.landmarkHistory === undefined ? {} : { landmarkHistory: Object.freeze(state.landmarkHistory.map(row => Object.freeze({ ...row }))) }),
    cards: Object.freeze(state.cards.map(card => Object.freeze({ ...card }))),
    players: Object.freeze(state.players.map(player => Object.freeze({ ...player,
      hand: Object.freeze([...player.hand]), city: Object.freeze([...player.city]),
    }))),
    seatOrder: Object.freeze([...state.seatOrder]),
    deck: Object.freeze([...state.deck]), discard: Object.freeze([...state.discard]),
    round: Object.freeze({ ...state.round,
      eligibleAtSetup: Object.freeze([...state.round.eligibleAtSetup]),
      pickQueue: Object.freeze([...state.round.pickQueue]),
      available: Object.freeze([...state.round.available]),
      publicRemoved: Object.freeze([...state.round.publicRemoved]),
      hiddenRemoved: Object.freeze([...state.round.hiddenRemoved]),
      unselected: Object.freeze([...state.round.unselected]),
      assignments: Object.freeze(state.round.assignments.map(item => Object.freeze({ ...item }))),
      protectedPlayerIds: Object.freeze([...state.round.protectedPlayerIds]),
    }),
    marks: Object.freeze(state.marks.map(mark => Object.freeze({ ...mark }))),
    revealedRoles: Object.freeze(state.revealedRoles.map(reveal => Object.freeze({ ...reveal }))),
    pendingChoice: state.pendingChoice === null ? null : Object.freeze({ ...state.pendingChoice,
      cards: Object.freeze([...state.pendingChoice.cards]),
    }),
    firstCompletion: state.firstCompletion === null ? null : Object.freeze({ ...state.firstCompletion }),
  };
  if (state.result !== null) return Object.freeze({ ...base, window: null,
    result: Object.freeze({ ...state.result, rankings: Object.freeze(state.result.rankings.map(row => Object.freeze({ ...row }))) }),
  });
  const window = Object.freeze({ ...state.window });
  return Object.freeze({ ...base, window, result: null });
}
