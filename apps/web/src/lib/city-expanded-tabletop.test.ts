import { CityExpandedCatalog } from '../features/city-role/CityExpandedCatalog.js';
import { CityRoleTargets, toggleCityRoleTarget } from '../features/city-role/CityRoleTargets.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'valibot';
import { CityBuildingCardIdSchema, CITY_ALL_ROLE_IDS, CITY_DEFAULT_SETTINGS, CITY_EXPANDED_ROLES, CITY_SPECIAL_BUILDINGS, CITY_STANDARD_SPECIALS, CityRolePlayingPlatformSnapshotV2Schema, type CityRolePlayingPlatformSnapshotV2 } from '@hangul-rummikub/shared';
import { CityExpandedScreen } from '../features/city-role/CityExpandedScreen.js';
import { CityExpandedTurnHud } from '../features/city-role/CityExpandedTurnHud.js';
import { CityConstructionProgress } from '../features/city-role/CityConstructionProgress.js';
import { CityRoleTrack } from '../features/city-role/CityTabletop.js';
import { cityActionFixture, citySelectionFixture } from './city-role-test-fixtures.js';

function expanded(base: CityRolePlayingPlatformSnapshotV2, roles = [...CITY_DEFAULT_SETTINGS.roles]) {
  return parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game,
    rulesVersion: 'city-rules-v3', cardSetVersion: 'city-cardset-v3', roleSetVersion: 'city-roles-v2',
    window: { ...base.game.window, deadlineAt: base.game.window.startedAt + (base.game.phase === 'ROLE_SELECTION' ? 20_000 : 90_000) },
    expansion: { settings: { enabled: true, roles, selectionSeconds: 20 }, specialIds: CITY_STANDARD_SPECIALS, tax: 0, decorated: [], museum: [], disabledRole: null, robbedRole: null, warrants: [], threats: [], witchTarget: null, pending: null, vaultOwners: [] },
    privateState: { ...base.game.privateState, expansion: { incomeUsed: false, usedSpecials: [], inspectedCards: [], choiceCards: [], recipients: [] } },
  } });
}
function screen(snapshot: CityRolePlayingPlatformSnapshotV2) {
  return renderToStaticMarkup(createElement(CityExpandedScreen, { snapshot, connected: true, pending: false, errorMessage: null, onCommand: async () => {}, onAction: () => {}, onLeave: () => {} }));
}

test('mobile status shows the viewer resources while another player is acting', () => {
  const base = expanded(cityActionFixture());
  const snapshot = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game,
    window: { ...base.game.window, activePlayerId: 'P1' },
    privateState: { hand: base.game.privateState.hand, selectedRoleIds: base.game.privateState.selectedRoleIds, marks: [], expansion: base.game.privateState.expansion },
    playerStates: base.game.playerStates.map(p => ({ ...p, gold: p.playerId === base.self.playerId ? 12 : 3 })),
  } });
  const html = screen(snapshot);
  const status = html.slice(html.indexOf('class="city-mobile-status"'), html.indexOf('aria-label="공개 역할 진행 순서"'));
  assert.match(status, /도시1님의 차례/);
  assert.match(status, /내 자원 현황/);
  assert.match(status, /금화<\/dt><dd>12<\/dd>/);
  assert.match(status, /손패<\/dt><dd>1<small>장/);
  assert.match(status, /건물 점수<\/dt><dd>0<small>점/);
});

test('city progress reflects empty, built and removed buildings and counts a monument as two slots', () => {
  const card = cityActionFixture().game.privateState.hand[0]!;
  const render = (buildings: typeof card[], ending = false) => renderToStaticMarkup(createElement(CityConstructionProgress, { buildings, ending, finished: false }));
  assert.match(render([]), /aria-valuenow="0"/);
  const buildings = Array.from({ length: 6 }, (_, i) => ({ ...card, cardId: parse(CityBuildingCardIdSchema, `built-${i}`) }));
  const monument = { ...card, cardId: parse(CityBuildingCardIdSchema, 'monument'), templateId: 'CB-SP-16' as const, category: 'LANDMARK' as const };
  const complete = render([...buildings, monument], true);
  assert.match(complete, /aria-valuetext="건물 7채, 완성 8 \/ 8칸, 기념비는 2칸"/);
  assert.equal((complete.match(/city-construction-slot is-built/g) ?? []).length, 8);
  assert.match(render(buildings, true), /aria-valuenow="6"/);
  assert.match(render(buildings, true), /마지막 라운드/);
  assert.match(render([...buildings, ...buildings]), /aria-valuenow="8"/);
});

