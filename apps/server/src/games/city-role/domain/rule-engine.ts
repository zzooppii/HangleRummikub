import { CITY_CARDSET_VERSION, getCityTemplate, validateCityCards, type CityBuildingCard } from "./cardset-v1.js";
import { cloneCityGameState, type CityActionWindow, type CityFinishReason, type CityGameState, type CityPlayerState, type CityRound, type CityWindow } from "./game-state.js";
import { parseCityActionId, parseCityGameId, parseCityPlayerId, type BuildingCardId, type CityActionId, type CityGameId, type CityPlayerId } from "./identity.js";
import { CITY_ROLE_IDS, CITY_ROLESET_VERSION, CITY_RULES_VERSION, cityRoleOrder, isCityRoleId, type CityRoleId } from "./role.js";
import { calculateCityResult } from "./result-engine.js";
import { assertCityGameState } from "./state-validator.js";
import { CITY_RULES_V2, CITY_CARDSET_V2, initialCityLandmarkHistory, cityLandmarkDiscount, type CityLandmarkHistory } from "./landmarks-v2.js";

export type CityRuleFailure = "INVALID_SETUP" | "INVALID_STATE" | "STALE_ACTION" | "WRONG_ACTOR" | "INVALID_PHASE" | "INVALID_ROLE" | "INVALID_CARD" | "ACQUISITION_REQUIRED" | "PENDING_CHOICE" | "ACQUISITION_TAKEN" | "ABILITY_UNAVAILABLE" | "BUILD_LIMIT" | "INSUFFICIENT_GOLD" | "DUPLICATE_TEMPLATE" | "INVALID_TARGET" | "EMPTY_SUPPLY" | "INVALID_ENTROPY" | "ALREADY_FINISHED";
export class CityRuleError extends Error {
  constructor(readonly code: CityRuleFailure) { super(code); this.name = "CityRuleError"; }
}
function requireRule(condition: boolean, code: CityRuleFailure): asserts condition {
  if (!condition) throw new CityRuleError(code);
}

// These are trusted application-supplied shuffle results, never client choices.
// An unused field is not consumed; the future application commits RNG with state.
export type CityEntropy = Readonly<{
  nextActionId?: CityActionId;
  nextRoleOrder?: readonly CityRoleId[];
  discardOrder?: readonly BuildingCardId[];
}>;
export type CityActionContext = Readonly<{ gameId: CityGameId; actionId: CityActionId; playerId: CityPlayerId }>;
export type CityAbility =
  | Readonly<{ kind: "MARK_ROLE_DISABLED" | "MARK_ROLE_GOLD_TRANSFER"; targetRoleId: CityRoleId }>
  | Readonly<{ kind: "EXCHANGE_HANDS"; targetPlayerId: CityPlayerId }>
  | Readonly<{ kind: "REPLACE_OWN_CARDS"; cardIds: readonly BuildingCardId[] }>
  | Readonly<{ kind: "DESTROY_BUILDING"; targetPlayerId: CityPlayerId; cardId: BuildingCardId }>;
export type CityAction =
  | Readonly<{ kind: "SELECT_ROLE"; roleId: CityRoleId }>
  | Readonly<{ kind: "TAKE_INCOME" | "DRAW_BUILDING_CARDS" | "END_TURN" }>
  | Readonly<{ kind: "CHOOSE_BUILDING_CARD" | "BUILD"; cardId: BuildingCardId }>
  | Readonly<{ kind: "USE_ROLE_ABILITY"; ability: CityAbility }>;

// Only the detached candidate's top-level fields are mutable. Every nested edit
// below replaces a concrete collection/value; the caller's graph is never edited.
type CityWorkingState = { -readonly [K in keyof CityGameState]: CityGameState[K] };

