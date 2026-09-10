import { CityAbbotIncome, CityAbbotTribute } from '../features/city-role/CityAbbotAbility.js';
import { CityExpandedCatalog } from '../features/city-role/CityExpandedCatalog.js';
import { CityRoleTargets, toggleCityRoleTarget } from '../features/city-role/CityRoleTargets.js';
import assert from 'node:assert/strict';
import test from 'node:test';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { parse } from 'valibot';
import { CityPublicBuildingSchema, CityBuildingCardIdSchema, CITY_ALL_ROLE_IDS, CITY_DEFAULT_SETTINGS, CITY_EXPANDED_ROLES, CITY_SPECIAL_BUILDINGS, CITY_STANDARD_SPECIALS, CityRolePlayingPlatformSnapshotV2Schema, type CityRolePlayingPlatformSnapshotV2 } from '@hangul-rummikub/shared';
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

test('turn flow offers resources before acquisition and condenses them after server completion', () => {
  const base = expanded(cityActionFixture());
  const before = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game, privateState: { ...base.game.privateState, action: { acquisition: 'NOT_TAKEN', abilityUsed: false, buildingsBuilt: 0 } } } });
  const starting = screen(before);
  assert.match(starting, /금화 2개 받기/); assert.match(starting, /건물 카드 뽑기/);
  assert.doesNotMatch(starting, /is-buildable|자원 받기 완료/);
  const completed = screen(base);
  assert.match(completed, /자원 받기 완료/);
  assert.doesNotMatch(completed, /금화 2개 받기|건물 카드 뽑기/);
  assert.match(completed, /원하는 순서/); assert.match(completed, /is-buildable/);
  assert.ok(completed.indexOf('city-turn-finish') > completed.indexOf('city-inline-build'));
  assert.match(completed, /<button>차례 마치기 →<\/button>/);
  const pending = screen(expanded(cityActionFixture(true)));
  assert.match(pending, /뽑은 카드 중 받을 카드를 선택하세요/);
  assert.match(pending, /<button disabled="">차례 마치기 →/);
  assert.doesNotMatch(pending, /is-buildable/);
});

test('wizard has dedicated opponent cards and only exposes choice cards to the responding viewer', () => {
  const roles = [...CITY_DEFAULT_SETTINGS.roles]; roles[2] = 'WIZARD';
  const base = expanded(cityActionFixture(), roles);
  const html = screen(base);
  assert.match(html, /마법사의 상대 선택/);
  assert.match(html, /도시1/); assert.match(html, /도시2/);
  assert.doesNotMatch(html, /<select|마법사 능력 사용|카드를 사용하는 능력은 아래 손패/);
  const pending = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game,
    expansion: { ...base.game.expansion, pending: 'WIZARD' },
    privateState: { ...base.game.privateState, action: { acquisition: 'COMPLETE', abilityUsed: true, buildingsBuilt: 1 }, expansion: { ...base.game.privateState.expansion, choiceCards: [{ ...base.game.privateState.hand[0], cardId: 'wizard-visible', name: '확인 전용 건물' }] } },
  } });
  const choosing = screen(pending);
  assert.match(choosing, /마법사가 확인한 손패/); assert.match(choosing, /확인 전용 건물/);
  assert.match(choosing, /건설 횟수를 쓰지 않습니다/);
  assert.match(choosing, /disabled="">손패로 가져오기/);
  assert.doesNotMatch(choosing.slice(choosing.indexOf('aria-label="마법사가 확인한 손패"'), choosing.indexOf('city-construction-progress')), /이번 차례 건설 횟수 소진/);
  const observer = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...pending, game: { ...pending.game,
    window: { ...pending.game.window, activePlayerId: 'P1' },
    privateState: { hand: base.game.privateState.hand, selectedRoleIds: base.game.privateState.selectedRoleIds, marks: [], expansion: { ...base.game.privateState.expansion, choiceCards: [] } },
  } });
  assert.doesNotMatch(screen(observer), /마법사가 확인한 손패|확인 전용 건물/);
  assert.match(screen(observer), /마법사가 카드를 선택하고 있습니다/);
});

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
  assert.match(html, /class="city-inline-build"[^>]*>건설/);
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

