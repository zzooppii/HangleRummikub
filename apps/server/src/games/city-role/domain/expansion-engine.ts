import * as v from 'valibot';
import { CITY_DEFAULT_SETTINGS, CITY_STANDARD_SPECIALS, type CityExpansionSettings, type CityJobId, type CitySpecialEffect, type CitySpecialId } from './expansion-catalog.js';
import { CityExpansionActionSchema, CityExpansionSettingsSchema, type CityExpansionAction, type CityExpansionState } from './expansion-state.js';
import { type CityWorkingState, type CityEntropy, type CityAbility, requireRule, player, putPlayer, addGold, template, draw, readyAction, actionWindow, endRole } from './rule-engine.js';
import { parseBuildingCardId, parseCityPlayerId, type BuildingCardId, type CityPlayerId, type CityActionId } from './identity.js';
import { CITY_ALL_ROLE_IDS, cityRoleOrder, type CityRoleId } from './role.js';
import { CITY_SPECIAL_BUILDINGS } from './expansion-catalog.js';

export function initialExpansion(settings: CityExpansionSettings = CITY_DEFAULT_SETTINGS, specialIds: readonly CitySpecialId[] = CITY_STANDARD_SPECIALS): CityExpansionState {
  const parsed = v.parse(CityExpansionSettingsSchema, settings);
  requireRule(specialIds.length === 14 && new Set(specialIds).size === 14, 'INVALID_SETUP');
  return { settings: parsed, specialIds: [...specialIds], incomeUsed: false, spentGold: 0, usedSpecials: [], decorated: [], museum: [], tax: 0, witch: null, warrants: null, threats: null, pending: null, theaterDone: false, inspectedHand: [], inspectedOwner: null };
}
function expansion(s: CityWorkingState): CityExpansionState { requireRule(s.expansion !== undefined, 'INVALID_PHASE'); return s.expansion; }
function update(s: CityWorkingState, patch: Partial<CityExpansionState>): void { s.expansion = { ...expansion(s), ...patch }; }
export function expandedJob(s: CityWorkingState): CityJobId {
  const w = actionWindow(s), job = expansion(s).settings.roles[cityRoleOrder(w.activeRoleId) - 1];
  requireRule(job !== undefined, 'INVALID_ROLE'); return job;
}
function effect(s: CityWorkingState, id: BuildingCardId): CitySpecialEffect | undefined { return CITY_SPECIAL_BUILDINGS.find(b => b.templateId === template(s, id).templateId)?.effect; }
export function hasSpecial(s: CityWorkingState, id: CityPlayerId, wanted: CitySpecialEffect): boolean { return player(s, id).city.some(card => effect(s, card) === wanted); }
function giveCards(s: CityWorkingState, id: CityPlayerId, count: number, entropy: CityEntropy): void { const cards = draw(s, count, entropy), p = player(s, id); putPlayer(s, { ...p, hand: [...p.hand, ...cards] }); }
function ownCard(s: CityWorkingState, value: string | undefined, owner: CityPlayerId, zone: 'hand' | 'city'): BuildingCardId { const id = player(s, owner)[zone].find(id => id === value); requireRule(id !== undefined, 'INVALID_CARD'); return id; }
function other(s: CityWorkingState, value: string | undefined, actor: CityPlayerId): CityPlayerId { const p = s.players.find(p => p.playerId === value && p.playerId !== actor && !p.forfeited); requireRule(p !== undefined, 'INVALID_TARGET'); return p.playerId; }
function randomCard(cards: readonly BuildingCardId[], entropy: CityEntropy): BuildingCardId | undefined { if (!cards.length) return undefined; const i = entropy.randomIndex?.(cards.length); requireRule(i !== undefined && Number.isInteger(i) && i >= 0 && i < cards.length, 'INVALID_ENTROPY'); return cards[i]; }
function shuffled(cards: readonly BuildingCardId[], entropy: CityEntropy): readonly BuildingCardId[] { if (!cards.length) return []; const result = entropy.shuffleCards?.(cards); requireRule(result !== undefined && result.length === cards.length && new Set(result).size === cards.length && cards.every(id => result.includes(id)), 'INVALID_ENTROPY'); return result; }
export function cityCompletionSize(s: CityWorkingState, id: CityPlayerId): number { return player(s, id).city.length + Number(hasSpecial(s, id, 'MONUMENT')); }
function checkCompletion(s: CityWorkingState, id: CityPlayerId): void { if (!s.firstCompletion && cityCompletionSize(s, id) >= 8) s.firstCompletion = { playerId: id, roundNumber: s.round.roundNumber }; }
function removeBuilding(s: CityWorkingState, owner: CityPlayerId, id: BuildingCardId): void {
  const p = player(s, owner); requireRule(p.city.includes(id), 'INVALID_CARD'); putPlayer(s, { ...p, city: p.city.filter(c => c !== id) });
  const e = expansion(s), stored = e.museum.find(row => row.buildingId === id)?.cards ?? [];
  s.deck = [...s.deck, id, ...stored.map(parseBuildingCardId)];
  update(s, { decorated: e.decorated.filter(c => c !== id), museum: e.museum.filter(row => row.buildingId !== id) });
}
function printedCost(s: CityWorkingState, id: BuildingCardId): number { return template(s, id).cost + Number(expansion(s).decorated.includes(id)); }
function noDuplicate(s: CityWorkingState, owner: CityPlayerId, incoming: BuildingCardId, outgoing?: BuildingCardId): boolean { return !player(s, owner).city.some(id => id !== outgoing && template(s, id).templateId === template(s, incoming).templateId); }
function tax(s: CityWorkingState, owner: CityPlayerId): void { if (expansion(s).settings.roles.includes('TAX_COLLECTOR') && expandedJob(s) !== 'TAX_COLLECTOR' && player(s, owner).gold > 0) { addGold(s, owner, -1); update(s, { tax: expansion(s).tax + 1 }); } }
function setPending(s: CityWorkingState, pending: CityExpansionState['pending']): void { update(s, { pending }); if (pending) s.window = { ...actionWindow(s), activePlayerId: parseCityPlayerId(pending.actorId) }; }
function clearPending(s: CityWorkingState): NonNullable<CityExpansionState['pending']> { const pending = expansion(s).pending; requireRule(pending !== null, 'INVALID_PHASE'); update(s, { pending: null }); s.window = { ...actionWindow(s), activePlayerId: parseCityPlayerId(pending.sourcePlayerId) }; return pending; }

