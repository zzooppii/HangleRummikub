import { assertExpandedCanonical } from "./expansion-validator.js";
import { CityExpansionStateSchema } from "./expansion-state.js";
import { CITY_SPECIAL_BUILDINGS } from "./expansion-catalog.js";
import { validateCityGameCards } from "./cardset-v2.js";
import * as v from "valibot";

import { CITY_BUILDING_TEMPLATES } from "./cardset-v1.js";
import type { CityGameState } from "./game-state.js";
import { BuildingCardIdSchema, CityActionIdSchema, CityGameIdSchema, CityPlayerIdSchema } from "./identity.js";
import { calculateCityResult } from "./result-engine.js";
import { CITY_ROLE_IDS, CITY_ALL_ROLE_IDS, cityRoleOrder } from "./role.js";

const Natural = v.pipe(v.number(), v.integer(), v.safeInteger(), v.minValue(0));
const Positive = v.pipe(Natural, v.minValue(1));
const RoleId = v.picklist(CITY_ALL_ROLE_IDS);
const RoleIds = v.array(RoleId);
const PlayerIds = v.array(CityPlayerIdSchema);
const CardIds = v.array(BuildingCardIdSchema);
const Assignment = v.strictObject({ roleId: RoleId, playerId: CityPlayerIdSchema,
  status: v.picklist(["SELECTED", "ACTIVE", "RESOLVED", "DISABLED", "TOMBSTONED"]), revealed: v.boolean() });
const Pending = v.strictObject({ kind: v.literal("DRAW_BUILDING"), ownerPlayerId: CityPlayerIdSchema,
  actionId: CityActionIdSchema, roleId: RoleId, cards: v.pipe(CardIds, v.minLength(1), v.maxLength(3)) });
const Window = v.variant("kind", [
  v.strictObject({ kind: v.literal("ROLE_SELECTION"), actionId: CityActionIdSchema, activePlayerId: CityPlayerIdSchema }),
  v.strictObject({ kind: v.literal("ROLE_ACTION"), actionId: CityActionIdSchema, activePlayerId: CityPlayerIdSchema,
    activeRoleId: RoleId, acquisition: v.picklist(["NOT_TAKEN", "PENDING", "COMPLETE"]),
    abilityUsed: v.boolean(), buildingsBuilt: Natural }),
]);
const Result = v.strictObject({ reason: v.picklist(["CITY_COMPLETION_ROUND_END", "LAST_PLAYER_STANDING", "NO_ELIGIBLE_PLAYERS"]),
  rankings: v.array(v.strictObject({ playerId: CityPlayerIdSchema, rank: Positive, score: Natural,
    buildingVP: Natural, completionBonus: Natural, diversityBonus: Natural, landmarkBonus: v.exactOptional(Natural), buildingCount: Natural,
    forfeited: v.boolean(), winner: v.boolean() })) });