test('alternative construction appears for hand payment, built framework, or necropolis with a city', () => {
  for (const snapshot of [thiefWithBuildings(['CB-SP-29']), thiefWithBuildings([], ['CB-SP-06']), thiefWithBuildings(['CB-SP-18'], ['CB-SP-14'])]) {
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


test('corrected two-player screen follows the server discard flag and rejects missing version metadata', () => {
  const base = expanded(citySelectionFixture(2));
  const make = (draftDiscardRequired: boolean) => parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base,
    game: { ...base.game, roleDraftVersion: 'city-draft-v3', secretPairDraft: true, draftDiscardRequired } });
  const first = screen(make(false));
  assert.match(first, /aria-label="1 · 암살자 가져오기"/);
  assert.doesNotMatch(first, /aria-label="1 · 암살자 비공개 버리기"/);
  assert.match(first, /직업 선택 확정/);
  const later = screen(make(true));
  assert.match(later, /aria-label="1 · 암살자 비공개 버리기"/);
  assert.doesNotMatch(first + later, /자동 배정/);
  assert.throws(() => parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game, roleDraftVersion: 'city-draft-v3', secretPairDraft: true } }));
  assert.throws(() => parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game, roleDraftVersion: 'city-draft-v3', secretPairDraft: false, draftDiscardRequired: true } }));
});


test('public role target summary renders every mark and only server-provided private real marks', () => {
  const base = expanded(cityActionFixture());
  const game = { ...base.game, expansion: { ...base.game.expansion, disabledRole:'CR-04', robbedRole:'CR-05', witchTarget:'CR-06', warrants:['CR-04','CR-05','CR-07'], threats:['CR-04','CR-08'] } };
  const view = parse(CityRolePlayingPlatformSnapshotV2Schema,{...base,game});
  const summary = screen(view).match(/aria-label="공개된 지목">([\s\S]*?)<\/div>/)?.[1] ?? '';
  for (const text of ['암살 대상 · 왕','도둑 대상 · 주교','홀린 직업 · 상인','영장 · 왕, 주교, 건축가','협박 · 왕, 장군']) assert.ok(summary.includes(text),text);
  assert.doesNotMatch(summary,/나의 진짜/);
  const owner = parse(CityRolePlayingPlatformSnapshotV2Schema,{...base,game:{...game,privateState:{...game.privateState,expansion:{...game.privateState.expansion,realWarrant:'CR-07',realThreat:'CR-08'}}}});
  assert.match(screen(owner),/나의 진짜 영장 · 건축가/);
  assert.match(screen(owner),/나의 진짜 협박 · 장군/);
  const empty = screen(base).match(/aria-label="공개된 지목">([\s\S]*?)<\/div>/)?.[1] ?? '';
  assert.doesNotMatch(empty,/협박 ·|영장 ·|암살 대상|도둑 대상|홀린 직업/);
});