export function expandedBuild(s: CityWorkingState, a: CityExpansionAction, _entropy: CityEntropy, wizard = false): void {
  const w = readyAction(s), id = w.activePlayerId, e = expansion(s), job = expandedJob(s);
  requireRule(e.pending === null, 'PENDING_CHOICE');
  const cardId = ownCard(s, a.cardId, id, 'hand'), card = template(s, cardId), special = effect(s, cardId);
  requireRule(job !== 'NAVIGATOR' && job !== 'WITCH' && special !== 'SECRET_VAULT', 'BUILD_LIMIT');
  requireRule(noDuplicate(s, id, cardId) || hasSpecial(s, id, 'QUARRY') || job === 'WIZARD', 'DUPLICATE_TEMPLATE');
  requireRule(special !== 'MONUMENT' || player(s, id).city.length < 5, 'BUILD_LIMIT');
  const free = wizard || special === 'STABLES' || job === 'TRADER' && card.category === 'TRADE';
  const limit = job === 'ARCHITECT' ? 3 : job === 'SCHOLAR' || job === 'SEER' ? 2 : 1;
  requireRule(free || w.buildingsBuilt < limit, 'BUILD_LIMIT');
  let cost = Math.max(0, card.cost - Number(card.category === 'LANDMARK' && hasSpecial(s, id, 'FACTORY')));
  let paid = cost;
  if (a.ownCardId !== undefined) {
    const sacrificed = ownCard(s, a.ownCardId, id, 'city');
    requireRule(effect(s, sacrificed) === 'FRAMEWORK' || special === 'NECROPOLIS', 'INVALID_TARGET');
    removeBuilding(s, id, sacrificed); cost = 0; paid = 0;
  }
  const payment = a.cardIds ?? [];
  requireRule(!payment.includes(cardId) && payment.every(c => player(s, id).hand.includes(parseBuildingCardId(c))), 'INVALID_CARD');
  if (payment.length > 0) {
    if (job === 'CARDINAL' && a.targetPlayerId !== undefined) {
      const target = other(s, a.targetPlayerId, id), shortfall = Math.max(0, cost - player(s, id).gold);
      requireRule(payment.length === shortfall && shortfall > 0, 'INVALID_TARGET');
      addGold(s, target, -shortfall); addGold(s, id, shortfall);
      const p = player(s, target); putPlayer(s, { ...p, hand: [...p.hand, ...payment.map(parseBuildingCardId)] });
    } else {
      requireRule(special === 'THIEVES_DEN' && payment.length <= cost, 'INVALID_TARGET');
      cost -= payment.length; paid = cost; s.deck = [...s.deck, ...payment.map(parseBuildingCardId)];
    }
    const p = player(s, id); putPlayer(s, { ...p, hand: p.hand.filter(c => !payment.includes(c)) });
  }
  addGold(s, id, -cost); const p = player(s, id);
  putPlayer(s, { ...p, hand: p.hand.filter(c => c !== cardId), city: [...p.city, cardId] });
  update(s, { spentGold: expansion(s).spentGold + paid });
  s.window = { ...w, buildingsBuilt: w.buildingsBuilt + Number(!free) };
  const warrants = expansion(s).warrants;
  if (warrants && !warrants.used && warrants.real === w.activeRoleId && paid > 0 && warrants.sourcePlayerId !== id && !player(s, parseCityPlayerId(warrants.sourcePlayerId)).forfeited) {
    update(s, { warrants: { ...warrants, used: true } });
    if (noDuplicate(s, parseCityPlayerId(warrants.sourcePlayerId), cardId)) {
      setPending(s, { kind: 'CONFISCATE', actorId: warrants.sourcePlayerId, sourcePlayerId: id, cards: [], recipients: [], cardId, paid }); return;
    }
  }
  tax(s, id); checkCompletion(s, id);
}

