import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CityBonusDetails } from '../features/city-role/CityExpandedResults.js';
import { cityFinishedFixture } from './city-role-test-fixtures.js';

test('CITY result lists the actual completion, diversity and individual building bonuses with quantities', () => {
  const base = cityFinishedFixture().game.result.rankings[0]!;
  const row = { ...base, completionBonus: 4 as const, diversityBonus: 3 as const, landmarkBonus: 5, specialBonusBreakdown: [{ templateId: 'CB-SP-04' as const, points: 2 }, { templateId: 'CB-SP-10' as const, points: 3 }] };
  const html = renderToStaticMarkup(createElement(CityBonusDetails, { row }));
  for (const text of ['보너스 +12점', '첫 도시 완성', '+4점', '5종류 완성', '+3점', '용의 문', '+2점', '황실 금고', '남은 금화 3개 × 1점']) assert.ok(html.includes(text), text);
  const second = renderToStaticMarkup(createElement(CityBonusDetails, { row: { ...row, completionBonus: 2 } }));
  assert.match(second, /도시 완성/);assert.doesNotMatch(second, /첫 도시 완성/);
});

test('CITY bonus details handle zero, forfeit and old results without inventing itemized values', () => {
  const base = cityFinishedFixture().game.result.rankings[0]!;
  assert.match(renderToStaticMarkup(createElement(CityBonusDetails, { row: base })), /획득한 보너스 없음/);
  assert.match(renderToStaticMarkup(createElement(CityBonusDetails, { row: { ...base, forfeited: true } })), /기권 · 보너스 미적용/);
  const html = renderToStaticMarkup(createElement(CityBonusDetails, { row: { ...base, landmarkBonus: 5 } }));
  assert.match(html, /특수 건물 합계/);assert.match(html, /건물별 내역이 없습니다/);assert.doesNotMatch(html, /용의 문|황실 금고/);
});
