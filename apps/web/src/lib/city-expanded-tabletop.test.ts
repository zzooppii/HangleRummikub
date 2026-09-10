import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'valibot';
import { CITY_ALL_ROLE_IDS, CITY_DEFAULT_SETTINGS, CITY_EXPANDED_ROLES, CITY_STANDARD_SPECIALS, CityRolePlayingPlatformSnapshotV2Schema, type CityRolePlayingPlatformSnapshotV2 } from '@hangul-rummikub/shared';
import { CityExpandedScreen } from '../features/city-role/CityExpandedScreen.js';
import { CityExpandedTurnHud } from '../features/city-role/CityExpandedTurnHud.js';
import { CityRoleTrack } from '../features/city-role/CityTabletop.js';
import { cityActionFixture, citySelectionFixture } from './city-role-test-fixtures.js';

function expanded(base: CityRolePlayingPlatformSnapshotV2, roles = [...CITY_DEFAULT_SETTINGS.roles]) {
  return parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game,
    rulesVersion: 'city-rules-v3', cardSetVersion: 'city-cardset-v3', roleSetVersion: 'city-roles-v2',
    expansion: { settings: { enabled: true, roles }, specialIds: CITY_STANDARD_SPECIALS, tax: 0, decorated: [], museum: [], disabledRole: null, robbedRole: null, warrants: [], threats: [], witchTarget: null, pending: null, vaultOwners: [] },
    privateState: { ...base.game.privateState, expansion: { incomeUsed: false, usedSpecials: [], inspectedCards: [], choiceCards: [], recipients: [] } },
  } });
}
function screen(snapshot: CityRolePlayingPlatformSnapshotV2) {
  return renderToStaticMarkup(createElement(CityExpandedScreen, { snapshot, connected: true, pending: false, errorMessage: null, onCommand: async () => {}, onAction: () => {}, onLeave: () => {} }));
}

test('v3 selection restores illustrated selectable roles, private summary, public track and timed HUD', () => {
  const snapshot = expanded(citySelectionFixture());
  const html = screen(snapshot);
  assert.match(html, /class="city-shell city-expanded-page"/);
  assert.match(html, /aria-label="공개 역할 진행 순서"/);
  assert.match(html, /aria-label="내 비공개 역할과 금화"/);
  assert.match(html, /class="city-turn-hud is-mine"/);
  assert.match(html, /role="timer" aria-label="남은 시간 45초">00:45/);
  assert.match(html, /class="city-role-card" data-role="CR-01"[^>]*aria-label="암살자 선택"/);
  assert.match(html, /data-role-art="CR-01"/);
  assert.doesNotMatch(html, /가면꾼|장터지기/);
});

test('every configured job retains its illustrated rank card and its own rules text, including rank nine', () => {
  for (const job of CITY_EXPANDED_ROLES) {
    const roles = [...CITY_DEFAULT_SETTINGS.roles];
    roles[job.rank - 1] = job.id;
    const base = citySelectionFixture(5);
    const snapshot = expanded(parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game, privateState: { ...base.game.privateState, availableRoleIds: [...CITY_ALL_ROLE_IDS.slice(0, 8)] } } }), roles);
    const html = screen(snapshot);
    assert.ok(html.includes(`<strong>${job.name}</strong><p>${job.text}</p>`), job.id);
    assert.ok(html.includes(`data-role="CR-0${job.rank}"`), job.id);
    const track = renderToStaticMarkup(createElement(CityRoleTrack, { game: snapshot.game }));
    assert.equal((track.match(/<li /g) ?? []).length, roles.length);
    assert.ok(track.includes(job.name));
  }
});

test('v3 two-player draft restores explicit keep and discard controls using configured job names', () => {
  const base = expanded(citySelectionFixture(2));
  const snapshot = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game, roleDraftVersion: 'city-draft-v2', secretPairDraft: true } });
  const html = screen(snapshot);
  assert.match(html, /aria-label="1 · 암살자 가져오기"/);
  assert.match(html, /aria-label="1 · 암살자 비공개 버리기"/);
  assert.match(html, /disabled="">선택 · 비공개 버리기 확정/);
});

test('expanded role track never reveals private selections or marks an uncalled role current', () => {
  const snapshot = expanded(citySelectionFixture(), [...CITY_DEFAULT_SETTINGS.roles, 'ARTIST']);
  const before = renderToStaticMarkup(createElement(CityRoleTrack, { game: snapshot.game }));
  const after = renderToStaticMarkup(createElement(CityRoleTrack, { game: { ...snapshot.game, privateState: { ...snapshot.game.privateState, selectedRoleIds: ['CR-09'] } } }));
  assert.equal(before, after);
  assert.doesNotMatch(before, /aria-current="step"/);
});

test('HUD follows the server responder during interruptions and keeps the same action deadline', () => {
  const base = expanded(cityActionFixture());
  const snapshot = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game,
    window: { ...base.game.window, activePlayerId: 'P1' }, expansion: { ...base.game.expansion, pending: 'CONFISCATE' },
    privateState: { hand: base.game.privateState.hand, selectedRoleIds: base.game.privateState.selectedRoleIds, marks: [], expansion: base.game.privateState.expansion },
  } });
  const html = screen(snapshot);
  assert.match(html, /도시1님의 응답/);
  assert.match(html, /마술사 · 응답 선택/);
  assert.match(html, /role="timer" aria-label="남은 시간 90초">01:30/);
  assert.match(html, /aria-current="step"/);
  const expired = renderToStaticMarkup(createElement(CityExpandedTurnHud, { game: snapshot.game, viewerId: snapshot.self.playerId, actor: '도시1', remainingSeconds: 0, roleName: '마술사' }));
  assert.match(expired, /class="city-turn-hud is-urgent"/);
  assert.match(expired, /남은 시간 0초">00:00/);
  assert.match(expired, /서버의 자동 진행/);
});
