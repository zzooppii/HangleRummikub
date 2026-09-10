import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'valibot';
import { CITY_DEFAULT_SETTINGS, CITY_STANDARD_SPECIALS, CityRolePlayingPlatformSnapshotV2Schema } from '@hangul-rummikub/shared';
import { cityActionFixture } from './city-role-test-fixtures.js';
import { cityWarlordTargets } from '../features/city-role/city-warlord-ui.js';
import { CityWarlordTargets } from '../features/city-role/CityWarlordTargets.js';
import { CityExpandedScreen } from '../features/city-role/CityExpandedScreen.js';

function card(id: string, cost = 3, templateId = 'CB-TRA-03') {
  return { cardId: id, templateId, name: id, cost, victoryPoints: cost, category: 'TRADE' };
}
function fixture(buildings = [card('시장')], gold = 4, protectedCity = false) {
  const base = cityActionFixture();
  return parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game,
    rulesVersion: 'city-rules-v3', cardSetVersion: 'city-cardset-v3', roleSetVersion: 'city-roles-v2',
    window: { ...base.game.window, activeRoleId: 'CR-08' },
    revealedRoles: [{ roundNumber: 1, roleId: 'CR-08', playerId: 'P0', kind: 'NORMAL' }],
    protectedPlayerIds: protectedCity ? ['P1'] : [],
    playerStates: base.game.playerStates.map(p => p.playerId === 'P0' ? { ...p, gold } : p.playerId === 'P1' ? { ...p, builtBuildings: buildings, scorePreview: buildings.reduce((sum, c) => sum + c.victoryPoints, 0) } : p),
    expansion: { settings: CITY_DEFAULT_SETTINGS, specialIds: CITY_STANDARD_SPECIALS, tax: 0, decorated: [], museum: [], disabledRole: null, robbedRole: null, warrants: [], threats: [], witchTarget: null, pending: null, vaultOwners: [] },
    privateState: { ...base.game.privateState, selectedRoleIds: ['CR-08'], expansion: { incomeUsed: false, usedSpecials: [], inspectedCards: [], choiceCards: [], recipients: [] } },
  } });
}

test('warlord quotes zero-cost targets, projected decoration and great wall surcharge without double counting', () => {
  const { game } = fixture([card('무료', 1), card('장식된 시장', 4), card('대성벽', 6, 'CB-SP-08')]);
  const targets = cityWarlordTargets(game, 10).find(p => p.playerId === 'P1')!.buildings;
  assert.deepEqual(targets.map(b => [b.cost, b.wallSurcharge, b.reason]), [[1, 1, null], [4, 1, null], [5, 0, null]]);
  const withoutWall = fixture([card('무료', 1)]);
  assert.equal(cityWarlordTargets(withoutWall.game, 0)[1]!.buildings[0]!.cost, 0);
  assert.equal(cityWarlordTargets(withoutWall.game, 0)[1]!.buildings[0]!.reason, null);
});

test('warlord cards explain protection, keep, completed cities including monument, and insufficient gold', () => {
  const cases = [
    { snapshot: fixture([card('시장')], 0), reason: '금화 2개 부족' },
    { snapshot: fixture([card('성채', 3, 'CB-SP-12')]), reason: '성채 · 파괴 불가' },
    { snapshot: fixture([card('시장')], 4, true), reason: '주교의 보호' },
    { snapshot: fixture(Array.from({ length: 8 }, (_, i) => card(`건물${i}`))), reason: '완성된 도시' },
    { snapshot: fixture([card('기념비', 4, 'CB-SP-16'), ...Array.from({ length: 6 }, (_, i) => card(`건물${i}`))]), reason: '완성된 도시' },
  ];
  for (const { snapshot, reason } of cases) {
    assert.equal(cityWarlordTargets(snapshot.game, snapshot.game.playerStates[0]!.gold)[1]!.buildings[0]!.reason, reason);
  }
});

test('warlord renders illustrated cards, price and explicit destruction with unavailable selection disabled', () => {
  const snapshot = fixture();
  const props = { game: snapshot.game, viewerId: 'P0', gold: 4, ready: true, used: false, targetPlayerId: 'P1', targetCardId: '시장', nickname: (id: string) => id, onSelect: () => {}, onDestroy: () => {} };
  const html = renderToStaticMarkup(createElement(CityWarlordTargets, props));
  assert.match(html, /data-impact-card="시장"/);
  assert.match(html, /파괴 후 남는 금화 2개/);
  assert.match(html, /2금화로 파괴/);
  assert.doesNotMatch(html, /<select|disabled=""/);
  for (const patch of [{ ready: false }, { used: true }, { gold: 0 }, { targetCardId: 'removed-card' }]) {
    const locked = renderToStaticMarkup(createElement(CityWarlordTargets, { ...props, ...patch }));
    assert.match(locked, /<button disabled=""><svg/);
  }
});

test('full expanded screen replaces warlord dropdowns while keeping income, hand builds and server action controls', () => {
  const html = renderToStaticMarkup(createElement(CityExpandedScreen, { snapshot: fixture(), connected: true, pending: false, errorMessage: null, onCommand: async () => {}, onAction: () => {}, onLeave: () => {} }));
  assert.match(html, /aria-label="장군의 건물 파괴"/);
  assert.match(html, /건물 종류별 수입 받기/);
  assert.match(html, /차례 마치기/);
  assert.match(html, /class="city-inline-build"[^>]*>건설/);
  assert.doesNotMatch(html, /<select|장군 능력 사용/);
});