export function expandedValidateAbility(s: CityWorkingState, ability: CityAbility): void {
  const job = expandedJob(s); requireRule(expansion(s).pending === null, 'PENDING_CHOICE');
  requireRule(ability.kind === 'MARK_ROLE_DISABLED' ? job === 'ASSASSIN' : ability.kind === 'MARK_ROLE_GOLD_TRANSFER' ? job === 'THIEF' : ability.kind === 'DESTROY_BUILDING' ? false : job === 'MAGICIAN', 'ABILITY_UNAVAILABLE');
  if (ability.kind === 'MARK_ROLE_GOLD_TRANSFER') requireRule(!s.marks.some(m => m.kind === 'DISABLE' && m.targetRoleId === ability.targetRoleId) && expansion(s).witch?.targetRoleId !== ability.targetRoleId, 'INVALID_TARGET');
}
export function expandedEnter(s: CityWorkingState, _entropy: CityEntropy): void {
  const w = actionWindow(s), job = expandedJob(s);
  update(s, { incomeUsed: false, spentGold: 0, usedSpecials: [], inspectedHand: [], inspectedOwner: null });
  if (job === 'KING' || job === 'PATRICIAN') s.leaderPlayerId = w.activePlayerId;
  if (job === 'BISHOP') s.round = { ...s.round, protectedPlayerIds: [w.activePlayerId] };
}
export function expandedAfterResources(s: CityWorkingState, entropy: CityEntropy = {}): void {
  let w = actionWindow(s); const e = expansion(s);
  if (e.witch?.targetRoleId === w.activeRoleId && e.witch.sourcePlayerId !== w.activePlayerId && !player(s, parseCityPlayerId(e.witch.sourcePlayerId)).forfeited) {
    update(s, { witch: { ...e.witch, controlling: true } });
    w = { ...w, activePlayerId: parseCityPlayerId(e.witch.sourcePlayerId) }; s.window = w;
    if (expandedJob(s) === 'BISHOP') s.round = { ...s.round, protectedPlayerIds: [w.activePlayerId] };
  }
  const threat = expansion(s).threats;
  if (threat?.roles.includes(w.activeRoleId) && threat.sourcePlayerId !== w.activePlayerId && !player(s, parseCityPlayerId(threat.sourcePlayerId)).forfeited) {
    setPending(s, { kind: 'BRIBE', actorId: w.activePlayerId, sourcePlayerId: w.activePlayerId, cards: [], recipients: [] }); return;
  }
  grantExtraResources(s, entropy);
}
function grantExtraResources(s: CityWorkingState, entropy: CityEntropy): void {
  const w = actionWindow(s), job = expandedJob(s);
  if (job === 'MERCHANT') addGold(s, w.activePlayerId, 1);
  if (job === 'ARCHITECT') giveCards(s, w.activePlayerId, 2, entropy);
  if (job === 'TAX_COLLECTOR') { addGold(s, w.activePlayerId, expansion(s).tax); update(s, { tax: 0 }); }
  if (job === 'QUEEN') {
    const four = s.round.assignments.find(a => a.roleId === 'CR-04' && a.revealed);
    const seats = s.seatOrder.filter(id => !player(s, id).forfeited), i = seats.indexOf(w.activePlayerId);
    if (four && [seats[(i + 1) % seats.length], seats[(i + seats.length - 1) % seats.length]].includes(four.playerId)) addGold(s, w.activePlayerId, 3);
  }
}
export function expandedEnd(s: CityWorkingState, entropy: CityEntropy): void {
  const w = actionWindow(s), e = expansion(s); requireRule(e.pending === null, 'PENDING_CHOICE');
  const mandatory = expandedJob(s) === 'WITCH' || expandedJob(s) === 'EMPEROR' && s.players.some(p => !p.forfeited && p.playerId !== w.activePlayerId && p.playerId !== s.leaderPlayerId);
  requireRule(!mandatory || w.abilityUsed, 'ABILITY_UNAVAILABLE');
  if (expandedJob(s) === 'WITCH') return;
  if (hasSpecial(s, w.activePlayerId, 'POOR_HOUSE') && player(s, w.activePlayerId).gold === 0) addGold(s, w.activePlayerId, 1);
  if (hasSpecial(s, w.activePlayerId, 'PARK') && player(s, w.activePlayerId).hand.length === 0) {
    giveCards(s, w.activePlayerId, 2, entropy);
  }
  if (expandedJob(s) === 'ALCHEMIST') addGold(s, w.activePlayerId, e.spentGold);
}
export function expandedBeforeResolution(s: CityWorkingState, entropy: CityEntropy, previous: CityActionId): boolean {
  const e = expansion(s);
  if (s.round.resolutionCursor !== 0 || e.theaterDone) return false;
  update(s, { theaterDone: true });
  const owner = s.players.find(p => !p.forfeited && hasSpecial(s, p.playerId, 'THEATER'));
  const assigned = owner && s.round.assignments.find(a => a.playerId === owner.playerId);
  if (!owner || !assigned) return false;
  requireRule(entropy.nextActionId !== undefined && entropy.nextActionId !== previous, 'INVALID_ENTROPY');
  s.window = { kind: 'ROLE_ACTION', activePlayerId: owner.playerId, activeRoleId: assigned.roleId, actionId: entropy.nextActionId, acquisition: 'COMPLETE', abilityUsed: false, buildingsBuilt: 0 };
  setPending(s, { kind: 'THEATER', actorId: owner.playerId, sourcePlayerId: owner.playerId, cards: [], recipients: [] }); return true;
}
export function expandedCloseRound(s: CityWorkingState, entropy: CityEntropy): void {
  const e = expansion(s), four = s.round.assignments.find(a => a.roleId === 'CR-04' && a.status === 'DISABLED');
  if (four && !player(s, four.playerId).forfeited) {
    const job = e.settings.roles[3];
    if (job === 'KING' || job === 'PATRICIAN') s.leaderPlayerId = four.playerId;
    const queen = e.settings.roles[8] === 'QUEEN' && s.round.assignments.find(a => a.roleId === 'CR-09' && a.status === 'RESOLVED');
    if (queen && !player(s, queen.playerId).forfeited) {
      const seats = s.seatOrder.filter(id => !player(s,id).forfeited), i = seats.indexOf(queen.playerId);
      if ([seats[(i+1)%seats.length],seats[(i+seats.length-1)%seats.length]].includes(four.playerId)) addGold(s, queen.playerId, 3);
    }
  }
  update(s, { witch: null, warrants: null, threats: null, pending: null, theaterDone: false, incomeUsed: false, usedSpecials: [], spentGold: 0, inspectedHand: [], inspectedOwner: null });
  if (four && e.settings.roles[3] === 'EMPEROR' && !player(s, four.playerId).forfeited && s.players.some(p => !p.forfeited && p.playerId !== four.playerId && p.playerId !== s.leaderPlayerId)) {
    requireRule(entropy.nextActionId !== undefined, 'INVALID_ENTROPY');
    s.window = { kind: 'ROLE_ACTION', actionId: entropy.nextActionId, activePlayerId: four.playerId, activeRoleId: 'CR-04', acquisition: 'COMPLETE', abilityUsed: true, buildingsBuilt: 0 };
    setPending(s, { kind: 'EMPEROR', actorId: four.playerId, sourcePlayerId: four.playerId, cards: [], recipients: [] });
  }
}