function asState(s: CityWorkingState): CityGameState {
  if (s.result !== null) return { ...s, window: null, result: s.result };
  if (s.window === null) throw new CityRuleError("INVALID_STATE");
  return { ...s, window: s.window, result: null };
}
function commit(s: CityWorkingState): CityGameState {
  const state = asState(s);
  assertCityGameState(state);
  return cloneCityGameState(state);
}
function candidate(state: CityGameState): CityWorkingState {
  try { assertCityGameState(state); } catch { throw new CityRuleError("INVALID_STATE"); }
  requireRule(state.result === null, "ALREADY_FINISHED");
  return { ...cloneCityGameState(state) };
}
function player(s: CityWorkingState, id: CityPlayerId): CityPlayerState {
  const found = s.players.find(p => p.playerId === id);
  requireRule(found !== undefined, "WRONG_ACTOR");
  return found;
}
function putPlayer(s: CityWorkingState, value: CityPlayerState): void {
  s.players = s.players.map(p => p.playerId === value.playerId ? value : p);
}
function addGold(s: CityWorkingState, id: CityPlayerId, amount: number): void {
  const p = player(s, id), gold = p.gold + amount;
  requireRule(Number.isSafeInteger(gold) && gold >= 0, "INSUFFICIENT_GOLD");
  putPlayer(s, { ...p, gold });
}
function eligible(s: CityWorkingState): readonly CityPlayerId[] {
  return s.seatOrder.filter(id => !player(s, id).forfeited);
}
function template(s: CityWorkingState, id: BuildingCardId) {
  const card = s.cards.find(c => c.cardId === id);
  requireRule(card !== undefined, "INVALID_CARD");
  return getCityTemplate(card.templateId);
}
function sameSet(actual: readonly string[], expected: readonly string[]): boolean {
  return actual.length === expected.length && new Set(actual).size === actual.length && new Set(expected).size === expected.length && expected.every(id => actual.includes(id));
}
function makeRound(s: CityWorkingState, roleOrder: readonly CityRoleId[] | undefined, roundNumber: number): CityRound {
  requireRule(roleOrder !== undefined && sameSet(roleOrder, CITY_ROLE_IDS), "INVALID_ENTROPY");
  const seats = eligible(s);
  requireRule(seats.length >= 2 && seats.length <= 6, "INVALID_STATE");
  const start = seats.indexOf(s.leaderPlayerId);
  requireRule(start >= 0, "INVALID_STATE");
  const ordered = [...seats.slice(start), ...seats.slice(0, start)];
  const rolesPerPlayer = seats.length <= 3 ? 2 : 1;
  const pickQueue = rolesPerPlayer === 2 ? [...ordered, ...ordered] : ordered;
  const publicCount = Math.max(0, 8 - pickQueue.length - 2);
  return {
    roundNumber, draftLeaderPlayerId: s.leaderPlayerId, eligibleAtSetup: ordered,
    rolesPerPlayer, pickQueue, selectionCursor: 0,
    hiddenRemoved: roleOrder.slice(0, 1), publicRemoved: roleOrder.slice(1, 1 + publicCount),
    available: roleOrder.slice(1 + publicCount), unselected: [], assignments: [],
    resolutionCursor: 0, protectedPlayerIds: [], ended: false,
  };
}
function nextToken(entropy: CityEntropy, previous: CityActionId | undefined): CityActionId {
  requireRule(entropy.nextActionId !== undefined && entropy.nextActionId !== previous, "INVALID_ENTROPY");
  try { return parseCityActionId(entropy.nextActionId); } catch { throw new CityRuleError("INVALID_ENTROPY"); }
}
function draw(s: CityWorkingState, count: number, entropy: CityEntropy): readonly BuildingCardId[] {
  const first = s.deck.slice(0, count);
  s.deck = s.deck.slice(first.length);
  if (first.length === count || s.discard.length === 0) return first;
  requireRule(entropy.discardOrder !== undefined && sameSet(entropy.discardOrder, s.discard), "INVALID_ENTROPY");
  const needed = count - first.length;
  const extra = entropy.discardOrder.slice(0, needed);
  s.deck = entropy.discardOrder.slice(extra.length);
  s.discard = [];
  return [...first, ...extra];
}
function checkedWindow(s: CityWorkingState, context: CityActionContext): CityWindow {
  requireRule(s.gameId === context.gameId && s.window?.actionId === context.actionId, "STALE_ACTION");
  const window = s.window;
  requireRule(window !== null, "INVALID_PHASE");
  requireRule(window.activePlayerId === context.playerId && !player(s, context.playerId).forfeited, "WRONG_ACTOR");
  return window;
}
function actionWindow(s: CityWorkingState): CityActionWindow {
  requireRule(s.window?.kind === "ROLE_ACTION", "INVALID_PHASE");
  return s.window;
}
function readyAction(s: CityWorkingState): CityActionWindow {
  const w = actionWindow(s);
  requireRule(s.pendingChoice === null, "PENDING_CHOICE");
  requireRule(w.acquisition === "COMPLETE", "ACQUISITION_REQUIRED");
  return w;
}
function completeAcquisition(s: CityWorkingState): void {
  const w = actionWindow(s);
  s.window = { ...w, acquisition: "COMPLETE" };
  s.pendingChoice = null;
  if (w.activeRoleId === "CR-06") addGold(s, w.activePlayerId, 1);
}
function takeIncome(s: CityWorkingState): void {
  const w = actionWindow(s);
  requireRule(w.acquisition === "NOT_TAKEN", "ACQUISITION_TAKEN");
  addGold(s, w.activePlayerId, 2);
  completeAcquisition(s);
}
function drawBuildingCards(s: CityWorkingState, entropy: CityEntropy): void {
  const w = actionWindow(s);
  requireRule(w.acquisition === "NOT_TAKEN", "ACQUISITION_TAKEN");
  requireRule(s.deck.length + s.discard.length > 0, "EMPTY_SUPPLY");
  const cards = draw(s, 2, entropy);
  s.window = { ...w, acquisition: "PENDING" };
  s.pendingChoice = {
    kind: "DRAW_BUILDING", ownerPlayerId: w.activePlayerId, actionId: w.actionId, roleId: w.activeRoleId, cards,
  };
}
function chooseBuildingCard(s: CityWorkingState, cardId: BuildingCardId): void {
  const w = actionWindow(s), choice = s.pendingChoice;
  requireRule(w.acquisition === "PENDING" && choice !== null, "INVALID_PHASE");
  requireRule(choice.cards.includes(cardId), "INVALID_CARD");
  const p = player(s, w.activePlayerId);
  putPlayer(s, { ...p, hand: [...p.hand, cardId] });
  s.deck = [...s.deck, ...choice.cards.filter(id => id !== cardId)];
  completeAcquisition(s);
}
function updateLandmarkHistory(s: CityWorkingState, history: CityLandmarkHistory): void {
  requireRule(s.rulesVersion === CITY_RULES_V2 && s.landmarkHistory !== undefined, "INVALID_STATE");
  s.landmarkHistory = s.landmarkHistory.map(row => row.playerId === history.playerId ? history : row);
}
function expireStaircase(s: CityWorkingState, playerId: CityPlayerId): void {
  const history = s.landmarkHistory?.find(row => row.playerId === playerId);
  if (history !== undefined) updateLandmarkHistory(s, { ...history, staircaseRemaining: 0 });
}
function build(s: CityWorkingState, cardId: BuildingCardId, entropy: CityEntropy): void {
  const w = readyAction(s), p = player(s, w.activePlayerId);
  requireRule(p.hand.includes(cardId), "INVALID_CARD");
  const card = template(s, cardId);
  requireRule(!p.city.some(id => template(s, id).templateId === card.templateId), "DUPLICATE_TEMPLATE");
  requireRule(w.buildingsBuilt < (w.activeRoleId === "CR-07" ? 3 : 1), "BUILD_LIMIT");
  const history = s.landmarkHistory?.find(row => row.playerId === p.playerId);
  const discount = cityLandmarkDiscount(history, s.round.roundNumber, p.city.map(id => template(s, id)), card);
  requireRule(p.gold >= card.cost - discount, "INSUFFICIENT_GOLD");
  putPlayer(s, { ...p, gold: p.gold - card.cost + discount, hand: p.hand.filter(id => id !== cardId), city: [...p.city, cardId] });
  if (history !== undefined) {
    let next = history;
    if (discount > 0) next = { ...next, staircaseRemaining: next.staircaseRemaining - 1,
      staircaseSpent: next.staircaseSpent + 1, lastDiscountRound: s.round.roundNumber };
    if (card.templateId === "CB-LAN-01" && !next.gardenUsed) {
      next = { ...next, gardenUsed: true };
      addGold(s, p.playerId, 1);
    }
    if (card.templateId === "CB-LAN-02" && !next.sundialUsed) {
      next = { ...next, sundialUsed: true };
      const cards = draw(s, 1, entropy), current = player(s, p.playerId);
      putPlayer(s, { ...current, hand: [...current.hand, ...cards] });
    }
    if (card.templateId === "CB-LAN-04" && !next.staircaseInitialized) {
      next = { ...next, staircaseInitialized: true, staircaseRemaining: 3 };
    }
    updateLandmarkHistory(s, next);
  }
  s.window = { ...w, buildingsBuilt: w.buildingsBuilt + 1 };
  if (s.firstCompletion === null && p.city.length + 1 >= 8) {
    s.firstCompletion = { playerId: p.playerId, roundNumber: s.round.roundNumber };
  }
}
function useAbility(s: CityWorkingState, ability: CityAbility, entropy: CityEntropy): void {
  const w = readyAction(s), p = player(s, w.activePlayerId);
  requireRule(!w.abilityUsed, "ABILITY_UNAVAILABLE");
  switch (ability.kind) {
    case "MARK_ROLE_DISABLED":
    case "MARK_ROLE_GOLD_TRANSFER": {
      requireRule(w.activeRoleId === (ability.kind === "MARK_ROLE_DISABLED" ? "CR-01" : "CR-02"), "ABILITY_UNAVAILABLE");
      requireRule(isCityRoleId(ability.targetRoleId) && cityRoleOrder(ability.targetRoleId) > cityRoleOrder(w.activeRoleId), "INVALID_TARGET");
      // No hidden owner/removal/disable lookup: all higher roles have identical admission.
      s.marks = [...s.marks, { kind: ability.kind === "MARK_ROLE_DISABLED" ? "DISABLE" : "GOLD_TRANSFER",
        sourcePlayerId: p.playerId, targetRoleId: ability.targetRoleId, status: "UNRESOLVED" }];
      break;
    }
    case "EXCHANGE_HANDS": {
      requireRule(w.activeRoleId === "CR-03", "ABILITY_UNAVAILABLE");
      const target = s.players.find(other => other.playerId === ability.targetPlayerId);
      requireRule(target !== undefined && !target.forfeited && target.playerId !== p.playerId, "INVALID_TARGET");
      putPlayer(s, { ...p, hand: [...target.hand] });
      putPlayer(s, { ...target, hand: [...p.hand] });
      break;
    }
    case "REPLACE_OWN_CARDS": {
      requireRule(w.activeRoleId === "CR-03", "ABILITY_UNAVAILABLE");
      requireRule(ability.cardIds.length > 0 && new Set(ability.cardIds).size === ability.cardIds.length && ability.cardIds.every(id => p.hand.includes(id)), "INVALID_CARD");
      // E03 validation precedes every card/RNG operation. Discard-first is intentional.
      const retained = p.hand.filter(id => !ability.cardIds.includes(id));
      s.discard = [...s.discard, ...ability.cardIds];
      const drawn = draw(s, ability.cardIds.length, entropy);
      requireRule(drawn.length === ability.cardIds.length, "EMPTY_SUPPLY");
      putPlayer(s, { ...p, hand: [...retained, ...drawn] });
      break;
    }
    case "DESTROY_BUILDING": {
      requireRule(w.activeRoleId === "CR-08", "ABILITY_UNAVAILABLE");
      const target = s.players.find(other => other.playerId === ability.targetPlayerId);
      requireRule(target !== undefined && !target.forfeited && target.playerId !== p.playerId && target.city.length < 8 && !s.round.protectedPlayerIds.includes(target.playerId), "INVALID_TARGET");
      requireRule(target.city.includes(ability.cardId), "INVALID_CARD");
      const destroyed = template(s, ability.cardId);
      const cost = Math.max(0, destroyed.cost - 1) + (s.rulesVersion === CITY_RULES_V2 && destroyed.templateId === "CB-LAN-03" ? 1 : 0);
      requireRule(p.gold >= cost, "INSUFFICIENT_GOLD");
      putPlayer(s, { ...p, gold: p.gold - cost });
      putPlayer(s, { ...target, city: target.city.filter(id => id !== ability.cardId) });
      s.discard = [...s.discard, ability.cardId];
      if (destroyed.templateId === "CB-LAN-04") expireStaircase(s, target.playerId);
      break;
    }
    default: throw new CityRuleError("ABILITY_UNAVAILABLE");
  }
  s.window = { ...w, abilityUsed: true };
}

