import { CityExpansionSettingsSchema } from "./expansion-contracts.js";
import { CITY_SPECIAL_BUILDINGS } from "./expansion-catalog.js";
import * as v from "valibot";
import { GameIdSchema, PlayerIdSchema } from "../../identifiers.js";
import { GameRevisionSchema, ServerTimeSchema } from "../../protocol.js";
import { CityActionIdSchema, CityFinishReasonSchema, CityPublicBuildingSchema, CityRoleIdSchema } from "./contracts.js";

const Natural = v.pipe(v.number(), v.integer(), v.safeInteger(), v.minValue(0));
const Positive = v.pipe(Natural, v.minValue(1));
const Cards = v.pipe(v.array(CityPublicBuildingSchema), v.maxLength(68));
const Roles = v.pipe(v.array(CityRoleIdSchema), v.maxLength(9), v.check(ids => new Set(ids).size === ids.length));
const PlayerIds = v.pipe(v.array(PlayerIdSchema), v.minLength(2), v.maxLength(6), v.check(ids => new Set(ids).size === ids.length));
const PrivateBase = {
  expansion: v.optional(v.strictObject({ incomeUsed: v.boolean(), usedSpecials: v.array(v.string()), inspectedCards: Cards, choiceCards: Cards, recipients: v.array(PlayerIdSchema), realWarrant: v.optional(CityRoleIdSchema), realThreat: v.optional(CityRoleIdSchema) })),
  hand: Cards,
  selectedRoleIds: v.pipe(Roles, v.maxLength(2)),
  marks: v.pipe(v.array(v.strictObject({ kind: v.picklist(["DISABLE", "GOLD_TRANSFER"]), targetRoleId: CityRoleIdSchema, status: v.picklist(["UNRESOLVED", "RESOLVED", "CANCELLED"]) })), v.maxLength(2)),
};
const PendingCards = v.pipe(Cards, v.minLength(1), v.maxLength(3));
const ActionBudget = v.strictObject({ acquisition: v.picklist(["NOT_TAKEN", "PENDING", "COMPLETE"]), abilityUsed: v.boolean(), buildingsBuilt: v.pipe(Natural, v.maxValue(68)) });
const Common = {
  expansion: v.optional(v.strictObject({ settings: CityExpansionSettingsSchema,
    specialIds: v.pipe(v.array(v.picklist(CITY_SPECIAL_BUILDINGS.map(b => b.templateId))), v.length(14), v.check(ids => new Set(ids).size === 14)),
    tax: Natural, decorated: v.array(v.string()), museum: v.array(v.strictObject({ buildingId: v.string(), count: Natural })),
    disabledRole: v.nullable(CityRoleIdSchema), robbedRole: v.nullable(CityRoleIdSchema), warrants: Roles, threats: Roles, witchTarget: v.nullable(CityRoleIdSchema),
    pending: v.nullable(v.picklist(['WIZARD','SEER','SCHOLAR','THEATER','BRIBE','BLACKMAIL','CONFISCATE','EMPEROR'])),
    vaultOwners: v.array(PlayerIdSchema),
  })),
  gameType: v.literal("CITY_ROLE"), gameId: GameIdSchema, gameRevision: GameRevisionSchema,
  roleDraftVersion: v.optional(v.picklist(["city-draft-v2", "city-draft-v3"])),
  secretPairDraft: v.optional(v.boolean()),
  draftDiscardRequired: v.optional(v.boolean()),
  rulesVersion: v.picklist(["city-rules-v1", "city-rules-v2", "city-rules-v3"]), cardSetVersion: v.picklist(["city-cardset-v1", "city-cardset-v2", "city-cardset-v3"]), roleSetVersion: v.picklist(["city-roles-v1", "city-roles-v2"]),
  landmarkHistory: v.optional(v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema,
    gardenUsed: v.boolean(), sundialUsed: v.boolean(), staircaseInitialized: v.boolean(),
    staircaseRemaining: v.pipe(Natural, v.maxValue(3)), staircaseSpent: v.pipe(Natural, v.maxValue(3)),
    lastDiscountRound: v.nullable(Positive) })), v.minLength(2), v.maxLength(6))),
  roundNumber: Positive, seatOrder: PlayerIds, leaderPlayerId: PlayerIdSchema, rolesPerPlayer: v.picklist([1, 2]),
  playerStates: v.pipe(v.array(v.strictObject({ playerId: PlayerIdSchema, gold: Natural,
    handCount: v.pipe(Natural, v.maxValue(68)), builtBuildings: Cards, scorePreview: Natural, forfeited: v.boolean() })), v.minLength(2), v.maxLength(6)),
  publicRemovedRoleIds: Roles,
  revealedRoles: v.array(v.strictObject({ roundNumber: Positive, roleId: CityRoleIdSchema, playerId: PlayerIdSchema, kind: v.picklist(["NORMAL", "DISABLED"]) })),
  protectedPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(1)),
  firstCompletion: v.nullable(v.strictObject({ playerId: PlayerIdSchema, roundNumber: Positive })),
};
const Window = { actionId: CityActionIdSchema, activePlayerId: PlayerIdSchema, startedAt: ServerTimeSchema, deadlineAt: ServerTimeSchema };
const SelectionObject = v.strictObject({ ...Common, phase: v.literal("ROLE_SELECTION"),
  selectionOrder: v.optional(v.strictObject({ playerIds: v.pipe(v.array(PlayerIdSchema), v.minLength(2), v.maxLength(6)), currentIndex: v.pipe(Natural, v.maxValue(5)) })),
  window: v.strictObject({ ...Window }),
  privateState: v.strictObject({ ...PrivateBase, availableRoleIds: v.optional(Roles) }),
});
const ActionObject = v.strictObject({ ...Common, phase: v.literal("ROLE_ACTION"),
  window: v.strictObject({ ...Window, activeRoleId: CityRoleIdSchema, waitingFor: v.picklist(["ACTION", "DRAW_BUILDING_CHOICE"]) }),
  privateState: v.strictObject({ ...PrivateBase, action: v.optional(ActionBudget), pendingCards: v.optional(PendingCards) }),
});
const Ranking = v.pipe(v.strictObject({ playerId: PlayerIdSchema, rank: v.pipe(Positive, v.maxValue(6)),
  score: Natural, buildingVP: Natural, completionBonus: v.picklist([0, 2, 4]), diversityBonus: v.picklist([0, 3]),
  landmarkBonus: v.optional(Natural),
  specialBonusBreakdown: v.optional(v.pipe(v.array(v.strictObject({
    templateId: v.picklist(['CB-SP-02','CB-SP-03','CB-SP-04','CB-SP-10','CB-SP-11','CB-SP-15','CB-SP-17','CB-SP-24','CB-SP-27','CB-SP-30']), points: Positive,
  })), v.maxLength(10), v.check(rows => new Set(rows.map(row => row.templateId)).size === rows.length))),
  buildingCount: v.pipe(Natural, v.maxValue(68)), forfeited: v.boolean(), winner: v.boolean() }),
  v.check(row => row.specialBonusBreakdown === undefined || row.landmarkBonus !== undefined && row.specialBonusBreakdown.reduce((sum, item) => sum + item.points, 0) === row.landmarkBonus && (!row.forfeited || row.specialBonusBreakdown.length === 0), 'CITY special bonus breakdown is inconsistent.'));