test('abbot automatically targets the unique richest opponent, limits ties and blocks self-richest or used actions', () => {
  const base = cityActionFixture();
  const render = (gold: number[], used = false, ready = true) => renderToStaticMarkup(createElement(CityAbbotTribute, {
    players: base.game.playerStates.map((p,i) => ({...p,gold:gold[i]!})), viewerId:'P0', nickname:id => `상대${id}`, ready, used, onCollect() {},
  }));
  const unique = render([2,8,5]);
  assert.match(unique,/상대P1님에게 금화 1개 받기/);
  assert.doesNotMatch(unique,/<select|aria-pressed|상대P2/);
  const tied = render([2,8,8]);
  assert.equal((tied.match(/aria-pressed="false"/g) ?? []).length,2);
  assert.match(tied,/disabled="">동률인 상대를 선택하세요/);
  for (const gold of [[8,8,5],[10,8,5],[0,0,0]]) assert.match(render(gold),/disabled="">받을 수 있는 금화 없음/);
  assert.match(render([2,8,5],true),/disabled="">금화 받기 완료/);
  assert.match(render([2,8,5],false,false),/disabled="">상대P1님에게 금화 1개 받기/);
  const forfeited = renderToStaticMarkup(createElement(CityAbbotTribute,{players:base.game.playerStates.map((p,i)=>({...p,gold:[2,10,8][i]!,forfeited:i===1})),viewerId:'P0',nickname:id=>id,ready:true,used:false,onCollect(){}}));
  assert.match(forfeited,/P2님에게 금화 1개 받기/);
  assert.doesNotMatch(forfeited,/P1님/);
});

test('abbot income includes culture and magic school, bounds allocation and renders separately from tribute', () => {
  const card = cityActionFixture().game.privateState.hand[0]!;
  const buildings = [parse(CityPublicBuildingSchema,{...card,cardId:'abbot-culture',category:'CULTURE'}),parse(CityPublicBuildingSchema,{...card,cardId:'abbot-magic',templateId:'CB-SP-23',category:'LANDMARK',cost:6,victoryPoints:6})];
  const html = renderToStaticMarkup(createElement(CityAbbotIncome,{buildings,ready:true,used:false,onCollect(){}}));
  assert.match(html,/마법 학교 1채/); assert.match(html,/max="2"/); assert.match(html,/금화 2개 · 카드 0장 받기/);
  assert.match(renderToStaticMarkup(createElement(CityAbbotIncome,{buildings:[],ready:true,used:false,onCollect(){}})),/disabled="">수입을 받을 문화 건물이 없습니다/);
  const base = expanded(cityActionFixture());
  const cast=[...CITY_DEFAULT_SETTINGS.roles];cast[4]='ABBOT';
  const view=parse(CityRolePlayingPlatformSnapshotV2Schema,{...base,game:{...base.game,expansion:{...base.game.expansion,settings:{...base.game.expansion?.settings,roles:cast}},window:{...base.game.window,activeRoleId:'CR-05'}}});
  const whole=screen(view);
  assert.ok(whole.indexOf('aria-label="수도원장 문화 건물 수입"') < whole.indexOf('<summary>직업 능력 사용</summary>'));
  assert.match(whole,/aria-label="수도원장 금화 받기"/);
  assert.doesNotMatch(whole,/수입 중 금화 개수|카드를 사용하는 능력은|수도원장 능력 사용|플레이어 선택/);
});


test('nickname draft order shows both passes, highlights the exact current pick and does not reveal role choices', () => {
  const base=expanded(citySelectionFixture(3));
  const view=parse(CityRolePlayingPlatformSnapshotV2Schema,{...base,game:{...base.game,selectionOrder:{playerIds:['P2','P0','P1','P2','P0','P1'],currentIndex:4}}});
  const render=(snapshot: typeof view)=>renderToStaticMarkup(createElement(CityRoleTrack,{game:snapshot.game,players:snapshot.room.players}));
  const html=render(view), order=html.split('<nav class="city-role-track"')[0]!;
  assert.deepEqual([...order.matchAll(/class="city-selection-name">([^<]+)/g)].map(m=>m[1]),['도시2님','도시0님','도시1님','도시2님','도시0님','도시1님']);
  assert.equal((order.match(/aria-current="step"/g)??[]).length,1);
  assert.match(order,/aria-current="step" class="is-current"><b>5<\/b>/);
  assert.equal((order.match(/선택 완료/g)??[]).length,4);
  const otherChoices={...view,game:{...view.game,privateState:{...view.game.privateState,selectedRoleIds:['CR-08' as const]}}};
  assert.equal(render(otherChoices).split('<nav class="city-role-track"')[0],order);
  assert.doesNotMatch(order,/암살자|협박|마술사/);
  assert.doesNotMatch(render(base),/aria-label="직업 선택 순서"/);
  assert.doesNotMatch(screen(expanded(cityActionFixture())),/aria-label="직업 선택 순서"/);
  assert.throws(()=>parse(CityRolePlayingPlatformSnapshotV2Schema,{...base,game:{...base.game,selectionOrder:{playerIds:['P0','P1','P2','P0','P1','P2'],currentIndex:1}}}));
  assert.throws(()=>parse(CityRolePlayingPlatformSnapshotV2Schema,{...base,game:{...base.game,selectionOrder:{playerIds:['P0','unknown'],currentIndex:0}}}));
});