function setAssignment(s: CityWorkingState, roleId: CityRoleId, changes: Partial<CityRound["assignments"][number]>): void {
  s.round = { ...s.round, assignments: s.round.assignments.map(a => a.roleId === roleId ? { ...a, ...changes } : a) };
}
function activeMarks(s: CityWorkingState, roleId: CityRoleId, owner: CityPlayerId) {
  return s.marks.filter(m => m.targetRoleId === roleId && m.status === "UNRESOLVED" && m.sourcePlayerId !== owner && !player(s, m.sourcePlayerId).forfeited);
}
function disabled(s: CityWorkingState, roleId: CityRoleId, owner: CityPlayerId): boolean {
  return activeMarks(s, roleId, owner).some(m => m.kind === "DISABLE");
}
function resolveMarks(s: CityWorkingState, roleId: CityRoleId): void {
  s.marks = s.marks.map(m => m.targetRoleId === roleId && m.status === "UNRESOLVED" ? { ...m, status: "RESOLVED" } : m);
}
function skipRole(s: CityWorkingState, roleId: CityRoleId): void {
  const assignment = s.round.assignments.find(a => a.roleId === roleId);
  if (assignment !== undefined && assignment.status === "SELECTED") {
    setAssignment(s, roleId, { status: player(s, assignment.playerId).forfeited ? "TOMBSTONED" : "DISABLED" });
  }
  resolveMarks(s, roleId);
  s.round = { ...s.round, resolutionCursor: cityRoleOrder(roleId) };
}
function enterRole(s: CityWorkingState, roleId: CityRoleId, owner: CityPlayerId, actionId: CityActionId, entropy: CityEntropy): void {
  setAssignment(s, roleId, { status: "ACTIVE", revealed: true });
  s.revealedRoles = [...s.revealedRoles, { roundNumber: s.round.roundNumber, roleId, playerId: owner, kind: "NORMAL" }];
  s.round = { ...s.round, resolutionCursor: cityRoleOrder(roleId) };
  for (const mark of activeMarks(s, roleId, owner)) {
    if (mark.kind === "GOLD_TRANSFER") {
      const gold = player(s, owner).gold;
      addGold(s, mark.sourcePlayerId, gold);
      addGold(s, owner, -gold);
    }
  }
  resolveMarks(s, roleId);
  if (roleId === "CR-04") s.leaderPlayerId = owner;
  if (roleId === "CR-05") s.round = { ...s.round, protectedPlayerIds: [...s.round.protectedPlayerIds, owner] };
  const category = roleId === "CR-04" ? "CIVIC" : roleId === "CR-05" ? "CULTURE" : roleId === "CR-06" ? "TRADE" : roleId === "CR-08" ? "GUARD" : null;
  if (category !== null) addGold(s, owner, player(s, owner).city.filter(id => template(s, id).category === category).length);
  if (roleId === "CR-07") {
    const cards = draw(s, 2, entropy), p = player(s, owner);
    putPlayer(s, { ...p, hand: [...p.hand, ...cards] });
  }
  s.window = { kind: "ROLE_ACTION", actionId, activePlayerId: owner, activeRoleId: roleId,
    acquisition: "NOT_TAKEN", abilityUsed: false, buildingsBuilt: 0 };
}
function closeRound(s: CityWorkingState): void {
  s.revealedRoles = [...s.revealedRoles, ...s.round.assignments
    .filter(a => a.status === "DISABLED" && !a.revealed)
    .map(a => ({ roundNumber: s.round.roundNumber, roleId: a.roleId, playerId: a.playerId, kind: "DISABLED" as const }))];
  s.round = { ...s.round, ended: true, resolutionCursor: 8, protectedPlayerIds: [],
    assignments: s.round.assignments.map(a => a.status === "DISABLED" ? { ...a, revealed: true } : a) };
  s.marks = [];
}
function finish(s: CityWorkingState, reason: CityFinishReason): void {
  // Result calculation reads canonical assets only; the former window supplies
  // no timer/revision/policy information to scoring.
  const scoringState = { ...s, window: null, result: { reason, rankings: [] } };
  s.result = calculateCityResult(scoringState, reason);
  s.window = null;
}
function terminalEligibility(s: CityWorkingState): boolean {
  const count = eligible(s).length;
  if (count > 1) return false;
  finish(s, count === 1 ? "LAST_PLAYER_STANDING" : "NO_ELIGIBLE_PLAYERS");
  return true;
}
function hasRemainingRole(s: CityWorkingState): boolean {
  return s.round.assignments.some(a => cityRoleOrder(a.roleId) > s.round.resolutionCursor && a.status === "SELECTED" && !player(s, a.playerId).forfeited && !disabled(s, a.roleId, a.playerId));
}
function closeSelection(s: CityWorkingState): void {
  s.round = { ...s.round, unselected: [...s.round.available], available: [] };
}
function skipAbsentPicks(s: CityWorkingState): void {
  let cursor = s.round.selectionCursor;
  while (cursor < s.round.pickQueue.length && player(s, s.round.pickQueue[cursor]!).forfeited) cursor += 1;
  s.round = { ...s.round, selectionCursor: cursor };
  if (cursor === s.round.pickQueue.length && s.round.available.length > 0) closeSelection(s);
}
function selectRole(s: CityWorkingState, roleId: CityRoleId): void {
  requireRule(s.window?.kind === "ROLE_SELECTION", "INVALID_PHASE");
  requireRule(s.round.available.includes(roleId), "INVALID_ROLE");
  const id = s.window.activePlayerId;
  requireRule(s.round.assignments.filter(a => a.playerId === id).length < s.round.rolesPerPlayer, "INVALID_ROLE");
  s.round = { ...s.round, available: s.round.available.filter(role => role !== roleId),
    assignments: [...s.round.assignments, { roleId, playerId: id, status: "SELECTED", revealed: false }],
    selectionCursor: s.round.selectionCursor + 1 };
  s.window = null;
  skipAbsentPicks(s);
}
function endRole(s: CityWorkingState): void {
  const w = readyAction(s);
  setAssignment(s, w.activeRoleId, { status: "RESOLVED" });
  s.window = null;
}
function advance(s: CityWorkingState, entropy: CityEntropy, previous: CityActionId): void {
  if (s.result !== null || terminalEligibility(s)) return;
  if (s.window !== null) return;
  skipAbsentPicks(s);
  if (s.round.selectionCursor < s.round.pickQueue.length) {
    s.window = { kind: "ROLE_SELECTION", actionId: nextToken(entropy, previous), activePlayerId: s.round.pickQueue[s.round.selectionCursor]! };
    return;
  }
  for (const roleId of CITY_ROLE_IDS) {
    if (cityRoleOrder(roleId) <= s.round.resolutionCursor) continue;
    const assignment = s.round.assignments.find(a => a.roleId === roleId);
    if (assignment === undefined || assignment.status === "TOMBSTONED" || player(s, assignment.playerId).forfeited || disabled(s, roleId, assignment.playerId)) {
      skipRole(s, roleId);
      continue;
    }
    enterRole(s, roleId, assignment.playerId, nextToken(entropy, previous), entropy);
    return;
  }
  closeRound(s);
  if (s.firstCompletion !== null) { finish(s, "CITY_COMPLETION_ROUND_END"); return; }
  s.round = makeRound(s, entropy.nextRoleOrder, s.round.roundNumber + 1);
  s.window = { kind: "ROLE_SELECTION", actionId: nextToken(entropy, previous), activePlayerId: s.round.pickQueue[0]! };
}

