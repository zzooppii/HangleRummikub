import assert from 'node:assert/strict';
import test from 'node:test';
import type { CityJobId, CityPublicBuilding } from '@hangul-rummikub/shared';
import { cityBuildPreview } from '../features/city-role/city-build-preview.js';
import { cityActionFixture } from './city-role-test-fixtures.js';

const base = cityActionFixture().game.privateState.hand[0]!;
const special = (templateId: string, cost = 5): CityPublicBuilding => ({ ...base, templateId, category: 'LANDMARK', cost });
const context = { buildings: [] as CityPublicBuilding[], gold: 5, job: 'MERCHANT' as CityJobId, buildingsBuilt: 0, taxCollector: false };

test('gold construction previews factory discount, affordability and conditional post-build tax', () => {
  const factory = special('CB-SP-05');
  const card = special('CB-SP-10');
  const preview = cityBuildPreview(card, { ...context, buildings: [factory], taxCollector: true });
  assert.equal(preview.cost, 4); assert.equal(preview.discount, 1); assert.equal(preview.tax, 1); assert.equal(preview.reason, null);
  assert.equal(cityBuildPreview(card, { ...context, buildings: [factory], gold: 4, taxCollector: true }).tax, 0);
  assert.equal(cityBuildPreview(card, { ...context, buildings: [factory], gold: 3 }).reason, '금화 1개 부족');
  assert.equal(cityBuildPreview(base, { ...context, buildings: [factory] }).discount, 0);
  assert.equal(cityBuildPreview(card, { ...context, gold: 9, taxCollector: true, job: 'TAX_COLLECTOR' }).tax, 0);
});

test('ordinary construction limits allow stables and trader trade cards but never navigator construction', () => {
  assert.equal(cityBuildPreview(base, { ...context, buildingsBuilt: 1 }).reason, '이번 차례 건설 횟수 소진');
  for (const [job, limit] of [['ARCHITECT', 3], ['SCHOLAR', 2], ['SEER', 2]] as const) {
    assert.equal(cityBuildPreview(base, { ...context, job, buildingsBuilt: limit - 1 }).reason, null);
    assert.equal(cityBuildPreview(base, { ...context, job, buildingsBuilt: limit }).reason, '이번 차례 건설 횟수 소진');
  }
  const stable = special('CB-SP-26', 2);
  assert.equal(cityBuildPreview(stable, { ...context, buildingsBuilt: 3 }).reason, null);
  assert.equal(cityBuildPreview({ ...base, category: 'TRADE' }, { ...context, job: 'TRADER', buildingsBuilt: 1 }).reason, null);
  assert.equal(cityBuildPreview(stable, { ...context, job: 'NAVIGATOR' }).reason, '항해사는 건설 불가');
  assert.equal(cityBuildPreview(base, { ...context, job: 'WITCH' }).reason, '홀린 직업 차례에 건설');
});

test('duplicate, monument and secret vault restrictions remain visible without blocking alternative payment hints', () => {
  assert.equal(cityBuildPreview(base, { ...context, buildings: [base] }).reason, '이미 지은 건물');
  assert.equal(cityBuildPreview(base, { ...context, buildings: [base, special('CB-SP-22')] }).reason, null);
  assert.equal(cityBuildPreview(base, { ...context, buildings: [base], job: 'WIZARD' }).reason, null);
  assert.match(cityBuildPreview(special('CB-SP-16'), { ...context, buildings: Array(5).fill(base) }).reason!, /5채 이상/);
  assert.match(cityBuildPreview(special('CB-SP-24', 0), context).reason!, /손에 보관/);
  const den = cityBuildPreview(special('CB-SP-29', 6), context);
  assert.equal(den.reason, '금화 1개 부족'); assert.match(den.alternative!, /손패/);
  assert.match(cityBuildPreview(special('CB-SP-18'), { ...context, buildings: [base], gold: 0 }).alternative!, /희생/);
  assert.match(cityBuildPreview(base, { ...context, buildings: [special('CB-SP-06')], gold: 0 }).alternative!, /골조/);
});
