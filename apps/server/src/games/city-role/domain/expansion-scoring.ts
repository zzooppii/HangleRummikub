import { getCityTemplate, CITY_CATEGORIES, type CityCategory } from './cardset-v1.js';
import type { CityGameState, CityPlayerState } from './game-state.js';

export function expandedScore(state: CityGameState, player: CityPlayerState) {
  const buildings = player.city.map(id => { const c = state.cards.find(c => c.cardId === id); if (!c) throw new Error('Invalid CITY scoring card.'); return { ...getCityTemplate(c.templateId), cost: getCityTemplate(c.templateId).cost + Number(state.expansion?.decorated.includes(id)) }; });
  const has = (n: number) => buildings.some(b => b.templateId === `CB-SP-${String(n).padStart(2, '0')}`);
  const buildingVP = buildings.reduce((sum, b) => sum + b.cost, 0);
  const completionBonus = player.forfeited ? 0 : state.firstCompletion?.playerId === player.playerId ? 4 : buildings.length + Number(has(16)) >= 8 ? 2 : 0;
  let best = { diversityBonus: 0, landmarkBonus: 0 };
  for (const hauntedCategory of (has(9) ? CITY_CATEGORIES : ['LANDMARK'] as const)) {
    const categories: CityCategory[] = buildings.map(b => b.templateId === 'CB-SP-09' ? hauntedCategory : b.category);
    const diversityBonus = !player.forfeited && new Set(categories).size === 5 ? 3 : 0;
    let bonus = 0;
    const specials = categories.filter(c => c === 'LANDMARK').length;
    if (has(2)) bonus += buildings.filter(b => b.cost % 2 === 1).length;
    if (has(3) && CITY_CATEGORIES.some(c => categories.filter(x => x === c).length >= 3)) bonus += 3;
    if (has(4)) bonus += 2;
    if (has(10)) bonus += player.gold;
    if (has(11) && specials === 1) bonus += 5;
    if (has(15)) bonus += player.hand.length;
    if (has(17)) bonus += state.expansion?.museum.filter(row => player.city.some(id => id === row.buildingId)).reduce((sum, row) => sum + row.cards.length, 0) ?? 0;
    if (has(27) && state.leaderPlayerId === player.playerId) bonus += 5;
    if (has(30)) bonus += specials;
    if (player.hand.some(id => state.cards.find(c => c.cardId === id)?.templateId === 'CB-SP-24')) bonus += 3;
    const landmarkBonus = player.forfeited ? 0 : bonus;
    if (diversityBonus + landmarkBonus >= best.diversityBonus + best.landmarkBonus) best = { diversityBonus, landmarkBonus };
  }
  return { buildingVP, completionBonus, ...best, score: buildingVP + completionBonus + best.diversityBonus + best.landmarkBonus };
}