export function createInitialCityGameState(input: Readonly<{
  gameId: CityGameId; playerIds: readonly CityPlayerId[]; seatOrder: readonly CityPlayerId[];
  cards: readonly CityBuildingCard[]; deck: readonly BuildingCardId[];
  initialHands: readonly Readonly<{ playerId: CityPlayerId; cardIds: readonly BuildingCardId[] }>[];
  actionId: CityActionId; roleOrder: readonly CityRoleId[];
  rulesVersion?: "city-rules-v1" | "city-rules-v2";
}>): CityGameState {
  try {
    requireRule(input.rulesVersion === undefined || input.rulesVersion === "city-rules-v1" || input.rulesVersion === CITY_RULES_V2, "INVALID_SETUP");
    requireRule(input.playerIds.length >= 2 && input.playerIds.length <= 6 && sameSet(input.seatOrder, input.playerIds), "INVALID_SETUP");
    requireRule(input.initialHands.length === input.playerIds.length && sameSet(input.initialHands.map(h => h.playerId), input.playerIds), "INVALID_SETUP");
    const players = input.playerIds.map(id => {
      const hand = input.initialHands.find(h => h.playerId === id)?.cardIds;
      requireRule(hand !== undefined && hand.length === 4, "INVALID_SETUP");
      return { playerId: parseCityPlayerId(id), hand: [...hand], gold: 2, city: [], forfeited: false, offlineTimeoutStreak: 0 };
    });
    const s: CityWorkingState = {
      gameId: parseCityGameId(input.gameId), rulesVersion: CITY_RULES_VERSION, cardSetVersion: CITY_CARDSET_VERSION, roleSetVersion: CITY_ROLESET_VERSION,
      ...(input.rulesVersion === CITY_RULES_V2 ? { rulesVersion: CITY_RULES_V2, cardSetVersion: CITY_CARDSET_V2,
        landmarkHistory: players.map(p => initialCityLandmarkHistory(p.playerId)) } : {}),
      cards: validateCityCards(input.cards), players, seatOrder: [...input.seatOrder], leaderPlayerId: input.seatOrder[0]!,
      deck: [...input.deck], discard: [], marks: [], revealedRoles: [], pendingChoice: null, firstCompletion: null, result: null,
      window: { kind: "ROLE_SELECTION", actionId: parseCityActionId(input.actionId), activePlayerId: input.seatOrder[0]! },
      round: { roundNumber: 1, draftLeaderPlayerId: input.seatOrder[0]!, eligibleAtSetup: [], rolesPerPlayer: 1, pickQueue: [], selectionCursor: 0, available: [], publicRemoved: [], hiddenRemoved: [], unselected: [], assignments: [], resolutionCursor: 0, protectedPlayerIds: [], ended: false },
    };
    s.round = makeRound(s, input.roleOrder, 1);
    return commit(s);
  } catch (error) {
    if (error instanceof CityRuleError) throw error;
    throw new CityRuleError("INVALID_SETUP");
  }
}