function thiefWithBuildings(handIds: string[] = [], builtIds: string[] = [], cardinal = false) {
  const base = expanded(cityActionFixture());
  const card = (templateId: string) => {
    const definition = CITY_SPECIAL_BUILDINGS.find(b => b.templateId === templateId);
    assert.ok(definition);
    return { cardId: templateId, templateId, name: definition.name, category: 'LANDMARK', cost: definition.cost, victoryPoints: definition.cost };
  };
  const roles = [...CITY_DEFAULT_SETTINGS.roles];
  if (cardinal) roles[4] = 'CARDINAL';
  return parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game,
    window: { ...base.game.window, activeRoleId: cardinal ? 'CR-05' : 'CR-02' },
    expansion: { ...base.game.expansion, settings: { enabled: true, roles } },
    playerStates: base.game.playerStates.map(p => p.playerId === base.self.playerId ? { ...p, builtBuildings: builtIds.map(card), scorePreview: builtIds.map(card).reduce((sum, b) => sum + b.victoryPoints, 0), handCount: base.game.privateState.hand.length + handIds.length } : p),
    privateState: { ...base.game.privateState, hand: [...base.game.privateState.hand, ...handIds.map(card)] },
  } });
}

test('thief without relevant buildings keeps role targeting and normal construction without special controls', () => {
  const html = screen(thiefWithBuildings());
  assert.match(html, /도둑질 지목 확정/);
  assert.match(html, /class="city-inline-build">건설/);
  assert.doesNotMatch(html, /특수 건물 사용|대체 건설|희생할 내 건물/);
});

test('only constructed active specials expose building actions, independently of thief ability use', () => {
  for (const id of ['CB-SP-01', 'CB-SP-13', 'CB-SP-17', 'CB-SP-25']) {
    assert.doesNotMatch(screen(thiefWithBuildings([id])), /<summary>특수 건물 사용/);
    const base = thiefWithBuildings([], [id]);
    assert.equal(base.game.phase, 'ROLE_ACTION');
    const usedRole = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game, privateState: { ...base.game.privateState, action: { ...base.game.privateState.action, abilityUsed: true } } } });
    const html = screen(usedRole);
    assert.match(html, /<summary>특수 건물 사용/);
    assert.doesNotMatch(html, /건설할 카드|희생할 내 건물/);
    const special = CITY_SPECIAL_BUILDINGS.find(b => b.templateId === id);
    assert.ok(special);
    assert.ok(html.includes(`<button>${special.name} 사용</button>`));
    const usedSpecial = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game, privateState: { ...base.game.privateState, expansion: { ...base.game.privateState.expansion, usedSpecials: [special.effect] } } } });
    assert.ok(screen(usedSpecial).includes(`<button disabled="">${special.name} 사용</button>`));
  }
  assert.doesNotMatch(screen(thiefWithBuildings([], ['CB-SP-14'])), /특수 건물 사용|대체 건설/);
});

test('alternative construction appears for hand payment, built framework, necropolis with a city, or cardinal', () => {
  for (const snapshot of [thiefWithBuildings(['CB-SP-29']), thiefWithBuildings([], ['CB-SP-06']), thiefWithBuildings(['CB-SP-18'], ['CB-SP-14']), thiefWithBuildings([], [], true)]) {
    assert.match(screen(snapshot), /건설할 카드/);
    assert.match(screen(snapshot), /대체 건설/);
    assert.doesNotMatch(screen(snapshot), /<summary>특수 건물 사용/);
  }
  for (const snapshot of [thiefWithBuildings(['CB-SP-06']), thiefWithBuildings(['CB-SP-18']), thiefWithBuildings([], ['CB-SP-29'])]) {
    assert.doesNotMatch(screen(snapshot), /대체 건설|희생할 내 건물/);
  }
});