test('cardinal separates construction and multi-card payment from generic role and special controls', () => {
  const html = screen(thiefWithBuildings([], [], true));
  assert.match(html, /aria-label="추기경 교환 건설"/);
  assert.match(html, /지을 건물 한 장/);
  assert.match(html, /부족한 금화 1개마다 손패 1장/);
  assert.match(html, /건설 대상으로 선택/);
  assert.match(html, /disabled="">카드 0장 교환하고 건설/);
  assert.doesNotMatch(html, /<select|<summary>직업 능력 사용|대체 건설/);
  const armory = screen(thiefWithBuildings([], ['CB-SP-01'], true));
  assert.match(armory, /병기고 대상 도시/);
  assert.match(armory, /병기고 대상 건물/);
  assert.match(armory, /<summary>특수 건물 사용/);
  assert.match(screen(thiefWithBuildings(['CB-SP-29'], [], true)), /대체 건설/);
});

test('every public city shows eight compact slots with its own count and accessible nickname', () => {
  const base = expanded(cityActionFixture());
  const card = base.game.privateState.hand[0]!;
  const snapshot = parse(CityRolePlayingPlatformSnapshotV2Schema, { ...base, game: { ...base.game,
    playerStates: base.game.playerStates.map((p, i) => ({ ...p,
      builtBuildings: Array.from({length:[5,4,0][i]!}, (_,n)=>({...card,cardId:`public-${i}-${n}`})),
      scorePreview: [5,4,0][i]!,
    })),
  }});
  const html = screen(snapshot);
  const cities = html.slice(html.indexOf('<section class="city-cities">'));
  for (const [i, count] of [5,4,0].entries()) {
    const section = cities.slice(cities.indexOf(`aria-label="도시${i}의 도시 건설 현황"`)).split('</article>')[0]!;
    assert.match(section, new RegExp(`aria-label="도시${i}의 도시 완성"[^>]*aria-valuenow="${count}"`));
    assert.equal((section.match(/class="city-construction-slot(?: is-built)?"/g) ?? []).length, 8);
    assert.equal((section.match(/class="city-construction-slot is-built"/g) ?? []).length, count);
    assert.doesNotMatch(section, /8칸을 완성하면/);
  }
  const monument = {...card,templateId:'CB-SP-16' as const,category:'LANDMARK' as const};
  const publicMonument = renderToStaticMarkup(createElement(CityConstructionProgress, { buildings:[monument], ending:false, finished:false, variant:'public', cityName:'라미의 도시' }));
  assert.match(publicMonument, /aria-valuenow="2"/);
  assert.match(publicMonument, /건물 1채, 완성 2 \/ 8칸, 기념비는 2칸/);
});