function income(s: CityWorkingState, a: CityExpansionAction, entropy: CityEntropy): void {
  const w = readyAction(s), job = expandedJob(s), e = expansion(s), id = w.activePlayerId;
  requireRule(!e.incomeUsed, 'ABILITY_UNAVAILABLE');
  const category = ['KING','EMPEROR','PATRICIAN'].includes(job) ? 'CIVIC' : ['BISHOP','ABBOT','CARDINAL'].includes(job) ? 'CULTURE' : ['MERCHANT','TRADER'].includes(job) ? 'TRADE' : ['WARLORD','DIPLOMAT','MARSHAL'].includes(job) ? 'GUARD' : null;
  requireRule(category !== null, 'ABILITY_UNAVAILABLE');
  const count = player(s, id).city.filter(c => template(s, c).category === category).length + Number(hasSpecial(s, id, 'SCHOOL_OF_MAGIC'));
  if (job === 'ABBOT') {
    const gold = a.goldCount ?? count; requireRule(gold <= count, 'INVALID_TARGET');
    addGold(s, id, gold); giveCards(s, id, count - gold, entropy);
  } else if (job === 'PATRICIAN' || job === 'CARDINAL') giveCards(s, id, count, entropy);
  else addGold(s, id, count);
  update(s, { incomeUsed: true });
}
function specialAction(s: CityWorkingState, a: CityExpansionAction, entropy: CityEntropy): void {
  const w = readyAction(s), id = w.activePlayerId, wanted = a.effect;
  requireRule(expandedJob(s) !== 'WITCH', 'ABILITY_UNAVAILABLE');
  requireRule(wanted !== undefined && hasSpecial(s, id, wanted), 'ABILITY_UNAVAILABLE');
  requireRule(!expansion(s).usedSpecials.includes(wanted), 'ABILITY_UNAVAILABLE');
  if (wanted === 'LABORATORY' || wanted === 'MUSEUM') {
    const card = ownCard(s, a.cardId, id, 'hand'), p = player(s, id);
    putPlayer(s, { ...p, hand: p.hand.filter(c => c !== card) });
    if (wanted === 'LABORATORY') { s.deck = [...s.deck, card]; addGold(s, id, 2); }
    else {
      const buildingId = player(s, id).city.find(c => effect(s, c) === 'MUSEUM')!;
      const rows = expansion(s).museum, prior = rows.find(row => row.buildingId === buildingId);
      update(s, { museum: [...rows.filter(row => row.buildingId !== buildingId), { buildingId, cards: [...(prior?.cards ?? []), card] }] });
    }
  } else if (wanted === 'SMITHY') { addGold(s, id, -2); giveCards(s, id, 3, entropy); }
  else if (wanted === 'ARMORY') {
    const target = s.players.find(p => p.playerId === a.targetPlayerId && !p.forfeited); requireRule(target !== undefined && cityCompletionSize(s, target.playerId) < 8, 'INVALID_TARGET');
    const card = ownCard(s, a.cardId, target.playerId, 'city'), armory = player(s, id).city.find(c => effect(s, c) === 'ARMORY')!;
    requireRule(card !== armory, 'INVALID_TARGET'); removeBuilding(s, target.playerId, card); removeBuilding(s, id, armory);
  } else requireRule(false, 'ABILITY_UNAVAILABLE');
  update(s, { usedSpecials: [...expansion(s).usedSpecials, wanted] });
}
function roleAction(s: CityWorkingState, a: CityExpansionAction, entropy: CityEntropy): void {
  const w = readyAction(s), id = w.activePlayerId, job = expandedJob(s);
  requireRule(!w.abilityUsed, 'ABILITY_UNAVAILABLE');
  if (job === 'WITCH' || job === 'MAGISTRATE' || job === 'BLACKMAILER') {
    const roles = a.roleIds ?? [], count = job === 'WITCH' ? 1 : job === 'MAGISTRATE' ? 3 : 2;
    requireRule(roles.length === count && roles.every(r => CITY_ALL_ROLE_IDS.slice(cityRoleOrder(w.activeRoleId), expansion(s).settings.roles.length).includes(r as CityRoleId)), 'INVALID_TARGET');
    if (job === 'WITCH') update(s, { witch: { sourcePlayerId: id, targetRoleId: roles[0]!, controlling: false } });
    else if (job === 'MAGISTRATE') update(s, { warrants: { sourcePlayerId: id, roles: [...roles], real: roles[0]!, used: false } });
    else {
      requireRule(roles.every(r => !s.marks.some(m => m.kind === 'DISABLE' && m.targetRoleId === r) && expansion(s).witch?.targetRoleId !== r), 'INVALID_TARGET');
      update(s, { threats: { sourcePlayerId: id, roles: [...roles], real: roles[0]! } });
    }
  } else if (job === 'SPY' || job === 'WIZARD') {
    const target = other(s, a.targetPlayerId, id), hand = player(s, target).hand;
    if (job === 'SPY') {
      requireRule(a.category !== undefined, 'INVALID_TARGET'); const count = hand.filter(c => template(s, c).category === a.category).length;
      const amount = Math.min(count, player(s, target).gold); addGold(s, target, -amount); addGold(s, id, amount); giveCards(s, id, count, entropy);
      update(s, { inspectedHand: [...hand], inspectedOwner: id });
    } else if (hand.length) setPending(s, { kind: 'WIZARD', actorId: id, sourcePlayerId: id, targetPlayerId: target, cards: [], recipients: [] });
  } else if (job === 'SEER') {
    const recipients: CityPlayerId[] = [];
    for (const target of s.players.filter(p => p.playerId !== id && !p.forfeited && p.hand.length)) {
      const card = randomCard(target.hand, entropy)!; recipients.push(target.playerId);
      putPlayer(s, { ...target, hand: target.hand.filter(c => c !== card) });
      const p = player(s, id); putPlayer(s, { ...p, hand: [...p.hand, card] });
    }
    if (recipients.length) setPending(s, { kind: 'SEER', actorId: id, sourcePlayerId: id, cards: [], recipients });
  } else if (job === 'EMPEROR') {
    const target = other(s, a.targetPlayerId, id); requireRule(target !== s.leaderPlayerId, 'INVALID_TARGET');
    s.leaderPlayerId = target;
    if (a.choice === 'GOLD') { if (player(s, target).gold > 0) { addGold(s, target, -1); addGold(s, id, 1); } }
    else { requireRule(a.choice === 'CARDS', 'INVALID_TARGET'); const card = randomCard(player(s, target).hand, entropy); if (card) { const p = player(s, target); putPlayer(s, { ...p, hand: p.hand.filter(c => c !== card) }); const me = player(s, id); putPlayer(s, { ...me, hand: [...me.hand, card] }); } }
  } else if (job === 'ABBOT') {
    const target = other(s, a.targetPlayerId, id), richest = Math.max(...s.players.filter(p => !p.forfeited).map(p => p.gold));
    requireRule(player(s, target).gold === richest && player(s, id).gold < richest, 'INVALID_TARGET'); addGold(s, target, -1); addGold(s, id, 1);
  } else if (job === 'NAVIGATOR') {
    requireRule(a.choice === 'GOLD' || a.choice === 'CARDS', 'INVALID_TARGET'); if (a.choice === 'GOLD') addGold(s, id, 4); else giveCards(s, id, 4, entropy);
  } else if (job === 'SCHOLAR') {
    const cards = draw(s, 7, entropy); if (cards.length) setPending(s, { kind: 'SCHOLAR', actorId: id, sourcePlayerId: id, cards: [...cards], recipients: [] });
  } else if (job === 'ARTIST') {
    const cards = a.cardIds ?? []; requireRule(cards.length > 0 && cards.length <= 2 && cards.every(c => player(s, id).city.includes(parseBuildingCardId(c)) && !expansion(s).decorated.includes(c)), 'INVALID_CARD');
    addGold(s, id, -cards.length); update(s, { decorated: [...expansion(s).decorated, ...cards] });
  } else if (['WARLORD','DIPLOMAT','MARSHAL'].includes(job)) {
    const target = s.players.find(p => p.playerId === a.targetPlayerId && !p.forfeited); requireRule(target !== undefined, 'INVALID_TARGET');
    const card = ownCard(s, a.cardId, target.playerId, 'city');
    requireRule(cityCompletionSize(s, target.playerId) < 8 && !s.round.protectedPlayerIds.includes(target.playerId) && effect(s, card) !== 'KEEP', 'INVALID_TARGET');
    const wall = Number(effect(s, card) !== 'GREAT_WALL' && hasSpecial(s, target.playerId, 'GREAT_WALL'));
    if (job === 'WARLORD') { addGold(s, id, -(Math.max(0, printedCost(s, card) - 1) + wall)); removeBuilding(s, target.playerId, card); }
    else {
      requireRule(target.playerId !== id, 'INVALID_TARGET');
      const own = job === 'DIPLOMAT' ? ownCard(s, a.ownCardId, id, 'city') : undefined;
      requireRule(noDuplicate(s, id, card, own) && (own === undefined || noDuplicate(s, target.playerId, own, card)), 'DUPLICATE_TEMPLATE');
      requireRule(job !== 'MARSHAL' || printedCost(s, card) <= 3, 'INVALID_TARGET');
      const cost = Math.max(0, printedCost(s, card) - (own === undefined ? 0 : printedCost(s, own))) + wall;
      addGold(s, id, -cost); addGold(s, target.playerId, cost);
      const me = player(s, id), them = player(s, target.playerId);
      putPlayer(s, { ...me, city: [...me.city.filter(c => c !== own), card] });
      putPlayer(s, { ...them, city: [...them.city.filter(c => c !== card), ...(own ? [own] : [])] });
      checkCompletion(s, id); checkCompletion(s, target.playerId);
    }
  } else requireRule(false, 'ABILITY_UNAVAILABLE');
  s.window = { ...actionWindow(s), abilityUsed: true };
  if (job === 'WITCH') endRole(s, entropy);
}

