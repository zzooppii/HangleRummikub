import type { CityGameState } from './game-state.js';
import { validateCityGameCards } from './cardset-v2.js';
import { CITY_STANDARD_CAST, CITY_STANDARD_SPECIALS } from './expansion-catalog.js';
import { CITY_ALL_ROLE_IDS, cityRoleOrder } from './role.js';
import { calculateCityResult } from './result-engine.js';

export function assertExpandedCanonical(s: CityGameState): void {
  const check = (value: boolean) => { if (!value) throw new Error('Invalid CITY expansion state.'); };
  const e = s.expansion; if (!e) throw new Error('Missing CITY expansion state.');
  check(s.rulesVersion === 'city-rules-v3' && s.cardSetVersion === 'city-cardset-v3' && s.roleSetVersion === 'city-roles-v2' && s.landmarkHistory === undefined);
  if (!e.settings.enabled) check(JSON.stringify(e.settings.roles) === JSON.stringify(CITY_STANDARD_CAST) && JSON.stringify(e.specialIds) === JSON.stringify(CITY_STANDARD_SPECIALS));
  check(s.players.length !== 2 || e.settings.roles.length === 8 && !e.settings.roles.includes('EMPEROR'));
  check(!e.settings.roles.includes('QUEEN') || s.players.length >= 5);
  const cards = validateCityGameCards(s.cards, s.rulesVersion), ids = s.players.map(p => p.playerId), eligible = s.players.filter(p => !p.forfeited);
  check(new Set(ids).size === ids.length && s.seatOrder.length === ids.length && new Set(s.seatOrder).size === ids.length && s.seatOrder.every(id => ids.includes(id)) && ids.includes(s.leaderPlayerId));
  check(eligible.length === 0 || eligible.some(p => p.playerId === s.leaderPlayerId));
  check(cards.filter(c => c.templateId.startsWith('CB-SP-')).every(c => e.specialIds.some(id => id === c.templateId)));
  const pending = e.pending?.kind === 'SCHOLAR' ? e.pending.cards : [];
  const zones = [...s.deck, ...s.discard, ...s.players.flatMap(p => [...p.hand, ...p.city]), ...(s.pendingChoice?.cards ?? []), ...pending, ...e.museum.flatMap(row => row.cards)];
  check(zones.length === 68 && new Set(zones).size === 68 && cards.every(c => zones.includes(c.cardId)));
  const built = s.players.flatMap(p => p.city);
  check(e.decorated.every(id => built.some(c => c === id)) && new Set(e.museum.map(row => row.buildingId)).size === e.museum.length);
  check(e.museum.every(row => built.some(c => c === row.buildingId) && cards.find(c => c.cardId === row.buildingId)?.templateId === 'CB-SP-17'));
  for (const p of s.players) {
    check(!p.forfeited || p.hand.length === 0 && p.gold === 0);
    check(s.result !== null || p.forfeited || p.offlineTimeoutStreak < 3);
    check(p.city.every(id => cards.find(c => c.cardId === id)?.templateId !== 'CB-SP-24'));
  }
  const r = s.round, roleIds = CITY_ALL_ROLE_IDS.slice(0, e.settings.roles.length);
  check(new Set(r.eligibleAtSetup).size === r.eligibleAtSetup.length && r.eligibleAtSetup.every(id => ids.includes(id)) && eligible.every(p => r.eligibleAtSetup.includes(p.playerId)));
  const rotated = r.eligibleAtSetup, queue = r.rolesPerPlayer === 2 ? [...rotated, ...rotated] : rotated;
  check(r.rolesPerPlayer === (rotated.length <= 3 ? 2 : 1) && JSON.stringify(r.pickQueue) === JSON.stringify(queue) && r.selectionCursor <= queue.length);
  const roles = [...r.available, ...r.publicRemoved, ...r.hiddenRemoved, ...r.unselected, ...r.assignments.map(a => a.roleId)];
  check(roles.length === roleIds.length && new Set(roles).size === roles.length && roleIds.every(id => roles.includes(id)) && !r.publicRemoved.includes('CR-04'));
  for (const a of r.assignments) {
    check(r.eligibleAtSetup.includes(a.playerId) && s.players.some(p => p.playerId === a.playerId && p.forfeited === (a.status === 'TOMBSTONED')));
    check(a.status !== 'SELECTED' || !a.revealed && cityRoleOrder(a.roleId) > r.resolutionCursor);
    check(a.status !== 'ACTIVE' && a.status !== 'RESOLVED' || a.revealed);
  }
  for (const id of rotated) check(r.assignments.filter(a => a.playerId === id).length <= r.rolesPerPlayer);
  check(new Set(s.revealedRoles.map(a => `${a.roundNumber}:${a.roleId}`)).size === s.revealedRoles.length && s.revealedRoles.every(a => ids.includes(a.playerId) && a.roundNumber <= r.roundNumber));
  check(r.protectedPlayerIds.every(id => eligible.some(p => p.playerId === id)));
  if (s.pendingChoice) check(s.window?.kind === 'ROLE_ACTION' && s.window.acquisition === 'PENDING' && s.pendingChoice.ownerPlayerId === s.window.activePlayerId && s.pendingChoice.actionId === s.window.actionId);
  if (e.pending) check(s.window?.kind === 'ROLE_ACTION' && s.window.activePlayerId === e.pending.actorId && eligible.some(p => p.playerId === e.pending?.actorId) && eligible.some(p => p.playerId === e.pending?.sourcePlayerId));
  if (s.window) {
    check(eligible.length >= 2 && eligible.some(p => p.playerId === s.window?.activePlayerId));
    if (s.window.kind === 'ROLE_SELECTION') check(r.pickQueue[r.selectionCursor] === s.window.activePlayerId && r.resolutionCursor === 0 && r.available.length > 0 && !s.pendingChoice && !e.pending);
    else if (e.pending?.kind !== 'THEATER' && e.pending?.kind !== 'EMPEROR') {
      const w = s.window, active = r.assignments.filter(a => a.status === 'ACTIVE');
      check(r.selectionCursor === r.pickQueue.length && r.available.length === 0 && active.length === 1 && active[0]?.roleId === w.activeRoleId && r.resolutionCursor === cityRoleOrder(w.activeRoleId));
      check(active[0]?.playerId === w.activePlayerId || e.pending !== null || e.witch?.controlling === true && e.witch.sourcePlayerId === w.activePlayerId);
      check((w.acquisition === 'PENDING') === (s.pendingChoice !== null));
    }
  } else {
    const expected = calculateCityResult(s, s.result.reason);
    const fields = ['playerId','rank','score','buildingVP','completionBonus','diversityBonus','landmarkBonus','buildingCount','forfeited','winner'] as const;
    check(s.result.rankings.length === expected.rankings.length && s.result.rankings.every((row,i) => fields.every(key => row[key] === expected.rankings[i]?.[key])));
    check(s.result.reason !== 'CITY_COMPLETION_ROUND_END' || r.ended && r.resolutionCursor === roleIds.length && s.firstCompletion !== null && !e.pending && !s.pendingChoice);
  }
  if (s.firstCompletion) check(ids.includes(s.firstCompletion.playerId) && s.firstCompletion.roundNumber <= r.roundNumber);
}