const Base = {
  gameId: CityGameIdSchema, rulesVersion: v.picklist(["city-rules-v1", "city-rules-v2", "city-rules-v3"]), cardSetVersion: v.picklist(["city-cardset-v1", "city-cardset-v2", "city-cardset-v3"]), roleSetVersion: v.picklist(["city-roles-v1", "city-roles-v2"]), expansion: v.exactOptional(CityExpansionStateSchema),
  roleDraftVersion: v.exactOptional(v.literal("city-draft-v2")),
  landmarkHistory: v.exactOptional(v.array(v.strictObject({ playerId: CityPlayerIdSchema,
    gardenUsed: v.boolean(), sundialUsed: v.boolean(), staircaseInitialized: v.boolean(),
    staircaseRemaining: v.pipe(Natural, v.maxValue(3)), staircaseSpent: v.pipe(Natural, v.maxValue(3)),
    lastDiscountRound: v.nullable(Positive) }))),
  cards: v.array(v.strictObject({ cardId: BuildingCardIdSchema, templateId: v.picklist([...CITY_BUILDING_TEMPLATES, ...CITY_SPECIAL_BUILDINGS].map(template => template.templateId)) })),
  players: v.pipe(v.array(v.strictObject({ playerId: CityPlayerIdSchema, gold: Natural, hand: CardIds,
    city: CardIds, forfeited: v.boolean(), offlineTimeoutStreak: v.pipe(Natural, v.maxValue(3)) })), v.minLength(2), v.maxLength(6)),
  seatOrder: PlayerIds, leaderPlayerId: CityPlayerIdSchema, deck: CardIds, discard: CardIds,
  round: v.strictObject({ roundNumber: Positive, draftLeaderPlayerId: CityPlayerIdSchema,
    eligibleAtSetup: v.pipe(PlayerIds, v.minLength(2), v.maxLength(6)), rolesPerPlayer: v.picklist([1, 2]),
    pickQueue: PlayerIds, selectionCursor: Natural, available: RoleIds, publicRemoved: RoleIds,
    hiddenRemoved: RoleIds, unselected: RoleIds, assignments: v.array(Assignment),
    resolutionCursor: v.pipe(Natural, v.maxValue(9)), protectedPlayerIds: PlayerIds, ended: v.boolean() }),
  marks: v.array(v.strictObject({ kind: v.picklist(["DISABLE", "GOLD_TRANSFER"]), sourcePlayerId: CityPlayerIdSchema,
    targetRoleId: RoleId, status: v.picklist(["UNRESOLVED", "RESOLVED", "CANCELLED"]) })),
  pendingChoice: v.nullable(Pending),
  revealedRoles: v.array(v.strictObject({ roundNumber: Positive, roleId: RoleId, playerId: CityPlayerIdSchema,
    kind: v.picklist(["NORMAL", "DISABLED"]) })),
  firstCompletion: v.nullable(v.strictObject({ playerId: CityPlayerIdSchema, roundNumber: Positive })),
};
const State = v.union([
  v.strictObject({ ...Base, window: Window, result: v.null() }),
  v.strictObject({ ...Base, window: v.null(), result: Result }),
]);

