import { getCityTemplate, CITY_CATEGORIES, type CityCategory } from './cardset-v1.js';
import type { CitySpecialId } from './expansion-catalog.js';
import type { CityGameState, CityPlayerState } from './game-state.js';

export function expandedScore(state: CityGameState, player: CityPlayerState) {
  const { specialBonusBreakdown: _details, ...score } = scoreWithDetails(state, player);
  return score;
}
export function expandedBonusBreakdown(state: CityGameState, player: CityPlayerState) {
  return scoreWithDetails(state, player).specialBonusBreakdown;
}
function scoreWithDetails(state: CityGameState, player: CityPlayerState) {
  const buildings = player.city.map(id => { const c = state.cards.find(c => c.cardId === id); if (!c) throw new Error('Invalid CITY scoring card.'); return { ...getCityTemplate(c.templateId), cost: getCityTemplate(c.templateId).cost + Number(state.expansion?.decorated.includes(id)) }; });
  const has = (n: number) => buildings.some(b => b.templateId === `CB-SP-${String(n).padStart(2, '0')}`);
  const buildingVP = buildings.reduce((sum, b) => sum + b.cost, 0);
  const completionBonus = player.forfeited ? 0 : state.firstCompletion?.playerId === player.playerId ? 4 : buildings.length + Number(has(16)) >= 8 ? 2 : 0;
  let best: { diversityBonus: number; landmarkBonus: number; specialBonusBreakdown: { templateId: CitySpecialId; points: number }[] } = { diversityBonus: 0, landmarkBonus: 0, specialBonusBreakdown: [] };
  for (const hauntedCategory of (has(9) ? CITY_CATEGORIES : ['LANDMARK'] as const)) {
    const categories: CityCategory[] = buildings.map(b => b.templateId === 'CB-SP-09' ? hauntedCategory : b.category);
    const diversityBonus = !player.forfeited && new Set(categories).size === 5 ? 3 : 0;
    const specialBonusBreakdown: { templateId: CitySpecialId; points: number }[] = [];
    const add = (templateId: CitySpecialId, points: number) => { if (!player.forfeited && points > 0) specialBonusBreakdown.push({ templateId, points }); };
    const specials = categories.filter(c => c === 'LANDMARK').length;
    if (has(2)) add('CB-SP-02', buildings.filter(b => b.cost % 2 === 1).length);
    if (has(3) && CITY_CATEGORIES.some(c => categories.filter(x => x === c).length >= 3)) add('CB-SP-03', 3);
    if (has(4)) add('CB-SP-04', 2);
    if (has(10)) add('CB-SP-10', player.gold);
    if (has(11) && specials === 1) add('CB-SP-11', 5);
    if (has(15)) add('CB-SP-15', player.hand.length);
    if (has(17)) add('CB-SP-17', state.expansion?.museum.filter(row => player.city.some(id => id === row.buildingId)).reduce((sum, row) => sum + row.cards.length, 0) ?? 0);
    if (has(27) && state.leaderPlayerId === player.playerId) add('CB-SP-27', 5);
    if (has(30)) add('CB-SP-30', specials);
    if (player.hand.some(id => state.cards.find(c => c.cardId === id)?.templateId === 'CB-SP-24')) add('CB-SP-24', 3);
    const landmarkBonus = specialBonusBreakdown.reduce((sum, row) => sum + row.points, 0);
    if (diversityBonus + landmarkBonus >= best.diversityBonus + best.landmarkBonus) best = { diversityBonus, landmarkBonus, specialBonusBreakdown };
  }
  return { buildingVP, completionBonus, ...best, score: buildingVP + completionBonus + best.diversityBonus + best.landmarkBonus };
}