export function applyCityAction(state: CityGameState, context: CityActionContext, action: CityAction, entropy: CityEntropy = {}): CityGameState {
  const s = candidate(state);
  const previous = checkedWindow(s, context).actionId;
  switch (action.kind) {
    case "SELECT_ROLE": selectRole(s, action.roleId); advance(s, entropy, previous); break;
    case "TAKE_INCOME": takeIncome(s); break;
    case "DRAW_BUILDING_CARDS": drawBuildingCards(s, entropy); break;
    case "CHOOSE_BUILDING_CARD": chooseBuildingCard(s, action.cardId); break;
    case "BUILD": build(s, action.cardId, entropy); break;
    case "USE_ROLE_ABILITY": useAbility(s, action.ability, entropy); break;
    case "END_TURN": endRole(s); advance(s, entropy, previous); break;
    default: throw new CityRuleError("INVALID_PHASE");
  }
  return commit(s);
}

function cleanForfeits(s: CityWorkingState, ids: readonly CityPlayerId[]): void {
  for (const id of ids) {
    const p = player(s, id);
    requireRule(!p.forfeited, "WRONG_ACTOR");
    const pending = s.pendingChoice?.ownerPlayerId === id ? s.pendingChoice.cards : [];
    if (s.pendingChoice?.ownerPlayerId === id) s.pendingChoice = null;
    s.discard = [...s.discard, ...p.hand, ...pending];
    putPlayer(s, { ...p, gold: 0, hand: [], forfeited: true });
    expireStaircase(s, id);
    s.marks = s.marks.map(m => m.sourcePlayerId === id && m.status === "UNRESOLVED" ? { ...m, status: "CANCELLED" } : m);
    s.round = { ...s.round, protectedPlayerIds: s.round.protectedPlayerIds.filter(owner => owner !== id),
      assignments: s.round.assignments.map(a => a.playerId === id ? { ...a, status: "TOMBSTONED" } : a) };
    if (s.window?.activePlayerId === id) s.window = null;
  }
  const seats = eligible(s);
  if (seats.length > 0 && !seats.includes(s.leaderPlayerId)) {
    const index = s.seatOrder.indexOf(s.leaderPlayerId);
    s.leaderPlayerId = [...s.seatOrder.slice(index + 1), ...s.seatOrder.slice(0, index + 1)].find(id => seats.includes(id))!;
  }
}
export function forfeitCityPlayers(state: CityGameState, playerIds: readonly CityPlayerId[], entropy: CityEntropy = {}): CityGameState {
  const s = candidate(state), previous = state.window?.actionId;
  requireRule(previous !== undefined && playerIds.length > 0 && new Set(playerIds).size === playerIds.length, "WRONG_ACTOR");
  cleanForfeits(s, playerIds);
  advance(s, entropy, previous);
  return commit(s);
}
export function timeoutCityWindow(state: CityGameState, context: CityActionContext, input: Readonly<{ offline: boolean; selectedRoleId?: CityRoleId }>, entropy: CityEntropy = {}): CityGameState {
  const s = candidate(state), w = checkedWindow(s, context), p = player(s, context.playerId);
  if (input.offline) putPlayer(s, { ...p, offlineTimeoutStreak: p.offlineTimeoutStreak + 1 });
  if (w.kind === "ROLE_SELECTION") {
    requireRule(input.selectedRoleId !== undefined, "INVALID_ROLE");
    selectRole(s, input.selectedRoleId);
  } else {
    if (w.acquisition === "NOT_TAKEN") takeIncome(s);
    else if (s.pendingChoice !== null) chooseBuildingCard(s, s.pendingChoice.cards[0]!);
    endRole(s);
  }
  // E02: inspect terminal completion without entering/rewarding a new actor or
  // preparing the next round with the pre-forfeit roster.
  if (!terminalEligibility(s) && s.round.selectionCursor === s.round.pickQueue.length && !hasRemainingRole(s) && s.firstCompletion !== null) {
    for (const roleId of CITY_ROLE_IDS) if (cityRoleOrder(roleId) > s.round.resolutionCursor) skipRole(s, roleId);
    closeRound(s);
    finish(s, "CITY_COMPLETION_ROUND_END");
  }
  if (s.result === null && input.offline && player(s, context.playerId).offlineTimeoutStreak >= 3) cleanForfeits(s, [context.playerId]);
  advance(s, entropy, w.actionId);
  return commit(s);
}
export function resetCityOfflineStreak(state: CityGameState, playerId: CityPlayerId): CityGameState {
  const s = candidate(state), p = player(s, playerId);
  requireRule(!p.forfeited, "WRONG_ACTOR");
  putPlayer(s, { ...p, offlineTimeoutStreak: 0 });
  return commit(s);
}