test('assassin uses illustrated single-target cards without checkboxes, hand instructions or irrelevant specials', () => {
  const base = thiefWithBuildings();
  const snapshot = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game, window: { ...base.game.window, activeRoleId: 'CR-01' } } });
  const html = screen(snapshot);
  assert.match(html, /aria-label="암살 대상 직업"/);
  assert.match(html, /aria-label="도둑 지목"/);
  assert.match(html, /data-role-art="CR-08"/);
  assert.match(html, /암살 지목 확정/);
  assert.doesNotMatch(html, /type="checkbox"|aria-label="암살자 지목"|카드를 사용하는 능력은|<summary>특수 건물 사용|대체 건설/);
});

test('single role target replaces the previous target while multi-target marks preserve order and count', () => {
  assert.deepEqual(toggleCityRoleTarget(['CR-02'], 'CR-03', 1), ['CR-03']);
  assert.deepEqual(toggleCityRoleTarget(['CR-03'], 'CR-03', 1), []);
  assert.deepEqual(toggleCityRoleTarget(['CR-02', 'CR-03'], 'CR-04', 3), ['CR-02', 'CR-03', 'CR-04']);
  assert.deepEqual(toggleCityRoleTarget(['CR-02', 'CR-03'], 'CR-04', 2), ['CR-02', 'CR-03']);
  assert.deepEqual(toggleCityRoleTarget(['CR-02', 'CR-03'], 'CR-02', 2), ['CR-03']);
});

test('target cards show ordered private marks and disable confirmation for unavailable targets or used abilities', () => {
  const props = { targets: [{ id: 'CR-02' as const, name: '도둑', reason: null }, { id: 'CR-03' as const, name: '마술사', reason: null }], selected: ['CR-02' as const, 'CR-03' as const], count: 2, verb: '협박', disabled: false, used: false, onChange: () => {}, onConfirm: () => {} };
  const render = (patch: Partial<typeof props> = {}) => renderToStaticMarkup(createElement(CityRoleTargets, { ...props, ...patch }));
  assert.match(render(), /① 진짜 표식/);
  assert.match(render(), /2 · 가짜 표식/);
  assert.doesNotMatch(render(), /disabled=""/);
  assert.match(render({ selected: ['CR-02'] }), /disabled="">협박 지목 확정/);
  assert.match(render({ disabled: true }), /disabled="">협박 지목 확정/);
  assert.match(render({ used: true }), /disabled="">능력 사용 완료/);
});

test('v3 selection restores illustrated selectable roles, private summary, public track and timed HUD', () => {
  const snapshot = expanded(citySelectionFixture());
  const html = screen(snapshot);
  assert.match(html, /class="city-shell city-expanded-page"/);
  assert.match(html, /aria-label="공개 역할 진행 순서"/);
  assert.match(html, /aria-label="내 비공개 역할과 금화"/);
  assert.match(html, /class="city-turn-hud is-mine"/);
  assert.match(html, /role="timer" aria-label="남은 시간 20초">00:20/);
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
    const html = renderToStaticMarkup(createElement(CityExpandedCatalog, { snapshot }));
    assert.ok(html.includes(`<strong>${job.name}</strong><p>${job.text}</p>`), job.id);
    assert.ok(html.includes(`data-role="CR-0${job.rank}"`), job.id);
    const track = renderToStaticMarkup(createElement(CityRoleTrack, { players: snapshot.room.players, game: snapshot.game }));
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
  const before = renderToStaticMarkup(createElement(CityRoleTrack, { players: snapshot.room.players, game: snapshot.game }));
  const after = renderToStaticMarkup(createElement(CityRoleTrack, { players: snapshot.room.players, game: { ...snapshot.game, privateState: { ...snapshot.game.privateState, selectedRoleIds: ['CR-09'] } } }));
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
  assert.match(html, /aria-label="직업 행동"/);
  const waiting = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...snapshot, game: { ...snapshot.game, expansion: { ...snapshot.game.expansion, pending: null } } });
  assert.doesNotMatch(screen(waiting), /aria-label="직업 행동"|city-expanded-active-role/);

  const expired = renderToStaticMarkup(createElement(CityExpandedTurnHud, { game: snapshot.game, viewerId: snapshot.self.playerId, actor: '도시1', remainingSeconds: 0, roleName: '마술사' }));
  assert.match(expired, /class="city-turn-hud is-urgent"/);
  assert.match(expired, /남은 시간 0초">00:00/);
  assert.match(expired, /서버의 자동 진행/);
});