function decide(s: CityWorkingState, a: CityExpansionAction, entropy: CityEntropy): void {
  const e = expansion(s), pending = e.pending; requireRule(pending !== null, 'INVALID_PHASE');
  const id = parseCityPlayerId(pending.sourcePlayerId);
  if (pending.kind === 'BRIBE') {
    requireRule(a.choice === 'YES' || a.choice === 'NO', 'INVALID_TARGET'); const threat = e.threats; requireRule(threat !== null, 'INVALID_STATE');
    if (a.choice === 'YES') { const cost = Math.floor(player(s, id).gold / 2); addGold(s, id, -cost); addGold(s, parseCityPlayerId(threat.sourcePlayerId), cost); clearPending(s); grantExtraResources(s, entropy); }
    else setPending(s, { ...pending, kind: 'BLACKMAIL', actorId: threat.sourcePlayerId });
  } else if (pending.kind === 'BLACKMAIL') {
    requireRule(a.choice === 'YES' || a.choice === 'NO', 'INVALID_TARGET');
    if (a.choice === 'YES' && e.threats?.real === actionWindow(s).activeRoleId) { const amount = player(s, id).gold; addGold(s, id, -amount); addGold(s, parseCityPlayerId(pending.actorId), amount); }
    clearPending(s); grantExtraResources(s, entropy);
  } else if (pending.kind === 'CONFISCATE') {
    requireRule(a.choice === 'YES' || a.choice === 'NO', 'INVALID_TARGET');
    const card = ownCard(s, pending.cardId, id, 'city'); clearPending(s); let owner = id;
    if (a.choice === 'YES') {
      owner = parseCityPlayerId(pending.actorId); requireRule(noDuplicate(s, owner, card), 'DUPLICATE_TEMPLATE');
      const p = player(s, id); putPlayer(s, { ...p, city: p.city.filter(c => c !== card) });
      const m = player(s, owner); putPlayer(s, { ...m, city: [...m.city, card] }); addGold(s, id, pending.paid ?? 0);
      update(s, { spentGold: Math.max(0, expansion(s).spentGold - (pending.paid ?? 0)) });
    }
    tax(s, owner); checkCompletion(s, owner);
  } else if (pending.kind === 'WIZARD') {
    const target = parseCityPlayerId(pending.targetPlayerId!), card = ownCard(s, a.cardId, target, 'hand');
    requireRule(a.choice === 'KEEP' || a.choice === 'BUILD', 'INVALID_TARGET');
    const p = player(s, target); putPlayer(s, { ...p, hand: p.hand.filter(c => c !== card) });
    const me = player(s, id); putPlayer(s, { ...me, hand: [...me.hand, card] }); clearPending(s);
    if (a.choice === 'BUILD') expandedBuild(s, { command: 'BUILD', cardId: card }, entropy, true);
  } else if (pending.kind === 'SCHOLAR') {
    requireRule(a.cardId !== undefined && pending.cards.includes(a.cardId), 'INVALID_CARD');
    const p = player(s, id); putPlayer(s, { ...p, hand: [...p.hand, parseBuildingCardId(a.cardId)] });
    s.deck = shuffled([...s.deck, ...pending.cards.filter(c => c !== a.cardId).map(parseBuildingCardId)], entropy); clearPending(s);
  } else if (pending.kind === 'SEER') {
    const cards = a.cardIds ?? []; requireRule(cards.length === pending.recipients.length && cards.every(c => player(s, id).hand.includes(parseBuildingCardId(c))), 'INVALID_CARD');
    const p = player(s, id); putPlayer(s, { ...p, hand: p.hand.filter(c => !cards.includes(c)) });
    pending.recipients.forEach((recipient, i) => { const target = player(s, parseCityPlayerId(recipient)); putPlayer(s, { ...target, hand: [...target.hand, parseBuildingCardId(cards[i]!)] }); }); clearPending(s);
  } else if (pending.kind === 'EMPEROR') {
    const target = other(s, a.targetPlayerId, id); requireRule(target !== s.leaderPlayerId, 'INVALID_TARGET');
    s.leaderPlayerId = target; clearPending(s); s.window = null;
  } else if (pending.kind === 'THEATER') {
    requireRule(a.choice === 'YES' || a.choice === 'NO', 'INVALID_TARGET');
    if (a.choice === 'YES') {
      const target = other(s, a.targetPlayerId, id), own = s.round.assignments.find(r => r.playerId === id && r.roleId === a.roleIds?.[0]);
      const theirs = s.round.assignments.filter(r => r.playerId === target); requireRule(own !== undefined && theirs.length > 0, 'INVALID_TARGET');
      const index = entropy.randomIndex?.(theirs.length); requireRule(index !== undefined && index >= 0 && index < theirs.length, 'INVALID_ENTROPY');
      const chosen = theirs[index]!;
      s.round = { ...s.round, assignments: s.round.assignments.map(r => r.roleId === own.roleId ? { ...r, playerId: target } : r.roleId === chosen.roleId ? { ...r, playerId: id } : r) };
    }
    clearPending(s); s.window = null;
  } else requireRule(false, 'INVALID_PHASE');
}
export function expandedAction(s: CityWorkingState, input: CityExpansionAction, entropy: CityEntropy): void {
  const a = v.parse(CityExpansionActionSchema, input);
  if (a.command === 'DECIDE') { decide(s, a, entropy); return; }
  requireRule(expansion(s).pending === null, 'PENDING_CHOICE'); readyAction(s);
  switch (a.command) {
    case 'INCOME': income(s, a, entropy); break;
    case 'BUILD': expandedBuild(s, a, entropy); break;
    case 'ROLE': roleAction(s, a, entropy); break;
    case 'SPECIAL': specialAction(s, a, entropy); break;
  }
}