test('witch receives blackmailer targeting after the bewitched player gathers resources', () => {
  const roles=[...CITY_DEFAULT_SETTINGS.roles]; roles[0]='WITCH'; roles[1]='BLACKMAILER';
  const base=expanded(cityActionFixture(),roles);
  const snapshot=parse(CityRolePlayingPlatformSnapshotV2Schema,{...base,game:{...base.game,
    window:{...base.game.window,activeRoleId:'CR-02'},
    revealedRoles:[{roundNumber:1,roleId:'CR-01',playerId:'P0',kind:'NORMAL'},{roundNumber:1,roleId:'CR-02',playerId:'P1',kind:'NORMAL'}],
    expansion:{...base.game.expansion,witchTarget:'CR-02'},
    privateState:{...base.game.privateState,selectedRoleIds:['CR-01']},
  }});
  const html=screen(snapshot);
  assert.match(html, /<details open=""><summary>직업 능력 사용/);
  assert.match(html, /aria-label="협박 대상 직업"/);
  assert.match(html, /2개를 선택하세요/);
  assert.match(html, /aria-label="마술사 지목" aria-pressed="false">/);
  assert.match(html, /협박 지목 확정/);
  assert.doesNotMatch(html, /홀림 대상 직업|능력 사용 완료/);
  const waiting=parse(CityRolePlayingPlatformSnapshotV2Schema,{...snapshot,game:{...snapshot.game,
    window:{...snapshot.game.window,activePlayerId:'P1'},
    privateState:{hand:snapshot.game.privateState.hand,selectedRoleIds:['CR-01'],marks:[],expansion:snapshot.game.privateState.expansion},
  }});
  assert.doesNotMatch(screen(waiting), /aria-label="협박 대상 직업"/);
});

for (const job of CITY_EXPANDED_ROLES.filter(r=>r.rank>1)) {
  test(`witch can see ${job.id} controls while retaining her private witch role`, () => {
    const cast=[...CITY_DEFAULT_SETTINGS.roles];cast[0]='WITCH';cast[job.rank-1]=job.id;
    const base=expanded(cityActionFixture(),cast), roster=citySelectionFixture(5);
    const snapshot=parse(CityRolePlayingPlatformSnapshotV2Schema,{...base,room:roster.room,game:{...base.game,
      playerStates:roster.game.playerStates,seatOrder:roster.game.seatOrder,rolesPerPlayer:1,
      window:{...base.game.window,activeRoleId:CITY_ALL_ROLE_IDS[job.rank-1]},
      revealedRoles:[{roundNumber:1,roleId:'CR-01',playerId:'P0',kind:'NORMAL'},{roundNumber:1,roleId:CITY_ALL_ROLE_IDS[job.rank-1],playerId:'P1',kind:'NORMAL'}],
      expansion:{...base.game.expansion,witchTarget:CITY_ALL_ROLE_IDS[job.rank-1]},
      privateState:{...base.game.privateState,selectedRoleIds:['CR-01']},
    }});
    const html=screen(snapshot);
    assert.match(html, /자원 받기 완료/);
    assert.match(html, /<strong>마녀<\/strong>/);
    assert.doesNotMatch(html, /홀림 대상 직업|홀린 직업 차례에 건설/);
    const controls:Partial<Record<typeof job.id,string>>={
      THIEF:'도둑질 지목 확정',SPY:'지목할 종류',BLACKMAILER:'협박 지목 확정',
      MAGICIAN:'손패 전체 교환',WIZARD:'마법사의 상대 선택',SEER:'예언자 능력 사용',
      EMPEROR:'금화로 받기',ABBOT:'수도원장',CARDINAL:'추기경 교환 건설',
      NAVIGATOR:'카드로 받기',SCHOLAR:'학자 능력 사용',WARLORD:'장군',
      DIPLOMAT:'내 건물',MARSHAL:'상대 건물',ARTIST:'예술가 능력 사용',
    };
    const control=controls[job.id];if(control) assert.ok(html.includes(control),job.id);
    if(['KING','PATRICIAN','BISHOP','MERCHANT','TRADER'].includes(job.id)) assert.match(html,/건물 종류별 수입 받기/);
    if(job.id==='NAVIGATOR') assert.match(html,/항해사는 건설 불가/);
    else assert.match(html,/is-buildable/);
  });
}