function requireCity(condition: boolean, reason: string): asserts condition {
  if (!condition) throw new Error(`CITY state invalid: ${reason}.`);
}
function sameSequence(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

/** Validates full canonical truth without projecting secrets or mutating the input. */
export function assertCityGameState(state: unknown): asserts state is CityGameState {
  const game: CityGameState = v.parse(State, state);
  if (game.rulesVersion === "city-rules-v3") { assertExpandedCanonical(game); return; }
  requireCity(game.expansion === undefined && game.roleSetVersion === "city-roles-v1" && (game.pendingChoice?.cards.length ?? 0) <= 2, "legacy version bounds");
  const cards = validateCityGameCards(game.cards, game.rulesVersion);
  const playerIds = game.players.map(player => player.playerId);
  const eligible = game.players.filter(player => !player.forfeited);
  const player = (id: string) => game.players.find(candidate => candidate.playerId === id);
  const { round } = game;
  const v2 = game.rulesVersion === "city-rules-v2";
  requireCity(game.cardSetVersion === (v2 ? "city-cardset-v2" : "city-cardset-v1") &&
    (game.landmarkHistory !== undefined) === v2, "exact rules/cardset/history version correlation");
  if (game.landmarkHistory !== undefined) {
    requireCity(sameSequence(game.landmarkHistory.map(row => row.playerId), playerIds), "landmark history roster/order");
    for (const row of game.landmarkHistory) {
      const owner = player(row.playerId)!;
      const has = (id: string) => owner.city.some(cardId => cards.find(card => card.cardId === cardId)?.templateId === id);
      requireCity(!has("CB-LAN-01") || row.gardenUsed, "garden first build history");
      requireCity(!has("CB-LAN-02") || row.sundialUsed, "sundial first build history");
      requireCity(!has("CB-LAN-04") || row.staircaseInitialized, "staircase first build history");
      requireCity(row.staircaseInitialized || row.staircaseRemaining === 0 && row.staircaseSpent === 0 && row.lastDiscountRound === null, "uninitialized staircase budget");
      requireCity(row.staircaseRemaining + row.staircaseSpent <= 3 &&
        (row.staircaseSpent === 0) === (row.lastDiscountRound === null) &&
        (row.lastDiscountRound === null || row.lastDiscountRound <= round.roundNumber && row.staircaseSpent <= row.lastDiscountRound), "staircase lifetime/round budget");
      requireCity(row.staircaseRemaining === 0 || has("CB-LAN-04") && !owner.forfeited, "destroy/forfeit burns remaining discounts");
    }
  }
  requireCity(game.result === null || game.result.rankings.every(row => (row.landmarkBonus !== undefined) === v2), "versioned landmark scoring");
  requireCity(new Set(playerIds).size === playerIds.length && new Set(game.seatOrder).size === playerIds.length &&
    game.seatOrder.length === playerIds.length && playerIds.every(id => game.seatOrder.includes(id)), "participant roster");
  requireCity(player(game.leaderPlayerId) !== undefined && (eligible.length === 0 || player(game.leaderPlayerId)?.forfeited === false), "leader eligibility");
  for (const entry of game.players) {
    requireCity(!entry.forfeited || entry.gold === 0 && entry.hand.length === 0, "forfeit assets must be cleared");
    requireCity(game.result !== null || entry.forfeited || entry.offlineTimeoutStreak < 3, "third offline timeout must forfeit atomically");
    const templates = entry.city.map(id => cards.find(card => card.cardId === id)?.templateId);
    requireCity(templates.every(template => template !== undefined) && new Set(templates).size === templates.length, "city physical identities and unique templates");
  }
  const pendingCards = game.pendingChoice?.cards ?? [];
  const zones = [...game.deck, ...game.discard, ...game.players.flatMap(entry => [...entry.hand, ...entry.city]), ...pendingCards];
  requireCity(zones.length === cards.length && new Set(zones).size === cards.length && cards.every(card => zones.includes(card.cardId)), "complete card inventory zone conservation");

  requireCity(new Set(round.eligibleAtSetup).size === round.eligibleAtSetup.length && round.eligibleAtSetup.every(id => player(id) !== undefined) &&
    eligible.every(entry => round.eligibleAtSetup.includes(entry.playerId)) && round.eligibleAtSetup.includes(round.draftLeaderPlayerId), "round setup roster");
  const quota = round.eligibleAtSetup.length <= 3 ? 2 : 1;
  requireCity(round.rolesPerPlayer === quota, "round role quota");
  const seats = game.seatOrder.filter(id => round.eligibleAtSetup.includes(id));
  const leaderIndex = seats.indexOf(round.draftLeaderPlayerId);
  const rotated = [...seats.slice(leaderIndex), ...seats.slice(0, leaderIndex)];
  const expectedQueue = quota === 2 ? [...rotated, ...rotated] : rotated;
  requireCity(sameSequence(round.pickQueue, expectedQueue) && round.selectionCursor <= expectedQueue.length, "draft queue and cursor");
  const roles = [...round.available, ...round.publicRemoved, ...round.hiddenRemoved, ...round.unselected, ...round.assignments.map(item => item.roleId)];
  requireCity(roles.length === 8 && new Set(roles).size === 8 && CITY_ROLE_IDS.every(role => roles.includes(role)), "eight-role partition");
  const secretPairDraft = game.roleDraftVersion === "city-draft-v2" && round.eligibleAtSetup.length === 2;
  requireCity(secretPairDraft
    ? round.publicRemoved.length === 0 && round.hiddenRemoved.length === 1 + Math.min(3, round.assignments.length)
    : round.hiddenRemoved.length === 1 && round.publicRemoved.length === Math.max(0, 8 - expectedQueue.length - 2), "approved role removal counts");
  for (const id of round.eligibleAtSetup) {
    const assigned = round.assignments.filter(item => item.playerId === id).length;
    const passedPicks = round.pickQueue.slice(0, round.selectionCursor).filter(candidate => candidate === id).length;
    requireCity(assigned <= passedPicks && assigned <= quota && (player(id)?.forfeited === true || assigned === passedPicks), "assignment quota/pick coherence");
  }
  for (const assignment of round.assignments) {
    const owner = player(assignment.playerId);
    const order = cityRoleOrder(assignment.roleId);
    requireCity(owner !== undefined && round.eligibleAtSetup.includes(assignment.playerId), "assignment owner");
    requireCity(owner.forfeited === (assignment.status === "TOMBSTONED"), "forfeit role tombstone");
    requireCity(assignment.status !== "SELECTED" || !assignment.revealed && order > round.resolutionCursor, "unresolved role visibility/cursor");
    requireCity(assignment.status !== "ACTIVE" && assignment.status !== "RESOLVED" || assignment.revealed, "normal role must be revealed");
    requireCity(assignment.status !== "RESOLVED" && assignment.status !== "DISABLED" || order <= round.resolutionCursor, "resolved role cursor");
    requireCity(assignment.status !== "DISABLED" || assignment.revealed === round.ended, "disabled role reveal boundary");
    if (assignment.status === "DISABLED" && !round.ended) requireCity(game.marks.some(mark => mark.kind === "DISABLE" &&
      mark.status === "RESOLVED" && mark.targetRoleId === assignment.roleId && mark.sourcePlayerId !== assignment.playerId), "disabled role requires resolved interference");
  }
  requireCity(new Set(game.revealedRoles.map(item => `${item.roundNumber}:${item.roleId}`)).size === game.revealedRoles.length, "duplicate public role history");
  for (const item of game.revealedRoles) {
    requireCity(player(item.playerId) !== undefined && item.roundNumber <= round.roundNumber, "public role history identity");
    if (item.roundNumber === round.roundNumber) {
      const assignment = round.assignments.find(entry => entry.roleId === item.roleId && entry.playerId === item.playerId);
      requireCity(assignment !== undefined && assignment.revealed && cityRoleOrder(item.roleId) <= round.resolutionCursor, "public role history must match current revealed assignment");
      requireCity(item.kind !== "DISABLED" || round.ended && (assignment.status === "DISABLED" || assignment.status === "TOMBSTONED"), "disabled history cannot reveal before normal round end");
      requireCity(item.kind !== "NORMAL" || assignment.status === "ACTIVE" || assignment.status === "RESOLVED" || assignment.status === "TOMBSTONED", "normal history cannot reveal disabled role");
    }
  }
  for (const assignment of round.assignments) requireCity(assignment.revealed === game.revealedRoles.some(item =>
    item.roundNumber === round.roundNumber && item.roleId === assignment.roleId && item.playerId === assignment.playerId), "revealed assignment/public history correlation");
  requireCity(new Set(round.protectedPlayerIds).size === round.protectedPlayerIds.length, "duplicate protection");
  const protectedOwners = round.ended ? [] : round.assignments.filter(item => item.roleId === "CR-05" &&
    item.revealed && (item.status === "ACTIVE" || item.status === "RESOLVED") && player(item.playerId)?.forfeited === false).map(item => item.playerId);
  requireCity(sameSequence(round.protectedPlayerIds, protectedOwners), "CR-05 protection lifetime");
  requireCity(new Set(game.marks.map(mark => mark.kind)).size === game.marks.length, "role ability once budget");
  for (const mark of game.marks) {
    const sourceRole = mark.kind === "DISABLE" ? "CR-01" : "CR-02";
    const source = round.assignments.find(item => item.roleId === sourceRole && item.playerId === mark.sourcePlayerId);
    requireCity(source !== undefined && source.revealed && cityRoleOrder(mark.targetRoleId) > cityRoleOrder(sourceRole), "mark source/order");
    requireCity(mark.status !== "UNRESOLVED" || player(mark.sourcePlayerId)?.forfeited === false && cityRoleOrder(mark.targetRoleId) > round.resolutionCursor, "unresolved mark lifecycle");
    requireCity(mark.status !== "RESOLVED" || cityRoleOrder(mark.targetRoleId) <= round.resolutionCursor, "resolved mark cannot precede target resolution");
    requireCity(mark.status !== "CANCELLED" || player(mark.sourcePlayerId)?.forfeited === true, "cancelled mark source");
  }
  if (game.firstCompletion !== null) {
    requireCity(player(game.firstCompletion.playerId) !== undefined && game.firstCompletion.roundNumber <= round.roundNumber, "completion latch identity");
  } else requireCity(game.players.every(entry => entry.city.length < 8), "missing completion latch");

  if (game.window !== null) {
    requireCity(eligible.length >= 2 && player(game.window.activePlayerId)?.forfeited === false && !round.ended, "running actor lifecycle");
    requireCity(game.firstCompletion === null || game.firstCompletion.roundNumber === round.roundNumber, "completion cannot advance into another round");
    if (game.window.kind === "ROLE_SELECTION") {
      requireCity(round.pickQueue[round.selectionCursor] === game.window.activePlayerId && round.resolutionCursor === 0 &&
        round.unselected.length === 0 && round.available.length > 0 && game.marks.length === 0 && game.pendingChoice === null && round.assignments.every(item => item.status === "SELECTED" || item.status === "TOMBSTONED"), "selection phase coherence");
      requireCity(game.firstCompletion === null, "completion game cannot reenter draft");
    } else {
      const window = game.window;
      const active = round.assignments.filter(item => item.status === "ACTIVE");
      requireCity(round.selectionCursor === round.pickQueue.length && round.available.length === 0 && (secretPairDraft ? round.unselected.length === 0 : round.unselected.length >= 1) &&
        active.length === 1 && active[0]?.roleId === window.activeRoleId && active[0]?.playerId === window.activePlayerId &&
        round.resolutionCursor === cityRoleOrder(window.activeRoleId), "active role/player/cursor coherence");
      requireCity(window.buildingsBuilt <= (window.activeRoleId === "CR-07" ? 3 : 1), "role-local building budget");
      requireCity(window.buildingsBuilt <= (player(window.activePlayerId)?.city.length ?? 0), "built count must exist in current city");
      requireCity(window.acquisition === "COMPLETE" || !window.abilityUsed && window.buildingsBuilt === 0, "acquisition must precede optional actions");
      requireCity(!window.abilityUsed || ["CR-01", "CR-02", "CR-03", "CR-08"].includes(window.activeRoleId), "role optional ability budget");
      requireCity((window.acquisition === "PENDING") === (game.pendingChoice !== null), "pending acquisition coherence");
      if (game.pendingChoice !== null) requireCity(game.pendingChoice.ownerPlayerId === window.activePlayerId &&
        game.pendingChoice.actionId === window.actionId && game.pendingChoice.roleId === window.activeRoleId, "pending owner/action/role");
      const ownMark = game.marks.find(mark => mark.sourcePlayerId === window.activePlayerId && mark.kind === (window.activeRoleId === "CR-01" ? "DISABLE" : "GOLD_TRANSFER"));
      if (window.activeRoleId === "CR-01" || window.activeRoleId === "CR-02") requireCity(window.abilityUsed === (ownMark !== undefined), "mark and current ability budget");
    }
  } else {
    const calculated = calculateCityResult(game, game.result.reason);
    requireCity(game.result.rankings.length === calculated.rankings.length && game.result.rankings.every((row, index) => {
      const expected = calculated.rankings[index];
      return expected !== undefined && row.playerId === expected.playerId && row.rank === expected.rank &&
        row.score === expected.score && row.buildingVP === expected.buildingVP && row.completionBonus === expected.completionBonus &&
        row.diversityBonus === expected.diversityBonus && row.landmarkBonus === expected.landmarkBonus && row.buildingCount === expected.buildingCount &&
        row.forfeited === expected.forfeited && row.winner === expected.winner;
    }), "result must match approved scoring/ranking");
    if (game.result.reason === "CITY_COMPLETION_ROUND_END") requireCity(round.ended && round.resolutionCursor === 8 &&
      round.assignments.every(item => item.status !== "SELECTED" && item.status !== "ACTIVE") && game.pendingChoice === null, "completion requires finished round");
    const active = round.assignments.filter(item => item.status === "ACTIVE");
    requireCity(active.length <= 1 && active.every(item => cityRoleOrder(item.roleId) === round.resolutionCursor), "terminal abandoned action coherence");
    if (game.pendingChoice !== null) requireCity(game.result.reason === "LAST_PLAYER_STANDING" &&
      player(game.pendingChoice.ownerPlayerId)?.forfeited === false && active[0]?.playerId === game.pendingChoice.ownerPlayerId &&
      active[0]?.roleId === game.pendingChoice.roleId, "terminal pending belongs to surviving active player");
  }
  if (round.ended) requireCity(game.marks.length === 0 && round.protectedPlayerIds.length === 0 && round.resolutionCursor === 8, "round-end cleanup");
}