export function expandedTimeout(s: CityWorkingState, entropy: CityEntropy): void {
  const p = expansion(s).pending;
  if (p) {
    if (p.kind === 'WIZARD') decide(s, { command: 'DECIDE', cardId: player(s, parseCityPlayerId(p.targetPlayerId!)).hand[0]!, choice: 'KEEP' }, entropy);
    else if (p.kind === 'SCHOLAR') decide(s, { command: 'DECIDE', cardId: p.cards[0]! }, entropy);
    else if (p.kind === 'SEER') decide(s, { command: 'DECIDE', cardIds: player(s, parseCityPlayerId(p.sourcePlayerId)).hand.slice(0, p.recipients.length) }, entropy);
    else if (p.kind === 'EMPEROR') {
      const target = s.players.find(player => !player.forfeited && player.playerId !== p.sourcePlayerId && player.playerId !== s.leaderPlayerId);
      requireRule(target !== undefined, 'INVALID_STATE'); decide(s, { command: 'DECIDE', targetPlayerId: target.playerId }, entropy);
    } else decide(s, { command: 'DECIDE', choice: p.kind === 'BRIBE' ? 'YES' : 'NO' }, entropy);
  }
  if (!s.window || s.window.kind !== 'ROLE_ACTION' || s.window.abilityUsed) return;
  if (expandedJob(s) === 'WITCH') roleAction(s, { command: 'ROLE', roleIds: ['CR-02'] }, entropy);
  else if (expandedJob(s) === 'EMPEROR') {
    const target = s.players.find(p => !p.forfeited && p.playerId !== s.window?.activePlayerId && p.playerId !== s.leaderPlayerId);
    if (target) roleAction(s, { command: 'ROLE', targetPlayerId: target.playerId, choice: 'GOLD' }, entropy);
    else s.window = { ...s.window, abilityUsed: true };
  }
}
export function expandedForfeit(s: CityWorkingState, id: CityPlayerId, entropy: CityEntropy): void {
  const interruptedWitch = s.window?.kind === 'ROLE_ACTION' && s.window.activePlayerId !== id && expansion(s).witch?.controlling === true && s.round.assignments.some(a => a.roleId === (s.window?.kind === 'ROLE_ACTION' ? s.window.activeRoleId : null) && a.playerId === id);
  let e = expansion(s);
  if (e.threats?.sourcePlayerId === id && (e.pending?.kind === 'BRIBE' || e.pending?.kind === 'BLACKMAIL') && e.pending.sourcePlayerId !== id) {
    clearPending(s); grantExtraResources(s, entropy);
  } else if (e.pending?.sourcePlayerId === id) {
    if (e.pending.kind === 'SCHOLAR') s.discard = [...s.discard, ...e.pending.cards.map(parseBuildingCardId)];
    update(s, { pending: null });
    if (s.window?.kind === 'ROLE_ACTION') s.window = { ...s.window, activePlayerId: id };
  } else if (e.pending?.actorId === id) {
    const pending = clearPending(s);
    if (pending.kind === 'CONFISCATE') { const owner = parseCityPlayerId(pending.sourcePlayerId); tax(s, owner); checkCompletion(s, owner); }
  } else if (e.pending?.kind === 'WIZARD' && e.pending.targetPlayerId === id) {
    clearPending(s);
  } else if (e.pending?.kind === 'SEER') update(s, { pending: { ...e.pending, recipients: e.pending.recipients.filter(p => p !== id) } });
  e = expansion(s);
  if (e.witch?.sourcePlayerId === id) {
    if (e.witch.controlling && s.window?.kind === 'ROLE_ACTION') {
      const role = s.window.activeRoleId;
      s.round = { ...s.round, assignments: s.round.assignments.map(a => a.roleId === role ? { ...a, status: 'RESOLVED' } : a) };
    }
    update(s, { witch: null });
  }
  if (e.warrants?.sourcePlayerId === id) update(s, { warrants: null });
  if (e.threats?.sourcePlayerId === id) update(s, { threats: null });
  if (interruptedWitch) { expandedFinishPending(s); s.window = null; }
}
export function expandedFinishPending(s: CityWorkingState): void {
  const pending = expansion(s).pending;
  if (pending?.kind === 'SCHOLAR') {
    const owner = player(s, parseCityPlayerId(pending.sourcePlayerId)), cards = pending.cards.map(parseBuildingCardId);
    if (!owner.forfeited && cards[0]) { putPlayer(s, { ...owner, hand: [...owner.hand, cards[0]] }); s.deck = [...s.deck, ...cards.slice(1)]; }
    else s.discard = [...s.discard, ...cards];
  }
  update(s, { pending: null });
}