export const CityRoleResultV2Schema = v.strictObject({ reason: CityFinishReasonSchema, finishedAt: ServerTimeSchema,
  rankings: v.pipe(v.array(Ranking), v.minLength(2), v.maxLength(6)), winnerPlayerIds: v.pipe(v.array(PlayerIdSchema), v.maxLength(6)) });
const FinishedObject = v.strictObject({ ...Common, phase: v.literal("FINISHED"),
  privateState: v.strictObject({ ...PrivateBase, pendingCards: v.optional(PendingCards) }), result: CityRoleResultV2Schema });

type VisibleCity = v.InferOutput<typeof SelectionObject> | v.InferOutput<typeof ActionObject> | v.InferOutput<typeof FinishedObject>;
function coherent(game: VisibleCity): boolean {
  if (game.phase === "ROLE_SELECTION" && game.selectionOrder) {
    const { playerIds, currentIndex } = game.selectionOrder;
    if (playerIds[currentIndex] !== game.window.activePlayerId || !playerIds.every(id => game.seatOrder.includes(id))) return false;
    if (playerIds.some(id => playerIds.filter(candidate => candidate === id).length !== game.rolesPerPlayer)) return false;
  }
  if ((game.roleDraftVersion !== undefined) !== (game.secretPairDraft !== undefined)) return false;
  if (game.secretPairDraft && (game.rolesPerPlayer !== 2 || game.publicRemovedRoleIds.length !== 0)) return false;
  if ((game.roleDraftVersion === "city-draft-v3") !== (game.draftDiscardRequired !== undefined)) return false;
  if (game.draftDiscardRequired && (!game.secretPairDraft || game.phase !== "ROLE_SELECTION")) return false;
  if (game.rulesVersion === 'city-rules-v3') {
    if (!game.expansion || !game.privateState.expansion || game.cardSetVersion !== 'city-cardset-v3' || game.roleSetVersion !== 'city-roles-v2' || game.landmarkHistory !== undefined) return false;
    const ids = game.playerStates.map(p => p.playerId);
    const visible = [...game.privateState.hand, ...game.playerStates.flatMap(p => p.builtBuildings), ...('pendingCards' in game.privateState ? game.privateState.pendingCards ?? [] : [])];
    if (new Set(ids).size !== ids.length || game.seatOrder.length !== ids.length || !game.seatOrder.every(id => ids.includes(id)) || !ids.includes(game.leaderPlayerId)) return false;
    if (new Set(visible.map(c => c.cardId)).size !== visible.length || visible.length > 68 || game.playerStates.some(p => p.forfeited && (p.gold !== 0 || p.handCount !== 0))) return false;
    if (game.playerStates.some(p => p.scorePreview !== p.builtBuildings.reduce((sum,c) => sum + c.victoryPoints,0))) return false;
    return game.phase === 'FINISHED' || game.playerStates.some(p => p.playerId === game.window.activePlayerId && !p.forfeited) && game.window.deadlineAt - game.window.startedAt === (game.phase === 'ROLE_SELECTION' ? (game.expansion.settings.selectionSeconds ?? 45) * 1000 : 90000);
  }
  if (game.expansion !== undefined || game.privateState.expansion !== undefined || game.roleSetVersion !== 'city-roles-v1' || game.privateState.hand.some(c => c.cost < 1 || c.cost > 6 || c.templateId.startsWith('CB-SP-'))) return false;
  const v2 = game.rulesVersion === "city-rules-v2";
  if (game.cardSetVersion !== (v2 ? "city-cardset-v2" : "city-cardset-v1") || (game.landmarkHistory !== undefined) !== v2) return false;
  if (game.landmarkHistory !== undefined) {
    if (game.landmarkHistory.length !== game.playerStates.length || !game.landmarkHistory.every((row, index) => row.playerId === game.playerStates[index]?.playerId)) return false;
    for (const row of game.landmarkHistory) {
      const owner = game.playerStates.find(player => player.playerId === row.playerId);
      if (owner === undefined) return false;
      const has = (id: string) => owner.builtBuildings.some(card => card.templateId === id);
      if (has("CB-LAN-01") && !row.gardenUsed || has("CB-LAN-02") && !row.sundialUsed || has("CB-LAN-04") && !row.staircaseInitialized) return false;
      if (!row.staircaseInitialized && (row.staircaseRemaining !== 0 || row.staircaseSpent !== 0 || row.lastDiscountRound !== null)) return false;
      if (row.staircaseRemaining + row.staircaseSpent > 3 || (row.staircaseSpent === 0) !== (row.lastDiscountRound === null) ||
        row.lastDiscountRound !== null && (row.lastDiscountRound > game.roundNumber || row.staircaseSpent > row.lastDiscountRound)) return false;
      if (row.staircaseRemaining > 0 && (!has("CB-LAN-04") || owner.forfeited)) return false;
    }
  }
  const ids = game.playerStates.map(player => player.playerId);
  if (new Set(ids).size !== ids.length || ids.length !== game.seatOrder.length || !game.seatOrder.every(id => ids.includes(id)) || !ids.includes(game.leaderPlayerId)) return false;
  const eligible = game.playerStates.filter(player => !player.forfeited);
  if (eligible.length > 0 && !eligible.some(player => player.playerId === game.leaderPlayerId)) return false;
  const pending = "pendingCards" in game.privateState ? game.privateState.pendingCards ?? [] : [];
  const visibleCards = [...game.playerStates.flatMap(player => player.builtBuildings), ...game.privateState.hand, ...pending];
  const legacyRoles = [...game.publicRemovedRoleIds, ...game.revealedRoles.map(r => r.roleId), ...game.privateState.selectedRoleIds, ...game.privateState.marks.map(m => m.targetRoleId), ...(game.phase === "ROLE_SELECTION" ? game.privateState.availableRoleIds ?? [] : game.phase === "ROLE_ACTION" ? [game.window.activeRoleId] : [])];
  if (legacyRoles.includes("CR-09") || pending.length > 2 || visibleCards.some(c => c.cost < 1 || c.cost > 6 || c.templateId.startsWith("CB-SP-"))) return false;
  const cardLimit = v2 ? 66 : 60;
  if (game.playerStates.some(player => player.handCount > cardLimit) || visibleCards.length > cardLimit || new Set(visibleCards.map(card => card.cardId)).size !== visibleCards.length) return false;
  if (!game.playerStates.every(player => new Set(player.builtBuildings.map(card => card.templateId)).size === player.builtBuildings.length &&
    player.scorePreview === player.builtBuildings.reduce((score, card) => score + card.victoryPoints, 0) && (!player.forfeited || player.gold === 0 && player.handCount === 0))) return false;
  if (game.privateState.selectedRoleIds.length > game.rolesPerPlayer || game.publicRemovedRoleIds.some(role => game.privateState.selectedRoleIds.includes(role))) return false;
  if (new Set(game.privateState.marks.map(mark => mark.kind)).size !== game.privateState.marks.length) return false;
  if (game.firstCompletion !== null && (!ids.includes(game.firstCompletion.playerId) || game.firstCompletion.roundNumber > game.roundNumber)) return false;
  if (!game.protectedPlayerIds.every(id => eligible.some(player => player.playerId === id))) return false;
  if (new Set(game.revealedRoles.map(role => `${role.roundNumber}:${role.roleId}`)).size !== game.revealedRoles.length || !game.revealedRoles.every(role => ids.includes(role.playerId) && role.roundNumber <= game.roundNumber)) return false;
  if (game.phase === "FINISHED") return true;
  if (eligible.length < 2 || !eligible.some(player => player.playerId === game.window.activePlayerId)) return false;
  if (game.window.deadlineAt - game.window.startedAt !== (game.phase === "ROLE_SELECTION" ? 45000 : 90000)) return false;
  if (game.phase === "ROLE_SELECTION") return game.firstCompletion === null && game.privateState.marks.length === 0 &&
    (game.privateState.availableRoleIds === undefined || game.privateState.availableRoleIds.length > 0 && game.privateState.availableRoleIds.every(role => !game.privateState.selectedRoleIds.includes(role) && !game.publicRemovedRoleIds.includes(role)));
  if (!game.revealedRoles.some(role => role.roundNumber === game.roundNumber && role.roleId === game.window.activeRoleId && role.playerId === game.window.activePlayerId && role.kind === "NORMAL")) return false;
  const action = game.privateState.action;
  return action === undefined || action.buildingsBuilt <= (game.window.activeRoleId === "CR-07" ? 3 : 1) &&
    (action.acquisition === "COMPLETE" || !action.abilityUsed && action.buildingsBuilt === 0) &&
    (action.acquisition === "PENDING") === (game.window.waitingFor === "DRAW_BUILDING_CHOICE");
}
export const CityRoleSelectionProjectionV2Schema = v.pipe(SelectionObject, v.check(game => coherent(game), "CITY selection projection is inconsistent."));
export const CityRoleActionProjectionV2Schema = v.pipe(ActionObject, v.check(game => coherent(game), "CITY action projection is inconsistent."));
export const CityRolePlayingProjectionV2Schema = v.union([CityRoleSelectionProjectionV2Schema, CityRoleActionProjectionV2Schema]);
export const CityRoleFinishedProjectionV2Schema = v.pipe(FinishedObject, v.check(game => coherent(game), "CITY finished projection is inconsistent."), v.check(game => {
  const { rankings, reason, winnerPlayerIds } = game.result;
  if (rankings.length !== game.playerStates.length || new Set(rankings.map(row => row.playerId)).size !== rankings.length) return false;
  if (game.rulesVersion === 'city-rules-v3') {
    if (!rankings.every((row, i) => { const p = game.playerStates.find(p => p.playerId === row.playerId), prior = rankings[i-1];
      return p !== undefined && row.buildingVP === p.scorePreview && row.buildingCount === p.builtBuildings.length && row.forfeited === p.forfeited && row.landmarkBonus !== undefined && row.score === row.buildingVP + row.completionBonus + row.diversityBonus + row.landmarkBonus && row.rank === (prior && prior.forfeited === row.forfeited && prior.score === row.score ? prior.rank : i + 1) && row.winner === (!row.forfeited && row.rank === 1);
    })) return false;
    return JSON.stringify(winnerPlayerIds) === JSON.stringify(rankings.filter(r => r.winner).map(r => r.playerId));
  }
  if (!rankings.every(row => {
    const player = game.playerStates.find(entry => entry.playerId === row.playerId);
    if (player === undefined) return false;
    const complete = player.forfeited ? 0 : game.firstCompletion?.playerId === player.playerId ? 4 : player.builtBuildings.length >= 8 ? 2 : 0;
    const categories = new Set(player.builtBuildings.map(card => card.category));
    const ordinary = [...categories].filter(category => category !== "LANDMARK").length;
    const v2 = game.rulesVersion === "city-rules-v2";
    const has = (id: string) => player.builtBuildings.some(card => card.templateId === id);
    const diversity = !player.forfeited && (categories.size === 5 || v2 && has("CB-LAN-05") && ordinary === 3) ? 3 : 0;
    const landmark = v2 && !player.forfeited && has("CB-LAN-06") ? ordinary : 0;
    return (row.landmarkBonus !== undefined) === v2 && (row.landmarkBonus ?? 0) === landmark &&
      row.buildingVP === player.scorePreview && row.buildingCount === player.builtBuildings.length && row.forfeited === player.forfeited && row.completionBonus === complete && row.diversityBonus === diversity && row.score === row.buildingVP + complete + diversity + landmark;
  })) return false;
  if (!rankings.every((row, i) => {
    const prior = rankings[i - 1];
    return (prior === undefined || Number(prior.forfeited) <= Number(row.forfeited) && (prior.forfeited !== row.forfeited || prior.score >= row.score)) &&
      row.rank === (prior !== undefined && prior.forfeited === row.forfeited && prior.score === row.score ? prior.rank : i + 1) && row.winner === (!row.forfeited && row.rank === 1);
  })) return false;
  const winners = rankings.filter(row => row.winner).map(row => row.playerId), eligible = rankings.filter(row => !row.forfeited).length;
  return winners.length === winnerPlayerIds.length && winners.every((id, index) => id === winnerPlayerIds[index]) &&
    (reason === "LAST_PLAYER_STANDING" ? eligible === 1 : reason === "NO_ELIGIBLE_PLAYERS" ? eligible === 0 : eligible >= 2 && game.firstCompletion !== null);
}, "CITY ranking is inconsistent."));
export type CityRoleSelectionProjectionV2 = v.InferOutput<typeof CityRoleSelectionProjectionV2Schema>;
export type CityRoleActionProjectionV2 = v.InferOutput<typeof CityRoleActionProjectionV2Schema>;
export type CityRolePlayingProjectionV2 = v.InferOutput<typeof CityRolePlayingProjectionV2Schema>;
export type CityRoleFinishedProjectionV2 = v.InferOutput<typeof CityRoleFinishedProjectionV2Schema>;

/** Viewer correlation only: hidden canonical role/card partitions stay server-owned. */
export function cityPrivateStateMatchesViewer(game: CityRolePlayingProjectionV2 | CityRoleFinishedProjectionV2, selfPlayerId: string): boolean {
  const self = game.playerStates.find(player => player.playerId === selfPlayerId);
  if (self === undefined || self.handCount !== game.privateState.hand.length) return false;
  if (game.revealedRoles.some(role => role.roundNumber === game.roundNumber && game.privateState.selectedRoleIds.includes(role.roleId) && role.playerId !== selfPlayerId)) return false;
  if (game.phase === "ROLE_SELECTION") return (game.privateState.availableRoleIds !== undefined) === (game.window.activePlayerId === selfPlayerId);
  if (game.phase === "FINISHED") return game.privateState.pendingCards === undefined || game.result.reason === "LAST_PLAYER_STANDING" && !self.forfeited;
  const activeSelf = game.window.activePlayerId === selfPlayerId;
  return (game.privateState.action !== undefined) === activeSelf && (game.privateState.pendingCards !== undefined) === (activeSelf && game.window.waitingFor === "DRAW_BUILDING_CHOICE");
}
